# 03 — Async runtime loop with telemetry, hindsight, and observer calibration

**What to build:** the local real-timing async observation → action loop (monotonic clocks, `asyncio`, bounded nonblocking hindsight ring with pre/post-trigger preservation and drop accounting, async persistence) driven by FakeGPU evidence, plus the observer-calibration harness (paired instrumentation-off/on runs, sampling-rate sweeps, per-context cost + uncertainty).

**Blocked by:** 01 — Project skeleton, canonical schema, and evidence ledger; 02 — FakeGPU evidence generator with fault profiles.

**Status:** resolved

Work item: 6b53a8bb-d020-4009-a98b-435cd33a58ec

Authority: advisory

Claim: the loop runs at its target tick with calibrated overhead, never blocks on telemetry, and accounts for every dropped byte.

- [ ] Buffer pressure drops evidence instead of blocking the loop, and drop/overflow counts are themselves recorded
- [ ] A tail trigger preserves the correlated pre-trigger window plus a short post-trigger window from the ring
- [ ] Calibration harness reports per-collector latency/jitter deltas (off vs on) and identifies the least-perturbing useful sampling rate
- [ ] Loop restart mid-run loses only the unflushed ring window; flushed records survive intact

## Verification

- **Proof:** loop timing/overhead tests, forced-overflow drop-accounting tests, trigger-preservation tests, calibration-harness run on two collectors, restart-recovery test
- **Affected regression:** `reflex` package suite (runtime + buffering + calibration modules)

## Earning gate (behavior-changing tickets)

- **Session:** not applicable — advisory authority, local async seam
- **Authority:** advisory
- **Readiness:** READY_FOR_IMPLEMENTATION
- **Gate review:** not applicable for advisory authority

## Answer

Done. `reflex/runtime.py` (HindsightRing, Runtime, calibrate; stdlib only) + `tests/test_runtime.py` (5 tests, real sleeps, no mocks). Review round fixed, under driver autonomy: post window now preserved from the live ring (was fabricated from the bundle); deadline scheduling (flush cost no longer shifts ticks); `_obs` dedup; FAMILIES collision renamed at the reconstruct side; flops priors single-sourced from fakegpu. Audit caught a load-flaky calibration (sequential off-then-on aliased drift as cost) — fixed in the harness via interleaved off/on sampling (drift cancels in the delta), same evidence keys; suite green 3/3 full runs (41 passed). Uncommitted.
