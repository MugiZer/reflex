"""Ticket 06: full diagnostic tournament over shared registry inputs.

Consumes bundles + ledger records only (never the label table or the
generator). All evidence stays INFERRED: this module proposes hypotheses and
records scores, but never runs an intervention and never writes VERIFIED
(any VERIFIED/TESTED write raises). Attribution is ranking evidence, never
causal proof.

Voices (each returns per-stage scores + provenance, fused by weighted mean):
time-based (weight 3/3/1): matched Median/MAD deltas from diagnose.compare
(shared registry input), structural component excess from the
reconstruct.py graph (read-only; serialized-sync gaps attribute to the sync
edge, never the host), lagged host<->GPU cross-correlation (numpy).
Level-based (weight 1 each): GLS with AR(1) errors (statsmodels), ElasticNetCV
(sklearn), grouped/conditional permutation over the fitted ElasticNet
(BALANCE-style: correlated |r|>0.7 features permuted jointly so importance is
not split across proxies), EBM (interpret-core, background threads only),
LightGBM (background threads only). Time-based voices dominate because level
shifts (e.g. SM/utilization collapse) are downstream of wherever time went.
"""
from __future__ import annotations

import concurrent.futures
import threading
import warnings

import numpy as np

from . import diagnose
from . import reconstruct
from .ledger import Evidence, EvidenceLevel, Hypothesis, Incident, Ledger

PROVENANCE = "tournament"
STAGES = diagnose.STAGES
# ponytail: fixed 13-feature table mirroring diagnose surfaces + L1/L3
# efficiency levels; add features only when a fault moves nothing here.
FEATURES = ("cpu_gap", "cpu_dur", "launch_gap", "queue_wait", "gpu_dur",
            "blocked", "tx_dur", "queue_depth", "sm", "mem_bw", "occup",
            "tensor", "stall")
FEATURE_STAGE = {"cpu_gap": "cpu", "cpu_dur": "preprocess",
                 "launch_gap": "scheduler", "queue_wait": "queue",
                 "gpu_dur": "gpu", "blocked": "scheduler",
                 "tx_dur": "transport", "queue_depth": "queue", "sm": "gpu",
                 "mem_bw": "gpu", "occup": "gpu", "tensor": "gpu",
                 "stall": "gpu"}
WEIGHTS = {"matched": 3.0, "structural": 3.0, "xcorr": 1.0, "gls": 1.0,
           "enet": 1.0, "perm": 1.0, "ebm": 1.0, "lgbm": 1.0}
HEAVY = ("ebm", "lgbm")  # background-only voices; never on the fast path


def _norm(scores: dict) -> dict:
    tot = sum(max(0.0, v) for v in scores.values())
    if tot <= 0:
        return {s: 1.0 / len(STAGES) for s in STAGES}
    return {s: max(0.0, scores.get(s, 0.0)) / tot for s in STAGES}


def feature_table(incident: dict, baselines: list[dict]) -> dict:
    """Per-op feature rows pooled over incident + baselines. Target y is
    incident membership (1/0): which features distinguish incident ops from
    baseline ops. Zero-variance columns are dropped (recorded, scored 0).
    Contract: at least one feature must vary; bit-identical incident/baseline
    bundles raise from the fitters instead of ranking noise."""
    diagnose.compare(incident, baselines)  # shared-input contract: context must match

    def rows(b: dict) -> list[list]:
        n = len(b["cpu_launch"])
        return [[(b["cpu_launch"][i + 1]["start_ns"] - b["cpu_launch"][i]["end_ns"]) / 1e6
                 if i < n - 1 else 0.0,
                 (b["cpu_launch"][i]["end_ns"] - b["cpu_launch"][i]["start_ns"]) / 1e6,
                 b["gpu_kernel"][i]["launch_gap_ns"] / 1e6,
                 b["gpu_kernel"][i]["queue_wait_ns"] / 1e6,
                 b["gpu_kernel"][i]["dur_ns"] / 1e6,
                 b["sync_edge"][i]["blocked_ns"] / 1e6,
                 b["transfer"][i]["dur_ns"] / 1e6,
                 float(b["l1"][i]["queue_depth"]), b["l1"][i]["sm_util_pct"],
                 b["l1"][i]["mem_bw_util_pct"], b["gpu_kernel"][i]["occupancy_pct"],
                 b["gpu_kernel"][i]["tensor_active_pct"],
                 float(b["l3_pc"][i]["stall_hist"]["long_scoreboard"])]
                for i in range(n)]

    Xi = np.array(rows(incident))
    Xb = np.vstack([rows(b) for b in baselines])
    X = np.vstack([Xi, Xb])
    y = np.array([1] * len(Xi) + [0] * len(Xb), float)
    keep = X.std(axis=0) > 0
    Xn = X[:, keep]
    mu, sd = Xn.mean(axis=0), Xn.std(axis=0)
    return {"X": Xn, "Xs": (Xn - mu) / sd, "y": y, "kept": list(keep),
            "names": [f for f, k in zip(FEATURES, keep) if k], "n_incident": len(Xi)}


def _stage_scores(importances, names) -> dict:
    agg = {s: 0.0 for s in STAGES}
    for f, v in zip(names, np.abs(np.asarray(importances, float))):
        agg[FEATURE_STAGE[f]] += float(v)
    return _norm(agg)


def matched_voice(surfaces: dict) -> dict:
    return _norm({st: max(0.0, s["z"]) for st, s in surfaces.items()})


def structural_voice(incident: dict, baselines: list[dict]) -> tuple[dict, dict]:
    """Graph-component excess (incident minus baseline mean, ms, ReLU) plus
    DepGraph-style constraint multipliers. Host-order gaps attribute to the
    sync edge when the graph marks them serialized (host stall downstream of
    device sync); enqueue/backlog waits are excluded as ambiguous."""
    def comps(b: dict) -> tuple[dict, dict]:
        g = reconstruct.build_graph(b)
        c = {"cpu": 0, "scheduler": 0, "gpu": 0, "transport": 0, "preprocess": 0}
        for nd in g["nodes"].values():
            st = nd.get("stage", "other")
            if st == "kernel":
                c["gpu"] += nd.get("dur_ns", 0)
            elif st == "sync":
                c["scheduler"] += nd.get("dur_ns", 0)
            elif st == "transfer":
                c["transport"] += nd.get("dur_ns", 0)
            elif st == "host":
                c["preprocess"] += nd.get("dur_ns", 0)
        for e in g["edges"]:
            if e["kind"] == "host_order":
                c["scheduler" if e["stage"] == "sync" else "cpu"] += e["w_ns"]
        return g, c

    gi, ci = comps(incident)
    cbs = [comps(b)[1] for b in baselines]
    scores = {s: 0.0 for s in STAGES}
    for k in ci:
        base = float(np.mean([c[k] for c in cbs]))
        if ci[k] > base:
            scores[k] = (ci[k] - base) / 1e6
    mult = {s: 1.0 for s in STAGES}
    prov = {"serialized_sync": False, "batch_contention": False}
    if any(n.get("serialized") for n in gi["nodes"].values()):
        mult["scheduler"] *= 2.0
        mult["cpu"] *= 0.5
        prov["serialized_sync"] = True
    if "batch:shared" in gi["nodes"]:
        qi = float(np.mean([r["queue_depth"] for r in incident["l1"]]))
        qb = float(np.mean([r["queue_depth"] for b in baselines for r in b["l1"]]))
        si = max(r["active_streams"] for r in incident["l1"])
        sb = max(r["active_streams"] for b in baselines for r in b["l1"])
        # ponytail: single-stream backlog is not contention; require more live
        # streams than baseline before queue takes structural blame.
        if qi > qb and si > sb and si > 1:
            mult["queue"] *= 1.5
            prov["batch_contention"] = True
    return _norm(scores), {"multipliers": mult, **prov}


def xcorr_voice(incident: dict, max_lag: int = 2, gate: float = 0.6) -> tuple[dict, dict]:
    """Numpy lagged host-gap <-> device cross-correlation. Host-lead votes cpu,
    device-lead votes queue, lag-0 votes scheduler; below gate it abstains
    (uniform), which short bundle series do most of the time."""
    n = len(incident["cpu_launch"])
    hg = np.array([(incident["cpu_launch"][i + 1]["start_ns"] - incident["cpu_launch"][i]["end_ns"])
                   if i < n - 1 else 0 for i in range(n)], float)
    series = {"qw": np.array([g["queue_wait_ns"] for g in incident["gpu_kernel"]], float),
              "gd": np.array([g["dur_ns"] for g in incident["gpu_kernel"]], float)}

    def best(a: np.ndarray, b: np.ndarray) -> tuple[int, float]:
        a, b = a - a.mean(), b - b.mean()
        den = float(np.sqrt((a ** 2).sum() * (b ** 2).sum()))
        if den == 0:
            return 0, 0.0
        bl, bv = 0, 0.0
        for lag in range(-max_lag, max_lag + 1):
            v = float((a[:lag] * b[-lag:]).sum() / den) if lag < 0 else \
                float((a[lag:] * b[:-lag]).sum() / den) if lag > 0 else \
                float((a * b).sum() / den)
            if abs(v) > abs(bv):
                bl, bv = lag, v
        return bl, bv

    info, scores = {}, {s: 0.0 for s in STAGES}
    for key, b in series.items():
        lag, v = best(hg, b)
        info[key] = {"lag": lag, "value": round(v, 3)}
        if abs(v) < gate:
            continue
        scores["cpu" if lag < 0 else "queue" if lag > 0 else "scheduler"] += abs(v)
    return _norm(scores), info


def fit_enet(Xs: np.ndarray, y: np.ndarray):
    from sklearn.linear_model import ElasticNetCV
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        return ElasticNetCV(cv=3, max_iter=5000).fit(Xs, y)


def fit_gls(Xs: np.ndarray, y: np.ndarray):
    """GLS on centered y with AR(1) working covariance from OLS residuals."""
    import statsmodels.api as sm
    yc = y - y.mean()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # rank deficiency expected: bundle-constant features
        resid = np.asarray(sm.OLS(yc, Xs).fit().resid, float)
    rho = float(np.corrcoef(resid[:-1], resid[1:])[0, 1]) \
        if len(y) > 2 and resid.std() > 0 else 0.0
    rho = 0.0 if np.isnan(rho) else max(-0.9, min(0.9, rho))
    n = len(y)
    sigma = np.fromfunction(lambda i, j: rho ** np.abs(i - j), (n, n))
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        res = sm.GLS(yc, Xs, sigma=sigma).fit()
    return res


def permutation_voice(Xs: np.ndarray, y: np.ndarray, model, n_shuffles: int = 5,
                      seed: int = 0) -> tuple[np.ndarray, dict]:
    """BALANCE-style grouped attribution on a fitted model: |r|>0.7 features
    form a group (union-find), the group is permuted jointly so correlated
    proxies share one importance, split back by |coef| share."""
    p = Xs.shape[1]
    parent = list(range(p))

    def find(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        corr = np.corrcoef(Xs.T)
    for i in range(p):
        for j in range(i + 1, p):
            if abs(corr[i, j]) > 0.7:
                parent[find(i)] = find(j)
    groups: dict[int, list] = {}
    for i in range(p):
        groups.setdefault(find(i), []).append(i)
    rng = np.random.default_rng(seed)
    base = float(model.score(Xs, y))
    coef = np.abs(np.asarray(model.coef_, float))
    imp = np.zeros(p)
    for g in groups.values():
        drops = []
        for _ in range(n_shuffles):
            Xp = Xs.copy()
            idx = rng.permutation(len(Xs))
            Xp[:, g] = Xs[idx][:, g]
            drops.append(base - float(model.score(Xp, y)))
        w = max(0.0, float(np.mean(drops)))
        cw = coef[g].sum()
        for i in g:
            imp[i] += w * (coef[i] / cw if cw > 0 else 1.0 / len(g))
    return imp, {"groups": sorted(len(g) for g in groups.values()), "base_r2": round(base, 3)}


def fit_ebm(X: np.ndarray, y: np.ndarray):
    from interpret.glassbox import ExplainableBoostingRegressor
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        # ponytail: one outer bag, no interactions, 64 bins, n_jobs=1 (one
        # bag needs no pool; loky spawn costs seconds per fit on Windows).
        # Raise bags/bins only when fixtures outgrow dozens of rows.
        return ExplainableBoostingRegressor(
            outer_bags=1, inner_bags=0, interactions=0, max_bins=64,
            n_jobs=1, random_state=0).fit(X, y)


def fit_lgbm(X: np.ndarray, y: np.ndarray):
    import lightgbm as lgb
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        # ponytail: 50 trees, 7 leaves, tiny leaf floor for bundle-scale
        # tables; scale up when rows outgrow dozens.
        return lgb.LGBMRegressor(n_estimators=50, min_child_samples=2,
                                 num_leaves=7, verbosity=-1,
                                 random_state=0).fit(X, y)


def fast_voices(incident: dict, baselines: list[dict]) -> dict:
    """Loop-safe voices only: no EBM/LightGBM import or fit here."""
    comp = diagnose.compare(incident, baselines)
    tab = feature_table(incident, baselines)
    Xs, y, names = tab["Xs"], tab["y"], tab["names"]
    enet = fit_enet(Xs, y)
    gls = fit_gls(Xs, y)
    imp, pinfo = permutation_voice(Xs, y, enet)
    struct, sinfo = structural_voice(incident, baselines)
    xc, xinfo = xcorr_voice(incident)
    kept = np.array(tab["kept"])
    out = {"matched": matched_voice(comp["surfaces"]), "structural": struct,
           "xcorr": xc, "sinfo": sinfo, "xinfo": xinfo, "pinfo": pinfo,
           "table": tab, "surfaces": comp["surfaces"], "context": comp["context"]}
    gp = np.asarray(gls.params, float)
    out["gls"] = _stage_scores(gp if len(gp) == len(names) else np.zeros(len(names)), names)
    out["enet"] = _stage_scores(_full(np.abs(np.asarray(enet.coef_, float)), kept), FEATURES)
    out["perm"] = _stage_scores(_full(imp, kept), FEATURES)
    out["_enet_model"] = enet
    return out


def _full(kept_imp: np.ndarray, kept: np.ndarray) -> np.ndarray:
    full = np.zeros(len(FEATURES))
    full[np.asarray(kept, bool)] = np.abs(np.asarray(kept_imp, float))
    return full


def start_heavy(X: np.ndarray, y: np.ndarray) -> dict:
    """EBM + LightGBM fits on worker threads. Returns futures + caller's thread
    id so tests can prove the fast path never waited on them."""
    # ponytail: per-call pool of 2, not a shared global; no lifecycle to leak.
    pool = concurrent.futures.ThreadPoolExecutor(max_workers=2)
    me = threading.get_ident()
    jobs = {"pool": pool, "caller": me, "threads": {},
            "ebm": pool.submit(_fit_heavy, "ebm", X, y),
            "lgbm": pool.submit(_fit_heavy, "lgbm", X, y)}
    return jobs


def _fit_heavy(which: str, X: np.ndarray, y: np.ndarray) -> tuple:
    tid = threading.get_ident()
    if which == "ebm":
        m = fit_ebm(X, y)
        return tid, np.abs(np.asarray(m.term_importances(), float))
    m = fit_lgbm(X, y)
    return tid, np.asarray(m.feature_importances_, float)


def collect_heavy(jobs: dict, names: list, timeout: float) -> dict:
    """Merge background voices; on timeout the voice abstains (uniform) and
    says so in provenance instead of stalling the loop."""
    out: dict[str, dict] = {}
    for which in HEAVY:
        try:
            tid, imp = jobs[which].result(timeout=timeout)
        except concurrent.futures.TimeoutError:
            out[which] = {"scores": {s: 1.0 / len(STAGES) for s in STAGES},
                          "timed_out": True}
            continue
        jobs["threads"][which] = tid
        n = names if len(imp) == len(names) else names[:len(imp)]
        out[which] = {"scores": _stage_scores(imp, n), "timed_out": False}
    jobs["pool"].shutdown(wait=False, cancel_futures=True)
    return out


def fuse(voices: dict, multipliers: dict, exclude: tuple = ()) -> list[tuple]:
    w = {k: v for k, v in WEIGHTS.items() if k not in exclude}
    tot = sum(w.values())
    fused = {s: sum(w[k] * voices[k][s] for k in w) / tot * multipliers[s]
             for s in STAGES}
    return sorted(((s, fused[s]) for s in STAGES), key=lambda t: (-t[1], t[0]))


def tournament(incident: dict, baselines: list[dict], ledger,
               heavy_timeout: float = 120.0) -> dict:
    """Full stack: fast voices now, heavy voices off-loop, fused ranking fed to
    the hypothesis registry. Proposes INFERRED only; raises on any VERIFIED."""
    n_exp = len(ledger.experiments)
    fast = fast_voices(incident, baselines)
    tab = fast["table"]
    jobs = start_heavy(tab["X"], tab["y"])
    heavy = collect_heavy(jobs, tab["names"], heavy_timeout)
    voices = {k: fast[k] for k in WEIGHTS if k not in HEAVY}
    timed_out = {k for k in HEAVY if heavy[k].get("timed_out")}
    for k in HEAVY:
        if k not in timed_out:
            voices[k] = heavy[k]["scores"]
    # ponytail: timed-out voices excluded (weight 0), not uniform drag; the
    # abstention stays in provenance. Uniform-at-full-weight would shrink real margins.
    mult = fast["sinfo"]["multipliers"]
    ranking = fuse(voices, mult, exclude=tuple(sorted(timed_out)))
    comp_ctx = fast["context"]
    inc = ledger.open_incident(diagnose.Incident(
        provenance=PROVENANCE,
        title="tournament: %d voices over %d baselines" % (len(WEIGHTS), len(baselines))))
    corr = "tournament:%s" % inc.incident_id[:8]
    ledger.append_evidence(Evidence(
        correlation_id=corr, provenance=PROVENANCE, level=EvidenceLevel.INFERRED,
        kind="tournament_voices", incident_id=inc.incident_id,
        payload={"weights": WEIGHTS, "multipliers": mult,
                 "structural": fast["sinfo"], "xcorr": fast["xinfo"],
                 "permutation": fast["pinfo"], "heavy_timed_out":
                 {k: heavy[k]["timed_out"] for k in HEAVY},
                 "scores": {k: {s: float(v) for s, v in voices[k].items()} for k in voices},
                 "context": comp_ctx}))
    registry = diagnose.Registry(ledger, inc.incident_id, PROVENANCE)
    support = ledger.append_evidence(Evidence(
        correlation_id=corr, provenance=PROVENANCE, level=EvidenceLevel.INFERRED,
        kind="tournament_ranking", incident_id=inc.incident_id,
        payload={"ranking": [[s, float(v)] for s, v in ranking],
                 "margin": float(ranking[0][1] - ranking[1][1]),
                 "fixes": []})).record_id
    hypos = [registry.propose(stage, [support], [], score)
             for stage, score in ranking[:3]]
    hypos.append(registry.propose(diagnose.UNKNOWN, [], [support], 0.0))
    for h in hypos:
        if ledger.hypotheses[h["hypothesis_id"]].status is not EvidenceLevel.INFERRED:
            raise AssertionError("tournament wrote non-INFERRED hypothesis")
    if len(ledger.experiments) != n_exp:
        raise AssertionError("tournament ran an experiment")
    if any(h.status is EvidenceLevel.VERIFIED for h in ledger.hypotheses.values()):
        raise AssertionError("tournament wrote VERIFIED")
    return {"incident_id": inc.incident_id, "ranking": ranking,
            "margin": float(ranking[0][1] - ranking[1][1]),
            "voices": {k: dict(v) for k, v in voices.items()},
            "multipliers": dict(mult), "heavy": heavy,
            "hypotheses": list(registry.entries.values()), "fixes": [],
            "threads": dict(jobs["threads"]), "registry": registry}


def benchmark(cases: list[dict], oracles: list[dict], ledger_dir,
              heavy_timeout: float = 120.0) -> dict:
    """Tournament vs the slice-05 ranker (diagnose.compare + rank, same faults).
    Cases carry their own acceptable-cause sets; oracles carry (seed, profile,
    good/bad intervention) triples scored by measured rerun benefit. The
    intervention oracle runs on scratch ledgers, never the tournament ledger."""
    from .verify import run_intervention  # read-only reuse; writes stay on scratch ledgers
    import tempfile

    rows = []
    for case in cases:
        comp = diagnose.compare(case["incident"], case["baselines"])
        order = diagnose.rank(comp["surfaces"])
        top, z = order[0][0], order[0][1]
        base_top1 = top if z > 2.0 else diagnose.UNKNOWN
        base_top3 = [st for st, zz, _ in order if zz > 2.0][:3]
        led = Ledger(str(ledger_dir / ("%s.jsonl" % case["name"])))
        out = tournament(case["incident"], case["baselines"], led, heavy_timeout)
        got = [s for s, _ in out["ranking"]]
        ok = set(case["acceptable"])
        tops = {}
        for k, v in out["voices"].items():
            span = max(v.values()) - min(v.values())
            tops[k] = "abstain:uniform" if span < 1e-9 else sorted(v, key=lambda s: (-v[s], s))[0]
        agree_n = sum(1 for k, t in tops.items() if t in ok)
        rows.append({"name": case["name"], "tour_top1": got[0],
                     "tour_top3": got[:3], "tour_margin": out["margin"],
                     "base_top1": base_top1, "base_top3": base_top3,
                     "tour_hit1": got[0] in ok,
                     "tour_hit3": bool(ok.intersection(got[:3])),
                     "base_hit1": base_top1 in ok,
                     "base_hit3": bool(ok.intersection(base_top3)),
                     "voice_tops": tops, "voice_agree": agree_n})
    agree = []
    for oc in oracles:
        with tempfile.TemporaryDirectory() as td:
            led = Ledger("%s/o.jsonl" % td)
            led.open_incident(Incident(provenance="tournament-bench", title="oracle"))
            mk = lambda cause: led.propose_hypothesis(Hypothesis(
                incident_id=next(iter(led.incidents)), provenance="tournament-bench",
                cause=cause, correlation_id="tournament-bench")).hypothesis_id
            good = run_intervention(led, mk(oc["expected"]), oc["seed"],
                                    oc["profile"], oc["good"], correlation_id="bench-good")
            bad = run_intervention(led, mk(oc["expected"]), oc["seed"],
                                   oc["profile"], oc["bad"], correlation_id="bench-bad")
        agree.append({"name": oc["name"], "expected": oc["expected"],
                      "good": oc["good"], "good_measured_ms": good["measured_ms"],
                      "bad": oc["bad"], "bad_measured_ms": bad["measured_ms"],
                      "benefit_gap_ms": (good["measured_ms"] or 0.0) - (bad["measured_ms"] or 0.0)})
    t1 = sum(r["tour_hit1"] for r in rows)
    b1 = sum(r["base_hit1"] for r in rows)
    t3 = sum(r["tour_hit3"] for r in rows)
    b3 = sum(r["base_hit3"] for r in rows)
    return {"rows": rows, "n": len(rows),
            "tour_top1": t1, "base_top1": b1, "tour_top3": t3, "base_top3": b3,
            "beats_top1": t1 > b1, "beats_top3": t3 > b3,
            "min_margin": min(r["tour_margin"] for r in rows),
            "agreement": agree}
