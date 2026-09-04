# 08 — CPU↔GPU reconstruction, critical path, and semantic adapters

**What to build:** the request-scoped heterogeneous dependency DAG over shared execution (correlation IDs, clock alignment with uncertainty bounds, shared batch nodes), differential critical-path localization under concurrency, suspect-subgraph extraction, dynamic-roofline broad classification, lagged correlation as baseline, and the first framework semantic adapter over the neutral graph.

**Blocked by:** 02 — FakeGPU evidence generator with fault profiles (defines the event/edge vocabulary; proceeds on synthetic matched pairs — differential-vs-slice-05 integration is proven in slice 14).

**Status:** resolved

Work item: 5db83572-c234-488c-8f93-fe997ecd3081

Authority: advisory

Claim: on host-starvation vs synchronization faults, dependency evidence — not correlation — assigns the delay to the right path, with shared work carrying explicit attribution uncertainty.

- [ ] Host-induced GPU idle ("host stopped feeding the GPU") is representable and wins over "GPU is slow" on starvation faults
- [ ] Missing events/clock uncertainty produce explicit unknown/low-confidence edges — never invented order from timestamp proximity
- [ ] Suspect-subgraph extraction retains the true causal predecessor on the corpus faults (measured retention rate)
- [ ] Roofline output narrows the hypothesis family only; lagged correlation nominates but never overrides an observed dependency edge

## Verification

- **Proof:** starvation-vs-sync discrimination tests, missing-event degradation tests, extraction-retention tests, roofline-confusion-matrix on synthetic pairs (full differential-vs-live-baseline proof deferred to slice 14 as integration tier)
- **Affected regression:** `reflex` package suite (graph + localization modules)

## Earning gate (behavior-changing tickets)

- **Session:** not applicable — advisory authority, structural-localization (INFERRED-only) seam
- **Authority:** advisory
- **Readiness:** READY_FOR_IMPLEMENTATION
- **Gate review:** not applicable for advisory authority

## Answer

Done. `reflex/reconstruct.py` (stdlib Kahn DAG, differential critical path, suspect extraction, roofline, xcorr baseline, lineage adapter) + `tests/test_reconstruct.py` (8 tests). Audit: GO with note (xcorr nomination quality unproven by ticket design — never-overrides proven, guess quality is slice-14 tier). Fixes: ROOFLINE_FAMILIES rename, single-sourced flops, path-conflation ceiling comment. Uncommitted.
