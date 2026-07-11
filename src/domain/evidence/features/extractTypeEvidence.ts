import type { IfcExtractionIndex } from "../buildIfcExtractionIndex.js";
import { entityEvidenceReference } from "../evidenceReferences.js";
import type {
  FeatureExtractionResult,
  IfcModelReader,
  StepId,
  TypeEvidence,
} from "../evidenceTypes.js";

const TYPE_IDENTITY_ATTRIBUTES = [
  "GlobalId",
  "Name",
  "PredefinedType",
  "Tag",
  "Description",
  "ElementType",
] as const;

export function extractTypeEvidence(command: {
  reader: IfcModelReader;
  extractionIndex: IfcExtractionIndex;
}): FeatureExtractionResult<TypeEvidence> {
  const typeStepIds = [
    ...new Set(
      Array.from(command.extractionIndex.typeLinkByElementStepId.values()).map(
        (typeLink) => typeLink.relatingTypeStepId,
      ),
    ),
  ];

  return {
    featureKey: "type_identity",
    evidence: typeStepIds.map((typeStepId) =>
      toTypeEvidence(command.reader, typeStepId),
    ),
    diagnostics: [],
    citedStepIds: typeStepIds,
  };
}

function toTypeEvidence(
  reader: IfcModelReader,
  typeStepId: StepId,
): TypeEvidence {
  const rawEntityClass =
    reader.getEntityClass(typeStepId) ?? "UnknownIfcTypeObject";
  const evidenceReference = entityEvidenceReference(rawEntityClass, typeStepId);

  return {
    identity: {
      stepId: typeStepId,
      globalId: reader.getStringAttribute(typeStepId, "GlobalId"),
      rawEntityClass,
      name: reader.getStringAttribute(typeStepId, "Name"),
      predefinedType: reader.getStringAttribute(typeStepId, "PredefinedType"),
      tag: reader.getStringAttribute(typeStepId, "Tag"),
      description: reader.getStringAttribute(typeStepId, "Description"),
      rawAttributeSnapshot: getRawAttributeSnapshot(reader, typeStepId),
      evidenceReference,
    },
    materialEvidence: [],
    propertySets: [],
    quantitySets: [],
    candidatePropertyEvidence: [],
    diagnostics: [],
  };
}

function getRawAttributeSnapshot(
  reader: IfcModelReader,
  stepId: StepId,
): TypeEvidence["identity"]["rawAttributeSnapshot"] {
  const entity = reader.getEntity(stepId);
  const attributes = entity?.attributes ?? {};

  return Object.fromEntries(
    TYPE_IDENTITY_ATTRIBUTES.flatMap((attribute) =>
      attribute in attributes ? [[attribute, attributes[attribute]]] : [],
    ),
  );
}
