"""Ticket 08: request-scoped heterogeneous DAG + differential attribution.

Builds a real graph from real fakegpu bundles (L2 vocabulary: cpu_launch /
gpu_kernel / transfer / sync_edge joined by correlation_id). Stdlib only.
"""
from __future__ import annotations

from statistics import median

from .fakegpu import KERNEL_FLOPS, MFU, PEAK_BW, PEAK_FLOPS

# ponytail: stdlib Kahn toposort (~20 lines); upgrade to networkx only if graph
# algos outgrow longest-path + radius neighborhood.
ROOFLINE_FAMILIES = ("compute-bound", "memory-bound", "latency-bound")
_LAT_SLOP = 2.0  # observed/model ratio above which overhead, not roofline, dominates


def build_graph(bundle: dict) -> dict:
    """Heterogeneous DAG over one bundle. Never invents order: any join key
    missing on either side becomes an explicit unknown edge (conf 0.0)."""
    cpu = {c["correlation_id"]: c for c in bundle.get("cpu_launch", [])}
    gpu = {g["correlation_id"]: g for g in bundle.get("gpu_kernel", [])}
    tx = {t["correlation_id"]: t for t in bundle.get("transfer", [])}
    sy = {s["correlation_id"]: s for s in bundle.get("sync_edge", [])}
    order = [c["correlation_id"] for c in bundle.get("cpu_launch", [])]
    nodes, edges = {}, []

    def add_edge(src, dst, kind, conf, observed, w_ns=0, stage="other"):
        edges.append({"src": src, "dst": dst, "kind": kind, "confidence": conf,
                      "observed": observed, "w_ns": int(w_ns), "stage": stage})

    for cid in dict.fromkeys(list(order) + list(gpu) + list(tx) + list(sy)):
        if cid in cpu:
            c = cpu[cid]
            nodes[f"cpu:{cid}"] = {"kind": "host", "stage": "host", "cid": cid,
                                   "dur_ns": c["end_ns"] - c["start_ns"]}
        if cid in gpu:
            g = gpu[cid]
            nodes[f"gpu:{cid}"] = {"kind": "kernel", "stage": "kernel", "cid": cid,
                                   "stream_id": g["stream_id"], "dur_ns": g["dur_ns"]}
        if cid in tx:
            nodes[f"tx:{cid}"] = {"kind": "transfer", "stage": "transfer", "cid": cid,
                                  "dur_ns": tx[cid]["dur_ns"]}
        if cid in sy:
            s = sy[cid]
            nodes[f"sync:{cid}"] = {"kind": "sync", "stage": "sync", "cid": cid,
                                    "dur_ns": s["end_ns"] - s["start_ns"],
                                    "serialized": bool(s["serialized"])}
        if cid not in cpu or cid not in gpu:  # missing side: explicit unknown, never invented
            nodes.setdefault(f"unknown:{cid}", {"kind": "unknown", "stage": "other",
                                                "cid": cid, "dur_ns": 0})
            anchor = f"cpu:{cid}" if cid in cpu else (f"gpu:{cid}" if cid in gpu else None)
            if anchor is not None:
                add_edge(anchor, f"unknown:{cid}", "unknown", 0.0, False)
        else:
            c, g = cpu[cid], gpu[cid]
            add_edge(f"cpu:{cid}", f"gpu:{cid}", "enqueue", 1.0, True,
                     max(0, g["start_ns"] - c["end_ns"]), "host")
        if cid in tx and cid in gpu:
            add_edge(f"tx:{cid}", f"gpu:{cid}", "transfer", 0.8, True, 0, "transfer")
        if cid in gpu and cid in sy:
            add_edge(f"gpu:{cid}", f"sync:{cid}", "sync", 1.0, True, 0, "sync")
    for a, b in zip(order, order[1:]):
        if a in cpu and b in cpu:
            gap = max(0, cpu[b]["start_ns"] - cpu[a]["end_ns"])
            # dependency evidence assigns the wait: a serialized sync means the
            # host was stalled on the device, so the gap attributes to sync.
            stage = "sync" if a in sy and sy[a].get("serialized") else "host"
            add_edge(f"cpu:{a}", f"cpu:{b}", "host_order", 1.0, True, gap, stage)
            if a in sy and sy[a].get("serialized") and f"sync:{a}" in nodes:
                add_edge(f"sync:{a}", f"cpu:{b}", "sync_host", 1.0, True, 0, "sync")
    by_stream: dict[int, list] = {}
    for cid, g in gpu.items():
        by_stream.setdefault(g["stream_id"], []).append((g["start_ns"], cid))
    idx = {cid: i for i, cid in enumerate(order)} if order else {c: i for i, c in enumerate(gpu)}
    for members in by_stream.values():
        members.sort()
        for (_, a), (_, b) in zip(members, members[1:]):
            adjacent = idx.get(b, -1) - idx.get(a, -2) == 1  # a dropped kernel between = gap, not order
            if adjacent:
                add_edge(f"gpu:{a}", f"gpu:{b}", "stream_order", 0.9, True, 0, "kernel")
            else:
                add_edge(f"gpu:{a}", f"gpu:{b}", "unknown", 0.0, False, 0, "other")
    streams = {g["stream_id"] for g in gpu.values()}
    qmax = max([r.get("queue_depth", 1) for r in bundle.get("l1", [])] or [1])
    if (len(streams) > 1 or qmax > len(streams)) and gpu:
        nodes["batch:shared"] = {"kind": "batch", "stage": "other", "cid": "",
                                 "dur_ns": 0, "attribution_uncertain": True}
        for cid in gpu:  # ponytail: single shared batch node, not per-batch clustering; split when multi-request batches need separate attribution.
            add_edge(f"gpu:{cid}", "batch:shared", "batch_share", 0.5, False, 0, "other")
    return {"nodes": nodes, "edges": edges}


def _toposort(nodes: dict, edges: list) -> list:
    indeg = {n: 0 for n in nodes}
    succ: dict[str, list] = {n: [] for n in nodes}
    for e in edges:
        if e["src"] in indeg and e["dst"] in indeg:
            indeg[e["dst"]] += 1
            succ[e["src"]].append(e["dst"])
    queue = [n for n, d in indeg.items() if d == 0]
    out = []
    while queue:
        n = queue.pop()
        out.append(n)
        for m in succ[n]:
            indeg[m] -= 1
            if indeg[m] == 0:
                queue.append(m)
    return out


def critical_path(graph: dict) -> dict:
    """Longest path on durations (node dur + edge wait)."""
    nodes, edges = graph["nodes"], graph["edges"]
    pred: dict[str, list] = {n: [] for n in nodes}
    for e in edges:
        if e["src"] in pred and e["dst"] in pred:
            pred[e["dst"]].append((e["src"], e["w_ns"]))
    dist = {n: nodes[n].get("dur_ns", 0) for n in nodes}
    back: dict[str, str | None] = {n: None for n in nodes}
    for n in _toposort(nodes, edges):
        for p, w in pred[n]:
            cand = dist[p] + w + nodes[n].get("dur_ns", 0)
            if cand > dist[n]:
                dist[n], back[n] = cand, p
    end = max(dist, key=lambda n: dist[n]) if dist else None
    path = []
    while end is not None:
        path.append(end)
        end = back[end]
    return {"path": path[::-1], "total_ns": dist[path[-1]] if path else 0}


def _stage_cost(graph: dict, path: list) -> dict:
    cost: dict[str, int] = {}
    nodes = graph["nodes"]
    eset = set(zip(path, path[1:]))
    for n in path:
        st = nodes[n].get("stage", "other")
        cost[st] = cost.get(st, 0) + nodes[n].get("dur_ns", 0)
    for e in graph["edges"]:
        if (e["src"], e["dst"]) in eset:
            cost[e["stage"]] = cost.get(e["stage"], 0) + e["w_ns"]
    return cost


def diff_critical_path(faulty: dict, healthy: dict) -> dict:
    """Excess per stage of the faulty critical path vs the healthy critical
    path. Returns the regressed stage (argmax excess)."""
    fcp, hcp = critical_path(faulty), critical_path(healthy)
    fc, hc = _stage_cost(faulty, fcp["path"]), _stage_cost(healthy, hcp["path"])
    # ponytail: aggregates of independently chosen paths; a rerouted faulty path
    # conflates path-change with stage regression. Holds while inflation stays
    # on-path (all current faults); compare same-path costs if rerouting appears.
    excess = {s: fc.get(s, 0) - hc.get(s, 0) for s in set(fc) | set(hc)}
    reg = max(excess, key=lambda s: (excess[s], s)) if excess else "other"
    return {"regressed_stage": reg, "excess_ns": excess, "faulty_cost": fc,
            "healthy_cost": hc, "faulty_path": fcp["path"],
            "faulty_total_ns": fcp["total_ns"]}


def extract_suspect(graph: dict, center: str, radius: int = 2) -> dict:
    """Dependency neighborhood of center within radius hops (undirected)."""
    adj: dict[str, set] = {n: set() for n in graph["nodes"]}
    for e in graph["edges"]:
        if e["src"] in adj and e["dst"] in adj:
            adj[e["src"]].add(e["dst"])
            adj[e["dst"]].add(e["src"])
    seen, frontier = {center}, {center}
    for _ in range(radius):
        nxt = {m for n in frontier for m in adj.get(n, ())} - seen
        seen |= nxt
        frontier = nxt
    es = [e for e in graph["edges"] if e["src"] in seen and e["dst"] in seen]
    return {"nodes": {n: graph["nodes"][n] for n in seen}, "edges": es,
            "center": center, "radius": radius}


def align_clocks(bundle: dict) -> dict:
    """Host/device offset from correlation-joined pairs + uncertainty bound.
    Missing pairs widen the bound instead of biasing the estimate."""
    cpu = {c["correlation_id"]: c for c in bundle.get("cpu_launch", [])}
    gpu = {g["correlation_id"]: g for g in bundle.get("gpu_kernel", [])}
    total = len(set(cpu) | set(gpu))
    res = [g["start_ns"] - cpu[c]["end_ns"] - g["launch_gap_ns"] - g["queue_wait_ns"]
           for c, g in gpu.items() if c in cpu]
    missing = total - len(res)
    if not res:
        return {"offset_ns": 0.0, "uncertainty_ns": float(10_000_000 * max(total, 1)),
                "n": 0, "missing": missing}
    off = float(median(res))
    spread = max(abs(r - off) for r in res)
    # ponytail: linear missing-data penalty, not a clock-drift model; fit drift when real CUPTI clocks skew.
    return {"offset_ns": off, "uncertainty_ns": float(spread + 1000 + missing * 5000),
            "n": len(res), "missing": missing}


def classify_kernel(kernel_name: str, nbytes: int, dur_ns: int) -> str:
    """Dynamic-roofline broad family only (never a source/cause claim)."""
    t_compute = KERNEL_FLOPS.get(kernel_name, 1e9) / (PEAK_FLOPS * MFU)
    t_mem = nbytes / PEAK_BW
    if dur_ns > _LAT_SLOP * max(t_compute, t_mem) * 1e9:
        return "latency-bound"
    return "compute-bound" if t_compute >= t_mem else "memory-bound"


def classify_bundle(bundle: dict) -> dict:
    out = {}
    for g in bundle.get("gpu_kernel", []):
        nbytes = g.get("dram_read_B", 0) + g.get("dram_write_B", 0)
        out[g["correlation_id"]] = classify_kernel(g["kernel_name"], nbytes, g["dur_ns"])
    return out


def lagged_xcorr(a: list, b: list, max_lag: int = 2) -> dict:
    """Pure-python normalized lagged cross-correlation (baseline only)."""
    best = {"lag": 0, "value": 0.0}
    if not a or not b or len(a) != len(b):
        return best
    ma, mb = sum(a) / len(a), sum(b) / len(b)
    den = (sum((x - ma) ** 2 for x in a) * sum((x - mb) ** 2 for x in b)) ** 0.5
    if den == 0:
        return best
    for lag in range(-max_lag, max_lag + 1):
        n = len(a) - abs(lag)
        if n < 2:
            continue
        aa = a[max(0, -lag): max(0, -lag) + n]
        bb = b[max(0, lag): max(0, lag) + n]
        v = sum((x - ma) * (y - mb) for x, y in zip(aa, bb)) / den
        if abs(v) > abs(best["value"]):
            best = {"lag": lag, "value": v}
    return best


def nominate_dependency(bundle: dict) -> dict:
    """Correlation baseline: nominates, but never overrides an observed edge."""
    cpu = bundle.get("cpu_launch", [])
    gaps = [d["start_ns"] - c["end_ns"] for c, d in zip(cpu, cpu[1:])]
    gpu = bundle.get("gpu_kernel", [])
    waits = [g["queue_wait_ns"] for g in gpu[1:]]
    blocked = [s["blocked_ns"] for s in bundle.get("sync_edge", [])[1:]]
    xc = lagged_xcorr(gaps, waits) if gaps and waits else {"lag": 0, "value": 0.0}
    vg = (sum((x - sum(gaps) / len(gaps)) ** 2 for x in gaps) / len(gaps)) if gaps else 0
    vb = (sum((x - sum(blocked) / len(blocked)) ** 2 for x in blocked) / len(blocked)) if blocked else 0
    guess = "host" if vg >= vb and gaps else ("sync" if blocked else None)
    return {"lag": xc["lag"], "value": xc["value"], "nomination": guess,
            "overrides_edge": False}


def adapt_lineage(bundle: dict) -> list:
    """First semantic adapter: correlation-joined aten_op/module_stack with
    mapping confidence (0.0 when lineage is absent)."""
    known = {"aten::linear": 0.9}  # ponytail: one-op map; grow from real profiler lineage when more ops appear.
    have = {r["correlation_id"]: r for r in bundle.get("l3_lineage", [])}
    cids = [c["correlation_id"] for c in bundle.get("cpu_launch", [])] or list(have)
    out = []
    for cid in dict.fromkeys(cids + list(have)):
        r = have.get(cid)
        if r is None:
            out.append({"correlation_id": cid, "aten_op": None, "module": None, "confidence": 0.0})
        else:
            stack = r.get("module_stack") or []
            out.append({"correlation_id": cid, "aten_op": r.get("aten_op"),
                        "module": stack[0] if stack else None,
                        "confidence": known.get(r.get("aten_op"), 0.5)})
    return out
