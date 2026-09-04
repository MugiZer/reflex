# 07 — Calibration, plausible-cause sets, abstention, and stopping

**What to build:** the confidence layer: offline post-hoc calibration (temperature/Platt/isotonic) anchored by the fault corpus, practical plausible-cause sets, the abstention gate (separate from stopping), and EVI-aware sequential stopping — with ranking always valid and multi-cause representation via marginals/composites, never a forced simplex.

**Blocked by:** 06 — Full diagnostic tournament (calibrates its outputs).

**Status:** resolved

Work item: 6484161d-1d7e-4ab9-9375-1fa6558d2306

Authority: advisory

Claim: the tool reports trusted probabilities only where calibration validates them, abstains from fix commitments under ambiguity, and stops measuring when nothing has positive net value.

- [ ] With stale/missing calibration, outputs expose ranked scores marked untrusted — never fabricated probabilities
- [ ] Ambiguous incidents abstain with a reason plus the nominated next discriminating measurement; abstain-and-continue vs abstain-and-stop are distinct states
- [ ] Stopping fires only when the best remaining measurement has non-positive net expected value (or constraints exhaust); no stopping rule promotes INFERRED to VERIFIED
- [ ] Compound-fault incidents keep marginal/composite hypotheses instead of splitting one probability mass

## Verification

- **Proof:** calibration-health gating tests, risk–coverage + false-confident-diagnosis tests on the corpus, stopping-policy replay comparing error/cost/measurements vs fixed-rule baselines, compound-fault representation tests
- **Affected regression:** `reflex` package suite (confidence + policy modules)

## Earning gate (behavior-changing tickets)

- **Session:** not applicable — advisory authority, decision-policy seam (no causal claims)
- **Authority:** advisory
- **Readiness:** READY_FOR_IMPLEMENTATION
- **Gate review:** not applicable for advisory authority

## Answer

Done. `reflex/confidence.py` (temperature/Platt/isotonic + MAPIE benchmark, abstention gate, EVI stopping, marginals/composites) + 10 tests, suite 91 passed ×2. Found pre-built by an earlier partial session; verified as own work: full read + review + audit, both partially dissenting. Fixes applied: T-at-floor now reports capped (5% edge tolerance; was mislabeling ok) with the previously-untested capped branch now asserted; isotonic reuses the fitted base (was refitting); MAPIE signature accepts a held-out fold (same-data call kept with documented optimism — 4 EVAL rows can't satisfy n>5 at level 0.8, demo-only until volume exists). Rejected: eval-n noise alarm (identity map fails by miles, not noise), MAPIE removal (deferred-C16 path, fenced as benchmark). Residual accepted: stopping beats full-fusion but ties cheapest-only on cost (rule itself proven; fixed-budget comparator needs 1-voice-wrong fixtures). Uncommitted.
