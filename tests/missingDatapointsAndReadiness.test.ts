import { evaluateAssemblyReadiness } from "../src/domain/assemblies/evaluateAssemblyReadiness.js";
import type { AssemblyCandidate } from "../src/domain/assemblies/assemblyTypes.js";
import { detectMissingDatapoints } from "../src/domain/diagnostics/detectMissingDatapoints.js";

describe("detectMissingDatapoints", () => {
  it("reports ordered traceable datapoints from Assembly Candidate summaries", () => {
    const candidate = assemblyCandidate({
      evidenceSummary: {
        hasLayeredMaterialEvidence: true,
        hasOrderedLayers: true,
        layerCount: 2,
        hasAllLayerThicknesses: false,
        missingLayerThicknessCount: 1,
        hasAllMaterialNames: false,
        missingMaterialNameCount: 1,
        hasAnyLambdaCandidates: true,
        hasAllLambdaCandidates: false,
        missingLambdaCandidateCount: 1,
        hasNonLayeredMaterialEvidence: false,
        hasAssemblyThicknessCandidate: false,
        hasClassificationUncertainty: true,
      },
    });

    const result = detectMissingDatapoints({ assemblyCandidate: candidate });

    expect(result.missingDatapoints).toEqual([
      expect.objectContaining({
        field: "project_length_unit",
        severity: "required_for_precision",
        userFixable: true,
        userQuestionLevel: "project",
        bimSourceFixRecommended: true,
        evidenceChecked: [],
        affectedElementIds: ["wall-a", "wall-b"],
      }),
      expect.objectContaining({
        field: "layer_thickness",
        severity: "required_for_layered_calculation",
        userFixable: true,
        userQuestionLevel: "layer",
        bimSourceFixRecommended: true,
        evidenceChecked: [candidate.groupingSignatures[0].components[0].evidenceReference],
        affectedElementIds: ["wall-a", "wall-b"],
      }),
      expect.objectContaining({
        field: "layer_material_name",
        severity: "required_for_provenance",
        userFixable: true,
      }),
      expect.objectContaining({
        field: "layer_lambda",
        severity: "required_for_layered_calculation",
        userFixable: true,
        userQuestionLevel: "material",
      }),
      expect.objectContaining({
        field: "proxy_classification",
        severity: "required_for_provenance",
        userFixable: true,
        userQuestionLevel: "assembly",
      }),
    ]);
    expect(result.diagnostics).toHaveLength(5);
  });

  it("reports non-layered evidence that cannot prove a layer stack", () => {
    const candidate = assemblyCandidate({
      evidenceSummary: {
        hasLayeredMaterialEvidence: false,
        hasOrderedLayers: false,
        layerCount: 0,
        hasAllLayerThicknesses: false,
        missingLayerThicknessCount: 0,
        hasAllMaterialNames: false,
        missingMaterialNameCount: 0,
        hasAnyLambdaCandidates: false,
        hasAllLambdaCandidates: false,
        missingLambdaCandidateCount: 0,
        hasNonLayeredMaterialEvidence: true,
        hasAssemblyThicknessCandidate: true,
        hasClassificationUncertainty: false,
      },
    });

    expect(detectMissingDatapoints({ assemblyCandidate: candidate }).missingDatapoints)
      .toEqual([
        expect.objectContaining({ field: "project_length_unit" }),
        expect.objectContaining({
          field: "layer_stack",
          severity: "required_for_estimate",
          userFixable: false,
          bimSourceFixRecommended: true,
        }),
      ]);
  });

  it("reports absent official evidence as BIM-source missing datapoints", () => {
    const candidate = assemblyCandidate({
      groupingBasis: {
        basisKind: "single_element",
        reasons: ["Missing ifcTypeObjectStepId.", "Missing effective material association signature."],
      },
      groupingSignatures: [],
      evidenceSummary: {
        hasLayeredMaterialEvidence: false,
        hasOrderedLayers: false,
        layerCount: 0,
        hasAllLayerThicknesses: false,
        missingLayerThicknessCount: 0,
        hasAllMaterialNames: false,
        missingMaterialNameCount: 0,
        hasAnyLambdaCandidates: false,
        hasAllLambdaCandidates: false,
        missingLambdaCandidateCount: 0,
        hasNonLayeredMaterialEvidence: false,
        hasAssemblyThicknessCandidate: false,
        hasClassificationUncertainty: false,
      },
    });

    const result = detectMissingDatapoints({ assemblyCandidate: candidate });

    expect(result.missingDatapoints).toEqual([
      expect.objectContaining({
        field: "type_link",
        severity: "required_for_provenance",
        userFixable: false,
        bimSourceFixRecommended: true,
      }),
      expect.objectContaining({
        field: "material_association",
        severity: "required_for_layered_calculation",
        userFixable: false,
        bimSourceFixRecommended: true,
      }),
      expect.objectContaining({
        field: "calculation_basis_evidence",
        severity: "required_for_estimate",
        userFixable: false,
        bimSourceFixRecommended: true,
      }),
    ]);
  });

  it("does not report project length unit when canonical unit evidence exists", () => {
    const result = detectMissingDatapoints({
      assemblyCandidate: assemblyCandidate(),
      projectLengthUnitSignal: {
        ifcProjectCount: 1,
        unitsInContextAvailable: true,
        lengthUnitAppearsAvailable: true,
        evidenceReferences: [
          {
            evidencePath: "IfcSIUnit#3 -> UnitType",
            sourceStepIds: [3],
            pathParts: [
              { stepId: 3, entityClass: "IfcSIUnit", attribute: "UnitType" },
            ],
          },
        ],
      },
    });

    expect(result.missingDatapoints.map((datapoint) => datapoint.field))
      .not.toContain("project_length_unit");
  });
});

describe("evaluateAssemblyReadiness", () => {
  it("derives needs_review from user-fixable required datapoints", () => {
    const candidate = assemblyCandidate();
    const missingDatapoints = detectMissingDatapoints({
      assemblyCandidate: candidate,
    }).missingDatapoints;

    const result = evaluateAssemblyReadiness({
      assemblyCandidate: candidate,
      missingDatapoints,
    });

    expect(result.readinessState).toBe("needs_review");
    expect(result.confidence).toBe("medium");
    expect(result.reasons).toEqual([
      expect.objectContaining({
        code: "assembly_needs_review_for_missing_datapoints",
        severity: "warning",
        stepIds: [10, 11],
      }),
    ]);
  });

  it("blocks when no calculation basis exists", () => {
    const candidate = assemblyCandidate({
      groupingBasis: {
        basisKind: "single_element",
        reasons: ["Missing ifcTypeObjectStepId.", "Missing effective material association signature."],
      },
      groupingSignatures: [],
      evidenceSummary: {
        hasLayeredMaterialEvidence: false,
        hasOrderedLayers: false,
        layerCount: 0,
        hasAllLayerThicknesses: false,
        missingLayerThicknessCount: 0,
        hasAllMaterialNames: false,
        missingMaterialNameCount: 0,
        hasAnyLambdaCandidates: false,
        hasAllLambdaCandidates: false,
        missingLambdaCandidateCount: 0,
        hasNonLayeredMaterialEvidence: false,
        hasAssemblyThicknessCandidate: false,
        hasClassificationUncertainty: false,
      },
    });
    const missingDatapoints = detectMissingDatapoints({
      assemblyCandidate: candidate,
    }).missingDatapoints;

    const result = evaluateAssemblyReadiness({
      assemblyCandidate: candidate,
      missingDatapoints,
    });

    expect(result.readinessState).toBe("blocked");
    expect(result.confidence).toBe("high");
    expect(result.reasons).toEqual([
      expect.objectContaining({
        code: "assembly_blocked_by_bim_source_datapoints",
        severity: "error",
      }),
    ]);
  });

  it("keeps non-layered partial evidence estimated when no source fix is missing", () => {
    const candidate = assemblyCandidate({
      groupingSignatures: [
        {
          signatureKind: "material_association",
          signatureVersion: 1,
          hash: "non-layered",
          components: [
            {
              key: "materialStructureKind",
              value: "single_material",
            },
          ],
        },
      ],
      evidenceSummary: {
        hasLayeredMaterialEvidence: false,
        hasOrderedLayers: false,
        layerCount: 0,
        hasAllLayerThicknesses: false,
        missingLayerThicknessCount: 0,
        hasAllMaterialNames: false,
        missingMaterialNameCount: 0,
        hasAnyLambdaCandidates: false,
        hasAllLambdaCandidates: false,
        missingLambdaCandidateCount: 0,
        hasNonLayeredMaterialEvidence: true,
        hasAssemblyThicknessCandidate: true,
        hasClassificationUncertainty: false,
      },
    });

    const result = evaluateAssemblyReadiness({
      assemblyCandidate: candidate,
      missingDatapoints: [],
    });

    expect(result.readinessState).toBe("estimated");
    expect(result.reasons).toEqual([
      expect.objectContaining({
        code: "assembly_estimated_from_partial_evidence",
      }),
    ]);
  });

  it("reports ready without rediscovering missing fields", () => {
    const result = evaluateAssemblyReadiness({
      assemblyCandidate: assemblyCandidate({
        evidenceSummary: {
          hasLayeredMaterialEvidence: true,
          hasOrderedLayers: true,
          layerCount: 2,
          hasAllLayerThicknesses: true,
          missingLayerThicknessCount: 0,
          hasAllMaterialNames: true,
          missingMaterialNameCount: 0,
          hasAnyLambdaCandidates: true,
          hasAllLambdaCandidates: true,
          missingLambdaCandidateCount: 0,
          hasNonLayeredMaterialEvidence: false,
          hasAssemblyThicknessCandidate: false,
          hasClassificationUncertainty: false,
        },
      }),
      missingDatapoints: [],
    });

    expect(result).toEqual({
      readinessState: "ready",
      confidence: "high",
      reasons: [
        expect.objectContaining({
          code: "assembly_ready_for_layered_calculation",
          severity: "info",
        }),
      ],
    });
  });
});

function assemblyCandidate(
  command: Partial<AssemblyCandidate> = {},
): AssemblyCandidate {
  return {
    assemblyCandidateId: "ac_test",
    sourceElementStepIds: [10, 11],
    sourceElementGlobalIds: ["wall-a", "wall-b"],
    groupingKey: "type:IfcWall:100:abc",
    groupingBasis: {
      basisKind: "shared_type_and_material_signature",
      typeObjectStepId: 100,
      materialSignatureHash: "abc",
    },
    groupingConfidence: "high",
    groupingSignatures: [
      {
        signatureKind: "material_association",
        signatureVersion: 1,
        hash: "abc",
        components: [
          {
            key: "layerSetStepId",
            value: 200,
            evidenceReference: {
              evidencePath: "IfcMaterialLayerSet#200",
              sourceStepIds: [200],
              pathParts: [{ stepId: 200, entityClass: "IfcMaterialLayerSet" }],
            },
          },
        ],
      },
    ],
    groupingDiagnostics: [],
    evidenceSummary: {
      hasLayeredMaterialEvidence: true,
      hasOrderedLayers: true,
      layerCount: 2,
      hasAllLayerThicknesses: false,
      missingLayerThicknessCount: 1,
      hasAllMaterialNames: true,
      missingMaterialNameCount: 0,
      hasAnyLambdaCandidates: false,
      hasAllLambdaCandidates: false,
      missingLambdaCandidateCount: 2,
      hasNonLayeredMaterialEvidence: false,
      hasAssemblyThicknessCandidate: false,
      hasClassificationUncertainty: false,
    },
    ...command,
  };
}
