import type { CalculationInputEvidence } from "../../domain/evidence/calculationInputEvidenceTypes.js";
import type { JobRepository } from "../../domain/jobs/jobRepository.js";
import { defaultMaterialLibraryV1 } from "../../domain/materials/library.v1.js";
import type { Revision } from "../../domain/revisions/revisionTypes.js";
import type { TopologyResult } from "../../domain/topology/topologyTypes.js";
import { buildReportInventory, type ReportInventoryView } from "../reports/buildReportInventory.js";
import type { TopologyReviewEvidenceLoader } from "./topologyReviewEvidence.js";

export type TopologyReportWriter = {
  write(command: {
    jobId: string;
    fileHash: string;
    revision: Revision;
    calculationInputEvidence: CalculationInputEvidence[];
    reportInventory: ReportInventoryView[];
    topologyResults: TopologyResult[];
  }): Promise<{ reportFilePath: string }>;
};

export type TopologyResultIntegrityVerifier = {
  verifyPersistedResult(result: TopologyResult): Promise<TopologyResult>;
};

/** Rebuilds the active report exclusively from persisted Job evidence and topology outcomes. */
export async function refreshJobTopologyReport(command: {
  jobId: string;
  jobs: JobRepository;
  evidence: TopologyReviewEvidenceLoader;
  integrity: TopologyResultIntegrityVerifier;
  writer: TopologyReportWriter;
}): Promise<void> {
  const job = command.jobs.getJob(command.jobId);
  if (!job?.activeRevisionId) throw new Error("Topology report requires an active Job Revision.");
  const loaded = await command.evidence.load(command.jobId, job.activeRevisionId);
  if (!loaded || loaded.activeRevision.revisionId !== job.activeRevisionId) throw new Error("Topology report evidence is missing or stale.");
  const topologyResults = command.jobs.listTopologyReviews(command.jobId)
    .filter((review) => review.sourceRevisionId === job.activeRevisionId && review.topologyResult !== null)
    .map((review) => review.topologyResult!);
  await Promise.all(topologyResults.map((result) => command.integrity.verifyPersistedResult(result)));
  const report = await command.writer.write({
    jobId: command.jobId,
    fileHash: job.fileHash ?? job.jobId,
    revision: loaded.activeRevision,
    calculationInputEvidence: loaded.calculationInputEvidence,
    reportInventory: buildReportInventory({ calculationInputEvidence: loaded.calculationInputEvidence, calculationSnapshots: loaded.activeRevision.calculationSnapshots, materialLibrary: defaultMaterialLibraryV1, userInputs: loaded.activeRevision.userInputs }),
    topologyResults,
  });
  command.jobs.updateJob(command.jobId, { reportPath: report.reportFilePath });
}
