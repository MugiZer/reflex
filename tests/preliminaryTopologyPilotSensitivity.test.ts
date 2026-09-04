import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { validatePreliminaryTopologyPilotEvidence } from "../src/verifier/preliminaryTopologyPilotEvidence.js";
import { createLocalhostApp } from "../src/app/http/httpServer.js";
import { createProvenPythonTopologyWorker, PROVEN_TOPOLOGY_BUNDLE } from "../src/infrastructure/topology/createProvenPythonTopologyWorker.js";
import { REPEATING_C_PROFILE_PATTERN } from "../src/domain/topology/patterns/repeatingCProfilePattern.js";
import type { TopologyWorkerRuntime } from "../src/domain/topology/topologyTypes.js";
import { validPilotEvidence } from "./helpers/preliminaryTopologyPilotEvidenceFixture.js";

const expected = { revision: "revision", testedTreeSha256: "a".repeat(64), proofIds: ["PILOT-A12"] };
const base = validPilotEvidence("PILOT-A12");

describe("preliminary topology pilot sensitivity probes", () => {
  it("rejects a missing proof", () => {
    expect(validatePreliminaryTopologyPilotEvidence({ ...base, proofs: [] }, expected).valid).toBe(false);
  });

  it("rejects an unexecuted proof", () => {
    expect(validatePreliminaryTopologyPilotEvidence({ ...base, counts: { selected: 1, passed: 0, failed: 0, unexecuted: 1 } }, expected).valid).toBe(false);
  });

  it("rejects a stale revision", () => {
    expect(validatePreliminaryTopologyPilotEvidence({ ...base, tested: { revision: "stale", testedTreeSha256: "a".repeat(64) } }, expected).valid).toBe(false);
  });

  it("rejects protected-state mutation", () => {
    expect(validatePreliminaryTopologyPilotEvidence({ ...base, protectedState: { ...base.protectedState, ifcBytes: { ...base.protectedState.ifcBytes, after: "3".repeat(64) } } }, expected).valid).toBe(false);
  });

  it("rejects a fabricated oracle value", () => {
    expect(validatePreliminaryTopologyPilotEvidence({ ...base, oracleValues: [0.1, 0.2, 0.3] }, expected).valid).toBe(false);
  });

  it("sensitivity public boundary rejects candidate pattern", async () => {
    await withHttpProbe({ componentPatterns: [{ ...REPEATING_C_PROFILE_PATTERN, lifecycle: "candidate" }] }, async ({ baseUrl, job }) => {
      const response = await postReview(baseUrl, job);
      expect(response.status).toBe(202);
      const loaded = await getJob(baseUrl, job.jobId);
      expect(loaded.componentEvaluations[0]).toMatchObject({ match: { outcome: "unmatched" }, state: "recoverable" });
      expect(loaded.pilotRuns).toEqual([]);
    });
  }, 60_000);

  it("sensitivity public boundary rejects skipped worker", async () => {
    let invocations = 0;
    await withHttpProbe({ topologyWorker: terminalWorker(() => { invocations += 1; }) }, async ({ baseUrl, job }) => {
      const response = await postReview(baseUrl, job);
      expect(response.status).toBe(202);
      const payload = await response.json() as any;
      expect(payload.state).toBe("published");
      expect(payload.results[0]).toMatchObject({ outcome: "failed", resultPayload: { effectiveUValueWPerM2K: null } });
      expect(invocations).toBeGreaterThan(0);
      expect((await getJob(baseUrl, job.jobId)).pilotRuns).toEqual([expect.objectContaining({ disposition: "failed" })]);
    });
  }, 60_000);

  it("sensitivity public boundary rejects a range with a failed scenario", async () => {
    const proven = createProvenPythonTopologyWorker({ pythonExecutable: resolve(process.env.TOPOLOGY_WORKER_PYTHON ?? ".scratch/component-topology-kernel/conformance-proof/.venv/Scripts/python.exe") });
    let calls = 0;
    const mixedWorker: TopologyWorkerRuntime = { runtimeIdentity: proven.runtimeIdentity, verifyArtifacts: proven.verifyArtifacts, async runJsonl(message, options) { calls += 1; if (calls === 2) throw Object.assign(new Error("sensitivity_failed_scenario"), { outcome: "failed" as const, code: "worker_process_failed", retryable: false }); return proven.runJsonl(message, options); } };
    await withHttpProbe({ topologyWorker: mixedWorker }, async ({ baseUrl, job }) => {
      const response = await postReview(baseUrl, job);
      expect(response.status).toBe(202);
      const payload = await response.json() as any;
      expect(payload.aggregate).toMatchObject({ outcome: "range-unavailable" });
      expect(payload.aggregate.payload.minUValueWPerM2K).toBeNull();
    });
  }, 120_000);

  it("sensitivity public boundary rejects a fabricated worker value", async () => {
    const proven = createProvenPythonTopologyWorker({ pythonExecutable: resolve(process.env.TOPOLOGY_WORKER_PYTHON ?? ".scratch/component-topology-kernel/conformance-proof/.venv/Scripts/python.exe") });
    await withHttpProbe({ topologyWorker: { runtimeIdentity: proven.runtimeIdentity, verifyArtifacts: proven.verifyArtifacts, async runJsonl(message: string, options: Parameters<TopologyWorkerRuntime["runJsonl"]>[1]) { const output = JSON.parse(await proven.runJsonl(message, options)); output.effectiveUValueWPerM2K = 0.123456; return JSON.stringify(output); } } }, async ({ baseUrl, job }) => {
      const response = await postReview(baseUrl, job);
      expect(response.status).toBe(202);
      const payload = await response.json() as any;
      expect(payload.results[0]).toMatchObject({ outcome: "rejected", resultPayload: { errorCode: "invalid_result", effectiveUValueWPerM2K: null } });
      expect(payload.aggregate.outcome).toBe("range-unavailable");
    });
  }, 120_000);
});

async function withHttpProbe(options: { componentPatterns?: readonly any[]; topologyWorker?: any }, run: (value: { baseUrl: string; job: any }) => Promise<void>, filename = "repeating-c-profile.ifc") {
  const root = await mkdtemp(join(tmpdir(), "preliminary-pilot-sensitivity-http-"));
  const app = createLocalhostApp({ databasePath: join(root, "data", "app.db"), storageRoot: join(root, "storage"), outputRoot: join(root, "outputs"), componentPatterns: options.componentPatterns, topologyWorker: options.topologyWorker ?? createProvenPythonTopologyWorker({ pythonExecutable: resolve(process.env.TOPOLOGY_WORKER_PYTHON ?? ".scratch/component-topology-kernel/conformance-proof/.venv/Scripts/python.exe") }) });
  try {
    const baseUrl = await listen(app);
    const job = await createReadyJob(baseUrl, filename);
    await run({ baseUrl, job });
  } finally { await close(app); await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); }
}
async function createReadyJob(baseUrl: string, filename: string): Promise<any> { const bytes = await readFile(resolve("tests/fixtures/ifc", filename)); const form = new FormData(); form.set("ifc", new Blob([bytes]), filename); const created = await json<any>(await fetch(`${baseUrl}/api/jobs`, { method: "POST", body: form })); let job = await waitForJob(baseUrl, created.jobId); if (!job.activeRevisionId) { const inputs = job.review.requestedInputs.map((input: any) => ({ requestedInputId: input.requestedInputId, value: input.datapoint === "layer_thickness" ? 0.15 : input.inputType === "number" ? 0.12 : "confirmed", unit: input.unit, overrideScope: "assembly_group" })); await fetch(`${baseUrl}/api/jobs/${job.jobId}/review-inputs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputs }) }); job = await waitForActiveRevision(baseUrl, job.jobId); } return job; }
async function postReview(baseUrl: string, job: any): Promise<Response> { const opportunity = job.topologyOpportunities[0]!; return fetch(`${baseUrl}/api/jobs/${job.jobId}/topology-reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opportunityId: opportunity.opportunityId, thermalConstructionSignature: opportunity.thermalConstructionSignature, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: opportunity.sourceAssemblyGroupIds?.[0] ?? job.architectActions.assemblies[0].assemblyGroupId, answers: { memberKind: "c", memberMaterial: "galvanized steel", memberWidthM: "i-dont-know", repeatSpacingM: 0.6, continuousThroughLayers: true, exteriorBoundary: "external-wall", interiorBoundary: "internal" } }) }); }
async function waitForJob(baseUrl: string, jobId: string) { for (let index = 0; index < 100; index += 1) { const job = await getJob(baseUrl, jobId); if (job.jobStatus !== "queued" && job.jobStatus !== "processing") return job; await new Promise((resolveWait) => setTimeout(resolveWait, 20)); } throw new Error("Job did not settle"); }
async function waitForActiveRevision(baseUrl: string, jobId: string) { for (let index = 0; index < 100; index += 1) { const job = await getJob(baseUrl, jobId); if (job.activeRevisionId) return job; await new Promise((resolveWait) => setTimeout(resolveWait, 20)); } throw new Error("Job did not produce an active Revision"); }
async function getJob(baseUrl: string, jobId: string) { return await (await fetch(`${baseUrl}/api/jobs/${jobId}`)).json() as any; }
async function listen(app: ReturnType<typeof createLocalhostApp>) { app.server.listen(0, "127.0.0.1"); await new Promise<void>((resolveListen) => app.server.once("listening", resolveListen)); const address = app.server.address(); if (!address || typeof address === "string") throw new Error("not bound"); return `http://127.0.0.1:${address.port}`; }
async function close(app: ReturnType<typeof createLocalhostApp>) { if (app.server.listening) await new Promise<void>((resolveClose, reject) => app.server.close((error) => error ? reject(error) : resolveClose())); app.close(); }
async function json<T>(response: Response) { return await response.json() as T; }
function terminalWorker(onRun: () => void) { return { runtimeIdentity: { executable: "sensitivity-terminal-worker", runtimeHash: PROVEN_TOPOLOGY_BUNDLE.runtimeHash }, async verifyArtifacts() {}, async runJsonl() { onRun(); throw Object.assign(new Error("sensitivity_worker_skipped"), { outcome: "failed" as const, code: "worker_process_failed" }); } }; }
