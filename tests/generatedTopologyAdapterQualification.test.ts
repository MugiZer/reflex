import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { qualifyGeneratedTopologyAdapter } from "../src/application/topology/qualifyGeneratedTopologyAdapter.js";
import { generatedTopologyAdapterHash, type GeneratedTopologyAdapter } from "../src/domain/topology/generatedTopologyAdapter.js";
import { PROVEN_TOPOLOGY_BUNDLE } from "../src/infrastructure/topology/createProvenPythonTopologyWorker.js";
import { LocalGeneratedTopologyQualificationReceiptStore } from "../src/infrastructure/topology/localGeneratedTopologyQualificationReceiptStore.js";

const pythonExecutable = resolve(process.env.TOPOLOGY_WORKER_PYTHON ?? ".scratch/component-topology-kernel/conformance-proof/.venv/Scripts/python.exe");
const zFixture = resolve(".scratch/component-topology-kernel/recipe-contract/valid-z-profile-regression.json");

describe("generated topology adapter qualification", () => {
  it("earns P3/P6 only through the production Recipe compiler and pinned worker, then fails closed for mutations", async () => {
    const root = await mkdtemp(join(tmpdir(), "generated-topology-adapter-"));
    try {
      const adapter = await zAdapter();
      const receipt = await qualifyGeneratedTopologyAdapter({ adapter, outputRoot: root, pythonExecutable, testedRevision: "ticket-01-p3-p6", now: new Date("2026-08-16T00:00:00.000Z") });
      expect(receipt.decision).toBe("GO");
      expect(receipt.adapterHash).toBe(generatedTopologyAdapterHash(adapter));
      expect(receipt.gates.map((gate) => gate.gateId)).toEqual(["P3-contract-geometry", "P6-worker", "P3-independent-reference", "P6-envelope-sensitivity"]);
      expect(receipt.gates.every((gate) => gate.failedCases.length === 0 && gate.unexecutedCases.length === 0)).toBe(true);
      expect(receipt.worker.runtimeHash).toBe(PROVEN_TOPOLOGY_BUNDLE.runtimeHash);
      expect(await new LocalGeneratedTopologyQualificationReceiptStore(root).read(receipt.adapterHash)).toEqual(receipt);
      expect(() => { (receipt.worker as any).executable = "mutated-worker.exe"; }).toThrow();
      expect(receipt.worker.executable).toBe(pythonExecutable);
      const originalBoundaryVersion = adapter.dependencies.boundaryVersion;
      (adapter.dependencies as Record<string, string>).boundaryVersion = "mutated-boundary";
      expect(receipt.gates[0]?.dependencyIdentities.boundaryVersion).toBe("component-evaluation/v1");
      (adapter.dependencies as Record<string, string>).boundaryVersion = originalBoundaryVersion;

      const noGo = await qualifyGeneratedTopologyAdapter({
        adapter: { ...adapter, qualificationCases: { ...adapter.qualificationCases, reference: { ...adapter.qualificationCases.reference, caseId: "z-girt-mutated-reference" } } },
        outputRoot: root, pythonExecutable, testedRevision: "ticket-01-p3-p6-mutated", now: new Date("2026-08-16T00:00:00.000Z"),
      });
      expect(noGo.decision).toBe("NO-GO");
      expect(noGo.gates.find((gate) => gate.gateId === "P3-independent-reference")?.failedCases).toEqual(["z-girt-mutated-reference"]);

      const badGeometry = await qualifyGeneratedTopologyAdapter({
        adapter: { ...adapter, recipeTemplate: { ...adapter.recipeTemplate as Record<string, unknown>, rows: [{ ...(adapter.recipeTemplate as any).rows[0], member: { ...(adapter.recipeTemplate as any).rows[0].member, primitive: { ...(adapter.recipeTemplate as any).rows[0].member.primitive, parameters: { ...(adapter.recipeTemplate as any).rows[0].member.primitive.parameters, depth: -1 } } } }] } },
        outputRoot: root, pythonExecutable, testedRevision: "ticket-01-p3-p6-bad-geometry", now: new Date("2026-08-16T00:00:00.000Z"),
      });
      expect(badGeometry.decision).toBe("NO-GO");
      expect(badGeometry.gates[0]?.failedCases).toEqual(["adapter-contract-and-geometry"]);

      const badEnvelope = await qualifyGeneratedTopologyAdapter({
        adapter: { ...adapter, validationEnvelope: { insulationThicknessM: { minimum: 0.25, maximum: 0.3 } } },
        outputRoot: root, pythonExecutable, testedRevision: "ticket-01-p3-p6-bad-envelope", now: new Date("2026-08-16T00:00:00.000Z"),
      });
      expect(badEnvelope.decision).toBe("NO-GO");
      expect(badEnvelope.gates[0]?.failedCases).toEqual(["adapter-contract-and-geometry"]);

      const badWorker = await qualifyGeneratedTopologyAdapter({
        adapter, outputRoot: root, pythonExecutable: resolve(".scratch/missing-release-python.exe"), testedRevision: "ticket-01-p3-p6-bad-worker", now: new Date("2026-08-16T00:00:00.000Z"),
      });
      expect(badWorker.decision).toBe("NO-GO");
      expect(badWorker.gates.find((gate) => gate.gateId === "P6-worker")?.failedCases).toEqual(["pinned-worker"]);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 300_000);

  it("rejects executable and undeclared fields, while semantic hashing ignores property order", async () => {
    const adapter = await zAdapter();
    const reordered: GeneratedTopologyAdapter = {
      dependencies: { ...adapter.dependencies }, qualificationCases: { ...adapter.qualificationCases }, provenance: { ...adapter.provenance }, validationEnvelope: { ...adapter.validationEnvelope }, permittedUnknowns: [...adapter.permittedUnknowns], parameterBindings: [...adapter.parameterBindings], recipeTemplate: adapter.recipeTemplate, requiredAuthorities: [...adapter.requiredAuthorities], recognition: { ...adapter.recognition }, family: { ...adapter.family }, schema: adapter.schema,
    };
    expect(generatedTopologyAdapterHash(reordered)).toBe(generatedTopologyAdapterHash(adapter));
    expect(() => generatedTopologyAdapterHash({ ...adapter, command: "python dangerous.py" } as any)).toThrow(/strict v1 data contract/);
    expect(() => generatedTopologyAdapterHash({ ...adapter, recipeTemplate: { ...adapter.recipeTemplate as any, command: "python dangerous.py" } } as any)).toThrow(/executable-recipe-field/);
    expect(() => generatedTopologyAdapterHash({ ...adapter, recipeTemplate: { ...adapter.recipeTemplate as any, rows: [{ ...(adapter.recipeTemplate as any).rows[0], member: { ...(adapter.recipeTemplate as any).rows[0].member, command: "python dangerous.py" } }] } } as any)).toThrow(/executable-recipe-field/);
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
    qualificationCases: { reference: { caseId: "z-girt-independent-reference", parameters: { insulationThicknessM: 0.2 } }, sensitivity: { caseId: "z-girt-thicker-insulation", parameters: { insulationThicknessM: 0.24 }, direction: "decreases" } },
    dependencies: { compilerVersion: PROVEN_TOPOLOGY_BUNDLE.moduleVersion, primitiveRegistryHash: PROVEN_TOPOLOGY_BUNDLE.registryHash, materialPackHash: PROVEN_TOPOLOGY_BUNDLE.packHash, runtimeHash: PROVEN_TOPOLOGY_BUNDLE.runtimeHash, boundaryVersion: "component-evaluation/v1" },
  };
}
function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
