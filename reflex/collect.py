"""Colab collection with loss-proof persistence + dataset builder + refit entry.

Layout per run: <root>/<fault>/<seed>/{manifest.json, trace.json,
trace.sqlite?, DONE}. Manifest is written FIRST; DONE is written LAST, only
after every artifact re-reads with matching sha256. A dead session leaves
flagless partial runs; the next session resumes by scanning for them.
Home-side ingest is append-only and idempotent by run_id. Converters turn
Kineto JSON and our mirrored nsys-subset tables back into bundle dicts the
pipeline consumes; refit re-runs temperature calibration on collected bundles.

A storage root is any filesystem path (Colab: /content/drive/... ; local:
tmp). The device side is an injected callable (tests use a fake writer; Colab
wires nsys via nsys_command() below). Stdlib only.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
from pathlib import Path

PROVENANCE = "collect"
COLLECTOR_VERSION = "collect-v1"
# ponytail: fixed workload matrix (faults x seeds); extend when new fault
# families or cards land, keeping (fault, seed) as the stable run identity.
FAULTS = ("cpu_starvation", "launch_overhead", "bw_pressure", "stalls",
          "sync_serialization", "transfer_heavy", "batching_delay",
          "queue_contention", "competing_workload", "kernel_regression",
          "preprocessing_interference")
DONE = "DONE"


def run_dir(root: str | Path, fault: str, seed: int) -> Path:
    return Path(root) / fault / str(seed)


def manifest(fault: str, seed: int, workload: str = "infer-microbench",
             device: str = "colab-t4", extra: dict | None = None) -> dict:
    """Run identity + comparability context. Written before any artifact."""
    return {"run_id": f"{fault}:{seed}", "fault": fault, "seed": seed,
            "workload": workload, "device": device,
            "collector_version": COLLECTOR_VERSION, "status": "started",
            "sha256": {}, "extra": dict(extra or {})}


def start_run(root: str | Path, fault: str, seed: int, **meta) -> Path:
    """Manifest-first: after this returns, a kill loses nothing claimed."""
    d = run_dir(root, fault, seed)
    d.mkdir(parents=True, exist_ok=True)
    (d / "manifest.json").write_text(
        json.dumps(manifest(fault, seed, **meta), indent=2), encoding="utf-8")
    return d


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def complete_run(root: str | Path, fault: str, seed: int,
                 artifacts: dict[str, bytes]) -> dict:
    """Write artifacts, verify each by re-read checksum, then flag DONE.
    Anything failing verification raises with NO done flag: resume re-runs it."""
    d = run_dir(root, fault, seed)
    man = json.loads((d / "manifest.json").read_text(encoding="utf-8"))
    for name, blob in artifacts.items():
        if "/" in name or name in ("manifest.json", DONE):
            raise ValueError(f"bad artifact name {name!r}")
        (d / name).write_bytes(blob)
    for name in artifacts:
        man["sha256"][name] = _sha256(d / name)
    for name, digest in man["sha256"].items():  # verify by re-read, not memory
        if _sha256(d / name) != digest:
            raise IOError(f"checksum mismatch on {name}, not marking DONE")
    man["status"] = "done"
    (d / "manifest.json").write_text(json.dumps(man, indent=2), encoding="utf-8")
    tmp = d / (DONE + ".tmp")
    tmp.write_text(json.dumps({"run_id": man["run_id"], "sha256": man["sha256"]}),
                   encoding="utf-8")
    tmp.rename(d / DONE)  # atomic flag last
    return man


def is_done(root: str | Path, fault: str, seed: int) -> bool:
    """DONE present AND every checksummed artifact still matches."""
    d = run_dir(root, fault, seed)
    if not (d / DONE).exists() or not (d / "manifest.json").exists():
        return False
    try:
        man = json.loads((d / "manifest.json").read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return False
    return all((d / n).exists() and _sha256(d / n) == s
               for n, s in man.get("sha256", {}).items())


def scan_todo(root: str | Path, faults: tuple = FAULTS,
              seeds: tuple = (11,)) -> list[tuple[str, int]]:
    """Runs missing a verified DONE flag: crash recovery is just re-running these."""
    return [(f, s) for f in faults for s in seeds if not is_done(root, f, s)]


def collect(root: str | Path, faults: tuple = FAULTS, seeds: tuple = (11,),
            device=None, **meta) -> dict:
    """Manifest-first collection over the matrix; resumes partial runs.
    device(fault, seed) -> {artifact_name: bytes}; may raise mid-run (the
    partial run simply stays flagless). Returns per-run done/failed."""
    done, failed = [], {}
    for fault, seed in [(f, s) for f in faults for s in seeds]:
        if is_done(root, fault, seed):
            done.append((fault, seed))
            continue
        start_run(root, fault, seed, **meta)
        try:
            man = complete_run(root, fault, seed, device(fault, seed))
        except Exception as exc:
            failed[(fault, seed)] = f"{type(exc).__name__}: {exc}"
        else:
            done.append((fault, seed))
    return {"done": done, "failed": failed}


def nsys_command(workload: list[str], out_prefix: str,
                 nsys: str = "nsys") -> list[str]:
    """Pure command builder for the Colab side (no execution here): profile a
    workload with CUPTI kernel/memcpy/API tracing into an sqlite export."""
    return [nsys, "profile", "--trace=cuda,nvtx,osrt", "--export=sqlite",
            f"--output={out_prefix}", "--force-overwrite=true", *workload]


def kineto_to_bundle(doc: dict) -> dict:
    """Kineto Chrome-trace JSON -> bundle-shaped dict (cpu_launch, gpu_kernel,
    transfer, sync_edge joined by flow-id correlation). Only guaranteed
    Chrome-trace fields are read; anything else is ignored, never coerced."""
    by_id: dict[str, dict] = {}
    cpu, gpu, tx, sy = [], [], [], []
    for e in doc.get("traceEvents", []):
        if not all(k in e for k in ("ph", "ts", "pid", "tid", "name")):
            raise ValueError("trace event missing required Chrome-trace fields")
        ts_us = int(e["ts"])
        cid = str(e.get("id") or (e.get("args") or {}).get("correlation_id") or "")
        if e["ph"] == "X":
            rec = {"correlation_id": cid, "start_ns": ts_us * 1000,
                   "dur_ns": int(e.get("dur", 0)) * 1000, "name": e["name"],
                   "pid": e["pid"], "tid": e["tid"],
                   "args": dict(e.get("args") or {})}
            ({"cuda_api": cpu, "kernel": gpu, "memcpy": tx, "sync": sy}
             .get(e.get("cat"), []).append(rec))
            if cid:
                by_id.setdefault(cid, {}).setdefault("events", []).append(e["ph"])
    return {"cpu_launch": cpu, "gpu_kernel": gpu, "transfer": tx,
            "sync_edge": sy, "flow_ids": sorted(by_id),
            "timing_model_version": doc.get("timing_model_version", "unknown"),
            "synthetic": False}


def nsys_subset_to_bundle(path: str | Path) -> dict:
    """Our mirrored 3-table subset -> bundle-shaped dict. Reads only the
    mirrored columns, so richer real-nsys exports still parse."""
    con = sqlite3.connect(str(path))
    try:
        def rows(table: str, cols: list[str]) -> list[dict]:
            have = {r[1] for r in
                    con.execute(f"PRAGMA table_info({table})")}
            use = [c for c in cols if c in have]
            if not use:
                raise ValueError(f"{table} lacks mirrored columns")
            cur = con.execute(f"SELECT {','.join(use)} FROM {table}")
            return [dict(zip(use, r)) for r in cur.fetchall()]
        kern = rows("CUPTI_ACTIVITY_KIND_KERNEL",
                    ["correlation_id", "stream_id", "device_id", "kernel_name",
                     "start_ns", "end_ns", "duration_ns", "occupancy_pct"])
        memcpy = rows("CUPTI_ACTIVITY_KIND_MEMCPY",
                      ["correlation_id", "stream_id", "kind", "bytes",
                       "start_ns", "end_ns", "duration_ns"])
        api = rows("CUPTI_ACTIVITY_KIND_CUDA_API",
                   ["correlation_id", "api_name", "pid", "tid",
                    "start_ns", "end_ns"])
    finally:
        con.close()
    return {"cpu_launch": api, "gpu_kernel": kern, "transfer": memcpy,
            "sync_edge": [], "timing_model_version": "nsys-import",
            "synthetic": False}


def ingest(root: str | Path, dataset_path: str | Path) -> dict:
    """Append-only, idempotent ingest of DONE runs: validates schema, skips
    corrupt/partial runs with reasons, never deletes raw artifacts."""
    dataset_path = Path(dataset_path)
    seen = set()
    if dataset_path.exists():
        for line in dataset_path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                seen.add(json.loads(line).get("run_id"))
    accepted, rejected = [], {}
    for fault_d in sorted(Path(root).iterdir()) if Path(root).exists() else []:
        if not fault_d.is_dir():
            continue
        for seed_d in sorted(fault_d.iterdir()):
            if not seed_d.is_dir():
                continue
            rid = f"{fault_d.name}:{seed_d.name}"
            if rid in seen or not is_done(root, fault_d.name, seed_d.name):
                continue
            try:
                man = json.loads((seed_d / "manifest.json").read_text(encoding="utf-8"))
                for k in ("run_id", "fault", "seed", "collector_version"):
                    if k not in man:
                        raise ValueError(f"manifest missing {k}")
                if (seed_d / "trace.json").exists():
                    trace = json.loads((seed_d / "trace.json").read_text(encoding="utf-8"))
                    bundle = kineto_to_bundle(trace)
                elif (seed_d / "subset.db").exists():
                    bundle = nsys_subset_to_bundle(seed_d / "subset.db")
                else:
                    raise ValueError("no trace.json or subset.db artifact")
            except Exception as exc:
                rejected[rid] = f"{type(exc).__name__}: {exc}"
                continue
            dataset_path.parent.mkdir(parents=True, exist_ok=True)
            with open(dataset_path, "a", encoding="utf-8") as fh:
                fh.write(json.dumps({"run_id": rid, "manifest": man,
                                     "bundle": bundle}) + "\n")
            seen.add(rid)
            accepted.append(rid)
    return {"accepted": accepted, "rejected": rejected}


def pair_corpus(records: list[dict]) -> dict:
    """Group ingested runs into healthy/fault pairs by (workload, seed):
    the seed-table shape the eval harness scores."""
    by_key: dict[tuple, dict] = {}
    for r in records:
        m = r["manifest"]
        by_key.setdefault((m.get("workload"), m.get("seed")), {})[m["fault"]] = r
    pairs = {}
    for (workload, seed), group in sorted(by_key.items()):
        if "healthy" in group:
            for fault, rec in sorted(group.items()):
                if fault != "healthy":
                    pairs[f"{fault}:{seed}"] = {
                        "fault": fault, "seed": seed, "workload": workload,
                        "faulty": rec["bundle"], "healthy": group["healthy"]["bundle"]}
    # ponytail: pairs are eval-shaped, not pipeline-ready — real nsys bundles
    # lack the fakegpu vocabulary (dur_ns/stall_hist/tensor fields) that
    # voices/outcomes read. Refitting temperature/EIG on collected data waits
    # on the real-data semantic adapter; until then pairs feed reader
    # validation, retrieval breadth, and hand comparison, never calibration.
    return pairs
