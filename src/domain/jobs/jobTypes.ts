import type { RequestedInput } from "../review/reviewTypes.js";

export type JobStatus = "queued" | "processing" | "needs_review" | "completed" | "failed";

export type JobRecord = {
  jobId: string;
  jobStatus: JobStatus;
  originalFilename: string;
  uploadPath: string;
  fileHash: string | null;
  createdAt: string;
  updatedAt: string;
  errorMessage: string | null;
  reportPath: string | null;
  activeRevisionId: string | null;
};

export type JobReviewState = {
  jobId: string;
  requestedInputs: RequestedInput[];
};

export type JobSummary = Pick<
  JobRecord,
  "jobId" | "jobStatus" | "originalFilename" | "createdAt" | "updatedAt"
>;
