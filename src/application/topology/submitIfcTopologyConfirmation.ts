import { createHash } from "node:crypto";
import { confirmIfcTopologyOpportunity, type IfcTopologyOpportunity, type TopologyReviewAnswer } from "../../domain/topology/ifcTopologyOpportunity.js";
import { canonicalTopologyJson } from "../../domain/topology/canonicalTopologyJson.js";
import type { JsonValue, SubmitTopologyAnalysisRequest, TopologyBundleIdentity, TopologyResult } from "../../domain/topology/topologyTypes.js";

export type TopologyAnalysisRequestService = { submit(request: SubmitTopologyAnalysisRequest): Promise<Pick<TopologyResult, "outcome" | "requestId"> & Partial<TopologyResult>> };

/** Turns a compact review decision into an immutable optional topology request; it never updates the layer-only Revision. */
export async function submitIfcTopologyConfirmation(command: {
  opportunity: IfcTopologyOpportunity;
  answers: Record<string, TopologyReviewAnswer>;
  sourceRevisionId: string;
  sourceAssemblyGroupId: string;
  correlationId: string;
  idempotencyKey: string;
  layerOnlySnapshot: JsonValue;
  bundle: TopologyBundleIdentity;
  requests: TopologyAnalysisRequestService;
  deadlineAt?: string;
  cancellationSignal?: AbortSignal;
}) {
  const confirmation = confirmIfcTopologyOpportunity({ opportunity: command.opportunity, answers: command.answers });
  if (confirmation.outcome === "blocked") return { outcome: "blocked" as const, missingKeys: confirmation.missingKeys, layerOnlySnapshot: command.layerOnlySnapshot };
  if (confirmation.outcome === "rejected") return { outcome: "rejected" as const, errorCode: confirmation.errorCode, layerOnlySnapshot: command.layerOnlySnapshot };
  const topologyRequest = await command.requests.submit({
    sourceRevisionId: command.sourceRevisionId,
    sourceAssemblyGroupId: command.sourceAssemblyGroupId,
    correlationId: command.correlationId,
    idempotencyKey: command.idempotencyKey,
    recipe: confirmation.recipe,
    recipeHash: createHash("sha256").update(canonicalTopologyJson(confirmation.recipe)).digest("hex"),
    bundle: command.bundle,
    layerOnlySnapshot: command.layerOnlySnapshot,
    deadlineAt: command.deadlineAt,
    cancellationSignal: command.cancellationSignal,
  });
  return { outcome: topologyRequest.outcome, topologyRequest, recipeHash: createHash("sha256").update(canonicalTopologyJson(confirmation.recipe)).digest("hex"), layerOnlySnapshot: command.layerOnlySnapshot };
}
