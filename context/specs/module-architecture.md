# Deep Module Architecture - Specification

## Purpose
Define codebase module architecture, seams, naming, and type vocabulary for a BIM-to-Physics Compiler that stays learnable, testable, and AI-navigable.

## Architecture Principle
The codebase should be a map of product concepts.

Use deep modules:

```text
small interface
large coherent behavior behind it
clear diagnostics
strong domain names
few caller obligations
```

Avoid shallow pass-through modules:

```text
utils/
helpers/
common/
misc/
processor.ts
manager.ts
service.ts with unclear domain
```

Use these architecture terms consistently:

- module.
- interface.
- implementation.
- depth.
- seam.
- adapter.
- leverage.
- locality.

## Top-Level Source Map
Target structure:

```text
src/
  app/
    http/
      routes/
      middleware/
      presenters/

  application/
    jobs/
    review/
    reports/

  domain/
    evidence/
      features/
    assemblies/
    materials/
    calculations/
    revisions/
    diagnostics/

  infrastructure/
    ifc/
      web-ifc/
    persistence/
      sqlite/
    storage/
      local-files/
    report-template/

  verifier/
    fixtures/
    flows/

scripts/
  ifc-inspect.ts
```

## Dependency Rule
Dependencies point inward:

```text
app/http
-> application
-> domain

infrastructure
-> domain
-> no app/application imports
```

Allowed:

- `application` imports domain interfaces and infrastructure adapters through explicit composition.
- `infrastructure` imports domain types it implements or persists.
- `domain` imports no app, Express, SQLite, filesystem, or `web-ifc`.

Forbidden:

- Express route imports `web-ifc`.
- report writer imports Express request/response.
- calculation module imports SQLite repository.
- material resolver mutates IFC evidence.
- extractor emits HTML.
- UI hardcodes missing-datapoint business rules that backend already knows.

## Deep Modules

### Job Intake Module
Home:

```text
src/application/jobs/
```

Interface:

```ts
type CreateJobCommand = {
  sourceFilePath: string;
  originalFilename: string;
};

type CreateJobResult = {
  jobId: JobId;
  jobStatus: JobStatus;
};
```

Responsibilities:

- create job.
- hash uploaded IFC.
- store file location.
- initialize job status.
- call job processing module.

Must not:

- parse IFC directly.
- calculate U-values.
- generate reports.

### Job Processing Module
Home:

```text
src/application/jobs/
```

Interface:

```ts
type ProcessIfcJobCommand = {
  jobId: JobId;
};

type ProcessIfcJobResult = {
  jobId: JobId;
  jobStatus: JobStatus;
  assemblyGroupIds: AssemblyGroupId[];
};
```

Responsibilities:

- orchestrate extraction.
- build assembly groups.
- run validation.
- run calculations or estimates.
- persist revisions.
- update job status.
- request report generation.

Must not:

- know `web-ifc` low-level calls.
- render UI.
- decide HTML layout.

### IFC Evidence Extractor Module
Home:

```text
src/domain/evidence/
src/infrastructure/ifc/web-ifc/
```

Seam:

```ts
interface IfcEvidenceExtractor {
  extract(command: ExtractIfcEvidenceCommand): Promise<ExtractIfcEvidenceResult>;
}
```

Command:

```ts
type ExtractIfcEvidenceCommand = {
  sourceFilePath: string;
};
```

Result:

```ts
type ExtractIfcEvidenceResult =
  | {
      ok: true;
      ifcEvidence: IfcEvidence;
      diagnostics: Diagnostic[];
    }
  | {
      ok: false;
      failureType: "file_read_error" | "parse_error" | "internal_error";
      message: string;
      diagnostics: Diagnostic[];
    };
```

Leverage:

- caller gets full evidence, paths checked, partial results, and diagnostics.
- caller does not know IFC traversal mechanics.

Adapter:

```text
WebIfcEvidenceExtractor
```

Must not:

- calculate U-values.
- resolve material lambda.
- group assemblies.
- ask user questions.
- write reports.

Internal parser architecture is specified in `context/specs/ifc-evidence-extractor.md`.

Extractor implementation must use:

```text
WebIfcEvidenceExtractor
-> WebIfcModelReader
-> buildIfcExtractionIndex
-> EvidenceFeatureExtractor[]
-> composeIfcEvidence
```

Raw `web-ifc` must appear only behind `WebIfcModelReader`.

### IfcModelReader Module
Home:

```text
src/domain/evidence/
src/infrastructure/ifc/web-ifc/
```

Interface:

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

Responsibilities:

- hide raw parser mechanics.
- provide typed low-level IFC access.
- preserve parser errors and missing values.

Must not:

- expose assembly/domain methods.
- decide readiness.
- detect missing datapoints.
- calculate.

### IFC Extraction Index Module
Home:

```text
src/domain/evidence/
```

Interface:

```ts
type BuildIfcExtractionIndexCommand = {
  reader: IfcModelReader;
  relevantElementStepIds: Set<StepId>;
};

type BuildIfcExtractionIndexResult = {
  extractionIndex: IfcExtractionIndex;
  diagnostics: Diagnostic[];
};
```

Responsibilities:

- scan official relationship paths once.
- store targeted links touching relevant elements and their type objects.
- keep feature extractors from rescanning whole IFC.

Must not:

- produce assembly candidates.
- detect missing datapoints.
- write artifacts.

### Evidence Feature Extractor Modules
Home:

```text
src/domain/evidence/features/
```

Interface:

```ts
type EvidenceFeatureExtractor<TFeatureEvidence> = {
  featureKey: string;
  extract: (context: EvidenceFeatureContext) => FeatureExtractionResult<TFeatureEvidence>;
};
```

Responsibilities:

- extract one kind of IFC evidence.
- return evidence records, diagnostics, and cited step IDs.
- use `IfcModelReader` and `IfcExtractionIndex`.

Must not:

- scan whole IFC independently.
- write files.
- decide readiness.

### Evidence Composer Module
Home:

```text
src/domain/evidence/
```

Responsibilities:

- merge feature results.
- dedupe cited step IDs.
- create final `IfcEvidence`.

### Evidence Normalizer Module
Home:

```text
src/domain/evidence/
```

Interface:

```ts
type NormalizeIfcEvidenceCommand = {
  ifcEvidence: IfcEvidence;
};

type NormalizeIfcEvidenceResult = {
  elementEvidence: ElementEvidence[];
  diagnostics: Diagnostic[];
};
```

Responsibilities:

- normalize IFC entity evidence into domain evidence records.
- preserve raw evidence paths.
- normalize IDs and names.
- preserve missing/ambiguous conditions.

Must not:

- decide grouping.
- calculate.
- mutate evidence.

### Assembly Candidate Builder Module
Home:

```text
src/domain/assemblies/
```

Interface:

```ts
type BuildAssemblyCandidatesCommand = {
  ifcEvidence: IfcEvidence;
};

type BuildAssemblyCandidatesResult = {
  assemblyCandidates: AssemblyCandidate[];
  diagnostics: Diagnostic[];
};
```

Responsibilities:

- create conservative assembly candidates.
- apply `AssemblyGroupingPolicy`.
- derive `AssemblyEvidenceSummary`.
- preserve grouping signatures and diagnostics.

Must not:

- resolve lambda.
- calculate U-values.
- use fuzzy material matching.
- detect missing datapoints.

### Assembly Grouping Policy Module
Home:

```text
src/domain/assemblies/
```

Interface:

```ts
interface AssemblyGroupingPolicy {
  getGroupingDecision(command: GetGroupingDecisionCommand): GroupingDecision;
}
```

Milestone 1 implementation:

```text
ConservativeAssemblyGroupingPolicy
```

Responsibilities:

- decide grouping key.
- decide grouping basis.
- decide grouping confidence.
- create versioned evidence signatures.
- enforce direct evidence precedence.

Must not:

- build generic scoring or plugin frameworks.
- inspect raw `web-ifc`.

### Missing Datapoint Detector Module
Home:

```text
src/domain/diagnostics/
```

Interface:

```ts
type DetectMissingDatapointsCommand = {
  assemblyCandidate: AssemblyCandidate;
};

type DetectMissingDatapointsResult = {
  missingDatapoints: MissingDatapoint[];
  diagnostics: Diagnostic[];
};
```

Responsibilities:

- identify exact missing fields.
- classify severity.
- decide `userFixable`.
- generate light user guidance for Milestone 1.
- include `evidenceChecked`.

Must not:

- render forms.
- persist user input.
- hide missing inputs inside warnings.

Milestone 1 uses lightweight missing datapoints and light user guidance. Full `RequestedInput` planning belongs to app UI later.

### Assembly Readiness Evaluator Module
Home:

```text
src/domain/assemblies/
```

Interface:

```ts
type EvaluateAssemblyReadinessCommand = {
  assemblyCandidate: AssemblyCandidate;
  missingDatapoints: MissingDatapoint[];
};

type EvaluateAssemblyReadinessResult = {
  readinessState: ReadinessState;
  confidence: Confidence;
  reasons: Diagnostic[];
};
```

Responsibilities:

- derive readiness from `AssemblyCandidate.evidenceSummary` and missing datapoints.
- avoid duplicate missing-field detection.

Must not:

- walk raw property sets to rediscover lambda.
- walk layers to rediscover missing thickness.
- inspect raw IFC evidence.

### Material Resolution Module
Home:

```text
src/domain/materials/
```

Interface:

```ts
type ResolveMaterialCommand = {
  rawMaterialName: string;
  elementClass: ElementClass;
  assemblyContext: AssemblyContext;
  materialLibrary: MaterialLibrary;
};

type ResolveMaterialResult =
  | {
      resolutionStatus: "auto_resolved";
      materialKey: NormalizedMaterialKey;
      lambda: LambdaValue;
      confidence: "high";
      diagnostics: Diagnostic[];
    }
  | {
      resolutionStatus: "suggested";
      suggestions: MaterialSuggestion[];
      confidence: "medium" | "low";
      diagnostics: Diagnostic[];
    }
  | {
      resolutionStatus: "unresolved";
      missingDatapoint: MissingDatapoint;
      diagnostics: Diagnostic[];
    };
```

Responsibilities:

- normalize raw material name.
- exact alias/key auto-resolution.
- fuzzy suggestion only.
- create missing datapoint for unresolved lambda.

Must not:

- globally apply material values across job.
- silently accept fuzzy match.
- mutate material library.

### User Input Module
Home:

```text
src/application/review/
src/domain/revisions/
```

Interface:

```ts
type ApplyUserInputCommand = {
  jobId: JobId;
  assemblyGroupId: AssemblyGroupId;
  missingDatapointId: MissingDatapointId;
  userInput: UserInput;
  overrideScope: OverrideScope;
};

type ApplyUserInputResult = {
  revisionId: RevisionId;
  readinessState: ReadinessState;
};
```

Responsibilities:

- validate user input against requested input.
- create scoped override.
- create revision.
- trigger recalculation.

Must not:

- edit IFC evidence.
- silently apply to job-wide material key.

### Calculation Module
Home:

```text
src/domain/calculations/
```

Interface:

```ts
type CalculateThermalPerformanceCommand = {
  physicsAssembly: PhysicsAssembly;
};

type CalculateThermalPerformanceResult = {
  calculationSnapshot: CalculationSnapshot;
  diagnostics: Diagnostic[];
};
```

Responsibilities:

- calculate layer R-values.
- calculate total R-value.
- calculate U-value or U-value range.
- set calculation basis and confidence.
- preserve assumptions and warnings.

Must not:

- parse IFC.
- resolve material names.
- read DB.
- generate HTML.

### Revision Module
Home:

```text
src/domain/revisions/
```

Interface:

```ts
type CreateRevisionCommand = {
  assemblyGroupId: AssemblyGroupId;
  reason: RevisionReason;
  createdBy: RevisionActor;
  calculationSnapshot: CalculationSnapshot;
};

type CreateRevisionResult = {
  revision: Revision;
};
```

Responsibilities:

- create immutable revision.
- set active revision.
- support restore.

Must not:

- recalculate by itself.
- alter old revisions.

### Report Generation Module
Home:

```text
src/application/reports/
src/infrastructure/report-template/
```

Interface:

```ts
type GenerateHtmlReportCommand = {
  jobId: JobId;
  activeCalculationSnapshots: CalculationSnapshot[];
};

type GenerateHtmlReportResult = {
  reportFilePath: string;
};
```

Responsibilities:

- render clean HTML report.
- include calculation data subsection.
- include provenance toggles.
- include assumptions and warnings.

Must not:

- calculate.
- infer missing datapoints.
- parse IFC.

### Verifier Module
Home:

```text
src/verifier/
```

Interface:

```ts
type RunVerifierCommand = {
  fixtureIfcPath: string;
};

type RunVerifierResult = {
  passed: boolean;
  diagnostics: Diagnostic[];
  artifactPaths: string[];
};
```

Responsibilities:

- run upload/extract/review/revision/report flow.
- use real or fixed fixtures.
- prove public behavior.

Must not:

- become only unit tests for internals.

## Canonical Type Names
Use these exact names in TypeScript.

Identifiers:

```ts
type JobId = string;
type SourceElementId = string;
type StepId = number;
type AssemblyGroupId = string;
type RevisionId = string;
type MissingDatapointId = string;
type NormalizedMaterialKey = string;
```

Enums/unions:

```ts
type ElementClass =
  | "IfcWall"
  | "IfcSlab"
  | "IfcRoof"
  | "IfcCurtainWall"
  | "IfcBuildingElementProxy";

type JobStatus =
  | "queued"
  | "processing"
  | "needs_review"
  | "completed"
  | "failed";

type ReadinessState =
  | "ready"
  | "needs_review"
  | "estimated"
  | "blocked"
  | "superseded";

type Confidence = "low" | "medium" | "high";

type DatapointSource =
  | "ifc_extracted"
  | "material_library"
  | "system_estimate"
  | "user_input";

type OverrideScope =
  | "layer_occurrence"
  | "assembly_group"
  | "element_type";
```

Use `jobStatus`, not `status`, for jobs.
Use `readinessState`, not `status`, for assemblies/calculations.
Use `confidence`, not `certainty`.
Use `diagnostics`, not `logs`, for domain-visible extraction/calculation notes.

## Canonical File Names
Use domain names in files.

Preferred:

```text
extractIfcEvidence.ts
buildAssemblyCandidates.ts
detectMissingDatapoints.ts
resolveMaterial.ts
calculateThermalPerformance.ts
createRevision.ts
applyUserInput.ts
generateHtmlReport.ts
```

Avoid:

```text
utils.ts
helpers.ts
processor.ts
manager.ts
service.ts
data.ts
types.ts as dumping ground
```

If shared types are needed, group by domain:

```text
domain/evidence/evidenceTypes.ts
domain/assemblies/assemblyTypes.ts
domain/calculations/calculationTypes.ts
```

## Public Interface Test Surface
Test deep module interfaces, not internal helper fragments.

Required test targets:

- `IfcEvidenceExtractor.extract`.
- `IfcModelReader`.
- `buildIfcExtractionIndex`.
- evidence feature extractors.
- `buildAssemblyCandidates`.
- `detectMissingDatapoints`.
- `evaluateAssemblyReadiness`.
- `resolveMaterial`.
- `calculateThermalPerformance`.
- `applyUserInput`.
- `generateHtmlReport`.
- verifier flow.

Each test should assert:

- outputs.
- diagnostics.
- provenance.
- missing datapoints.
- no mutation of IFC evidence.
- state transitions.

## Agent Navigation Rules
When implementing:

1. Read `CONTEXT.md`.
2. Read `context/domain.md`.
3. Read this file before creating modules.
4. Add new terms to `UBIQUITOUS_LANGUAGE.md` before adding vague names.
5. Keep each module's public interface small.
6. Put messy library details behind adapters.
7. Preserve domain vocabulary in variable/type/file names.

## Out of Scope
This spec does not finalize:

- exact SQLite schema.
- exact `web-ifc` API calls.
- exact HTML visual design.
- exact material library seed contents.
