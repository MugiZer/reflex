import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { safeOperationalDiagnostic } from "../safeOperationalDiagnostic.js";
import { dirname } from "node:path";

import type { CalculationInputEvidence } from "../../domain/evidence/calculationInputEvidenceTypes.js";
import { planRequestedInputs } from "../../domain/review/planRequestedInputs.js";
import { groupCalculationInputEvidenceByAssembly } from "../../domain/review/reviewGrouping.js";
import type { UserInput } from "../../domain/review/reviewTypes.js";
import { defaultMaterialLibraryV1 } from "../../domain/materials/library.v1.js";
import { specialPhysicsIssuesForEvidence } from "../../domain/materials/materialResolution.js";
import { runCoreReviewCalculationReport } from "../review/runCoreReviewCalculationReport.js";
import type { JobRepository } from "../../domain/jobs/jobRepository.js";
import type { JobRecord } from "../../domain/jobs/jobTypes.js";
import type { MaterialLibrary } from "../../domain/materials/materialTypes.js";
import { WebIfcEvidenceExtractor } from "../../infrastructure/ifc/web-ifc/WebIfcEvidenceExtractor.js";
import { LocalJobArtifactStore } from "../../infrastructure/storage/local-files/jobArtifactStore.js";
import type { CompletedJobPublicationValidator } from "./completedJobPublication.js";
import { createMilestone1ArtifactPackage } from "../ifc/createMilestone1ArtifactPackage.js";

export type ProcessIfcJobDeps = {
  jobs: JobRepository;
  outputRoot: string;
  artifactStore?: LocalJobArtifactStore;
  extractCalculationInputEvidence?: (
    job: JobRecord,
  ) => Promise<CalculationInputEvidence[]>;
  materialLibrary?: MaterialLibrary;
  completedJobPublication: CompletedJobPublicationValidator;
};

export const reviewPlanVersion = "review-plan.v4";

export async function processIfcJob(command: {
  jobId: string;
  deps: ProcessIfcJobDeps;
}): Promise<void> {
  const job = command.deps.jobs.getJob(command.jobId);
  if (!job) {
    throw new Error(`Job not found: ${command.jobId}`);
  }
  const artifactStore = command.deps.artifactStore ?? new LocalJobArtifactStore(command.deps.outputRoot);
  const materialLibrary = command.deps.materialLibrary ?? defaultMaterialLibraryV1;
  try {
    command.deps.jobs.updateJob(command.jobId, {
      jobStatus: "processing",
      errorMessage: null,
      failureCode: null,
      retryable: false,
    });
    const calculationInputEvidence = await extractCalculationInputEvidence({
      job,
      deps: command.deps,
    });
    await writeEvidenceJson(artifactStore, command.jobId, "calculation-input-evidence.json", calculationInputEvidence);
    const requestedInputs = planRequestedInputs({
      calculationInputEvidence,
      materialLibrary,
      deferResolvedMaterialsToReview: true,
    }).requestedInputs;
    command.deps.jobs.saveReviewState({
      jobId: command.jobId,
      requestedInputs,
      planVersion: reviewPlanVersion,
      materialLibraryVersion: materialLibrary.version,
    });
    await writeJobJson(artifactStore, command.jobId, "requested-inputs.json", requestedInputs);

    const requiredRequestedInputs = requestedInputs.filter((input) => input.required !== false);
    const hasSpecialPhysicsBlocker = calculationInputEvidence.some((evidence) =>
      specialPhysicsIssuesForEvidence({
        evidence,
        materialLibrary,
      }).length > 0,
    );
    if (requiredRequestedInputs.length > 0 || hasSpecialPhysicsBlocker) {
      command.deps.jobs.updateJob(command.jobId, {
        jobStatus: "needs_review",
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
    const correlationId = randomUUID();
    const safeMessage = `Job processing failed. Reference: ${correlationId}`;
    console.error(`[${correlationId}] Job ${command.jobId} processing failed.`, safeOperationalDiagnostic(error));
    command.deps.jobs.updateJob(command.jobId, {
      jobStatus: "failed",
      errorMessage: safeMessage,
      failureCode: "job_processing_failed",
      retryable: true,
      lastFailureMessage: safeMessage,
    });
  }
}


export async function completeJobWithReviewInputs(command: {
  jobId: string;
  userInputs: UserInput[];
  deps: ProcessIfcJobDeps;
  calculationInputEvidence?: CalculationInputEvidence[];
  allowProcessingClaim?: boolean;
  completionStatus?: "completed" | "needs_review";
}): Promise<{ revisionId: string; reportPath: string; calculatedAssemblyCount: number; skippedAssemblyCount: number }> {
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
    failureCode: null,
    retryable: false,
  });
  const artifactStore = command.deps.artifactStore ?? new LocalJobArtifactStore(command.deps.outputRoot);

  try {
    const calculationInputEvidence =
      command.calculationInputEvidence ??
      await readEvidenceJson<CalculationInputEvidence[]>(artifactStore, command.jobId, "calculation-input-evidence.json");
    const result = await runCoreReviewCalculationReport({
      fileHash: previousJob.fileHash ?? previousJob.jobId,
      jobId: previousJob.jobId,
      artifactStore,
      outputRoot: command.deps.outputRoot,
      calculationInputEvidence,
      materialLibrary: command.deps.materialLibrary ?? defaultMaterialLibraryV1,
      userInputs: command.userInputs,
      parentRevisionId: previousJob.activeRevisionId,
    });
    const completedCandidate: JobRecord = {
      ...previousJob,
      jobStatus: command.completionStatus ?? "completed",
      reportPath: result.reportFilePath,
      activeRevisionId: result.revision.revisionId,
    };
    const validation = await command.deps.completedJobPublication.validate(completedCandidate);
    if (!validation.ok) throw new Error(`Revision publication incomplete: ${validation.code}.`);
    command.deps.jobs.updateJob(command.jobId, {
      jobStatus: command.completionStatus ?? "completed",
      reportPath: result.reportFilePath,
      activeRevisionId: result.revision.revisionId,
    });
    return {
      revisionId: result.revision.revisionId,
      reportPath: result.reportFilePath,
      calculatedAssemblyCount: result.calculationSnapshots.length,
      skippedAssemblyCount: Math.max(
        0,
        groupCalculationInputEvidenceByAssembly(calculationInputEvidence).size - result.calculationSnapshots.length,
      ),
    };
  } catch (error) {
    await command.deps.completedJobPublication.restoreActiveRevision(command.jobId, previousJob.activeRevisionId);
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
  artifactStore: LocalJobArtifactStore,
  jobId: string,
  filename: string,
  value: unknown,
): Promise<void> {
  const path = artifactStore.pathsFor(jobId).jobFile(filename);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), "utf8");
}

async function writeEvidenceJson(
  artifactStore: LocalJobArtifactStore,
  jobId: string,
  filename: string,
  value: unknown,
): Promise<void> {
  const path = artifactStore.pathsFor(jobId).evidenceFile(filename);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), "utf8");
}

async function readEvidenceJson<T>(
  artifactStore: LocalJobArtifactStore,
  jobId: string,
  filename: string,
): Promise<T> {
  const path = artifactStore.pathsFor(jobId).evidenceFile(filename);
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
