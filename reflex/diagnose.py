"""Ticket 05: context-matched baselines, differential localization, hypothesis registry.

Consumes bundles + ledger records only (never imports the label table or the
generator). Comparator matches on bundle context (timing model, kernel set,
workload shape); mismatched contexts are rejected, never pooled into a global
median. Ranker is Median/MAD on matched per-kernel deltas. All causes stay
INFERRED; this module never proposes an action.
"""
from __future__ import annotations

import math
from collections import defaultdict
from statistics import median

from .ledger import UNKNOWN, Evidence, EvidenceLevel, Hypothesis, Incident

PROVENANCE = "diagnose"
STAGES = ("transport", "preprocess", "queue", "cpu", "scheduler", "gpu",
          "postprocess", "action")
_UNITS = {"queue": "count"}
# ponytail: fixed z floors, not per-channel calibration; calibrate from incident
# volume when a channel's noise floor drifts.
_Z_FLOOR_MS, _Z_FLOOR_COUNT, _Z_CANDIDATE = 0.001, 0.25, 2.0
# ponytail: fixed 5% scale tolerance in the z denominator — few-op MADs often
# collapse near zero and would turn plain jitter into huge z. Refit from
# incident volume when a measured noise floor exists.
_REL_TOL = 0.05


class ContextMismatch(ValueError):
    """Baseline context differs; comparison refused (no global-median fallback)."""


def context_of(bundle: dict) -> dict:
    try:
        kernels = tuple(g["kernel_name"] for g in bundle["gpu_kernel"])
        return {"timing_model_version": bundle["timing_model_version"],
                "kernels": kernels, "n_ops": len(kernels)}
    except (KeyError, TypeError):
        raise ContextMismatch("bundle lacks timing_model_version/gpu_kernel context")


def _check_context(incident: dict, baselines: list[dict]) -> dict:
    want = context_of(incident)
    if not baselines:
        raise ContextMismatch("no baselines: refusing global-median comparison")
    for i, b in enumerate(baselines):
        got = context_of(b)
        if got != want:
            raise ContextMismatch(f"baseline {i} context {got} != incident {want}")
    return want


def _series(bundle: dict) -> tuple[list, dict]:
    n = len(bundle["cpu_launch"])
    cpu, gpu, tx, sy, l1 = (bundle["cpu_launch"], bundle["gpu_kernel"],
                            bundle["transfer"], bundle["sync_edge"], bundle["l1"])
    gap = [(cpu[i + 1]["start_ns"] - cpu[i]["end_ns"]) for i in range(n - 1)] + [0]
    kn = [g["kernel_name"] for g in gpu]
    s = {
        "transport": [t["dur_ns"] / 1e6 for t in tx],
        "preprocess": [(c["end_ns"] - c["start_ns"]) / 1e6 for c in cpu],
        "queue": [float(r["queue_depth"]) for r in l1],
        "cpu": [g / 1e6 for g in gap],
        "scheduler": [(g["launch_gap_ns"] + s_["blocked_ns"]) / 1e6
                      for g, s_ in zip(gpu, sy)],
        "gpu": [g["dur_ns"] / 1e6 for g in gpu],
        # ponytail: zero channels, not proxies; FakeGPU L1/L2 carries no signal
        # for these, so the residual stays in UNKNOWN mass. Map when real
        # collectors emit postprocess/action spans.
        "postprocess": [0.0] * n,
        "action": [0.0] * n,
    }
    return kn, s


def _med(xs: list) -> float:
    return float(median(xs))


def _mad(xs: list, m: float) -> float:
    return float(median(sorted(abs(x - m) for x in xs)))


def compare(incident: dict, baselines: list[dict]) -> dict:
    """Matched differential surfaces per stage. Raises ContextMismatch."""
    ctx = _check_context(incident, baselines)
    pool: dict[tuple, list] = defaultdict(list)
    for b in baselines:
        kn, s = _series(b)
        for stage, vals in s.items():
            for name, v in zip(kn, vals):
                pool[(stage, name)].append(v)
    base = {k: (m := _med(v), _mad(v, m)) for k, v in pool.items()}
    kn, s = _series(incident)
    surfaces = {}
    for stage in STAGES:
        unit = _UNITS.get(stage, "ms")
        floor = _Z_FLOOR_COUNT if stage == "queue" else _Z_FLOOR_MS
        byk: dict[str, list] = defaultdict(list)
        for name, v in zip(kn, s[stage]):
            byk[name].append(v)
        groups, best = {}, None
        for name in sorted(byk):
            vv = byk[name]
            m, d = base[(stage, name)]
            fm = _med(vv)
            scale = _REL_TOL * abs(m) if stage != "queue" else 0.0
            delta, z = fm - m, (fm - m) / (1.4826 * d + floor + scale)
            groups[name] = {"base_med": m, "base_mad": d, "fault_med": fm,
                            "delta": delta, "z": z}
            if best is None or (z, delta) > best:  # sorted names: ties break alphabetically, as in rank()
                best = (z, delta)
        surfaces[stage] = {"unit": unit, "z": best[0], "delta": best[1],
                           "groups": groups, "n_baselines": len(baselines)}
    return {"context": {"timing_model_version": ctx["timing_model_version"],
                        "n_ops": ctx["n_ops"], "kernels": list(ctx["kernels"])},
            "surfaces": surfaces}


def rank(surfaces: dict) -> list[tuple]:
    """Median/MAD matched-delta ranker: z desc, delta desc, stage-name tiebreak
    (same order as the intra-stage winner in compare())."""
    return sorted(((st, s["z"], s["delta"]) for st, s in surfaces.items()),
                  key=lambda t: (-t[1], -t[2], t[0]))


def _span_ms(bundle: dict) -> float:
    s = min(c["start_ns"] for c in bundle["cpu_launch"])
    e = max([g["end_ns"] for g in bundle["gpu_kernel"]] +
            [t["end_ns"] for t in bundle["transfer"]] +
            [x["end_ns"] for x in bundle["sync_edge"]])
    return (e - s) / 1e6


def _op_lat_ms(bundle: dict) -> list[float]:
    return sorted((s["end_ns"] - c["start_ns"]) / 1e6
                  for c, s in zip(bundle["cpu_launch"], bundle["sync_edge"]))


def _p99(xs: list) -> float:
    xs = sorted(xs)
    return xs[max(0, math.ceil(0.99 * len(xs)) - 1)]  # nearest-rank p99


def regression(incident: dict, baselines: list[dict]) -> dict:
    _check_context(incident, baselines)
    inc_span, inc_p99 = _span_ms(incident), _p99(_op_lat_ms(incident))
    b_spans = [_span_ms(b) for b in baselines]
    b_p99s = [_p99(_op_lat_ms(b)) for b in baselines]
    return {"incident_span_ms": inc_span, "baseline_span_med_ms": _med(b_spans),
            "span_delta_ms": inc_span - _med(b_spans),
            "incident_p99_ms": inc_p99, "baseline_p99_med_ms": _med(b_p99s),
            "p99_delta_ms": inc_p99 - _med(b_p99s)}


class Registry:
    """Hypothesis set over one incident: support/contradiction evidence ids,
    suppression with reason, reopen on new evidence. Entries are never deleted."""

    def __init__(self, ledger, incident_id: str, provenance: str = PROVENANCE) -> None:
        self._ledger, self._incident = ledger, incident_id
        self._prov = provenance
        self.entries: dict[str, dict] = {}
        self.unknown_mass = 1.0
        if incident_id not in ledger.incidents:
            raise ValueError(f"unknown incident_id {incident_id!r}")

    def propose(self, cause: str, support: list, contradiction: list,
                score: float) -> dict:
        # ponytail: entries overlay ledger.hypotheses (working state: support ids,
        # suppression, history); ledger stays the canonical record. Derive the
        # view from the ledger once later slices transition hypotheses there.
        h = self._ledger.propose_hypothesis(Hypothesis(
            incident_id=self._incident, provenance=self._prov, cause=cause,
            correlation_id=f"diagnose:{self._incident[:8]}"))
        e = {"hypothesis_id": h.hypothesis_id, "cause": cause,
             "support_ids": list(support), "contradict_ids": list(contradiction),
             "score": float(score), "suppressed": False, "suppress_reason": "",
             "history": ["proposed:%s" % cause]}
        self.entries[h.hypothesis_id] = e
        return e

    def suppress(self, hypothesis_id: str, reason: str) -> dict:
        e = self._get(hypothesis_id)
        if not (reason and reason.strip()):
            raise ValueError("suppression needs a reason")
        if e["suppressed"]:
            raise ValueError(f"{hypothesis_id} already suppressed")
        e["suppressed"], e["suppress_reason"] = True, reason.strip()
        e["history"].append("suppressed:%s" % e["suppress_reason"])
        return e

    def reopen(self, hypothesis_id: str, reason: str, new_support=()) -> dict:
        e = self._get(hypothesis_id)
        if not e["suppressed"]:
            raise ValueError(f"{hypothesis_id} is not suppressed")
        if not (reason and reason.strip()):
            raise ValueError("reopen needs a reason")
        e["suppressed"], e["suppress_reason"] = False, ""
        e["support_ids"].extend(new_support)
        e["history"].append("reopened:%s" % reason.strip())
        return e

    def _get(self, hypothesis_id: str) -> dict:
        try:
            return self.entries[hypothesis_id]
        except KeyError:
            raise ValueError(f"unknown hypothesis_id {hypothesis_id!r}")


def diagnose(incident: dict, baselines: list[dict], ledger,
             provenance: str = PROVENANCE) -> dict:
    """Matched-slice diagnosis. All hypotheses INFERRED; fixes always []."""
    comp = compare(incident, baselines)
    reg = regression(incident, baselines)
    ranking = rank(comp["surfaces"])
    inc = ledger.open_incident(Incident(
        provenance=provenance,
        title="matched slice: %d baselines, span delta %+.2fms" %
              (len(baselines), reg["span_delta_ms"])))
    corr = f"diagnose:{inc.incident_id[:8]}"
    stage_ids = {}
    for stage, s in comp["surfaces"].items():
        stage_ids[stage] = ledger.append_evidence(Evidence(
            correlation_id=corr, provenance=provenance, level=EvidenceLevel.INFERRED,
            kind="stage_delta", incident_id=inc.incident_id,
            payload={"stage": stage, "unit": s["unit"], "z": s["z"],
                     "delta": s["delta"], "groups": s["groups"],
                     "context": comp["context"]})).record_id
    registry = Registry(ledger, inc.incident_id, provenance)
    cands = [(st, z) for st, z, _ in ranking if z > _Z_CANDIDATE]
    against = [stage_ids[st] for st, s in comp["surfaces"].items()
               if abs(s["z"]) <= _Z_CANDIDATE]
    hypos = [registry.propose(st, [stage_ids[st]], against, z) for st, z in cands]
    # ponytail: UNKNOWN mass = 1/(1+candidate-grade evidence), not a fitted
    # prior; sub-threshold noise never spends it down. Refit from incident
    # volume when a measured noise floor exists.
    registry.unknown_mass = 1.0 / (1.0 + sum(max(0.0, s["z"] - _Z_CANDIDATE)
                                             for s in comp["surfaces"].values()))
    hypos.append(registry.propose(UNKNOWN, [], list(stage_ids.values()), 0.0))
    ledger.append_evidence(Evidence(
        correlation_id=corr, provenance=provenance, level=EvidenceLevel.INFERRED,
        kind="hypothesis_set", incident_id=inc.incident_id,
        payload={"hypotheses": [
            {k: e[k] for k in ("hypothesis_id", "cause", "support_ids",
                               "contradict_ids", "score", "suppressed")} for e in hypos],
            "unknown_mass": registry.unknown_mass,
            "ranker": "median-mad-matched-delta-v1", "fixes": []}))
    top, tz, td = ranking[0]
    unit = comp["surfaces"][top]["unit"]
    return {"incident_id": inc.incident_id, "context": comp["context"],
            "n_baselines": len(baselines), "regression": reg,
            "surfaces": comp["surfaces"], "ranking": ranking,
            "hypotheses": list(registry.entries.values()),
            "unknown_mass": registry.unknown_mass, "fixes": [],
            "rationale": "matched %d baselines %s n=%d; top %s z=%.2f delta=%+.4f%s; "
                         "UNKNOWN mass=%.3f; %d INFERRED cause(s), none elevated" % (
                             len(baselines), comp["context"]["timing_model_version"],
                             comp["context"]["n_ops"], top, tz, td, unit,
                             registry.unknown_mass, len(cands)),
            "registry": registry}
