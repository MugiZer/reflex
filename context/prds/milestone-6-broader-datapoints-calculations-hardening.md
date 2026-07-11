# Milestone 6 PRD - Broader Datapoints + More Calculations + Product Hardening

## Problem Statement

Milestones 1-5 build and protect the core product loop: IFC evidence extraction, calculation input evidence, review, revisions, U-value/R-value calculation, report generation, web upload/review/report flow, and end-to-end verification.

After `verify:e2e` is green, the next value is not broader SaaS infrastructure. The next value is making the prototype credible on more real colleague IFCs and showing more thermal insight than a single U-value.

Milestone 6 must broaden datapoint extraction, add more calculations, and harden the local product experience without breaking the core loop or overbuilding auth, deployment, PDF, or unrelated product surfaces.

## Solution

Build **Broader Datapoints + More Calculations + Product Hardening**.

Milestone 6 will:

- add temperature profile as the first new calculation after U-value/R-value;
- optionally add vapour/condensation light if temperature profile is stable and `verify:e2e` stays green;
- optionally add heat storage basics if low-risk;
- broaden material/property datapoint coverage before adding new top-level element classes;
- add a Calculation Datapoint Registry so property aliases and calculation requirements are not scattered across extractors;
- improve UI states and error clarity for colleague demos;
- keep localhost-only, no auth, no deployment, no PDF unless trivial/free;
- keep `verify:e2e` as the gate.

Milestone 6 should move fast but only on top of verifier protection.

## User Stories

1. As a colleague, I want the report to show temperature profile, so that I can see how temperature changes through the assembly layers.
2. As a colleague, I want temperature profile assumptions shown, so that indoor/outdoor temperatures and surface resistance choices are explicit.
3. As a colleague, I want missing temperature inputs to become clear questions, so that I can provide the values needed for the calculation.
4. As a colleague, I want vapour/condensation light if available, so that I can see early moisture risk signals.
5. As a colleague, I want vapour assumptions and missing datapoints shown, so that moisture results are not fake precision.
6. As a colleague, I want heat storage basics if available, so that I can see whether material density/specific heat data affects the assembly.
7. As a colleague, I want reports to show U-value plus added calculation sections, so that the product feels more valuable than a single number.
8. As a developer, I want each new calculation module to declare required datapoints, so that missing inputs are systematic.
9. As a developer, I want missing datapoints for new calculations to become Requested Inputs, so that Review can reuse the same flow.
10. As a developer, I want each added calculation to preserve provenance, assumptions, and warnings, so that trust model stays intact.
11. As a developer, I want temperature profile to reuse the layered U-value model, so that the first expansion is low complexity.
12. As a developer, I want vapour/condensation to depend on temperature profile, so that calculation order is explicit.
13. As a developer, I want heat storage basics to use density and specific heat datapoints, so that future dynamic behavior has a foundation.
14. As a developer, I want calculation result shape to support multiple sections, so that added calculations do not break existing report contracts.
15. As a developer, I want material property psets captured more broadly, so that real IFC exports provide more useful candidates.
16. As a developer, I want `Pset_MaterialThermal` captured, so that `ThermalConductivity` and `SpecificHeatCapacity` can feed calculations.
17. As a developer, I want `Pset_MaterialCommon` captured, so that `MassDensity` and `Porosity` can support heat/moisture features.
18. As a developer, I want `Pset_MaterialHygroscopic` captured, so that vapour/condensation light has candidate datapoints.
19. As a developer, I want custom pset/qset aliases captured as candidate evidence, so that messy IFC files can still help review.
20. As a developer, I want candidate evidence to stay candidate evidence, so that uncertain property names are not treated as fixed truth.
21. As a developer, I want better unit normalization, so that added calculations use consistent SI values.
22. As a developer, I want schema variants for the same evidence paths, so that more real IFCs work without separate parser forks.
23. As a developer, I want messy export tolerance improved, so that colleagues' IFCs fail with guidance instead of crashing.
24. As a developer, I want property/datapoint coverage broadened before element classes, so that scope stays focused.
25. As a developer, I want no new top-level element classes in Milestone 6, so that windows/doors/openings/thermal bridges do not explode scope.
26. As a colleague, I want clearer failed Job states, so that I understand what went wrong.
27. As a colleague, I want clearer empty states, so that first use is not confusing.
28. As a colleague, I want clearer review completion state, so that I know when enough inputs were supplied.
29. As a colleague, I want clearer report-ready state, so that I know where to go next.
30. As a colleague, I want clearer error messages, so that I can retry or fix input.
31. As a developer, I want `verify:e2e` to remain green after each calculation/datapoint expansion, so that Milestone 6 does not break the core loop.
32. As a developer, I want regression tests for new datapoint aliases, so that extracted candidates stay stable.
33. As a developer, I want no auth in Milestone 6, so that local prototype speed stays high.
34. As a developer, I want no deployment in Milestone 6, so that private IFCs remain local.
35. As a developer, I want no PDF unless trivial/free, so that report HTML remains source of truth.
36. As a partner reviewing the project, I want to see U-value plus temperature profile and better real-IFC tolerance, so that the prototype feels closer to product depth.

## Implementation Decisions

- Milestone 6 starts only after `npm run verify:e2e` passes.
- Milestone 6 is **Broader Datapoints + More Calculations + Product Hardening**.
- Add calculations in priority order:
  1. temperature profile;
  2. vapour/condensation light if time and low-risk;
  3. heat storage basics if time and low-risk;
  4. dynamic/phase shift later, not primary Milestone 6.
- Every new calculation module must declare required datapoints.
- Missing datapoints must become Requested Inputs.
- Reports must show assumptions and warnings for every non-IFC value.
- `verify:e2e` must stay green after each new calculation slice.
- Temperature profile required datapoints:
  - layer order;
  - layer thickness;
  - layer lambda;
  - layer R-values;
  - total R-value;
  - indoor temperature;
  - outdoor temperature;
  - surface resistance profile;
  - boundary temperatures at layer interfaces.
- Vapour/condensation light required datapoints:
  - layer order;
  - layer thickness;
  - layer lambda;
  - temperature profile;
  - `mu` or `sd` per layer;
  - indoor relative humidity;
  - outdoor relative humidity;
  - vapour pressure assumptions;
  - surface/climate assumptions.
- Heat storage basics required datapoints:
  - layer thickness;
  - material density `rho`;
  - specific heat capacity `c`;
  - material identity.
- Broaden datapoint/property coverage first, not top-level element classes.
- Do broaden:
  - material property psets;
  - candidate property aliases;
  - unit normalization;
  - IFC schema variants for same evidence paths;
  - messy export tolerance.
- Do not broaden yet:
  - new top-level element classes;
  - windows;
  - doors;
  - openings;
  - thermal bridges;
  - whole-building areas.
- Add a Calculation Datapoint Registry.
- Registry shape:

```text
CalculationDatapointDefinition {
  key
  neededFor
  officialIfcPaths
  candidatePropertyNames
  unit
  askableByUser
  libraryResolvable
}
```

- Initial registry keys:
  - `lambda`;
  - `specificHeatCapacity`;
  - `massDensity`;
  - `vaporResistanceFactor`;
  - `vaporPermeability`;
  - `moistureDiffusivity`;
  - `isothermalMoistureCapacity`;
  - `indoorTemperature`;
  - `outdoorTemperature`;
  - `indoorRelativeHumidity`;
  - `outdoorRelativeHumidity`;
  - `surfaceResistanceProfile`.
- Extract or preserve layer/material structure:
  - layer order;
  - layer thickness;
  - material name/id;
  - material category;
  - layer category;
  - `IsVentilated`;
  - layer priority;
  - layer set direction;
  - direction sense;
  - offset from reference line;
  - reference extent;
  - project units;
  - property units.
- Capture official material property sets where possible:
  - `Pset_MaterialThermal`;
  - `Pset_MaterialCommon`;
  - `Pset_MaterialHygroscopic`.
- `Pset_MaterialThermal` fields:
  - `ThermalConductivity` -> lambda;
  - `SpecificHeatCapacity` -> heat storage/dynamic basics.
- `Pset_MaterialCommon` fields:
  - `MassDensity` -> heat storage/dynamic basics;
  - `Porosity` -> moisture candidate later.
- `Pset_MaterialHygroscopic` fields:
  - `UpperVaporResistanceFactor`;
  - `LowerVaporResistanceFactor`;
  - `VaporPermeability`;
  - `MoistureDiffusivity`;
  - `IsothermalMoistureCapacity`.
- Generic/custom psets/qsets are candidate evidence unless a later rule explicitly promotes them.
- Candidate aliases include:
  - `ThermalConductivity`;
  - `Conductivity`;
  - `Lambda`;
  - `KValue`;
  - `K-Value`;
  - `ThermalTransmittance`;
  - `UValue`;
  - `U-Value`;
  - `ThermalResistance`;
  - `RValue`;
  - `R-Value`;
  - `VaporResistanceFactor`;
  - `VapourResistanceFactor`;
  - `Mu`;
  - `Sd`;
  - `VaporPermeability`;
  - `VapourPermeability`;
  - `MassDensity`;
  - `Density`;
  - `SpecificHeatCapacity`;
  - `SpecificHeat`;
  - `HeatCapacity`;
  - `RelativeHumidity`;
  - `IndoorRH`;
  - `OutdoorRH`;
  - `Temperature`;
  - `IndoorTemperature`;
  - `OutdoorTemperature`.
- Product hardening focuses on:
  - empty states;
  - failed Job state;
  - review completion state;
  - report-ready state;
  - error messages;
  - review clarity;
  - report clarity;
  - verifier stability.
- No PDF in Milestone 6 unless trivial/free.
- No deployment in Milestone 6.
- No auth in Milestone 6.
- Keep no-singleton design:
  - no global active Job;
  - no global active Revision outside Job scope;
  - no browser localStorage as source of truth.

## Testing Decisions

- Milestone 6 must start with `verify:e2e` green.
- Each new calculation slice must preserve:
  - `npm test`;
  - `npm run typecheck`;
  - `npm run verify:e2e`.
- Test new calculations through public calculation module interfaces.
- Test temperature profile:
  - layer boundary temperatures are calculated from layer R-values;
  - indoor/outdoor temperature assumptions are recorded;
  - surface resistance profile is included;
  - missing indoor/outdoor temperature produces Requested Input or explicit assumption;
  - report shows temperature profile section.
- Test vapour/condensation light only if implemented:
  - missing `mu`/`sd` creates Requested Input;
  - RH assumptions are recorded;
  - result section warns when confidence is low.
- Test heat storage basics only if implemented:
  - density and specific heat are required;
  - missing values create Requested Inputs;
  - result section shows assumptions/provenance.
- Test Calculation Datapoint Registry:
  - each key declares needed calculations;
  - candidate aliases classify expected fields;
  - askable/library-resolvable flags drive review behavior.
- Test extractor/datapoint broadening:
  - `Pset_MaterialThermal.ThermalConductivity`;
  - `Pset_MaterialThermal.SpecificHeatCapacity`;
  - `Pset_MaterialCommon.MassDensity`;
  - `Pset_MaterialHygroscopic` vapour fields;
  - generic aliases remain candidates unless official path/rule says fixed.
- Test UI hardening:
  - empty state renders;
  - failed Job state renders visible error;
  - review completion state is clear;
  - report-ready state is clear.
- Regression tests must prove no candidate evidence becomes fixed truth accidentally.

## Out of Scope

- New top-level element classes.
- Windows.
- Doors.
- Openings.
- Thermal bridges.
- Whole-building areas.
- Whole-building heat-loss report.
- Dynamic thermal behavior as primary scope.
- Phase shift as primary scope.
- PDF export unless trivial/free.
- Deployment.
- Auth.
- Teams.
- Billing.
- Admin dashboard.
- Advanced analytics.
- Cloud queues/storage.
- Full material database.
- Perfect UI polish.

## Further Notes

Milestone 6 should make the prototype look deeper without making it bloated. The strongest path is:

```text
U-value core stays green
temperature profile appears in report
more material datapoints are captured
UI states feel safer
verify:e2e protects the loop
```

Acceptance demo:

```text
1. verify:e2e passes.
2. Upload fixture/IFC.
3. Review completes one assembly.
4. Report shows U-value.
5. Report also shows temperature profile.
6. If vapour/heat storage added, report shows those sections too.
7. UI states are clear for failed/empty/needs_review/completed.
8. New datapoint extraction/candidate aliases have regression tests.
```

Context files to read before implementation:

- `CONTEXT.md`
- `UBIQUITOUS_LANGUAGE.md`
- `context/roadmap.md`
- `context/prds/milestone-2-calculation-input-parser.md`
- `context/prds/milestone-3-review-calculation-report-core.md`
- `context/prds/milestone-4-thin-web-app-async-job-backend.md`
- `context/prds/milestone-5-e2e-verifier-regression-harness.md`
- `context/references/milestone-6-calculation-datapoints-research.md`
- `context/specs/module-architecture.md`
- `context/specs/v1-system-design.md`

First likely implementation issue:

```text
Add Calculation Datapoint Registry and temperature profile module, then render temperature profile in the existing report while keeping verify:e2e green.
```
