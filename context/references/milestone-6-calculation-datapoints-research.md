# Milestone 6 Calculation Datapoints - Research Notes

## Purpose
Capture what Milestone 6 should extract or request for broader calculations after the U-value core loop is verified.

## Milestone 6 Direction
Milestone 6 expands from U-value into:

```text
Broader IFC Coverage + More Calculations + Product Hardening
```

Start only after:

```text
npm run verify:e2e
```

passes.

## Calculation Module Priority
### 1. Temperature Profile
Temperature profile is the first added calculation because it reuses the existing layered U-value model.

Needed:

- layer order.
- layer thickness.
- layer lambda.
- layer R-values.
- total R-value.
- indoor temperature.
- outdoor temperature.
- surface resistance profile.
- boundary temperatures at layer interfaces.

Likely sources:

- IFC layer/material evidence for layers, thickness, materials.
- Material Library or User Input for lambda.
- User Input or project assumptions for indoor/outdoor temperatures.
- explicit Surface Resistance Profile for `Rsi` and `Rse`.

### 2. Vapour / Condensation Light
Vapour and condensation should come after temperature profile because it needs the temperature profile plus more moisture datapoints.

Needed:

- layer order.
- layer thickness.
- layer lambda.
- temperature profile.
- `mu` or `sd` per layer.
- indoor relative humidity.
- outdoor relative humidity.
- vapour pressure assumptions.
- surface/climate assumptions.

Likely sources:

- IFC material hygroscopic property candidates.
- Material Library.
- User Input.
- explicit assumptions.

### 3. Heat Storage Basics
Heat storage should come after temperature profile and basic moisture flow unless fast to add.

Needed:

- layer thickness.
- material density `rho`.
- specific heat capacity `c`.
- material identity.

Likely sources:

- IFC material common/thermal property candidates.
- Material Library.
- User Input.

### 4. Dynamic / Phase Shift
Dynamic behavior and phase shift are later. They need more physics, more assumptions, and more validation.

Needed later:

- density `rho`.
- specific heat capacity `c`.
- layer thickness.
- lambda.
- time/climate assumptions.
- calculation method selection.

## IFC Datapoints To Extract
### Layer And Material Structure
Extract or preserve:

- layer order.
- layer thickness.
- material name/id.
- material category.
- layer category.
- `IsVentilated`.
- layer priority.
- layer set direction.
- direction sense.
- offset from reference line.
- reference extent.
- project units.
- property units.

Primary IFC structures:

- `IfcMaterial`.
- `IfcMaterialLayer`.
- `IfcMaterialLayerSet`.
- `IfcMaterialLayerSetUsage`.
- `IfcMaterialConstituent`.
- `IfcMaterialConstituentSet`.
- `IfcMaterialProfile`.
- `IfcMaterialProfileSet`.
- `IfcMaterialProperties`.

### Pset_MaterialThermal
Extract as fixed evidence when tied to material definition through official material property paths and unit is clear.

Extract as candidate evidence when found through loose/custom psets or unclear source.

Fields:

- `ThermalConductivity` -> lambda for U-value and temperature profile.
- `SpecificHeatCapacity` -> heat storage and dynamic behavior.

### Pset_MaterialCommon
Fields:

- `MassDensity` -> heat storage and dynamic behavior.
- `Porosity` -> possible moisture-related candidate later.

### Pset_MaterialHygroscopic
Fields:

- `UpperVaporResistanceFactor`.
- `LowerVaporResistanceFactor`.
- `VaporPermeability`.
- `MoistureDiffusivity`.
- `IsothermalMoistureCapacity`.

Use for:

- vapour/condensation light.
- future hygrothermal calculation.

### Generic Or Custom Psets/Qsets
Capture as candidate evidence, not fixed truth, unless a later rule explicitly promotes it.

Candidate names:

- `ThermalConductivity`.
- `Conductivity`.
- `Lambda`.
- `KValue`.
- `K-Value`.
- `ThermalTransmittance`.
- `UValue`.
- `U-Value`.
- `ThermalResistance`.
- `RValue`.
- `R-Value`.
- `VaporResistanceFactor`.
- `VapourResistanceFactor`.
- `Mu`.
- `Sd`.
- `VaporPermeability`.
- `VapourPermeability`.
- `MassDensity`.
- `Density`.
- `SpecificHeatCapacity`.
- `SpecificHeat`.
- `HeatCapacity`.
- `RelativeHumidity`.
- `IndoorRH`.
- `OutdoorRH`.
- `Temperature`.
- `IndoorTemperature`.
- `OutdoorTemperature`.

## Datapoints User Or Library Must Often Supply
IFC often does not reliably provide:

- lambda.
- `mu` or `sd`.
- density `rho`.
- specific heat capacity `c`.
- indoor temperature.
- outdoor temperature.
- indoor RH.
- outdoor RH.
- surface resistance profile.
- climate/month profile.

Rule:

```text
extract candidates from IFC
resolve exact material/library values when safe
ask user when needed
show assumptions in report
```

## Calculation Datapoint Registry
Milestone 6 should add a registry instead of scattering property names across extractors.

Shape:

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

Initial keys:

- `lambda`.
- `specificHeatCapacity`.
- `massDensity`.
- `vaporResistanceFactor`.
- `vaporPermeability`.
- `moistureDiffusivity`.
- `isothermalMoistureCapacity`.
- `indoorTemperature`.
- `outdoorTemperature`.
- `indoorRelativeHumidity`.
- `outdoorRelativeHumidity`.
- `surfaceResistanceProfile`.

## Extraction Rules
- Official material property paths come first.
- Custom pset/qset aliases become candidate evidence.
- Candidate evidence never becomes fixed truth without confirmation or explicit safe rule.
- Missing required datapoints become Requested Inputs.
- Every fixed/candidate/missing datapoint must carry provenance or assumption source.
- Reports must show assumptions and warnings for every non-IFC value.

## Sources
- buildingSMART `IfcMaterial`: https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/HTML/lexical/IfcMaterial.htm
- buildingSMART `IfcMaterialProperties`: https://standards.buildingsmart.org/IFC/RELEASE/IFC4/FINAL/HTML/schema/ifcmaterialresource/lexical/ifcmaterialproperties.htm
- buildingSMART `Pset_MaterialThermal`: https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/Pset_MaterialThermal.htm
- buildingSMART `Pset_MaterialCommon`: https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/Pset_MaterialCommon.htm
- buildingSMART Material Property Sets concept: https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/concepts/Object_Definition/Property_Sets/Property_Sets_for_Materials/content.html
- ISO 6946 thermal resistance/transmittance calculation standard: https://www.iso.org/standard/65708.html
- ISO 13788 surface humidity and interstitial condensation calculation methods: https://www.iso.org/standard/51615.html
