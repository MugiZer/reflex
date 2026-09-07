# Decide the /show-me report, eval harness, and ship acceptance

Status: decided 2026-09-07 (counts, not percents — matrix is 36 bundles; graduate to rates as it grows)
Type: prototype
Blocked by: 08, 09, 10

## Question

What does the working tool ship as — the `/show-me` investigation report shape (what changed, comparator + why, localization, hypotheses + uncertainty, evidence for/against, measurement chosen + why, profiler findings, experiment + before/after effect, replay/divergence, verified cause, fix + expected recovery, similar priors + differences), the hidden-fault eval harness (Top-1/Top-3 recovery, calibration, cost-to-verify, overhead, generalization), and the acceptance bar proving a complete working tool rather than a demo?

## Acceptance bar (the tool is done when all five hold)

1. **Top-1 ≥ 9/12 faults, Top-3 = 12/12** on held-out seeds (leave-one-seed-out; stalls excluded from Top-1 until stall/counter instrumentation lands — weak separation is measured, not a surprise).
2. **Calibration:** high-confidence claims (≥80% stated) hit ≥4/5; no high-confidence miss on a Top-3.
3. **Generalization:** bar 1 re-holds on one unseen software context (new torch/CUDA) or second GPU type when available — seeds alone don't count.
4. **Intervention agreement:** 4/5 recommended fixes show measured improvement in the predicted direction.
5. **Cost-to-verify:** median diagnosis uses ≤2 profiler runs; exhaustive-profiling fallback needs a written why.
