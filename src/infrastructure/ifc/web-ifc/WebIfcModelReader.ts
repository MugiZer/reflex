import * as WebIFC from "web-ifc";

import type {
  CitedIfcEntity,
  IfcEntityRecord,
  IfcHeaderEvidence,
  IfcModelReader,
  StepId,
} from "../../../domain/evidence/evidenceTypes.js";

const IFC_CLASS_CODES: Record<string, number | undefined> = {
  IfcProject: WebIFC.IFCPROJECT,
  IfcUnitAssignment: WebIFC.IFCUNITASSIGNMENT,
  IfcSIUnit: WebIFC.IFCSIUNIT,
  IfcWall: WebIFC.IFCWALL,
  IfcWallStandardCase: WebIFC.IFCWALLSTANDARDCASE,
  IfcSlab: WebIFC.IFCSLAB,
  IfcRoof: WebIFC.IFCROOF,
  IfcCurtainWall: WebIFC.IFCCURTAINWALL,
  IfcBuildingElementProxy: WebIFC.IFCBUILDINGELEMENTPROXY,
  IfcCovering: WebIFC.IFCCOVERING,
  IfcDoor: WebIFC.IFCDOOR,
  IfcWindow: WebIFC.IFCWINDOW,
  IfcOpeningElement: WebIFC.IFCOPENINGELEMENT,
  IfcSpace: WebIFC.IFCSPACE,
  IfcBeam: WebIFC.IFCBEAM,
  IfcColumn: WebIFC.IFCCOLUMN,
  IfcPlate: WebIFC.IFCPLATE,
  IfcMember: WebIFC.IFCMEMBER,
  IfcRelDefinesByType: WebIFC.IFCRELDEFINESBYTYPE,
  IfcRelAssociatesMaterial: WebIFC.IFCRELASSOCIATESMATERIAL,
  IfcRelDefinesByProperties: WebIFC.IFCRELDEFINESBYPROPERTIES,
  IfcMaterial: WebIFC.IFCMATERIAL,
  IfcMaterialLayerSetUsage: WebIFC.IFCMATERIALLAYERSETUSAGE,
  IfcMaterialLayerSet: WebIFC.IFCMATERIALLAYERSET,
  IfcMaterialLayer: WebIFC.IFCMATERIALLAYER,
  IfcMaterialConstituentSet: WebIFC.IFCMATERIALCONSTITUENTSET,
  IfcMaterialConstituent: WebIFC.IFCMATERIALCONSTITUENT,
  IfcMaterialList: WebIFC.IFCMATERIALLIST,
  IfcMaterialProfileSetUsage: WebIFC.IFCMATERIALPROFILESETUSAGE,
  IfcMaterialProfileSet: WebIFC.IFCMATERIALPROFILESET,
  IfcPropertySet: WebIFC.IFCPROPERTYSET,
  IfcElementQuantity: WebIFC.IFCELEMENTQUANTITY,
  IfcPropertySingleValue: WebIFC.IFCPROPERTYSINGLEVALUE,
  IfcQuantityLength: WebIFC.IFCQUANTITYLENGTH,
  IfcWallType: WebIFC.IFCWALLTYPE,
  IfcSlabType: WebIFC.IFCSLABTYPE,
  IfcRoofType: WebIFC.IFCROOFTYPE,
  IfcCurtainWallType: WebIFC.IFCCURTAINWALLTYPE,
  IfcBuildingElementProxyType: WebIFC.IFCBUILDINGELEMENTPROXYTYPE,
};

const ENTITY_REFERENCE_ATTRIBUTES = new Set([
  "ForLayerSet",
  "ForProfileSet",
  "Material",
  "ObjectPlacement",
  "OwnerHistory",
  "RelatingMaterial",
  "RelatingPropertyDefinition",
  "RelatingType",
  "Representation",
  "Unit",
  "UnitsInContext",
]);

const ENTITY_REFERENCE_LIST_ATTRIBUTES = new Set([
  "HasProperties",
  "HasPropertySets",
  "MaterialConstituents",
  "MaterialLayers",
  "MaterialProfiles",
  "Materials",
  "Quantities",
  "RelatedObjects",
  "Units",
]);

export class WebIfcModelReader implements IfcModelReader {
  private constructor(
    private readonly ifcApi: WebIFC.IfcAPI,
    private readonly modelId: number,
  ) {}

  static async open(sourceFileBytes: Uint8Array) {
    const ifcApi = new WebIFC.IfcAPI();
    await ifcApi.Init();
    const modelId = ifcApi.OpenModel(sourceFileBytes);
    return new WebIfcModelReader(ifcApi, modelId);
  }

  getHeader(): IfcHeaderEvidence {
    return {
      schema: this.getSchema(),
    };
  }

  getSchema(): string | null {
    try {
      const schemaLine = this.ifcApi.GetHeaderLine(
        this.modelId,
        WebIFC.FILE_SCHEMA,
      );
      return schemaLine?.arguments?.[0]?.[0]?.value ?? null;
    } catch {
      return null;
    }
  }

  hasEntityClass(entityClass: string): boolean {
    return this.getEntitiesByClass(entityClass).length > 0;
  }

  getEntitiesByClass(entityClass: string): IfcEntityRecord[] {
    const typeCode = IFC_CLASS_CODES[entityClass];
    if (typeCode === undefined) {
      return [];
    }

    return this.getLineIds(typeCode).map((stepId) => {
      const line = this.getLine(stepId);
      return {
        stepId,
        entityClass,
        attributes: line === null ? {} : toAttributeRecord(line),
      };
    });
  }

  getEntity(stepId: StepId): IfcEntityRecord | null {
    const line = this.getLine(stepId);
    if (line === null) {
      return null;
    }

    return {
      stepId,
      entityClass: this.getEntityClass(stepId) ?? "UnknownIfcEntity",
      attributes: toAttributeRecord(line),
    };
  }

  getEntityClass(stepId: StepId): string | null {
    const line = this.getLine(stepId);
    if (line === null || typeof line.type !== "number") {
      return null;
    }

    try {
      return this.ifcApi.GetNameFromTypeCode(line.type);
    } catch {
      return null;
    }
  }

  getStringAttribute(stepId: StepId, attributeName: string): string | null {
    const value = unwrapIfcValue(this.getRawAttribute(stepId, attributeName));
    return typeof value === "string" ? value : null;
  }

  getNumberAttribute(stepId: StepId, attributeName: string): number | null {
    const value = unwrapIfcValue(this.getRawAttribute(stepId, attributeName));
    return typeof value === "number" ? value : null;
  }

  getBooleanAttribute(stepId: StepId, attributeName: string): boolean | null {
    const value = unwrapIfcValue(this.getRawAttribute(stepId, attributeName));
    return typeof value === "boolean" ? value : null;
  }

  getEntityReference(stepId: StepId, attributeName: string): StepId | null {
    return getIfcStepReference(attributeName, this.getRawAttribute(stepId, attributeName));
  }

  getEntityReferenceList(stepId: StepId, attributeName: string): StepId[] {
    return getAggregateItems(this.getRawAttribute(stepId, attributeName))
      .map((value) => getIfcStepReference(attributeName, value))
      .filter((value): value is StepId => value !== null);
  }

  getCompactEntitySnapshot(stepId: StepId): CitedIfcEntity {
    const entity = this.getEntity(stepId);
    return {
      stepId,
      entityClass: entity?.entityClass ?? null,
      attributes: entity?.attributes ?? {},
    };
  }

  close() {
    this.ifcApi.CloseModel(this.modelId);
  }

  private getRawAttribute(stepId: StepId, attributeName: string) {
    const line = this.getLine(stepId);
    return line?.[attributeName];
  }

  private getLineIds(typeCode: number) {
    const ids = this.ifcApi.GetLineIDsWithType(this.modelId, typeCode);
    const stepIds: StepId[] = [];

    for (let index = 0; index < ids.size(); index += 1) {
      stepIds.push(ids.get(index));
    }

    return stepIds;
  }

  private getLine(stepId: StepId): Record<string, unknown> | null {
    try {
      return this.ifcApi.GetLine(this.modelId, stepId, false);
    } catch {
      return null;
    }
  }
}

function toAttributeRecord(line: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(line)
      .filter(([key]) => key !== "expressID" && key !== "type")
      .map(([key, value]) => [key, compactIfcAttributeValue(key, value)]),
  );
}

export function compactIfcAttributeValue(
  attributeName: string,
  value: unknown,
): unknown {
  const stepReference = getIfcStepReference(attributeName, value);
  if (stepReference !== null) {
    return { stepId: stepReference };
  }

  const aggregateItems = getAggregateItems(value);
  if (aggregateItems.length > 0) {
    return aggregateItems.map((item) =>
      compactIfcAttributeValue(attributeName, item),
    );
  }

  return unwrapIfcValue(value);
}

function unwrapIfcValue(value: unknown): unknown {
  if (typeof value === "object" && value !== null && "value" in value) {
    return (value as { value: unknown }).value;
  }

  return value;
}

export function getIfcStepReference(
  attributeName: string,
  value: unknown,
): StepId | null {
  if (
    !ENTITY_REFERENCE_ATTRIBUTES.has(attributeName) &&
    !ENTITY_REFERENCE_LIST_ATTRIBUTES.has(attributeName)
  ) {
    return null;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "object" && value !== null && "value" in value) {
    const wrappedValue = (value as { value: unknown }).value;
    return typeof wrappedValue === "number" ? wrappedValue : null;
  }

  return null;
}

function getAggregateItems(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "object" && value !== null && "value" in value) {
    const wrappedValue = (value as { value: unknown }).value;
    return Array.isArray(wrappedValue) ? wrappedValue : [];
  }

  return [];
}
