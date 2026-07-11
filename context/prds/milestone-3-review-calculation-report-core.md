# Milestone 3 PRD - Review + Calculation + Report Core

## Problem Statement

Milestone 2 gives the system parser output that says what can be calculated, what is only candidate evidence, and what must be supplied by a user or BIM author. The next risk is proving the actual product value loop without spending time on web UI, Express, SQLite, or deployment.

The user needs a fast path from parsed IFC evidence to a reviewed thermal result and a clean report. If the system jumps straight to UI before this core loop works, the UI will wrap uncertain behavior and hide missing domain decisions.

Milestone 3 must prove the non-UI product loop:

```text
CalculationInputEvidence
-> Assembly Groups
-> Requested Inputs
-> User Inputs / Overrides
-> Revisions
-> Calculation Snapshots
-> standalone HTML Report
```

Milestone 3 should optimize for speed. Build only what is needed to show one trustworthy reviewed calculation and report. Do not obsess over irrelevant details.

## Solution

Build a CLI/core workflow that turns parser evidence into at least one reviewed U-value/R-value calculation and standalone HTML report.

The system will:

- build Assembly Groups from effective parser evidence;
- generate Requested Inputs for missing calculation-critical datapoints;
- apply scripted User Inputs from a local review input file;
- create explicit Overrides without mutating IFC Evidence;
- create immutable Revisions in local files;
- calculate layered U-value/R-value when inputs are complete;
- produce U-value ranges when confidence is low;
- block calculation when no safe basis exists;
- write a clean standalone HTML report with summary, calculation data, inputs, assumptions, warnings, provenance, and evidence toggle.

Milestone 3 runs without web UI. A scripted `review-inputs.json` file stands in for user input so the domain loop can move fast.

## User Stories

1. As a developer, I want a core workflow command, so that I can prove the product loop without building web UI first.
2. As a developer, I want CalculationInputEvidence to become Assembly Groups, so that calculation works at the assembly level instead of raw element level.
3. As a developer, I want missing calculation inputs to become Requested Inputs, so that the system asks only for values that affect calculation, precision, or provenance.
4. As a future Review user, I want questions phrased in building/thermal language, so that I can answer them without reading raw IFC evidence.
5. As a future Review user, I want to provide lambda for a missing layer, so that a blocked or review-needed assembly can be calculated.
6. As a future Review user, I want to provide layer thickness when missing, so that the system can calculate an R-value safely.
7. As a future Review user, I want to provide a material name when missing, so that Material Library resolution or user lambda input can happen.
8. As a future Review user, I want to provide an assembly thickness for estimate-only cases, so that the system can produce a conservative range when exact layers are absent.
9. As a future Review user, I want to confirm proxy/slab classification when uncertain, so that the system does not calculate the wrong boundary type.
10. As a future Review user, I want to choose or override a surface resistance profile, so that `Rsi` and `Rse` assumptions are explicit.
11. As a developer, I want User Inputs stored separately from IFC Evidence, so that original extracted evidence remains trustworthy.
12. As a developer, I want Overrides to have explicit scope, so that a manual value is not accidentally applied too broadly.
13. As a developer, I want `layer_occurrence`, `assembly_group`, and `element_type` override scopes, so that user input can be applied at the right level.
14. As a developer, I want each user input to create a Revision, so that calculation changes are traceable.
15. As a developer, I want revisions persisted as local JSON files, so that the prototype has restore/compare foundations without SQLite.
16. As a developer, I want one active revision, so that the report knows which calculation snapshot to render.
17. As a developer, I want previous revisions preserved, so that review changes are not destructive.
18. As a developer, I want a small versioned Material Library, so that exact material aliases can provide lambda quickly.
19. As a developer, I want exact Material Library alias matches to produce fixed lambda, so that common materials calculate without user input.
20. As a developer, I want fuzzy Material Library matches to remain suggestions only, so that the system does not invent truth.
21. As a future Review user, I want unresolved lambda to produce a clear Requested Input, so that I know exactly what value to provide.
22. As a developer, I want user-provided lambda to take precedence over fixed IFC lambda and Material Library lambda, so that review can correct evidence safely.
23. As a developer, I want fixed IFC lambda to take precedence over Material Library exact matches, so that explicit project evidence is respected.
24. As a developer, I want Material Library exact matches to fill lambda when IFC does not provide it, so that review burden is lower.
25. As a developer, I want candidate IFC values to stay candidates, so that uncertain pset/qset/name evidence does not become fixed calculation input.
26. As a developer, I want the Thermal Calculation module to calculate layer R-values, total R-value, and U-value, so that the core physics result exists.
27. As a developer, I want U-value/R-value only in Milestone 3, so that the value loop ships before broader physics.
28. As a developer, I want the result shape to allow future physics sections, so that condensation, vapour, and dynamic behavior can be added later.
29. As a future Report reader, I want a single U-value when all inputs are fixed, so that the result is clear.
30. As a future Report reader, I want a U-value range when confidence is low, so that the system does not show false precision.
31. As a future Report reader, I want blocked assemblies shown without a result, so that missing evidence is not hidden.
32. As a future Report reader, I want assumptions shown explicitly, so that defaults like surface resistance profiles are not invisible.
33. As a future Report reader, I want warnings shown with the result, so that uncertainty is clear.
34. As a future Report reader, I want provenance summarized, so that I can trust where inputs came from.
35. As a future Report reader, I want evidence details toggleable, so that the report is clean but still inspectable.
36. As a developer, I want the report to include revision id, so that report output can be tied to a calculation snapshot.
37. As a developer, I want the core demo to calculate at least one assembly after scripted user input, so that Milestone 3 proves the loop.
38. As a developer, I want incomplete assemblies still visible in the report, so that partial progress and blocked gaps are clear.
39. As a developer, I want tests around deep module interfaces, so that implementation can change without breaking behavior.
40. As a developer, I want no Express/SQLite/web UI in Milestone 3, so that effort stays on the core domain loop.

## Implementation Decisions

- Milestone 3 builds **Review + Calculation + Report Core**.
- Milestone 3 does not build web UI. Web UI belongs to Milestone 4.
- Milestone 3 does not build Express routes, SQLite job persistence, upload handling, or async job API.
- Milestone 3 runs through a CLI/core workflow.
- Target command:

```text
npm run demo:core -- "<ifc path>"
```

- Core flow:

```text
extract
build calculation inputs
build assembly groups
generate requested inputs
apply scripted user input fixture
calculate
create revision
write HTML report
```

- Use a scripted local review input file for speed:

```text
review-inputs.json
```

- Milestone 3 only needs at least one assembly to reach a Calculation Snapshot after user input.
- The data model should support many Assembly Groups, but the demo path can answer one or a few Requested Inputs.
- Calculation runs only where inputs are complete enough.
- Blocked or `needs_review` assemblies remain visible in report.
- Calculation scope is U-value/R-value only.
- Formula:

```text
R_layer = thickness_m / lambda_W_per_mK
R_total = Rsi + sum(R_layer) + Rse
U = 1 / R_total
```

- Result shape should be extensible for future physics sections.
- Do not implement condensation, vapour diffusion, humidity profile, temperature profile, heat storage, phase shift, thermal bridges, openings, whole-building heat loss, or dynamic thermal behavior in Milestone 3.
- Lambda precedence:

```text
user_input lambda
> fixed IFC lambda evidence
> material_library exact alias match
> candidate suggestion only
> missing datapoint
```

- Candidate or fuzzy material matches are suggestions only and do not become fixed lambda.
- Add a small versioned local Material Library:

```text
materials/library.v1.json
```

- Material Library entries contain:
  - material key;
  - display name;
  - aliases;
  - `lambdaWPerMK`;
  - source label;
  - confidence.
- Exact alias match can provide fixed Material Library lambda.
- No big material database, scraping, editable library UI, or fuzzy auto-resolution in Milestone 3.
- Review model includes:
  - Requested Input;
  - User Input;
  - Override;
  - Revision.
- Requested Input is the question system asks.
- User Input is the answer user supplies.
- Override is the scoped application of User Input.
- Revision is an immutable snapshot after input/calculation.
- Override scopes in Milestone 3:
  - `layer_occurrence`;
  - `assembly_group`;
  - `element_type`.
- Askable user inputs in Milestone 3:
  - layer lambda;
  - layer thickness;
  - layer material name;
  - assembly thickness for estimate;
  - proxy/slab classification;
  - surface resistance profile.
- Askable filter:
  - datapoint affects calculation, estimate, precision, or provenance;
  - user can reasonably know or obtain the value;
  - question scope is clear;
  - units are clear.
- Exact layered calculation returns one U-value/R-value when inputs are fixed.
- Low-confidence or incomplete non-layered evidence returns a U-value range when a conservative estimate basis exists.
- No safe basis means blocked, no result.
- Range logic should be basic and explicit:
  - min/max lambda if material category/range exists;
  - min/max thickness if thickness uncertain;
  - system estimate only with explicit assumption.
- Surface Resistance Profiles are explicit selectable profiles, defaulted by element class and always shown in assumptions.
- Initial profile set:
  - `external_wall_vertical`;
  - `roof_upward`;
  - `floor_downward`;
  - `ground_floor_simple`;
  - `unheated_space_boundary`;
  - `custom`.
- Each Surface Resistance Profile contains:
  - `Rsi`;
  - `Rse`;
  - unit;
  - source label;
  - assumptions.
- Local revision persistence:

```text
outputs/{fileHash}/revisions/{revisionId}.json
outputs/{fileHash}/revisions/index.json
```

- Revision contains:
  - revision id;
  - parent revision id;
  - created timestamp;
  - reason;
  - user inputs;
  - overrides;
  - calculation snapshots;
  - diagnostics.
- HTML report is standalone and clean, not a product UI.
- HTML report must show:
  - summary;
  - assembly groups;
  - U-value / U-value range;
  - inputs used;
  - missing datapoints;
  - assumptions;
  - warnings;
  - provenance summary;
  - evidence details toggle;
  - revision id.
- HTML report must not show:
  - raw JSON dump;
  - huge repeated element table;
  - marketing/dashboard UI;
  - PDF export.

## Testing Decisions

- Test behavior through deep module interfaces, not private helper details.
- Prioritize unit tests for pure domain modules and one core workflow/verifier-style test.
- Test Requested Input planning:
  - missing layer lambda creates a lambda question;
  - missing layer thickness creates a thickness question;
  - missing material name creates a material question;
  - uncertain proxy/slab classification creates a classification question;
  - askable filter excludes values that do not affect calculation/provenance.
- Test Material Resolution:
  - user input lambda wins;
  - fixed IFC lambda wins over Material Library;
  - exact Material Library alias match supplies lambda;
  - fuzzy/candidate match does not auto-resolve;
  - unresolved material creates Requested Input.
- Test Override application:
  - user input is stored separately from IFC Evidence;
  - override scope is preserved;
  - source evidence is not mutated;
  - invalid units/values are rejected or diagnosed.
- Test Revision creation:
  - new revision has id, parent id, reason, inputs, overrides, snapshots, diagnostics;
  - previous revision remains unchanged;
  - revision index records active revision.
- Test Thermal Calculation:
  - total R-value is calculated from layer R-values plus `Rsi` and `Rse`;
  - U-value is reciprocal of total R-value;
  - exact inputs produce single value;
  - low-confidence inputs produce range;
  - missing required inputs block calculation;
  - zero/negative lambda or thickness fails safely.
- Test Surface Resistance Profiles:
  - default profile is selected by element class;
  - selected profile is included in assumptions;
  - custom profile is explicit.
- Test HTML Report generation:
  - report includes summary, calculation data, inputs, assumptions, warnings, provenance, revision id;
  - report does not dump raw JSON;
  - evidence details are toggleable.
- Test core demo workflow:
  - run from parser/evidence fixture plus scripted `review-inputs.json`;
  - at least one assembly reaches Calculation Snapshot;
  - report file is written;
  - revision file and revision index are written.
- Run existing verification after implementation slices:
  - `npm test`;
  - `npm run typecheck`;
  - `npm run verify:milestone-1 -- "<private IFC path>"`.

## Out of Scope

- Web UI.
- Express API.
- IFC upload endpoint.
- Async job backend.
- SQLite.
- Full auth.
- PDF export.
- Material Library editing UI.
- Large material database.
- Fuzzy Material Library auto-resolution.
- U-value compliance threshold checks.
- Condensation risk.
- Vapour diffusion.
- Temperature profile.
- Humidity profile.
- Dynamic thermal behavior.
- Density `rho`.
- Specific heat `c`.
- Vapour resistance `mu`.
- Phase shift.
- Heat storage capacity.
- Windows, doors, openings.
- Thermal bridges.
- Solar/shading.
- Whole-building heat-loss report.
- Real deployment.

## Further Notes

Milestone 3 is intentionally not “everything.” It builds the shortest valuable spine:

```text
parser evidence
-> reviewed missing inputs
-> scoped overrides
-> revision
-> U-value/R-value calculation
-> HTML report
```

The first demo can use the private Barclay IFC if enough parser evidence exists after Milestone 2, or a synthetic layered fixture if Barclay remains too evidence-poor. Either way, the acceptance bar is one assembly reaching a trustworthy Calculation Snapshot after scripted user input.

Context files to read before implementation:

- `CONTEXT.md`
- `UBIQUITOUS_LANGUAGE.md`
- `context/roadmap.md`
- `context/prds/milestone-2-calculation-input-parser.md`
- `context/specs/module-architecture.md`
- `context/specs/v1-system-design.md`
- `context/specs/ifc-evidence-extractor.md`

First likely implementation issue:

```text
Create the Review + Calculation core domain models and a demo workflow using a scripted review input fixture, proving one layered assembly can receive lambda/thickness/surface profile inputs, create a revision, calculate U/R value, and write a report.
```
