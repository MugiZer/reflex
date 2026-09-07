"""Real-path calibration: per-stage surfaces -> calibrated P(cause).

Fixed design (researched, do not substitute):
  base: joint multinomial softmax(W z' + b) on asinh-stabilized stage z's,
    TRAINED ON SYNTHETIC ONLY via the same compare_real pipeline as
    deployment (unlimited seeds; fitting script owns the fault->stage map).
  refit: temperature T + per-stage bias ONLY (1+8 params) on real bundles via
    NLL, subject to hold inequalities for task-required holds, evaluated on
    fitting rows only (leave-one-seed-out at eval). NO isotonic, NO
    full-logit refit (unidentifiable at n=33).
  evidence: cpu tail-mass enters as a fixed-form binomial LLR (Laplace
    smoothing, coefficient 1.0) on the cpu logit -- zero fitted params.
    Real z's span 3 orders of magnitude (600-scale MAD-collapse artifacts
    beside 0.25-scale host effects); asinh is the parameter-free variance
    stabilizer. Standardizing by synthetic std was tried and rejected: it
    re-amplifies exactly the symptomatic channels synthetic never varies.

Honesty: 33 points cannot validate "80%-claims hit 4/5" (+-10pp needs
~100+). Report LOO-Brier + 3-bin reliability table instead.

Stdlib + numpy/scipy only. Never imports reflex.corpus (label hygiene: this
module takes integer labels; fault names live eval-side).
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from scipy.optimize import minimize

from .confidence import reliability as _reliability
from .diagnose import STAGES

CPU_IDX = STAGES.index("cpu")
N_CLASSES = len(STAGES)
T_BOUNDS = (0.05, 20.0)  # same convention as confidence.fit_temperature
_HOLD_MARGIN = 1e-6


def tail_llr(k_inc: float, n_inc: float, k_base: float, n_base: float) -> float:
    """Fixed-form binomial log-likelihood ratio for cpu tail-mass.

    Laplace smoothing; coefficient 1.0 as a genuine log-odds update. Zero
    fitted params -- document, never tune."""
    return math.log((k_inc + 1.0) / (n_inc + 2.0)) - \
        math.log((k_base + 1.0) / (n_base + 2.0))


def featurize(surfaces: dict) -> tuple[np.ndarray, float]:
    """8 stage z's in STAGES order + cpu tail LLR from compare_real surfaces."""
    z = np.array([float(surfaces[st]["z"]) for st in STAGES], float)
    tail = 0.0
    try:
        g = surfaces["cpu"]["groups"]["pooled"]
        n0 = float(g.get("n_base", 0) or 0)
        n1 = float(g.get("n_fault", 0) or 0)
        if n0 > 0 and n1 > 0:
            tail = tail_llr(float(g.get("tail_frac_incident", 0.0) or 0.0) * n1, n1,
                            float(g.get("tail_frac_base", 0.0) or 0.0) * n0, n0)
    except (KeyError, TypeError, ValueError):
        tail = 0.0  # tail evidence absent: no measurable excess, never invented
    return z, tail


def softmax_rows(L) -> np.ndarray:
    L = np.asarray(L, float)
    E = np.exp(L - L.max(axis=-1, keepdims=True))
    return E / E.sum(axis=-1, keepdims=True)


def base_logits(W: np.ndarray, b: np.ndarray, z: np.ndarray, tail: float = 0.0) -> np.ndarray:
    """Frozen synthetic map: W asinh(z) + b, plus fixed-form tail on cpu."""
    v = np.asarray(W, float) @ np.arcsinh(np.asarray(z, float)) + np.asarray(b, float)
    v = np.asarray(v, float).ravel()
    if tail:
        v = v.copy()
        v[CPU_IDX] += float(tail)
    return v


def train_base(X, y, l2: float = 1.0) -> tuple[np.ndarray, np.ndarray]:
    """Multinomial logistic (softmax) on asinh(z) rows; L2 fixed a priori."""
    X = np.arcsinh(np.asarray(X, float))
    y = np.asarray(list(y))
    n, d = X.shape
    K = N_CLASSES

    def nll(v: np.ndarray) -> float:
        W = v[:d * K].reshape(K, d)
        bb = v[d * K:]
        P = softmax_rows(X @ W.T + bb)
        return float(-np.log(P[np.arange(n), y] + 1e-12).mean()
                     + 0.5 * l2 * float((W * W).sum()) / n)

    res = minimize(nll, np.zeros(d * K + K), method="L-BFGS-B",
                   options={"maxiter": 2000})
    return res.x[:d * K].reshape(K, d), res.x[d * K:]


def fit_refit(Z, y, want) -> tuple[float, np.ndarray, dict]:
    """NLL refit of (T, per-stage bias) s.t. held rows rank correctly.

    Z: frozen base-logit rows. y: int labels. want[i]: int class that must
    rank top-1 on fitting row i, or None for unconstrained rows. SLSQP over
    a convex objective with linear ranking inequalities; deterministic
    (zero init, no randomness). Returns (T, bias, info)."""
    Z = np.asarray(Z, float)
    y = np.asarray(list(y))
    n, K = Z.shape
    cons = []
    for i in range(n):
        w = want[i]
        if w is None:
            continue
        for s in range(K):
            if s == w:
                continue
            cons.append({"type": "ineq",
                         "fun": (lambda v, i=i, w=w, s=s:
                                 (Z[i, w] - Z[i, s]) / math.exp(v[0])
                                 + (v[1 + w] - v[1 + s]) - _HOLD_MARGIN)})

    def nll(v: np.ndarray) -> float:
        T = math.exp(v[0])
        P = softmax_rows(Z / T + v[1:])
        return float(-np.log(P[np.arange(n), y] + 1e-12).mean())

    res = minimize(nll, np.zeros(1 + K), method="SLSQP",
                   bounds=[(math.log(T_BOUNDS[0]), math.log(T_BOUNDS[1]))]
                   + [(None, None)] * K,
                   constraints=cons, options={"maxiter": 2000, "ftol": 1e-12})
    return math.exp(res.x[0]), res.x[1:], {"ok": bool(res.success),
                                           "message": str(res.message),
                                           "nll": float(res.fun)}


def apply_probs(Z, T: float, bias) -> np.ndarray:
    """Calibrated P(cause) rows for base-logit rows Z."""
    return softmax_rows(np.asarray(Z, float) / float(T) + np.asarray(bias, float))


def calibrated_ranking(probs: dict | np.ndarray) -> list[tuple]:
    """Stages by P(cause) desc, stage-name tiebreak (mirrors rank())."""
    items = list(probs.items()) if isinstance(probs, dict) else \
        list(zip(STAGES, [float(p) for p in probs]))
    return sorted(items, key=lambda t: (-t[1], t[0]))


def brier(P, y) -> float:
    return float(_reliability(np.asarray(P, float), list(y), bins=3)["brier"])


def ece(P, y, bins: int = 3) -> float:
    return float(_reliability(np.asarray(P, float), list(y), bins=bins)["ece"])


def reliability_table(P, y, bins: int = 3) -> list[dict]:
    """Per-bin n/accuracy/mean-confidence on top prob (binning mirrors
    confidence.reliability so the rows reconcile with its ECE)."""
    P = np.asarray(P, float)
    y = np.asarray(list(y))
    top = P.max(axis=1)
    pred = P.argmax(axis=1)
    rows = []
    for b in range(bins):
        lo, hi = b / bins, (b + 1) / bins
        m = (top > lo) & (top <= hi) if b else top <= hi
        rows.append({"bin": "[%.2f,%.2f]%s" % (lo, hi, " (incl lo)" if b == 0 else ""),
                     "n": int(m.sum()),
                     "acc": float((y[m] == pred[m]).mean()) if m.sum() else float("nan"),
                     "conf": float(top[m].mean()) if m.sum() else float("nan")})
    return rows


def save_artifact(path: str | Path, W, b, T: float, bias, meta: dict) -> Path:
    p = Path(path)
    p.write_text(json.dumps({"stages": list(STAGES), "W": np.asarray(W, float).tolist(),
                             "b": np.asarray(b, float).tolist(), "T": float(T),
                             "bias": np.asarray(bias, float).tolist(),
                             "meta": dict(meta)}, indent=2) + "\n", encoding="utf-8")
    return p


def load_artifact(path: str | Path) -> dict:
    d = json.loads(Path(path).read_text(encoding="utf-8"))
    if list(d.get("stages", [])) != list(STAGES):
        raise ValueError("calibration artifact stage order %r != diagnose.STAGES" % (d.get("stages"),))
    return {"W": np.asarray(d["W"], float), "b": np.asarray(d["b"], float),
            "T": float(d["T"]), "bias": np.asarray(d["bias"], float),
            "meta": d.get("meta", {})}
