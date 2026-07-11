import type {
  Diagnostic,
  IfcModelReader,
  StepId,
} from "./evidenceTypes.js";

export const IFC_EXTRACTION_INDEX_VERSION = "ifc-extraction-index.v1";

export type TypeLinkRaw = {
  relationshipStepId: StepId;
  relatedElementStepId: StepId;
  relatingTypeStepId: StepId;
};

export type MaterialAssociationRaw = {
  associationStepId: StepId;
  relatedStepId: StepId;
  relatingMaterialStepId: StepId;
};

export type PropertyDefinitionRaw = {
  relationshipStepId: StepId;
  relatedElementStepId: StepId;
  relatingPropertyDefinitionStepId: StepId;
};

export type IfcExtractionIndex = {
  relevantElementStepIds: Set<StepId>;
  typeLinkByElementStepId: Map<StepId, TypeLinkRaw>;
  materialAssociationsByRelatedStepId: Map<StepId, MaterialAssociationRaw[]>;
  propertyDefinitionsByElementStepId: Map<StepId, PropertyDefinitionRaw[]>;
  typePropertySetStepIdsByTypeStepId: Map<StepId, StepId[]>;
};

export type BuildIfcExtractionIndexCommand = {
  reader: IfcModelReader;
  relevantElementStepIds: Set<StepId>;
};

export type BuildIfcExtractionIndexResult = {
  extractionIndex: IfcExtractionIndex;
  diagnostics: Diagnostic[];
};

export function buildIfcExtractionIndex(
  command: BuildIfcExtractionIndexCommand,
): BuildIfcExtractionIndexResult {
  const typeLinkByElementStepId = new Map<StepId, TypeLinkRaw>();
  const materialAssociationsByRelatedStepId = new Map<
    StepId,
    MaterialAssociationRaw[]
  >();
  const propertyDefinitionsByElementStepId = new Map<
    StepId,
    PropertyDefinitionRaw[]
  >();
  const typeObjectStepIds = new Set<StepId>();

  for (const relationship of command.reader.getEntitiesByClass(
    "IfcRelDefinesByType",
  )) {
    const relatingTypeStepId = command.reader.getEntityReference(
      relationship.stepId,
      "RelatingType",
    );

    if (relatingTypeStepId === null) {
      continue;
    }

    for (const relatedStepId of command.reader.getEntityReferenceList(
      relationship.stepId,
      "RelatedObjects",
    )) {
      if (!command.relevantElementStepIds.has(relatedStepId)) {
        continue;
      }

      typeLinkByElementStepId.set(relatedStepId, {
        relationshipStepId: relationship.stepId,
        relatedElementStepId: relatedStepId,
        relatingTypeStepId,
      });
      typeObjectStepIds.add(relatingTypeStepId);
    }
  }

  const relevantOrTypeStepIds = new Set([
    ...command.relevantElementStepIds,
    ...typeObjectStepIds,
  ]);

  for (const relationship of command.reader.getEntitiesByClass(
    "IfcRelAssociatesMaterial",
  )) {
    const relatingMaterialStepId = command.reader.getEntityReference(
      relationship.stepId,
      "RelatingMaterial",
    );

    if (relatingMaterialStepId === null) {
      continue;
    }

    for (const relatedStepId of command.reader.getEntityReferenceList(
      relationship.stepId,
      "RelatedObjects",
    )) {
      if (!relevantOrTypeStepIds.has(relatedStepId)) {
        continue;
      }

      pushMapValue(materialAssociationsByRelatedStepId, relatedStepId, {
        associationStepId: relationship.stepId,
        relatedStepId,
        relatingMaterialStepId,
      });
    }
  }

  for (const relationship of command.reader.getEntitiesByClass(
    "IfcRelDefinesByProperties",
  )) {
    const relatingPropertyDefinitionStepId = command.reader.getEntityReference(
      relationship.stepId,
      "RelatingPropertyDefinition",
    );

    if (relatingPropertyDefinitionStepId === null) {
      continue;
    }

    for (const relatedStepId of command.reader.getEntityReferenceList(
      relationship.stepId,
      "RelatedObjects",
    )) {
      if (!command.relevantElementStepIds.has(relatedStepId)) {
        continue;
      }

      pushMapValue(propertyDefinitionsByElementStepId, relatedStepId, {
        relationshipStepId: relationship.stepId,
        relatedElementStepId: relatedStepId,
        relatingPropertyDefinitionStepId,
      });
    }
  }

  const typePropertySetStepIdsByTypeStepId = new Map<StepId, StepId[]>();
  for (const typeStepId of typeObjectStepIds) {
    const propertySetStepIds = command.reader.getEntityReferenceList(
      typeStepId,
      "HasPropertySets",
    );

    if (propertySetStepIds.length > 0) {
      typePropertySetStepIdsByTypeStepId.set(typeStepId, propertySetStepIds);
    }
  }

  return {
    extractionIndex: {
      relevantElementStepIds: new Set(command.relevantElementStepIds),
      typeLinkByElementStepId,
      materialAssociationsByRelatedStepId,
      propertyDefinitionsByElementStepId,
      typePropertySetStepIdsByTypeStepId,
    },
    diagnostics: [],
  };
}

function pushMapValue<TKey, TValue>(
  map: Map<TKey, TValue[]>,
  key: TKey,
  value: TValue,
) {
  const existingValues = map.get(key) ?? [];
  existingValues.push(value);
  map.set(key, existingValues);
}
