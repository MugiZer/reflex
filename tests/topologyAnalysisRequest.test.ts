import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTopologyAnalysisRequestService } from "../src/application/topology/createTopologyAnalysisRequestService.js";
import { cleanupLocalTopologyArtifacts, LocalTopologyArtifactStore } from "../src/infrastructure/topology/localTopologyArtifactStore.js";
import { canonicalTopologyJson } from "../src/domain/topology/canonicalTopologyJson.js";
import type { TopologyWorkerRuntime } from "../src/domain/topology/topologyTypes.js";

const recipe = { schema: "declarative-construction-recipe.v1", layers: [{ material: "mineral-wool", thicknessM: 0.12 }] };
const recipeHash = createHash("sha256").update(canonicalTopologyJson(recipe)).digest("hex");
const bundle = { moduleId: "repeating-parallel-profile-wall-2d", moduleVersion: "1.0.0", registryHash: "a".repeat(64), packHash: "b".repeat(64), runtimeHash: "c".repeat(64) };

describe("Topology Analysis Request seam", () => {
  it("startup cleanup preserves a live claim and its temporary workspace", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "topology-request-live-claim-"));
    const key = idempotencyKey("live-claim");
    const topologyRoot = join(artifactRoot, "topology");
    const lockDirectory = join(topologyRoot, `${key}.lock`);
    const temporaryDirectory = join(topologyRoot, `${key}.tmp-request-live`);
    try {
      await mkdir(lockDirectory, { recursive: true });
      await mkdir(temporaryDirectory, { recursive: true });
      await writeFile(join(lockDirectory, "owner.json"), JSON.stringify({ claimedAt: new Date().toISOString(), processId: process.pid }), "utf8");
      await cleanupLocalTopologyArtifacts(artifactRoot);
      await expect(access(lockDirectory)).resolves.toBeUndefined();
      await expect(access(temporaryDirectory)).resolves.toBeUndefined();
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  it("returns defensive immutable snapshots after caller mutation", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "topology-request-immutable-"));
    try {
      const command = {
        sourceRevisionId: "rev_immutable",
        sourceAssemblyGroupId: "ag_immutable",
        correlationId: correlationId(1),
        idempotencyKey: idempotencyKey("immutable-result"),
        recipe,
        recipeHash,
        bundle,
        layerOnlySnapshot: { uValueWPerM2K: 0.315, readinessState: "ready" },
      } as const;
      const service = createTopologyAnalysisRequestService({
        artifactStore: new LocalTopologyArtifactStore(artifactRoot),
        worker: successfulWorker(),
      });
      const first = await service.submit(command);
      const original = structuredClone(first);

      (first as { effectiveUValueWPerM2K: number | null }).effectiveUValueWPerM2K = 9.999;
      (first.layerOnlySnapshot as { uValueWPerM2K: number }).uValueWPerM2K = 8.888;

      expect(service.getByIdempotencyKey(command.idempotencyKey)).toEqual(original);
      expect(await service.submit({ ...command, correlationId: correlationId(2) })).toEqual(original);
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  it("persists one immutable preliminary result without changing the layer-only revision", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "topology-request-"));
    try {
      const worker = successfulWorker();
      const service = createTopologyAnalysisRequestService({ artifactStore: new LocalTopologyArtifactStore(artifactRoot), worker, now: () => "2026-07-25T12:00:00.000Z" });
      const layerOnlySnapshot = { uValueWPerM2K: 0.315, readinessState: "ready" };
      const submitted = await service.submit({ sourceRevisionId: "rev_1", sourceAssemblyGroupId: "ag_1", correlationId: correlationId(1), idempotencyKey: idempotencyKey("key-1"), recipe, recipeHash, bundle, layerOnlySnapshot });

      expect(worker.deadlines[0]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(submitted.outcome).toBe("preliminary-unsafe");
      expect(submitted.sourceRevisionId).toBe("rev_1");
      expect(submitted.layerOnlySnapshot).toEqual(layerOnlySnapshot);
      expect(submitted.artifactDirectory).toContain(idempotencyKey("key-1"));
      expect(worker.messages).toHaveLength(1);
      await expect(readFile(join(submitted.artifactDirectory, "result.json"), "utf8")).resolves.toContain("preliminary-unsafe");

      const duplicate = await service.submit({ sourceRevisionId: "rev_1", sourceAssemblyGroupId: "ag_1", correlationId: correlationId(2), idempotencyKey: idempotencyKey("key-1"), recipe, recipeHash, bundle, layerOnlySnapshot });
      expect(duplicate.requestId).toBe(submitted.requestId);
      expect(worker.messages).toHaveLength(1);
      const restartedWorker = successfulWorker();
      const restarted = createTopologyAnalysisRequestService({ artifactStore: new LocalTopologyArtifactStore(artifactRoot), worker: restartedWorker, now: () => "2026-07-25T12:00:00.000Z" });
      const persistedDuplicate = await restarted.submit({ sourceRevisionId: "rev_1", sourceAssemblyGroupId: "ag_1", correlationId: correlationId(4), idempotencyKey: idempotencyKey("key-1"), recipe, recipeHash, bundle, layerOnlySnapshot });
      expect(persistedDuplicate.requestId).toBe(submitted.requestId);
      expect(restartedWorker.messages).toHaveLength(0);
      const conflict = await service.submit({ sourceRevisionId: "rev_1", sourceAssemblyGroupId: "ag_1", correlationId: correlationId(3), idempotencyKey: idempotencyKey("key-1"), recipe: { ...recipe, layers: [] }, recipeHash: "e".repeat(64), bundle, layerOnlySnapshot });
      expect(conflict.outcome).toBe("rejected");
      expect(conflict.errorCode).toBe("idempotency_conflict");
      await expect(readFile(join(conflict.artifactDirectory, "error.json"), "utf8")).resolves.toContain("idempotency_conflict");
    } finally { await rm(artifactRoot, { recursive: true, force: true }); }
  });

  it("classifies protocol identity mismatches as rejected and publishes only an error artifact", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "topology-request-"));
    try {
      const service = createTopologyAnalysisRequestService({ artifactStore: new LocalTopologyArtifactStore(artifactRoot), worker: successfulWorker({ requestId: "wrong-request" }), now: () => "2026-07-25T12:00:00.000Z" });
      const result = await service.submit({ sourceRevisionId: "rev_1", sourceAssemblyGroupId: "ag_1", correlationId: correlationId(1), idempotencyKey: idempotencyKey("key-2"), recipe, recipeHash, bundle, layerOnlySnapshot: { uValueWPerM2K: 0.315 } });
      expect(result.outcome).toBe("rejected");
      await expect(readFile(join(result.artifactDirectory, "error.json"), "utf8")).resolves.toContain("identity_mismatch");
      await expect(readFile(join(result.artifactDirectory, "result.json"), "utf8")).rejects.toThrow();
    } finally { await rm(artifactRoot, { recursive: true, force: true }); }
  });

  it("keeps layer-only data unchanged when topology is not requested or the pinned worker fails", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "topology-request-"));
    try {
      const layerOnlySnapshot = { uValueWPerM2K: 0.315, readinessState: "ready" };
      const unavailable = createTopologyAnalysisRequestService({ artifactStore: new LocalTopologyArtifactStore(artifactRoot), worker: successfulWorker(), now: () => "2026-07-25T12:00:00.000Z" });
      const notRequested = await unavailable.submit({ sourceRevisionId: "rev_1", sourceAssemblyGroupId: "ag_1", correlationId: correlationId(1), idempotencyKey: idempotencyKey("key-none"), recipe: null, recipeHash: null, bundle, layerOnlySnapshot });
      expect(notRequested.outcome).toBe("not-requested");
      expect(notRequested.layerOnlySnapshot).toEqual(layerOnlySnapshot);

      const crashed = createTopologyAnalysisRequestService({ artifactStore: new LocalTopologyArtifactStore(artifactRoot), worker: { ...successfulWorker(), async runJsonl() { throw new Error("worker process crashed"); } }, now: () => "2026-07-25T12:00:00.000Z" });
      const failed = await crashed.submit({ sourceRevisionId: "rev_1", sourceAssemblyGroupId: "ag_1", correlationId: correlationId(1), idempotencyKey: idempotencyKey("key-crash"), recipe, recipeHash, bundle, layerOnlySnapshot });
      expect(failed.outcome).toBe("failed");
      expect(failed.layerOnlySnapshot).toEqual(layerOnlySnapshot);
      await expect(readFile(join(failed.artifactDirectory, "result.json"), "utf8")).rejects.toThrow();
      await expect(readFile(join(failed.artifactDirectory, "error.json"), "utf8")).resolves.toContain("worker_failure");
    } finally { await rm(artifactRoot, { recursive: true, force: true }); }
  });

  it("publishes no U-value or evidence for every non-success and preserves product state", async () => {
    const originalProductState = {
      ifcEvidence: { fileHash: "ifc-sha256", elements: [{ globalId: "wall-1" }] },
      layerOnlySnapshot: { uValueWPerM2K: 0.315, readinessState: "ready" },
      activeRevisionId: "rev_2",
      historicalRevisions: [{ revisionId: "rev_1" }, { revisionId: "rev_2" }],
    } as const;
    const originalBytes = JSON.stringify(originalProductState);
    const cases = [
      { outcome: "blocked", code: "missing_input" },
      { outcome: "rejected", code: "invalid_geometry" },
      { outcome: "failed", code: "worker_failure" },
      { outcome: "cancelled", code: "worker_cancelled" },
    ] as const;

    for (const [index, expected] of cases.entries()) {
      const artifactRoot = await mkdtemp(join(tmpdir(), "topology-request-"));
      try {
        const worker = successfulWorker();
        worker.runJsonl = async (message) => {
          const request = JSON.parse(message) as { requestId: string; correlationId: string; idempotencyKey: string; bundle: typeof bundle };
          return JSON.stringify({
            schema: "topology-analysis.error.v1",
            requestId: request.requestId,
            correlationId: request.correlationId,
            idempotencyKey: request.idempotencyKey,
            bundle: request.bundle,
            ...expected,
            message: "safe diagnostic",
          }) + "\n";
        };
        const service = createTopologyAnalysisRequestService({ artifactStore: new LocalTopologyArtifactStore(artifactRoot), worker });
        const result = await service.submit({
          sourceRevisionId: originalProductState.activeRevisionId,
          sourceAssemblyGroupId: "ag_1",
          correlationId: correlationId(index + 10),
          idempotencyKey: idempotencyKey(`non-success-${index}`),
          recipe,
          recipeHash,
          bundle,
          layerOnlySnapshot: originalProductState.layerOnlySnapshot,
        });

        expect(result.outcome).toBe(expected.outcome);
        expect(result.effectiveUValueWPerM2K).toBeNull();
        expect(result.evidence).toBeNull();
        expect(result.diagnostics).toMatchObject({ code: expected.code, message: "safe diagnostic" });
        expect(JSON.stringify(originalProductState)).toBe(originalBytes);
        await expect(readFile(join(result.artifactDirectory, "result.json"), "utf8")).rejects.toThrow();
      } finally {
        await rm(artifactRoot, { recursive: true, force: true });
      }
    }
  });

  it("rejects a nominal success when required numerical evidence is absent", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "topology-request-"));
    try {
      const service = createTopologyAnalysisRequestService({
        artifactStore: new LocalTopologyArtifactStore(artifactRoot),
        worker: successfulWorker({ evidence: {} }),
      });
      const result = await service.submit({
        sourceRevisionId: "rev_1",
        sourceAssemblyGroupId: "ag_1",
        correlationId: correlationId(20),
        idempotencyKey: idempotencyKey("incomplete-evidence"),
        recipe,
        recipeHash,
        bundle,
        layerOnlySnapshot: { uValueWPerM2K: 0.315 },
      });
      expect(result.outcome).toBe("rejected");
      expect(result.errorCode).toBe("invalid_result");
      expect(result.effectiveUValueWPerM2K).toBeNull();
      expect(result.evidence).toBeNull();
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  it("does not delete a temporary artifact owned by another invocation", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "topology-request-"));
    try {
      const key = idempotencyKey("stale-temporary");
      const staleDirectory = join(artifactRoot, "topology", `${key}.tmp-abandoned`);
      await mkdir(staleDirectory, { recursive: true });
      await writeFile(join(staleDirectory, "partial.json"), "partial", "utf8");
      const service = createTopologyAnalysisRequestService({ artifactStore: new LocalTopologyArtifactStore(artifactRoot), worker: successfulWorker() });

      const result = await service.submit({
        sourceRevisionId: "rev_1",
        sourceAssemblyGroupId: "ag_1",
        correlationId: correlationId(30),
        idempotencyKey: key,
        recipe,
        recipeHash,
        bundle,
        layerOnlySnapshot: { uValueWPerM2K: 0.315 },
      });

      expect(result.outcome).toBe("preliminary-unsafe");
      await expect(access(staleDirectory)).resolves.toBeUndefined();
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  it("persists invalid requests as rejected request and error artifacts without invoking the worker", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "topology-request-"));
    try {
      const worker = successfulWorker();
      const service = createTopologyAnalysisRequestService({ artifactStore: new LocalTopologyArtifactStore(artifactRoot), worker });
      const result = await service.submit({
        sourceRevisionId: "rev-invalid",
        sourceAssemblyGroupId: "ag-invalid",
        correlationId: correlationId(40),
        idempotencyKey: idempotencyKey("invalid-recipe-hash"),
        recipe,
        recipeHash: "e".repeat(64),
        bundle,
        layerOnlySnapshot: { uValueWPerM2K: 0.315 },
      });

      expect(result.outcome).toBe("rejected");
      expect(result.errorCode).toBe("recipe_hash_mismatch");
      expect(result.diagnostics).toMatchObject({ code: "recipe_hash_mismatch" });
      expect(worker.messages).toHaveLength(0);
      await expect(readFile(join(result.artifactDirectory, "request.json"), "utf8")).resolves.toContain("recipeHash");
      await expect(readFile(join(result.artifactDirectory, "error.json"), "utf8")).resolves.toContain("recipe_hash_mismatch");
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  it("shares one in-flight publication for concurrent equal idempotency submissions", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "topology-request-"));
    try {
      const worker = successfulWorker();
      const originalRun = worker.runJsonl.bind(worker);
      worker.runJsonl = async (message, options) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return originalRun(message, options);
      };
      const service = createTopologyAnalysisRequestService({ artifactStore: new LocalTopologyArtifactStore(artifactRoot), worker });
      const command = {
        sourceRevisionId: "rev-concurrent",
        sourceAssemblyGroupId: "ag-concurrent",
        correlationId: correlationId(41),
        idempotencyKey: idempotencyKey("concurrent"),
        recipe,
        recipeHash,
        bundle,
        layerOnlySnapshot: { uValueWPerM2K: 0.315 },
      };

      const [first, duplicate] = await Promise.all([
        service.submit(command),
        service.submit({ ...command, correlationId: correlationId(42) }),
      ]);

      expect(duplicate.requestId).toBe(first.requestId);
      expect(worker.messages).toHaveLength(1);
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });
});

function successfulWorker(overrides: Partial<Record<string, unknown>> = {}): TopologyWorkerRuntime & { messages: string[]; deadlines: string[] } {
  return {
    deadlines: [],
    runtimeIdentity: { executable: "C:/release/topology-worker.exe", runtimeHash: bundle.runtimeHash },
    messages: [],
    async verifyArtifacts() {},
    async runJsonl(message, options) {
      this.deadlines.push(options.deadlineAt);
      this.messages.push(message);
      const request = JSON.parse(message) as { requestId: string; correlationId: string; idempotencyKey: string; bundle: typeof bundle; artifactDestination: string };
      const artifactBytes = Buffer.from("{}\n", "utf8");
      await mkdir(request.artifactDestination, { recursive: true });
      await writeFile(join(request.artifactDestination, "numerical-proof.json"), artifactBytes);
      return JSON.stringify({ schema: "topology-analysis.result.v1", requestId: request.requestId, correlationId: request.correlationId, idempotencyKey: request.idempotencyKey, bundle: request.bundle, outcome: "preliminary-unsafe", effectiveUValueWPerM2K: 0.42, evidence: completeWorkerEvidence(request, artifactBytes), ...overrides }) + "\n";
    },
  };
}

function completeWorkerEvidence(request: { requestId: string; bundle: typeof bundle } & Record<string, unknown>, artifactBytes: Buffer) {
  const firstRefinement = {
    free_dof_solver_residual: 1e-12,
    u_value_w_m2k: 0.42,
    relative_change: null,
    flux_diagnostics: { hot_in_w_per_m: 1, cold_out_w_per_m: 1, periodic_net_out_w_per_m: 0, hot_cold_relative_imbalance: 0, periodic_relative_imbalance: 0 },
  };
  const refinement = { ...firstRefinement, relative_change: 0.001 };
  const reproducibilityManifest = {
    schemaVersion: "topology-reproducibility-manifest/v1",
    request: { requestId: request.requestId, recipeSha256: request.recipeHash, bundle: request.bundle },
    module: { id: request.bundle.moduleId, version: request.bundle.moduleVersion },
    primitiveRegistrySha256: request.bundle.registryHash,
    packBundleSha256: request.bundle.packHash,
    runtimeIdentitySha256: request.bundle.runtimeHash,
  };
  return {
    canonicalAnalysisGeometry: {
      schemaVersion: "canonical-analysis-geometry/v1",
      materialRegions: [{ regionId: "host" }, { regionId: "member" }],
      interfaces: [{ region_a: "host", region_b: "member" }],
    },
    topologyAudit: {
      gap_area_m2: 0,
      overlap_area_m2: 0,
      area_residual_m2: 0,
      out_of_host_area_m2: 0,
      sliver_count: 0,
    },
    numericalProof: {
      thresholds: { mesh_relative_change: 0.005, solver_residual: 1e-8, hot_cold_balance: 0.005, periodic_balance: 0.001, repeat_cell_stability: 0.005 },
      refinements: [firstRefinement, refinement, refinement],
      doubleCell: refinement,
      oneTwoCellRelativeDifference: 0,
      gates: {
        topology_audit: true,
        mesh_convergence: true,
        solver_residual: true,
        hot_cold_balance: true,
        periodic_balance: true,
        repeat_cell_stability: true,
      },
    },
    reproducibilityManifest,
    reproducibilityManifestHash: createHash("sha256").update(JSON.stringify(reproducibilityManifest)).digest("hex"),
    artifactIndex: [{ name: "numerical-proof.json", sha256: createHash("sha256").update(artifactBytes).digest("hex"), sizeBytes: artifactBytes.length }],
  };
}

function correlationId(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function idempotencyKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
