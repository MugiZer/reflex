import type { RequestedInput } from "../review/reviewTypes.js";
import type { IfcTopologyOpportunity, TopologyReviewAnswer } from "../topology/ifcTopologyOpportunity.js";
import type { TopologyResult } from "../topology/topologyTypes.js";

export type JobStatus = "queued" | "processing" | "needs_review" | "completed" | "failed";
export type JobRecord = { jobId: string; jobStatus: JobStatus; originalFilename: string; uploadPath: string; fileHash: string | null; createdAt: string; updatedAt: string; errorMessage: string | null; reportPath: string | null; activeRevisionId: string | null; };
export type JobReviewState = { jobId: string; requestedInputs: RequestedInput[]; planVersion?: string; materialLibraryVersion?: string; };
export type JobSummary = Pick<JobRecord, "jobId" | "jobStatus" | "originalFilename" | "createdAt" | "updatedAt">;
/** Immutable optional enrichment; it never becomes part of a layer-only Revision. */
export type JobTopologyReview = { topologyReviewId: string; idempotencyKey: string; jobId: string; sourceRevisionId: string; sourceAssemblyGroupId: string; opportunity: IfcTopologyOpportunity | null; opportunityId: string; thermalConstructionSignature: string; answers: Record<string, TopologyReviewAnswer>; recipeHash: string | null; outcome: "blocked" | "rejected" | "not-requested" | "preliminary-unsafe" | "failed" | "cancelled"; missingKeys: string[]; decisiveNextInput: string | null; errorCode: string | null; topologyResult: TopologyResult | null; createdAt: string; };
