# 19 — Borrow gate upgrade + production wiring

**What to build:** upgrade the promotion gate with the full borrow rule (default unpooled; borrow only on Box-p + per-context conflict z<=2 + ESS cap + new-context PI-threshold check; else abstain with "heterogeneity unresolvable") and wire pooling into production paths: eval harness reports tau/PI/ESS diagnostics where multi-context cells exist (skipped-with-reason where absent), and the refit path consults the gate before trusting pooled estimates. Reuse: existing `ready_for_production`, `cells_from_records`, eval harness, MAP mixture.

**Blocked by:** 18 — REML/PM + PC-MAP tau with Q-profile CI and prediction intervals (gate consumes its intervals).

**Status:** resolved

Work item: 0f33cbed-69a7-49bf-ba4c-856b337b1bc9

Authority: advisory

Claim: no pooled estimate reaches production behavior unless the borrow gate passes on measured evidence; everything pooled is labeled with its diagnostics.

- [ ] Gate implements all four checks (Box-p, conflict veto, ESS cap, PI-threshold) with each check individually falsifiable by test (disable one check → gate opens on a fixture it should refuse)
- [ ] Eval reports tau/PI/ESS per multi-context group when cells exist; single-context runs report "heterogeneity unresolvable at J" instead of numbers
- [ ] Cells derived from ingested provenance only (no caller-asserted flags anywhere in the wired path)

## Verification

- **Proof:** per-check falsification tests, eval-with-cells and eval-without-cells tests, provenance-derivation test, full suite green
- **Affected regression:** `reflex` package suite (gate + eval modules)

## Earning gate (behavior-changing tickets)

- **Session:** not applicable — advisory authority, decision-policy seam
- **Authority:** advisory
- **Readiness:** READY_FOR_IMPLEMENTATION
- **Gate review:** not applicable for advisory authority

## Answer

Done. Borrow gate + eval wiring + provenance derivation, audit GO on all five rows. Review fixes applied: `_box_p` reuses `_q_of`/`_re_mu_q` (was a third copy of Q); eval call site passes explicit uncapped ess_cap/threshold with the no-D*-yet rationale (was accidental-looking defaults — same behavior, now a recorded choice). Accepted residuals: grid references prove optimizer- not formula-independence (cross-estimator agreement is the anchor); unpooled-in-context-LOO stays null by construction. Suite: 152 passed. Uncommitted.
