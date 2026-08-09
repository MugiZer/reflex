# 05 — Lock the production architecture and rollout

**What to build:** Convert the completed investigations into a production-ready architecture and rollout decision for optional topology enrichment inside the existing IFC evidence and layer-based calculation workflow.

**Blocked by:** 01 — Prove the open-source topology worker; 02 — Define the recipe and primitive-registry contract; 03 — Establish the validation and verification strategy; 04 — Prove generality with conformance recipes.

**Status:** ready-for-agent once blockers are resolved

**Execution mode:** HITL architecture synthesis. Ask only architecture-changing questions, one at a time. Do not implement production code or publish downstream implementation tickets until the user approves the final architecture.

**Parent investigation:** `context/issues/component-topology-kernel/005-lock-production-architecture-and-rollout.md`

## Required return artifacts

1. Production architecture specification: `context/specs/component-topology-production-architecture.md`.
2. A readiness decision and implementation frontier inside the specification, suitable as direct input to `/to-spec` and `/to-tickets`.
3. Any required ADR/domain-glossary updates, or an explicit list of those updates if their canonical location is not yet established.

## Acceptance criteria

- [ ] The architecture assigns ownership among IFC evidence extraction, layer-only calculation, recipe enrichment, primitive registry, topology modules, validation policy, Python worker infrastructure, persistence, and UI.
- [ ] The recipe remains optional: existing layer-based calculations work without it, while missing topology inputs never silently become verified assumptions.
- [ ] The cross-language protocol is versioned and validated at both boundaries and defines request/result/error artifacts, correlation identifiers, idempotency, and compatibility behavior.
- [ ] Python/runtime versions, dependency locking, packaging, health checks, structured logging, timeouts, cancellation, retry rules, crash recovery, atomic writes, artifact retention, and support diagnostics are specified.
- [ ] Failure behavior explicitly selects among safe layer-only fallback, Preliminary unsafe estimate, blocked calculation, and rejected unsupported topology.
- [ ] The rollout follows an expand–migrate–contract approach that keeps the current workflow working and includes observability, release gates, rollback, and local-development setup.
- [ ] Extension rules state when to register a primitive, compose a new recipe, expand a versioned validation envelope, or introduce a different topology/physics module.
- [ ] The proposed implementation frontier consists of a small number of large, demoable vertical slices rather than language-, layer-, or family-specific work packages.
- [ ] The final readiness decision is **ready for implementation tickets** or **not ready**, with every unresolved blocker named.

## Closure response

Return the artifact paths, readiness decision, approved module boundaries, unresolved owner decisions, rollout risks, and the recommended first implementation frontier. If ready, explicitly state that `/to-spec` and then `/to-tickets` may proceed.
