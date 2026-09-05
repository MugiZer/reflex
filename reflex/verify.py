"""Ticket 11: controlled interventions, replay, and first divergence.

Each intervention is a knob mutation on FaultProfile + a real regenerate
rerun; the end-to-end delta is measured from the rerun, never copied from
the prediction. Predictions go through record_experiment BEFORE execution,
measured values through set_measured AFTER; VERIFIED is reachable only via
that executed-experiment path (the ledger enforces it).
"""
from __future__ import annotations

import math
from dataclasses import asdict, replace

from .fakegpu import TIMING_MODEL_VERSION, FaultProfile, PRESETS, generate
from .ledger import Evidence, EvidenceLevel, Experiment

PROVENANCE = "verify"
STAGES = ("cpu_launch", "gpu_kernel", "transfer", "sync_edge", "l1")
_EPS = 1e-9  # ponytail: absolute floor; faults move p99 by ~0.1ms so any dust below this is "no signal"

# ponytail: four flat knob resets, not a policy engine; add rules only when a
# fault needs more than zeroing its knob(s) back to the healthy default.
_MUTATIONS = {
    "isolate_submit": {"cpu_starve_us": 0.0},
    "relax_batching": {"batch_delay_us": 0.0, "contention_streams": 1, "overlap_frac": 0.8},
    "remove_competing": {"contention_streams": 1, "overlap_frac": 0.8},
    "revert_kernel_config": {"kernel_slowdown_x": 1.0},
}
INTERVENTIONS = tuple(_MUTATIONS)


# ponytail: flat cause->(interventions, expected field directions); grow from
# verified incidents, not speculation. Causes without an entry (transport,
# scheduler today) have NO discriminating test: only a mapped intervention
# observing its predicted directional effect may VERIFY that hypothesis.
CAUSE_TESTS = {
    "cpu": (("isolate_submit", {"cpu_gap": "down"}),),
    "gpu": (("revert_kernel_config", {"dur": "down"}),),
    "preprocess": (("relax_batching", {"qdepth": "down"}),),
    "queue": (("remove_competing", {"streams": "down"}),
              ("relax_batching", {"qdepth": "down"})),
}


def _means(bundle: dict) -> dict:
    """Bundle means for directional checks (local: corpus.signature is
    label-quarantined and must never be imported by reflex/ modules)."""
    starts = [c["start_ns"] for c in bundle["cpu_launch"]]
    gaps = [j - i for i, j in zip(starts, starts[1:])]
    n_cpu = max(1, len(bundle["cpu_launch"]))
    n_gpu = max(1, len(bundle["gpu_kernel"]))
    n_l1 = max(1, len(bundle["l1"]))
    return {
        "cpu_gap": sum(gaps) / max(1, len(gaps)),
        "cpu_dur": sum(c["end_ns"] - c["start_ns"] for c in bundle["cpu_launch"]) / n_cpu,
        "dur": sum(g["dur_ns"] for g in bundle["gpu_kernel"]) / n_gpu,
        "qdepth": sum(r["queue_depth"] for r in bundle["l1"]) / n_l1,
        "streams": float(max([r["active_streams"] for r in bundle["l1"]] or [0])),
    }


def _effects_hold(faulty: dict, fixed: dict, expected: dict) -> dict:
    """Per-metric directional check on fixed-vs-faulty means (strict)."""
    before, after = _means(faulty), _means(fixed)
    got = {}
    for metric, direction in expected.items():
        b, a = before[metric], after[metric]
        got[metric] = {"before": b, "after": a,
                       "hold": (a < b) if direction == "down" else (a > b)}
    return got


def _resolve(profile: FaultProfile | str) -> tuple[str, FaultProfile]:
    if isinstance(profile, str):
        return profile, PRESETS[profile]
    return "custom", profile


def apply_intervention(intervention: str, profile: FaultProfile | str) -> FaultProfile:
    """Mutated profile for a rerun; raises ValueError on unknown names."""
    try:
        mut = _MUTATIONS[intervention]
    except KeyError:
        raise ValueError(f"unknown intervention {intervention!r}") from None
    return replace(_resolve(profile)[1], **mut)


def completion_p99(bundle: dict) -> float:
    """p99 over per-request completion latency (gpu_end - bundle start), ms."""
    t0 = min(c["start_ns"] for c in bundle["cpu_launch"])
    lat = sorted((g["end_ns"] - t0) / 1e6 for g in bundle["gpu_kernel"])
    if not lat:
        raise ValueError("empty bundle: no kernels to measure")
    return lat[math.ceil(0.99 * len(lat)) - 1]


def capture_context(seed: int, profile: FaultProfile | str, n_kernels: int, bundle: dict) -> dict:
    """Replay input: seed + knobs + shape + output IDs sufficient to reproduce."""
    name, prof = _resolve(profile)
    return {"seed": seed, "n_kernels": n_kernels,
            "profile": name if isinstance(profile, str) else {"custom": asdict(prof)},
            "correlation_ids": [c["correlation_id"] for c in bundle["cpu_launch"]],
            "timing_model_version": bundle.get("timing_model_version", TIMING_MODEL_VERSION)}


def replay_bundle(ctx: dict) -> dict:
    """Regenerate from stored context; ID mismatch means non-reproducible."""
    prof = ctx["profile"]
    profile = prof if isinstance(prof, str) else FaultProfile(**prof["custom"])
    bundle = generate(ctx["seed"], profile, ctx["n_kernels"])
    got = [c["correlation_id"] for c in bundle["cpu_launch"]]
    if got != ctx["correlation_ids"] or \
            bundle.get("timing_model_version") != ctx["timing_model_version"]:
        raise ValueError("replay diverged: stored IDs/context do not reproduce")
    return bundle


def first_divergence(faulty: dict, healthy: dict) -> dict | None:
    """Earliest (stage, event) where the faulty run differs from healthy."""
    # Absolute clocks are detection's job: a pure global time shift with no
    # structural change must NOT count as a localizable divergence.
    _POSITION_KEYS = ("start_ns", "end_ns", "ts_ns")
    for stage in STAGES:
        a, b = faulty.get(stage, []), healthy.get(stage, [])
        if len(a) != len(b):
            return {"index": min(len(a), len(b)), "correlation_id": None,
                    "stage": stage, "fields": ["length"]}
        for i, (ra, rb) in enumerate(zip(a, b)):
            fields = sorted(k for k in set(ra) | set(rb)
                            if k not in _POSITION_KEYS and ra.get(k) != rb.get(k))
            if fields:
                return {"index": i,
                        "correlation_id": ra.get("correlation_id") or rb.get("correlation_id"),
                        "stage": stage, "fields": fields}
    return None


def run_intervention(ledger, hypothesis_id: str, seed: int, faulty_profile: FaultProfile | str,
                     intervention: str, n_kernels: int = 8,
                     correlation_id: str = "verify",
                     expected_effects: dict | None = None) -> dict:
    """Full experiment lifecycle; caller must pass an INFERRED hypothesis.

    VERIFIED = rerun measurably improves end-to-end (measured > 0) and
    recovers >= half the predicted gap. Anything else (neutral, negative,
    execution failure) stays TESTED with the outcome recorded.
    expected_effects maps bundle metric -> "down"/"up" that the fix must
    observably move (semantic proof the intervention tested THIS cause);
    when given, every direction must hold or promotion stops at TESTED.
    """
    if n_kernels < 1:
        raise ValueError("n_kernels must be >= 1")
    name, faulty = _resolve(faulty_profile)
    faulty_p99 = completion_p99(generate(seed, faulty, n_kernels))
    healthy_p99 = completion_p99(generate(seed, FaultProfile(), n_kernels))
    predicted = faulty_p99 - healthy_p99
    exp = ledger.record_experiment(Experiment(
        hypothesis_id=hypothesis_id, correlation_id=correlation_id,
        provenance=PROVENANCE, intervention=intervention, predicted_delta_ms=predicted))
    try:
        fixed = apply_intervention(intervention, faulty)
        fixed_bundle = generate(seed, fixed, n_kernels)
        fixed_p99 = completion_p99(fixed_bundle)
        measured = faulty_p99 - fixed_p99
    except Exception as exc:
        err = f"{type(exc).__name__}: {exc}"
        ledger.append_evidence(Evidence(
            correlation_id=correlation_id, provenance=PROVENANCE, kind="experiment_failure",
            payload={"experiment_id": exp.experiment_id, "intervention": intervention, "error": err}))
        hypo = ledger.transition(hypothesis_id, EvidenceLevel.TESTED, exp.experiment_id)
        return {"ok": False, "experiment_id": exp.experiment_id, "intervention": intervention,
                "predicted_ms": predicted, "measured_ms": None, "recovery": 0.0,
                "status": hypo.status.value, "error": err}
    ledger.set_measured(exp.experiment_id, measured)
    recovery = measured / predicted if abs(predicted) > _EPS else 0.0
    effects, effects_ok = {}, True
    if expected_effects:
        effects = _effects_hold(generate(seed, faulty, n_kernels),
                                fixed_bundle, expected_effects)
        effects_ok = all(v["hold"] for v in effects.values())
    ledger.append_evidence(Evidence(
        correlation_id=correlation_id, provenance=PROVENANCE, kind="intervention",
        payload={"experiment_id": exp.experiment_id, "intervention": intervention,
                 "faulty_profile": name, "predicted_ms": predicted, "measured_ms": measured,
                 "recovery": recovery,
                 "context": capture_context(seed, fixed, n_kernels, fixed_bundle)}))
    status = ledger.transition(hypothesis_id, EvidenceLevel.TESTED, exp.experiment_id).status
    if measured > 0 and recovery >= 0.5 and effects_ok:
        status = ledger.transition(hypothesis_id, EvidenceLevel.VERIFIED, exp.experiment_id).status
    return {"ok": True, "experiment_id": exp.experiment_id, "intervention": intervention,
            "predicted_ms": predicted, "measured_ms": measured, "recovery": recovery,
            "effects_ok": effects_ok, "effects": effects,
            "status": status.value, "faulty_p99_ms": faulty_p99,
            "fixed_p99_ms": fixed_p99, "healthy_p99_ms": healthy_p99}
