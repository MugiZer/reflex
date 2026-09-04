import { buildReviewContextViewModel } from "../src/application/review/buildReviewContextViewModel.js";
import { syntheticMilestone4CalculationInputEvidence } from "../src/application/jobs/syntheticMilestone4Fixture.js";
import { planRequestedInputs } from "../src/domain/review/planRequestedInputs.js";
import type { CalculationInputEvidence } from "../src/domain/evidence/calculationInputEvidenceTypes.js";

describe("ReviewContextViewModel", () => {
  it("uses architect-facing labels while retaining raw RequestedInput ids", () => {
    const calculationInputEvidence = [syntheticMilestone4CalculationInputEvidence()];
    const requestedInputs = planRequestedInputs({ calculationInputEvidence }).requestedInputs;

    const viewModel = buildReviewContextViewModel({
      jobId: "job_1",
      requestedInputs,
      calculationInputEvidence,
    });

    expect(viewModel.groups[0].primaryLabel).toBe("Wall requiring thermal conductivity");
    expect(viewModel.groups[0].primaryLabel).not.toContain("ag_element_40");
    expect(viewModel.groups[0]).toEqual(expect.objectContaining({
      reviewTargetStepIds: [401],
      displayStepIds: [40],
      highlightMode: "element",
      highlightStepIds: [40],
    }));
    expect(viewModel.groups[0].questions[0]).toEqual(expect.objectContaining({
      requestedInputId: requestedInputs[0].requestedInputId,
      assemblyGroupId: "ag_element_40",
      missingValueLabel: "Thermal conductivity",
      reviewTargetStepIds: [401],
      displayStepIds: [40],
      highlightMode: "element",
      highlightStepIds: [40],
    }));
    expect(viewModel.groups[0].questions[0].technicalIds).toEqual(expect.objectContaining({
      assemblyGroupId: "ag_element_40",
      requestedInputId: requestedInputs[0].requestedInputId,
    }));
  });

  it("translates Review scope options into plain English", () => {
    const calculationInputEvidence = [syntheticMilestone4CalculationInputEvidence()];
    const requestedInputs = planRequestedInputs({ calculationInputEvidence }).requestedInputs;

    const viewModel = buildReviewContextViewModel({
      jobId: "job_1",
      requestedInputs,
      calculationInputEvidence,
    });

    expect(viewModel.scopeOptions).toEqual([
      expect.objectContaining({
        scopeKind: "layer_occurrence",
        label: "Only this layer in this element",
      }),
      expect.objectContaining({
        scopeKind: "material_decision",
        label: "All matching layers using this material",
      }),
      expect.objectContaining({
        scopeKind: "assembly_group",
        label: "All matching assemblies in this review group",
      }),
      expect.objectContaining({
        scopeKind: "element_type",
        label: "All elements using this IFC type",
      }),
    ]);
  });

  it("shows material decisions across affected assembly groups", () => {
    const calculationInputEvidence = [
      explicitLayerEvidence(10, 301, "Mineral wool"),
      explicitLayerEvidence(11, 401, "Mineral wool"),
    ];
    const requestedInputs = planRequestedInputs({ calculationInputEvidence }).requestedInputs;

    const viewModel = buildReviewContextViewModel({
      jobId: "job_1",
      requestedInputs,
      calculationInputEvidence,
    });

    expect(viewModel.groups).toHaveLength(1);
    expect(viewModel.groups[0]).toEqual(expect.objectContaining({
      primaryLabel: "Mineral wool requiring thermal conductivity",
      sourceElementCount: 2,
      displayStepIds: [10, 11],
      highlightMode: "material_decision",
    }));
    expect(viewModel.groups[0].questions[0]).toEqual(expect.objectContaining({
      scopeKind: "material_decision",
      evidenceSummary: expect.objectContaining({
        layerLabel: "2 layer occurrences",
        materialLabel: "Mineral wool",
        sourceElementCount: 2,
      }),
    }));
  });
});

function explicitLayerEvidence(
  elementStepId: number,
  layerStepId: number,
  materialName: string,
): CalculationInputEvidence {
  return {
    elementStepId,
    elementGlobalId: `wall-${elementStepId}`,
    elementClass: "IfcWall",
    calculationInputBasis: "layered_needs_material_resolution",
    fixedInputs: [
      input("layer_order", [layerStepId], "ifc_fixed", 0, layerStepId, materialName),
      input("layer_thickness", 0.12, "ifc_fixed", 0, layerStepId, materialName),
      input("layer_material_name", materialName, "ifc_fixed", 0, layerStepId, materialName),
    ],
    candidateInputs: [],
    missingInputs: [
      input("layer_lambda", null, "missing", 0, layerStepId, materialName),
    ],
    diagnostics: [],
  };
}

function input(
  field: CalculationInputEvidence["fixedInputs"][number]["field"],
  value: unknown,
  source: "ifc_fixed" | "missing",
  layerIndex: number,
  layerStepId: number,
  materialName: string,
): CalculationInputEvidence["fixedInputs"][number] {
  return {
    field,
    value,
    source,
    confidence: "high",
    evidenceReferences: [
      {
        evidencePath: `IfcMaterialLayer#${layerStepId}`,
        sourceStepIds: [layerStepId],
        pathParts: [{ stepId: layerStepId, entityClass: "IfcMaterialLayer" }],
      },
    ],
    reason: "test input",
    layer: { layerIndex, layerStepId, materialName },
  };
}
