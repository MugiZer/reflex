# BIM-to-Physics Report Compiler - Context Navigation

## How to use this file
Read this file at the start of every session.
Follow the "Read when" instructions to load additional context.
Do not read all context files by default - only what is relevant.

## Always Read
- `context/domain.md` - core product vocabulary, calculation concepts, scope boundaries, and trust/provenance rules.
- `UBIQUITOUS_LANGUAGE.md` - canonical terms, aliases to avoid, relationships, and naming ambiguity warnings.

## Read When Relevant

### Domain and Architecture
### BIM-to-Physics Domain
**File:** `context/domain.md`
**Read when:** starting any work, discussing product behavior, or needing project terminology.
**Contains:** Core concepts for IFC evidence extraction, assemblies, datapoints, estimates, user inputs, revisions, reports, and non-goals.

### Technical Specifications
### Milestone 1 PRD
**File:** `context/prds/milestone-1-ifc-evidence-extractor.md`
**Read when:** planning, slicing, implementing, or reviewing Milestone 1 work.
**Contains:** Product requirements, user stories, implementation decisions, testing decisions, out-of-scope boundaries, and suggested PR split for the IFC evidence extractor CLI.

### Milestone 2 PRD
**File:** `context/prds/milestone-2-calculation-input-parser.md`
**Read when:** planning, slicing, implementing, or reviewing Milestone 2 parser work.
**Contains:** Product requirements, user stories, implementation decisions, testing decisions, and scope boundaries for the Calculation-Input Parser.

### Milestone 3 PRD
**File:** `context/prds/milestone-3-review-calculation-report-core.md`
**Read when:** planning, slicing, implementing, or reviewing Milestone 3 review, calculation, revision, or report core work.
**Contains:** Product requirements, user stories, implementation decisions, testing decisions, and scope boundaries for the non-UI Review + Calculation + Report Core.

### Milestone 4 PRD
**File:** `context/prds/milestone-4-thin-web-app-async-job-backend.md`
**Read when:** planning, slicing, implementing, or reviewing Milestone 4 web app, async job backend, storage, review UI, or localhost verifier work.
**Contains:** Product requirements, user stories, implementation decisions, testing decisions, and scope boundaries for the Thin Web App + Async Job Backend.

### Milestone 5 PRD
**File:** `context/prds/milestone-5-e2e-verifier-regression-harness.md`
**Read when:** planning, slicing, implementing, or reviewing Milestone 5 end-to-end verifier, browser smoke, synthetic fixtures, or regression harness work.
**Contains:** Product requirements, user stories, implementation decisions, testing decisions, and scope boundaries for the End-to-End Verifier + Regression Harness.

### Milestone 6 PRD
**File:** `context/prds/milestone-6-broader-datapoints-calculations-hardening.md`
**Read when:** planning, slicing, implementing, or reviewing Milestone 6 datapoint broadening, temperature profile, optional vapour/condensation light, heat storage basics, or product hardening work.
**Contains:** Product requirements, user stories, implementation decisions, testing decisions, and scope boundaries for Broader Datapoints + More Calculations + Product Hardening.

### Revit IFC Layer-Set Recovery PRD
**File:** `context/prds/revit-ifc-layer-set-recovery.md`
**Read when:** planning, slicing, implementing, or reviewing fallback recovery for IFC files that contain `IfcMaterialLayerSet` data but lack official `IfcRelAssociatesMaterial` links.
**Contains:** Product requirements, user stories, implementation decisions, testing decisions, and scope boundaries for exact Revit-style wall `ObjectType` to `IfcMaterialLayerSet.LayerSetName` recovery.

### IFC Evidence Extractor
**File:** `context/specs/ifc-evidence-extractor.md`
**Read when:** implementing or reviewing the IFC parser, evidence artifacts, relationship indexing, feature extractors, assembly candidates, missing datapoints, or readiness evaluation.
**Contains:** Locked Milestone 1 parser architecture, official IFC paths, relevant element rules, evidence types, grouping policy, artifact format, and diagnostics behavior.

### V1 System Design
**File:** `context/specs/v1-system-design.md`
**Read when:** implementing API, extractor, storage, review UI, calculation, reports, or verifier.
**Contains:** V1 architecture, module boundaries, API shape, storage model, extractor contract, missing datapoint schema, UI workflow, report requirements, and failure handling.

### Deep Module Architecture
**File:** `context/specs/module-architecture.md`
**Read when:** creating files, naming types, designing module interfaces, adding adapters, or writing tests.
**Contains:** Deep module map, dependency rules, canonical type names, naming rules, seams, adapters, and public interface test surfaces.

### Roadmap and Progress
### Build Roadmap
**File:** `context/roadmap.md`
**Read when:** choosing next milestone, planning implementation order, or checking current scope.
**Contains:** Build sequence, V1 demo bar, roadmap stages, acceptance criteria, and explicit non-goals.

### Milestone 6 Calculation Datapoints Research
**File:** `context/references/milestone-6-calculation-datapoints-research.md`
**Read when:** planning Milestone 6 calculation expansion, IFC datapoint extraction, material property aliases, or additional thermal/hygrothermal modules.
**Contains:** Researched IFC/material datapoints for temperature profile, vapour/condensation light, heat storage basics, extraction rules, and source links.

### Decisions
### V1 Design Decisions
**File:** `context/decisions/2026-06-01-v1-design-decisions.md`
**Read when:** revisiting why V1 uses Node/Express, async jobs, SQLite, local files, evidence-first extraction, conservative grouping, or clean HTML reports.
**Contains:** Decisions made in design discussion, rationale, alternatives considered, implications, and open questions.

### IFC Parser Architecture
**File:** `context/decisions/2026-06-05-ifc-parser-architecture.md`
**Read when:** revisiting parser seams, `IfcModelReader`, targeted relationship indexing, feature extractors, grouping policy, artifact versioning, or parser/domain separation.
**Contains:** Decisions from the IFC parser grilling session, rejected alternatives, rationale, implications, and remaining open questions.

### Local IFC Viewer Strategy
**File:** `context/decisions/2026-06-09-local-ifc-viewer-strategy.md`
**Read when:** revisiting IFC viewer packages, local viewer geometry extraction, Three.js rendering, That Open/xeokit alternatives, or viewer/domain separation.
**Contains:** Decision to use bounded server-side `web-ifc` geometry extraction plus an isolated browser Three.js viewer for the localhost prototype, with revisit triggers.

### Viewer, Report, and Workspace Scope
**File:** `context/decisions/2026-07-18-viewer-report-workspace-scope.md`
**Read when:** changing viewer payloads/caching, workspace orchestration, or report/UI boundaries.
**Contains:** The full-model viewer cache contract and the explicit reconciliation with the Conformity UI redesign.
