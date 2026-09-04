import { extractLayerSetEvidence } from "./extractLayeredMaterialEvidence.js";
import type { ProjectLengthUnit } from "./numericEvidenceNormalizer.js";
import type {
  Diagnostic,
  ElementEvidence,
  EvidenceReference,
  IfcModelReader,
  LayeredMaterialEvidence,
  StepId,
  TypeEvidence,
} from "../evidenceTypes.js";

type RecoverySource = {
  attribute: "ObjectType" | "Name" | "TypeName";
  value: string;
};

export function recoverRevitLayerSetNameMatchEvidence(command: {
  reader: IfcModelReader;
  elementEvidence: ElementEvidence[];
  typeEvidence: TypeEvidence[];
  projectLengthUnit: ProjectLengthUnit;
}): {
  elementEvidence: ElementEvidence[];
  diagnostics: Diagnostic[];
  citedStepIds: StepId[];
} {
  const layerSetsByNormalizedName = indexLayerSetsByNormalizedName(command.reader);
  const typeEvidenceByStepId = new Map(
    command.typeEvidence.map((typeEvidence) => [
      typeEvidence.identity.stepId,
      typeEvidence,
    ]),
  );
  const diagnostics: Diagnostic[] = [];
  const citedStepIds: StepId[] = [];

  return {
    elementEvidence: command.elementEvidence.map((element) => {
      const typeEvidence =
        element.identity.ifcTypeObjectStepId === null
          ? null
          : typeEvidenceByStepId.get(element.identity.ifcTypeObjectStepId) ??
            null;

      if (
        element.directMaterialEvidence.length > 0 ||
        (typeEvidence?.materialEvidence.length ?? 0) > 0
      ) {
        return element;
      }

      const source = getRecoverySource(element, typeEvidence);
      if (source === null) {
        return element;
      }

      const normalizedSourceName = normalizeLayerSetName(source.value);
      const matchingLayerSetStepIds =
        layerSetsByNormalizedName.get(normalizedSourceName) ?? [];

      if (matchingLayerSetStepIds.length === 0) {
        return element;
      }

      if (matchingLayerSetStepIds.length > 1) {
        diagnostics.push({
          code: "revit_layer_set_name_match_ambiguous",
          severity: "warning",
          message:
            `Multiple IfcMaterialLayerSet.LayerSetName values exactly match ${source.attribute} "${source.value}" after normalization; no recovered layer stack was chosen.`,
          stepIds: [element.identity.stepId, ...matchingLayerSetStepIds],
        });
        citedStepIds.push(element.identity.stepId, ...matchingLayerSetStepIds);
        return element;
      }

      const layerSetStepId = matchingLayerSetStepIds[0];
      const layerSetName =
        command.reader.getStringAttribute(layerSetStepId, "LayerSetName") ??
        source.value;
      const materialEvidence = toRecoveredLayeredMaterialEvidence({
        reader: command.reader,
        sourceElement: element,
        source,
        layerSetStepId,
        layerSetName,
        projectLengthUnit: command.projectLengthUnit,
        diagnostics,
        citedStepIds,
      });

      diagnostics.push({
        code: "revit_layer_set_name_match_recovered",
        severity: "info",
        message:
          `Recovered possible layer stack from exact normalized ${source.attribute} to IfcMaterialLayerSet.LayerSetName match. Official material association links were absent; recovered evidence needs user confirmation.`,
        stepIds: [element.identity.stepId, layerSetStepId],
      });

      return {
        ...element,
        directMaterialEvidence: [materialEvidence],
        evidenceReferences: [
          ...element.evidenceReferences,
          materialEvidence.evidenceReference,
        ],
      };
    }),
    diagnostics,
    citedStepIds,
  };
}

function toRecoveredLayeredMaterialEvidence(command: {
  reader: IfcModelReader;
  sourceElement: ElementEvidence;
  source: RecoverySource;
  layerSetStepId: StepId;
  layerSetName: string;
  projectLengthUnit: ProjectLengthUnit;
  diagnostics: Diagnostic[];
  citedStepIds: StepId[];
}): LayeredMaterialEvidence {
  const contextLayerSetUsageStepIds = command.reader
    .getEntitiesByClass("IfcMaterialLayerSetUsage")
    .filter(
      (usage) =>
        command.reader.getEntityReference(usage.stepId, "ForLayerSet") ===
        command.layerSetStepId,
    )
    .map((usage) => usage.stepId);
  command.citedStepIds.push(
    command.sourceElement.identity.stepId,
    command.layerSetStepId,
    ...contextLayerSetUsageStepIds,
  );
  const layerSetEvidence = extractLayerSetEvidence({
    reader: command.reader,
    layerSetStepId: command.layerSetStepId,
    projectLengthUnit: command.projectLengthUnit,
    diagnostics: command.diagnostics,
    citedStepIds: command.citedStepIds,
  });

  return {
    materialEvidenceId: `mat_recovered_${command.sourceElement.identity.stepId}_${command.layerSetStepId}`,
    materialEvidenceSource: "recovered_layer_set_name_match",
    associationScope: "occurrence",
    associationStepId: command.sourceElement.identity.stepId,
    relatingMaterialStepId: command.layerSetStepId,
    materialStructureKind: "layer_set",
    evidenceReference: recoveryEvidenceReference({
      elementClass: command.sourceElement.identity.rawEntityClass,
      elementStepId: command.sourceElement.identity.stepId,
      sourceAttribute: command.source.attribute,
      layerSetStepId: command.layerSetStepId,
    }),
    diagnostics: [],
    recovery: {
      strategy: "revit_layer_set_name_match",
      matchedSourceAttribute: command.source.attribute,
      matchedSourceValue: command.source.value,
      matchedLayerSetName: command.layerSetName,
      matchKind: "exact_normalized",
      confidence: "medium",
      needsUserConfirmation: true,
      contextLayerSetUsageStepIds,
    },
    layerSetUsage: null,
    ...layerSetEvidence,
  };
}

function indexLayerSetsByNormalizedName(reader: IfcModelReader) {
  const index = new Map<string, StepId[]>();
  for (const layerSet of reader.getEntitiesByClass("IfcMaterialLayerSet")) {
    const layerSetName = reader.getStringAttribute(
      layerSet.stepId,
      "LayerSetName",
    );
    if (layerSetName === null) {
      continue;
    }
    const normalizedName = normalizeLayerSetName(layerSetName);
    if (normalizedName.length === 0) {
      continue;
    }
    index.set(normalizedName, [
      ...(index.get(normalizedName) ?? []),
      layerSet.stepId,
    ]);
  }
  return index;
}

function getRecoverySource(
  element: ElementEvidence,
  typeEvidence: TypeEvidence | null,
): RecoverySource | null {
  if (element.identity.objectType !== null) {
    return {
      attribute: "ObjectType",
      value: element.identity.objectType,
    };
  }
  if (element.identity.name !== null) {
    return {
      attribute: "Name",
      value: element.identity.name,
    };
  }
  if (typeEvidence?.identity.name !== null && typeEvidence?.identity.name !== undefined) {
    return {
      attribute: "TypeName",
      value: typeEvidence.identity.name,
    };
  }
  return null;
}

function normalizeLayerSetName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function recoveryEvidenceReference(command: {
  elementClass: string;
  elementStepId: StepId;
  sourceAttribute: RecoverySource["attribute"];
  layerSetStepId: StepId;
}): EvidenceReference {
  return {
    evidencePath:
      `${command.elementClass}#${command.elementStepId} -> ${command.sourceAttribute} exact_normalized -> IfcMaterialLayerSet#${command.layerSetStepId} -> LayerSetName`,
    sourceStepIds: [command.elementStepId, command.layerSetStepId],
    pathParts: [
      {
        stepId: command.elementStepId,
        entityClass: command.elementClass,
        attribute:
          command.sourceAttribute === "TypeName"
            ? "Name"
            : command.sourceAttribute,
      },
      {
        stepId: command.layerSetStepId,
        entityClass: "IfcMaterialLayerSet",
        attribute: "LayerSetName",
      },
    ],
  };
}
