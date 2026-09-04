# 12 — Incident memory, hybrid retrieval, and learning records

**What to build:** the persistent structured incident store (canonical versioned record per the doc) with hybrid retrieval — topology-aware structured core, semantic episodic index, graph rerank — plus the rule-first → retrieval → reasoning cascade, verification-gated reuse with difference cards, shrunk context-conditioned intervention priors, and offline-only learning records (no online policy updates).

**Blocked by:** 01 — Project skeleton, canonical schema, and evidence ledger (record shape); 05 — Matched baselines, differential localization, and hypothesis registry (hypothesis/context vocabulary). Proceeds on synthetic ledger entries — VERIFIED-gating end-to-end is proven in slice 14.

**Status:** resolved

Work item: b0fb5b25-8a3d-4c20-8f4e-3faac3bbc3a3

Authority: advisory

Claim: a recurring fault retrieves its verified prior with an explicit difference card, while an unverified look-alike contributes no cause authority.

- [ ] VERIFIED / TESTED / INFERRED / retracted cases have different reuse permissions (eligibility before ranking); retracted cases are excluded, never ranked
- [ ] Every influential retrieval carries a difference card: why retrieved, matches, mismatches/unknowns, verification quality, transfer risk, evidence still needed
- [ ] Same-symptom/different-cause look-alikes do not transfer the prior cause (harmful-transfer test)
- [ ] No online gradient/policy update runs from a single incident; learning writes offline-auditable records only

## Verification

- **Proof:** retrieval + difference-card tests on synthetic ledgers, contamination tests (wrong prior must not transfer cause), eligibility-tier tests, no-online-learning test
- **Affected regression:** `reflex` package suite (memory + retrieval modules)

## Earning gate (behavior-changing tickets)

- **Session:** not applicable — advisory authority, memory/prior (never verification) seam
- **Authority:** advisory
- **Readiness:** READY_FOR_IMPLEMENTATION
- **Gate review:** not applicable for advisory authority

## Answer

Done. `reflex/memory.py` (pydantic records, TF-IDF hybrid retrieval, rule cascade, tiered gates, difference cards, shrunk priors) + 7 tests, audit GO. Review caught a REAL contamination leak: recall() transferred `fix` ungated while `cause` was gated — fix now rides with cause authority, contamination test extended to assert it. Suite green. VERIFIED-gating end-to-end stays slice-14 tier per ticket. Uncommitted.
