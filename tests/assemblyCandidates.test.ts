import { buildAssemblyCandidates } from "../src/domain/assemblies/buildAssemblyCandidates.js";
import type {
  ElementEvidence,
  IfcEvidence,
  LayeredMaterialEvidence,
  TypeEvidence,
} from "../src/domain/evidence/evidenceTypes.js";

describe("buildAssemblyCandidates", () => {
  it("creates deterministic single-element candidates when no type object exists", () => {
    const evidence = fixtureEvidence({
      elements: [elementEvidence({ stepId: 10, globalId: "wall-a" })],
    });

    const result = buildAssemblyCandidates({ ifcEvidence: evidence });

    expect(result.assemblyCandidates).toEqual([
      expect.objectContaining({
        assemblyCandidateId: expect.stringMatching(/^ac_[a-f0-9]{12}$/),
        sourceElementStepIds: [10],
        sourceElementGlobalIds: ["wall-a"],
        groupingKey: "single_element:IfcWall:10:wall-a",
        groupingBasis: {
          basisKind: "single_element",
          reasons: ["Missing ifcTypeObjectStepId."],
        },
        groupingConfidence: "high",
        groupingSignatures: [],
        evidenceSummary: expect.objectContaining({
          hasLayeredMaterialEvidence: false,
          hasOrderedLayers: false,
          layerCount: 0,
          hasClassificationUncertainty: false,
        }),
      }),
    ]);

    expect(buildAssemblyCandidates({ ifcEvidence: evidence }))
      .toEqual(result);
  });

  it("groups elements that share element class, type object, and material association signature", () => {
    const type = typeEvidence({
      stepId: 100,
      materialEvidence: [layeredMaterial({ associationStepId: 200 })],
    });
    const evidence = fixtureEvidence({
      elements: [
        elementEvidence({ stepId: 10, globalId: "wall-a", typeStepId: 100 }),
        elementEvidence({ stepId: 11, globalId: "wall-b", typeStepId: 100 }),
      ],
      types: [type],
    });

    const result = buildAssemblyCandidates({ ifcEvidence: evidence });

    expect(result.assemblyCandidates).toEqual([
      expect.objectContaining({
        sourceElementStepIds: [10, 11],
        sourceElementGlobalIds: ["wall-a", "wall-b"],
        groupingKey: expect.stringContaining("type:IfcWall:100:"),
        groupingBasis: {
          basisKind: "shared_type_and_material_signature",
          typeObjectStepId: 100,
          materialSignatureHash: expect.any(String),
        },
        groupingConfidence: "high",
        groupingSignatures: [
          expect.objectContaining({
            signatureKind: "material_association",
            signatureVersion: 1,
            components: expect.arrayContaining([
              { key: "associationScope", value: "type" },
              { key: "associationStepId", value: 200 },
              { key: "materialStructureKind", value: "layer_set" },
              { key: "layerCount", value: 1 },
            ]),
          }),
        ],
        evidenceSummary: expect.objectContaining({
          hasLayeredMaterialEvidence: true,
          hasOrderedLayers: true,
          layerCount: 1,
          hasAllLayerThicknesses: true,
          hasAllMaterialNames: true,
          hasAnyLambdaCandidates: false,
          hasAllLambdaCandidates: false,
        }),
      }),
    ]);
  });

  it("splits direct occurrence material conflicts out of type-based grouping", () => {
    const type = typeEvidence({
      stepId: 100,
      materialEvidence: [layeredMaterial({ associationStepId: 200 })],
    });
    const evidence = fixtureEvidence({
      elements: [
        elementEvidence({ stepId: 10, globalId: "wall-a", typeStepId: 100 }),
        elementEvidence({
          stepId: 11,
          globalId: "wall-b",
          typeStepId: 100,
          directMaterialEvidence: [
            layeredMaterial({
              associationScope: "occurrence",
              associationStepId: 201,
              materialName: "Different insulation",
            }),
          ],
        }),
      ],
      types: [type],
    });

    const result = buildAssemblyCandidates({ ifcEvidence: evidence });

    expect(result.assemblyCandidates).toEqual([
      expect.objectContaining({
        sourceElementStepIds: [10],
        groupingBasis: expect.objectContaining({
          basisKind: "shared_type_and_material_signature",
        }),
      }),
      expect.objectContaining({
        sourceElementStepIds: [11],
        groupingKey: "single_element:IfcWall:11:wall-b",
        groupingDiagnostics: [
          expect.objectContaining({
            code: "effective_material_evidence_conflict",
            severity: "warning",
            stepIds: [201, 200],
          }),
        ],
      }),
    ]);
  });
});

function fixtureEvidence(command: {
  elements: ElementEvidence[];
  types?: TypeEvidence[];
}): IfcEvidence {
  return {
    fileEvidence: {
      fileHash: "hash-123",
      schema: "IFC4",
      projectLengthUnitSignal: {
        ifcProjectCount: 0,
        unitsInContextAvailable: false,
        lengthUnitAppearsAvailable: false,
        evidenceReferences: [],
      },
      skippedScopeSummaries: [],
    },
    elementEvidence: command.elements,
    typeEvidence: command.types ?? [],
    citedIfcEntities: [],
    skippedScopeSummaries: [],
    diagnostics: [],
  };
}

function elementEvidence(command: {
  stepId: number;
  globalId: string;
  typeStepId?: number;
  directMaterialEvidence?: ElementEvidence["directMaterialEvidence"];
}): ElementEvidence {
  return {
    identity: {
      stepId: command.stepId,
      globalId: command.globalId,
      rawEntityClass: "IfcWall",
      elementClass: "IfcWall",
      name: null,
      objectType: null,
      predefinedType: null,
      tag: null,
      description: null,
      ifcTypeObjectStepId: command.typeStepId ?? null,
      classification: {
        classificationConfidence: "high",
        inclusionReason: "Relevant Milestone 1 element class.",
        matchedHints: [],
        needsUserConfirmation: false,
      },
      sourceContext: {
        containerStepId: null,
        storeyName: null,
      },
      evidenceReference: evidenceRef("IfcWall", command.stepId),
      rawAttributeSnapshot: {},
    },
    directMaterialEvidence: command.directMaterialEvidence ?? [],
    directPropertySets: [],
    directQuantitySets: [],
    candidatePropertyEvidence: [],
    evidenceReferences: [],
    diagnostics: [],
  };
}

function typeEvidence(command: {
  stepId: number;
  materialEvidence?: TypeEvidence["materialEvidence"];
}): TypeEvidence {
  return {
    identity: {
      stepId: command.stepId,
      globalId: `type-${command.stepId}`,
      rawEntityClass: "IfcWallType",
      name: null,
      predefinedType: null,
      tag: null,
      description: null,
      rawAttributeSnapshot: {},
      evidenceReference: evidenceRef("IfcWallType", command.stepId),
    },
    materialEvidence: command.materialEvidence ?? [],
    propertySets: [],
    quantitySets: [],
    candidatePropertyEvidence: [],
    diagnostics: [],
  };
}

function layeredMaterial(command: {
  associationStepId: number;
  associationScope?: "occurrence" | "type";
  materialName?: string;
}): LayeredMaterialEvidence {
  const materialName = command.materialName ?? "Mineral wool";
  return {
    materialEvidenceId: `mat_${command.associationStepId}_700`,
    materialEvidenceSource: "official_rel_associates_material",
    associationScope: command.associationScope ?? "type",
    associationStepId: command.associationStepId,
    relatingMaterialStepId: 700,
    materialStructureKind: "layer_set",
    evidenceReference: evidenceRef("IfcRelAssociatesMaterial", command.associationStepId),
    diagnostics: [],
    layerSetUsage: null,
    layerSet: {
      stepId: 701,
      layerSetName: "Wall build-up",
      description: null,
      materialLayerStepIds: [702],
      rawAttributeSnapshot: {},
      evidenceReference: evidenceRef("IfcMaterialLayerSet", 701),
    },
    layers: [
      {
        layerIndex: 0,
        layerStepId: 702,
        materialStepId: 710,
        materialName,
        materialCategory: null,
        layerName: null,
        layerDescription: null,
        layerCategory: null,
        thickness: {
          rawValue: 120,
          rawUnit: "MILLI METRE",
          normalizedValue: 0.12,
          normalizedUnit: "m",
          unitSource: "ifc_project_units",
          confidence: "high",
          evidenceReference: evidenceRef("IfcMaterialLayer", 702),
          diagnostics: [],
        },
        isVentilated: "unknown",
        priority: null,
        rawAttributeSnapshot: {},
        evidenceReference: evidenceRef("IfcMaterialLayer", 702),
        candidatePropertyEvidence: [],
        diagnostics: [],
      },
    ],
    layerOrderSource: "IfcMaterialLayerSet.MaterialLayers",
    totalLayerThickness: null,
  };
}

function evidenceRef(entityClass: string, stepId: number) {
  return {
    evidencePath: `${entityClass}#${stepId}`,
    sourceStepIds: [stepId],
    pathParts: [{ stepId, entityClass }],
  };
}
