import type { OverrideScopeKind, UserInput } from "../../domain/review/reviewTypes.js";
import type { JobRepository } from "../../domain/jobs/jobRepository.js";
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
  if (job.jobStatus !== "needs_review") {
    throw new Error(`Job is ${job.jobStatus}, not needs_review.`);
  }
  const userInputs = validateReviewInputBody(command.jobs, command.jobId, command.body);
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
): UserInput[] {
  if (!isRecord(body) || typeof body.assemblyGroupId !== "string" || !Array.isArray(body.inputs)) {
    throw new Error("Expected assemblyGroupId and inputs array.");
  }
  const reviewState = jobs.getReviewState(jobId);
  if (!reviewState) {
    throw new Error("No Review state exists for Job.");
  }
  const requestedById = new Map(
    reviewState.requestedInputs.map((input) => [input.requestedInputId, input]),
  );
  return body.inputs.map((input, index): UserInput => {
    if (!isRecord(input) || typeof input.requestedInputId !== "string") {
      throw new Error(`Input ${index} missing requestedInputId.`);
    }
    const requested = requestedById.get(input.requestedInputId);
    if (!requested || requested.assemblyGroupId !== body.assemblyGroupId) {
      throw new Error(`Requested input does not belong to assembly group: ${input.requestedInputId}`);
    }
    const overrideScope = validateOverrideScope(input.overrideScope);
    const value = validateValue(input.value, requested.inputType);
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
    };
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
