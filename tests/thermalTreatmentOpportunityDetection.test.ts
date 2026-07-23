import { describe, expect, it } from "vitest";
import { buildThermalTreatmentConfirmationCards, confirmThermalTreatmentOpportunity, detectThermalTreatmentOpportunities } from "../src/domain/thermal-treatment/detectThermalTreatmentOpportunities.js";
import { developmentReferenceThermalTreatmentRegistry } from "../src/development/thermal-treatment/referenceThermalTreatmentFamilies.js";

const reference = { evidencePath: "IfcMaterialLayerSet.MaterialLayers", sourceStepIds: [101], pathParts: [] };
function evidence(overrides: Partial<{ id: number; name: string; material: string; thickness: number }> = {}) {
  const id = overrides.id ?? 101;
  return {
    elementStepId: id,
    elementGlobalId: `wall-${id}`,
    elementName: overrides.name ?? "North wall",
    elementObjectType: "External wall",
    elementClass: "IfcWall" as const,
    calculationInputBasis: "layered_needs_material_resolution" as const,
    fixedInputs: [
      { field: "layer_material_name" as const, value: overrides.material ?? "Z rail", source: "ifc_fixed" as const, confidence: "high" as const, evidenceReferences: [reference], reason: "IFC material", layer: { layerIndex: 0, layerStepId: id + 1000, materialName: overrides.material ?? "Z rail" } },
      { field: "layer_thickness" as const, value: overrides.thickness ?? 0.1, source: "ifc_fixed" as const, confidence: "high" as const, evidenceReferences: [reference], reason: "IFC thickness", layer: { layerIndex: 0, layerStepId: id + 1000, materialName: overrides.material ?? "Z rail" } },
    ],
    candidateInputs: [],
    missingInputs: [],
    diagnostics: [],
  };
}

describe("generic Thermal Treatment opportunity detection", () => {
  it("suggests and exactly groups matching IFC-backed walls without creating a selection", () => {
    const result = detectThermalTreatmentOpportunities({ calculationInputEvidence: [evidence(), evidence({ id: 102 })], registry: developmentReferenceThermalTreatmentRegistry });
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]).toMatchObject({ family: { familyId: "development-continuous-rail" }, affectedElementStepIds: [101, 102], selection: null });
    expect(result.suggestions[0]?.reasonCodes).toContain("material_name_matches_rail");

    const [card] = buildThermalTreatmentConfirmationCards({ suggestions: result.suggestions, registry: developmentReferenceThermalTreatmentRegistry });
    expect(card).toMatchObject({ primaryAction: "Confirm and calculate", secondaryAction: "Change family or parameters", advancedEvidenceCollapsed: true, affectedWallCount: 2 });
  });

  it("splits a meaningful layer difference and preserves unconfirmed estimates", () => {
    const result = detectThermalTreatmentOpportunities({ calculationInputEvidence: [evidence(), evidence({ id: 102, thickness: 0.12 })], registry: developmentReferenceThermalTreatmentRegistry });
    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions.every((suggestion) => Object.values(suggestion.proposedInputEvidence).every((item) => item.status === "estimated"))).toBe(true);
  });

  it("does not suggest unsupported evidence and surfaces ambiguous family choices", () => {
    const unsupported = detectThermalTreatmentOpportunities({ calculationInputEvidence: [evidence({ material: "Mineral wool" })], registry: developmentReferenceThermalTreatmentRegistry });
    expect(unsupported.suggestions).toEqual([]);
    const ambiguous = detectThermalTreatmentOpportunities({ calculationInputEvidence: [evidence({ material: "Rail stud" })], registry: developmentReferenceThermalTreatmentRegistry });
    expect(ambiguous.suggestions).toHaveLength(2);
    expect(ambiguous.suggestions.every((suggestion) => suggestion.confidence === "low")).toBe(true);
  });

  it("requires an explicit user correction before creating a selection", () => {
    const result = detectThermalTreatmentOpportunities({ calculationInputEvidence: [evidence()], registry: developmentReferenceThermalTreatmentRegistry });
    const confirmation = confirmThermalTreatmentOpportunity({ suggestion: result.suggestions[0]!, confirmedInputs: { railSpacingMm: 550 } });
    expect(confirmation.selection).toMatchObject({ familyId: "development-continuous-rail", confirmedInputs: { railSpacingMm: 550 }, inputEvidence: { railSpacingMm: { status: "confirmed" } } });
    expect(result.suggestions[0]?.selection).toBeNull();
  });});