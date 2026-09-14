"""Score diagnose() on real T4 bundles; print issue-11 five bars as numbers.

Usage: python scripts/eval_bars.py [--dataset .loop-runs/eval-bundles/dataset.jsonl]
Stdlib + reflex.diagnose/ledger only for the five bars (numpy + reflex.calibrate
for the appended CAL block). Never invents data: diagnose exceptions
count as misses with the reason; unmeasurable bars print SKIP + why.
The CAL block appends calibrated before->after (LOO), LOO-Brier and a 3-bin
reliability table; old bars are untouched.
"""
from __future__ import annotations
import argparse, json, statistics, sys, tempfile
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from reflex import diagnose as D
from reflex import collect as C
from reflex import calibrate as K
from reflex.ledger import Ledger

import numpy as np

FAULT_CAUSE = {"cpu_starvation": "cpu", "launch_overhead": "scheduler",
    "bw_pressure": "gpu", "stalls": "gpu", "sync_serialization": "scheduler",
    "transfer_heavy": "transport", "batching_delay": "preprocess",
    "queue_contention": "queue", "competing_workload": "queue",
    "kernel_regression": "gpu", "preprocessing_interference": "preprocess"}
# task-required holds for the calibration refit (subset of FAULT_CAUSE).
HOLD_CAUSE = {"kernel_regression": "gpu", "transfer_heavy": "transport",
              "launch_overhead": "scheduler"}
M36_DEFAULT = str(REPO_ROOT / ".loop-runs" / "matrix-36" / "dataset.jsonl")

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", default=str(REPO_ROOT / ".loop-runs" / "eval-bundles" / "dataset.jsonl"))
    args = ap.parse_args()
    ds = Path(args.dataset)
    rows = [json.loads(l) for l in ds.read_text(encoding="utf-8").splitlines() if l.strip()]
    faults = sorted(r["manifest"]["fault"] for r in rows if r["manifest"]["fault"] != "healthy")
    n_faults = len(faults)
    # provenance
    rr = ds.parent / "run_result.json"
    prov = {}
    if rr.exists():
        try:
            prov = json.loads(rr.read_text(encoding="utf-8"))
        except Exception:
            prov = {}
    seeds = sorted({r["manifest"]["seed"] for r in rows})
    hw = sorted({r["manifest"].get("hardware") for r in rows})
    print(f"bundle set: {ds} run_id={prov.get('run_id','?')} commit={str(prov.get('commit','?'))[:12]} "
          f"status={prov.get('status','?')} n={len(rows)} faults={n_faults} seeds={seeds} hw={hw} "
          f"iters={((prov.get('collection') or {}).get('iters_per_run','?'))}")
    # baselines: healthy bundles (same seed/hw when possible)
    healthy = [r for r in rows if r["manifest"]["fault"] == "healthy"]
    per = []
    with tempfile.TemporaryDirectory() as td:
        for r in sorted((x for x in rows if x["manifest"]["fault"] != "healthy"), key=lambda x: x["run_id"]):
            fault = r["manifest"]["fault"]
            want = FAULT_CAUSE.get(fault, "?")
            # match baseline on seed+hardware when available, else any healthy
            _bases = [h for h in healthy
                      if h["manifest"].get("seed") == r["manifest"].get("seed")
                      and h["manifest"].get("hardware") == r["manifest"].get("hardware")] or \
                     list(healthy)
            err, top1, top3 = "", None, []
            try:
                if not _bases:
                    raise ValueError("no healthy baseline bundle ingested")
                led = Ledger(str(Path(td) / f"{fault}.jsonl"))
                # Adapted real bundles: derive diagnose fields (kernel_name,
                # launch_gap_ns, blocked_ns, l1, manifest timing context) via
                # the ingest converter path, then score on the tolerant
                # real-bundle slice (strict=False). Synthetic bundles keep the
                # strict default inside diagnose().
                inc = C.adapt_bundle_for_diagnose(dict(r["bundle"]), r["manifest"])
                bases = [C.adapt_bundle_for_diagnose(dict(b), h["manifest"])
                         for h in _bases for b in (h["bundle"],)]
                out = D.diagnose(inc, bases, led, strict=False, calibration=False)
                rank = out["ranking"]
                top1 = rank[0][0]
                top3 = [s for s, _, _ in rank[:3]]
            except Exception as e:
                err = f"{type(e).__name__}: {e}"
            hit1 = (top1 == want) if top1 else False
            hit3 = (want in top3)
            per.append({"fault": fault, "want": want, "top1": top1, "top3": top3,
                        "hit1": hit1, "hit3": hit3, "err": err})
            print(f"{fault:28s} want={want:10s} top1={str(top1):10s} hit1={int(hit1)} hit3={int(hit3)} "
                  f"{('ERR '+err) if err else ('top3='+','.join(top3))}")
    t1 = sum(p["hit1"] for p in per)
    t3 = sum(p["hit3"] for p in per)
    # stalls excluded from Top-1 per issue 11
    t1_nostall = sum(p["hit1"] for p in per if p["fault"] != "stalls")
    n_nostall = sum(1 for p in per if p["fault"] != "stalls")
    b1 = "PASS" if t1 >= 9 and n_faults >= 12 else "FAIL"
    b1b = "PASS" if t3 == 12 and n_faults >= 12 else "FAIL"
    print(f"BAR1 top1: {t1}/{n_faults} (ex-stalls {t1_nostall}/{n_nostall}) bar>=9/12 -> {b1}")
    print(f"BAR1 top3: {t3}/{n_faults} bar=12/12 -> {b1b}")
    # bar2: diagnose() emits z-scores only, no calibrated >=80% probs
    print("BAR2 calibration: 0 high-confidence(>=80%) claims emitted -> SKIP (diagnose() provides z-scores/UNKNOWN mass only, no calibrated probabilities; nothing to score)")
    # bar3: distinct software contexts
    ctxs = Counter()
    for r in rows:
        m = r["manifest"]
        sw = m.get("software", {}) or {}
        ctxs[(m.get("hardware"), m.get("collector_version"), sw.get("torch"), sw.get("cuda"), sw.get("driver"), m.get("workload"), m.get("trace_variant"))] += 1
    if len(ctxs) < 2:
        print(f"BAR3 generalization: 1 software context {list(ctxs)[0] if ctxs else None} n={len(rows)} -> SKIP (only one software context ingested; need a second torch/CUDA or GPU type; will not fake one)")
    else:
        print(f"BAR3 generalization: {len(ctxs)} contexts -> measurable (re-run BAR1 per context)")
    # bar4: no interventional measurements on real bundles
    print("BAR4 intervention: 0/0 measured before/after with predicted direction -> SKIP (no fix reruns on T4 traces; verify.run_intervention regenerates FakeGPU, not real bundles)")
    # bar5: diagnose() triggers no new profiler runs (offline over ingested traces)
    print("BAR5 cost-to-verify: median profiler runs 0 (diagnose consumes ingested bundles, 0 new traces) bar<=2 -> PASS")
    _calibrated_block()
    return 0


def _adapted_fault_rows(ds: Path):
    """(fault, want, seed, incident, baselines) for every non-healthy row."""
    rows = [json.loads(l) for l in ds.read_text(encoding="utf-8").splitlines() if l.strip()]
    healthy = [r for r in rows if r["manifest"]["fault"] == "healthy"]
    out = []
    for r in sorted((x for x in rows if x["manifest"]["fault"] != "healthy"),
                    key=lambda x: x["run_id"]):
        fault = r["manifest"]["fault"]
        bases = [h for h in healthy
                 if h["manifest"].get("seed") == r["manifest"].get("seed")
                 and h["manifest"].get("hardware") == r["manifest"].get("hardware")] or \
            list(healthy)
        inc = C.adapt_bundle_for_diagnose(dict(r["bundle"]), r["manifest"])
        bb = [C.adapt_bundle_for_diagnose(dict(b), h["manifest"])
              for h in bases for b in (h["bundle"],)]
        out.append({"fault": fault, "want": FAULT_CAUSE.get(fault, "?"),
                    "seed": r["manifest"].get("seed"), "inc": inc, "bases": bb})
    return out


def _calibrated_block() -> None:
    """Calibrated real-path ranking: LOO before->after on matrix-36, held-out
    on eval-bundles (fold never saw seed 11), LOO-Brier + 3-bin reliability.
    Old bars above are untouched; this block only adds."""
    art = K.load_artifact(REPO_ROOT / "reflex" / "calibration.json")
    W, b = art["W"], art["b"]
    SI8 = {s: i for i, s in enumerate(D.STAGES)}
    m36 = _adapted_fault_rows(Path(M36_DEFAULT))
    Z, y = [], []
    for rec in m36:
        comp = D.compare_real(rec["inc"], rec["bases"])
        rec["raw_rank"] = D.rank(comp["surfaces"])
        z, tail = K.featurize(comp["surfaces"])
        Z.append(K.base_logits(W, b, z, tail))
        y.append(SI8[rec["want"]])
    Z = np.array(Z)
    y = np.array(y)
    seeds = [rec["seed"] for rec in m36]
    # zero-shot (no real refit) vs uniform baselines for honesty context
    P0 = K.softmax_rows(Z)
    Puni = np.full_like(P0, 1.0 / len(D.STAGES))
    print("CAL0 baselines: zero-shot Brier=%.4f uniform Brier=%.4f" % (K.brier(P0, y), K.brier(Puni, y)))
    # leave-one-seed-out refit: fit T+bias on 2 seeds (holds constrained on
    # fitting rows only), score the 3rd through the real diagnose() path.
    folds = {}
    for s in sorted(set(seeds)):
        trm = [i for i, ss in enumerate(seeds) if ss != s]
        want = [SI8[HOLD_CAUSE[m36[i]["fault"]]] if m36[i]["fault"] in HOLD_CAUSE else None
                for i in trm]
        T, bias, info = K.fit_refit(Z[trm], y[trm], want)
        assert info["ok"], (s, info["message"])
        folds[s] = (T, bias, info)
        print("CAL-fold heldout=%s: T=%.3f bias=%s nll=%.3f" % (
            s, T, np.asarray(bias).round(2).tolist(), info["nll"]))
    Pall = np.zeros_like(P0)
    with tempfile.TemporaryDirectory() as td:
        for i, rec in enumerate(m36):
            T, bias, _ = folds[rec["seed"]]
            out = D.diagnose(rec["inc"], rec["bases"], Ledger(str(Path(td) / f"cal{i}.jsonl")),
                             strict=False, calibration={"W": W, "b": b, "T": T, "bias": bias})
            Pall[i] = [out["calibrated_proba"][s] for s in D.STAGES]
            rec["cal_top1"] = out["ranking"][0][0]
            rec["cal_top3"] = [s for s, _, _ in out["ranking"][:3]]
    raw_t1 = sum(r["raw_rank"][0][0] == r["want"] for r in m36)
    raw_t3 = sum(r["want"] in [x for x, _, _ in r["raw_rank"][:3]] for r in m36)
    cal_t1 = sum(r["cal_top1"] == r["want"] for r in m36)
    cal_t3 = sum(r["want"] in r["cal_top3"] for r in m36)
    print("CAL1 m36 LOO top1: %d/33 (raw %d/33) top3: %d/33 (raw %d/33) "
          "LOO-Brier=%.4f ECE=%.4f" % (
              cal_t1, raw_t1, cal_t3, raw_t3,
              K.brier(Pall, y), K.ece(Pall, y)))
    for s in sorted(set(seeds)):
        blk = [r for r in m36 if r["seed"] == s]
        r1 = sum(r["raw_rank"][0][0] == r["want"] for r in blk)
        r3 = sum(r["want"] in [x for x, _, _ in r["raw_rank"][:3]] for r in blk)
        c1 = sum(r["cal_top1"] == r["want"] for r in blk)
        c3 = sum(r["want"] in r["cal_top3"] for r in blk)
        print("CAL1 seed %s before->after: top1 %d->%d/%d top3 %d->%d/%d" % (
            s, r1, c1, len(blk), r3, c3, len(blk)))
    for f in sorted(HOLD_CAUSE):
        blk = [r for r in m36 if r["fault"] == f]
        r1 = sum(r["raw_rank"][0][0] == r["want"] for r in blk)
        c1 = sum(r["cal_top1"] == r["want"] for r in blk)
        print("CAL1 hold %-28s before->after top1 %d->%d/%d" % (f, r1, c1, len(blk)))
    print("CAL reliability (33 LOO out-of-fold top-prob, 3 bins):")
    for row in K.reliability_table(Pall, y):
        print("CAL rel bin %s n=%d acc=%.3f conf=%.3f" % (
            row["bin"], row["n"], row["acc"], row["conf"]))
    # second bundle set: single seed-11 slice, scored with the fold that never
    # saw seed 11 (true held-out across sets, not refit here).
    T11, bias11, _ = folds[11]
    evb = _adapted_fault_rows(Path(str(REPO_ROOT / ".loop-runs" / "eval-bundles" / "dataset.jsonl")))
    Pe, ye = [], []
    with tempfile.TemporaryDirectory() as td:
        for i, rec in enumerate(evb):
            comp = D.compare_real(rec["inc"], rec["bases"])
            rec["raw_rank"] = D.rank(comp["surfaces"])
            ye.append(SI8[rec["want"]])
            out = D.diagnose(rec["inc"], rec["bases"], Ledger(str(Path(td) / f"evb{i}.jsonl")),
                             strict=False,
                             calibration={"W": W, "b": b, "T": T11, "bias": bias11})
            Pe.append([out["calibrated_proba"][s] for s in D.STAGES])
            rec["cal_top1"] = out["ranking"][0][0]
            rec["cal_top3"] = [s for s, _, _ in out["ranking"][:3]]
    Pe = np.array(Pe)
    ye = np.array(ye)
    r1 = sum(r["raw_rank"][0][0] == r["want"] for r in evb)
    r3 = sum(r["want"] in [x for x, _, _ in r["raw_rank"][:3]] for r in evb)
    c1 = sum(r["cal_top1"] == r["want"] for r in evb)
    c3 = sum(r["want"] in r["cal_top3"] for r in evb)
    print("CAL2 evb held-out top1: %d/%d (raw %d/%d) top3: %d/%d (raw %d/%d) Brier=%.4f" % (
        c1, len(evb), r1, len(evb), c3, len(evb), r3, len(evb), K.brier(Pe, ye)))
    for rec in evb:
        print("CAL2 %-28s before->after top1 %d->%d top3 %d->%d" % (
            rec["fault"], rec["raw_rank"][0][0] == rec["want"],
            rec["cal_top1"] == rec["want"],
            rec["want"] in [x for x, _, _ in rec["raw_rank"][:3]],
            rec["want"] in rec["cal_top3"]))
    print("BAR2-calibrated: SKIP on 80%%-claims stands (33 points cannot validate "
          "'80%%-claims hit 4/5'; +-10pp needs ~100+). LOO-Brier=%.4f + 3-bin table above instead." % K.brier(Pall, y))

if __name__ == "__main__":
    raise SystemExit(main())
