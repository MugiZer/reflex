import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createLocalhostApp } from "../src/app/http/httpServer.js";
import { createProvenPythonTopologyWorker, PROVEN_TOPOLOGY_BUNDLE } from "../src/infrastructure/topology/createProvenPythonTopologyWorker.js";

describe("preliminary topology pilot lifecycle", () => {
  it("aborted or deadline-exceeded work publishes no partial result", async () => {
    const root = await mkdtemp(join(tmpdir(), "preliminary-pilot-lifecycle-"));
    let workerInvocations = 0;
    let workerTerminated = false;
    const app = createLocalhostApp({ databasePath: join(root, "data", "app.db"), storageRoot: join(root, "storage"), outputRoot: join(root, "outputs"), topologyWorker: { runtimeIdentity: { executable: "test-only-lifecycle-worker", runtimeHash: PROVEN_TOPOLOGY_BUNDLE.runtimeHash }, async verifyArtifacts() {}, async runJsonl(_message, options) { workerInvocations += 1; if (Date.parse(options.deadlineAt) <= Date.now()) throw Object.assign(new Error("worker_deadline_exceeded"), { outcome: "failed" as const, code: "worker_deadline_exceeded" }); await new Promise<void>((resolveWait) => { if (options.signal?.aborted) { workerTerminated = true; return resolveWait(); } options.signal?.addEventListener("abort", () => { workerTerminated = true; resolveWait(); }, { once: true }); }); throw Object.assign(new Error("worker_cancelled"), { outcome: "cancelled" as const, code: "worker_cancelled" }); } } });
    try {
      const baseUrl = await listen(app);
      const job = await createReadyJob(baseUrl);
      const opportunity = job.topologyOpportunities[0]!;
      const controller = new AbortController();
      const abortedRequest = fetch(`${baseUrl}/api/jobs/${job.jobId}/topology-reviews`, { signal: controller.signal, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opportunityId: opportunity.opportunityId, thermalConstructionSignature: opportunity.thermalConstructionSignature, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: opportunity.sourceAssemblyGroupIds?.[0] ?? job.architectActions.assemblies[0].assemblyGroupId, answers: { memberKind: "c", memberMaterial: "galvanized steel", memberWidthM: 0.075, repeatSpacingM: 0.6, continuousThroughLayers: true, exteriorBoundary: "external-wall", interiorBoundary: "internal" } }) });
      setTimeout(() => controller.abort(), 25);
      await abortedRequest.catch(() => undefined);
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
      const deadlineResponse = await fetch(`${baseUrl}/api/jobs/${job.jobId}/topology-reviews`, { method: "POST", headers: { "Content-Type": "application/json", "x-topology-deadline-at": new Date(Date.now() - 1_000).toISOString() }, body: JSON.stringify({ opportunityId: opportunity.opportunityId, thermalConstructionSignature: opportunity.thermalConstructionSignature, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: opportunity.sourceAssemblyGroupIds?.[0] ?? job.architectActions.assemblies[0].assemblyGroupId, answers: { memberKind: "c", memberMaterial: "galvanized steel", memberWidthM: 0.041, repeatSpacingM: 0.6, continuousThroughLayers: true, exteriorBoundary: "external-wall", interiorBoundary: "internal" } }) });
      expect(deadlineResponse.status, await deadlineResponse.clone().text()).toBe(202);
      const cancelled = await getJob(baseUrl, job.jobId);
      expect(cancelled.pilotRuns.some((run: any) => run.disposition === "cancelled" && run.errorCode === "worker_cancelled")).toBe(true);
      expect(cancelled.pilotRuns.some((run: any) => run.disposition === "failed" && run.errorCode === "worker_deadline_exceeded")).toBe(true);
      expect(cancelled.componentEvaluations.every((graph: any) => graph.results.every((result: any) => result.resultPayload.effectiveUValueWPerM2K === null))).toBe(true);
      expect(workerInvocations).toBeGreaterThan(0);
      expect(workerTerminated).toBe(true);
    } finally {
      await close(app);
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  }, 60_000);

  it("transient retry does not duplicate durable calculation", async () => {
    const root = await mkdtemp(join(tmpdir(), "preliminary-pilot-retry-"));
    const pythonExecutable = resolve(process.env.TOPOLOGY_WORKER_PYTHON ?? ".scratch/component-topology-kernel/conformance-proof/.venv/Scripts/python.exe");
    const proven = createProvenPythonTopologyWorker({ pythonExecutable });
    let workerInvocations = 0;
    const app = createLocalhostApp({ databasePath: join(root, "data", "app.db"), storageRoot: join(root, "storage"), outputRoot: join(root, "outputs"), topologyWorker: { runtimeIdentity: proven.runtimeIdentity, async verifyArtifacts(evidence, destination) { return proven.verifyArtifacts(evidence, destination); }, async runJsonl(message, options) { workerInvocations += 1; if (workerInvocations === 1) throw Object.assign(new Error("topology_runtime_unavailable"), { outcome: "failed" as const, code: "topology_runtime_unavailable", retryable: true }); return proven.runJsonl(message, options); } } });
    try {
      const baseUrl = await listen(app);
      const job = await createReadyJob(baseUrl);
      const opportunity = job.topologyOpportunities[0]!;
      const response = await fetch(`${baseUrl}/api/jobs/${job.jobId}/topology-reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opportunityId: opportunity.opportunityId, thermalConstructionSignature: opportunity.thermalConstructionSignature, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: opportunity.sourceAssemblyGroupIds?.[0] ?? job.architectActions.assemblies[0].assemblyGroupId, answers: { memberKind: "c", memberMaterial: "galvanized steel", memberWidthM: 0.075, repeatSpacingM: 0.6, continuousThroughLayers: true, exteriorBoundary: "external-wall", interiorBoundary: "internal" } }) });
      expect(response.status, await response.clone().text()).toBe(202);
      const result = await response.json() as any;
      expect(result.results[0].outcome).toBe("preliminary-unsafe");
      expect(workerInvocations).toBe(2);
      const reloaded = await getJob(baseUrl, job.jobId);
      expect(reloaded.componentEvaluations).toHaveLength(1);
      expect(reloaded.pilotRuns).toEqual([expect.objectContaining({ disposition: "completed" })]);
    } finally {
      await close(app);
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  }, 180_000);

  it("deterministic failure is not automatically retried", async () => {
    const root = await mkdtemp(join(tmpdir(), "preliminary-pilot-no-retry-"));
    let workerInvocations = 0;
    const app = createLocalhostApp({ databasePath: join(root, "data", "app.db"), storageRoot: join(root, "storage"), outputRoot: join(root, "outputs"), topologyWorker: { runtimeIdentity: { executable: "test-only-deterministic-failure-worker", runtimeHash: PROVEN_TOPOLOGY_BUNDLE.runtimeHash }, async verifyArtifacts() {}, async runJsonl() { workerInvocations += 1; throw Object.assign(new Error("malformed_output"), { outcome: "failed" as const, code: "malformed_output", retryable: false }); } } });
    try {
      const baseUrl = await listen(app);
      const job = await createReadyJob(baseUrl);
      const opportunity = job.topologyOpportunities[0]!;
      const response = await fetch(`${baseUrl}/api/jobs/${job.jobId}/topology-reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opportunityId: opportunity.opportunityId, thermalConstructionSignature: opportunity.thermalConstructionSignature, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: opportunity.sourceAssemblyGroupIds?.[0] ?? job.architectActions.assemblies[0].assemblyGroupId, answers: { memberKind: "c", memberMaterial: "galvanized steel", memberWidthM: 0.041, repeatSpacingM: 0.6, continuousThroughLayers: true, exteriorBoundary: "external-wall", interiorBoundary: "internal" } }) });
      expect(response.status, await response.clone().text()).toBe(202);
      const result = await response.json() as any;
      expect(result.results[0]).toMatchObject({ outcome: "failed", resultPayload: { errorCode: "malformed_output", effectiveUValueWPerM2K: null } });
      expect(workerInvocations).toBe(1);
      expect((await getJob(baseUrl, job.jobId)).pilotRuns).toEqual([expect.objectContaining({ disposition: "failed", errorCode: "malformed_output" })]);
    } finally {
      await close(app);
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  }, 60_000);

  it("simultaneous independent pilot submissions converge", async () => {
    const root = await mkdtemp(join(tmpdir(), "preliminary-pilot-concurrent-"));
    const pythonExecutable = resolve(process.env.TOPOLOGY_WORKER_PYTHON ?? ".scratch/component-topology-kernel/conformance-proof/.venv/Scripts/python.exe");
    const options = { databasePath: join(root, "data", "app.db"), storageRoot: join(root, "storage"), outputRoot: join(root, "outputs"), topologyWorker: createProvenPythonTopologyWorker({ pythonExecutable }) };
    const firstApp = createLocalhostApp(options);
    const secondApp = createLocalhostApp(options);
    try {
      const firstBaseUrl = await listen(firstApp);
      const secondBaseUrl = await listen(secondApp);
      const job = await createReadyJob(firstBaseUrl);
      const opportunity = job.topologyOpportunities[0]!;
      const body = JSON.stringify({ opportunityId: opportunity.opportunityId, thermalConstructionSignature: opportunity.thermalConstructionSignature, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: opportunity.sourceAssemblyGroupIds?.[0] ?? job.architectActions.assemblies[0].assemblyGroupId, answers: { memberKind: "c", memberMaterial: "galvanized steel", memberWidthM: 0.075, repeatSpacingM: 0.6, continuousThroughLayers: true, exteriorBoundary: "external-wall", interiorBoundary: "internal" } });
      const [firstResponse, secondResponse] = await Promise.all([fetch(`${firstBaseUrl}/api/jobs/${job.jobId}/topology-reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body }), fetch(`${secondBaseUrl}/api/jobs/${job.jobId}/topology-reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body })]);
      expect(firstResponse.status, await firstResponse.clone().text()).toBe(202);
      expect(secondResponse.status, await secondResponse.clone().text()).toBe(202);
      const loaded = await getJob(firstBaseUrl, job.jobId);
      expect(loaded.componentEvaluations).toHaveLength(1);
      expect(loaded.componentEvaluations[0], JSON.stringify(loaded.componentEvaluations[0])).toMatchObject({ state: "published", results: [{ outcome: "preliminary-unsafe" }] });
      expect(loaded.pilotRuns).toHaveLength(1);
      expect(await getJob(secondBaseUrl, job.jobId)).toMatchObject({ componentEvaluations: loaded.componentEvaluations, pilotRuns: loaded.pilotRuns });
    } finally {
      await close(firstApp);
      await close(secondApp);
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  }, 240_000);
});

async function createReadyJob(baseUrl: string): Promise<any> { const bytes = await readFile(resolve("tests/fixtures/ifc/repeating-c-profile.ifc")); const form = new FormData(); form.set("ifc", new Blob([bytes]), "repeating-c-profile.ifc"); const created = await json<any>(await fetch(`${baseUrl}/api/jobs`, { method: "POST", body: form })); let job = await waitForJob(baseUrl, created.jobId); if (!job.activeRevisionId) { const inputs = job.review.requestedInputs.map((input: any) => ({ requestedInputId: input.requestedInputId, value: input.datapoint === "layer_thickness" ? 0.15 : input.inputType === "number" ? 0.12 : "confirmed", unit: input.unit, overrideScope: "assembly_group" })); await fetch(`${baseUrl}/api/jobs/${job.jobId}/review-inputs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputs }) }); job = await waitForActiveRevision(baseUrl, job.jobId); } return job; }
async function waitForJob(baseUrl: string, jobId: string) { for (let index = 0; index < 100; index += 1) { const job = await getJob(baseUrl, jobId); if (job.jobStatus !== "queued" && job.jobStatus !== "processing") return job; await new Promise((resolveWait) => setTimeout(resolveWait, 20)); } throw new Error("Job did not settle"); }
async function waitForActiveRevision(baseUrl: string, jobId: string) { for (let index = 0; index < 100; index += 1) { const job = await getJob(baseUrl, jobId); if (job.activeRevisionId) return job; await new Promise((resolveWait) => setTimeout(resolveWait, 20)); } throw new Error("Job did not produce an active Revision"); }
async function getJob(baseUrl: string, jobId: string) { return await json<any>(await fetch(`${baseUrl}/api/jobs/${jobId}`)); }
async function listen(app: ReturnType<typeof createLocalhostApp>) { app.server.listen(0, "127.0.0.1"); await new Promise<void>((resolveListen) => app.server.once("listening", resolveListen)); const address = app.server.address(); if (!address || typeof address === "string") throw new Error("not bound"); return `http://127.0.0.1:${address.port}`; }
async function close(app: ReturnType<typeof createLocalhostApp>) { if (app.server.listening) await new Promise<void>((resolveClose, reject) => app.server.close((error) => error ? reject(error) : resolveClose())); app.close(); }
async function json<T>(response: Response) { return await response.json() as T; }
