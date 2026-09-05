# 16 — Collector matrix: hardware/device/version capture + coverage gaps

**What to build:** extend the collector to multi-context collection: device/hardware/driver/CUDA capture in every manifest, matrix over faults × hardware × versions, and a `coverage_gaps()` query that lists missing cells so Colab sessions know exactly what to run next. No new modules (extend `reflex/collect.py` + `tests/test_collect.py`).

**Blocked by:** None — can start immediately.

**Status:** resolved

Work item: d554b0a1-dc11-45bd-b708-5df23a15f95d

Authority: advisory

Claim: every collected run carries comparable hardware/version identity, and the dataset always knows which (fault, hardware, version) cells are still missing.

- [ ] Manifest captures device/hardware/driver/CUDA/collector-version from a provider callable (fake provider in tests, nvidia-smi-backed documented for Colab); runs without identity are rejected at ingest, not silently pooled
- [ ] `coverage_gaps()` over a target matrix (faults × hardwares × versions) lists exactly the missing cells, proven by filling cells and re-querying
- [ ] Mixed-hardware datasets ingest and pair within (workload, seed, hardware) — never across hardware silently

## Verification

- **Proof:** identity-capture tests (fake provider fields land in manifest; missing identity rejected), gap-query tests (fill-and-requery converges to empty), cross-hardware pairing tests (same seed different hardware never pairs)
- **Affected regression:** `reflex` package suite (collector module only)

## Earning gate (behavior-changing tickets)

- **Session:** not applicable — advisory authority, offline collection seam
- **Authority:** advisory
- **Readiness:** READY_FOR_IMPLEMENTATION
- **Gate review:** not applicable for advisory authority

## Answer

Done. Extended `reflex/collect.py` + tests in place (no new modules). Review found one REAL hole, fixed: unknown-hardware runs pooled together — `pair_corpus` now refuses unknown provenance entirely (ingest still accepts: transport integrity vs comparability split, documented). Both verifiers' ingestions agree the remaining letter-of-ticket gap (reject-unknown-at-ingest) would break the dev/test loop for zero additional safety. Suite green. Uncommitted.
