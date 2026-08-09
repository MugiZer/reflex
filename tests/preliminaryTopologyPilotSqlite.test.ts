import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createLocalhostApp } from "../src/app/http/httpServer.js";
import { PROVEN_TOPOLOGY_BUNDLE } from "../src/infrastructure/topology/createProvenPythonTopologyWorker.js";
import { SqliteJobRepository } from "../src/infrastructure/persistence/sqlite/SqliteJobRepository.js";

describe("preliminary topology pilot SQLite persistence", () => {
  it("pilot disposition survives a fresh SQLite reader", async () => {
    const root = await mkdtemp(join(tmpdir(), "preliminary-pilot-sqlite-"));
    const config = { databasePath: join(root, "data", "app.db"), storageRoot: join(root, "storage"), outputRoot: join(root, "outputs"), topologyPilotPolicy: { schema: "topology-pilot-policy/v1", policyVersion: "pilot-policy-reload-v1", enabled: false, cohort: { kind: "all" }, killSwitch: { active: false, reasonCode: null, version: "kill-switch-v1" }, bundle: PROVEN_TOPOLOGY_BUNDLE, retry: { maxAttempts: 2, retryableCodes: [], backoffMs: 250 }, limits: { maxScenarioCount: 3, deadlineMs: 30_000 }, retention: { temporary: "terminal-cleanup", failedDays: 7, unreferencedPublishedDays: 30 } } } as const;
    let app = createLocalhostApp(config);
    try {
      let baseUrl = await listen(app);
      const job = await createReadyJob(baseUrl);
      const opportunity = job.topologyOpportunities[0]!;
      const response = await fetch(`${baseUrl}/api/jobs/${job.jobId}/topology-reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opportunityId: opportunity.opportunityId, thermalConstructionSignature: opportunity.thermalConstructionSignature, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: opportunity.sourceAssemblyGroupIds?.[0] ?? job.architectActions.assemblies[0].assemblyGroupId, answers: { memberKind: "c", memberMaterial: "galvanized steel", memberWidthM: 0.075, repeatSpacingM: 0.6, continuousThroughLayers: true, exteriorBoundary: "external-wall", interiorBoundary: "internal" } }) });
      const published = await json<any>(response);
      await close(app);
      app = createLocalhostApp(config);
      baseUrl = await listen(app);
      const reloaded = await getJob(baseUrl, job.jobId);

      expect(reloaded.pilotRuns).toEqual([published.pilotRun]);
      expect(reloaded.topologyReviews).toEqual([]);
      expect(reloaded.componentEvaluations).toEqual([]);
    } finally {
      await close(app);
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  }, 30_000);

  it("interrupted pilot publication is not a trusted success", async () => {
    const root = await mkdtemp(join(tmpdir(), "preliminary-pilot-interrupted-"));
    const config = { databasePath: join(root, "data", "app.db"), storageRoot: join(root, "storage"), outputRoot: join(root, "outputs"), topologyWorker: { runtimeIdentity: { executable: "test-only-interrupted-worker", runtimeHash: PROVEN_TOPOLOGY_BUNDLE.runtimeHash }, async verifyArtifacts() {}, async runJsonl() { throw new Error("interrupted_worker_publication"); } } } as const;
    const app = createLocalhostApp(config);
    try {
      const baseUrl = await listen(app);
      const job = await createReadyJob(baseUrl);
      const opportunity = job.topologyOpportunities[0]!;
      const response = await fetch(`${baseUrl}/api/jobs/${job.jobId}/topology-reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opportunityId: opportunity.opportunityId, thermalConstructionSignature: opportunity.thermalConstructionSignature, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: opportunity.sourceAssemblyGroupIds?.[0] ?? job.architectActions.assemblies[0].assemblyGroupId, answers: { memberKind: "c", memberMaterial: "galvanized steel", memberWidthM: 0.075, repeatSpacingM: 0.6, continuousThroughLayers: true, exteriorBoundary: "external-wall", interiorBoundary: "internal" } }) });
      expect(response.status, await response.clone().text()).toBe(202);
      const reloaded = await getJob(baseUrl, job.jobId);
      expect(reloaded.pilotRuns).toEqual([expect.objectContaining({ disposition: "failed", errorCode: "worker_failure" })]);
      expect(reloaded.componentEvaluations[0]?.aggregate?.outcome).toBe("range-unavailable");
      expect(reloaded.componentEvaluations[0]?.results[0]?.resultPayload.effectiveUValueWPerM2K).toBeNull();
      const report = await fetch(`${baseUrl}/api/jobs/${job.jobId}/report`);
      expect(await report.text()).not.toContain("Preliminary topology result");
    } finally {
      await close(app);
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  }, 30_000);

  it("pilot event history is append-only and idempotent", async () => {
    const root = await mkdtemp(join(tmpdir(), "preliminary-pilot-events-"));
    const repository = new SqliteJobRepository(join(root, "data", "app.db"));
    try {
      repository.createJob({ jobId: "job_events", jobStatus: "completed", originalFilename: "fixture.ifc", uploadPath: "fixture.ifc", fileHash: "fixture", createdAt: "2026-08-04T00:00:00.000Z", updatedAt: "2026-08-04T00:00:00.000Z", errorMessage: null, reportPath: null, activeRevisionId: "revision_events" });
      const event = { eventId: "event_1", eventType: "pilot.disposition.persisted", runId: "run_1", jobId: "job_events", sourceRevisionId: "revision_events", sourceAssemblyGroupId: "assembly_events", correlationId: "correlation_1", code: "topology_pilot_disabled", payloadHash: "a".repeat(64), createdAt: "2026-08-04T00:00:01.000Z" };
      const saveEvent = (repository as unknown as { saveTopologyPilotEvent?: (value: unknown) => void }).saveTopologyPilotEvent?.bind(repository);
      expect(saveEvent).toEqual(expect.any(Function));
      saveEvent!(event);
      saveEvent!(event);
      const listEvents = (repository as unknown as { listTopologyPilotEvents?: (jobId: string) => unknown[] }).listTopologyPilotEvents?.bind(repository);
      expect(listEvents!("job_events")).toEqual([event]);
      expect(() => saveEvent!({ ...event, code: "tampered" })).toThrow();
    } finally {
      repository.close();
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  });

  it("does not return a pilot disposition until its event is durable, and repairs an orphaned run on replay", async () => {
    const root = await mkdtemp(join(tmpdir(), "preliminary-pilot-event-repair-"));
    const app = createLocalhostApp({ databasePath: join(root, "data", "app.db"), storageRoot: join(root, "storage"), outputRoot: join(root, "outputs"), topologyPilotEnabled: false });
    const saveEvent = app.jobs.saveTopologyPilotEvent!.bind(app.jobs);
    app.jobs.saveTopologyPilotEvent = () => { throw new Error("event_store_temporarily_unavailable"); };
    try {
      const baseUrl = await listen(app);
      const job = await createReadyJob(baseUrl);
      const opportunity = job.topologyOpportunities[0]!;
      const body = { opportunityId: opportunity.opportunityId, thermalConstructionSignature: opportunity.thermalConstructionSignature, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: opportunity.sourceAssemblyGroupIds?.[0] ?? job.architectActions.assemblies[0].assemblyGroupId, answers: { memberKind: "c", memberMaterial: "galvanized steel", memberWidthM: 0.075 } };

      const failed = await fetch(`${baseUrl}/api/jobs/${job.jobId}/topology-reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      expect(failed.status).toBe(500);
      expect((await getJob(baseUrl, job.jobId)).pilotEvents).toEqual([]);

      app.jobs.saveTopologyPilotEvent = saveEvent;
      const replay = await fetch(`${baseUrl}/api/jobs/${job.jobId}/topology-reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      expect(replay.status, await replay.clone().text()).toBe(202);
      const reloaded = await getJob(baseUrl, job.jobId);
      expect(reloaded.pilotRuns).toHaveLength(1);
      expect(reloaded.pilotEvents).toHaveLength(1);
      expect((await replay.json()).pilotRun.pilotRunId).toBe(reloaded.pilotRuns[0].pilotRunId);
    } finally {
      await close(app);
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  }, 30_000);
});

async function createReadyJob(baseUrl: string): Promise<any> { const bytes = await readFile(resolve("tests/fixtures/ifc/repeating-c-profile.ifc")); const form = new FormData(); form.set("ifc", new Blob([bytes]), "repeating-c-profile.ifc"); const created = await json<any>(await fetch(`${baseUrl}/api/jobs`, { method: "POST", body: form })); let job = await waitForJob(baseUrl, created.jobId); if (!job.activeRevisionId) { const inputs = job.review.requestedInputs.map((input: any) => ({ requestedInputId: input.requestedInputId, value: input.datapoint === "layer_thickness" ? 0.15 : input.inputType === "number" ? 0.12 : "confirmed", unit: input.unit, overrideScope: "assembly_group" })); await fetch(`${baseUrl}/api/jobs/${job.jobId}/review-inputs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputs }) }); job = await waitForActiveRevision(baseUrl, job.jobId); } return job; }
async function waitForJob(baseUrl: string, jobId: string) { for (let index = 0; index < 100; index += 1) { const job = await getJob(baseUrl, jobId); if (job.jobStatus !== "queued" && job.jobStatus !== "processing") return job; await new Promise((resolveWait) => setTimeout(resolveWait, 20)); } throw new Error("Job did not settle"); }
async function waitForActiveRevision(baseUrl: string, jobId: string) { for (let index = 0; index < 100; index += 1) { const job = await getJob(baseUrl, jobId); if (job.activeRevisionId) return job; await new Promise((resolveWait) => setTimeout(resolveWait, 20)); } throw new Error("Job did not produce an active Revision"); }
async function getJob(baseUrl: string, jobId: string) { return await json<any>(await fetch(`${baseUrl}/api/jobs/${jobId}`)); }
async function listen(app: ReturnType<typeof createLocalhostApp>) { app.server.listen(0, "127.0.0.1"); await new Promise<void>((resolveListen) => app.server.once("listening", resolveListen)); const address = app.server.address(); if (!address || typeof address === "string") throw new Error("not bound"); return `http://127.0.0.1:${address.port}`; }
async function close(app: ReturnType<typeof createLocalhostApp>) { if (app.server.listening) await new Promise<void>((resolveClose, reject) => app.server.close((error) => error ? reject(error) : resolveClose())); app.close(); }
async function json<T>(response: Response) { return await response.json() as T; }
