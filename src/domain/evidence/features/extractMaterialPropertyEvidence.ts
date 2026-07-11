import type { IfcExtractionIndex } from "../buildIfcExtractionIndex.js";
import { entityEvidenceReference } from "../evidenceReferences.js";
import {
  emptyLayerSetEvidence,
  extractLayerSetEvidence,
} from "./extractLayeredMaterialEvidence.js";
import {
  findProjectLengthUnit,
  numberAttributeEvidence,
  type ProjectLengthUnit,
} from "./numericEvidenceNormalizer.js";
import {
  extractPropertyAndQuantityEvidence,
  extractTypePropertyEvidence,
} from "./propertySetEvidenceExtractor.js";
import { recoverRevitLayerSetNameMatchEvidence } from "./recoverRevitLayerSetNameMatchEvidence.js";
import type {
  CandidatePropertyEvidence,
  Diagnostic,
  ElementEvidence,
  IfcModelReader,
  MaterialEvidence,
  StepId,
  TypeEvidence,
} from "../evidenceTypes.js";

type EnrichmentResult = {
  elementEvidence: ElementEvidence[];
  typeEvidence: TypeEvidence[];
  diagnostics: Diagnostic[];
  citedStepIds: StepId[];
};

export function extractMaterialPropertyEvidence(command: {
  reader: IfcModelReader;
  extractionIndex: IfcExtractionIndex;
  elementEvidence: ElementEvidence[];
  typeEvidence: TypeEvidence[];
}): EnrichmentResult {
  const context = createExtractionContext(command.reader);
  const citedStepIds: StepId[] = [];

  const officialElementEvidence = command.elementEvidence.map((element) => {
    const materialEvidence = extractMaterialEvidenceForRelatedStep({
      reader: command.reader,
      extractionIndex: command.extractionIndex,
      relatedStepId: element.identity.stepId,
      associationScope: "occurrence",
      projectLengthUnit: context.projectLengthUnit,
      diagnostics: context.diagnostics,
      citedStepIds,
    });
    const propertyAndQuantityEvidence = extractPropertyAndQuantityEvidence({
      reader: command.reader,
      propertyDefinitionLinks:
        command.extractionIndex.propertyDefinitionsByElementStepId.get(
          element.identity.stepId,
        ) ?? [],
      projectLengthUnit: context.projectLengthUnit,
      diagnostics: context.diagnostics,
      citedStepIds,
    });

    return {
      ...element,
      directMaterialEvidence: materialEvidence,
      directPropertySets: propertyAndQuantityEvidence.propertySets,
      directQuantitySets: propertyAndQuantityEvidence.quantitySets,
      candidatePropertyEvidence: [
        ...propertyAndQuantityEvidence.candidatePropertyEvidence,
      ],
      evidenceReferences: [
        ...element.evidenceReferences,
        ...materialEvidence.map((evidence) => evidence.evidenceReference),
        ...propertyAndQuantityEvidence.propertySets.map(
          (evidence) => evidence.evidenceReference,
        ),
        ...propertyAndQuantityEvidence.quantitySets.map(
          (evidence) => evidence.evidenceReference,
        ),
      ],
      diagnostics: [...element.diagnostics],
    };
  });

  const typeEvidence = command.typeEvidence.map((typeRecord) => {
    const materialEvidence = extractMaterialEvidenceForRelatedStep({
      reader: command.reader,
      extractionIndex: command.extractionIndex,
      relatedStepId: typeRecord.identity.stepId,
      associationScope: "type",
      projectLengthUnit: context.projectLengthUnit,
      diagnostics: context.diagnostics,
      citedStepIds,
    });
    const propertyAndQuantityEvidence = extractTypePropertyEvidence({
      reader: command.reader,
      propertySetStepIds:
        command.extractionIndex.typePropertySetStepIdsByTypeStepId.get(
          typeRecord.identity.stepId,
        ) ?? [],
      projectLengthUnit: context.projectLengthUnit,
      diagnostics: context.diagnostics,
      citedStepIds,
    });

    return {
      ...typeRecord,
      materialEvidence,
      propertySets: propertyAndQuantityEvidence.propertySets,
      quantitySets: propertyAndQuantityEvidence.quantitySets,
      candidatePropertyEvidence:
        propertyAndQuantityEvidence.candidatePropertyEvidence,
      diagnostics: [...typeRecord.diagnostics],
    };
  });
  const recoveryResult = recoverRevitLayerSetNameMatchEvidence({
    reader: command.reader,
    elementEvidence: officialElementEvidence,
    typeEvidence,
    projectLengthUnit: context.projectLengthUnit,
  });
  context.diagnostics.push(...recoveryResult.diagnostics);
  citedStepIds.push(...recoveryResult.citedStepIds);

  return {
    elementEvidence: recoveryResult.elementEvidence,
    typeEvidence,
    diagnostics: context.diagnostics,
    citedStepIds,
  };
}

function extractMaterialEvidenceForRelatedStep(command: {
  reader: IfcModelReader;
  extractionIndex: IfcExtractionIndex;
  relatedStepId: StepId;
  associationScope: "occurrence" | "type";
  projectLengthUnit: ProjectLengthUnit;
  diagnostics: Diagnostic[];
  citedStepIds: StepId[];
}): MaterialEvidence[] {
  return (
    command.extractionIndex.materialAssociationsByRelatedStepId.get(
      command.relatedStepId,
    ) ?? []
  ).map((association) => {
    command.citedStepIds.push(
      association.associationStepId,
      association.relatingMaterialStepId,
    );
    return toMaterialEvidence({
      reader: command.reader,
      associationScope: command.associationScope,
      associationStepId: association.associationStepId,
      relatingMaterialStepId: association.relatingMaterialStepId,
      projectLengthUnit: command.projectLengthUnit,
      diagnostics: command.diagnostics,
      citedStepIds: command.citedStepIds,
    });
  });
}

function toMaterialEvidence(command: {
  reader: IfcModelReader;
  associationScope: "occurrence" | "type";
  associationStepId: StepId;
  relatingMaterialStepId: StepId;
  projectLengthUnit: ProjectLengthUnit;
  diagnostics: Diagnostic[];
  citedStepIds: StepId[];
}): MaterialEvidence {
  const materialClass = command.reader.getEntityClass(
    command.relatingMaterialStepId,
  );
  if (
    command.associationScope === "type" &&
    (materialClass === "IfcMaterialLayerSetUsage" ||
      materialClass === "IfcMaterialProfileSetUsage")
  ) {
    command.diagnostics.push({
      code: "usage_material_definition_on_type",
      severity: "warning",
      message:
        "Material usage definition was associated with type evidence; preserved as evidence but not treated as normal type material semantics.",
      stepIds: [command.relatingMaterialStepId],
    });
  }
  const base = {
    materialEvidenceId: `mat_${command.associationStepId}_${command.relatingMaterialStepId}`,
    materialEvidenceSource: "official_rel_associates_material" as const,
    associationScope: command.associationScope,
    associationStepId: command.associationStepId,
    relatingMaterialStepId: command.relatingMaterialStepId,
    evidenceReference: entityEvidenceReference(
      materialClass ?? "UnknownIfcMaterialDefinition",
      command.relatingMaterialStepId,
    ),
    diagnostics: [] as Diagnostic[],
  };

  if (materialClass === "IfcMaterial") {
    return {
      ...base,
      materialStructureKind: "single_material",
      materialStepId: command.relatingMaterialStepId,
      materialName: command.reader.getStringAttribute(
        command.relatingMaterialStepId,
        "Name",
      ),
      materialCategory: command.reader.getStringAttribute(
        command.relatingMaterialStepId,
        "Category",
      ),
    };
  }

  if (materialClass === "IfcMaterialLayerSetUsage") {
    const layerSetStepId = command.reader.getEntityReference(
      command.relatingMaterialStepId,
      "ForLayerSet",
    );
    const layerSetEvidence =
      layerSetStepId === null
        ? emptyLayerSetEvidence(command.relatingMaterialStepId)
        : extractLayerSetEvidence({
            reader: command.reader,
            layerSetStepId,
            projectLengthUnit: command.projectLengthUnit,
            diagnostics: command.diagnostics,
            citedStepIds: command.citedStepIds,
          });

    return {
      ...base,
      materialStructureKind: "layer_set_usage",
      layerSetUsage: {
        stepId: command.relatingMaterialStepId,
        forLayerSetStepId: layerSetStepId ?? command.relatingMaterialStepId,
        layerSetDirection: command.reader.getStringAttribute(
          command.relatingMaterialStepId,
          "LayerSetDirection",
        ),
        directionSense: command.reader.getStringAttribute(
          command.relatingMaterialStepId,
          "DirectionSense",
        ),
        offsetFromReferenceLine: numberAttributeEvidence({
          reader: command.reader,
          stepId: command.relatingMaterialStepId,
          entityClass: "IfcMaterialLayerSetUsage",
          attributeName: "OffsetFromReferenceLine",
          normalizedUnit: "m",
          projectLengthUnit: command.projectLengthUnit,
          unitSource: "ifc_project_units",
          diagnostics: command.diagnostics,
        }),
        referenceExtent: numberAttributeEvidence({
          reader: command.reader,
          stepId: command.relatingMaterialStepId,
          entityClass: "IfcMaterialLayerSetUsage",
          attributeName: "ReferenceExtent",
          normalizedUnit: "m",
          projectLengthUnit: command.projectLengthUnit,
          unitSource: "ifc_project_units",
          diagnostics: command.diagnostics,
        }),
        rawAttributeSnapshot: rawAttributes(command.reader, command.relatingMaterialStepId),
        evidenceReference: entityEvidenceReference(
          "IfcMaterialLayerSetUsage",
          command.relatingMaterialStepId,
        ),
      },
      ...layerSetEvidence,
    };
  }

  if (materialClass === "IfcMaterialLayerSet") {
    return {
      ...base,
      materialStructureKind: "layer_set",
      layerSetUsage: null,
      ...extractLayerSetEvidence({
        reader: command.reader,
        layerSetStepId: command.relatingMaterialStepId,
        projectLengthUnit: command.projectLengthUnit,
        diagnostics: command.diagnostics,
        citedStepIds: command.citedStepIds,
      }),
    };
  }

  if (materialClass === "IfcMaterialConstituentSet") {
    const constituentStepIds = command.reader.getEntityReferenceList(
      command.relatingMaterialStepId,
      "MaterialConstituents",
    );
    command.citedStepIds.push(...constituentStepIds);
    return {
      ...base,
      materialStructureKind: "constituent_set",
      name: command.reader.getStringAttribute(
        command.relatingMaterialStepId,
        "Name",
      ),
      constituents: constituentStepIds.map((constituentStepId) => {
        const materialStepId = command.reader.getEntityReference(
          constituentStepId,
          "Material",
        );
        if (materialStepId !== null) {
          command.citedStepIds.push(materialStepId);
        }
        return {
          constituentStepId,
          name: command.reader.getStringAttribute(constituentStepId, "Name"),
          materialStepId,
          materialName:
            materialStepId === null
              ? null
              : command.reader.getStringAttribute(materialStepId, "Name"),
          evidenceReference: entityEvidenceReference(
            "IfcMaterialConstituent",
            constituentStepId,
          ),
        };
      }),
    };
  }

  if (materialClass === "IfcMaterialList") {
    const materialStepIds = command.reader.getEntityReferenceList(
      command.relatingMaterialStepId,
      "Materials",
    );
    command.citedStepIds.push(...materialStepIds);
    return {
      ...base,
      materialStructureKind: "material_list",
      materialStepIds,
      materialNames: materialStepIds.map((stepId) =>
        command.reader.getStringAttribute(stepId, "Name"),
      ),
    };
  }

  if (materialClass === "IfcMaterialProfileSetUsage") {
    return {
      ...base,
      materialStructureKind: "profile_set_usage",
      profileSetStepId: command.reader.getEntityReference(
        command.relatingMaterialStepId,
        "ForProfileSet",
      ),
    };
  }

  if (materialClass === "IfcMaterialProfileSet") {
    return {
      ...base,
      materialStructureKind: "profile_set",
      profileStepIds: command.reader.getEntityReferenceList(
        command.relatingMaterialStepId,
        "MaterialProfiles",
      ),
    };
  }

  return {
    ...base,
    materialStructureKind: "unknown",
    rawEntityClass: materialClass,
  };
}

function createExtractionContext(reader: IfcModelReader) {
  const diagnostics: Diagnostic[] = [];
  return {
    projectLengthUnit: findProjectLengthUnit(reader),
    diagnostics,
  };
}

function rawAttributes(reader: IfcModelReader, stepId: StepId) {
  return reader.getEntity(stepId)?.attributes ?? {};
}
