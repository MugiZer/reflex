import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { executeAgentRoleAttempt } from "../src/application/agent/executeAgentRoleAttempt.js";
import type { AgentExecutionRequest, AgentProvider } from "../src/domain/agent/agentProvider.js";
import { SqliteAgentAttemptRepository } from "../src/infrastructure/persistence/sqlite/SqliteAgentAttemptRepository.js";

const request: AgentExecutionRequest = { role: "fit", prompt: "private IFC payload", promptVersion: "fit/v1", canonicalEvidenceReferences: ["evidence:one"], outputSchema: { type: "object" }, model: "fixture", deadline: new Date(Date.now() + 1_000), correlationId: "attempt-correlation" };

describe("durable agent attempts", () => {
  it("persists sanitized immutable provider outcomes without changing protected state", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-attempt-"));
    const attempts = new SqliteAgentAttemptRepository(join(root, "attempts.sqlite"));
    const provider: AgentProvider = { execute: async () => ({ kind: "retryable_infrastructure_failure", reason: "network unavailable", attemptEvidence: { provider: "fixture", model: "fixture", correlationId: "attempt-correlation", startedAt: "2026-08-17T00:00:00.000Z", durationMs: 12, outcome: "retryable_infrastructure_failure", safeUsage: null } }) };
    await expect(executeAgentRoleAttempt({ provider, attempts, request })).resolves.toMatchObject({ kind: "retryable_infrastructure_failure" });
    const persisted = await attempts.listByCorrelationId("attempt-correlation");
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({ role: "fit", promptVersion: "fit/v1", canonicalEvidenceReferences: ["evidence:one"], result: { outcome: "retryable_infrastructure_failure" } });
    expect(JSON.stringify(persisted)).not.toContain("private IFC payload");
    attempts.close();
  });
});
