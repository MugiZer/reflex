import { describe, expect, it } from "vitest";
import { buildThermalTreatmentConfirmationCards, detectThermalTreatmentOpportunities } from "../src/domain/thermal-treatment/detectThermalTreatmentOpportunities.js";
import { runThermalTreatment } from "../src/domain/thermal-treatment/runThermalTreatment.js";
import { continuousZGirtFamily, continuousZGirtFamilyRegistry, referenceConfirmedInputs } from "../src/domain/thermal-treatment/families/continuousZGirtFamily.js";
import { OpenSource2dCalculationWorker } from "../src/infrastructure/thermal-treatment/OpenSource2dCalculationWorker.js";

describe("continuous Z-girt supported family", () => {
  it("builds an actual repeating Z profile from confirmed layers and runs unchanged through the generic worker", async () => {
    const model = continuousZGirtFamily.buildAnalysisModel({ assemblyGroupId: "ag_z", confirmedInputs: referenceConfirmedInputs });
    expect(model.model.zGirt).toMatchObject({ profile: "parameterized-stepped-z", thermalBreak: null });
    expect(model.model.twoDimensionalThermalModel?.regions).toBeDefined();
    expect(model.model.twoDimensionalThermalModel!.regions.length).toBeGreaterThan(10);
    const result = await runThermalTreatment({ assemblyGroupId: "ag_z", selection: { ...continuousZGirtFamily.identity, confirmedInputs: referenceConfirmedInputs }, registry: continuousZGirtFamilyRegistry, worker: new OpenSource2dCalculationWorker() });
    expect(result.record.trustState).toBe("verified");
    expect(result.result.validity).toEqual({ isValid: true, diagnostics: [] });
  });

  it("requires thermal-break geometry and conductivity only when a break is explicitly confirmed", () => {
    expect(continuousZGirtFamily.validateConfirmedInputs({ confirmedInputs: { ...referenceConfirmedInputs, thermalBreakPresent: true } })).toEqual(expect.arrayContaining([expect.objectContaining({ inputKey: "thermalBreakLengthMm" }), expect.objectContaining({ inputKey: "thermalBreakConductivityWPerMK" })]));
    const model = continuousZGirtFamily.buildAnalysisModel({ assemblyGroupId: "ag_break", confirmedInputs: { ...referenceConfirmedInputs, thermalBreakPresent: true, thermalBreakLengthMm: 20, thermalBreakConductivityWPerMK: 0.2 } });
    expect(model.model.zGirt).toMatchObject({ thermalBreak: { conductivityWPerMK: 0.2 } });
  });

  it("uses IFC Z-girt labels only as an unsafe suggestion and exposes unresolved critical inputs", () => {
    const evidence = { elementStepId: 1, elementGlobalId: "wall-1", elementName: "Wall", elementClass: "IfcWall" as const, calculationInputBasis: "layered_needs_material_resolution" as const, fixedInputs: [{ field: "layer_material_name" as const, value: "Z fixation rail", source: "ifc_fixed" as const, confidence: "high" as const, evidenceReferences: [], reason: "IFC label", layer: { layerIndex: 0, layerStepId: 1, materialName: "Z fixation rail" } }], candidateInputs: [], missingInputs: [], diagnostics: [] };
    const suggestions = detectThermalTreatmentOpportunities({ calculationInputEvidence: [evidence], registry: continuousZGirtFamilyRegistry }).suggestions;
    expect(suggestions[0]).toMatchObject({ family: continuousZGirtFamily.identity, reasonCodes: ["ifc_label_suggests_continuous_z_girt"] });
    expect(suggestions[0]?.proposedInputEvidence.zDepthMm).toMatchObject({ status: "estimated" });
    const [card] = buildThermalTreatmentConfirmationCards({ suggestions, registry: continuousZGirtFamilyRegistry });
    expect(card?.criticalInputs.some((input) => input.status !== "confirmed")).toBe(true);
  });
});
