import type { JobRecord, JobReviewState, JobStatus, JobSummary } from "./jobTypes.js";

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
}

export interface ClosableJobRepository extends JobRepository {
  close(): void;
}
