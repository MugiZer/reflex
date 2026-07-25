import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTopologyAnalysisRequestService } from "../src/application/topology/createTopologyAnalysisRequestService.js";
import type { TopologyWorkerRuntime } from "../src/domain/topology/topologyTypes.js";

const recipe = { schema: "declarative-construction-recipe.v1", layers: [{ material: "mineral-wool", thicknessM: 0.12 }] };
const recipeHash = "d".repeat(64);
const bundle = { moduleId: "repeating-parallel-profile-wall-2d", moduleVersion: "1.0.0", registryHash: "a".repeat(64), packHash: "b".repeat(64), runtimeHash: "c".repeat(64) };

describe("Topology Analysis Request seam", () => {
  it("persists one immutable preliminary result without changing the layer-only revision", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "topology-request-"));
    try {
      const worker = successfulWorker();
      const service = createTopologyAnalysisRequestService({ artifactRoot, worker, now: () => "2026-07-25T12:00:00.000Z" });
      const layerOnlySnapshot = { uValueWPerM2K: 0.315, readinessState: "ready" };
      const submitted = await service.submit({ sourceRevisionId: "rev_1", sourceAssemblyGroupId: "ag_1", correlationId: correlationId(1), idempotencyKey: idempotencyKey("key-1"), recipe, recipeHash, bundle, layerOnlySnapshot });

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
      const restarted = createTopologyAnalysisRequestService({ artifactRoot, worker: restartedWorker, now: () => "2026-07-25T12:00:00.000Z" });
      const persistedDuplicate = await restarted.submit({ sourceRevisionId: "rev_1", sourceAssemblyGroupId: "ag_1", correlationId: correlationId(4), idempotencyKey: idempotencyKey("key-1"), recipe, recipeHash, bundle, layerOnlySnapshot });
      expect(persistedDuplicate.requestId).toBe(submitted.requestId);
      expect(restartedWorker.messages).toHaveLength(0);
      await expect(service.submit({ sourceRevisionId: "rev_1", sourceAssemblyGroupId: "ag_1", correlationId: correlationId(3), idempotencyKey: idempotencyKey("key-1"), recipe: { ...recipe, layers: [] }, recipeHash: "e".repeat(64), bundle, layerOnlySnapshot })).rejects.toThrow("idempotency key");
    } finally { await rm(artifactRoot, { recursive: true, force: true }); }
  });

  it("classifies protocol identity mismatches as rejected and publishes only an error artifact", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "topology-request-"));
    try {
      const service = createTopologyAnalysisRequestService({ artifactRoot, worker: successfulWorker({ requestId: "wrong-request" }), now: () => "2026-07-25T12:00:00.000Z" });
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
      const unavailable = createTopologyAnalysisRequestService({ artifactRoot, worker: successfulWorker(), now: () => "2026-07-25T12:00:00.000Z" });
      const notRequested = await unavailable.submit({ sourceRevisionId: "rev_1", sourceAssemblyGroupId: "ag_1", correlationId: correlationId(1), idempotencyKey: idempotencyKey("key-none"), recipe: null, recipeHash: null, bundle, layerOnlySnapshot });
      expect(notRequested.outcome).toBe("not-requested");
      expect(notRequested.layerOnlySnapshot).toEqual(layerOnlySnapshot);

      const crashed = createTopologyAnalysisRequestService({ artifactRoot, worker: { ...successfulWorker(), async runJsonl() { throw new Error("worker process crashed"); } }, now: () => "2026-07-25T12:00:00.000Z" });
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
        const service = createTopologyAnalysisRequestService({ artifactRoot, worker });
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
        artifactRoot,
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
});

function successfulWorker(overrides: Partial<Record<string, unknown>> = {}): TopologyWorkerRuntime & { messages: string[] } {
  return {
    runtimeIdentity: { executable: "C:/release/topology-worker.exe", runtimeHash: bundle.runtimeHash },
    messages: [],
    async verifyArtifacts() {},
    async runJsonl(message) {
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
