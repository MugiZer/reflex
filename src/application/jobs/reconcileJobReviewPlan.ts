import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { CalculationInputEvidence } from "../../domain/evidence/calculationInputEvidenceTypes.js";
import { defaultMaterialLibraryV1 } from "../../domain/materials/library.v1.js";
import { specialPhysicsIssuesForEvidence } from "../../domain/materials/materialResolution.js";
import { planRequestedInputs } from "../../domain/review/planRequestedInputs.js";
import { LocalJobArtifactStore } from "../../infrastructure/storage/local-files/jobArtifactStore.js";
import { completeJobWithReviewInputs, reviewPlanVersion, type ProcessIfcJobDeps } from "./processIfcJob.js";

export async function reconcileJobReviewPlan(command: {
  jobId: string;
  deps: ProcessIfcJobDeps;
}): Promise<{ jobId: string; jobStatus: "needs_review" | "completed"; reconciled: boolean; revisionId?: string }> {
  const job = command.deps.jobs.getJob(command.jobId);
  if (!job) throw new Error("Job not found");
  if (job.jobStatus !== "needs_review") {
    throw new Error(`Job is ${job.jobStatus}; only needs_review Jobs can be reconciled.`);
  }

  const priorState = command.deps.jobs.getReviewState(command.jobId);
  if (!priorState) throw new Error("No Review state exists for Job.");
  const materialLibrary = command.deps.materialLibrary ?? defaultMaterialLibraryV1;
  const artifactStore = command.deps.artifactStore ?? new LocalJobArtifactStore(command.deps.outputRoot);
  const calculationInputEvidence = await readEvidenceJson<CalculationInputEvidence[]>(artifactStore, command.jobId);
  const hasSpecialPhysicsBlocker = calculationInputEvidence.some((evidence) =>
    specialPhysicsIssuesForEvidence({ evidence, materialLibrary }).length > 0,
  );
  const isCurrentPlan =
    priorState.planVersion === reviewPlanVersion &&
    priorState.materialLibraryVersion === materialLibrary.version;
  const requestedInputs = isCurrentPlan
    ? priorState.requestedInputs
    : planRequestedInputs({
        calculationInputEvidence,
        materialLibrary,
        deferResolvedMaterialsToReview: hasSpecialPhysicsBlocker,
      }).requestedInputs;
  if (!isCurrentPlan) {
    command.deps.jobs.saveReviewState({
      jobId: command.jobId,
      requestedInputs,
      planVersion: reviewPlanVersion,
      materialLibraryVersion: materialLibrary.version,
    });
    await writeRequestedInputs(artifactStore, command.jobId, requestedInputs);
  }

  const hasRequiredInputs = requestedInputs.some((input) => input.required !== false);

  if (hasRequiredInputs || hasSpecialPhysicsBlocker) {
    return { jobId: command.jobId, jobStatus: "needs_review", reconciled: !isCurrentPlan };
  }

  const completed = await completeJobWithReviewInputs({
    jobId: command.jobId,
    userInputs: [],
    deps: command.deps,
    calculationInputEvidence,
  });
  return { jobId: command.jobId, jobStatus: "completed", reconciled: true, revisionId: completed.revisionId };
}

async function readEvidenceJson<T>(artifactStore: LocalJobArtifactStore, jobId: string): Promise<T> {
  const path = artifactStore.pathsFor(jobId).evidenceFile("calculation-input-evidence.json");
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function writeRequestedInputs(artifactStore: LocalJobArtifactStore, jobId: string, requestedInputs: unknown): Promise<void> {
  const path = artifactStore.pathsFor(jobId).jobFile("requested-inputs.json");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(requestedInputs, null, 2), "utf8");
}
