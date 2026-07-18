import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { CalculationInputEvidence } from "../../domain/evidence/calculationInputEvidenceTypes.js";
import { planRequestedInputs } from "../../domain/review/planRequestedInputs.js";
import type { UserInput } from "../../domain/review/reviewTypes.js";
import { defaultMaterialLibraryV1 } from "../../domain/materials/library.v1.js";
import { runCoreReviewCalculationReport } from "../review/runCoreReviewCalculationReport.js";
import type { JobRepository } from "../../domain/jobs/jobRepository.js";
import type { JobRecord } from "../../domain/jobs/jobTypes.js";
import { WebIfcEvidenceExtractor } from "../../infrastructure/ifc/web-ifc/WebIfcEvidenceExtractor.js";
import { createMilestone1ArtifactPackage } from "../ifc/createMilestone1ArtifactPackage.js";

export type ProcessIfcJobDeps = {
  jobs: JobRepository;
  outputRoot: string;
  extractCalculationInputEvidence?: (
    job: JobRecord,
  ) => Promise<CalculationInputEvidence[]>;
};

export async function processIfcJob(command: {
  jobId: string;
  deps: ProcessIfcJobDeps;
}): Promise<void> {
  const job = command.deps.jobs.getJob(command.jobId);
  if (!job) {
    throw new Error(`Job not found: ${command.jobId}`);
  }
  try {
    command.deps.jobs.updateJob(command.jobId, {
      jobStatus: "processing",
      errorMessage: null,
    });
    const calculationInputEvidence = await extractCalculationInputEvidence({
      job,
      deps: command.deps,
    });
    await writeJobJson(command.deps.outputRoot, command.jobId, "calculation-input-evidence.json", calculationInputEvidence);
    const requestedInputs = planRequestedInputs({ calculationInputEvidence }).requestedInputs;
    command.deps.jobs.saveReviewState({ jobId: command.jobId, requestedInputs });
    await writeJobJson(command.deps.outputRoot, command.jobId, "requested-inputs.json", requestedInputs);

    if (requestedInputs.length > 0) {
      command.deps.jobs.updateJob(command.jobId, {
        jobStatus: "needs_review",
        fileHash: command.jobId,
      });
      return;
    }

    await completeJobWithReviewInputs({
      jobId: command.jobId,
      userInputs: [],
      deps: command.deps,
      calculationInputEvidence,
      allowProcessingClaim: true,
    });
  } catch (error) {
    command.deps.jobs.updateJob(command.jobId, {
      jobStatus: "failed",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function completeJobWithReviewInputs(command: {
  jobId: string;
  userInputs: UserInput[];
  deps: ProcessIfcJobDeps;
  calculationInputEvidence?: CalculationInputEvidence[];
  allowProcessingClaim?: boolean;
}): Promise<{ revisionId: string; reportPath: string }> {
  const previousJob = command.deps.jobs.getJob(command.jobId);
  if (!previousJob) {
    throw new Error(`Job not found: ${command.jobId}`);
  }
  const canClaim = previousJob.jobStatus === "needs_review" ||
    previousJob.jobStatus === "completed" ||
    (command.allowProcessingClaim === true && previousJob.jobStatus === "processing");
  if (!canClaim) {
    throw new Error(`Job is ${previousJob.jobStatus}; another calculation may already be running.`);
  }
  command.deps.jobs.updateJob(command.jobId, {
    jobStatus: "processing",
    errorMessage: null,
  });
  try {
    const calculationInputEvidence =
      command.calculationInputEvidence ??
      await readJobJson<CalculationInputEvidence[]>(
        command.deps.outputRoot,
        command.jobId,
        "calculation-input-evidence.json",
      );
    const result = await runCoreReviewCalculationReport({
      fileHash: command.jobId,
      outputRoot: command.deps.outputRoot,
      calculationInputEvidence,
      materialLibrary: defaultMaterialLibraryV1,
      userInputs: command.userInputs,
      parentRevisionId: previousJob.activeRevisionId,
    });
    command.deps.jobs.updateJob(command.jobId, {
      jobStatus: "completed",
      fileHash: command.jobId,
      reportPath: result.reportFilePath,
      activeRevisionId: result.revision.revisionId,
    });
    return {
      revisionId: result.revision.revisionId,
      reportPath: result.reportFilePath,
    };
  } catch (error) {
    command.deps.jobs.updateJob(command.jobId, {
      jobStatus: previousJob.jobStatus,
      errorMessage: previousJob.errorMessage,
      fileHash: previousJob.fileHash,
      reportPath: previousJob.reportPath,
      activeRevisionId: previousJob.activeRevisionId,
    });
    throw error;
  }
}

async function writeJobJson(
  outputRoot: string,
  jobId: string,
  filename: string,
  value: unknown,
): Promise<void> {
  const dir = join(outputRoot, jobId, "job");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), JSON.stringify(value, null, 2), "utf8");
}

async function readJobJson<T>(
  outputRoot: string,
  jobId: string,
  filename: string,
): Promise<T> {
  const path = join(outputRoot, jobId, "job", filename);
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function extractCalculationInputEvidence(command: {
  job: JobRecord;
  deps: ProcessIfcJobDeps;
}): Promise<CalculationInputEvidence[]> {
  if (command.deps.extractCalculationInputEvidence) {
    return command.deps.extractCalculationInputEvidence(command.job);
  }

  const extractor = new WebIfcEvidenceExtractor();
  const result = await extractor.extract({
    sourceFilePath: command.job.uploadPath,
    fileHash: command.job.fileHash ?? undefined,
  });
  if (!result.ok) {
    throw new Error(`${result.failureType}: ${result.message}`);
  }

  return createMilestone1ArtifactPackage({
    ifcEvidence: result.ifcEvidence,
  }).calculationInputEvidence;
}
