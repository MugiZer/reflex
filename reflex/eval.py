"""Ticket 14: hidden-fault eval harness + target demo.

Top-1/Top-3 over the corpus with strict single-stage acceptance, Brier/ECE
of temperature-calibrated tops (temp fit on fixed families, seeds disjoint
from eval), measurements-to-verify, wall time, evidence bytes. Eval code may
use ground truth for SCORING only; the pipeline under test never sees it.

Ticket 19: pooling diagnostics per eval (pooling_diagnostics): fault contexts
x per-seed evidence bytes -> tau/PI/ESS + MAP mixture + borrow-gate decision
via pooled_or_unpooled, with provenance records derived from the case
artifacts through cells_from_records (never caller-asserted). Single-context
runs report the unresolvable reason instead of numbers. The gate is
consulted before any pooled estimate is trusted: eval trusts unpooled
whenever the consult refuses (synthetic harness provenance always refuses).
"""
from __future__ import annotations

import json
import statistics
import time
from pathlib import Path

from . import confidence as _conf
from . import diagnose as _diag
from . import fakegpu as _fg
from . import memory as _mem
from . import pool as _pool
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


def _pool_cells(rows, scalar="bytes"):
    """Group measured per-seed scalars by fault context: {fault: [obs]}."""
    cells = {}
    for r in rows:
        cells.setdefault(r["fault"], []).append(float(r[scalar]))
    return cells


def _ingest_records(rows):
    """Ingested provenance records: flags carried from the case artifacts
    (fail-closed defaults), never caller-asserted; feeds cells_from_records."""
    return [{"run_id": "%s:%s" % (r["fault"], r["seed"]),
             "manifest": {"hardware": r.get("hardware", "unknown"),
                          "fault": r["fault"], "seed": r["seed"]},
             "bundle": {"synthetic": r.get("synthetic", True)}}
            for r in rows]


def pooling_diagnostics(rows, scalar="bytes"):
    """Ticket-19 borrow consult over the eval's fault contexts.

    Multi-context (J>=2 faults with cells): tau/PI/ESS numbers from measured
    harness scalars + MAP mixture + gate decision; the pooled estimate is
    trusted only when the consult borrows, else raw unpooled means with the
    unresolvable reason. Single-context: the unresolvable reason instead of
    numbers (no heterogeneity tail exists at J<2).
    """
    faults = sorted({r["fault"] for r in rows})
    j = len(faults)
    if j < 2:
        return {"scalar": scalar, "j": j, "faults": faults,
                "reason": "heterogeneity unresolvable at J=%d: single context, "
                "nothing to borrow across" % j}
    obs = _pool_cells(rows, scalar)
    means, variances = {}, {}
    for f, vals in obs.items():
        means[f] = statistics.fmean(vals)
        variances[f] = (statistics.variance(vals) / len(vals)
                        if len(vals) >= 2 and statistics.variance(vals) > 0 else 0.0)
    records = _ingest_records(rows)
    pcells = _pool.cells_from_records(records)
    # ponytail: ESS cap + action threshold deliberately unset — no decision
    # threshold D* exists at eval-reporting time. Box-p + conflict +
    # provenance still gate here; pooled estimates stay untrusted until D*
    # arrives with the refit path. Explicit Nones, not accidental defaults.
    rep = _pool.pooled_or_unpooled(means, variances, cells=pcells,
                                   ess_cap=None, threshold=None)
    try:
        pi = _pool.prediction_interval(means, variances, kind="hts")
        pi = {"lo": pi["lo"], "hi": pi["hi"], "mu": pi["mu"],
              "tau2": pi["tau2"], "level": pi["level"], "kind": pi["kind"]}
    except ValueError as exc:
        pi = {"error": str(exc)}
    measured = sum(1 for c in pcells.values()
                   if isinstance(c, dict) and c.get("measured", False)
                   and not c.get("synthetic", True))
    return {"scalar": scalar, "j": j, "faults": faults,
            "cells": {f: {"n": len(obs[f]), "mean": means[f], "var": variances[f]}
                      for f in faults},
            "records": records,
            "provenance": {"measured": measured, "total": len(records)},
            "tau2": rep["gate"]["tau2"], "ess": rep["gate"]["ess"],
            "mu": rep["gate"]["mu"], "pi": pi, "map": rep["map"],
            "gate": {"borrow": rep["gate"]["borrow"],
                     "reason": rep["gate"]["reason"]},
            "trusted": rep["trusted"], "estimate": rep["estimate"],
            "reason": rep["reason"]}


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
                         "hardware": case.get("hardware", "unknown"),
                         "synthetic": case.get("synthetic", True),
                         "incident_id": case["incident_id"],
                         "ledger": case["ledger_path"]})
            if case["probabilities"]:
                probs.append([case["probabilities"][s] for s in _diag.STAGES])
                labels.append(_diag.STAGES.index(want))
    n = len(rows)
    cal = _conf.reliability(probs, labels) if probs else {"ece": None, "brier": None}
    pooling = pooling_diagnostics(rows)
    rep = {"faults": list(faults), "seeds": list(seeds), "n": n,
           "top1": sum(r["hit1"] for r in rows), "top3": sum(r["hit3"] for r in rows),
           "verified": sum(r["verified"] for r in rows),
           "mean_measurements": sum(r["measurements"] for r in rows) / n if n else 0.0,
           "mean_wall_s": round(sum(r["wall_s"] for r in rows) / n, 2) if n else 0.0,
           "mean_bytes": int(sum(r["bytes"] for r in rows) / n) if n else 0,
           "ece": cal.get("ece"), "brier": cal.get("brier"),
           "pooling": pooling,
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
    if pooling.get("j", 0) >= 2 and "tau2" in pooling:
        pi = pooling.get("pi", {})
        pi_txt = "[%s, %s]" % (pi.get("lo"), pi.get("hi")) if "error" not in pi \
            else "unavailable (%s)" % pi.get("error")
        md += ["",
               "pooling (%s, J=%d, trusted=%s): tau2=%.4g ESS=%.3f PI=%s "
               "MAP w=%s (H=%s); %s" % (
                   pooling.get("scalar"), pooling.get("j"),
                   pooling.get("trusted"), pooling.get("tau2"),
                   pooling.get("ess"), pi_txt,
                   pooling.get("map", {}).get("weight"),
                   pooling.get("map", {}).get("conflict"),
                   pooling.get("reason"))]
    else:
        md += ["", "pooling: %s" % pooling.get("reason")]
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
