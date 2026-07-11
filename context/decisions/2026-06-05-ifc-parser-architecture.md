# IFC Parser Architecture - 2026-06-05

## Context
The IFC parser is the critical technical risk for the BIM-to-Physics Compiler. The first real file is a 30 MB IFC:

```text
C:\Users\moham\Downloads\1365-01_Barclay 4_ARCH_V23_akhouryHLD2Y.ifc
```

The parser must extract calculation-relevant evidence without shaping the codebase around raw `web-ifc` syntax and without mixing parser mechanics with domain/product judgment.

## Decision
Build Milestone 1 as an IFC evidence extraction machine with a clean domain pipeline:

```text
WebIfcEvidenceExtractor
-> WebIfcModelReader
-> buildIfcExtractionIndex
-> EvidenceFeatureExtractor[]
-> composeIfcEvidence
-> buildAssemblyCandidates
-> detectMissingDatapoints
-> evaluateAssemblyReadiness
-> write evidence artifacts
-> derive diagnostics.md
```

Lock these rules:

- `WebIfcEvidenceExtractor` outputs pure IFC evidence only.
- `IfcModelReader` hides raw `web-ifc` mechanics.
- `IfcExtractionIndex` scans targeted relationship classes once.
- feature extractors use reader + index and do not scan whole IFC independently.
- `composeIfcEvidence` dedupes cited entities.
- `buildAssemblyCandidates` owns assembly candidate creation and `evidenceSummary`.
- `MissingDatapointDetector` owns missing field detection through a plain ordered rule table.
- `AssemblyReadinessEvaluator` derives readiness from `AssemblyCandidate` plus `MissingDatapoints`; it does not rediscover missing fields.

## Rationale
This keeps responsibilities local:

```text
web-ifc quirks -> WebIfcModelReader
relationship scan speed -> IfcExtractionIndex
IFC evidence features -> EvidenceFeatureExtractors
domain grouping -> AssemblyGroupingPolicy
missing fields -> MissingDatapointDetector
readiness state -> AssemblyReadinessEvaluator
```

The codebase should not expose the whole system to niche library syntax, parser lifecycle rules, or raw IFC object shapes.

## Alternatives Considered
### Raw web-ifc Everywhere
Rejected because every module would need to know `modelId`, WASM initialization, entity constants, line ID collection shapes, attribute wrappers, and schema quirks.

### Extractor Builds Assembly Candidates Directly
Rejected because `AssemblyCandidate` is domain interpretation. Parser should emit facts. Domain modules should give facts meaning.

### Feature Extractors Independently Scan IFC
Rejected because this duplicates traversal work, duplicates cited records, creates hidden coupling, and hurts performance.

### Generic Plugin/Rules Framework
Rejected because it adds complexity before there are multiple real policies. Use plain ordered arrays/functions.

### Full Building Element Census
Rejected because Milestone 1 only extracts elements actively needed for current calculations.

## Specific Decisions
### Official IFC Paths
Use:

```text
IfcRelDefinesByType for type link.
IfcTypeObject.HasPropertySets for type psets.
IfcRelAssociatesMaterial for occurrence/type materials.
IfcRelDefinesByProperties for occurrence psets/qsets.
```

### Relevant Elements
Milestone 1 includes:

```text
IfcWall
IfcWallStandardCase
IfcSlab
IfcRoof
IfcCurtainWall
likely envelope IfcBuildingElementProxy
```

`IfcWallStandardCase` normalizes to `IfcWall`. `IfcCurtainWall` remains separate. Likely envelope proxies are included with low/medium classification confidence.

### Skipped Entities
Skipped entities are summarized by class/count/reason only. No per-skipped-entity dump.

### Element and Type Evidence
`ElementEvidence` is one record per source element instance. `TypeEvidence[]` is separate and referenced by `ElementEvidence.ifcTypeObjectStepId`.

Direct `ElementEvidence` takes precedence over `TypeEvidence`. If direct occurrence evidence conflicts with type evidence, the source element splits out of the type-based assembly candidate.

### Material Evidence
Use a discriminated union by material structure kind:

```text
single_material
layer_set_usage
layer_set
constituent_set
material_list
profile_set_usage
profile_set
unknown
```

Layered evidence includes all relevant `IfcMaterialLayerSetUsage`, `IfcMaterialLayerSet`, and `IfcMaterialLayer` attributes verified against buildingSMART docs.

### Numeric Evidence
Use `NumericEvidence` for thicknesses, offsets, reference extent, lambda candidates, assembly thickness candidates, and future surface resistances.

Do not silently assume units. If unit is unknown, leave normalized value null and emit diagnostic.

### Assembly Candidate Grouping
Use `AssemblyGroupingPolicy` seam. Milestone 1 policy is `ConservativeAssemblyGroupingPolicy`.

Group only when all are true:

```text
same elementClass
same ifcTypeObjectStepId exists
same effectiveMaterialAssociationSignature
no conflicting direct occurrence evidence
```

### Grouping Signatures
Use versioned `EvidenceSignature` with:

```text
signatureKind = material_association
signatureVersion = 1
```

Store both `groupingKey` and `groupingSignatures[]` on `AssemblyCandidate`.

### Assembly Candidate IDs
Use deterministic IDs:

```text
ac_{12-char-hash}
```

Input:

```text
fileHash
groupingKey
groupingPolicyVersion
artifactSchemaVersion
```

### Artifact Versioning
Manifest versions every output-affecting policy surface:

```text
artifactSchemaVersion
extractorVersion
ifcModelReaderVersion
extractionIndexVersion
relevantElementRulesVersion
groupingPolicyVersion
missingDatapointRulesVersion
readinessRulesVersion
```

### Diagnostics
`diagnostics.md` is an architect-facing BIM iteration report, not a dev log and not a raw evidence dump.

## Implications
Future parser enrichment should add or evolve:

- feature extractors.
- relevant element rules.
- grouping policies.
- evidence signatures.
- missing datapoint rules.
- readiness rules.

It should not leak raw `web-ifc` into domain modules.

Old artifacts stay interpretable because manifest versions every policy surface that can change outputs.

## Open Questions
- Exact `web-ifc` API calls after implementation starts.
- Exact type aliases for raw `web-ifc` values after seeing library object shapes.
- Exact property and quantity evidence structures after first Barclay IFC run.
- Whether Milestone 2 needs `RequestedInputPlanner` as separate module or inside review application layer.
