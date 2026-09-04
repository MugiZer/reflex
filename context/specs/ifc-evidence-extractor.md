# IFC Evidence Extractor - Specification

## Purpose
Define Milestone 1 parser architecture for extracting calculation-relevant IFC evidence from real IFC files without mixing raw parser mechanics with domain judgment.

## Milestone 1 Goal
Run the real Barclay IFC through the first extractor and produce canonical evidence artifacts plus an architect-facing diagnostics report.

Private sample file:

```text
C:\Users\moham\Downloads\1365-01_Barclay 4_ARCH_V23_akhouryHLD2Y.ifc
```

Command target:

```text
npm run ifc:inspect -- "C:\Users\moham\Downloads\1365-01_Barclay 4_ARCH_V23_akhouryHLD2Y.ifc"
```

Milestone 1 does not calculate U-values. It proves:

```text
IFC file
-> pure IFC evidence
-> conservative assembly candidates
-> exact missing datapoints
-> readiness derived from evidence
-> diagnostics.md for BIM iteration
```

## Architecture
Use this pipeline:

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

The parser machine reads facts. Domain modules give facts meaning.

## Parser Purity Rule
`WebIfcEvidenceExtractor` is a machine adapter. It extracts IFC evidence only.

It must not:

- group assemblies.
- decide readiness.
- detect missing datapoints.
- calculate U-values.
- resolve material library lambda.
- ask user questions.
- write HTML reports.

Extractor output:

```ts
type IfcEvidence = {
  fileEvidence: FileEvidence;
  typeEvidence: TypeEvidence[];
  elementEvidence: ElementEvidence[];
  citedIfcEntities: CitedIfcEntity[];
  diagnostics: Diagnostic[];
};
```

No `AssemblyCandidate`, `MissingDatapoint`, `ReadinessState`, or `CalculationSnapshot` belongs in pure parser output.

## IfcModelReader
Raw `web-ifc` must stay behind `WebIfcModelReader`.

Feature extractors depend on `IfcModelReader`, not raw `web-ifc`.

`IfcModelReader` hides parser syntax and lifecycle:

- `modelId`.
- WASM initialization.
- entity constants.
- line ID collection shapes.
- attribute wrapper shapes.
- missing attribute behavior.
- schema quirks.

It does not contain domain methods.

Allowed methods:

```ts
interface IfcModelReader {
  getHeader(): IfcHeaderEvidence;
  getSchema(): string | null;

  hasEntityClass(entityClass: string): boolean;
  getEntitiesByClass(entityClass: string): IfcEntityRecord[];
  getEntity(stepId: StepId): IfcEntityRecord | null;

  getEntityClass(stepId: StepId): string | null;
  getStringAttribute(stepId: StepId, attributeName: string): string | null;
  getNumberAttribute(stepId: StepId, attributeName: string): number | null;
  getBooleanAttribute(stepId: StepId, attributeName: string): boolean | null;
  getEntityReference(stepId: StepId, attributeName: string): StepId | null;
  getEntityReferenceList(stepId: StepId, attributeName: string): StepId[];

  getCompactEntitySnapshot(stepId: StepId): CitedIfcEntity;
}
```

Forbidden methods:

```text
getAssemblies()
getLayeredAssembly()
getMissingDatapoints()
getReadinessState()
getThermalMaterials()
```

## Schema Strategy
Use schema detection plus feature-based extraction.

Support strategy:

```text
detect schema
use same domain output contract
feature extractors check whether entities/attributes exist
emit diagnostics for missing or unsupported features
```

Do not build separate parser implementations for IFC2X3, IFC4, and IFC4X3.

## Official IFC Paths
Milestone 1 uses these official IFC paths:

```text
type link:
IfcRelDefinesByType

type property sets:
IfcTypeObject.HasPropertySets

occurrence/type materials:
IfcRelAssociatesMaterial

occurrence property sets and quantity sets:
IfcRelDefinesByProperties
```

Verified documentation:

- `IfcRelDefinesByType`: https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcRelDefinesByType.htm
- `IfcRelAssociatesMaterial`: https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcRelAssociatesMaterial.htm
- `IfcRelDefinesByProperties`: https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/HTML/lexical/IfcRelDefinesByProperties.htm

Rules:

```text
Element -> Type link = IfcRelDefinesByType only.
Type psets = IfcTypeObject.HasPropertySets.
Occurrence psets/qsets = IfcRelDefinesByProperties.
Occurrence/type materials = IfcRelAssociatesMaterial.
Direct occurrence evidence takes precedence over type evidence.
```

## Relevant Elements
Relevant element means an IFC object actively needed for current calculations.

Milestone 1 relevant classes:

```text
IfcWall
IfcWallStandardCase
IfcSlab
IfcRoof
IfcCurtainWall
likely envelope IfcBuildingElementProxy
```

Normalization:

```text
IfcWallStandardCase -> elementClass: "IfcWall"
IfcWall -> elementClass: "IfcWall"
IfcSlab -> elementClass: "IfcSlab"
IfcRoof -> elementClass: "IfcRoof"
IfcCurtainWall -> elementClass: "IfcCurtainWall"
likely envelope IfcBuildingElementProxy -> elementClass: "IfcBuildingElementProxy"
```

`IfcWallStandardCase` is included for compatibility with IFC files that still export it. Normalize it to `IfcWall` while preserving `rawEntityClass`.

`IfcCurtainWall` is included because it can contribute envelope thermal evidence. Treat it as separate from `IfcWall`.

`IfcBuildingElementProxy` is included only when likely envelope. Do not reject all proxies. Use low or medium classification confidence.

Proxy hints are static config:

```text
wall
slab
roof
curtain
envelope
facade
exterior
external
```

Check hints against:

- `Name`.
- `ObjectType`.
- `PredefinedType`.
- relevant classification candidate properties.

Skipped-scope summaries are high-level only. Do not emit per-skipped-entity records.

Known skipped-scope classes:

```text
IfcCovering
IfcDoor
IfcWindow
IfcOpeningElement
IfcSpace
IfcBeam
IfcColumn
IfcPlate
IfcMember
```

`IfcCovering` is future scope because it may be thermal-relevant but needs host association logic. `IfcPlate` and `IfcMember` are not top-level relevant elements in Milestone 1, but can be cited if referenced by included curtain wall evidence later.

Do not produce a full IFC class census. Report only included relevant classes and known skipped-scope classes.

Relevant element class rules must live in simple static config, not scattered `if` statements.

## IfcExtractionIndex
Use shared targeted index so feature extractors do not repeatedly scan the IFC.

Index only needed relationships and only links touching relevant elements or their type objects.

Milestone 1 index:

```ts
type IfcExtractionIndex = {
  relevantElementStepIds: Set<StepId>;

  typeLinkByElementStepId: Map<StepId, TypeLinkRaw>;

  materialAssociationsByRelatedStepId: Map<
    StepId,
    MaterialAssociationRaw[]
  >;

  propertyDefinitionsByElementStepId: Map<
    StepId,
    PropertyDefinitionRaw[]
  >;

  typePropertySetStepIdsByTypeStepId: Map<
    StepId,
    StepId[]
  >;
};
```

Sources scanned:

```text
IfcRelDefinesByType
IfcRelAssociatesMaterial
IfcRelDefinesByProperties
IfcTypeObject.HasPropertySets
```

Milestone 1 excludes spatial containment/storey context from the index.

## Evidence Feature Extractors
Evidence feature extractors are focused modules that extract one kind of IFC evidence.

Use a plain ordered array, not a plugin framework:

```ts
const evidenceFeatureExtractors = [
  extractElementIdentityEvidence,
  extractTypeEvidence,
  extractMaterialAssociationEvidence,
  extractLayeredMaterialEvidence,
  extractPropertySetEvidence,
  extractCandidatePropertyEvidence,
];
```

Feature extractor output:

```ts
type FeatureExtractionResult<TFeatureEvidence> = {
  featureKey: string;
  evidence: TFeatureEvidence[];
  diagnostics: Diagnostic[];
  citedStepIds: StepId[];
};
```

Feature extractors:

- use `IfcModelReader`.
- use `IfcExtractionIndex`.
- do not scan whole IFC independently.
- do not write files.
- may return repeated `citedStepIds`.

`composeIfcEvidence` dedupes cited step IDs and creates one `CitedIfcEntity` per step ID.

## Element Evidence
`ElementEvidence` is one record per source element instance.

It embeds rich identity evidence:

```ts
type ElementEvidence = {
  identity: ElementIdentityEvidence;
  directMaterialEvidence: MaterialEvidence[];
  directPropertySets: PropertySetEvidence[];
  directQuantitySets: QuantitySetEvidence[];
  candidatePropertyEvidence: CandidatePropertyEvidence[];
  evidenceReferences: EvidenceReference[];
  diagnostics: Diagnostic[];
};
```

Identity:

```ts
type ElementIdentityEvidence = {
  stepId: StepId;
  globalId: string | null;

  rawEntityClass: string;
  elementClass: ElementClass;

  name: string | null;
  objectType: string | null;
  predefinedType: string | null;
  tag: string | null;
  description: string | null;

  ifcTypeObjectStepId: StepId | null;

  classification: {
    classificationConfidence: Confidence;
    inclusionReason: string;
    matchedHints: string[];
    needsUserConfirmation: boolean;
  };

  sourceContext: {
    containerStepId: StepId | null;
    storeyName: string | null;
  };

  evidenceReference: EvidenceReference;

  rawAttributeSnapshot: {
    GlobalId?: unknown;
    Name?: unknown;
    ObjectType?: unknown;
    PredefinedType?: unknown;
    Tag?: unknown;
    Description?: unknown;
  };
};
```

`sourceContext` fields remain `null` in Milestone 1 unless later indexed.

## Type Evidence
Store shared `TypeEvidence[]` separately. Elements reference type objects with `ifcTypeObjectStepId`.

Do not duplicate full type evidence across every element.

```ts
type TypeEvidence = {
  identity: TypeIdentityEvidence;
  materialEvidence: MaterialEvidence[];
  propertySets: PropertySetEvidence[];
  quantitySets: QuantitySetEvidence[];
  candidatePropertyEvidence: CandidatePropertyEvidence[];
  diagnostics: Diagnostic[];
};
```

Type identity:

```ts
type TypeIdentityEvidence = {
  stepId: StepId;
  globalId: string | null;
  rawEntityClass: string;
  name: string | null;
  predefinedType: string | null;
  tag: string | null;
  description: string | null;

  rawAttributeSnapshot: {
    GlobalId?: unknown;
    Name?: unknown;
    PredefinedType?: unknown;
    Tag?: unknown;
    Description?: unknown;
    ElementType?: unknown;
  };

  evidenceReference: EvidenceReference;
};
```

## Direct Evidence Precedence
Direct `ElementEvidence` takes precedence over `TypeEvidence`.

Rule:

```text
TypeEvidence can suggest grouping.
ElementEvidence can veto grouping.
```

If element direct evidence and type evidence conflict:

```text
use direct element evidence for that source element
split source element out of the type-based AssemblyCandidate
emit diagnostic
```

This is interpretation precedence, not mutation. Never edit type evidence or IFC evidence.

## Material Evidence
Use a discriminated union by material structure kind.

Material association can point to:

```text
IfcMaterial
IfcMaterialLayerSetUsage
IfcMaterialLayerSet
IfcMaterialConstituentSet
IfcMaterialList
IfcMaterialProfileSetUsage
IfcMaterialProfileSet
unknown IfcMaterialDefinition
```

Base:

```ts
type BaseMaterialEvidence = {
  materialEvidenceId: string;
  associationScope: "occurrence" | "type";
  associationStepId: StepId;
  relatingMaterialStepId: StepId;
  materialStructureKind:
    | "single_material"
    | "layer_set_usage"
    | "layer_set"
    | "constituent_set"
    | "material_list"
    | "profile_set_usage"
    | "profile_set"
    | "unknown";
  evidenceReference: EvidenceReference;
  diagnostics: Diagnostic[];
};
```

Union:

```ts
type MaterialEvidence =
  | SingleMaterialEvidence
  | LayeredMaterialEvidence
  | ConstituentMaterialEvidence
  | MaterialListEvidence
  | ProfileSetUsageMaterialEvidence
  | ProfileMaterialEvidence
  | UnknownMaterialDefinitionEvidence;
```

`IfcMaterialLayerSetUsage` and `IfcMaterialProfileSetUsage` are occurrence-level usage definitions. If they appear on type evidence, preserve the evidence and emit a diagnostic instead of treating it as normal type material evidence.

## Layered Material Evidence
Layered evidence must include all calculation-relevant and edge-case attributes verified in docs.

Docs:

- `IfcMaterialLayer`: https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcMaterialLayer.htm
- `IfcMaterialLayerSet`: https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/HTML/lexical/IfcMaterialLayerSet.htm
- `IfcMaterialLayerSetUsage`: https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/HTML/lexical/IfcMaterialLayerSetUsage.htm

`IfcMaterialLayerSetUsage` fields:

```text
ForLayerSet
LayerSetDirection
DirectionSense
OffsetFromReferenceLine
ReferenceExtent
```

`IfcMaterialLayerSet` fields:

```text
MaterialLayers
LayerSetName
Description
```

`IfcMaterialLayer` fields:

```text
Material
LayerThickness
IsVentilated
Name
Description
Category
Priority
```

Shape:

```ts
type LayeredMaterialEvidence = BaseMaterialEvidence & {
  materialStructureKind: "layer_set_usage" | "layer_set";

  layerSetUsage: {
    stepId: StepId;
    forLayerSetStepId: StepId;
    layerSetDirection: string | null;
    directionSense: string | null;
    offsetFromReferenceLine: NumericEvidence | null;
    referenceExtent: NumericEvidence | null;
    rawAttributeSnapshot: Record<string, unknown>;
    evidenceReference: EvidenceReference;
  } | null;

  layerSet: {
    stepId: StepId;
    layerSetName: string | null;
    description: string | null;
    materialLayerStepIds: StepId[];
    rawAttributeSnapshot: Record<string, unknown>;
    evidenceReference: EvidenceReference;
  };

  layers: LayerEvidence[];

  layerOrderSource: "IfcMaterialLayerSet.MaterialLayers" | "unknown";

  totalLayerThickness: NumericEvidence | null;
};
```

Layer:

```ts
type LayerEvidence = {
  layerIndex: number;
  layerStepId: StepId;
  materialStepId: StepId | null;

  materialName: string | null;
  materialCategory: string | null;

  layerName: string | null;
  layerDescription: string | null;
  layerCategory: string | null;

  thickness: NumericEvidence | null;

  isVentilated: boolean | "unknown" | null;
  priority: number | null;

  rawAttributeSnapshot: Record<string, unknown>;
  evidenceReference: EvidenceReference;

  candidatePropertyEvidence: CandidatePropertyEvidence[];
  diagnostics: Diagnostic[];
};
```

## Numeric Evidence
Use `NumericEvidence` for every numeric calculation-relevant datapoint:

- layer thickness.
- offset from reference line.
- reference extent.
- lambda candidates.
- assembly thickness candidates.
- future `Rsi` and `Rse`.

```ts
type NumericEvidence = {
  rawValue: number;
  rawUnit: string | null;
  normalizedValue: number | null;
  normalizedUnit: string;
  unitSource:
    | "ifc_project_units"
    | "ifc_property_unit"
    | "ifc_measure_type"
    | "assumed"
    | "unknown";
  confidence: Confidence;
  evidenceReference: EvidenceReference;
  diagnostics: Diagnostic[];
};
```

Unit rule:

```text
Normalize only when unit is directly knowable from IFC evidence.
Do not silently assume units.
If unit is unknown, normalizedValue = null and emit diagnostic.
MissingDatapointDetector later decides whether to ask user.
```

For `IfcMaterialLayer.LayerThickness`, use project length units and normalize to meters.

For property values, use explicit property unit when present. If measure type implies length, use project length unit. If unclear, leave normalized value null.

## Candidate Property Evidence
Use one generic candidate property evidence array.

```ts
type CandidatePropertyEvidence = {
  candidateKind:
    | "lambda"
    | "layer_thickness"
    | "assembly_thickness"
    | "material_name"
    | "classification"
    | "unit";
  propertySetName: string | null;
  propertyName: string;
  rawValue: unknown;
  rawUnit: string | null;
  normalizedValue?: number;
  normalizedUnit?: string;
  confidence: Confidence;
  evidenceReference: EvidenceReference;
  reason: string;
};
```

Lambda candidate detection:

```text
capture broad candidates
classify strictly
```

Capture names containing:

```text
thermalconductivity
thermal conductivity
conductivity
lambda
k-value
k value
```

Classification:

```text
confirmed_lambda
candidate_lambda
rejected_lambda
```

Generic element thickness is assembly-level evidence only, not per-layer thickness.

Thickness priority:

```text
1. IfcMaterialLayer.LayerThickness = confirmed layer thickness.
2. qset/pset thickness with clear layer/material context = candidate layer thickness.
3. generic wall/slab/roof thickness = assembly thickness evidence.
4. geometry-derived thickness = out of Milestone 1 scope.
```

## Evidence Reference
Every important value needs an `EvidenceReference`.

Use both readable and structured forms.

```ts
type EvidenceReference = {
  evidencePath: string;
  sourceStepIds: StepId[];
  pathParts: EvidencePathPart[];
};

type EvidencePathPart = {
  stepId: StepId;
  entityClass: string;
  attribute?: string;
  index?: number;
};
```

Example readable path:

```text
IfcWall#245 -> IfcRelAssociatesMaterial#900 -> IfcMaterialLayerSetUsage#901 -> ForLayerSet -> IfcMaterialLayerSet#902 -> MaterialLayers[1] -> IfcMaterialLayer#904 -> LayerThickness
```

Cite entities used for found evidence and entities checked for missing evidence or diagnostics.

Do not dump full raw IFC entities. Store normalized evidence plus compact cited raw snapshots only.

## Artifact Set
Canonical evidence is split artifact set, not one giant JSON file.

```text
outputs/{fileHash}/
  evidence/
    manifest.json
    file.json
    elements.json
    assembly-candidates.json
    cited-ifc-entities.json
    diagnostics.json
    missing-datapoints.json
  diagnostics.md
```

If relevant element count is high, split elements by class:

```text
outputs/{fileHash}/evidence/elements/
  walls.json
  slabs.json
  roofs.json
  curtain-walls.json
  proxies.json
```

Split threshold:

```text
relevant elements > 2000
or elements.json > 25 MB
```

Manifest records chosen layout.

## Artifact Manifest
Manifest versions every output-affecting policy surface.

Use readable string IDs, not semver.

```ts
type EvidenceArtifactManifest = {
  artifactSchemaVersion: "ifc-evidence-artifacts.v1";
  extractorVersion: "web-ifc-evidence-extractor.v1";
  ifcModelReaderVersion: "web-ifc-model-reader.v1";
  extractionIndexVersion: "ifc-extraction-index.v1";
  relevantElementRulesVersion: "relevant-element-rules.v1";
  groupingPolicyVersion: "conservative-material-association.v1";
  missingDatapointRulesVersion: "missing-datapoint-rules.v1";
  readinessRulesVersion: "assembly-readiness-rules.v1";
};
```

## Diagnostics Markdown
`diagnostics.md` is an architect-facing BIM iteration report.

It is not:

- dev log.
- raw evidence dump.
- full IFC census.

Optimize for:

- what IFC contains.
- what evidence proves assembly conformity.
- what missing datapoints block or limit calculation.
- what user/BIM author should fix.
- where evidence came from.

Sections:

```text
# IFC Evidence Review

## File Summary
schema, units, hash

## What We Could Verify
assemblies with enough evidence
layer stacks found
materials found
thicknesses found
IFC paths proving them

## What Needs Review
missing lambda
ambiguous material
uncertain slab/proxy classification
uncertain units
candidate estimates

## What To Fix In BIM
specific elements/types/properties missing
suggested BIM authoring fix

## Assembly Evidence Summary
per assembly candidate:
- source elements
- grouping basis
- found datapoints
- missing datapoints
- evidence paths
- readiness

## Conformity Evidence
datapoints that support calculation/report trust

## Artifact Index
JSON paths
```

## Assembly Candidates
`AssemblyCandidate` is domain interpretation, not parser output.

Create candidates in `buildAssemblyCandidates` after pure extraction.

`AssemblyCandidate` contains:

```ts
type AssemblyCandidate = {
  assemblyCandidateId: string;
  sourceElementStepIds: StepId[];
  sourceElementGlobalIds: string[];
  groupingKey: string;
  groupingBasis: GroupingBasis;
  groupingConfidence: Confidence;
  groupingSignatures: EvidenceSignature[];
  groupingDiagnostics: Diagnostic[];
  evidenceSummary: AssemblyEvidenceSummary;
};
```

`evidenceSummary` is derived and small. It is not source of truth.

```ts
type AssemblyEvidenceSummary = {
  hasLayeredMaterialEvidence: boolean;
  hasOrderedLayers: boolean;
  layerCount: number;

  hasAllLayerThicknesses: boolean;
  missingLayerThicknessCount: number;

  hasAllMaterialNames: boolean;
  missingMaterialNameCount: number;

  hasAnyLambdaCandidates: boolean;
  hasAllLambdaCandidates: boolean;
  missingLambdaCandidateCount: number;

  hasNonLayeredMaterialEvidence: boolean;
  hasAssemblyThicknessCandidate: boolean;

  hasClassificationUncertainty: boolean;
};
```

Do not put `isReady`, `isBlocked`, or user prompts inside `evidenceSummary`.

`buildAssemblyCandidates` is the only public producer of `AssemblyEvidenceSummary`.

## Grouping Policy
Use `AssemblyGroupingPolicy` seam. Milestone 1 policy is `ConservativeAssemblyGroupingPolicy`.

No plugin system, weighted scoring engine, ML clustering, or config DSL.

Milestone 1 grouping rule:

```text
Group source elements only if all true:
1. same elementClass
2. same ifcTypeObjectStepId exists
3. same effectiveMaterialAssociationSignature
4. no conflicting direct occurrence evidence
```

If no type object:

```text
single_element
```

If direct occurrence evidence conflicts with type evidence:

```text
single_element + diagnostic
```

## Grouping Signatures
Use versioned evidence signatures.

```ts
type EvidenceSignature = {
  signatureKind: "material_association";
  signatureVersion: 1;
  hash: string;
  components: EvidenceSignatureComponent[];
};

type EvidenceSignatureComponent = {
  key: string;
  value: string | number | boolean | null;
  evidenceReference?: EvidenceReference;
};
```

Milestone 1 material association signature includes:

```text
associationScope
associationStepId
relatingMaterialStepId
materialStructureKind
layerSetStepId
layerCount
layerMaterialStepIds
layerMaterialNames
layerThicknessRawValues
```

It excludes:

```text
lambda candidates
psets/qsets
surface profile
readiness
user overrides
diagnostics
unstable names when better IDs exist
```

Store both:

- `groupingKey` for lookup.
- `groupingSignatures[]` for explainability and future versions.

## Assembly Candidate IDs
Use deterministic IDs, not random IDs.

Input:

```ts
type AssemblyCandidateIdInput = {
  fileHash: string;
  groupingKey: string;
  groupingPolicyVersion: string;
  artifactSchemaVersion: string;
};
```

Format:

```text
ac_{12-char-hash}
```

Single element grouping key:

```text
single_element:{rawEntityClass}:{stepId}:{globalId}
```

IDs must change when grouping meaning changes.

## Missing Datapoints
Milestone 1 includes lightweight `MissingDatapointDetector`.

It is a deep module with internal plain ordered TypeScript rule table. It is not a generic rules engine.

Rules live as named functions:

```text
detectMissingProjectLengthUnit
detectMissingLayerThickness
detectMissingLayerMaterialName
detectMissingLayerLambda
detectUncertainProxyClassification
detectMissingLayerStackForNonLayeredEvidence
```

Severity:

```ts
type MissingDatapointSeverity =
  | "required_for_layered_calculation"
  | "required_for_estimate"
  | "required_for_precision"
  | "required_for_provenance"
  | "optional_for_report";
```

Milestone 1 does not include full `RequestedInputPlanner`. App UI handles full requested input planning later.

Milestone 1 missing datapoints can include light user guidance:

```ts
type MissingDatapoint = {
  field: MissingDatapointField;
  severity: MissingDatapointSeverity;
  reason: string;
  userFixable: boolean;
  userQuestionLevel?:
    | "project"
    | "assembly"
    | "layer"
    | "material"
    | "property_group";
  suggestedUserQuestion?: string;
  bimSourceFixRecommended: boolean;
  bimSourceFixHint?: string;
  evidenceChecked: EvidenceReference[];
  affectedElementIds: SourceElementId[];
};
```

Askable fields later must pass filter:

```text
1. datapoint affects calculation, estimate, precision, or provenance.
2. user can reasonably know or obtain value.
3. question can be phrased in building/thermal language.
4. scope is understandable.
5. answer can update calculation safely.
```

## Readiness Evaluation
`AssemblyReadinessEvaluator` derives state from `AssemblyCandidate` plus `MissingDatapoints`.

It must not rediscover missing fields.

Input:

```ts
type EvaluateAssemblyReadinessCommand = {
  assemblyCandidate: AssemblyCandidate;
  missingDatapoints: MissingDatapoint[];
};
```

Output:

```ts
type AssemblyReadinessEvaluation = {
  readinessState: ReadinessState;
  confidence: Confidence;
  reasons: Diagnostic[];
};
```

Allowed:

- use `evidenceSummary`.
- use missing datapoint severity and `userFixable`.
- use calculation basis candidates.

Forbidden:

- walk layers to rediscover missing thickness.
- walk properties to rediscover lambda.
- inspect raw psets/qsets.

## Failure Modes
Whole extraction can fail for:

- file read error.
- IFC parse/open error.
- internal invariant violation.
- output write error.

Unsupported or incomplete IFC structures are not whole-job failures. They produce:

- partial evidence.
- diagnostics.
- missing datapoints later.
- `needs_review`, `estimated`, or `blocked` readiness later.

## Out of Scope
Milestone 1 excludes:

- U-value calculation.
- material library resolution.
- full UI requested input planning.
- geometry-derived thickness.
- spatial containment/storey indexing.
- host association logic for `IfcCovering`.
- top-level plate/member thermal assemblies.
- windows, doors, openings, thermal bridges, solar, whole-building report.
