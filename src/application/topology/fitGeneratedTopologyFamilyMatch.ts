import { adapterDependenciesMatchBundle, assertGeneratedTopologyAdapter, bindGeneratedTopologyRecipe, generatedTopologyAdapterHash, type GeneratedTopologyAdapter } from "../../domain/topology/generatedTopologyAdapter.js";
import { canonicalComponentFamilyEvidence, componentFamilySignature } from "../../domain/topology/exactGeneratedTopologyFamilyMatch.js";
import type { GeneratedTopologyAdapterRegistry } from "../../domain/topology/generatedTopologyAdapterRegistry.js";
import type { JsonValue, TopologyBundleIdentity } from "../../domain/topology/topologyTypes.js";
import { executeAgentRoleAttempt } from "../agent/executeAgentRoleAttempt.js";
import type { AgentAttemptRepository, AgentProvider } from "../../domain/agent/agentProvider.js";
import { createHash } from "node:crypto";
import { canonicalTopologyJson } from "../../domain/topology/canonicalTopologyJson.js";

export type FitCandidateContract = Readonly<{
  identity: string;
  family: GeneratedTopologyAdapter["family"];
  requiredAuthorities: readonly string[];
  validationEnvelope: GeneratedTopologyAdapter["validationEnvelope"];
  dependencies: GeneratedTopologyAdapter["dependencies"];
  safeProvenanceReference: string;
}>;

export type FitDecisionGateResults = Readonly<{
  contract: boolean;
  envelope: boolean;
  recipe: boolean;
  dependencies: boolean;
  qualification: boolean;
}>;

export type FitAgentRetryPolicy = Readonly<{ maxAttempts: number; backoffMs?: number }>;

export const DEFAULT_FIT_AGENT_RETRY_POLICY: FitAgentRetryPolicy = Object.freeze({ maxAttempts: 2, backoffMs: 0 });

export type AmbiguousFamilyFitAgent = Readonly<{ provider: AgentProvider; attempts: AgentAttemptRepository; model: string; skillVersion: string; retry?: FitAgentRetryPolicy }>;

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
      const identity = generatedTopologyAdapterHash(adapter);
      const receipt = command.registry.qualification(identity);
      if (!adapterDependenciesMatchBundle(adapter, command.bundle) || adapter.dependencies.boundaryVersion !== "component-evaluation/v1" || !qualified(receipt, identity, adapter)) return [];
      if (componentFamilySignature(adapter.family) !== signature) return [];
      if (!adapter.requiredAuthorities.every((key) => authoritative(key, command.answers))) return [];
      return [{ identity, family: adapter.family, requiredAuthorities: Object.freeze([...adapter.requiredAuthorities]), validationEnvelope: adapter.validationEnvelope, dependencies: adapter.dependencies, safeProvenanceReference: `${adapter.provenance.datasetId}@${adapter.provenance.datasetVersion}:${adapter.provenance.datasetHash}` }];
    } catch { return []; }
  });
  return Object.freeze(candidates.sort((left, right) => left.identity.localeCompare(right.identity)));
}

/** Fixed code repeats every authorization gate after a fit recommendation. */
export function authorizeFitGeneratedTopologyFamilyMatch(command: { answers: Readonly<Record<string, JsonValue>>; bundle: TopologyBundleIdentity; registry: GeneratedTopologyAdapterRegistry; candidateIdentity: string }): Readonly<{ adapter: GeneratedTopologyAdapter; familySignature: string; recipe: JsonValue }> | null {
  return evaluateFitAuthorization(command).authorized;
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
  const retryPolicy = command.agent.retry ?? DEFAULT_FIT_AGENT_RETRY_POLICY;
  const maxAttempts = Math.max(1, Math.floor(retryPolicy.maxAttempts));
  let result = await executeAgentRoleAttempt({ provider: command.agent.provider, attempts: command.agent.attempts, request });
  for (let attempt = 1; attempt < maxAttempts && retryableProviderOutcome(result); attempt += 1) {
    if (!(await waitForRetry({ result, backoffMs: retryPolicy.backoffMs ?? 0, deadline: command.deadline, signal: command.signal }))) break;
    // Retries share one correlation so the durable repository exposes one fit
    // decision with all provider attempts, rather than correction cycles.
    result = await executeAgentRoleAttempt({ provider: command.agent.provider, attempts: command.agent.attempts, request });
  }
  const response = result.kind === "completed" && isFitResponse(result.output, candidates) ? result.output : null;
  const evaluation = response ? evaluateFitAuthorization({ ...command, candidateIdentity: response.candidateIdentity }) : { authorized: null, gates: EMPTY_FIT_DECISION_GATES };
  const authorized = response?.confidence === "high" ? evaluation.authorized : null;
  await appendFitDecisionAudit({ attempts: command.agent.attempts, result, canonicalSignature: componentFamilySignature(evidence), candidates, response, authorized, gates: evaluation.gates, skillVersion: command.agent.skillVersion });
  return authorized;
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
function qualified(receipt: import("../../domain/topology/generatedTopologyAdapter.js").GeneratedTopologyQualificationReceipt | null, adapterHash: string, adapter: GeneratedTopologyAdapter): boolean {
  return receipt !== null && receipt.decision === "GO" && receipt.adapterHash === adapterHash && receipt.boundaryVersion === adapter.dependencies.boundaryVersion && receipt.compilerVersion === adapter.dependencies.compilerVersion && receipt.primitiveRegistryHash === adapter.dependencies.primitiveRegistryHash && receipt.materialPackHash === adapter.dependencies.materialPackHash && receipt.worker.runtimeHash === adapter.dependencies.runtimeHash && receipt.gates.every((gate) => gate.adapterHash === adapterHash && gate.failedCases.length === 0 && gate.unexecutedCases.length === 0);
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
async function appendFitDecisionAudit(input: { attempts: AgentAttemptRepository; result: import("../../domain/agent/agentProvider.js").AgentExecutionResult; canonicalSignature: string; candidates: readonly FitCandidateContract[]; response: { candidateIdentity: string; confidence: "high" | "low"; comparison: readonly unknown[]; reasons: readonly string[] } | null; authorized: Readonly<{ adapter: GeneratedTopologyAdapter; familySignature: string; recipe: JsonValue }> | null; gates: FitDecisionGateResults; skillVersion: string }): Promise<void> {
  const finalDisposition = input.authorized ? "authorized" : (retryableProviderOutcome(input.result) ? "provider-failure" : "generation");
  const fitDecision = { canonicalSignature: input.canonicalSignature, candidateIdentities: Object.freeze(input.candidates.map((candidate) => candidate.identity)), structuredOutcome: { kind: input.result.kind, candidateIdentity: input.response?.candidateIdentity ?? null, confidence: input.response?.confidence ?? null, reasons: Object.freeze(input.response?.reasons ?? []) }, gates: input.gates, finalDisposition, skillVersion: input.skillVersion } as const;
  const attemptId = sha256(canonicalTopologyJson({ kind: "fit-decision-audit", correlationId: input.result.attemptEvidence.correlationId, startedAt: input.result.attemptEvidence.startedAt, fitDecision } as never));
  await input.attempts.append(Object.freeze({ schema: "agent-attempt/v1", attemptId, role: "fit", promptVersion: "fit-decision-audit/v1", canonicalEvidenceReferences: Object.freeze([]), outputSchemaSha256: sha256("fit-decision-audit/v1"), result: input.result.attemptEvidence, fitDecision }));
}
const EMPTY_FIT_DECISION_GATES: FitDecisionGateResults = Object.freeze({ contract: false, envelope: false, recipe: false, dependencies: false, qualification: false });
function retryableProviderOutcome(result: import("../../domain/agent/agentProvider.js").AgentExecutionResult): boolean { return result.kind === "retryable_infrastructure_failure" || result.kind === "rate_limited"; }
async function waitForRetry(input: { result: import("../../domain/agent/agentProvider.js").AgentExecutionResult; backoffMs: number; deadline: Date; signal?: AbortSignal }): Promise<boolean> {
  const providerDelay = input.result.kind === "rate_limited" ? input.result.retryAfterMs ?? 0 : 0;
  const requestedDelay = Math.max(0, input.backoffMs, providerDelay);
  const remaining = Math.max(0, input.deadline.getTime() - Date.now());
  const delay = Math.min(requestedDelay, remaining);
  if (remaining <= 0 || input.signal?.aborted) return false;
  if (delay <= 0) return true;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, delay);
    input.signal?.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
  });
  return !input.signal?.aborted && Date.now() < input.deadline.getTime();
}

function evaluateFitAuthorization(command: { answers: Readonly<Record<string, JsonValue>>; bundle: TopologyBundleIdentity; registry: GeneratedTopologyAdapterRegistry; candidateIdentity: string }): Readonly<{ authorized: Readonly<{ adapter: GeneratedTopologyAdapter; familySignature: string; recipe: JsonValue }> | null; gates: FitDecisionGateResults }> {
  let adapter: GeneratedTopologyAdapter | undefined;
  try { adapter = command.registry.available().find((item) => generatedTopologyAdapterHash(item) === command.candidateIdentity); } catch { return { authorized: null, gates: EMPTY_FIT_DECISION_GATES }; }
  if (!adapter) return { authorized: null, gates: EMPTY_FIT_DECISION_GATES };
  let contract = false;
  let envelope = false;
  let recipe = false;
  let dependencies = false;
  let qualification = false;
  try {
    assertGeneratedTopologyAdapter(adapter);
    const evidence = canonicalComponentFamilyEvidence(command);
    contract = evidence !== null && componentFamilySignature(adapter.family) === componentFamilySignature(evidence) && adapter.requiredAuthorities.every((key) => authoritative(key, command.answers));
    dependencies = adapterDependenciesMatchBundle(adapter, command.bundle) && adapter.dependencies.boundaryVersion === "component-evaluation/v1";
    qualification = qualified(command.registry.qualification(command.candidateIdentity), command.candidateIdentity, adapter);
    try { bindGeneratedTopologyRecipe(adapter, adapter.qualificationCases.reference.parameters); recipe = true; } catch { recipe = false; }
    const parameters = Object.fromEntries(adapter.parameterBindings.map((binding) => {
      const value = command.answers[binding.key];
      if (typeof value !== "number" || !Number.isFinite(value) || !within(value, binding.bounds) || !within(value, adapter!.validationEnvelope[binding.key]!)) throw new Error("parameter outside envelope");
      return [binding.key, value];
    }));
    envelope = true;
    if (!(contract && dependencies && qualification && recipe)) return { authorized: null, gates: Object.freeze({ contract, envelope, recipe, dependencies, qualification }) };
    return { authorized: Object.freeze({ adapter, familySignature: componentFamilySignature(adapter.family), recipe: bindGeneratedTopologyRecipe(adapter, parameters) }), gates: Object.freeze({ contract, envelope, recipe, dependencies, qualification }) };
  } catch {
    return { authorized: null, gates: Object.freeze({ contract, envelope, recipe, dependencies, qualification }) };
  }
}
function within(value: number, bounds: Readonly<{ minimum?: number; maximum?: number; allowedValues?: readonly (string | number | boolean)[] }>): boolean { return (bounds.minimum === undefined || value >= bounds.minimum) && (bounds.maximum === undefined || value <= bounds.maximum) && (bounds.allowedValues === undefined || bounds.allowedValues.includes(value)); }
function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
