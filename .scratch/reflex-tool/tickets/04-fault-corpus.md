# 04 — Eleven-fault hidden-ground-truth corpus

**What to build:** the fault-injection corpus covering all 11 doc fault families (CPU starvation, launch overhead, BW pressure, stalls, sync/serialization, transfer-heavy, batching delay, queue contention, competing workload, kernel regression, preprocessing interference) as seeded `FaultProfile` presets with a hidden-ground-truth seed table for eval.

**Blocked by:** 02 — FakeGPU evidence generator with fault profiles (provides the knobs; needs no loop).

**Status:** resolved

Work item: 87632236-5ba8-47e4-897e-f83c9a137201

Authority: advisory

Claim: each of the 11 families has a reproducible preset whose ground truth stays hidden from the investigator path.

- [ ] All 11 presets generate and validate; each preset's signature is distinguishable in a corpus report
- [ ] Ground-truth labels live in a seed table that the diagnosis path never imports (enforced by a dependency-direction test)
- [ ] Entire corpus regenerates deterministically from the seed table

## Verification

- **Proof:** preset-signature tests, dependency-direction test (diagnosis modules import nothing from the corpus labels), full-corpus regeneration test
- **Affected regression:** `reflex` package suite (generator + corpus modules)

## Earning gate (behavior-changing tickets)

- **Session:** not applicable — advisory authority, offline corpus seam
- **Authority:** advisory
- **Readiness:** READY_FOR_IMPLEMENTATION
- **Gate review:** not applicable for advisory authority

## Answer

Done. `reflex/corpus.py` (SEED_TABLE seeds 101–111, signature report, AST-based direction scanner) + `tests/test_corpus.py` (4 tests). Audit: GO on all rows (live generation, non-tautological scanner proven against planted offenders, double-regen equality). No fixes needed. Uncommitted.
