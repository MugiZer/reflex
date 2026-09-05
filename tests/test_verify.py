"""Ticket 11 proofs: real reruns, VERIFIED gate, replay/divergence, failures."""
import math
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from reflex.fakegpu import PRESETS, FaultProfile, generate
from reflex.ledger import (Evidence, EvidenceLevel, Experiment, Hypothesis,
                           Incident, Ledger, LedgerError)
from reflex.verify import (INTERVENTIONS, STAGES, apply_intervention,
                           capture_context, completion_p99, first_divergence,
                           replay_bundle, run_intervention)

N, SEED = 8, 11


def fresh(path: Path, cause: str = "host_starvation"):
    ledger = Ledger(path)
    ledger.open_incident(Incident(provenance="t", title="p99 regressed"))
    hypo = ledger.propose_hypothesis(Hypothesis(
        incident_id=next(iter(ledger.incidents)), provenance="t",
        cause=cause, correlation_id="t"))
    return ledger, hypo


def p99(bundle) -> float:  # independent recomputation, not the module helper
    t0 = min(c["start_ns"] for c in bundle["cpu_launch"])
    lat = sorted((g["end_ns"] - t0) / 1e6 for g in bundle["gpu_kernel"])
    return lat[math.ceil(0.99 * len(lat)) - 1]


def test_starvation_recovery_predicted_vs_measured(tmp_path: Path) -> None:
    ledger, hypo = fresh(tmp_path / "v.jsonl")
    res = run_intervention(ledger, hypo.hypothesis_id, SEED, "cpu_starvation",
                           "isolate_submit", N, correlation_id="starve-1")
    assert res["ok"] and res["status"] == "VERIFIED"
    assert res["predicted_ms"] > 0 and res["measured_ms"] > 0
    # measured comes from a genuine rerun: independent regen gives same numbers
    faulty, fixed = generate(SEED, "cpu_starvation", N), \
        generate(SEED, apply_intervention("isolate_submit", PRESETS["cpu_starvation"]), N)
    assert res["measured_ms"] == pytest.approx(p99(faulty) - p99(fixed))
    assert res["predicted_ms"] == pytest.approx(p99(faulty) - p99(generate(SEED, "healthy", N)))
    assert res["fixed_p99_ms"] == pytest.approx(res["healthy_p99_ms"])  # loss recovered
    exp = ledger.experiments[res["experiment_id"]]
    assert exp.measured_delta_ms == pytest.approx(res["measured_ms"])
    assert ledger.hypotheses[hypo.hypothesis_id].status is EvidenceLevel.VERIFIED


def test_verified_gate_confidence_alone_cannot_promote(tmp_path: Path) -> None:
    ledger, hypo = fresh(tmp_path / "g.jsonl")
    hid = hypo.hypothesis_id
    with pytest.raises(LedgerError):  # confidence alone, no experiment at all
        ledger.transition(hid, EvidenceLevel.VERIFIED)
    exp = ledger.record_experiment(Experiment(
        hypothesis_id=hid, correlation_id="t", provenance="t",
        intervention="isolate_submit", predicted_delta_ms=0.4))
    assert exp.measured_delta_ms is None  # prediction recorded before execution
    ledger.transition(hid, EvidenceLevel.TESTED, exp.experiment_id)
    with pytest.raises(LedgerError):  # tested but not yet executed -> no verify
        ledger.transition(hid, EvidenceLevel.VERIFIED, exp.experiment_id)
    ledger.set_measured(exp.experiment_id, 0.4)
    assert ledger.transition(hid, EvidenceLevel.VERIFIED, exp.experiment_id).status \
        is EvidenceLevel.VERIFIED


@pytest.mark.parametrize("fault,fix,first_idx", [("cpu_starvation", "isolate_submit", 1),
                                          ("kernel_regression", "revert_kernel_config", 0)])
def test_replay_and_first_divergence(tmp_path: Path, fault: str, fix: str, first_idx: int) -> None:
    _ = tmp_path  # ledger-free: replay/divergence act on bundles, fix keeps linters honest
    assert fix in INTERVENTIONS
    faulty, healthy = generate(SEED, fault, N), generate(SEED, "healthy", N)
    ctx = capture_context(SEED, fault, N, faulty)
    assert {"seed", "profile", "n_kernels", "correlation_ids",
            "timing_model_version"} <= set(ctx)
    assert ctx["correlation_ids"] == [c["correlation_id"] for c in faulty["cpu_launch"]]
    assert replay_bundle(ctx) == faulty  # genuine re-derivation from stored context
    div = first_divergence(faulty, healthy)
    # starvation's first structural effect is backlog at kernel 1 (kernel 0 is
    # identical work on a fresh stream); regression changes durations at kernel 0
    assert div and div["index"] == first_idx and div["stage"] in STAGES and div["fields"]
    assert all(f not in ("start_ns", "end_ns", "ts_ns") for f in div["fields"])  # structure, not clocks
    assert first_divergence(healthy, replay_bundle(
        capture_context(SEED, "healthy", N, healthy))) is None
    bad = dict(ctx, seed=SEED + 1)  # non-reproducible setup is a real failure
    with pytest.raises(ValueError):
        replay_bundle(bad)


def test_neutral_and_negative_recorded_not_skipped(tmp_path: Path) -> None:
    ledger, hypo = fresh(tmp_path / "n.jsonl")
    res = run_intervention(ledger, hypo.hypothesis_id, SEED, "stalls",
                           "revert_kernel_config", N, correlation_id="neutral-1")
    assert res["ok"] and res["measured_ms"] == pytest.approx(0.0)
    assert res["status"] == "TESTED"  # neutral: recorded, not promoted, not skipped
    assert ledger.experiments[res["experiment_id"]].measured_delta_ms == pytest.approx(0.0)
    ledger2, hypo2 = fresh(tmp_path / "n2.jsonl")
    neg = run_intervention(ledger2, hypo2.hypothesis_id, SEED, "competing_workload",
                           "remove_competing", N, correlation_id="negative-1")
    assert neg["ok"] and neg["measured_ms"] < 0  # parallelism removed: drain slows
    assert neg["status"] == "TESTED"  # negative benefit never verifies
    assert ledger2.experiments[neg["experiment_id"]].measured_delta_ms < 0


def test_failed_experiment_degrades_to_tested(tmp_path: Path) -> None:
    ledger, hypo = fresh(tmp_path / "f.jsonl")
    res = run_intervention(ledger, hypo.hypothesis_id, SEED, "cpu_starvation",
                           "no_such_knob", N, correlation_id="fail-1")
    assert res["ok"] is False and res["status"] == "TESTED"
    assert res["measured_ms"] is None and "ValueError" in res["error"]
    assert res["experiment_id"] in ledger.experiments  # prediction was recorded first
    fails = [e for e in ledger.evidence.values() if e.kind == "experiment_failure"]
    assert len(fails) == 1 and fails[0].payload["experiment_id"] == res["experiment_id"]
    with pytest.raises(LedgerError):  # failure never verifies
        ledger.transition(hypo.hypothesis_id, EvidenceLevel.VERIFIED, res["experiment_id"])


def test_experiment_ledger_prediction_before_measured(tmp_path: Path) -> None:
    ledger, hypo = fresh(tmp_path / "e.jsonl")
    with pytest.raises(LedgerError):  # measured-at-record time is illegal
        ledger.record_experiment(Experiment(
            hypothesis_id=hypo.hypothesis_id, correlation_id="t", provenance="t",
            intervention="isolate_submit", predicted_delta_ms=0.1, measured_delta_ms=0.1))
    exp = ledger.record_experiment(Experiment(
        hypothesis_id=hypo.hypothesis_id, correlation_id="t", provenance="t",
        intervention="isolate_submit", predicted_delta_ms=0.1))
    assert ledger.experiments[exp.experiment_id].measured_delta_ms is None
    ledger.set_measured(exp.experiment_id, -0.2)  # negatives are storable facts
    assert ledger.experiments[exp.experiment_id].measured_delta_ms == pytest.approx(-0.2)


def test_intervention_table_resets_its_knob() -> None:
    assert set(INTERVENTIONS) == {"isolate_submit", "relax_batching",
                                  "remove_competing", "revert_kernel_config"}
    assert apply_intervention("isolate_submit", PRESETS["cpu_starvation"]).cpu_starve_us == 0.0
    assert apply_intervention("revert_kernel_config",
                              PRESETS["kernel_regression"]).kernel_slowdown_x == 1.0
    fixed = apply_intervention("remove_competing", PRESETS["competing_workload"])
    assert (fixed.contention_streams, fixed.overlap_frac) == (1, 0.8)
    assert isinstance(apply_intervention("relax_batching", FaultProfile(batch_delay_us=5.0)),
                      FaultProfile)
    with pytest.raises(ValueError):
        apply_intervention("bogus", "healthy")



def test_completion_p99_rejects_empty() -> None:
    with pytest.raises(ValueError):
        completion_p99(generate(SEED, "healthy", 0))


def test_verification_needs_semantic_effect(tmp_path: Path) -> None:
    # relax_batching genuinely fixes batching_delay (measured > 0), but kernel
    # durations do not move: demanding dur-down must hold promotion at TESTED.
    ledger, hypo = fresh(tmp_path / "sem.jsonl", cause="preprocess")
    res = run_intervention(ledger, hypo.hypothesis_id, SEED, "batching_delay",
                           "relax_batching", N, correlation_id="sem-1",
                           expected_effects={"dur": "down"})
    assert res["ok"] and res["measured_ms"] > 0  # the fix worked...
    assert res["effects_ok"] is False  # ...but not through the demanded mechanism
    assert res["status"] == "TESTED"  # never promoted on unmet semantics
    assert ledger.hypotheses[hypo.hypothesis_id].status is EvidenceLevel.TESTED


def test_met_effects_still_verify(tmp_path: Path) -> None:
    # Positive control for the semantic gate: starvation + isolate_submit with
    # cpu_gap-down met must reach VERIFIED (gate blocks only unmet semantics).
    ledger, hypo = fresh(tmp_path / "sem2.jsonl", cause="cpu")
    res = run_intervention(ledger, hypo.hypothesis_id, SEED, "cpu_starvation",
                           "isolate_submit", N, correlation_id="sem-2",
                           expected_effects={"cpu_gap": "down"})
    assert res["effects_ok"] is True and res["status"] == "VERIFIED"
