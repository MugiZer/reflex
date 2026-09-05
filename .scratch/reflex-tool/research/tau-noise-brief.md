# Research brief: noisy tau at J=2-5 — estimation, priors, pooling decisions

Date: 2026-09-04. Three parallel tracks on the stated problem: tau estimates
are noisy at 2-5 hardware contexts, so pooling is conservative (wide
intervals, low ESS). Question: how to fix it without fabricating certainty.

## Convergent verdict

Abandon DerSimonian-Laird as primary (zero-collapse 30-50% at tiny J,
documented). The coherent stack, agreed across tracks:

1. **Point:** REML or Paule-Mandel tau² (Veroniki 2016; Langan 2019) —
   least-bad frequentist, always paired with an interval, never alone.
2. **Prior:** PC-exponential on tau, P(tau>U)=a with U~sd(y), a=0.05
   (Simpson et al. 2017) — shrinks to pooled unless data demands otherwise;
   closed form + 1-D quadrature, no sampler, auditable (log U, a, lambda).
   Alternative with identical spirit: half-normal(0, s0), s0 = 0.5-1.0*sd(y)
   (Gelman 2006; Rover et al. 2021); Chung Gamma(2,eps) MAP variant
   guarantees tau_hat>0. Uniform(0,A) and IG(eps,eps) are documented-bad.
3. **Ignorance made visible:** Q-profile 95% CI for tau (Viechtbauer 2007;
   exact under known s_i², will correctly show [0, huge]).
4. **New-context forecast:** prediction interval, NOT confidence interval
   (Higgins et al. 2009); HTS t_{k-2} needs k>=3, bootstrap (Nagashima 2019)
   at k=2-3; Bayesian PI integrates over tau posterior. Below k~5 all PIs
   are wide or unstable — that width IS the signal (Partlett-Riley 2017).
5. **Borrow gate (the decision):** default unpooled; borrow only if Box
   predictive p>=0.05 AND per-context conflict z<=2 AND ESS_borrow <=
   min(n_local, 0.5*n_total) with robust weight <=0.2 AND the new-context PI
   does not cross the action threshold — else abstain to local-only with
   "heterogeneity unresolvable at J" (Schmidli rMAP + Hobbs commensurate +
   Morita/ELIR cap + Higgins PI veto + Cochrane caution, composed).
6. **Triage first** (Bender et al. 2018): sign-flip across contexts or
   non-exchangeable mechanisms => no quantitative pool at all, stratified
   reporting + shrinkage only.

## Explicitly rejected for J<5

- DL+Wald (overconfident zero-collapse); fixed-a0 power priors under shift;
  stacking/BMA weights (LOO folds are 20-50% of data, Pareto-k fails);
  hard Q-gates to choose pooled-vs-unpooled (Q power ~20-35%);
  neural/GBM heterogeneity models (Yu-Sun 2024 negatives hold here too).

## What this means for pool.py (concrete deltas)

- Add REML/PM tau² beside DL (sensitivity pair, not replacement).
- Add PC-exponential MAP tau (penalized, tau_hat>0) as the primary point.
- Add Q-profile CI for tau (scipy chi2, already a dependency).
- Add prediction interval for a new context (refuse below k=3 for HTS form).
- Upgrade ready_for_production with the borrow gate (ESS cap + conflict
  veto + PI-threshold check) instead of the bare J>=3 count.
- Keep: DL as legacy comparator, LOO protocol, MAP mixture, cells_from_records.

## Falsifiers

- Prior-doubling shifts posterior median tau or stacking weight >25%, or
  pooled-vs-hierarchical elpd_diff SE overlaps 0: tau UNIDENTIFIED — report
  pooled + wide interval / model-averaged prediction only.
- 20+ borrow decisions where local follow-up falls outside the
  pre-registered 95% PI >10% of the time: caps still over-share — tighten
  to never-pool below J=5.
- Q-profile CI spans 0 to >2x effect, or posterior tau ≈ prior: drop the
  hierarchy per Bender.

## Source index

- Track 1 (few-studies meta): DerSimonian-Laird 1986; Veroniki 2016;
  Langan 2019; Viechtbauer 2005 (REML); Paule-Mandel 1982; Sidik-Jonkman
  2005/2007; Hartung-Knapp 2001; Sidik-Jonkman 2002; IntHout 2014; Rover
  2015; Viechtbauer 2007 (Q-profile); Hardy-Thompson 1996; Jackson 2013;
  Rover et al. 2021 (Bayesian NNHM, arXiv:2007.08352); Friede 2016; Seide
  2019; Higgins 2009; Riley 2011; IntHout 2016; Partlett-Riley 2017;
  Nagashima 2019; Bender 2018.
- Track 2 (variance priors): Morris 1983 (EB); DerSimonian-Laird 1986;
  Hoaglin 2016; Gelman 2006 (half-t family); Chung 2013; Simpson 2017
  (PC priors); Fong-Rue-Wakefield 2010; Bhattacharya 2015 + Piironen-Vehtari
  2017 (horseshoe); Zhang 2022 + Aguilar-Burkner 2023 (R2D2); Yao 2018
  (stacking); BayesBlend 2024.
- Track 3 (pooling decisions): Schmidli 2014 (rMAP); Hobbs 2011/2012
  (commensurate); Jiang-Nie-Yuan 2021 + Yang 2023 + Zhang 2023 (elastic);
  Morita 2008 + Neuenschwander 2020 (ESS); Friede 2017 (k=2 meta);
  Higgins 2009 + Riley 2011 + Partlett-Riley 2017 + Nagashima 2019 +
  Cochrane Ch.10 (PI); James-Stein 1961; Stein 1981; Efron-Morris 1973/1975;
  Morris 1983; Zhang-Huang-Imai 2024/2026 + Mo-Qi-Liu 2024 + Manski 2004
  (minimax regret); Yao 2018/2022 (stacking); Chow 1970 + Angelopoulos 2022
  + Bates 2021 + Abbasi-Yadkori 2024 (abstention).

## Adopted decision (2026-09-04)

Replace DL-as-primary with: REML/Paule-Mandel point (sensitivity pair) +
PC-exponential MAP tau as primary (closed form, tau_hat>0, auditable U/a)
+ Q-profile 95% CI for tau (report ignorance visibly) + prediction
intervals (never CI) for new hardware, refusing HTS form below k=3 +
borrow gate (default unpooled; borrow only on Box-p + conflict z + ESS cap
+ PI-threshold; else abstain). DL stays as legacy comparator. Everything
lands in production paths (pool module, eval reporting, promotion gate) —
no sidecar. Tickets 18 (estimators) then 19 (gate + wiring).
