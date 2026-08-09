import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { createLocalhostApp } from "../src/app/http/httpServer.js";
import { createProvenPythonTopologyWorker, PROVEN_TOPOLOGY_BUNDLE } from "../src/infrastructure/topology/createProvenPythonTopologyWorker.js";
import { canonicalTopologyJson } from "../src/domain/topology/canonicalTopologyJson.js";

describe("preliminary topology pilot localhost seam", () => {
  it("localhost policy exclusions do not invoke topology work", async () => {
    const root = await mkdtemp(join(tmpdir(), "preliminary-pilot-http-"));
    let invocations = 0;
    const app = createLocalhostApp({
      databasePath: join(root, "data", "app.db"), storageRoot: join(root, "storage"), outputRoot: join(root, "outputs"),
      topologyPilotEnabled: false,
      topologyWorker: {
        runtimeIdentity: { executable: "test-only-policy-probe", runtimeHash: PROVEN_TOPOLOGY_BUNDLE.runtimeHash },
        async verifyArtifacts() {},
        async runJsonl() { invocations += 1; throw new Error("worker_must_not_run_for_disabled_policy"); },
      },
    });
    try {
      const baseUrl = await listen(app);
      const job = await createReadyJob(baseUrl);
      const opportunity = job.topologyOpportunities[0]!;
      const response = await fetch(`${baseUrl}/api/jobs/${job.jobId}/topology-reviews`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId: opportunity.opportunityId, thermalConstructionSignature: opportunity.thermalConstructionSignature, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: opportunity.sourceAssemblyGroupIds?.[0] ?? job.architectActions.assemblies[0].assemblyGroupId, answers: { memberKind: "c", memberMaterial: "galvanized steel", memberWidthM: 0.075, repeatSpacingM: 0.6, continuousThroughLayers: true, exteriorBoundary: "external-wall", interiorBoundary: "internal" } }),
      });
      expect(response.status, await response.clone().text()).toBe(202);
      expect(await response.json()).toMatchObject({ disposition: "disabled" });
      expect(invocations).toBe(0);
      expect((await getJob(baseUrl, job.jobId)).componentEvaluations).toEqual([]);
    } finally {
      await close(app);
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  }, 30_000);

  it("localhost policy exclusions do not invoke topology work", async () => {
    const cases = [
      { name: "cohort-excluded", policy: { enabled: true, cohort: { kind: "job-id-allow-list", jobIds: ["not-this-job"] }, killSwitch: { active: false, reasonCode: null, version: "kill-switch-v1" } } },
      { name: "killed", policy: { enabled: true, cohort: { kind: "all" }, killSwitch: { active: true, reasonCode: "operator_kill", version: "kill-switch-v2" } } },
    ] as const;
    for (const item of cases) {
      const root = await mkdtemp(join(tmpdir(), `preliminary-pilot-${item.name}-`));
      let invocations = 0;
      const app = createLocalhostApp({ databasePath: join(root, "data", "app.db"), storageRoot: join(root, "storage"), outputRoot: join(root, "outputs"), topologyPilotPolicy: { schema: "topology-pilot-policy/v1", policyVersion: `pilot-policy-${item.name}`, enabled: item.policy.enabled, cohort: item.policy.cohort, killSwitch: item.policy.killSwitch, bundle: PROVEN_TOPOLOGY_BUNDLE, retry: { maxAttempts: 2, retryableCodes: [], backoffMs: 250 }, limits: { maxScenarioCount: 3, deadlineMs: 30_000 }, retention: { temporary: "terminal-cleanup", failedDays: 7, unreferencedPublishedDays: 30 } }, topologyWorker: { runtimeIdentity: { executable: "test-only-policy-probe", runtimeHash: PROVEN_TOPOLOGY_BUNDLE.runtimeHash }, async verifyArtifacts() {}, async runJsonl() { invocations += 1; throw new Error("worker_must_not_run_for_policy_exclusion"); } } });
      try {
        const baseUrl = await listen(app);
        const job = await createReadyJob(baseUrl);
        const opportunity = job.topologyOpportunities[0]!;
        const response = await fetch(`${baseUrl}/api/jobs/${job.jobId}/topology-reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opportunityId: opportunity.opportunityId, thermalConstructionSignature: opportunity.thermalConstructionSignature, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: opportunity.sourceAssemblyGroupIds?.[0] ?? job.architectActions.assemblies[0].assemblyGroupId, answers: { memberKind: "c", memberMaterial: "galvanized steel", memberWidthM: 0.075, repeatSpacingM: 0.6, continuousThroughLayers: true, exteriorBoundary: "external-wall", interiorBoundary: "internal" } }) });
        expect(response.status, await response.clone().text()).toBe(202);
        expect(await response.json()).toMatchObject({ pilotRun: { disposition: item.name, errorCode: expect.stringMatching(/^topology_pilot_/) } });
        const reloaded = await getJob(baseUrl, job.jobId);
        expect(reloaded.pilotRuns).toEqual([expect.objectContaining({ disposition: item.name })]);
        expect(reloaded.componentEvaluations).toEqual([]);
        expect(invocations).toBe(0);
      } finally {
        await close(app);
        await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
      }
    }
  }, 60_000);

  it("localhost eligible review uses the durable Ticket 4 evaluator", async () => {
    const root = await mkdtemp(join(tmpdir(), "preliminary-pilot-eligible-"));
    const pythonExecutable = resolve(process.env.TOPOLOGY_WORKER_PYTHON ?? ".scratch/component-topology-kernel/conformance-proof/.venv/Scripts/python.exe");
    let app = createLocalhostApp({ databasePath: join(root, "data", "app.db"), storageRoot: join(root, "storage"), outputRoot: join(root, "outputs"), topologyWorker: createProvenPythonTopologyWorker({ pythonExecutable }) });
    try {
      let baseUrl = await listen(app);
      const job = await createReadyJob(baseUrl);
      const opportunity = job.topologyOpportunities[0]!;
      const body = { opportunityId: opportunity.opportunityId, thermalConstructionSignature: opportunity.thermalConstructionSignature, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: opportunity.sourceAssemblyGroupIds?.[0] ?? job.architectActions.assemblies[0].assemblyGroupId, answers: { memberKind: "c", memberMaterial: "galvanized steel", memberWidthM: 0.075, repeatSpacingM: 0.6, continuousThroughLayers: true, exteriorBoundary: "external-wall", interiorBoundary: "internal" } };
      const response = await fetch(`${baseUrl}/api/jobs/${job.jobId}/topology-reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      expect(response.status, await response.clone().text()).toBe(202);
      const result = await response.json() as any;
      expect(result).toMatchObject({ state: "published", results: [{ outcome: "preliminary-unsafe" }] });
      const oracle = JSON.parse(await readFile(resolve("tests/fixtures/component-patterns/repeating-c-profile-oracle-v1.json"), "utf8"));
      expect(Math.abs(result.results[0].resultPayload.effectiveUValueWPerM2K - oracle.scenarios[1].expectedUValueWPerM2K)).toBeLessThanOrEqual(oracle.absoluteToleranceWPerM2K);
      expect(result.results[0].resultPayload.bundle.runtimeHash).toBe(PROVEN_TOPOLOGY_BUNDLE.runtimeHash);
      const firstJob = await getJob(baseUrl, job.jobId);
      expect(firstJob.componentEvaluations).toHaveLength(1);
      expect(firstJob.pilotRuns).toEqual([expect.objectContaining({ disposition: "completed" })]);
      const report = await (await fetch(`${baseUrl}/api/jobs/${job.jobId}/report`)).text();
      expect(report).toContain("Component topology evaluation");
      await close(app);
      app = createLocalhostApp({ databasePath: join(root, "data", "app.db"), storageRoot: join(root, "storage"), outputRoot: join(root, "outputs"), topologyWorker: createProvenPythonTopologyWorker({ pythonExecutable }) });
      baseUrl = await listen(app);
      const restarted = await getJob(baseUrl, job.jobId);
      expect(restarted.componentEvaluations[0]).toEqual(result);
      expect(restarted.pilotRuns).toEqual(firstJob.pilotRuns);
      expect(await (await fetch(`${baseUrl}/api/jobs/${job.jobId}/report`)).text()).toContain("Component topology evaluation");
      if (process.env.PILOT_PROTECTED_STATE_PATH) {
        const protectedState = protectedStateObservation(firstJob, restarted);
        console.log(`PILOT_PROTECTED_STATE ${JSON.stringify(protectedState)}`);
        await writeFile(process.env.PILOT_PROTECTED_STATE_PATH, JSON.stringify(protectedState), "utf8");
      }
    } finally {
      await close(app);
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  }, 180_000);

  it("report reloads the persisted pilot result without fabrication", async () => {
    const root = await mkdtemp(join(tmpdir(), "preliminary-pilot-report-"));
    const pythonExecutable = resolve(process.env.TOPOLOGY_WORKER_PYTHON ?? ".scratch/component-topology-kernel/conformance-proof/.venv/Scripts/python.exe");
    let app = createLocalhostApp({ databasePath: join(root, "data", "app.db"), storageRoot: join(root, "storage"), outputRoot: join(root, "outputs"), topologyWorker: createProvenPythonTopologyWorker({ pythonExecutable }) });
    try {
      let baseUrl = await listen(app);
      const job = await createReadyJob(baseUrl);
      const opportunity = job.topologyOpportunities[0]!;
      const body = { opportunityId: opportunity.opportunityId, thermalConstructionSignature: opportunity.thermalConstructionSignature, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: opportunity.sourceAssemblyGroupIds?.[0] ?? job.architectActions.assemblies[0].assemblyGroupId, answers: { memberKind: "c", memberMaterial: "galvanized steel", memberWidthM: 0.075, repeatSpacingM: 0.6, continuousThroughLayers: true, exteriorBoundary: "external-wall", interiorBoundary: "internal" } };
      const response = await fetch(`${baseUrl}/api/jobs/${job.jobId}/topology-reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as any;
      const expectedValue = result.results[0].resultPayload.effectiveUValueWPerM2K;
      const reportBefore = await (await fetch(`${baseUrl}/api/jobs/${job.jobId}/report`)).text();
      expect(reportBefore).toContain(expectedValue.toFixed(3));
      expect(reportBefore).toContain("Layer-only Calculation Snapshot");
      await close(app);
      app = createLocalhostApp({ databasePath: join(root, "data", "app.db"), storageRoot: join(root, "storage"), outputRoot: join(root, "outputs"), topologyWorker: createProvenPythonTopologyWorker({ pythonExecutable }) });
      baseUrl = await listen(app);
      const reportAfter = await (await fetch(`${baseUrl}/api/jobs/${job.jobId}/report`)).text();
      expect(reportAfter).toContain(expectedValue.toFixed(3));
      expect(reportAfter).toContain("Layer-only Calculation Snapshot");
      expect(reportAfter).toContain("Preliminary");
      expect(reportAfter).not.toContain(">Verified<");
      const secondResponse = await fetch(`${baseUrl}/api/jobs/${job.jobId}/topology-reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, answers: { ...body.answers, memberWidthM: 0.041 } }) });
      expect(secondResponse.status, await secondResponse.clone().text()).toBe(202);
      const withTwoRuns = await getJob(baseUrl, job.jobId);
      const secondGraph = withTwoRuns.componentEvaluations.find((graph: any) => graph.evaluation.evaluationId !== result.evaluation.evaluationId);
      const secondRun = withTwoRuns.pilotRuns.find((run: any) => run.evaluationId === secondGraph?.evaluation.evaluationId);
      expect(secondGraph).toBeTruthy();
      expect(secondRun).toBeTruthy();
      const db = new DatabaseSync(join(root, "data", "app.db"));
      db.prepare("delete from topology_pilot_runs where pilot_run_id = ?").run(secondRun.pilotRunId);
      db.close();
      const orphanedReport = await (await fetch(`${baseUrl}/api/jobs/${job.jobId}/report`)).text();
      expect(orphanedReport).toContain("Component topology result unavailable");
      expect(orphanedReport).not.toContain(secondGraph.evaluation.evaluationId);
    } finally {
      await close(app);
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  }, 180_000);

  it("invalid or incomplete persisted success fails closed", async () => {
    const root = await mkdtemp(join(tmpdir(), "preliminary-pilot-corrupt-"));
    const pythonExecutable = resolve(process.env.TOPOLOGY_WORKER_PYTHON ?? ".scratch/component-topology-kernel/conformance-proof/.venv/Scripts/python.exe");
    const databasePath = join(root, "data", "app.db");
    const app = createLocalhostApp({ databasePath, storageRoot: join(root, "storage"), outputRoot: join(root, "outputs"), topologyWorker: createProvenPythonTopologyWorker({ pythonExecutable }) });
    try {
      const baseUrl = await listen(app);
      const job = await createReadyJob(baseUrl);
      const opportunity = job.topologyOpportunities[0]!;
      await fetch(`${baseUrl}/api/jobs/${job.jobId}/topology-reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opportunityId: opportunity.opportunityId, thermalConstructionSignature: opportunity.thermalConstructionSignature, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: opportunity.sourceAssemblyGroupIds?.[0] ?? job.architectActions.assemblies[0].assemblyGroupId, answers: { memberKind: "c", memberMaterial: "galvanized steel", memberWidthM: 0.075, repeatSpacingM: 0.6, continuousThroughLayers: true, exteriorBoundary: "external-wall", interiorBoundary: "internal" } }) });
      const before = await getJob(baseUrl, job.jobId);
      const layerBefore = JSON.stringify(before.architectActions.assemblies);
      const db = new DatabaseSync(databasePath);
      db.prepare("update component_evaluation_results set payload_json = ?").run("{}");
      db.close();
      const reloaded = await getJob(baseUrl, job.jobId);
      expect(reloaded.componentEvaluations).toEqual([]);
      expect(reloaded.componentEvaluationDiagnostic).toContain("component_evaluation_corrupted");
      expect(JSON.stringify(reloaded.architectActions.assemblies)).toBe(layerBefore);
      const report = await (await fetch(`${baseUrl}/api/jobs/${job.jobId}/report`)).text();
      expect(report).toContain("Component topology result unavailable");
      expect(report).not.toContain("Preliminary — not verified");
    } finally {
      await close(app);
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  }, 180_000);
});

async function createReadyJob(baseUrl: string): Promise<any> {
  const bytes = await readFile(resolve("tests/fixtures/ifc/repeating-c-profile.ifc"));
  const form = new FormData(); form.set("ifc", new Blob([bytes]), "repeating-c-profile.ifc");
  const created = await json<any>(await fetch(`${baseUrl}/api/jobs`, { method: "POST", body: form }));
  let job = await waitForJob(baseUrl, created.jobId);
  if (!job.activeRevisionId) {
    const inputs = job.review.requestedInputs.map((input: any) => ({ requestedInputId: input.requestedInputId, value: input.datapoint === "layer_thickness" ? 0.15 : input.inputType === "number" ? 0.12 : "confirmed", unit: input.unit, overrideScope: "assembly_group" }));
    const response = await fetch(`${baseUrl}/api/jobs/${job.jobId}/review-inputs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputs }) });
    if (!response.ok) throw new Error(await response.text());
    job = await waitForActiveRevision(baseUrl, job.jobId);
  }
  return job;
}
async function waitForJob(baseUrl: string, jobId: string) { for (let index = 0; index < 100; index += 1) { const job = await getJob(baseUrl, jobId); if (job.jobStatus !== "queued" && job.jobStatus !== "processing") return job; await new Promise((resolveWait) => setTimeout(resolveWait, 20)); } throw new Error("Job did not settle"); }
async function waitForActiveRevision(baseUrl: string, jobId: string) { for (let index = 0; index < 100; index += 1) { const job = await getJob(baseUrl, jobId); if (job.activeRevisionId) return job; await new Promise((resolveWait) => setTimeout(resolveWait, 20)); } throw new Error("Job did not produce an active Revision"); }
async function getJob(baseUrl: string, jobId: string) { return await json<any>(await fetch(`${baseUrl}/api/jobs/${jobId}`)); }
async function listen(app: ReturnType<typeof createLocalhostApp>) { app.server.listen(0, "127.0.0.1"); await new Promise<void>((resolveListen) => app.server.once("listening", resolveListen)); const address = app.server.address(); if (!address || typeof address === "string") throw new Error("not bound"); return `http://127.0.0.1:${address.port}`; }
async function close(app: ReturnType<typeof createLocalhostApp>) { if (app.server.listening) await new Promise<void>((resolveClose, reject) => app.server.close((error) => error ? reject(error) : resolveClose())); app.close(); }
async function json<T>(response: Response) { return await response.json() as T; }
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function protectedStateObservation(before: any, after: any) {
  const section = (beforeValue: unknown, afterValue: unknown) => {
    const beforeContent = canonicalTopologyJson(beforeValue as any);
    const afterContent = canonicalTopologyJson(afterValue as any);
    return { before: sha256(beforeContent), after: sha256(afterContent), beforeContent, afterContent };
  };
  return {
    ifcBytes: { before: before.fileHash, after: after.fileHash },
    evidenceLedger: section(before.review?.context ?? null, after.review?.context ?? null),
    revisionHistory: section({ activeRevisionId: before.activeRevisionId, review: before.review?.context ?? null }, { activeRevisionId: after.activeRevisionId, review: after.review?.context ?? null }),
    layerOnlySnapshot: section(before.architectActions?.assemblies ?? null, after.architectActions?.assemblies ?? null),
    evaluationGraph: section(before.componentEvaluations ?? [], after.componentEvaluations ?? []),
    publishedArtifacts: section((before.componentEvaluations ?? []).flatMap((graph: any) => graph.results.map((result: any) => ({ scenarioResultId: result.scenarioResultId, artifactIdentity: result.artifactIdentity, artifactIndex: result.resultPayload?.evidence?.artifactIndex ?? null }))), (after.componentEvaluations ?? []).flatMap((graph: any) => graph.results.map((result: any) => ({ scenarioResultId: result.scenarioResultId, artifactIdentity: result.artifactIdentity, artifactIndex: result.resultPayload?.evidence?.artifactIndex ?? null })))),
    pilotRecords: section({ runs: before.pilotRuns ?? [], events: before.pilotEvents ?? [] }, { runs: after.pilotRuns ?? [], events: after.pilotEvents ?? [] }),
  };
}
