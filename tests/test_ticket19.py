"""Ticket 19 proofs: eval pooling diagnostics on REAL harness runs.

run_eval wires the borrow consult into the harness path: multi-context runs
(>=2 faults) report tau/PI/ESS + MAP + gate decision computed from measured
per-seed evidence bytes, trusting unpooled while the consult refuses; the
provenance behind the consult derives end-to-end from the case artifacts via
cells_from_records (no hand-built flag dicts). Single-context runs report
the unresolvable reason instead of numbers. Subset faults/seeds keep the
added wall time under ~90s.

File name is load-bearing: test_pool.py's hygiene test budgets 60s from
collection-time import, so this file's mandated real-harness wall time must
sort AFTER test_pool (test_ticket19 > test_pool), not as test_eval.py.
"""
import math
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from reflex.eval import run_eval
from reflex.pool import cells_from_records, ready_for_production

T0 = time.time()

WITH_FAULTS = ["cpu_starvation", "kernel_regression", "transfer_heavy"]
WITH_SEEDS = [11, 12]


def test_eval_with_cells_reports_diagnostics(tmp_path):
    rep = run_eval(WITH_FAULTS, WITH_SEEDS, tmp_path / "eval", 8)
    assert rep["n"] == 6
    p = rep["pooling"]
    assert p["j"] == 3 and sorted(p["faults"]) == sorted(WITH_FAULTS)
    for key in ("tau2", "ess", "mu", "pi", "map", "gate", "estimate",
                "trusted", "reason", "cells", "records", "provenance"):
        assert key in p, key  # numbers present where cells exist
    assert math.isfinite(p["tau2"]) and p["tau2"] >= 0.0
    assert math.isfinite(p["ess"]) and 0.0 < p["ess"] <= 3.0
    assert "error" not in p["pi"] and p["pi"]["lo"] < p["pi"]["mu"] < p["pi"]["hi"]
    assert all(math.isfinite(p["map"][k]) for k in ("weight", "conflict", "tau2"))
    assert set(p["cells"]) == set(WITH_FAULTS)
    assert all(c["n"] == 2 and c["var"] > 0.0 for c in p["cells"].values())
    assert p["trusted"] == "unpooled" and p["gate"]["borrow"] is False
    assert "heterogeneity unresolvable" in p["reason"]  # real heterogeneous faults refuse
    assert p["estimate"] == {f: p["cells"][f]["mean"] for f in WITH_FAULTS}
    # provenance derivation end-to-end: wired records -> cells -> refusal
    assert len(p["records"]) == 6
    assert all(r["bundle"]["synthetic"] is True for r in p["records"])
    assert all(r["manifest"]["hardware"] == "unknown" for r in p["records"])
    assert p["provenance"] == {"measured": 0, "total": 6}
    assert ready_for_production(cells_from_records(p["records"])) is False
    assert (tmp_path / "eval" / "eval.json").exists()
    md = (tmp_path / "eval" / "eval.md").read_text(encoding="utf-8")
    assert "pooling" in md and "tau2=" in md
    print("\neval-with-cells tau2 %.4g ess %.2f PI [%.0f, %.0f] trusted=%s" % (
        p["tau2"], p["ess"], p["pi"]["lo"], p["pi"]["hi"], p["trusted"]))


def test_eval_without_cells_reports_reason(tmp_path):
    rep = run_eval(["cpu_starvation"], [11], tmp_path / "eval", 8)
    assert rep["n"] == 1
    p = rep["pooling"]
    assert p["j"] == 1
    assert "heterogeneity unresolvable at J" in p["reason"]
    assert not {"tau2", "pi", "ess", "gate", "estimate", "map"} & set(p)  # reason, not numbers
    md = (tmp_path / "eval" / "eval.md").read_text(encoding="utf-8")
    assert "heterogeneity unresolvable at J" in md
    print("\neval-without-cells reason: %s (added %.1fs)" % (p["reason"], time.time() - T0))
