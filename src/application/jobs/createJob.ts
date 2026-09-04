import type { JobRecord } from "../../domain/jobs/jobTypes.js";
import type { JobRepository } from "../../domain/jobs/jobRepository.js";
import type { LocalJobFileStorage } from "../../infrastructure/storage/local-files/jobFileStorage.js";
import { processIfcJob, type ProcessIfcJobDeps } from "./processIfcJob.js";

export async function createJob(command: {
  originalFilename: string;
  content: Buffer;
  jobs: JobRepository;
  storage: LocalJobFileStorage;
  workerDeps: ProcessIfcJobDeps;
}): Promise<{ jobId: string; jobStatus: JobRecord["jobStatus"] }> {
  const savedUpload = await command.storage.saveUpload({
    originalFilename: command.originalFilename,
    content: command.content,
  });
  const now = new Date().toISOString();
  command.jobs.createJob({
    jobId: savedUpload.jobId,
    jobStatus: "queued",
    originalFilename: command.originalFilename,
    uploadPath: savedUpload.uploadPath,
    fileHash: savedUpload.fileHash,
    createdAt: now,
    updatedAt: now,
    errorMessage: null,
    reportPath: null,
    activeRevisionId: null,
    failureCode: null,
    retryable: false,
    lastFailureMessage: null,
  });

  setTimeout(() => {
    void processIfcJob({ jobId: savedUpload.jobId, deps: command.workerDeps });
  }, 0);

  return {
    jobId: savedUpload.jobId,
    jobStatus: "queued",
  };
}
