"""Ticket 17 proofs: partial pooling + MAP prior + LOO protocol + gate.

Machinery is proven on synthetic multi-context fixtures with systematic
per-context offsets (asserted genuinely multi-context: cell means must
differ, so relabeled copies of one context fail). The LOO comparison is a
protocol proof, not a pooling-beats-all claim: direction deliberately
unasserted on structured data, and a no-structure fixture (far-apart precise
cells) proves the protocol can report against pooling. Promotion-gate tests
key off explicit caller-supplied provenance flags in both directions, plus
the absent-flag default.
"""
import math
import random
import statistics
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from reflex.pool import borrow_gate, loo_errors, map_prior, partial_pool, \
    pc_map_tau, pm_tau2, pooled_or_unpooled, prediction_interval, \
    qprofile_ci, ready_for_production, reml_tau2

T0 = time.time()


def _contexts(seed=17, n=20, base=0.5, step=0.1, sd=0.2):
    """Genuinely multi-context fixture: per-context systematic offsets."""
    rng = random.Random(seed)
    return {"ctx%d" % k: [base + k * step + rng.gauss(0.0, sd) for _ in range(n)]
            for k in range(4)}


def _summaries(obs):
    return ({c: statistics.fmean(v) for c, v in obs.items()},
            {c: statistics.variance(v) / len(v) for c, v in obs.items()})


def test_shrinkage_direction_bounds():
    obs = _contexts()
    means, variances = _summaries(obs)
    assert max(means.values()) - min(means.values()) > 0.05  # multi-context, not copies
    out = partial_pool(means, variances)
    assert set(out["shrunk"]) == set(means) and set(out["lambdas"]) == set(means)
    assert all(math.isfinite(v) for v in list(out["shrunk"].values()) + list(out["lambdas"].values())
               + [out["lambda"], out["tau2"], out["mu"], out["ess"]])
    assert all(0.0 <= t <= 1.0 for t in list(out["lambdas"].values()) + [out["lambda"]])
    assert out["tau2"] >= 0.0 and 0.0 < out["ess"] <= len(means)
    lo, hi = min(means.values()), max(means.values())
    assert all(lo <= v <= hi for v in out["shrunk"].values())  # convex combo of y, mu
    assert all(abs(out["shrunk"][k] - out["mu"]) <= abs(means[k] - out["mu"])
               for k in means)  # toward mu, never past it
    assert out["tau2"] > 0.0 and out["shrunk"] != means  # engaged, not passthrough
    print("\npartial-pool tau2 %.5f lambda %.3f ess %.2f" % (out["tau2"], out["lambda"], out["ess"]))


def test_degenerate_paths():
    one = partial_pool({"a": 0.7}, {"a": 0.01})
    assert one["shrunk"] == {"a": 0.7} and one["lambda"] == 0.0 and "single cell" in one["method"]
    zero = partial_pool({"a": 0.2, "b": 0.5, "c": 0.8}, {"a": 0.0, "b": 0.01, "c": 0.02})
    assert zero["shrunk"] == {"a": 0.2, "b": 0.5, "c": 0.8} and "zero" in zero["method"]
    same = partial_pool({k: 0.5 for k in "abcd"}, {k: 0.01 for k in "abcd"})
    assert all(v == 0.5 for v in same["shrunk"].values()) and "dentical" in same["method"]
    for bad in (lambda: partial_pool({}, {}),
                lambda: partial_pool({"a": 1.0}, None),
                lambda: partial_pool({"a": 0.1, "b": 0.2}, {"a": 0.01}),
                lambda: partial_pool({"a": 0.1, "b": float("nan"), "c": 0.3},
                                      {"a": 0.01, "b": 0.01, "c": 0.01}),
                lambda: partial_pool({"a": 0.1, "b": 0.2, "c": float("inf")},
                                      {"a": 0.01, "b": 0.01, "c": 0.01}),
                lambda: partial_pool({"a": 0.1, "b": 0.2, "c": 0.3},
                                      {"a": 0.01, "b": -0.01, "c": 0.01})):
        try:
            bad()
        except ValueError:
            pass
        else:
            raise AssertionError("expected ValueError")
    outs = [one, zero, same,
            partial_pool({"a": 0.9, "b": 0.1, "c": 0.5}, {"a": 0.02, "b": 0.02, "c": 0.02})]
    assert all(math.isfinite(v) for o in outs for v in list(o["shrunk"].values())
               + [o["lambda"], o["tau2"], o["mu"], o["ess"]])  # no NaN paths
    assert all(o["ess"] > 0 for o in outs)


def test_loo_reports_all_three():
    obs = _contexts()
    assert max(statistics.fmean(v) for v in obs.values()) - \
        min(statistics.fmean(v) for v in obs.values()) > 0.05
    err = loo_errors(obs)
    assert {"pooled", "unpooled", "partial"} <= set(err) and err["n"] == 80
    assert all(math.isfinite(err[k]) and err[k] >= 0.0 for k in ("pooled", "unpooled", "partial"))
    print("\nLOO structured pooled %.5f unpooled %.5f partial %.5f (no winner asserted)"
          % (err["pooled"], err["unpooled"], err["partial"]))
    # Direction deliberately unasserted: single-realization gaps are noise-dominated.


def test_loo_can_fail_no_structure():
    rng = random.Random(99)  # far-apart precise cells: borrowing hurts
    obs = {"c%d" % k: [10.0 * k + rng.gauss(0.0, 0.05) for _ in range(10)] for k in range(3)}
    err = loo_errors(obs)
    assert all(math.isfinite(err[k]) for k in ("pooled", "unpooled", "partial"))
    print("\nLOO no-structure pooled %.4f unpooled %.5f partial %.5f"
          % (err["pooled"], err["unpooled"], err["partial"]))
    assert err["pooled"] > err["unpooled"]  # pooling loses: protocol reports honestly


def test_gate_refuses_synthetic():
    synth = {"s%d" % k: {"mean": 0.5 + 0.05 * k, "var": 0.01,
                         "measured": True, "synthetic": True} for k in range(5)}
    assert ready_for_production(synth) is False  # 5 cells, all synthetic
    mixed = {"m%d" % k: {"mean": 0.5, "var": 0.01, "measured": True, "synthetic": False}
             for k in range(2)}
    mixed.update({"s%d" % k: {"mean": 0.6, "var": 0.01, "measured": True, "synthetic": True}
                  for k in range(3)})
    assert ready_for_production(mixed) is False  # only 2 measured non-synthetic


def test_gate_admits_measured():
    cells = {"h%d" % k: {"mean": 0.5 + 0.05 * k, "var": 0.01,
                         "measured": True, "synthetic": False} for k in range(3)}
    cells.update({"s0": {"mean": 0.9, "var": 0.01, "measured": False, "synthetic": True}})
    assert ready_for_production(cells) is True
    exact3 = [{"mean": 0.4 + 0.1 * k, "var": 0.02, "measured": True, "synthetic": False}
              for k in range(3)]
    assert ready_for_production(exact3) is True  # list form, boundary J=3


def test_gate_flag_defaults():
    bare = {"c%d" % k: {"mean": 0.5 + 0.05 * k, "var": 0.01} for k in range(4)}
    assert ready_for_production(bare) is False  # absent flags -> synthetic/unmeasured
    no_synth = [{"mean": 0.5, "var": 0.01, "measured": True} for _ in range(4)]
    assert ready_for_production(no_synth) is False  # synthetic defaults True
    no_meas = [{"mean": 0.5, "var": 0.01, "synthetic": False} for _ in range(4)]
    assert ready_for_production(no_meas) is False  # measured defaults False
    assert ready_for_production({}) is False and ready_for_production(["junk", 3]) is False


def test_map_conflict_discount():
    agree = map_prior({("h%d" % k): m for k, m in enumerate([0.50, 0.52, 0.48, 0.51])},
                      {"h%d" % k: 0.01 for k in range(4)})
    conflict = map_prior({("h%d" % k): m for k, m in enumerate([0.1, 0.9, 0.2, 0.8])},
                         {"h%d" % k: 0.0001 for k in range(4)})
    for out in (agree, conflict):
        assert set(out["informative"]) == {"mean", "var"} and set(out["vague"]) == {"mean", "var"}
        assert all(math.isfinite(v) for v in (out["informative"]["mean"], out["informative"]["var"],
                                              out["vague"]["mean"], out["vague"]["var"],
                                              out["weight"], out["tau2"], out["conflict"]))
        assert 0.0 <= out["weight"] <= out["nominal_weight"] == 0.5
        assert out["vague"]["var"] == 1.0
    print("\nMAP agree w %.3f (H %.3f) vs conflict w %.4f (H %.3f)"
          % (agree["weight"], agree["conflict"], conflict["weight"], conflict["conflict"]))
    assert agree["weight"] > 0.25  # agreeing history keeps over half the nominal 0.5
    assert conflict["weight"] < 0.05  # conflicting history borrows ~nothing
    assert conflict["weight"] < 0.1 * agree["weight"]
    single = map_prior({"h0": 0.6}, {"h0": 0.01})
    assert single["weight"] == 0.5  # nothing to conflict with: nominal weight
    vague_only = map_prior({"a": 0.2, "b": 0.8}, {"a": 0.0, "b": 0.01})
    assert vague_only["weight"] == 0.0 and "vague-only" in vague_only["method"]
    try:
        map_prior({}, {})
    except ValueError:
        pass
    else:
        raise AssertionError("expected ValueError")


def test_module_hygiene():
    src = (ROOT / "reflex" / "pool.py").read_text(encoding="utf-8")
    for bad in ("numpy", "sklearn", "corpus", "LABELS", "reflex."):
        assert bad not in src  # no heavy deps, no corpus refs
    assert "scipy" in src  # ticket 18: chi2 + 1-D optimize adopted
    assert "statistics" in src and "math" in src
    assert time.time() - T0 < 60  # whole module budget (import-time T0 overestimates)


def test_map_moderate_conflict_partial_borrow():
    from reflex.pool import map_prior
    mid = map_prior({"a": 0.50, "b": 0.70}, {"a": 0.01, "b": 0.01})
    assert 0.0 < mid["weight"] < 0.5  # discounts, neither keeps nominal nor zeroes
    assert 0.0 < mid["conflict"] < 1.0


def test_loo_context_holds_out_whole_cells():
    from reflex.pool import loo_context_errors
    cells = {"a": [1.0 + 0.01 * i for i in range(10)],
             "b": [2.0 + 0.01 * i for i in range(10)],
             "c": [3.0 + 0.01 * i for i in range(10)]}
    rep = loo_context_errors(cells)
    assert rep["unpooled"] is None  # no same-cell data: nothing to report, not zero
    assert rep["n"] == 30
    assert all(math.isfinite(rep[k]) for k in ("pooled", "partial"))
    try:
        loo_context_errors({"only": [1.0, 2.0]})
    except ValueError:
        pass
    else:
        raise AssertionError("expected ValueError")


def test_loo_single_observation_zero_variance_cell():
    from reflex.pool import loo_errors
    rep = loo_errors({"a": [1.0], "b": [2.0, 2.0], "c": [3.0, 3.1]})
    assert rep["n"] == 5
    assert all(math.isfinite(rep[k]) for k in ("pooled", "unpooled", "partial"))


def test_cells_from_records_derives_provenance():
    from reflex.pool import cells_from_records, ready_for_production
    recs = [{"run_id": "f:1",
             "manifest": {"hardware": "t4", "fault": "stalls", "seed": 1},
             "bundle": {"synthetic": False}},
            {"run_id": "f:2",
             "manifest": {"hardware": "unknown", "fault": "stalls", "seed": 2},
             "bundle": {}}]
    cells = cells_from_records(recs)
    assert cells["f:1"] == {"measured": True, "synthetic": False,
                            "hardware": "t4", "hardware_known": True}
    assert cells["f:2"]["measured"] is False  # absent flag defaults unmeasured
    assert cells["f:2"]["hardware_known"] is False
    assert ready_for_production(cells) is False  # flags derived, self-certification impossible


# ---- Ticket 18: REML/PM + PC-MAP tau, Q-profile CI, prediction intervals ----
#
# Zero-collapse fixture (REAL: J=3, means spread ~1.0 = 7x the most precise
# SE, Q=1.63<df=2 so DL genuinely truncates, heterogeneity genuinely
# present): DL=0 but REML>0 and PC-MAP>0. PM stays 0.0 here -- honest, not
# slop: PM fires on Q(0)<=df, the identical boundary as DL with the same Q
# and df, so {PM>0}=={DL>0} always and a PM>0-on-DL-zero fixture cannot
# exist. Agreement fixture: J=8 equal-variance, all estimators identified.

_ZERO_M = {"a": 0.285, "b": -0.693, "c": -0.461}
_ZERO_V = {"a": 0.019, "b": 0.963, "c": 0.787}

_AGREE_M = {"c%d" % k: y for k, y in
            enumerate([0.2, 0.9, -0.4, 0.6, 0.1, 1.1, -0.2, 0.5])}
_AGREE_V = {"c%d" % k: 0.09 for k in range(8)}


def _t18_lists(means, variances):
    keys = list(means)
    return [float(means[k]) for k in keys], [float(variances[k]) for k in keys]


def _t18_q(y, v, t2):
    """Independent Q/mu/weight-sum reference (test's own formula)."""
    w = [1.0 / (t + t2) for t in v]
    s = math.fsum(w)
    mu = math.fsum(a * b for a, b in zip(w, y)) / s
    return math.fsum(a * (b - mu) ** 2 for a, b in zip(w, y)), mu, s


def _t18_reml_ll(y, v, t2):
    q, _, s = _t18_q(y, v, t2)
    return -0.5 * (math.fsum(math.log(t + t2) for t in v) + q + math.log(s))


def _t18_ml_ll(y, v, t2):
    q, _, _ = _t18_q(y, v, t2)
    return -0.5 * (math.fsum(math.log(t + t2) for t in v) + q)


def test_tau_zero_collapse_real():
    assert partial_pool(_ZERO_M, _ZERO_V)["tau2"] == 0.0  # Q=1.63 < df=2
    spread = max(_ZERO_M.values()) - min(_ZERO_M.values())
    assert spread / math.sqrt(min(_ZERO_V.values())) > 3.0  # REAL, not copies
    r = reml_tau2(_ZERO_M, _ZERO_V)
    assert 0.01 < r["tau2"] < 0.5 and math.isfinite(r["mu"])  # ~0.048
    assert pm_tau2(_ZERO_M, _ZERO_V)["tau2"] == 0.0  # same Q-boundary as DL
    pc = pc_map_tau(_ZERO_M, _ZERO_V)
    assert 0.02 < pc["tau"] < 1.0  # ~0.11: nonzero where DL truncates
    assert abs(pc["tau2"] - pc["tau"] ** 2) < 1e-15 and pc["U"] > 0
    assert pc["lambda"] == -math.log(pc["a"]) / pc["U"] and pc["a"] == 0.05
    print("\nzero-collapse dl 0 reml %.4f pm 0 pc-tau %.4f"
          % (r["tau2"], pc["tau"]))


def test_tau_agreement_well_identified():
    dl0 = partial_pool(_AGREE_M, _AGREE_V)["tau2"]
    assert dl0 > 0.1  # ~0.1814, heterogeneity identified
    assert abs(reml_tau2(_AGREE_M, _AGREE_V)["tau2"] - dl0) < 1e-4
    assert abs(pm_tau2(_AGREE_M, _AGREE_V)["tau2"] - dl0) < 1e-4
    assert pc_map_tau(_AGREE_M, _AGREE_V)["tau"] > 0.0
    ci = qprofile_ci(_AGREE_M, _AGREE_V)
    assert ci["tau2_lo"] <= dl0 <= ci["tau2_hi"]  # interval brackets the points


def test_estimators_match_grid_reference():
    for means, variances in ((_ZERO_M, _ZERO_V), (_AGREE_M, _AGREE_V)):
        y, v = _t18_lists(means, variances)
        df = len(y) - 1
        step, n = 0.0005, 4000  # brute-force grid over tau2 in [0, 2]
        r_grid = max((i * step for i in range(n + 1)),
                     key=lambda t: _t18_reml_ll(y, v, t))
        assert abs(reml_tau2(means, variances)["tau2"] - r_grid) <= 0.002
        p_grid = min(range(n + 1),
                     key=lambda i: abs(_t18_q(y, v, i * step)[0] - df)) * step
        assert abs(pm_tau2(means, variances)["tau2"] - p_grid) <= 0.002
        lam = -math.log(0.05) / statistics.stdev(y)
        pcm = max((0.001 + i * 0.001 for i in range(2000)),
                  key=lambda t: _t18_ml_ll(y, v, t * t) - lam * t + math.log(t))
        assert abs(pc_map_tau(means, variances)["tau"] - pcm) <= 0.003


def test_pc_map_within_1se_of_mle():
    y, v = _t18_lists(_AGREE_M, _AGREE_V)
    step = 0.0005
    mle = max((i * step for i in range(2001)),
              key=lambda t: _t18_ml_ll(y, v, t))
    assert mle > 0.05  # MLE>0: the criterion's precondition, brute-forced
    h = 1e-5
    f = lambda t: _t18_ml_ll(y, v, t)
    info = -(f(mle + h) - 2.0 * f(mle) + f(mle - h)) / h ** 2
    se_tau = (1.0 / math.sqrt(info)) / (2.0 * math.sqrt(mle))
    assert abs(pc_map_tau(_AGREE_M, _AGREE_V)["tau"] - math.sqrt(mle)) <= se_tau


def test_qprofile_covers_known_tau():
    rng = random.Random(18)
    n, cover = 150, 0
    for _ in range(n):
        vv = [rng.uniform(0.05, 0.2) for _ in range(5)]
        yy = [rng.gauss(0.0, math.sqrt(t + 0.25)) for t in vv]
        m = {"s%d" % k: yy[k] for k in range(5)}
        vd = {"s%d" % k: vv[k] for k in range(5)}
        ci = qprofile_ci(m, vd)
        assert ci["lo"] >= 0.0 and ci["lo"] <= ci["hi"] and ci["level"] == 0.95
        if ci["tau2_lo"] <= 0.25 <= ci["tau2_hi"]:
            cover += 1
    print("\nQ-profile coverage %d/%d = %.3f (true tau2 0.25)" % (cover, n, cover / n))
    assert cover / n >= 0.88  # 95% nominal; slack for Monte Carlo noise


def test_qprofile_j2_uninformative_wide():
    ci = qprofile_ci({"a": 0.0, "b": 0.15}, {"a": 0.25, "b": 0.25})
    assert ci["lo"] == 0.0 and ci["lo"] <= 0.5 <= ci["hi"]  # covers truth...
    assert ci["hi"] > 2.0  # ...and spans wide (~3.35): ignorance made visible


def test_pi_refuses_and_widths():
    m2, v2 = {"a": 0.1, "b": 0.4}, {"a": 0.04, "b": 0.04}
    for bad in (lambda: prediction_interval(m2, v2, kind="hts"),  # k=2 HTS
                lambda: prediction_interval({"a": 0.1}, {"a": 0.04}),  # k=1
                lambda: prediction_interval(m2, v2, kind="bogus"),
                lambda: prediction_interval({"a": 0.1, "b": 0.2},
                                            {"a": 0.0, "b": 0.01})):  # zero var
        try:
            bad()
        except ValueError:
            pass
        else:
            raise AssertionError("expected ValueError")
    n2 = prediction_interval(m2, v2, kind="normal")
    assert n2["lo"] < n2["mu"] < n2["hi"] and "Partlett-Riley" in n2["method"]
    h = prediction_interval(_AGREE_M, _AGREE_V, kind="hts")
    nn = prediction_interval(_AGREE_M, _AGREE_V, kind="normal")
    assert h["lo"] < h["mu"] < h["hi"] and "t_6" in h["method"]
    assert (h["hi"] - h["mu"]) > (nn["hi"] - nn["mu"])  # t wider than z
    print("\nPI hts [%.3f, %.3f] vs normal [%.3f, %.3f]"
          % (h["lo"], h["hi"], nn["lo"], nn["hi"]))


def test_prediction_interval_uses_noncollapsing_tau():
    from reflex.pool import prediction_interval, reml_tau2
    rep = prediction_interval(_ZERO_M, _ZERO_V)  # DL collapses to 0 here
    assert rep["tau2"] == reml_tau2(_ZERO_M, _ZERO_V)["tau2"] > 0.0
    assert rep["lo"] < rep["mu"] < rep["hi"]


def test_qprofile_ignorance_unbounded_above():
    from reflex.pool import qprofile_ci
    rep = qprofile_ci({"a": 1.0, "b": 1.0}, {"a": 0.1, "b": 0.1})
    assert rep["lo"] == 0.0 and rep["hi"] == float("inf")  # no dispersion: no upper bound, never [0, 0]


# ---- Ticket 19: borrow gate (each check individually falsifiable) ----
#
# Isolation fixtures (verified numerically): the heterogeneous box fixture
# has max conflict z 1.44 (veto passes) with Box-p ~8e-160; the conflict
# fixture (one +3-SE outlier in J=8) keeps Box-p 0.34 while its z hits 2.47;
# the homogeneous fixture has Box-p 0.99, zmax 0.22, ESS 4.0,
# PI [0.287, 0.718]. Each test refuses on the full gate and opens on
# disabling exactly that check; disabling any other check keeps it shut.

_BOX_M = {"c%d" % k: y for k, y in
          enumerate([0.2, 0.9, -0.4, 0.6, 0.1, 1.1, -0.2, 0.5])}
_BOX_V = {"c%d" % k: 0.0025 for k in range(8)}

_CONF_M = {"c%d" % k: 0.5 for k in range(7)}
_CONF_M["out"] = 0.5 + 3.0 * 0.3
_CONF_V = {k: 0.09 for k in _CONF_M}

_HOM_M = {"c%d" % k: y for k, y in enumerate([0.48, 0.52, 0.50, 0.51])}
_HOM_V = {"c%d" % k: 0.01 for k in range(4)}


def _t19_qref(means, variances):
    from scipy import stats as _st
    keys = list(means)
    y = [float(means[k]) for k in keys]
    v = [float(variances[k]) for k in keys]
    w = [1.0 / t for t in v]
    s = math.fsum(w)
    mu = math.fsum(a * b for a, b in zip(w, y)) / s
    q = math.fsum(a * (b - mu) ** 2 for a, b in zip(w, y))
    return q, len(keys) - 1, float(_st.chi2.sf(q, len(keys) - 1))


def test_borrow_gate_box_falsifiable():
    g = borrow_gate(_BOX_M, _BOX_V)
    assert g["borrow"] is False  # full gate refuses
    assert "heterogeneity unresolvable" in g["reason"] and "box" in g["reason"]
    box = g["checks"]["box"]
    q, df, p_ref = _t19_qref(_BOX_M, _BOX_V)  # independent tail reference
    assert box["q"] == q and box["df"] == df
    assert abs(box["p"] - p_ref) < 1e-12 * max(1.0, p_ref)  # computed, never hardcoded
    assert box["p"] < 0.05
    assert g["checks"]["conflict"]["pass"]  # zmax 1.44: veto is not the refuser
    assert g["checks"]["ess"]["pass"] and g["checks"]["pi"]["pass"]
    assert borrow_gate(_BOX_M, _BOX_V, check_box=False)["borrow"] is True
    for other in ("check_conflict", "check_ess", "check_pi"):
        assert borrow_gate(_BOX_M, _BOX_V, **{other: False})["borrow"] is False
    bumped = dict(_BOX_M)
    bumped["c0"] += 5.0  # genuinely computed: moving data moves p
    assert borrow_gate(bumped, _BOX_V)["checks"]["box"]["p"] != box["p"]


def test_borrow_gate_conflict_falsifiable():
    g = borrow_gate(_CONF_M, _CONF_V)
    assert g["borrow"] is False
    assert "heterogeneity unresolvable" in g["reason"] and "conflict" in g["reason"]
    assert g["checks"]["box"]["pass"]  # p 0.34: Box-p is not the refuser
    assert g["checks"]["box"]["p"] >= 0.05
    assert g["checks"]["conflict"]["zmax"] > 2.0  # the outlier, genuinely z-scored
    assert g["checks"]["ess"]["pass"] and g["checks"]["pi"]["pass"]
    assert borrow_gate(_CONF_M, _CONF_V, check_conflict=False)["borrow"] is True
    for other in ("check_box", "check_ess", "check_pi"):
        assert borrow_gate(_CONF_M, _CONF_V, **{other: False})["borrow"] is False


def test_borrow_gate_ess_falsifiable():
    g = borrow_gate(_HOM_M, _HOM_V, ess_cap=2.0)
    assert g["borrow"] is False  # ESS 4.0 > cap 2.0
    assert "heterogeneity unresolvable" in g["reason"] and "ess" in g["reason"]
    assert g["checks"]["box"]["pass"] and g["checks"]["conflict"]["pass"]
    assert g["checks"]["pi"]["pass"]
    assert borrow_gate(_HOM_M, _HOM_V, ess_cap=2.0, check_ess=False)["borrow"] is True
    for other in ("check_box", "check_conflict", "check_pi"):
        assert borrow_gate(_HOM_M, _HOM_V, ess_cap=2.0,
                           **{other: False})["borrow"] is False


def test_borrow_gate_pi_falsifiable():
    g = borrow_gate(_HOM_M, _HOM_V, threshold=0.6)  # PI lo 0.287 clears nothing
    assert g["borrow"] is False
    assert "heterogeneity unresolvable" in g["reason"] and "pi" in g["reason"]
    assert g["checks"]["pi"]["lo"] < 0.6 <= g["checks"]["pi"]["hi"]
    assert g["checks"]["box"]["pass"] and g["checks"]["conflict"]["pass"]
    assert g["checks"]["ess"]["pass"]
    assert borrow_gate(_HOM_M, _HOM_V, threshold=0.6, check_pi=False)["borrow"] is True
    for other in ("check_box", "check_conflict", "check_ess"):
        assert borrow_gate(_HOM_M, _HOM_V, threshold=0.6,
                           **{other: False})["borrow"] is False


def test_borrow_gate_all_pass_borrows_and_consult():
    from reflex.pool import cells_from_records
    g = borrow_gate(_HOM_M, _HOM_V, ess_cap=8.0, threshold=0.0)
    assert g["borrow"] is True  # the gate can open: not a universal refuser
    assert g["tau2"] >= 0.0 and g["ess"] > 0.0 and math.isfinite(g["mu"])
    recs = [{"run_id": "r%d" % k,
             "manifest": {"hardware": "t4", "fault": "x", "seed": k},
             "bundle": {"synthetic": False}} for k in range(3)]
    cells = cells_from_records(recs)  # provenance derived, never asserted
    assert ready_for_production(cells) is True
    r = pooled_or_unpooled(_HOM_M, _HOM_V, cells=cells,
                           ess_cap=8.0, threshold=0.0)
    assert r["borrowed"] is True and r["trusted"] == "pooled"
    shrunk = partial_pool(_HOM_M, _HOM_V)["shrunk"]
    assert set(r["estimate"]) == set(shrunk)
    assert all(abs(r["estimate"][k] - shrunk[k]) < 1e-12 for k in shrunk)
    assert 0.0 <= r["map"]["weight"] <= 0.5 and 0.0 <= r["map"]["conflict"] <= 1.0
    synth = cells_from_records(
        [{"run_id": "s%d" % k,
          "manifest": {"hardware": "unknown", "fault": "x", "seed": k},
          "bundle": {"synthetic": True}} for k in range(5)])
    r2 = pooled_or_unpooled(_HOM_M, _HOM_V, cells=synth,
                            ess_cap=8.0, threshold=0.0)
    assert r2["borrowed"] is False and r2["trusted"] == "unpooled"
    assert r2["estimate"] == dict(_HOM_M)  # raw means, nothing borrowed
    assert "heterogeneity unresolvable" in r2["reason"]
    r3 = pooled_or_unpooled(_HOM_M, _HOM_V, cells=None,
                            ess_cap=8.0, threshold=0.0)
    assert r3["borrowed"] is False  # no provenance: fail-closed
    try:
        borrow_gate(_HOM_M, None)
    except ValueError:
        pass
    else:
        raise AssertionError("expected ValueError")  # refusing to invent a noise scale
