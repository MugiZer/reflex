import { attributeEvidenceReference, entityEvidenceReference } from "../evidenceReferences.js";
import type {
  Diagnostic,
  IfcModelReader,
  LayerEvidence,
  StepId,
} from "../evidenceTypes.js";
import {
  normalizeNumericEvidence,
  numberAttributeEvidence,
  type ProjectLengthUnit,
} from "./numericEvidenceNormalizer.js";

export function extractLayerSetEvidence(command: {
  reader: IfcModelReader;
  layerSetStepId: StepId;
  projectLengthUnit: ProjectLengthUnit;
  diagnostics: Diagnostic[];
  citedStepIds: StepId[];
}) {
  const materialLayerStepIds = command.reader.getEntityReferenceList(
    command.layerSetStepId,
    "MaterialLayers",
  );
  command.citedStepIds.push(command.layerSetStepId, ...materialLayerStepIds);
  const layers = materialLayerStepIds.map((layerStepId, layerIndex) =>
    extractLayerEvidence({
      reader: command.reader,
      layerStepId,
      layerIndex,
      projectLengthUnit: command.projectLengthUnit,
      diagnostics: command.diagnostics,
      citedStepIds: command.citedStepIds,
    }),
  );
  const rawTotalThickness = layers.reduce(
    (sum, layer) => sum + (layer.thickness?.rawValue ?? 0),
    0,
  );

  return {
    layerSet: {
      stepId: command.layerSetStepId,
      layerSetName: command.reader.getStringAttribute(
        command.layerSetStepId,
        "LayerSetName",
      ),
      description: command.reader.getStringAttribute(
        command.layerSetStepId,
        "Description",
      ),
      materialLayerStepIds,
      rawAttributeSnapshot: rawAttributes(command.reader, command.layerSetStepId),
      evidenceReference: entityEvidenceReference(
        "IfcMaterialLayerSet",
        command.layerSetStepId,
      ),
    },
    layers,
    layerOrderSource:
      materialLayerStepIds.length > 0
        ? ("IfcMaterialLayerSet.MaterialLayers" as const)
        : ("unknown" as const),
    totalLayerThickness:
      rawTotalThickness > 0
        ? normalizeNumericEvidence({
            rawValue: rawTotalThickness,
            rawUnit: command.projectLengthUnit?.rawUnit ?? null,
            normalizedUnit: "m",
            factor: command.projectLengthUnit?.factorToMeters ?? null,
            unitSource:
              command.projectLengthUnit === null
                ? "unknown"
                : "ifc_project_units",
            evidenceReference: attributeEvidenceReference(
              "IfcMaterialLayerSet",
              command.layerSetStepId,
              "MaterialLayers.LayerThickness",
            ),
            diagnostics: command.diagnostics,
          })
        : null,
  };
}

export function emptyLayerSetEvidence(stepId: StepId) {
  return {
    layerSet: {
      stepId,
      layerSetName: null,
      description: null,
      materialLayerStepIds: [],
      rawAttributeSnapshot: {},
      evidenceReference: entityEvidenceReference("IfcMaterialLayerSet", stepId),
    },
    layers: [],
    layerOrderSource: "unknown" as const,
    totalLayerThickness: null,
  };
}

function extractLayerEvidence(command: {
  reader: IfcModelReader;
  layerStepId: StepId;
  layerIndex: number;
  projectLengthUnit: ProjectLengthUnit;
  diagnostics: Diagnostic[];
  citedStepIds: StepId[];
}): LayerEvidence {
  const materialStepId = command.reader.getEntityReference(
    command.layerStepId,
    "Material",
  );
  if (materialStepId !== null) {
    command.citedStepIds.push(materialStepId);
  }
  const thickness = numberAttributeEvidence({
    reader: command.reader,
    stepId: command.layerStepId,
    entityClass: "IfcMaterialLayer",
    attributeName: "LayerThickness",
    normalizedUnit: "m",
    projectLengthUnit: command.projectLengthUnit,
    unitSource: "ifc_project_units",
    diagnostics: command.diagnostics,
  });

  return {
    layerIndex: command.layerIndex,
    layerStepId: command.layerStepId,
    materialStepId,
    materialName:
      materialStepId === null
        ? null
        : command.reader.getStringAttribute(materialStepId, "Name"),
    materialCategory:
      materialStepId === null
        ? null
        : command.reader.getStringAttribute(materialStepId, "Category"),
    layerName: command.reader.getStringAttribute(command.layerStepId, "Name"),
    layerDescription: command.reader.getStringAttribute(
      command.layerStepId,
      "Description",
    ),
    layerCategory: command.reader.getStringAttribute(
      command.layerStepId,
      "Category",
    ),
    thickness,
    isVentilated:
      command.reader.getBooleanAttribute(command.layerStepId, "IsVentilated") ??
      "unknown",
    priority: command.reader.getNumberAttribute(command.layerStepId, "Priority"),
    rawAttributeSnapshot: rawAttributes(command.reader, command.layerStepId),
    evidenceReference: entityEvidenceReference(
      "IfcMaterialLayer",
      command.layerStepId,
    ),
    candidatePropertyEvidence:
      thickness === null
        ? []
        : [
            {
              candidateKind: "layer_thickness",
              propertySetName: null,
              propertyName: "LayerThickness",
              rawValue: thickness.rawValue,
              rawUnit: thickness.rawUnit,
              normalizedValue: thickness.normalizedValue,
              normalizedUnit: thickness.normalizedUnit,
              confidence: "high",
              evidenceReference: thickness.evidenceReference,
              reason: "IfcMaterialLayer.LayerThickness is confirmed layer thickness evidence.",
            },
          ],
    diagnostics: [],
  };
}

function rawAttributes(reader: IfcModelReader, stepId: StepId) {
  return reader.getEntity(stepId)?.attributes ?? {};
}
