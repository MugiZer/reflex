# BIM-to-Physics Report Compiler - Roadmap

## Current State
Milestone 1 is implemented as a local TypeScript CLI extractor using `web-ifc` behind an `IfcModelReader` adapter.

The current extractor can run against the private Barclay IFC file and write Milestone 1 evidence artifacts:

```text
C:\Users\moham\Downloads\1365-01_Barclay 4_ARCH_V23_akhouryHLD2Y.ifc
```

The file must remain private and must not be committed.

Current command targets:

```text
npm run ifc:inspect -- "C:\Users\moham\Downloads\1365-01_Barclay 4_ARCH_V23_akhouryHLD2Y.ifc"
npm run verify:milestone-1 -- "C:\Users\moham\Downloads\1365-01_Barclay 4_ARCH_V23_akhouryHLD2Y.ifc"
```

Current verification:

```text
npm test
npm run typecheck
npm run verify:milestone-1 -- "C:\Users\moham\Downloads\1365-01_Barclay 4_ARCH_V23_akhouryHLD2Y.ifc"
```

Known Milestone 1 trust gap:

- The Barclay IFC produces relevant elements but little/no official material, type, layer, or thickness evidence.
- The system must not silently treat evidence-free assemblies as usable estimates.
- Missing evidence must become explicit missing datapoints and diagnostics.

## Completed
### Milestone 1 - IFC Evidence Extractor CLI
- CLI can smoke-read a real IFC file.
- `IfcModelReader` hides raw `web-ifc` syntax from domain code.
- Extractor emits canonical JSON artifacts.
- Relevant envelope elements are discovered.
- Compact element/type/material/property/quantity evidence is extracted where present.
- Conservative assembly candidates are built.
- Missing datapoints and readiness diagnostics are generated.
- Architect-facing `diagnostics.md` is generated.
- Milestone 1 verifier runs end to end.

## Active
### Milestone 1.1 - Evidence Honesty Hardening
Fix trust semantics before building review UI or calculations.

Required behavior:

- No silent `estimated` readiness when no usable calculation basis exists.
- Emit explicit missing datapoints for absent material/type/layer/calculation-basis evidence.
- Diagnostics must tell user or BIM author exactly what must be fixed or supplied.
- Barclay IFC should be classified as incomplete evidence, not fake estimate.

Acceptance criteria:

```text
1. Evidence-free assemblies are not marked estimated.
2. Missing datapoints are emitted when required evidence paths are absent.
3. diagnostics.md has a critical evidence gaps section.
4. Verifier still passes against the private Barclay IFC.
5. Parser evidence remains immutable; user inputs remain separate.
```

## Speed Roadmap
This roadmap merges insignificant milestones. Split only where a wrong foundation would create rework.

### Milestone 2 - Calculation-Input Parser
Build the final parser foundation needed by calculation/review modules.

Build:

- More IFC evidence paths.
- Better material associations.
- Better layer stack detection.
- Better type/occurrence precedence.
- More messy IFC tolerance.
- `EffectiveElementEvidence` internal module.
- `CalculationInputEvidence` model.
- Fixed/candidate/missing calculation inputs.
- Conflict diagnostics with cited STEP ids.

Acceptance criteria:

```text
1. Extractor finds direct occurrence material associations when present.
2. Extractor finds type-level material associations when occurrence evidence is absent.
3. Direct occurrence evidence takes precedence over type evidence.
4. Conflicting direct occurrence evidence is preserved and diagnosed.
5. Layer stack extraction supports valid IFC layer set and layer set usage shapes.
6. Parser outputs whether each element/assembly has layered fixed evidence, material-library-ready evidence, estimate-only evidence, or blocked missing evidence.
7. Candidate pset/qset/name evidence is never treated as fixed truth.
8. Diagnostics cite exact STEP ids and evidence paths.
9. Existing Milestone 1/1.1 verifier stays green.
```

Critical because:

```text
If parser cannot say what can be calculated, every later module guesses.
```

### Milestone 3 - Review + Calculation + Report Core
Build the non-UI product loop from parser evidence to reviewed thermal report.

Build:

- Assembly groups.
- Missing datapoint questions.
- User overrides stored separate from IFC evidence.
- Revision history.
- Thermal datapoint model.
- Layered assembly U-value / R-value calculation.
- Low-confidence range calculation.
- Explicit assumptions.
- Clean architect/client report.
- Evidence section toggle.
- Calculation subsection.
- Missing/assumption/provenance sections.

Acceptance criteria:

```text
1. Assemblies are grouped conservatively by effective evidence.
2. Missing datapoints become user-readable questions.
3. User-provided values are stored as explicit inputs/overrides.
4. IFC evidence artifacts are never mutated by user input.
5. Revisions can be restored or compared.
6. Layered assemblies calculate deterministic U/R values when required datapoints are fixed.
7. Missing or uncertain datapoints produce ranges, not false precision.
8. Assumptions are explicit and reportable.
9. Calculation results cite source evidence and user inputs.
10. Standalone HTML report shows summary, calculation data, missing datapoints, assumptions, warnings, provenance, and evidence toggle.
```

Critical because:

```text
This proves the real value loop before web polish.
```

### Milestone 4 - Thin Web App + Async Job Backend
Wrap the core loop in a local colleague-usable app.

Build:

- Upload IFC.
- `POST /api/jobs`
- `GET /api/jobs/:id`
- `GET /api/jobs/:id/report`
- SQLite + local files.
- Isolated job storage.
- Job page.
- Review assemblies.
- Enter missing datapoints.
- Open report.

Acceptance criteria:

```text
1. User uploads an IFC from browser.
2. Upload creates a persisted job id.
3. User sees processing state.
4. User reviews assembly-focused missing datapoints.
5. User enters missing values.
6. Backend creates a revision and recalculates.
7. User opens generated HTML report.
8. Job files are isolated by job id/hash.
9. No full auth; use local single-workspace mode.
```

Critical because:

```text
This is the first colleague-usable prototype.
```

### Milestone 5 - End-to-End Verifier + Regression Harness
Prove the whole prototype loop against messy real IFC behavior and keep it from regressing.

Build:

- Real IFC fixture workflow.
- Upload -> extract -> review -> override -> recalc -> report.
- Regression tests for messy IFC.
- Synthetic edge cases for occurrence/type precedence, conflicts, missing evidence, candidate evidence, unit normalization.

Acceptance criteria:

```text
1. Verifier runs full workflow from IFC upload to report.
2. Verifier applies at least one user override.
3. Verifier creates at least one revision.
4. Verifier proves recalculation after user input.
5. Verifier checks traceable missing datapoints and provenance.
6. Regression harness covers key parser edge cases without needing many private IFC files.
```

### Milestone 6 - Broader IFC Coverage + Product Hardening
Expand after the first full product loop works.

Build:

- More element classes.
- More IFC schema variants.
- More property naming variants.
- More fallback extractors.
- Better UI states.
- PDF export.
- Multi-user/auth later.
- Cloud storage/queue later.
- Real deployment.

Acceptance criteria:

```text
1. New element classes are added through static relevant-element config.
2. IFC schema differences are handled by schema detection plus feature-based extraction.
3. New property aliases are covered by tested candidate indexes.
4. Proxy elements are not rejected; they receive lower confidence and user-confirmed classification when needed.
5. UI has clear empty/error/loading/review/report states.
6. Report can be exported to PDF.
7. Auth remains out of V1 until needed.
8. Queue/cloud storage/deployment are added only after local job model proves value.
9. Product remains evidence-first and provenance-preserving.
```

## V1 Demo Bar
One messy-but-representative IFC can go from upload to reviewed HTML report with traceable missing datapoints and at least one revision after user input.

Demo acceptance criteria:

```text
1. User uploads IFC.
2. API creates async job.
3. System extracts wall/slab/roof candidates.
4. System groups conservatively by type/evidence.
5. System extracts layered assemblies where possible.
6. System inspects non-layered evidence where present.
7. System identifies exact missing datapoints.
8. User reviews one assembly and enters missing lambda/thickness/classification.
9. Backend creates new revision.
10. U-value or U-value range recalculates.
11. HTML report shows assembly summary, calculation data, assumptions, warnings, concise provenance, and detailed evidence toggle.
12. Previous revision can be restored from backend.
```

## Later Product Roadmap
### V2
- Condensation.
- Vapour resistance `mu`.
- Relative humidity.
- Temperature profile.

### V3
- Dynamic thermal behavior.
- Density `rho`.
- Specific heat `c`.
- Phase shift.

### V4
- Windows.
- Doors.
- Openings.
- Envelope areas.

### V5
- Thermal bridges.
- Solar.
- Whole-building report.

### V6
- Native BIM/Revit integration.

## Non-Goals
Do not build yet:

- Condensation risk.
- Vapour diffusion.
- Temperature profile.
- Density `rho`.
- Specific heat `c`.
- Vapour resistance `mu`.
- Phase shift.
- Heat storage capacity.
- Windows/doors/openings.
- Thermal bridges.
- Solar/shading.
- Ground-contact modeling.
- Whole-building heat-loss report.
- Energy analytical model.
- Native Revit plugin.
- Full auth.
- Cloud scaling infrastructure.
- Marketing/dashboard layer.
