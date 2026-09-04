import { createThermalTreatmentFamilyRegistry } from "../createThermalTreatmentFamilyRegistry.js";
import type { ThermalTreatmentFamily, ThermalTreatmentFamilyMatch, ThermalTreatmentInputDefinition, ThermalTreatmentInputValue, ThermalTreatmentPackSet, ThermalTreatmentValidationIssue, ThermalTreatmentTwoDimensionalRegion } from "../thermalTreatmentTypes.js";

export type ConfirmedWallLayer = { materialName: string; thicknessMm: number; conductivityWPerMK: number };

const identity = { familyId: "continuous-z-girt", familyVersion: "1.0.0" } as const;
const inputs: readonly ThermalTreatmentInputDefinition[] = [
  { key: "wallLayerStackJson", label: "Ordered wall layers", unit: "JSON", required: true, critical: true, evidenceRequirements: ["confirmed IFC layer stack", "architect confirmation"] },
  { key: "zDepthMm", label: "Z-girt depth", unit: "mm", required: true, critical: true, evidenceRequirements: ["fabrication schedule", "architect confirmation"] },
  { key: "zInsideFlangeWidthMm", label: "Inside flange width", unit: "mm", required: true, critical: true, evidenceRequirements: ["fabrication schedule", "architect confirmation"] },
  { key: "zOutsideFlangeWidthMm", label: "Outside flange width", unit: "mm", required: true, critical: true, evidenceRequirements: ["fabrication schedule", "architect confirmation"] },
  { key: "steelThicknessMm", label: "Steel gauge thickness", unit: "mm", required: true, critical: true, evidenceRequirements: ["fabrication schedule", "architect confirmation"] },
  { key: "repeatSpacingMm", label: "Z-girt repeat spacing", unit: "mm", required: true, critical: true, evidenceRequirements: ["framing schedule", "architect confirmation"] },
  { key: "steelConductivityWPerMK", label: "Steel conductivity", unit: "W/mK", required: true, critical: true, evidenceRequirements: ["material specification", "architect confirmation"] },
  { key: "placementOrientation", label: "Placement and orientation", unit: "inside-to-outside", required: true, critical: true, evidenceRequirements: ["detail drawing", "architect confirmation"] },
  { key: "insideAirTemperatureC", label: "Inside air temperature", unit: "Â°C", required: true, critical: true, evidenceRequirements: ["project boundary condition", "architect confirmation"] },
  { key: "outsideAirTemperatureC", label: "Outside air temperature", unit: "Â°C", required: true, critical: true, evidenceRequirements: ["project boundary condition", "architect confirmation"] },
  { key: "insideSurfaceResistanceM2KPerW", label: "Inside surface resistance", unit: "mÂ²K/W", required: true, critical: true, evidenceRequirements: ["project boundary condition", "architect confirmation"] },
  { key: "outsideSurfaceResistanceM2KPerW", label: "Outside surface resistance", unit: "mÂ²K/W", required: true, critical: true, evidenceRequirements: ["project boundary condition", "architect confirmation"] },
  { key: "thermalBreakPresent", label: "Thermal break present", unit: "yes/no", required: true, critical: true, evidenceRequirements: ["detail drawing", "architect confirmation"] },
  { key: "thermalBreakLengthMm", label: "Thermal break length", unit: "mm", required: false, critical: true, evidenceRequirements: ["thermal-break detail", "architect confirmation"], applicableWhen: { inputKey: "thermalBreakPresent", equals: true } },
  { key: "thermalBreakConductivityWPerMK", label: "Thermal break conductivity", unit: "W/mK", required: false, critical: true, evidenceRequirements: ["thermal-break specification", "architect confirmation"], applicableWhen: { inputKey: "thermalBreakPresent", equals: true } },
];

const packs: ThermalTreatmentPackSet = {
  codeAdapterVersion: "1.0.0",
  knowledgePack: { version: "1.0.0", presentation: { familyLabel: "Continuous Z-girt / rail", summary: "A repeating steel Z-girt or rail is suggested by the IFC layer evidence." }, parameters: inputs.map((input) => ({ ...input, range: input.key === "placementOrientation" || input.key === "thermalBreakPresent" || input.key === "wallLayerStackJson" ? undefined : { minimum: 0.0001, maximum: 100_000 } })) },
  validationPack: {
    version: "1.0.0",
    supportedParameterEnvelope: {
      zDepthMm: { minimum: 50, maximum: 300 }, zInsideFlangeWidthMm: { minimum: 20, maximum: 100 }, zOutsideFlangeWidthMm: { minimum: 20, maximum: 100 }, steelThicknessMm: { minimum: 0.5, maximum: 3 }, repeatSpacingMm: { minimum: 300, maximum: 1_200 }, steelConductivityWPerMK: { minimum: 10, maximum: 80 }, insideAirTemperatureC: { minimum: 10, maximum: 35 }, outsideAirTemperatureC: { minimum: -40, maximum: 20 }, insideSurfaceResistanceM2KPerW: { minimum: 0.05, maximum: 0.25 }, outsideSurfaceResistanceM2KPerW: { minimum: 0.01, maximum: 0.1 }, placementOrientation: { allowedValues: ["inside_to_outside"] }, thermalBreakPresent: { allowedValues: [true, false] }, thermalBreakLengthMm: { minimum: 1, maximum: 100, allowedValues: [null] }, thermalBreakConductivityWPerMK: { minimum: 0.02, maximum: 1, allowedValues: [null] },
    },
    referenceCases: [{ caseId: "insulated-wall-z-girt-without-thermal-break", parameters: { zDepthMm: 140, repeatSpacingMm: 600, steelThicknessMm: 1.5 }, expectedEffectiveUValueWPerM2K: 0.55, toleranceWPerM2K: 0.2 }],
    compatibleCodeAdapterVersions: ["1.0.0"], compatibleWorkers: [{ workerId: "open-source-finite-difference-2d", workerVersion: "1.0.0" }], approvedForVerification: true,
  },
};

export const referenceConfirmedInputs: Record<string, ThermalTreatmentInputValue> = {
  wallLayerStackJson: JSON.stringify([{ materialName: "Gypsum board", thicknessMm: 13, conductivityWPerMK: 0.16 }, { materialName: "Mineral wool", thicknessMm: 140, conductivityWPerMK: 0.04 }, { materialName: "Sheathing", thicknessMm: 12, conductivityWPerMK: 0.2 }]),
  zDepthMm: 140, zInsideFlangeWidthMm: 50, zOutsideFlangeWidthMm: 50, steelThicknessMm: 1.5, repeatSpacingMm: 600, steelConductivityWPerMK: 50, placementOrientation: "inside_to_outside", insideAirTemperatureC: 20, outsideAirTemperatureC: 0, insideSurfaceResistanceM2KPerW: 0.13, outsideSurfaceResistanceM2KPerW: 0.04, thermalBreakPresent: false, thermalBreakLengthMm: null, thermalBreakConductivityWPerMK: null,
};

/** Supported architect-facing continuous steel Z-girt/rail family; all family specifics stay in this adapter. */
export function createContinuousZGirtFamily(command: { identity?: ThermalTreatmentFamily["identity"]; packs?: ThermalTreatmentPackSet } = {}): ThermalTreatmentFamily {
  const familyIdentity = command.identity ?? identity;
  const familyPacks = command.packs ?? packs;
  return {
  identity: familyIdentity, packs: familyPacks,
  matchOpportunity: ({ evidence }) => matchOpportunity(evidence.materialNames, evidence.calculationInputEvidence),
  requiredInputs: () => inputs.map((input) => ({ ...input })),
  validateConfirmedInputs: ({ confirmedInputs }) => validateInputs(confirmedInputs),
  buildAnalysisModel: ({ assemblyGroupId, confirmedInputs }) => buildAnalysisModel(assemblyGroupId, confirmedInputs, familyIdentity),
  };
}

export const continuousZGirtFamily = createContinuousZGirtFamily();

export const continuousZGirtFamilyRegistry = createThermalTreatmentFamilyRegistry([continuousZGirtFamily]);

function matchOpportunity(materialNames: readonly string[], evidence: readonly { fixedInputs: readonly { field: string; value: unknown; layer?: { layerIndex: number; materialName: string | null } }[]; candidateInputs: readonly { field: string; value: unknown; layer?: { layerIndex: number; materialName: string | null } }[] }[]): ThermalTreatmentFamilyMatch | null {
  const matched = materialNames.filter((name) => /\b(z[ -]?(?:girt|bar|rail|fixation)|girt|rail)\b/i.test(name));
  if (!matched.length) return null;
  const layers = layersFromEvidence(evidence);
  const proposedInputs: Record<string, ThermalTreatmentInputValue> = { ...referenceConfirmedInputs, wallLayerStackJson: layers ? JSON.stringify(layers) : null };
  const proposedInputEvidence: Record<string, { status: "confirmed" | "estimated" | "missing" | "conflicting"; detail: string }> = Object.fromEntries(inputs.map((input) => [input.key, { status: "missing" as const, detail: `Confirm ${input.label}; IFC labels do not prove fabrication geometry.` }]));
  proposedInputEvidence.wallLayerStackJson = layers
    ? { status: "confirmed", detail: "Ordered wall layers were recovered from IFC layer evidence." }
    : { status: "missing", detail: "Confirm the ordered wall layers before calculation." };
  for (const key of Object.keys(proposedInputs).filter((key) => key !== "wallLayerStackJson")) proposedInputEvidence[key] = { status: "estimated", detail: `Unsafe estimate only: ${inputs.find((input) => input.key === key)?.label ?? key} is not proven by IFC labels.` };
  return { confidence: "medium", reasonCodes: ["ifc_label_suggests_continuous_z_girt"], assumptions: ["IFC material naming suggests a continuous Z-girt or rail but does not prove profile geometry."], boundaryConditions: { heatFlow: "through-wall", orientation: "inside_to_outside" }, proposedInputs, proposedInputEvidence };
}

function layersFromEvidence(evidence: readonly { fixedInputs: readonly { field: string; value: unknown; layer?: { layerIndex: number; materialName: string | null } }[]; candidateInputs: readonly { field: string; value: unknown; layer?: { layerIndex: number; materialName: string | null } }[] }[]): ConfirmedWallLayer[] | null {
  const values = evidence.flatMap((item) => [...item.fixedInputs, ...item.candidateInputs]).filter((input) => input.layer);
  const groups = new Map<number, { materialName?: string; thicknessMm?: number; conductivityWPerMK?: number }>();
  for (const input of values) { const group = groups.get(input.layer!.layerIndex) ?? {}; if (input.field === "layer_material_name" && typeof input.value === "string") group.materialName = input.value; if (input.field === "layer_thickness" && typeof input.value === "number") group.thicknessMm = input.value * 1000; if (input.field === "layer_lambda" && typeof input.value === "number") group.conductivityWPerMK = input.value; groups.set(input.layer!.layerIndex, group); }
  const layers = [...groups.entries()].sort(([left], [right]) => left - right).map(([, layer]) => layer);
  return layers.length && layers.every((layer) => layer.materialName && layer.thicknessMm! > 0 && layer.conductivityWPerMK! > 0) ? layers as ConfirmedWallLayer[] : null;
}

function validateInputs(values: Record<string, ThermalTreatmentInputValue>): ThermalTreatmentValidationIssue[] {
  const layers = parseLayers(values.wallLayerStackJson), issues: ThermalTreatmentValidationIssue[] = [];
  if (!layers) issues.push({ inputKey: "wallLayerStackJson", message: "Ordered wall layers must be a JSON array of materialName, positive thicknessMm, and positive conductivityWPerMK." });
  for (const input of inputs.filter((item) => item.required && !["wallLayerStackJson", "thermalBreakPresent", "placementOrientation", "insideAirTemperatureC", "outsideAirTemperatureC"].includes(item.key))) if (!(typeof values[input.key] === "number" && Number(values[input.key]) > 0)) issues.push({ inputKey: input.key, message: `${input.label} must be a positive number.` });
  for (const key of ["insideAirTemperatureC", "outsideAirTemperatureC"]) if (!(typeof values[key] === "number" && Number.isFinite(values[key]))) issues.push({ inputKey: key, message: `${inputs.find((input) => input.key === key)!.label} must be a finite temperature.` });
  if (values.placementOrientation !== "inside_to_outside") issues.push({ inputKey: "placementOrientation", message: "Placement and orientation must be 'inside_to_outside' for this supported family." });
  if (typeof values.thermalBreakPresent !== "boolean") issues.push({ inputKey: "thermalBreakPresent", message: "Thermal break present must be explicitly confirmed as yes or no." });
  if (values.thermalBreakPresent === true) for (const key of ["thermalBreakLengthMm", "thermalBreakConductivityWPerMK"]) if (!(typeof values[key] === "number" && Number(values[key]) > 0)) issues.push({ inputKey: key, message: `${inputs.find((input) => input.key === key)!.label} is required when a thermal break is present.` });
  if (layers && typeof values.zDepthMm === "number" && values.zDepthMm > layers.reduce((sum, layer) => sum + layer.thicknessMm, 0)) issues.push({ inputKey: "zDepthMm", message: "Z-girt depth must fit within the confirmed wall-layer thickness." });
  if (typeof values.zDepthMm === "number" && typeof values.zInsideFlangeWidthMm === "number" && typeof values.zOutsideFlangeWidthMm === "number" && (values.zInsideFlangeWidthMm + values.zOutsideFlangeWidthMm > values.zDepthMm)) issues.push({ inputKey: "zDepthMm", message: "Combined flange widths must not exceed Z-girt depth." });
  if (values.thermalBreakPresent === true && typeof values.thermalBreakLengthMm === "number" && typeof values.zDepthMm === "number" && typeof values.zInsideFlangeWidthMm === "number" && typeof values.zOutsideFlangeWidthMm === "number" && values.thermalBreakLengthMm > values.zDepthMm - values.zInsideFlangeWidthMm - values.zOutsideFlangeWidthMm) issues.push({ inputKey: "thermalBreakLengthMm", message: "Thermal-break length must fit inside the Z-web bridge between the flanges." });
  return issues;
}

function buildAnalysisModel(assemblyGroupId: string, values: Record<string, ThermalTreatmentInputValue>, familyIdentity: ThermalTreatmentFamily["identity"]) {
  const layers = parseLayers(values.wallLayerStackJson)!;
  const widthM = layers.reduce((sum, layer) => sum + layer.thicknessMm, 0) / 1000, heightM = Number(values.repeatSpacingMm) / 1000, thicknessM = Number(values.steelThicknessMm) / 1000;
  const zProfile = zProfileRectangles(Number(values.zDepthMm) / 1000, Number(values.zInsideFlangeWidthMm) / 1000, Number(values.zOutsideFlangeWidthMm) / 1000, thicknessM, heightM);
  const thermalBreak = values.thermalBreakPresent === true ? { xMinM: (Number(values.zDepthMm) / 1000 - Number(values.thermalBreakLengthMm) / 1000) / 2, xMaxM: (Number(values.zDepthMm) / 1000 + Number(values.thermalBreakLengthMm) / 1000) / 2, yMinM: heightM / 2 - thicknessM / 2, yMaxM: heightM / 2 + thicknessM / 2, conductivityWPerMK: Number(values.thermalBreakConductivityWPerMK) } : null;
  const regions = meshedRegions(layers, widthM, heightM, zProfile, Number(values.steelConductivityWPerMK), thermalBreak);
  return { assemblyGroupId, treatmentFamily: familyIdentity, confirmedInputs: values, model: { zGirt: { profile: "parameterized-stepped-z", depthMm: values.zDepthMm, insideFlangeWidthMm: values.zInsideFlangeWidthMm, outsideFlangeWidthMm: values.zOutsideFlangeWidthMm, steelThicknessMm: values.steelThicknessMm, repeatSpacingMm: values.repeatSpacingMm, placementOrientation: values.placementOrientation, thermalBreak }, wallLayers: layers, twoDimensionalThermalModel: { domain: { widthM, heightM }, regions, boundaries: [{ boundaryId: "inside", edge: "left" as const, kind: "surface_resistance" as const, airTemperatureK: Number(values.insideAirTemperatureC) + 273.15, resistanceM2KPerW: Number(values.insideSurfaceResistanceM2KPerW) }, { boundaryId: "outside", edge: "right" as const, kind: "surface_resistance" as const, airTemperatureK: Number(values.outsideAirTemperatureC) + 273.15, resistanceM2KPerW: Number(values.outsideSurfaceResistanceM2KPerW) }], periodicEdges: ["top", "bottom"] as const, solverControls: { maxCellSizeM: 0.02, refinementLevels: 2, convergenceToleranceRelative: 0.2, maxIterations: 100_000, timeoutMilliseconds: 5_000 } } }, assumptions: ["Continuous Z-girt is modeled as a parameterized repeating 2-D Z profile across the confirmed wall layers.", thermalBreak ? "Confirmed thermal break replaces the central Z-web bridge." : "No thermal break is modeled because its absence was explicitly confirmed."], provenance: ["Continuous Z-girt family adapter v1.0.0."] };
}

function zProfileRectangles(depthM: number, insideFlangeM: number, outsideFlangeM: number, thicknessM: number, heightM: number) { const mid = heightM / 2; return [{ xMinM: 0, xMaxM: insideFlangeM, yMinM: 0, yMaxM: thicknessM }, { xMinM: insideFlangeM - thicknessM, xMaxM: insideFlangeM, yMinM: thicknessM, yMaxM: mid - thicknessM / 2 }, { xMinM: insideFlangeM, xMaxM: depthM - outsideFlangeM, yMinM: mid - thicknessM / 2, yMaxM: mid + thicknessM / 2 }, { xMinM: depthM - outsideFlangeM, xMaxM: depthM - outsideFlangeM + thicknessM, yMinM: mid + thicknessM / 2, yMaxM: heightM - thicknessM }, { xMinM: depthM - outsideFlangeM, xMaxM: depthM, yMinM: heightM - thicknessM, yMaxM: heightM }]; }

function meshedRegions(layers: ConfirmedWallLayer[], widthM: number, heightM: number, steel: readonly { xMinM: number; xMaxM: number; yMinM: number; yMaxM: number }[], steelConductivityWPerMK: number, thermalBreak: { xMinM: number; xMaxM: number; yMinM: number; yMaxM: number; conductivityWPerMK: number } | null): ThermalTreatmentTwoDimensionalRegion[] { const xBreaks = [...new Set([0, widthM, ...steel.flatMap((part) => [part.xMinM, part.xMaxM]), ...(thermalBreak ? [thermalBreak.xMinM, thermalBreak.xMaxM] : []), ...layers.reduce<number[]>((points, layer) => { points.push((points.at(-1) ?? 0) + layer.thicknessMm / 1000); return points; }, [0])].map((point) => Math.round(point * 1e9) / 1e9))].sort((a, b) => a - b); const yBreaks = [...new Set([0, heightM, ...steel.flatMap((part) => [part.yMinM, part.yMaxM]), ...(thermalBreak ? [thermalBreak.yMinM, thermalBreak.yMaxM] : [])].map((point) => Math.round(point * 1e9) / 1e9))].sort((a, b) => a - b); const regions: ThermalTreatmentTwoDimensionalRegion[] = []; for (let x = 0; x < xBreaks.length - 1; x++) for (let y = 0; y < yBreaks.length - 1; y++) { const xMinM = xBreaks[x]!, xMaxM = xBreaks[x + 1]!, yMinM = yBreaks[y]!, yMaxM = yBreaks[y + 1]!, centerX = (xMinM + xMaxM) / 2, centerY = (yMinM + yMaxM) / 2; const conductivityWPerMK = thermalBreak && inside(thermalBreak, centerX, centerY) ? thermalBreak.conductivityWPerMK : steel.some((part) => inside(part, centerX, centerY)) ? steelConductivityWPerMK : layerAt(layers, centerX).conductivityWPerMK; regions.push({ regionId: `cell_${x}_${y}`, xMinM, xMaxM, yMinM, yMaxM, conductivityWPerMK }); } return regions; }
function inside(region: { xMinM: number; xMaxM: number; yMinM: number; yMaxM: number }, x: number, y: number) { return x >= region.xMinM && x <= region.xMaxM && y >= region.yMinM && y <= region.yMaxM; }
function layerAt(layers: ConfirmedWallLayer[], x: number) { let edge = 0; for (const layer of layers) { edge += layer.thicknessMm / 1000; if (x <= edge + 1e-12) return layer; } return layers.at(-1)!; }
function parseLayers(value: ThermalTreatmentInputValue | undefined): ConfirmedWallLayer[] | null { if (typeof value !== "string") return null; try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) && parsed.length && parsed.every((layer): layer is ConfirmedWallLayer => typeof layer === "object" && layer !== null && typeof (layer as ConfirmedWallLayer).materialName === "string" && typeof (layer as ConfirmedWallLayer).thicknessMm === "number" && (layer as ConfirmedWallLayer).thicknessMm > 0 && typeof (layer as ConfirmedWallLayer).conductivityWPerMK === "number" && (layer as ConfirmedWallLayer).conductivityWPerMK > 0) ? parsed : null; } catch { return null; } }
