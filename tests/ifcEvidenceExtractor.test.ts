import { WebIfcEvidenceExtractor } from "../src/infrastructure/ifc/web-ifc/WebIfcEvidenceExtractor.js";
import { createMilestone1ArtifactPackage } from "../src/application/ifc/createMilestone1ArtifactPackage.js";
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

describe("WebIfcEvidenceExtractor", () => {
  it("returns pure element and type evidence with provenance and cited entities", async () => {
    const extractor = new WebIfcEvidenceExtractor({
      openReader: async () =>
        new FakeIfcModelReader([
          entity(10, "IfcWallStandardCase", {
            GlobalId: "wall-global-id",
            Name: "Exterior wall A",
            ObjectType: "Basic wall",
            PredefinedType: "STANDARD",
            Tag: "W-001",
            Description: "External wall",
          }),
          entity(11, "IfcBuildingElementProxy", {
            Name: "External facade proxy",
            ObjectType: "Facade backup",
          }),
          entity(12, "IfcDoor"),
          entity(20, "IfcWallType", {
            GlobalId: "wall-type-global-id",
            Name: "Wall type A",
            PredefinedType: "STANDARD",
            Tag: "WT-001",
            Description: "Shared exterior wall type",
            ElementType: "Basic wall type",
            HasPropertySets: [501],
          }),
          entity(100, "IfcRelDefinesByType", {
            RelatedObjects: [10],
            RelatingType: 20,
          }),
        ]),
    });

    const result = await extractor.extract({
      sourceFilePath: "fixture.ifc",
      fileHash: "abc123",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.ifcEvidence.fileEvidence).toEqual({
      fileHash: "abc123",
      schema: "IFC4",
      projectLengthUnitSignal: {
        ifcProjectCount: 0,
        unitsInContextAvailable: false,
        lengthUnitAppearsAvailable: false,
        evidenceReferences: [],
      },
      skippedScopeSummaries: [
        {
          rawEntityClass: "IfcDoor",
          count: 1,
          reason: "Out of Milestone 1 thermal assembly scope.",
        },
      ],
    });
    expect(result.ifcEvidence.elementEvidence).toEqual([
      expect.objectContaining({
        identity: expect.objectContaining({
          stepId: 10,
          globalId: "wall-global-id",
          rawEntityClass: "IfcWallStandardCase",
          elementClass: "IfcWall",
          name: "Exterior wall A",
          objectType: "Basic wall",
          predefinedType: "STANDARD",
          tag: "W-001",
          description: "External wall",
          ifcTypeObjectStepId: 20,
          classification: expect.objectContaining({
            classificationConfidence: "high",
            needsUserConfirmation: false,
          }),
        }),
      }),
      expect.objectContaining({
        identity: expect.objectContaining({
          stepId: 11,
          rawEntityClass: "IfcBuildingElementProxy",
          elementClass: "IfcBuildingElementProxy",
          classification: expect.objectContaining({
            classificationConfidence: "low",
            matchedHints: ["facade", "external"],
            needsUserConfirmation: true,
          }),
        }),
      }),
    ]);
    expect(result.ifcEvidence.typeEvidence).toEqual([
      expect.objectContaining({
        identity: expect.objectContaining({
          stepId: 20,
          globalId: "wall-type-global-id",
          rawEntityClass: "IfcWallType",
          name: "Wall type A",
          predefinedType: "STANDARD",
          tag: "WT-001",
          description: "Shared exterior wall type",
        }),
      }),
    ]);
    expect(result.ifcEvidence.citedIfcEntities.map((entity) => entity.stepId))
      .toEqual([10, 11, 20]);

    const serialized = JSON.stringify(result.ifcEvidence);
    expect(serialized).not.toContain("assemblyCandidates");
    expect(serialized).not.toContain("missingDatapoints");
    expect(serialized).not.toContain("readinessState");
    expect(serialized).not.toContain("calculationSnapshot");
    expect(serialized).not.toContain("requestedInput");
  });

  it("extracts material, layer, property, quantity, and candidate property evidence without unit assumptions", async () => {
    const extractor = new WebIfcEvidenceExtractor({
      openReader: async () =>
        new FakeIfcModelReader([
          entity(1, "IfcProject", { UnitsInContext: 2 }),
          entity(2, "IfcUnitAssignment", { Units: [3] }),
          entity(3, "IfcSIUnit", {
            UnitType: "LENGTHUNIT",
            Prefix: "MILLI",
            Name: "METRE",
          }),
          entity(10, "IfcWall", {
            GlobalId: "wall-with-evidence",
            Name: "Exterior wall with layers",
          }),
          entity(20, "IfcWallType", {
            GlobalId: "wall-type-with-evidence",
            Name: "Exterior wall type",
            HasPropertySets: [501, 550],
          }),
          entity(100, "IfcRelDefinesByType", {
            RelatedObjects: [10],
            RelatingType: 20,
          }),
          entity(200, "IfcRelAssociatesMaterial", {
            RelatedObjects: [10],
            RelatingMaterial: 700,
          }),
          entity(201, "IfcRelAssociatesMaterial", {
            RelatedObjects: [20],
            RelatingMaterial: 730,
          }),
          entity(700, "IfcMaterialLayerSetUsage", {
            ForLayerSet: 701,
            LayerSetDirection: "AXIS2",
            DirectionSense: "POSITIVE",
            OffsetFromReferenceLine: 15,
            ReferenceExtent: 3000,
          }),
          entity(701, "IfcMaterialLayerSet", {
            MaterialLayers: [702, 703],
            LayerSetName: "Exterior wall build-up",
            Description: "Two-layer wall",
          }),
          entity(702, "IfcMaterialLayer", {
            Material: 710,
            LayerThickness: 120,
            IsVentilated: false,
            Name: "Block layer",
            Description: "Structural block",
            Category: "masonry",
            Priority: 1,
          }),
          entity(703, "IfcMaterialLayer", {
            Material: 711,
            LayerThickness: 80,
            Name: "Insulation layer",
          }),
          entity(710, "IfcMaterial", {
            Name: "Concrete block",
            Category: "masonry",
          }),
          entity(711, "IfcMaterial", { Name: "Mineral wool" }),
          entity(730, "IfcMaterialConstituentSet", {
            Name: "Type constituent evidence",
            MaterialConstituents: [731],
          }),
          entity(731, "IfcMaterialConstituent", {
            Name: "Core constituent",
            Material: 711,
          }),
          entity(300, "IfcRelDefinesByProperties", {
            RelatedObjects: [10],
            RelatingPropertyDefinition: 400,
          }),
          entity(301, "IfcRelDefinesByProperties", {
            RelatedObjects: [10],
            RelatingPropertyDefinition: 450,
          }),
          entity(400, "IfcPropertySet", {
            Name: "Pset_WallCommon",
            HasProperties: [401, 402, 403],
          }),
          entity(401, "IfcPropertySingleValue", {
            Name: "ThermalConductivity",
            NominalValue: 0.14,
          }),
          entity(402, "IfcPropertySingleValue", {
            Name: "Thickness",
            NominalValue: 200,
            ValueType: "IfcLengthMeasure",
          }),
          entity(403, "IfcPropertySingleValue", {
            Name: "Reference",
            NominalValue: "External wall",
          }),
          entity(450, "IfcElementQuantity", {
            Name: "Qto_WallBaseQuantities",
            Quantities: [451],
          }),
          entity(451, "IfcQuantityLength", {
            Name: "Width",
            LengthValue: 220,
          }),
          entity(501, "IfcPropertySet", {
            Name: "Pset_TypeThermal",
            HasProperties: [502],
          }),
          entity(502, "IfcPropertySingleValue", {
            Name: "LambdaValue",
            NominalValue: 0.035,
            Unit: 503,
          }),
          entity(503, "IfcSIUnit", {
            UnitType: "THERMALCONDUCTANCEUNIT",
            Name: "WATT_PER_METRE_KELVIN",
          }),
          entity(550, "IfcElementQuantity", {
            Name: "Qto_TypeWallBaseQuantities",
            Quantities: [551],
          }),
          entity(551, "IfcQuantityLength", {
            Name: "Width",
            LengthValue: 240,
          }),
        ]),
    });

    const result = await extractor.extract({
      sourceFilePath: "fixture.ifc",
      fileHash: "abc123",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const wall = result.ifcEvidence.elementEvidence[0];
    expect(wall.directMaterialEvidence).toEqual([
      expect.objectContaining({
        associationScope: "occurrence",
        associationStepId: 200,
        relatingMaterialStepId: 700,
        materialStructureKind: "layer_set_usage",
        layerSetUsage: expect.objectContaining({
          stepId: 700,
          forLayerSetStepId: 701,
          layerSetDirection: "AXIS2",
          directionSense: "POSITIVE",
          offsetFromReferenceLine: expect.objectContaining({
            rawValue: 15,
            rawUnit: "MILLI METRE",
            normalizedValue: 0.015,
            normalizedUnit: "m",
            unitSource: "ifc_project_units",
          }),
          referenceExtent: expect.objectContaining({
            rawValue: 3000,
            normalizedValue: 3,
          }),
        }),
        layerSet: expect.objectContaining({
          stepId: 701,
          layerSetName: "Exterior wall build-up",
          materialLayerStepIds: [702, 703],
        }),
        layerOrderSource: "IfcMaterialLayerSet.MaterialLayers",
        totalLayerThickness: expect.objectContaining({
          rawValue: 200,
          normalizedValue: 0.2,
        }),
        layers: [
          expect.objectContaining({
            layerIndex: 0,
            layerStepId: 702,
            materialStepId: 710,
            materialName: "Concrete block",
            materialCategory: "masonry",
            thickness: expect.objectContaining({
              rawValue: 120,
              rawUnit: "MILLI METRE",
              normalizedValue: 0.12,
            }),
            candidatePropertyEvidence: [
              expect.objectContaining({ candidateKind: "layer_thickness" }),
            ],
          }),
          expect.objectContaining({
            layerIndex: 1,
            layerStepId: 703,
            materialName: "Mineral wool",
            thickness: expect.objectContaining({
              rawValue: 80,
              normalizedValue: 0.08,
            }),
          }),
        ],
      }),
    ]);
    expect(wall.directPropertySets).toEqual([
      expect.objectContaining({
        propertySetStepId: 400,
        name: "Pset_WallCommon",
        properties: expect.arrayContaining([
          expect.objectContaining({
            name: "ThermalConductivity",
            numericEvidence: expect.objectContaining({
              rawValue: 0.14,
              normalizedValue: null,
              unitSource: "unknown",
            }),
          }),
        ]),
      }),
    ]);
    expect(wall.directQuantitySets).toEqual([
      expect.objectContaining({
        quantitySetStepId: 450,
        name: "Qto_WallBaseQuantities",
        quantities: [
          expect.objectContaining({
            name: "Width",
            numericEvidence: expect.objectContaining({
              rawValue: 220,
              normalizedValue: 0.22,
              unitSource: "ifc_measure_type",
            }),
          }),
        ],
      }),
    ]);
    expect(wall.candidatePropertyEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          candidateKind: "lambda",
          propertySetName: "Pset_WallCommon",
          propertyName: "ThermalConductivity",
          rawValue: 0.14,
          rawUnit: null,
          normalizedValue: null,
          normalizedUnit: "W/mK",
          lambdaClassification: "candidate_lambda",
        }),
        expect.objectContaining({
          candidateKind: "assembly_thickness",
          propertyName: "Thickness",
          normalizedValue: 0.2,
          normalizedUnit: "m",
        }),
        expect.objectContaining({
          candidateKind: "classification",
          propertyName: "Reference",
          rawValue: "External wall",
        }),
        expect.objectContaining({
          candidateKind: "assembly_thickness",
          propertySetName: "Qto_WallBaseQuantities",
          propertyName: "Width",
          normalizedValue: 0.22,
        }),
      ]),
    );

    const typeEvidence = result.ifcEvidence.typeEvidence[0];
    expect(typeEvidence.materialEvidence).toEqual([
      expect.objectContaining({
        associationScope: "type",
        materialStructureKind: "constituent_set",
        constituents: [
          expect.objectContaining({
            constituentStepId: 731,
            materialStepId: 711,
            materialName: "Mineral wool",
          }),
        ],
      }),
    ]);
    expect(typeEvidence.propertySets).toEqual([
      expect.objectContaining({
        propertySetStepId: 501,
        name: "Pset_TypeThermal",
      }),
    ]);
    expect(typeEvidence.quantitySets).toEqual([
      expect.objectContaining({
        quantitySetStepId: 550,
        name: "Qto_TypeWallBaseQuantities",
        quantities: [
          expect.objectContaining({
            name: "Width",
            numericEvidence: expect.objectContaining({
              normalizedValue: 0.24,
            }),
          }),
        ],
      }),
    ]);
    expect(typeEvidence.candidatePropertyEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          candidateKind: "lambda",
          propertySetName: "Pset_TypeThermal",
          propertyName: "LambdaValue",
          rawValue: 0.035,
          normalizedValue: 0.035,
          normalizedUnit: "W/mK",
          lambdaClassification: "confirmed_lambda",
        }),
        expect.objectContaining({
          candidateKind: "assembly_thickness",
          propertySetName: "Qto_TypeWallBaseQuantities",
          propertyName: "Width",
          normalizedValue: 0.24,
        }),
      ]),
    );
    expect(result.ifcEvidence.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "numeric_unit_unknown",
          stepIds: [401],
        }),
      ]),
    );
  });

  it("preserves supported non-layered and unknown material structure evidence", async () => {
    const extractor = new WebIfcEvidenceExtractor({
      openReader: async () =>
        new FakeIfcModelReader([
          entity(10, "IfcWall"),
          entity(20, "IfcWallType"),
          entity(100, "IfcRelDefinesByType", {
            RelatedObjects: [10],
            RelatingType: 20,
          }),
          entity(200, "IfcRelAssociatesMaterial", {
            RelatedObjects: [10],
            RelatingMaterial: 700,
          }),
          entity(201, "IfcRelAssociatesMaterial", {
            RelatedObjects: [10],
            RelatingMaterial: 701,
          }),
          entity(202, "IfcRelAssociatesMaterial", {
            RelatedObjects: [10],
            RelatingMaterial: 702,
          }),
          entity(203, "IfcRelAssociatesMaterial", {
            RelatedObjects: [10],
            RelatingMaterial: 703,
          }),
          entity(204, "IfcRelAssociatesMaterial", {
            RelatedObjects: [20],
            RelatingMaterial: 704,
          }),
          entity(700, "IfcMaterial", { Name: "Brick" }),
          entity(701, "IfcMaterialLayerSet", { MaterialLayers: [] }),
          entity(702, "IfcMaterialList", { Materials: [700] }),
          entity(703, "IfcMaterialProfileSet", { MaterialProfiles: [900] }),
          entity(704, "IfcMaterialProfileSetUsage", { ForProfileSet: 703 }),
          entity(705, "IfcRelAssociatesMaterial", {
            RelatedObjects: [10],
            RelatingMaterial: 999,
          }),
          entity(999, "IfcSomethingMaterialLike"),
        ]),
    });

    const result = await extractor.extract({ sourceFilePath: "fixture.ifc" });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(
      result.ifcEvidence.elementEvidence[0].directMaterialEvidence.map(
        (evidence) => evidence.materialStructureKind,
      ),
    ).toEqual([
      "single_material",
      "layer_set",
      "material_list",
      "profile_set",
      "unknown",
    ]);
    expect(
      result.ifcEvidence.typeEvidence[0].materialEvidence.map(
        (evidence) => evidence.materialStructureKind,
      ),
    ).toEqual(["profile_set_usage"]);
    expect(result.ifcEvidence.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "usage_material_definition_on_type",
          stepIds: [704],
        }),
      ]),
    );
  });

  it("recovers exact Revit layer-set name matches when official material associations are absent", async () => {
    const extractor = new WebIfcEvidenceExtractor({
      openReader: async () =>
        new FakeIfcModelReader([
          entity(1, "IfcProject", { UnitsInContext: 2 }),
          entity(2, "IfcUnitAssignment", { Units: [3] }),
          entity(3, "IfcSIUnit", {
            UnitType: "LENGTHUNIT",
            Prefix: "MILLI",
            Name: "METRE",
          }),
          entity(10, "IfcWall", {
            GlobalId: "wall-recovered",
            ObjectType: "Basic Wall: Exterior 200mm",
          }),
          entity(701, "IfcMaterialLayerSet", {
            MaterialLayers: [702, 703],
            LayerSetName: "Basic Wall: Exterior 200mm",
          }),
          entity(704, "IfcMaterialLayerSetUsage", {
            ForLayerSet: 701,
            LayerSetDirection: "AXIS2",
          }),
          entity(702, "IfcMaterialLayer", {
            Material: 710,
            LayerThickness: 120,
          }),
          entity(703, "IfcMaterialLayer", {
            Material: 711,
            LayerThickness: 80,
          }),
          entity(710, "IfcMaterial", { Name: "Concrete block" }),
          entity(711, "IfcMaterial", { Name: "Mineral wool" }),
        ]),
    });

    const result = await extractor.extract({ sourceFilePath: "fixture.ifc" });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const recoveredEvidence =
      result.ifcEvidence.elementEvidence[0].directMaterialEvidence[0];
    expect(recoveredEvidence).toEqual(
      expect.objectContaining({
        materialEvidenceSource: "recovered_layer_set_name_match",
        associationScope: "occurrence",
        materialStructureKind: "layer_set",
        recovery: expect.objectContaining({
          strategy: "revit_layer_set_name_match",
          matchedSourceAttribute: "ObjectType",
          matchedSourceValue: "Basic Wall: Exterior 200mm",
          matchedLayerSetName: "Basic Wall: Exterior 200mm",
          matchKind: "exact_normalized",
          confidence: "medium",
          needsUserConfirmation: true,
        }),
        layerSet: expect.objectContaining({
          stepId: 701,
          layerSetName: "Basic Wall: Exterior 200mm",
        }),
        layers: [
          expect.objectContaining({
            materialName: "Concrete block",
            thickness: expect.objectContaining({ normalizedValue: 0.12 }),
          }),
          expect.objectContaining({
            materialName: "Mineral wool",
            thickness: expect.objectContaining({ normalizedValue: 0.08 }),
          }),
        ],
      }),
    );
    expect(result.ifcEvidence.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "revit_layer_set_name_match_recovered",
          stepIds: [10, 701],
        }),
      ]),
    );
    expect(result.ifcEvidence.citedIfcEntities.map((entity) => entity.stepId))
      .toEqual(expect.arrayContaining([10, 701, 702, 703, 704, 710, 711]));

    const artifactPackage = createMilestone1ArtifactPackage({
      ifcEvidence: result.ifcEvidence,
    });
    expect(artifactPackage.calculationInputEvidence[0]).toEqual(
      expect.objectContaining({
        elementStepId: 10,
        calculationInputBasis: "layered_needs_material_resolution",
        fixedInputs: expect.arrayContaining([
          expect.objectContaining({ field: "layer_order" }),
          expect.objectContaining({ field: "layer_thickness", value: 0.12 }),
          expect.objectContaining({
            field: "layer_material_name",
            value: "Concrete block",
          }),
        ]),
        missingInputs: [
          expect.objectContaining({
            field: "layer_lambda",
            layer: expect.objectContaining({ layerIndex: 0, layerStepId: 702 }),
          }),
          expect.objectContaining({
            field: "layer_lambda",
            layer: expect.objectContaining({ layerIndex: 1, layerStepId: 703 }),
          }),
        ],
      }),
    );
  });

  it("does not run recovered layer-set matching over official material evidence", async () => {
    const extractor = new WebIfcEvidenceExtractor({
      openReader: async () =>
        new FakeIfcModelReader([
          entity(10, "IfcWall", { ObjectType: "Wall Type A" }),
          entity(200, "IfcRelAssociatesMaterial", {
            RelatedObjects: [10],
            RelatingMaterial: 700,
          }),
          entity(700, "IfcMaterial", { Name: "Official material" }),
          entity(701, "IfcMaterialLayerSet", {
            MaterialLayers: [],
            LayerSetName: "Wall Type A",
          }),
        ]),
    });

    const result = await extractor.extract({ sourceFilePath: "fixture.ifc" });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.ifcEvidence.elementEvidence[0].directMaterialEvidence)
      .toEqual([
        expect.objectContaining({
          materialEvidenceSource: "official_rel_associates_material",
          materialStructureKind: "single_material",
          materialName: "Official material",
        }),
      ]);
    expect(result.ifcEvidence.diagnostics).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "revit_layer_set_name_match_recovered",
        }),
      ]),
    );
  });

  it("emits ambiguous recovery diagnostics and does not choose duplicate layer-set names", async () => {
    const extractor = new WebIfcEvidenceExtractor({
      openReader: async () =>
        new FakeIfcModelReader([
          entity(10, "IfcWall", { ObjectType: "Wall Type A" }),
          entity(701, "IfcMaterialLayerSet", {
            MaterialLayers: [],
            LayerSetName: "Wall Type A",
          }),
          entity(702, "IfcMaterialLayerSet", {
            MaterialLayers: [],
            LayerSetName: "wall-type-a",
          }),
        ]),
    });

    const result = await extractor.extract({ sourceFilePath: "fixture.ifc" });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.ifcEvidence.elementEvidence[0].directMaterialEvidence)
      .toEqual([]);
    expect(result.ifcEvidence.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "revit_layer_set_name_match_ambiguous",
          stepIds: [10, 701, 702],
        }),
      ]),
    );
  });

  it("reports official relationship path gaps without inventing fallback evidence when no exact match exists", async () => {
    const extractor = new WebIfcEvidenceExtractor({
      openReader: async () =>
        new FakeIfcModelReader([
          entity(10, "IfcWall"),
          entity(20, "IfcWallType"),
          entity(30, "IfcMaterialLayerSetUsage"),
          entity(31, "IfcMaterialLayerSet"),
        ]),
    });

    const result = await extractor.extract({ sourceFilePath: "fixture.ifc" });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.ifcEvidence.typeEvidence).toEqual([]);
    expect(result.ifcEvidence.elementEvidence[0].directMaterialEvidence)
      .toEqual([]);
    expect(result.ifcEvidence.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "ifc_type_entities_present_without_type_links",
          stepIds: [20],
        }),
        expect.objectContaining({
          code: "ifc_material_entities_present_without_material_associations",
          stepIds: [30, 31],
        }),
      ]),
    );
    expect(result.ifcEvidence.citedIfcEntities.map((entity) => entity.stepId))
      .toEqual([10, 20, 30, 31]);
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
