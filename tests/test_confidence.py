"""Ticket 07 proofs: gated calibration, plausible sets, abstention, stopping,
compound representation -- all fitted on real held-out fault families."""
import json
import sys
from pathlib import Path

import numpy as np
import pytest
from sklearn.metrics import brier_score_loss, log_loss

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from reflex import confidence as C
from reflex import tournament
from reflex.diagnose import STAGES
from reflex.fakegpu import generate
from reflex.ledger import EvidenceLevel, Hypothesis, Incident, Ledger

N = 8
SEED, B1, B2 = 51, 151, 252
FIT_FAMS = ["cpu_starvation", "launch_overhead", "bw_pressure", "sync_serialization",
            "transfer_heavy", "queue_contention", "kernel_regression"]
EVAL_FAMS = ["stalls", "batching_delay", "competing_workload", "preprocessing_interference"]
# Eval-side canonical cause (single-stage scoring standard from test_tournament).
STRICT = {"cpu_starvation": "cpu", "launch_overhead": "scheduler",
          "bw_pressure": "gpu", "stalls": "gpu",
          "sync_serialization": "scheduler", "transfer_heavy": "transport",
          "batching_delay": "cpu", "queue_contention": "queue",
          "competing_workload": "queue", "kernel_regression": "gpu",
          "preprocessing_interference": "cpu"}
SI = {s: i for i, s in enumerate(STAGES)}
LABELS8 = list(range(len(STAGES)))
COMPOUND = "compound:cpu_starvation+transfer_heavy"


def _raw(fam, seed=SEED):
    return generate(seed, fam, N)


@pytest.fixture(scope="module")
def D():
    out = {}
    for fam in FIT_FAMS + EVAL_FAMS:
        out[fam] = C.voice_state(_raw(fam), [_raw("healthy", B1), _raw("healthy", B2)])
    starv, heavy = _raw("cpu_starvation"), _raw("transfer_heavy")
    assert [c["correlation_id"] for c in starv["cpu_launch"]] == \
        [c["correlation_id"] for c in heavy["cpu_launch"]]  # same-seed merge is coherent
    import copy
    merged = copy.deepcopy(starv)
    merged["transfer"] = copy.deepcopy(heavy["transfer"])
    out["_merged_src"] = (starv, heavy, merged)
    out[COMPOUND] = C.voice_state(
        merged, [_raw("healthy", B1), _raw("healthy", B2)])
    # shared temperature on FIT pooled prefixes (no eval family leaks in)
    Z = [C.align(C.fuse_taken(out[f], C.VOICES[:k])) for f in FIT_FAMS for k in range(1, 7)]
    Y = [SI[STRICT[f]] for f in FIT_FAMS for k in range(1, 7)]
    out["temp"] = C.fit_temperature(Z, Y)
    # correctness samples: one per (fit family x voice), labels are voice tops
    XF = [C.correctness_features(out[f]["voices"][v]) for f in FIT_FAMS for v in C.VOICES]
    yF = [int(sorted(out[f]["voices"][v], key=lambda s: (-out[f]["voices"][v][s], s))[0]
              == STRICT[f]) for f in FIT_FAMS for v in C.VOICES]
    out["corr"] = C.fit_correctness(XF, yF)
    out["vacc"] = {v: float(np.mean(
        [sorted(out[f]["voices"][v], key=lambda s: (-out[f]["voices"][v][s], s))[0]
         == STRICT[f] for f in FIT_FAMS])) for v in C.VOICES}
    out["table"] = C.fit_values(out["vacc"])
    XL = [C.voice_matrix(out[f]["voices"]) for f in FIT_FAMS]
    # ponytail: same-data conformalize (7 rows; a held-out fold needs n > 5 at
    # level 0.8 and only 4 EVAL rows exist) — coverage is optimistic, demo-only
    # until incident volume supports a real calibration fold. Pass (XE, yE) then.
    out["mapie"] = C.fit_conformal(XL, [SI[STRICT[f]] for f in FIT_FAMS])
    return out


def _full(fam, D):
    return C.calibrate(D[fam], C.VOICES, D["temp"])


def test_split_disjoint_and_hygiene():
    assert set(FIT_FAMS) & set(EVAL_FAMS) == set()  # fit/eval leakage fails the point
    src = (ROOT / "reflex" / "confidence.py").read_text(encoding="utf-8")
    for bad in ("reflex.corpus", "from .corpus", "corpus.", "TESTED", "VERIFIED",
                "transition", "record_experiment", "set_measured", "LABELS", "SEED_TABLE"):
        assert bad not in src
    from reflex.corpus import label_importers
    assert label_importers() == []


def test_temperature_reliability(D):
    t = D["temp"]
    assert 0.05 <= t["T"] <= 20.0 and np.isfinite(t["T"]) and t["n"] == 42
    assert t["at_bound"] is True  # separable FIT set floors T: capped branch covered, not just designed
    print("\nshared T=%.4f at_bound=%s nll=%.3f" % (t["T"], t["at_bound"], t["nll"]))
    ZE = [C.align(C.fuse_taken(D[f], C.VOICES)) for f in EVAL_FAMS]
    YE = [SI[STRICT[f]] for f in EVAL_FAMS]
    Pc = [C.softmax(z / t["T"]) for z in ZE]
    Pr = [C.softmax(z) for z in ZE]
    Pu = [np.full(len(STAGES), 1 / len(STAGES)) for _ in ZE]
    ll = lambda P: log_loss(YE, P, labels=LABELS8)
    assert ll(Pc) < ll(Pr) < ll(Pu), (ll(Pc), ll(Pr), ll(Pu))
    rc, rr, ru = C.reliability(Pc, YE), C.reliability(Pr, YE), C.reliability(Pu, YE)
    print("\nEVAL reliability cal/raw/unif: logloss %.3f/%.3f/%.3f ece %.3f/%.3f brier %.3f/%.3f/%.3f"
          % (ll(Pc), ll(Pr), ll(Pu), rc["ece"], rr["ece"], rc["brier"], rr["brier"], ru["brier"]))
    assert rc["ece"] <= rr["ece"] and rc["brier"] < rr["brier"] and rc["brier"] < ru["brier"]


def test_health_gating(D):
    for fam in EVAL_FAMS + [COMPOUND]:
        rep = C.calibrate(D[fam], C.VOICES, None)
        assert rep["trusted"] is False and rep["probabilities"] is None
        assert rep["health"] == "missing"
        assert [s for s, _ in rep["ranking"]] == [s for s, _ in
              tournament.fuse({v: D[fam]["voices"][v] for v in C.VOICES}, D[fam]["mult"],
                              exclude=tuple(sorted(set(tournament.WEIGHTS) - set(C.VOICES))))]
        stale = C.calibrate(D[fam], C.VOICES, C.invalidate(D["temp"]))
        assert stale["trusted"] is False and stale["probabilities"] is None
        assert stale["health"] == "stale"
        ok = _full(fam, D)
        assert ok["trusted"] is True and abs(sum(ok["probabilities"].values()) - 1) < 1e-9
        # ranking invariant: calibration never re-orders the fused ranking
        assert [s for s, _ in ok["ranking"]] == [s for s, _ in rep["ranking"]]


def test_plausible_sets_and_contradiction(D):
    b = _full("batching_delay", D)
    sb = C.plausible_set(b, D["batching_delay"]["surfaces"])
    assert sb["members"] == ["preprocess", "cpu"] and sb["vetoed"] == {}
    t = _full("transfer_heavy", D)
    assert C.plausible_set(t, D["transfer_heavy"]["surfaces"])["members"] == ["transport"]
    m = _full(COMPOUND, D)
    sm = C.plausible_set(m, D[COMPOUND]["surfaces"])
    assert sm["members"] == ["transport", "cpu"]  # gpu hanger-on vetoed, true pair kept
    assert set(sm["vetoed"]) == {"gpu"} and sm["vetoed"]["gpu"]
    # MAPIE conformal benchmark on held-out families
    hits, sizes = 0, []
    for fam in EVAL_FAMS:
        s = C.conformal_set(D["mapie"], C.voice_matrix(D[fam]["voices"]))
        assert s and set(s) <= set(STAGES)
        sizes.append(len(s))
        hits += STRICT[fam] in s
    cov = hits / len(EVAL_FAMS)
    print("\nMAPIE lac coverage %.2f mean size %.2f" % (cov, float(np.mean(sizes))))
    assert cov + 1 / np.sqrt(len(EVAL_FAMS)) >= 0.8 and float(np.mean(sizes)) < len(STAGES)


def test_abstention_states(D):
    b1 = C.calibrate(D["batching_delay"], C.VOICES[:1], D["temp"])
    assert b1["margin"] < 0.2 and b1["probabilities"][b1["top"]] < C.TAU_HI  # genuinely ambiguous
    q1 = C.correctness_q(D["corr"], C.correctness_features(
        {s: b1["probabilities"][s] for s in STAGES}))
    d = C.decide(b1, D["batching_delay"]["surfaces"], C.VOICES[:1],
                 C.measure_values(D["table"], q1, C.VOICES[:1]), q1)
    assert d["state"] == "abstain-and-continue" and d["next_measurement"] == "structural"
    assert d["reason"] and d["fixes"] == []
    s1 = C.calibrate(D["stalls"], C.VOICES[:1], D["temp"])
    qs = C.correctness_q(D["corr"], C.correctness_features(
        {s: s1["probabilities"][s] for s in STAGES}))
    ds = C.decide(s1, D["stalls"]["surfaces"], C.VOICES[:1],
                  C.measure_values(D["table"], qs, C.VOICES[:1]), qs)
    assert ds["state"] == "commit" and ds["next_measurement"] is None and ds["fixes"] == []
    b6 = _full("batching_delay", D)
    q6 = C.correctness_q(D["corr"], C.correctness_features(
        {s: b6["probabilities"][s] for s in STAGES}))
    d6 = C.decide(b6, D["batching_delay"]["surfaces"], C.VOICES,
                  C.measure_values(D["table"], q6, C.VOICES), q6)
    assert d6["state"] == "abstain-and-stop" and "exhausted" in d6["reason"] and d6["fixes"] == []
    m6 = _full(COMPOUND, D)
    qm = C.correctness_q(D["corr"], C.correctness_features(
        {s: m6["probabilities"][s] for s in STAGES}))
    dm = C.decide(m6, D[COMPOUND]["surfaces"], C.VOICES,
                  C.measure_values(D["table"], qm, C.VOICES), qm)
    assert dm["state"] != "commit" and dm["fixes"] == []  # compound never forced to one cause


def test_correctness_platt_and_isotonic_roles(D):
    XE = [C.correctness_features(D[f]["voices"][v]) for f in EVAL_FAMS for v in C.VOICES]
    yE = [int(sorted(D[f]["voices"][v], key=lambda s: (-D[f]["voices"][v][s], s))[0]
              == STRICT[f]) for f in EVAL_FAMS for v in C.VOICES]
    qp = D["corr"]["platt"].predict_proba(XE)[:, 1]
    qi = D["corr"]["isotonic"].predict_proba(XE)[:, 1]
    base = brier_score_loss(yE, np.full(len(yE), D["corr"]["base_rate"]))
    print("\ncorrectness Brier platt %.3f iso %.3f base %.3f" % (
        brier_score_loss(yE, qp), brier_score_loss(yE, qi), base))
    assert brier_score_loss(yE, qp) < base and brier_score_loss(yE, qi) < base
    assert D["corr"]["platt_role"] == "decision" and D["corr"]["isotonic_role"] == "benchmark"


def test_risk_coverage_and_false_confident(D):
    errs, conf_errs, n_conf = [], [], 0
    for fam in EVAL_FAMS:
        rep = _full(fam, D)
        wrong = rep["top"] != STRICT[fam]
        errs.append(wrong)
        q = C.correctness_q(D["corr"], C.correctness_features(
            {s: rep["probabilities"][s] for s in STAGES}))
        dec = C.decide(rep, D[fam]["surfaces"], C.VOICES,
                       C.measure_values(D["table"], q, C.VOICES), q)
        if dec["state"] == "commit":
            n_conf += 1
            conf_errs.append(wrong)
    assert n_conf >= 1  # non-vacuous
    assert float(np.mean(conf_errs)) <= float(np.mean(errs))  # confidence concentrates risk
    assert sum(conf_errs) == 0  # no confident-but-wrong diagnosis on held-out families


def test_stopping_replay_vs_fixed_baselines(D):
    costs, errs, stops = [], [], set()
    for fam in EVAL_FAMS:
        r = C.replay(D[fam], D[fam]["surfaces"], D["temp"], D["corr"], D["table"])
        costs.append(r["cost"])
        errs.append(r["top"] != STRICT[fam])
        stops.add(r["stop"])
        assert r["fixes"] == [] and all(t["next"] in C.VOICES or t["next"] is None for t in r["trace"])
    all_cost = float(sum(C.VOICE_COST[v] for v in C.VOICES))
    all_err = float(np.mean([C.fuse_taken(D[f], C.VOICES)[0][0] != STRICT[f] for f in EVAL_FAMS]))
    m_cost = C.VOICE_COST["matched"]
    m_err = float(np.mean([C.fuse_taken(D[f], ["matched"])[0][0] != STRICT[f] for f in EVAL_FAMS]))
    print("\nreplay cost %.2f err %.2f | all %.0f/%.2f matched %.0f/%.2f"
          % (float(np.mean(costs)), float(np.mean(errs)), all_cost, all_err, m_cost, m_err))
    assert float(np.mean(costs)) < all_cost and float(np.mean(errs)) <= m_err \
        and float(np.mean(errs)) <= all_err
    assert "commit" in stops  # posterior-threshold stops fire
    assert any("non-positive" in C.replay(
        D[f], D[f]["surfaces"], D["temp"], D["corr"], D["table"])["reason"] for f in EVAL_FAMS)


def test_compound_representation(D):
    starv, heavy, merged = D["_merged_src"]
    assert merged["transfer"] == heavy["transfer"]  # transfer overlay is real, not hand-written
    assert merged["cpu_launch"] == starv["cpu_launch"]
    rep = _full(COMPOUND, D)
    mc = C.multi_cause(rep, D[COMPOUND]["surfaces"])
    assert mc["marginals"]["transport"] == 1.0 and mc["marginals"]["cpu"] >= 0.5
    assert sum(mc["marginals"].values()) > 1.5  # marginals, never a forced simplex
    assert len(mc["composites"]) == 1
    comp = mc["composites"][0]
    assert comp["causes"] == ["transport", "cpu"] and comp["support"] >= 0.5
    s = C.plausible_set(rep, D[COMPOUND]["surfaces"])
    assert set(s["members"]) == {"transport", "cpu"}
    single = _full("transfer_heavy", D)
    assert C.multi_cause(single, D["transfer_heavy"]["surfaces"])["composites"] == []


def test_decisions_never_promote(tmp_path, D):
    led = Ledger(tmp_path / "c.jsonl")
    inc = led.open_incident(Incident(provenance="confidence-test", title="t07"))
    hid = led.propose_hypothesis(Hypothesis(
        incident_id=inc.incident_id, provenance="confidence-test",
        cause="gpu", correlation_id="c0"))
    assert hid.status is EvidenceLevel.INFERRED
    for fam in EVAL_FAMS + [COMPOUND]:
        rep = _full(fam, D)
        s = C.plausible_set(rep, D[fam]["surfaces"])
        mc = C.multi_cause(rep, D[fam]["surfaces"])
        q = C.correctness_q(D["corr"], C.correctness_features(
            {x: rep["probabilities"][x] for x in STAGES}))
        dec = C.decide(rep, D[fam]["surfaces"], C.VOICES,
                       C.measure_values(D["table"], q, C.VOICES), q)
        ev = C.record_decision(led, inc.incident_id,
                               {**dec, "members": s["members"], "composites": mc["composites"]}, "c-%s" % fam)
        assert ev.level is EvidenceLevel.INFERRED
    assert all(h.status is EvidenceLevel.INFERRED for h in led.hypotheses.values())
    assert not led.experiments
    blob = json.dumps(led.snapshot(), sort_keys=True, default=str)
    assert "TESTED" not in blob and "VERIFIED" not in blob
