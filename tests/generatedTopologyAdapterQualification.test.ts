import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { qualifyGeneratedTopologyAdapter } from "../src/application/topology/qualifyGeneratedTopologyAdapter.js";
import { generatedTopologyAdapterHash, type GeneratedTopologyAdapter } from "../src/domain/topology/generatedTopologyAdapter.js";
import { createTopologyAnalysisRequestService } from "../src/application/topology/createTopologyAnalysisRequestService.js";
import { PROVEN_TOPOLOGY_BUNDLE, createProvenPythonTopologyWorker } from "../src/infrastructure/topology/createProvenPythonTopologyWorker.js";
import { LocalTopologyArtifactStore } from "../src/infrastructure/topology/localTopologyArtifactStore.js";

const pythonExecutable = resolve(process.env.TOPOLOGY_WORKER_PYTHON ?? ".scratch/component-topology-kernel/conformance-proof/.venv/Scripts/python.exe");
const zFixture = resolve(".scratch/component-topology-kernel/recipe-contract/valid-z-profile-regression.json");

describe("generated topology adapter qualification", () => {
  it("earns P3/P6 only through the production Recipe compiler and pinned worker, then fails closed for a believable mutation", async () => {
    const root = await mkdtemp(join(tmpdir(), "generated-topology-adapter-"));
    try {
      const adapter = await zAdapter();
      const worker = createProvenPythonTopologyWorker({ pythonExecutable });
      const service = createTopologyAnalysisRequestService({ artifactStore: new LocalTopologyArtifactStore(root), worker });
      const receipt = await qualifyGeneratedTopologyAdapter({
        adapter, bundle: PROVEN_TOPOLOGY_BUNDLE, worker: worker.runtimeIdentity, oracle: independentOracle(adapter), testedRevision: "ticket-01-p3-p6", now: new Date("2026-08-16T00:00:00.000Z"),
        runTopology: ({ recipe, recipeHash, purpose }) => service.submit({ sourceRevisionId: "adapter-qualification", sourceAssemblyGroupId: "z-girt", correlationId: randomUUID(), idempotencyKey: sha256(purpose), recipe, recipeHash, bundle: PROVEN_TOPOLOGY_BUNDLE, layerOnlySnapshot: { preserved: true } }),
      });
      expect(receipt.decision).toBe("GO");
      expect(receipt.adapterHash).toBe(generatedTopologyAdapterHash(adapter));
      expect(receipt.gates.map((gate) => gate.gateId)).toEqual(["P3-contract-geometry", "P6-worker", "P3-independent-reference", "P6-envelope-sensitivity"]);
      expect(receipt.gates.every((gate) => gate.failedCases.length === 0 && gate.unexecutedCases.length === 0)).toBe(true);
      expect(receipt.worker.runtimeHash).toBe(PROVEN_TOPOLOGY_BUNDLE.runtimeHash);

      const noGo = await qualifyGeneratedTopologyAdapter({
        adapter, bundle: PROVEN_TOPOLOGY_BUNDLE, worker: worker.runtimeIdentity, oracle: { ...independentOracle(adapter), expectedEffectiveUValueWPerM2K: 0.32 }, testedRevision: "ticket-01-p3-p6-mutated", now: new Date("2026-08-16T00:00:00.000Z"),
        runTopology: ({ recipe, recipeHash, purpose }) => service.submit({ sourceRevisionId: "adapter-qualification-mutated", sourceAssemblyGroupId: "z-girt", correlationId: randomUUID(), idempotencyKey: sha256(purpose), recipe, recipeHash, bundle: PROVEN_TOPOLOGY_BUNDLE, layerOnlySnapshot: { preserved: true } }),
      });
      expect(noGo.decision).toBe("NO-GO");
      expect(noGo.gates.find((gate) => gate.gateId === "P3-independent-reference")?.failedCases).toEqual(["z-girt-independent-reference"]);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 120_000);

  it("rejects executable and undeclared fields, while semantic hashing ignores property order", async () => {
    const adapter = await zAdapter();
    const reordered: GeneratedTopologyAdapter = {
      dependencies: { ...adapter.dependencies }, qualificationCases: { ...adapter.qualificationCases }, provenance: { ...adapter.provenance }, validationEnvelope: { ...adapter.validationEnvelope }, permittedUnknowns: [...adapter.permittedUnknowns], parameterBindings: [...adapter.parameterBindings], recipeTemplate: adapter.recipeTemplate, requiredAuthorities: [...adapter.requiredAuthorities], recognition: { ...adapter.recognition }, family: { ...adapter.family }, schema: adapter.schema,
    };
    expect(generatedTopologyAdapterHash(reordered)).toBe(generatedTopologyAdapterHash(adapter));
    expect(() => generatedTopologyAdapterHash({ ...adapter, command: "python dangerous.py" } as any)).toThrow(/strict v1 data contract/);
    expect(() => generatedTopologyAdapterHash({ ...adapter, recipeTemplate: { ...adapter.recipeTemplate as any, command: "python dangerous.py" } } as any)).toThrow(/executable-recipe-field/);
    expect(generatedTopologyAdapterHash({ ...adapter, dependencies: { ...adapter.dependencies, boundaryVersion: "boundary-v2" } })).not.toBe(generatedTopologyAdapterHash(adapter));
  });
});

async function zAdapter(): Promise<GeneratedTopologyAdapter> {
  const recipeTemplate = JSON.parse(await readFile(zFixture, "utf8"));
  return {
    schema: "generated-topology-adapter/v1",
    family: { familyId: "generated-z-girt", familyVersion: "1.0.0", topologyModule: { id: PROVEN_TOPOLOGY_BUNDLE.moduleId, version: PROVEN_TOPOLOGY_BUNDLE.moduleVersion }, primitive: { kind: "standard.z", version: "1.0.0" }, materialIdentity: "galvanized-steel", placementMode: "continuous-girt", profileKind: "z", requiredCharacteristics: { orientation: "parallel", steel: true } },
    recognition: { profileKinds: ["z"], materialTokens: ["steel", "z-girt"] }, requiredAuthorities: ["profileKind", "memberMaterial"], recipeTemplate,
    parameterBindings: [{ key: "insulationThicknessM", binding: ["layers", 0, "thickness", "value"], bounds: { minimum: 0.1, maximum: 0.3 } }], permittedUnknowns: [], validationEnvelope: { insulationThicknessM: { minimum: 0.1, maximum: 0.3 } },
    provenance: { datasetId: "z-girt-dataset", datasetVersion: "1", datasetHash: sha256("z-girt-dataset"), sourceCitation: "independent qualification fixture" },
    qualificationCases: { reference: { caseId: "z-girt-independent-reference", parameters: { insulationThicknessM: 0.2 }, expectedEffectiveUValueWPerM2K: 0.2399856428620613, toleranceWPerM2K: 0.000001 }, sensitivity: { caseId: "z-girt-thicker-insulation", parameters: { insulationThicknessM: 0.24 }, direction: "decreases" } },
    dependencies: { compilerVersion: PROVEN_TOPOLOGY_BUNDLE.moduleVersion, primitiveRegistryHash: PROVEN_TOPOLOGY_BUNDLE.registryHash, materialPackHash: PROVEN_TOPOLOGY_BUNDLE.packHash, runtimeHash: PROVEN_TOPOLOGY_BUNDLE.runtimeHash, boundaryVersion: "component-evaluation/v1" },
  };
}
function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
function independentOracle(adapter: GeneratedTopologyAdapter) { return { oracleId: "z-girt-independent", oracleVersion: "1", contentHash: sha256("independent-z-girt-reference"), caseId: adapter.qualificationCases.reference.caseId, parameters: adapter.qualificationCases.reference.parameters, expectedEffectiveUValueWPerM2K: 0.2399856428620613, toleranceWPerM2K: 0.000001 } as const; }
