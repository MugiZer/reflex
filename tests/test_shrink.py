"""Ticket 15 proofs: James-Stein shrinkage over per-family voice accuracies.

Strict MSE-win-vs-raw is proven in simulation (known truth, textbook regime
+ expected win at real-data-calibrated rates); both fail on a no-op
passthrough. The same comparison on real benchmark rows is RUN and reported
but its direction is not asserted: with 11 heterogeneous families the
single-realization gap is noise-dominated (sign flips across fit/eval
rotations), so the honest verdict there is UNPROVEN -- the test asserts the
shrinker genuinely engages (factor < 1) with finite, in-range outputs.
Wiring (shrunk table into confidence.fit_values unchanged) and degenerate
inputs are asserted strictly.
"""
import math
import random
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from reflex import confidence as C
from reflex.fakegpu import generate
from reflex.shrink import shrink

N = 8
TRIPLES = ((51, 151, 251), (7, 77, 777), (1234, 4321, 9999))
FIT_FAMS = ["cpu_starvation", "launch_overhead", "bw_pressure", "sync_serialization",
            "transfer_heavy", "queue_contention", "kernel_regression"]
EVAL_FAMS = ["stalls", "batching_delay", "competing_workload", "preprocessing_interference"]
ALL_FAMS = FIT_FAMS + EVAL_FAMS
STRICT = {"cpu_starvation": "cpu", "launch_overhead": "scheduler",
          "bw_pressure": "gpu", "stalls": "gpu",
          "sync_serialization": "scheduler", "transfer_heavy": "transport",
          "batching_delay": "cpu", "queue_contention": "queue",
          "competing_workload": "queue", "kernel_regression": "gpu",
          "preprocessing_interference": "cpu"}


def _rows():
    """Benchmark-style rows per seed-triple: same shape as
    tournament.benchmark rows ({name, voice_tops, voice_agree})."""
    runs = []
    for (seed, b1, b2) in TRIPLES:
        rows = []
        for fam in ALL_FAMS:
            st = C.voice_state(generate(seed, fam, N),
                               [generate(b1, "healthy", N), generate(b2, "healthy", N)])
            tops = {}
            for v in C.VOICES:
                d = st["voices"][v]
                span = max(d.values()) - min(d.values())
                tops[v] = "abstain:uniform" if span < 1e-9 else sorted(d, key=lambda s: (-d[s], s))[0]
            rows.append({"name": fam, "voice_tops": tops,
                         "voice_agree": sum(1 for v in C.VOICES if tops[v] == STRICT[fam])})
        runs.append(rows)
    return runs


RUNS = _rows()  # 3 runs x 11 rows; built once (~10s), shared by all tests
NV = len(C.VOICES)


def _agree(fam, run):
    row = next(r for r in RUNS[run] if r["name"] == fam)
    return row["voice_agree"] / len(row["voice_tops"])


def _mse(pred, cells):
    return statistics.fmean([(pred[f, v] - y) ** 2 for (f, v), y in cells])


def test_simulation_beats_raw():
    rng = random.Random(15)
    theta = [0.45, 0.50, 0.55, 0.60, 0.60, 0.65, 0.70, 0.75]
    sig2, fams = 0.04, ["f%d" % i for i in range(8)]
    y = [t + rng.gauss(0.0, math.sqrt(sig2)) for t in theta]
    out = shrink(dict(zip(fams, y)), {f: sig2 for f in fams})
    assert "james-stein" in out["method"] and out["factor"] < 1.0  # passthrough (1.0) fails
    assert all(math.isfinite(v) for v in out["shrunk"].values())
    assert min(y) <= min(out["shrunk"].values()) and max(out["shrunk"].values()) <= max(y)
    mse_raw = statistics.fmean([(a - t) ** 2 for a, t in zip(y, theta)])
    mse_shr = statistics.fmean([(out["shrunk"][f] - t) ** 2 for f, t in zip(fams, theta)])
    print("\nsimulation MSE raw %.4f shrunk %.4f (win %.1f%%, factor %.3f)"
          % (mse_raw, mse_shr, 100 * (mse_raw - mse_shr) / mse_raw, out["factor"]))
    assert mse_shr < mse_raw  # passthrough (equality) fails


def test_expected_win_at_real_rates():
    pooled = {f: statistics.fmean(_agree(f, t) for t in range(3)) for f in ALL_FAMS}
    rng, R, NFIT = random.Random(15), 200, 2 * NV
    tot_raw = tot_shr = 0.0
    for _ in range(R):
        obs = {f: sum(1 for _ in range(NFIT) if rng.random() < pooled[f]) / NFIT for f in pooled}
        var = {f: max(a * (1 - a) / NFIT, 1e-12) for f, a in obs.items()}
        out = shrink(obs, var)
        tot_raw += statistics.fmean([(obs[f] - pooled[f]) ** 2 for f in pooled])
        tot_shr += statistics.fmean([(out["shrunk"][f] - pooled[f]) ** 2 for f in pooled])
    print("\nresampled-at-real-rates MSE raw %.5f shrunk %.5f (win %.1f%%, R=%d)"
          % (tot_raw / R, tot_shr / R, 100 * (tot_raw - tot_shr) / tot_raw, R))
    assert tot_shr < tot_raw  # passthrough (equality) fails


def test_cross_family_holdout():
    # Voice level: fit voice accuracies on FIT families, predict held-out EVAL families.
    nfit = len(FIT_FAMS) * 3
    raw = {v: statistics.fmean(next(r for r in RUNS[t] if r["name"] == f)["voice_tops"][v]
                               == STRICT[f] for f in FIT_FAMS for t in range(3)) for v in C.VOICES}
    out = shrink(raw, {v: raw[v] * (1 - raw[v]) / nfit for v in C.VOICES})
    assert 0.0 <= out["factor"] < 1.0  # genuine shrinkage engaged; passthrough (1.0) fails
    assert set(out["shrunk"]) == set(C.VOICES)
    assert all(math.isfinite(v) for v in out["shrunk"].values())
    cells = [((f, v), int(next(r for r in RUNS[t] if r["name"] == f)["voice_tops"][v]
                           == STRICT[f])) for f in EVAL_FAMS for v in C.VOICES for t in range(3)]
    m_raw = _mse({(f, v): raw[v] for f in EVAL_FAMS for v in C.VOICES}, cells)
    m_shr = _mse({(f, v): out["shrunk"][v] for f in EVAL_FAMS for v in C.VOICES}, cells)
    # Family level: per-family agreement fit on runs {0,1}, shrunk across families, held-out run 2.
    means = {f: statistics.fmean(_agree(f, t) for t in (0, 1)) for f in ALL_FAMS}
    fout = shrink(means, {f: means[f] * (1 - means[f]) / (2 * NV) for f in ALL_FAMS})
    assert 0.0 <= fout["factor"] < 1.0
    f_raw = statistics.fmean([(means[f] - _agree(f, 2)) ** 2 for f in ALL_FAMS])
    f_shr = statistics.fmean([(fout["shrunk"][f] - _agree(f, 2)) ** 2 for f in ALL_FAMS])
    print("\nholdout voice-level MSE raw %.4f shrunk %.4f | family-level raw %.4f shrunk %.4f"
          % (m_raw, m_shr, f_raw, f_shr))
    # Direction deliberately unasserted: single-realization gap is noise-dominated
    # on 11 heterogeneous families (sign flips across rotations); strict win proven above.


def test_wiring_into_fit_values():
    nfit = len(FIT_FAMS) * 3
    raw = {v: statistics.fmean(next(r for r in RUNS[t] if r["name"] == f)["voice_tops"][v]
                               == STRICT[f] for f in FIT_FAMS for t in range(3)) for v in C.VOICES}
    shr = shrink(raw, {v: raw[v] * (1 - raw[v]) / nfit for v in C.VOICES})["shrunk"]
    assert shr != raw  # passthrough would leave the table unchanged
    t_raw, t_shr = C.fit_values(raw), C.fit_values(shr)
    for t, src in ((t_raw, raw), (t_shr, shr)):  # contract unchanged
        assert set(t) == {"acc", "costs", "cerr"} and t["acc"] == src
        assert set(t["acc"]) == set(C.VOICES)
        assert all(isinstance(v, float) and 0.0 <= v <= 1.0 for v in t["acc"].values())
    vals = C.measure_values(t_shr, 0.5, ["matched"])
    nxt, val = C.nominate(vals)
    assert nxt in C.VOICES and math.isfinite(val)


def test_degenerate_inputs():
    one = shrink({"a": 0.7}, {"a": 0.01})
    assert one["shrunk"] == {"a": 0.7} and one["factor"] == 1.0 and "raw means" in one["method"]
    same = shrink({k: 0.5 for k in "abcd"}, {k: 0.01 for k in "abcd"})
    assert all(v == 0.5 for v in same["shrunk"].values()) and same["factor"] == 1.0
    zero = shrink({"a": 0.2, "b": 0.5, "c": 0.8},
                  {"a": 0.0, "b": 0.0, "c": 0.0})
    assert zero["shrunk"] == {"a": 0.2, "b": 0.5, "c": 0.8} and zero["factor"] == 1.0
    for bad in (lambda: shrink({}, {}),
                lambda: shrink({"a": 1.0}, None),
                lambda: shrink({"a": 0.1, "b": 0.2}, {"a": 0.01}),
                lambda: shrink({"a": 0.1, "b": float("nan"), "c": 0.3},
                               {"a": 0.01, "b": 0.01, "c": 0.01}),
                lambda: shrink({"a": 0.1, "b": 0.2, "c": float("inf")},
                               {"a": 0.01, "b": 0.01, "c": 0.01}),
                lambda: shrink({"a": 0.1, "b": 0.2, "c": 0.3},
                               {"a": 0.01, "b": float("nan"), "c": 0.01}),
                lambda: shrink({"a": 0.1, "b": 0.2, "c": 0.3},
                               {"a": 0.01, "b": -0.01, "c": 0.01})):
        try:
            bad()
        except ValueError:
            pass
        else:
            raise AssertionError("expected ValueError")
    outs = [one, same, zero,
            shrink({"a": 0.9, "b": 0.1, "c": 0.5}, {"a": 0.02, "b": 0.02, "c": 0.02})]
    assert all(math.isfinite(v) for o in outs for v in list(o["shrunk"].values())
               + [o["factor"], o["grand_mean"]])  # no NaN paths


def test_module_hygiene():
    src = (ROOT / "reflex" / "shrink.py").read_text(encoding="utf-8")
    for bad in ("numpy", "scipy", "sklearn", "corpus", "LABELS", "reflex."):
        assert bad not in src  # stdlib only: statistics + math
