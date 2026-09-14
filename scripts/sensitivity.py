"""Sensitivity floor: minimal per-stage shift that trips candidate-grade z.

No GPU needed. Loads a real trace (SMOLVLA_TRACE, default: saved smoke seed
11), converts once, then scales each stage's inputs on copies and binary
searches the factor where that stage's z crosses _Z_CANDIDATE. Perturbs
analysis inputs only — the measurement path is untouched. Timestamp-derived
stages (preprocess/cpu) stretch durations in place; gap side-effects are real
and reported, not hidden.
"""
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(r"C:\Users\moham\OneDrive\Documents\ChatGPT\Reflex")
sys.path.insert(0, str(ROOT))

from reflex import collect as C
from reflex.diagnose import STAGES, _Z_CANDIDATE, compare_real

TRACE = os.environ.get(
    "SMOLVLA_TRACE",
    r"C:\Users\moham\OneDrive\Documents\Reflex-traces"
    r"\smoke-20260911-seed11\trace.json")


def perturb(bundle: dict, stage: str, f: float) -> dict:
    # Shallow: only the scaled list is rebuilt with copied records; every
    # other list is shared read-only (compare path never mutates). Full
    # deepcopy of a 77k-kernel bundle per iteration took minutes.
    b = dict(bundle)
    if stage == "gpu":
        out = []
        for g in bundle["gpu_kernel"]:
            g2 = dict(g)
            g2["dur_ns"] = int(g2.get("dur_ns", 0) * f)
            g2["end_ns"] = int(g2.get("start_ns", 0)) + int(g2["dur_ns"])
            out.append(g2)
        b["gpu_kernel"] = out
    elif stage == "transport":
        b["transfer"] = [dict(t, dur_ns=int(t.get("dur_ns", 0) * f))
                         for t in bundle["transfer"]]
    elif stage == "scheduler":
        out = []
        for g in bundle["gpu_kernel"]:
            g2 = dict(g)
            if g2.get("launch_gap_ns") is not None:
                g2["launch_gap_ns"] = int(g2["launch_gap_ns"] * f)
            out.append(g2)
        b["gpu_kernel"] = out
        out = []
        for s in bundle["sync_edge"]:
            s2 = dict(s)
            if s2.get("blocked_ns") is not None:
                s2["blocked_ns"] = int(s2["blocked_ns"] * f)
            s2["dur_ns"] = int(s2.get("dur_ns", 0) * f)
            out.append(s2)
        b["sync_edge"] = out
    elif stage in ("preprocess", "cpu"):
        out = []
        for c in bundle["cpu_launch"]:
            c2 = dict(c)
            s0 = int(c2.get("start_ns", 0))
            c2["end_ns"] = s0 + int((int(c2.get("end_ns", 0)) - s0) * f)
            out.append(c2)
        b["cpu_launch"] = out
    elif stage == "queue":
        b["l1"] = [dict(r, queue_depth=max(
            1, round(float(r.get("queue_depth", 0)) * f)))
            for r in bundle["l1"]]
    return b


def main() -> int:
    t0 = time.time()
    doc = json.loads(Path(TRACE).read_text(encoding="utf-8"))
    ident = {"device": "Tesla T4", "hardware": "Tesla T4",
             "driver": "580.82", "cuda": "12.8",
             "collector_version": "collect-v1"}
    man = C.manifest("healthy", 11, workload="smolvla-replay-v1",
                     identity_provider=lambda: dict(ident),
                     trace_variant="kineto", perf_status="profiled",
                     software={"torch": "sensitivity"}, commit="sensitivity")
    base = C.adapt_bundle_for_diagnose(C.kineto_to_bundle(doc, man), man)
    print(f"baseline kernels={len(base['gpu_kernel'])} "
          f"candidate-grade z>{_Z_CANDIDATE}", flush=True)
    for stage in STAGES:
        if stage in ("postprocess", "action"):
            print(f"{stage:12s} N/A (structural zeros by construction)")
            continue
        lo, hi, found = 1.0, 8.0, None
        for _ in range(6):
            mid = (lo + hi) / 2
            z = compare_real(perturb(base, stage, mid), [base])
            z = z["surfaces"][stage]["z"]
            if z > _Z_CANDIDATE:
                found, hi = mid, mid
            else:
                lo = mid
        if found is None:
            print(f"{stage:12s} >800% (no trip)")
        else:
            print(f"{stage:12s} trips at +{(found - 1) * 100:.0f}%")
    print(f"total_s={time.time() - t0:.1f}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
