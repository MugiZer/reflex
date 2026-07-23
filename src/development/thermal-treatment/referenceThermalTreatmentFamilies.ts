import { createThermalTreatmentFamilyRegistry } from "../../domain/thermal-treatment/createThermalTreatmentFamilyRegistry.js";
import type { ThermalTreatmentFamily, ThermalTreatmentInputDefinition, ThermalTreatmentInputValue, ThermalTreatmentPackSet, ThermalTreatmentValidationIssue } from "../../domain/thermal-treatment/thermalTreatmentTypes.js";

export type DevelopmentReferenceThermalTreatmentFamily = ThermalTreatmentFamily & {
  readonly developmentOnly: true;
  readonly matchingEvidence: readonly string[];
  readonly referenceConfirmedInputs: Record<string, number>;
};

const railInputs: readonly ThermalTreatmentInputDefinition[] = [
  { key: "railSpacingMm", label: "Rail spacing", unit: "mm", required: true, critical: true, evidenceRequirements: ["fabrication schedule", "user confirmation"], fallbackEstimate: { value: 600, basis: "development reference geometry" } },
  { key: "railDepthMm", label: "Rail depth", unit: "mm", required: true, critical: true, evidenceRequirements: ["fabrication schedule", "user confirmation"], fallbackEstimate: { value: 100, basis: "development reference geometry" } },
];
const steelStudInputs: readonly ThermalTreatmentInputDefinition[] = [
  { key: "studSpacingMm", label: "Stud spacing", unit: "mm", required: true, critical: true, evidenceRequirements: ["framing schedule", "user confirmation"], fallbackEstimate: { value: 600, basis: "development reference geometry" } },
  { key: "studFlangeWidthMm", label: "Stud flange width", unit: "mm", required: true, critical: true, evidenceRequirements: ["framing schedule", "user confirmation"], fallbackEstimate: { value: 50, basis: "development reference geometry" } },
  { key: "cavityInsulationLambdaWPerMK", label: "Cavity insulation lambda", unit: "W/mK", required: true, critical: true, evidenceRequirements: ["material schedule", "user confirmation"], fallbackEstimate: { value: 0.04, basis: "development reference material" } },
];

const railPacks = developmentPacks(railInputs, { railSpacingMm: { minimum: 300, maximum: 1600 }, railDepthMm: { minimum: 25, maximum: 300 } }, { railSpacingMm: 600, railDepthMm: 100 });
const steelStudPacks = developmentPacks(steelStudInputs, { studSpacingMm: { minimum: 300, maximum: 900 }, studFlangeWidthMm: { minimum: 20, maximum: 100 }, cavityInsulationLambdaWPerMK: { minimum: 0.02, maximum: 0.1 } }, { studSpacingMm: 600, studFlangeWidthMm: 50, cavityInsulationLambdaWPerMK: 0.04 });

export const developmentReferenceThermalTreatmentFamilies: readonly DevelopmentReferenceThermalTreatmentFamily[] = [
  {
    identity: { familyId: "development-continuous-rail", familyVersion: "1.0.0" },
    packs: railPacks,
    developmentOnly: true,
    matchingEvidence: ["material label contains rail", "repeating conductive component evidence"],
    referenceConfirmedInputs: { railSpacingMm: 600, railDepthMm: 100 },
    matchOpportunity: ({ evidence }) => matchReferenceFamily(evidence.materialNames, "rail", railInputs, "material_name_matches_rail"),
    requiredInputs: () => [...railPacks.knowledgePack.parameters],
    validateConfirmedInputs: ({ confirmedInputs }) => boundedPositiveNumberIssues(confirmedInputs, railInputs, { railSpacingMm: 2000, railDepthMm: 400 }),
    buildAnalysisModel: ({ assemblyGroupId, confirmedInputs }) => ({
      assemblyGroupId,
      treatmentFamily: { familyId: "development-continuous-rail", familyVersion: "1.0.0" },
      confirmedInputs,
      model: { rail: { spacingMm: confirmedInputs.railSpacingMm!, depthMm: confirmedInputs.railDepthMm! }, boundary: { direction: "through-wall" } },
      assumptions: ["Development-only continuous rail reference model."],
      provenance: ["Development reference rail adapter."],
    }),
  },
  {
    identity: { familyId: "development-insulated-steel-stud", familyVersion: "1.0.0" },
    packs: steelStudPacks,
    developmentOnly: true,
    matchingEvidence: ["material label contains stud", "cavity insulation evidence"],
    referenceConfirmedInputs: { studSpacingMm: 600, studFlangeWidthMm: 50, cavityInsulationLambdaWPerMK: 0.04 },
    matchOpportunity: ({ evidence }) => matchReferenceFamily(evidence.materialNames, "stud", steelStudInputs, "material_name_matches_stud"),
    requiredInputs: () => [...steelStudPacks.knowledgePack.parameters],
    validateConfirmedInputs: ({ confirmedInputs }) => boundedPositiveNumberIssues(confirmedInputs, steelStudInputs, { studSpacingMm: 1200, studFlangeWidthMm: 150, cavityInsulationLambdaWPerMK: 0.2 }),
    buildAnalysisModel: ({ assemblyGroupId, confirmedInputs }) => ({
      assemblyGroupId,
      treatmentFamily: { familyId: "development-insulated-steel-stud", familyVersion: "1.0.0" },
      confirmedInputs,
      model: { stud: { spacingMm: confirmedInputs.studSpacingMm!, flangeWidthMm: confirmedInputs.studFlangeWidthMm! }, cavity: { insulationLambdaWPerMK: confirmedInputs.cavityInsulationLambdaWPerMK! }, boundaryFaces: ["interior", "exterior"] },
      assumptions: ["Development-only insulated steel stud reference model."],
      provenance: ["Development reference steel stud adapter."],
    }),
  },
];

/** Development/test fixture registry. It must not be used to expose supported architect-facing families. */
export const developmentReferenceThermalTreatmentRegistry = createThermalTreatmentFamilyRegistry(developmentReferenceThermalTreatmentFamilies);

function developmentPacks(inputs: readonly ThermalTreatmentInputDefinition[], envelope: ThermalTreatmentPackSet["validationPack"]["supportedParameterEnvelope"], parameters: Record<string, number>): ThermalTreatmentPackSet {
  return {
    codeAdapterVersion: "1.0.0",
    knowledgePack: { version: "1.0.0", parameters: inputs.map((input) => ({ ...input, range: { minimum: 0.0001, maximum: 2000 } })) },
    validationPack: {
      version: "1.0.0",
      supportedParameterEnvelope: envelope,
      referenceCases: [{ caseId: "development-reference", parameters, expectedEffectiveUValueWPerM2K: 0.31, toleranceWPerM2K: 0.001 }],
      compatibleCodeAdapterVersions: ["1.0.0"],
      compatibleWorkers: [{ workerId: "reference-contract-worker", workerVersion: "1.0.0" }],
      approvedForVerification: false,
    },
  };
}

function boundedPositiveNumberIssues(confirmedInputs: Record<string, ThermalTreatmentInputValue>, inputs: readonly ThermalTreatmentInputDefinition[], upperBounds: Record<string, number>): ThermalTreatmentValidationIssue[] {
  return inputs.flatMap((input) => {
    const value = confirmedInputs[input.key];
    const upperBound = upperBounds[input.key]!;
    return typeof value === "number" && value > 0 && value <= upperBound
      ? []
      : [{ inputKey: input.key, message: `${input.label} must be greater than zero and no greater than ${upperBound}.` }];
  });
}
function matchReferenceFamily(materialNames: readonly string[], token: string, inputs: readonly ThermalTreatmentInputDefinition[], reasonCode: string) {
  const matchingNames = materialNames.filter((name) => name.toLowerCase().includes(token));
  if (!matchingNames.length) return null;
  const ambiguous = materialNames.some((name) => name.toLowerCase().includes("rail") && name.toLowerCase().includes("stud"));
  return {
    confidence: ambiguous ? "low" as const : "medium" as const,
    reasonCodes: [reasonCode],
    assumptions: ["Family suggestion is based on IFC material naming and remains unconfirmed."],
    boundaryConditions: { heatFlow: "through-wall" },
    proposedInputs: Object.fromEntries(inputs.map((input) => [input.key, input.fallbackEstimate?.value ?? null])),
    proposedInputEvidence: Object.fromEntries(inputs.map((input) => [input.key, { status: "estimated" as const, detail: input.fallbackEstimate?.basis ?? "No direct IFC fabrication evidence." }])),
  };
}