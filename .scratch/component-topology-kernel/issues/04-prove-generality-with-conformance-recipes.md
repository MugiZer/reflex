# 04 — Prove generality with conformance recipes

**What to build:** Demonstrate that one family-neutral recipe compiler and primitive registry can represent and solve materially different repeating wall-component arrangements without adding family branches to the kernel.

**Blocked by:** 01 — Prove the open-source topology worker; 02 — Define the recipe and primitive-registry contract.

**Status:** ready-for-agent once blockers are resolved

**Execution mode:** HITL prototype. Work only from the accepted outputs of Tickets 01 and 02. Present evidence and proposed contract amendments before resolving the ticket. Do not modify production code.

**Parent investigation:** `context/issues/component-topology-kernel/004-prove-generality-with-conformance-recipes.md`

## Required return artifacts

1. Generality decision report: `context/references/component-topology-generality-proof-2026-07-23.md`.
2. Reproducible conformance bundle: `.scratch/component-topology-kernel/conformance-proof/`.
3. One documented command that compiles and verifies all accepted and rejected conformance cases and exits non-zero on regression.

The bundle must contain recipes, primitive registrations, an isolated prototype compiler, deterministic generated models/results, expected rejection diagnostics, and a machine-readable regression summary.

## Acceptance criteria

- [ ] The report returns one decision: **generality proven**, **proven with named contract changes**, or **not proven**.
- [ ] The same kernel path handles timber framing, a single C-profile row, two aligned and staggered C-profile rows, and a Z-profile regression case.
- [ ] A feature matrix shows which common behavior comes from the kernel, which geometry comes from primitive plugins, and which safety rules come from validation policy.
- [ ] There are no family-name conditionals or hidden Z-girt/stud assumptions in the kernel or shared recipe compiler.
- [ ] Geometry determinism, material-region conservation, contact/interface correctness, mesh convergence, heat balance, U-value, and runtime are reported for every accepted case.
- [ ] Crossed framing, discrete point bridges, disconnected members, components outside the host, and unregistered primitives are rejected or downgraded with deterministic reasons.
- [ ] The report identifies abstraction leakage, unstable primitive boundaries, schema changes, numerical limits, and cases that need a different topology module.
- [ ] All results are reproducible from the documented command without relying on production application state.

## Closure response

Return the artifact paths, verification outcome, generality decision, contract amendments, rejected-scope findings, and the resulting blockers or inputs for Ticket 05.
