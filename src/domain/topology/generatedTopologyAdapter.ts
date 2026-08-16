import { createHash } from "node:crypto";

import { canonicalTopologyJson } from "./canonicalTopologyJson.js";
import type { JsonValue, TopologyBundleIdentity } from "./topologyTypes.js";

export const GENERATED_TOPOLOGY_ADAPTER_SCHEMA = "generated-topology-adapter/v1" as const;

export type AdapterBounds = Readonly<{ minimum?: number; maximum?: number; allowedValues?: readonly (string | number | boolean)[] }>;
export type GeneratedTopologyAdapter = Readonly<{
  schema: typeof GENERATED_TOPOLOGY_ADAPTER_SCHEMA;
  family: Readonly<{ familyId: string; familyVersion: string; topologyModule: Readonly<{ id: string; version: string }>; primitive: Readonly<{ kind: string; version: string }>; materialIdentity: string; placementMode: string; profileKind: string; requiredCharacteristics: Readonly<Record<string, string | number | boolean>> }>;
  recognition: Readonly<{ profileKinds: readonly string[]; materialTokens: readonly string[] }>;
  requiredAuthorities: readonly string[];
  recipeTemplate: JsonValue;
  parameterBindings: readonly Readonly<{ key: string; binding: readonly (string | number)[]; bounds: AdapterBounds }> [];
  permittedUnknowns: readonly string[];
  validationEnvelope: Readonly<Record<string, AdapterBounds>>;
  provenance: Readonly<{ datasetId: string; datasetVersion: string; datasetHash: string; sourceCitation: string }>;
  /** Case identity and inputs only; expected values belong to the independent oracle. */
  qualificationCases: Readonly<{ reference: Readonly<{ caseId: string; parameters: Readonly<Record<string, number>> }>; sensitivity: Readonly<{ caseId: string; parameters: Readonly<Record<string, number>>; direction: "increases" | "decreases" }> }>;
  dependencies: Readonly<{ compilerVersion: string; primitiveRegistryHash: string; materialPackHash: string; runtimeHash: string; boundaryVersion: string }>;
}>;

export type AdapterQualificationGate = Readonly<{
  gateId: "P3-contract-geometry" | "P6-worker" | "P3-independent-reference" | "P6-envelope-sensitivity";
  selectedCases: readonly string[];
  passedCases: readonly string[];
  failedCases: readonly string[];
  unexecutedCases: readonly string[];
  fixtureIdentity: string;
  oracleIdentity: string | null;
  adapterHash: string;
  dependencyIdentities: GeneratedTopologyAdapter["dependencies"];
  command: string;
  durationMs: number;
  testedRevision: string;
}>;

export type GeneratedTopologyQualificationReceipt = Readonly<{
  schema: "generated-topology-adapter-qualification-receipt/v1";
  decision: "GO" | "NO-GO";
  adapterHash: string;
  recipeHash: string | null;
  worker: Readonly<{ executable: string; runtimeHash: string }>;
  compilerVersion: string;
  primitiveRegistryHash: string;
  materialPackHash: string;
  boundaryVersion: string;
  gates: readonly AdapterQualificationGate[];
  qualifiedAt: string;
}>;

/** Stable semantic identity for data-only adapters; formatting and member order never participate. */
export function generatedTopologyAdapterHash(adapter: GeneratedTopologyAdapter): string {
  assertGeneratedTopologyAdapter(adapter);
  return sha256(canonicalTopologyJson(adapter));
}

/** Validates the closed data contract. There is deliberately no executable, command, or module field. */
export function assertGeneratedTopologyAdapter(value: unknown): asserts value is GeneratedTopologyAdapter {
  if (!isRecord(value) || !exactKeys(value, ["schema", "family", "recognition", "requiredAuthorities", "recipeTemplate", "parameterBindings", "permittedUnknowns", "validationEnvelope", "provenance", "qualificationCases", "dependencies"]) || value.schema !== GENERATED_TOPOLOGY_ADAPTER_SCHEMA) throw new Error("Generated topology adapter must use the strict v1 data contract.");
  const adapter = value as GeneratedTopologyAdapter;
  const invalid = [!isJson(adapter.recipeTemplate) && "recipe", containsExecutableField(adapter.recipeTemplate) && "executable-recipe-field", !isFamily(adapter.family) && "family", !isRecognition(adapter.recognition) && "recognition", !stringList(adapter.requiredAuthorities) && "authorities", !stringList(adapter.permittedUnknowns, true) && "unknowns", !isBindings(adapter.parameterBindings) && "bindings", !isBoundsRecord(adapter.validationEnvelope) && "envelope", !isProvenance(adapter.provenance) && "provenance", !isCases(adapter.qualificationCases) && "cases", !isDependencies(adapter.dependencies) && "dependencies"].filter(Boolean);
  if (invalid.length) throw new Error(`Generated topology adapter contains invalid or undeclared data: ${invalid.join(", ")}.`);
  if (new Set(adapter.parameterBindings.map((item) => item.key)).size !== adapter.parameterBindings.length) throw new Error("Generated topology adapter parameter bindings must be unique.");
  for (const binding of adapter.parameterBindings) if (!(binding.key in adapter.validationEnvelope) || !validBinding(binding.binding) || !validBounds(binding.bounds) || !bindingTargetsFiniteNumber(adapter.recipeTemplate, binding.binding)) throw new Error(`Generated topology adapter has an invalid binding: ${binding.key}.`);
  const bindingKeys = adapter.parameterBindings.map((item) => item.key).sort();
  if (canonicalTopologyJson(Object.keys(adapter.qualificationCases.reference.parameters).sort()) !== canonicalTopologyJson(bindingKeys) || canonicalTopologyJson(Object.keys(adapter.qualificationCases.sensitivity.parameters).sort()) !== canonicalTopologyJson(bindingKeys)) throw new Error("Qualification case parameters must bind exactly the declared Recipe parameters.");
  if (!isRecipeShape(adapter.recipeTemplate, adapter.family.topologyModule)) throw new Error("Generated topology adapter Recipe template is not a production Recipe shape.");
}

export function adapterDependenciesMatchBundle(adapter: GeneratedTopologyAdapter, bundle: TopologyBundleIdentity): boolean {
  return adapter.family.topologyModule.id === bundle.moduleId && adapter.family.topologyModule.version === bundle.moduleVersion && adapter.dependencies.compilerVersion === bundle.moduleVersion && adapter.dependencies.primitiveRegistryHash === bundle.registryHash && adapter.dependencies.materialPackHash === bundle.packHash && adapter.dependencies.runtimeHash === bundle.runtimeHash;
}

export function bindGeneratedTopologyRecipe(adapter: GeneratedTopologyAdapter, parameters: Readonly<Record<string, number>>): JsonValue {
  assertGeneratedTopologyAdapter(adapter);
  const copy = JSON.parse(canonicalTopologyJson(adapter.recipeTemplate)) as JsonValue;
  for (const binding of adapter.parameterBindings) {
    const value = parameters[binding.key];
    if (!Number.isFinite(value) || !within(value, binding.bounds) || !within(value, adapter.validationEnvelope[binding.key]!)) throw new Error(`Parameter '${binding.key}' is outside the Validation Envelope.`);
    if (!setNumber(copy, binding.binding, value)) throw new Error(`Parameter '${binding.key}' cannot be bound into the Recipe.`);
  }
  return copy;
}

function isFamily(value: unknown): boolean { return isRecord(value) && exactKeys(value, ["familyId", "familyVersion", "topologyModule", "primitive", "materialIdentity", "placementMode", "profileKind", "requiredCharacteristics"]) && strings(value.familyId, value.familyVersion, value.materialIdentity, value.placementMode, value.profileKind) && isRecord(value.topologyModule) && exactKeys(value.topologyModule, ["id", "version"]) && strings(value.topologyModule.id, value.topologyModule.version) && isRecord(value.primitive) && exactKeys(value.primitive, ["kind", "version"]) && strings(value.primitive.kind, value.primitive.version) && scalarRecord(value.requiredCharacteristics); }
function isRecognition(value: unknown): boolean { return isRecord(value) && exactKeys(value, ["profileKinds", "materialTokens"]) && stringList(value.profileKinds) && stringList(value.materialTokens); }
function isBindings(value: unknown): boolean { return Array.isArray(value) && value.every((item) => isRecord(item) && exactKeys(item, ["key", "binding", "bounds"]) && typeof item.key === "string" && validBinding(item.binding) && validBounds(item.bounds)); }
function isBoundsRecord(value: unknown): boolean { return isRecord(value) && Object.keys(value).length > 0 && Object.values(value).every(validBounds); }
function isProvenance(value: unknown): boolean { return isRecord(value) && exactKeys(value, ["datasetId", "datasetVersion", "datasetHash", "sourceCitation"]) && strings(value.datasetId, value.datasetVersion, value.datasetHash, value.sourceCitation) && /^[a-f0-9]{64}$/.test(value.datasetHash); }
function isCases(value: unknown): boolean { return isRecord(value) && exactKeys(value, ["reference", "sensitivity"]) && isRecord(value.reference) && exactKeys(value.reference, ["caseId", "parameters"]) && typeof value.reference.caseId === "string" && numberRecord(value.reference.parameters) && isRecord(value.sensitivity) && exactKeys(value.sensitivity, ["caseId", "parameters", "direction"]) && typeof value.sensitivity.caseId === "string" && numberRecord(value.sensitivity.parameters) && (value.sensitivity.direction === "increases" || value.sensitivity.direction === "decreases"); }
function isDependencies(value: unknown): boolean { return isRecord(value) && exactKeys(value, ["compilerVersion", "primitiveRegistryHash", "materialPackHash", "runtimeHash", "boundaryVersion"]) && strings(value.compilerVersion, value.primitiveRegistryHash, value.materialPackHash, value.runtimeHash, value.boundaryVersion) && [value.primitiveRegistryHash, value.materialPackHash, value.runtimeHash].every((item) => /^[a-f0-9]{64}$/.test(item)); }
function isRecipeShape(value: JsonValue, module: { id: string; version: string }): boolean {
  if (!isRecord(value) || !exactKeys(value as Record<string, unknown>, ["schemaVersion", "topologyModule", "periodicity", "projectedArea", "layers", "rows", "cavities", "thermalBreaks", "boundaries"])) return false;
  const recipe = value as Record<string, unknown>;
  if (recipe.schemaVersion !== "1.0.0-draft" || !isRecord(recipe.topologyModule) || !exactKeys(recipe.topologyModule, ["id", "version"]) || recipe.topologyModule.id !== module.id || recipe.topologyModule.version !== module.version) return false;
  if (!authoredNumber(recipe.periodicity, true) || !authoredNumber(recipe.projectedArea, true)) return false;
  if (!Array.isArray(recipe.layers) || recipe.layers.length === 0 || !recipe.layers.every(isLayer)) return false;
  if (!Array.isArray(recipe.rows) || recipe.rows.length < 1 || recipe.rows.length > 2 || !recipe.rows.every(isRow)) return false;
  if (!Array.isArray(recipe.cavities) || !recipe.cavities.every(isRecord) || !Array.isArray(recipe.thermalBreaks) || !recipe.thermalBreaks.every(isRecord)) return false;
  if (!isRecord(recipe.boundaries) || !exactKeys(recipe.boundaries, ["exterior", "interior", "left", "right"]) || !authoredString(recipe.boundaries.exterior) || !authoredString(recipe.boundaries.interior) || recipe.boundaries.left !== "periodic" || recipe.boundaries.right !== "periodic") return false;
  return true;
}
function isLayer(value: unknown): boolean { return isRecord(value) && exactKeys(value, ["id", "thickness", "material"]) && strings(value.id) && authoredNumber(value.thickness, true) && authoredString(value.material); }
function isRow(value: unknown): boolean { return isRecord(value) && exactKeys(value, ["id", "offsetX", "originY", "member"]) && strings(value.id) && authoredNumber(value.offsetX) && authoredNumber(value.originY) && isRecord(value.member) && exactKeys(value.member, ["primitive", "material"]) && authoredString(value.member.material) && isPrimitive(value.member.primitive); }
function isPrimitive(value: unknown): boolean { return isRecord(value) && exactKeys(value, ["kind", "version", "parameters"]) && strings(value.kind, value.version) && isRecord(value.parameters) && Object.keys(value.parameters).length > 0 && Object.values(value.parameters).every((item) => typeof item === "number" && Number.isFinite(item) && item > 0); }
function authoredNumber(value: unknown, positiveValue = false): boolean { return isRecord(value) && exactKeys(value, ["value", "authority"]) && (typeof value.value === "number" && Number.isFinite(value.value) && (!positiveValue || value.value > 0)) && isAuthority(value.authority); }
function authoredString(value: unknown): boolean { return isRecord(value) && exactKeys(value, ["value", "authority"]) && typeof value.value === "string" && value.value.trim() !== "" && isAuthority(value.authority); }
function isAuthority(value: unknown): boolean { return isRecord(value) && exactKeys(value, ["state", "sourceRefs", "reason"], true) && ["ifc-derived", "user-confirmed", "validated-default", "preliminary-estimate"].includes(String(value.state)) && Array.isArray(value.sourceRefs) && value.sourceRefs.every((item) => typeof item === "string" && item.trim() !== "") && (value.reason === undefined || typeof value.reason === "string"); }
function validBounds(value: unknown): value is AdapterBounds { return isRecord(value) && exactKeys(value, ["minimum", "maximum", "allowedValues"], true) && (value.minimum === undefined || Number.isFinite(value.minimum)) && (value.maximum === undefined || Number.isFinite(value.maximum)) && (value.allowedValues === undefined || Array.isArray(value.allowedValues) && value.allowedValues.every((item) => typeof item === "string" || typeof item === "number" || typeof item === "boolean")) && (value.minimum === undefined || value.maximum === undefined || value.minimum <= value.maximum); }
function within(value: number, bounds: AdapterBounds): boolean { return (bounds.minimum === undefined || value >= bounds.minimum) && (bounds.maximum === undefined || value <= bounds.maximum) && (bounds.allowedValues === undefined || bounds.allowedValues.includes(value)); }
function validBinding(value: unknown): value is readonly (string | number)[] { return Array.isArray(value) && value.length > 0 && value.every((part) => typeof part === "number" ? Number.isInteger(part) && part >= 0 : typeof part === "string" && part.length > 0 && !["__proto__", "prototype", "constructor"].includes(part)); }
function bindingTargetsFiniteNumber(value: JsonValue, binding: readonly (string | number)[]): boolean { let cursor: unknown = value; for (const part of binding) cursor = typeof part === "number" ? Array.isArray(cursor) ? cursor[part] : undefined : isRecord(cursor) ? cursor[part] : undefined; return Number.isFinite(cursor); }
function setNumber(value: JsonValue, binding: readonly (string | number)[], replacement: number): boolean { let parent: unknown = value; for (const part of binding.slice(0, -1)) parent = typeof part === "number" ? Array.isArray(parent) ? parent[part] : undefined : isRecord(parent) ? parent[part] : undefined; const last = binding.at(-1); if (last === undefined || !bindingTargetsFiniteNumber(value, binding)) return false; if (typeof last === "number") { if (!Array.isArray(parent)) return false; parent[last] = replacement; } else { if (!isRecord(parent)) return false; parent[last] = replacement; } return true; }
function isJson(value: unknown): value is JsonValue { return value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value) || Array.isArray(value) && value.every(isJson) || isRecord(value) && Object.values(value).every(isJson); }
function containsExecutableField(value: JsonValue): boolean { return Array.isArray(value) ? value.some(containsExecutableField) : isRecord(value) ? Object.entries(value).some(([key, child]) => ["command", "commands", "code", "source", "module", "modules", "import", "executable", "script"].includes(key.toLowerCase()) || containsExecutableField(child)) : false; }
function scalarRecord(value: unknown): boolean { return isRecord(value) && Object.keys(value).length > 0 && Object.values(value).every((item) => typeof item === "string" || typeof item === "number" && Number.isFinite(item) || typeof item === "boolean"); }
function numberRecord(value: unknown): boolean { return isRecord(value) && Object.keys(value).length > 0 && Object.values(value).every((item) => Number.isFinite(item)); }
function strings(...values: unknown[]): boolean { return values.every((value) => typeof value === "string" && value.trim() !== ""); }
function stringList(value: unknown, allowEmpty = false): boolean { return Array.isArray(value) && (allowEmpty || value.length > 0) && value.every((item) => typeof item === "string" && item.trim() !== ""); }
function positive(value: unknown): boolean { return typeof value === "number" && Number.isFinite(value) && value > 0; }
function exactKeys(value: Record<string, unknown>, keys: readonly string[], partial = false): boolean { const actual = Object.keys(value); return actual.every((key) => keys.includes(key)) && (partial || actual.length === keys.length) && (partial || keys.every((key) => key in value)); }
function isRecord(value: unknown): value is Record<string, any> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
