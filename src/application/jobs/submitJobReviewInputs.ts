import type { OverrideScopeKind, RequestedInput, UserInput } from "../../domain/review/reviewTypes.js";
import type { JobRepository } from "../../domain/jobs/jobRepository.js";
import { defaultMaterialLibraryV1 } from "../../domain/materials/library.v1.js";
import { materialLibraryEntryForKey } from "../../domain/materials/resolveLayerLambda.js";
import { readActiveRevisionArtifact } from "../../infrastructure/storage/local-files/jobReviewArtifactStore.js";
import { completeJobWithReviewInputs, type ProcessIfcJobDeps } from "./processIfcJob.js";

export async function submitJobReviewInputs(command: {
  jobId: string;
  body: unknown;
  jobs: JobRepository;
  deps: ProcessIfcJobDeps;
}): Promise<{ jobId: string; revisionId: string; jobStatus: "completed" }> {
  const job = command.jobs.getJob(command.jobId);
  if (!job) {
    throw new Error("Job not found");
  }
  if (job.jobStatus !== "needs_review" && job.jobStatus !== "completed") {
    throw new Error(`Job is ${job.jobStatus}; Review inputs require needs_review or completed.`);
  }
  const submission = validateReviewInputBody(command.jobs, command.jobId, command.body);
  const activeRevision = await readActiveRevisionArtifact({
    artifactStore: command.deps.artifactStore,
    outputRoot: command.deps.outputRoot,
    jobId: command.jobId,
    activeRevisionId: job.activeRevisionId,
  });
  const userInputs = mergeReviewInputs({
    requestedInputs: submission.requestedInputs,
    submittedInputs: submission.userInputs,
    activeRevisionInputs: activeRevision?.userInputs ?? [],
  });
  const result = await completeJobWithReviewInputs({
    jobId: command.jobId,
    userInputs,
    deps: command.deps,
  });
  return {
    jobId: command.jobId,
    revisionId: result.revisionId,
    jobStatus: "completed",
  };
}

function validateReviewInputBody(
  jobs: JobRepository,
  jobId: string,
  body: unknown,
): { requestedInputs: RequestedInput[]; userInputs: UserInput[] } {
  if (!isRecord(body) || !Array.isArray(body.inputs)) {
    throw new Error("Expected inputs array.");
  }
  if (body.assemblyGroupId !== undefined && typeof body.assemblyGroupId !== "string") {
    throw new Error("assemblyGroupId must be a string when supplied.");
  }
  const reviewState = jobs.getReviewState(jobId);
  if (!reviewState) {
    throw new Error("No Review state exists for Job.");
  }
  const requestedById = new Map(
    reviewState.requestedInputs.map((input) => [input.requestedInputId, input]),
  );
  const seenRequestedInputIds = new Set<string>();
  const userInputs = body.inputs.map((input, index): UserInput => {
    if (!isRecord(input) || typeof input.requestedInputId !== "string") {
      throw new Error(`Input ${index} missing requestedInputId.`);
    }
    const requested = requestedById.get(input.requestedInputId);
    if (!requested) {
      throw new Error(`Unknown requested input: ${input.requestedInputId}`);
    }
    if (
      typeof body.assemblyGroupId === "string" &&
      requested.assemblyGroupId !== body.assemblyGroupId
    ) {
      throw new Error(`Requested input does not belong to assembly group: ${input.requestedInputId}`);
    }
    if (seenRequestedInputIds.has(input.requestedInputId)) {
      throw new Error(`Duplicate requested input: ${input.requestedInputId}`);
    }
    seenRequestedInputIds.add(input.requestedInputId);
    const overrideScope = validateOverrideScope(input.overrideScope);
    const materialLibraryEntry = materialLibraryEntryFor(input.materialLibraryKey);
    const value = materialLibraryEntry === null
      ? validateValue(input.value, requested.inputType)
      : materialLibraryEntry.lambdaWPerMK;
    const unit = input.unit === undefined ? requested.unit : validateUnit(input.unit);
    if (unit !== requested.unit) {
      throw new Error(`Invalid unit for ${input.requestedInputId}: expected ${requested.unit ?? "null"}`);
    }
    return {
      userInputId: `ui_${jobId}_${index}_${Date.now()}`,
      requestedInputId: requested.requestedInputId,
      datapoint: requested.datapoint,
      value,
      unit,
      overrideScope,
      valueSource: materialLibraryEntry === null ? "manual" : "material_library",
      materialLibraryKey: materialLibraryEntry?.materialKey,
    };
  });
  return { requestedInputs: reviewState.requestedInputs, userInputs };
}

function mergeReviewInputs(command: {
  requestedInputs: RequestedInput[];
  submittedInputs: UserInput[];
  activeRevisionInputs: UserInput[];
}): UserInput[] {
  const submittedById = new Map(command.submittedInputs.map((input) => [input.requestedInputId, input]));
  const activeById = new Map(command.activeRevisionInputs.map((input) => [input.requestedInputId, input]));
  return command.requestedInputs.flatMap((requested) => {
    const input = submittedById.get(requested.requestedInputId) ?? activeById.get(requested.requestedInputId);
    if (!input) {
      if (requested.required === false) return [];
      throw new Error("All required Review inputs must be supplied before calculation.");
    }
    return [input];
  });
}

function validateOverrideScope(value: unknown): OverrideScopeKind {
  if (
    value === "layer_occurrence" ||
    value === "material_decision" ||
    value === "assembly_group" ||
    value === "element_type"
  ) {
    return value;
  }
  throw new Error("Invalid overrideScope.");
}

function materialLibraryEntryFor(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Error("Invalid materialLibraryKey.");
  const entry = materialLibraryEntryForKey(defaultMaterialLibraryV1, value);
  if (!entry) throw new Error("Unknown materialLibraryKey.");
  return entry;
}

function validateUnit(value: unknown): string | null {
  if (value === null || typeof value === "string") {
    return value;
  }
  throw new Error("Invalid unit.");
}

function validateValue(
  value: unknown,
  inputType: "number" | "text" | "choice",
): string | number | boolean {
  if (inputType === "number") {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error("Numeric Review input must be greater than zero.");
    }
    return parsed;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("Text Review input must not be empty.");
  }
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
