import { createHash } from "node:crypto";

import { canonicalTopologyJson } from "./canonicalTopologyJson.js";
import type { ComponentEvaluationGraph, EvaluationAggregateRecord } from "./componentEvaluationRecords.js";
import type { JsonValue } from "./topologyTypes.js";

type AggregatePolicy = Readonly<{ screeningThresholdWPerM2K: number | null; immaterialityGateWPerM2K: number }>;

/** Derives publication data only from a complete persisted graph supplied by the repository read seam. */
export function deriveComponentEvaluationAggregate(graph: ComponentEvaluationGraph, policy: AggregatePolicy): EvaluationAggregateRecord {
  const lineage = graph.requests.map((request) => {
    const recipe = graph.recipes.find((item) => item.recipeId === request.recipeId);
    const result = graph.results.find((item) => item.scenarioRequestId === request.scenarioRequestId);
    return { recipeId: recipe?.recipeId ?? null, recipeSha256: recipe?.recipeSha256 ?? null, scenarioRequestId: request.scenarioRequestId, idempotencyKey: request.idempotencyKey, scenarioResultId: result?.scenarioResultId ?? null, artifactIdentity: result?.artifactIdentity ?? null, outcome: result?.outcome ?? null };
  });
  const values = graph.requests.map((request) => {
    const result = graph.results.find((item) => item.scenarioRequestId === request.scenarioRequestId);
    const payload = result?.resultPayload;
    const value = isRecord(payload) ? payload.effectiveUValueWPerM2K : null;
    return result?.outcome === "preliminary-unsafe" && result.artifactIdentity && typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
  });
  const complete = graph.requests.length > 0 && graph.recipes.length === graph.requests.length && graph.results.length === graph.requests.length && values.every((value) => value !== null);
  const numerical = values.filter((value): value is number => value !== null);
  const min = complete ? Math.min(...numerical) : null;
  const max = complete ? Math.max(...numerical) : null;
  const width = min === null || max === null ? null : max - min;
  const bothGatesPass = max !== null && width !== null && policy.screeningThresholdWPerM2K !== null && max <= policy.screeningThresholdWPerM2K && width <= policy.immaterialityGateWPerM2K;
  const outcome = !complete ? "range-unavailable" : numerical.length === 1 ? "exact" : "range";
  const payload: JsonValue = {
    preliminary: true,
    minUValueWPerM2K: min,
    maxUValueWPerM2K: max,
    conservativeProposalWPerM2K: bothGatesPass ? max : null,
    decisiveNextInput: complete && numerical.length > 1 && !bothGatesPass ? "memberWidthM" : null,
    dominantUncertainty: complete && numerical.length > 1 ? "memberWidthM" : null,
    gateInputs: { screeningThresholdWPerM2K: policy.screeningThresholdWPerM2K, immaterialityGateWPerM2K: policy.immaterialityGateWPerM2K, rangeWidthWPerM2K: width, worstCredibleUValueWPerM2K: max },
    scenarioLineage: lineage as unknown as JsonValue,
  };
  return { aggregateId: sha256(canonicalTopologyJson({ evaluationId: graph.evaluation.evaluationId, outcome, payload })), evaluationId: graph.evaluation.evaluationId, outcome, payload, createdAt: graph.evaluation.createdAt };
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
