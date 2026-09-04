# Component topology production architecture

## Decision

Adopt the proposed optional Recipe-to-topology-worker architecture in
`context/specs/component-topology-production-architecture.md`, subject to its
owner approvals and validation blockers. A Topology Result is an immutable,
separately classified Revision enrichment; the layer-only Calculation Snapshot
remains independently available and unchanged.

The TypeScript orchestrator owns protocol, lifecycle and persistence. The
Python worker owns canonical-geometry compilation and numerical evidence. A
Primitive Plugin owns only local geometry/capabilities. `verified` is an
interaction-level claim, never a primitive or construction-family property.

## Status and consequence

Proposed, not owner-approved. This ADR authorizes neither release nor
implementation tickets. It permits a safe expand–migrate–contract plan while
preserving historical Revisions and layer-only results. Legacy Z-girt
verification remains disabled pending independent revalidation.

## Approval update

The owner approved the **preliminary-only** V1 scope on 2026-07-25. This ADR
now authorizes implementation tickets for the safe topology job, auditable
preliminary pilot, and operational rollout described in
`context/prds/component-topology-preliminary-v1.md`. It does not authorize a
`verified` release; the original external validation and specialist-review
blockers remain in force for that later scope.
