export type LocalReviewDecision = {
  requestedInputId: string;
  datapoint: string;
  inputType: string;
  affectedAssemblyGroupIds: string[];
};

export type LocalReviewProgress = {
  totalDecisionCount: number;
  readyDecisionCount: number;
  remainingDecisionCount: number;
  remainingMaterialDecisionCount: number;
  remainingEvidenceDecisionCount: number;
  affectedAssemblyGroupIds: string[];
};

function isValidLocalReviewDraft(input: LocalReviewDecision, value: unknown): boolean {
  if (value === undefined || String(value).trim() === "") return false;
  return input.inputType !== "number" || (Number.isFinite(Number(value)) && Number(value) > 0);
}

export function projectLocalReviewProgress(
  decisions: LocalReviewDecision[],
  drafts: Record<string, unknown>,
): LocalReviewProgress {
  const remaining = decisions.filter((input) =>
    !isValidLocalReviewDraft(input, drafts[input.requestedInputId])
  );
  return {
    totalDecisionCount: decisions.length,
    readyDecisionCount: decisions.length - remaining.length,
    remainingDecisionCount: remaining.length,
    remainingMaterialDecisionCount: remaining.filter((input) => input.datapoint === "layer_lambda").length,
    remainingEvidenceDecisionCount: remaining.filter((input) => input.datapoint !== "layer_lambda").length,
    affectedAssemblyGroupIds: [...new Set(
      remaining.flatMap((input) => input.affectedAssemblyGroupIds),
    )].sort(),
  };
}

export function renderLocalReviewProgressClientSource(): string {
  return `${isValidLocalReviewDraft.toString()}\n${projectLocalReviewProgress.toString()}`;
}
