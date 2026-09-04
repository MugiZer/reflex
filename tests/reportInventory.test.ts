import { describe, expect, it } from "vitest";

import { buildReportInventory } from "../src/application/reports/buildReportInventory.js";
import type { CalculationInputEvidence } from "../src/domain/evidence/calculationInputEvidenceTypes.js";

describe("report inventory", () => {
  it("keeps an unresolved grouped wall composition visible with every source wall", () => {
    const inventory = buildReportInventory({
      calculationInputEvidence: [evidence(10, "wall-a"), evidence(11, "wall-b")],
      calculationSnapshots: [],
      materialLibrary: { version: "test", entries: [] },
      userInputs: [],
    });

    expect(inventory).toHaveLength(1);
    expect(inventory[0]).toEqual(expect.objectContaining({
      readinessState: "needs_review",
      sources: expect.arrayContaining([
        expect.objectContaining({ elementStepId: 10, elementGlobalId: "wall-a", elementName: "Wall A", elementObjectType: "Exterior Wall" }),
        expect.objectContaining({ elementStepId: 11, elementGlobalId: "wall-b" }),
      ]),
      layers: [expect.objectContaining({ rawMaterialName: "Unresolved insulation", thicknessM: 0.12, lambdaWPerMK: null })],
      nextActions: [expect.stringContaining("Resolve a documented thermal basis")],
    }));
  });
});

function evidence(elementStepId: number, elementGlobalId: string): CalculationInputEvidence {
  const layer = { layerIndex: 0, layerStepId: elementStepId + 100, materialName: "Unresolved insulation" };
  const input = (field: "layer_order" | "layer_thickness" | "layer_material_name", value: unknown) => ({ field, value, source: "ifc_fixed" as const, confidence: "high" as const, evidenceReferences: [], reason: "test", layer });
  return {
    elementStepId,
    elementGlobalId,
    elementName: elementStepId === 10 ? "Wall A" : "Wall B",
    elementObjectType: "Exterior Wall",
    elementClass: "IfcWall",
    calculationInputBasis: "layered_needs_material_resolution",
    fixedInputs: [input("layer_order", [layer.layerStepId]), input("layer_thickness", 0.12), input("layer_material_name", layer.materialName)],
    candidateInputs: [],
    missingInputs: [{ field: "layer_lambda", value: null, source: "missing", confidence: "high", evidenceReferences: [], reason: "test", layer }],
    diagnostics: [],
  };
}