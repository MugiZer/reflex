import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createLocalhostApp } from "../src/app/http/httpServer.js";
import type { AgentExecutionRequest, AgentProvider, AgentProviderConfiguration } from "../src/domain/agent/agentProvider.js";
import type { GeneratedTopologyAdapterQualificationCommand } from "../src/application/topology/qualifyGeneratedTopologyAdapter.js";
import { SqliteAgentAttemptRepository } from "../src/infrastructure/persistence/sqlite/SqliteAgentAttemptRepository.js";
import { generatedTopologyAdapterHash, type GeneratedTopologyAdapter, type GeneratedTopologyQualificationReceipt } from "../src/domain/topology/generatedTopologyAdapter.js";
import { REPEATING_C_PROFILE_PATTERN } from "../src/domain/topology/patterns/repeatingCProfilePattern.js";
import { createProvenPythonTopologyWorker, PROVEN_TOPOLOGY_BUNDLE } from "../src/infrastructure/topology/createProvenPythonTopologyWorker.js";

const fixturePath = resolve("tests/fixtures/ifc/repeating-c-profile.ifc");
const pythonExecutable = resolve(process.env.TOPOLOGY_WORKER_PYTHON ?? ".scratch/component-topology-kernel/conformance-proof/.venv/Scripts/python.exe");

describe("ambiguous generated topology family public proof", () => {
  it("routes an ambiguous fit through HTTP to a persisted Topology Result and reloads it", async () => {
    await withAmbiguousFitJob(async (context) => {
      const beforeAssemblies = JSON.stringify(context.job.architectActions.assemblies);
      const beforeRevision = context.job.activeRevisionId;
      const response = await postReview(context.baseUrl, context.job, context.job.topologyOpportunities[0], 0.075);
      expect(response.status, await response.text()).toBe(202);

      const matched = await getJob(context.baseUrl, context.job.jobId);
      expect(matched.componentEvaluations[0]).toMatchObject({
        match: { outcome: "matched", patternId: "generated-c-profile-fit-right", patternVersion: "1.0.0" },
        results: [{ outcome: "preliminary-unsafe" }],
      });
      expect(context.providerCalls).toBe(1);
      expect(matched.activeRevisionId).toBe(beforeRevision);
      expect(JSON.stringify(matched.architectActions.assemblies)).toBe(beforeAssemblies);

      const beforeRestart = JSON.stringify(matched.componentEvaluations);
      const restarted = await context.restart();
      expect(JSON.stringify(restarted.componentEvaluations)).toBe(beforeRestart);
      expect(restarted.componentEvaluations[0]).toMatchObject({
        match: { outcome: "matched", patternId: "generated-c-profile-fit-right" },
        results: [{ outcome: "preliminary-unsafe" }],
      });

      context.closeAttempts();
      const reopened = new SqliteAgentAttemptRepository(context.attemptPath);
      const attempts = await reopened.listByCorrelationId(context.correlationId);
      expect(attempts.some((attempt) => attempt.fitDecision?.finalDisposition === "authorized")).toBe(true);
      expect(JSON.stringify(attempts)).not.toContain("IFC payload");
      reopened.close();
    });
  }, 90_000);

  it("falls through to generation for an outside-envelope fit and preserves the wall snapshot", async () => {
    await withAmbiguousFitJob(async (context) => {
      const beforeAssemblies = JSON.stringify(context.job.architectActions.assemblies);
      const beforeRevision = context.job.activeRevisionId;
      const beforeReport = await (await fetch(`${context.baseUrl}/api/jobs/${context.job.jobId}/report`)).text();
      const response = await postReview(context.baseUrl, context.job, context.job.topologyOpportunities[0], 0.2);
      expect(response.status, await response.text()).toBe(202);

      const after = await getJob(context.baseUrl, context.job.jobId);
      expect(after.componentEvaluations[0]).toMatchObject({ match: { outcome: "rejected" }, recipes: [], requests: [], results: [] });
      expect(context.providerCalls).toBe(1);
      expect(after.activeRevisionId).toBe(beforeRevision);
      expect(JSON.stringify(after.architectActions.assemblies)).toBe(beforeAssemblies);
      await expect((await fetch(`${context.baseUrl}/api/jobs/${context.job.jobId}/report`)).text()).resolves.toBe(beforeReport);

      context.closeAttempts();
      const reopened = new SqliteAgentAttemptRepository(context.attemptPath);
      const attempts = await reopened.listByCorrelationId(context.correlationId);
      expect(attempts).toContainEqual(expect.objectContaining({ fitDecision: expect.objectContaining({ finalDisposition: "generation", gates: expect.objectContaining({ envelope: false }) }) }));
      reopened.close();
    });
  }, 90_000);

  it("records a configured-provider infrastructure failure without changing protected Job state", async () => {
    await withAmbiguousFitJob(async (context) => {
      const before = await getJob(context.baseUrl, context.job.jobId);
      const response = await postReview(context.baseUrl, context.job, context.job.topologyOpportunities[0], 0.075);
      expect(response.status, await response.text()).toBe(202);
      const after = await getJob(context.baseUrl, context.job.jobId);
      expect(after.activeRevisionId).toBe(before.activeRevisionId);
      expect(JSON.stringify(after.architectActions.assemblies)).toBe(JSON.stringify(before.architectActions.assemblies));
      context.closeAttempts();
      const reopened = new SqliteAgentAttemptRepository(context.attemptPath);
      const attempts = await reopened.listByCorrelationId(context.correlationId);
      expect(attempts).toContainEqual(expect.objectContaining({ role: "fit", result: expect.objectContaining({ provider: "openrouter", model: "openrouter-fit-model", outcome: "retryable_infrastructure_failure", safeUsage: null }), fitDecision: expect.objectContaining({ finalDisposition: "provider-failure" }) }));
      reopened.close();
    }, { providerFailure: true });
  }, 90_000);
});

async function withAmbiguousFitJob(run: (context: AmbiguousFitContext) => Promise<void>, options: Readonly<{ providerFailure?: boolean }> = {}): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "ambiguous-topology-fit-http-"));
  const attemptPath = join(root, "data", "fit-attempts.sqlite");
  const left = adapter("left");
  const right = adapter("right");
  const rightHash = generatedTopologyAdapterHash(right);
  const attempts = new SqliteAgentAttemptRepository(attemptPath);
  let attemptsClosed = false;
  let providerCalls = 0;
  let correlationId = "";
  const provider: AgentProvider = {
      execute: async (request: AgentExecutionRequest) => {
        providerCalls += 1;
        correlationId = request.correlationId;
        expect(request.prompt).not.toContain("IFC payload");
        if (options.providerFailure) return {
          kind: "retryable_infrastructure_failure" as const,
          reason: "deterministic configured provider failure",
          attemptEvidence: { provider: "openrouter" as const, model: request.model, correlationId: request.correlationId, startedAt: "2026-08-18T00:00:00.000Z", durationMs: 1, outcome: "retryable_infrastructure_failure" as const, safeUsage: null },
        };
        return {
          kind: "completed" as const,
          output: { candidateIdentity: rightHash, confidence: "high" as const, comparison: [], reasons: ["public fit proof"] },
          attemptEvidence: { provider: "openrouter" as const, model: request.model, correlationId: request.correlationId, startedAt: "2026-08-18T00:00:00.000Z", durationMs: 1, outcome: "completed" as const, safeUsage: null },
        };
      },
  };
  const providerConfiguration: AgentProviderConfiguration = {
    environment: "test",
    provider: "openrouter",
    openRouter: { apiKey: "test-only", model: "openrouter-fit-model", structuredOutputModels: ["openrouter-fit-model"] },
  };
  const config = {
    databasePath: join(root, "data", "app.db"),
    storageRoot: join(root, "storage"),
    outputRoot: join(root, "outputs"),
    generatedTopologyAdapterManifestRoot: join(root, "adapter-manifests"),
    generatedTopologyAdapterQualification: async (input: GeneratedTopologyAdapterQualificationCommand) => qualifiedReceipt(input.adapter as GeneratedTopologyAdapter),
    agentProviderConfiguration: providerConfiguration,
    agentAttemptRepository: attempts,
    agentProviderFactory: (configuration: AgentProviderConfiguration): AgentProvider => {
      expect(configuration).toEqual(providerConfiguration);
      return provider;
    },
    topologyWorker: createProvenPythonTopologyWorker({ pythonExecutable }),
  };
  let app = createLocalhostApp(config);
  let baseUrl = "";
  try {
    await app.qualifyGeneratedTopologyAdapter(left, "ambiguous-fit-left");
    await app.qualifyGeneratedTopologyAdapter(right, "ambiguous-fit-right");
    baseUrl = await listen(app);
    const form = new FormData();
    form.set("ifc", new Blob([await readFile(fixturePath)]), "repeating-c-profile.ifc");
    const created = await json<{ jobId: string }>(await fetch(`${baseUrl}/api/jobs`, { method: "POST", body: form }));
    let job = await waitForJob(baseUrl, created.jobId);
    if (!job.activeRevisionId) {
      const inputs = job.review.requestedInputs.map((input: any) => ({ requestedInputId: input.requestedInputId, value: input.datapoint === "layer_thickness" ? 0.15 : input.inputType === "number" ? 0.12 : "confirmed", unit: input.unit, overrideScope: "assembly_group" }));
      const reviewed = await fetch(`${baseUrl}/api/jobs/${job.jobId}/review-inputs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputs }) });
      expect(reviewed.ok, await reviewed.text()).toBe(true);
      job = await waitForActiveRevision(baseUrl, job.jobId);
    }
    const context: AmbiguousFitContext = {
      baseUrl,
      job,
      attemptPath,
      get correlationId() { return correlationId; },
      get providerCalls() { return providerCalls; },
      restart: async () => {
        await close(app);
        app = createLocalhostApp(config);
        baseUrl = await listen(app);
        return getJob(baseUrl, job.jobId);
      },
      closeAttempts: () => {
        if (!attemptsClosed) {
          attempts.close();
          attemptsClosed = true;
        }
      },
    };
    await run(context);
  } finally {
    await close(app);
    if (!attemptsClosed) attempts.close();
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
}

type AmbiguousFitContext = {
  baseUrl: string;
  job: any;
  attemptPath: string;
  correlationId: string;
  providerCalls: number;
  restart: () => Promise<any>;
  closeAttempts: () => void;
};

async function postReview(baseUrl: string, job: any, opportunity: any, width: number): Promise<Response> {
  return fetch(`${baseUrl}/api/jobs/${job.jobId}/topology-reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ opportunityId: opportunity.opportunityId, thermalConstructionSignature: opportunity.thermalConstructionSignature, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: opportunity.sourceAssemblyGroupIds[0], answers: { memberKind: "c", memberMaterial: "galvanized steel", memberWidthM: width, repeatSpacingM: 0.6, continuousThroughLayers: true, exteriorBoundary: "external-wall", interiorBoundary: "internal" } }),
  });
}

function qualifiedReceipt(adapter: GeneratedTopologyAdapter): GeneratedTopologyQualificationReceipt {
  const adapterHash = generatedTopologyAdapterHash(adapter);
  const gate = (gateId: "P3-contract-geometry" | "P6-worker" | "P3-independent-reference" | "P6-envelope-sensitivity") => ({ gateId, selectedCases: [gateId], passedCases: [gateId], failedCases: [], unexecutedCases: [], fixtureIdentity: `fixture:${gateId}`, oracleIdentity: null, adapterHash, dependencyIdentities: adapter.dependencies, command: "ambiguous fit public proof", durationMs: 0, testedRevision: "ambiguous-fit-public-proof" });
  return { schema: "generated-topology-adapter-qualification-receipt/v1", decision: "GO", adapterHash, recipeHash: null, worker: { executable: "C:/sentinel/python.exe", runtimeHash: PROVEN_TOPOLOGY_BUNDLE.runtimeHash }, compilerVersion: adapter.dependencies.compilerVersion, primitiveRegistryHash: adapter.dependencies.primitiveRegistryHash, materialPackHash: adapter.dependencies.materialPackHash, boundaryVersion: adapter.dependencies.boundaryVersion, gates: [gate("P3-contract-geometry"), gate("P6-worker"), gate("P3-independent-reference"), gate("P6-envelope-sensitivity")], qualifiedAt: "2026-08-18T00:00:00.000Z" };
}

function adapter(id: string): GeneratedTopologyAdapter {
  return { schema: "generated-topology-adapter/v1", family: { familyId: `generated-c-profile-fit-${id}`, familyVersion: "1.0.0", topologyModule: { id: PROVEN_TOPOLOGY_BUNDLE.moduleId, version: PROVEN_TOPOLOGY_BUNDLE.moduleVersion }, primitive: { kind: "standard.c", version: "1.0.0" }, materialIdentity: "galvanized-steel", placementMode: "continuous-profile", profileKind: "c", requiredCharacteristics: { orientation: "parallel", steel: true } }, recognition: { profileKinds: ["c"], materialTokens: ["steel", "metal"] }, requiredAuthorities: ["profileKind", "memberMaterial"], recipeTemplate: REPEATING_C_PROFILE_PATTERN.recipeTemplate, parameterBindings: [{ key: "memberWidthM", binding: ["rows", 0, "member", "primitive", "parameters", "depth"], bounds: { minimum: 0.041, maximum: 0.1 } }], permittedUnknowns: [], validationEnvelope: { memberWidthM: { minimum: 0.041, maximum: 0.1 } }, provenance: { datasetId: "ambiguous-fit-public-proof", datasetVersion: "1", datasetHash: sha256("ambiguous-fit-public-proof"), sourceCitation: "safe public proof fixture" }, qualificationCases: { reference: { caseId: "c-profile-reference", parameters: { memberWidthM: 0.075 } }, sensitivity: { caseId: "c-profile-sensitivity", parameters: { memberWidthM: 0.1 }, direction: "decreases" } }, dependencies: { compilerVersion: PROVEN_TOPOLOGY_BUNDLE.moduleVersion, primitiveRegistryHash: PROVEN_TOPOLOGY_BUNDLE.registryHash, materialPackHash: PROVEN_TOPOLOGY_BUNDLE.packHash, runtimeHash: PROVEN_TOPOLOGY_BUNDLE.runtimeHash, boundaryVersion: "component-evaluation/v1" } };
}

function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
async function listen(app: ReturnType<typeof createLocalhostApp>): Promise<string> { app.server.listen(0, "127.0.0.1"); await new Promise<void>((resolveListen) => app.server.once("listening", resolveListen)); const address = app.server.address(); if (!address || typeof address === "string") throw new Error("Server is not bound."); return `http://127.0.0.1:${address.port}`; }
async function close(app: ReturnType<typeof createLocalhostApp>): Promise<void> { if (app.server.listening) await new Promise<void>((resolveClose, reject) => app.server.close((error) => error ? reject(error) : resolveClose())); app.close(); }
async function getJob(baseUrl: string, jobId: string): Promise<any> { return await (await fetch(`${baseUrl}/api/jobs/${jobId}`)).json() as any; }
async function json<T>(response: Response): Promise<T> { return await response.json() as T; }
async function waitForJob(baseUrl: string, jobId: string): Promise<any> { for (let index = 0; index < 100; index += 1) { const job = await getJob(baseUrl, jobId); if (job.jobStatus !== "queued" && job.jobStatus !== "processing") return job; await new Promise((resolveWait) => setTimeout(resolveWait, 20)); } throw new Error("Job did not settle"); }
async function waitForActiveRevision(baseUrl: string, jobId: string): Promise<any> { for (let index = 0; index < 100; index += 1) { const job = await getJob(baseUrl, jobId); if (job.activeRevisionId) return job; await new Promise((resolveWait) => setTimeout(resolveWait, 20)); } throw new Error("Job did not produce an active Revision"); }
