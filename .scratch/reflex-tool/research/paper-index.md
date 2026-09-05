# Paper index: hierarchical Bayes, treatment effects, tiny-N calibration

Source: three parallel research tracks, 2026-09-04. Every entry: full
citation + link + one-line Reflex relevance. Companion synthesis (ranked
adoptions, falsifiers): `hierarchical-bayes.md`.

## Track 1 — Hierarchical Bayes / partial pooling for diagnosis & transfer

- Gelman, "Multilevel (Hierarchical) Modeling: What It Can and Cannot Do",
  Technometrics 48(3), 2006 — https://doi.org/10.1198/004017005000000661
  (preprint: https://stat.columbia.edu/~gelman/research/published/multi2.pdf)
  — Partial pooling as precision-weighted compromise; radon demo (J=85,
  n_j=2..100) beats pooled/unpooled; exactly our N regime.
- Gelman, "Prior Distributions for Variance Parameters in Hierarchical
  Models", Bayesian Analysis 1(3), 2006 — https://doi.org/10.1214/06-ba117a
  — Half-Cauchy/half-t priors for group SD; saves inference when groups <5
  (our "new GPU, 3 fault families" case).
- Neuenschwander, Capkun-Niggli, Branson & Spiegelhalter, "Summarizing
  Historical Information on Controls in Clinical Trials", Clinical Trials
  7(1), 2010 — https://pubmed.ncbi.nlm.nih.gov/20156954/ — Meta-analytic
  predictive (MAP) prior: history becomes borrowable runs.
- Schmidli, Gsteiger, Roychoudhury, O'Hagan, Spiegelhalter &
  Neuenschwander, "Robust Meta-Analytic-Predictive Priors", Biometrics
  70(4), 2014 — https://doi.org/10.1111/biom.12242 — Robustified MAP
  (mixture with vague component) auto-discounts on prior-data conflict;
  report effective sample size (ESS). Single-trial history (n=14) -> ESS~7.
- Hobbs, Carlin, Mandrekar & Sargent, "Hierarchical Commensurate and Power
  Prior Models", Biometrics 67(3), 2011 —
  https://doi.org/10.1111/j.1541-0420.2011.01564.x — Learned-borrowing
  power prior for gradual drift; adaptive shutoff on conflict (worse
  auditability than MAP; documented overconfidence under conflict).
- Ibrahim & Chen, "Power Prior Distributions for Regression Models",
  Statistical Science 2000 — https://doi.org/10.1214/ss/1009212673 —
  Foundational power prior (likelihood^a0); use dynamic/normalized form,
  never fixed a0 under shift.
- Ding, Angelopoulos, Bates, Jordan & Tibshirani, "Class-Conditional
  Conformal Prediction with Many Classes (Clustered Conformal)", NeurIPS
  2023 — https://arxiv.org/abs/2306.09335 — Per-group uncertainty via
  score-quantile clustering; wins only ~20-75 samples/class, pooled wins
  outside — use strictly inside that window.
- Lee, Barber & Willett, "Distribution-Free Inference with Hierarchical
  Data (HCP/HCP2)", arXiv 2023 — https://doi.org/10.48550/arxiv.2306.06342
  — Conformal quantiles for hierarchically exchangeable groups; needs many
  groups, breaks under systematic shift; second-layer use only.
- Kumari, Lee, Wang, Karim & Kwon, "Root Cause Analysis of Key Process
  Variable Deviation for Rare Events", Ind. Eng. Chem. Res. 59(39), 2020 —
  https://doi.org/10.1021/acs.iecr.0c00624 — Hierarchical Bayes over
  fault-tree sources for rare events; closest published analogue of
  fault-family x hardware pooling (needs a fault tree; MCMC heavier).
- Yi, Mak, Lekivetz & Morgan, "BayesFLo: Bayesian Fault Localization",
  arXiv 2024 — https://arxiv.org/pdf/2403.08079 — Prior over failure
  combinations with hierarchy/heredity; ranked cause probs at tens of runs;
  no cross-context transfer (pair with MAP).
- Yuan, Han & Dong, "GAT-BN", Scientific Reports 2026 —
  https://doi.org/10.1038/s41598-026-36883-7 — NEGATIVE anchor: neural-prior
  BNs beat flat BNs at tiny N but need GNN + GPU + 634 records, sacrificing
  auditability.
- Gelman & Hill, "Data Analysis Using Regression and Multilevel/Hierarchical
  Models", Cambridge 2007 — implementation manual for the above.

## Track 2 — Treatment effects & intervention selection at small N

- Wager & Athey, "Estimation and Inference of Heterogeneous Treatment
  Effects using Random Forests", JASA 2018, 113(523) —
  https://arxiv.org/abs/1510.04342 — Causal forests: honest splitting +
  asymptotic CIs. FAILS at dozens (power collapses <500; no abstain).
- Athey, Tibshirani & Wager, "Generalized Random Forests", Annals of
  Statistics 2019, 47(2) — https://arxiv.org/abs/1610.01271 — GRF as
  adaptive kernel; same small-N verdict as above.
- Kunzel, Sekhon, Bickel & Yu, "Meta-learners for Estimating HTE using
  Machine Learning", PNAS 2019, 116(10) —
  https://doi.org/10.1073/pnas.1804597116 (https://arxiv.org/abs/1706.03461)
  — S/T/X-learners; X with ridge/shallow RF, full-sample, is the cheapest
  survivor at N=500-2000 and imbalance. S biases to zero, T overfits tiny N.
- Nie & Wager, "Quasi-Oracle Estimation of HTE (R-learner)", Biometrika
  2021, 108(2) — https://arxiv.org/abs/1712.04912 — Neyman-orthogonal
  two-step; needs N>=8k-32k to bite; use only as R+ridge/lasso if at all.
- Okasa, "Meta-Learners: Finite Sample Cross-Fit Performance",
  arXiv 2022 — https://arxiv.org/abs/2201.12692 — NEGATIVE: splitting hurts
  at 500-2k; full-sample+OOB wins; X best small/unbalanced.
- Knaus et al., "Machine Learning Estimation of Heterogeneous Causal
  Effects: Empirical Monte Carlo Evidence", arXiv 2021 —
  https://arxiv.org/abs/1810.13237 — NEGATIVE: only multi-step
  doubly-robust wins consistently across 24 DGPs; rest DGP-fragile.
- Yu & Sun, "Do Contemporary Models Capture Real-World Heterogeneity?",
  arXiv 2024 — https://arxiv.org/abs/2410.07021 — NEGATIVE: 62% of CATE
  worse than zero-effect, 80% worse than constant where constant works
  (16 models x 12 field datasets). Source of the Q-statistic falsifier.
- Curth & van der Schaar, "On Inductive Biases for HTE Estimation",
  arXiv 2021 — https://arxiv.org/abs/2106.03765 — T/S encourage phantom
  heterogeneity; shared-structure regularization wins finite-sample.
- Imai & Li, "Statistical Inference for HTE Discovered by Generic ML",
  arXiv 2022 — https://arxiv.org/abs/2203.14511 — generic ML fails to find
  heterogeneity at small N; needs Neyman correction.
- Pearl & Bareinboim, "External Validity: From Do-Calculus to
  Transportability Across Populations", Statistical Science 2014, 29(4) —
  https://arxiv.org/abs/1503.01603 — Selection diagrams decide pre-data
  whether an effect transports; S on the outcome mechanism = principled
  no-transport abstain. Zero data cost.
- Hahn, Murray & Carvalho, "Bayesian Regression Tree Models for Causal
  Inference (BCF)", Bayesian Analysis 2020, 15(3) —
  https://arxiv.org/abs/1706.09523 — BEST tiny-N fit: shrink-to-homogeneity
  prior + propensity in prognostic term; posterior = calibrated abstain.
  Needs Windows Python port (stochtree/bcf/dbarts), not R-only flow.
- Zhu, Mitra & Roy, "Addressing Positivity Violations using Gaussian
  Process Priors", Biometrics 2023 — https://arxiv.org/abs/2110.10266 —
  Distance-to-opposite-arm covariance inflates variance off-support:
  drop-in overlap-abstain gate. O(N^3) irrelevant at dozens.
- Li, Chu, Langford & Schapire, "A Contextual-Bandit Approach to
  Personalized News Recommendation", WWW 2010 — LinUCB baseline for
  selection framing; needs 100s-1000s pulls alone.
- Lattimore, Lattimore & Reid, "Causal Bandits: Learning Good Interventions
  via Causal Inference", NeurIPS 2016 — https://arxiv.org/abs/1606.03203
  — Share information across arms via causal graph; use as Thompson/EVOI
  policy ON posteriors, never standalone at T<100.

## Track 3 — Tiny-N calibration, shrinkage, honest sets

- Niculescu-Mizil & Caruana, "Predicting Good Probabilities with Supervised
  Learning", ICML 2005 —
  https://www.cs.cornell.edu/~alexn/papers/calibration.icml05.crc.rev3.pdf
  — Platt beats isotonic below N=1000 (learning curves at 10/100/1000/
  10000); recalibrating well-calibrated bases hurts when small.
- Guo, Pleiss, Sun & Weinberger, "On Calibration of Modern Neural
  Networks", ICML 2017 — https://arxiv.org/abs/1706.04599 — Single-T
  temperature scaling; 1 dof = minimal variance default. No shift handling.
- Kumar, Liang & Ma, "Verified Uncertainty Calibration", NeurIPS 2019 —
  https://arxiv.org/abs/1909.10155 — Binning needs O(B/eps^2) vs O(1/eps^2)
  for scaling: theory for never using isotonic/histograms at N=10s; plus
  debiased low-sample ECE estimator.
- Barber, Candes, Ramdas & Tibshirani, "Predictive Inference with the
  Jackknife+", Annals of Statistics 2021 — https://arxiv.org/abs/1905.02928
  (K-fold CV+ via Vovk 2015) — Reuses all data (no split waste); guarantee
  1-2alpha, budget the gap; width is a natural abstain signal.
- Marques F., "Universal Distribution of Empirical Coverage in Split
  Conformal + Small Sample Beta Correction", Statistics & Probability
  Letters 2024 — https://arxiv.org/abs/2303.02770 — Calibration-conditional
  coverage is exactly Beta: gives minimum-n for usable sets; trivial set =>
  abstain. Companion: Zwart, arXiv 2025 — https://arxiv.org/abs/2509.15349.
- James & Stein, "Estimation with Quadratic Loss", Proc. 4th Berkeley
  Symposium 1961 — https://projecteuclid.org/ebooks/berkeley-symposium-on-mathematical-statistics-and-probability/Proceedings-of-the-Fourth-Berkeley-Symposium-on-Mathematical-Statistics-and/chapter/Estimation-with-Quadratic-Loss/bsmsp/1200512173
  — Shrinkage dominates MLE for p>=3; biggest wins at tiny per-group n.
- Banerjee, Fu, James, Mukherjee & Sun, "Nonparametric Empirical Bayes on
  Heterogeneous Data (NEST)", JASA 2020 — https://arxiv.org/abs/2002.12586
  — Heteroscedastic modern James-Stein via Tweedie/NPMLE.
- Ibrahim & Chen, "Power Prior Distributions for Regression Models",
  Statistical Science 2000 — https://doi.org/10.1214/ss/1009212673 —
  Foundational discounted-history prior; use dynamic/normalized form.
  Tuning fragility note: Weru et al., arXiv 2024 —
  https://arxiv.org/abs/2412.03185.
- Schmidli et al., "Robust Meta-Analytic-Predictive Priors", Biometrics
  2014 — https://doi.org/10.1111/biom.12242 — (see Track 1; the borrower
  with explicit conflict discard).
- Yao, Vehtari, Simpson & Gelman, "Using Stacking to Average Bayesian
  Predictive Distributions", Bayesian Analysis 2018 —
  https://arxiv.org/abs/1704.02030 — NEGATIVE for tiny N: stacking wins
  under misspecification but LOO weights unstable at N=10s; use equal
  weights. Vs Hoeting et al., "Bayesian Model Averaging: A Tutorial",
  Statistical Science 1999 — https://doi.org/10.1214/ss/1009212519
  (BMA collapses/overconfident under shift).
