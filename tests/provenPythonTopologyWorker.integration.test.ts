import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createTopologyAnalysisRequestService } from "../src/application/topology/createTopologyAnalysisRequestService.js";
import type { JsonValue } from "../src/domain/topology/topologyTypes.js";
import {
  PROVEN_TOPOLOGY_BUNDLE,
  createProvenPythonTopologyWorker,
} from "../src/infrastructure/topology/createProvenPythonTopologyWorker.js";
import { LocalTopologyArtifactStore } from "../src/infrastructure/topology/localTopologyArtifactStore.js";

const pythonExecutable = resolve(
  process.env.TOPOLOGY_WORKER_PYTHON
    ?? ".scratch/component-topology-kernel/conformance-proof/.venv/Scripts/python.exe",
);
const timberFixture = resolve(
  ".scratch/component-topology-kernel/recipe-contract/valid-timber-framing.json",
);

describe("proven Python topology worker through the Topology Analysis Request seam", () => {
  it("persists complete timber evidence while preserving the layer-only Calculation Snapshot byte-for-byte", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "proven-topology-worker-"));
    try {
      const recipe = JSON.parse(await readFile(timberFixture, "utf8"));
      const layerOnlySnapshot = {
        uValueWPerM2K: 0.315,
        readinessState: "ready",
        layers: [{ material: "mineral-wool", thicknessM: 0.14 }],
      } as const;
      const layerOnlyBytes = JSON.stringify(layerOnlySnapshot);
      const service = createTopologyAnalysisRequestService({
        artifactStore: new LocalTopologyArtifactStore(artifactRoot),
        worker: createProvenPythonTopologyWorker({ pythonExecutable }),
        now: () => "2026-07-25T12:00:00.000Z",
      });

      const command = {
        sourceRevisionId: "rev-timber-1",
        sourceAssemblyGroupId: "ag-timber",
        correlationId: uuidFor(1),
        idempotencyKey: sha256("timber-real-worker"),
        recipe,
        recipeHash: "e00809f597515819067752e159f8f396e38e673d1ac36705136c01062ef00654",
        bundle: PROVEN_TOPOLOGY_BUNDLE,
        layerOnlySnapshot,
      } as const;
      const result = await service.submit(command);

      expect(result.outcome).toBe("preliminary-unsafe");
      expect(result.effectiveUValueWPerM2K).toBeGreaterThan(0);
      expect(result.evidence?.canonicalAnalysisGeometry.schemaVersion).toBe(
        "canonical-analysis-geometry/v1",
      );
      expect(Math.abs(result.evidence?.topologyAudit.gap_area_m2 ?? 1)).toBeLessThanOrEqual(1e-11);
      expect(result.evidence?.numericalProof.refinements).toHaveLength(4);
      expect(result.evidence?.numericalProof.gates).toEqual({
        topology_audit: true,
        mesh_convergence: true,
        solver_residual: true,
        hot_cold_balance: true,
        periodic_balance: true,
        repeat_cell_stability: true,
      });
      expect(result.evidence?.reproducibilityManifestHash).toMatch(/^[a-f0-9]{64}$/);
      const reproducibilityManifest = result.evidence?.reproducibilityManifest as Record<string, unknown>;
      const frozenManifest = JSON.parse(
        await readFile(
          resolve(".scratch/component-topology-kernel/conformance-proof/artifacts/physical-conformance/timber/manifest.json"),
          "utf8",
        ),
      );
      const frozenResult = JSON.parse(
        await readFile(
          resolve(".scratch/component-topology-kernel/conformance-proof/artifacts/physical-conformance/timber/result.json"),
          "utf8",
        ),
      );
      const frozenManifestHash = frozenResult.hashes.sourceManifestSha256 as string;
      expect(reproducibilityManifest.frozenConformanceSourceManifestSha256).toBe(frozenManifestHash);
      const frozenFiles = frozenManifest.files as Record<string, string>;
      const productionFiles = reproducibilityManifest.sourceFiles as Record<string, string>;
      expect(productionFiles["compiler.py"]).toBe(frozenFiles[".scratch/component-topology-kernel/conformance-proof/compiler.py"]);
      expect(productionFiles["primitive_plugins.py"]).toBe(frozenFiles[".scratch/component-topology-kernel/conformance-proof/primitive_plugins.py"]);
      expect(productionFiles["material-pack.json"]).toBe(frozenFiles[".scratch/component-topology-kernel/conformance-proof/material-pack.json"]);
      expect(productionFiles["numerical_utils.py"]).toBe(frozenFiles[".scratch/component-topology-kernel/worker-spike/numerical_utils.py"]);
      expect(productionFiles["requirements.lock.txt"]).toBe(frozenFiles[".scratch/component-topology-kernel/worker-spike/requirements.txt"]);
      expect(result.evidence?.artifactIndex.length).toBeGreaterThanOrEqual(6);
      expect(JSON.stringify(result.layerOnlySnapshot)).toBe(layerOnlyBytes);

      const persisted = JSON.parse(
        await readFile(join(result.artifactDirectory, "result.json"), "utf8"),
      );
      expect(persisted.workerResult.evidence.numericalProof.refinements).toHaveLength(4);
      expect(JSON.stringify(layerOnlySnapshot)).toBe(layerOnlyBytes);
      const duplicate = await service.submit({ ...command, correlationId: uuidFor(2) });
      expect(duplicate.requestId).toBe(result.requestId);
      const artifactToRemove = result.evidence?.artifactIndex[0]?.name;
      expect(artifactToRemove).toBeTruthy();
      await rm(join(result.artifactDirectory, "worker", artifactToRemove!), { force: true });
      await expect(service.submit({ ...command, correlationId: uuidFor(3) })).rejects.toThrow("missing");
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  }, 120_000);

  it("matches the frozen C and Z one/two-row numerical fixture matrix", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "proven-topology-frozen-matrix-"));
    const fixtures = [
      ["valid-single-c-row.json", 1.1096050180516845],
      ["valid-aligned-c-rows.json", 0.34368070096044545],
      ["valid-staggered-c-rows.json", 0.26493423641835795],
      ["valid-z-profile-regression.json", 0.2399856428620613],
    ] as const;
    try {
      for (const [index, [fixture, frozenUValue]] of fixtures.entries()) {
        const recipe = JSON.parse(
          await readFile(resolve(".scratch/component-topology-kernel/recipe-contract", fixture), "utf8"),
        );
        const service = createTopologyAnalysisRequestService({
          artifactStore: new LocalTopologyArtifactStore(artifactRoot),
          worker: createProvenPythonTopologyWorker({ pythonExecutable }),
        });
        const result = await service.submit({
          sourceRevisionId: "rev-frozen-matrix",
          sourceAssemblyGroupId: "ag-frozen-matrix",
          correlationId: uuidFor(index + 10),
          idempotencyKey: sha256(`frozen-matrix-${fixture}`),
          recipe,
          recipeHash: sha256(recipe),
          bundle: PROVEN_TOPOLOGY_BUNDLE,
          layerOnlySnapshot: { uValueWPerM2K: 0.315 },
        });
        expect(result.outcome, fixture).toBe("preliminary-unsafe");
        expect(result.effectiveUValueWPerM2K, fixture).toBeCloseTo(frozenUValue, 10);
        expect((result.evidence?.reproducibilityManifest as Record<string, unknown>).frozenConformanceSourceManifestSha256, fixture).toBe(
          "ce2329bd4ccbac71729addcd11f328ef4b35478767e3089d10bd290d772a3718",
        );
      }
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  }, 360_000);

  it("rejects unsupported, invalid, blocked, and incompatible requests without numerical output", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "proven-topology-rejections-"));
    try {
      const timber = JSON.parse(await readFile(timberFixture, "utf8")) as MutableRecipe;
      const singleC = JSON.parse(
        await readFile(
          resolve(".scratch/component-topology-kernel/recipe-contract/valid-single-c-row.json"),
          "utf8",
        ),
      ) as MutableRecipe;
      const cases: Array<{
        name: string;
        expected: "blocked" | "rejected";
        recipe: JsonValue;
        bundle?: typeof PROVEN_TOPOLOGY_BUNDLE;
      }> = [
        {
          name: "unknown-primitive",
          expected: "rejected",
          recipe: changed(singleC, (value) => {
            value.rows[0].member.primitive.kind = "standard.omega";
          }),
        },
        {
          name: "out-of-host",
          expected: "rejected",
          recipe: changed(singleC, (value) => {
            value.rows[0].originY.value = 0.02;
          }),
        },
        {
          name: "crossed-framing",
          expected: "rejected",
          recipe: changed(timber, (value) => {
            value.rows[0].member.orientation = "orthogonal-to-section";
          }),
        },
        {
          name: "point-fixing",
          expected: "rejected",
          recipe: changed(singleC, (value) => {
            value.rows[0].member.placementMode = "discrete-point";
          }),
        },
        {
          name: "overlapping-members",
          expected: "rejected",
          recipe: changed(timber, (value) => {
            value.rows.push({ ...structuredClone(value.rows[0]), id: "overlapping-row" });
          }),
        },
        {
          name: "periodic-seam-without-valid-cut",
          expected: "rejected",
          recipe: changed(timber, (value) => {
            value.rows[0].member.primitive.parameters.width = 0.6;
          }),
        },
        {
          name: "conflicting-critical-input",
          expected: "blocked",
          recipe: changed(singleC, (value) => {
            value.periodicity = {
              value: null,
              authority: { state: "conflicting", sourceRefs: ["ifc:0.6", "review:0.4"], reason: "Conflicting spacing" },
            };
          }),
        },
        {
          name: "missing-critical-input",
          expected: "blocked",
          recipe: changed(singleC, (value) => {
            value.rows[0].originY.authority = {
              state: "missing",
              sourceRefs: [],
              reason: "Member depth evidence is missing",
            };
          }),
        },
        {
          name: "invalid-local-parameter",
          expected: "rejected",
          recipe: changed(singleC, (value) => {
            value.rows[0].member.primitive.parameters.gauge = -0.0015;
          }),
        },
        {
          name: "unknown-recipe-semantics",
          expected: "rejected",
          recipe: changed(singleC, (value) => {
            value.futurePhysics = { kind: "unreviewed-contact-model" };
          }),
        },
        {
          name: "incompatible-registry",
          expected: "rejected",
          recipe: structuredClone(timber),
          bundle: { ...PROVEN_TOPOLOGY_BUNDLE, registryHash: "0".repeat(64) },
        },
      ];
      const productState = {
        ifcEvidence: { fileHash: "immutable-ifc" },
        activeRevisionId: "rev-active",
        historicalRevisions: ["rev-old", "rev-active"],
        layerOnlySnapshot: { uValueWPerM2K: 0.315 },
      } as const;
      const productStateBytes = JSON.stringify(productState);

      for (const [index, item] of cases.entries()) {
        const service = createTopologyAnalysisRequestService({
          artifactStore: new LocalTopologyArtifactStore(artifactRoot),
          worker: createProvenPythonTopologyWorker({ pythonExecutable }),
        });
        const result = await service.submit({
          sourceRevisionId: productState.activeRevisionId,
          sourceAssemblyGroupId: "ag-rejection",
          correlationId: uuidFor(index + 100),
          idempotencyKey: sha256(`rejection-${item.name}`),
          recipe: item.recipe,
          recipeHash: sha256(item.recipe),
          bundle: item.bundle ?? PROVEN_TOPOLOGY_BUNDLE,
          layerOnlySnapshot: productState.layerOnlySnapshot,
        });

        expect(result.outcome, item.name).toBe(item.expected);
        expect(result.effectiveUValueWPerM2K, item.name).toBeNull();
        expect(result.evidence, item.name).toBeNull();
        expect(JSON.stringify(productState), item.name).toBe(productStateBytes);
      }
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  }, 120_000);

  it("solves a hat profile and an independently registered vendor block through the same seam", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "proven-topology-plugins-"));
    try {
      const timber = JSON.parse(await readFile(timberFixture, "utf8")) as MutableRecipe;
      const singleC = JSON.parse(
        await readFile(
          resolve(".scratch/component-topology-kernel/recipe-contract/valid-single-c-row.json"),
          "utf8",
        ),
      ) as MutableRecipe;
      const recipes = [
        changed(singleC, (value) => {
          value.rows[0].member.primitive = {
            kind: "standard.hat",
            version: "1.0.0",
            parameters: { depth: 0.15, topFlangeWidth: 0.05, baseFlangeWidth: 0.06, gauge: 0.0015 },
          };
        }),
        changed(timber, (value) => {
          value.rows[0].member.primitive.kind = "vendor.block";
        }),
      ];

      for (const [index, recipe] of recipes.entries()) {
        const service = createTopologyAnalysisRequestService({
          artifactStore: new LocalTopologyArtifactStore(artifactRoot),
          worker: createProvenPythonTopologyWorker({ pythonExecutable }),
        });
        const result = await service.submit({
          sourceRevisionId: "rev-plugin",
          sourceAssemblyGroupId: "ag-plugin",
          correlationId: uuidFor(index + 200),
          idempotencyKey: sha256(`plugin-${index}`),
          recipe,
          recipeHash: sha256(recipe),
          bundle: PROVEN_TOPOLOGY_BUNDLE,
          layerOnlySnapshot: { uValueWPerM2K: 0.315 },
        });
        expect(result.outcome, `plugin ${index}`).toBe("preliminary-unsafe");
        expect(result.evidence?.numericalProof.gates, `plugin ${index}`).toEqual({
          topology_audit: true,
          mesh_convergence: true,
          solver_residual: true,
          hot_cold_balance: true,
          periodic_balance: true,
          repeat_cell_stability: true,
        });
      }
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  }, 180_000);

  it("terminates deadline and cancellation requests without publishing numerical output", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "proven-topology-lifecycle-"));
    try {
      const recipe = JSON.parse(await readFile(timberFixture, "utf8"));
      const worker = createProvenPythonTopologyWorker({ pythonExecutable });
      const service = createTopologyAnalysisRequestService({ artifactStore: new LocalTopologyArtifactStore(artifactRoot), worker });
      const base = {
        sourceRevisionId: "rev-lifecycle",
        sourceAssemblyGroupId: "ag-lifecycle",
        recipe,
        recipeHash: sha256(recipe),
        bundle: PROVEN_TOPOLOGY_BUNDLE,
        layerOnlySnapshot: { uValueWPerM2K: 0.315 },
      } as const;

      const timedOut = await service.submit({
        ...base,
        correlationId: uuidFor(300),
        idempotencyKey: sha256("lifecycle-timeout"),
        deadlineAt: "2000-01-01T00:00:00.000Z",
      });
      expect(timedOut.outcome).toBe("failed");
      expect(timedOut.errorCode).toBe("worker_deadline_exceeded");
      expect(timedOut.effectiveUValueWPerM2K).toBeNull();
      expect(timedOut.evidence).toBeNull();

      const cancellation = new AbortController();
      cancellation.abort();
      const cancelled = await service.submit({
        ...base,
        correlationId: uuidFor(301),
        idempotencyKey: sha256("lifecycle-cancelled"),
        cancellationSignal: cancellation.signal,
      });
      expect(cancelled.outcome).toBe("cancelled");
      expect(cancelled.errorCode).toBe("worker_cancelled");
      expect(cancelled.effectiveUValueWPerM2K).toBeNull();
      expect(cancelled.evidence).toBeNull();
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });
});

type MutableAuthored = { [key: string]: JsonValue; value: JsonValue; authority: { [key: string]: JsonValue; state: string; sourceRefs: string[]; reason: string } };
type MutablePrimitive = { [key: string]: JsonValue; kind: string; version: string; parameters: { [key: string]: JsonValue } };
type MutableMember = { [key: string]: JsonValue; primitive: MutablePrimitive; orientation: string; placementMode: string };
type MutableRow = { [key: string]: JsonValue; id: string; originY: MutableAuthored; member: MutableMember };
type MutableRecipe = { [key: string]: JsonValue; periodicity: MutableAuthored; rows: MutableRow[] };

function changed<T>(source: T, change: (value: T) => void): T {
  const value = structuredClone(source);
  change(value);
  return value;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function uuidFor(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}
