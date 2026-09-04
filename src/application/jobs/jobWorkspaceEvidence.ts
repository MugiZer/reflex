import type { CalculationInputEvidence } from "../../domain/evidence/calculationInputEvidenceTypes.js";
import type { Revision } from "../../domain/revisions/revisionTypes.js";
import type { TopologyResult } from "../../domain/topology/topologyTypes.js";

/** Port for immutable artifacts needed to project a completed Job workspace. */
export type JobWorkspaceEvidenceLoader = {
  load(jobId: string, activeRevisionId: string | null): Promise<{
    calculationInputEvidence: CalculationInputEvidence[];
    activeRevision: Revision | null;
  } | null>;
};

export type TopologyResultIntegrityVerifier = {
  verifyPersistedResult(result: TopologyResult): Promise<TopologyResult>;
};
