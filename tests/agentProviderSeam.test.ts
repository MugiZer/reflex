import { describe, expect, it } from "vitest";
import { createServer } from "node:http";

import {
  createConfiguredAgentProvider,
  type AgentExecutionRequest,
  type AgentProvider,
} from "../src/domain/agent/agentProvider.js";
import { OpenRouterAgentProvider } from "../src/infrastructure/agent/OpenRouterAgentProvider.js";
import { CodexCliAgentProvider } from "../src/infrastructure/agent/CodexCliAgentProvider.js";

const outputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["decision"],
  properties: { decision: { type: "string", enum: ["accept", "reject"] } },
} as const;

const request: AgentExecutionRequest = {
  role: "verifier",
  prompt: "Return the fixture decision only.",
  promptVersion: "verifier/v1",
  canonicalEvidenceReferences: ["ifc-sha256:abc"],
  outputSchema,
  model: "openai/gpt-5",
  deadline: new Date(Date.now() + 5_000),
  correlationId: "provider-test-1",
};

describe("agent provider seam", () => {
  it("fails closed when production OpenRouter configuration is incomplete or unsupported", () => {
    expect(() => createConfiguredAgentProvider({ environment: "production", provider: "openrouter", openRouter: { apiKey: "", model: "openai/gpt-5", structuredOutputModels: ["openai/gpt-5"] } })).toThrow(/credentials/i);
    expect(() => createConfiguredAgentProvider({ environment: "production", provider: "openrouter", openRouter: { apiKey: "secret", model: "openai/gpt-5", structuredOutputModels: [] } })).toThrow(/structured output/i);
    expect(() => createConfiguredAgentProvider({ environment: "production", provider: "codex", codex: { model: "gpt-5" } })).toThrow(/OpenRouter/i);
  });

  it("maps a structured OpenRouter request and records only approved attempt evidence", async () => {
    let received: Request | undefined;
    const provider = new OpenRouterAgentProvider({
      apiKey: "secret-token",
      model: "openai/gpt-5",
      structuredOutputModels: ["openai/gpt-5"],
      fetch: async (input, init) => {
        received = new Request(input, init);
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ decision: "accept" }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });

    const result = await provider.execute(request);
    expect(result).toMatchObject({ kind: "completed", output: { decision: "accept" } });
    expect(received?.headers.get("authorization")).toBe("Bearer secret-token");
    const body = await received?.json() as any;
    expect(body).toMatchObject({ model: "openai/gpt-5", response_format: { type: "json_schema", json_schema: { strict: true, schema: outputSchema } } });
    expect(result.attemptEvidence).toMatchObject({ provider: "openrouter", model: "openai/gpt-5", correlationId: "provider-test-1" });
    expect(JSON.stringify(result.attemptEvidence)).not.toContain("secret-token");
    expect(JSON.stringify(result.attemptEvidence)).not.toContain(request.prompt);
    await expect(provider.execute({ ...request, model: "another-model" })).resolves.toMatchObject({ kind: "authentication_or_configuration_failure" });
  });

  it("proves the OpenRouter protocol against a controlled HTTP server", async () => {
    let authorization = "", received: any;
    const server = createServer((incoming, response) => {
      authorization = incoming.headers.authorization ?? "";
      let raw = "";
      incoming.on("data", (chunk) => { raw += chunk; });
      incoming.on("end", () => { received = JSON.parse(raw); response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ choices: [{ message: { content: "{\"decision\":\"accept\"}" } }] })); });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const endpoint = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/chat/completions`;
    try {
      const provider = new OpenRouterAgentProvider({ apiKey: "server-secret", model: "openai/gpt-5", structuredOutputModels: ["openai/gpt-5"], endpoint });
      await expect(provider.execute(request)).resolves.toMatchObject({ kind: "completed", output: { decision: "accept" } });
      expect(authorization).toBe("Bearer server-secret");
      expect(received).toMatchObject({ model: "openai/gpt-5", response_format: { type: "json_schema", json_schema: { strict: true, schema: outputSchema } } });
    } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
  });

  it("classifies rate limits, malformed output, and cancellation without a provider-specific result shape", async () => {
    const rateLimited = new OpenRouterAgentProvider({ apiKey: "secret", model: "openai/gpt-5", structuredOutputModels: ["openai/gpt-5"], fetch: async () => new Response("slow down", { status: 429 }) });
    await expect(rateLimited.execute(request)).resolves.toMatchObject({ kind: "rate_limited" });

    const malformed = new OpenRouterAgentProvider({ apiKey: "secret", model: "openai/gpt-5", structuredOutputModels: ["openai/gpt-5"], fetch: async () => new Response(JSON.stringify({ choices: [{ message: { content: "not-json" } }] }), { status: 200 }) });
    await expect(malformed.execute(request)).resolves.toMatchObject({ kind: "schema_invalid" });

    const refused = new OpenRouterAgentProvider({ apiKey: "secret", model: "openai/gpt-5", structuredOutputModels: ["openai/gpt-5"], fetch: async () => new Response(JSON.stringify({ choices: [{ message: { refusal: "policy" } }] }), { status: 200 }) });
    await expect(refused.execute(request)).resolves.toMatchObject({ kind: "refused" });

    const controller = new AbortController();
    controller.abort();
    let called = false;
    const provider = new OpenRouterAgentProvider({ apiKey: "secret", model: "openai/gpt-5", structuredOutputModels: ["openai/gpt-5"], fetch: async () => { called = true; throw new DOMException("aborted", "AbortError"); } });
    await expect(provider.execute({ ...request, signal: controller.signal })).resolves.toMatchObject({ kind: "cancelled" });
    expect(called).toBe(false);
  });

  it("lets fit, builder, and verifier depend solely on AgentProvider", async () => {
    const provider: AgentProvider = { execute: async (input) => ({ kind: "completed", output: { decision: "accept" }, attemptEvidence: { provider: "fixture", model: input.model, correlationId: input.correlationId, startedAt: "2026-01-01T00:00:00.000Z", durationMs: 0, outcome: "completed", safeUsage: null } }) };
    await expect(provider.execute({ ...request, role: "fit" })).resolves.toMatchObject({ kind: "completed" });
    await expect(provider.execute({ ...request, role: "builder" })).resolves.toMatchObject({ kind: "completed" });
  });

  it("executes the installed Codex CLI in an ephemeral restricted session with schema-constrained output", async () => {
    const provider = new CodexCliAgentProvider({});
    const result = await provider.execute({ ...request, model: "configured-default", workingDirectory: process.cwd(), deadline: new Date(Date.now() + 90_000), prompt: "Return exactly the JSON object {\"decision\":\"accept\"}. Do not inspect files or run commands." });
    expect(result).toMatchObject({ kind: "completed", output: { decision: "accept" }, attemptEvidence: { provider: "codex", model: "configured-default", correlationId: "provider-test-1", exitStatus: 0 } });
  }, 120_000);

  it("proves real Codex deadline and cancellation classification", async () => {
    const provider = new CodexCliAgentProvider({});
    await expect(provider.execute({ ...request, model: "configured-default", workingDirectory: process.cwd(), deadline: new Date(Date.now() + 1), prompt: "Return exactly the JSON object {\"decision\":\"accept\"}." })).resolves.toMatchObject({ kind: "timed_out" });
    const controller = new AbortController();
    controller.abort();
    await expect(provider.execute({ ...request, model: "configured-default", workingDirectory: process.cwd(), deadline: new Date(Date.now() + 20_000), signal: controller.signal, prompt: "Return exactly the JSON object {\"decision\":\"accept\"}." })).resolves.toMatchObject({ kind: "cancelled" });
  }, 120_000);
});
