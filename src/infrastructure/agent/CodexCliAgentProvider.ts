import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { conformsToJsonSchema, type AgentAttemptEvidence, type AgentExecutionRequest, type AgentExecutionResult, type AgentProvider } from "../../domain/agent/agentProvider.js";

export type CodexCliAgentProviderOptions = Readonly<{ executable?: string; model?: string }>;

/** Development/test provider. It is deliberately never selected by production configuration. */
export class CodexCliAgentProvider implements AgentProvider {
  constructor(private readonly options: CodexCliAgentProviderOptions) {}

  async execute(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    const model = this.options.model?.trim() || "configured-default";
    if (!request.workingDirectory?.trim()) return failure("authentication_or_configuration_failure", request, model, 0, "Codex requires an explicit working directory.");
    const started = Date.now();
    if (request.model !== model) return failure("authentication_or_configuration_failure", request, model, 0, "Requested model does not match the configured Codex model.");
    if (request.signal?.aborted) return { kind: "cancelled", attemptEvidence: { ...attempt(request, model, started, null, undefined, []), outcome: "cancelled" } };
    const executable = this.options.executable ?? "codex";
    let root: string | undefined;
    try {
      root = await mkdtemp(join(tmpdir(), "conformity-codex-agent-"));
      const schemaPath = join(root, "output-schema.json");
      const outputPath = join(root, "last-message.json");
      await writeFile(schemaPath, JSON.stringify(request.outputSchema), "utf8");
      const versionProbe = await run(executable, ["--version"], Math.max(0, request.deadline.getTime() - Date.now()), request.signal);
      if (versionProbe.cancelled) return { kind: "cancelled", attemptEvidence: { ...attempt(request, model, started, versionProbe.exitStatus, undefined, versionProbe.events), outcome: "cancelled" } };
      if (versionProbe.timedOut) return { kind: "timed_out", attemptEvidence: { ...attempt(request, model, started, versionProbe.exitStatus, undefined, versionProbe.events), outcome: "timed_out" } };
      const cliVersion = versionProbe.stdout.trim();
      const deadlineMs = Math.max(0, request.deadline.getTime() - Date.now());
      const modelArguments = this.options.model?.trim() ? ["--model", this.options.model.trim()] : [];
      const execution = await run(executable, ["exec", "--ephemeral", "--sandbox", "read-only", "--cd", request.workingDirectory, "--output-schema", schemaPath, "--output-last-message", outputPath, "--json", ...modelArguments, "--", request.prompt], deadlineMs, request.signal);
      const evidence = attempt(request, model, started, execution.exitStatus, cliVersion, execution.events);
      if (execution.cancelled) return { kind: "cancelled", attemptEvidence: { ...evidence, outcome: "cancelled" } };
      if (execution.timedOut) return { kind: "timed_out", attemptEvidence: { ...evidence, outcome: "timed_out" } };
      if (execution.exitStatus !== 0) return { kind: "terminal_provider_failure", reason: "Codex CLI exited unsuccessfully.", attemptEvidence: { ...evidence, outcome: "terminal_provider_failure" } };
      const content = await readFile(outputPath, "utf8").catch(() => "");
      let output: unknown;
      try { output = JSON.parse(content); } catch { return { kind: "schema_invalid", reason: "Codex final message was not JSON.", attemptEvidence: { ...evidence, outcome: "schema_invalid" } }; }
      if (!conformsToJsonSchema(output, request.outputSchema)) return { kind: "schema_invalid", reason: "Codex output does not conform to the requested JSON Schema.", attemptEvidence: { ...evidence, outcome: "schema_invalid" } };
      return { kind: "completed", output, attemptEvidence: { ...evidence, outcome: "completed" } };
    } catch (error) {
      const kind = request.signal?.aborted ? "cancelled" : "retryable_infrastructure_failure";
      return { kind, ...(kind === "retryable_infrastructure_failure" ? { reason: error instanceof Error ? error.message : "Codex CLI could not start." } : {}), attemptEvidence: { ...attempt(request, model, started, null, undefined, []), outcome: kind } } as AgentExecutionResult;
    } finally { if (root) await rm(root, { recursive: true, force: true }).catch(() => undefined); }
  }
}

function run(executable: string, args: readonly string[], deadlineMs: number, signal?: AbortSignal): Promise<{ exitStatus: number | null; stdout: string; events: readonly unknown[]; timedOut: boolean; cancelled: boolean }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let settled = false;
    let timedOut = false;
    let cancelled = false;
    const finish = (exitStatus: number | null) => { if (!settled) { settled = true; clearTimeout(timer); signal?.removeEventListener("abort", cancel); resolve({ exitStatus, stdout, events: parseEvents(stdout), timedOut, cancelled }); } };
    const stop = (reason: "timeout" | "cancelled") => { if (settled) return; timedOut ||= reason === "timeout"; cancelled ||= reason === "cancelled"; child.kill(); };
    const cancel = () => stop("cancelled");
    const timer = setTimeout(() => stop("timeout"), deadlineMs);
    signal?.addEventListener("abort", cancel, { once: true });
    child.stdout.on("data", (data: Buffer) => { stdout += data.toString("utf8"); });
    child.on("error", reject);
    child.on("close", finish);
  });
}
function attempt(request: AgentExecutionRequest, model: string, started: number, exitStatus: number | null, cliVersion: string | undefined, events: readonly unknown[]): AgentAttemptEvidence { return { provider: "codex", model, correlationId: request.correlationId, startedAt: new Date(started).toISOString(), durationMs: Math.max(0, Date.now() - started), outcome: "terminal_provider_failure", cliVersion, runtimeVersion: process.version, exitStatus, safeUsage: usage(events) }; }
function parseEvents(stdout: string): readonly unknown[] { return stdout.split(/\r?\n/).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } }); }
function usage(events: readonly unknown[]): AgentAttemptEvidence["safeUsage"] { for (const event of events) if (isRecord(event) && isRecord(event.usage) && typeof event.usage.input_tokens === "number") return { inputTokens: event.usage.input_tokens, ...(typeof event.usage.output_tokens === "number" ? { outputTokens: event.usage.output_tokens } : {}) }; return null; }
function failure(kind: "authentication_or_configuration_failure", request: AgentExecutionRequest, model: string, durationMs: number, reason: string): AgentExecutionResult { return { kind, reason, attemptEvidence: { provider: "codex", model, correlationId: request.correlationId, startedAt: new Date().toISOString(), durationMs, outcome: kind, safeUsage: null } }; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
