import type { Diagnostic } from "../evidence/evidenceTypes.js";
import type { CalculationSnapshot } from "../calculations/calculationTypes.js";
import type { Override, UserInput } from "../review/reviewTypes.js";
import type { Revision } from "./revisionTypes.js";

export function createRevision(command: {
  parentRevisionId?: string | null;
  reason: string;
  userInputs: UserInput[];
  overrides: Override[];
  calculationSnapshots: CalculationSnapshot[];
  diagnostics: Diagnostic[];
  now?: Date;
}): Revision {
  const createdAt = (command.now ?? new Date()).toISOString();
  return {
    revisionId: `rev_${createdAt.replace(/[^0-9]/g, "").slice(0, 14)}`,
    parentRevisionId: command.parentRevisionId ?? null,
    createdAt,
    reason: command.reason,
    userInputs: command.userInputs,
    overrides: command.overrides,
    calculationSnapshots: command.calculationSnapshots,
    diagnostics: command.diagnostics,
  };
}
