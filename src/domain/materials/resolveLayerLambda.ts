import type { CalculationInputEvidence } from "../evidence/calculationInputEvidenceTypes.js";
import type { UserInput } from "../review/reviewTypes.js";
import {
  layerOccurrenceRequestedInputId,
  materialDecisionRequestedInputId,
  normalizeMaterialKey,
} from "../review/reviewGrouping.js";
import type {
  MaterialLibrary,
  MaterialLibraryEntry,
  ResolvedLambda,
} from "./materialTypes.js";

export type ResolveLayerLambdaResult = {
  lambda: ResolvedLambda | null;
  resolutionStatus: "resolved" | "unresolved";
  warnings: string[];
};

export function resolveLayerLambda(command: {
  calculationInputEvidence: CalculationInputEvidence;
  materialName: string | null;
  materialLibrary: MaterialLibrary;
  userInput?: UserInput | null;
  userInputs?: UserInput[];
  elementStepId?: number;
  layerIndex?: number;
}): ResolveLayerLambdaResult {
  const userInput = command.userInput ?? userInputForLayer(command);
  if (
    userInput?.datapoint === "layer_lambda" &&
    typeof userInput.value === "number" &&
    userInput.value > 0
  ) {
    return resolved({
      value: userInput.value,
      source: userInput.valueSource === "material_library" ? "material_library" : "user_input",
      confidence: "medium",
      sourceLabel: userInput.valueSource === "material_library"
        ? "selected material library value"
        : "review input",
      evidenceReferences: [],
      userInput,
    });
  }

  const ifcLambda = command.calculationInputEvidence.fixedInputs.find(
    (input) => input.field === "layer_lambda" &&
      input.source === "ifc_fixed" &&
      matchesLayer(input.layer?.layerIndex, command.layerIndex) &&
      typeof input.value === "number" &&
      input.value > 0,
  );
  if (ifcLambda !== undefined) {
    return resolved({
      value: ifcLambda.value as number,
      source: "ifc_fixed",
      confidence: ifcLambda.confidence,
      sourceLabel: "IFC fixed lambda evidence",
      evidenceReferences: ifcLambda.evidenceReferences,
    });
  }

  const materialEntry = findMaterialLibraryEntry(command.materialLibrary, command.materialName);
  if (materialEntry !== null) {
    return resolved({
      value: materialEntry.lambdaWPerMK,
      source: "material_library",
      confidence: materialEntry.confidence,
      sourceLabel: materialEntry.sourceLabel,
      evidenceReferences: [],
    });
  }

  return {
    resolutionStatus: "unresolved",
    lambda: null,
    warnings: [`Lambda is unresolved for material '${command.materialName ?? "unknown"}'.`],
  };
}

export function findMaterialLibraryEntry(
  materialLibrary: MaterialLibrary,
  materialName: string | null,
): MaterialLibraryEntry | null {
  const normalizedName = normalizeMaterialKey(materialName);
  return materialLibrary.entries.find((entry) =>
    [entry.displayName, ...entry.aliases].some((alias) => normalizeMaterialKey(alias) === normalizedName),
  ) ?? null;
}

export function materialLibraryEntryForKey(
  materialLibrary: MaterialLibrary,
  materialKey: string,
): MaterialLibraryEntry | null {
  return materialLibrary.entries.find((entry) => entry.materialKey === materialKey) ?? null;
}

function userInputForLayer(command: {
  materialName: string | null;
  userInputs?: UserInput[];
  elementStepId?: number;
  layerIndex?: number;
}): UserInput | undefined {
  if (command.userInputs === undefined || command.elementStepId === undefined || command.layerIndex === undefined) {
    return undefined;
  }
  const layerInputId = layerOccurrenceRequestedInputId(
    command.elementStepId,
    "layer_lambda",
    command.layerIndex,
  );
  const materialInputId = materialDecisionRequestedInputId(
    normalizeMaterialKey(command.materialName ?? null),
  );
  return command.userInputs.find((input) =>
    input.datapoint === "layer_lambda" &&
    (input.requestedInputId === layerInputId || input.requestedInputId === materialInputId) &&
    typeof input.value === "number" &&
    input.value > 0,
  );
}

function matchesLayer(inputLayerIndex: number | undefined, requestedLayerIndex: number | undefined): boolean {
  return requestedLayerIndex === undefined
    ? true
    : inputLayerIndex === requestedLayerIndex || (inputLayerIndex === undefined && requestedLayerIndex === 0);
}

function resolved(lambda: Omit<ResolvedLambda, "unit">): ResolveLayerLambdaResult {
  return {
    resolutionStatus: "resolved",
    lambda: {
      ...lambda,
      unit: "W/mK",
    },
    warnings: [],
  };
}