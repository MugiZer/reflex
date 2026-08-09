# Ubiquitous language

**Status:** active lookup table. Add a term only when it prevents a real naming
ambiguity; detailed behavior belongs in `context/domain.md` or the code.

| Term | Meaning | Avoid |
| --- | --- | --- |
| BIM-to-Physics Compiler | IFC evidence to validated thermal snapshots and reports | U-value app, parser |
| Job | One uploaded IFC and processing lifecycle | upload, run |
| IFC Evidence | Immutable extracted facts, provenance, and diagnostics | parsed data |
| Evidence Path | Exact IFC attribute/relationship found or checked | source path |
| Element Evidence | Evidence for one source IFC element | element data |
| Assembly Group | Conservatively grouped physical construction | wall type, group |
| Source Element | Original IFC element in an Assembly Group | entity, item |
| Missing Datapoint | Needed field that is absent, ambiguous, or insufficient | missing field |
| Requested Input | User-facing instruction for a missing datapoint | form field |
| User Input | Confirmed review value stored separately from evidence | edit |
| Override Scope | `layer_occurrence`, `assembly_group`, or `element_type` | apply mode |
| Material Resolution | Exact auto-resolution, suggestion, or unresolved result | matching |
| Calculation Snapshot | Immutable calculation inputs, outputs, provenance, and warnings | result |
| Revision | Immutable version after extraction, input, or recalculation | history item |
| Readiness State | `ready`, `needs_review`, `estimated`, `blocked`, `superseded` | status |
| Confidence | `low`, `medium`, or `high` trust in precision | certainty |
| Diagnostic | Structured human/machine-visible condition | log |
| Report | HTML artifact rendered from active snapshots | output page |
| Verifier | Public-flow check, not merely an internal unit test | test suite |
| Topology Result | Optional immutable Revision enrichment; never the layer snapshot | topology U-value |
| Declarative Construction Recipe | Versioned, authority-tagged topology input | CAD input |
| Canonical Analysis Geometry | Family-neutral audited solver input | solver geometry |
| Topology Audit | Deterministic geometry-conservation evidence | geometry log |
| Validation Envelope | Supported combinations eligible for verified output | supported range |

Use `jobStatus` for jobs, `readinessState` for assemblies/calculations, and
`diagnostics` for domain-visible notes. Preserve these relationships:

```text
Job -> IFC Evidence -> Assembly Group -> Revision -> Calculation Snapshot -> Report
Revision -> optional Topology Result
```
