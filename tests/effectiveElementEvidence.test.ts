import { deriveEffectiveElementEvidence } from "../src/domain/evidence/deriveEffectiveElementEvidence.js";
import type {
  ElementEvidence,
  IfcEvidence,
  MaterialEvidence,
  TypeEvidence,
} from "../src/domain/evidence/evidenceTypes.js";

describe("deriveEffectiveElementEvidence", () => {
  it("uses type material evidence when occurrence material evidence is absent", () => {
    const typeMaterial = singleMaterial({
      associationScope: "type",
      associationStepId: 300,
      materialStepId: 400,
      materialName: "Brick",
    });
    const result = deriveEffectiveElementEvidence({
      ifcEvidence: evidence({
        element: element({ ifcTypeObjectStepId: 100 }),
        typeEvidence: typeRecord({ materialEvidence: [typeMaterial] }),
      }),
    });

    expect(result.effectiveElementEvidence).toEqual([
      expect.objectContaining({
        elementStepId: 10,
        ifcTypeObjectStepId: 100,
        materialEvidenceSource: "type",
        effectiveMaterialEvidence: [typeMaterial],
      }),
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it("uses occurrence material evidence over type material evidence", () => {
    const occurrenceMaterial = singleMaterial({
      associationScope: "occurrence",
      associationStepId: 200,
      materialStepId: 401,
      materialName: "Concrete",
    });
    const typeMaterial = singleMaterial({
      associationScope: "type",
      associationStepId: 300,
      materialStepId: 400,
      materialName: "Brick",
    });

    const result = deriveEffectiveElementEvidence({
      ifcEvidence: evidence({
        element: element({
          ifcTypeObjectStepId: 100,
          directMaterialEvidence: [occurrenceMaterial],
        }),
        typeEvidence: typeRecord({ materialEvidence: [typeMaterial] }),
      }),
    });

    expect(result.effectiveElementEvidence[0]).toEqual(
      expect.objectContaining({
        materialEvidenceSource: "occurrence",
        effectiveMaterialEvidence: [occurrenceMaterial],
        typeMaterialEvidence: [typeMaterial],
      }),
    );
  });

  it("diagnoses conflicting occurrence and type material evidence", () => {
    const result = deriveEffectiveElementEvidence({
      ifcEvidence: evidence({
        element: element({
          ifcTypeObjectStepId: 100,
          directMaterialEvidence: [
            singleMaterial({
              associationScope: "occurrence",
              associationStepId: 200,
              materialStepId: 401,
              materialName: "Concrete",
            }),
          ],
        }),
        typeEvidence: typeRecord({
          materialEvidence: [
            singleMaterial({
              associationScope: "type",
              associationStepId: 300,
              materialStepId: 400,
              materialName: "Brick",
            }),
          ],
        }),
      }),
    });

    expect(result.effectiveElementEvidence[0].conflictDiagnostics).toEqual([
      expect.objectContaining({
        code: "effective_material_evidence_conflict",
        severity: "warning",
        message: expect.stringContaining("IfcRelAssociatesMaterial#200"),
        stepIds: [200, 300],
      }),
    ]);
    expect(result.diagnostics).toEqual(result.effectiveElementEvidence[0].conflictDiagnostics);
  });

  it("does not diagnose matching occurrence and type material evidence", () => {
    const result = deriveEffectiveElementEvidence({
      ifcEvidence: evidence({
        element: element({
          ifcTypeObjectStepId: 100,
          directMaterialEvidence: [
            singleMaterial({
              associationScope: "occurrence",
              associationStepId: 200,
              materialStepId: 400,
              materialName: "Brick",
            }),
          ],
        }),
        typeEvidence: typeRecord({
          materialEvidence: [
            singleMaterial({
              associationScope: "type",
              associationStepId: 300,
              materialStepId: 400,
              materialName: "Brick",
            }),
          ],
        }),
      }),
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.effectiveElementEvidence[0].conflictDiagnostics).toEqual([]);
  });
});

function evidence(command: {
  element: ElementEvidence;
  typeEvidence?: TypeEvidence;
}): IfcEvidence {
  return {
    fileEvidence: {
      fileHash: "hash",
      schema: "IFC4",
      projectLengthUnitSignal: {
        ifcProjectCount: 1,
        unitsInContextAvailable: true,
        lengthUnitAppearsAvailable: true,
        evidenceReferences: [],
      },
      skippedScopeSummaries: [],
    },
    elementEvidence: [command.element],
    typeEvidence: command.typeEvidence ? [command.typeEvidence] : [],
    citedIfcEntities: [],
    skippedScopeSummaries: [],
    diagnostics: [],
  };
}

function element(
  overrides: Partial<ElementEvidence["identity"]> &
    Partial<Pick<ElementEvidence, "directMaterialEvidence">> = {},
): ElementEvidence {
  return {
    identity: {
      stepId: 10,
      globalId: "wall-a",
      rawEntityClass: "IfcWall",
      elementClass: "IfcWall",
      name: "Wall A",
      objectType: null,
      predefinedType: null,
      tag: null,
      description: null,
      ifcTypeObjectStepId: null,
      classification: {
        classificationConfidence: "high",
        inclusionReason: "Relevant element.",
        matchedHints: [],
        needsUserConfirmation: false,
      },
      sourceContext: { containerStepId: null, storeyName: null },
      evidenceReference: evidenceRef("IfcWall", 10),
      rawAttributeSnapshot: {},
      ...overrides,
    },
    directMaterialEvidence: overrides.directMaterialEvidence ?? [],
    directPropertySets: [],
    directQuantitySets: [],
    candidatePropertyEvidence: [],
    evidenceReferences: [],
    diagnostics: [],
  };
}

function typeRecord(overrides: Partial<TypeEvidence> = {}): TypeEvidence {
  return {
    identity: {
      stepId: 100,
      globalId: "type-a",
      rawEntityClass: "IfcWallType",
      name: "Wall Type",
      predefinedType: null,
      tag: null,
      description: null,
      rawAttributeSnapshot: {},
      evidenceReference: evidenceRef("IfcWallType", 100),
    },
    materialEvidence: [],
    propertySets: [],
    quantitySets: [],
    candidatePropertyEvidence: [],
    diagnostics: [],
    ...overrides,
  };
}

function singleMaterial(command: {
  associationScope: "occurrence" | "type";
  associationStepId: number;
  materialStepId: number;
  materialName: string;
}): MaterialEvidence {
  return {
    materialEvidenceId: `mat_${command.associationStepId}_${command.materialStepId}`,
    materialEvidenceSource: "official_rel_associates_material",
    associationScope: command.associationScope,
    associationStepId: command.associationStepId,
    relatingMaterialStepId: command.materialStepId,
    materialStructureKind: "single_material",
    evidenceReference: evidenceRef("IfcRelAssociatesMaterial", command.associationStepId),
    diagnostics: [],
    materialStepId: command.materialStepId,
    materialName: command.materialName,
    materialCategory: null,
  };
}

function evidenceRef(entityClass: string, stepId: number) {
  return {
    evidencePath: `${entityClass}#${stepId}`,
    sourceStepIds: [stepId],
    pathParts: [{ stepId, entityClass }],
  };
}
