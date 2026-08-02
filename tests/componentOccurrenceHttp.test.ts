import { readFile, mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createLocalhostApp } from "../src/app/http/httpServer.js";
import { PROVEN_TOPOLOGY_BUNDLE } from "../src/infrastructure/topology/createProvenPythonTopologyWorker.js";

const fixturePath = resolve("tests/fixtures/ifc/repeating-c-profile.ifc");

describe("component occurrence localhost recording", () => {
  it("localhost IFC review records a matched component occurrence", async () => {
    await withJob(async ({ baseUrl, job, restart }) => {
      const before = JSON.stringify(job.architectActions.assemblies);
      const candidate = job.topologyOpportunities[0]!;
      const response = await postReview(baseUrl, job, candidate, { memberKind: "c", memberMaterial: "galvanized steel", memberWidthM: 0.075 });
      expect(response.status, await response.clone().text()).toBe(202);
      const reloaded = await json<any>(await fetch(`${baseUrl}/api/jobs/${job.jobId}`));
      expect(reloaded.componentEvaluations[0]).toMatchObject({ evidence: { ifcImportId: expect.any(String) }, occurrence: { opportunityId: candidate.opportunityId }, match: { outcome: "matched", patternId: "repeating-metal-c-profile", patternVersion: "1.0.0" } });
      expect(JSON.stringify(reloaded.architectActions.assemblies)).toBe(before);
      expect(reloaded.fileHash).toBe(job.fileHash);
      expect(await responseHash(`${baseUrl}/api/jobs/${job.jobId}/ifc`)).toBe(job.fileHash);
      const restarted = await restart();
      expect(restarted.job.componentEvaluations[0]).toEqual(reloaded.componentEvaluations[0]);
      expect(JSON.stringify(restarted.job.architectActions.assemblies)).toBe(before);
      expect(restarted.job.fileHash).toBe(job.fileHash);
      expect(await responseHash(`${restarted.baseUrl}/api/jobs/${job.jobId}/ifc`)).toBe(job.fileHash);
    });
  });

  it("localhost IFC review records unresolved evidence without solving", async () => {
    await withJob(async ({ baseUrl, job, restart }) => {
      const candidate = job.topologyOpportunities[0]!;
      await postReview(baseUrl, job, candidate, { memberKind: "z", memberMaterial: "galvanized steel", memberWidthM: 0.075 });
      const reloaded = await json<any>(await fetch(`${baseUrl}/api/jobs/${job.jobId}`));
      expect(reloaded.componentEvaluations[0]).toMatchObject({ match: { outcome: "unmatched" }, aggregate: null, recipes: [], requests: [], results: [], unresolvedGroups: [{ evidenceSignature: expect.any(String) }] });
      const restarted = await restart();
      expect(restarted.job.componentEvaluations[0]).toEqual(reloaded.componentEvaluations[0]);
      console.log("CASE_EVIDENCE "+JSON.stringify({caseId:"unmatched",publicOutcome:"unmatched",stableDiagnostic:reloaded.componentEvaluations[0].match.reasons,recordIdentities:{unresolvedGroupId:reloaded.componentEvaluations[0].unresolvedGroups[0].unresolvedGroupId},workerInvocation:"not-applicable",artifactHashes:"not-applicable",freshReloadOutcome:"equal",protectedStateHashes:"not-applicable",outcome:"unmatched",unresolvedGroupId:reloaded.componentEvaluations[0].unresolvedGroups[0].unresolvedGroupId,reloaded:true}));
    });
  });

  it("invalid review authority cannot create derived success records", async () => {
    await withJob(async ({ baseUrl, job }) => {
      const candidate = job.topologyOpportunities[0]!;
      const before = JSON.stringify(job.architectActions.assemblies);
      await postReview(baseUrl, { ...job, activeRevisionId: "stale-revision" }, candidate, { memberKind: "c", memberMaterial: "galvanized steel", memberWidthM: 0.075 });
      const reloaded = await json<any>(await fetch(`${baseUrl}/api/jobs/${job.jobId}`));
      expect(reloaded.componentEvaluations ?? []).toHaveLength(0);
      expect(JSON.stringify(reloaded.architectActions.assemblies)).toBe(before);
      expect(reloaded.fileHash).toBe(job.fileHash);
    });
  });
});

async function withJob(run: (value: { baseUrl: string; job: any; restart: () => Promise<{ baseUrl: string; job: any }> }) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "component-occurrence-http-"));
  const config = { databasePath: join(root, "data", "app.db"), storageRoot: join(root, "storage"), outputRoot: join(root, "outputs"), topologyWorker: { runtimeIdentity: { executable: "C:/sentinel/python.exe", runtimeHash: PROVEN_TOPOLOGY_BUNDLE.runtimeHash }, async verifyArtifacts() { throw new Error("Gate 4 must not solve"); }, async runJsonl() { throw new Error("Gate 4 must not solve"); } } };
  let app = createLocalhostApp(config);
  try {
    const baseUrl = await listen(app);
    const bytes = await readFile(fixturePath);
    const form = new FormData(); form.set("ifc", new Blob([bytes]), "repeating-c-profile.ifc");
    const created = await json<any>(await fetch(`${baseUrl}/api/jobs`, { method: "POST", body: form }));
    let job = await waitForJob(baseUrl, created.jobId);
    if (!job.activeRevisionId) {
      const inputs = job.review.requestedInputs.map((input: any) => ({ requestedInputId: input.requestedInputId, value: input.datapoint === "layer_thickness" ? 0.15 : input.inputType === "number" ? 0.12 : "confirmed", unit: input.unit, overrideScope: "assembly_group" }));
      const reviewed = await fetch(`${baseUrl}/api/jobs/${created.jobId}/review-inputs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputs }) });
      if (!reviewed.ok) throw new Error(`Review completion failed: ${await reviewed.text()}`);
      job = await waitForActiveRevision(baseUrl, created.jobId);
    }
    expect(job.topologyOpportunities).toHaveLength(1);
    await run({ baseUrl, job, restart: async () => { await close(app); app = createLocalhostApp(config); const nextUrl = await listen(app); return { baseUrl: nextUrl, job: await json<any>(await fetch(`${nextUrl}/api/jobs/${job.jobId}`)) }; } });
  } finally { await close(app); await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); }
}

async function postReview(baseUrl: string, job: any, candidate: any, answers: Record<string, unknown>) {
  const assemblyGroupId = candidate.sourceAssemblyGroupIds?.[0] ?? job.architectActions.assemblies[0]?.assemblyGroupId;
  return fetch(`${baseUrl}/api/jobs/${job.jobId}/topology-reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opportunityId: candidate.opportunityId, thermalConstructionSignature: candidate.thermalConstructionSignature, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: assemblyGroupId, answers: { ...answers, repeatSpacingM: 0.6, continuousThroughLayers: true, exteriorBoundary: "external-wall", interiorBoundary: "internal" } }) });
}
async function waitForJob(baseUrl: string, jobId: string) { for (let i = 0; i < 100; i++) { const job = await json<any>(await fetch(`${baseUrl}/api/jobs/${jobId}`)); if (job.jobStatus !== "queued" && job.jobStatus !== "processing") return job; await new Promise((resolveWait) => setTimeout(resolveWait, 20)); } throw new Error("Job did not settle"); }
async function waitForActiveRevision(baseUrl: string, jobId: string) { for (let i = 0; i < 100; i++) { const job = await json<any>(await fetch(`${baseUrl}/api/jobs/${jobId}`)); if (job.activeRevisionId) return job; await new Promise((resolveWait) => setTimeout(resolveWait, 20)); } throw new Error("Job did not produce an active Revision"); }
async function listen(app: ReturnType<typeof createLocalhostApp>) { app.server.listen(0, "127.0.0.1"); await new Promise<void>((resolveListen) => app.server.once("listening", resolveListen)); const address = app.server.address(); if (!address || typeof address === "string") throw new Error("not bound"); return `http://127.0.0.1:${address.port}`; }
async function close(app: ReturnType<typeof createLocalhostApp>) { await new Promise<void>((resolveClose, reject) => app.server.close((error) => error ? reject(error) : resolveClose())); app.jobs.close(); }
async function json<T>(response: Response): Promise<T> { return await response.json() as T; }
async function responseHash(url: string): Promise<string> { return createHash("sha256").update(Buffer.from(await (await fetch(url)).arrayBuffer())).digest("hex"); }
