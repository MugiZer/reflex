import type { TopologyReviewEvidenceLoader } from "../../application/topology/topologyReviewEvidence.js";
import type { LocalJobArtifactStore } from "../storage/local-files/jobArtifactStore.js";
import { readActiveRevisionArtifact, readCalculationInputEvidenceArtifact } from "../storage/local-files/jobReviewArtifactStore.js";

/** Filesystem adapter for immutable Job evidence; application code depends only on its port. */
export function createLocalTopologyReviewEvidenceLoader(artifactStore: LocalJobArtifactStore): TopologyReviewEvidenceLoader {
  return {
    async load(jobId, activeRevisionId) {
      const [calculationInputEvidence, activeRevision] = await Promise.all([
        readCalculationInputEvidenceArtifact({ artifactStore, jobId }),
        readActiveRevisionArtifact({ artifactStore, jobId, activeRevisionId }),
      ]);
      return calculationInputEvidence && activeRevision ? { calculationInputEvidence, activeRevision } : null;
    },
  };
}
