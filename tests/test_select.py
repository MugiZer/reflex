"""Ticket 10 proofs: EIG-per-cost choice, cold-start index, correlation
stress, bundle costs, guards, executed-only evidence, replay agreement."""
import asyncio
import itertools
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from reflex import confidence as C
from reflex import select as S
from reflex.fakegpu import generate
from reflex.ledger import Incident, Ledger, UNKNOWN
from reflex.runtime import calibrate

SEEDS = (200, 201, 202, 203)
HELD = 999
BELIEF = {"cpu": 0.5, "gpu": 0.5}  # ambiguous: host-hot cpu vs mixed gpu
COLLECTORS = {"m_timeline": 0.004, "m_sched": 0.004, "m_kernel": 0.008,
              "m_count": 0.008, "m_tensor": 0.020, "m_deep": 0.040,
              "s_host": 0.010, "s_device": 0.016, "s_deep": 0.050}
A2C = {"timeline": "m_timeline", "scheduler_trace": "m_sched",
       "kernel_timeline": "m_kernel", "counters": "m_count",
       "tensor_analysis": "m_tensor", "deep_profile": "m_deep"}
S2C = {"host": "s_host", "device": "s_device", "deep": "s_deep"}


@pytest.fixture(scope="module")
def models():
    fam_by_cause = {}
    for fam, cause in S._FAMILY_CAUSE.items():
        fam_by_cause.setdefault(cause, []).append(fam)
    bbc = {c: [generate(s, f, 8)
               for s, f in zip(SEEDS, itertools.cycle(fs))][:len(SEEDS)]
           for c, fs in fam_by_cause.items()}
    return S.fit_outcomes(bbc)


@pytest.fixture(scope="module")
def costs(tmp_path_factory):
    led = Ledger(tmp_path_factory.mktemp("cal") / "c.jsonl")
    report = asyncio.run(calibrate(led, COLLECTORS, [0.5, 1.0],
                                   ticks=8, tick_ms=1.0, seed=0))
    return S.build_costs(report, A2C, S2C)


@pytest.fixture(scope="module")
def table():
    vacc = {"matched": 0.7, "structural": 0.6, "xcorr": 0.4,
            "gls": 0.4, "enet": 0.4, "perm": 0.4}
    return C.fit_values(vacc)


def _ledger(tmp_path, name="s.jsonl"):
    led = Ledger(tmp_path / name)
    inc = led.open_incident(Incident(provenance="select-test", title="t10"))
    return led, inc.incident_id


def test_choice_timeline_over_profile_with_cost_audit(models, costs):
    # deep_profile admissible here (kernel_timeline taken) yet still loses.
    sel = S.select(dict(BELIEF), models, costs, taken=("kernel_timeline",))
    assert sel["mode"] == "eig" and sel["winner"] == "timeline"
    why = sel["why"]
    assert why["eig"] > 0 and why["cost_ms"] > 0 and why["score"] > 0
    beaten = {a["action"]: a for a in why["alternatives_beaten"]}
    assert "deep_profile" in beaten and beaten["deep_profile"]["margin"] > 0
    order = sorted([r for r in sel["rows"] if r["admissible"]],
                   key=lambda r: (-r["score"], r["cost_ms"], r["action"]))
    assert order[0]["action"] == "timeline"  # audit: logged score is the ranking
    print("\ntimeline eig=%.3f cost=%.3fms score=%.4f | deep margin=%.4f" % (
        why["eig"], why["cost_ms"], why["score"],
        beaten["deep_profile"]["margin"]))


def test_cold_start_fallback_invents_nothing(models, costs, table):
    for missing in (None, {}, {"trusted": True}, S.invalidate(models)):
        sel = S.select(dict(BELIEF), missing, costs, (),
                       table=table, q=0.3)
        assert sel["mode"] == "index" and "cold-start" in sel["reason"]
        assert all(r["eig"] == 0.0 for r in sel["rows"])  # no invented precision
        exp_voice, _ = C.nominate(C.measure_values(table, 0.3, ()))
        exp = next(a for a, v in S.ACTION_VOICE.items() if v == exp_voice)
        assert sel["winner"] == exp  # transparent value order, reused formula
    cheap = S.select(dict(BELIEF), None, costs, ())
    order = sorted(cheap["rows"], key=lambda r: (r["cost_ms"], r["action"]))
    assert cheap["winner"] == order[0]["action"]  # cost-aware without a table


def test_correlation_stress_same_trace_scores_zero(models, costs, tmp_path):
    led, iid = _ledger(tmp_path)
    reg = S.ToolRegistry(costs)
    bundle = generate(HELD, "cpu_starvation", 8)
    fresh = S.select(dict(BELIEF), models, costs, ())
    s_fresh = next(r for r in fresh["rows"] if r["action"] == "timeline")
    assert s_fresh["score"] > 0 and s_fresh["redundancy"] == 1.0
    r1 = reg.execute(led, iid, "timeline", bundle, (), 1e6, correlation_id="t")
    r2 = reg.execute(led, iid, "timeline", bundle, ("timeline",), 1e6,
                     correlation_id="t")
    assert r1["outcome"] == r2["outcome"]  # same trace reread: identical outcome
    assert r1["evidence_id"] != r2["evidence_id"]
    srcs = {led.evidence[r1["evidence_id"]].payload["source"],
            led.evidence[r2["evidence_id"]].payload["source"]}
    assert srcs == {"cpu_launch"}  # real shared provenance
    again = S.select(dict(BELIEF), models, costs, ("timeline",))
    s_rep = next(r for r in again["rows"] if r["action"] == "timeline")
    s_ind = next(r for r in again["rows"] if r["action"] == "counters")
    assert s_rep["score"] == 0.0 < s_ind["score"]  # reread never masquerades
    shared = S.select(dict(BELIEF), models, costs, ("counters",))
    r_ten = next(r for r in shared["rows"] if r["action"] == "tensor_analysis")
    r_dev = next(r for r in shared["rows"] if r["action"] == "kernel_timeline")
    assert r_ten["redundancy"] == 0.5  # shared tensor_active_pct signal, distinct records
    assert r_dev["redundancy"] == 1.0  # disjoint signal, no penalty


def test_bundle_shared_cost_measured(models, costs):
    assert all(v > 0 for v in costs["incremental"].values())
    assert all(v > 0 for v in costs["setup"].values())
    first = S.effective_cost(costs, "timeline", ())
    second = S.effective_cost(costs, "scheduler_trace", ("timeline",))
    assert first == costs["incremental"]["timeline"] + costs["setup"]["host"]
    assert second == costs["incremental"]["scheduler_trace"]  # setup already paid
    assert first > second >= 0
    bundled = first + second
    standalone = sum(costs["incremental"][a] + costs["setup"]["host"]
                     for a in ("timeline", "scheduler_trace"))
    assert bundled < standalone
    print("\nhost setup=%.3fms timeline=%.3f->%.3fms bundled saving=%.3fms" % (
        costs["setup"]["host"], first, costs["incremental"]["timeline"],
        standalone - bundled))


def test_guard_rejections(costs, tmp_path):
    led, iid = _ledger(tmp_path)
    n0 = len(led.evidence)
    bundle = generate(HELD, "healthy", 8)
    reg = S.ToolRegistry(costs)
    ok, reason = reg.check("no_such_probe", (), 1e6)
    assert not ok and "unknown tool" in reason
    ok, reason = reg.check("timeline", (), 0.0)
    assert not ok and "over budget" in reason
    poor = S.ToolRegistry(costs, grants=("observe:host",))
    ok, reason = poor.check("deep_profile", ("kernel_timeline", "counters"), 1e6)
    assert not ok and "permission denied" in reason
    ok, reason = reg.check("deep_profile", (), 1e6)
    assert not ok and "prerequisite" in reason
    for res in (reg.execute(led, iid, "no_such_probe", bundle, (), 1e6),
                reg.execute(led, iid, "timeline", bundle, (), 0.0)):
        assert res["admitted"] is False and res["executed"] is False \
            and res["evidence_id"] is None and res["reason"]
    assert len(led.evidence) == n0  # rejections write nothing to the ledger


def test_executed_only_evidence(costs, tmp_path):
    led, iid = _ledger(tmp_path)
    reg = S.ToolRegistry(costs)
    bundle = generate(HELD, "stalls", 8)
    n0 = len(led.evidence)
    dry = reg.execute(led, iid, "counters", bundle, (), 1e6, dry_run=True)
    assert dry["admitted"] and not dry["executed"]
    assert dry["evidence_id"] is None and len(led.evidence) == n0
    real = reg.execute(led, iid, "counters", bundle, (), 1e6)
    assert real["executed"] and len(led.evidence) == n0 + 1
    ev = led.evidence[real["evidence_id"]]
    assert ev.level.value == "OBSERVED" and ev.payload["executed"] is True


def test_eig_predicted_vs_realized(models, costs):
    for fault, seed in (("cpu_starvation", HELD), ("kernel_regression", HELD + 1)):
        held = generate(seed, fault, 8)
        rep = S.replay_predicted_vs_realized(models, costs, dict(BELIEF), held)
        assert rep["pred_best"] == rep["real_best"]  # agreement, whatever the winner is
        got = next(r for r in rep["rows"] if r["action"] == rep["pred_best"])
        assert got["realized_gain"] > 0
        assert rep["spearman"] > 0
        print("\nreplay %s pred=real=%s spearman=%.2f" % (fault, rep["pred_best"], rep["spearman"]))


def test_orchestrator_deterministic(models, costs, tmp_path):
    bundle = generate(HELD, "cpu_starvation", 8)
    outs = []
    for i in ("a", "b"):
        led, iid = _ledger(tmp_path, "%s.jsonl" % i)
        outs.append(S.run(led, iid, dict(BELIEF), models, costs, bundle,
                          budget_ms=100.0))
    a, b = outs
    assert a["decision"] == b["decision"] and a["taken"] == b["taken"] \
        and a["top"] == b["top"] and a["belief"] == b["belief"]
    states = [t["state"] for t in a["trace"]]
    assert states[:2] == ["propose", "challenge"] and "verify" in states
    assert a["decision"] in ("commit", "abstain-and-stop") and a["fixes"] == []
    for t in a["trace"]:
        if t["state"] == "measure":
            assert t["why"]["eig"] > 0 and t["why"]["cost_ms"] > 0 \
                and "alternatives_beaten" in t["why"]
    led, iid = _ledger(tmp_path, "c.jsonl")
    S.run(led, iid, dict(BELIEF), models, costs, bundle, budget_ms=100.0)
    kinds = {e.kind for e in led.evidence.values()}
    assert {"measurement", "measurement_selection",
            "investigation_outcome"} <= kinds


def test_context_compiler_bounded_deterministic(models, costs, tmp_path):
    led, iid = _ledger(tmp_path)
    S.run(led, iid, dict(BELIEF), models, costs,
          generate(HELD, "cpu_starvation", 8), budget_ms=100.0)
    c1, c2 = S.compile_context(led, iid), S.compile_context(led, iid)
    assert c1 == c2 and c1["chars"] <= 2000
    assert {h["cause"] for h in c1["hypotheses"]} >= {"cpu", "gpu", "UNKNOWN"}
    assert c1["evidence_ids"] == sorted(c1["evidence_ids"])
    small = S.compile_context(led, iid, max_chars=100)
    assert small["chars"] <= 2000 and small["truncated"] >= 0


def test_hygiene_no_frontier_or_label_leak():
    src = (ROOT / "reflex" / "select.py").read_text(encoding="utf-8")
    for bad in ("reflex.corpus", "LABELS", "SEED_TABLE", "openai", "anthropic",
                "transformers", "import torch", "llm", "TESTED", "VERIFIED",
                "sklearn", "mapie"):
        assert bad not in src
    from reflex.corpus import label_importers
    assert label_importers() == []


def test_unknown_mass_survives_belief_update(models):
    bundle = generate(HELD, "cpu_starvation", 8)
    b = {"cpu": 0.4, "gpu": 0.4, UNKNOWN: 0.2}
    out = S.outcome_of("timeline", bundle)
    post = S.update_belief(b, models, "timeline", out)
    assert post[UNKNOWN] == 0.2  # carried, never normalized away
    assert abs(sum(v for k, v in post.items() if k != UNKNOWN) - 0.8) < 1e-9


def test_high_unknown_falls_back_to_index(models, costs, table):
    b = {"cpu": 0.2, "gpu": 0.2, UNKNOWN: 0.6}
    sel = S.select(b, models, costs, (), table=table, q=0.3)
    assert sel["mode"] == "index" and "open-world" in sel["reason"]


def test_below_bar_unknown_stays_bayesian(models, costs):
    b = {"cpu": 0.3, "gpu": 0.3, UNKNOWN: 0.4}
    sel = S.select(b, models, costs, ())
    assert sel["mode"] == "eig"  # 0.4 < 0.5 bar: no fallback, pin the boundary


def test_orchestrator_executes_selector_winner(tmp_path):
    # Hand-built models: counters discriminates perfectly, every other action
    # is uniform noise. Deterministic (no timing, no fits): counters must win
    # AND be executed. Old code executed catalog-first timeline instead.
    causes = ["cpu", "gpu"]
    counts = {}
    for a in S.ACTIONS:
        labels = S.OUTCOMES[a][0]
        if a == "counters":
            counts[a] = {"cpu": {labels[0]: 0, labels[1]: 10},
                         "gpu": {labels[0]: 10, labels[1]: 0}}
        else:
            counts[a] = {c: {o: 5 for o in labels} for c in causes}
    models = {"counts": counts, "causes": causes, "n": 100,
              "trusted": True, "smoothing": "laplace+1"}
    costs = {"incremental": {a: 5.0 for a in S.ACTIONS},
             "setup": {g: 0.0 for g in S.GROUPS},
             "group": dict(S.GROUP_OF), "floor_ms": 1e-6}
    led, iid = _ledger(tmp_path)
    bundle = generate(HELD, "bw_pressure", 8)
    belief = {"cpu": 0.5, "gpu": 0.5}
    sel = S.select(dict(belief), models, costs, ())
    assert sel["winner"] == "counters"  # guard: construction discriminates
    out = S.run(led, iid, dict(belief), models, costs, bundle,
                budget_ms=1e6, max_steps=1)
    assert out["taken"] == ["counters"]  # executed == selected, not catalog order
