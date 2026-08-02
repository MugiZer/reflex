import { createHash } from "node:crypto";
import { canonicalTopologyJson } from "./canonicalTopologyJson.js";
import type { JsonValue } from "./topologyTypes.js";

export type ComponentKnowledgeBase = {
  readonly packId: string;
  readonly version: string;
  readonly lifecycle: "draft" | "candidate" | "promoted" | "rejected";
  /** A binding names the exact existing Recipe scalar that a bounded value may replace. */
  readonly supportedUnknowns: readonly { key: string; values: readonly number[]; label: string; binding: readonly (string | number)[] }[];
  readonly immaterialityGateWPerM2K: number;
  readonly maxScenarioCount?: number;
};

export type TopologyScenarioPlan = {
  readonly pack: Pick<ComponentKnowledgeBase, "packId" | "version" | "immaterialityGateWPerM2K">;
  readonly scenarios: readonly { scenarioId: string; recipe: JsonValue; parameters: Record<string, JsonValue> }[];
};

/** Creates the narrow, versioned policy boundary for compatible preliminary scenarios. */
export function createComponentKnowledgeBase(pack: ComponentKnowledgeBase): ComponentKnowledgeBase {
  if (!pack.packId || !/^\d+\./.test(pack.version) || !Number.isFinite(pack.immaterialityGateWPerM2K) || pack.immaterialityGateWPerM2K < 0) throw new Error("Component Knowledge Base identity and immateriality gate are invalid.");
  if (pack.supportedUnknowns.some((item) => !item.key || !item.label || item.values.length < 2 || item.values.some((value) => !Number.isFinite(value) || value <= 0) || !validBinding(item.binding))) throw new Error("Component Knowledge Base scenarios require credible bounded values and declarative bindings.");
  if (new Set(pack.supportedUnknowns.map((item) => item.key)).size !== pack.supportedUnknowns.length) throw new Error("Component Knowledge Base parameter keys must be unique.");
  return Object.freeze({ ...pack, supportedUnknowns: pack.supportedUnknowns.map((item) => Object.freeze({ ...item, values: Object.freeze([...item.values]), binding: Object.freeze([...item.binding]) })) });
}

/** Resolves only explicitly pack-supported unknowns; all scenario values retain estimate authority and pack provenance. */
export function resolveTopologyScenarioPlan(command: { pack: ComponentKnowledgeBase; recipe: JsonValue; unknownKeys: readonly string[] }): { outcome: "ready"; plan: TopologyScenarioPlan } | { outcome: "blocked" | "rejected" | "unmatched"; reason: string } {
  if (command.pack.lifecycle !== "promoted") return { outcome: "unmatched", reason: `pattern_not_promoted:${command.pack.packId}@${command.pack.version}:${command.pack.lifecycle}` };
  const supported = new Map(command.pack.supportedUnknowns.map((item) => [item.key, item]));
  const unknown = [...new Set(command.unknownKeys)];
  const unsupported = unknown.find((key) => !supported.has(key));
  if (unsupported) return { outcome: "blocked", reason: `unsupported_unknown:${unsupported}` };
  for (const key of unknown) if (!bindingTargetsFiniteNumber(command.recipe, supported.get(key)!.binding)) return { outcome: "rejected", reason: `invalid_binding:${key}` };
  const combinations = cartesian(unknown.map((key) => supported.get(key)!.values));
  const maximum = command.pack.maxScenarioCount ?? 64;
  if (combinations.length > maximum) return { outcome: "rejected", reason: `scenario_count_exceeds_maximum:${combinations.length}>${maximum}` };
  return {
    outcome: "ready",
    plan: {
      pack: { packId: command.pack.packId, version: command.pack.version, immaterialityGateWPerM2K: command.pack.immaterialityGateWPerM2K },
      scenarios: combinations.map((values) => {
        const parameters = Object.fromEntries(unknown.map((key, valueIndex) => [key, { value: values[valueIndex]!, authority: { state: "preliminary-estimate", sourceRefs: [`component-knowledge-base:${command.pack.packId}@${command.pack.version}:${key}`] } }])) as Record<string, JsonValue>;
        const recipe = applyParameters(command.recipe, parameters, supported);
        return { scenarioId: sha256(canonicalTopologyJson(recipe)), parameters, recipe };
      }),
    },
  };
}

function cartesian(values: readonly (readonly number[])[]): number[][] { return values.reduce<number[][]>((all, next) => all.flatMap((prefix) => next.map((value) => [...prefix, value])), [[]]); }

function applyParameters(recipe: JsonValue, parameters: Record<string, JsonValue>, supported: ReadonlyMap<string, ComponentKnowledgeBase["supportedUnknowns"][number]>): JsonValue {
  const copy: unknown = JSON.parse(canonicalTopologyJson(recipe));
  for (const [key, value] of Object.entries(parameters)) {
    const definition = supported.get(key);
    const scalar = isRecord(value) ? value.value : undefined;
    if (!definition || typeof scalar !== "number" || !Number.isFinite(scalar) || !setBindingValue(copy, definition.binding, scalar)) throw new Error(`Invalid Component Knowledge Base binding: ${key}`);
  }
  return copy as JsonValue;
}

function validBinding(binding: readonly (string | number)[]): boolean { return binding.length > 0 && binding.every((segment) => typeof segment === "string" ? segment.length > 0 && segment !== "__proto__" && segment !== "prototype" && segment !== "constructor" : Number.isInteger(segment) && segment >= 0); }
function bindingTargetsFiniteNumber(value: JsonValue, binding: readonly (string | number)[]): boolean {
  let current: unknown = value;
  for (const segment of binding) {
    if (typeof segment === "number") { if (!Array.isArray(current)) return false; current = current[segment]; }
    else { if (!isRecord(current)) return false; current = current[segment]; }
  }
  return typeof current === "number" && Number.isFinite(current);
}
function setBindingValue(value: unknown, binding: readonly (string | number)[], replacement: JsonValue): boolean {
  let parent: unknown = value;
  for (const segment of binding.slice(0, -1)) {
    if (typeof segment === "number") { if (!Array.isArray(parent)) return false; parent = parent[segment]; }
    else { if (!isRecord(parent)) return false; parent = parent[segment]; }
  }
  const final = binding.at(-1);
  if (final === undefined || !bindingTargetsFiniteNumber(value as JsonValue, binding)) return false;
  if (typeof final === "number") { if (!Array.isArray(parent)) return false; parent[final] = replacement; }
  else { if (!isRecord(parent)) return false; parent[final] = replacement; }
  return true;
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
