import { buildArchitectActionViewModel } from "../src/application/jobs/buildArchitectActionViewModel.js";
import type { CalculationSnapshot } from "../src/domain/calculations/calculationTypes.js";
import type { CalculationInputEvidence } from "../src/domain/evidence/calculationInputEvidenceTypes.js";
import { planRequestedInputs } from "../src/domain/review/planRequestedInputs.js";
import { assemblyGroupIdForEvidence } from "../src/domain/review/reviewGrouping.js";
import type { Revision } from "../src/domain/revisions/revisionTypes.js";

describe("buildArchitectActionViewModel", () => {
  it("prioritizes unresolved evidence, target misses, verification, and passes", () => {
    const needsReview = evidence(10, "IfcWall", "Unknown insulation", 0.1, true);
    const missesTarget = evidence(20, "IfcWall", "Concrete", 0.2);
    const needsVerification = evidence(30, "IfcRoof", "Estimated insulation", 0.18);
    const meetsTarget = evidence(40, "IfcWall", "Mineral wool", 0.2);
    const requestedInputs = planRequestedInputs({
      calculationInputEvidence: [needsReview],
    }).requestedInputs;

    const model = buildArchitectActionViewModel({
      jobId: "job_1",
      jobStatus: "completed",
      calculationInputEvidence: [needsReview, missesTarget, needsVerification, meetsTarget],
      requestedInputs,
      activeRevision: revision([
        snapshot(missesTarget, { uValueWPerM2K: 0.42, confidence: "high" }),
        snapshot(needsVerification, {
          readinessState: "estimated",
          confidence: "low",
          uValueWPerM2K: null,
          uValueRangeWPerM2K: { min: 0.2, max: 0.3 },
        }),
        snapshot(meetsTarget, { uValueWPerM2K: 0.18, confidence: "high" }),
      ]),
      target: { maxUValueWPerM2K: 0.24, label: "Working project target" },
    });

    expect(model.assemblies.map((assembly) => assembly.readinessState)).toEqual([
      "needs_review",
      "ready",
      "estimated",
      "ready",
    ]);
    expect(model.assemblies.map((assembly) => assembly.performance.verdict)).toEqual([
      "not_assessed",
      "misses_target",
      "indeterminate",
      "meets_target",
    ]);
    expect(model.assemblies.every((assembly) => assembly.nextAction.label.length > 0)).toBe(true);
    expect(model.summary).toEqual(expect.objectContaining({
      assemblyCount: 4,
      needsActionCount: 3,
      needsReviewCount: 1,
      failingTargetCount: 1,
      passingTargetCount: 1,
      unassessedCount: 1,
    }));
  });

  it("attaches a shared material decision to every affected assembly", () => {
    const first = layeredEvidence(11, "Mineral wool", 301);
    const second = layeredEvidence(12, "Mineral wool", 401);
    const requestedInputs = planRequestedInputs({
      calculationInputEvidence: [first, second],
    }).requestedInputs;

    const model = buildArchitectActionViewModel({
      jobId: "job_2",
      jobStatus: "needs_review",
      calculationInputEvidence: [first, second],
      requestedInputs,
      activeRevision: null,
      target: null,
    });

    expect(model.assemblies).toHaveLength(2);
    expect(model.assemblies.every((assembly) =>
      assembly.nextAction.requestedInputIds.includes(requestedInputs[0].requestedInputId)
    )).toBe(true);
    expect(model.assemblies.map((assembly) => assembly.displayStepIds)).toEqual([[11], [12]]);
  });

  it("uses active Revision inputs as the source of resolved Review truth", () => {
    const assembly = evidence(50, "IfcWall", "Mineral wool", 0.12, true);
    const requestedInputs = planRequestedInputs({ calculationInputEvidence: [assembly] }).requestedInputs;
    const activeRevision = revision([
      snapshot(assembly, { uValueWPerM2K: 0.21, confidence: "medium" }),
    ], [requestedInputs[0].requestedInputId]);

    const model = buildArchitectActionViewModel({
      jobId: "job_3",
      jobStatus: "completed",
      calculationInputEvidence: [assembly],
      requestedInputs,
      activeRevision,
      target: { maxUValueWPerM2K: 0.24, label: "Working project target" },
    });

    expect(model.assemblies[0]).toEqual(expect.objectContaining({
      readinessState: "ready",
      evidenceState: expect.objectContaining({
        status: "user_completed",
        unresolvedInputCount: 0,
      }),
    }));
    expect(model.assemblies[0].performance.verdict).toBe("meets_target");
  });

  it("exposes per-material calculated values and wall proportions", () => {
    const assembly = evidence(60, "IfcWall", "Insulation", 0.2);
    const calculated = snapshot(assembly, { uValueWPerM2K: 0.2, confidence: "high" });
    calculated.layers = [
      layer("Gypsum", 0.02, 0.2, 0.1),
      layer("Insulation", 0.18, 0.04, 4.5),
    ];

    const model = buildArchitectActionViewModel({
      jobId: "job_4",
      jobStatus: "completed",
      calculationInputEvidence: [assembly],
      requestedInputs: [],
      activeRevision: revision([calculated]),
      target: null,
    });

    expect(model.assemblies[0].layers).toEqual([
      expect.objectContaining({ materialName: "Gypsum", thicknessMm: 20, thicknessSharePercent: 10 }),
      expect.objectContaining({ materialName: "Insulation", thicknessMm: 180, thicknessSharePercent: 90 }),
    ]);
  });
});

function evidence(
  elementStepId: number,
  elementClass: CalculationInputEvidence["elementClass"],
  materialName: string,
  thicknessM: number,
  missingLambda = false,
): CalculationInputEvidence {
  return {
    elementStepId,
    elementGlobalId: `element-${elementStepId}`,
    elementClass,
    calculationInputBasis: missingLambda
      ? "layered_needs_material_resolution"
      : "layered_ifc_complete",
    fixedInputs: [
      input("layer_order", [elementStepId * 10 + 1], elementStepId, materialName, thicknessM),
      input("layer_thickness", thicknessM, elementStepId, materialName, thicknessM),
      input("layer_material_name", materialName, elementStepId, materialName, thicknessM),
      ...(missingLambda ? [] : [input("layer_lambda", 0.04, elementStepId, materialName, thicknessM)]),
    ],
    candidateInputs: [],
    missingInputs: missingLambda
      ? [{
          ...input("layer_lambda", null, elementStepId, materialName, thicknessM),
          source: "missing",
          confidence: "low",
        }]
      : [],
    diagnostics: [],
  };
}

function layeredEvidence(elementStepId: number, materialName: string, layerStepId: number) {
  const result = evidence(elementStepId, "IfcWall", materialName, elementStepId === 11 ? 0.12 : 0.08, true);
  result.fixedInputs.forEach((value) => {
    if (value.layer) value.layer.layerStepId = layerStepId;
  });
  result.missingInputs.forEach((value) => {
    if (value.layer) value.layer.layerStepId = layerStepId;
  });
  return result;
}

function input(
  field: CalculationInputEvidence["fixedInputs"][number]["field"],
  value: unknown,
  elementStepId: number,
  materialName: string,
  _thicknessM: number,
): CalculationInputEvidence["fixedInputs"][number] {
  const layerStepId = elementStepId * 10 + 1;
  return {
    field,
    value,
    source: "ifc_fixed",
    confidence: "high",
    evidenceReferences: [{
      evidencePath: `IfcWall#${elementStepId} -> IfcMaterialLayer#${layerStepId}`,
      sourceStepIds: [elementStepId, layerStepId],
      pathParts: [{ stepId: elementStepId, entityClass: "IfcWall" }],
    }],
    reason: "Architect action fixture",
    layer: { layerIndex: 0, layerStepId, materialName },
  };
}

function snapshot(
  source: CalculationInputEvidence,
  overrides: Partial<CalculationSnapshot>,
): CalculationSnapshot {
  return {
    calculationSnapshotId: `snapshot-${source.elementStepId}`,
    assemblyGroupId: assemblyGroupIdForEvidence(source),
    readinessState: "ready",
    confidence: "high",
    calculationBasis: "extracted_layered",
    layers: [layer("Layer", 0.2, 0.04, 5)],
    surfaceResistanceProfile: {
      profileId: "external_wall_vertical",
      rsi: 0.13,
      rse: 0.04,
      sourceLabel: "fixture",
      assumptions: [],
    },
    totalRValueM2KPerW: 5.17,
    uValueWPerM2K: 0.19,
    uValueRangeWPerM2K: null,
    temperatureProfile: null,
    assumptions: [],
    warnings: [],
    provenance: ["IFC evidence"],
    ...overrides,
  };
}

function layer(materialName: string, thicknessM: number, lambdaWPerMK: number, rValueM2KPerW: number) {
  return {
    layerOccurrenceId: `layer-${materialName}`,
    materialName,
    thicknessM,
    lambdaWPerMK,
    datapointSources: ["ifc_extracted" as const],
    provenance: ["IFC evidence"],
    rValueM2KPerW,
  };
}

function revision(snapshots: CalculationSnapshot[], resolvedInputIds: string[] = []): Revision {
  return {
    revisionId: "rev_1",
    parentRevisionId: null,
    createdAt: "2026-07-18T00:00:00.000Z",
    reason: "fixture",
    userInputs: resolvedInputIds.map((requestedInputId, index) => ({
      userInputId: `ui_${index}`,
      requestedInputId,
      datapoint: "layer_lambda",
      value: 0.04,
      unit: "W/mK",
    })),
    overrides: [],
    calculationSnapshots: snapshots,
    diagnostics: [],
  };
}
