import { buildArchitectActionViewModel } from "./buildArchitectActionViewModel.js";
import { defaultMaterialLibraryV1 } from "../../domain/materials/library.v1.js";
import type { JobRepository } from "../../domain/jobs/jobRepository.js";
import type { JobRecord, JobReviewState } from "../../domain/jobs/jobTypes.js";
import type { LocalJobArtifactStore } from "../../infrastructure/storage/local-files/jobArtifactStore.js";
import {
  readActiveRevisionArtifact,
  readCalculationInputEvidenceArtifact,
} from "../../infrastructure/storage/local-files/jobReviewArtifactStore.js";
import {
  buildReviewContextViewModel,
  type ReviewContextViewModel,
} from "../review/buildReviewContextViewModel.js";

export type JobWorkspaceViewModel = {
  job: JobRecord;
  review: (JobReviewState & { context: ReviewContextViewModel }) | null;
  architectActions: ReturnType<typeof buildArchitectActionViewModel>;
  materialLibrary: typeof defaultMaterialLibraryV1;
};

export async function getJobWorkspace(command: {
  jobs: JobRepository;
  artifactStore: LocalJobArtifactStore;
  jobId: string;
  targetUValueWPerM2K: number | null;
}): Promise<JobWorkspaceViewModel | null> {
  const job = command.jobs.getJob(command.jobId);
  if (!job) {
    return null;
  }
  const reviewState = command.jobs.getReviewState(command.jobId);
  const calculationInputEvidence = await readCalculationInputEvidenceArtifact({
    artifactStore: command.artifactStore,
    jobId: command.jobId,
  });
  if (reviewState && calculationInputEvidence === null) {
    throw new Error("Calculation input evidence artifact is missing for this Review.");
  }
  const evidence = calculationInputEvidence ?? [];
  const activeRevision = await readActiveRevisionArtifact({
    artifactStore: command.artifactStore,
    jobId: command.jobId,
    activeRevisionId: job.activeRevisionId,
  });
  const review = reviewState
    ? {
        ...reviewState,
        context: buildReviewContextViewModel({
          jobId: command.jobId,
          requestedInputs: reviewState.requestedInputs,
          calculationInputEvidence: evidence,
        }),
      }
    : null;

  return {
    job,
    review,
    architectActions: buildArchitectActionViewModel({
      jobId: command.jobId,
      jobStatus: job.jobStatus,
      calculationInputEvidence: evidence,
      requestedInputs: reviewState?.requestedInputs ?? [],
      activeRevision,
      target: command.targetUValueWPerM2K === null
        ? null
        : {
            maxUValueWPerM2K: command.targetUValueWPerM2K,
            label: "Working project target",
          },
    }),
    materialLibrary: defaultMaterialLibraryV1,
  };
}