import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createLocalhostApp } from "../src/app/http/httpServer.js";
import { createProvenPythonTopologyWorker, PROVEN_TOPOLOGY_BUNDLE } from "../src/infrastructure/topology/createProvenPythonTopologyWorker.js";

describe("preliminary topology pilot operations", () => {
  it("health reports actual dependency readiness", async () => {
    const root = await mkdtemp(join(tmpdir(), "preliminary-pilot-health-"));
    let preflightCalls = 0;
    const app = createLocalhostApp({ databasePath: join(root, "data", "app.db"), storageRoot: join(root, "storage"), outputRoot: join(root, "outputs"), topologyWorker: { runtimeIdentity: { executable: "test-only-health-worker", runtimeHash: PROVEN_TOPOLOGY_BUNDLE.runtimeHash }, async preflight() { preflightCalls += 1; }, async verifyArtifacts() {}, async runJsonl() { throw new Error("health_test_worker_not_used"); } } });
    try {
      app.server.listen(0, "127.0.0.1");
      await new Promise<void>((resolveListen) => app.server.once("listening", resolveListen));
      const address = app.server.address();
      if (!address || typeof address === "string") throw new Error("not bound");
      const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ schema: "topology-pilot-health/v1", overallStatus: "ready", layerOnly: { available: true }, topology: { available: true }, checks: { sqlite: { status: "ready" }, artifactStorage: { status: "ready" }, pinnedRuntime: { status: "ready" }, workerPreflight: { status: "ready" }, selectedBundle: { status: "ready" } } });
      expect(preflightCalls).toBe(1);
    } finally {
      if (app.server.listening) await new Promise<void>((resolveClose, reject) => app.server.close((error) => error ? reject(error) : resolveClose()));
      app.close();
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  });

  it("health reports degraded when the release worker is not configured", async () => {
    const root = await mkdtemp(join(tmpdir(), "preliminary-pilot-health-missing-"));
    const previous = process.env.TOPOLOGY_WORKER_PYTHON;
    delete process.env.TOPOLOGY_WORKER_PYTHON;
    const app = createLocalhostApp({ databasePath: join(root, "data", "app.db"), storageRoot: join(root, "storage"), outputRoot: join(root, "outputs") });
    try {
      app.server.listen(0, "127.0.0.1");
      await new Promise<void>((resolveListen) => app.server.once("listening", resolveListen));
      const address = app.server.address();
      if (!address || typeof address === "string") throw new Error("not bound");
      const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ overallStatus: "degraded", layerOnly: { available: true }, topology: { available: false }, checks: { workerPreflight: { status: "unavailable" } } });
    } finally {
      if (previous === undefined) delete process.env.TOPOLOGY_WORKER_PYTHON;
      else process.env.TOPOLOGY_WORKER_PYTHON = previous;
      if (app.server.listening) await new Promise<void>((resolveClose, reject) => app.server.close((error) => error ? reject(error) : resolveClose()));
      app.close();
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  });

  it("cleanup preserves published and referenced evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "preliminary-pilot-cleanup-"));
    const orphan = join(root, "outputs", "topology", "orphan.tmp-dead");
    await mkdir(orphan, { recursive: true });
    const app = createLocalhostApp({ databasePath: join(root, "data", "app.db"), storageRoot: join(root, "storage"), outputRoot: join(root, "outputs"), topologyWorker: { runtimeIdentity: { executable: "test-only-cleanup-worker", runtimeHash: PROVEN_TOPOLOGY_BUNDLE.runtimeHash }, async verifyArtifacts() {}, async runJsonl() { throw new Error("cleanup_test_worker_not_used"); } } });
    try {
      app.server.listen(0, "127.0.0.1");
      await new Promise<void>((resolveListen) => app.server.once("listening", resolveListen));
      const address = app.server.address();
      if (!address || typeof address === "string") throw new Error("not bound");
      await fetch(`http://127.0.0.1:${address.port}/api/health`);
      await expect(access(orphan)).rejects.toThrow();
    } finally {
      if (app.server.listening) await new Promise<void>((resolveClose, reject) => app.server.close((error) => error ? reject(error) : resolveClose()));
      app.close();
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  });

  it("restart kill and bundle rollback preserve history", async () => {
    const root = await mkdtemp(join(tmpdir(), "preliminary-pilot-rollback-"));
    const pythonExecutable = resolve(process.env.TOPOLOGY_WORKER_PYTHON ?? ".scratch/component-topology-kernel/conformance-proof/.venv/Scripts/python.exe");
    const policy = (enabled: boolean, killSwitch: boolean, version: string) => ({ schema: "topology-pilot-policy/v1" as const, policyVersion: version, enabled, cohort: { kind: "all" as const }, killSwitch: { active: killSwitch, reasonCode: killSwitch ? "operator_kill" : null, version: "kill-switch-v1" }, bundle: PROVEN_TOPOLOGY_BUNDLE, retry: { maxAttempts: 2 as const, retryableCodes: ["topology_runtime_unavailable"], backoffMs: 250 as const }, limits: { maxScenarioCount: 3, deadlineMs: 30_000 }, retention: { temporary: "terminal-cleanup" as const, failedDays: 7, unreferencedPublishedDays: 30 } });
    let app = createLocalhostApp({ databasePath: join(root, "data", "app.db"), storageRoot: join(root, "storage"), outputRoot: join(root, "outputs"), topologyPilotPolicy: policy(true, true, "pilot-bundle-v1"), topologyWorker: { runtimeIdentity: { executable: "test-only-kill-worker", runtimeHash: PROVEN_TOPOLOGY_BUNDLE.runtimeHash }, async verifyArtifacts() {}, async runJsonl() { throw new Error("killed_worker_must_not_run"); } } });
    try {
      let baseUrl = await listen(app);
      const job = await createReadyJob(baseUrl);
      const opportunity = job.topologyOpportunities[0]!;
      const body = { opportunityId: opportunity.opportunityId, thermalConstructionSignature: opportunity.thermalConstructionSignature, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: opportunity.sourceAssemblyGroupIds?.[0] ?? job.architectActions.assemblies[0].assemblyGroupId, answers: { memberKind: "c", memberMaterial: "galvanized steel", memberWidthM: 0.075, repeatSpacingM: 0.6, continuousThroughLayers: true, exteriorBoundary: "external-wall", interiorBoundary: "internal" } };
      const killedResponse = await fetch(`${baseUrl}/api/jobs/${job.jobId}/topology-reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      expect(await killedResponse.json()).toMatchObject({ pilotRun: { disposition: "killed" } });
      await close(app);
      app = createLocalhostApp({ databasePath: join(root, "data", "app.db"), storageRoot: join(root, "storage"), outputRoot: join(root, "outputs"), topologyPilotPolicy: policy(true, false, "pilot-bundle-v2-compatible"), topologyWorker: createProvenPythonTopologyWorker({ pythonExecutable }) });
      baseUrl = await listen(app);
      const enabledResponse = await fetch(`${baseUrl}/api/jobs/${job.jobId}/topology-reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      expect(enabledResponse.status, await enabledResponse.clone().text()).toBe(202);
      expect((await enabledResponse.json()).results[0].outcome).toBe("preliminary-unsafe");
      const reloaded = await getJob(baseUrl, job.jobId);
      expect(reloaded.pilotRuns.map((run: any) => run.disposition)).toEqual(["killed", "completed"]);
      expect(reloaded.pilotRuns[0].policy.policyVersion).toBe("pilot-bundle-v1");
      expect(reloaded.pilotRuns[1].policy.policyVersion).toBe("pilot-bundle-v2-compatible");
      expect(reloaded.componentEvaluations).toHaveLength(1);
    } finally {
      await close(app);
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  }, 180_000);
});

async function createReadyJob(baseUrl: string): Promise<any> { const bytes = await readFile(resolve("tests/fixtures/ifc/repeating-c-profile.ifc")); const form = new FormData(); form.set("ifc", new Blob([bytes]), "repeating-c-profile.ifc"); const created = await json<any>(await fetch(`${baseUrl}/api/jobs`, { method: "POST", body: form })); let job = await waitForJob(baseUrl, created.jobId); if (!job.activeRevisionId) { const inputs = job.review.requestedInputs.map((input: any) => ({ requestedInputId: input.requestedInputId, value: input.datapoint === "layer_thickness" ? 0.15 : input.inputType === "number" ? 0.12 : "confirmed", unit: input.unit, overrideScope: "assembly_group" })); await fetch(`${baseUrl}/api/jobs/${job.jobId}/review-inputs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputs }) }); job = await waitForActiveRevision(baseUrl, job.jobId); } return job; }
async function waitForJob(baseUrl: string, jobId: string) { for (let index = 0; index < 100; index += 1) { const job = await getJob(baseUrl, jobId); if (job.jobStatus !== "queued" && job.jobStatus !== "processing") return job; await new Promise((resolveWait) => setTimeout(resolveWait, 20)); } throw new Error("Job did not settle"); }
async function waitForActiveRevision(baseUrl: string, jobId: string) { for (let index = 0; index < 100; index += 1) { const job = await getJob(baseUrl, jobId); if (job.activeRevisionId) return job; await new Promise((resolveWait) => setTimeout(resolveWait, 20)); } throw new Error("Job did not produce an active Revision"); }
async function getJob(baseUrl: string, jobId: string) { return await json<any>(await fetch(`${baseUrl}/api/jobs/${jobId}`)); }
async function listen(app: ReturnType<typeof createLocalhostApp>) { app.server.listen(0, "127.0.0.1"); await new Promise<void>((resolveListen) => app.server.once("listening", resolveListen)); const address = app.server.address(); if (!address || typeof address === "string") throw new Error("not bound"); return `http://127.0.0.1:${address.port}`; }
async function close(app: ReturnType<typeof createLocalhostApp>) { if (app.server.listening) await new Promise<void>((resolveClose, reject) => app.server.close((error) => error ? reject(error) : resolveClose())); app.close(); }
async function json<T>(response: Response) { return await response.json() as T; }
