"""Ticket 07: confidence layer over tournament outputs.

Pure post-hoc calibration + decision policy. Consumes fused rankings and
voice scores only (never the label table, never bundles beyond what
tournament.fast_voices already reads). Writes INFERRED evidence only, via
record_decision; anything stronger is unreachable (no promotion path exists
in this module).

Calibrators (all fitted offline on held-out fault families, eval side owns
the split): shared-temperature multiclass (default; single T over scipy NLL
minimization -- no maintained lib exists, ~20 lines below), binary Platt
(LogisticRegression + CalibratedClassifierCV sigmoid) over per-voice
correctness samples, isotonic benchmark on the same samples (reported only,
never consulted by decide/replay), MAPIE SplitConformalClassifier
(prefit LogReg over voice features, lac) as the conformal-set benchmark.
Ranking is never re-ordered: calibration adds probabilities beside the
fused order, and every report carries the original ranking untouched.
"""
from __future__ import annotations

import numpy as np
import scipy.optimize as opt
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression

# ponytail: mapie stays a function-level import (only fit_conformal needs it)
# so bare environments (Colab smoke: numpy/scipy/sklearn preinstalled, mapie
# not) can import this module and use everything else.

from . import diagnose, tournament
from .ledger import Evidence, EvidenceLevel

STAGES = diagnose.STAGES
# ponytail: static value order (cheap accurate voices first); recompute the
# order from fit accuracy when new voices land.
VOICES = ("matched", "structural", "gls", "enet", "perm", "xcorr")
# ponytail: unit costs (numpy voices 1, fit-based voices 2); replace with
# measured loop costs when the runtime cost model exists.
VOICE_COST = {"matched": 1.0, "structural": 1.0, "xcorr": 1.0,
              "gls": 2.0, "enet": 2.0, "perm": 2.0}
C_ERR = 10.0  # ponytail: judged cost of one wrong diagnosis in voice units (~a full workup + rerun); fit from incident economics when available.
TAU_HI = 0.99  # ponytail: fixed safety bar, not fit-derived; lower when a measured cost model justifies committing sooner.
M_HI = 0.05
M_SET = 0.15  # below the smallest full-fusion margin among fit families, so decisive fits stay singletons.
Z_MIN, Z_FRAC = 5.0, 0.15
T_BOUNDS = (0.05, 20.0)


def voice_state(incident: dict, baselines: list[dict]) -> dict:
    """Real tournament fast-path outputs: voice scores + multipliers + z surfaces."""
    fast = tournament.fast_voices(incident, baselines)
    return {"voices": {v: dict(fast[v]) for v in VOICES},
            "mult": dict(fast["sinfo"]["multipliers"]),
            "surfaces": {s: {"z": float(fast["surfaces"][s]["z"]),
                             "delta": float(fast["surfaces"][s]["delta"])} for s in STAGES}}


def fuse_taken(state: dict, taken: tuple | list) -> list[tuple]:
    """Fused ranking over revealed voices only (same weights, untaken excluded)."""
    if not taken:
        raise ValueError("at least one voice must be revealed")
    voices = {v: state["voices"][v] for v in taken}
    exclude = tuple(sorted(set(tournament.WEIGHTS) - set(taken)))
    return tournament.fuse(voices, state["mult"], exclude=exclude)


def align(ranking: list[tuple]) -> np.ndarray:
    d = dict(ranking)
    return np.array([d[s] for s in STAGES], float)


def softmax(z) -> np.ndarray:
    z = np.asarray(z, float)
    e = np.exp(z - z.max())
    return e / e.sum()


def fit_temperature(logits_list, labels) -> dict:
    """Single shared T minimizing NLL of softmax(z/T) (scipy bounded scalar)."""
    Z = [np.asarray(z, float) for z in logits_list]
    Y = list(labels)

    def nll(t: float) -> float:
        t = float(t)
        return float(np.mean([-np.log(max(softmax(z / t)[y], 1e-12)) for z, y in zip(Z, Y)]))

    res = opt.minimize_scalar(nll, bounds=T_BOUNDS, method="bounded")
    t = float(res.x)
    # ponytail: 5% edge tolerance — bounded scalar often stops a hair inside the
    # bound on separable sets; without it a floored fit mislabels health "ok".
    at_bound = bool(t <= T_BOUNDS[0] * 1.05 or t >= T_BOUNDS[1] * 0.95)
    return {"T": t, "n": len(Y), "stale": False, "at_bound": at_bound,
            "nll": float(nll(t))}


def invalidate(temp: dict) -> dict:
    out = dict(temp)
    out["stale"] = True
    return out


def temperature_proba(scores, T: float) -> dict:
    p = softmax(np.asarray(scores, float) / float(T))
    return {s: float(v) for s, v in zip(STAGES, p)}


def reliability(probs_list, labels, bins: int = 5) -> dict:
    """ECE (uniform bins on top prob) + multiclass Brier (mean row SSE)."""
    P = np.asarray(probs_list, float)
    Y = np.asarray(list(labels))
    top = P.max(axis=1)
    ece = 0.0
    for b in range(bins):
        lo, hi = b / bins, (b + 1) / bins
        m = (top > lo) & (top <= hi) if b else top <= hi
        if m.sum():
            ece += m.mean() * abs((Y[m] == P[m].argmax(axis=1)).mean() - top[m].mean())
    one = np.zeros_like(P)
    one[np.arange(len(Y)), Y] = 1.0
    return {"ece": float(ece), "brier": float(((P - one) ** 2).sum(axis=1).mean())}


def correctness_features(dist) -> list[float]:
    """Top prob, top-2 margin, entropy of one 8-way distribution."""
    p = np.asarray([dist[s] for s in STAGES], float)
    o = np.argsort(-p)
    return [float(p[o[0]]), float(p[o[0]] - p[o[1]]),
            float(-(p * np.log(p + 1e-12)).sum())]


def voice_matrix(voices: dict) -> np.ndarray:
    """48-dim voice-feature row in fixed VOICES x STAGES order."""
    return np.array([voices[v][s] for v in VOICES for s in STAGES], float)


def fit_correctness(X, y) -> dict:
    """Platt (sigmoid, decision path) + isotonic (benchmark only) on voice samples."""
    X = np.asarray(X, float)
    y = np.asarray(list(y))
    base = LogisticRegression(max_iter=2000).fit(X, y)
    return {"base": base, "base_rate": float(y.mean()),
            "platt": CalibratedClassifierCV(estimator=base, method="sigmoid", cv=3).fit(X, y),
            "isotonic": CalibratedClassifierCV(estimator=base, method="isotonic", cv=3).fit(X, y),
            "platt_role": "decision", "isotonic_role": "benchmark"}


def correctness_q(fit: dict, feats) -> float:
    return float(fit["platt"].predict_proba([list(feats)])[0, 1])


def fit_conformal(X, y, Xc=None, yc=None, *, C: float = 0.1, level: float = 0.8):
    """MAPIE split-conformal sets over a prefit LogReg (lac). Conformalize on
    (Xc, yc) when given, else on the train rows (optimistic — same-data
    coverage overstates; pass a held-out fold whenever one exists)."""
    from mapie.classification import SplitConformalClassifier  # lazy: keeps bare envs importable
    X = np.asarray(X, float)
    y = np.asarray(list(y))
    est = LogisticRegression(max_iter=5000, C=C).fit(X, y)
    model = SplitConformalClassifier(estimator=est, confidence_level=level,
                                     conformity_score="lac", prefit=True)
    Xc = np.asarray(Xc if Xc is not None else X, float)
    yc = list(yc) if yc is not None else list(y)
    model.conformalize(Xc, yc)
    return {"model": model, "classes": [STAGES[int(c)] for c in est.classes_]}


def conformal_set(fit, X) -> list[str]:
    """Set members as stage names (row indexes the stashed estimator classes)."""
    row = np.asarray(fit["model"].predict_set(np.asarray(X, float).reshape(1, -1))[1]).ravel()
    return [s for s, v in zip(fit["classes"], row) if v]


def calibrate(state: dict, taken, temp: dict | None) -> dict:
    """Fused ranking + gated probabilities. Unhealthy calibration yields the
    ranking marked untrusted with probs None -- never invented numbers."""
    ranking = fuse_taken(state, tuple(taken))
    scores = {s: float(v) for s, v in ranking}
    top, second = ranking[0][0], ranking[1][0]
    margin = float(ranking[0][1] - ranking[1][1])
    if temp is None:
        return {"ranking": ranking, "scores": scores, "top": top, "margin": margin,
                "probabilities": None, "trusted": False,
                "health": "missing", "reason": "no calibration fitted"}
    if temp.get("stale"):
        return {"ranking": ranking, "scores": scores, "top": top, "margin": margin,
                "probabilities": None, "trusted": False,
                "health": "stale", "reason": "calibration invalidated"}
    probs = temperature_proba(align(ranking), temp["T"])
    health = "capped" if temp.get("at_bound") else "ok"
    return {"ranking": ranking, "scores": scores, "top": top, "margin": margin,
            "probabilities": probs, "trusted": True, "health": health,
            "reason": "fit separable: T at lower bound" if health == "capped" else "fitted"}


def _contradicted(stage: str, surfaces: dict) -> str:
    """Veto reason, or '' when the stage has differential support."""
    mz = max(surfaces[s]["z"] for s in STAGES)
    if mz >= Z_MIN and surfaces[stage]["z"] <= Z_FRAC * mz:
        return "z=%.2f without support beside max z=%.1f" % (surfaces[stage]["z"], mz)
    return ""


def plausible_set(report: dict, surfaces: dict, m: float = M_SET) -> dict:
    """Top cause + everything within m of it (ranking order), minus vetoed."""
    top = report["top"]
    scores = report["scores"]
    cand = [s for s, _ in report["ranking"] if scores[top] - scores[s] <= m]
    members, vetoed = [], {}
    for s in cand:
        r = _contradicted(s, surfaces) if s != top else ""
        if s != top and r:
            vetoed[s] = r
        else:
            members.append(s)
    return {"members": members, "vetoed": vetoed}


def multi_cause(report: dict, surfaces: dict) -> dict:
    """Marginal strengths (relative to top; never normalized to sum 1) plus a
    composite joint hypothesis when the top pair is close and both supported."""
    scores = report["scores"]
    top1, top2 = report["ranking"][0][0], report["ranking"][1][0]
    marginals = {s: float(scores[s] / scores[top1]) for s in STAGES}
    composites = []
    if scores[top1] - scores[top2] < M_SET and not _contradicted(top1, surfaces) \
            and not _contradicted(top2, surfaces):
        composites.append({"causes": [top1, top2],
                           "support": float(min(marginals[top1], marginals[top2])),
                           "reason": "top pair within %.2f, both z-supported" % M_SET})
    return {"marginals": marginals, "composites": composites}


def fit_values(voice_acc: dict, costs: dict = VOICE_COST, cerr: float = C_ERR) -> dict:
    return {"acc": dict(voice_acc), "costs": dict(costs), "cerr": float(cerr)}


def measure_values(table: dict, q: float, taken) -> dict:
    taken = set(taken)
    return {v: float(table["acc"][v] * (1.0 - q) * table["cerr"] - table["costs"][v])
            for v in VOICES if v not in taken}


def nominate(values: dict):
    """Best untaken voice by net value (ties: cheaper, then name)."""
    order = sorted(values, key=lambda v: (-values[v], VOICE_COST[v], v))
    return order[0], float(values[order[0]])


def decide(report: dict, surfaces: dict, taken, values: dict, q: float) -> dict:
    """Commit / abstain-and-continue / abstain-and-stop. Fixes are always []."""
    taken = list(taken)
    prob = report["probabilities"][report["top"]] if report["probabilities"] else 0.0
    if report["trusted"] and prob >= TAU_HI and report["margin"] >= M_HI:
        return {"state": "commit", "reason": "posterior %.3f margin %.3f" % (prob, report["margin"]),
                "top": report["top"], "prob": float(prob), "margin": report["margin"],
                "next_measurement": None, "value": 0.0, "fixes": []}
    untaken = [v for v in VOICES if v not in taken]
    if untaken:
        nxt, val = nominate(values)
        if val > 0:
            return {"state": "abstain-and-continue",
                    "reason": "ambiguous (q=%.2f); '%s' has positive net value %+.2f" % (q, nxt, val),
                    "top": report["top"], "prob": float(prob), "margin": report["margin"],
                    "next_measurement": nxt, "value": float(val), "fixes": []}
        return {"state": "abstain-and-stop",
                "reason": "ambiguous but best remaining net value %+.2f (non-positive)" % val,
                "top": report["top"], "prob": float(prob), "margin": report["margin"],
                "next_measurement": None, "value": float(val), "fixes": []}
    return {"state": "abstain-and-stop", "reason": "ambiguous with no measurements left (exhausted)",
            "top": report["top"], "prob": float(prob), "margin": report["margin"],
            "next_measurement": None, "value": 0.0, "fixes": []}


def replay(state: dict, surfaces: dict, temp: dict, corr: dict, table: dict) -> dict:
    """Sequential policy: reveal in value order, commit on posterior, else take
    positive-value measurements, else stop. Returns the trace + final top."""
    taken: list[str] = [VOICES[0]]
    trace = []
    while True:
        rep = calibrate(state, taken, temp)
        p = np.array([rep["probabilities"][s] for s in STAGES]) if rep["probabilities"] \
            else np.array([rep["scores"][s] for s in STAGES])
        p = p / p.sum()
        q = correctness_q(corr, correctness_features(dict(zip(STAGES, p))))
        dec = decide(rep, surfaces, taken, measure_values(table, q, taken), q)
        trace.append({"taken": list(taken), "top": dec["top"], "prob": dec["prob"],
                      "margin": dec["margin"], "q": float(q), "state": dec["state"],
                      "next": dec["next_measurement"], "reason": dec["reason"]})
        if dec["state"] != "abstain-and-continue":
            return {"trace": trace, "taken": list(taken), "top": dec["top"],
                    "n_measured": len(taken),
                    "cost": float(sum(VOICE_COST[v] for v in taken)),
                    "stop": dec["state"], "reason": dec["reason"], "fixes": []}
        taken = taken + [dec["next_measurement"]]


def record_decision(ledger, incident_id: str, decision: dict, correlation_id: str):
    """Decision audit trail as INFERRED evidence (no promotion path exists here)."""
    return ledger.append_evidence(Evidence(
        correlation_id=correlation_id, provenance="confidence",
        level=EvidenceLevel.INFERRED, kind="confidence_decision",
        incident_id=incident_id,
        payload={"state": decision.get("state"), "top": decision.get("top"),
                 "prob": float(decision.get("prob", 0.0)),
                 "margin": float(decision.get("margin", 0.0)),
                 "next_measurement": decision.get("next_measurement"),
                 "reason": str(decision.get("reason", "")),
                 "members": [str(s) for s in decision.get("members", [])],
                 "composites": [[str(c) for c in comp.get("causes", [])]
                                for comp in decision.get("composites", [])],
                 "fixes": []}))
