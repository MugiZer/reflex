"""V2 coupling validation: cpu_starvation_v2 synthetic vs real starvation.

Real reference: .loop-runs/matrix-36/dataset.jsonl (3 cpu_starvation bundles +
matched healthy baselines). Synthetic: cpu_starvation_v2 across seeds
(n=40 kernels to match real bundle scale). Stdlib+numpy only.

Mechanism under test (reflex/fakegpu.py): sparse host stalls (median gap
preserved, heavy tail) + contention duty on cpu_dur + emergent DVFS clock
droop (device idle -> slow kernels -> ramp back). No cpu_starve_us median
shift, no kernel_slowdown_x.

Gates: (1) Spearman rank-order of mean stage z (PASS rho>=0.7);
(2) cosine similarity of mean-z centroids (PASS >0.8);
(3) dose-response slope sign + response-range overlap on the stall-size ray
    (starve_prob, stall_us) = (min(0.30, 0.30d), 2500d) (PASS: kernel sign
    matches real elevation, kernel and queue ranges overlap real);
(4) host->device lag via binned cross-correlation of cpu/gpu start timelines
    (PASS: synthetic median lag > 0 and within 1ms of real median lag).
A FAIL reports the measured gap; that gap is the remaining clock-math spec.
Extra INFO lines (tail stats, backlog slope, dose table) are diagnostics,
not gates.
"""
from __future__ import annotations

import json
import statistics
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

import numpy as np

from reflex import collect as C
from reflex import diagnose as D
from reflex.fakegpu import PRESETS, FaultProfile, generate

M36 = REPO_ROOT / ".loop-runs" / "matrix-36" / "dataset.jsonl"
PRESET = "cpu_starvation_v2"
DOSE_BASE = PRESETS[PRESET]  # dose-1.0 point; the ray scales stall size, holding stall prob at 0.30 (median-flip P ~0.5%/set; failing sets report their gap, never silently)
SYN_SEEDS = [301, 302, 303, 304, 305, 306]
DOSE_SEEDS = [301, 302, 303]
N = 40  # real matrix-36 bundles carry 40 gpu kernels
DOSES = [0.25, 0.5, 1.0, 2.0]


def _med(xs):
    return float(statistics.median(xs)) if xs else 0.0


def real_rows():
    rows = [json.loads(l) for l in M36.read_text(encoding="utf-8").splitlines() if l.strip()]
    healthy = [r for r in rows if r["manifest"]["fault"] == "healthy"]
    out = []
    for r in sorted((x for x in rows if x["manifest"]["fault"] == "cpu_starvation"),
                    key=lambda x: x["manifest"]["seed"]):
        bases = [h for h in healthy
                 if h["manifest"].get("seed") == r["manifest"].get("seed")
                 and h["manifest"].get("hardware") == r["manifest"].get("hardware")] or healthy
        out.append((C.adapt_bundle_for_diagnose(dict(r["bundle"]), r["manifest"]),
                    [C.adapt_bundle_for_diagnose(dict(h["bundle"]), h["manifest"]) for h in bases]))
    return out


def synth_rows():
    return [(generate(s, PRESET, N),
             [generate(s + 100, "healthy", N), generate(s + 200, "healthy", N)])
            for s in SYN_SEEDS]


def mean_z(rows):
    acc = {s: [] for s in D.STAGES}
    for inc, bb in rows:
        comp = D.compare_real(inc, bb)
        for s in D.STAGES:
            acc[s].append(comp["surfaces"][s]["z"])
    return np.array([float(np.mean(acc[s])) for s in D.STAGES])


def _tied_ranks(v):
    order = sorted(range(len(v)), key=lambda i: v[i])
    r = [0.0] * len(v)
    i = 0
    while i < len(v):
        j = i
        while j + 1 < len(v) and v[order[j + 1]] == v[order[i]]:
            j += 1
        for k in range(i, j + 1):
            r[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return np.array(r)


def gate1(real, synth):
    rz, sz = mean_z(real), mean_z(synth)
    rr, sr = _tied_ranks(rz), _tied_ranks(sz)
    rho = float(np.corrcoef(rr, sr)[0, 1]) if np.std(rr) > 0 and np.std(sr) > 0 else 0.0
    ok = rho >= 0.7
    print("GATE1 rank-order: %s rho=%.3f (need >=0.700)" % ("PASS" if ok else "FAIL", rho))
    print("  real  order: %s" % [D.STAGES[i] for i in np.argsort(-rz)])
    print("  synth order: %s" % [D.STAGES[i] for i in np.argsort(-sz)])
    print("  real  z: %s" % np.round(rz, 2).tolist())
    print("  synth z: %s" % np.round(sz, 2).tolist())
    if not ok:
        print("  GAP: synthetic cpu z=%.1f dominates (120us gaps vs ~6us healthy gaps); "
              "real cpu z=%.2f (starvation hides in the gap tail, not the median) and real "
              "preprocess z=%.2f has no synthetic counterpart (starve knob leaves cpu_dur "
              "untouched)." % (sz[D.STAGES.index("cpu")], rz[D.STAGES.index("cpu")],
                                rz[D.STAGES.index("preprocess")]))
    return ok


def gate2(real, synth):
    rz, sz = mean_z(real), mean_z(synth)
    cos = float(rz @ sz / np.linalg.norm(rz) / np.linalg.norm(sz))
    ok = cos > 0.8
    print("GATE2 cosine: %s cos=%.3f angle=%.1fdeg (need >0.800)" %
          ("PASS" if ok else "FAIL", cos, float(np.degrees(np.arccos(np.clip(cos, -1, 1))))))
    if not ok:
        print("  GAP: real centroid ~ gpu-dominated (gpu z=%.1f, cpu z=%.2f); synthetic "
              "centroid ~ cpu-dominated (cpu z=%.1f, gpu z=%.1f). Composed knobs sum "
              "two independent excesses; real coupling inflates kernels while host "
              "medians barely move." % (rz[D.STAGES.index("gpu")], rz[D.STAGES.index("cpu")],
                                        sz[D.STAGES.index("cpu")], sz[D.STAGES.index("gpu")]))
    return ok


def _dose_point(dose, seed):
    prof = FaultProfile(host_stall_prob=min(0.30, DOSE_BASE.host_stall_prob * dose),
                        host_stall_us=DOSE_BASE.host_stall_us * dose)
    inc = generate(seed, prof, N)
    bb = [generate(seed + 100, "healthy", N), generate(seed + 200, "healthy", N)]
    base_dur = [g["dur_ns"] for b in bb for g in b["gpu_kernel"]]
    kr = _med([g["dur_ns"] for g in inc["gpu_kernel"]]) / _med(base_dur)
    base_q = [x["queue_depth"] for b in bb for x in b["l1"]]
    qd = _med([x["queue_depth"] for x in inc["l1"]]) - _med(base_q)
    return kr, qd


def gate3(real):
    rk, rq = [], []
    for inc, bb in real:
        base_dur = [g["dur_ns"] for b in bb for g in b["gpu_kernel"]]
        rk.append(_med([g["dur_ns"] for g in inc["gpu_kernel"]]) / _med(base_dur))
        base_q = [x["queue_depth"] for b in bb for x in b["l1"]]
        rq.append(_med([x["queue_depth"] for x in inc["l1"]]) - _med(base_q))
    sk = [_med([_dose_point(d, s)[0] for s in DOSE_SEEDS]) for d in DOSES]
    sq = [_med([_dose_point(d, s)[1] for s in DOSE_SEEDS]) for d in DOSES]
    slope_k = float(np.polyfit(DOSES, sk, 1)[0])
    sign_ok = (slope_k > 0) == (float(np.mean(rk)) > 1.0)
    k_overlap = min(sk) <= max(rk) and min(rk) <= max(sk)
    q_overlap = min(sq + rq) <= max(sq + rq) and (min(sq) <= max(rq) and min(rq) <= max(sq))
    ok = sign_ok and k_overlap and q_overlap
    print("GATE3 dose-response: %s slope_k=%+.2f/idx sign_match=%s kernel_range_synth=[%.2f,%.2f] "
          "vs_real=[%.2f,%.2f] overlap=%s queue_synth=%s vs_real=%s overlap=%s" %
          ("PASS" if ok else "FAIL", slope_k, sign_ok, min(sk), max(sk), min(rk), max(rk),
           k_overlap, sorted(set(sq)), sorted(set(rq)), q_overlap))
    if not ok:
        print("  GAP: %s" % ("kernel slope sign flips" if not sign_ok else
                              "real kernel inflation outside synthetic ray range" if not k_overlap else
                              "queue-depth ranges diverge"))
    print("  INFO dose table (dose -> kernel_ratio_med, queue_delta_med): %s" %
          ["(%.2f: %.2f, %+.1f)" % (d, k, q_) for d, k, q_ in zip(DOSES, sk, sq)])
    return ok


def _xcorr_lag_ms(bundle, nbins=200):
    cpu, gpu = bundle["cpu_launch"], bundle["gpu_kernel"]
    t0 = min(x["start_ns"] for x in cpu + gpu)
    t1 = max(x["end_ns"] for x in cpu + gpu)
    w = (t1 - t0) / nbins
    c = np.zeros(nbins)
    g = np.zeros(nbins)
    for x in cpu:
        c[min(nbins - 1, int((x["start_ns"] - t0) // w))] += 1
    for x in gpu:
        g[min(nbins - 1, int((x["start_ns"] - t0) // w))] += 1
    c -= c.mean()
    g -= g.mean()
    if c.std() == 0 or g.std() == 0:
        return 0.0
    cc = np.correlate(g, c, "full")
    lag = int(np.argmax(cc)) - (nbins - 1)
    return lag * w / 1e6


def gate4(real, synth):
    lr = [_xcorr_lag_ms(inc) for inc, _ in real]
    ls = [_xcorr_lag_ms(inc) for inc, _ in synth]
    mr, ms = _med(lr), _med(ls)
    ok = ms > 0 and abs(ms - mr) <= 1.0
    print("GATE4 upstream-lag: %s synth_lag=%+.3fms real_lag=%+.3fms (need synth>0 within 1ms of real)" %
          ("PASS" if ok else "FAIL", ms, mr))
    if not ok:
        ce = {c["correlation_id"]: c for c in synth[0][0]["cpu_launch"]}
        ds = [(g["start_ns"] - ce[g["correlation_id"]]["end_ns"]) / 1e6
              for g in synth[0][0]["gpu_kernel"]]
        drift = float(np.polyfit(range(len(ds)), ds, 1)[0])
        print("  GAP: synthetic host->device delay grows without bound (+%.3fms per kernel "
              "index, idx0=%.2fms idx%d=%.2fms) while real paired launch->start delay is "
              "flat ~0.001ms: single-stream serialization accumulates a backlog the T4 "
              "never shows. V2 clock math must bound the backlog (concurrency/overlap), "
              "not just inflate durations." % (drift, ds[0], len(ds) - 1, ds[-1]))
    return ok


def _gaps_ms(bundle):
    cs = sorted(bundle["cpu_launch"], key=lambda c: (c.get("start_ns", 0), c.get("end_ns", 0)))
    return [max(0.0, (b.get("start_ns", 0) - a.get("end_ns", 0))) / 1e6
            for a, b in zip(cs, cs[1:])]


def _tail(xs):
    s = sorted(xs)
    n = len(s)
    pick = lambda p: s[min(n - 1, int(p * n))]
    return _med(xs), pick(0.95), pick(0.99), s[-1]


def diag_info(real, synth):
    """INFO diagnostics (not gates): gap tail shape, backlog slope flatness."""
    for tag, rows in (("real", [inc for inc, _ in real]),
                      ("synth", [inc for inc, _ in synth])):
        med, p95, p99, mx = _tail([g for b in rows for g in _gaps_ms(b)])
        ce = {c["correlation_id"]: c for c in rows[0]["cpu_launch"]}
        ds = [(g["start_ns"] - ce[g["correlation_id"]]["end_ns"]) / 1e6
              for g in rows[0]["gpu_kernel"]]
        drift = float(np.polyfit(range(len(ds)), ds, 1)[0]) if len(ds) > 1 else 0.0
        print("  INFO %s gap tail ms: med=%.4f p95=%.2f p99=%.2f max=%.2f | "
              "backlog slope=%+.4fms/idx (idx0=%.3fms idx%d=%.3fms)" %
              (tag, med, p95, p99, mx, drift, ds[0], len(ds) - 1, ds[-1]))


def main() -> int:
    real, synth = real_rows(), synth_rows()
    print("real: %d cpu_starvation bundles; synth: %d %s bundles (n=%d kernels)" %
          (len(real), len(synth), PRESET, N))
    results = [gate1(real, synth), gate2(real, synth), gate3(real), gate4(real, synth)]
    diag_info(real, synth)
    print("VALIDATION: %d/4 gates pass" % sum(results))
    return 0 if all(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
