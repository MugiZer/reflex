# Multi-Layer Wall Coverage, Material Resolution, and Report Inventory

## Problem Statement

An architect uploads a Barclay-style Revit IFC whose wall layer sets are recoverable by exact `IfcWall.ObjectType` to `IfcMaterialLayerSet.LayerSetName` matches, despite absent official material-association relationships. The extractor recovers all 293 multi-layer wall instances (23 unique ordered compositions), but the current report contains only calculated snapshots. A composition with one unresolved lambda or a special-physics layer is omitted entirely.

This makes a report look as if the wall does not exist, even though its ordered material layers and thicknesses are known. The architect needs complete assembly coverage first, then an explicit explanation of which assemblies can be calculated and which values or physics treatments remain required.

## Solution

Make the report evidence-first and calculation-enriched.

Every recovered layered wall must contribute to a report assembly inventory. Identical ordered layer stacks may be grouped for readability, but every source wall instance remains traceable through its IFC step id, GlobalId, name, and ObjectType. The report must render each group whether it is ready, needs review, estimated, or blocked.

For each ordinary layer, resolve the raw IFC material name through the versioned Material Library using the existing precedence policy: user input, fixed IFC lambda, then a unique exact normalized library alias. A fully resolved ordinary serial layer stack receives a U-value calculation. Ambiguous, product-sensitive, air-cavity, and metal-path layers remain visible with their exact composition and an actionable review requirement; no generic lambda may be invented for them.

## User Stories

1. As an architect, I want every recovered multi-layer wall represented in the report, so that IFC evidence is never hidden merely because a calculation is incomplete.
2. As an architect, I want walls with identical ordered layer compositions grouped together, so that the report is readable without losing coverage.
3. As an architect, I want every grouped composition to list all source wall instances, so that I can audit exactly which walls it represents.
4. As an architect, I want each source wall to retain its IFC step id, GlobalId, name, and ObjectType, so that I can locate it in BIM tools.
5. As an architect, I want every layer shown in order with its raw IFC material name and normalized thickness, so that the reported construction matches the model.
6. As an architect, I want the report to show a calculation when every layer has a safe resolved thermal basis, so that I can use a U-value where justified.
7. As an architect, I want raw IFC material names matched to approved Material Library aliases automatically when the match is exact and unique, so that common materials do not require repetitive review.
8. As an architect, I want the report to show the raw material name, matched library material, lambda, and match basis, so that automated resolution is auditable.
9. As an architect, I want unresolved or ambiguous materials to keep their layer composition visible, so that I can make a focused material decision instead of reconstructing the wall.
10. As an architect, I want air cavities called out as cavity treatments rather than assigned a guessed solid-material lambda, so that thermal results remain physically credible.
11. As an architect, I want metal framing and fixings called out for parallel-path or thermal-bridge treatment, so that a misleading serial U-value is not produced.
12. As an architect, I want product-sensitive materials to require documented product evidence or an explicit review selection, so that generic values are not silently applied to variable products.
13. As an architect, I want a report status for every composition, so that I can distinguish `ready`, `needs_review`, `estimated`, and `blocked` assemblies.
14. As an architect, I want the report to say exactly why a composition is not calculated, so that I know the next action.
15. As an architect, I want resolved material decisions to apply consistently to all matching affected layer occurrences in their declared scope, so that recalculation is complete and traceable.
16. As a reviewer, I want the count of multi-layer source walls and unique multi-layer compositions visible in the report summary, so that coverage can be checked at a glance.
17. As a reviewer, I want coverage diagnostics when a recovered multi-layer wall has no report inventory entry, so that omissions are detected rather than silently accepted.
18. As a developer, I want official IFC material associations to remain higher precedence than recovered layer-set-name evidence, so that the recovery path cannot overwrite stronger evidence.
19. As a developer, I want Material Library resolution to remain exact-only for automatic calculation, so that fuzzy similarity does not become false certainty.
20. As a developer, I want calculation snapshots to remain the source of U-values while report inventory views preserve incomplete evidence, so that calculation and reporting responsibilities stay separate.
21. As a developer, I want the Barclay verifier to assert complete recovered multi-layer wall coverage from evidence through report inventory, so that this regression cannot return.

## Implementation Decisions

- Preserve the existing extractor recovery path. It remains responsible only for recovered `LayeredMaterialEvidence`, provenance, and diagnostics.
- Continue grouping `CalculationInputEvidence` by the existing ordered composition signature: element class, ordered material identities, and normalized thicknesses. This is the report composition key, not a replacement for source-wall identity.
- Add a report-inventory projection at the application boundary. Its input is all grouped calculation-input evidence plus any calculation snapshots from the active revision. It produces one report assembly view per composition group, including source-wall membership and an optional calculation snapshot.
- Do not use `buildPhysicsAssemblies` as the report membership gate. It may continue to exclude unsafe or incomplete calculations, but excluded groups must remain in the report-inventory projection with their known layers and a readiness explanation.
- Extend report assembly data with source-element membership sufficient to display IFC step id, GlobalId, name, ObjectType, element class, and member count. Preserve source evidence references for each composition.
- The report renderer receives report inventory views rather than only `CalculationSnapshot[]`. A view with a snapshot renders U-value, R-value, and temperature profile. A view without one renders the same layer build-up and provenance, an explicit `needs_review` or `blocked` state, and requested next actions instead of a fabricated result.
- Keep the existing lambda precedence unchanged: user-provided lambda, fixed IFC lambda, unique exact normalized Material Library alias, then unresolved. Candidate or fuzzy suggestions remain review-only.
- Treat an exact normalized alias match as automatic library-assisted resolution only when exactly one eligible Material Library entry matches. Persist raw name, normalized name, matched key, matched display name, lambda, source label, and match basis in report provenance.
- Expand the versioned Material Library only through reviewed aliases or documented material entries. Aliases may normalize project prefixes, dimensions, accents, and encoding noise, but must not infer a product family from partial text.
- Model `air_cavity` and `metal_path` as explicit special-physics states. They are not eligible for the normal serial-layer lambda calculation until a future, documented cavity or parallel-path treatment supplies a valid resistance model.
- Keep `product_sensitive` materials review-gated unless the user selects a documented library entry or provides product lambda evidence.
- Report summary coverage must distinguish source wall instances from grouped compositions. For the current Barclay acceptance fixture, the target is 293 multi-layer wall instances represented by 23 unique composition groups; changes in the IFC may change these counts, so the verifier derives rather than hard-codes them except in the private local regression check.
- The complete report is additive: ready calculations keep the existing visual presentation, while incomplete groups gain a composition-first review presentation. Existing revision snapshots and IFC evidence remain immutable.

## Testing Decisions

- Test behavior through the existing highest seams: material resolution, physics-assembly building, review/report orchestration, and HTML report generation. Do not test private formatting helpers directly.
- Add a report-inventory projection test proving that every grouped multi-layer `CalculationInputEvidence` record yields exactly one inventory view, including groups with no calculation snapshot.
- Add a report-generation test with a resolved multi-layer group and an unresolved multi-layer group. Assert that both render ordered layers and source-wall coverage, while only the resolved group renders a U-value.
- Add a material-resolution test proving that a unique exact normalized IFC material alias auto-resolves from the Material Library and that ambiguous or fuzzy matches do not.
- Add special-physics tests proving that air cavities, metal paths, and product-sensitive layers remain visible with an actionable status and cannot receive a generic serial calculation.
- Add an orchestration test proving that a material decision resolves all affected layer occurrences within its declared scope and causes eligible composition groups to receive snapshots on recalculation.
- Add a coverage diagnostic test proving that a recovered multi-layer source wall missing from the report inventory fails verification.
- Extend the local Barclay recovery verifier to assert that all recovered multi-layer wall instances are represented in report inventory, that the number of inventory compositions equals the number of unique ordered recovered compositions, and that no uncalculated composition loses its layer table.
- Reuse existing tests for `resolveLayerLambda`, grouped calculation input evidence, revision snapshots, report rendering, job processing, and the local Revit layer-recovery verifier. Run unit tests, type checking, end-to-end verification, and the local Barclay verifier.

## Out of Scope

- Fuzzy or machine-learned automatic material matching.
- Guessing lambda values for unmatched raw IFC materials.
- Treating an air cavity as a generic solid layer.
- Thermal-bridge, parallel-path, or detailed cavity calculations in this slice; this slice only preserves and routes those cases.
- Changing raw IFC data or synthesizing `IfcRelAssociatesMaterial` entities.
- Full product database ingestion, supplier-data scraping, or an editable Material Library interface.
- Whole-building heat-loss calculations, windows, doors, thermal bridges, condensation, vapour, or dynamic thermal analysis.
- Rendering one duplicate page per source wall when a composition group is identical; the report instead lists all represented source walls.

## Further Notes

The current Barclay facts are:

- `IfcRelAssociatesMaterial` is absent.
- Every one of the 529 wall instances has an exact unique `ObjectType` to `LayerSetName` recovery path.
- 293 wall instances have multi-layer stacks.
- Those stacks form 23 unique ordered composition groups.
- The existing report revision has only 17 calculation snapshots and represents 9 multi-layer wall instances through 3 multi-layer compositions.

The implementation must make report visibility independent of calculation completeness. Calculation remains conservative; composition coverage becomes complete and auditable.
