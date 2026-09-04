# Revit IFC Layer-Set Recovery PRD

## Problem Statement

The Conformity prototype currently misses layered wall evidence in the Barclay IFC even though the file contains `IfcMaterialLayerSet`, `IfcMaterialLayerSetUsage`, and `IfcMaterialLayer` entities.

The root cause is not that the IFC has no layers. The root cause is that this IFC does not contain the official `IfcRelAssociatesMaterial` relationship path that our extractor currently trusts for material associations.

Local research on the private Barclay IFC found:

- `IfcRelAssociatesMaterial`: `0`
- `IfcMaterialLayerSet`: `60`
- `IfcMaterialLayerSetUsage`: `79`
- `IfcMaterialLayer`: `134`
- wall source elements: `529`
- unique wall `ObjectType` values: `55`
- exact wall `ObjectType` to `IfcMaterialLayerSet.LayerSetName` matches: `55 / 55`
- exact matched wall source elements: `529 / 529`

Autodesk Viewer appears more detailed because it likely recovers Revit-exported layer sets through exporter-aware fallback behavior. Conformity should recover the same useful evidence, but with stricter provenance and confidence rules.

## Solution

Add a conservative **Revit IFC layer-set name recovery** path.

The extractor keeps the official IFC material association path as the strongest evidence:

```text
IfcRelAssociatesMaterial
-> IfcMaterialLayerSetUsage / IfcMaterialLayerSet
-> IfcMaterialLayer
```

When official material associations are absent or incomplete, add a fallback path:

```text
relevant element ObjectType / type-like name
-> exact normalized match
-> IfcMaterialLayerSet.LayerSetName
-> IfcMaterialLayer[]
```

Recovered layer stacks are not fake official associations. They are candidate/recovered IFC evidence with explicit source, confidence, diagnostics, and cited STEP ids.

The Review UI and Report should show this honestly:

```text
Possible layer stack recovered from Revit IFC name match.
```

Calculations may use recovered layer thicknesses when the match is exact and unique, but the calculation snapshot must preserve the recovered source and confidence. User confirmation can upgrade trust for the current Review/Revision, but must not mutate original IFC Evidence.

## User Stories

1. As an architect, I want Conformity to find wall layers that Autodesk Viewer shows, so that the prototype does not look weaker than existing BIM viewers.
2. As an architect, I want recovered layer stacks to show their source, so that I can trust or challenge the result.
3. As an architect, I want to see layer names and thicknesses from the IFC, so that I only need to provide physics datapoints such as lambda when missing.
4. As an architect, I want ambiguous layer matches to require review, so that the tool does not silently calculate from the wrong wall type.
5. As an architect, I want the Review screen to say which wall type/layer needs lambda, so that I do not see only internal ids.
6. As an architect, I want the Report to distinguish official IFC material associations from recovered layer-set matches, so that evidence provenance is clear.
7. As an architect, I want low-confidence or ambiguous recovery to be blocked or review-needed, so that real compliance outcomes are not based on hidden guesses.
8. As a developer, I want official `IfcRelAssociatesMaterial` evidence to remain highest precedence, so that fallback logic cannot override stronger IFC evidence.
9. As a developer, I want fallback recovery isolated in a feature extractor or focused recovery module, so that raw name matching does not leak into calculations or UI.
10. As a developer, I want exact normalized matching only in the first implementation, so that we avoid fuzzy-match false positives.
11. As a developer, I want duplicate or multiple possible layer-set matches to emit diagnostics, so that ambiguous evidence is visible.
12. As a developer, I want unmatched layer sets to be summarized, so that future extractor broadening has evidence.
13. As a developer, I want recovered layer evidence to cite the source element STEP id and layer-set STEP ids, so that every recovered datapoint is traceable.
14. As a developer, I want recovered evidence to use the same `LayeredMaterialEvidence` shape where possible, so that downstream modules do not need a second calculation path.
15. As a developer, I want a source/recovery marker on material evidence, so that downstream modules can preserve confidence and wording.
16. As a developer, I want `buildAssemblyCandidates` to group recovered stacks conservatively, so that same-named but conflicting evidence cannot create unsafe groups.
17. As a developer, I want `deriveEffectiveElementEvidence` to preserve direct occurrence precedence, so that recovered type-name evidence never beats direct element evidence.
18. As a developer, I want `deriveCalculationInputEvidence` to produce fixed thicknesses from exact recovered layer evidence only when units are normalized, so that calculations do not assume unknown units.
19. As a developer, I want lambda to remain missing unless IFC, material library, or user input provides it, so that layer recovery does not invent thermal conductivity.
20. As a developer, I want diagnostics to explain why official association evidence was absent, so that the BIM author can fix the source model if desired.
21. As a developer, I want the Barclay private IFC verifier to assert recovered layer counts, so that this regression stays fixed.
22. As a developer, I want synthetic fixtures for official path, fallback path, ambiguous match, and no match, so that behavior is not tied only to a private IFC.
23. As a developer, I want existing `npm test`, `npm run typecheck`, and `npm run verify:e2e` to remain green, so that recovery does not break the core product loop.
24. As a partner evaluating the prototype, I want the tool to recover real layered assemblies from a messy IFC, so that it proves technical depth beyond a happy-path demo.

## Implementation Decisions

- This is a parser deepening slice, not a UI redesign and not a calculation rewrite.
- Keep the parser purity rule:
  - extractor emits IFC Evidence;
  - assembly modules interpret grouping;
  - missing-datapoint modules detect missing values;
  - calculation modules calculate;
  - report modules render.
- Official material associations remain first-class and highest precedence.
- Recovered layer-set name matches are fallback evidence, not official IFC material associations.
- Recovery runs only when official material association evidence is absent or incomplete for a relevant element/type.
- Recovery starts with exact normalized matching only.
- Do not add fuzzy matching in this PRD.
- Do not add ML, weighted scoring, geometry-derived layer detection, or viewer-driven parsing.
- Match candidates from:
  - relevant element `ObjectType`;
  - relevant element `Name` only if it can be normalized into the same type-like prefix safely;
  - type identity name if existing type evidence is present.
- Match targets:
  - `IfcMaterialLayerSet.LayerSetName`.
- First acceptance target is wall recovery for Barclay-style Revit IFC exports.
- The module should be easy to extend later for slabs/roofs if the same exact-match evidence appears.
- If a source name maps to exactly one layer set, emit recovered layered evidence with medium confidence.
- If a source name maps to zero layer sets, emit no recovered evidence and preserve missing evidence behavior.
- If a source name maps to more than one layer set, emit ambiguous recovery diagnostics and do not silently choose.
- If official direct occurrence material evidence exists and conflicts with recovered evidence, official direct occurrence evidence wins.
- If official type-level material evidence exists and recovered evidence conflicts, official type-level evidence wins unless later explicit policy says otherwise.
- If direct element evidence conflicts with type/recovered evidence, direct element evidence takes precedence and the element splits from the type-based Assembly Candidate.
- Add an explicit source marker to material/layer evidence, for example:

```text
materialEvidenceSource:
  official_rel_associates_material
  recovered_layer_set_name_match
```

- Add recovery metadata, for example:

```text
recovery:
  strategy: "revit_layer_set_name_match"
  matchedSourceAttribute: "ObjectType"
  matchedSourceValue: string
  matchedLayerSetName: string
  matchKind: "exact_normalized"
  confidence: "medium"
  needsUserConfirmation: boolean
```

- Preserve source STEP ids:
  - source element STEP id;
  - source type STEP id when relevant;
  - matched `IfcMaterialLayerSet` STEP id;
  - `IfcMaterialLayerSetUsage` STEP ids when discoverable;
  - `IfcMaterialLayer` STEP ids;
  - `IfcMaterial` STEP ids where present.
- If `IfcMaterialLayerSetUsage` can be connected only by layer-set reference and not by official association, preserve it as context evidence, not as proof of direct occurrence association.
- Layer thickness remains strongest when read from `IfcMaterialLayer.LayerThickness`.
- Project units must normalize layer thicknesses to SI meters before calculation input evidence can treat them as usable.
- Recovered layer names/material names can feed review labels.
- Recovered layer thicknesses can feed calculation inputs if unit normalization succeeds.
- Lambda remains missing unless:
  - official property evidence supplies it;
  - material library resolves it;
  - user supplies it during Review.
- The Review UI should show recovered layers in human language but should not expose recovery internals as primary labels.
- Diagnostics should include an architect-facing note:

```text
Official material association links were absent. Layer stacks were recovered by exact match between wall type names and material layer set names.
```

- Artifact manifest should bump or record the affected extraction policy version.
- Existing evidence artifacts should remain additive/backward-compatible where practical.
- The implementation should prefer a deep recovery module with a small interface over scattering name-match checks across feature extractors.

## Testing Decisions

- Test behavior through public module interfaces, not raw helper internals.
- Add synthetic IFC/evidence tests for:
  - official `IfcRelAssociatesMaterial` path still works;
  - fallback exact layer-set name match recovers layers;
  - fallback does not run over stronger official evidence;
  - ambiguous duplicate `LayerSetName` emits diagnostic and does not choose;
  - no match preserves missing material/layer behavior;
  - direct occurrence evidence conflict splits the element out of grouped type evidence;
  - recovered layer thickness normalizes through project units;
  - missing/unknown units do not become usable fixed thickness.
- Add domain tests for:
  - recovered layered evidence contributes to `AssemblyEvidenceSummary.hasLayeredMaterialEvidence`;
  - recovered layer count and thickness count are reflected in Assembly Candidates;
  - `deriveCalculationInputEvidence` can produce fixed layer thicknesses from recovered layers when normalized;
  - missing lambda remains missing/requested.
- Add diagnostics tests for:
  - absent official association path;
  - recovered exact matches;
  - ambiguous matches;
  - unmatched relevant elements.
- Add private Barclay verifier assertion if local private file path is supplied:
  - recovered wall object type matches are nonzero;
  - recovered wall source element coverage is high;
  - recovered layer stacks include multi-layer examples.
- Keep private IFC data local. Do not commit the IFC file or generated private evidence artifacts.
- Existing gates must pass:

```text
npm test
npm run typecheck
npm run verify:e2e
```

- Strong optional local gate:

```text
npm run verify:e2e:local -- "C:\Users\moham\Downloads\1365-01_Barclay 4_ARCH_V23_akhouryHLD2Y.ifc"
```

## Out of Scope

- Fuzzy matching.
- Geometry-derived layer stack inference.
- Viewer-driven extraction.
- Full Autodesk Viewer parity.
- Cloud BIM APIs.
- New frontend framework.
- Full material database.
- Automatic lambda invention.
- Mutating IFC Evidence with user values.
- Treating recovered evidence as official IFC association evidence.
- New top-level element classes beyond current relevant element classes.
- Window/door/opening thermal bridge modeling.
- PDF/export changes.
- Auth/deployment.

## Further Notes

### Documentation Verified

Official material association and layer structure are documented by buildingSMART:

- `IfcRelAssociatesMaterial`: https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcRelAssociatesMaterial.htm
- `IfcMaterialLayerSetUsage`: https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcMaterialLayerSetUsage.htm
- `IfcMaterialLayerSet`: https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcMaterialLayerSet.htm
- `IfcMaterialLayer`: https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcMaterialLayer.htm

### Context Files To Read Before Implementation

Read in this order:

1. `CONTEXT.md`
2. `UBIQUITOUS_LANGUAGE.md`
3. `context/domain.md`
4. `context/specs/module-architecture.md`
5. `context/specs/ifc-evidence-extractor.md`
6. `context/decisions/2026-06-05-ifc-parser-architecture.md`
7. `context/prds/milestone-2-calculation-input-parser.md`
8. `context/prds/milestone-6-broader-datapoints-calculations-hardening.md`
9. `context/prds/revit-ifc-layer-set-recovery.md`

### Recommended First Vertical Slice

Build the smallest end-to-end recovery path:

```text
Barclay-style wall ObjectType
-> exact LayerSetName match
-> recovered LayeredMaterialEvidence
-> Assembly Candidate sees layer stack
-> Missing Datapoints ask for lambda, not layer thickness
-> Report/Review preserve recovered provenance
```

### Demo Bar

Before this PRD, Barclay wall assemblies look blocked because no official material association path exists.

After this PRD, Barclay wall assemblies should show recovered layer stacks and thicknesses, while still asking for missing lambda values honestly.

That is the point: more real IFC value, same trust model.
