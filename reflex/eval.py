"""Ticket 14: hidden-fault eval harness + target demo.

Top-1/Top-3 over the corpus with strict single-stage acceptance, Brier/ECE
of temperature-calibrated tops (temp fit on fixed families, seeds disjoint
from eval), measurements-to-verify, wall time, evidence bytes. Eval code may
use ground truth for SCORING only; the pipeline under test never sees it.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

from . import confidence as _conf
from . import diagnose as _diag
from . import fakegpu as _fg
from . import memory as _mem
from . import tournament as _tour
from .report import run_case

# ponytail: strict single-stage acceptance (harsher than the tournament's
# acceptable sets on multi-effect faults); scores what the tool names first.
FAULT_CAUSE = {"cpu_starvation": "cpu", "launch_overhead": "scheduler",
               "bw_pressure": "gpu", "stalls": "gpu",
               "sync_serialization": "scheduler", "transfer_heavy": "transport",
               "batching_delay": "preprocess", "queue_contention": "queue",
               "competing_workload": "queue", "kernel_regression": "gpu",
               "preprocessing_interference": "preprocess"}
# ponytail: fixed temperature-fit families; disjoint seeds from eval runs below.
_TEMP_FAMS = (("cpu_starvation", 501), ("kernel_regression", 502),
              ("transfer_heavy", 503))


def _fit_temp():
    stages = _diag.STAGES
    causemap = {"cpu_starvation": "cpu", "kernel_regression": "gpu",
                "transfer_heavy": "transport"}
    zs, ys = [], []
    for fam, seed in _TEMP_FAMS:
        b = _fg.generate(seed, fam, 8)
        h = [_fg.generate(seed + 1000 + i, "healthy", 8) for i in range(2)]
        st = _conf.voice_state(b, h)
        zs.append(_conf.align(_conf.fuse_taken(st, _conf.VOICES)))
        ys.append(stages.index(causemap[fam]))
    return _conf.fit_temperature(zs, ys)


def run_eval(faults: list[str], seeds: list[int], outdir: str | Path,
             n_kernels: int = 8) -> dict:
    """Full pipeline per (fault, seed); aggregates measured, never asserted."""
    t0 = time.monotonic()
    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    store_path = outdir / "memory.jsonl"
    temp = _fit_temp()
    rows, probs, labels = [], [], []
    for fault in faults:
        for seed in seeds:
            case = run_case(seed, fault, outdir / "cases", n_kernels,
                            store_path=str(store_path))
            top1 = case["tour_ranking"][0][0]
            top3 = [s for s, _ in case["tour_ranking"][:3]]
            want = FAULT_CAUSE[fault]
            rows.append({"fault": fault, "seed": seed, "top1": top1,
                         "top3": top3, "hit1": top1 == want,
                         "hit3": want in top3,
                         "verified": case["verified"] is not None,
                         "measurements": case["measurements"],
                         "wall_s": case["wall_s"],
                         "bytes": case["evidence_bytes"],
                         "incident_id": case["incident_id"],
                         "ledger": case["ledger_path"]})
            if case["probabilities"]:
                probs.append([case["probabilities"][s] for s in _diag.STAGES])
                labels.append(_diag.STAGES.index(want))
    n = len(rows)
    cal = _conf.reliability(probs, labels) if probs else {"ece": None, "brier": None}
    rep = {"faults": list(faults), "seeds": list(seeds), "n": n,
           "top1": sum(r["hit1"] for r in rows), "top3": sum(r["hit3"] for r in rows),
           "verified": sum(r["verified"] for r in rows),
           "mean_measurements": sum(r["measurements"] for r in rows) / n if n else 0.0,
           "mean_wall_s": round(sum(r["wall_s"] for r in rows) / n, 2) if n else 0.0,
           "mean_bytes": int(sum(r["bytes"] for r in rows) / n) if n else 0,
           "ece": cal.get("ece"), "brier": cal.get("brier"),
           "wall_s": round(time.monotonic() - t0, 1), "rows": rows}
    (outdir / "eval.json").write_text(json.dumps(rep, indent=2), encoding="utf-8")
    md = ["# Eval: %d/%d Top-1, %d/%d Top-3, %d/%d verified" % (
        rep["top1"], n, rep["top3"], n, rep["verified"], n),
        "calibration: ECE=%s Brier=%s; cost: %.2f measurements, %.2fs, %d bytes mean" % (
        rep["ece"], rep["brier"], rep["mean_measurements"], rep["mean_wall_s"],
        rep["mean_bytes"]), "",
        "| fault | seed | top1 | hit1 | verified | meas | wall_s |",
        "|---|---|---|---|---|---|---|"]
    md += ["| %s | %s | %s | %s | %s | %s | %s |" % (
        r["fault"], r["seed"], r["top1"], r["hit1"], r["verified"],
        r["measurements"], r["wall_s"]) for r in rows]
    (outdir / "eval.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    return rep


def run_demo(outdir: str | Path) -> dict:
    """Doc target story: starvation p99 regression -> isolate -> verified fix."""
    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    prior = run_case(12, "cpu_starvation", outdir / "cases", 8,
                     store_path=str(outdir / "memory.jsonl"))
    case = run_case(11, "cpu_starvation", outdir / "cases", 8,
                    store_path=str(outdir / "memory.jsonl"))
    from .report import render_showme
    text = render_showme(case["ledger_path"], case["incident_id"], case)
    (outdir / "demo.md").write_text(text, encoding="utf-8")
    return {"prior": prior["incident_id"], "case": case,
            "report_path": str(outdir / "demo.md"), "report": text}
