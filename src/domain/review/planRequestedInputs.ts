import type { CalculationInputEvidence } from "../evidence/calculationInputEvidenceTypes.js";
import type { EvidenceReference } from "../evidence/evidenceTypes.js";
import {
  assemblyGroupIdForEvidence,
  layerOccurrenceRequestedInputId,
  materialDecisionGroupsFor,
} from "./reviewGrouping.js";
import type { RequestedInput } from "./reviewTypes.js";

export type PlanRequestedInputsResult = {
  requestedInputs: RequestedInput[];
};

export function planRequestedInputs(command: {
  calculationInputEvidence: CalculationInputEvidence[];
}): PlanRequestedInputsResult {
  const materialDecisionInputs = materialDecisionGroupsFor(command).map(
    (group): RequestedInput => ({
      requestedInputId: group.requestedInputId,
      reviewGroupId: group.materialDecisionId,
      reviewGroupKind: "material_decision",
      assemblyGroupId: group.materialDecisionId,
      datapoint: "layer_lambda",
      question: `What thermal conductivity should be used for ${group.materialName}?`,
      inputType: "number",
      unit: "W/mK",
      affects: affectsFor("layer_lambda"),
      scope: {
        scopeKind: "material_decision",
        materialDecisionId: group.materialDecisionId,
        normalizedMaterialKey: group.normalizedMaterialKey,
        materialName: group.materialName,
        affectedLayers: group.affectedLayers,
      },
      evidenceReferences: uniqueEvidenceReferences(
        group.affectedLayers.flatMap((layer) => layer.evidenceReferences),
      ),
    }),
  );
  const groupedLayerLambdaKeys = new Set(
    materialDecisionInputs.flatMap((input) =>
      input.scope.scopeKind === "material_decision"
        ? input.scope.affectedLayers.map((layer) =>
            layerOccurrenceKey(layer.elementStepId, layer.layerIndex),
          )
        : [],
    ),
  );

  const occurrenceInputs = command.calculationInputEvidence.flatMap((evidence) =>
    evidence.missingInputs
      .filter((input) =>
        isAskable(input.field) &&
        !(
          input.field === "layer_lambda" &&
          input.layer !== undefined &&
          groupedLayerLambdaKeys.has(
            layerOccurrenceKey(evidence.elementStepId, input.layer.layerIndex),
          )
        ),
      )
      .map((input, index): RequestedInput => {
        const assemblyGroupId = assemblyGroupIdForEvidence(evidence);
        const layerIndex = input.layer?.layerIndex ?? index;
        const isLayerScoped =
          input.field === "layer_lambda" ||
          input.field === "layer_thickness" ||
          input.field === "layer_material_name";
        const reviewGroupId = isLayerScoped
          ? `layer_${evidence.elementStepId}_${layerIndex}`
          : assemblyGroupId;
        return {
          requestedInputId:
            input.layer === undefined
              ? `ri_${evidence.elementStepId}_${input.field}_${index}`
              : layerOccurrenceRequestedInputId(
                  evidence.elementStepId,
                  input.field,
                  input.layer.layerIndex,
                ),
          reviewGroupId,
          reviewGroupKind: isLayerScoped ? "layer_occurrence" : "assembly_group",
          assemblyGroupId,
          datapoint: input.field,
          question: questionFor(input.field),
          inputType: inputTypeFor(input.field),
          unit: unitFor(input.field),
          affects: affectsFor(input.field),
          scope:
            input.field === "layer_lambda" ||
            input.field === "layer_thickness" ||
            input.field === "layer_material_name"
              ? {
                  scopeKind: "layer_occurrence",
                  elementStepId: evidence.elementStepId,
                  layerIndex,
                }
              : {
                  scopeKind: "assembly_group",
                  assemblyGroupId,
                },
          evidenceReferences: input.evidenceReferences,
        };
      }),
  );

  return { requestedInputs: [...materialDecisionInputs, ...occurrenceInputs] };
}

function isAskable(field: CalculationInputEvidence["missingInputs"][number]["field"]): boolean {
  return [
    "layer_lambda",
    "layer_thickness",
    "layer_material_name",
    "assembly_thickness",
    "calculation_basis_evidence",
  ].includes(field);
}

function questionFor(field: CalculationInputEvidence["missingInputs"][number]["field"]): string {
  if (field === "layer_lambda") {
    return "What thermal conductivity should be used for this layer?";
  }
  if (field === "layer_thickness") {
    return "What thickness should be used for this layer?";
  }
  if (field === "layer_material_name") {
    return "What material name should be used for this layer?";
  }
  if (field === "assembly_thickness") {
    return "What total assembly thickness should be used for this estimate?";
  }
  return "What calculation basis evidence should be used for this assembly?";
}

function inputTypeFor(
  field: CalculationInputEvidence["missingInputs"][number]["field"],
): RequestedInput["inputType"] {
  return field === "layer_material_name" || field === "calculation_basis_evidence"
    ? "text"
    : "number";
}

function unitFor(field: CalculationInputEvidence["missingInputs"][number]["field"]): string | null {
  if (field === "layer_lambda") {
    return "W/mK";
  }
  if (field === "layer_thickness" || field === "assembly_thickness") {
    return "m";
  }
  return null;
}

function affectsFor(
  field: CalculationInputEvidence["missingInputs"][number]["field"],
): RequestedInput["affects"] {
  if (field === "layer_material_name") {
    return ["provenance", "calculation"];
  }
  if (field === "assembly_thickness" || field === "calculation_basis_evidence") {
    return ["estimate", "precision", "provenance"];
  }
  return ["calculation", "precision", "provenance"];
}

function layerOccurrenceKey(elementStepId: number, layerIndex: number): string {
  return `${elementStepId}:${layerIndex}`;
}

function uniqueEvidenceReferences(references: EvidenceReference[]): EvidenceReference[] {
  const seen = new Set<string>();
  return references.filter((reference) => {
    if (seen.has(reference.evidencePath)) {
      return false;
    }
    seen.add(reference.evidencePath);
    return true;
  });
}
