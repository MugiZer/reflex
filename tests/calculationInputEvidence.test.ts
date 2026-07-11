import { deriveCalculationInputEvidence } from "../src/domain/evidence/deriveCalculationInputEvidence.js";
import type { EffectiveElementEvidence } from "../src/domain/evidence/effectiveElementEvidenceTypes.js";
import type {
  CandidatePropertyEvidence,
  LayeredMaterialEvidence,
  MaterialEvidence,
  NumericEvidence,
} from "../src/domain/evidence/evidenceTypes.js";

describe("deriveCalculationInputEvidence", () => {
  it("classifies complete ordered layers without lambda as material-resolution ready", () => {
    const result = deriveCalculationInputEvidence({
      effectiveElementEvidence: [
        effectiveElement({ effectiveMaterialEvidence: [layeredMaterial({ lambdaCandidates: [] })] }),
      ],
    });

    expect(result.calculationInputEvidence[0]).toEqual(
      expect.objectContaining({
        calculationInputBasis: "layered_needs_material_resolution",
        missingInputs: [expect.objectContaining({ field: "layer_lambda" })],
      }),
    );
    expect(result.calculationInputEvidence[0].fixedInputs.map((input) => input.field))
      .toEqual(["layer_order", "layer_thickness", "layer_material_name"]);
  });

  it("creates one missing lambda input per unresolved layer", () => {
    const result = deriveCalculationInputEvidence({
      effectiveElementEvidence: [
        effectiveElement({
          effectiveMaterialEvidence: [
            layeredMaterial({
              layers: [
                layer({ layerIndex: 0, layerStepId: 301, materialName: "Gypsum" }),
                layer({ layerIndex: 1, layerStepId: 302, materialName: "Insulation" }),
              ],
              lambdaCandidates: [],
            }),
          ],
        }),
      ],
    });

    expect(
      result.calculationInputEvidence[0].missingInputs.filter(
        (input) => input.field === "layer_lambda",
      ),
    ).toEqual([
      expect.objectContaining({
        field: "layer_lambda",
        layer: expect.objectContaining({ layerIndex: 0, layerStepId: 301 }),
      }),
      expect.objectContaining({
        field: "layer_lambda",
        layer: expect.objectContaining({ layerIndex: 1, layerStepId: 302 }),
      }),
    ]);
  });

  it("classifies ordered layers with lambda candidates as complete IFC input", () => {
    const lambdaCandidate = candidate({
      candidateKind: "lambda",
      propertyName: "ThermalConductivity",
      normalizedValue: 0.04,
      normalizedUnit: "W/mK",
      lambdaClassification: "confirmed_lambda",
    });
    const result = deriveCalculationInputEvidence({
      effectiveElementEvidence: [
        effectiveElement({
          effectiveMaterialEvidence: [
            layeredMaterial({ lambdaCandidates: [lambdaCandidate] }),
          ],
        }),
      ],
    });

    expect(result.calculationInputEvidence[0]).toEqual(
      expect.objectContaining({
        calculationInputBasis: "layered_ifc_complete",
        missingInputs: [],
      }),
    );
    expect(result.calculationInputEvidence[0].fixedInputs.map((input) => input.field))
      .toContain("layer_lambda");
  });

  it("classifies non-layered material with assembly thickness as estimate possible", () => {
    const result = deriveCalculationInputEvidence({
      effectiveElementEvidence: [
        effectiveElement({
          effectiveMaterialEvidence: [singleMaterial()],
          candidatePropertyEvidence: [
            candidate({
              candidateKind: "assembly_thickness",
              propertyName: "Width",
              normalizedValue: 0.2,
              normalizedUnit: "m",
            }),
          ],
        }),
      ],
    });

    expect(result.calculationInputEvidence[0]).toEqual(
      expect.objectContaining({
        calculationInputBasis: "non_layered_estimate_possible",
        missingInputs: [expect.objectContaining({ field: "layer_stack" })],
      }),
    );
    expect(result.calculationInputEvidence[0].candidateInputs.map((input) => input.field))
      .toContain("assembly_thickness");
  });

  it("classifies no useful evidence as blocked", () => {
    const result = deriveCalculationInputEvidence({
      effectiveElementEvidence: [effectiveElement()],
    });

    expect(result.calculationInputEvidence[0]).toEqual(
      expect.objectContaining({
        calculationInputBasis: "blocked_missing_evidence",
        fixedInputs: [],
        candidateInputs: [],
        missingInputs: [
          expect.objectContaining({ field: "calculation_basis_evidence" }),
        ],
      }),
    );
  });
});

function effectiveElement(
  overrides: Partial<EffectiveElementEvidence> = {},
): EffectiveElementEvidence {
  return {
    elementStepId: 10,
    elementGlobalId: "wall-a",
    elementClass: "IfcWall",
    ifcTypeObjectStepId: 100,
    materialEvidenceSource: "none",
    effectiveMaterialEvidence: [],
    occurrenceMaterialEvidence: [],
    typeMaterialEvidence: [],
    candidatePropertyEvidence: [],
    evidenceReferences: [evidenceRef("IfcWall", 10)],
    conflictDiagnostics: [],
    ...overrides,
  };
}

function layeredMaterial(command: {
  lambdaCandidates: CandidatePropertyEvidence[];
  layers?: LayeredMaterialEvidence["layers"];
}): LayeredMaterialEvidence {
  const layers = command.layers ?? [
    layer({
      layerIndex: 0,
      layerStepId: 301,
      materialName: "Insulation",
      candidatePropertyEvidence: command.lambdaCandidates,
    }),
  ];
  return {
    materialEvidenceId: "mat_200_300",
    materialEvidenceSource: "official_rel_associates_material",
    associationScope: "occurrence",
    associationStepId: 200,
    relatingMaterialStepId: 300,
    materialStructureKind: "layer_set",
    evidenceReference: evidenceRef("IfcMaterialLayerSet", 300),
    diagnostics: [],
    layerSetUsage: null,
    layerSet: {
      stepId: 300,
      layerSetName: "Wall Build-up",
      description: null,
      materialLayerStepIds: layers.map((layer) => layer.layerStepId),
      rawAttributeSnapshot: {},
      evidenceReference: evidenceRef("IfcMaterialLayerSet", 300),
    },
    layers,
    layerOrderSource: "IfcMaterialLayerSet.MaterialLayers",
    totalLayerThickness: numeric(0.12, "m", 0.12, "m"),
  };
}

function layer(
  overrides: Partial<LayeredMaterialEvidence["layers"][number]> = {},
): LayeredMaterialEvidence["layers"][number] {
  const layerStepId = overrides.layerStepId ?? 301;
  return {
    layerIndex: 0,
    layerStepId,
    materialStepId: 401,
    materialName: "Insulation",
    materialCategory: null,
    layerName: null,
    layerDescription: null,
    layerCategory: null,
    thickness: numeric(0.12, "m", 0.12, "m"),
    isVentilated: "unknown",
    priority: null,
    rawAttributeSnapshot: {},
    evidenceReference: evidenceRef("IfcMaterialLayer", layerStepId),
    candidatePropertyEvidence: [],
    diagnostics: [],
    ...overrides,
  };
}

function singleMaterial(): MaterialEvidence {
  return {
    materialEvidenceId: "mat_200_401",
    materialEvidenceSource: "official_rel_associates_material",
    associationScope: "occurrence",
    associationStepId: 200,
    relatingMaterialStepId: 401,
    materialStructureKind: "single_material",
    evidenceReference: evidenceRef("IfcMaterial", 401),
    diagnostics: [],
    materialStepId: 401,
    materialName: "Concrete",
    materialCategory: null,
  };
}

function candidate(
  overrides: Partial<CandidatePropertyEvidence>,
): CandidatePropertyEvidence {
  return {
    candidateKind: "assembly_thickness",
    propertySetName: "Pset",
    propertyName: "Width",
    rawValue: 0.2,
    rawUnit: "m",
    normalizedValue: 0.2,
    normalizedUnit: "m",
    confidence: "medium",
    evidenceReference: evidenceRef("IfcPropertySingleValue", 500),
    reason: "test candidate",
    ...overrides,
  };
}

function numeric(
  rawValue: number,
  rawUnit: string,
  normalizedValue: number,
  normalizedUnit: string,
): NumericEvidence {
  return {
    rawValue,
    rawUnit,
    normalizedValue,
    normalizedUnit,
    unitSource: "ifc_project_units",
    confidence: "high",
    evidenceReference: evidenceRef("IfcMaterialLayer", 301),
    diagnostics: [],
  };
}

function evidenceRef(entityClass: string, stepId: number) {
  return {
    evidencePath: `${entityClass}#${stepId}`,
    sourceStepIds: [stepId],
    pathParts: [{ stepId, entityClass }],
  };
}
