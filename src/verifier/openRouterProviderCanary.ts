import { OpenRouterAgentProvider } from "../infrastructure/agent/OpenRouterAgentProvider.js";

export type OpenRouterCanaryEvidence = Readonly<{ schema: "openrouter-provider-canary/v1"; decision: "GO" | "NOT-PROVEN" | "NO-GO"; model: string | null; executedAt: string | null; reason: string }>;

/** A release proof: absent explicit credentials it deliberately cannot self-certify production readiness. */
export async function runOpenRouterProviderCanary(input: Readonly<{ apiKey?: string; model?: string; structuredOutputModels?: readonly string[] }>): Promise<OpenRouterCanaryEvidence> {
  if (!input.apiKey?.trim() || !input.model?.trim() || !input.structuredOutputModels?.includes(input.model)) return { schema: "openrouter-provider-canary/v1", decision: "NOT-PROVEN", model: input.model ?? null, executedAt: null, reason: "Credentialed strict-structured-output OpenRouter canary has not run." };
  const result = await new OpenRouterAgentProvider({ apiKey: input.apiKey, model: input.model, structuredOutputModels: input.structuredOutputModels }).execute({ role: "verifier", prompt: "Return exactly {\"decision\":\"accept\"}.", promptVersion: "openrouter-canary/v1", canonicalEvidenceReferences: ["canary:no-private-ifc"], outputSchema: { type: "object", required: ["decision"], properties: { decision: { const: "accept" } }, additionalProperties: false }, model: input.model, deadline: new Date(Date.now() + 30_000), correlationId: "openrouter-production-canary" });
  return { schema: "openrouter-provider-canary/v1", decision: result.kind === "completed" ? "GO" : "NO-GO", model: input.model, executedAt: new Date().toISOString(), reason: result.kind === "completed" ? "Credentialed strict-structured-output canary passed." : `Canary result: ${result.kind}.` };
}
