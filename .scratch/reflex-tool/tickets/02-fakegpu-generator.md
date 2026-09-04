# 02 — FakeGPU evidence generator with fault profiles

**What to build:** the purpose-built stochastic FakeGPU (per the resolved emulator decision and its fake-evidence contract): seeded `FaultProfile` knobs for the doc's fault families, emitting L1 cheap state, L2 launch/kernel/transfer/sync events with correlation IDs, and L3 PC/stall/tensor-lineage stubs flagged synthetic — as Kineto Chrome-trace JSON plus the minimal nsys-sqlite-subset.

**Blocked by:** 01 — Project skeleton, canonical schema, and evidence ledger (emits schema records).

**Status:** resolved

Work item: 225e6da3-baf1-4f08-bf87-aa7bc6f6b2d4

Authority: advisory

Claim: for any seed plus fault preset, the generator emits deterministic, schema-valid L1/L2/L3 evidence in both artifacts.

- [ ] Same seed replays byte-equivalent event streams; different seeds diverge
- [ ] Every fault preset deterministically produces its signature (e.g. launch-overhead preset raises launch gaps; sync preset sets serialized flags)
- [ ] All emitted records validate against the slice-01 schema; every L3 record carries the synthetic flag
- [ ] Kineto JSON opens in a standard trace viewer with CPU launches linked to GPU kernels by correlation ID

## Verification

- **Proof:** seed-determinism tests, per-preset signature tests, schema-validation tests, and one viewer-opened trace (supported by unit tests; silicon fidelity is explicitly NOT claimed — fake-based, unit-only where it stands in for production profilers)
- **Affected regression:** `reflex` package suite (generator + schema modules)

## Earning gate (behavior-changing tickets)

- **Session:** not applicable — advisory authority; real-GPU swap is a later effort with its own gate
- **Authority:** advisory
- **Readiness:** READY_FOR_IMPLEMENTATION
- **Gate review:** not applicable for advisory authority

## Answer

Done. `reflex/fakegpu.py` (stdlib only) + `tests/test_fakegpu.py` (8 tests). Audit verdict was NO-GO (signature aliasing, single-preset schema, values-unchecked mirror); review added real overlap dishonesty (serial timeline claiming concurrent kernels) + ns/µs trace-unit violation. Fixed under driver autonomy: per-stream device clocks with emergent overlap (host runs ahead, sync truly stalls host), submission-cost vs queue-wait split (`launch_gap_ns` clean + new `queue_wait_ns`), µs chrome-trace clock, fidelity ceilings noted. Added specificity probe (swapped knobs fail), all-preset schema+flags, sqlite diverge+values. Suite: 24 passed. Uncommitted.
