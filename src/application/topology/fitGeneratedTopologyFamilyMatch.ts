import { adapterDependenciesMatchBundle, assertGeneratedTopologyAdapter, bindGeneratedTopologyRecipe, generatedTopologyAdapterHash, type GeneratedTopologyAdapter } from "../../domain/topology/generatedTopologyAdapter.js";
import { canonicalComponentFamilyEvidence, componentFamilySignature } from "../../domain/topology/exactGeneratedTopologyFamilyMatch.js";
import type { GeneratedTopologyAdapterRegistry } from "../../domain/topology/generatedTopologyAdapterRegistry.js";
import type { JsonValue, TopologyBundleIdentity } from "../../domain/topology/topologyTypes.js";
import { executeAgentRoleAttempt } from "../agent/executeAgentRoleAttempt.js";
import type { AgentAttemptRepository, AgentProvider } from "../../domain/agent/agentProvider.js";

export type FitCandidateContract = Readonly<{
  identity: string;
  family: GeneratedTopologyAdapter["family"];
  requiredAuthorities: readonly string[];
  validationEnvelope: GeneratedTopologyAdapter["validationEnvelope"];
  dependencies: GeneratedTopologyAdapter["dependencies"];
  safeProvenanceReference: string;
}>;

export type AmbiguousFamilyFitAgent = Readonly<{ provider: AgentProvider; attempts: AgentAttemptRepository; model: string; skillVersion: string }>;

/**
 * Candidate discovery is deliberately conservative.  It does not choose a
 * family: it only exposes established promoted contracts when exact matching
 * found more than one plausible family.
 */
export function fitCandidateContracts(command: { answers: Readonly<Record<string, JsonValue>>; bundle: TopologyBundleIdentity; registry: GeneratedTopologyAdapterRegistry }): readonly FitCandidateContract[] {
  const evidence = canonicalComponentFamilyEvidence(command);
  if (!evidence) return [];
  const signature = componentFamilySignature(evidence);
  const candidates = command.registry.available().flatMap((adapter) => {
    try {
      assertGeneratedTopologyAdapter(adapter);
      if (!adapterDependenciesMatchBundle(adapter, command.bundle) || adapter.dependencies.boundaryVersion !== "component-evaluation/v1") return [];
      if (componentFamilySignature(adapter.family) !== signature) return [];
      if (!adapter.requiredAuthorities.every((key) => authoritative(key, command.answers))) return [];
      return [{ identity: generatedTopologyAdapterHash(adapter), family: adapter.family, requiredAuthorities: Object.freeze([...adapter.requiredAuthorities]), validationEnvelope: adapter.validationEnvelope, dependencies: adapter.dependencies, safeProvenanceReference: `${adapter.provenance.datasetId}@${adapter.provenance.datasetVersion}:${adapter.provenance.datasetHash}` }];
    } catch { return []; }
  });
  return Object.freeze(candidates.sort((left, right) => left.identity.localeCompare(right.identity)));
}

/** Fixed code repeats every authorization gate after a fit recommendation. */
export function authorizeFitGeneratedTopologyFamilyMatch(command: { answers: Readonly<Record<string, JsonValue>>; bundle: TopologyBundleIdentity; registry: GeneratedTopologyAdapterRegistry; candidateIdentity: string }): Readonly<{ adapter: GeneratedTopologyAdapter; familySignature: string; recipe: JsonValue }> | null {
  const candidates = fitCandidateContracts(command);
  if (!candidates.some((candidate) => candidate.identity === command.candidateIdentity)) return null;
  const adapter = command.registry.available().find((item) => {
    try { return generatedTopologyAdapterHash(item) === command.candidateIdentity; } catch { return false; }
  });
  if (!adapter) return null;
  try {
    assertGeneratedTopologyAdapter(adapter);
    if (!adapterDependenciesMatchBundle(adapter, command.bundle) || adapter.dependencies.boundaryVersion !== "component-evaluation/v1" || !adapter.requiredAuthorities.every((key) => authoritative(key, command.answers))) return null;
    const parameters = Object.fromEntries(adapter.parameterBindings.map((binding) => {
      const value = command.answers[binding.key];
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("missing parameter");
      return [binding.key, value];
    }));
    return Object.freeze({ adapter, familySignature: componentFamilySignature(adapter.family), recipe: bindGeneratedTopologyRecipe(adapter, parameters) });
  } catch { return null; }
}

/** The fit provider may recommend one candidate, never authorize it. */
export async function attemptAmbiguousGeneratedTopologyFamilyFit(command: { answers: Readonly<Record<string, JsonValue>>; bundle: TopologyBundleIdentity; registry: GeneratedTopologyAdapterRegistry; agent: AmbiguousFamilyFitAgent; canonicalEvidenceReference: string; correlationId: string; deadline: Date; signal?: AbortSignal }): Promise<Readonly<{ adapter: GeneratedTopologyAdapter; familySignature: string; recipe: JsonValue }> | null> {
  const candidates = fitCandidateContracts(command);
  // An exact candidate is handled before this branch; no candidate, or only one
  // non-authorizable candidate, continues to generation without an agent call.
  if (candidates.length < 2) return null;
  const evidence = canonicalComponentFamilyEvidence(command);
  if (!evidence) return null;
  const request = {
    role: "fit" as const,
    prompt: JSON.stringify({ canonicalEvidence: evidence, canonicalEvidenceReference: command.canonicalEvidenceReference, candidates, requiredAuthorities: candidates[0]!.requiredAuthorities, fitSkillVersion: command.agent.skillVersion }),
    promptVersion: command.agent.skillVersion,
    canonicalEvidenceReferences: [command.canonicalEvidenceReference],
    outputSchema: FIT_OUTPUT_SCHEMA,
    model: command.agent.model,
    deadline: command.deadline,
    signal: command.signal,
    correlationId: command.correlationId,
  };
  const result = await executeAgentRoleAttempt({ provider: command.agent.provider, attempts: command.agent.attempts, request });
  if (result.kind !== "completed" || !isFitResponse(result.output, candidates)) return null;
  if (result.output.confidence !== "high") return null;
  return authorizeFitGeneratedTopologyFamilyMatch({ ...command, candidateIdentity: result.output.candidateIdentity });
}

const FIT_OUTPUT_SCHEMA = Object.freeze({ type: "object", additionalProperties: false, required: ["candidateIdentity", "confidence", "comparison", "reasons"], properties: { candidateIdentity: { type: "string" }, confidence: { type: "string", enum: ["high", "low"] }, comparison: { type: "array" }, reasons: { type: "array" } } });
function isFitResponse(value: unknown, candidates: readonly FitCandidateContract[]): value is { candidateIdentity: string; confidence: "high" | "low"; comparison: readonly unknown[]; reasons: readonly string[] } {
  if (!isRecord(value) || Object.keys(value).length !== 4 || typeof value.candidateIdentity !== "string" || (value.confidence !== "high" && value.confidence !== "low") || !Array.isArray(value.comparison) || !Array.isArray(value.reasons) || !value.reasons.every((reason) => typeof reason === "string")) return false;
  return candidates.some((candidate) => candidate.identity === value.candidateIdentity);
}

function authoritative(key: string, answers: Readonly<Record<string, JsonValue>>): boolean {
  if (key === "profileKind") return typeof answers.memberKind === "string" && answers.memberKind.trim() !== "" && answers.memberKindAuthority !== "missing";
  if (key === "memberMaterial") return typeof answers.memberMaterial === "string" && answers.memberMaterial.trim() !== "" && answers.memberMaterialAuthority !== "missing";
  return false;
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
