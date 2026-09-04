# 05 — Matched baselines, differential localization, and hypothesis registry

**What to build:** matched healthy-baseline comparison (context-matched comparator + rationale) with differential performance surfaces, end-to-end subsystem localization across the doc's stage list, the explicit hypothesis registry (support/contradiction evidence IDs, UNKNOWN/UNMODELED mass, provisional causes), and the first interpretable ranker (Median/MAD + matched deltas).

**Blocked by:** 01 — Project skeleton, canonical schema, and evidence ledger; 04 — Eleven-fault hidden-ground-truth corpus.

**Status:** resolved

Work item: 9e8ba487-11df-415d-81a0-3f5f90566944

Authority: advisory

Claim: on a corpus incident with a known p99 regression, the slice names the responsible subsystem and holds competing hypotheses with explicit uncertainty instead of forcing one winner.

- [ ] Comparator matches on model/version/workload context, never the global median (mismatched-context comparison is rejected or flagged)
- [ ] A +8ms-class p99 regression localizes its excess to the correct subsystem's matched stage deltas
- [ ] Ambiguous evidence yields a multi-hypothesis state with UNKNOWN mass — never a single forced cause, never a fix recommendation
- [ ] Suppressed hypotheses retain their weakening evidence and can reopen on new evidence (no silent deletion)

## Verification

- **Proof:** comparator-matching tests, localization tests on 3+ corpus faults, ambiguity tests (multi-hypothesis + abstain-from-fix), suppress/reopen lifecycle tests
- **Affected regression:** `reflex` package suite (baseline + localization + registry modules)

## Earning gate (behavior-changing tickets)

- **Session:** not applicable — advisory authority, observational (INFERRED-only) seam
- **Authority:** advisory
- **Readiness:** READY_FOR_IMPLEMENTATION
- **Gate review:** not applicable for advisory authority

## Answer

Done. `reflex/diagnose.py` + 9 tests, audit GO on all rows (incl. no corpus-label leakage, machine-verified). Review fixes: unified tie-break (intra-stage winner and rank order now share z/delta/name semantics); median computed once; readable p99; Registry overlay-vs-canonical ceiling noted. Rejected with reasons: UNMODELED-as-second-bucket (no consumer downstream; single UNKNOWN bucket implements the doc's combined state), exact-float report (failing loudly on future change is desired), median→n/a. Suite green. Uncommitted.
