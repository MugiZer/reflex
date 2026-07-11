# PR Ledger: BIM-to-Physics Report Compiler

Last updated: 2026-06-08 after Milestone 3 core implementation

## Manager Stance

Milestone 1 and Milestone 1.1 are treated as complete. Milestone 2 is the next execution target.

## Problem Statement

Milestone 1 must prove the BIM-to-Physics Compiler can read a real IFC file, extract trustworthy calculation-relevant IFC Evidence, preserve provenance, derive conservative Assembly Candidates and Missing Datapoints, and produce machine-readable artifacts plus architect-facing diagnostics without mutating IFC evidence or calculating U-values.

## Current Baseline

- `npm run ifc:inspect -- "<ifc path>"` exists as a smoke CLI.
- `WebIfcModelReader` exists behind the `IfcModelReader` interface.
- Relevant element discovery exists in static config.
- `buildIfcExtractionIndex` indexes the required relationship paths.
- Tests cover smoke output, relevant element discovery, and extraction index behavior.
- `WebIfcEvidenceExtractor` now returns pure `IfcEvidence` for file, element identity, type evidence, material/layer/property/quantity evidence, candidate property evidence, numeric evidence, cited entities, skipped-scope summaries, and diagnostics.
- Real Barclay CLI smoke/evidence run succeeded on 2026-06-06: 544 relevant elements, 0 type evidence records.
- Added diagnostic-only IFC evidence extraction risk probe for Barclay-style files where type/material entity families exist but official `IfcRelDefinesByType` / `IfcRelAssociatesMaterial` paths are absent. This emits warnings only; it does not infer fallback links.
- CLI now writes canonical partial evidence artifacts under `outputs/{fileHash}/evidence/`.
- Real Barclay artifact run succeeded on 2026-06-07 and wrote `manifest.json`, `file.json`, `elements.json`, `cited-ifc-entities.json`, and `diagnostics.json`.
- Relationship-gap diagnostics are preserved in `diagnostics.json`.
- Follow-up fixes applied after architecture/diagnosis review:
  - `WebIfcModelReader` no longer serializes numeric measures as fake STEP references.
  - `type-evidence.json` is written as part of partial evidence artifacts.
  - partial manifests mark grouping, missing-datapoint, and readiness rules as `not-produced.partial-evidence-only`.
- `buildAssemblyCandidates` and `ConservativeAssemblyGroupingPolicy` now produce deterministic conservative Assembly Candidates.
- Real Barclay artifact run succeeded on 2026-06-07 and wrote `assembly-candidates.json` with 544 single-element candidates because official type/material links are absent.
- `MissingDatapointDetector` and `AssemblyReadinessEvaluator` produce structured missing datapoints and readiness diagnostics.
- Artifact writing now emits `missing-datapoints.json`, `readiness-diagnostics.json`, and `artifactCompleteness: "complete_milestone_1"` when Assembly Candidates are provided.
- `diagnostics.md` is generated from structured artifacts and written under `outputs/{fileHash}/diagnostics.md`.
- `verify:milestone-1` runs the full IFC inspect flow against a provided private IFC path and checks the final artifact contract.

## Issue Graph

| Issue | Slice | State | Blocked By | AFK/HITL | Notes |
| --- | --- | --- | --- | --- | --- |
| 001 | Scaffold IFC smoke CLI | Complete | None | AFK | Completed before this manager pass. |
| 002 | Promote smoke boundary into `IfcModelReader` and `IfcExtractionIndex` | Complete | 001 | AFK | Completed before this manager pass. |
| 003 | Extract element and type evidence | Complete | 002 | AFK | Implemented with pure `IfcEvidence`, element identity, type evidence, provenance, and cited entities. |
| 004 | Extract material, layer, property, and quantity evidence | Complete | 003 | AFK | Implemented with material structures, layered/non-layered evidence, psets/qsets, candidate properties, numeric evidence, and conservative unit handling. |
| 005 | Write canonical evidence artifact contract | Complete | 004 | AFK | Implemented deterministic partial evidence artifacts and CLI wiring. |
| 006 | Build conservative assembly candidates | Complete | 005 | AFK | Implemented deterministic conservative candidates, grouping policy, signatures, summaries, and artifact writing. |
| 007 | Detect missing datapoints and readiness | Complete | 006 | AFK | Implemented ordered missing-datapoint rules, readiness evaluator, artifact writer integration, and full Milestone 1 manifest completeness. |
| 008 | Generate architect-facing diagnostics markdown | Complete | 007 | AFK | Implemented report generator, file writer, CLI integration, and report test. |
| 009 | Milestone 1 end-to-end verifier | Complete | 008 | AFK | Implemented verifier module, CLI script, package script, tests, and successful Barclay run. |

## Milestone 1.1 Issue Graph

| Issue | Slice | State | Blocked By | AFK/HITL | Notes |
| --- | --- | --- | --- | --- | --- |
| 1.1-001 | Evidence absence creates Missing Datapoints | Complete | None | AFK | Added absence fields and detector rules. |
| 1.1-002 | Readiness states distinguish blocked, review, and estimated | Complete | 1.1-001 | AFK | No-basis candidates now block through Missing Datapoints. |
| 1.1-003 | Diagnostics markdown highlights critical BIM evidence gaps | Complete | 1.1-001, 1.1-002 | AFK | Added critical gaps section and capped repeated details. |
| 1.1-004 | Refactor material/property extractor behind same behavior | Complete | 1.1-001, 1.1-002, 1.1-003 | AFK | Extracted numeric normalization, candidate classification, pset/qset extraction, and layered material extraction. |

## Next Milestone Graph

| Milestone | Slice | State | Blocked By | AFK/HITL | Notes |
| --- | --- | --- | --- | --- | --- |
| 2 | Calculation-Input Parser | Ready to plan into issues | Milestone 1.1 | Mostly AFK after issue split | More IFC evidence paths plus `EffectiveElementEvidence` and `CalculationInputEvidence`; parser says fixed/candidate/missing inputs. |
| 3 | Review + Calculation + Report Core | PRD written, ready to slice | Milestone 2 | Mostly AFK after issue split | Assembly groups, questions, overrides, revisions, U/R calc, ranges, assumptions, standalone HTML report. |
| 4 | Thin Web App + Async Job Backend | PRD written, pending Milestone 3 completion | Milestone 3 | Mostly AFK after issue split | Upload, job API, SQLite/local files, review assemblies, enter values, open report. |
| 5 | End-to-End Verifier + Regression Harness | PRD written, pending Milestone 4 | Milestones 2-4 | AFK after issue split | Full upload -> extract -> review -> override -> recalc -> report verifier plus synthetic parser edge cases. |
| 6 | Broader Datapoints + More Calculations + Product Hardening | PRD written, pending Milestone 5 gate | Milestone 5 | Mixed after issue split | Temperature profile, optional vapour/condensation light, optional heat storage basics, datapoint aliases, UI states, no auth/deploy/PDF unless trivial. |

## Unblocked Remaining Issues

Milestone 3 needs conversion into small vertical implementation issues before implementation.

## Parallelization Assessment

No implementation workers should run in parallel for the current Milestone 2 wave.

Safe parallel work available now:

- None.

Unsafe parallel work now:

- None active.

## Shared Interfaces That Make Parallelization Risky

- `IfcEvidence`, `ElementEvidence`, `TypeEvidence`, `CitedIfcEntity`, `Diagnostic`, and `EvidenceReference`.
- `EvidenceFeatureExtractor` and `FeatureExtractionResult`.
- `WebIfcEvidenceExtractor.extract`.
- `composeIfcEvidence`.
- `IfcModelReader` reader methods if later artifact or assembly work exposes missing source metadata needs.
- CLI orchestration in `scripts/ifc-inspect.ts`.
- `MissingDatapointField`, `MissingDatapointSeverity`, `AssemblyReadinessEvaluator`, and diagnostics review model are active.

## Recommended Next PR Scope

Milestone 3 Review + Calculation + Report Core, after issue slicing and triage.

PR acceptance boundary:

- Core workflow runs without web UI.
- Requested Inputs are generated for missing calculation-critical datapoints.
- Scripted User Inputs create scoped Overrides.
- Revisions are written as local JSON and preserve prior state.
- Layered assemblies calculate U/R values when inputs are complete.
- Low-confidence cases produce ranges, not false single values.
- Standalone HTML report shows summary, calculation data, inputs, assumptions, warnings, provenance, evidence toggle, and revision id.
- Existing Milestone 1/1.1/Milestone 2 verifier behavior stays green.

## Milestone 2 Issue Graph

| Issue | Slice | State | Blocked By | AFK/HITL | Notes |
| --- | --- | --- | --- | --- | --- |
| 2-001 | Effective Element Evidence | Complete | None | AFK | Added occurrence/type precedence and conflict diagnostics. |
| 2-002 | Calculation Input Evidence | Complete | 2-001 | AFK | Added fixed/candidate/missing parser input basis. |
| 2-003 | Calculation Input Artifact and Verifier Integration | Complete | 2-001, 2-002 | AFK | Added additive calculation-input artifact and verifier check. |
| 2-004 | Architecture Review and Refactor Plan | Complete | 2-003 | AFK | Recorded one small boundary refactor plan. |

## Execution Mode

- chosen mode: single-agent
- reason: core parser-domain contracts shared files; parallel work would add coordination cost.
- current PR scope: complete.

## Milestone 3 PRD

- PRD file: `context/prds/milestone-3-review-calculation-report-core.md`.
- Converted into local issues under `context/issues/milestone-3`.
- Issues were triaged locally as `enhancement` + `ready-for-agent`.
- Current implementation proves the first non-UI core loop with synthetic layered calculation input evidence and scripted review input.
- Demo command: `npm run demo:core -- "<ifc path>"`.

## Milestone 4 PRD

- PRD file: `context/prds/milestone-4-thin-web-app-async-job-backend.md`.
- Scope: localhost thin web app, real async Job API boundary, in-process worker, SQLite metadata, local file artifacts, assembly-focused Review page, prebuilt HTML Report serving.
- Next step later: convert PRD into vertical issues after Milestone 3 core workflow is complete enough to wrap.

## Milestone 5 PRD

- PRD file: `context/prds/milestone-5-e2e-verifier-regression-harness.md`.
- Scope: `verify:e2e`, optional private IFC verifier, API e2e, browser smoke, synthetic fixtures, domain/API regression harness, machine-readable verifier artifacts.
- Gate: no Milestone 6 broadening unless `verify:e2e` passes.

## Milestone 6 PRD

- PRD file: `context/prds/milestone-6-broader-datapoints-calculations-hardening.md`.
- Scope: temperature profile first, optional vapour/condensation light, optional heat storage basics, broader material/property datapoints, Calculation Datapoint Registry, UI state hardening.
- Non-goals: new top-level element classes, windows/doors/openings, thermal bridges, deployment, auth, PDF unless trivial.

## Demo Readiness Refactor

- Refactor plan file: `context/issues/refactor/review-context-ifc-visualizer-integration.md`.
- Problem: Review UI exposes machine ids (`ag_element_40`) and implementation scopes (`layer_occurrence`, `assembly_group`, `element_type`) instead of architect-facing context.
- Direction: add `ReviewContextViewModel`, replace raw labels with human labels, then integrate an optional IFC viewer adapter using That Open Components first and xeokit as fallback.
- Rule: viewer logic stays in app/frontend adapter; domain and application review logic expose STEP ids/context only.

## Milestone 2 Verification

- `npm test`: passed, 11 files and 40 tests.
- `npm run typecheck`: passed.
- `npm run verify:milestone-1 -- "C:\Users\moham\Downloads\1365-01_Barclay 4_ARCH_V23_akhouryHLD2Y.ifc"`: passed.
- Barclay calculation-input artifact: 544 records, all `blocked_missing_evidence`.

## Milestone 2 Architecture Review

- Effective Element Evidence is a deep module: one input (`IfcEvidence`), one output, precedence and conflict behavior local.
- Calculation Input Evidence is a deep module: one input (`EffectiveElementEvidence[]`), one output, fixed/candidate/missing basis local.
- Assembly Candidate Builder now consumes Effective Element Evidence instead of rediscovering occurrence/type precedence.
- No raw `web-ifc`, Express, SQLite, filesystem, or report rendering leaked into domain modules.
- Refactor plan recorded: `context/issues/refactor/milestone-2-artifact-type-boundary.md`.

## Verifier Brief

Latest known verification complete: `npm test`, `npm run typecheck`, and `npm run verify:milestone-1 -- "C:\Users\moham\Downloads\1365-01_Barclay 4_ARCH_V23_akhouryHLD2Y.ifc"` all pass.

## HITL Gates

No user decision is required for roadmap direction.

## Milestone 3 Issue Graph

| Issue | Slice | State | Blocked By | AFK/HITL | Notes |
| --- | --- | --- | --- | --- | --- |
| 3-001 | Core Review Calculation Report Spine | Complete | None | AFK | Requested Inputs, scripted User Inputs, scoped Overrides, Calculation Snapshot, Revision, and HTML Report implemented. |
| 3-002 | Material Resolution and Precedence | Complete | 3-001 | AFK | User input > fixed IFC lambda > exact Material Library alias; unresolved remains requested input. |
| 3-003 | Revision Persistence and Active Index | Complete | 3-001 | AFK | Local JSON revision and active index written under `outputs/{fileHash}/revisions`. |
| 3-004 | Core Demo Command | Complete | 3-001, 3-003 | AFK | `demo:core` writes one revision and report using scripted review input fixture. |

## Milestone 3 Verification

- `npm test`: passed, 12 files and 44 tests.
- `npm run typecheck`: passed.
- `npm run demo:core -- "synthetic.ifc"`: passed, wrote one revision and one HTML report under ignored `outputs/`.

## Milestone 3 Architecture Review

- Requested Input planning, Material Resolution, Physics Assembly construction, Thermal Calculation, Revision creation, local Revision persistence, and HTML Report generation are separate modules with small interfaces.
- Domain modules do not import filesystem, HTML rendering, Express, SQLite, or `web-ifc`.
- The app Review workflow composes modules and adapters but no longer owns Physics Assembly construction.
- Refactor plan recorded: `context/issues/refactor/milestone-3-core-workflow-boundary.md`.

## State-Machine Audit

- current stage: architecture review complete.
- artifact that proves it: `STATE-MACHINE.md`, `context/issues/milestone-3/*.md`, tests, `PR-LEDGER.md`.
- next allowed action: broaden demo from synthetic fixture to parser-artifact input when real calculable layered evidence exists.
- human decision needed: none.

Manager gate before implementing Milestone 2:

- Passed. Milestone 2 issues exist under `context/issues/milestone-2`.

## First Worker Wave

Wave 9:

- Current agent: implement Milestone 2 issues serially.

## Milestone 4 Issue Graph

| Issue | Slice | State | Blocked By | AFK/HITL | Notes |
| --- | --- | --- | --- | --- | --- |
| 4-001 | Job API and Async Worker | Complete | None | AFK | `POST /api/jobs`, persisted Job metadata, Job-scoped upload storage, in-process worker, status transitions. |
| 4-002 | Review Input and Report API | Complete | 4-001 | AFK | `GET /api/jobs/:id`, `POST /review-inputs`, prebuilt report route, input validation. |
| 4-003 | Thin Localhost UI | Complete | 4-001, 4-002 | AFK | Upload, recent Jobs, Job page, Review page, Report link. |
| 4-004 | Localhost Verifier and Architecture Review | Complete | 4-001, 4-002, 4-003 | AFK | Verifier proves upload -> Review -> input -> Revision -> Report. |

## Milestone 4 Verification

- `npm test`: passed, 13 files and 46 tests.
- `npm run typecheck`: passed.
- `npm run verify:milestone-4`: passed, created a localhost Job, submitted Review input, and served generated report HTML.

## Milestone 4 Architecture Review

- Job lifecycle is split across application modules, local file storage, SQLite Job Repository, and thin HTTP composition.
- HTTP module was refactored after review so multipart parsing, Review input validation/submission, and UI shell rendering do not sit in one large file.
- Domain modules still do not import HTTP, filesystem storage, SQLite, or raw `web-ifc`.
- Report route serves existing report HTML only; calculation remains in the Review/Core workflow.
- Current prototype uses `node:sqlite`, which emits an experimental warning under Node 24. This is tracked as a refactor plan rather than solved with native dependencies now.
- Refactor plan recorded: `context/issues/refactor/milestone-4-sqlite-adapter-stability.md`.

## Milestone 4 State-Machine Audit

- current stage: done.
- artifacts that prove it: `context/issues/milestone-4/*.md`, `tests/milestone4JobApi.test.ts`, `scripts/verify-milestone-4.ts`, `PR-LEDGER.md`.
- execution mode: single-agent serial implementation because Job API, storage, worker, and UI shared one unstable contract.
- human decision needed: none.

## Milestone 5 Issue Graph

| Issue | Slice | State | Blocked By | AFK/HITL | Notes |
| --- | --- | --- | --- | --- | --- |
| 5-001 | E2E API Verifier and Artifacts | Complete | None | AFK | `verify:e2e` starts localhost app, uploads synthetic IFC, submits Review input, fetches Report, writes summary artifacts. |
| 5-002 | Optional Private IFC Local Verifier | Complete | 5-001 | AFK | `verify:e2e:local -- "<private ifc path>"` reuses same verifier module. |
| 5-003 | Browser Smoke Verifier | Complete | 5-001 | AFK | Browser Smoke adapter owns HTTP DOM fallback and summary mode; Playwright can replace later without changing verifier API. |
| 5-004 | Domain Regression Harness | Complete | None | AFK | Trust regressions cover candidate-vs-fixed evidence, SI thickness, blocked assemblies, low-confidence ranges, and range report rendering. |
| 5-005 | Architecture Review and Refactor Plan | Complete | 5-001, 5-002, 5-003, 5-004 | AFK | Browser Smoke adapter refactor plan implemented. |

## Milestone 5 Execution Mode

- chosen mode: single-agent.
- reason: verifier command, artifact contract, package scripts, and regression expectations share one contract; parallel workers would race on same module.
- current PR scope: complete.

## Milestone 5 Verification

- `npm test`: passed, 15 files and 54 tests.
- `npm run typecheck`: passed.
- `npm run verify:e2e`: passed, created a localhost Job, submitted Review input, served generated report HTML, and wrote verifier artifacts under `outputs/verifier/run_20260608231126`.

## Milestone 5 Architecture Review

- Verifier is a dedicated module under `src/verifier` with one public interface: `runE2eVerifier`.
- API verifier starts the app through the public localhost app module and does not import domain calculation internals.
- Domain calculation change is narrow: low-confidence results now produce a U-value range instead of a false precise U-value.
- Report renderer now displays U-value ranges instead of showing low-confidence estimated snapshots as blocked.
- Browser smoke fallback is intentionally lightweight and now lives behind a Browser Smoke adapter.
- Verifier summary JSON records `browserSmoke.mode`.
- Refactor plan implemented: `context/issues/refactor/milestone-5-browser-smoke-adapter.md`.

## Milestone 5 State-Machine Audit

- current stage: done.
- artifacts that prove it: `context/issues/milestone-5/*.md`, `src/verifier/e2eVerifier.ts`, `tests/milestone5*.test.ts`, `scripts/verify-e2e*.ts`, `PR-LEDGER.md`.
- execution mode: single-agent serial implementation because verifier/artifact/browser-regression slices share one public contract.
- human decision needed: none.

## Milestone 6 Issue Graph

| Issue | Slice | State | Blocked By | AFK/HITL | Notes |
| --- | --- | --- | --- | --- | --- |
| 6-001 | Calculation Datapoint Registry and Temperature Profile | Complete | None | AFK | Added registry, temperature profile points, assumptions, and report section. |
| 6-002 | Broaden Material Datapoint Candidates | Complete | 6-001 | AFK | Candidate aliases now come from registry and remain candidate evidence. |
| 6-003 | Product State Hardening | Complete | 6-001 | AFK | Localhost UI now exposes empty, failed, review-needed, and report-ready states. |
| 6-004 | Architecture Review and Refactor Plan | Complete | 6-001, 6-002, 6-003 | AFK | Review found registry in the wrong module direction; fixed by moving registry to `domain/datapoints`. No residual refactor plan needed. |

## Milestone 6 Execution Mode

- chosen mode: single-agent.
- reason: registry, candidate extraction, calculation snapshot shape, report rendering, and verifier expectations share one evolving contract; parallel work would race on module interfaces.
- current PR scope: complete.

## Milestone 6 Verification

- `npm test`: passed, 16 files and 57 tests.
- `npm run typecheck`: passed.
- `npm run verify:e2e`: passed, created localhost Job `job_204604c59b744634`, submitted Review input, created revision `rev_20260608233413`, generated report artifact under `outputs/verifier/run_20260608233413`.

## Milestone 6 Architecture Review

- Calculation Datapoint Registry now lives in `src/domain/datapoints`, a shared domain vocabulary module used by evidence candidate classification without importing calculation implementation.
- Temperature profile stays behind the existing thermal calculation interface and extends `CalculationSnapshot`; report rendering consumes snapshot data only.
- Candidate property broadening remains conservative: new aliases become `CandidatePropertyEvidence`, not fixed `CalculationInput`.
- UI hardening stays inside the thin localhost shell; no browser localStorage, auth, deployment, PDF, or framework surface was added.
- Refactor-plan check: one problem was found and fixed inline; no open refactor issue is needed.

## Milestone 6 State-Machine Audit

- current stage: done.
- artifacts that prove it: `context/issues/milestone-6/*.md`, `src/domain/datapoints/calculationDatapointRegistry.ts`, `src/domain/calculations/calculateThermalPerformance.ts`, `tests/milestone6ProductHardening.test.ts`, `PR-LEDGER.md`.
- execution mode: single-agent serial implementation.
- human decision needed: none.

## Refactor Implementation - Milestone 4 SQLite Adapter Stability

- status: complete.
- plan: `context/issues/refactor/milestone-4-sqlite-adapter-stability.md`.
- change: added `JobRepository` and `ClosableJobRepository` domain interfaces, made `SqliteJobRepository` implement them, and removed concrete SQLite adapter imports from Job application modules.
- verification: added `tests/sqliteJobRepository.test.ts` repository contract tests for create, update, list, Review state, report metadata, and missing Job update failure.
- commands: `npm test` passed 17 files and 59 tests; `npm run typecheck` passed; `npm run verify:e2e` passed with verifier artifacts under `outputs/verifier/run_20260608234520`.
- architecture result: application Job modules now depend on a repository interface; SQLite remains isolated to app composition and infrastructure adapter.

## Refactor Implementation - Review Context ViewModel

- status: complete for the first Review Context slice.
- plan: `context/issues/refactor/review-context-ifc-visualizer-integration.md`.
- change: added `ReviewContextViewModel` in `src/application/review`, exposed it as `review.context` from `GET /api/jobs/:id`, and updated the localhost Review UI to render architect-facing group labels, scope option labels, evidence context, highlight STEP ids, and muted technical ids.
- compatibility: `review.requestedInputs` remains present in `GET /api/jobs/:id`, and `POST /api/jobs/:id/review-inputs` still submits raw `requestedInputId`, `assemblyGroupId`, unit, value, and override scope.
- verification: added `tests/reviewContextViewModel.test.ts` plus API/UI assertions in `tests/milestone4JobApi.test.ts`.
- commands: `npm test` passed 18 files and 61 tests; `npm run typecheck` passed; `npm run verify:e2e` passed with verifier artifacts under `outputs/verifier/run_20260609000405`.
- architecture result: domain review types remain unchanged; display-only labels live in application review; HTTP/UI consume the presenter; no That Open, xeokit, Three.js, browser, or viewer types were introduced into domain modules.

## Refactor Implementation - Local IFC Viewer

- status: complete for a bounded local viewer slice.
- plan: `context/issues/refactor/review-context-ifc-visualizer-integration.md`.
- change: added job-scoped IFC serving at `/api/jobs/:id/ifc`, job-scoped viewer geometry at `/api/jobs/:id/viewer-geometry`, an isolated browser viewer adapter, and an IFC Viewer panel on Job and Review pages.
- implementation note: browser-side That Open CDN loading failed in Web-IFC WASM initialization, so the app now extracts bounded mesh JSON server-side with the existing Node `web-ifc` dependency and renders it in the browser with Three.js. This keeps domain modules free of viewer and Three.js types.
- performance note: full Barclay IFC conversion was too slow for page load, so the endpoint streams active review STEP ids first and falls back to the first 80 displayable building elements when the review target is not display geometry.
- verification: `npm test` passed 18 files and 62 tests; `npm run typecheck` passed; `npm run verify:e2e` passed with verifier artifacts under `outputs/verifier/run_20260609003649`; local Barclay job page rendered a WebGL canvas and screenshot was saved at `outputs/viewer-smoke-job_3c83f3545db34c4a.png`.

## Refactor Implementation - Viewer Architecture Deepening

- status: complete.
- architecture review: `C:\Users\moham\AppData\Local\Temp\architecture-review-20260608-204233.html`.
- change: moved raw viewer geometry extraction from `app/http` to `WebIfcViewerGeometryExtractor` under `src/infrastructure/ifc/web-ifc`, split the browser app shell into `/assets/app-shell.js`, added a local viewer geometry cache under the Job output tree, separated Review evidence target STEP ids from display STEP ids, and recorded `context/decisions/2026-06-09-local-ifc-viewer-strategy.md`.
- architecture result: `app/http` now composes route behavior and assets; raw `web-ifc` stays in infrastructure; browser Three.js stays in an isolated app asset; `ReviewContextViewModel` now exposes `reviewTargetStepIds`, `displayStepIds`, and `highlightMode` while preserving `highlightStepIds` compatibility.
- verification: `npm test` passed 19 files and 63 tests; `npm run typecheck` passed; `npm run verify:e2e` passed with verifier artifacts under `outputs/verifier/run_20260609005453`.

## Conformity UI Redesign Issue Graph

| Issue | Slice | State | Blocked By | AFK/HITL | Notes |
| --- | --- | --- | --- | --- | --- |
| conformity-ui-001 | Localhost UI shell and copy | Complete | None | AFK | Implements `context/prds/conformity-ui-redesign.md` as a no-framework UI/copy slice. |

## Conformity UI Redesign Execution Mode

- chosen mode: single-agent.
- reason: one ready PRD slice edits shared shell/client/test files; worker coordination would cost more than implementation.
- current PR scope: Conformity branding, analysis-language copy, cleaner shell styling, existing verifier preservation.

## Conformity UI Redesign Verification

- `npm test`: passed, 19 files and 63 tests.
- `npm run typecheck`: passed.
- `npm run verify:e2e`: passed, created localhost Job `job_782776d6b7bd47ea`, submitted Review input `ri_40_layer_lambda_0`, created revision `rev_20260609025925`, wrote verifier artifacts under `outputs/verifier/run_20260609025924`.
- Browser check: local server on port `4184`; home page showed Conformity, Local thermal review workspace, Start analysis, Recent analyses; Review page showed Resolve missing inputs, Save inputs, IFC Viewer, and no Submit Review copy.
- Browser layout metrics: no horizontal overflow on home or Review page; action controls reported no text overflow.
- Note: in-app screenshot capture timed out twice; DOM snapshot and layout metrics were used for the visual sanity check.

## Conformity UI Redesign Architecture Review

- Backend Job resource pattern remains unchanged.
- Review Context remains the deep module for architect-facing Review labels.
- UI/copy changes stay in the thin localhost shell and client asset.
- No frontend framework, bundler, client-side state storage, auth, deployment, PDF, or viewer internals added.

## Conformity UI Redesign State-Machine Audit

- current stage: done.
- artifacts that prove it: `context/prds/conformity-ui-redesign.md`, `context/issues/conformity-ui-redesign/001-conformity-localhost-ui-redesign.md`, `src/app/http/renderAppShell.ts`, `src/app/http/frontend/appShellClient.ts`, `tests/milestone4JobApi.test.ts`, `tests/milestone6ProductHardening.test.ts`, `PR-LEDGER.md`.
- execution mode: single-agent serial implementation.
- human decision needed: none.

## Revit IFC Layer-Set Recovery Issue Graph

| Issue | Slice | State | Blocked By | AFK/HITL | Notes |
| --- | --- | --- | --- | --- | --- |
| revit-layer-recovery-001 | Recover Layer Stacks By Exact Layer-Set Name Match | Complete | None | AFK | Exact normalized wall `ObjectType` / name / type name to `IfcMaterialLayerSet.LayerSetName` recovery implemented as parser evidence fallback. |

## Revit IFC Layer-Set Recovery Execution Mode

- chosen mode: single-agent.
- reason: one ready AFK parser deepening slice; material evidence source markers, recovery metadata, diagnostics, and downstream grouping/calculation input behavior share one interface.
- current PR scope: complete.

## Revit IFC Layer-Set Recovery Verification

- `npm test -- tests/ifcEvidenceExtractor.test.ts`: passed, 7 tests.
- `npm run typecheck`: passed.
- `npm test`: passed, 19 files and 67 tests.
- `npm run verify:milestone-4`: passed, created localhost Job `job_67d59e2a8cff4c7c` and served generated report HTML.
- `npm run verify:e2e`: passed, created localhost Job `job_399b75a79b6d47ed`, revision `rev_20260610215613`, and verifier artifacts under `outputs/verifier/run_20260610215611`.
- `npm run verify:revit-layer-recovery:local -- "C:\Users\moham\Downloads\1365-01_Barclay 4_ARCH_V23_akhouryHLD2Y.ifc"`: passed with 536 recovered layer-set matches, 298 recovered multi-layer stacks, 536 calculation inputs requiring lambda, and 544 relevant elements.

## Revit IFC Layer-Set Recovery Architecture Review

- Recovery lives in `src/domain/evidence/features/recoverRevitLayerSetNameMatchEvidence.ts`, behind the Evidence Feature Extractor layer.
- Official `IfcRelAssociatesMaterial` evidence remains first and is marked `official_rel_associates_material`.
- Recovered evidence is marked `recovered_layer_set_name_match` with explicit recovery metadata, medium confidence, and `needsUserConfirmation`.
- Recovery does not enter calculation, Review UI, Report, viewer, storage, or HTTP modules.
- Uploaded localhost Jobs now use real IFC extraction by default and persist derived calculation input evidence for Review and Report generation.
- Synthetic calculation input evidence remains available only through explicit verifier/test worker overrides.
- Exact-only normalization is intentionally small: lowercase, punctuation collapsed to spaces, no fuzzy matching or scoring.
- Ambiguous duplicate `LayerSetName` matches emit diagnostics and do not choose.
- No refactor plan is needed now; the module is deep enough for the current slice and can later extend matching sources without widening caller obligations.

## Revit IFC Layer-Set Recovery State-Machine Audit

- current stage: done.
- artifacts that prove it: `context/prds/revit-ifc-layer-set-recovery.md`, `context/issues/revit-ifc-layer-set-recovery/001-recover-layer-stacks-by-exact-layer-set-name-match.md`, `src/domain/evidence/features/recoverRevitLayerSetNameMatchEvidence.ts`, `tests/ifcEvidenceExtractor.test.ts`, `PR-LEDGER.md`.
- execution mode: single-agent serial implementation.
- human decision needed: none.
