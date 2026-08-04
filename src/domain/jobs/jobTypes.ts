import type { RequestedInput } from "../review/reviewTypes.js";
import type { IfcTopologyOpportunity, TopologyReviewAnswer } from "../topology/ifcTopologyOpportunity.js";
import type { TopologyResult } from "../topology/topologyTypes.js";
import type { TopologyPilotDecision } from "../topology/topologyPilotPolicy.js";

export type JobStatus = "queued" | "processing" | "needs_review" | "completed" | "failed";
export type JobRecord = { jobId: string; jobStatus: JobStatus; originalFilename: string; uploadPath: string; fileHash: string | null; createdAt: string; updatedAt: string; errorMessage: string | null; reportPath: string | null; activeRevisionId: string | null; };
export type JobReviewState = { jobId: string; requestedInputs: RequestedInput[]; planVersion?: string; materialLibraryVersion?: string; };
export type JobSummary = Pick<JobRecord, "jobId" | "jobStatus" | "originalFilename" | "createdAt" | "updatedAt">;
/** Immutable optional enrichment; it never becomes part of a layer-only Revision. */
export type JobTopologyReview = { topologyReviewId: string; idempotencyKey: string; jobId: string; sourceRevisionId: string; sourceAssemblyGroupId: string; opportunity: IfcTopologyOpportunity | null; opportunityId: string; thermalConstructionSignature: string; answers: Record<string, TopologyReviewAnswer>; recipeHash: string | null; outcome: "blocked" | "rejected" | "not-requested" | "preliminary-unsafe" | "failed" | "cancelled"; disposition?: "disabled" | "cohort-excluded" | "killed"; policy?: TopologyPilotDecision; missingKeys: string[]; decisiveNextInput: string | null; errorCode: string | null; topologyResult: TopologyResult | null; createdAt: string; };
/** Operational policy record, deliberately separate from review inputs and Ticket 4 evaluation evidence. */
export type TopologyPilotRun = { pilotRunId: string; idempotencyKey: string; jobId: string; sourceRevisionId: string; sourceAssemblyGroupId: string; opportunityId: string; disposition: "disabled" | "cohort-excluded" | "killed" | "failed" | "cancelled" | "completed"; policy: TopologyPilotDecision; errorCode: string | null; createdAt: string; };
export type TopologyPilotEvent = { eventId: string; eventType: string; runId: string; jobId: string; sourceRevisionId: string; sourceAssemblyGroupId: string; correlationId: string; code: string; payloadHash: string; createdAt: string; };
