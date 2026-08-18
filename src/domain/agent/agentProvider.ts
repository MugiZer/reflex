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

/** Immutable, sanitized evidence for an agent execution. Provider payloads and prompts never cross this boundary. */
export type AgentAttempt = Readonly<{
  schema: "agent-attempt/v1";
  attemptId: string;
  role: AgentRole;
  promptVersion: string;
  canonicalEvidenceReferences: readonly string[];
  outputSchemaSha256: string;
  result: AgentAttemptEvidence;
  fitDecision?: Readonly<{ canonicalSignature: string; candidateIdentities: readonly string[]; structuredOutcome: Readonly<{ kind: string; candidateIdentity: string | null; confidence: string | null; reasons: readonly string[] }>; gates: Readonly<{ contract: boolean; envelope: boolean; recipe: boolean; dependencies: boolean; qualification: boolean }>; finalDisposition: "authorized" | "generation" | "provider-failure"; skillVersion: string }>;
}>;

export type AgentAttemptRepository = Readonly<{
  append(attempt: AgentAttempt): Promise<void>;
  listByCorrelationId(correlationId: string): Promise<readonly AgentAttempt[]>;
}>;

export type AgentProviderConfiguration = Readonly<{
  environment: "development" | "test" | "production";
  provider: "codex" | "openrouter";
  codex?: Readonly<{ model: string }>;
  openRouter?: Readonly<{ apiKey: string; model: string; structuredOutputModels: readonly string[] }>;
}>;

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
