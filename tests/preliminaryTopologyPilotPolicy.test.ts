import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createLocalhostApp } from "../src/app/http/httpServer.js";
import { PROVEN_TOPOLOGY_BUNDLE } from "../src/infrastructure/topology/createProvenPythonTopologyWorker.js";
import { REPEATING_C_PROFILE_PATTERN } from "../src/domain/topology/patterns/repeatingCProfilePattern.js";

describe("preliminary topology pilot policy", () => {
  it("pilot policy produces deterministic typed decisions", async () => {
    const root = await mkdtemp(join(tmpdir(), "preliminary-pilot-policy-"));
    const policy = {
      schema: "topology-pilot-policy/v1",
      policyVersion: "pilot-policy-2026-08-04",
      enabled: false,
      cohort: { kind: "all" },
      killSwitch: { active: false, reasonCode: null, version: "kill-switch-v1" },
      bundle: PROVEN_TOPOLOGY_BUNDLE,
      retry: { maxAttempts: 2, retryableCodes: ["topology_runtime_unavailable"], backoffMs: 250 },
      limits: { maxScenarioCount: 3, deadlineMs: 30_000 },
      retention: { temporary: "terminal-cleanup", failedDays: 7, unreferencedPublishedDays: 30 },
    } as const;
    const app = createLocalhostApp({
      databasePath: join(root, "data", "app.db"), storageRoot: join(root, "storage"), outputRoot: join(root, "outputs"),
      topologyPilotPolicy: policy,
      topologyWorker: {
        runtimeIdentity: { executable: "test-only-policy-probe", runtimeHash: PROVEN_TOPOLOGY_BUNDLE.runtimeHash },
        async verifyArtifacts() {},
        async runJsonl() { throw new Error("worker_must_not_run_for_disabled_policy"); },
      },
    } as Parameters<typeof createLocalhostApp>[0] & { topologyPilotPolicy: typeof policy });
    try {
      const baseUrl = await listen(app);
      const job = await createReadyJob(baseUrl);
      const opportunity = job.topologyOpportunities[0]!;
      const response = await fetch(`${baseUrl}/api/jobs/${job.jobId}/topology-reviews`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId: opportunity.opportunityId, thermalConstructionSignature: opportunity.thermalConstructionSignature, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: opportunity.sourceAssemblyGroupIds?.[0] ?? job.architectActions.assemblies[0].assemblyGroupId, answers: { memberKind: "c", memberMaterial: "galvanized steel", memberWidthM: 0.075, repeatSpacingM: 0.6, continuousThroughLayers: true, exteriorBoundary: "external-wall", interiorBoundary: "internal" } }),
      });

      expect(response.status, await response.clone().text()).toBe(202);
      expect(await response.json()).toMatchObject({
        disposition: "disabled",
        policy: {
          schema: "topology-pilot-policy/v1",
          policyVersion: "pilot-policy-2026-08-04",
          decisionId: expect.stringMatching(/^[a-f0-9]{64}$/),
          decisionCode: "topology_pilot_disabled",
        },
      });
    } finally {
      await close(app);
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  }, 30_000);

  it("pilot records remain separate from component evaluation records", async () => {
    const root = await mkdtemp(join(tmpdir(), "preliminary-pilot-separation-"));
    const app = createLocalhostApp({
      databasePath: join(root, "data", "app.db"), storageRoot: join(root, "storage"), outputRoot: join(root, "outputs"),
      topologyPilotPolicy: { schema: "topology-pilot-policy/v1", policyVersion: "pilot-policy-separation-v1", enabled: false, cohort: { kind: "all" }, killSwitch: { active: false, reasonCode: null, version: "kill-switch-v1" }, bundle: PROVEN_TOPOLOGY_BUNDLE, retry: { maxAttempts: 2, retryableCodes: [], backoffMs: 250 }, limits: { maxScenarioCount: 3, deadlineMs: 30_000 }, retention: { temporary: "terminal-cleanup", failedDays: 7, unreferencedPublishedDays: 30 } },
    } as Parameters<typeof createLocalhostApp>[0] & { topologyPilotPolicy: unknown });
    try {
      const baseUrl = await listen(app);
      const job = await createReadyJob(baseUrl);
      const opportunity = job.topologyOpportunities[0]!;
      const response = await fetch(`${baseUrl}/api/jobs/${job.jobId}/topology-reviews`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId: opportunity.opportunityId, thermalConstructionSignature: opportunity.thermalConstructionSignature, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: opportunity.sourceAssemblyGroupIds?.[0] ?? job.architectActions.assemblies[0].assemblyGroupId, answers: { memberKind: "c", memberMaterial: "galvanized steel", memberWidthM: 0.075, repeatSpacingM: 0.6, continuousThroughLayers: true, exteriorBoundary: "external-wall", interiorBoundary: "internal" } }),
      });

      expect(response.status, await response.clone().text()).toBe(202);
      expect(await response.json()).toMatchObject({ pilotRun: { disposition: "disabled", policy: { policyVersion: "pilot-policy-separation-v1" } } });
      const reloaded = await getJob(baseUrl, job.jobId);
      expect(reloaded.pilotRuns).toHaveLength(1);
      expect(reloaded.topologyReviews).toEqual([]);
      expect(reloaded.componentEvaluations).toEqual([]);
    } finally {
      await close(app);
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  }, 30_000);

  it("server-owned scenario limits fail closed before worker launch", async () => {
    const root = await mkdtemp(join(tmpdir(), "preliminary-pilot-limits-"));
    let invocations = 0;
    const app = createLocalhostApp({
      databasePath: join(root, "data", "app.db"), storageRoot: join(root, "storage"), outputRoot: join(root, "outputs"),
      topologyPilotPolicy: { schema: "topology-pilot-policy/v1", policyVersion: "pilot-policy-limits-v1", enabled: true, cohort: { kind: "all" }, killSwitch: { active: false, reasonCode: null, version: "kill-switch-v1" }, bundle: PROVEN_TOPOLOGY_BUNDLE, retry: { maxAttempts: 2, retryableCodes: [], backoffMs: 250 }, limits: { maxScenarioCount: 2, deadlineMs: 30_000 }, retention: { temporary: "terminal-cleanup", failedDays: 7, unreferencedPublishedDays: 30 } },
      componentPatterns: [{ ...REPEATING_C_PROFILE_PATTERN, permittedUnknowns: [{ ...REPEATING_C_PROFILE_PATTERN.permittedUnknowns[0]!, values: [0.041, 0.075, 0.1] }] }],
      topologyWorker: { runtimeIdentity: { executable: "test-only-limit-worker", runtimeHash: PROVEN_TOPOLOGY_BUNDLE.runtimeHash }, async verifyArtifacts() {}, async runJsonl() { invocations += 1; throw new Error("worker_must_not_run_over_limit"); } },
    });
    try {
      const baseUrl = await listen(app);
      const job = await createReadyJob(baseUrl);
      const opportunity = job.topologyOpportunities[0]!;
      const response = await fetch(`${baseUrl}/api/jobs/${job.jobId}/topology-reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opportunityId: opportunity.opportunityId, thermalConstructionSignature: opportunity.thermalConstructionSignature, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: opportunity.sourceAssemblyGroupIds?.[0] ?? job.architectActions.assemblies[0].assemblyGroupId, answers: { memberKind: "c", memberMaterial: "galvanized steel", memberWidthM: "i-dont-know", repeatSpacingM: 0.6, continuousThroughLayers: true, exteriorBoundary: "external-wall", interiorBoundary: "internal" } }) });
      expect(response.status, await response.clone().text()).toBe(202);
      expect(await response.json()).toMatchObject({ pilotRun: { disposition: "failed", errorCode: "scenario_count_exceeds_policy_limit" } });
      expect(invocations).toBe(0);
      expect((await getJob(baseUrl, job.jobId)).componentEvaluations).toEqual([]);
    } finally {
      await close(app);
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  }, 30_000);
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
