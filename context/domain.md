# BIM-to-Physics Report Compiler - Domain Context

## Purpose
This file helps agents understand the shared product model for a BIM/IFC-to-U-value report compiler.

## Product Goal
Build a BIM/IFC-to-U-value report generator.

The tool takes an IFC file, extracts wall/slab/roof construction evidence, resolves missing thermal values from a material library or user input, calculates U-value or estimated U-value range, and generates a clean Ubakus-style HTML report.

Core promise:

```text
Architects should not manually rebuild wall/roof/slab assemblies layer by layer.
```

Old workflow:

```text
manually enter every layer
```

New workflow:

```text
review only uncertain assumptions and missing datapoints
```

## Core Concepts

### BIM-to-Physics Compiler
A system that converts incomplete BIM evidence into validated thermal calculation objects and reports.

Pipeline:

```text
IFC/native BIM
-> evidence extraction
-> derived assembly semantics
-> material physics resolution
-> validation
-> U-value / estimate calculation
-> reviewable report
```

The moat is not the U-value formula. The moat is the evidence-to-physics compiler.

### IFC Evidence
Raw facts extracted from an IFC file with provenance.

Evidence includes:

- IFC schema/version.
- file hash.
- project units or missing-unit diagnostics.
- element identity.
- material associations.
- layered material evidence.
- non-layered material evidence.
- property sets.
- quantity sets.
- type object relationships.
- paths checked.
- diagnostics.

IFC evidence is never mutated by user input.

### Required Calculation Datapoint
A field needed for calculation, estimate, precision, or report provenance.

Required for precise layered U-value:

- assembly identity.
- element class.
- source element IDs.
- layer order.
- material name per layer.
- thickness per layer.
- thickness unit.
- normalized thickness in meters.
- lambda per layer.
- lambda unit `W/mK`.
- lambda source.
- internal surface resistance `Rsi`.
- external surface resistance `Rse`.
- surface resistance profile.
- project length unit.
- conversion factor to meters.
- source/provenance for every input.
- confidence.
- assumptions.
- warnings.
- missing inputs.

For estimates/ranges, also track:

- estimated datapoints.
- estimate basis.
- min/max assumptions.
- confidence level.

### Missing Datapoint
An exact field that is absent, ambiguous, or insufficient for calculation or precision.

Missing datapoints must say:

- what field is missing.
- why it is needed.
- whether user can fix it.
- what input type user should provide.
- what unit is expected.
- what evidence was checked.
- what elements or assemblies are affected.

This is critical. The product must know exactly what is missing.

### Assembly Candidate
A possible wall/slab/roof construction derived from IFC evidence.

An assembly candidate may be:

- ready.
- needs review.
- estimated.
- blocked.

### Assembly Group
A conservative grouping of source elements that likely share same physical assembly.

Grouping must be conservative because outputs affect real outcomes.

Strong grouping evidence:

- same IFC element class.
- same `IfcTypeObject` / type `GlobalId`, when available.
- same material association source.
- same ordered layer stack, when available.
- same layer thicknesses, when available.
- same relevant property set values.
- same unit-normalized datapoints.

Do not group when:

- type objects differ.
- material layer sources differ.
- one element has missing layer data and another has present layer data.
- material names match but thicknesses differ.
- non-layered evidence is incomplete or ambiguous.
- property sets conflict.

Only auto-group high-confidence matches. Everything else becomes `single_element` or `needs_review`.

### Layered Assembly
An assembly with ordered layers, material names, and thicknesses.

Primary extraction path:

```text
IfcWall / IfcSlab / IfcRoof
-> IfcRelAssociatesMaterial
-> IfcMaterialLayerSetUsage
-> IfcMaterialLayerSet
-> IfcMaterialLayer[]
-> Material.Name + LayerThickness
```

Layered assemblies are calculable when lambda values, units, and surface profile are available.

### Non-Layered Structure
IFC material evidence that does not provide an ordered layer stack.

Examples:

- `IfcMaterialConstituentSet`.
- `IfcMaterialConstituent`.
- `IfcMaterialProfileSet`.
- property-set-only material/thickness evidence.
- quantity-set-only thickness evidence.

V1 inspects non-layered structures. If clear datapoints exist, use them. If enough evidence supports broad estimation, calculate a range. If required datapoints are missing, ask user for inputs and rerun calculation.

### Calculation Basis
The source basis used for a calculation or estimate.

Current basis values:

```text
extracted_layered
user_completed_layered
estimated_from_non_layered
user_completed_estimate
```

### Readiness State
State of an assembly/calculation.

```text
blocked
- cannot calculate anything useful.

needs_review
- user input or confirmation needed before final calculation.

estimated
- calculated from partial/non-layered evidence with assumptions.

ready
- calculated from complete enough evidence.

superseded
- old estimate/calculation replaced by newer revision.
```

### Confidence
Confidence communicates precision and trust level.

```text
high
- enough fixed datapoints for single calculated value.

medium
- user completed or confirmed enough assumptions, but basis is less direct.

low
- broad estimate from incomplete/non-layered evidence.
```

Low-confidence estimates should show U-value ranges. Single values should appear only when enough datapoints are fixed.

### User Input / Override
A user-supplied datapoint stored separately from IFC evidence.

User inputs never mutate extracted IFC evidence.

The system must always distinguish:

```text
extracted from IFC
matched from material library
estimated by system
entered by user
```

Override scope options:

```text
layer_occurrence
assembly_group
element_type
```

Avoid job-wide material-key overrides by default because same material label can mean different things across entity types.

### Revision
An immutable backend snapshot created after extraction, user input, override, or recalculation.

Backend preserves full revision history and can restore old revisions. UI keeps revision display light.

Example:

```text
Revision 1: extracted-only estimate.
Revision 2: user added lambda.
Revision 3: user changed thickness.
Revision 4: user split override from group.
```

Current assembly points to active revision.

### Material Library
A versioned local library in the repo or seed data.

Material library entries include:

- key.
- display name.
- aliases.
- lambda.
- lambda unit `W/mK`.
- category.
- source.
- confidence/default metadata.

Exact normalized alias matches can auto-resolve. Fuzzy matches become suggestions requiring user confirmation.

### Material Resolution
Process of mapping raw IFC material names to thermal conductivity.

Resolution levels:

```text
auto_resolved
- exact normalized key or alias match.

suggested
- fuzzy/name/category match.
- user must confirm.

unresolved
- no credible match.
- user enters lambda or picks material.
```

Fuzzy matches help user. They do not silently decide final values.

### Surface Resistance Profile
Selectable profile supplying `Rsi` and `Rse`.

Profiles are defaulted by element class but always shown in assumptions.

V1 profile examples:

- external wall / horizontal heat flow.
- roof / upward heat flow.
- ground floor / downward heat flow.
- generic fallback.

`IfcSlab` is ambiguous and requires subtype/context classification before final calculation when uncertain.

### IfcSlab Classification
Classification for slabs because `IfcSlab` can represent many roles.

Possible roles:

- roof slab.
- ground slab.
- intermediate floor.
- floor slab.
- base slab.
- landing.
- unknown slab.

Capture evidence:

- `IfcSlab.PredefinedType`.
- `Name`.
- `ObjectType`.
- containing storey.
- property sets.
- material/layer evidence.
- orientation when available.

If classification is uncertain, user must confirm.

### U-Value Calculation
Steady-state thermal transmittance calculation for layered assemblies.

Formula:

```text
R_layer = thickness_m / lambda
R_total = Rsi + sum(R_layer) + Rse
U = 1 / R_total
```

Units:

- thickness: meters.
- lambda: `W/mK`.
- R-value: `m2K/W`.
- U-value: `W/m2K`.

### U-Value Range
Range shown when confidence is low.

Example:

```text
Estimated U-value: 0.22-0.31 W/m2K
Basis: non-layered material evidence + assumed insulation thickness range
Confidence: low
```

After user provides exact datapoints, rerun calculation and show more precise result.

### Report
Clean HTML file generated from structured calculation data.

Report includes:

- file summary.
- assembly summary.
- calculation data subsection.
- layer table.
- material resolution.
- assumptions.
- warnings.
- provenance.
- detailed evidence toggle.

HTML report is user-facing artifact. Backend still stores structured calculation snapshots so reports can be regenerated, revised, restored, and audited.

## What This System Does NOT Do
V1 does not build:

- condensation risk.
- vapour diffusion.
- temperature profile.
- density `rho`.
- specific heat `c`.
- vapour resistance `mu`.
- phase shift.
- heat storage capacity.
- windows.
- doors.
- openings.
- thermal bridges.
- solar/shading.
- ground-contact modeling.
- whole-building heat-loss report.
- energy analytical model.
- native Revit plugin.
- full auth.
- cloud scaling infrastructure.
- marketing dashboard.
- billing.
- organization management.
