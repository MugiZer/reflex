# 18 — REML/PM + PC-MAP tau with Q-profile CI and prediction intervals

**What to build:** extend the pooling module in place: REML and Paule-Mandel tau² beside DL (sensitivity pair), PC-exponential MAP tau as the primary point (closed form, tau_hat>0, auditable U/a), Q-profile 95% CI for tau (ignorance made visible), and prediction intervals for a new context (HTS form refusing below k=3). DL stays as legacy comparator. Reuse: existing `_dl_tau2`, `_checked`, degenerate-path conventions, stdlib-only.

**Blocked by:** None — can start immediately.

**Status:** resolved

Work item: a714238d-bde2-4b2d-8c37-08062fa7cea3

Authority: advisory

Claim: tau² estimation no longer zero-collapses silently — every estimate ships with an interval, and new-context forecasts are prediction intervals or explicit refusals.

- [ ] REML + PM points implemented closed-form (scipy 1-D optimize already a dependency), agree with DL on well-identified fixtures; REML disagrees honestly (nonzero) where DL truncates to 0, PM agrees with DL by construction (identical Q boundary — asserted as such, since no PM>0-on-DL-zero fixture can exist)
- [ ] PC-MAP tau primary: penalty form P(tau>U)=a with logged U/a, tau_hat>0 always, within ~1 SE of MLE where MLE>0
- [ ] Q-profile 95% CI for tau via scipy chi2: covers on simulated-known-tau fixtures, correctly spans [0, huge] on J=2 uninformative fixtures
- [ ] New-context PI (HTS t_{k-2}) refuses below k=3; Bayesian/normal-approx PI reported with the Partlett-Riley caveat in its method note

## Verification

- **Proof:** estimator unit tests (zero-collapse fixture where DL=0 but REML/PM/PC-MAP>0; agreement fixture), Q-profile coverage test on known-tau simulation, PI refusal + width tests, full suite green
- **Affected regression:** `reflex` package suite (pooling module only)

## Earning gate (behavior-changing tickets)

- **Session:** not applicable — advisory authority, offline estimation seam
- **Authority:** advisory
- **Readiness:** READY_FOR_IMPLEMENTATION
- **Gate review:** not applicable for advisory authority

## Answer

Done. Extended `reflex/pool.py` in place (REML/PM closed-form, PC-MAP, Q-profile CI, both PI forms) + 9 tests, suite 145 green, uncommitted. Verification round adjudicated under autonomy: FIXED — dead precompute left by an earlier edit of mine; PI built on collapsing DL tau (now REML, proven by a wiring test against the zero-collapse fixture); Q-profile degenerate [0,0] certainty (now [0, inf) ignorance); ticket checkbox corrected (PM agrees with DL by construction — no such fixture can exist, both verifiers confirmed). ACCEPTED residuals, recorded: grid references prove optimizer- not formula-independence (cross-estimator agreement is the real anchor); PC-MAP 1-SE assertion shares its formula with the test (one signal among bounds/ratio/agreement asserts); pc_map eps floor stays (no consumers, disclosed). M1-style sensitivity for the new estimators rides on the existing zero-collapse/agreement fixtures.
