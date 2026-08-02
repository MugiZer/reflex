import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { submitJobTopologyReview } from "../src/application/topology/submitJobTopologyReview.js";
import { SqliteJobRepository } from "../src/infrastructure/persistence/sqlite/SqliteJobRepository.js";

describe("Job topology review persistence seam", () => {
  it("persists and replays an auditable stale-revision rejection without loading evidence or invoking the worker", async () => {
    const root = join(tmpdir(), `job-topology-review-${Date.now()}`);
    const repository = new SqliteJobRepository(join(root, "data", "app.db"));
    try {
      repository.createJob({ jobId: "job_topology", jobStatus: "completed", originalFilename: "fixture.ifc", uploadPath: "fixture.ifc", fileHash: "fixture", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", errorMessage: null, reportPath: null, activeRevisionId: "rev_active" });
      let evidenceLoads = 0;
      const command = {
        jobId: "job_topology",
        body: { opportunityId: "topology_candidate", thermalConstructionSignature: "signature", sourceRevisionId: "rev_stale", sourceAssemblyGroupId: "assembly_1", answers: { memberWidthM: 0.045 } },
        jobs: repository,
        evidence: { async load() { evidenceLoads += 1; return null; } },
        requests: { async submit() { throw new Error("worker must not be called"); } },
        bundle: { moduleId: "repeating-parallel-profile-wall-2d", moduleVersion: "1.0.0", registryHash: "a".repeat(64), packHash: "b".repeat(64), runtimeHash: "c".repeat(64) },
      } as const;

      const first = await submitJobTopologyReview(command);
      const replay = await submitJobTopologyReview(command);

      expect(first).toMatchObject({ outcome: "rejected", errorCode: "stale_source_revision", opportunity: null, sourceRevisionId: "rev_stale" });
      if (!("topologyReviewId" in first) || !("topologyReviewId" in replay)) throw new Error("Expected topology review rejection records.");
      expect(replay.topologyReviewId).toBe(first.topologyReviewId);
      expect(repository.listTopologyReviews("job_topology")).toHaveLength(1);
      expect(evidenceLoads).toBe(0);
    } finally {
      repository.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
