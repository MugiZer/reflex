# PRD: Milestone 1 - IFC Evidence Extractor CLI

## Problem Statement

The first real risk in the BIM-to-Physics Compiler is not the U-value formula. The risk is whether the system can read a messy real IFC file and extract trustworthy, calculation-relevant evidence without forcing architects to manually rebuild assemblies.

Architects need to know what the IFC already proves, what is missing, and what should be fixed in BIM or supplied during review. The system must separate raw IFC evidence from domain interpretation, preserve provenance, and avoid hidden assumptions because the outputs affect real building-performance decisions.

Milestone 1 must prove the extraction machine works on the private Barclay IFC file and produces structured evidence artifacts plus an architect-facing diagnostics report.

## Solution

Build a Node/TypeScript CLI that runs the real IFC file through the first production-shaped evidence pipeline:

```text
IFC file
-> pure IFC evidence
-> conservative assembly candidates
-> exact missing datapoints
-> readiness derived from evidence
-> diagnostics.md for BIM iteration
```

The CLI target is:

```text
npm run ifc:inspect -- "C:\Users\moham\Downloads\1365-01_Barclay 4_ARCH_V23_akhouryHLD2Y.ifc"
```

The private IFC file must remain outside the repo and must not be committed.

Milestone 1 is not a throwaway parser script. It should create the real module foundation that later API, review UI, material resolution, U-value calculation, revisions, and reports will call.

## User Stories

1. As a developer, I want to run one CLI command against a real IFC file, so that I can prove the parser foundation works before building the web app.
2. As a developer, I want the IFC file hash recorded, so that outputs can be tied to the exact source file.
3. As a developer, I want the IFC schema detected, so that unsupported or schema-specific behavior can be diagnosed explicitly.
4. As a developer, I want project units extracted first, so that numeric evidence can be normalized only when the unit source is known.
5. As a developer, I want unknown units diagnosed instead of assumed, so that calculations are not silently wrong later.
6. As a developer, I want raw `web-ifc` hidden behind `IfcModelReader`, so that parser quirks do not leak through the codebase.
7. As a developer, I want feature extractors to depend on `IfcModelReader` and `IfcExtractionIndex`, so that extraction logic stays testable and library-agnostic.
8. As a developer, I want a targeted relationship index, so that feature extractors do not repeatedly scan the whole IFC.
9. As a developer, I want official IFC relationship paths used, so that evidence extraction matches the IFC standard.
10. As a developer, I want relevant elements discovered by static rules, so that Milestone 1 extracts only calculation-relevant entities.
11. As an architect, I want walls, slabs, roofs, curtain walls, and likely envelope proxies found, so that envelope evidence is not missed.
12. As an architect, I want irrelevant/skipped classes summarized at a high level, so that diagnostics stay useful instead of noisy.
13. As an architect, I want each source element identified by STEP id, GlobalId, class, name, object type, predefined type, tag, and description, so that I can trace evidence back to BIM.
14. As a developer, I want `IfcWallStandardCase` normalized to `IfcWall` while preserving the raw entity class, so that old IFC exports are handled without losing provenance.
15. As a developer, I want `IfcCurtainWall` kept separate from `IfcWall`, so that curtain-wall evidence can evolve independently.
16. As a developer, I want likely envelope `IfcBuildingElementProxy` included with low or medium confidence, so that proxies are not blindly rejected.
17. As an architect, I want uncertain proxy classification flagged, so that I can confirm or fix the BIM model.
18. As a developer, I want type links extracted through `IfcRelDefinesByType`, so that elements can reference shared type evidence.
19. As a developer, I want type property sets extracted from `IfcTypeObject.HasPropertySets`, so that shared type-level facts are preserved.
20. As a developer, I want occurrence property and quantity sets extracted through `IfcRelDefinesByProperties`, so that element-specific facts are preserved.
21. As a developer, I want material associations extracted through `IfcRelAssociatesMaterial`, so that occurrence and type material evidence can be compared.
22. As a developer, I want direct occurrence evidence to take precedence over type evidence, so that exceptional elements do not get incorrectly grouped.
23. As a developer, I want conflicting direct evidence to split an element out of a type-based assembly candidate, so that grouping remains conservative.
24. As an architect, I want material layer sets extracted when available, so that real layered assemblies can be reviewed.
25. As an architect, I want layer order, material names, and thicknesses extracted with evidence paths, so that I can trust where the assembly came from.
26. As a developer, I want `IfcMaterialLayerSetUsage` context recorded when present, so that layer orientation and usage evidence are available later.
27. As a developer, I want non-layered material structures recorded, so that later versions can estimate or ask for missing data.
28. As a developer, I want material lists, constituent sets, profile sets, and unknown material definitions preserved as structured evidence, so that unsupported forms are visible instead of discarded.
29. As a developer, I want candidate property evidence captured broadly but classified strictly, so that possible lambda and thickness values are not lost.
30. As an architect, I want generic thickness properties treated as assembly-thickness candidates, not confirmed layer thicknesses, so that fallback evidence does not become false precision.
31. As a developer, I want every important value to carry an `EvidenceReference`, so that evidence can be traced to exact IFC paths.
32. As a developer, I want compact cited IFC entity snapshots, so that artifacts prove evidence without dumping the entire IFC.
33. As a developer, I want pure parser output to exclude assembly candidates, missing datapoints, readiness, and calculations, so that machine extraction and domain meaning stay separated.
34. As a developer, I want assembly candidates built after extraction, so that grouping is domain interpretation rather than parser behavior.
35. As a developer, I want deterministic assembly candidate IDs, so that outputs are reproducible.
36. As a developer, I want grouping signatures stored with grouping keys, so that grouping decisions are explainable and versionable.
37. As an architect, I want grouping to be conservative, so that different physical assemblies are not accidentally merged.
38. As a developer, I want missing datapoints detected by a separate module, so that the parser remains pure evidence.
39. As an architect, I want exact missing datapoints reported, so that I know what must be fixed or supplied.
40. As an architect, I want missing datapoints to explain why the field matters, what evidence was checked, and what elements are affected, so that I can act on the report.
41. As an architect, I want missing datapoints to distinguish BIM-source fixes from user-fixable inputs, so that I know whether to edit the model or answer a review question.
42. As a developer, I want readiness derived from assembly candidates and missing datapoints, so that readiness does not duplicate extraction logic.
43. As a developer, I want unsupported or incomplete IFC structures to produce diagnostics, not whole-job failures, so that messy IFC files still yield useful partial evidence.
44. As a developer, I want real parse/open failures to be separated from incomplete evidence, so that failure handling is honest.
45. As an architect, I want `diagnostics.md` to summarize what can be verified, what needs review, and what to fix in BIM, so that the output is useful without reading JSON.
46. As a developer, I want canonical JSON artifacts written to a deterministic output folder, so that later modules can consume stable contracts.
47. As a developer, I want artifact manifests to version every output-affecting policy surface, so that future extractor changes remain auditable.
48. As a developer, I want large element evidence split by class when needed, so that output files stay manageable.
49. As a future app developer, I want the same extractor module usable by the later async job API, so that CLI work is not thrown away.
50. As a future verifier author, I want Milestone 1 to create stable artifacts, so that later end-to-end tests can compare behavior across versions.

## Implementation Decisions

- Build Milestone 1 as a CLI-first module foundation, not as the full Express app.
- Use Node and TypeScript.
- Use `web-ifc` only behind the `WebIfcModelReader` adapter.
- Implement the public `IfcModelReader` interface before broad evidence extraction.
- Keep `IfcModelReader` low-level and typed. It must not expose domain methods such as `getAssemblies`, `getMissingDatapoints`, or `getReadinessState`.
- Implement schema detection plus feature-based extraction. Do not create separate parser implementations for IFC2X3, IFC4, and IFC4X3.
- Build `IfcExtractionIndex` as a targeted relationship index over calculation-relevant relationships.
- Index `IfcRelDefinesByType`, `IfcRelAssociatesMaterial`, `IfcRelDefinesByProperties`, and `IfcTypeObject.HasPropertySets`.
- Use relevant element discovery rules from static config.
- Relevant Milestone 1 element classes are `IfcWall`, `IfcWallStandardCase`, `IfcSlab`, `IfcRoof`, `IfcCurtainWall`, and likely envelope `IfcBuildingElementProxy`.
- Normalize `IfcWallStandardCase` to `elementClass: "IfcWall"` while preserving `rawEntityClass`.
- Preserve `IfcCurtainWall` as its own `ElementClass`.
- Include likely envelope proxies with classification confidence, matched hints, and `needsUserConfirmation` when uncertain.
- Summarize skipped-scope classes only by class, count, and reason.
- Keep pure parser output limited to `IfcEvidence`: file evidence, type evidence, element evidence, cited IFC entities, and diagnostics.
- Store one `ElementEvidence` record per source element instance.
- Store shared `TypeEvidence` separately and reference it from elements using `ifcTypeObjectStepId`.
- Preserve both direct occurrence evidence and type evidence when both exist.
- Apply direct occurrence precedence later during grouping, not by mutating extracted evidence.
- Implement evidence feature extractors as a plain ordered array of focused modules.
- Feature extractors return evidence records, diagnostics, and cited STEP ids.
- Feature extractors must not write files or scan the whole IFC independently.
- `composeIfcEvidence` owns merging feature results and deduplicating cited entities.
- Represent material evidence as a discriminated union by `materialStructureKind`.
- Support material structure kinds: `single_material`, `layer_set_usage`, `layer_set`, `constituent_set`, `material_list`, `profile_set_usage`, `profile_set`, and `unknown`.
- Preserve `IfcMaterialLayerSetUsage` and `IfcMaterialProfileSetUsage` if encountered in unexpected scope, but emit diagnostics.
- Extract all calculation-relevant `IfcMaterialLayerSetUsage`, `IfcMaterialLayerSet`, and `IfcMaterialLayer` attributes already verified against IFC docs.
- Use `NumericEvidence` for all numeric calculation-relevant evidence.
- Normalize numeric evidence only when units are directly knowable from IFC evidence.
- Leave `normalizedValue` null and emit diagnostics when units are unknown.
- Use generic `CandidatePropertyEvidence[]` for lambda, layer thickness, assembly thickness, material name, classification, and unit candidates.
- Treat `IfcMaterialLayer.LayerThickness` as confirmed layer thickness when unit normalization is possible.
- Treat generic wall/slab/roof thickness as assembly thickness evidence only.
- Build `AssemblyCandidate` records after pure extraction through `buildAssemblyCandidates`.
- Use `ConservativeAssemblyGroupingPolicy` for Milestone 1.
- Group only when element class, type object, effective material association signature, and direct evidence compatibility all agree.
- Use deterministic `assemblyCandidateId` values based on file hash, grouping key, grouping policy version, and artifact schema version.
- Build missing datapoints through `MissingDatapointDetector`, not inside parser or readiness.
- Keep missing-datapoint rules as named TypeScript functions in an ordered table, not a generic rules engine.
- Include lightweight user guidance in missing datapoints, but leave full requested-input planning to later UI work.
- Derive readiness with `AssemblyReadinessEvaluator` from `AssemblyCandidate.evidenceSummary` and missing datapoints.
- Write canonical artifacts under `outputs/{fileHash}/`.
- Treat Step 4 artifacts as partial implementation artifacts only. Step 4 may write evidence-only artifacts, but they must be clearly marked as incomplete and must not be treated as the final Milestone 1 contract.
- The final Milestone 1 command must produce one complete canonical artifact contract containing file evidence, element evidence, type/cited evidence, diagnostics, assembly candidates, missing datapoints, and readiness-derived diagnostics.
- Create `diagnostics.md` from JSON evidence artifacts. It must be architect-facing, not a raw evidence dump.
- Version all output-affecting policy surfaces in `manifest.json`.
- Keep the private Barclay IFC file outside the repository.

## Testing Decisions

- Tests should target public module behavior and stable contracts, not private helper implementation details.
- Good tests assert outputs, diagnostics, provenance, missing datapoints, and failure modes.
- Avoid tests that require committing the private Barclay IFC file.
- Use small synthetic IFC fixtures or mocked `IfcModelReader` records for deterministic unit tests where practical.
- Use the private Barclay IFC as a local smoke/integration run, not a committed fixture.
- Test `WebIfcModelReader` enough to prove it can open a model, detect schema, list entities, read attributes, and produce compact snapshots.
- Test `buildIfcExtractionIndex` with controlled relationship fixtures.
- Test relevant element discovery with included classes, normalized wall standard cases, proxy hints, and skipped classes.
- Test evidence feature extractors through their public extractor interface.
- Test material evidence extraction for single material, layer set usage, layer set, constituent set, material list, profile set usage, profile set, and unknown definitions when fixtures allow.
- Test numeric normalization for known project length units, explicit property units, unknown units, and diagnostics.
- Test `composeIfcEvidence` dedupes cited step IDs and preserves diagnostics.
- Test `buildAssemblyCandidates` for type-based grouping, single-element fallback, direct evidence conflict split, and deterministic IDs.
- Test `detectMissingDatapoints` for missing project units, missing layer thickness, missing material name, missing lambda, uncertain proxy classification, and non-layered layer-stack gaps.
- Test `evaluateAssemblyReadiness` without allowing it to rediscover missing fields from raw evidence.
- Test artifact writing against a temporary output folder.
- Run the CLI against the private Barclay IFC before marking the milestone complete.

## Out of Scope

- Express API.
- Async job routes.
- SQLite persistence.
- File upload UI.
- Review UI.
- Full requested-input planning.
- User input persistence.
- Override scopes in application workflow.
- Revision restore.
- Material library resolution.
- U-value calculation.
- U-value range calculation.
- Surface resistance profile selection.
- HTML conformity report generation.
- PDF export.
- Geometry-derived thickness.
- Spatial containment/storey indexing.
- Host association logic for `IfcCovering`.
- Top-level `IfcPlate` and `IfcMember` thermal assemblies.
- Windows, doors, openings, thermal bridges, solar, whole-building heat-loss reporting.
- Full auth, cloud storage, workers, Redis, S3, Kubernetes, billing, organization management.

## Further Notes

Milestone 1 should be implemented in smaller PRs. The first PR should prove `web-ifc` can load the real Barclay IFC and that `WebIfcModelReader` can expose schema, file metadata, and relevant entity counts. Broader extraction should come after that interface is stable.

## Implementation Context Map

Every implementation step must start by reading:

- `CONTEXT.md`
- `context/domain.md`
- `UBIQUITOUS_LANGUAGE.md`
- `context/prds/milestone-1-ifc-evidence-extractor.md`

Then read the step-specific files below.

### Step 1: Project Scaffold and IFC Smoke Test

Read:

- `context/specs/module-architecture.md`
- `context/specs/ifc-evidence-extractor.md`
- `context/roadmap.md`
- `context/decisions/2026-06-05-ifc-parser-architecture.md`

Purpose:

- create Node/TypeScript project skeleton.
- install and prove `web-ifc` can load the private Barclay IFC.
- create `npm run ifc:inspect`.
- report file hash, schema, project unit signal, basic relevant entity counts, and relationship/material signal counts.
- write a small non-canonical smoke artifact at `outputs/{fileHash}/smoke.json`.
- keep the IFC file private and outside repo.
- create a small real boundary around `web-ifc` lifecycle, but do not build the full evidence/domain architecture yet.
- avoid a one-file throwaway script that exposes raw `web-ifc` mechanics to future modules.
- count relevant element classes already defined by Milestone 1:
  - `IfcWall`
  - `IfcWallStandardCase`
  - `IfcSlab`
  - `IfcRoof`
  - `IfcCurtainWall`
  - `IfcBuildingElementProxy`
- include total count and up to 5 sample STEP ids for each counted relevant element class.
- count relationship/material classes that indicate whether later extraction paths are viable:
  - `IfcRelDefinesByType`
  - `IfcRelAssociatesMaterial`
  - `IfcRelDefinesByProperties`
  - `IfcMaterial`
  - `IfcMaterialLayerSetUsage`
  - `IfcMaterialLayerSet`
  - `IfcMaterialLayer`
  - `IfcMaterialConstituentSet`
  - `IfcMaterialList`
  - `IfcMaterialProfileSetUsage`
  - `IfcMaterialProfileSet`
  - available `IfcTypeObject` subtypes, if easy to count through `web-ifc`
- include total count and up to 5 sample STEP ids for each counted relationship/material/type class.
- inspect enough `IfcProject` / `UnitsInContext` structure to report whether project length units appear available.
- do not inspect relationship contents, classify proxies, build evidence references, perform full numeric normalization, or emit missing datapoints in Step 1.
- keep `smoke.json` outside the canonical Milestone 1 evidence contract. It is a risk-scan artifact, not evidence output.
- cap samples at 5 STEP ids per class to prove access without dumping private model data.
- do not include raw names, GlobalIds, object types, descriptions, property values, material names, or other model evidence in `smoke.json`.
- reserve identity evidence extraction for later Milestone 1 steps that produce proper evidence references and compact cited snapshots.
- do not fail Step 1 because an expected relevant, relationship, type, or material class count is zero. Missing classes are smoke findings, not command failures.
- fail Step 1 only for file read errors, `web-ifc` initialization/load/open errors, or output write errors.
- add lightweight private-file guardrails: ignore generated outputs and IFC-like files in git, and warn if the source IFC is inside the repo. Do not overbuild security for Milestone 1.

Stop condition:

- the CLI can open the real IFC and produce a small smoke-test output without committing private model data.
- raw `web-ifc` calls are contained in one small boundary that can later become `WebIfcModelReader`.
- the smoke output shows whether the file contains the relevant element, relationship, type, and material entity classes that later Milestone 1 steps depend on.
- the smoke output shows whether project length units appear available for later layer-thickness normalization.
- `outputs/{fileHash}/smoke.json` is written and explicitly marked as non-canonical.

### Step 2: `IfcModelReader` and `IfcExtractionIndex`

Read:

- `context/specs/module-architecture.md`
- `context/specs/ifc-evidence-extractor.md`
- `context/decisions/2026-06-05-ifc-parser-architecture.md`
- `UBIQUITOUS_LANGUAGE.md`

Purpose:

- implement `IfcModelReader`.
- hide raw `web-ifc` lifecycle, constants, entity access, attribute shapes, and snapshots.
- implement relevant element discovery from static config.
- implement targeted `IfcExtractionIndex`.
- index official relationship paths:
  - `IfcRelDefinesByType`
  - `IfcTypeObject.HasPropertySets`
  - `IfcRelAssociatesMaterial`
  - `IfcRelDefinesByProperties`

Stop condition:

- feature extractors can depend on reader + index without importing raw `web-ifc`.

### Step 3: Pure IFC Evidence Extraction

Read:

- `context/specs/ifc-evidence-extractor.md`
- `context/specs/module-architecture.md`
- `context/domain.md`
- `context/decisions/2026-06-05-ifc-parser-architecture.md`
- `UBIQUITOUS_LANGUAGE.md`

Purpose:

- implement `WebIfcEvidenceExtractor`.
- implement feature extractors for:
  - element identity evidence.
  - type evidence.
  - material association evidence.
  - layered material evidence.
  - property set evidence.
  - quantity set evidence.
  - candidate property evidence.
- implement `composeIfcEvidence`.
- preserve evidence references and cited STEP ids.
- keep parser output pure evidence only.

Stop condition:

- extractor returns `IfcEvidence` with no assembly candidates, missing datapoints, readiness, calculations, reports, or user prompts.

### Step 4: Artifact Writer and Diagnostics JSON

Read:

- `context/specs/ifc-evidence-extractor.md`
- `context/specs/module-architecture.md`
- `context/roadmap.md`

Purpose:

- write canonical artifacts under `outputs/{fileHash}/`.
- allow partial evidence-only artifacts during implementation, but mark them as incomplete.
- write:
  - `evidence/manifest.json`
  - `evidence/file.json`
  - `evidence/elements.json` or split element files.
  - `evidence/cited-ifc-entities.json`
  - `evidence/diagnostics.json`
- version all output-affecting policy surfaces in manifest.
- keep artifact writing separate from extraction.

Stop condition:

- CLI writes deterministic evidence-only JSON artifacts from extraction output with `artifactCompleteness: "partial_evidence_only"` or equivalent manifest field.

### Step 5: Assembly Candidates, Missing Datapoints, and Readiness

Read:

- `context/specs/ifc-evidence-extractor.md`
- `context/specs/module-architecture.md`
- `context/domain.md`
- `UBIQUITOUS_LANGUAGE.md`
- `context/decisions/2026-06-01-v1-design-decisions.md`
- `context/decisions/2026-06-05-ifc-parser-architecture.md`

Purpose:

- implement `buildAssemblyCandidates`.
- implement `ConservativeAssemblyGroupingPolicy`.
- implement deterministic assembly candidate IDs.
- implement versioned grouping signatures.
- enforce direct occurrence evidence precedence.
- split conflicts into `single_element` assembly candidates.
- implement `detectMissingDatapoints`.
- implement `evaluateAssemblyReadiness`.
- write:
  - `evidence/assembly-candidates.json`
  - `evidence/missing-datapoints.json`
  - readiness diagnostics.

Stop condition:

- CLI reports conservative assembly candidates, exact missing datapoints, and derived readiness without mutating IFC evidence. At this point the artifact set must be upgraded to the full canonical Milestone 1 contract with `artifactCompleteness: "complete_milestone_1"` or equivalent manifest field.

### Step 6: Architect-Facing `diagnostics.md`

Read:

- `context/specs/ifc-evidence-extractor.md`
- `context/domain.md`
- `UBIQUITOUS_LANGUAGE.md`
- `context/roadmap.md`

Purpose:

- derive `diagnostics.md` from structured artifacts.
- optimize for architect/BIM iteration, not developer logging.
- include:
  - File Summary.
  - What We Could Verify.
  - What Needs Review.
  - What To Fix In BIM.
  - Assembly Evidence Summary.
  - Conformity Evidence.
  - Artifact Index.

Stop condition:

- an architect can read `diagnostics.md` and understand what the IFC proves, what is missing, and what to fix or provide.

Suggested implementation split:

1. Project scaffold and IFC smoke test.
2. `IfcModelReader` and `IfcExtractionIndex`.
3. Pure IFC evidence extraction.
4. Artifact writer and diagnostics JSON.
5. Assembly candidates, missing datapoints, and readiness.
6. Architect-facing `diagnostics.md`.

Milestone 1 is complete when the CLI runs against the private Barclay IFC without crashing, writes the canonical artifact set, identifies relevant envelope elements, reports exact missing calculation datapoints, preserves evidence provenance, and distinguishes parser failure from incomplete IFC evidence.
