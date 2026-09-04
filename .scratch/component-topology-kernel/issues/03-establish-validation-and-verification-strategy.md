# 03 — Establish the validation and verification strategy

**What to build:** Establish the evidence ladder and release rules that determine when a calculated topology result may be labelled Verified, when it must remain a Preliminary unsafe estimate, and when calculation must be rejected.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Execution mode:** AFK research. Use primary standards, official documentation, peer-reviewed literature, and independently maintained benchmark implementations wherever available. Clearly mark inferences and recommendations.

**Parent investigation:** `context/issues/component-topology-kernel/003-establish-validation-and-verification-strategy.md`

## Required return artifacts

1. Research and decision report: `context/references/component-topology-validation-strategy-2026-07-23.md`.
2. Within that report, a source matrix, validation ladder, proposed quantitative thresholds, validation-envelope decision table, and gap-closing work plan.

## Acceptance criteria

- [ ] The report distinguishes software verification, numerical convergence, analytical benchmarks, published reference cases, cross-solver comparison, standards-based validation, and independent specialist review.
- [ ] Primary evidence is gathered for applicable ISO-style thermal-bridge methods and credible open-source comparators such as Feel++ or Conducteö; limitations of every source are recorded.
- [ ] Metrics and proposed thresholds cover mesh convergence, heat balance, repeat-cell stability, geometry/material fidelity, solver agreement, and reproducibility.
- [ ] The validation envelope is treated as an interaction-level claim, not as independent approval of reusable primitives that can be composed without limits.
- [ ] A decision table maps input provenance, supported vocabulary, envelope match, convergence, and validation evidence to **Verified**, **Preliminary unsafe estimate**, or **Reject**.
- [ ] The initial envelope is evaluated against timber framing, one C-profile row, two aligned/staggered C-profile rows, and the Z-profile regression case.
- [ ] The minimum evidence required before production use and before any Verified label is explicit, including whether external specialist review is mandatory.
- [ ] Research findings, proposed product policy, and decisions requiring owner approval are clearly separated.
- [ ] Remaining evidence gaps name the exact experiment, source, comparator, or reviewer needed to close them.

## Closure response

Return the report path, recommended validation ladder and thresholds, what can be adopted immediately, what needs owner approval, and the exact blockers for Tickets 04 or 05.
