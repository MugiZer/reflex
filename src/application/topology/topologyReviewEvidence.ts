import type { CalculationInputEvidence } from "../../domain/evidence/calculationInputEvidenceTypes.js";
import type { Revision } from "../../domain/revisions/revisionTypes.js";

/** Application port for the immutable evidence needed to review an IFC topology opportunity. */
export type TopologyReviewEvidenceLoader = {
  load(jobId: string, activeRevisionId: string): Promise<{
    calculationInputEvidence: CalculationInputEvidence[];
    activeRevision: Revision;
  } | null>;
};
