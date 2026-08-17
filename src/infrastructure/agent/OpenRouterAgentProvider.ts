import { type AgentAttemptEvidence, type AgentExecutionRequest, type AgentExecutionResult, type AgentProvider } from "../../domain/agent/agentProvider.js";
import { validateAgentStructuredOutput } from "./validateAgentStructuredOutput.js";

export type OpenRouterAgentProviderOptions = Readonly<{
  apiKey: string;
  model: string;
  structuredOutputModels: readonly string[];
  endpoint?: string;
  fetch?: typeof globalThis.fetch;
}>;

export class OpenRouterAgentProvider implements AgentProvider {
  private readonly endpoint: string;
  private readonly fetchImplementation: typeof globalThis.fetch;

  constructor(private readonly options: OpenRouterAgentProviderOptions) {
    if (!options.apiKey.trim()) throw new Error("OpenRouter credentials are required.");
    if (!options.model.trim()) throw new Error("OpenRouter model configuration is required.");
    if (!options.structuredOutputModels.includes(options.model)) throw new Error("Configured OpenRouter model does not support required strict structured output.");
    this.endpoint = options.endpoint ?? "https://openrouter.ai/api/v1/chat/completions";
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
  }

  async execute(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    const started = Date.now();
    if (request.model !== this.options.model) return { kind: "authentication_or_configuration_failure", reason: "Requested model does not match the configured OpenRouter model.", attemptEvidence: { provider: "openrouter", model: this.options.model, correlationId: request.correlationId, startedAt: new Date(started).toISOString(), durationMs: 0, outcome: "authentication_or_configuration_failure", safeUsage: null } };
    if (request.signal?.aborted) return { kind: "cancelled", attemptEvidence: { provider: "openrouter", model: this.options.model, correlationId: request.correlationId, startedAt: new Date(started).toISOString(), durationMs: 0, outcome: "cancelled", safeUsage: null } };
    const controller = new AbortController();
    const timeoutMs = Math.max(0, request.deadline.getTime() - started);
    const timeout = setTimeout(() => controller.abort("deadline"), timeoutMs);
    const onAbort = () => controller.abort("cancelled");
    request.signal?.addEventListener("abort", onAbort, { once: true });
    const evidence = (kind: AgentExecutionResult["kind"], extra: Partial<AgentAttemptEvidence> = {}): AgentAttemptEvidence => ({ provider: "openrouter", model: this.options.model, correlationId: request.correlationId, startedAt: new Date(started).toISOString(), durationMs: Math.max(0, Date.now() - started), outcome: kind, safeUsage: null, ...extra });
    try {
      const response = await this.fetchImplementation(this.endpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${this.options.apiKey}`, "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ model: this.options.model, messages: [{ role: "user", content: request.prompt }], response_format: { type: "json_schema", json_schema: { name: `${request.role}_output`, strict: true, schema: request.outputSchema } } }),
      });
      if (response.status === 429) return { kind: "rate_limited", retryAfterMs: retryAfter(response.headers.get("retry-after")), attemptEvidence: evidence("rate_limited") };
      if (response.status === 401 || response.status === 403 || response.status === 400) return { kind: "authentication_or_configuration_failure", reason: `OpenRouter rejected request with HTTP ${response.status}.`, attemptEvidence: evidence("authentication_or_configuration_failure") };
      if (response.status >= 500) return { kind: "retryable_infrastructure_failure", reason: `OpenRouter returned HTTP ${response.status}.`, attemptEvidence: evidence("retryable_infrastructure_failure") };
      if (!response.ok) return { kind: "terminal_provider_failure", reason: `OpenRouter returned HTTP ${response.status}.`, attemptEvidence: evidence("terminal_provider_failure") };
      const body: unknown = await response.json().catch(() => null);
      const content = messageContent(body);
      if (refusal(body)) return { kind: "refused", reason: refusal(body)!, attemptEvidence: evidence("refused") };
      if (content === null) return { kind: "schema_invalid", reason: "OpenRouter response did not contain a structured message.", attemptEvidence: evidence("schema_invalid") };
      let output: unknown;
      try { output = JSON.parse(content); } catch { return { kind: "schema_invalid", reason: "OpenRouter structured message was not JSON.", attemptEvidence: evidence("schema_invalid") }; }
      if (!validateAgentStructuredOutput(output, request.outputSchema)) return { kind: "schema_invalid", reason: "OpenRouter output does not conform to the requested JSON Schema.", attemptEvidence: evidence("schema_invalid") };
      return { kind: "completed", output, attemptEvidence: evidence("completed", { safeUsage: safeUsage(body) }) };
    } catch (error) {
      if (request.signal?.aborted) return { kind: "cancelled", attemptEvidence: evidence("cancelled") };
      if (controller.signal.aborted) return { kind: "timed_out", attemptEvidence: evidence("timed_out") };
      return { kind: "retryable_infrastructure_failure", reason: error instanceof Error ? error.message : "OpenRouter request failed.", attemptEvidence: evidence("retryable_infrastructure_failure") };
    } finally { clearTimeout(timeout); request.signal?.removeEventListener("abort", onAbort); }
  }
}

function messageContent(value: unknown): string | null { if (!isRecord(value) || !Array.isArray(value.choices) || !isRecord(value.choices[0]) || !isRecord(value.choices[0].message)) return null; const content = value.choices[0].message.content; return typeof content === "string" ? content : null; }
function refusal(value: unknown): string | null { if (!isRecord(value) || !Array.isArray(value.choices) || !isRecord(value.choices[0]) || !isRecord(value.choices[0].message)) return null; const reason = value.choices[0].message.refusal; return typeof reason === "string" && reason ? reason : null; }
function safeUsage(value: unknown): AgentAttemptEvidence["safeUsage"] { if (!isRecord(value) || !isRecord(value.usage)) return null; const inputTokens = value.usage.prompt_tokens; const outputTokens = value.usage.completion_tokens; return typeof inputTokens === "number" || typeof outputTokens === "number" ? { ...(typeof inputTokens === "number" ? { inputTokens } : {}), ...(typeof outputTokens === "number" ? { outputTokens } : {}) } : null; }
function retryAfter(value: string | null): number | null { if (!value) return null; const seconds = Number(value); return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000 : null; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
