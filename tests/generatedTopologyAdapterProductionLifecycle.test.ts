import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createLocalhostApp } from "../src/app/http/httpServer.js";
import { generatedTopologyAdapterHash, type GeneratedTopologyAdapter, type GeneratedTopologyQualificationReceipt } from "../src/domain/topology/generatedTopologyAdapter.js";
import { REPEATING_C_PROFILE_PATTERN } from "../src/domain/topology/patterns/repeatingCProfilePattern.js";
import { createProvenPythonTopologyWorker, PROVEN_TOPOLOGY_BUNDLE } from "../src/infrastructure/topology/createProvenPythonTopologyWorker.js";

const fixturePath = resolve("tests/fixtures/ifc/repeating-c-profile.ifc");
const pythonExecutable = resolve(process.env.TOPOLOGY_WORKER_PYTHON ?? ".scratch/component-topology-kernel/conformance-proof/.venv/Scripts/python.exe");

describe("generated topology adapter production lifecycle", () => {
  it("uses a persisted adapter for localhost matching immediately and after restart", async () => {
    const root = await mkdtemp(join(tmpdir(), "generated-topology-production-"));
    const manifestRoot = join(root, "adapter-manifests");
    const adapter = await cAdapter();
    const receipt = qualifiedReceipt(adapter);
    const config = {
      databasePath: join(root, "data", "app.db"), storageRoot: join(root, "storage"), outputRoot: join(root, "outputs"), generatedTopologyAdapterManifestRoot: manifestRoot,
      generatedTopologyAdapterQualification: async () => receipt,
      topologyWorker: createProvenPythonTopologyWorker({ pythonExecutable }),
    };
    let app = createLocalhostApp(config);
    try {
      const qualified = await app.qualifyGeneratedTopologyAdapter(adapter, "production-lifecycle-route", new Date("2026-08-16T00:00:00.000Z"));
      expect(qualified).toEqual(receipt);
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
      expect(matched.componentEvaluations[0].results).toMatchObject([{ outcome: "preliminary-unsafe", resultPayload: { effectiveUValueWPerM2K: expect.any(Number) } }]);
      const secondForm = new FormData(); secondForm.set("ifc", new Blob([await readFile(resolve("tests/fixtures/ifc/repeating-c-profile-bounded-failure.ifc"))]), "repeating-c-profile-bounded-failure.ifc");
      const secondCreated = await json<any>(await fetch(`${baseUrl}/api/jobs`, { method: "POST", body: secondForm }));
      let secondJob = await waitForJob(baseUrl, secondCreated.jobId);
      if (!secondJob.activeRevisionId) {
        const inputs = secondJob.review.requestedInputs.map((input: any) => ({ requestedInputId: input.requestedInputId, value: input.datapoint === "layer_thickness" ? 0.08 : input.inputType === "number" ? 0.12 : "confirmed", unit: input.unit, overrideScope: "assembly_group" }));
        const reviewed = await fetch(`${baseUrl}/api/jobs/${secondJob.jobId}/review-inputs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputs }) });
        expect(reviewed.ok, await reviewed.text()).toBe(true);
        secondJob = await waitForActiveRevision(baseUrl, secondJob.jobId);
      }
      const secondOpportunity = secondJob.topologyOpportunities[0];
      const secondResponse = await fetch(`${baseUrl}/api/jobs/${secondJob.jobId}/topology-reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opportunityId: secondOpportunity.opportunityId, thermalConstructionSignature: secondOpportunity.thermalConstructionSignature, sourceRevisionId: secondJob.activeRevisionId, sourceAssemblyGroupId: secondOpportunity.sourceAssemblyGroupIds[0], answers }) });
      expect(secondResponse.status, await secondResponse.text()).toBe(202);
      const secondMatched = await json<any>(await fetch(`${baseUrl}/api/jobs/${secondJob.jobId}`));
      expect(secondMatched.componentEvaluations[0]).toMatchObject({ match: { outcome: "matched", patternId: "generated-c-profile" }, results: [{ outcome: "preliminary-unsafe" }] });
      expect(secondMatched.componentEvaluations[0].recipes[0].recipeId).not.toBe(matched.componentEvaluations[0].recipes[0].recipeId);
      expect(secondMatched.componentEvaluations[0].recipes[0].canonicalRecipe.layers).not.toEqual(matched.componentEvaluations[0].recipes[0].canonicalRecipe.layers);
      const beforeRestart = JSON.stringify(matched.componentEvaluations);

      await close(app);
      app = createLocalhostApp(config);
      baseUrl = await listen(app);
      const restarted = await json<any>(await fetch(`${baseUrl}/api/jobs/${job.jobId}`));
      expect(JSON.stringify(restarted.componentEvaluations)).toBe(beforeRestart);
      expect(restarted.componentEvaluations[0].match).toMatchObject({ outcome: "matched", patternId: "generated-c-profile", patternVersion: "1.0.0" });

      await rm(join(manifestRoot, "generated-topology-adapter-manifests"), { recursive: true, force: true });
      await writeFile(join(manifestRoot, "generated-topology-adapter-manifests"), "blocked", "utf8");
      const beforeFailure = await json<any>(await fetch(`${baseUrl}/api/jobs/${job.jobId}`));
      await expect(app.qualifyGeneratedTopologyAdapter(adapter, "production-lifecycle-persistence-failure")).rejects.toThrow("persistence-failure");
      const afterFailure = await json<any>(await fetch(`${baseUrl}/api/jobs/${job.jobId}`));
      expect(JSON.stringify(afterFailure.componentEvaluations)).toBe(JSON.stringify(beforeFailure.componentEvaluations));
    } finally { await close(app); await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); }
  }, 30_000);
});

function qualifiedReceipt(adapter: GeneratedTopologyAdapter): GeneratedTopologyQualificationReceipt {
  const adapterHash = generatedTopologyAdapterHash(adapter);
  const gate = (gateId: "P3-contract-geometry" | "P6-worker" | "P3-independent-reference" | "P6-envelope-sensitivity") => ({ gateId, selectedCases: [gateId], passedCases: [gateId], failedCases: [], unexecutedCases: [], fixtureIdentity: `fixture:${gateId}`, oracleIdentity: null, adapterHash, dependencyIdentities: adapter.dependencies, command: "production lifecycle fixture", durationMs: 0, testedRevision: "production-lifecycle-fixture" });
  return { schema: "generated-topology-adapter-qualification-receipt/v1", decision: "GO", adapterHash, recipeHash: null, worker: { executable: "C:/sentinel/python.exe", runtimeHash: PROVEN_TOPOLOGY_BUNDLE.runtimeHash }, compilerVersion: adapter.dependencies.compilerVersion, primitiveRegistryHash: adapter.dependencies.primitiveRegistryHash, materialPackHash: adapter.dependencies.materialPackHash, boundaryVersion: adapter.dependencies.boundaryVersion, gates: [gate("P3-contract-geometry"), gate("P6-worker"), gate("P3-independent-reference"), gate("P6-envelope-sensitivity")], qualifiedAt: "2026-08-16T00:00:00.000Z" };
}

async function cAdapter(): Promise<GeneratedTopologyAdapter> {
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
