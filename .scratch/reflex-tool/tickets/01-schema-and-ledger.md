# 01 — Project skeleton, canonical schema, and evidence ledger

**What to build:** the `reflex` package skeleton plus the canonical versioned Trace/Incident schema (immutable typed evidence ledger with OBSERVED / INFERRED / TESTED / VERIFIED semantics, provenance and correlation IDs, hypothesis registry with UNKNOWN/UNMODELED, experiment ledger) that every later slice builds against — resolvable from the open schema decision ticket, with the ledger API usable from this slice alone.

**Blocked by:** None — can start immediately.

**Status:** resolved

Work item: 82294fb0-3802-4268-85bc-55f1e53fa848

Authority: advisory

Claim: a producer can append evidence and move hypotheses through the lifecycle, and only legal transitions persist.

- [ ] Ledger rejects illegal transitions (e.g. INFERRED → VERIFIED without a TESTED experiment) with the store unchanged after the failed write
- [ ] Invalid records (missing provenance/correlation IDs) are rejected at the boundary, not stored
- [ ] JSONL write → process restart → readback returns identical canonical records
- [ ] Replay of the same record sequence reproduces identical ledger state

## Verification

- **Proof:** focused ledger tests (transition table, invalid-input rejection, restart readback, replay determinism) covering all criteria above
- **Affected regression:** new `reflex` package suite (no existing production path — greenfield; nearest discipline reference is the pass2 controller's CSV/JSONL handling)

## Earning gate (behavior-changing tickets)

- **Session:** not applicable — advisory authority, local persistence seam only
- **Authority:** advisory
- **Readiness:** READY_FOR_IMPLEMENTATION
- **Gate review:** not applicable for advisory authority

## Answer

Done. `reflex/ledger.py` (stdlib only: frozen dataclasses, one `LedgerError`, write-ahead JSONL where `__init__` replays the file so replay ≡ load) + `tests/test_reflex_ledger.py` (6 focused tests, zero mocks of the ledger, restart proven via a real fresh subprocess). `pytest tests/` → 15 passed (6 new + 9 existing). All four criteria PROVEN. Review found one gap — `Incident`/`Experiment` lacked the `schema_version` field the versioned-schema claim requires — fixed directly (4 small edits), suite still green. `ponytail:` ceilings recorded in code (monotonic-only timestamps; no fsync/lock, single local writer). Uncommitted, per standing rule.

## Review round (code-review + audit-proof-gaps, 3 parallel subagents)

- Standards: no documented standards in repo; all findings judgement calls, most ponytail-correct as-is (mixin/clump-bundling would add abstraction); one accepted note (if/etype cascade could be a map at 6 branches — left, works).
- Spec: 2 real finds fixed — Hypothesis missing schema_version enforcement; load path (_apply) accepted pre-measured/unlinked records a live write could never produce (write-path checks mirrored on load for new lines; ceiling: no tamper-evidence, trusted single-writer logs). Tests added: transition-table nonsense + hand-edited-log rejection. 2 claimed finds rejected with reasons: "scope creep" list is ticket/map-mandated (UNKNOWN, synthetic flag, CUPTI names, predicted/measured); from_dict tolerance is load-path forward-compat, live round-trip proven byte-identical.
- Audit: GO. Zero mocks, real tmp files, genuine fresh-subprocess restart, memory+file store-unchanged assertions.
- Suite after fixes: 16 passed. One self-inflicted incident during fix application (dropped seed line + misread edit result) — caught by the suite, repaired, green.
