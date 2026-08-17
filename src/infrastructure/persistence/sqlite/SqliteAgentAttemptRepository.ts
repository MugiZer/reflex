import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { canonicalTopologyJson } from "../../../domain/topology/canonicalTopologyJson.js";
import type { AgentAttempt, AgentAttemptRepository } from "../../../domain/agent/agentProvider.js";

export class SqliteAgentAttemptRepository implements AgentAttemptRepository {
  private readonly db: DatabaseSync;
  constructor(path: string) { mkdirSync(dirname(path), { recursive: true }); this.db = new DatabaseSync(path); this.db.exec("create table if not exists agent_attempts (attempt_id text primary key, correlation_id text not null, payload_json text not null, payload_sha256 text not null)"); }
  async append(attempt: AgentAttempt): Promise<void> {
    const payload = canonicalTopologyJson(attempt as never), hash = sha256(payload);
    this.db.prepare("insert or ignore into agent_attempts (attempt_id, correlation_id, payload_json, payload_sha256) values (?, ?, ?, ?)").run(attempt.attemptId, attempt.result.correlationId, payload, hash);
    const stored = this.db.prepare("select payload_json, payload_sha256 from agent_attempts where attempt_id = ?").get(attempt.attemptId) as { payload_json: string; payload_sha256: string } | undefined;
    if (!stored || stored.payload_sha256 !== hash || stored.payload_json !== payload) throw new Error("Immutable agent attempt identity conflict.");
  }
  async listByCorrelationId(correlationId: string): Promise<readonly AgentAttempt[]> {
    const rows = this.db.prepare("select payload_json, payload_sha256 from agent_attempts where correlation_id = ? order by attempt_id").all(correlationId) as Array<{ payload_json: string; payload_sha256: string }>;
    return rows.map((row) => { if (sha256(row.payload_json) !== row.payload_sha256) throw new Error("Persisted agent attempt is corrupt."); return JSON.parse(row.payload_json) as AgentAttempt; });
  }
  close(): void { this.db.close(); }
}
function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
