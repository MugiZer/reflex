# 01 — Prove the open-source topology worker

**What to build:** Prove or disprove that a pinned local Python worker using Shapely and Netgen/NGSolve can reliably turn a supported repeating 2-D component recipe into a conforming thermal model and a converged result, while behaving safely when supervised by the existing application.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Execution mode:** HITL prototype. The agent may run the investigation autonomously, but must present the evidence and recommendation before this ticket is considered resolved. Do not modify production code.

**Parent investigation:** `context/issues/component-topology-kernel/001-prove-open-source-topology-worker.md`

## Required return artifacts

1. Decision report: `context/references/component-topology-worker-spike-2026-07-23.md`.
2. Reproducible spike bundle: `.scratch/component-topology-kernel/worker-spike/`.
3. A single documented verification command that exits non-zero when the spike or its assertions fail.

The spike bundle must contain a pinned environment, one-shot worker prototype, valid and deliberately failing fixtures, captured structured logs, immutable request/result/error artifacts, and refinement-run outputs. Generated dependency caches and virtual environments are not deliverables.

## Acceptance criteria

- [ ] The report returns one unambiguous decision: **adopt**, **adopt with named changes**, or **reject** the Shapely + Netgen/NGSolve stack.
- [ ] Exact Python, library, operating-system, and packaging versions are recorded, together with clean-checkout setup and run instructions.
- [ ] A thin C-profile periodic wall cell produces conforming regions and interfaces without losing or merging thin material boundaries.
- [ ] At least three mesh refinements report heat flow, U-value, element count, runtime, heat-balance residual, and relative result change.
- [ ] The report proposes the smallest production worker request, result, log, and error contracts; every artifact carries a shared calculation/correlation identifier.
- [ ] The prototype demonstrates deterministic process exit, timeout/cancellation behavior, stdout/stderr capture, and atomic result publication on Windows.
- [ ] Invalid recipe, invalid geometry, mesh failure, solver non-convergence, timeout, missing dependency, worker crash, and partial-write behavior are tested or explicitly simulated.
- [ ] Licences, redistribution implications, installation constraints, observed failure modes, and remaining production risks are documented.
- [ ] No production application files are changed.

## Closure response

Return the artifact paths, the verification command and outcome, the adopt/modify/reject decision, unresolved risks, and any contract changes required by Tickets 02 or 05.
