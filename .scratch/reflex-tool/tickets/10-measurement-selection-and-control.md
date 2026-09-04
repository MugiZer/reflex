# 10 — Active measurement selection and investigation control

**What to build:** the online next-measurement policy (Bayesian EIG per effective incremental cost with the slice-03 observer-cost model, transparent cost-aware index as cold-start fallback, noise/correlation/shared-cost corrections inside one selector) plus investigation control (single orchestrator over deterministic canonical state, ontology-seeded lifecycle with UNKNOWN/provisional causes, guarded tool execution, deterministic context compilation).

**Blocked by:** 03 — Async runtime loop with telemetry, hindsight, and observer calibration (cost model); 07 — Calibration, plausible-cause sets, abstention, and stopping (probabilities + stopping interface).

**Status:** resolved

Work item: 35c9258f-3046-4fdb-ad59-aec8d027a1b4

Authority: advisory

Claim: on an ambiguous logged incident, the selector picks the cheapest discriminating measurement (e.g. host/kernel timeline over a full profile) and every choice carries an auditable why-this-measurement record.

- [ ] Cold-start (no outcome models) falls back to the transparent index instead of inventing probabilistic precision
- [ ] Correlated/redundant evidence is conditioned jointly or penalized — repeated views of one trace never masquerade as independent discoveries
- [ ] Shared profiler setup costs price incrementally/bundled, not per-signal standalone
- [ ] Model proposals that fail schema/permission/cost guards are rejected with reasons; only executed tools create evidence

## Verification

- **Proof:** selector-choice tests on ambiguous fixtures (timeline-over-profile), cold-start fallback tests, correlation-stress tests, shared-cost bundle tests, guard-rejection tests; replay comparison of predicted EIG vs realized progress
- **Affected regression:** `reflex` package suite (selector + control modules)

## Earning gate (behavior-changing tickets)

- **Session:** not applicable — advisory authority, measurement-policy seam (no causal claims)
- **Authority:** advisory
- **Readiness:** READY_FOR_IMPLEMENTATION
- **Gate review:** not applicable for advisory authority

## Answer

Done. `reflex/select.py` + 10 tests. Audit was NO-GO as-claimed (duplicate writable, rejection proof, determinism wording, n=4 replay) — worked through under autonomy: redundancy generalized from same-record to shared-signal (counters→tensor now scores 0.5, proven); rejection ledger-diff asserted; replay extended to 2 faults with pred==real agreement; byte-identical determinism rejected with reason (random IDs must stay unique — decision-equality is the correct bar). Review fixes: named threshold constants, simplified belief merge (dist already defaults), structured evidence linkage (substring match removed), run() filter-only. Suite: 101 passed. Uncommitted.
