import type { JobRecord, JobReviewState, JobStatus, JobSummary, JobTopologyReview, TopologyPilotRun, TopologyPilotEvent } from "./jobTypes.js";
import type { ComponentEvaluationGraph } from "../topology/componentEvaluationRecords.js";

export type JobUpdate = {
  jobStatus?: JobStatus;
  fileHash?: string | null;
  errorMessage?: string | null;
  reportPath?: string | null;
  activeRevisionId?: string | null;
};

export interface JobRepository {
  createJob(record: JobRecord): void;
  getJob(jobId: string): JobRecord | null;
  listRecentJobs(limit?: number): JobSummary[];
  updateJob(jobId: string, changes: JobUpdate): void;
  saveReviewState(state: JobReviewState): void;
  getReviewState(jobId: string): JobReviewState | null;
  saveTopologyReview(review: JobTopologyReview): void;
  listTopologyReviews(jobId: string): JobTopologyReview[];
  getTopologyReviewByIdempotencyKey(jobId: string, idempotencyKey: string): JobTopologyReview | null;
  appendComponentEvaluation?(graph: ComponentEvaluationGraph): void;
  getComponentEvaluation?(evaluationId: string): ComponentEvaluationGraph | null;
  listComponentEvaluations?(jobId: string): readonly ComponentEvaluationGraph[];
  saveTopologyPilotRun(run: TopologyPilotRun): void;
  listTopologyPilotRuns(jobId: string): TopologyPilotRun[];
  getTopologyPilotRunByIdempotencyKey(jobId: string, idempotencyKey: string): TopologyPilotRun | null;
  saveTopologyPilotEvent?(event: TopologyPilotEvent): void;
  listTopologyPilotEvents?(jobId: string): TopologyPilotEvent[];
}

export interface ClosableJobRepository extends JobRepository {
  close(): void;
}
