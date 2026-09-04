import type { Diagnostic } from "../evidence/evidenceTypes.js";
import type { CalculationSnapshot } from "../calculations/calculationTypes.js";
import type { Override, UserInput } from "../review/reviewTypes.js";

export type Revision = {
  revisionId: string;
  parentRevisionId: string | null;
  createdAt: string;
  reason: string;
  userInputs: UserInput[];
  overrides: Override[];
  calculationSnapshots: CalculationSnapshot[];
  diagnostics: Diagnostic[];
};

export type RevisionIndex = {
  activeRevisionId: string;
  revisionIds: string[];
};
