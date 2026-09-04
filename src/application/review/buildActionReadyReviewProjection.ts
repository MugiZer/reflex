import type { CalculationInputEvidence, CalculationInputField } from "../../domain/evidence/calculationInputEvidenceTypes.js";
import type { MaterialLibrary } from "../../domain/materials/materialTypes.js";
import type { OverrideScopeKind, RequestedInput } from "../../domain/review/reviewTypes.js";
import type { ReviewContextViewModel, ReviewEvidenceSummaryViewModel } from "./buildReviewContextViewModel.js";

/**
 * Browser-ready Review contract.  This is deliberately the only place where
 * requested inputs, IFC evidence, and the Material Library are joined for UI
 * consumption.  `submission` retains the stable technical identity needed by
 * the existing Review endpoint.
 */
export type ActionReadyReviewProjection = {
  decisions: ActionReadyReviewDecision[];
};

export type ActionReadyReviewDecision = {
  requestedInputId: string;
  affectedAssemblyGroupIds: string[];
  label: string;
  inputType: RequestedInput["inputType"];
  datapoint: CalculationInputField;
  unit: string | null;
  required: boolean;
  status: "pending" | "resolved";
  evidence: ReviewEvidenceSummaryViewModel;
  defaultValue: {
    value: string | number | boolean;
    source: "material_library";
    materialLibraryKey: string;
    materialLibraryName: string;
    sourceLabel: string;
  } | null;
  constraints: {
    minimumExclusive: number | null;
    materialOptions: Array<{
      materialLibraryKey: string;
      label: string;
      lambdaWPerMK: number;
      sourceLabel: string;
    }>;
  };
  submission: {
    requestedInputId: string;
    unit: string | null;
    overrideScope: OverrideScopeKind;
  };
};

export function buildActionReadyReviewProjection(command: {
  jobId: string;
  requestedInputs: RequestedInput[];
  calculationInputEvidence: CalculationInputEvidence[];
  materialLibrary: MaterialLibrary;
  context: ReviewContextViewModel;
  resolvedRequestedInputIds?: ReadonlySet<string>;
}): ActionReadyReviewProjection {
  const context = command.context;
  const contextByInputId = new Map(
    context.groups.flatMap((group) => group.questions).map((question) => [question.requestedInputId, question]),
  );

  return {
    decisions: command.requestedInputs.map((input) => {
      const question = contextByInputId.get(input.requestedInputId);
      const defaultEntry = defaultMaterialEntry(input, command.materialLibrary);
      const materialOptions = materialOptionsFor(input, command.materialLibrary);
      return {
        requestedInputId: input.requestedInputId,
        affectedAssemblyGroupIds: affectedAssemblyGroupIds(input),
        label: question?.question ?? input.question,
        inputType: input.inputType,
        datapoint: input.datapoint,
        unit: input.unit,
        required: input.required !== false,
        status: command.resolvedRequestedInputIds?.has(input.requestedInputId) ? "resolved" : "pending",
        evidence: question?.evidenceSummary ?? fallbackEvidenceSummary(),
        defaultValue: defaultEntry === null ? null : {
          value: defaultEntry.lambdaWPerMK,
          source: "material_library",
          materialLibraryKey: defaultEntry.materialKey,
          materialLibraryName: defaultEntry.displayName,
          sourceLabel: defaultEntry.sourceLabel,
        },
        constraints: {
          minimumExclusive: input.inputType === "number" ? 0 : null,
          materialOptions,
        },
        submission: {
          requestedInputId: input.requestedInputId,
          unit: input.unit,
          overrideScope: input.scope.scopeKind,
        },
      };
    }),
  };
}

function defaultMaterialEntry(input: RequestedInput, materialLibrary: MaterialLibrary) {
  if (input.datapoint !== "layer_lambda" || input.materialResolution?.status !== "resolved") return null;
  const key = input.materialResolution.matchedMaterialKey;
  return materialLibrary.entries.find((entry) => entry.materialKey === key) ?? null;
}

function materialOptionsFor(input: RequestedInput, materialLibrary: MaterialLibrary) {
  if (input.datapoint !== "layer_lambda") return [];
  const candidates = input.materialResolution?.candidateMaterialKeys;
  return materialLibrary.entries
    .filter((entry) => candidates === undefined || candidates.length === 0 || candidates.includes(entry.materialKey))
    .map((entry) => ({
      materialLibraryKey: entry.materialKey,
      label: entry.displayName,
      lambdaWPerMK: entry.lambdaWPerMK,
      sourceLabel: entry.sourceLabel,
    }));
}

function affectedAssemblyGroupIds(input: RequestedInput): string[] {
  if (input.scope.scopeKind === "material_decision") {
    return unique(input.scope.affectedLayers.map((layer) => layer.assemblyGroupId));
  }
  return [input.assemblyGroupId];
}

function fallbackEvidenceSummary(): ReviewEvidenceSummaryViewModel {
  return {
    ifcClassLabel: "IFC element",
    elementLabel: "Building element",
    layerLabel: null,
    materialLabel: null,
    sourceElementCount: 0,
    evidencePathLabel: "No direct evidence path",
  };
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
