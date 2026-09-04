# Multi-Layer Wall Report Coverage 001 - Evidence-First Inventory and Safe Material Resolution

> *This was generated from `context/prds/multi-layer-wall-report-coverage.md`.*

## Triage

- Category: enhancement
- State: ready-for-agent
- Type: AFK
- Blocked by: none

## What to build

Make report assembly coverage independent of calculation completion. Build a report-inventory projection from all grouped calculation-input evidence, attach calculation snapshots when they exist, and render every recovered multi-layer composition with source-wall membership, ordered layers, thicknesses, provenance, and either a U-value or an explicit review state.

Keep automatic Material Library resolution exact-only and preserve special-physics blocks for cavities, metal paths, and product-sensitive materials.

## Acceptance criteria

- [ ] Every recovered multi-layer wall instance belongs to exactly one report inventory composition.
- [ ] Each inventory composition lists source IFC wall identity and has the correct ordered material/thickness stack.
- [ ] A composition with resolved lambdas renders a calculation snapshot and U-value.
- [ ] A composition with unresolved lambda still renders its full layer composition and actionable review state.
- [ ] Exact unique Material Library aliases auto-resolve; ambiguous/fuzzy names do not.
- [ ] Air cavity, metal-path, and product-sensitive layers remain visible but cannot receive a generic serial U-value.
- [ ] Report summary distinguishes grouped compositions from represented source walls.
- [ ] Local Barclay verification proves complete multi-layer wall coverage from recovered evidence to report inventory.
- [ ] Existing `npm test`, `npm run typecheck`, and `npm run verify:e2e` pass.

## Context files

- `CONTEXT.md`
- `UBIQUITOUS_LANGUAGE.md`
- `context/domain.md`
- `context/specs/module-architecture.md`
- `context/decisions/2026-06-05-ifc-parser-architecture.md`
- `context/prds/revit-ifc-layer-set-recovery.md`
- `context/prds/multi-layer-wall-report-coverage.md`

## Agent brief

Keep IFC recovery in evidence extraction, lambda precedence in material resolution, calculation eligibility in the calculation domain, and HTML rendering in the report application layer. Do not make report visibility depend on `buildPhysicsAssemblies` returning a calculation-ready result.
