import type { CalculationInputEvidence } from "../evidence/calculationInputEvidenceTypes.js";
import type { EvidenceReference } from "../evidence/evidenceTypes.js";
import { resolveMaterialName, specialPhysicsIssuesForEvidence } from "../materials/materialResolution.js";
import type { MaterialLibrary } from "../materials/materialTypes.js";
import {
  assemblyGroupIdForEvidence,
  layerOccurrenceRequestedInputId,
  materialDecisionGroupId,
  materialDecisionGroupsFor,
  materialOverrideRequestedInputId,
  normalizeMaterialKey,
} from "./reviewGrouping.js";
import type { RequestedInput } from "./reviewTypes.js";

export type PlanRequestedInputsResult = {
  requestedInputs: RequestedInput[];
};

export function planRequestedInputs(command: {
  calculationInputEvidence: CalculationInputEvidence[];
  materialLibrary?: MaterialLibrary;
  deferResolvedMaterialsToReview?: boolean;
}): PlanRequestedInputsResult {
  const materialDecisionInputs = materialDecisionGroupsFor(command)
    .filter((group) => !isSpecialMaterialGroup(group, command) &&
      (command.materialLibrary === undefined ||
        command.deferResolvedMaterialsToReview === true ||
        resolveMaterialName(group.materialName, command.materialLibrary).status !== "resolved"))
    .map(
    (group): RequestedInput => ({
      requestedInputId: group.requestedInputId,
      reviewGroupId: group.materialDecisionId,
      reviewGroupKind: "material_decision",
      assemblyGroupId: group.materialDecisionId,
      datapoint: "layer_lambda",
      question: materialDecisionQuestion(group, command.materialLibrary),
      inputType: "number",
      unit: "W/mK",
      ...(command.materialLibrary === undefined ? {} : { materialResolution: resolveMaterialName(group.materialName, command.materialLibrary) }),
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
        !shouldSkipLayerDecision(
          input,
          evidence,
          command.materialLibrary,
          command.deferResolvedMaterialsToReview === true,
        ) &&
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

  const optionalOverrides = command.materialLibrary === undefined
    ? []
    : optionalOverrideInputs({
        calculationInputEvidence: command.calculationInputEvidence,
        materialLibrary: command.materialLibrary,
      });
  return { requestedInputs: [...materialDecisionInputs, ...occurrenceInputs, ...optionalOverrides] };
}

function materialDecisionQuestion(
  group: ReturnType<typeof materialDecisionGroupsFor>[number],
  materialLibrary: MaterialLibrary | undefined,
): string {
  const resolution = materialLibrary === undefined ? null : resolveMaterialName(group.materialName, materialLibrary);
  return resolution?.status === "ambiguous"
    ? `Which Material Library family should be used for ${group.materialName} to choose its thermal conductivity?`
    : `What thermal conductivity should be used for ${group.materialName}?`;
}

function isSpecialMaterialGroup(
  group: ReturnType<typeof materialDecisionGroupsFor>[number],
  command: {
    calculationInputEvidence: CalculationInputEvidence[];
    materialLibrary?: MaterialLibrary;
  },
): boolean {
  const library = command.materialLibrary ?? { version: "materials.library.v1" as const, entries: [] };
  return group.affectedLayers.some((layer) => {
    const evidence = command.calculationInputEvidence.find(
      (candidate) => candidate.elementStepId === layer.elementStepId,
    );
    return evidence !== undefined &&
      specialPhysicsIssuesForEvidence({ evidence, materialLibrary: library }).length > 0;
  });
}

function shouldSkipLayerDecision(
  input: CalculationInputEvidence["missingInputs"][number],
  evidence: CalculationInputEvidence,
  materialLibrary: MaterialLibrary | undefined,
  deferResolvedMaterialsToReview: boolean,
): boolean {
  const library = materialLibrary ?? { version: "materials.library.v1" as const, entries: [] };
  if (specialPhysicsIssuesForEvidence({ evidence, materialLibrary: library }).length > 0) {
    return true;
  }
  if (
    input.layer === undefined ||
    (input.field !== "layer_lambda" && input.field !== "layer_material_name")
  ) {
    return false;
  }
  return materialLibrary !== undefined &&
    !deferResolvedMaterialsToReview &&
    input.field === "layer_lambda" &&
    input.layer.materialName !== null &&
    resolveMaterialName(input.layer.materialName, materialLibrary).status === "resolved";
}

function optionalOverrideInputs(command: {
  calculationInputEvidence: CalculationInputEvidence[];
  materialLibrary: MaterialLibrary;
}): RequestedInput[] {
  const groups = new Map<string, {
    materialName: string;
    materialResolution: ReturnType<typeof resolveMaterialName>;
    affectedLayers: Array<{
      elementStepId: number;
      layerIndex: number;
      layerStepId: number | null;
      materialName: string | null;
      assemblyGroupId: string;
      evidenceReferences: EvidenceReference[];
    }>;
  }>();
  for (const evidence of command.calculationInputEvidence) {
    if (specialPhysicsIssuesForEvidence({ evidence, materialLibrary: command.materialLibrary }).length > 0) {
      continue;
    }
    for (const input of evidence.missingInputs) {
      const layer = input.layer;
      const materialName = layer?.materialName ?? null;
      if (input.field !== "layer_lambda" || layer === undefined || materialName === null) {
        continue;
      }
      const resolution = resolveMaterialName(materialName, command.materialLibrary);
      if (resolution.status !== "resolved") {
        continue;
      }
      const key = normalizeMaterialKey(materialName);
      const group = groups.get(key) ?? {
        materialName,
        materialResolution: resolution,
        affectedLayers: [],
      };
      group.affectedLayers.push({
        elementStepId: evidence.elementStepId,
        layerIndex: layer.layerIndex,
        layerStepId: layer.layerStepId,
        materialName,
        assemblyGroupId: assemblyGroupIdForEvidence(evidence),
        evidenceReferences: input.evidenceReferences,
      });
      groups.set(key, group);
    }
  }

  return [...groups.entries()].map(([normalizedMaterialKey, group]): RequestedInput => ({
    requestedInputId: materialOverrideRequestedInputId(normalizedMaterialKey),
    reviewGroupId: "override_" + materialDecisionGroupId(normalizedMaterialKey),
    reviewGroupKind: "material_decision",
    assemblyGroupId: group.affectedLayers[0]?.assemblyGroupId ?? "unknown",
    datapoint: "layer_lambda",
    question: "Choose another material for " + group.materialName + " (optional).",
    inputType: "number",
    unit: "W/mK",
    required: false,
    purpose: "optional_override",
    materialResolution: group.materialResolution,
    affects: affectsFor("layer_lambda"),
    scope: {
      scopeKind: "material_decision",
      materialDecisionId: materialDecisionGroupId(normalizedMaterialKey),
      normalizedMaterialKey,
      materialName: group.materialName,
      affectedLayers: group.affectedLayers,
    },
    evidenceReferences: uniqueEvidenceReferences(
      group.affectedLayers.flatMap((layer) => layer.evidenceReferences),
    ),
  }));
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
