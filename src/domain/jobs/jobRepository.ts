import type { JobRecord, JobReviewState, JobStatus, JobSummary, JobTopologyReview } from "./jobTypes.js";

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
}

export interface ClosableJobRepository extends JobRepository {
  close(): void;
}
