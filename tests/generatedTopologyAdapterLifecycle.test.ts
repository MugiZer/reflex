import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { activateQualifiedGeneratedTopologyAdapter, rehydrateGeneratedTopologyAdapterRegistry } from "../src/application/topology/generatedTopologyAdapterLifecycle.js";
import { GeneratedTopologyAdapterRegistry } from "../src/domain/topology/generatedTopologyAdapterRegistry.js";
import { generatedTopologyAdapterHash, type GeneratedTopologyAdapter, type GeneratedTopologyQualificationReceipt } from "../src/domain/topology/generatedTopologyAdapter.js";
import { PROVEN_TOPOLOGY_BUNDLE } from "../src/infrastructure/topology/createProvenPythonTopologyWorker.js";
import { LocalGeneratedTopologyAdapterManifestStore } from "../src/infrastructure/topology/localGeneratedTopologyAdapterManifestStore.js";
import { createGeneratedTopologyAdapterRuntime } from "../src/infrastructure/topology/createGeneratedTopologyAdapterRuntime.js";

const zFixture = resolve(".scratch/component-topology-kernel/recipe-contract/valid-z-profile-regression.json");

describe("generated topology adapter lifecycle", () => {
  it("persists before hot activation, survives restart, and isolates corrupt, disabled, and incompatible manifests", async () => {
    const root = await mkdtemp(join(tmpdir(), "generated-topology-lifecycle-"));
    try {
      const adapter = await zAdapter();
      const receipt = qualifiedReceipt(adapter);
      const manifests = new LocalGeneratedTopologyAdapterManifestStore(root);
      const registry = new GeneratedTopologyAdapterRegistry();
      expect(await activateQualifiedGeneratedTopologyAdapter({ adapter, qualificationReceipt: receipt, manifests, registry })).toBe("activated");
      expect(registry.get(receipt.adapterHash)).toEqual(adapter);
      expect(registry.componentPatterns()).toEqual([expect.objectContaining({ patternId: "generated-z-girt", version: "1.0.0", lifecycle: "promoted", adapterHash: receipt.adapterHash })]);
      expect(await activateQualifiedGeneratedTopologyAdapter({ adapter, qualificationReceipt: receipt, manifests, registry })).toBe("duplicate");

      const restarted = new GeneratedTopologyAdapterRegistry();
      expect((await rehydrateGeneratedTopologyAdapterRegistry({ manifests, registry: restarted, bundle: PROVEN_TOPOLOGY_BUNDLE })).loaded).toBe(1);
      expect(restarted.get(receipt.adapterHash)).toEqual(adapter);

      const productionRestart = await createGeneratedTopologyAdapterRuntime(root);
      expect(productionRestart.registry.get(receipt.adapterHash)).toEqual(adapter);

      const incompatible = await rehydrateGeneratedTopologyAdapterRegistry({ manifests, registry: new GeneratedTopologyAdapterRegistry(), bundle: { ...PROVEN_TOPOLOGY_BUNDLE, runtimeHash: "a".repeat(64) } });
      expect(incompatible.diagnostics.map((item) => item.outcome)).toEqual(["incompatibility"]);

      await manifests.disable(receipt.adapterHash, "operator-disabled");
      expect(await activateQualifiedGeneratedTopologyAdapter({ adapter, qualificationReceipt: receipt, manifests, registry })).toBe("disabled");
      const disabled = await rehydrateGeneratedTopologyAdapterRegistry({ manifests, registry: new GeneratedTopologyAdapterRegistry(), bundle: PROVEN_TOPOLOGY_BUNDLE });
      expect(disabled.diagnostics.map((item) => item.outcome)).toEqual(["disabled"]);

      await writeFile(join(root, "generated-topology-adapter-manifests", "corrupt.json"), "not-json", "utf8");
      const protectedRegistry = new GeneratedTopologyAdapterRegistry();
      protectedRegistry.add("unrelated-existing-adapter", adapter);
      const corrupt = await rehydrateGeneratedTopologyAdapterRegistry({ manifests, registry: protectedRegistry, bundle: PROVEN_TOPOLOGY_BUNDLE });
      expect(corrupt.diagnostics.map((item) => item.outcome)).toContain("corruption");
      expect(protectedRegistry.get("unrelated-existing-adapter")).toEqual(adapter);
      await writeFile(join(root, "generated-topology-adapter-manifests", "incomplete.json"), JSON.stringify({ schema: "generated-topology-adapter-manifest/v1", adapterHash: receipt.adapterHash, adapter, qualificationReceipt: { schema: "generated-topology-adapter-qualification-receipt/v1", decision: "GO", adapterHash: receipt.adapterHash, gates: [] }, sourceDataset: adapter.provenance, dependencyIdentities: adapter.dependencies, contentHash: "incomplete" }), "utf8");
      const incomplete = await rehydrateGeneratedTopologyAdapterRegistry({ manifests, registry: protectedRegistry, bundle: PROVEN_TOPOLOGY_BUNDLE });
      expect(incomplete.diagnostics.map((item) => item.outcome)).toContain("corruption");
      expect(await readdir(join(root, "generated-topology-adapter-diagnostics"))).not.toEqual([]);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 300_000);

  it("keeps the hot registry unchanged when manifest persistence fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "generated-topology-lifecycle-failure-"));
    try {
      const adapter = await zAdapter();
      const receipt = qualifiedReceipt(adapter);
      const blockedRoot = join(root, "manifest-root-file");
      await writeFile(blockedRoot, "file-not-directory", "utf8");
      const registry = new GeneratedTopologyAdapterRegistry();
      registry.add("unrelated-existing-adapter", adapter);
      expect(await activateQualifiedGeneratedTopologyAdapter({ adapter, qualificationReceipt: receipt, manifests: new LocalGeneratedTopologyAdapterManifestStore(blockedRoot), registry })).toBe("persistence-failure");
      expect(registry.get("unrelated-existing-adapter")).toEqual(adapter);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 300_000);

  it("does not publish a restart projection when durable diagnostic persistence fails", async () => {
    const adapter = await zAdapter();
    const registry = new GeneratedTopologyAdapterRegistry();
    registry.add("unrelated-existing-adapter", adapter);
    const manifests = {
      async scan() { return [{ path: "broken.json", manifest: null, error: "corrupt" }]; },
      async isDisabled() { return false; },
      async recordDiagnostic() { throw new Error("diagnostic store unavailable"); },
      async persist() { return "stored" as const; },
    };
    const result = await rehydrateGeneratedTopologyAdapterRegistry({ manifests, registry, bundle: PROVEN_TOPOLOGY_BUNDLE });
    expect(result.outcome).toBe("persistence-failure");
    expect(registry.get("unrelated-existing-adapter")).toEqual(adapter);
  });
});

function qualifiedReceipt(adapter: GeneratedTopologyAdapter): GeneratedTopologyQualificationReceipt {
  const adapterHash = generatedTopologyAdapterHash(adapter);
  const gate = (gateId: "P3-contract-geometry" | "P6-worker" | "P3-independent-reference" | "P6-envelope-sensitivity") => ({ gateId, selectedCases: [gateId], passedCases: [gateId], failedCases: [], unexecutedCases: [], fixtureIdentity: `fixture:${gateId}`, oracleIdentity: null, adapterHash, dependencyIdentities: adapter.dependencies, command: "lifecycle fixture", durationMs: 0, testedRevision: "ticket-02-p5" });
  return { schema: "generated-topology-adapter-qualification-receipt/v1", decision: "GO", adapterHash, recipeHash: null, worker: { executable: "C:/sentinel/python.exe", runtimeHash: adapter.dependencies.runtimeHash }, compilerVersion: adapter.dependencies.compilerVersion, primitiveRegistryHash: adapter.dependencies.primitiveRegistryHash, materialPackHash: adapter.dependencies.materialPackHash, boundaryVersion: adapter.dependencies.boundaryVersion, gates: [gate("P3-contract-geometry"), gate("P6-worker"), gate("P3-independent-reference"), gate("P6-envelope-sensitivity")], qualifiedAt: "2026-08-16T00:00:00.000Z" };
}

async function zAdapter(): Promise<GeneratedTopologyAdapter> {
  const recipeTemplate = JSON.parse(await readFile(zFixture, "utf8"));
  return { schema: "generated-topology-adapter/v1", family: { familyId: "generated-z-girt", familyVersion: "1.0.0", topologyModule: { id: PROVEN_TOPOLOGY_BUNDLE.moduleId, version: PROVEN_TOPOLOGY_BUNDLE.moduleVersion }, primitive: { kind: "standard.z", version: "1.0.0" }, materialIdentity: "galvanized-steel", placementMode: "continuous-girt", profileKind: "z", requiredCharacteristics: { orientation: "parallel", steel: true } }, recognition: { profileKinds: ["z"], materialTokens: ["steel", "z-girt"] }, requiredAuthorities: ["profileKind", "memberMaterial"], recipeTemplate, parameterBindings: [{ key: "insulationThicknessM", binding: ["layers", 0, "thickness", "value"], bounds: { minimum: 0.1, maximum: 0.3 } }], permittedUnknowns: [], validationEnvelope: { insulationThicknessM: { minimum: 0.1, maximum: 0.3 } }, provenance: { datasetId: "z-girt-dataset", datasetVersion: "1", datasetHash: sha256("z-girt-dataset"), sourceCitation: "independent qualification fixture" }, qualificationCases: { reference: { caseId: "z-girt-independent-reference", parameters: { insulationThicknessM: 0.2 } }, sensitivity: { caseId: "z-girt-thicker-insulation", parameters: { insulationThicknessM: 0.24 }, direction: "decreases" }, }, dependencies: { compilerVersion: PROVEN_TOPOLOGY_BUNDLE.moduleVersion, primitiveRegistryHash: PROVEN_TOPOLOGY_BUNDLE.registryHash, materialPackHash: PROVEN_TOPOLOGY_BUNDLE.packHash, runtimeHash: PROVEN_TOPOLOGY_BUNDLE.runtimeHash, boundaryVersion: "component-evaluation/v1" } };
}
function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
