# Ubiquitous Language

## Product and workflow

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **BIM-to-Physics Compiler** | System that converts BIM/IFC evidence into validated thermal calculation snapshots and reports. | U-value app, report generator, parser |
| **Job** | One IFC upload and its processing lifecycle. | Upload, task, run |
| **Review** | User workflow for resolving missing or uncertain datapoints. | Fixing, editing, manual entry |
| **Architect Action View** | Risk-prioritized projection of Assembly Groups that connects IFC location, calculation result, evidence state, target comparison, and one explicit next action. | Dashboard, scorecard, compliance verdict |
| **Report** | Clean HTML artifact generated from report inventory views and their active calculation snapshots. | Output page, PDF, result |
| **Report Inventory** | Application projection that preserves every grouped calculation-input composition, its source elements, known layers, readiness, and optional calculation snapshot. | Report data, report model |
| **Verifier** | End-to-end check proving upload, extraction, review, revision, recalculation, and report behavior. | Test suite, smoke test, QA script |

## IFC evidence

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **IFC Evidence** | Raw facts extracted from IFC with source paths, confidence, and diagnostics. | Parsed data, raw data, IFC result |
| **Evidence Path** | Precise IFC relationship or attribute path where a datapoint came from or was searched. | Source path, IFC path, trace |
| **Element Evidence** | IFC evidence for one source element such as `IfcWall`, `IfcSlab`, or `IfcRoof`. | Element data, entity data |
| **Material Evidence** | IFC evidence describing materials, material layers, constituents, profiles, or material properties. | Material data |
| **Layer Evidence** | IFC evidence for one physical layer, including material, order, and thickness when available. | Layer data |
| **Non-Layered Evidence** | Material evidence that lacks a trustworthy ordered layer stack. | Messy material data, fallback data |
| **Diagnostic** | Machine-readable and human-readable note describing extraction, validation, or calculation condition. | Error, warning, log |
| **Relevant Element** | IFC object actively needed for current calculations. | Building element, object |
| **Type Evidence** | Shared IFC type-object evidence referenced by one or more source elements. | Type data, wall type data |
| **Cited IFC Entity** | Compact raw snapshot of an IFC entity used to prove, reject, or diagnose evidence. | Raw IFC dump, entity dump |
| **IfcModelReader** | Thin interface for typed low-level IFC access that hides raw parser mechanics. | Parser wrapper, web-ifc helper |
| **WebIfcModelReader** | Adapter implementing `IfcModelReader` with raw `web-ifc`. | IFC reader, parser |
| **IfcExtractionIndex** | Targeted internal index of relationship links touching relevant elements and their type objects. | Relationship cache, index |
| **Evidence Feature Extractor** | Focused module that extracts one kind of IFC evidence from `IfcModelReader` and `IfcExtractionIndex`. | Feature, extractor plugin |
| **Evidence Reference** | Readable and structured reference to the IFC path used for found or checked evidence. | Source path, trace |

## Assemblies

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Assembly Candidate** | Possible wall/slab/roof construction derived from IFC evidence before final grouping and validation. | Candidate, construction |
| **Assembly Group** | Conservative grouping of elements that share enough type and datapoint evidence to be treated as same physical assembly. | Type, wall type, group |
| **Source Element** | Original IFC element that contributes evidence to an assembly group. | Entity, object, item |
| **Grouping Basis** | Evidence used to justify why source elements were grouped. | Group reason, group key |
| **Grouping Confidence** | Trust level for an assembly group decision. | Group certainty |
| **Single Element Assembly** | Assembly group containing exactly one source element because grouping evidence was insufficient. | Ungrouped assembly |
| **Assembly Grouping Policy** | Domain policy that decides grouping key, basis, confidence, and diagnostics for assembly candidates. | Grouping logic, grouping rule |
| **Evidence Signature** | Versioned hashable evidence components used to explain and reproduce grouping decisions. | Signature, group key |
| **Grouping Key** | Machine key used to collect source elements into an assembly candidate. | Group id, hash |
| **Assembly Evidence Summary** | Derived counts and booleans summarizing candidate evidence for missing-datapoint and readiness modules. | Summary, readiness flags |

## Datapoints and user input

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Calculation Datapoint** | One typed value required for calculation, estimate, precision, or report provenance. | Field, input, value |
| **Missing Datapoint** | Required or useful calculation datapoint that is absent, ambiguous, or insufficient. | Missing field, issue, problem |
| **Requested Input** | UI-ready instruction telling user what datapoint to provide, input type, unit, constraints, and scope. | Form field, prompt |
| **Review Group** | A user-facing grouping of requested inputs, such as one material decision or one assembly group, used to keep Review at the right granularity. | Form group, question group |
| **Material Decision** | A review decision that assigns one lambda value to matching layer occurrences with the same normalized material name in the current review state. | Global material override, material prompt |
| **Numeric Evidence** | Raw and normalized numeric datapoint with unit source, confidence, diagnostics, and evidence reference. | Number value, numeric field |
| **Candidate Property Evidence** | Property or quantity evidence that may represent lambda, thickness, material name, classification, or unit. | Candidate property, useful pset |
| **User Input** | Datapoint supplied by user during review. | Override, manual value |
| **Override** | User input that supersedes a lower-precedence datapoint for a defined scope. | Edit, replacement |
| **Override Scope** | Range where user input applies: `layer_occurrence`, `assembly_group`, or `element_type`. | Apply mode |
| **Assumption** | Explicit value or rule used when direct evidence is incomplete. | Guess, default |
| **Warning** | User-facing notice that result depends on uncertainty, assumption, or unsupported evidence. | Alert, issue |

## Material physics

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Material Library** | Versioned local catalog of material aliases and thermal conductivity values. | Material DB, lookup table |
| **Material Resolution** | Process of mapping raw IFC material names to material library entries or user-supplied lambda values. | Matching, lookup |
| **Normalized Material Key** | Canonical string used for exact material alias resolution. | Material id, slug |
| **Lambda** | Thermal conductivity in `W/mK`. | k-value, conductivity |
| **Surface Resistance Profile** | Named profile containing `Rsi`, `Rse`, applicability, unit, and source. | R profile, boundary condition |
| **IfcSlab Classification** | Context classification that turns ambiguous `IfcSlab` evidence into roof, ground, intermediate floor, or unknown role. | Slab type, slab subtype |

## Calculation lifecycle

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Physics Assembly** | Normalized calculation object consumed by thermal calculation and report generation. | Calculation object, normalized assembly |
| **Calculation Snapshot** | Immutable structured record of inputs, outputs, provenance, assumptions, warnings, and confidence for one assembly revision. | Result, calculation data |
| **Calculation Basis** | Source basis explaining whether result came from extracted layers, user-completed layers, non-layered estimate, or user-completed estimate. | Basis, source |
| **Readiness State** | Assembly state: `ready`, `needs_review`, `estimated`, `blocked`, or `superseded`. | Status |
| **Confidence** | Trust level for precision: `high`, `medium`, or `low`. | Certainty |
| **U-Value** | Thermal transmittance in `W/m2K`. | U factor |
| **U-Value Range** | Min/max U-value estimate used when confidence is low. | Estimate range |
| **Revision** | Immutable backend version created after extraction, user input, override, or recalculation. | Version, history item |
| **Active Revision** | Current revision used by UI and report. | Latest result |

## Relationships

- One **Job** owns one uploaded IFC file.
- One **Job** produces one **IFC Evidence** record.
- One **IFC Evidence** record contains many **Element Evidence** records.
- One **IFC Evidence** record contains zero or more **Type Evidence** records.
- One **Element Evidence** record may reference one **Type Evidence** record.
- One **Assembly Group** contains one or more **Source Elements**.
- One **Assembly Candidate** is built from one or more **Element Evidence** records.
- One **Assembly Candidate** stores one or more **Evidence Signatures**.
- One **Assembly Group** has one **Active Revision** and many **Revisions**.
- One **Revision** has one **Calculation Snapshot**.
- One **Calculation Snapshot** references many **Calculation Datapoints**.
- One **Missing Datapoint** can create one **Requested Input**.
- One **User Input** can become one **Override**.
- One **Override** applies to one **Override Scope**.
- One **Report** is generated from current **Calculation Snapshots**.
- One **Verifier** exercises one or more full **Jobs**.

## Example dialogue

> **Dev:** "Should parser write directly to report?"
>
> **Domain expert:** "No. Extract **IFC Evidence**, build **Assembly Groups**, then create **Calculation Snapshots**. **Report** renders snapshots."
>
> **Dev:** "If lambda missing for one layer, do we fail **Job**?"
>
> **Domain expert:** "No. Add **Missing Datapoint** with **Requested Input**. Assembly becomes `needs_review`; **Job** still succeeds."
>
> **Dev:** "If user enters lambda, do we edit **IFC Evidence**?"
>
> **Domain expert:** "No. Store **User Input** as **Override**, create new **Revision**, keep original **Evidence Path** intact."
>
> **Dev:** "Can same material name apply everywhere?"
>
> **Domain expert:** "No. User chooses **Override Scope**. Avoid job-wide material-key changes unless later explicitly designed."

## Flagged ambiguities

- "assembly" can mean **Assembly Candidate**, **Assembly Group**, or **Physics Assembly**. Use exact term in code and docs.
- "status" can mean **Job** state or **Readiness State**. Use `jobStatus` for jobs and `readinessState` for assemblies.
- "source" can mean file path, IFC evidence path, or datapoint source. Use `sourceFilePath`, `evidencePath`, and `datapointSource`.
- "override" and **User Input** are related but not identical. **User Input** is raw user-supplied value; **Override** is scoped application of that value.
- "type" is overloaded by TypeScript, IFC type object, and element class. Use `ifcTypeObject`, `elementClass`, and `type` only for TypeScript declarations.
- "parser" can mean raw `web-ifc`, `WebIfcModelReader`, or `WebIfcEvidenceExtractor`. Use exact names.
- "index" should mean **IfcExtractionIndex** only when referring to targeted IFC relationship links.
- "signature" should mean **Evidence Signature** only when referring to versioned grouping evidence.

## Thermal Treatment opportunity review

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Thermal Treatment Opportunity** | Advisory, evidence-backed suggestion that a supported family may apply; it never creates a calculation or selection. | Auto-calculation, detected result |
| **Thermal Construction Signature** | Exact stable representation of the family, ordered layers, thicknesses, proposed parameters, boundary conditions, and assumptions that controls confirmation scope. | Wall hash, loose grouping key |
| **Thermal Treatment Confirmation Card** | Compact review projection showing one suggested family, affected walls, critical inputs, trust consequence, and explicit actions. | Family form, calculator panel |

## Two-dimensional thermal worker

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Two-Dimensional Thermal Model** | Family-neutral rectangular regions, material conductivity, boundary conditions, periodic edges, and mesh controls supplied to the local worker. | Solver geometry, FEM input |
| **Numerical Result** | Heat-flow, effective conductance, mesh-refinement evidence, warnings, and runtime versions produced by a worker. | Raw result, solver output |
| **Reproducibility Artifact** | Immutable solver input or result file retained for a calculation run. | Debug file, temporary output |

## Component topology

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Declarative Construction Recipe** | Immutable, versioned, authority-tagged description of optional component-topology analysis. | Family model, CAD input |
| **Topology Module** | Dimension- and physics-specific compiler/solver boundary. | Thermal family, solver mode |
| **Primitive** | Registered parametric member cross-section with local parameters and capabilities. | Profile type |
| **Primitive Registry** | Versioned resolution boundary for Primitive schemas, capabilities, and compilers. | Profile switch, family registry |
| **Representative Cell** | One periodic analysis domain with a fixed repeat width and unit out-of-plane length. | Sample, slice |
| **Material Region** | Non-overlapping, positive-area analysis domain with one material reference. | Zone, shape |
| **Thermal Break** | Explicit low-conductivity Material Region that interrupts a member path. | Gap, insulation default |
| **Validation Envelope** | Versioned set of supported combinations eligible for Verified output. | Supported range |
| **Authority** | Provenance and trust state carried by every semantically used Recipe datum. | Source, confidence |
