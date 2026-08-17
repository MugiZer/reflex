import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createLocalhostApp } from "../src/app/http/httpServer.js";
import { generatedTopologyAdapterHash, type GeneratedTopologyAdapter, type GeneratedTopologyQualificationReceipt } from "../src/domain/topology/generatedTopologyAdapter.js";
import { REPEATING_C_PROFILE_PATTERN } from "../src/domain/topology/patterns/repeatingCProfilePattern.js";
import { PROVEN_TOPOLOGY_BUNDLE } from "../src/infrastructure/topology/createProvenPythonTopologyWorker.js";
import { LocalGeneratedTopologyAdapterManifestStore } from "../src/infrastructure/topology/localGeneratedTopologyAdapterManifestStore.js";

const fixturePath = resolve("tests/fixtures/ifc/repeating-c-profile.ifc");

describe("generated topology adapter production lifecycle", () => {
  it("uses a persisted adapter for localhost matching immediately and after restart", async () => {
    const root = await mkdtemp(join(tmpdir(), "generated-topology-production-"));
    const manifestRoot = join(root, "adapter-manifests");
    const config = {
      databasePath: join(root, "data", "app.db"), storageRoot: join(root, "storage"), outputRoot: join(root, "outputs"), generatedTopologyAdapterManifestRoot: manifestRoot,
      topologyWorker: { runtimeIdentity: { executable: "C:/sentinel/python.exe", runtimeHash: PROVEN_TOPOLOGY_BUNDLE.runtimeHash }, async verifyArtifacts() {}, async runJsonl() { throw new Error("production lifecycle proof does not require numerical execution"); } },
    };
    const adapter = await zAdapter();
    const receipt = qualifiedReceipt(adapter);
    await new LocalGeneratedTopologyAdapterManifestStore(manifestRoot).persist(adapter, receipt);
    let app = createLocalhostApp(config);
    try {
      let baseUrl = await listen(app);
      const bytes = await readFile(fixturePath);
      const form = new FormData(); form.set("ifc", new Blob([bytes]), "repeating-c-profile.ifc");
      const created = await json<any>(await fetch(`${baseUrl}/api/jobs`, { method: "POST", body: form }));
      let job = await waitForJob(baseUrl, created.jobId);
      if (!job.activeRevisionId) {
        const inputs = job.review.requestedInputs.map((input: any) => ({ requestedInputId: input.requestedInputId, value: input.datapoint === "layer_thickness" ? 0.15 : input.inputType === "number" ? 0.12 : "confirmed", unit: input.unit, overrideScope: "assembly_group" }));
        const reviewed = await fetch(`${baseUrl}/api/jobs/${created.jobId}/review-inputs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputs }) });
        expect(reviewed.ok, await reviewed.text()).toBe(true);
        job = await waitForActiveRevision(baseUrl, created.jobId);
      }
      const opportunity = job.topologyOpportunities[0];
      expect(opportunity).toBeTruthy();
      const answers = { memberKind: "c", memberMaterial: "galvanized steel", memberWidthM: 0.075, repeatSpacingM: 0.6, continuousThroughLayers: true, exteriorBoundary: "external-wall", interiorBoundary: "internal" };
      const response = await fetch(`${baseUrl}/api/jobs/${job.jobId}/topology-reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opportunityId: opportunity.opportunityId, thermalConstructionSignature: opportunity.thermalConstructionSignature, sourceRevisionId: job.activeRevisionId, sourceAssemblyGroupId: opportunity.sourceAssemblyGroupIds[0], answers }) });
      expect(response.status, await response.text()).toBe(202);
      const matched = await json<any>(await fetch(`${baseUrl}/api/jobs/${job.jobId}`));
      expect(matched.componentEvaluations[0].match).toMatchObject({ outcome: "matched", patternId: "generated-c-profile", patternVersion: "1.0.0" });
      const beforeRestart = JSON.stringify(matched.componentEvaluations);

      await close(app);
      app = createLocalhostApp(config);
      baseUrl = await listen(app);
      const restarted = await json<any>(await fetch(`${baseUrl}/api/jobs/${job.jobId}`));
      expect(JSON.stringify(restarted.componentEvaluations)).toBe(beforeRestart);
      expect(restarted.componentEvaluations[0].match).toMatchObject({ outcome: "matched", patternId: "generated-c-profile", patternVersion: "1.0.0" });
    } finally { await close(app); await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); }
  }, 30_000);
});

function qualifiedReceipt(adapter: GeneratedTopologyAdapter): GeneratedTopologyQualificationReceipt {
  const adapterHash = generatedTopologyAdapterHash(adapter);
  const gate = (gateId: "P3-contract-geometry" | "P6-worker" | "P3-independent-reference" | "P6-envelope-sensitivity") => ({ gateId, selectedCases: [gateId], passedCases: [gateId], failedCases: [], unexecutedCases: [], fixtureIdentity: `fixture:${gateId}`, oracleIdentity: null, adapterHash, dependencyIdentities: adapter.dependencies, command: "production lifecycle fixture", durationMs: 0, testedRevision: "production-lifecycle-fixture" });
  return { schema: "generated-topology-adapter-qualification-receipt/v1", decision: "GO", adapterHash, recipeHash: null, worker: { executable: "C:/sentinel/python.exe", runtimeHash: PROVEN_TOPOLOGY_BUNDLE.runtimeHash }, compilerVersion: adapter.dependencies.compilerVersion, primitiveRegistryHash: adapter.dependencies.primitiveRegistryHash, materialPackHash: adapter.dependencies.materialPackHash, boundaryVersion: adapter.dependencies.boundaryVersion, gates: [gate("P3-contract-geometry"), gate("P6-worker"), gate("P3-independent-reference"), gate("P6-envelope-sensitivity")], qualifiedAt: "2026-08-16T00:00:00.000Z" };
}

async function zAdapter(): Promise<GeneratedTopologyAdapter> {
  const recipeTemplate = REPEATING_C_PROFILE_PATTERN.recipeTemplate;
  const binding = ["rows", 0, "member", "primitive", "parameters", "depth"] as const;
  return { schema: "generated-topology-adapter/v1", family: { familyId: "generated-c-profile", familyVersion: "1.0.0", topologyModule: { id: PROVEN_TOPOLOGY_BUNDLE.moduleId, version: PROVEN_TOPOLOGY_BUNDLE.moduleVersion }, primitive: { kind: "standard.c", version: "1.0.0" }, materialIdentity: "galvanized-steel", placementMode: "continuous-profile", profileKind: "c", requiredCharacteristics: { orientation: "parallel", steel: true } }, recognition: { profileKinds: ["c"], materialTokens: ["steel", "metal"] }, requiredAuthorities: ["profileKind", "memberMaterial"], recipeTemplate, parameterBindings: [{ key: "memberWidthM", binding, bounds: { minimum: 0.041, maximum: 0.1 } }], permittedUnknowns: [], validationEnvelope: { memberWidthM: { minimum: 0.041, maximum: 0.1 } }, provenance: { datasetId: "c-profile-dataset", datasetVersion: "1", datasetHash: sha256("c-profile-dataset"), sourceCitation: "production lifecycle fixture" }, qualificationCases: { reference: { caseId: "c-profile-reference", parameters: { memberWidthM: 0.075 } }, sensitivity: { caseId: "c-profile-sensitivity", parameters: { memberWidthM: 0.1 }, direction: "decreases" } }, dependencies: { compilerVersion: PROVEN_TOPOLOGY_BUNDLE.moduleVersion, primitiveRegistryHash: PROVEN_TOPOLOGY_BUNDLE.registryHash, materialPackHash: PROVEN_TOPOLOGY_BUNDLE.packHash, runtimeHash: PROVEN_TOPOLOGY_BUNDLE.runtimeHash, boundaryVersion: "component-evaluation/v1" } };
}
function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
async function listen(app: ReturnType<typeof createLocalhostApp>): Promise<string> { app.server.listen(0, "127.0.0.1"); await new Promise<void>((resolveListen) => app.server.once("listening", resolveListen)); const address = app.server.address(); if (!address || typeof address === "string") throw new Error("Server is not bound."); return `http://127.0.0.1:${address.port}`; }
async function close(app: ReturnType<typeof createLocalhostApp>): Promise<void> { if (app.server.listening) await new Promise<void>((resolveClose, reject) => app.server.close((error) => error ? reject(error) : resolveClose())); app.close(); }
async function json<T>(response: Response): Promise<T> { return await response.json() as T; }
async function waitForJob(baseUrl: string, jobId: string): Promise<any> { for (let index = 0; index < 100; index += 1) { const job = await json<any>(await fetch(`${baseUrl}/api/jobs/${jobId}`)); if (job.jobStatus !== "queued" && job.jobStatus !== "processing") return job; await new Promise((resolveWait) => setTimeout(resolveWait, 20)); } throw new Error("Job did not settle"); }
async function waitForActiveRevision(baseUrl: string, jobId: string): Promise<any> { for (let index = 0; index < 100; index += 1) { const job = await json<any>(await fetch(`${baseUrl}/api/jobs/${jobId}`)); if (job.activeRevisionId) return job; await new Promise((resolveWait) => setTimeout(resolveWait, 20)); } throw new Error("Job did not produce an active Revision"); }
