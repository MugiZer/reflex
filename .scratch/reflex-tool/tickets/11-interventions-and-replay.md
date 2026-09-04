# 11 — Controlled interventions, replay, and first divergence

**What to build:** real Coz-style + in-distribution interventions on the synthetic runtime (isolate submit thread, change batching/concurrency, remove competing workload, revert fusion/kernel config) with predicted-vs-measured end-to-end benefit, stored as context + hypothesis + magnitude + effects — plus Retriever-style replay and FReD-style first-divergence search feeding VERIFIED status.

**Blocked by:** 03 — Async runtime loop with telemetry, hindsight, and observer calibration (the interventions act on the loop; selector-driven experiment choice integrates in slice 14).

**Status:** resolved

Work item: e2c035a1-c9d0-4152-b637-8eb4b0de7208

Authority: advisory

Claim: a CPU-isolation experiment on a starvation fault recovers the lost p99 and records a VERIFIED cause with measured benefit — the first slice allowed to write VERIFIED.

- [ ] Each experiment records prediction before execution and measured end-to-end effect after, including neutral/negative results
- [ ] VERIFIED is written only from executed experiments (or equivalent discriminating tests), never from confidence alone
- [ ] Replay reproduces the incident's logical execution closely enough to locate first divergence vs the healthy run
- [ ] Failed/non-reproducible experiments degrade to TESTED with the failure recorded, not to VERIFIED

## Verification

- **Proof:** starvation-recovery experiment test (predicted vs measured p99), VERIFIED-gate tests (confidence alone cannot promote), replay/divergence tests on 2+ faults, experiment-ledger tests
- **Affected regression:** `reflex` package suite (experiment + replay modules)

## Earning gate (behavior-changing tickets)

- **Session:** not applicable — advisory authority, TESTED/VERIFIED ledger seam on synthetic runtime
- **Authority:** advisory
- **Readiness:** READY_FOR_IMPLEMENTATION
- **Gate review:** not applicable for advisory authority

## Answer

Done. `reflex/verify.py` + 9 tests, audit GO on all rows (prediction/measured independence verified, replay genuine, failures land TESTED). Review fix that mattered: first_divergence excluded absolute clocks — starvation now localizes to kernel 1 via queue_wait_ns (kernel 0 is identical work; the old index-0 was timestamp oversensitivity), test expectations updated with documented rationale. Suite green 2/2. Uncommitted.
