"""Fit the real-path calibration artifact (reflex/calibration.json).

Synthetic base: softmax(W asinh(z)+b) on compare_real z's of fakegpu bundles
(fixed seed list, disjoint from corpus/eval seeds; unlimited data). Real
refit: temperature T + per-stage bias (1+8 params) on the 33 matrix-36
bundles, NLL subject to task-required holds on fitting rows (holds reported
leave-one-seed-out at eval; this script writes the deployed full-fit).
Eval-side: owns the fault->stage map (canonical copy: scripts/eval_bars.py).
Deterministic: fixed seeds, zero inits, no randomness. Stdlib+numpy only.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

import numpy as np

from reflex import calibrate as K
from reflex import collect as C
from reflex import diagnose as D
from reflex.fakegpu import generate

# eval-side ground-truth map (canonical copy lives in scripts/eval_bars.py).
FAULT_CAUSE = {"cpu_starvation": "cpu", "launch_overhead": "scheduler",
               "bw_pressure": "gpu", "stalls": "gpu",
               "sync_serialization": "scheduler", "transfer_heavy": "transport",
               "batching_delay": "preprocess", "queue_contention": "queue",
               "competing_workload": "queue", "kernel_regression": "gpu",
               "preprocessing_interference": "preprocess"}
FAULTS = sorted(FAULT_CAUSE)
SI = {s: i for i, s in enumerate(D.STAGES)}
# task-required holds (must rank top-1 wherever they appear in fitting rows).
HOLD = {"kernel_regression": "gpu", "transfer_heavy": "transport",
        "launch_overhead": "scheduler"}

SYNTH_SEEDS = list(range(2000, 2060))  # disjoint from corpus 101-111, eval 11/17/23
SYNTH_N = 8  # corpus canonical bundle size
M36 = REPO_ROOT / ".loop-runs" / "matrix-36" / "dataset.jsonl"
OUT = REPO_ROOT / "reflex" / "calibration.json"


def synth_matrix() -> tuple[np.ndarray, list]:
    X, y = [], []
    for s in SYNTH_SEEDS:
        for f in FAULTS:
            comp = D.compare_real(generate(s, f, SYNTH_N),
                                  [generate(s + 100, "healthy", SYNTH_N),
                                   generate(s + 200, "healthy", SYNTH_N)])
            z, _ = K.featurize(comp["surfaces"])  # synthetic tail unused: train Z from z
            X.append(z)
            y.append(SI[FAULT_CAUSE[f]])
    return np.array(X), y


def real_matrix(W, b, ds: Path = M36) -> tuple[np.ndarray, np.ndarray, list, list, list]:
    rows = [json.loads(l) for l in ds.read_text(encoding="utf-8").splitlines() if l.strip()]
    healthy = [r for r in rows if r["manifest"]["fault"] == "healthy"]
    Z, y, seeds, faults = [], [], [], []
    for r in sorted((x for x in rows if x["manifest"]["fault"] != "healthy"),
                    key=lambda x: (x["manifest"]["fault"], x["manifest"]["seed"])):
        bases = [h for h in healthy
                 if h["manifest"].get("seed") == r["manifest"].get("seed")
                 and h["manifest"].get("hardware") == r["manifest"].get("hardware")] \
            or healthy
        inc = C.adapt_bundle_for_diagnose(dict(r["bundle"]), r["manifest"])
        bb = [C.adapt_bundle_for_diagnose(dict(b), h["manifest"])
              for h in bases for b in (h["bundle"],)]
        comp = D.compare_real(inc, bb)
        z, tail = K.featurize(comp["surfaces"])
        Z.append(K.base_logits(W, b, z, tail))
        y.append(SI[FAULT_CAUSE[r["manifest"]["fault"]]])
        seeds.append(r["manifest"]["seed"])
        faults.append(r["manifest"]["fault"])
    return np.array(Z), np.array(y), seeds, faults


if __name__ == "__main__":
    Xs, ys = synth_matrix()
    W, b = K.train_base(Xs, ys)
    Ptr = K.softmax_rows(np.arcsinh(Xs) @ W.T + b)
    print("synthetic base: n=%d train-top1=%.3f" % (len(ys), float((Ptr.argmax(axis=1) == np.asarray(ys)).mean())))
    Z, y, seeds, faults = real_matrix(W, b)
    want = [SI[HOLD[f]] if f in HOLD else None for f in faults]
    T, bias, info = K.fit_refit(Z, y, want)
    assert info["ok"], info["message"]
    P = K.apply_probs(Z, T, bias)
    print("full-fit: T=%.3f nll=%.3f brier=%.4f" % (T, info["nll"], K.brier(P, y)))
    print("full-fit bias: %s" % np.asarray(bias).round(2).tolist())
    K.save_artifact(OUT, W, b, T, bias,
                    {"l2": 1.0, "synth_seeds": [SYNTH_SEEDS[0], SYNTH_SEEDS[-1]],
                     "synth_n": len(ys), "synth_n_kernels": SYNTH_N,
                     "full_fit_n": len(y), "full_fit_nll": info["nll"],
                     "holds": HOLD, "tail": "fixed-form binomial LLR, Laplace, coeff 1.0"})
    print("wrote %s" % OUT)
