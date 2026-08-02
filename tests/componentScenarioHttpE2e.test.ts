import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createLocalhostApp } from "../src/app/http/httpServer.js";
import { createProvenPythonTopologyWorker } from "../src/infrastructure/topology/createProvenPythonTopologyWorker.js";

const pythonExecutable = resolve(process.env.TOPOLOGY_WORKER_PYTHON ?? ".scratch/component-topology-kernel/conformance-proof/.venv/Scripts/python.exe");

describe("durable component scenarios through localhost", () => {
  it("known promoted match runs one durable Python scenario", async () => {
    await withScenarioJob("repeating-c-profile.ifc", async ({ baseUrl, job, candidate, restart }) => {
      await submit(baseUrl, job, candidate, 0.075);
      const loaded = await getJob(baseUrl, job.jobId);
      const graph = loaded.componentEvaluations[0];
      expect(graph).toMatchObject({ recipes: [{}], requests: [{}], results: [{ outcome: "preliminary-unsafe", artifactIdentity: expect.any(String) }] });
      const oracle = await loadOracle();
      expectOracleResult(graph.results[0], oracle.scenarios[1], oracle.absoluteToleranceWPerM2K);
      expect((await restart()).job.componentEvaluations[0]).toEqual(graph);
    });
  }, 180_000);

  it("bounded unknown runs all three durable Python scenarios", async () => {
    await withScenarioJob("repeating-c-profile.ifc", async ({ baseUrl, job, candidate, restart }) => {
      const layerBefore = JSON.stringify(job.architectActions.assemblies);
      await submit(baseUrl, job, candidate, "i-dont-know");
      const loaded = await getJob(baseUrl, job.jobId);
      const graph = loaded.componentEvaluations[0];
      expect(graph.recipes).toHaveLength(3); expect(graph.requests).toHaveLength(3); expect(graph.results).toHaveLength(3);
      expect(graph.results.every((item: any) => item.outcome === "preliminary-unsafe" && item.artifactIdentity)).toBe(true);
      expect(graph.recipes.map((item: any) => item.canonicalRecipe.rows[0].member.primitive.parameters.depth)).toEqual([0.041, 0.075, 0.1]);
      const oracle = await loadOracle();
      graph.results.forEach((result: any, index: number) => expectOracleResult(result, oracle.scenarios[index], oracle.absoluteToleranceWPerM2K));
      expect(graph.results.map((item: any) => item.resultPayload.effectiveUValueWPerM2K)).toEqual([...graph.results.map((item: any) => item.resultPayload.effectiveUValueWPerM2K)].sort((a: number, b: number) => a - b));
      const restarted = await restart();
      expect(restarted.job.componentEvaluations[0]).toEqual(graph);
      expect(JSON.stringify(restarted.job.architectActions.assemblies)).toBe(layerBefore);
      expect(await ifcHash(restarted.baseUrl, job.jobId)).toBe(job.fileHash);
    });
  }, 240_000);

  it("one scenario non-success prevents a successful range", async () => {
    await withScenarioJob("repeating-c-profile-bounded-failure.ifc", async ({ baseUrl, job, candidate, restart }) => {
      const layerBefore = JSON.stringify(job.architectActions.assemblies);
      await submit(baseUrl, job, candidate, "i-dont-know");
      const graph = (await getJob(baseUrl, job.jobId)).componentEvaluations[0];
      expect(graph.results).toHaveLength(3);
      expect(graph.results.some((item: any) => item.outcome !== "preliminary-unsafe")).toBe(true);
      expect(graph.aggregate).toBeNull();
      expect(graph).not.toHaveProperty("uValueRangeWPerM2K");
      const restarted = await restart();
      expect(restarted.job.componentEvaluations[0]).toEqual(graph);
      expect(JSON.stringify(restarted.job.architectActions.assemblies)).toBe(layerBefore);
      expect(await ifcHash(restarted.baseUrl, job.jobId)).toBe(job.fileHash);
    });
  }, 240_000);
});

async function withScenarioJob(filename: string, run: (value: { baseUrl: string; job: any; candidate: any; restart: () => Promise<{ baseUrl: string; job: any }> }) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "component-scenario-http-"));
  const config = { databasePath: join(root, "data", "app.db"), storageRoot: join(root, "storage"), outputRoot: join(root, "outputs"), topologyWorker: createProvenPythonTopologyWorker({ pythonExecutable }) };
  let app = createLocalhostApp(config);
  try {
    let baseUrl = await listen(app);
    const bytes = await readFile(resolve("tests/fixtures/ifc", filename)); const form = new FormData(); form.set("ifc", new Blob([bytes]), filename);
    const created = await json<any>(await fetch(`${baseUrl}/api/jobs`, { method: "POST", body: form }));
    let job = await waitForJob(baseUrl, created.jobId);
    if (!job.activeRevisionId) { const inputs = job.review.requestedInputs.map((input: any) => ({ requestedInputId: input.requestedInputId, value: input.datapoint === "layer_thickness" ? (filename.includes("failure") ? 0.08 : 0.15) : input.inputType === "number" ? 0.12 : "confirmed", unit: input.unit, overrideScope: "assembly_group" })); const response = await fetch(`${baseUrl}/api/jobs/${created.jobId}/review-inputs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputs }) }); if (!response.ok) throw new Error(await response.text()); job = await waitForActiveRevision(baseUrl, created.jobId); }
    const candidate = job.topologyOpportunities[0]!;
    await run({ baseUrl, job, candidate, restart: async () => { await close(app); app = createLocalhostApp(config); baseUrl = await listen(app); return { baseUrl, job: await getJob(baseUrl, job.jobId) }; } });
  } finally { await close(app); await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); }
}
async function submit(baseUrl: string, job: any, candidate: any, width: number | "i-dont-know") { const assemblyGroupId = candidate.sourceAssemblyGroupIds?.[0] ?? job.architectActions.assemblies[0].assemblyGroupId; const response = await fetch(`${baseUrl}/api/jobs/${job.jobId}/topology-reviews`, { method: "POST", headers: { "Content-Type": "application/json", "x-topology-deadline-at": new Date(Date.now() + 180_000).toISOString() }, body: JSON.stringify({ opportunityId: candidate.opportunityId, thermalConstructionSignature: candidate.thermalConstructionSignature, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: assemblyGroupId, answers: { memberKind: "c", memberMaterial: "galvanized steel", memberWidthM: width, repeatSpacingM: 0.6, continuousThroughLayers: true, exteriorBoundary: "external-wall", interiorBoundary: "internal" } }) }); expect(response.status, await response.clone().text()).toBe(202); return json<any>(response); }
async function waitForJob(baseUrl: string, id: string) { for (let i=0;i<100;i++){const job=await getJob(baseUrl,id);if(job.jobStatus!=="queued"&&job.jobStatus!=="processing")return job;await new Promise(r=>setTimeout(r,20));}throw new Error("job timeout"); }
async function waitForActiveRevision(baseUrl: string,id:string){for(let i=0;i<100;i++){const job=await getJob(baseUrl,id);if(job.activeRevisionId)return job;await new Promise(r=>setTimeout(r,20));}throw new Error("revision timeout");}
async function getJob(baseUrl:string,id:string){return json<any>(await fetch(`${baseUrl}/api/jobs/${id}`));}
async function listen(app:ReturnType<typeof createLocalhostApp>){app.server.listen(0,"127.0.0.1");await new Promise<void>(r=>app.server.once("listening",r));const a=app.server.address();if(!a||typeof a==="string")throw new Error("not bound");return `http://127.0.0.1:${a.port}`;}
async function close(app:ReturnType<typeof createLocalhostApp>){if(app.server.listening)await new Promise<void>((r,j)=>app.server.close(e=>e?j(e):r()));app.jobs.close();}
async function json<T>(r:Response){return await r.json() as T;}
async function ifcHash(baseUrl:string,id:string){return createHash("sha256").update(Buffer.from(await (await fetch(`${baseUrl}/api/jobs/${id}/ifc`)).arrayBuffer())).digest("hex");}
async function loadOracle(){return JSON.parse(await readFile(resolve("tests/fixtures/component-patterns/repeating-c-profile-oracle-v1.json"),"utf8")) as any;}
function expectOracleResult(result:any, expected:any, tolerance:number){expect(Math.abs(result.resultPayload.effectiveUValueWPerM2K-expected.expectedUValueWPerM2K)).toBeLessThanOrEqual(tolerance);expect(result.resultPayload.evidence).toMatchObject({reproducibilityManifest:{},topologyAudit:{gap_area_m2:0,overlap_area_m2:0,out_of_host_area_m2:0}});expect(result.artifactIdentity).toMatch(/^[a-f0-9]{64}$/);}
