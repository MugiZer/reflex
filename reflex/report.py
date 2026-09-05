"""Ticket 14: end-to-end investigation runner, /show-me renderer, oracle.

run_case() executes the real pipeline (diagnose -> tournament -> confidence
-> select -> verify -> memory) on FakeGPU bundles and returns a JSON-safe
summary. render_showme() renders one incident from its ledger + summary.
resolve_report() is the independent oracle: every ev: ID must resolve in the
ledger, and VERIFIED/fetch claims must hold. No corpus-label imports anywhere
here (eval owns acceptance); bundles come straight from fakegpu.
"""
from __future__ import annotations

import asyncio
import json
import re
import time
from pathlib import Path

from . import confidence as _conf
from . import diagnose as _diag
from . import fakegpu as _fg
from . import memory as _mem
from . import select as _sel
from . import tournament as _tour
from . import verify as _ver
from .ledger import UNKNOWN, Evidence, EvidenceLevel, Hypothesis, Ledger
from .runtime import calibrate as _calibrate

PROVENANCE = "report"
# ponytail: fixed representative fault per cause for fitting outcome models;
# widen to multi-fault cause sets when EIG stops discriminating on singles.
_CAUSE_FAULT = {"cpu": "cpu_starvation", "scheduler": "launch_overhead",
                "gpu": "kernel_regression", "transport": "transfer_heavy",
                "preprocess": "batching_delay", "queue": "queue_contention"}
_MODEL_CAUSES = tuple(_CAUSE_FAULT)
# ponytail: fixed temperature-fit families/seeds; refit from incident volume later.
_TEMP_FIT = (("cpu_starvation", 501), ("kernel_regression", 502),
             ("transfer_heavy", 503))
# ponytail: fixed 1:1 action/collector + group maps for build_costs; reuse the
# runtime cost model directly once it exposes named collectors.
_A2C = {a: "m_" + a for a in _sel.ACTIONS}
_S2C = {"host": "s_host", "device": "s_device", "deep": "s_deep"}
EV_RE = re.compile(r"\bev:([0-9a-f]{32})\b")


def _fit_temp():
    """Shared temperature over fixed fit families (offline-style, eval side)."""
    causemap = {"cpu_starvation": "cpu", "kernel_regression": "gpu",
                "transfer_heavy": "transport"}
    stages = _diag.STAGES
    zs, ys = [], []
    for fam, seed in _TEMP_FIT:
        b = _fg.generate(seed, fam, 8)
        h = [_fg.generate(seed + 1000 + i, "healthy", 8) for i in range(2)]
        st = _conf.voice_state(b, h)
        order = _conf.fuse_taken(st, _conf.VOICES)
        zs.append(_conf.align(order))
        ys.append(stages.index(causemap[fam]))
    return _conf.fit_temperature(zs, ys)


def run_case(seed: int, profile: str, workdir: str | Path, n_kernels: int = 8,
             store_path: str | Path | None = None) -> dict:
    """Full OBSERVE->DIAGNOSE->TEST->ACT loop on real bundles. Returns a
    JSON-safe summary; ledger at summary['ledger_path']."""
    t0 = time.monotonic()
    workdir = Path(workdir)
    workdir.mkdir(parents=True, exist_ok=True)
    for suffix in (".jsonl", ".json"):  # reruns start clean: one case, one ledger, no cross-run pollution
        p = workdir / f"case_{profile}_{seed}{suffix}"
        if p.exists():
            p.unlink()
    bundle = _fg.generate(seed, profile, n_kernels)
    healthy = _fg.generate(seed, "healthy", n_kernels)
    baselines = [_fg.generate(seed + 1001, "healthy", n_kernels),
                 _fg.generate(seed + 1002, "healthy", n_kernels)]
    ledger = Ledger(str(workdir / f"case_{profile}_{seed}.jsonl"))
    case_ctx = {"seed": seed, "profile": profile, "n_kernels": n_kernels,
                "baselines": [seed + 1001, seed + 1002]}
    ledger.append_evidence(Evidence(
        correlation_id=f"report:{seed}", provenance=PROVENANCE,
        kind="case_context", payload=case_ctx))
    diag = _diag.diagnose(bundle, baselines, ledger)
    iid = diag["incident_id"]
    tour = _tour.tournament(bundle, baselines, ledger)
    state = _conf.voice_state(bundle, baselines)
    temp = _fit_temp()
    cal = _conf.calibrate(state, tuple(_conf.VOICES), temp)
    pset = _conf.plausible_set(cal, state["surfaces"])
    multi = _conf.multi_cause(cal, state["surfaces"])
    probs = cal["probabilities"] if cal["trusted"] else None
    if probs:
        top3 = [s for s, _ in cal["ranking"][:3]]
        belief = {s: probs[s] for s in top3}
    else:  # untrusted: normalized fused scores, marked by trusted=False downstream
        tot = sum(cal["scores"].values()) or 1.0
        top3 = [s for s, _ in cal["ranking"][:3]]
        belief = {s: cal["scores"][s] / tot for s in top3}
    belief[UNKNOWN] = diag["unknown_mass"]
    models = _sel.fit_outcomes(
        {c: [_fg.generate(seed + 2000 + i, _CAUSE_FAULT[c], n_kernels) for i in range(1)]
         for c in _MODEL_CAUSES})
    calrep = asyncio.run(_calibrate(ledger, {**{v: 0.004 for v in _A2C.values()},
                                            **{v: 0.010 for v in _S2C.values()}},
                                   [0.5, 1.0], ticks=8, tick_ms=1.0, seed=seed))
    costs = _sel.build_costs(calrep, _A2C, _S2C)
    run = _sel.run(ledger, iid, belief, models, costs, bundle,
                   budget_ms=100.0, max_steps=3)
    top = run["top"]
    interventions, verified = [], None
    if top in _MODEL_CAUSES:
        hid = ledger.propose_hypothesis(Hypothesis(
            incident_id=iid, provenance=PROVENANCE, cause=top,
            correlation_id=f"report:{seed}")).hypothesis_id
        # Only mapped interventions may verify this cause: each must observe
        # its predicted directional effect, or promotion stops at TESTED.
        # Causes without a map entry have no discriminating test (honest gap).
        for iv, expected in _ver.CAUSE_TESTS.get(top, ()):
            try:
                res = _ver.run_intervention(ledger, hid, seed, profile, iv,
                                            n_kernels, correlation_id=f"report:{seed}",
                                            expected_effects=dict(expected))
            except Exception as exc:  # unexpected failure recorded, loop continues
                res = {"ok": False, "intervention": iv, "measured_ms": None,
                       "error": f"{type(exc).__name__}: {exc}"}
            interventions.append({k: res.get(k) for k in
                                  ("intervention", "predicted_ms", "measured_ms",
                                   "recovery", "status", "error")})
            if res.get("status") == "VERIFIED":
                verified = {"cause": top, "fix": iv,
                            "measured_ms": res.get("measured_ms"),
                            "recovery": res.get("recovery"),
                            "experiment_id": res.get("experiment_id")}
                break
    div = _ver.first_divergence(bundle, healthy)
    nxt, nxt_why = None, ""
    if verified is None:
        nxt_sel = _sel.select(run["belief"], models, costs, tuple(run["taken"]))
        nxt, nxt_why = nxt_sel["winner"], nxt_sel["reason"]
    priors, card = [], None
    store = _mem.MemoryStore(str(store_path)) if store_path else None
    if store is not None:
        view = _mem.describe(bundle, baselines, healthy)
        query = {"text": view["text"], "symptoms": view["symptoms"],
                 "regressed_stage": view["regressed_stage"],
                 "kernels": view["kernels"],
                 "timing_model_version": view["timing_model_version"],
                 "flags": view["flags"]}
        hits = _mem.retrieve(query, store)
        if hits:
            priors = [{"cause": h["cause"], "score": round(h["score"], 3),
                       "verification": h["record"].verification} for h in hits[:1]]
            card = hits[0]["card"]
        rec = _mem.record_from_ledger(ledger, iid, view)
        store.save(rec)
    wall_s = time.monotonic() - t0
    subs = bundle.get("l3_pc") or []  # provenance passthrough: flags read off
    # the ingested bundle artifacts (absent hardware fails closed to unknown,
    # absent stubs fail closed to synthetic) for the ticket-19 borrow consult.
    out = {"ledger_path": str(workdir / f"case_{profile}_{seed}.jsonl"),
            "incident_id": iid, "seed": seed, "profile": profile,
            "hardware": bundle.get("hardware", "unknown"),
            "synthetic": bool(all(p.get("synthetic", True) for p in subs) if subs else True),
            "case_ctx": case_ctx,
            "regression": diag["regression"],
            "ranking": [[s, float(z), float(d)] for s, z, d in diag["ranking"]],
            "tour_ranking": [[s, float(v)] for s, v in tour["ranking"]],
            "probabilities": probs, "trusted": cal["trusted"],
            "plausible": pset, "multi": multi, "unknown_mass": diag["unknown_mass"],
            "taken": run["taken"], "measurements": len(run["taken"]),
            "decision": run["decision"], "select_top": run["top"],
            "hypotheses": [{"cause": h["cause"], "support_ids": h["support_ids"],
                            "contradict_ids": h["contradict_ids"],
                            "score": h["score"]} for h in diag["hypotheses"]],
            "next_measurement": nxt, "next_reason": nxt_why,
            "interventions": interventions, "verified": verified,
            "divergence": div,
            "priors": priors, "difference_card": card,
            "p99": {"faulty_ms": _ver.completion_p99(bundle),
                    "healthy_ms": _ver.completion_p99(healthy)},
            "wall_s": round(wall_s, 2),
            "evidence_bytes": Path(workdir / f"case_{profile}_{seed}.jsonl").stat().st_size}
    Path(workdir / f"case_{profile}_{seed}.json").write_text(
        json.dumps(out, indent=2), encoding="utf-8")
    return out


def _ev(record_id: str) -> str:
    return f"(ev:{record_id})"


def render_showme(ledger_path: str | Path, incident_id: str, summary: dict) -> str:
    """Markdown investigation over one ledger incident + its run summary."""
    ledger = Ledger(str(ledger_path))
    if incident_id not in ledger.incidents:
        raise ValueError(f"unknown incident {incident_id!r}")
    evs = sorted((e for e in ledger.evidence.values() if e.incident_id == incident_id),
                 key=lambda e: e.record_id)
    by_kind = {}
    for e in evs:
        by_kind.setdefault(e.kind, []).append(e)
    L = [f"# Investigation: {summary.get('profile', '?')} (seed {summary.get('seed', '?')})", ""]
    reg = summary.get("regression", {})
    p99 = summary.get("p99", {})
    stage0 = by_kind["stage_delta"][0].record_id if by_kind.get("stage_delta") else None
    L += ["## What changed",
          "span %+.3fms vs matched healthy baselines%s; completion p99 %+.3fms faulty-vs-healthy (same seed)" % (
              reg.get("span_delta_ms", 0.0),
              (" " + _ev(stage0)) if stage0 else " (no stage evidence)",
              p99.get("faulty_ms", 0.0) - p99.get("healthy_ms", 0.0)),
          ""]
    ctx = summary.get("case_ctx", {})
    L += ["## Comparator",
          "matched healthy baselines at seeds %s (same timing model/kernels/ops; mismatched contexts refused)%s" % (
              ctx.get("baselines", "?"), (" " + _ev(stage0)) if stage0 else ""),
          ""]
    top = summary.get("ranking", [[None, 0, 0]])[0]
    L += ["## Localization",
          "top stage %s (z=%.2f, delta=%+.4fms)" % (top[0], top[1], top[2]),
          ""]
    L += ["## Hypotheses and uncertainty",
          "plausible: %s; UNKNOWN mass %.3f; trusted=%s" % (
              summary.get("plausible", {}).get("members", []),
              summary.get("unknown_mass", 0.0), summary.get("trusted")),
          ""]
    for comp in summary.get("multi", {}).get("composites", []):
        L.append("composite %s support %.3f (%s)" % (
            comp.get("causes"), comp.get("support"), comp.get("reason")))
    if summary.get("multi", {}).get("composites"):
        L.append("")
    L += ["## Supporting and contradicting evidence"]
    hset = by_kind["hypothesis_set"][0].record_id if by_kind.get("hypothesis_set") else None
    if hset:
        L.append("hypothesis set %s" % _ev(hset))
    for h in summary.get("hypotheses", []):
        sup = " ".join(_ev(i) for i in h.get("support_ids", [])) or "(none)"
        con = " ".join(_ev(i) for i in h.get("contradict_ids", [])) or "(none)"
        L.append("- %s: for %s ; against %s" % (h.get("cause"), sup, con))
    L += ["", "## Measurement chosen and why"]
    for m in by_kind.get("measurement_selection", []):
        why = m.payload.get("why", {})
        L.append("- suggested %s, executed %s %s" % (
            why.get("action", "?"), why.get("executed_action", "?"), _ev(m.record_id)))
    if not by_kind.get("measurement_selection"):
        L.append("(no measurement evidence)")
    L += ["", "## Profiler findings",
          "(no escalation: evidence sufficed without deep profiling)" if not by_kind.get("deep_evidence")
          else "see deep evidence records", ""]
    L += ["## Experiment and effect"]
    ivs = summary.get("interventions", [])
    if ivs:
        for iv in ivs:
            eid = _exp_evidence_id(ledger, incident_id, iv.get("intervention"))
            if eid:
                L.append("- %s predicted=%s measured=%s %s" % (
                    iv.get("intervention"), iv.get("predicted_ms"),
                    iv.get("measured_ms"), _ev(eid)))
            else:
                L.append("- %s FAILED: %s (no intervention record)" % (
                    iv.get("intervention"), iv.get("error", "?")))
    else:
        L.append("(no intervention executed)")
    L += ["", "## Replay and first divergence"]
    div = summary.get("divergence")
    L.append(("diverges at %s index %s fields %s" % (
        div.get("stage"), div.get("index"), div.get("fields"))
        if div else "replay matches healthy: no divergence"))
    L += ["", "## Verified cause and fix"]
    ver = summary.get("verified")
    if ver:
        eid = _exp_evidence_id(ledger, incident_id, ver["fix"])
        L.append("VERIFIED %s via %s: measured %sms, recovery %.2f%s" % (
            ver["cause"], ver["fix"], ver["measured_ms"], ver["recovery"],
            (" " + _ev(eid)) if eid else ""))
    else:
        L += ["ABSTAIN: %s" % (summary.get("next_reason") or "no verified cause"),
              "next measurement: %s" % summary.get("next_measurement")]
    L += ["", "## Similar prior incidents"]
    if summary.get("priors"):
        for p in summary["priors"]:
            L.append("- prior cause %s (score %.3f, %s)" % (
                p["cause"], p["score"], p["verification"]))
        if summary.get("difference_card"):
            L.append("  differences: %s" % (summary["difference_card"],))
    else:
        L.append("(no priors in store)")
    L += ["", "## Expected recovery",
          ("%.3fms measured" % ver["measured_ms"]) if ver else "(unverified: no recovery claimed)",
          ""]
    return "\n".join(L) + "\n"


def _exp_evidence_id(ledger, incident_id: str, intervention: str | None) -> str | None:
    """Intervention record via experiment linkage (intervention records carry
    no incident_id of their own — resolve through the incident's experiments)."""
    if not intervention:
        return None
    exp_ids = {e.experiment_id for e in ledger.experiments.values()
               if e.hypothesis_id in {h.hypothesis_id for h in ledger.hypotheses.values()
                                      if h.incident_id == incident_id}}
    for e in ledger.evidence.values():
        if e.kind == "intervention" and e.payload.get("experiment_id") in exp_ids \
                and e.payload.get("intervention") == intervention:
            return e.record_id
    for e in ledger.evidence.values():  # fallback: incident-scoped name match
        if e.incident_id == incident_id and e.kind == "intervention" \
                and e.payload.get("intervention") == intervention:
            return e.record_id
    return None


def resolve_report(report: str, ledger) -> dict:
    """Independent oracle: every ev: ID resolves; VERIFIED/fix claims hold."""
    violations = []
    for rid in sorted(set(EV_RE.findall(report))):
        if rid == "missing":
            violations.append("unresolvable evidence reference ev:missing")
        elif rid not in ledger.evidence:
            violations.append(f"unresolvable evidence reference ev:{rid}")
    hyps = [h for h in ledger.hypotheses.values()]
    verified = [h for h in hyps if h.status.value == "VERIFIED"]
    if "VERIFIED" in report:
        if not verified:
            violations.append("report claims VERIFIED with no VERIFIED hypothesis in ledger")
        for m in re.finditer(r"(?m)^VERIFIED (\S+)", report):
            cause = m.group(1)
            if not any(h.cause == cause and h.status.value == "VERIFIED" for h in hyps):
                violations.append(
                    f"VERIFIED claim for {cause!r} matches no VERIFIED hypothesis")
        for h in verified:
            measured = [e for e in ledger.experiments.values()
                        if e.hypothesis_id == h.hypothesis_id
                        and e.measured_delta_ms is not None and e.measured_delta_ms > 0]
            if not measured:
                violations.append(f"VERIFIED {h.cause} lacks a measured experiment")
    if "ABSTAIN" in report:
        if any(ln.startswith("VERIFIED") for ln in report.splitlines()):
            violations.append("abstention report contains a VERIFIED claim")
        if re.search(r"(?m)^fix:\s*\S", report):
            violations.append("abstention report claims a fix")
    return {"violations": violations, "ok": not violations}
