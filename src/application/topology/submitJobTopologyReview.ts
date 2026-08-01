import { createHash, randomUUID } from "node:crypto";

import type { JobRepository } from "../../domain/jobs/jobRepository.js";
import type { JobTopologyReview } from "../../domain/jobs/jobTypes.js";
import { assemblyGroupIdForEvidence } from "../../domain/review/reviewGrouping.js";
import { canonicalTopologyJson } from "../../domain/topology/canonicalTopologyJson.js";
import { detectIfcTopologyOpportunities, type TopologyReviewAnswer } from "../../domain/topology/ifcTopologyOpportunity.js";
import type { JsonValue, TopologyBundleIdentity } from "../../domain/topology/topologyTypes.js";
import { submitIfcTopologyConfirmation, type TopologyAnalysisRequestService } from "./submitIfcTopologyConfirmation.js";
import type { TopologyReviewEvidenceLoader } from "./topologyReviewEvidence.js";
import { requireCompleteTopologyResult } from "./createTopologyAnalysisRequestService.js";

/** Loads immutable Job evidence, validates ownership, and persists optional topology enrichment. */
export async function submitJobTopologyReview(command: {
  jobId: string;
  body: unknown;
  jobs: JobRepository;
  evidence: TopologyReviewEvidenceLoader;
  requests: TopologyAnalysisRequestService;
  bundle: TopologyBundleIdentity;
}): Promise<JobTopologyReview> {
  const submission = parseSubmission(command.body);
  const job = command.jobs.getJob(command.jobId);
  if (!job) throw new Error("Job not found.");
  if (!job.activeRevisionId) throw new Error("Topology review requires an active Revision.");
  if (submission.sourceRevisionId !== job.activeRevisionId) return saveRejected(command, submission, "stale_source_revision");
  const loaded = await command.evidence.load(command.jobId, job.activeRevisionId);
  if (!loaded) return saveRejected(command, submission, "missing_review_evidence");
  const { calculationInputEvidence: evidence, activeRevision: revision } = loaded;
  if (revision.revisionId !== job.activeRevisionId) return saveRejected(command, submission, "active_revision_identity_mismatch");
  const opportunity = detectIfcTopologyOpportunities({ calculationInputEvidence: evidence }).find((item) =>
    item.opportunityId === submission.opportunityId && item.thermalConstructionSignature === submission.thermalConstructionSignature,
  );
  if (!opportunity) return saveRejected(command, submission, "unknown_or_stale_opportunity");
  const groupIds = new Set(evidence.filter((item) => opportunity.affectedElementStepIds.includes(item.elementStepId)).map(assemblyGroupIdForEvidence));
  if (!groupIds.has(submission.sourceAssemblyGroupId)) return saveRejected(command, submission, "wrong_assembly_group");
  const snapshot = revision.calculationSnapshots.find((item) => item.assemblyGroupId === submission.sourceAssemblyGroupId);
  if (!snapshot) return saveRejected(command, submission, "missing_layer_only_snapshot");
  const layerOnlySnapshot = JSON.parse(JSON.stringify(snapshot)) as JsonValue;
  const idempotencyKey = sha256(canonicalTopologyJson({ jobId: command.jobId, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: submission.sourceAssemblyGroupId, opportunityId: opportunity.opportunityId, signature: opportunity.thermalConstructionSignature, answers: submission.answers }));
  const existing = command.jobs.getTopologyReviewByIdempotencyKey(command.jobId, idempotencyKey);
  if (existing) return existing;
  const response = await submitIfcTopologyConfirmation({ opportunity, answers: submission.answers, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: submission.sourceAssemblyGroupId, correlationId: randomUUID(), idempotencyKey, layerOnlySnapshot, bundle: command.bundle, requests: command.requests });
  const review: JobTopologyReview = response.outcome === "blocked"
    ? { topologyReviewId: `toprev_${randomUUID()}`, idempotencyKey, jobId: command.jobId, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: submission.sourceAssemblyGroupId, opportunity, opportunityId: opportunity.opportunityId, thermalConstructionSignature: opportunity.thermalConstructionSignature, answers: submission.answers, recipeHash: null, outcome: "blocked", missingKeys: (response as { missingKeys?: string[] }).missingKeys ?? [], errorCode: null, topologyResult: null, createdAt: new Date().toISOString() }
    : response.outcome === "rejected"
      ? { topologyReviewId: `toprev_${randomUUID()}`, idempotencyKey, jobId: command.jobId, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: submission.sourceAssemblyGroupId, opportunity, opportunityId: opportunity.opportunityId, thermalConstructionSignature: opportunity.thermalConstructionSignature, answers: submission.answers, recipeHash: null, outcome: "rejected", missingKeys: [], errorCode: (response as { errorCode?: string }).errorCode ?? null, topologyResult: null, createdAt: new Date().toISOString() }
      : { topologyReviewId: `toprev_${randomUUID()}`, idempotencyKey, jobId: command.jobId, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: submission.sourceAssemblyGroupId, opportunity, opportunityId: opportunity.opportunityId, thermalConstructionSignature: opportunity.thermalConstructionSignature, answers: submission.answers, recipeHash: response.recipeHash, outcome: response.outcome, missingKeys: [], errorCode: response.topologyRequest.errorCode ?? null, topologyResult: completeTopologyResult(response.topologyRequest), createdAt: new Date().toISOString() };
  try {
    command.jobs.saveTopologyReview(review);
    return review;
  } catch (error) {
    const replay = command.jobs.getTopologyReviewByIdempotencyKey(command.jobId, idempotencyKey);
    if (replay) return replay;
    throw error;
  }
}

function saveRejected(command: { jobId: string; jobs: JobRepository }, submission: { opportunityId: string; thermalConstructionSignature: string; sourceRevisionId: string; sourceAssemblyGroupId: string; answers: Record<string, TopologyReviewAnswer> }, errorCode: string): JobTopologyReview {
  const idempotencyKey = sha256(canonicalTopologyJson({ jobId: command.jobId, sourceRevisionId: submission.sourceRevisionId, sourceAssemblyGroupId: submission.sourceAssemblyGroupId, opportunityId: submission.opportunityId, signature: submission.thermalConstructionSignature, answers: submission.answers }));
  const existing = command.jobs.getTopologyReviewByIdempotencyKey(command.jobId, idempotencyKey);
  if (existing) return existing;
  const review: JobTopologyReview = { topologyReviewId: `toprev_${randomUUID()}`, idempotencyKey, jobId: command.jobId, sourceRevisionId: submission.sourceRevisionId, sourceAssemblyGroupId: submission.sourceAssemblyGroupId, opportunity: null, opportunityId: submission.opportunityId, thermalConstructionSignature: submission.thermalConstructionSignature, answers: submission.answers, recipeHash: null, outcome: "rejected", missingKeys: [], errorCode, topologyResult: null, createdAt: new Date().toISOString() };
  try {
    command.jobs.saveTopologyReview(review);
    return review;
  } catch {
    const replay = command.jobs.getTopologyReviewByIdempotencyKey(command.jobId, idempotencyKey);
    if (replay) return replay;
    throw new Error("Unable to persist topology review rejection.");
  }
}

function completeTopologyResult(value: unknown) {
  return requireCompleteTopologyResult(value);
}

function parseSubmission(body: unknown): { opportunityId: string; thermalConstructionSignature: string; sourceRevisionId: string; sourceAssemblyGroupId: string; answers: Record<string, TopologyReviewAnswer> } {
  if (!isRecord(body)) throw new Error("Expected a topology review confirmation object.");
  for (const key of ["opportunityId", "thermalConstructionSignature", "sourceRevisionId", "sourceAssemblyGroupId"]) if (typeof body[key] !== "string" || !body[key].trim()) throw new Error(`${key} is required.`);
  if (!isRecord(body.answers)) throw new Error("answers must be an object of reviewer values.");
  for (const value of Object.values(body.answers)) if (!(typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null)) throw new Error("Topology review answers must be strings, numbers, booleans, or null.");
  return { opportunityId: body.opportunityId as string, thermalConstructionSignature: body.thermalConstructionSignature as string, sourceRevisionId: body.sourceRevisionId as string, sourceAssemblyGroupId: body.sourceAssemblyGroupId as string, answers: body.answers as Record<string, TopologyReviewAnswer> };
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
