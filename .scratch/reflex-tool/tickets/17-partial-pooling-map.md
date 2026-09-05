# 17 — Partial-pooling ranker + MAP prior (silicon-gated promotion)

**What to build:** a small hierarchical module: varying-intercept partial pooling over J context cells (fault family × hardware) with DerSimonian-Laird tau², per-cell shrunken estimates, pooling factor λ, and effective-sample-size reporting; plus a robust MAP-style prior constructor (conjugate mixture with vague component) for new-context calibration. Machinery validated on synthetic multi-context data; PRODUCTION PROMOTION gated on J≥3 measured (non-synthetic-flagged) contexts via an explicit predicate — never auto-promoted.

**Blocked by:** None — machinery is independent (promotion, not construction, waits on silicon; ticket 16 feeds it data later).

**Status:** resolved

Work item: eec5cd38-05e4-47bb-ad85-1f6d61744453

Authority: advisory

Claim: per-cell estimates borrow strength across contexts with reported pooling diagnostics, and nothing promotes without measured multi-context evidence.

- [ ] Shrunken cell estimates + λ + tau + ESS computed closed-form (stdlib only); λ∈[0,1], ESS>0, single-group/zero-variance degenerate paths refuse or fall back with reasons
- [ ] Leave-one-context-out protocol runs and reports pooled-vs-unpooled-vs-partial error on synthetic multi-context (machinery proof, not a pooling-beats-all claim)
- [ ] `ready_for_production(cells)` returns False unless ≥3 measured non-synthetic contexts exist — promotion is a gate, asserted by test, not a comment
- [ ] MAP constructor returns mixture (informative + vague) with conflict-discount behavior demonstrated (conflicting history borrows ~nothing)

## Verification

- **Proof:** estimator unit tests (shrinkage direction, bounds, degenerate paths), LOO-protocol test, promotion-gate tests (synthetic-only cells refused; 3+ measured cells admitted), conflict-discount test, full suite green
- **Affected regression:** `reflex` package suite (new pooling module only)

## Earning gate (behavior-changing tickets)

- **Session:** not applicable — advisory authority, offline estimation seam
- **Authority:** advisory
- **Readiness:** READY_FOR_IMPLEMENTATION
- **Gate review:** not applicable for advisory authority

## Answer

Done. `reflex/pool.py` (DL partial pooling, MAP mixture, both LOO flavors, `ready_for_production`, `cells_from_records`) + 13 tests, suite 136 green, uncommitted. Review round, all adjudicated: DL duplication removed (single `_dl_tau2` with C returned); TRUE leave-one-context-out added (existing observation-LOO kept as diagnostic — the ticket's falsifier now actually withholds whole contexts); `cells_from_records` derives gate flags from ingested provenance (self-certification closed); moderate-conflict curve + uncovered LOO branch now tested. Deliberately NOT changed: vague-center elicitation (needs a real elicitation source; ceiling-noted), unpooled-in-context-LOO (null by construction — unpooled cannot generalize, saying otherwise would be the fake). One fix needed a second pass (my first moderate fixture was, by the model's own accounting, no conflict at all — the model was right, the fixture was wrong).
