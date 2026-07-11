import type { CalculationInputEvidence } from "../evidence/calculationInputEvidenceTypes.js";
import type { EvidenceReference, StepId } from "../evidence/evidenceTypes.js";

export type LayerOccurrenceReference = {
  elementStepId: StepId;
  layerIndex: number;
  layerStepId: StepId | null;
  materialName: string | null;
  assemblyGroupId: string;
  evidenceReferences: EvidenceReference[];
};

export type MaterialDecisionGroup = {
  materialDecisionId: string;
  normalizedMaterialKey: string;
  materialName: string;
  requestedInputId: string;
  affectedLayers: LayerOccurrenceReference[];
};

export function materialDecisionGroupsFor(command: {
  calculationInputEvidence: CalculationInputEvidence[];
}): MaterialDecisionGroup[] {
  const groups = new Map<string, MaterialDecisionGroup>();
  for (const evidence of command.calculationInputEvidence) {
    for (const input of evidence.missingInputs) {
      if (input.field !== "layer_lambda" || input.layer?.materialName === null || input.layer === undefined) {
        continue;
      }
      const normalizedMaterialKey = normalizeMaterialKey(input.layer.materialName);
      if (normalizedMaterialKey.length === 0) {
        continue;
      }
      const existing = groups.get(normalizedMaterialKey);
      const group = existing ?? {
        materialDecisionId: materialDecisionGroupId(normalizedMaterialKey),
        normalizedMaterialKey,
        materialName: input.layer.materialName,
        requestedInputId: materialDecisionRequestedInputId(normalizedMaterialKey),
        affectedLayers: [],
      };
      group.affectedLayers.push({
        elementStepId: evidence.elementStepId,
        layerIndex: input.layer.layerIndex,
        layerStepId: input.layer.layerStepId,
        materialName: input.layer.materialName,
        assemblyGroupId: assemblyGroupIdForEvidence(evidence),
        evidenceReferences: input.evidenceReferences,
      });
      groups.set(normalizedMaterialKey, group);
    }
  }
  return [...groups.values()].sort((a, b) => a.materialName.localeCompare(b.materialName));
}

export function materialDecisionGroupId(normalizedMaterialKey: string): string {
  return `md_${stableHash(normalizedMaterialKey)}`;
}

export function materialDecisionRequestedInputId(normalizedMaterialKey: string): string {
  return `ri_material_layer_lambda_${stableHash(normalizedMaterialKey)}`;
}

export function normalizeMaterialKey(materialName: string | null): string {
  return (materialName ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function assemblyGroupIdForEvidence(evidence: CalculationInputEvidence): string {
  const signature = assemblyStackSignatureForEvidence(evidence);
  return signature === null ? `ag_element_${evidence.elementStepId}` : `ag_stack_${stableHash(signature)}`;
}

export function assemblyStackSignatureForEvidence(
  evidence: CalculationInputEvidence,
): string | null {
  const layerIndexes = explicitLayerIndexes(evidence);
  if (layerIndexes.length === 0) {
    return null;
  }
  const parts = layerIndexes.map((layerIndex) => {
    const material = fixedInputForLayer(evidence, "layer_material_name", layerIndex)?.value;
    const thickness = fixedInputForLayer(evidence, "layer_thickness", layerIndex)?.value;
    if (typeof material !== "string" || typeof thickness !== "number") {
      return null;
    }
    return [
      layerIndex,
      normalizeMaterialKey(material),
      Number(thickness.toFixed(6)),
    ].join(":");
  });
  if (parts.some((part) => part === null)) {
    return null;
  }
  return [evidence.elementClass, ...parts].join("|");
}

function explicitLayerIndexes(evidence: CalculationInputEvidence): number[] {
  return unique(
    [...evidence.fixedInputs, ...evidence.candidateInputs, ...evidence.missingInputs].flatMap(
      (input) => input.layer === undefined ? [] : [input.layer.layerIndex],
    ),
  ).sort((a, b) => a - b);
}

function fixedInputForLayer(
  evidence: CalculationInputEvidence,
  field: CalculationInputEvidence["fixedInputs"][number]["field"],
  layerIndex: number,
) {
  return evidence.fixedInputs.find(
    (input) => input.field === field && input.layer?.layerIndex === layerIndex,
  );
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
