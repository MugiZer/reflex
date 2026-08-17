import { createHash } from "node:crypto";

import { canonicalTopologyJson } from "../../domain/topology/canonicalTopologyJson.js";
import type { AgentAttempt, AgentAttemptRepository, AgentExecutionRequest, AgentExecutionResult, AgentProvider } from "../../domain/agent/agentProvider.js";

/** Coordinates execution and durable evidence only; it cannot mutate adapters, cycles, snapshots, or revisions. */
export async function executeAgentRoleAttempt(input: Readonly<{ provider: AgentProvider; attempts: AgentAttemptRepository; request: AgentExecutionRequest }>): Promise<AgentExecutionResult> {
  let result: AgentExecutionResult;
  try { result = await input.provider.execute(input.request); }
  catch (error) {
    result = { kind: "retryable_infrastructure_failure", reason: error instanceof Error ? error.message : "Agent provider failed.", attemptEvidence: { provider: "fixture", model: input.request.model, correlationId: input.request.correlationId, startedAt: new Date().toISOString(), durationMs: 0, outcome: "retryable_infrastructure_failure", safeUsage: null } };
  }
  const attempt: AgentAttempt = Object.freeze({ schema: "agent-attempt/v1", attemptId: sha256(canonicalTopologyJson({ role: input.request.role, correlationId: input.request.correlationId, startedAt: result.attemptEvidence.startedAt, outcome: result.kind })), role: input.request.role, promptVersion: input.request.promptVersion, canonicalEvidenceReferences: Object.freeze([...input.request.canonicalEvidenceReferences]), outputSchemaSha256: sha256(canonicalTopologyJson(input.request.outputSchema as never)), result: Object.freeze({ ...result.attemptEvidence, safeUsage: result.attemptEvidence.safeUsage ? Object.freeze({ ...result.attemptEvidence.safeUsage }) : null }) });
  await input.attempts.append(attempt);
  return result;
}

function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
