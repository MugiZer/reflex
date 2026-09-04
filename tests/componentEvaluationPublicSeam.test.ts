import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createLocalhostApp } from "../src/app/http/httpServer.js";
import type { ComponentPattern } from "../src/domain/topology/componentPatternInterpreter.js";
import { REPEATING_C_PROFILE_PATTERN } from "../src/domain/topology/patterns/repeatingCProfilePattern.js";
import { PROVEN_TOPOLOGY_BUNDLE } from "../src/infrastructure/topology/createProvenPythonTopologyWorker.js";

const fixturePath = resolve("tests/fixtures/ifc/repeating-c-profile.ifc");

describe("component evaluation public seam proof", () => {
  it("converges duplicate submission, restart, and promoted replay append-only", async () => {
    const candidate = { ...REPEATING_C_PROFILE_PATTERN, lifecycle: "candidate" as const };
    const promoted = { ...REPEATING_C_PROFILE_PATTERN, version: "2.0.0", promotedAt: "2026-08-02T02:00:00.000Z" };
    await withJob(async ({ baseUrl, job, restartWithOptions }) => {
      const opportunity = job.topologyOpportunities[0]!;
      const answers = { memberKind: "c", memberMaterial: "galvanized steel", memberWidthM: 0.075 };
      const [left, right] = await Promise.all([postReview(baseUrl, job, opportunity, answers), postReview(baseUrl, job, opportunity, answers)]);
      expect(left.status, await left.clone().text()).toBe(202);
      expect(right.status, await right.clone().text()).toBe(202);

      const first = await getJob(baseUrl, job.jobId);
      expect(first.componentEvaluations).toHaveLength(1);
      expect(first.componentEvaluations[0]).toMatchObject({ match: { outcome: "unmatched" }, state: "recoverable" });

      const restarted = await restartWithOptions({ componentPatterns: [promoted] });
      expect(restarted.job.componentEvaluations).toEqual(first.componentEvaluations);
      const replay = await fetch(`${restarted.baseUrl}/api/jobs/${job.jobId}/component-evaluations/replay`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evaluationId: first.componentEvaluations[0].evaluation.evaluationId, patternId: promoted.patternId, patternVersion: promoted.version }) });
      expect(replay.status, await replay.clone().text()).toBe(202);

      const afterReplay = await getJob(restarted.baseUrl, job.jobId);
      expect(afterReplay.componentEvaluations).toHaveLength(2);
      expect(afterReplay.componentEvaluations).toContainEqual(first.componentEvaluations[0]);
      expect(afterReplay.componentEvaluations.some((item: any) => item.pattern?.version === "2.0.0" && item.match.outcome === "matched")).toBe(true);
      console.log(`CASE_EVIDENCE ${JSON.stringify({ caseId: "component-public-duplicate-restart-replay", publicOutcome: "matched-after-promoted-replay", recordIdentities: { originalEvaluationId: first.componentEvaluations[0].evaluation.evaluationId, replayEvaluationId: afterReplay.componentEvaluations.find((item: any) => item.pattern?.version === "2.0.0")?.evaluation.evaluationId }, workerInvocation: "not-applicable-unmatched-history", freshReloadOutcome: "equal-before-replay", appendOnly: true })}`);
    }, { componentPatterns: [candidate] });
  }, 20_000);
});

async function withJob(run: (value: { baseUrl: string; job: any; restartWithOptions: (options?: { componentPatterns?: readonly ComponentPattern[] }) => Promise<{ baseUrl: string; job: any }> }) => Promise<void>, options: { componentPatterns?: readonly ComponentPattern[] } = {}) {
  const root = await mkdtemp(join(tmpdir(), "component-public-seam-"));
  const config = { databasePath: join(root, "data", "app.db"), storageRoot: join(root, "storage"), outputRoot: join(root, "outputs"), topologyWorker: { runtimeIdentity: { executable: "C:/sentinel/python.exe", runtimeHash: PROVEN_TOPOLOGY_BUNDLE.runtimeHash }, async verifyArtifacts() { throw new Error("Public proof must not solve"); }, async runJsonl() { throw new Error("Public proof must not solve"); } }, ...options };
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
      if (!reviewed.ok) throw new Error(await reviewed.text());
      job = await waitForActiveRevision(baseUrl, created.jobId);
    }
    expect(job.topologyOpportunities).toHaveLength(1);
    const restartWithOptions = async (nextOptions: { componentPatterns?: readonly ComponentPattern[] } = {}) => { await close(app); app = createLocalhostApp({ ...config, ...nextOptions }); const nextUrl = await listen(app); return { baseUrl: nextUrl, job: await getJob(nextUrl, job.jobId) }; };
    await run({ baseUrl, job, restartWithOptions });
  } finally { await close(app); await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); }
}

async function postReview(baseUrl: string, job: any, opportunity: any, answers: Record<string, unknown>) {
  const assemblyGroupId = opportunity.sourceAssemblyGroupIds?.[0] ?? job.architectActions.assemblies[0]?.assemblyGroupId;
  return fetch(`${baseUrl}/api/jobs/${job.jobId}/topology-reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opportunityId: opportunity.opportunityId, thermalConstructionSignature: opportunity.thermalConstructionSignature, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: assemblyGroupId, answers: { ...answers, repeatSpacingM: 0.6, continuousThroughLayers: true, exteriorBoundary: "external-wall", interiorBoundary: "internal" } }) });
}

async function waitForJob(baseUrl: string, jobId: string) { for (let index = 0; index < 100; index += 1) { const job = await getJob(baseUrl, jobId); if (job.jobStatus !== "queued" && job.jobStatus !== "processing") return job; await new Promise((resolveWait) => setTimeout(resolveWait, 20)); } throw new Error("Job did not settle"); }
async function waitForActiveRevision(baseUrl: string, jobId: string) { for (let index = 0; index < 100; index += 1) { const job = await getJob(baseUrl, jobId); if (job.activeRevisionId) return job; await new Promise((resolveWait) => setTimeout(resolveWait, 20)); } throw new Error("Job did not produce an active Revision"); }
async function listen(app: ReturnType<typeof createLocalhostApp>) { app.server.listen(0, "127.0.0.1"); await new Promise<void>((resolveListen) => app.server.once("listening", resolveListen)); const address = app.server.address(); if (!address || typeof address === "string") throw new Error("not bound"); return `http://127.0.0.1:${address.port}`; }
async function close(app: ReturnType<typeof createLocalhostApp>) { if (app.server.listening) await new Promise<void>((resolveClose, reject) => app.server.close((error) => error ? reject(error) : resolveClose())); app.close(); }
async function getJob(baseUrl: string, jobId: string) { const response = await fetch(`${baseUrl}/api/jobs/${jobId}`); return await response.json() as any; }
async function json<T>(response: Response): Promise<T> { return await response.json() as T; }
