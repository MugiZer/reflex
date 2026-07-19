import type { CalculationInputEvidence } from "../evidence/calculationInputEvidenceTypes.js";
import type { UserInput } from "../review/reviewTypes.js";
import {
  layerOccurrenceRequestedInputId,
  materialDecisionRequestedInputId,
  materialOverrideRequestedInputId,
  normalizeMaterialKey,
} from "../review/reviewGrouping.js";
import { resolveMaterialName } from "./materialResolution.js";
import type {
  MaterialLibrary,
  MaterialLibraryEntry,
  MaterialResolution,
  ResolvedLambda,
} from "./materialTypes.js";

export type ResolveLayerLambdaResult = {
  lambda: ResolvedLambda | null;
  resolutionStatus: "resolved" | "unresolved";
  resolution?: MaterialResolution;
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
  const materialResolution = resolveMaterialName(command.materialName, command.materialLibrary);
  const ifcLambda = command.calculationInputEvidence.fixedInputs.find(
    (input) => input.field === "layer_lambda" &&
      input.source === "ifc_fixed" &&
      matchesLayer(input.layer?.layerIndex, command.layerIndex) &&
      typeof input.value === "number" &&
      input.value > 0,
  );
  if (
    userInput?.datapoint === "layer_lambda" &&
    typeof userInput.value === "number" &&
    userInput.value > 0 &&
    (ifcLambda === undefined || userInput.overrideScope === undefined)
  ) {
    return resolveUserInputLambda({ userInput, materialResolution, materialLibrary: command.materialLibrary });
  }

  if (ifcLambda !== undefined) {
    return resolved({
      value: ifcLambda.value as number,
      source: "ifc_fixed",
      confidence: ifcLambda.confidence,
      sourceLabel: "IFC fixed lambda evidence",
      evidenceReferences: ifcLambda.evidenceReferences,
      materialResolution: {
        ...materialResolution,
        evidenceState: "ifc_extracted",
      },
    });
  }

  if (
    userInput?.datapoint === "layer_lambda" &&
    typeof userInput.value === "number" &&
    userInput.value > 0
  ) {
    return resolveUserInputLambda({ userInput, materialResolution, materialLibrary: command.materialLibrary });
  }

  const materialEntry = findMaterialLibraryEntry(command.materialLibrary, command.materialName);
  if (materialEntry !== null) {
    const libraryResolution: MaterialResolution = {
      ...materialResolution,
      status: "resolved",
      matchedMaterialKey: materialEntry.materialKey,
      matchedMaterialName: materialEntry.displayName,
      candidateMaterialKeys: [materialEntry.materialKey],
      evidenceState: "library_assisted",
    };
    return resolved({
      value: materialEntry.lambdaWPerMK,
      source: "material_library",
      confidence: materialEntry.confidence,
      sourceLabel: materialEntry.sourceLabel,
      evidenceReferences: [],
      materialResolution: libraryResolution,
      materialLibraryKey: materialEntry.materialKey,
      materialLibraryName: materialEntry.displayName,
    });
  }

  return {
    resolutionStatus: "unresolved",
    lambda: null,
    resolution: materialResolution,
    warnings: [`Lambda is unresolved for material '${command.materialName ?? "unknown"}'.`],
  };
}

function resolveUserInputLambda(command: {
  userInput: UserInput;
  materialResolution: MaterialResolution;
  materialLibrary: MaterialLibrary;
}): ResolveLayerLambdaResult {
  const selectedEntry = command.userInput.valueSource === "material_library" &&
    command.userInput.materialLibraryKey !== undefined
    ? materialLibraryEntryForKey(command.materialLibrary, command.userInput.materialLibraryKey)
    : null;
  const materialResolution = selectedEntry === null
    ? {
        ...command.materialResolution,
        status: "resolved" as const,
        evidenceState: "user_override" as const,
      }
    : {
        ...command.materialResolution,
        status: "resolved" as const,
        matchedMaterialKey: selectedEntry.materialKey,
        matchedMaterialName: selectedEntry.displayName,
        matchBasis: null,
        candidateMaterialKeys: [selectedEntry.materialKey],
        reason: "User selected Material Library entry '" + selectedEntry.displayName + "'.",
        evidenceState: "user_override" as const,
      };
  return resolved({
    value: command.userInput.value as number,
    source: command.userInput.valueSource === "material_library" ? "material_library" : "user_input",
    confidence: "medium",
    sourceLabel: command.userInput.valueSource === "material_library"
      ? "selected material library value"
      : "review input",
    evidenceReferences: [],
    userInput: command.userInput,
    materialResolution,
    materialLibraryKey: selectedEntry?.materialKey,
    materialLibraryName: selectedEntry?.displayName,
  });
}

export function findMaterialLibraryEntry(
  materialLibrary: MaterialLibrary,
  materialName: string | null,
): MaterialLibraryEntry | null {
  const resolution = resolveMaterialName(materialName, materialLibrary);
  return resolution.status === "resolved" && resolution.matchedMaterialKey !== null
    ? materialLibraryEntryForKey(materialLibrary, resolution.matchedMaterialKey)
    : null;
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
  const materialOverrideInputId = materialOverrideRequestedInputId(
    normalizeMaterialKey(command.materialName ?? null),
  );
  return command.userInputs.find((input) =>
    input.datapoint === "layer_lambda" &&
    (input.requestedInputId === layerInputId ||
      input.requestedInputId === materialInputId ||
      input.requestedInputId === materialOverrideInputId) &&
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
    resolution: lambda.materialResolution,
    lambda: {
      ...lambda,
      unit: "W/mK",
    },
    warnings: [],
  };
}