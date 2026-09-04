# V1 Design Decisions - 2026-06-01

## Context
The project is a BIM/IFC-to-U-value report compiler. It is a test project intended to demonstrate serious product and engineering ability for a startup. V1 must be good enough for colleagues to use and strong enough to show architecture, trust, provenance, and ability to handle real IFC uncertainty.

The repo is blank. A real IFC sample exists at:

```text
C:\Users\moham\Downloads\1365-01_Barclay 4_ARCH_V23_akhouryHLD2Y.ifc
```

## Decision
Build V1 as a Node/Express small web UI wrapping an API.

Use:

- async job model.
- SQLite + local files.
- versioned local material library.
- clean HTML report from structured calculation data.
- focused compiler workflow UI.
- no full auth for local/colleague prototype.

Build order:

```text
1. Real IFC parser/evidence extractor first.
2. Thin end-to-end app using extractor results.
3. Broaden extractor paths, review/revision model, and end-to-end verifier.
```

## Rationale
IFC parsing is the critical unknown. Building a polished app before proving extraction risks making a shell around an unsolved core.

The first milestone should reduce parser risk:

```text
real IFC file
-> real extractor
-> evidence JSON
-> missing datapoints JSON
-> diagnostics markdown
```

The app can then wrap proven extraction results.

## Alternatives Considered
### CLI-First Local Tool
Rejected as final V1 interface because user wants a small web UI wrapping an API.

Still useful as extractor inspection CLI.

### Synchronous `POST file -> report`
Rejected because IFC processing can be slow, needs review states, provenance, persisted evidence, and retryable errors.

Async job resource chosen:

```text
POST /api/jobs
GET /api/jobs/:jobId
GET /api/jobs/:jobId/report
```

### Local JSON Storage
Rejected for V1 metadata/results because SQLite better demonstrates traceability, review states, history, and upgrade path to Postgres.

### External Material API
Rejected for V1 because it adds dependency risk and muddies provenance.

Versioned local material library chosen.

### Golden-Path IFC Only
Rejected because product must work broadly on clean and messy IFC files and must know exact missing datapoints.

Evidence-first extraction chosen:

```text
try multiple IFC evidence paths
extract whatever exists
record paths checked
record exact missing datapoints
ask user only for missing/uncertain inputs
```

### Fake Extraction Before Parser
Rejected after reconsideration because IFC parsing is too central and risky.

Selected strategy:

```text
real IFC parser spike first
thin app second
broader extractor/review/verifier third
```

### Global Unresolved Datapoints Queue
Rejected as primary UI because it could overwhelm users.

Assembly-focused review chosen.

### Job-Wide Material Overrides By Normalized Key
Rejected because same material label may mean different materials across entity types.

Override scopes chosen:

```text
layer_occurrence
assembly_group
element_type
```

### Fuzzy Material Auto-Accept
Rejected because outputs affect real outcomes.

Exact normalized key/alias match can auto-resolve. Fuzzy matches require user confirmation.

### Single Value For Low-Confidence Estimates
Rejected because false precision damages trust.

Low-confidence estimates show ranges. Single value only when enough datapoints are fixed.

## Specific Decisions
### Interface
Small web UI wrapping API.

### API
Async job model.

### Storage
SQLite for metadata/results. Local filesystem for uploaded IFCs and generated reports.

### Material Library
Versioned local library.

### Material Resolution
Conservative matching.

```text
exact normalized match -> auto_resolved
fuzzy match -> suggested, user confirms
no match -> unresolved, user enters lambda or picks material
```

### Missing Materials
Unresolved or ambiguous material values become `needs_review`. User enters custom datapoint.

### IFC Robustness
Support clean and messy IFC files through evidence extraction, strict validation, exact missing-input reporting.

### Non-Layered Structures
Support layered assemblies directly. Inspect non-layered structures. If estimations can be made from clear datapoints, make broad estimate/range. If more datapoints are needed, ask user and rerun calculation.

### Estimates
Show U-value range when confidence is low. Show single value only when enough datapoints are fixed.

### User Inputs
Store as explicit overrides/inputs. Never mutate extracted IFC evidence.

### Review UI
Assembly-focused. Backend missing datapoint schema drives UI.

### Assembly Identity
Group entities by type and relevant datapoints. Be conservative. Do not make grouping mistakes.

### Override Scope
Give user choice whether override applies to layer occurrence, assembly group, or element type.

### Revisions
Preserve full backend revision history and allow restore. Keep UI light.

### Units
Extract IFC project units first. Normalize internal calculations to SI units. Store raw and normalized values with provenance. Escalate to user when units are missing or uncertain.

### Surface Resistance
Use explicit selectable profiles. Default by element class. Always show assumptions.

### IfcSlab
Treat `IfcSlab` as requiring subtype/context classification before final calculation. Require user confirmation when uncertain.

### Canonical Output
User-facing output is clean HTML report with calculation data subsection. Backend still uses structured calculation snapshots internally.

### Report Provenance
Include everything, but extra details are toggleable.

### Auth
No full auth for first local/colleague prototype. Use single-workspace mode with clear job IDs and isolated storage.

### UI Priority
Focused compiler workflow. No marketing/dashboard layer.

## Implications
The extractor must be designed as product infrastructure, not a throwaway parser script.

Unsupported IFC structures are not whole-job failures unless parser/infrastructure fails.

Every calculation must be explainable through:

- evidence.
- datapoints.
- assumptions.
- confidence.
- missing inputs.
- user overrides.
- revision history.

The backend contract should allow frontend to render review forms from `MissingDatapoint` records and later full requested input planning.

## Open Questions
- Which Node IFC parser will be selected after spike, likely `web-ifc`.
- Exact IFC attribute paths found in the real Barclay IFC.
- Exact schema for material library entries.
- Initial surface resistance profile values and sources.
- Initial HTML report template.
- SQLite schema final shape.
- End-to-end verifier implementation details.
