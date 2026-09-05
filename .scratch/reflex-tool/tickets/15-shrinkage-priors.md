# 15 — James-Stein shrinkage over per-family voice accuracies

**What to build:** a small shrinker that takes measured per-family voice accuracies (from tournament benchmark rows) and returns James-Stein-shrunk estimates feeding `fit_values` — replacing the hand-set accuracy table with measured-and-shrunk numbers, with NEST heteroscedastic form as the documented upgrade.

**Blocked by:** None — can start immediately (06 benchmark rows exist as input shape; this slice reads them, changes nothing upstream).

**Status:** resolved

Work item: 389e65ca-6dea-4966-a56d-67fd092a6145

Authority: advisory

Claim: shrunk per-family voice accuracies predict held-out families better than raw means, and wire into `fit_values` without changing its contract.

- [ ] Shrinker beats raw family means on held-out families (lower MSE vs known-truth simulation AND on real benchmark rows via cross-family holdout)
- [ ] Output plugs into `fit_values` unchanged (same table shape it already accepts)
- [ ] Degenerate inputs behave: single family / identical values / zero variance fall back to raw means, never NaN, never fabricated precision

## Verification

- **Proof:** shrinkage-vs-raw MSE tests (simulation with known truth + cross-family holdout on real benchmark agreement), wiring test (`fit_values` accepts the shrunk table), edge-case tests (degenerate inputs)
- **Affected regression:** `reflex` package suite (new shrinker module only; no existing module touched)

## Earning gate (behavior-changing tickets)

- **Session:** not applicable — advisory authority, offline estimation seam
- **Authority:** advisory
- **Readiness:** READY_FOR_IMPLEMENTATION
- **Gate review:** not applicable for advisory authority

## Answer

Done. `reflex/shrink.py` (positive-part James-Stein, centered S, variances required, honest degenerate fallbacks) + 6 tests, suite 118 passed, uncommitted. Verified by hand-read: estimator correct, no NaN paths, stdlib only. HONEST NEGATIVE on the core claim: simulation wins proven (34.5% and 12.2% MSE cuts, passthrough-fails), but real-benchmark cross-family holdout does NOT favor shrinkage (raw 0.1969 vs shrunk 0.1993; rotations flip signs — families genuinely heterogeneous, gap noise-dominated). Per our falsifier doctrine: NOT promoted to default, NOT wired into `fit_values` production path — wiring proven compatible, promotion gated on silicon multi-context data where borrowing has something to borrow. NEST heteroscedastic form stays the documented upgrade.
