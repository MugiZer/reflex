import { canonicalTopologyJson } from "./canonicalTopologyJson.js";
import type { JsonValue } from "./topologyTypes.js";

export type ComponentKnowledgeBase = {
  readonly packId: string;
  readonly version: string;
  readonly supportedUnknowns: readonly { key: string; values: readonly number[]; label: string }[];
  readonly immaterialityGateWPerM2K: number;
};

export type TopologyScenarioPlan = {
  readonly pack: Pick<ComponentKnowledgeBase, "packId" | "version" | "immaterialityGateWPerM2K">;
  readonly scenarios: readonly { scenarioId: string; recipe: JsonValue; parameters: Record<string, JsonValue> }[];
};

/** Creates the narrow, versioned policy boundary for compatible preliminary scenarios. */
export function createComponentKnowledgeBase(pack: ComponentKnowledgeBase): ComponentKnowledgeBase {
  if (!pack.packId || !/^\d+\./.test(pack.version) || !Number.isFinite(pack.immaterialityGateWPerM2K) || pack.immaterialityGateWPerM2K < 0) throw new Error("Component Knowledge Base identity and immateriality gate are invalid.");
  if (!pack.supportedUnknowns.length || pack.supportedUnknowns.some((item) => !item.key || !item.label || item.values.length < 2 || item.values.some((value) => !Number.isFinite(value) || value <= 0))) throw new Error("Component Knowledge Base scenarios require credible bounded values.");
  return Object.freeze({ ...pack, supportedUnknowns: pack.supportedUnknowns.map((item) => Object.freeze({ ...item, values: Object.freeze([...item.values]) })) });
}

/** Resolves only explicitly pack-supported unknowns; all scenario values retain estimate authority and pack provenance. */
export function resolveTopologyScenarioPlan(command: { pack: ComponentKnowledgeBase; recipe: JsonValue; unknownKeys: readonly string[] }): { outcome: "ready"; plan: TopologyScenarioPlan } | { outcome: "blocked"; reason: string } {
  if (!command.unknownKeys.length) return { outcome: "blocked", reason: "no_supported_unknown" };
  const supported = new Map(command.pack.supportedUnknowns.map((item) => [item.key, item]));
  const unknown = [...new Set(command.unknownKeys)];
  const unsupported = unknown.find((key) => !supported.has(key));
  if (unsupported) return { outcome: "blocked", reason: `unsupported_unknown:${unsupported}` };
  const combinations = cartesian(unknown.map((key) => supported.get(key)!.values));
  return {
    outcome: "ready",
    plan: {
      pack: { packId: command.pack.packId, version: command.pack.version, immaterialityGateWPerM2K: command.pack.immaterialityGateWPerM2K },
      scenarios: combinations.map((values, index) => {
        const parameters = Object.fromEntries(unknown.map((key, valueIndex) => [key, { value: values[valueIndex]!, authority: { state: "preliminary-estimate", sourceRefs: [`component-knowledge-base:${command.pack.packId}@${command.pack.version}:${key}`] } }])) as Record<string, JsonValue>;
        return { scenarioId: `scenario-${index + 1}`, parameters, recipe: applyParameters(command.recipe, parameters) };
      }),
    },
  };
}

function cartesian(values: readonly (readonly number[])[]): number[][] { return values.reduce<number[][]>((all, next) => all.flatMap((prefix) => next.map((value) => [...prefix, value])), [[]]); }

function applyParameters(recipe: JsonValue, parameters: Record<string, JsonValue>): JsonValue {
  const copy = JSON.parse(canonicalTopologyJson(recipe)) as Record<string, any>;
  if (!isRecord(copy) || !Array.isArray(copy.rows) || !isRecord(copy.rows[0]) || !isRecord(copy.rows[0].member) || !isRecord(copy.rows[0].member.primitive) || !isRecord(copy.rows[0].member.primitive.parameters)) throw new Error("A scenario-capable Recipe must contain the first member primitive parameters.");
  const target = copy.rows[0].member.primitive.parameters;
  for (const [key, value] of Object.entries(parameters)) {
    const parameter = key === "memberWidthM" ? "width" : key === "repeatSpacingM" ? null : key;
    if (parameter === null) copy.periodicity = value;
    else target[parameter] = value;
  }
  return copy;
}

function isRecord(value: JsonValue | Record<string, any>): value is Record<string, any> { return typeof value === "object" && value !== null && !Array.isArray(value); }
