"""Ticket 10: active measurement selection + investigation control.

One online selector (EIG per effective incremental cost) over six real
measurement actions, each reading real bundle fields with a discrete outcome
space; costs come from the runtime observer calibration (ticket 03), level
budgets mirror the deep ladder (ticket 09). Noise reliability, same-source
redundancy, and shared-setup bundle corrections live inside this one selector.
Control is a deterministic state machine over the canonical ledger
(propose->measure->update->verify-or-abstain), never an LLM call.

EIG likelihoods are empirical outcome counts per hypothesis (Laplace +1
smoothing disclosed below); no invented likelihoods anywhere.
"""
from __future__ import annotations

import json
import math

from . import confidence as _conf
from . import diagnose as _diag
from .ledger import UNKNOWN, Evidence, EvidenceLevel

PROVENANCE = "select"

ACTIONS = ("timeline", "scheduler_trace", "kernel_timeline",
           "counters", "tensor_analysis", "deep_profile")
# ponytail: fixed 6-action catalog mirroring host->device->deep escalation;
# add actions only when a fault is invisible to all six outcome spaces.
ACTION_VOICE = {"timeline": "matched", "scheduler_trace": "structural",
                "kernel_timeline": "xcorr", "counters": "gls",
                "tensor_analysis": "enet", "deep_profile": "perm"}
SOURCES = {"timeline": "cpu_launch", "scheduler_trace": "sync_edge",
           "kernel_timeline": "gpu_kernel", "counters": "l1",
           "tensor_analysis": "l3_instr", "deep_profile": "l3_pc"}
# Underlying measured signals per action (conceptual names, not bundle keys):
# counters and tensor_analysis both read tensor_active_pct, so the second
# read is redundant even though the source records differ.
FIELDS = {
    "timeline": frozenset(("cpu_gap",)),
    "scheduler_trace": frozenset(("blocked_ns", "serialized")),
    "kernel_timeline": frozenset(("dur_ns",)),
    "counters": frozenset(("sm_util_pct", "mem_bw_util_pct", "tensor_active_pct")),
    "tensor_analysis": frozenset(("tensor_active_pct",)),
    "deep_profile": frozenset(("stall_hist",)),
}
GROUPS = {"host": ("timeline", "scheduler_trace"),
          "device": ("kernel_timeline", "counters"),
          "deep": ("tensor_analysis", "deep_profile")}
GROUP_OF = {a: g for g, ms in GROUPS.items() for a in ms}
PERMISSIONS = {"timeline": "observe:host", "scheduler_trace": "observe:host",
               "kernel_timeline": "observe:device", "counters": "observe:device",
               "tensor_analysis": "observe:deep", "deep_profile": "observe:deep"}
ALL_PERMS = tuple(sorted(set(PERMISSIONS.values())))
# ponytail: deep reads need a localized suspect first (ladder order); widen
# only when a fault localizes without a kernel timeline.
PREREQS = {"deep_profile": ("kernel_timeline",),
           "tensor_analysis": ("counters",),
           "timeline": (), "scheduler_trace": (),
           "kernel_timeline": (), "counters": ()}
# ponytail: fixed commit bar, not fit-derived; fit from incident economics
# when a measured cost model justifies committing sooner/later.
COMMIT_P, COMMIT_MARGIN = 0.85, 0.10
_COST_FLOOR = 1e-6  # ponytail: numerical floor only; faults move costs ~ms.
# ponytail: judged open-world bar; fit from incident economics when abstention
# rates are measurable. Above it, Bayesian EIG is untrusted by design.
_UNKNOWN_ABSTAIN = 0.5
_FAMILY_CAUSE = {"cpu_starvation": "cpu", "launch_overhead": "scheduler",
                 "bw_pressure": "gpu", "stalls": "gpu",
                 "sync_serialization": "scheduler", "transfer_heavy": "transport",
                 "batching_delay": "preprocess", "queue_contention": "queue",
                 "competing_workload": "queue", "kernel_regression": "gpu",
                 "preprocessing_interference": "preprocess"}


def _mean(xs) -> float:
    xs = list(xs)
    return sum(xs) / len(xs) if xs else 0.0


# Outcome thresholds (µs, %, samples): judged separations on fake evidence;
# refit from silicon distributions when real profiler data exists.
_HOST_GAP_HOT_US, _SCHED_BLOCKED_US, _KERNEL_SLOW_US = 20.0, 10.0, 130.0
_BW_HIGH_PCT, _SM_LOW_PCT, _TEN_LOW_PCT, _STALL_HOT_SAMPLES = 50.0, 65.0, 45.0, 100


def _o_timeline(b: dict) -> str:
    gaps = [(b["cpu_launch"][i + 1]["start_ns"] - b["cpu_launch"][i]["end_ns"]) / 1e3
            for i in range(len(b["cpu_launch"]) - 1)]
    return "host_hot" if _mean(gaps) > _HOST_GAP_HOT_US else "host_ok"


def _o_sched(b: dict) -> str:
    blk = _mean(s["blocked_ns"] for s in b["sync_edge"]) / 1e3
    if blk > _SCHED_BLOCKED_US or any(s.get("serialized") for s in b["sync_edge"]):
        return "sched_hot"
    return "sched_ok"


def _o_kernel(b: dict) -> str:
    return "kernel_slow" if _mean(g["dur_ns"] for g in b["gpu_kernel"]) / 1e3 > _KERNEL_SLOW_US \
        else "kernel_ok"


def _o_counters(b: dict) -> str:
    sm = _mean(r["sm_util_pct"] for r in b["l1"])
    bw = _mean(r["mem_bw_util_pct"] for r in b["l1"])
    ten = _mean(g["tensor_active_pct"] for g in b["gpu_kernel"])
    return "pressured" if (bw > _BW_HIGH_PCT or sm < _SM_LOW_PCT or ten < _TEN_LOW_PCT) else "ok"


def _o_tensor(b: dict) -> str:
    return "degraded" if _mean(g["tensor_active_pct"]
                               for g in b["gpu_kernel"]) < _TEN_LOW_PCT else "ok"


def _o_deep(b: dict) -> str:
    tot = sum(r["stall_hist"]["long_scoreboard"] for r in b["l3_pc"])
    return "stall_hot" if tot > _STALL_HOT_SAMPLES else "stall_ok"


OUTCOMES: dict[str, tuple] = {
    "timeline": (("host_hot", "host_ok"), _o_timeline),
    "scheduler_trace": (("sched_hot", "sched_ok"), _o_sched),
    "kernel_timeline": (("kernel_slow", "kernel_ok"), _o_kernel),
    "counters": (("pressured", "ok"), _o_counters),
    "tensor_analysis": (("degraded", "ok"), _o_tensor),
    "deep_profile": (("stall_hot", "stall_ok"), _o_deep),
}


def outcome_of(action: str, bundle: dict) -> str:
    """Discrete outcome of one measurement on a real bundle."""
    try:
        labels, fn = OUTCOMES[action]
    except KeyError:
        raise ValueError(f"unknown measurement {action!r}") from None
    out = fn(bundle)
    assert out in labels, (action, out)
    return out


def fit_outcomes(bundles_by_cause: dict[str, list[dict]]) -> dict:
    """Empirical outcome counts per (action, cause). Likelihoods stay
    count-based (Laplace +1 smoothing applied transparently at read time)."""
    causes = sorted(bundles_by_cause)
    if not causes or any(not v for v in bundles_by_cause.values()):
        raise ValueError("need at least one bundle per cause")
    counts = {a: {c: {o: 0 for o in OUTCOMES[a][0]}
                  for c in causes} for a in ACTIONS}
    for c in causes:
        for b in bundles_by_cause[c]:
            for a in ACTIONS:
                counts[a][c][outcome_of(a, b)] += 1
    n = sum(len(v) for v in bundles_by_cause.values())
    return {"counts": counts, "causes": causes, "n": n, "trusted": True,
            "smoothing": "laplace+1"}


def invalidate(models: dict) -> dict:
    out = dict(models)
    out["trusted"] = False
    return out


def _has_models(models) -> bool:
    return isinstance(models, dict) and bool(models.get("counts")) \
        and models.get("trusted") is not False


def likelihood(models: dict, action: str, cause: str) -> dict:
    """P(outcome | cause) from empirical counts with disclosed Laplace +1."""
    labels = OUTCOMES[action][0]
    row = models["counts"][action].get(cause)
    if row is None:  # unmodeled cause: uniform, contributes no information
        return {o: 1.0 / len(labels) for o in labels}
    tot = sum(row.values())
    return {o: (row[o] + 1.0) / (tot + len(labels)) for o in labels}


def _belief_dist(belief: dict, causes: list[str]) -> dict:
    """Fold UNKNOWN mass uniformly; renormalize. Deterministic."""
    mass = {c: 0.0 for c in causes}
    unk = float(belief.get(UNKNOWN, 0.0))
    for c in causes:
        mass[c] += float(belief.get(c, 0.0))
    if unk:
        for c in causes:
            mass[c] += unk / len(causes)
    tot = sum(mass.values()) or 1.0
    return {c: v / tot for c, v in mass.items()}


def _entropy(p: dict) -> float:
    return -sum(v * math.log(v + 1e-300, 2) for v in p.values() if v > 0)


def eig(action: str, belief: dict, models: dict) -> float:
    """Expected information gain (bits) from real outcome-model likelihoods."""
    causes = list(models["causes"])
    prior = _belief_dist(belief, causes)
    labels = OUTCOMES[action][0]
    like = {c: likelihood(models, action, c) for c in causes}
    p_o = {o: sum(prior[c] * like[c][o] for c in causes) for o in labels}
    post_h = 0.0
    for o in labels:
        if p_o[o] <= 0:
            continue
        post = {c: prior[c] * like[c][o] / p_o[o] for c in causes}
        post_h += p_o[o] * _entropy(post)
    return max(0.0, _entropy(prior) - post_h)


def reliability(models: dict, action: str) -> float:
    """Noise weight from data: mean over causes of max P(o|cause). Flat
    (noisy) likelihoods score near 1/K; sharp ones near 1."""
    causes = list(models["causes"])
    return float(sum(max(likelihood(models, action, c).values())
                     for c in causes) / len(causes))


def redundancy(action: str, taken) -> float:
    """Exact re-reads score 0 (outcome already known); distinct actions
    sharing an underlying signal are halved per overlapping taken action."""
    taken = list(taken)
    if action in taken:
        return 0.0
    k = sum(1 for t in taken if t in FIELDS and FIELDS[t] & FIELDS[action])
    return 0.5 ** k  # ponytail: fixed halving per signal overlap; fit a
    # joint outcome model when correlated distinct actions need exact credit.


def build_costs(report: dict, action_collector: dict,
                 setup_collector: dict) -> dict:
    """Standalone/incremental ms from the runtime paired calibration
    (d_mean_ms at each collector's best rate); setup billed once per group."""
    def _at(coll: str) -> float:
        rep = report[coll]
        return max(float(rep["deltas"][rep["best_rate"]]["d_mean_ms"]), _COST_FLOOR)
    incremental = {a: _at(action_collector[a]) for a in ACTIONS}
    setup = {g: _at(c) for g, c in setup_collector.items()}
    return {"incremental": incremental, "setup": setup,
            "group": dict(GROUP_OF), "floor_ms": _COST_FLOOR}


def effective_cost(costs: dict, action: str, taken) -> float:
    """Incremental price: shared setup is paid only when no taken action is
    already in the group (bundled, not per-signal standalone)."""
    taken = list(taken)
    g = costs["group"][action]
    paid = any(costs["group"].get(t) == g for t in taken)
    return max(costs["incremental"][action] +
               (0.0 if paid else costs["setup"][g]), _COST_FLOOR)


def _prereq_ok(action: str, taken) -> tuple[bool, str]:
    missing = [p for p in PREREQS[action] if p not in taken]
    if missing:
        return False, "prerequisite not measured: %s" % ",".join(missing)
    return True, ""


def _rank_key(r: dict) -> tuple:
    """One ranking for selector rows everywhere (select + fallback + run):
    score desc, cost asc, name. A single site so the two can never diverge
    into catalog-order execution again."""
    return (-r["score"], r["cost_ms"], r["action"])


def _score_row(action: str, belief: dict, models: dict, costs: dict,
               taken) -> dict:
    ok, why = _prereq_ok(action, taken)
    e = eig(action, belief, models) if ok else 0.0
    rel = reliability(models, action)
    red = redundancy(action, taken)
    c = effective_cost(costs, action, taken)
    return {"action": action, "eig": e, "reliability": rel,
            "redundancy": red, "cost_ms": c,
            "score": (e * rel * red / c) if ok else 0.0,
            "admissible": ok, "reason": why}


def select(belief: dict, models: dict | None, costs: dict, taken=(),
           *, table: dict | None = None, q: float = 0.0) -> dict:
    """ONE selector. EIG-per-effective-cost with reliability/redundancy when
    outcome models exist and are trusted; transparent cost-aware index
    fallback (confidence value order, reused not duplicated) otherwise."""
    taken = tuple(taken)
    unk = float((belief or {}).get(UNKNOWN, 0.0) or 0.0)
    if unk > _UNKNOWN_ABSTAIN:
        return _index_fallback(costs, taken, table, q,
                               "open-world mass %.2f exceeds bar: EIG untrusted, exploratory index" % unk)
    if not _has_models(models):
        return _index_fallback(costs, taken, table, q,
                               "cold-start: no outcome models, index fallback")
    rows = [_score_row(a, belief, models, costs, taken) for a in ACTIONS]
    open_rows = [r for r in rows if r["admissible"]]
    scored = sorted(open_rows, key=_rank_key)
    if not scored:
        return {"mode": "eig", "winner": None, "rows": rows,
                "reason": "no admissible measurement (prerequisites unmet)",
                "why": {}}
    best = scored[0]
    alts = [{"action": r["action"], "score": r["score"], "eig": r["eig"],
             "cost_ms": r["cost_ms"],
             "margin": best["score"] - r["score"]} for r in scored[1:]]
    return {"mode": "eig", "winner": best["action"], "rows": rows,
            "reason": "max EIG-per-effective-cost",
            "why": {"action": best["action"], "eig": best["eig"],
                    "reliability": best["reliability"],
                    "redundancy": best["redundancy"],
                    "cost_ms": best["cost_ms"], "score": best["score"],
                    "alternatives_beaten": alts}}


def _index_fallback(costs: dict, taken, table, q: float, reason: str) -> dict:
    untaken = [a for a in ACTIONS if a not in taken and _prereq_ok(a, taken)[0]]
    if not untaken:
        return {"mode": "index", "winner": None, "rows": [], "reason": reason,
                "why": {}}
    if table is None:  # cheapest admissible first; cost-aware, no precision invented
        rows = [{"action": a, "eig": 0.0, "reliability": 0.0, "redundancy": 1.0,
                 "cost_ms": effective_cost(costs, a, taken),
                 "score": -effective_cost(costs, a, taken),
                 "admissible": True, "reason": ""} for a in untaken]
        rows.sort(key=lambda r: (r["cost_ms"], r["action"]))
        best, alts = rows[0], rows[1:]
    else:  # reuse confidence value order over mapped voices (no duplicate formula)
        taken_v = [ACTION_VOICE[a] for a in taken if a in ACTION_VOICE]
        values = _conf.measure_values(table, q, taken_v)
        cand = {ACTION_VOICE[a]: a for a in untaken}
        sub = {v: values[v] for v in cand if v in values}
        best_v, best_val = _conf.nominate(sub)
        winner = cand[best_v]
        rows, alts = [], []
        for a in untaken:
            v = ACTION_VOICE[a]
            rows.append({"action": a, "eig": 0.0, "reliability": 0.0,
                         "redundancy": redundancy(a, taken),
                         "cost_ms": effective_cost(costs, a, taken),
                         "score": float(sub.get(v, float("-inf"))),
                         "admissible": True, "reason": ""})
        rows.sort(key=_rank_key)
        best = next(r for r in rows if r["action"] == winner)
        alts = [r for r in rows if r["action"] != winner]
    return {"mode": "index", "winner": best["action"], "rows": rows,
            "reason": reason + "; picked '%s' by cost-aware index" % best["action"],
            "why": {"action": best["action"], "index_score": best["score"],
                    "cost_ms": best["cost_ms"],
                    "alternatives_beaten": [
                        {"action": r["action"], "score": r["score"],
                         "margin": best["score"] - r["score"]} for r in alts]}}


def update_belief(belief: dict, models: dict, action: str, outcome: str) -> dict:
    """Bayes posterior with the empirical likelihoods (single-counted; the
    selector never re-proposes a taken action so repeats cannot double-count)."""
    causes = list(models["causes"])
    unk = float((belief or {}).get(UNKNOWN, 0.0) or 0.0)
    prior = _belief_dist({c: float(belief.get(c, 0.0) or 0.0) for c in causes}, causes)
    post = {c: prior[c] * likelihood(models, action, c)[outcome] for c in causes}
    tot = sum(post.values()) or 1.0
    out = {c: v / tot * (1.0 - unk) for c, v in post.items()}
    out[UNKNOWN] = unk  # open-world mass is carried, never normalized away
    return out


class ToolRegistry:
    """Guarded measurement tools: admissibility + permissions + budget.
    Unknown tools, missing permissions, unmet prerequisites, and over-budget
    proposals are rejected with reasons; nothing executes on rejection."""

    def __init__(self, costs: dict, grants=ALL_PERMS) -> None:
        self.costs, self.grants = costs, set(grants)

    def check(self, name: str, taken, remaining_ms: float) -> tuple[bool, str]:
        if name not in ACTIONS:
            return False, "unknown tool %r" % (name,)
        ok, why = _prereq_ok(name, taken)
        if not ok:
            return False, why
        if PERMISSIONS[name] not in self.grants:
            return False, "permission denied: '%s' needs %s" % (name, PERMISSIONS[name])
        c = effective_cost(self.costs, name, taken)
        if c > remaining_ms:
            return False, "over budget: '%s' costs %.3fms, %.3fms remain" % (
                name, c, remaining_ms)
        return True, "admitted: cost %.3fms within %.3fms" % (c, remaining_ms)

    def execute(self, ledger, incident_id: str, name: str, bundle: dict,
                taken, remaining_ms: float, *, dry_run: bool = False,
                correlation_id: str = "select") -> dict:
        """Dry-run plans without touching the ledger; only an admitted
        execution appends OBSERVED evidence."""
        ok, reason = self.check(name, taken, remaining_ms)
        cost = effective_cost(self.costs, name, taken) if ok else 0.0
        if not ok:
            return {"admitted": False, "executed": False, "reason": reason,
                    "outcome": None, "cost_ms": 0.0, "evidence_id": None}
        outcome = outcome_of(name, bundle)
        if dry_run:
            return {"admitted": True, "executed": False, "reason": reason,
                    "outcome": outcome, "cost_ms": cost, "evidence_id": None,
                    "note": "dry-run: planned only, no evidence created"}
        ev = ledger.append_evidence(Evidence(
            correlation_id=correlation_id, provenance=PROVENANCE,
            level=EvidenceLevel.OBSERVED, kind="measurement",
            incident_id=incident_id,
            payload={"action": name, "outcome": outcome,
                     "source": SOURCES[name], "cost_ms": cost,
                     "executed": True}))
        return {"admitted": True, "executed": True, "reason": reason,
                "outcome": outcome, "cost_ms": cost,
                "evidence_id": ev.record_id}


def compile_context(ledger, incident_id: str, max_chars: int = 2000) -> dict:
    """Deterministic bounded case: hypotheses (cause order) + their linked
    evidence IDs + incident evidence (record order), truncated to budget."""
    hyps = sorted((h for h in ledger.hypotheses.values()
                   if h.incident_id == incident_id),
                  key=lambda h: (h.cause, h.hypothesis_id))
    evs = sorted((e for e in ledger.evidence.values()
                  if e.incident_id == incident_id),
                 key=lambda e: e.record_id)
    ev_ids = [e.record_id for e in evs]
    linked = {}
    for h in hyps:
        ids = set()
        for e in evs:
            p = e.payload if isinstance(e.payload, dict) else {}
            if p.get("top") == h.cause or p.get("stage") == h.cause:
                ids.add(e.record_id)
            elif isinstance(p.get("hypotheses"), list) and any(
                    isinstance(x, dict) and x.get("hypothesis_id") == h.hypothesis_id
                    for x in p["hypotheses"]):
                ids.add(e.record_id)
        linked[h.hypothesis_id] = sorted(ids)
    doc = {"incident_id": incident_id,
           "hypotheses": [{"id": h.hypothesis_id, "cause": h.cause,
                            "status": h.status.value,
                            "evidence_ids": linked[h.hypothesis_id]} for h in hyps],
           "evidence_ids": list(ev_ids), "truncated": 0}
    blob = json.dumps(doc, sort_keys=True)
    while len(blob) > max_chars and doc["evidence_ids"]:
        doc["evidence_ids"].pop()
        doc["truncated"] += 1
        blob = json.dumps(doc, sort_keys=True)
    doc["chars"] = len(blob)
    return doc


def run(ledger, incident_id: str, belief: dict, models: dict | None,
        costs: dict, bundle: dict, *, table: dict | None = None,
        q: float = 0.0, budget_ms: float = 50.0,
        grants=ALL_PERMS, max_steps: int = 6) -> dict:
    """Single orchestrator: deterministic passes over canonical ledger state.
    generate (Registry seeds causes + UNKNOWN) -> challenge (provisional mark)
    -> cost-check (guards) -> plan (selector); loop measure->update, then
    verify-or-abstain. Every selection is logged with its why record."""
    reg = ToolRegistry(costs, grants)
    registry = _diag.Registry(ledger, incident_id, PROVENANCE)
    trace = [{"state": "propose", "note": "seed causes + UNKNOWN (provisional)"}]
    for cause in sorted(belief):
        if cause != UNKNOWN:
            registry.propose(cause, [], [], float(belief[cause]))
    registry.propose(UNKNOWN, [], [], 0.0)
    trace.append({"state": "challenge",
                  "note": "all causes provisional until measured; UNKNOWN held"})
    taken: list[str] = []
    spent, cur = 0.0, dict(belief)
    corr = "select:%s" % incident_id[:8]
    steps = 0
    while steps < max_steps:
        sel = select(cur, models, costs, taken, table=table, q=q)
        cands = sorted([r for r in sel["rows"] if r["admissible"]], key=_rank_key)
        pick, rej = None, "no admissible measurement"
        for r in cands:  # cost-check pass: first guard-admitted candidate wins
            ok, reason = reg.check(r["action"], taken, budget_ms - spent)
            if ok:
                pick = r
                break
            rej = reason
        if pick is None:
            trace.append({"state": "verify", "decision": "abstain-and-stop",
                          "reason": rej})
            return _finish(ledger, incident_id, trace, taken, spent, cur,
                           "abstain-and-stop", rej, corr)
        res = reg.execute(ledger, incident_id, pick["action"], bundle, taken,
                          budget_ms - spent, correlation_id=corr)
        assert res["executed"]
        ledger.append_evidence(Evidence(
            correlation_id=corr, provenance=PROVENANCE,
            level=EvidenceLevel.INFERRED, kind="measurement_selection",
            incident_id=incident_id,
            payload={"taken": list(taken), "why": {**sel["why"], "executed_action": pick["action"]},
                     "mode": sel["mode"], "outcome": res["outcome"],
                     "top": max(cur, key=lambda c: (cur[c], c))}))
        trace.append({"state": "measure", "action": pick["action"],
                      "mode": sel["mode"], "why": sel["why"]})
        taken.append(pick["action"])
        spent += res["cost_ms"]
        if _has_models(models):
            cur = update_belief(cur, models, pick["action"], res["outcome"])
        trace.append({"state": "update", "outcome": res["outcome"],
                      "belief": {k: round(v, 4) for k, v in cur.items()}})
        steps += 1
        cands = sorted((c for c in cur if c != UNKNOWN), key=lambda c: (-cur[c], c))
        top = cands[0] if cands else UNKNOWN
        margin = cur[top] - (cur[cands[1]] if len(cands) > 1 else 0.0)
        # UNKNOWN is never a commit candidate: committing to it would certify
        # ignorance as a diagnosis. High-unknown runs abstain via select().
        if _has_models(models) and top != UNKNOWN and cur[top] >= COMMIT_P and margin >= COMMIT_MARGIN:
            trace.append({"state": "verify", "decision": "commit",
                          "reason": "posterior %.3f margin %.3f" % (cur[top], margin)})
            return _finish(ledger, incident_id, trace, taken, spent, cur,
                           "commit", "posterior %.3f margin %.3f" % (
                               cur[top], margin), corr)
    reason = "step budget exhausted with residual ambiguity"
    trace.append({"state": "verify", "decision": "abstain-and-stop", "reason": reason})
    return _finish(ledger, incident_id, trace, taken, spent, cur,
                   "abstain-and-stop", reason, corr)


def _finish(ledger, incident_id, trace, taken, spent, belief, decision,
            reason, corr) -> dict:
    top = sorted(belief, key=lambda c: (-belief[c], c))[0] if belief else UNKNOWN
    ledger.append_evidence(Evidence(
        correlation_id=corr, provenance=PROVENANCE, level=EvidenceLevel.INFERRED,
        kind="investigation_outcome", incident_id=incident_id,
        payload={"decision": decision, "top": top,
                 "belief": {k: float(v) for k, v in belief.items()},
                 "taken": list(taken), "spent_ms": float(spent),
                 "reason": reason, "fixes": []}))
    return {"trace": trace, "taken": list(taken), "spent_ms": float(spent),
            "belief": dict(belief), "top": top, "decision": decision,
            "reason": reason, "fixes": []}


def replay_predicted_vs_realized(models: dict, costs: dict, belief: dict,
                                 bundle: dict, taken=()) -> dict:
    """Per-action predicted EIG vs realized entropy drop on one real bundle."""
    taken = tuple(taken)
    base = _entropy(_belief_dist(belief, list(models["causes"])))
    rows = []
    for a in ACTIONS:
        if a in taken or not _prereq_ok(a, taken)[0]:
            continue
        out = outcome_of(a, bundle)
        gain = base - _entropy(update_belief(belief, models, a, out))
        rows.append({"action": a, "predicted_eig": eig(a, belief, models),
                     "realized_gain": max(0.0, gain), "outcome": out,
                     "cost_ms": effective_cost(costs, a, taken)})
    rows.sort(key=lambda r: (-r["predicted_eig"], r["action"]))
    pred_best = rows[0]["action"] if rows else None
    real_best = max(rows, key=lambda r: (r["realized_gain"], r["action"]))["action"] \
        if rows else None
    return {"rows": rows, "pred_best": pred_best, "real_best": real_best,
            "spearman": _spearman([r["predicted_eig"] for r in rows],
                                  [r["realized_gain"] for r in rows])}


def _spearman(xs: list, ys: list) -> float:
    n = len(xs)
    if n < 2:
        return 1.0 if n == 1 else 0.0

    def ranks(v):
        order = sorted(range(n), key=lambda i: (v[i], i))
        r = [0.0] * n
        for pos, i in enumerate(order):
            r[i] = pos
        return r

    rx, ry = ranks(xs), ranks(ys)
    mx, my = sum(rx) / n, sum(ry) / n
    den = math.sqrt(sum((a - mx) ** 2 for a in rx) *
                    sum((b - my) ** 2 for b in ry))
    if den == 0:
        return 1.0  # constant series: no rank disagreement observable
    return sum((a - mx) * (b - my) for a, b in zip(rx, ry)) / den
