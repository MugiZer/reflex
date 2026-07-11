# Milestone 2 PRD - Calculation-Input Parser

## Problem Statement

Milestone 1 proves the system can read a real IFC file and produce trustworthy IFC Evidence artifacts. The next risk is more important than UI: later Review, Calculation, and Report modules need parser output that says exactly what can be calculated, what can only be suggested, and what must be provided by the user or BIM author.

The current extractor finds useful evidence but does not yet provide a calculation-facing interpretation of occurrence evidence, type evidence, candidate evidence, missing calculation inputs, and conflicts. Without this, later modules would guess from raw evidence and duplicate parser/domain logic.

Milestone 2 must deepen the parser into a calculation-input compiler while preserving parser purity. It must not calculate U-values, ask user questions in UI form, mutate IFC Evidence, or hide uncertainty.

## Solution

Build a Calculation-Input Parser layer on top of existing IFC Evidence:

```text
IFC Evidence
-> EffectiveElementEvidence
-> CalculationInputEvidence
-> Assembly Candidates / Missing Datapoints / Readiness
```

The extractor will continue to emit source facts with provenance. New domain modules will derive effective per-element evidence and calculation input readiness:

- **EffectiveElementEvidence** applies occurrence-over-type precedence, preserves source records, detects conflicts, and exposes a compact usable view.
- **CalculationInputEvidence** states whether parser evidence is enough for a layered calculation, enough for material library resolution, enough only for broad estimate, or blocked by missing evidence.
- Candidate pset/qset/name evidence remains candidate evidence and never becomes fixed truth without later user confirmation.
- Existing artifact contract remains compatible unless a versioned additive artifact is required.

Milestone 2 optimizes for speed: build the parser foundation required for Review and Calculation, not a generic IFC platform.

## User Stories

1. As a developer, I want the parser to say which elements have fixed layered evidence, so that the calculation module does not inspect raw IFC Evidence.
2. As a developer, I want the parser to distinguish fixed evidence from candidate evidence, so that later modules do not treat guesses as truth.
3. As a developer, I want occurrence evidence to take precedence over type evidence, so that element-specific overrides from IFC are respected.
4. As a developer, I want type evidence to apply when occurrence evidence is absent, so that repeated assemblies can still be understood.
5. As a developer, I want occurrence/type conflicts diagnosed, so that grouping and calculation do not merge incompatible elements.
6. As a developer, I want each conflict to cite STEP ids and evidence paths, so that the source IFC can be inspected.
7. As a BIM reviewer, I want diagnostics to say which material/layer/thickness evidence is missing, so that the BIM model can be fixed.
8. As a future Review user, I want missing calculation inputs to be explicit, so that I only answer questions that affect calculation or provenance.
9. As a future Calculation module, I want ordered layers with normalized thicknesses, so that R-values can be calculated safely.
10. As a future Calculation module, I want material names/identities per layer, so that lambda can be resolved through a versioned Material Library.
11. As a future Calculation module, I want lambda candidates captured but marked as candidates, so that uncertain values produce review or ranges, not false precision.
12. As a future Calculation module, I want assembly thickness candidates for non-layered evidence, so that broad estimates can be attempted when exact layers are absent.
13. As a future Calculation module, I want blocked evidence gaps when no useful basis exists, so that impossible calculations fail safely.
14. As a developer, I want the parser to support more official material structures, so that common IFC authoring styles are not missed.
15. As a developer, I want `IfcMaterialLayerSet` and `IfcMaterialLayerSetUsage` handled correctly, so that ordered layer stacks are trusted only when IFC supports them.
16. As a developer, I want `IfcMaterial`, `IfcMaterialConstituentSet`, `IfcMaterialList`, and profile material structures preserved as evidence, so that future estimators and diagnostics have source facts.
17. As a developer, I want direct occurrence material association and type-level material association checked separately, so that source scope is never lost.
18. As a developer, I want property sets and quantity sets preserved as candidate inputs, so that project-specific IFC exports can still help review.
19. As a developer, I want schema detection plus feature-based extraction, so that IFC2X3 and IFC4-compatible paths share the same output contract.
20. As a developer, I want unsupported schema/entity differences to emit diagnostics, so that parser gaps are visible.
21. As a developer, I want no new top-level relevant element classes in Milestone 2, so that scope stays focused.
22. As a developer, I want `IfcBuildingElementProxy` to remain low-confidence unless user confirmation is needed, so that proxies are not silently treated as walls/slabs/roofs.
23. As a future Report module, I want fixed/candidate/missing inputs and provenance available, so that the HTML report can explain assumptions and gaps.
24. As a developer, I want Barclay IFC verification to keep passing, so that parser hardening does not regress existing behavior.
25. As a developer, I want synthetic tests for edge cases, so that occurrence/type precedence and conflict behavior do not require many private IFC files.

## Implementation Decisions

- Milestone 2 builds the **Calculation-Input Parser**, not UI, U-value calculation, job API, or report generation.
- Keep `WebIfcModelReader` as the only adapter that knows raw `web-ifc` mechanics.
- Keep feature extractors focused on source evidence records. They collect facts; they do not decide precedence.
- Add an internal **EffectiveElementEvidence** module that:
  - consumes IFC Evidence;
  - keeps Element Evidence and Type Evidence separate;
  - applies direct occurrence evidence over type evidence;
  - preserves both occurrence and type records when both exist;
  - emits conflict diagnostics when the same semantic calculation datapoint has incompatible occurrence/type values;
  - does not mutate IFC Evidence.
- Add a **CalculationInputEvidence** model that represents:
  - fixed calculation inputs;
  - candidate calculation inputs;
  - missing calculation inputs;
  - calculation-input basis;
  - evidence references.
- Calculation-input basis uses these meanings:
  - `layered_ifc_complete`: ordered layer stack, normalized layer thicknesses, material identity/name per layer, and enough fixed thermal inputs if present.
  - `layered_needs_material_resolution`: ordered layer stack, normalized thicknesses, and material identity/name per layer, but lambda must come from Material Library or user input later.
  - `non_layered_estimate_possible`: no trustworthy layer stack, but enough assembly thickness/material/category/class evidence exists for a broad estimate later.
  - `blocked_missing_evidence`: not enough fixed or candidate evidence exists to calculate or estimate safely.
- Candidate evidence includes pset/qset/name/custom fields and must never be treated as fixed truth in Milestone 2.
- Fixed layered evidence can come from official IFC material layer structures and normalized layer thicknesses.
- Lambda can be captured as fixed only when its source is explicitly reliable enough under current extraction rules. Otherwise it is candidate evidence.
- Parser should extract enough evidence for calculations or exact user inputs:
  - layer order;
  - layer thickness;
  - material name/identity;
  - lambda candidates;
  - assembly thickness candidates;
  - element class and subtype/context;
  - project/property units;
  - material layer set usage direction/context;
  - exact evidence paths.
- Supported official paths remain:
  - `IfcRelDefinesByType`;
  - `IfcTypeObject.HasPropertySets`;
  - `IfcRelAssociatesMaterial`;
  - `IfcRelDefinesByProperties`.
- Material payloads in Milestone 2 should preserve:
  - `IfcMaterial`;
  - `IfcMaterialLayer`;
  - `IfcMaterialLayerSet`;
  - `IfcMaterialLayerSetUsage`;
  - `IfcMaterialConstituent`;
  - `IfcMaterialConstituentSet`;
  - `IfcMaterialList`;
  - `IfcMaterialProfile`;
  - `IfcMaterialProfileSet`;
  - unknown material definitions as unsupported/unknown evidence.
- Calculation-ready layer stack comes only from `IfcMaterialLayerSet` / `IfcMaterialLayerSetUsage`.
- Non-layered material structures are evidence and estimate candidates, not final layer stacks.
- Direct occurrence evidence always takes precedence over type evidence for the same semantic calculation datapoint.
- Type evidence can supply effective evidence only when direct occurrence evidence is absent.
- Conflict means same semantic calculation datapoint, different value/source. Complementary evidence is not a conflict.
- Conflict examples include material name mismatch, material structure mismatch, layer stack mismatch, layer thickness mismatch, and lambda mismatch.
- Assembly Candidate grouping should use EffectiveElementEvidence and split conflict cases. It must not recalculate precedence.
- The parser stays pure:
  - no U-value calculation;
  - no Material Library resolution;
  - no Requested Input UI planning;
  - no Express, SQLite, filesystem write decisions inside domain modules;
  - no HTML report generation.
- Relevant top-level classes stay fixed for Milestone 2:
  - `IfcWall`;
  - `IfcWallStandardCase` normalized to `IfcWall`;
  - `IfcSlab`;
  - `IfcRoof`;
  - `IfcCurtainWall`;
  - likely envelope `IfcBuildingElementProxy`.
- Do not add `IfcCovering`, `IfcPlate`, `IfcMember`, windows, doors, openings, or host association logic in Milestone 2.
- Machine diagnostics can be detailed; human `diagnostics.md` remains a triage summary with capped examples.
- Keep artifacts compatible with Milestone 1/1.1. Prefer internal modules first. Add versioned artifacts only when needed by downstream modules.
- The private Barclay IFC remains a local verification target and must not be committed.

## Testing Decisions

- Use behavior-first tests around public module interfaces, not private helper implementation details.
- Tests should prove parser semantics with small synthetic in-memory evidence wherever possible, instead of relying only on private IFC files.
- Keep Barclay IFC as private end-to-end verification through the existing verifier command.
- Test **EffectiveElementEvidence**:
  - type material applies when occurrence material is absent;
  - occurrence material overrides type material when both exist;
  - matching occurrence/type evidence produces no conflict;
  - conflicting occurrence/type evidence produces conflict diagnostics;
  - source evidence references are preserved.
- Test **CalculationInputEvidence**:
  - ordered layers + normalized thicknesses + material names produce `layered_needs_material_resolution` when lambda is missing;
  - ordered layers + fixed lambda inputs produce `layered_ifc_complete`;
  - non-layered material + assembly thickness candidate produces `non_layered_estimate_possible`;
  - no useful material/layer/thickness evidence produces `blocked_missing_evidence`;
  - pset/qset/name values remain candidate inputs.
- Test **Assembly Candidate Builder** behavior after effective evidence:
  - type-based grouping still works when effective evidence matches;
  - conflict diagnostics split elements out of shared grouping.
- Test **diagnostics/missing datapoints** behavior:
  - missing fixed layer thickness is explicit;
  - missing material name is explicit;
  - missing lambda becomes material-resolution/user-input need, not parser failure;
  - blocked evidence says what BIM/user must supply.
- Run existing test suite and typecheck after every vertical slice:
  - `npm test`;
  - `npm run typecheck`;
  - `npm run verify:milestone-1 -- "<private IFC path>"`.

## Out of Scope

- U-value calculation.
- Material Library implementation.
- Material Library alias resolution.
- User Review UI.
- Requested Input UI planner beyond calculation-input/missing-input data.
- Revision persistence.
- HTML report changes except diagnostics wording needed for parser gaps.
- Express API.
- SQLite.
- Async job backend.
- PDF export.
- Full auth.
- Cloud queues/storage/deployment.
- Geometry-derived thickness.
- New top-level relevant element classes.
- Windows, doors, openings, thermal bridges, solar, condensation, vapour diffusion, dynamic thermal behavior, and whole-building reporting.

## Further Notes

Milestone 2 exists to stop later modules from guessing. If parser evidence cannot say what can be calculated, Review and Calculation will duplicate parser logic and create trust problems.

The speed rule is:

```text
Build enough parser semantics for calculation/review now.
Defer UI, job backend, report polish, and broad IFC coverage.
```

Context files to read before implementation:

- `CONTEXT.md`
- `UBIQUITOUS_LANGUAGE.md`
- `context/roadmap.md`
- `context/specs/module-architecture.md`
- `context/specs/ifc-evidence-extractor.md`
- `context/decisions/2026-06-05-ifc-parser-architecture.md`

First likely implementation issue:

```text
Create EffectiveElementEvidence and CalculationInputEvidence from existing source evidence, with tests for occurrence/type precedence, conflict detection, and calculation-input basis classification.
```
