import type { IfcExtractionIndex } from "../buildIfcExtractionIndex.js";
import type { RelevantElementRecord } from "../discoverRelevantElements.js";
import { entityEvidenceReference } from "../evidenceReferences.js";
import type {
  ElementEvidence,
  FeatureExtractionResult,
  IfcModelReader,
} from "../evidenceTypes.js";

const ELEMENT_IDENTITY_ATTRIBUTES = [
  "GlobalId",
  "Name",
  "ObjectType",
  "PredefinedType",
  "Tag",
  "Description",
] as const;

export function extractElementIdentityEvidence(command: {
  reader: IfcModelReader;
  extractionIndex: IfcExtractionIndex;
  relevantElements: RelevantElementRecord[];
}): FeatureExtractionResult<ElementEvidence> {
  return {
    featureKey: "element_identity",
    evidence: command.relevantElements.map((element) =>
      toElementEvidence(command.reader, command.extractionIndex, element),
    ),
    diagnostics: [],
    citedStepIds: command.relevantElements.map((element) => element.stepId),
  };
}

function toElementEvidence(
  reader: IfcModelReader,
  extractionIndex: IfcExtractionIndex,
  element: RelevantElementRecord,
): ElementEvidence {
  const evidenceReference = entityEvidenceReference(
    element.rawEntityClass,
    element.stepId,
  );

  return {
    identity: {
      stepId: element.stepId,
      globalId: reader.getStringAttribute(element.stepId, "GlobalId"),
      rawEntityClass: element.rawEntityClass,
      elementClass: element.elementClass,
      name: reader.getStringAttribute(element.stepId, "Name"),
      objectType: reader.getStringAttribute(element.stepId, "ObjectType"),
      predefinedType: reader.getStringAttribute(
        element.stepId,
        "PredefinedType",
      ),
      tag: reader.getStringAttribute(element.stepId, "Tag"),
      description: reader.getStringAttribute(element.stepId, "Description"),
      ifcTypeObjectStepId:
        extractionIndex.typeLinkByElementStepId.get(element.stepId)
          ?.relatingTypeStepId ?? null,
      classification: element.classification,
      sourceContext: {
        containerStepId: null,
        storeyName: null,
      },
      evidenceReference,
      rawAttributeSnapshot: getRawAttributeSnapshot(reader, element.stepId),
    },
    directMaterialEvidence: [],
    directPropertySets: [],
    directQuantitySets: [],
    candidatePropertyEvidence: [],
    evidenceReferences: [evidenceReference],
    diagnostics: [],
  };
}

function getRawAttributeSnapshot(
  reader: IfcModelReader,
  stepId: number,
): ElementEvidence["identity"]["rawAttributeSnapshot"] {
  const entity = reader.getEntity(stepId);
  const attributes = entity?.attributes ?? {};

  return Object.fromEntries(
    ELEMENT_IDENTITY_ATTRIBUTES.flatMap((attribute) =>
      attribute in attributes ? [[attribute, attributes[attribute]]] : [],
    ),
  );
}
