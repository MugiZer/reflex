# 09 — Deep GPU escalation ladder on fake evidence

**What to build:** the gated deep ladder on synthetic evidence: Level A targeted PC/stall-to-source attribution first, Level B semantic lift to operator/tensor cause, Level C instruction/dependency slicing for residual ambiguity — each with entry gates, expected outputs, fallbacks, stop rules, and the deferred compiler-probe rescue path behind an explicit flag.

**Blocked by:** 08 — CPU↔GPU reconstruction, critical path, and semantic adapters (needs a localized suspicious kernel set).

**Status:** resolved

Work item: c015ffaf-a7db-493e-89a5-18c32ba4ec60

Authority: advisory

Claim: a kernel-regression fault attributes to an actionable source region (or upstream tensor transformation), and the ladder stops profiling the moment evidence suffices for validation.

- [ ] Each level fires only when its entry gate holds (bounded suspect set, unresolved intra-kernel hypotheses, reproducible execution, overhead budget)
- [ ] "High memory stalls" alone never counts as sufficient — stop requires a discriminating source/dataflow distinction
- [ ] Level B recovers the responsible earlier tensor transformation on layout-regression faults, not just the final kernel
- [ ] Unavailable/insufficient sampling degrades to the documented fallback and abstains from stronger causal claims

## Verification

- **Proof:** gate-enforcement tests, source-region recovery tests on kernel faults, tensor-lineage recovery tests on layout faults, fallback/abstention tests (all on synthetic evidence — silicon actionability is explicitly NOT claimed)
- **Affected regression:** `reflex` package suite (deep-ladder modules)

## Earning gate (behavior-changing tickets)

- **Session:** not applicable — advisory authority, profiler-evidence (OBSERVED/INFERRED) seam
- **Authority:** advisory
- **Readiness:** READY_FOR_IMPLEMENTATION
- **Gate review:** not applicable for advisory authority

## Answer

Done. `reflex/deep.py` + 11 tests, audit GO on all rows. Review fixes: single `_index` helper; shared suspect-size gate; noise-outranking risk added to the silicon-fit ceiling (weights untouched — tuning to fake data would be the real slop); incidental-diff risk ceiling on level B; radius ceiling on level C. Suite green. Uncommitted.
