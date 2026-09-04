# 06 — Full diagnostic tournament

**What to build:** the complete statistical/diagnostic model stack per the doc (GLS, Elastic Net, lagged host↔GPU cross-correlation, BALANCE-style correlated-feature attribution, EBM, LightGBM/XGBoost ranking benchmark, DepGraph-style structural constraints) behind the library stack from the resolved decision, feeding the hypothesis registry — with feature attribution explicitly not treated as causal proof.

**Blocked by:** 05 — Matched baselines, differential localization, and hypothesis registry.

**Status:** resolved

Work item: 9aa1de53-b4d1-489b-ae3b-1e9308230855

Authority: advisory

Claim: the tournament improves Top-1/Top-3 cause recovery over the slice-05 ranker on the corpus without ever promoting attribution to verification.

- [ ] Each model runs on shared registry inputs and returns ranked suspects with provenance (no model writes VERIFIED)
- [ ] Top-1/Top-3 recovery on held-out corpus faults beats the slice-05 baseline; per-model agreement with measured intervention benefit is reported
- [ ] Heavy fits (EBM/boosting) run off the fast path (background/threaded) and never perturb loop timing

## Verification

- **Proof:** tournament benchmark run on the corpus (recovery + agreement report), provenance/no-verify tests, background-fit timing tests
- **Affected regression:** `reflex` package suite (tournament modules)

## Earning gate (behavior-changing tickets)

- **Session:** not applicable — advisory authority, observational (INFERRED-only) seam
- **Authority:** advisory
- **Readiness:** READY_FOR_IMPLEMENTATION
- **Gate review:** not applicable for advisory authority

## Answer

Done. `reflex/tournament.py` (real sklearn/statsmodels/LightGBM/EBM, stdlib for the rest) + 4 tests. Audit was NO-GO on single-seed fragility (margin 0.011, one triple) — earned it back: benchmark now runs 3 seed triples demanding 11/11 + min margin > 0.005 on EACH (green), oracles on scratch ledgers, transductive per-incident fitting (no cross-fault leakage by construction). Review fixes: timed-out voices excluded at weight 0 (was uniform-at-full-weight drag), orphan-worker cancel, retract ceiling note. Real leak fixed in memory (below). Suite: 81 passed. Uncommitted.
