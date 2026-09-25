"""Population comparisons and partial progress histories with explicit limits."""
from __future__ import annotations

import math
import random
from collections import Counter

from .ledger import LedgerError, canonical_hash


class DurationSketch:
    """Pinned DDSketch adapter; collapsed quantiles are reported as intervals."""

    def __init__(self, accuracy=.01, bins=512):
        from ddsketch.ddsketch import LogCollapsingLowestDenseDDSketch
        if not 0 < accuracy < 1 or bins < 2:
            raise ValueError("invalid sketch parameters")
        self.accuracy, self.bins = accuracy, bins
        self.sketch = LogCollapsingLowestDenseDDSketch(accuracy, bins)
        self.minimum = None

    def add(self, value):
        if not math.isfinite(value) or value < 0:
            raise ValueError("duration must be finite and nonnegative")
        self.minimum = value if self.minimum is None else min(self.minimum, value)
        self.sketch.add(value)

    def quantile(self, q):
        if not 0 <= q <= 1:
            raise ValueError("quantile outside [0,1]")
        value = self.sketch.get_quantile_value(q)
        if value is None:
            return None
        store = self.sketch._store
        bound = self.sketch._mapping.value(store.min_key) if store.count else 0
        if store.is_collapsed and value <= bound:
            return {"lower": self.minimum, "upper": bound / (1 - self.accuracy), "collapsed": True}
        return {"lower": value / (1 + self.accuracy), "upper": value / (1 - self.accuracy), "collapsed": False}

    def to_dict(self):
        s = self.sketch
        store = s._store
        return dict(version=1, accuracy=self.accuracy, bin_limit=self.bins, minimum=self.minimum,
                    count=s.count, zero_count=s._zero_count, sum=s._sum,
                    bins=list(store.bins), offset=store.offset,
                    min_key=store.min_key if store.count else None,
                    max_key=store.max_key if store.count else None, collapsed=store.is_collapsed)

    @classmethod
    def from_dict(cls, d):
        if d["version"] != 1:
            raise ValueError("unsupported sketch version")
        out = cls(d["accuracy"], d["bin_limit"])
        if len(d["bins"]) > out.bins or any(n < 0 or not math.isfinite(n) for n in d["bins"]):
            raise ValueError("invalid sketch bins")
        if sum(d["bins"]) + d["zero_count"] != d["count"]:
            raise ValueError("sketch count mismatch")
        s = out.sketch
        out.minimum = d["minimum"]
        s._count, s._zero_count, s._sum = d["count"], d["zero_count"], d["sum"]
        store = s._store
        store.bins, store.offset, store.count = list(d["bins"]), d["offset"], sum(d["bins"])
        if store.count:
            store.min_key, store.max_key = d["min_key"], d["max_key"]
        store.is_collapsed = d["collapsed"]
        return out

    def merge(self, other):
        if (self.accuracy, self.bins) != (other.accuracy, other.bins):
            raise ValueError("incompatible duration summaries")
        self.sketch.merge(other.sketch)
        if other.minimum is not None:
            self.minimum = other.minimum if self.minimum is None else min(self.minimum, other.minimum)


class Population:
    """Exactly-once accounting within a declared bounded block of eligible IDs."""

    def __init__(self, block_id, capacity=10000, reservoir=16, seed=0, thresholds_ms=(1,10,100,1000)):
        self.block_id, self.capacity = block_id, capacity
        self.counts = Counter()
        self.ids = {}
        self.logical = set()
        self.sketch = DurationSketch()
        self.sample, self.reservoir = [], reservoir
        self.rng = random.Random(seed)
        self.prefix = self.suffix = self.max_run = 0
        self._prefix_open = True
        if any(not math.isfinite(t) or t < 0 for t in thresholds_ms):
            raise ValueError("finite nonnegative fixed thresholds required")
        self.thresholds = {str(t):0 for t in thresholds_ms}
        self.drought = {"first":None,"last":None,"max_ns":0,"clock":None,"ordered":True}
        self.last_terminal = None

    def add(self, row):
        identity = row["request_id"]
        digest = canonical_hash(row)
        if identity in self.ids:
            if self.ids[identity] != digest:
                raise ValueError("terminal identity conflict")
            return
        if len(self.ids) >= self.capacity:
            raise ValueError("population block capacity exhausted; close block")
        self.ids[identity] = digest
        self.logical.add(row.get("delivery_id", identity))
        self.counts["eligible"] += 1
        status = row["status"]
        self.counts[status] += 1
        finish, deadline = row.get("client_finish_ns"), row.get("deadline_ns")
        complete = status == "ok"
        if finish is not None:
            if self.last_terminal is not None and finish < self.last_terminal:
                self.drought["ordered"]=False
            self.last_terminal=finish
        missed = (finish > deadline if finish is not None and deadline is not None and complete
                  else True if finish is not None and deadline is not None and finish >= deadline
                  and status in ("timeout", "censored", "not_submitted") else None)
        self.counts["missed" if missed else "on_time" if missed is False else "unknown_deadline"] += 1
        if complete:
            self.sketch.add(row["client_total_ns"] / 1e6)
            for threshold in self.thresholds:
                self.thresholds[threshold] += row["client_total_ns"] > float(threshold)*1e6
            clock=row.get("clock_domain")
            if self.drought["first"] is None:
                self.drought.update(first=finish,clock=clock)
            if self.drought["last"] is not None and finish is not None:
                self.drought["max_ns"]=max(self.drought["max_ns"],finish-self.drought["last"])
            if not clock or self.drought["clock"] != clock:
                self.drought["ordered"]=False
            self.drought["last"]=finish
        if missed:
            self.suffix += 1
            if self._prefix_open:
                self.prefix += 1
            self.max_run = max(self.max_run, self.suffix)
        else:
            self._prefix_open = False
            self.suffix = 0
        n = self.counts["eligible"]
        if len(self.sample) < self.reservoir:
            self.sample.append(row)
        else:
            k = self.rng.randrange(n)
            if k < self.reservoir:
                self.sample[k] = row

    def summary(self):
        n = self.counts["eligible"]
        return dict(block_id=self.block_id, counts=dict(self.counts), logical_deliveries=len(self.logical),
                    durations=self.sketch.to_dict(), prefix=self.prefix, suffix=self.suffix,
                    max_run=self.max_run, all_missed=n > 0 and self.prefix == n,
                    threshold_exceedance=dict(self.thresholds),threshold_scope="completed deliveries; other outcomes censored",
                    drought=dict(self.drought),drought_scope="between observed useful completions; initial and final gaps censored",
                    sample=self.sample, inclusion_probability=min(1, self.reservoir / n) if n else None,
                    selection="uniform exploratory", completed_quantiles_only=True)


def join_runs(left, right):
    droughts=[p["drought"] for p in (left,right) if p.get("drought")]
    drought={"first":None,"last":None,"max_ns":0,"clock":None,"ordered":True}
    for d in droughts:
        if d["first"] is None:
            continue
        if drought["first"] is None:
            drought=dict(d)
            continue
        compatible=drought["clock"] is not None and drought["clock"]==d["clock"] and d["first"]>=drought["last"]
        drought["max_ns"]=max(drought["max_ns"],d["max_ns"],d["first"]-drought["last"] if compatible else 0)
        drought.update(last=d["last"],ordered=drought["ordered"] and d["ordered"] and compatible)
    thresholds=Counter(left.get("threshold_exceedance",{}))
    thresholds.update(right.get("threshold_exceedance",{}))
    return dict(max_run=max(left["max_run"], right["max_run"], left["suffix"] + right["prefix"]),
                prefix=left["prefix"] + right["prefix"] if left["all_missed"] else left["prefix"],
                suffix=right["suffix"] + left["suffix"] if right["all_missed"] else right["suffix"],
                all_missed=left["all_missed"] and right["all_missed"],drought=drought,threshold_exceedance=dict(thresholds))


def compare_blocks(reference, current, contract, look=1, *, effect_scale=1):
    from .network_capture import validate_payload
    validate_payload("comparison_contract", contract)
    if not isinstance(look, int) or look < 1:
        raise ValueError("look must be positive")
    if effect_scale not in (1,2):
        raise ValueError("supported bounded-outcome scale required")
    result = dict(regression=False, reason="insufficient statistical resolution", interval=None,
                  difference=None, look=look, spent_alpha=contract["alpha"] / (look * (look + 1)),
                  estimand=contract["estimand"])
    if not reference or not current:
        return result
    values = [[b["value"] for b in blocks] for blocks in (reference, current)]
    if any(not math.isfinite(v) or not 0 <= v <= 1 for group in values for v in group):
        raise ValueError("bounded block outcomes required")
    bounds=[[b.get("value_bounds",[b["value"],b["value"]]) for b in blocks] for blocks in (reference,current)]
    if any(len(b)!=2 or not 0 <= b[0] <= b[1] <= 1 for group in bounds for b in group):
        raise ValueError("bounded outcome intervals required")
    weights = contract["weights"]
    if len(weights.get("reference", [])) != len(reference) or len(weights.get("current", [])) != len(current):
        result["reason"] = "frozen sample sizes/weights unavailable"
        return result
    for w in weights.values():
        if any(x < 0 or not math.isfinite(x) for x in w) or not math.isclose(sum(w), 1):
            raise ValueError("normalized nonnegative fixed weights required")
    means = [[sum(v[side] * w for v,w in zip(group,weights[key])) for side in (0,1)]
             for group,key in zip(bounds,("reference","current"))]
    difference=[effect_scale*(means[1][0]-means[0][1]),effect_scale*(means[1][1]-means[0][0])]
    result["observed_difference_bounds"]=difference
    result["difference"] = difference[0] if difference[0]==difference[1] else None
    if contract["selection"] != "confirmatory":
        result["reason"] = "exploratory selection cannot confirm itself"
        return result
    if any(b["start"] <= contract["frozen_at"] for b in current):
        result["reason"] = "confirmation reused selection data"
        return result
    dep = contract["dependence"]
    if dep.get("model") != "independent_blocks" or not dep.get("basis"):
        return result
    if any(b.get("regime") != contract["regime"] for b in reference + current):
        result["reason"] = "regime changed"
        return result
    ids = [b["unit"] for b in reference + current]
    if len(set(ids)) != len(ids):
        result["reason"] = "replication units overlap"
        return result
    radii = [min(1, math.sqrt(math.log(4 / result["spent_alpha"]) * sum(w*w for w in weights[k]) / 2))
             for k in ("reference", "current")]
    lo = max(0, means[1][0] - radii[1]) - min(1, means[0][1] + radii[0])
    hi = min(1, means[1][1] + radii[1]) - max(0, means[0][0] - radii[0])
    lo,hi=lo*effect_scale,hi*effect_scale
    result.update(interval=[lo, hi], regression=lo > contract["threshold"],
                  reason="material regression" if lo > contract["threshold"] else "material change not established")
    return result


def compare_population_summaries(reference, current, contract):
    """Exact observed-rate bounds, with censoring; does not assume request independence."""
    counts=[]
    for group in (reference,current):
        total=Counter()
        for row in group:
            total.update(row["summary"]["counts"])
        n=total["eligible"]
        counts.append({"counts":dict(total),"deadline_rate_bounds":
                       [total["missed"]/n,(total["missed"]+total["unknown_deadline"])/n] if n else None})
    support=all(all(key in row["context"] and key in reference[0]["context"] and row["context"][key] == reference[0]["context"][key]
                        for key in contract["comparable"]) for row in reference+current) if reference and current else False
    a,b=(c["deadline_rate_bounds"] for c in counts)
    difference=[b[0]-a[1],b[1]-a[0]] if a and b and support else None
    return {"reference":counts[0],"current":counts[1],"observed_deadline_change_bounds":difference,
            "comparison_supported":support,"regression":False,
            "reason":"descriptive eligible-delivery contrast; independent replication not established" if support else "comparison support missing"}


def local_interval(start, end):
    if start["clock"] != end["clock"]:
        return {"interval": None, "reason": "unrelated clocks"}
    if start.get("units",{}).get("time") != end.get("units",{}).get("time"):
        return {"interval":None,"reason":"timestamp units differ"}
    uncertainty = start.get("uncertainty", 0) + end.get("uncertainty", 0)
    delta = end["time"] - start["time"]
    return {"interval": [delta - uncertainty, delta + uncertainty] if delta + uncertainty >= 0 else None,
            "reason": "local duration" if delta + uncertainty >= 0 else "invalid order"}


def mapped_interval(start, end, mapping):
    if start["clock"] == end["clock"]:
        return local_interval(start, end)
    if not mapping or mapping["source"] != start["clock"] or mapping["target"] != end["clock"]:
        return {"interval": None, "reason": "clock mapping unavailable"}
    start_bounds=[start["time"]-start.get("uncertainty",0),start["time"]+start.get("uncertainty",0)]
    if not mapping.get("inputs") or not mapping["valid"][0] <= start_bounds[0] <= start_bounds[1] <= mapping["valid"][1]:
        return {"interval": None, "reason": "clock mapping expired/unsupported"}
    projections = [at * rate + offset for at in start_bounds for rate in mapping["scale"] for offset in mapping["offset"]]
    lo, hi = end["time"]-end.get("uncertainty",0)-max(projections), end["time"]+end.get("uncertainty",0)-min(projections)
    return {"interval": [lo, hi] if hi >= 0 else None, "reason": "bounded clock transform"}


def composite_residual(client, server, scale=(1, 1), *, nested=False):
    if not nested or min(client + server) < 0 or min(scale) <= 0:
        return {"interval": None, "reason": "invalid nesting or duration conversion"}
    bounds = [client[0] - server[1] * scale[1], client[1] - server[0] * scale[0]]
    return {"interval": bounds if bounds[0] >= 0 else None,
            "raw_interval": bounds, "reason": "composite outside opaque service; not one-way transit"}


def range_union(ranges):
    merged = []
    for lo, hi in sorted(ranges):
        if lo < 0 or hi < lo:
            raise ValueError("invalid unwrapped byte range")
        if merged and lo <= merged[-1][1]:
            merged[-1][1] = max(hi, merged[-1][1])
        else:
            merged.append([lo, hi])
    return merged


def complete_range(required, observed):
    return any(lo <= required[0] and hi >= required[1] for lo, hi in range_union(observed))


def unwrap_sequence(value, checkpoint):
    if not isinstance(value,int) or not 0 <= value < 2**32:
        raise ValueError("32-bit TCP sequence required")
    if checkpoint is None:
        return None
    base=checkpoint // 2**32 * 2**32
    choices=[base+value-2**32,base+value,base+value+2**32]
    nearest=min(choices,key=lambda candidate:abs(candidate-checkpoint))
    return nearest if abs(nearest-checkpoint) < 2**31 else None


def required_data_readiness(records, mapping):
    """Contiguous readable ranges, only with explicit application framing and connection incarnation."""
    if mapping.get("certainty") != "explicit" or not mapping.get("framing_observed") or not mapping.get("connection") or not mapping.get("inputs") or not set(mapping["inputs"]) <= records.keys():
        return {"ready":None,"reason":"application/transport mapping unavailable"}
    eligible=[]
    for rid,row in records.items():
        if row["boundary"] not in ("readable","delivery") or not row["coverage"]["complete"] or row["coverage"]["drops"] != 0:
            continue
        connections=[link["identity"] for link in row["links"] if link["relation"] == "connection" and link["certainty"] == "explicit"]
        if mapping["connection"] not in connections:
            continue
        for link in row["links"]:
            if link["relation"] == "stream_range" and link["certainty"] == "explicit" and link["identity"][0] == mapping["stream"]:
                eligible.append((rid,row,link["identity"][1:]))
    if len({row["clock"] for _,row,_ in eligible}) > 1:
        return {"ready":None,"reason":"readability clocks unrelated"}
    if len({row["units"]["time"] for _,row,_ in eligible}) > 1:
        return {"ready":None,"reason":"readability timestamp units differ"}
    ranges, inputs=[],[]
    for rid,row,byte_range in sorted(eligible,key=lambda v:v[1]["time"]):
        ranges.append(byte_range)
        inputs.append(rid)
        if complete_range(mapping["required_range"],ranges):
            return {"ready":row["time"],"clock":row["clock"],"units":row["units"]["time"],
                    "inputs":sorted(set(inputs)),"ranges":range_union(ranges),"reason":"required contiguous range readable"}
    return {"ready":None,"reason":"required range not established; absence is not physical loss"}


def feedback_spacing(emission, arrival, rate_bounds=None):
    if len(emission) != 2 or len(arrival) != 2 or rate_bounds is None:
        return {"distortion":None,"reason":"joined ACKs and clock-rate bounds required"}
    if [r.get("ack_identity") for r in emission] != [r.get("ack_identity") for r in arrival] or any(r.get("ack_identity") is None for r in emission):
        return {"distortion":None,"reason":"ACK correspondence unavailable"}
    e,a=local_interval(*emission),local_interval(*arrival)
    if e["interval"] is None or a["interval"] is None:
        return {"distortion":None,"reason":"local intervals unavailable"}
    lo=a["interval"][0]-e["interval"][1]*rate_bounds[1]
    hi=a["interval"][1]-e["interval"][0]*rate_bounds[0]
    return {"distortion":[lo,hi],"reason":"spacing distortion; not one-way delay or a physical cause"}


def topology_bounds(table):
    from scipy.optimize import linprog
    import numpy as np
    if not table.get("additivity_basis") or len(set(table["epochs"])) != 1:
        return {"status": "unsupported model", "bounds": {}}
    a = np.asarray(table["incidence"], dtype=float)
    intervals = np.asarray(table["intervals"], dtype=float)
    endpoint = np.asarray(table["endpoint_bounds"], dtype=float)
    if a.ndim != 2 or np.any(a < 0) or not np.all(np.isfinite(a)):
        raise ValueError("invalid path incidence")
    low, high = intervals[:, 0] - endpoint[:, 1], intervals[:, 1] - endpoint[:, 0]
    aub, bub = np.vstack((a, -a)), np.concatenate((high, -low))
    resources = table["resources"]
    groups = table.get("groups", {})
    bounds = {}
    for name, indices in [(r, [i]) for i, r in enumerate(resources)] + [(g, [resources.index(r) for r in rs]) for g, rs in groups.items()]:
        objective = np.zeros(a.shape[1])
        objective[indices] = 1
        mn = linprog(objective, A_ub=aub, b_ub=bub, bounds=(0, None), method="highs")
        mx = linprog(-objective, A_ub=aub, b_ub=bub, bounds=(0, None), method="highs")
        if mn.status == 2 or mx.status == 2:
            return {"status": "model inconsistency", "bounds": {}}
        bounds[name] = [float(mn.fun) if mn.success else None, float(-mx.fun) if mx.success else None]
    same = [[resources[j] for j in range(len(resources)) if np.array_equal(a[:, i], a[:, j])]
            for i in range(len(resources))]
    return {"status": "conditional bounds", "bounds": bounds,
            "indistinguishable": sorted({tuple(g) for g in same if len(g) > 1})}


def stratified_comparison(reference, current, contract):
    """Frozen exact strata and target weights; unsupported strata stay in the result."""
    keys = contract["comparable"]
    bins = contract.get("numeric_bins", {})

    def stratum(row):
        values = []
        for key in keys:
            value = row.get(key)
            if key in bins and value is not None:
                value = sum(value >= edge for edge in bins[key])
            values.append(value)
        return tuple(values)

    grouped = []
    for rows in (reference, current):
        groups = {}
        for row in rows:
            if all(row.get(k) == v for k, v in contract.get("filters", {}).items()):
                groups.setdefault(stratum(row), []).append(row)
        grouped.append(groups)
    results, unsupported = {}, []
    for key in sorted(set(grouped[0]) | set(grouped[1]), key=repr):
        left, right = (g.get(key, []) for g in grouped)
        label = repr(key)
        if not left or not right or None in key:
            unsupported.append(label)
        else:
            results[label] = sum(r["value"] for r in right)/len(right) - sum(r["value"] for r in left)/len(left)
    weights = contract.get("target_weights", {})
    standardized = (sum(weights[k] * results[k] for k in weights)
                    if weights and set(weights) <= results.keys() and math.isclose(sum(weights.values()), 1) else None)
    total = (sum(r["value"] for r in current)/len(current)-sum(r["value"] for r in reference)/len(reference)
             if reference and current else None)
    supported = sum(len(rows) for key, rows in grouped[1].items() if repr(key) in results)
    return {"total_change": total, "strata": results, "unsupported": unsupported,
            "excluded_fraction": 1-supported/len(current) if current else None,
            "standardized_change": standardized, "inference": "descriptive; use frozen block comparison for confirmation"}


def joint_outcomes(pairs, threshold):
    if not pairs:
        return {"simultaneous_exceedance": None, "completion_mean": None}
    return {"simultaneous_exceedance": sum(x > threshold and y > threshold for x,y in pairs)/len(pairs),
            "completion_mean": sum(max(x,y) for x,y in pairs)/len(pairs)}


def compose_clock_mappings(first, second):
    if first["target"] != second["source"] or not first.get("inputs") or not second.get("inputs"):
        raise ValueError("clock mappings are not composable")
    if min(first["scale"]+second["scale"]) <= 0:
        raise ValueError("positive clock rates required")
    # Require the whole first image to lie inside the second calibration horizon.
    mapped = [t*r+o for t in first["valid"] for r in first["scale"] for o in first["offset"]]
    if min(mapped) < second["valid"][0] or max(mapped) > second["valid"][1]:
        raise ValueError("clock composition outside validity interval")
    scale = [a*b for a in first["scale"] for b in second["scale"]]
    offset = [a*b+c for a in first["offset"] for b in second["scale"] for c in second["offset"]]
    return dict(source=first["source"],target=second["target"],scale=[min(scale),max(scale)],
                offset=[min(offset),max(offset)],valid=first["valid"],inputs=sorted(set(first["inputs"]+second["inputs"])))


def prior_advice(ledger, context, capabilities):
    """Historical summaries nominate actions only; never yield current support IDs."""
    advice = []
    for record in ledger.evidence.values():
        if record.kind != "summary" or record.domain != "network":
            continue
        payload = record.payload
        if payload.get("context") != context or not set(payload.get("capabilities", [])) <= set(capabilities):
            continue
        projection = payload.get("projection", {})
        advice.append({"prior_incident":record.incident_id,
                       "candidate_mechanisms":sorted({c["scope"]["mechanism"] for c in projection.get("claims", [])}),
                       "acquisitions":[p for p in projection.get("evidence", {}).values() if "actual" in p],
                       "current_support":[],"provenance":"historical advice; transfer not established"})
    return advice


def progress_view(records):
    """Join only explicit delivery/connection/resource identities, retaining local ordering."""
    by_identity, gaps = {}, []
    for identity, event in records.items():
        for link in event["links"]:
            if link["certainty"] == "explicit" and link["relation"] in ("delivery", "connection", "resource", "thread"):
                by_identity.setdefault((link["relation"], str(link["identity"])), []).append((identity, event))
        if event["coverage"]["complete"] is not True or event["coverage"]["drops"] != 0:
            gaps.append(identity)
    intervals,unmatched = [],[]
    source_gaps=set(gaps)
    for (relation, identity), rows in by_identity.items():
        clocks = {e["clock"] for _, e in rows}
        for clock in clocks:
            local = sorted([(rid,e) for rid,e in rows if e["clock"] == clock], key=lambda p: (p[1]["time"], p[0]))
            for start_name, end_name, meaning in (("release","submit","dispatch_delay"),
                ("complete_readable","consume","consumption_delay"), ("queue_enqueue","queue_dequeue","queue_sojourn"),
                ("switch_ingress","switch_egress","switch_residence"), ("relay_ingress","relay_release","relay_residence"),
                ("eligible","link_assign","link_assignment_wait"), ("link_assign","access","access_wait"),
                ("runnable","running","runnable_wait")):
                pending = {}
                ambiguous=set()
                for rid, ev in local:
                    token=ev.get("values",{}).get("token")
                    if ev["boundary"] == start_name:
                        if token in pending:
                            ambiguous.update([pending[token][0],rid])
                            unmatched.append({"kind":meaning,"inputs":[pending[token][0],rid],"reason":"duplicate start identity"})
                        pending[token] = (rid,ev)
                    elif ev["boundary"] == end_name and token in pending:
                        pid, previous = pending.pop(token)
                        if previous["units"]["time"] != ev["units"]["time"]:
                            continue
                        if previous.get("values", {}).get("token") != ev.get("values", {}).get("token"):
                            continue
                        limits = sorted(set(previous["limitations"] + ev["limitations"]))
                        if pid in source_gaps or rid in source_gaps or pid in ambiguous or rid in ambiguous:
                            limits.append("incomplete source coverage")
                        intervals.append(dict(kind=meaning, identity=identity, relation=relation, clock=clock,
                                              units=ev["units"]["time"],
                                              interval=[previous["time"],ev["time"]], duration=ev["time"]-previous["time"],
                                              duration_bounds=local_interval(previous,ev)["interval"],
                                              inputs=[pid,rid], limitations=limits))
                    elif ev["boundary"] == end_name:
                        unmatched.append({"kind":meaning,"inputs":[rid],"reason":"start outside retained view"})
                unmatched.extend({"kind":meaning,"inputs":[rid],"reason":"end outside retained view"} for rid,_ in pending.values())
    return {"intervals": intervals, "coverage_gaps": sorted(source_gaps),"unmatched":unmatched,
            "unknown_initial_state": True, "unresolved_region": "unobserved boundaries remain composite"}


def _interval_predicate(view, kind, mechanism):
    covered = [f for f in view["intervals"] if f["kind"] == kind and not f["limitations"]]
    threshold=view.get("thresholds",{}).get(kind)
    facts = [f for f in covered if f["duration_bounds"] and f["duration_bounds"][0] > (threshold["value"] if threshold and f["units"] == threshold["units"] else 0)]
    contradicted=bool(covered and threshold and not view.get("coverage_gaps") and not any(g["kind"]==kind for g in view.get("unmatched",[])) and all(f["units"] == threshold["units"] and
                      f["duration_bounds"] and f["duration_bounds"][1] <= threshold["value"] for f in covered))
    return dict(result="supports" if facts else "contradicts" if contradicted else "unresolved", inputs=sorted({i for f in (facts or covered) for i in f["inputs"]}),
                mechanism=mechanism, scope=kind, assumptions=["explicit identity and complete boundary coverage"],
                reason="observed bounded wait" if facts else "covered intervals do not exceed declared threshold" if contradicted else "required joined boundaries missing",
                alternatives=["unmodeled mechanism"], eliminated=False)


def mechanism_predictions(records, view=None):
    view = progress_view(records) if view is None else view
    results = {name: _interval_predicate(view, kind, name) for name, kind in
               (("endpoint_dispatch", "dispatch_delay"), ("late_consumption", "consumption_delay"),
                ("queue_wait", "queue_sojourn"), ("relay_release", "relay_residence"),
                ("wireless_access_wait", "access_wait"), ("link_assignment_wait", "link_assignment_wait"))}
    rows = list(records.items())

    def qualified(name, predicate, scope, alternatives):
        support = [rid for rid,e in rows if e["coverage"]["complete"] and e["coverage"]["drops"] == 0 and predicate(e)]
        results[name] = dict(result="supports" if support else "unresolved", inputs=sorted(set(support)),
                             mechanism=name, scope=scope, assumptions=["source reports actual boundary semantics"],
                             reason="observed necessary facts" if support else "required facts unavailable",
                             alternatives=alternatives + ["unmodeled mechanism"], eliminated=False)

    qualified("sender_restriction", lambda e: e["boundary"] == "socket_state" and
              e["values"].get("pending_bytes",0) > 0 and e["values"].get("not_sent_bytes",0) > 0 and
              any(e["values"].get(k) is not None for k in ("snd_cwnd","rwnd","pacing_rate")),
              "sender restriction; specific limiter unresolved", ["pacing","flow window","congestion window"])
    qualified("queue_accumulation", lambda e:e["boundary"] == "queue_enqueue" and
              e["values"].get("backlog_before") is not None and e["values"].get("backlog_after") is not None and
              e["values"]["backlog_after"] > e["values"]["backlog_before"] and
              any(l["relation"] == "resource" and l["certainty"] == "explicit" for l in e["links"]),
              "observed backlog increase; inherited onset may be unknown",["downstream consumption delay","service policy"])
    def useful_after(e):
        delivery={str(l["identity"]) for l in e["links"] if l["relation"]=="delivery" and l["certainty"]=="explicit"}
        return [rid for rid,other in rows if other["boundary"] in ("delivery","complete_readable","consume") and
                   other["clock"]==e["clock"] and other["units"]["time"]==e["units"]["time"] and other["time"]>=e["time"] and
                   other["coverage"]["complete"] and other["coverage"]["drops"]==0 and
                   delivery & {str(l["identity"]) for l in other["links"] if l["relation"]=="delivery" and l["certainty"]=="explicit"}
                   ]
    qualified("recovery_gating", lambda e: e["boundary"] == "recovery" and
              e["values"].get("pending") is True and e["values"].get("required_range") is not None and
              e["values"].get("repaired_range") is not None and
              complete_range(e["values"]["required_range"], [e["values"]["repaired_range"]]) and useful_after(e),
              "required-range recovery; initiating loss unproven", ["delayed original","reordering","physical loss"])
    recovery=results["recovery_gating"]
    recovery["inputs"]=sorted(set(recovery["inputs"]) | {ref for rid in recovery["inputs"] for ref in useful_after(records[rid])})
    qualified("serialization", lambda e: e["boundary"] == "egress" and
              e["values"].get("service_interval") is not None and e["values"].get("bytes",0) > 0 and
              any(l["relation"] == "resource" and l["certainty"] == "explicit" for l in e["links"]),
              "observed resource service interval", ["pacing","window restriction","resource capacity"])
    qualified("historical_path_change", lambda e: e["boundary"] == "route" and
              e["values"].get("previous_epoch") is not None and e["values"].get("flow_correspondence") == "explicit",
              "historical route transition", ["concurrent congestion"])
    qualified("reverse_feedback", lambda e: e["boundary"] == "ack_arrive" and
              e["values"].get("emission_spacing") is not None and e["values"].get("arrival_spacing") is not None and
              e["values"].get("sender_gated") is True and e["values"].get("direction") == "feedback",
              "feedback spacing distortion; physical location unresolved", ["remote ACK generation","return transit"])
    supports = [name for name,p in results.items() if p["result"] == "supports"]
    shared = [rid for rid,e in rows if e["values"].get("shared_exposure") or e["values"].get("masked_dependency")]
    if len(supports) > 1 and shared:
        results["compound"] = dict(result="supports", inputs=sorted({i for p in results.values() for i in p["inputs"]} | set(shared)),
            scope="coexisting delays; interaction contribution unresolved", mechanisms=supports,
            reason="explicit shared exposure/masking", assumptions=[], alternatives=["unexplored compositions"], eliminated=False)
    results["unknown"] = dict(result="unresolved", inputs=[], scope="open mechanism space",
                              reason="known library is not complete", alternatives=[], assumptions=[], eliminated=False)
    provenance={"endpoint_dispatch":["M-6943fef9ee"],"late_consumption":["M-bee7eb4678"],
                "sender_restriction":["M-23251a056c"],"recovery_gating":["M-75886858c3"],
                "queue_wait":["M-e5f0c9ba7d"],"queue_accumulation":["M-53e8680366"],
                "wireless_access_wait":["M-a8b585efbf","M-a2c42995f9"],"link_assignment_wait":["M-a2c42995f9"],
                "reverse_feedback":["M-19393aed54"]}
    for name,result in results.items():
        result["research_provenance"]=provenance.get(name,[])
    return results


def randomization_test(control, treatment, *, seed=0, simulations=10000):
    """Paired independent-block sign randomization; exact when enumeration is small."""
    import itertools
    import random
    if len(control) != len(treatment) or not control:
        raise ValueError("paired block outcomes required")
    delta = [a-b for a,b in zip(control,treatment)]
    if any(not math.isfinite(d) for d in delta):
        raise ValueError("finite outcomes required")
    observed = sum(delta)/len(delta)
    exact = len(delta) <= 16
    rng = random.Random(seed)
    assignments = itertools.product((-1,1), repeat=len(delta)) if exact else (
        [rng.choice((-1,1)) for _ in delta] for _ in range(simulations))
    total = extreme = 0
    for signs in assignments:
        total += 1
        extreme += sum(d*s for d,s in zip(delta, signs))/len(delta) >= observed - 1e-12
    p = extreme/total if exact else (extreme+1)/(total+1)
    return {"effect": observed, "p_value": p, "method": "exact paired randomization" if exact else "Monte Carlo paired randomization",
            "assignments": total, "simulation_error_bound_95": 0 if exact else math.sqrt(math.log(40)/(2*total))}

def paired_schedule(pairs, seed):
    import random
    if not isinstance(pairs,int) or not 1 <= pairs <= 10000:
        raise ValueError("bounded positive replication count required")
    rng = random.Random(seed)
    schedule = []
    for _ in range(pairs):
        arms = ["control", "treatment"]
        rng.shuffle(arms)
        schedule.extend(arms)
    return schedule
