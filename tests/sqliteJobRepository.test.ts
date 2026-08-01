import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { JobRecord, JobTopologyReview } from "../src/domain/jobs/jobTypes.js";
import { SqliteJobRepository } from "../src/infrastructure/persistence/sqlite/SqliteJobRepository.js";

describe("SqliteJobRepository contract", () => {
  it("creates, updates, lists, stores Review state, and stores report metadata", async () => {
    const root = join(tmpdir(), `sqlite-job-repo-${Date.now()}`);
    const repo = new SqliteJobRepository(join(root, "data", "app.db"));
    try {
      repo.createJob(jobRecord("job_1", "queued"));

      expect(repo.getJob("job_1")).toEqual(expect.objectContaining({
        jobId: "job_1",
        jobStatus: "queued",
      }));
      expect(repo.listRecentJobs(1)).toEqual([
        expect.objectContaining({ jobId: "job_1", jobStatus: "queued" }),
      ]);

      repo.updateJob("job_1", {
        jobStatus: "needs_review",
        fileHash: "hash_1",
      });
      repo.saveReviewState({
        jobId: "job_1",
        requestedInputs: [
          {
            requestedInputId: "ri_1",
            reviewGroupId: "ag_1",
            reviewGroupKind: "assembly_group",
            assemblyGroupId: "ag_1",
            datapoint: "layer_lambda",
            question: "Lambda?",
            inputType: "number",
            unit: "W/mK",
            affects: ["calculation"],
            scope: { scopeKind: "assembly_group", assemblyGroupId: "ag_1" },
            evidenceReferences: [],
          },
        ],
      });
      repo.updateJob("job_1", {
        jobStatus: "completed",
        reportPath: "outputs/job_1/report.html",
        activeRevisionId: "rev_1",
      });

      expect(repo.getReviewState("job_1")?.requestedInputs[0]).toEqual(
        expect.objectContaining({ requestedInputId: "ri_1", datapoint: "layer_lambda" }),
      );
      expect(repo.getJob("job_1")).toEqual(expect.objectContaining({
        jobStatus: "completed",
        fileHash: "hash_1",
        reportPath: "outputs/job_1/report.html",
        activeRevisionId: "rev_1",
      }));
    } finally {
      repo.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects updates for missing Jobs", async () => {
    const root = join(tmpdir(), `sqlite-job-repo-missing-${Date.now()}`);
    const repo = new SqliteJobRepository(join(root, "data", "app.db"));
    try {
      expect(() => repo.updateJob("missing", { jobStatus: "failed" })).toThrow(
        "Job not found: missing",
      );
    } finally {
      repo.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refuses a review whose durable recipe identity was tampered with", async () => {
    const root = join(tmpdir(), `sqlite-job-repo-topology-${Date.now()}`);
    const databasePath = join(root, "data", "app.db");
    const repo = new SqliteJobRepository(databasePath);
    try {
      repo.createJob(jobRecord("job_topology", "completed"));
      const review = topologyReview();
      repo.saveTopologyReview(review);
      const database = (repo as unknown as { db: { prepare(sql: string): { run(...values: unknown[]): void } } }).db;
      const tampered = JSON.stringify({ ...review, recipeHash: "f".repeat(64) });
      database.prepare("update job_topology_reviews set payload_json = ? where topology_review_id = ?").run(tampered, review.topologyReviewId);
      expect(() => repo.listTopologyReviews(review.jobId)).toThrow("Persisted topology review is corrupt.");
    } finally {
      repo.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});

function jobRecord(jobId: string, jobStatus: JobRecord["jobStatus"]): JobRecord {
  const now = "2026-06-08T00:00:00.000Z";
  return {
    jobId,
    jobStatus,
    originalFilename: "fixture.ifc",
    uploadPath: `storage/${jobId}/fixture.ifc`,
    fileHash: null,
    createdAt: now,
    updatedAt: now,
    errorMessage: null,
    reportPath: null,
    activeRevisionId: null,
  };
}

function topologyReview(): JobTopologyReview {
  return {
    topologyReviewId: "toprev_1",
    idempotencyKey: "a".repeat(64),
    jobId: "job_topology",
    sourceRevisionId: "rev_1",
    sourceAssemblyGroupId: "ag_1",
    opportunity: null,
    opportunityId: "op_1",
    thermalConstructionSignature: "signature_1",
    answers: {},
    recipeHash: null,
    outcome: "failed",
    missingKeys: [],
    errorCode: "worker_failure",
    topologyResult: {
      requestId: "request_1",
      sourceRevisionId: "rev_1",
      sourceAssemblyGroupId: "ag_1",
      correlationId: "00000000-0000-4000-8000-000000000001",
      idempotencyKey: "a".repeat(64),
      recipeHash: null,
      outcome: "failed",
      bundle: { moduleId: "module", moduleVersion: "1.0.0", registryHash: "b".repeat(64), packHash: "c".repeat(64), runtimeHash: "d".repeat(64) },
      layerOnlySnapshot: {},
      effectiveUValueWPerM2K: null,
      evidence: null,
      artifactDirectory: "artifacts/topology/request_1",
      errorCode: "worker_failure",
      diagnostics: { code: "worker_failure", message: "worker failed", phase: null, retryable: false },
    },
    createdAt: "2026-06-08T00:00:00.000Z",
  };
}
