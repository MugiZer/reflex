import { createHash } from "node:crypto";
import { canonicalTopologyJson } from "../../domain/topology/canonicalTopologyJson.js";
import type { TopologyScenarioPlan } from "../../domain/topology/componentKnowledgeBase.js";
import type { JsonValue, SubmitTopologyAnalysisRequest, TopologyBundleIdentity, TopologyResult } from "../../domain/topology/topologyTypes.js";

type RequestSeam = { submit(request: SubmitTopologyAnalysisRequest): Promise<TopologyResult> };

export type TopologyScenarioEstimate = {
  outcome: "preliminary-unsafe" | "blocked" | "rejected" | "failed" | "cancelled";
  scenarios: readonly { scenarioId: string; parameters: Record<string, JsonValue>; pack: { packId: string; version: string }; requestId: string; outcome: TopologyResult["outcome"]; effectiveUValueWPerM2K: number | null; evidence: TopologyResult["evidence"] }[];
  uValueRangeWPerM2K: { min: number; max: number } | null;
  dominantUncertainty: { key: string; label: string } | null;
  decisiveNextInput: { key: string; label: string } | null;
  conservativeScreeningValueWPerM2K: number | null;
};

/** Executes every immutable pack-defined scenario through the normal topology request seam, then applies presentation gates. */
export async function runTopologyScenarioPlan(command: { plan: TopologyScenarioPlan; sourceRevisionId: string; sourceAssemblyGroupId: string; correlationId: string; idempotencyKey: string; layerOnlySnapshot: JsonValue; bundle: TopologyBundleIdentity; requests: RequestSeam; projectThresholdUValueWPerM2K: number | null }): Promise<TopologyScenarioEstimate> {
  const scenarios = await Promise.all(command.plan.scenarios.map(async (scenario) => {
    const request = await command.requests.submit({ sourceRevisionId: command.sourceRevisionId, sourceAssemblyGroupId: command.sourceAssemblyGroupId, correlationId: command.correlationId, idempotencyKey: sha256(`${command.idempotencyKey}:${scenario.scenarioId}:${canonicalTopologyJson(scenario.recipe)}`), recipe: scenario.recipe, recipeHash: sha256(canonicalTopologyJson(scenario.recipe)), bundle: command.bundle, layerOnlySnapshot: command.layerOnlySnapshot });
    return { scenarioId: scenario.scenarioId, parameters: scenario.parameters, pack: { packId: command.plan.pack.packId, version: command.plan.pack.version }, requestId: request.requestId, outcome: request.outcome, effectiveUValueWPerM2K: request.effectiveUValueWPerM2K, evidence: request.evidence };
  }));
  if (scenarios.some((scenario) => scenario.outcome !== "preliminary-unsafe" || scenario.effectiveUValueWPerM2K === null)) return { outcome: worstOutcome(scenarios.map((scenario) => scenario.outcome)), scenarios, uValueRangeWPerM2K: null, dominantUncertainty: null, decisiveNextInput: null, conservativeScreeningValueWPerM2K: null };
  const values = scenarios.map((scenario) => scenario.effectiveUValueWPerM2K!);
  const range = { min: Math.min(...values), max: Math.max(...values) };
  const dominant = dominantUncertainty(scenarios);
  const gatePasses = range.max - range.min <= command.plan.pack.immaterialityGateWPerM2K && command.projectThresholdUValueWPerM2K !== null && range.max <= command.projectThresholdUValueWPerM2K;
  return { outcome: "preliminary-unsafe", scenarios, uValueRangeWPerM2K: range, dominantUncertainty: dominant, decisiveNextInput: gatePasses ? null : dominant, conservativeScreeningValueWPerM2K: gatePasses ? range.max : null };
}

function dominantUncertainty(scenarios: readonly { parameters: Record<string, JsonValue>; effectiveUValueWPerM2K: number | null }[]): { key: string; label: string } | null {
  const keys = [...new Set(scenarios.flatMap((scenario) => Object.keys(scenario.parameters)))];
  if (!keys.length) return null;
  const mostImpactful = keys.map((key) => ({ key, impact: impactFor(key, scenarios) })).sort((left, right) => right.impact - left.impact || left.key.localeCompare(right.key))[0]!;
  return { key: mostImpactful.key, label: labelFor(mostImpactful.key) };
}
function impactFor(key: string, scenarios: readonly { parameters: Record<string, JsonValue>; effectiveUValueWPerM2K: number | null }[]): number { const groups = new Map<string, number[]>(); for (const scenario of scenarios) { const value = scenario.parameters[key]; const id = canonicalTopologyJson(value); const values = groups.get(id) ?? []; values.push(scenario.effectiveUValueWPerM2K!); groups.set(id, values); } const means = [...groups.values()].map((values) => values.reduce((sum, value) => sum + value, 0) / values.length); return Math.max(...means) - Math.min(...means); }
function labelFor(key: string): string { return key === "memberWidthM" ? "Member width" : key === "repeatSpacingM" ? "Repeat spacing" : key; }
function worstOutcome(outcomes: readonly TopologyResult["outcome"][]): TopologyScenarioEstimate["outcome"] { return outcomes.includes("failed") ? "failed" : outcomes.includes("rejected") ? "rejected" : outcomes.includes("cancelled") ? "cancelled" : "blocked"; }
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
