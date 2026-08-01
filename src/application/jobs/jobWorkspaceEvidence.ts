import type { CalculationInputEvidence } from "../../domain/evidence/calculationInputEvidenceTypes.js";
import type { Revision } from "../../domain/revisions/revisionTypes.js";

/** Port for immutable artifacts needed to project a completed Job workspace. */
export type JobWorkspaceEvidenceLoader = {
  load(jobId: string, activeRevisionId: string | null): Promise<{
    calculationInputEvidence: CalculationInputEvidence[];
    activeRevision: Revision | null;
  } | null>;
};
