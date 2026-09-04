import type { TopologyScenarioPlan } from "./componentKnowledgeBase.js";
import { createComponentKnowledgeBase, resolveTopologyScenarioPlan } from "./componentKnowledgeBase.js";
import { canonicalTopologyJson } from "./canonicalTopologyJson.js";
import type { JsonValue } from "./topologyTypes.js";

export type ComponentPattern = Readonly<{
  patternId: string;
  version: string;
  /** Content identity when this promoted pattern is backed by a generated adapter. */
  adapterHash?: string;
  lifecycle: "draft" | "candidate" | "promoted" | "rejected";
  promotedAt?: string;
  recognition: Readonly<{ profileKinds: readonly string[]; materialTokens: readonly string[] }>;
  requiredAuthorities: readonly string[];
  permittedUnknowns: readonly { key: string; values: readonly number[]; label: string; binding: readonly (string | number)[] }[];
  maxScenarioCount: number;
  immaterialityGateWPerM2K: number;
  recipeTemplate: JsonValue;
}>;

export type ComponentPatternEvidence = Readonly<{
  evidenceSignature: string;
  profileKind: string;
  materialLabel: string;
  values: Readonly<Record<string, JsonValue | "i-dont-know">>;
  authoritativeKeys: readonly string[];
  conflictingKeys: readonly string[];
}>;

export type ComponentPatternInterpretation =
  | Readonly<{ outcome: "matched"; patternId: string; patternVersion: string; reasons: readonly string[]; plan: TopologyScenarioPlan }>
  | Readonly<{ outcome: "ambiguous"; candidates: readonly { patternId: string; version: string; reasons: readonly string[] }[] }>
  | Readonly<{ outcome: "unmatched"; evidenceSignature: string }>
  | Readonly<{ outcome: "blocked"; missingKey: string; requiredAuthority: string }>
  | Readonly<{ outcome: "rejected"; diagnostic: string }>;

export function interpretComponentPattern(command: { evidence: ComponentPatternEvidence; patterns: readonly ComponentPattern[] }): ComponentPatternInterpretation {
  const candidates = command.patterns.filter((pattern) => pattern.lifecycle === "promoted" && pattern.recognition.profileKinds.includes(command.evidence.profileKind.toLowerCase()) && pattern.recognition.materialTokens.some((token) => command.evidence.materialLabel.toLowerCase().includes(token.toLowerCase())));
  if (!candidates.length) return { outcome: "unmatched", evidenceSignature: command.evidence.evidenceSignature };
  if (candidates.length > 1) return { outcome: "ambiguous", candidates: candidates.map((item) => ({ patternId: item.patternId, version: item.version, reasons: ["equally-ranked declarative recognition"] })) };
  const pattern = candidates[0]!;
  const conflict = command.evidence.conflictingKeys[0];
  if (conflict) return { outcome: "rejected", diagnostic: `conflicting_signal:${conflict}` };
  const missing = pattern.requiredAuthorities.find((key) => !command.evidence.authoritativeKeys.includes(key));
  if (missing) return { outcome: "blocked", missingKey: missing, requiredAuthority: "authoritative" };
  let recipe: JsonValue = JSON.parse(canonicalTopologyJson(pattern.recipeTemplate)) as JsonValue;
  const unknownKeys: string[] = [];
  for (const definition of pattern.permittedUnknowns) {
    const value = command.evidence.values[definition.key];
    if (value === "i-dont-know") unknownKeys.push(definition.key);
    else if (typeof value === "number") {
      const min = Math.min(...definition.values), max = Math.max(...definition.values);
      if (!Number.isFinite(value) || value < min || value > max) return { outcome: "rejected", diagnostic: `out_of_range:${definition.key}` };
      if (!setScalar(recipe, definition.binding, value)) return { outcome: "rejected", diagnostic: `invalid_binding:${definition.key}` };
    }
  }
  let pack;
  try {
    pack = createComponentKnowledgeBase({ packId: pattern.patternId, version: pattern.version, lifecycle: pattern.lifecycle, supportedUnknowns: pattern.permittedUnknowns, immaterialityGateWPerM2K: pattern.immaterialityGateWPerM2K, maxScenarioCount: pattern.maxScenarioCount });
  } catch {
    return { outcome: "rejected", diagnostic: "invalid_pattern_contract" };
  }
  const planned = resolveTopologyScenarioPlan({ pack, recipe, unknownKeys });
  if (planned.outcome !== "ready") return planned.outcome === "blocked" ? { outcome: "blocked", missingKey: planned.reason, requiredAuthority: "pattern" } : { outcome: "rejected", diagnostic: planned.reason };
  return { outcome: "matched", patternId: pattern.patternId, patternVersion: pattern.version, reasons: ["promoted declarative recognition", `evidence:${command.evidence.evidenceSignature}`], plan: planned.plan };
}

function setScalar(root: JsonValue, binding: readonly (string | number)[], value: number): boolean {
  if (!binding.length || binding.some((part) => typeof part === "string" && (part === "__proto__" || part === "prototype" || part === "constructor"))) return false;
  let parent: unknown = root;
  for (const part of binding.slice(0, -1)) parent = typeof part === "number" ? Array.isArray(parent) ? parent[part] : undefined : isRecord(parent) ? parent[part] : undefined;
  const last = binding.at(-1);
  if (last === undefined) return false;
  if (typeof last === "number") { if (!Array.isArray(parent) || typeof parent[last] !== "number") return false; parent[last] = value; }
  else { if (!isRecord(parent) || typeof parent[last] !== "number") return false; parent[last] = value; }
  return true;
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
