import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { createLocalhostApp } from "../src/app/http/httpServer.js";
import { createProvenPythonTopologyWorker, PROVEN_TOPOLOGY_BUNDLE } from "../src/infrastructure/topology/createProvenPythonTopologyWorker.js";
import { REPEATING_C_PROFILE_PATTERN } from "../src/domain/topology/patterns/repeatingCProfilePattern.js";
import type { TopologyAnalysisOutcome, TopologyWorkerRuntime } from "../src/domain/topology/topologyTypes.js";

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
      expect((await restart()).job.componentEvaluations[0]).toEqual(graph);caseEvidence("exact-known",{...workerEvidence(graph),scenarioCount:1,value:graph.results[0].resultPayload.effectiveUValueWPerM2K,workerRuntimeHash:graph.results[0].resultPayload.bundle.runtimeHash,reloaded:true,workerLaunched:true});
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
      console.log("PROTECTED_STATE "+JSON.stringify({caseId:"bounded-unknown",ifcBefore:job.fileHash,ifcAfter:await ifcHash(restarted.baseUrl,job.jobId),layerBefore:shaText(layerBefore),layerAfter:shaText(JSON.stringify(restarted.job.architectActions.assemblies))}));
      caseEvidence("bounded-unknown",{...workerEvidence(graph),protectedStateHashes:{ifcBefore:job.fileHash,ifcAfter:await ifcHash(restarted.baseUrl,job.jobId),layerBefore:shaText(layerBefore),layerAfter:shaText(JSON.stringify(restarted.job.architectActions.assemblies))},scenarioCount:graph.results.length,values:graph.results.map((item:any)=>item.resultPayload.effectiveUValueWPerM2K),reloaded:true});
    });
  }, 240_000);

  it("one scenario non-success prevents a successful range", async () => {
    await withScenarioJob("repeating-c-profile-bounded-failure.ifc", async ({ baseUrl, job, candidate, restart }) => {
      const layerBefore = JSON.stringify(job.architectActions.assemblies);
      await submit(baseUrl, job, candidate, "i-dont-know");
      const graph = (await getJob(baseUrl, job.jobId)).componentEvaluations[0];
      expect(graph.results).toHaveLength(3);
      expect(graph.results.some((item: any) => item.outcome !== "preliminary-unsafe")).toBe(true);
      expect(graph.aggregate).toMatchObject({ outcome: "range-unavailable", payload: { minUValueWPerM2K: null, maxUValueWPerM2K: null, conservativeProposalWPerM2K: null } });
      const restarted = await restart();
      expect(restarted.job.componentEvaluations[0]).toEqual(graph);
      expect(JSON.stringify(restarted.job.architectActions.assemblies)).toBe(layerBefore);
      expect(await ifcHash(restarted.baseUrl, job.jobId)).toBe(job.fileHash);
      console.log("PROTECTED_STATE "+JSON.stringify({caseId:"mixed-terminal",ifcBefore:job.fileHash,ifcAfter:await ifcHash(restarted.baseUrl,job.jobId),layerBefore:shaText(layerBefore),layerAfter:shaText(JSON.stringify(restarted.job.architectActions.assemblies))}));
      caseEvidence("mixed-terminal",{...workerEvidence(graph),protectedStateHashes:{ifcBefore:job.fileHash,ifcAfter:await ifcHash(restarted.baseUrl,job.jobId),layerBefore:shaText(layerBefore),layerAfter:shaText(JSON.stringify(restarted.job.architectActions.assemblies))},outcomes:graph.results.map((item:any)=>item.outcome),aggregateRange:graph.aggregate.outcome==="range",reloaded:true});
    });
  }, 240_000);

  it("worker failure, cancellation, deadline, and incomplete outcomes are public and durable", async () => {
    const cases: Array<{ id: string; outcome: Extract<TopologyAnalysisOutcome, "failed" | "cancelled" | "blocked">; code: string; worker?: TopologyWorkerRuntime; deadlineAt?: string; abortRequest?: boolean }> = [
      { id: "worker-failure", outcome: "failed", code: "worker_process_failed", worker: terminalTopologyWorker("failed", "worker_process_failed") },
      { id: "worker-cancelled", outcome: "cancelled", code: "worker_cancelled", worker: terminalTopologyWorker("cancelled", "worker_cancelled") },
      { id: "worker-deadline", outcome: "failed", code: "worker_deadline_exceeded", deadlineAt: new Date(Date.now() - 1_000).toISOString() },
      { id: "recipe-incomplete", outcome: "blocked", code: "recipe_incomplete", worker: terminalTopologyWorker("blocked", "recipe_incomplete") },
    ];
    const lifecycle: any[] = [];
    for (const item of cases) {
      await withScenarioJob("repeating-c-profile.ifc", async ({ baseUrl, job, candidate, restart }) => {
        const layerBefore = JSON.stringify(job.architectActions.assemblies);
        await submit(baseUrl, job, candidate, 0.075, {}, item.deadlineAt);
        const graph = (await getJob(baseUrl, job.jobId)).componentEvaluations[0];
        expect(graph.results).toHaveLength(1);
        expect(graph.results[0]).toMatchObject({ outcome: item.outcome, resultPayload: { errorCode: item.code, effectiveUValueWPerM2K: null, evidence: null } });
        expect(graph.aggregate).toMatchObject({ outcome: "range-unavailable", payload: { minUValueWPerM2K: null, maxUValueWPerM2K: null, conservativeProposalWPerM2K: null } });
        const restarted = await restart();
        expect(restarted.job.componentEvaluations[0]).toEqual(graph);
        expect(JSON.stringify(restarted.job.architectActions.assemblies)).toBe(layerBefore);
        lifecycle.push({ id: item.id, outcome: graph.results[0].outcome, errorCode: graph.results[0].resultPayload.errorCode, reloaded: true, ...workerEvidence(graph) });
      }, item.worker ? { topologyWorker: item.worker } : {});
    }
    const first = lifecycle[0]!;
    caseEvidence("failure-lifecycle", {
      lifecycle: lifecycle.map(({ id, outcome, errorCode, reloaded }) => ({ id, outcome, errorCode, reloaded })),
      recordIdentities: { resultIds: lifecycle.flatMap((item) => item.recordIdentities.resultIds) },
      artifactHashes: lifecycle.flatMap((item) => item.artifactHashes),
      workerInvocation: { cases: lifecycle.map((item) => item.workerInvocation) },
      fixtureIdentity: first.fixtureIdentity,
      oracleIdentity: first.oracleIdentity,
      reloaded: true,
    });
  }, 180_000);

  it("restart recomputes the same range from stored scenarios", async () => {
    await withScenarioJob("repeating-c-profile.ifc", async ({ baseUrl, job, candidate, restart }) => {
      await submit(baseUrl, job, candidate, "i-dont-know");
      const graph = (await getJob(baseUrl, job.jobId)).componentEvaluations[0];
      const values = graph.results.map((item:any)=>item.resultPayload.effectiveUValueWPerM2K);
      expect(graph.aggregate).toMatchObject({ outcome:"range", payload:{ minUValueWPerM2K:Math.min(...values), maxUValueWPerM2K:Math.max(...values), preliminary:true, decisiveNextInput:"memberWidthM" } });
      const restarted = await restart();
      expect(restarted.job.componentEvaluations[0]).toEqual(graph);
      const report = await (await fetch(`${restarted.baseUrl}/api/jobs/${job.jobId}/report`)).text();
      expect(report).toContain("Component topology evaluation");
      expect(report).toContain(Math.min(...values).toFixed(3));
      expect(report).toContain(Math.max(...values).toFixed(3));
      for (const recipe of graph.recipes) expect(report).toContain(recipe.recipeId);
      for (const request of graph.requests) expect(report).toContain(request.scenarioRequestId);
      for (const result of graph.results) { expect(report).toContain(result.scenarioResultId); expect(report).toContain(result.artifactIdentity); }
      expect(report).toContain(graph.results[0].resultPayload.bundle.runtimeHash);
      caseEvidence("material-range",{...workerEvidence(graph),min:Math.min(...values),max:Math.max(...values),decisiveNextInput:graph.aggregate.payload.decisiveNextInput,reloaded:true});
    });
  }, 240_000);

  it("report refuses altered or incomplete success evidence", async () => {
    await withScenarioJob("repeating-c-profile.ifc", async ({ baseUrl, job, candidate, databasePath }) => {
      const layerBefore = JSON.stringify(job.architectActions.assemblies);
      await submit(baseUrl, job, candidate, 0.075);
      const original=(await getJob(baseUrl,job.jobId)).componentEvaluations[0];
      for(const mutation of [
        ["component_evaluation_matches","pattern_version","9.9.9"],
        ["component_evaluation_recipes","recipe_sha256","f".repeat(64)],
        ["component_evaluation_results","payload_json","{}"],
      ] as const){const [table,column,value]=mutation;const db=new DatabaseSync(databasePath);const row=db.prepare(`select ${column} as value from ${table} limit 1`).get() as {value:string};db.prepare(`update ${table} set ${column} = ?`).run(value);db.close();await assertUnavailable(baseUrl,job.jobId,layerBefore);const restore=new DatabaseSync(databasePath);restore.prepare(`update ${table} set ${column} = ?`).run(row.value);restore.close();}
      const manifestPath=join(original.results[0].resultPayload.artifactDirectory,"manifest.json");const manifest=await readFile(manifestPath,"utf8");await writeFile(manifestPath,"{}","utf8");await assertUnavailable(baseUrl,job.jobId,layerBefore);await writeFile(manifestPath,manifest,"utf8");
      const report = await (await fetch(`${baseUrl}/api/jobs/${job.jobId}/report`)).text();
      expect(report).toContain("Component topology evaluation");
      caseEvidence("corruption",{...workerEvidence(original),freshReloadOutcome:"fail-closed-after-persisted-corruption",mutations:["match","recipe","result","artifact"],failClosed:true,layerPreserved:true,outcome:"corrupted",diagnostic:"component_evaluation_corrupted"});
    });
  }, 180_000);

  it("simultaneous duplicate submission publishes one immutable evaluation", async () => {
    await withScenarioJob("repeating-c-profile.ifc", async ({ baseUrl, job, candidate, restart }) => {
      await Promise.all([submit(baseUrl,job,candidate,"i-dont-know"),submit(baseUrl,job,candidate,"i-dont-know")]);
      const loaded=await getJob(baseUrl,job.jobId);
      expect(loaded.componentEvaluations).toHaveLength(1);
      expect(loaded.componentEvaluations[0]).toMatchObject({state:"published"});expect(loaded.componentEvaluations[0].recipes).toHaveLength(3);expect(loaded.componentEvaluations[0].requests).toHaveLength(3);expect(loaded.componentEvaluations[0].results).toHaveLength(3);expect(loaded.componentEvaluations[0].results.every((item:any)=>item.outcome==="preliminary-unsafe"&&item.artifactIdentity)).toBe(true);
      const restarted=await restart();expect(restarted.job.componentEvaluations).toEqual(loaded.componentEvaluations);
      await submit(restarted.baseUrl,restarted.job,candidate,"i-dont-know");
      expect((await getJob(restarted.baseUrl,job.jobId)).componentEvaluations).toEqual(loaded.componentEvaluations);
      caseEvidence("duplicates",{...workerEvidence(loaded.componentEvaluations[0]),scenarioCount:3,evaluationCount:1,simultaneous:true,restarted:true,retried:true,reloaded:true});
    });
  }, 180_000);

  it("ambiguous and non-promoted runtime outcomes are public and durable", async () => {
    const second={...REPEATING_C_PROFILE_PATTERN,version:"2.0.0"};
    await withScenarioJob("repeating-c-profile.ifc",async({baseUrl,job,candidate,restart})=>{await submit(baseUrl,job,candidate,0.075);const graph=(await getJob(baseUrl,job.jobId)).componentEvaluations[0];expect(graph).toMatchObject({match:{outcome:"ambiguous"},recipes:[],requests:[],results:[]});expect((await restart()).job.componentEvaluations[0]).toEqual(graph);caseEvidence("ambiguous",{outcome:"ambiguous",candidateCount:2,reloaded:true});},{componentPatterns:[REPEATING_C_PROFILE_PATTERN,second]});
    const lifecycleOutcomes:Array<{lifecycle:"draft"|"candidate"|"rejected";outcome:string;reloaded:boolean}>=[]; for(const lifecycle of ["draft","candidate","rejected"] as const) await withScenarioJob("repeating-c-profile.ifc",async({baseUrl,job,candidate,restart})=>{await submit(baseUrl,job,candidate,0.075);const graph=(await getJob(baseUrl,job.jobId)).componentEvaluations[0];expect(graph).toMatchObject({match:{outcome:"unmatched"},pattern:null,recipes:[],requests:[],results:[]});expect((await restart()).job.componentEvaluations[0]).toEqual(graph);lifecycleOutcomes.push({lifecycle,outcome:graph.match.outcome,reloaded:true});},{componentPatterns:[{...REPEATING_C_PROFILE_PATTERN,lifecycle}]}); caseEvidence("lifecycle",{configuredLifecycles:["draft","candidate","rejected"],runtimeMatched:false,lifecycleOutcomes,reloaded:true});
  }, 60_000);

  it("blocked and rejected interpreter outcomes are public and durable", async () => {
    await withScenarioJob("repeating-c-profile.ifc",async({baseUrl,job,candidate,restart})=>{await submit(baseUrl,job,candidate,0.075,{memberMaterialAuthority:"missing"});const graph=(await getJob(baseUrl,job.jobId)).componentEvaluations[0];expect(graph).toMatchObject({match:{outcome:"blocked"},recipes:[],results:[]});expect((await restart()).job.componentEvaluations[0]).toEqual(graph);caseEvidence("blocked",{outcome:"blocked",diagnostic:graph.match.reasons,reloaded:true});});
    await withScenarioJob("repeating-c-profile.ifc",async({baseUrl,job,candidate,restart})=>{await submit(baseUrl,job,candidate,0.2);const graph=(await getJob(baseUrl,job.jobId)).componentEvaluations[0];expect(graph).toMatchObject({match:{outcome:"rejected"},recipes:[],results:[]});expect((await restart()).job.componentEvaluations[0]).toEqual(graph);caseEvidence("rejected",{outcome:"rejected",diagnostic:graph.match.reasons,reloaded:true});});
  }, 60_000);

  it("conservative immaterial screening is public and durable", async () => {
    const narrow={...REPEATING_C_PROFILE_PATTERN,version:"1.1.0",permittedUnknowns:[{...REPEATING_C_PROFILE_PATTERN.permittedUnknowns[0]!,values:[0.074,0.075,0.076]}]};
    await withScenarioJob("repeating-c-profile.ifc",async({baseUrl,job,candidate,restart})=>{await submit(baseUrl,job,candidate,"i-dont-know");const graph=(await getJob(baseUrl,job.jobId)).componentEvaluations[0];const values=graph.results.map((item:any)=>item.resultPayload.effectiveUValueWPerM2K);expect(graph.aggregate).toMatchObject({outcome:"range",payload:{maxUValueWPerM2K:Math.max(...values),conservativeProposalWPerM2K:Math.max(...values)}});expect((await restart()).job.componentEvaluations[0]).toEqual(graph);caseEvidence("conservative-range",{...workerEvidence(graph),values,proposal:graph.aggregate.payload.conservativeProposalWPerM2K,reloaded:true});},{componentPatterns:[narrow],componentScreeningThresholdWPerM2K:1});
  }, 240_000);

  it("append-only historical replay crosses public HTTP and fresh reload", async () => {
    const candidate={...REPEATING_C_PROFILE_PATTERN,lifecycle:"candidate" as const}; const promoted={...REPEATING_C_PROFILE_PATTERN,version:"2.0.0",promotedAt:"2026-08-02T02:00:00.000Z"};
    await withScenarioJob("repeating-c-profile.ifc",async({baseUrl,job,candidate:opportunity,restartWithOptions})=>{await submit(baseUrl,job,opportunity,0.075);const original=(await getJob(baseUrl,job.jobId)).componentEvaluations[0];const restarted=await restartWithOptions({componentPatterns:[promoted]});const response=await fetch(`${restarted.baseUrl}/api/jobs/${job.jobId}/component-evaluations/replay`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({evaluationId:original.evaluation.evaluationId,patternId:promoted.patternId,patternVersion:promoted.version})});expect(response.status,await response.clone().text()).toBe(202);const loaded=await getJob(restarted.baseUrl,job.jobId);expect(loaded.componentEvaluations).toHaveLength(2);expect(loaded.componentEvaluations).toContainEqual(original);expect(loaded.componentEvaluations.some((item:any)=>item.pattern?.version==="2.0.0"&&item.match.outcome==="matched")).toBe(true);caseEvidence("replay",{originalEvaluationId:original.evaluation.evaluationId,evaluationCount:2,originalRetained:true,version:"2.0.0",reloaded:true});},{componentPatterns:[candidate]});
  }, 60_000);
});

async function withScenarioJob(filename: string, run: (value: { baseUrl: string; job: any; candidate: any; databasePath: string; restart: () => Promise<{ baseUrl: string; job: any }>; restartWithOptions:(options:{componentPatterns?:any[];componentScreeningThresholdWPerM2K?:number|null;topologyWorker?:TopologyWorkerRuntime})=>Promise<{baseUrl:string;job:any}> }) => Promise<void>, options: {componentPatterns?:any[];componentScreeningThresholdWPerM2K?:number|null;topologyWorker?:TopologyWorkerRuntime}={}) {
  const root = await mkdtemp(join(tmpdir(), "component-scenario-http-"));
  const databasePath = join(root, "data", "app.db");
  const config = { databasePath, storageRoot: join(root, "storage"), outputRoot: join(root, "outputs"), ...options, topologyWorker: options.topologyWorker ?? createProvenPythonTopologyWorker({ pythonExecutable }) };
  let app = createLocalhostApp(config);
  try {
    let baseUrl = await listen(app);
    const bytes = await readFile(resolve("tests/fixtures/ifc", filename)); const form = new FormData(); form.set("ifc", new Blob([bytes]), filename);
    const created = await json<any>(await fetch(`${baseUrl}/api/jobs`, { method: "POST", body: form }));
    let job = await waitForJob(baseUrl, created.jobId);
    if (!job.activeRevisionId) { const inputs = job.review.requestedInputs.map((input: any) => ({ requestedInputId: input.requestedInputId, value: input.datapoint === "layer_thickness" ? (filename.includes("failure") ? 0.08 : 0.15) : input.inputType === "number" ? 0.12 : "confirmed", unit: input.unit, overrideScope: "assembly_group" })); const response = await fetch(`${baseUrl}/api/jobs/${created.jobId}/review-inputs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputs }) }); if (!response.ok) throw new Error(await response.text()); job = await waitForActiveRevision(baseUrl, created.jobId); }
    const candidate = job.topologyOpportunities[0]!;
    const restartWithOptions=async(nextOptions:typeof options)=>{await close(app);app=createLocalhostApp({...config,...nextOptions});baseUrl=await listen(app);return{baseUrl,job:await getJob(baseUrl,job.jobId)}};
    await run({ baseUrl, job, candidate, databasePath, restart: () => restartWithOptions(options), restartWithOptions });
  } finally { await close(app); await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); }
}
async function submit(baseUrl: string, job: any, candidate: any, width: number | "i-dont-know", extraAnswers:Record<string,unknown>={}, deadlineAt = new Date(Date.now() + 180_000).toISOString()) { const response = await fetch(`${baseUrl}/api/jobs/${job.jobId}/topology-reviews`, { method: "POST", headers: { "Content-Type": "application/json", "x-topology-deadline-at": deadlineAt }, body: JSON.stringify(topologySubmission(job, candidate, width, extraAnswers)) }); expect(response.status, await response.clone().text()).toBe(202); return json<any>(response); }
function topologySubmission(job: any, candidate: any, width: number | "i-dont-know", extraAnswers: Record<string, unknown>) { const assemblyGroupId = candidate.sourceAssemblyGroupIds?.[0] ?? job.architectActions.assemblies[0].assemblyGroupId; return { opportunityId: candidate.opportunityId, thermalConstructionSignature: candidate.thermalConstructionSignature, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: assemblyGroupId, answers: { memberKind: "c", memberMaterial: "galvanized steel", memberWidthM: width, repeatSpacingM: 0.6, continuousThroughLayers: true, exteriorBoundary: "external-wall", interiorBoundary: "internal", ...extraAnswers } }; }
async function waitForJob(baseUrl: string, id: string) { for (let i=0;i<100;i++){const job=await getJob(baseUrl,id);if(job.jobStatus!=="queued"&&job.jobStatus!=="processing")return job;await new Promise(r=>setTimeout(r,20));}throw new Error("job timeout"); }
async function waitForActiveRevision(baseUrl: string,id:string){for(let i=0;i<100;i++){const job=await getJob(baseUrl,id);if(job.activeRevisionId)return job;await new Promise(r=>setTimeout(r,20));}throw new Error("revision timeout");}
async function getJob(baseUrl:string,id:string){return json<any>(await fetch(`${baseUrl}/api/jobs/${id}`));}
async function listen(app:ReturnType<typeof createLocalhostApp>){app.server.listen(0,"127.0.0.1");await new Promise<void>(r=>app.server.once("listening",r));const a=app.server.address();if(!a||typeof a==="string")throw new Error("not bound");return `http://127.0.0.1:${a.port}`;}
async function close(app:ReturnType<typeof createLocalhostApp>){if(app.server.listening)await new Promise<void>((r,j)=>app.server.close(e=>e?j(e):r()));app.close();}
async function json<T>(r:Response){return await r.json() as T;}
async function ifcHash(baseUrl:string,id:string){return createHash("sha256").update(Buffer.from(await (await fetch(`${baseUrl}/api/jobs/${id}/ifc`)).arrayBuffer())).digest("hex");}
async function assertUnavailable(baseUrl:string,id:string,layerBefore:string){const loaded=await getJob(baseUrl,id);expect(loaded.componentEvaluations).toEqual([]);expect(loaded.componentEvaluationDiagnostic).toContain("component_evaluation_corrupted");expect(JSON.stringify(loaded.architectActions.assemblies)).toBe(layerBefore);const report=await(await fetch(`${baseUrl}/api/jobs/${id}/report`)).text();expect(report).toContain("Component topology result unavailable");expect(report).not.toContain("Component topology evaluation");}
async function loadOracle(){return JSON.parse(await readFile(resolve("tests/fixtures/component-patterns/repeating-c-profile-oracle-v1.json"),"utf8")) as any;}
function expectOracleResult(result:any, expected:any, tolerance:number){expect(Math.abs(result.resultPayload.effectiveUValueWPerM2K-expected.expectedUValueWPerM2K)).toBeLessThanOrEqual(tolerance);expect(result.resultPayload.evidence).toMatchObject({reproducibilityManifest:{},topologyAudit:{gap_area_m2:0,overlap_area_m2:0,out_of_host_area_m2:0}});expect(result.artifactIdentity).toMatch(/^[a-f0-9]{64}$/);}
function shaText(value:string | Buffer | Uint8Array){return createHash("sha256").update(value).digest("hex");}
function caseEvidence(caseId:string,evidence:Record<string,any>){const ids=Object.fromEntries(Object.entries(evidence).filter(([key])=>/(Id|Ids)$/.test(key)));console.log("CASE_EVIDENCE "+JSON.stringify({caseId,publicOutcome:evidence.outcome??caseId,stableDiagnostic:evidence.diagnostic??"not-applicable",recordIdentities:Object.keys(ids).length?ids:"not-applicable",workerInvocation:evidence.workerLaunched===true?"pinned-python-launched":"not-applicable",artifactHashes:evidence.artifactIdentity??evidence.artifactIdentities??"not-applicable",freshReloadOutcome:evidence.reloaded===true?"equal":"not-applicable",protectedStateHashes:["bounded-unknown","mixed-terminal"].includes(caseId)?"captured-separately":"not-applicable",...evidence}));}
function workerEvidence(graph:any){return{recordIdentities:{recipeIds:graph.recipes.map((item:any)=>item.recipeId),requestIds:graph.requests.map((item:any)=>item.scenarioRequestId),resultIds:graph.results.map((item:any)=>item.scenarioResultId)},workerInvocation:{executable:pythonExecutable,runtimeHashes:[...new Set(graph.results.map((item:any)=>item.resultPayload?.bundle?.runtimeHash).filter(Boolean))]},artifactHashes:graph.results.map((item:any)=>item.artifactIdentity),fixtureIdentity:fixtureIdentityForHash(graph.ifcImport.contentSha256),oracleIdentity:oracleIdentity(),freshReloadOutcome:"equal",protectedStateHashes:"not-applicable"};}

function terminalTopologyWorker(outcome: Extract<TopologyAnalysisOutcome, "failed" | "cancelled" | "blocked">, code: string): TopologyWorkerRuntime {
  return {
    runtimeIdentity: { executable: "test-only-terminal-worker", runtimeHash: PROVEN_TOPOLOGY_BUNDLE.runtimeHash },
    async verifyArtifacts() {},
    async runJsonl() { throw Object.assign(new Error(code), { outcome, code }); },
  };
}

function fixtureIdentityForHash(contentSha256: string): { fixtureId: string; path: string; sha256: string } {
  const directory = resolve("tests/fixtures/ifc");
  const filename = readdirSync(directory).find((entry) => shaText(readFileSync(resolve(directory, entry))) === contentSha256);
  if (!filename) throw new Error(`Fixture identity not found for ${contentSha256}.`);
  return { fixtureId: filename, path: `tests/fixtures/ifc/${filename}`, sha256: contentSha256 };
}

function oracleIdentity(): { oracleId: string; path: string; sha256: string } {
  const path = resolve("tests/fixtures/component-patterns/repeating-c-profile-oracle-v1.json");
  const content = readFileSync(path, "utf8");
  return { oracleId: JSON.parse(content).oracleId, path: "tests/fixtures/component-patterns/repeating-c-profile-oracle-v1.json", sha256: shaText(content) };
}
