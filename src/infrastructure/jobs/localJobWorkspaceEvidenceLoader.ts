import type { JobWorkspaceEvidenceLoader } from "../../application/jobs/jobWorkspaceEvidence.js";
import type { LocalJobArtifactStore } from "../storage/local-files/jobArtifactStore.js";
import { readActiveRevisionArtifact, readCalculationInputEvidenceArtifact } from "../storage/local-files/jobReviewArtifactStore.js";

/** Local-files implementation of the workspace evidence port. */
export function createLocalJobWorkspaceEvidenceLoader(artifactStore: LocalJobArtifactStore): JobWorkspaceEvidenceLoader {
  return {
    async load(jobId, activeRevisionId) {
      const calculationInputEvidence = await readCalculationInputEvidenceArtifact({ artifactStore, jobId });
      if (calculationInputEvidence === null) return null;
      const activeRevision = activeRevisionId === null ? null : await readActiveRevisionArtifact({ artifactStore, jobId, activeRevisionId });
      return { calculationInputEvidence, activeRevision };
    },
  };
}
