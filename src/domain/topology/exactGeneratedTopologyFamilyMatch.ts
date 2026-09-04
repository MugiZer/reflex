import { createHash } from "node:crypto";

import { canonicalTopologyJson } from "./canonicalTopologyJson.js";
import { adapterDependenciesMatchBundle, assertGeneratedTopologyAdapter, bindGeneratedTopologyRecipe, type GeneratedTopologyAdapter } from "./generatedTopologyAdapter.js";
import type { GeneratedTopologyAdapterRegistry } from "./generatedTopologyAdapterRegistry.js";
import type { JsonValue, TopologyBundleIdentity } from "./topologyTypes.js";

export type CanonicalComponentFamilyEvidence = Readonly<{
  topologyModule: Readonly<{ id: string; version: string }>;
  primitive: Readonly<{ kind: string; version: string }>;
  materialIdentity: string;
  placementMode: string;
  profileKind: string;
  requiredCharacteristics: Readonly<Record<string, string | number | boolean>>;
}>;

/** The single identity authority for reusable, wall-independent component families. */
export function componentFamilySignature(evidence: CanonicalComponentFamilyEvidence): string {
  const canonical: CanonicalComponentFamilyEvidence = {
    topologyModule: { id: evidence.topologyModule.id, version: evidence.topologyModule.version },
    primitive: { kind: evidence.primitive.kind, version: evidence.primitive.version },
    materialIdentity: evidence.materialIdentity,
    placementMode: evidence.placementMode,
    profileKind: evidence.profileKind,
    requiredCharacteristics: Object.fromEntries(Object.entries(evidence.requiredCharacteristics).sort(([left], [right]) => left.localeCompare(right))),
  };
  return sha256(canonicalTopologyJson(canonical as unknown as JsonValue));
}

export function canonicalComponentFamilyEvidence(command: { answers: Readonly<Record<string, JsonValue>>; bundle: TopologyBundleIdentity }): CanonicalComponentFamilyEvidence | null {
  const profileKind = normalize(command.answers.memberKind);
  const materialIdentity = normalize(command.answers.memberMaterial);
  if (!profileKind || !materialIdentity || command.answers.continuousThroughLayers !== true) return null;
  const primitiveKind = profileKind === "c" || profileKind === "z" ? `standard.${profileKind}` : "";
  if (!primitiveKind) return null;
  return Object.freeze({
    topologyModule: { id: command.bundle.moduleId, version: command.bundle.moduleVersion },
    primitive: { kind: primitiveKind, version: "1.0.0" },
    materialIdentity,
    placementMode: "continuous-profile",
    profileKind,
    requiredCharacteristics: {
      orientation: "parallel",
      steel: materialIdentity.includes("steel"),
    },
  });
}

/**
 * Reuses only an exact, contract-valid generated family. Any incomplete,
 * outside-envelope, or dependency-incompatible candidate deliberately returns
 * null so callers continue through their non-exact route without publication.
 */
export function findExactGeneratedTopologyFamilyMatch(command: {
  answers: Readonly<Record<string, JsonValue>>;
  bundle: TopologyBundleIdentity;
  registry: GeneratedTopologyAdapterRegistry;
}): Readonly<{ adapter: GeneratedTopologyAdapter; familySignature: string; recipe: JsonValue }> | null {
  const evidence = canonicalComponentFamilyEvidence(command);
  if (!evidence) return null;
  const signature = componentFamilySignature(evidence);
  const candidates = command.registry.available().filter((adapter) => {
    try {
      return componentFamilySignature(adapter.family) === signature;
    } catch {
      return false;
    }
  });
  if (candidates.length !== 1) return null;
  const adapter = candidates[0]!;
  try {
    assertGeneratedTopologyAdapter(adapter);
    if (!adapterDependenciesMatchBundle(adapter, command.bundle)) return null;
    if (adapter.dependencies.boundaryVersion !== "component-evaluation/v1") return null;
    if (adapter.requiredAuthorities.some((key) => !authoritative(key, command.answers))) return null;
    const parameters = Object.fromEntries(adapter.parameterBindings.map((binding) => {
      const value = command.answers[binding.key];
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Missing exact parameter: ${binding.key}`);
      return [binding.key, value];
    }));
    return Object.freeze({ adapter, familySignature: signature, recipe: bindGeneratedTopologyRecipe(adapter, parameters) });
  } catch {
    return null;
  }
}

function authoritative(key: string, answers: Readonly<Record<string, JsonValue>>): boolean {
  if (key === "profileKind") return typeof answers.memberKind === "string" && answers.memberKind.trim() !== "" && answers.memberKindAuthority !== "missing";
  if (key === "memberMaterial") return typeof answers.memberMaterial === "string" && answers.memberMaterial.trim() !== "" && answers.memberMaterialAuthority !== "missing";
  return false;
}
function normalize(value: JsonValue | undefined): string {
  return typeof value === "string" ? value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") : "";
}
function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
