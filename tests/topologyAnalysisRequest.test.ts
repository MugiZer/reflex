import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTopologyAnalysisRequestService } from "../src/application/topology/createTopologyAnalysisRequestService.js";
import type { TopologyWorkerRuntime } from "../src/domain/topology/topologyTypes.js";

const recipe = { schema: "declarative-construction-recipe.v1", layers: [{ material: "mineral-wool", thicknessM: 0.12 }] };
const bundle = { moduleId: "repeating-parallel-profile-wall-2d", moduleVersion: "1.0.0", registryHash: "registry-sha256", packHash: "pack-sha256", runtimeHash: "runtime-sha256" };

describe("Topology Analysis Request seam", () => {
  it("persists one immutable preliminary result without changing the layer-only revision", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "topology-request-"));
    try {
      const worker = successfulWorker();
      const service = createTopologyAnalysisRequestService({ artifactRoot, worker, now: () => "2026-07-25T12:00:00.000Z" });
      const layerOnlySnapshot = { uValueWPerM2K: 0.315, readinessState: "ready" };
      const submitted = await service.submit({ sourceRevisionId: "rev_1", sourceAssemblyGroupId: "ag_1", correlationId: "correlation-1", idempotencyKey: "key-1", recipe, recipeHash: "recipe-sha256", bundle, layerOnlySnapshot });

      expect(submitted.outcome).toBe("preliminary-unsafe");
      expect(submitted.sourceRevisionId).toBe("rev_1");
      expect(submitted.layerOnlySnapshot).toEqual(layerOnlySnapshot);
      expect(submitted.artifactDirectory).toContain("key-1");
      expect(worker.messages).toHaveLength(1);
      await expect(readFile(join(submitted.artifactDirectory, "result.json"), "utf8")).resolves.toContain("preliminary-unsafe");

      const duplicate = await service.submit({ sourceRevisionId: "rev_1", sourceAssemblyGroupId: "ag_1", correlationId: "correlation-2", idempotencyKey: "key-1", recipe, recipeHash: "recipe-sha256", bundle, layerOnlySnapshot });
      expect(duplicate.requestId).toBe(submitted.requestId);
      expect(worker.messages).toHaveLength(1);
      const restartedWorker = successfulWorker();
      const restarted = createTopologyAnalysisRequestService({ artifactRoot, worker: restartedWorker, now: () => "2026-07-25T12:00:00.000Z" });
      const persistedDuplicate = await restarted.submit({ sourceRevisionId: "rev_1", sourceAssemblyGroupId: "ag_1", correlationId: "correlation-4", idempotencyKey: "key-1", recipe, recipeHash: "recipe-sha256", bundle, layerOnlySnapshot });
      expect(persistedDuplicate.requestId).toBe(submitted.requestId);
      expect(restartedWorker.messages).toHaveLength(0);
      await expect(service.submit({ sourceRevisionId: "rev_1", sourceAssemblyGroupId: "ag_1", correlationId: "correlation-3", idempotencyKey: "key-1", recipe: { ...recipe, layers: [] }, recipeHash: "different", bundle, layerOnlySnapshot })).rejects.toThrow("idempotency key");
    } finally { await rm(artifactRoot, { recursive: true, force: true }); }
  });

  it("classifies protocol identity mismatches as rejected and publishes only an error artifact", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "topology-request-"));
    try {
      const service = createTopologyAnalysisRequestService({ artifactRoot, worker: successfulWorker({ requestId: "wrong-request" }), now: () => "2026-07-25T12:00:00.000Z" });
      const result = await service.submit({ sourceRevisionId: "rev_1", sourceAssemblyGroupId: "ag_1", correlationId: "correlation-1", idempotencyKey: "key-2", recipe, recipeHash: "recipe-sha256", bundle, layerOnlySnapshot: { uValueWPerM2K: 0.315 } });
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
      const notRequested = await unavailable.submit({ sourceRevisionId: "rev_1", sourceAssemblyGroupId: "ag_1", correlationId: "correlation-1", idempotencyKey: "key-none", recipe: null, recipeHash: null, bundle, layerOnlySnapshot });
      expect(notRequested.outcome).toBe("not-requested");
      expect(notRequested.layerOnlySnapshot).toEqual(layerOnlySnapshot);

      const crashed = createTopologyAnalysisRequestService({ artifactRoot, worker: { ...successfulWorker(), async runJsonl() { throw new Error("worker process crashed"); } }, now: () => "2026-07-25T12:00:00.000Z" });
      const failed = await crashed.submit({ sourceRevisionId: "rev_1", sourceAssemblyGroupId: "ag_1", correlationId: "correlation-1", idempotencyKey: "key-crash", recipe, recipeHash: "recipe-sha256", bundle, layerOnlySnapshot });
      expect(failed.outcome).toBe("failed");
      expect(failed.layerOnlySnapshot).toEqual(layerOnlySnapshot);
      await expect(readFile(join(failed.artifactDirectory, "result.json"), "utf8")).rejects.toThrow();
      await expect(readFile(join(failed.artifactDirectory, "error.json"), "utf8")).resolves.toContain("worker_failure");
    } finally { await rm(artifactRoot, { recursive: true, force: true }); }
  });
});

function successfulWorker(overrides: Partial<Record<string, unknown>> = {}): TopologyWorkerRuntime & { messages: string[] } {
  return {
    runtimeIdentity: { executable: "C:/release/topology-worker.exe", runtimeHash: "runtime-sha256" },
    messages: [],
    async runJsonl(message) {
      this.messages.push(message);
      const request = JSON.parse(message) as { requestId: string; correlationId: string; idempotencyKey: string; bundle: typeof bundle };
      return JSON.stringify({ schema: "topology-analysis.result.v1", requestId: request.requestId, correlationId: request.correlationId, idempotencyKey: request.idempotencyKey, bundle: request.bundle, outcome: "preliminary-unsafe", effectiveUValueWPerM2K: 0.42, manifestHash: "manifest-sha256", ...overrides }) + "\n";
    },
  };
}
