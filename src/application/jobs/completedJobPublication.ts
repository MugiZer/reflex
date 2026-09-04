import type { JobRepository } from "../../domain/jobs/jobRepository.js";
import type { JobRecord } from "../../domain/jobs/jobTypes.js";
import { ApplicationFailure } from "../applicationFailure.js";

export type CompletedJobPublicationValidation =
  | { ok: true }
  | { ok: false; code: "missing_active_revision" | "report_path_mismatch" | "missing_or_invalid_revision" | "missing_report" | "invalid_report_lineage" | "revision_report_mismatch" };

export interface CompletedJobPublicationValidator {
  validate(job: JobRecord): Promise<CompletedJobPublicationValidation>;
  restoreActiveRevision(jobId: string, revisionId: string | null): Promise<void>;
}

export async function requireCompletedJobPublication(command: { job: JobRecord; jobs: JobRepository; validator: CompletedJobPublicationValidator }): Promise<void> {
  const validation = await command.validator.validate(command.job);
  if (validation.ok) return;
  const retryable = validation.code !== "missing_active_revision" && validation.code !== "missing_or_invalid_revision" && validation.code !== "revision_report_mismatch";
  const message = retryable
    ? "The completed Job output is unavailable or incomplete. Retry the Job or restore its workspace."
    : "The completed Job Revision is unavailable or invalid. Restore its workspace before continuing.";
  command.jobs.updateJob(command.job.jobId, { jobStatus: "failed", errorMessage: message, failureCode: validation.code, retryable, lastFailureMessage: message });
  throw new ApplicationFailure("conflict", "incomplete_job_output", message);
}
