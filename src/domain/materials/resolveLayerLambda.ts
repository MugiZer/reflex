import type { CalculationInputEvidence } from "../evidence/calculationInputEvidenceTypes.js";
import type { UserInput } from "../review/reviewTypes.js";
import type { MaterialLibrary, ResolvedLambda } from "./materialTypes.js";

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
}): ResolveLayerLambdaResult {
  if (
    command.userInput?.datapoint === "layer_lambda" &&
    typeof command.userInput.value === "number" &&
    command.userInput.value > 0
  ) {
    return {
      resolutionStatus: "resolved",
      lambda: {
        value: command.userInput.value,
        unit: "W/mK",
        source: "user_input",
        confidence: "medium",
        sourceLabel: "scripted review input",
        evidenceReferences: [],
        userInput: command.userInput,
      },
      warnings: [],
    };
  }

  const ifcLambda = command.calculationInputEvidence.fixedInputs.find(
    (input) =>
      input.field === "layer_lambda" &&
      input.source === "ifc_fixed" &&
      typeof input.value === "number" &&
      input.value > 0,
  );
  if (ifcLambda !== undefined) {
    return {
      resolutionStatus: "resolved",
      lambda: {
        value: ifcLambda.value as number,
        unit: "W/mK",
        source: "ifc_fixed",
        confidence: ifcLambda.confidence,
        sourceLabel: "IFC fixed lambda evidence",
        evidenceReferences: ifcLambda.evidenceReferences,
      },
      warnings: [],
    };
  }

  const normalizedName = normalize(command.materialName);
  const materialEntry = command.materialLibrary.entries.find((entry) =>
    [entry.displayName, ...entry.aliases].some((alias) => normalize(alias) === normalizedName),
  );
  if (materialEntry !== undefined) {
    return {
      resolutionStatus: "resolved",
      lambda: {
        value: materialEntry.lambdaWPerMK,
        unit: "W/mK",
        source: "material_library",
        confidence: materialEntry.confidence,
        sourceLabel: materialEntry.sourceLabel,
        evidenceReferences: [],
      },
      warnings: [],
    };
  }

  return {
    resolutionStatus: "unresolved",
    lambda: null,
    warnings: [`Lambda is unresolved for material '${command.materialName ?? "unknown"}'.`],
  };
}

function normalize(value: string | null): string {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}
