export type AgentRole = "fit" | "builder" | "verifier";

/** Supported final-output schema subset: object, string enum, number, and boolean. */
export type JsonSchema = Readonly<Record<string, unknown>>;

export type AgentExecutionRequest = Readonly<{
  role: AgentRole;
  prompt: string;
  promptVersion: string;
  canonicalEvidenceReferences: readonly string[];
  outputSchema: JsonSchema;
  model: string;
  deadline: Date;
  signal?: AbortSignal;
  correlationId: string;
  workingDirectory?: string;
}>;

export type AgentAttemptEvidence = Readonly<{
  provider: "codex" | "openrouter" | "fixture";
  model: string;
  correlationId: string;
  startedAt: string;
  durationMs: number;
  outcome: AgentExecutionResult["kind"];
  cliVersion?: string;
  runtimeVersion?: string;
  exitStatus?: number | null;
  safeUsage: Readonly<{ inputTokens?: number; outputTokens?: number }> | null;
}>;

type AgentResultBase = Readonly<{ attemptEvidence: AgentAttemptEvidence }>;
export type AgentExecutionResult =
  | (AgentResultBase & Readonly<{ kind: "completed"; output: unknown }> )
  | (AgentResultBase & Readonly<{ kind: "schema_invalid"; reason: string }> )
  | (AgentResultBase & Readonly<{ kind: "refused"; reason: string }> )
  | (AgentResultBase & Readonly<{ kind: "timed_out" }> )
  | (AgentResultBase & Readonly<{ kind: "cancelled" }> )
  | (AgentResultBase & Readonly<{ kind: "rate_limited"; retryAfterMs: number | null }> )
  | (AgentResultBase & Readonly<{ kind: "authentication_or_configuration_failure"; reason: string }> )
  | (AgentResultBase & Readonly<{ kind: "retryable_infrastructure_failure"; reason: string }> )
  | (AgentResultBase & Readonly<{ kind: "terminal_provider_failure"; reason: string }> );

export type AgentProvider = Readonly<{ execute(request: AgentExecutionRequest): Promise<AgentExecutionResult> }>;

export type AgentProviderConfiguration = Readonly<{
  environment: "development" | "test" | "production";
  provider: "codex" | "openrouter";
  codex?: Readonly<{ model: string }>;
  openRouter?: Readonly<{ apiKey: string; model: string; structuredOutputModels: readonly string[] }>;
}>;

/** Validates the intentionally small JSON Schema subset required for agent final output. */
export function conformsToJsonSchema(value: unknown, schema: JsonSchema): boolean {
  if (schema.type === "object") {
    if (!isRecord(value)) return false;
    const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : [];
    if (required.some((key) => !(key in value))) return false;
    const properties = isRecord(schema.properties) ? schema.properties : {};
    if (schema.additionalProperties === false && Object.keys(value).some((key) => !(key in properties))) return false;
    return Object.entries(properties).every(([key, property]) => !(key in value) || (isRecord(property) && conformsToJsonSchema(value[key], property)));
  }
  if (schema.type === "string") return typeof value === "string" && (!Array.isArray(schema.enum) || schema.enum.includes(value));
  if (schema.type === "number") return typeof value === "number" && Number.isFinite(value);
  if (schema.type === "boolean") return typeof value === "boolean";
  return false;
}

/** Validates the fail-closed provider route; infrastructure composes the concrete adapter. */
export function createConfiguredAgentProvider(config: AgentProviderConfiguration): AgentProviderConfiguration {
  if (config.environment === "production" && config.provider !== "openrouter") throw new Error("Production agent execution requires the explicit OpenRouter provider; Codex fallback is forbidden.");
  if (config.provider === "openrouter") {
    const settings = config.openRouter;
    if (!settings?.apiKey.trim()) throw new Error("OpenRouter credentials are required.");
    if (!settings.model.trim()) throw new Error("OpenRouter model configuration is required.");
    if (!settings.structuredOutputModels.includes(settings.model)) throw new Error("Configured OpenRouter model does not support required strict structured output.");
    return config;
  }
  if (!config.codex?.model.trim()) throw new Error("Codex model configuration is required.");
  return config;
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
