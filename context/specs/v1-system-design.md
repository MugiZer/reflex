# V1 System Design - Specification

## Purpose
Define V1 architecture for a Node/Express BIM-to-physics report compiler with evidence-first IFC extraction, reviewable missing datapoints, calculation revisions, and clean HTML reports.

## Product Interface
V1 is a small web UI wrapping an API.

Primary flow:

```text
Upload IFC
-> async job processing
-> assembly-focused review
-> user enters missing datapoints
-> recalculation/revision
-> clean HTML report
```

## Stack
Use:

- Node.
- Express.
- SQLite.
- local file storage.
- versioned local material library.
- clean HTML report template.
- single-workspace/no-auth prototype.

Do not add:

- Redis.
- BullMQ.
- RabbitMQ.
- Kafka.
- S3.
- Kubernetes.
- microservices.
- full auth.
- WebSockets.
- server-sent events.

## API Shape
Use async job model.

```text
POST /api/jobs
  multipart IFC upload
  -> { job_id }

GET /api/jobs/:jobId
  -> job status, assemblies, missing datapoints, current revision summary

GET /api/jobs/:jobId/report
  -> clean HTML report
```

The job model should exist even if initial processing runs synchronously inside request handler.

## Job Resource Pattern
Treat long-running work as a first-class resource.

Job fields:

- id.
- status.
- original filename.
- file hash.
- IFC schema.
- units.
- created at.
- updated at.
- error message.
- warnings.
- result path.
- report path.

Job states:

```text
queued
processing
needs_review
completed
failed
```

Invalid contradictory states must be prevented.

## Storage
Use SQLite for metadata/results and local disk for files.

Suggested layout:

```text
data/
  app.db

storage/
  uploads/
    {jobId}.ifc

  reports/
    {jobId}.html

outputs/
  {fileHash}/
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

Private IFC fixtures should stay outside committed repo history or under git-ignored private fixture paths.

Add to `.gitignore`:

```gitignore
fixtures/ifc/private/
outputs/
storage/
data/
```

## Module Boundaries
Keep Express routes thin.

```text
routes/
  jobs.routes.ts

application/
  createJob.ts
  processIfcJob.ts

domain/
  Job.ts
  PhysicsAssembly.ts
  MissingDatapoint.ts
  CalculationSnapshot.ts

infrastructure/
  jobRepository.ts
  fileStorage.ts
  ifcParser.webIfc.ts
  reportWriter.html.ts
```

Rules:

```text
Express route != IFC processor
Express route != physics calculator
Express route != report generator
```

For detailed module interfaces, naming rules, seams, adapters, and canonical type names, read `context/specs/module-architecture.md`.

Use domain-specific names from `UBIQUITOUS_LANGUAGE.md`. Avoid ambiguous names like `status`, `source`, `type`, `data`, `processor`, `manager`, `helpers`, and `utils` when a domain term exists.

## IFC Extractor Module
Build first version as real extractor module, not random throwaway script.

Authoritative parser design lives in `context/specs/ifc-evidence-extractor.md`. If this file and the extractor spec conflict, the extractor spec wins.

Suggested structure:

```text
scripts/ifc-inspect.ts
  CLI wrapper
  takes IFC path
  writes evidence JSON and diagnostics

src/infrastructure/ifc/web-ifc/
  WebIfcEvidenceExtractor.ts
  WebIfcModelReader.ts

src/domain/evidence/
  IfcModelReader.ts
  evidenceTypes.ts
  buildIfcExtractionIndex.ts
  composeIfcEvidence.ts

src/domain/evidence/features/
  extractElementIdentityEvidence.ts
  extractTypeEvidence.ts
  extractMaterialAssociationEvidence.ts
  extractLayeredMaterialEvidence.ts
  extractPropertySetEvidence.ts
  extractCandidatePropertyEvidence.ts
```

First command target:

```text
npm run ifc:inspect -- "C:\Users\moham\Downloads\1365-01_Barclay 4_ARCH_V23_akhouryHLD2Y.ifc"
```

## Extractor Output
Extractor should produce structured JSON artifacts plus human-readable diagnostics.

Outputs:

```text
outputs/{fileHash}/evidence/manifest.json
outputs/{fileHash}/evidence/file.json
outputs/{fileHash}/evidence/elements.json
outputs/{fileHash}/evidence/assembly-candidates.json
outputs/{fileHash}/evidence/cited-ifc-entities.json
outputs/{fileHash}/evidence/diagnostics.json
outputs/{fileHash}/evidence/missing-datapoints.json
outputs/{fileHash}/diagnostics.md
```

## Extractor Result Contract
Unsupported domain structures must not fail whole job. Return partial evidence and diagnostics.

Throw/fail only for infrastructure failures:

- file cannot be read.
- IFC parser cannot open model.
- output path cannot be written.
- internal invariant violation.

Return diagnostics for:

- no material layer set found.
- material constituent set found but no thicknesses.
- slab subtype ambiguous.
- units missing.
- material name missing.
- relationship path unsupported.

Shape:

```ts
type ExtractIfcEvidenceResult =
  | {
      ok: true;
      evidence: IfcEvidence;
      diagnostics: Diagnostic[];
    }
  | {
      ok: false;
      failureType: "file_read_error" | "parse_error" | "internal_error";
      message: string;
      diagnostics: Diagnostic[];
    };
```

Diagnostic:

```ts
type Diagnostic = {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  elementStepId?: number;
  globalId?: string;
  evidencePath?: string;
};
```

## Evidence Artifact Contract
Pure parser output:

```ts
type IfcEvidence = {
  fileEvidence: FileEvidence;
  typeEvidence: TypeEvidence[];
  elementEvidence: ElementEvidence[];
  citedIfcEntities: CitedIfcEntity[];
  diagnostics: Diagnostic[];
};
```

The pure parser must not output:

```text
AssemblyCandidate
MissingDatapoint
ReadinessState
CalculationSnapshot
```

## IFC Paths To Inspect
Known primary IFC paths:

```text
IfcWall / IfcWallStandardCase / IfcSlab / IfcRoof / IfcCurtainWall / likely envelope IfcBuildingElementProxy
GlobalId
Name
ObjectType
PredefinedType where available

IfcRelAssociatesMaterial
RelatingMaterial

IfcMaterialLayerSetUsage
ForLayerSet
LayerSetDirection
DirectionSense
OffsetFromReferenceLine

IfcMaterialLayerSet
MaterialLayers
LayerSetName

IfcMaterialLayer
Material
LayerThickness
Name / Description where available

IfcMaterial
Name
Description / Category where available

IfcTypeObject / element type relationship
type GlobalId
type Name
type material associations

IfcUnitAssignment
length unit
SI prefix
conversion-based units
```

Official Milestone 1 relationship paths:

```text
type link = IfcRelDefinesByType
type psets = IfcTypeObject.HasPropertySets
occurrence/type materials = IfcRelAssociatesMaterial
occurrence psets/qsets = IfcRelDefinesByProperties
```

Messy-IFC evidence to inspect:

```text
IfcMaterialConstituentSet
IfcMaterialConstituent
IfcMaterialProfileSet
property sets
quantity sets
type-level properties
slab subtype/context evidence
```

Important distinction:

```text
calculation datapoints are fixed
IFC extraction paths are empirical
```

Extractor must prove exact paths against real files.

## Missing Datapoint Schema
Missing datapoints eventually drive review UI. Milestone 1 includes lightweight missing datapoints and light user guidance, but full `RequestedInput` planning is app UI scope.

```ts
type MissingDatapoint = {
  field:
    | "project.lengthUnit"
    | "assembly.layers"
    | "assembly.layerOrder"
    | "layer.materialName"
    | "layer.thickness"
    | "layer.lambda"
    | "assembly.surfaceResistanceProfile"
    | "assembly.slabClassification";

  severity:
    | "required_for_layered_calculation"
    | "required_for_estimate"
    | "required_for_precision"
    | "required_for_provenance"
    | "optional_for_report";

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

## Assembly Candidate JSON
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

## Normalized Calculation Object
Physics engine must not consume raw IFC directly.

It consumes normalized assembly/calculation data.

```ts
type PhysicsAssembly = {
  assemblyId: string;
  sourceElementIds: string[];
  elementClass: "IfcWall" | "IfcSlab" | "IfcRoof" | "IfcCurtainWall" | "IfcBuildingElementProxy";
  orderedLayers: PhysicsLayer[];
  rsi: number;
  rse: number;
  totalRValue: number | null;
  uValue: number | null;
  uValueRange?: { min: number; max: number };
  readinessState:
    | "ready"
    | "needs_review"
    | "estimated"
    | "blocked"
    | "superseded";
  calculationBasis:
    | "extracted_layered"
    | "user_completed_layered"
    | "estimated_from_non_layered"
    | "user_completed_estimate";
  confidence: "low" | "medium" | "high";
  assumptions: Assumption[];
  warnings: string[];
};
```

## Datapoint Source Model
```ts
type DatapointSource =
  | "ifc_extracted"
  | "material_library"
  | "system_estimate"
  | "user_input";
```

User-supplied datapoints are explicit inputs/overrides and never replace original IFC evidence.

Suggested datapoint:

```ts
type AssemblyDatapoint = {
  field: string;
  value: unknown;
  unit?: string;
  source: DatapointSource;
  confidence: "low" | "medium" | "high";
  evidencePath?: string;
  reason?: string;
  supersedesDatapointId?: string;
  createdAt: string;
};
```

Calculation precedence:

```text
user_input
> ifc_extracted
> material_library
> system_estimate
```

Report still shows provenance.

## Revision Model
Preserve full backend revisions and allow restore.

```ts
type AssemblyRevision = {
  id: string;
  assemblyId: string;
  revisionNumber: number;
  inputsSnapshotJson: string;
  calculationSnapshotJson: string;
  createdAt: string;
  createdBy: "system" | "user";
  reason: string;
};
```

Current assembly:

```ts
type Assembly = {
  id: string;
  activeRevisionId: string;
};
```

## Units
Extract IFC project units first.

Normalize all internal calculations to SI units.

Store raw and normalized values with provenance.

```ts
type NumericDatapoint = {
  rawValue: number;
  rawUnit: "mm" | "m" | "inch" | "ft" | "unknown";
  normalizedValue: number;
  normalizedUnit: "m";
  source: "ifc_extracted" | "user_input" | "system_default";
  evidencePath?: string;
};
```

If units are missing or uncertain, escalate to user. Do not silently assume.

## Surface Resistance Profiles
Use explicit selectable profiles defaulted by element class and shown in assumptions.

```ts
type SurfaceResistanceProfile = {
  key: string;
  label: string;
  appliesTo: "wall" | "roof" | "floor" | "generic";
  rsi: number;
  rse: number;
  unit: "m2K/W";
  source: string;
};
```

`IfcSlab` requires subtype/context classification before final calculation when uncertain.

## Material Override Scope
Material overrides are scoped by entity/assembly context.

Allowed scopes:

```ts
type MaterialOverrideScope =
  | "layer_occurrence"
  | "assembly_group"
  | "element_type";
```

Avoid default job-wide normalized material key.

## Review UI
UI is assembly-focused.

Flow:

```text
Upload IFC
-> assemblies list
-> click assembly needing review
-> see extracted evidence + missing/uncertain fields
-> enter only required datapoints
-> recalculate
-> report updates
```

The backend `MissingDatapoint` contract drives review UI. Milestone 1 includes light user guidance; later app UI adds full requested input planning.

Frontend renders:

- field.
- current value if any.
- source.
- confidence.
- why needed.
- unit.
- input control.
- scope choice where relevant.

## Report
Generate clean HTML report from structured calculation snapshot.

Report sections:

1. Project/file summary.
2. Assembly summary.
3. Layer table.
4. Material resolution table.
5. Calculation data subsection.
6. Assumptions and warnings.
7. Concise provenance.
8. Detailed evidence toggle.

Detailed provenance should be toggleable, not dumped on main view.

## Failure Modes
Whole job can fail for:

- file read error.
- parse error.
- internal error.
- output write error.

Assembly can be blocked for:

- no extractable assembly/layer evidence.
- missing layer thickness that user cannot infer in current UI.
- missing material names.
- invalid or missing units with no user confirmation.
- unsupported structure with no defensible estimate.

Assembly can be `needs_review` for:

- unresolved lambda.
- fuzzy material suggestion.
- uncertain unit.
- uncertain slab classification.
- uncertain surface resistance profile.
- user-fixable missing thickness.

Assembly can be `estimated` for:

- non-layered structure with enough evidence for broad assumptions.
- low-confidence calculation with U-value range.

## Dependencies
Need:

- real messy IFC sample: `C:\Users\moham\Downloads\1365-01_Barclay 4_ARCH_V23_akhouryHLD2Y.ifc`.
- Node IFC parser, likely `web-ifc`.
- local material library.
- SQLite.
- HTML report template.

## Out of Scope
V1 excludes:

- native Revit plugin.
- full messy-IFC universal support promise.
- condensation/diffusion/dynamic thermal physics.
- windows/doors/openings.
- thermal bridges.
- whole-building energy model.
- cloud scale infra.
- full auth.
