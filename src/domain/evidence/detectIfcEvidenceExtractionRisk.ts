import type { IfcExtractionIndex } from "./buildIfcExtractionIndex.js";
import type { Diagnostic, IfcModelReader, StepId } from "./evidenceTypes.js";

const TYPE_ENTITY_CLASSES = [
  "IfcWallType",
  "IfcSlabType",
  "IfcRoofType",
  "IfcCurtainWallType",
  "IfcBuildingElementProxyType",
];

const MATERIAL_ENTITY_CLASSES = [
  "IfcMaterial",
  "IfcMaterialLayerSetUsage",
  "IfcMaterialLayerSet",
  "IfcMaterialLayer",
  "IfcMaterialConstituentSet",
  "IfcMaterialList",
  "IfcMaterialProfileSetUsage",
  "IfcMaterialProfileSet",
];

export type DetectIfcEvidenceExtractionRiskResult = {
  diagnostics: Diagnostic[];
  citedStepIds: StepId[];
};

export function detectIfcEvidenceExtractionRisk(command: {
  reader: Pick<IfcModelReader, "getEntitiesByClass">;
  extractionIndex: Pick<
    IfcExtractionIndex,
    | "relevantElementStepIds"
    | "typeLinkByElementStepId"
    | "materialAssociationsByRelatedStepId"
  >;
  relevantElementStepIds: ReadonlySet<StepId>;
}): DetectIfcEvidenceExtractionRiskResult {
  if (command.relevantElementStepIds.size === 0) {
    return { diagnostics: [], citedStepIds: [] };
  }

  const diagnostics: Diagnostic[] = [];
  const citedStepIds: StepId[] = [];
  const typeEntityStepIds = sampleEntityStepIds(command.reader, TYPE_ENTITY_CLASSES);
  const materialEntityStepIds = sampleEntityStepIds(
    command.reader,
    MATERIAL_ENTITY_CLASSES,
  );

  if (
    typeEntityStepIds.length > 0 &&
    command.extractionIndex.typeLinkByElementStepId.size === 0
  ) {
    diagnostics.push({
      code: "ifc_type_entities_present_without_type_links",
      severity: "warning",
      message:
        "IFC type entities exist, but no IfcRelDefinesByType links connect them to relevant thermal elements. Type evidence will remain empty unless official relationships are present.",
      stepIds: typeEntityStepIds,
    });
    citedStepIds.push(...typeEntityStepIds);
  }

  if (
    materialEntityStepIds.length > 0 &&
    command.extractionIndex.materialAssociationsByRelatedStepId.size === 0
  ) {
    diagnostics.push({
      code: "ifc_material_entities_present_without_material_associations",
      severity: "warning",
      message:
        "IFC material entities exist, but no IfcRelAssociatesMaterial relationships connect material definitions to relevant thermal elements or their type objects. Official material association evidence is absent; conservative fallback recovery may still emit candidate material evidence when exact provenance-preserving matches are available.",
      stepIds: materialEntityStepIds,
    });
    citedStepIds.push(...materialEntityStepIds);
  }

  return {
    diagnostics,
    citedStepIds,
  };
}

function sampleEntityStepIds(
  reader: Pick<IfcModelReader, "getEntitiesByClass">,
  entityClasses: string[],
) {
  return entityClasses.flatMap((entityClass) =>
    reader
      .getEntitiesByClass(entityClass)
      .slice(0, 5)
      .map((entity) => entity.stepId),
  ).slice(0, 5);
}
