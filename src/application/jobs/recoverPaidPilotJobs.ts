import type { JobRepository } from "../../domain/jobs/jobRepository.js";
import type { CompletedJobPublicationValidator } from "./completedJobPublication.js";

export const INTERRUPTED_ON_RESTART_CODE = "interrupted_on_restart";
export const INTERRUPTED_ON_RESTART_MESSAGE = "The application stopped before this Job finished.";

/**
 * Single-process pilot recovery: interrupted work becomes visible and manually
 * retryable. It deliberately does not attempt leases or automatic continuation.
 */
export async function recoverPaidPilotJobs(command: { jobs: JobRepository; validator: CompletedJobPublicationValidator }): Promise<string[]> {
  const recovered: string[] = [];
  for (const summary of command.jobs.listRecentJobs(10_000)) {
    if (summary.jobStatus === "queued" || summary.jobStatus === "processing") {
      command.jobs.updateJob(summary.jobId, {
        jobStatus: "failed",
        errorMessage: INTERRUPTED_ON_RESTART_MESSAGE,
        failureCode: INTERRUPTED_ON_RESTART_CODE,
        retryable: true,
        lastFailureMessage: INTERRUPTED_ON_RESTART_MESSAGE,
      });
      recovered.push(summary.jobId);
      continue;
    }
    if (summary.jobStatus !== "completed") continue;
    const job = command.jobs.getJob(summary.jobId)!;
    const validation = await command.validator.validate(job);
    if (validation.ok) continue;
    const retryable = validation.code !== "missing_active_revision" && validation.code !== "missing_or_invalid_revision" && validation.code !== "revision_report_mismatch";
    const message = retryable ? "The completed Job output is unavailable or incomplete. Retry the Job or restore its workspace." : "The completed Job Revision is unavailable or invalid. Restore its workspace before continuing.";
    command.jobs.updateJob(summary.jobId, {
      jobStatus: "failed",
      errorMessage: message,
      failureCode: validation.code,
      retryable,
      lastFailureMessage: message,
    });
    recovered.push(summary.jobId);
  }
  return recovered;
}
