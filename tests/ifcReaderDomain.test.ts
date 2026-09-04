import { buildIfcExtractionIndex } from "../src/domain/evidence/buildIfcExtractionIndex.js";
import { detectIfcEvidenceExtractionRisk } from "../src/domain/evidence/detectIfcEvidenceExtractionRisk.js";
import { discoverRelevantElements } from "../src/domain/evidence/discoverRelevantElements.js";
import type {
  CitedIfcEntity,
  IfcEntityRecord,
  IfcHeaderEvidence,
  IfcModelReader,
  StepId,
} from "../src/domain/evidence/evidenceTypes.js";

class FakeIfcModelReader implements IfcModelReader {
  constructor(private readonly entities: IfcEntityRecord[]) {}

  getHeader(): IfcHeaderEvidence {
    return { schema: "IFC4" };
  }

  getSchema() {
    return "IFC4";
  }

  hasEntityClass(entityClass: string) {
    return this.entities.some((entity) => entity.entityClass === entityClass);
  }

  getEntitiesByClass(entityClass: string) {
    return this.entities.filter((entity) => entity.entityClass === entityClass);
  }

  getEntity(stepId: StepId) {
    return this.entities.find((entity) => entity.stepId === stepId) ?? null;
  }

  getEntityClass(stepId: StepId) {
    return this.getEntity(stepId)?.entityClass ?? null;
  }

  getStringAttribute(stepId: StepId, attributeName: string) {
    const value = this.getEntity(stepId)?.attributes[attributeName];
    return typeof value === "string" ? value : null;
  }

  getNumberAttribute(stepId: StepId, attributeName: string) {
    const value = this.getEntity(stepId)?.attributes[attributeName];
    return typeof value === "number" ? value : null;
  }

  getBooleanAttribute(stepId: StepId, attributeName: string) {
    const value = this.getEntity(stepId)?.attributes[attributeName];
    return typeof value === "boolean" ? value : null;
  }

  getEntityReference(stepId: StepId, attributeName: string) {
    const value = this.getEntity(stepId)?.attributes[attributeName];
    return typeof value === "number" ? value : null;
  }

  getEntityReferenceList(stepId: StepId, attributeName: string) {
    const value = this.getEntity(stepId)?.attributes[attributeName];
    return Array.isArray(value)
      ? value.filter((item): item is number => typeof item === "number")
      : [];
  }

  getCompactEntitySnapshot(stepId: StepId): CitedIfcEntity {
    const entity = this.getEntity(stepId);
    return {
      stepId,
      entityClass: entity?.entityClass ?? null,
      attributes: entity?.attributes ?? {},
    };
  }

  close() {}
}

describe("discoverRelevantElements", () => {
  it("applies static relevant element rules and normalizes wall standard cases", () => {
    const reader = new FakeIfcModelReader([
      entity(10, "IfcWall"),
      entity(11, "IfcWallStandardCase"),
      entity(12, "IfcCurtainWall"),
      entity(13, "IfcBuildingElementProxy", {
        Name: "External facade backup panel",
      }),
      entity(14, "IfcBuildingElementProxy", {
        Name: "Interior equipment mount",
      }),
      entity(15, "IfcDoor"),
    ]);

    const result = discoverRelevantElements(reader);

    expect(result.relevantElements).toEqual([
      expect.objectContaining({
        stepId: 10,
        rawEntityClass: "IfcWall",
        elementClass: "IfcWall",
      }),
      expect.objectContaining({
        stepId: 11,
        rawEntityClass: "IfcWallStandardCase",
        elementClass: "IfcWall",
      }),
      expect.objectContaining({
        stepId: 12,
        rawEntityClass: "IfcCurtainWall",
        elementClass: "IfcCurtainWall",
      }),
      expect.objectContaining({
        stepId: 13,
        rawEntityClass: "IfcBuildingElementProxy",
        elementClass: "IfcBuildingElementProxy",
        classification: expect.objectContaining({
          classificationConfidence: "low",
          matchedHints: ["facade", "external"],
          needsUserConfirmation: true,
        }),
      }),
    ]);
    expect(result.relevantElementStepIds).toEqual(new Set([10, 11, 12, 13]));
    expect(result.skippedScopeSummaries).toEqual([
      {
        rawEntityClass: "IfcDoor",
        count: 1,
        reason: "Out of Milestone 1 thermal assembly scope.",
      },
    ]);
  });
});

describe("buildIfcExtractionIndex", () => {
  it("indexes official relationship paths touching relevant elements and type objects", () => {
    const reader = new FakeIfcModelReader([
      entity(10, "IfcWall"),
      entity(20, "IfcWallType", { HasPropertySets: [501, 502] }),
      entity(30, "IfcSlab"),
      entity(40, "IfcWall"),
      entity(100, "IfcRelDefinesByType", {
        RelatedObjects: [10, 999],
        RelatingType: 20,
      }),
      entity(101, "IfcRelDefinesByType", {
        RelatedObjects: [30],
        RelatingType: 21,
      }),
      entity(200, "IfcRelAssociatesMaterial", {
        RelatedObjects: [10, 20, 999],
        RelatingMaterial: 700,
      }),
      entity(201, "IfcRelAssociatesMaterial", {
        RelatedObjects: [40],
        RelatingMaterial: 701,
      }),
      entity(300, "IfcRelDefinesByProperties", {
        RelatedObjects: [10, 999],
        RelatingPropertyDefinition: 800,
      }),
      entity(301, "IfcRelDefinesByProperties", {
        RelatedObjects: [999],
        RelatingPropertyDefinition: 801,
      }),
    ]);

    const result = buildIfcExtractionIndex({
      reader,
      relevantElementStepIds: new Set([10, 30]),
    });

    expect(result.extractionIndex.typeLinkByElementStepId.get(10)).toEqual({
      relationshipStepId: 100,
      relatedElementStepId: 10,
      relatingTypeStepId: 20,
    });
    expect(result.extractionIndex.typeLinkByElementStepId.get(30)).toEqual({
      relationshipStepId: 101,
      relatedElementStepId: 30,
      relatingTypeStepId: 21,
    });
    expect(
      result.extractionIndex.materialAssociationsByRelatedStepId.get(10),
    ).toEqual([
      {
        associationStepId: 200,
        relatedStepId: 10,
        relatingMaterialStepId: 700,
      },
    ]);
    expect(
      result.extractionIndex.materialAssociationsByRelatedStepId.get(20),
    ).toEqual([
      {
        associationStepId: 200,
        relatedStepId: 20,
        relatingMaterialStepId: 700,
      },
    ]);
    expect(
      result.extractionIndex.materialAssociationsByRelatedStepId.has(40),
    ).toBe(false);
    expect(result.extractionIndex.propertyDefinitionsByElementStepId.get(10))
      .toEqual([
        {
          relationshipStepId: 300,
          relatedElementStepId: 10,
          relatingPropertyDefinitionStepId: 800,
        },
      ]);
    expect(
      result.extractionIndex.typePropertySetStepIdsByTypeStepId.get(20),
    ).toEqual([501, 502]);
  });
});

describe("detectIfcEvidenceExtractionRisk", () => {
  it("warns when related type and material entities exist without official relationship paths", () => {
    const reader = new FakeIfcModelReader([
      entity(10, "IfcWall"),
      entity(20, "IfcWallType"),
      entity(30, "IfcMaterialLayerSetUsage"),
      entity(31, "IfcMaterialLayerSet"),
      entity(32, "IfcMaterialLayer"),
      entity(300, "IfcRelDefinesByProperties", {
        RelatedObjects: [10],
        RelatingPropertyDefinition: 800,
      }),
    ]);
    const indexResult = buildIfcExtractionIndex({
      reader,
      relevantElementStepIds: new Set([10]),
    });

    const result = detectIfcEvidenceExtractionRisk({
      reader,
      extractionIndex: indexResult.extractionIndex,
      relevantElementStepIds: new Set([10]),
    });

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "ifc_type_entities_present_without_type_links",
        severity: "warning",
        stepIds: [20],
      }),
      expect.objectContaining({
        code: "ifc_material_entities_present_without_material_associations",
        severity: "warning",
        stepIds: [30, 31, 32],
      }),
    ]);
    expect(result.citedStepIds).toEqual([20, 30, 31, 32]);
  });

  it("stays quiet when official relationship paths are indexed", () => {
    const reader = new FakeIfcModelReader([
      entity(10, "IfcWall"),
      entity(20, "IfcWallType"),
      entity(30, "IfcMaterial"),
      entity(100, "IfcRelDefinesByType", {
        RelatedObjects: [10],
        RelatingType: 20,
      }),
      entity(200, "IfcRelAssociatesMaterial", {
        RelatedObjects: [10, 20],
        RelatingMaterial: 30,
      }),
    ]);
    const indexResult = buildIfcExtractionIndex({
      reader,
      relevantElementStepIds: new Set([10]),
    });

    const result = detectIfcEvidenceExtractionRisk({
      reader,
      extractionIndex: indexResult.extractionIndex,
      relevantElementStepIds: new Set([10]),
    });

    expect(result).toEqual({
      diagnostics: [],
      citedStepIds: [],
    });
  });
});

function entity(
  stepId: StepId,
  entityClass: string,
  attributes: Record<string, unknown> = {},
): IfcEntityRecord {
  return {
    stepId,
    entityClass,
    attributes,
  };
}
