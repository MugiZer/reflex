"""Ticket 17: partial-pooling ranker + MAP prior (silicon-gated promotion).

Varying-intercept partial pooling over J context cells (fault family x
hardware): per-cell observed means + sampling variances -> DerSimonian-Laird
tau^2, per-cell shrunken estimates toward the random-effects mean, pooling
factor lambda in [0,1] (1 = full pooling to mu, 0 = raw passthrough), and
Kish effective sample size (ESS > 0 always).

Estimator (closed form, stdlib only)::

    w_i = 1/v_i;  mu_fe = sum(w*y)/sum(w);  Q = sum(w*(y - mu_fe)^2)
    C = sum(w) - sum(w^2)/sum(w);  tau2 = max(0, (Q - (J-1)) / C)
    w*_i = 1/(v_i + tau2);  mu = sum(w*y)/sum(w)
    lam_i = v_i/(v_i + tau2);  shrunk_i = lam_i*mu + (1-lam_i)*y_i
    ESS = sum(w*)^2 / sum(w*^2) in [1, J]

Degenerate inputs fall back to raw means (never NaN, never fabricated
precision): single cell (nothing to borrow across), any zero sampling
variance (no honest weight exists), or identical values. ``variances=None``
raises instead of inventing a noise scale.

``map_prior`` builds a robust conjugate-style mixture for new-context
calibration: informative component (precision-weighted history mean/var) +
vague component, with conflict discount ``w_eff = w0 * (1 - H)`` where
``H = tau2/(tau2 + s2bar)``: agreeing history keeps ~nominal weight,
conflicting history borrows ~nothing.

``loo_errors`` runs leave-one-observation-out over {cell: [obs]} and reports
pooled / unpooled / partial MSE with no winner asserted -- a machinery
protocol, not a pooling-beats-all claim.

``ready_for_production`` is the promotion gate: True only with >=3 measured
non-synthetic contexts, keyed off explicit caller-supplied provenance flags
(``measured`` defaults False, ``synthetic`` defaults True, so unflagged cells
refuse). Machinery never auto-promotes.

# ponytail: DL moment estimator for tau2; the NEST half-Cauchy-prior /
# MCMC-sampled tau (full hierarchical Bayes) is the documented upgrade
# when uncertainty on tau itself matters -- not this slice.
# ponytail: Kish ESS on RE weights; model-based ESS traces are the
# upgrade -- not this slice.
# ponytail: vague component reuses the history center with caller-scale
# variance; an elicited / benchmark-anchored vague center is the upgrade.
#
# Ticket 18: REML + Paule-Mandel tau^2 beside DL (sensitivity pair),
# PC-exponential MAP tau as primary point (P(tau>U)=a, U/a/lambda logged,
# log-scale MAP so tau_hat>0 always), Q-profile CI for tau (ignorance made
# visible), and new-context prediction intervals (HTS t_{k-2}, refusing k<3;
# normal-approx PI carries the Partlett-Riley caveat). DL untouched as legacy
# comparator. scipy (chi2 + 1-D optimize) is the adopted dependency here.
# ponytail: 1-D optimize + bisection instead of a sampler; the NEST
# half-Cauchy-prior / MCMC-sampled tau (full hierarchical Bayes) stays the
# documented upgrade when uncertainty on tau itself must propagate.
#
# Ticket 19: borrow gate + production consult point. Default unpooled: borrow
# iff Box-p passes AND every context conflict z<=2 AND ESS_borrow capped AND
# the new-context PI clears the action threshold, else abstain with
# "heterogeneity unresolvable". Box-p is the Cochran-Q chi2 tail genuinely
# computed from the cells (analytic prior-predictive check; NEST
# posterior-predictive simulation is the upgrade). Conflict z reuses the DL
# RE mean/tau2, ESS reuses partial_pool, the PI reuses prediction_interval
# (HTS), the new-context prior reuses map_prior, provenance reuses
# cells_from_records + ready_for_production. pooled_or_unpooled is THE
# consult point for production paths (eval harness + any refit-style
# consumer): no pooled estimate is trusted unless the gate passes on
# measured evidence. There is no refit module: the call convention IS
# pooled_or_unpooled(means, variances, cells=cells_from_records(records)),
# trusting estimate only when borrowed is True, else using the raw
# (unpooled) means. cells=None fails closed (unpooled, never asserted).
# ponytail: one-sided above-bar PI form; callers with below-bar actions
# mirror the sign. ponytail: ess_cap=None means uncapped (ESS still
# reported); set a cap when borrowing must not claim near-full pooling.
"""
from __future__ import annotations

import math
import statistics

from scipy import optimize, stats

METHOD = ("dersimonian-laird random-effects toward RE mean "
          "(per-cell heteroscedastic v_i; NEST half-Cauchy/MCMC tau is the upgrade)")

MAP_METHOD = ("robust MAP mixture: precision-weighted informative + vague "
               "(conflict discount via H = tau2/(tau2+s2bar); "
               "NEST elicited vague center is the upgrade)")

REML_METHOD = ("REML tau2 via 1-D restricted-likelihood optimize "
               "(sensitivity pair with Paule-Mandel beside DL; "
               "NEST half-Cauchy/MCMC tau is the upgrade)")

PM_METHOD = ("Paule-Mandel tau2 via Q(tau2)=df root "
             "(same Q<=df truncation boundary as DL -- honest agreement there, "
             "sensitivity elsewhere; NEST half-Cauchy/MCMC tau is the upgrade)")

PC_METHOD = ("PC-exponential MAP tau, P(tau>U)=a, log-scale MAP "
             "(straight tau-scale MAP collapses to exactly 0 since the "
             "penalty slope -lambda wins at the origin, hence the log "
             "parameterization with +log-tau Jacobian; tau_hat>0 always; "
             "NEST half-Cauchy/MCMC tau is the upgrade)")

QCI_METHOD = ("Q-profile CI for tau via scipy chi2 inversion "
              "(Viechtbauer 2007; exact under known s_i^2; "
              "spans [0, huge] when tau is unidentified)")

PI_METHOD = ("new-context prediction interval, never a confidence interval "
             "(HTS t_{k-2} with DL tau2; "
             "NEST bootstrap/Bayesian PI is the upgrade)")

_PC_EPS_T2 = 1e-12  # auditable floor keeping PC tau_hat>0 on degenerate inputs


def _checked(means, variances):
    if not means:
        raise ValueError("partial pooling needs at least one cell estimate")
    if variances is None:
        raise ValueError("partial pooling needs sampling variances (refusing to invent a noise scale)")
    if set(variances) != set(means):
        raise ValueError("means/variances key mismatch: %s vs %s"
                         % (sorted(means), sorted(variances)))
    for k in means:
        for v, tag in ((means[k], "means"), (variances[k], "variances")):
            if not isinstance(v, (int, float)) or not math.isfinite(v):
                raise ValueError("non-finite %s[%r]: %r" % (tag, k, v))
            if tag == "variances" and v < 0:
                raise ValueError("negative variances[%r]: %r" % (k, v))
    keys = list(means)
    y = [float(means[k]) for k in keys]
    v = [float(variances[k]) for k in keys]
    return keys, y, v


def _raw(keys, y, v, lam, tau2, ess, mu, why):
    return {"shrunk": dict(zip(keys, y)),
            "lambdas": {k: lam for k in keys}, "lambda": lam,
            "tau2": tau2, "mu": mu, "ess": ess,
            "method": METHOD + "; " + why}


def partial_pool(means: dict, variances: dict | None = None) -> dict:
    """Shrink per-cell means toward the DL random-effects mean.

    Returns {"shrunk", "lambdas", "lambda" (mean), "tau2", "mu", "ess",
    "method"}. Degenerate cases return raw means with the reason in
    "method" (lambda 0.0 = no borrowing, except identical values where
    tau2 = 0 forces full-pool weights onto a mean equal to every cell).
    """
    keys, y, v = _checked(means, variances)
    j = len(keys)
    grand = statistics.fmean(y)
    if j < 2:
        return _raw(keys, y, v, 0.0, 0.0, 1.0, grand,
                    "single cell (J=1): nothing to borrow across, raw means")
    if any(t <= 0 for t in v):
        return _raw(keys, y, v, 0.0, 0.0, 1.0, grand,
                    "zero sampling variance: refusing to invent precision, raw means")
    if max(y) - min(y) <= 0:
        return _raw(keys, y, v, 1.0, 0.0, float(j), grand,
                    "identical values (Q=0): raw means")
    tau2, mu_fe, q, c = _dl_tau2(y, v)
    if c <= 0:
        return _raw(keys, y, v, 0.0, 0.0, 1.0, grand,
                    "degenerate weight geometry (C<=0): raw means")
    ws = [1.0 / (t + tau2) for t in v]
    sumws = math.fsum(ws)
    mu = math.fsum(a * b for a, b in zip(ws, y)) / sumws
    lams = [t / (t + tau2) for t in v]
    ess = sumws * sumws / math.fsum(a * a for a in ws)
    return {"shrunk": {k: lam * mu + (1.0 - lam) * val
                       for k, lam, val in zip(keys, lams, y)},
            "lambdas": dict(zip(keys, lams)),
            "lambda": statistics.fmean(lams),
            "tau2": tau2, "mu": mu, "ess": ess,
            "method": METHOD + "; applied"}


def _dl_tau2(y, v):
    j = len(y)
    w = [1.0 / t for t in v]
    sumw = math.fsum(w)
    mu_fe = math.fsum(a * b for a, b in zip(w, y)) / sumw
    q = math.fsum(a * (b - mu_fe) ** 2 for a, b in zip(w, y))
    c = sumw - math.fsum(a * a for a in w) / sumw
    tau2 = max(0.0, (q - (j - 1)) / c) if c > 0 else 0.0
    return tau2, mu_fe, q, c


def _re_mu_q(y, v, t2):
    w = [1.0 / (t + t2) for t in v]
    sumw = math.fsum(w)
    mu = math.fsum(a * b for a, b in zip(w, y)) / sumw
    q = math.fsum(a * (b - mu) ** 2 for a, b in zip(w, y))
    return sumw, mu, q


def _q_of(y, v, t2):
    return _re_mu_q(y, v, t2)[2]


def _reml_ll(y, v, t2):
    sumw, _, q = _re_mu_q(y, v, t2)
    return -0.5 * (math.fsum(math.log(t + t2) for t in v) + q + math.log(sumw))


def _ml_ll(y, v, t2):
    return -0.5 * (math.fsum(math.log(t + t2) for t in v) + _q_of(y, v, t2))


def _tau_degenerate(y, v):
    if len(y) < 2:
        return "single cell (J=1): nothing to borrow across, tau2 0.0"
    if any(t <= 0 for t in v):
        return "zero sampling variance: refusing to invent precision, tau2 0.0"
    if max(y) - min(y) <= 0:
        return "identical values (Q=0): tau2 0.0"
    return None


def _default_hi(y, v):
    return max(1.0, 10.0 * statistics.pvariance(y) + max(v))


def _max_1d(neg, hi):
    for _ in range(12):
        r = optimize.minimize_scalar(neg, bounds=(0.0, hi), method="bounded",
                                     options={"xatol": 1e-12})
        if r.x <= 0.999 * hi or hi >= 1e12:
            return max(0.0, r.x)
        hi *= 4.0
    # ponytail: hi cap 1e12; still-growing likelihood past it is the non-case
    return max(0.0, r.x)


def _q_root(y, v, target):
    f = lambda t2: _q_of(y, v, t2) - target  # Q falls monotonically to 0
    hi = 1.0
    while f(hi) > 0.0 and hi < 1e15:
        hi *= 2.0
    if f(hi) > 0.0:
        return float("inf")  # ponytail: Q ~ S/t2 decay; non-decay is the non-case
    return optimize.brentq(f, 0.0, hi, xtol=1e-12)


def reml_tau2(means: dict, variances: dict | None = None) -> dict:
    """REML tau^2: argmax of the restricted log-likelihood over tau2 >= 0.

    Returns {"tau2", "mu" (RE mean at tau2), "method"}. Degenerate inputs
    reuse the pool conventions (tau2 0.0 with the reason in "method").
    """
    keys, y, v = _checked(means, variances)
    why = _tau_degenerate(y, v)
    if why is not None:
        return {"tau2": 0.0, "mu": statistics.fmean(y),
                "method": REML_METHOD + "; " + why}
    t2 = _max_1d(lambda t: -_reml_ll(y, v, t), _default_hi(y, v))
    _, mu, _ = _re_mu_q(y, v, t2)
    return {"tau2": t2, "mu": mu, "method": REML_METHOD + "; applied"}


def pm_tau2(means: dict, variances: dict | None = None) -> dict:
    """Paule-Mandel tau^2: root of Q(tau2) = J-1, else 0.0 when Q(0) <= J-1.

    Returns {"tau2", "mu", "method"}. The Q(0)<=J-1 truncation is the same
    boundary as DL (both fire exactly when Q(0)<=df), so PM agrees with DL
    there and can only differ where DL is already nonzero.
    """
    keys, y, v = _checked(means, variances)
    why = _tau_degenerate(y, v)
    if why is not None:
        return {"tau2": 0.0, "mu": statistics.fmean(y),
                "method": PM_METHOD + "; " + why}
    q0 = _q_of(y, v, 0.0)
    if q0 <= len(keys) - 1:
        return {"tau2": 0.0, "mu": statistics.fmean(y),
                "method": PM_METHOD + "; Q<=df: truncating to 0.0 (DL boundary)"}
    t2 = _q_root(y, v, len(keys) - 1)
    _, mu, _ = _re_mu_q(y, v, t2)
    return {"tau2": t2, "mu": mu, "method": PM_METHOD + "; applied"}


def pc_map_tau(means: dict, variances: dict | None = None,
               U=None, a=0.05) -> dict:
    """PC-exponential MAP tau (primary point): P(tau>U)=a, U defaults to sd(y).

    Log-scale MAP (phi=log tau, +log-tau Jacobian), multi-start 1-D
    optimize; tau_hat>0 always. Returns {"tau", "tau2", "U", "a", "lambda",
    "method"} with the penalty fully logged. Degenerate inputs report the
    auditable eps floor instead of inventing heterogeneity.
    """
    if not isinstance(a, (int, float)) or not math.isfinite(a) \
            or not 0.0 < a < 1.0:
        raise ValueError("a not in (0,1): %r" % (a,))
    keys, y, v = _checked(means, variances)
    why = _tau_degenerate(y, v)
    if U is None:
        U = statistics.stdev(y) if why is None else None
    if U is not None:
        if not isinstance(U, (int, float)) or not math.isfinite(U) or U <= 0:
            raise ValueError("U must be positive: %r" % (U,))
        U = float(U)
    a = float(a)
    if why is not None or U is None:
        lam = -math.log(a) / U if U else None
        return {"tau": math.sqrt(_PC_EPS_T2), "tau2": _PC_EPS_T2,
                "U": U, "a": a, "lambda": lam,
                "method": PC_METHOD + "; %s, eps floor %g"
                % (why or "U undefined", _PC_EPS_T2)}
    lam = -math.log(a) / U
    dl0, _, _, _ = _dl_tau2(y, v)

    def neg(phi):
        t = math.exp(phi)
        return -(_ml_ll(y, v, t * t) - lam * t + phi)

    starts = (math.log(max(1e-8, math.sqrt(max(_PC_EPS_T2, dl0)))),
              math.log(1.0 / lam), math.log(U))
    best = min((optimize.minimize_scalar(neg, bounds=(s - 8.0, s + 8.0),
                                         method="bounded",
                                         options={"xatol": 1e-10}).x
                for s in starts), key=lambda p: neg(p))
    tau = math.exp(best)
    return {"tau": tau, "tau2": tau * tau, "U": U, "a": a, "lambda": lam,
            "method": PC_METHOD + "; applied (U=%.4g, a=%.4g)" % (U, a)}


def qprofile_ci(means: dict, variances: dict | None = None,
                level=0.95) -> dict:
    """Q-profile CI for tau: invert Q(tau2) against scipy chi2 quantiles.

    Returns {"lo", "hi" (tau scale), "tau2_lo", "tau2_hi", "level",
    "method"}. Refuses J<2 and zero sampling variance (no honest Q exists);
    Q=0 data yields [0, inf): no observed dispersion means no upper bound,
    never a point claim of zero heterogeneity.
    """
    if not isinstance(level, (int, float)) or not math.isfinite(level) \
            or not 0.0 < level < 1.0:
        raise ValueError("level not in (0,1): %r" % (level,))
    keys, y, v = _checked(means, variances)
    if len(keys) < 2:
        raise ValueError("qprofile_ci needs at least two cells (df=0 has no chi2)")
    if any(t <= 0 for t in v):
        raise ValueError("qprofile_ci refuses zero sampling variance (no honest Q)")
    if max(y) - min(y) <= 0:
        return {"lo": 0.0, "hi": float("inf"), "tau2_lo": 0.0,
                "tau2_hi": float("inf"), "level": level,
                "method": QCI_METHOD + "; Q=0: no dispersion observed, unbounded above"}
    alpha = 1.0 - level
    df = len(keys) - 1
    chi_lo = stats.chi2.ppf(alpha / 2.0, df)
    chi_hi = stats.chi2.ppf(1.0 - alpha / 2.0, df)
    q0 = _q_of(y, v, 0.0)
    t_lo = 0.0 if q0 <= chi_hi else _q_root(y, v, chi_hi)
    t_hi = 0.0 if q0 <= chi_lo else _q_root(y, v, chi_lo)
    return {"lo": math.sqrt(t_lo), "hi": math.sqrt(t_hi),
            "tau2_lo": t_lo, "tau2_hi": t_hi, "level": level,
            "method": QCI_METHOD + "; applied (df=%d)" % df}


def prediction_interval(means: dict, variances: dict | None = None,
                        level=0.95, kind="hts") -> dict:
    """New-context prediction interval (never a confidence interval).

    kind="hts": mu +- t_{k-2} * sqrt(tau2 + se2), refuses k<3 (df<=0).
    kind="normal": z-approx at k>=2, carrying the Partlett-Riley caveat
    (ignores uncertainty in tau and mu, undercovers at small k).
    tau2 is REML (never the collapsing DL point: the interval must stay
    honest exactly where heterogeneity is uncertain); se2 = 1/sum(w*).
    Refuses J<2 and zero sampling variance.
    """
    if kind not in ("hts", "normal"):
        raise ValueError("kind must be 'hts' or 'normal': %r" % (kind,))
    if not isinstance(level, (int, float)) or not math.isfinite(level) \
            or not 0.0 < level < 1.0:
        raise ValueError("level not in (0,1): %r" % (level,))
    keys, y, v = _checked(means, variances)
    k = len(keys)
    if k < 2:
        raise ValueError("prediction_interval needs at least two cells")
    if any(t <= 0 for t in v):
        raise ValueError("prediction_interval refuses zero sampling variance "
                         "(no honest precision)")
    if kind == "hts" and k < 3:
        raise ValueError("HTS t_{k-2} prediction interval refuses k<3 "
                         "(df<=0): report local-only")
    t2 = reml_tau2(dict(zip(keys, y)), dict(zip(keys, v)))["tau2"]
    sumw, mu, _ = _re_mu_q(y, v, t2)
    se2 = 1.0 / sumw
    half_sd = math.sqrt(t2 + se2)
    alpha = 1.0 - level
    if kind == "hts":
        crit = stats.t.ppf(1.0 - alpha / 2.0, k - 2)
        note = "HTS t_%d crit %.3f" % (k - 2, crit)
    else:
        crit = statistics.NormalDist().inv_cdf(1.0 - alpha / 2.0)
        note = ("normal approx crit %.3f; Partlett-Riley caveat: ignores "
                "uncertainty in tau and mu, undercovers at small k -- "
                "HTS form preferred at k>=3" % crit)
    half = crit * half_sd
    return {"lo": mu - half, "hi": mu + half, "mu": mu, "tau2": t2,
            "se2": se2, "level": level, "kind": kind,
            "method": PI_METHOD + "; " + note}


def map_prior(history_means, history_vars, weight=0.5, vague_var=1.0) -> dict:
    """Robust MAP-style mixture from history cells.

    Returns {"informative": {"mean", "var"}, "vague": {"mean", "var"},
    "weight" (effective informative weight), "nominal_weight", "tau2",
    "conflict" H, "method"}. Vague weight is 1 - weight; weights sum to 1.
    Zero-variance history falls back to vague-only (weight 0.0) with reason.
    """
    if not history_means:
        raise ValueError("map_prior needs at least one history cell")
    if history_vars is None:
        raise ValueError("map_prior needs history sampling variances")
    keys, y, v = _checked(dict(history_means), dict(history_vars))
    for tag, val in (("weight", weight), ("vague_var", vague_var)):
        if not isinstance(val, (int, float)) or not math.isfinite(val):
            raise ValueError("non-finite %s: %r" % (tag, val))
    if not 0.0 <= weight <= 1.0:
        raise ValueError("weight not in [0,1]: %r" % (weight,))
    if vague_var <= 0:
        raise ValueError("vague_var must be positive: %r" % (vague_var,))
    weight, vague_var = float(weight), float(vague_var)
    if any(t <= 0 for t in v):
        mu0 = statistics.fmean(y)
        return {"informative": {"mean": mu0, "var": float("inf")},
                "vague": {"mean": mu0, "var": vague_var},
                "weight": 0.0, "nominal_weight": weight,
                "tau2": 0.0, "conflict": 1.0,
                "method": MAP_METHOD + "; zero history variance: vague-only"}
    sumw = math.fsum(1.0 / t for t in v)
    mu_fe = math.fsum(a / b for a, b in zip(y, v)) / sumw
    v_fe = 1.0 / sumw
    if len(keys) < 2:
        return {"informative": {"mean": mu_fe, "var": v_fe},
                "vague": {"mean": mu_fe, "var": vague_var},
                "weight": weight, "nominal_weight": weight,
                "tau2": 0.0, "conflict": 0.0,
                "method": MAP_METHOD + "; single history cell: nominal weight"}
    tau2, _, _, _ = _dl_tau2(y, v)
    s2bar = statistics.fmean(v)
    h = tau2 / (tau2 + s2bar)
    return {"informative": {"mean": mu_fe, "var": v_fe},
            "vague": {"mean": mu_fe, "var": vague_var},
            "weight": weight * (1.0 - h), "nominal_weight": weight,
            "tau2": tau2, "conflict": h,
            "method": MAP_METHOD + "; applied"}


def loo_errors(cells: dict) -> dict:
    """Leave-one-observation-out MSE for pooled/unpooled/partial predictors.

    ``cells``: {context: [observations]} (>=2 contexts, >=1 obs each, all
    finite). For each held-out observation: pooled predicts the training
    grand mean; unpooled predicts the training same-cell mean (training
    grand mean when the cell empties); partial predicts the training
    ``partial_pool`` shrunken estimate for that cell (the RE mean when the
    cell empties -- no within-cell data means nothing unpooled to shrink).
    Reports all three MSEs with no winner asserted.
    """
    if not isinstance(cells, dict) or not cells:
        raise ValueError("loo_errors needs {context: [observations]}")
    names = list(cells)
    if len(names) < 2:
        raise ValueError("loo_errors needs at least two contexts")
    obs = {}
    for name in names:
        vals = cells[name]
        if not isinstance(vals, (list, tuple)) or not vals:
            raise ValueError("context %r needs at least one observation" % (name,))
        for x in vals:
            if not isinstance(x, (int, float)) or not math.isfinite(x):
                raise ValueError("non-finite obs in %r: %r" % (name, x))
        obs[name] = [float(x) for x in vals]
    sse = {"pooled": 0.0, "unpooled": 0.0, "partial": 0.0}
    n = 0
    idx = [(name, k) for name in names for k in range(len(obs[name]))]
    for name, k in idx:
        train_all = [x for nm in names for j, x in enumerate(obs[nm])
                     if not (nm == name and j == k)]
        pooled = statistics.fmean(train_all)
        train_cell = [x for j, x in enumerate(obs[name]) if j != k]
        unpooled = statistics.fmean(train_cell) if train_cell else pooled
        tmeans, tvars = {}, {}
        for nm in names:
            vals = [x for j, x in enumerate(obs[nm])
                    if not (nm == name and j == k)]
            if not vals:
                continue
            tmeans[nm] = statistics.fmean(vals)
            tvars[nm] = (statistics.variance(vals) / len(vals)
                         if len(vals) >= 2 and statistics.variance(vals) > 0 else 0.0)
        out = partial_pool(tmeans, tvars)
        partial = out["shrunk"].get(name, out["mu"])
        held = obs[name][k]
        sse["pooled"] += (pooled - held) ** 2
        sse["unpooled"] += (unpooled - held) ** 2
        sse["partial"] += (partial - held) ** 2
        n += 1
    return {"pooled": sse["pooled"] / n, "unpooled": sse["unpooled"] / n,
            "partial": sse["partial"] / n, "n": n,
            "method": "leave-one-observation-out MSE over %d obs; no winner asserted" % n}


def loo_context_errors(cells: dict) -> dict:
    """Leave-one-CONTEXT-out: hold out ALL obs of each cell in turn and
    predict them from the remaining cells. Pooled predicts the train grand
    mean; partial predicts the DL random-effects mean over train cells;
    unpooled is None -- with no same-cell data there is nothing unpooled to
    predict from, and reporting a number would invent generalization the
    method does not have. Reports MSEs with no winner asserted."""
    if not isinstance(cells, dict) or not cells:
        raise ValueError("loo_context_errors needs {context: [observations]}")
    names = list(cells)
    if len(names) < 2:
        raise ValueError("loo_context_errors needs at least two contexts")
    obs = {}
    for name in names:
        vals = cells[name]
        if not isinstance(vals, (list, tuple)) or not vals:
            raise ValueError("context %r needs at least one observation" % (name,))
        for x in vals:
            if not isinstance(x, (int, float)) or not math.isfinite(x):
                raise ValueError("non-finite obs in %r: %r" % (name, x))
        obs[name] = [float(x) for x in vals]
    se = {"pooled": 0.0, "partial": 0.0}
    n = 0
    for held in names:
        train = {nm: v for nm, v in obs.items() if nm != held}
        flat = [x for v in train.values() for x in v]
        pooled = statistics.fmean(flat)
        tmeans = {nm: statistics.fmean(v) for nm, v in train.items()}
        tvars = {nm: (statistics.variance(v) / len(v)
                      if len(v) >= 2 and statistics.variance(v) > 0 else 0.0)
                 for nm, v in train.items()}
        out = partial_pool(tmeans, tvars)
        for x in obs[held]:
            se["pooled"] += (pooled - x) ** 2
            se["partial"] += (out["mu"] - x) ** 2
            n += 1
    return {"pooled": se["pooled"] / n, "partial": se["partial"] / n,
            "unpooled": None, "n": n,
            "method": ("leave-one-context-out MSE over %d obs; unpooled is "
                       "null (does not generalize); no winner asserted" % n)}


GATE_METHOD = ("borrow gate: default unpooled; borrow iff Box-p passes "
                 "and every context conflict z<=2 and ESS_borrow capped "
                 "and new-context PI clears the action threshold "
                 "(Box-p is the Cochran-Q chi2 tail computed from the cells; "
                 "NEST posterior-predictive simulation is the upgrade)")

CONSULT_METHOD = ("production consult: pooled estimate trusted only when "
                  "the borrow gate passes on measured evidence "
                  "(cells_from_records provenance + ready_for_production); "
                  "else raw unpooled means with the unresolvable reason")


def _box_p(y, v):
    """Cochran-Q prior-predictive tail, genuinely computed from the cells."""
    q = _q_of(y, v, 0.0)
    _, mu_fe, _ = _re_mu_q(y, v, 0.0)
    df = len(y) - 1
    return q, df, float(stats.chi2.sf(q, df)), mu_fe


def borrow_gate(means: dict, variances: dict | None = None,
                box_alpha=0.05, z_cap=2.0, ess_cap=None,
                threshold=None, level=0.95,
                check_box=True, check_conflict=True,
                check_ess=True, check_pi=True) -> dict:
    """Borrow gate: default unpooled; borrow only when every enabled check passes.

    Checks (each disablable alone, so each is individually falsifiable):
    box (Box-p = chi2 tail of Cochran Q >= alpha; refuses J<2 and zero
    sampling variance -- no honest Q exists), conflict (every context
    z=|y-mu|/sqrt(v+tau2) <= z_cap off the reused DL RE mean/tau2; refuses
    where z is undefined), ess (Kish ESS from partial_pool <= ess_cap;
    ess_cap=None passes uncapped), pi (HTS new-context PI from
    prediction_interval clears the action bar, lo > threshold;
    threshold=None passes with no bar set; an unavailable PI fails closed).
    Any refusal abstains with "heterogeneity unresolvable: <check>".
    Returns {"borrow", "reason", "checks", "tau2", "ess", "mu", "method"}.
    """
    if not isinstance(box_alpha, (int, float)) or not math.isfinite(box_alpha) \
            or not 0.0 < box_alpha < 1.0:
        raise ValueError("box_alpha not in (0,1): %r" % (box_alpha,))
    if not isinstance(z_cap, (int, float)) or not math.isfinite(z_cap) or z_cap <= 0:
        raise ValueError("z_cap must be positive: %r" % (z_cap,))
    if ess_cap is not None and (not isinstance(ess_cap, (int, float))
                                or not math.isfinite(ess_cap) or ess_cap <= 0):
        raise ValueError("ess_cap must be positive: %r" % (ess_cap,))
    if threshold is not None and (not isinstance(threshold, (int, float))
                                  or not math.isfinite(threshold)):
        raise ValueError("non-finite threshold: %r" % (threshold,))
    keys, y, v = _checked(means, variances)
    j = len(keys)
    pool = partial_pool(dict(zip(keys, y)), dict(zip(keys, v)))
    tau2, mu, ess = pool["tau2"], pool["mu"], pool["ess"]
    checks = {}
    if not check_box:
        checks["box"] = {"pass": True, "skipped": True,
                         "reason": "disabled: not consulted"}
    elif j < 2:
        checks["box"] = {"pass": False, "p": None,
                         "reason": "J<2: no heterogeneity tail exists"}
    elif any(t <= 0 for t in v):
        checks["box"] = {"pass": False, "p": None,
                         "reason": "zero sampling variance: no honest Q"}
    else:
        q, df, p, _ = _box_p(y, v)
        checks["box"] = {"pass": p >= box_alpha, "p": p, "q": q,
                         "df": df, "alpha": box_alpha,
                         "reason": "Box-p %.4g vs alpha %.4g" % (p, box_alpha)}
    if not check_conflict:
        checks["conflict"] = {"pass": True, "skipped": True,
                              "reason": "disabled: not consulted"}
    elif j < 2 or any(t <= 0 for t in v):
        checks["conflict"] = {"pass": False, "zmax": None,
                              "reason": "no honest conflict z on degenerate input"}
    else:
        zs = {k: abs(val - mu) / math.sqrt(var + tau2)
              for k, val, var in zip(keys, y, v)}
        zmax = max(zs.values())
        checks["conflict"] = {"pass": zmax <= z_cap, "zmax": zmax,
                              "cap": z_cap, "zs": zs,
                              "reason": "max conflict z %.3f vs cap %.3f"
                              % (zmax, z_cap)}
    if not check_ess:
        checks["ess"] = {"pass": True, "skipped": True, "ess": ess,
                         "reason": "disabled: not consulted"}
    elif ess_cap is None:
        checks["ess"] = {"pass": True, "ess": ess, "cap": None,
                         "reason": "uncapped: ESS %.3f reported, not gated" % ess}
    else:
        checks["ess"] = {"pass": ess <= ess_cap, "ess": ess,
                         "cap": ess_cap,
                         "reason": "ESS_borrow %.3f vs cap %.3f" % (ess, ess_cap)}
    if not check_pi:
        checks["pi"] = {"pass": True, "skipped": True,
                        "reason": "disabled: not consulted"}
    elif threshold is None:
        checks["pi"] = {"pass": True, "threshold": None,
                        "reason": "no action threshold set: PI reported, not gated"}
    else:
        try:
            pi = prediction_interval(dict(zip(keys, y)), dict(zip(keys, v)),
                                     level=level, kind="hts")
        except ValueError as exc:
            checks["pi"] = {"pass": False, "threshold": threshold,
                            "reason": "PI unavailable, failing closed: %s" % exc}
        else:
            checks["pi"] = {"pass": pi["lo"] > threshold, "lo": pi["lo"],
                            "hi": pi["hi"], "mu": pi["mu"],
                            "threshold": threshold,
                            "reason": "new-context PI [%.4g, %.4g] vs bar %.4g"
                            % (pi["lo"], pi["hi"], threshold)}
    borrow = all(c["pass"] for c in checks.values())
    if borrow:
        reason = ("borrow: Box-p, conflict, ESS, PI checks all pass "
                  "(tau2=%.4g, ESS=%.3f)" % (tau2, ess))
    else:
        first = next(nm for nm in ("box", "conflict", "ess", "pi")
                     if not checks[nm]["pass"])
        reason = ("heterogeneity unresolvable: %s fails (%s)"
                  % (first, checks[first]["reason"]))
    return {"borrow": borrow, "reason": reason, "checks": checks,
            "tau2": tau2, "ess": ess, "mu": mu,
            "method": GATE_METHOD + "; applied (J=%d)" % j}


def pooled_or_unpooled(means: dict, variances: dict | None = None,
                       cells=None, **gate_kw) -> dict:
    """Production consult point (REFIT CALL CONVENTION -- no refit module exists).

    Call as pooled_or_unpooled(means, variances,
    cells=cells_from_records(records)) and trust "estimate" as a pooled
    estimate ONLY when "borrowed" is True; else "estimate" holds the raw
    unpooled means with the unresolvable reason. Refuses (unpooled) when
    provenance is absent (cells=None fails closed) or fewer than 3
    measured non-synthetic contexts consult ready_for_production, and
    whenever borrow_gate refuses. "map" labels the estimate with the
    reused MAP mixture (weight/conflict). Returns {"borrowed", "trusted",
    "estimate", "reason", "gate", "provenance", "map", "method"}.
    """
    keys, y, v = _checked(means, variances)
    gate = borrow_gate(dict(zip(keys, y)), dict(zip(keys, v)), **gate_kw)
    if cells is None:
        prov = {"measured_production": False,
                "reason": "no provenance supplied: unpooled (fail-closed)"}
    else:
        okp = ready_for_production(cells)
        prov = {"measured_production": bool(okp),
                "reason": "provenance admits production"
                if okp else "heterogeneity unresolvable: synthetic/unmeasured "
                "provenance (needs >=3 measured non-synthetic contexts)"}
    try:
        mp = map_prior(dict(zip(keys, y)), dict(zip(keys, v)))
        mp = {"weight": mp["weight"], "conflict": mp["conflict"],
              "tau2": mp["tau2"]}
    except ValueError as exc:
        mp = {"error": str(exc)}
    if prov["measured_production"] and gate["borrow"]:
        pool = partial_pool(dict(zip(keys, y)), dict(zip(keys, v)))
        return {"borrowed": True, "trusted": "pooled",
                "estimate": pool["shrunk"], "reason": gate["reason"],
                "gate": gate, "provenance": prov, "map": mp,
                "method": CONSULT_METHOD + "; borrowed"}
    if prov["measured_production"]:
        why = gate["reason"]
    else:
        why = prov["reason"] + " | gate: " + gate["reason"]
    return {"borrowed": False, "trusted": "unpooled",
            "estimate": dict(zip(keys, y)), "reason": why,
            "gate": gate, "provenance": prov, "map": mp,
            "method": CONSULT_METHOD + "; unpooled"}


def cells_from_records(records: list[dict]) -> dict:
    """Gate cells with provenance DERIVED from ingested dataset records, never
    caller-asserted: measured = bundle explicitly non-synthetic; hardware_known
    = manifest hardware present and not unknown. Feeds ready_for_production."""
    cells = {}
    for r in records:
        if not isinstance(r, dict):
            continue
        man = r.get("manifest", {}) or {}
        bundle = r.get("bundle", {}) or {}
        hw = man.get("hardware", "unknown")
        cells[r.get("run_id", "?")] = {
            "measured": bundle.get("synthetic", True) is False,
            "synthetic": bundle.get("synthetic", True),
            "hardware": hw, "hardware_known": bool(hw) and hw != "unknown"}
    return cells


def ready_for_production(cells) -> bool:
    """Promotion gate: True only with >=3 measured non-synthetic contexts.

    ``cells`` is {name: info} or [info]; each info's provenance flags are
    caller-supplied (``measured`` defaults False, ``synthetic`` defaults
    True, so unflagged cells refuse). Never auto-promotes: empty, unflagged,
    or synthetic-only inputs return False.
    """
    items = cells.values() if isinstance(cells, dict) else cells
    try:
        infos = list(items)
    except TypeError:
        return False
    count = sum(1 for info in infos
                if isinstance(info, dict) and info.get("measured", False)
                and not info.get("synthetic", True))
    return count >= 3
