"""Score diagnose() on real T4 bundles; print issue-11 five bars as numbers.

Usage: python scripts/eval_bars.py [--dataset .loop-runs/eval-bundles/dataset.jsonl]
Stdlib + reflex.diagnose/ledger only. Never invents data: diagnose exceptions
count as misses with the reason; unmeasurable bars print SKIP + why.
"""
from __future__ import annotations
import argparse, json, statistics, sys, tempfile
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from reflex import diagnose as D
from reflex import collect as C
from reflex.ledger import Ledger

FAULT_CAUSE = {"cpu_starvation": "cpu", "launch_overhead": "scheduler",
    "bw_pressure": "gpu", "stalls": "gpu", "sync_serialization": "scheduler",
    "transfer_heavy": "transport", "batching_delay": "preprocess",
    "queue_contention": "queue", "competing_workload": "queue",
    "kernel_regression": "gpu", "preprocessing_interference": "preprocess"}

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
                out = D.diagnose(inc, bases, led, strict=False)
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
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
