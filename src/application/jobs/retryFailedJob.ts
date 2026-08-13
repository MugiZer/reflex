import { ApplicationFailure } from "../applicationFailure.js";
import type { JobRepository } from "../../domain/jobs/jobRepository.js";
import { processIfcJob, type ProcessIfcJobDeps } from "./processIfcJob.js";

export function retryFailedJob(command: {
  jobId: string;
  jobs: JobRepository;
  deps: ProcessIfcJobDeps;
}): { jobId: string; jobStatus: "queued" } {
  const job = command.jobs.getJob(command.jobId);
  if (!job) throw new ApplicationFailure("not_found", "job_not_found", "Job not found.");
  if (job.jobStatus !== "failed" || job.retryable !== true) {
    throw new ApplicationFailure("conflict", "job_not_retryable", "This Job is not currently retryable.");
  }
  command.jobs.updateJob(command.jobId, {
    jobStatus: "queued",
    errorMessage: null,
    failureCode: null,
    retryable: false,
  });
  setTimeout(() => void processIfcJob({ jobId: command.jobId, deps: command.deps }), 0);
  return { jobId: command.jobId, jobStatus: "queued" };
}
