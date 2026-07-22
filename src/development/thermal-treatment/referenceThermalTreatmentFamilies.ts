import { createThermalTreatmentFamilyRegistry } from "../../domain/thermal-treatment/createThermalTreatmentFamilyRegistry.js";
import type { ThermalTreatmentFamily, ThermalTreatmentInputDefinition, ThermalTreatmentInputValue, ThermalTreatmentValidationIssue } from "../../domain/thermal-treatment/thermalTreatmentTypes.js";

export type DevelopmentReferenceThermalTreatmentFamily = ThermalTreatmentFamily & {
  readonly developmentOnly: true;
  readonly matchingEvidence: readonly string[];
  readonly referenceConfirmedInputs: Record<string, number>;
};

const railInputs: readonly ThermalTreatmentInputDefinition[] = [
  { key: "railSpacingMm", label: "Rail spacing (mm)", required: true },
  { key: "railDepthMm", label: "Rail depth (mm)", required: true },
];
const steelStudInputs: readonly ThermalTreatmentInputDefinition[] = [
  { key: "studSpacingMm", label: "Stud spacing (mm)", required: true },
  { key: "studFlangeWidthMm", label: "Stud flange width (mm)", required: true },
  { key: "cavityInsulationLambdaWPerMK", label: "Cavity insulation lambda (W/mK)", required: true },
];

export const developmentReferenceThermalTreatmentFamilies: readonly DevelopmentReferenceThermalTreatmentFamily[] = [
  {
    identity: { familyId: "development-continuous-rail", familyVersion: "1.0.0" },
    developmentOnly: true,
    matchingEvidence: ["material label contains rail", "repeating conductive component evidence"],
    referenceConfirmedInputs: { railSpacingMm: 600, railDepthMm: 100 },
    trustState: "preliminary",
    requiredInputs: () => [...railInputs],
    validateConfirmedInputs: ({ confirmedInputs }) => boundedPositiveNumberIssues(confirmedInputs, railInputs, { railSpacingMm: 1600, railDepthMm: 300 }),
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
    developmentOnly: true,
    matchingEvidence: ["material label contains stud", "cavity insulation evidence"],
    referenceConfirmedInputs: { studSpacingMm: 600, studFlangeWidthMm: 50, cavityInsulationLambdaWPerMK: 0.04 },
    trustState: "preliminary",
    requiredInputs: () => [...steelStudInputs],
    validateConfirmedInputs: ({ confirmedInputs }) => boundedPositiveNumberIssues(confirmedInputs, steelStudInputs, { studSpacingMm: 900, studFlangeWidthMm: 100, cavityInsulationLambdaWPerMK: 0.1 }),
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

function boundedPositiveNumberIssues(confirmedInputs: Record<string, ThermalTreatmentInputValue>, inputs: readonly ThermalTreatmentInputDefinition[], upperBounds: Record<string, number>): ThermalTreatmentValidationIssue[] {
  return inputs.flatMap((input) => {
    const value = confirmedInputs[input.key];
    const upperBound = upperBounds[input.key]!;
    return typeof value === "number" && value > 0 && value <= upperBound
      ? []
      : [{ inputKey: input.key, message: `${input.label} must be greater than zero and no greater than ${upperBound}.` }];
  });
}