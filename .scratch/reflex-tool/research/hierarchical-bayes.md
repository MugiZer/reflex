# Research brief: hierarchical Bayes + treatment effects + tiny-N calibration

Date: 2026-09-04. Three parallel research tracks; full returns condensed below.
Standing question: what is the best statistical machinery for Reflex at dozens
of samples per context (fault x hardware x version x workload), CPU-only,
auditable, abstain-on-uncertainty?

## Convergent verdict (all three tracks agree)

At tiny N, borrow-with-shrinkage + conflict-discard + 1-param calibration +
abstain-by-design beats everything fancy. GRF/R-learners with flexible ML,
stacking/BMA, isotonic, and neural approaches all lose to simple shrunk
baselines at dozens of samples — with published negative results, not just
absence of proof. Our current stack (temperature/Platt, fixed fusion weights,
abstention gate, no stacking, isotonic benchmark-only) is already aligned
with the evidence. The research validates the architecture; it does not
overturn it.

## Adopt now (cheap, no new data needed)

1. **James-Stein / NEST shrinkage** (James-Stein 1961; Banerjee et al. JASA 2020)
   on per-context estimates. Closed form, CPU-trivial. Needs >=3 contexts.
2. **Half-Cauchy variance priors** (Gelman 2006 Bayesian Analysis) wherever a
   hierarchical level exists — saves inference when groups <5.
3. **Forbid isotonic <1000 samples** (Niculescu-Mizil & Caruana 2005;
   Kumar et al. 2019: binning needs O(B/eps^2), scaling O(1/eps^2)).
   Already our posture (benchmark-only); now evidence-backed.
4. **Transportability selection diagrams** (Pearl & Bareinboim 2014) as design
   discipline: state S-nodes per context shift, derive no-transport abstain
   pre-data. Free, immediate, auditable.
5. **Equal weights over stacking/BMA at tiny N** (Yao et al. 2018) — already
   our posture; keep until N justifies weight estimation.

## Adopt with multi-context silicon data

6. **Robust MAP prior with ESS reporting** (Neuenschwander 2010; Schmidli et
   al. 2014) for calibration transfer: history becomes "borrowed ~N runs,"
   auto-discounts on conflict. CPU-cheap conjugate mixture.
7. **Clustered conformal** (Ding et al. NeurIPS 2023) for per-context
   uncertainty — only inside ~20-75 samples/class; outside it, pooled wins.
8. **CV+/Jackknife+ with Beta/SSBC correction** (Barber et al. 2021;
   Marques 2024) for honest tiny-N sets + abstain trigger (trivial set =>
   abstain). Reuses all data, no split waste.
9. **Dynamic power priors** (Hobbs et al. 2011) for version-to-version drift
   (fixed-a0 borrowing overconfident under shift — documented).

## Adopt with volume (gated, later)

10. **BCF-lite + GP overlap gate + Thompson on posterior** (Hahn et al. 2020;
    Zhu et al. 2023) for intervention selection — only HTE stack designed
    for tiny N with explicit heterogeneity control. X-ridge as fallback if
    MCMC is ops-blocked. Causal forests only at 100s+ samples.
11. **Causal bandits** (Lattimore et al. 2016) as selection framing on top of
    Bayesian posteriors — never standalone at T<100 pulls.

## Explicitly rejected for our regime

- GRF / R-learner with flexible ML + splitting at dozens (power collapses;
  Okasa 2022; Knaus 2021; Yu & Sun 2024: 62% of CATE worse than zero-effect).
- Isotonic / histogram calibration at N<1000. Stacking/BMA at N<100.
- Neural approaches (GAT-BN needs GPU + 634 records, sacrifices auditability).
- Meta-learning across faults before repeated task families exist (already deferred).

## Falsifiers (promote/demote on these, not on novelty)

- Partial pooling loses to pooled/unpooled on leave-one-context-out
  Recall@k + coverage/RMSE, or tau so large ESS->~0: drop the hierarchy.
- CATE can't beat zero-effect/constant-effect out-of-sample (Yu & Sun
  Q-statistic), or posterior width stalls after ~20-30 verified
  interventions: kill HTE, keep heuristic + randomized verification.
- Shrunk/robust-borrowed model loses Brier/log-loss/ECE to no-borrow global
  prior on held-out incidents: borrowing assumption false, abstain + collect.

## Source index

- Track 1 (hierarchical diagnosis): Gelman 2006 Technometrics (partial
  pooling); Gelman 2006 Bayesian Analysis (half-Cauchy); Neuenschwander
  2010 + Schmidli 2014 (robust MAP); Hobbs 2011 (commensurate/power);
  Ding 2023 (clustered conformal); Lee-Barber-Willett 2023 (HCP);
  Kumari 2020 (hierarchical RCA); Yi 2024 BayesFLo; Yuan 2026 GAT-BN (negative).
- Track 2 (treatment effects): Wager-Athey 2018 (causal forests);
  Athey-Tibshirani-Wager 2019 (GRF); Kunzel 2019 (X-learner); Nie-Wager
  2021 (R-learner); Okasa 2022, Knaus 2021, Yu-Sun 2024, Curth 2021,
  Imai-Li 2022 (finite-sample negatives); Pearl-Bareinboim 2014
  (transportability); Hahn 2020 (BCF); Zhu 2023 (GP positivity);
  Li 2010 (LinUCB); Lattimore 2016 (causal bandits).
- Track 3 (tiny-N calibration): Niculescu-Mizil 2005; Guo 2017; Kumar
  2019; Barber 2021 (Jackknife+); Marques 2024 + Zwart 2025 (SSBC);
  James-Stein 1961; Banerjee 2020 (NEST); Ibrahim-Chen 2000 (power
  prior); Schmidli 2014 (robust MAP); Yao 2018 (stacking vs BMA).
