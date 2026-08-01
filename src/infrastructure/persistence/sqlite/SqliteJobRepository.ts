import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { ClosableJobRepository, JobUpdate } from "../../../domain/jobs/jobRepository.js";
import type { JobRecord, JobReviewState, JobStatus, JobSummary, JobTopologyReview } from "../../../domain/jobs/jobTypes.js";
import { canonicalTopologyJson } from "../../../domain/topology/canonicalTopologyJson.js";
import { isValidTopologyRecipeHash, requireCompleteTopologyResult } from "../../../domain/topology/topologyResultValidation.js";

type JobRow = {
  job_id: string;
  job_status: JobStatus;
  original_filename: string;
  upload_path: string;
  file_hash: string | null;
  created_at: string;
  updated_at: string;
  error_message: string | null;
  report_path: string | null;
  active_revision_id: string | null;
};

export class SqliteJobRepository implements ClosableJobRepository {
  private readonly db: DatabaseSync;

  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath);
    this.db.exec("pragma foreign_keys = on");
    this.db.exec(`
      create table if not exists jobs (
        job_id text primary key,
        job_status text not null,
        original_filename text not null,
        upload_path text not null,
        file_hash text,
        created_at text not null,
        updated_at text not null,
        error_message text,
        report_path text,
        active_revision_id text
      );
      create table if not exists job_review_state (
        job_id text primary key,
        requested_inputs_json text not null,
        foreign key(job_id) references jobs(job_id)
      );
      create table if not exists job_topology_reviews (
        topology_review_id text primary key,
        job_id text not null,
        source_revision_id text not null default '',
        source_assembly_group_id text not null default '',
        opportunity_id text not null default '',
        construction_signature text not null default '',
        idempotency_key text not null default '',
        recipe_hash text,
        request_id text,
        bundle_json text,
        payload_json text not null,
        created_at text not null,
        foreign key(job_id) references jobs(job_id)
      );
      create index if not exists job_topology_reviews_by_job on job_topology_reviews(job_id, created_at);
    `);
    this.ensureTopologyReviewColumns();
  }

  close(): void {
    this.db.close();
  }

  createJob(record: JobRecord): void {
    this.db.prepare(`
      insert into jobs (
        job_id, job_status, original_filename, upload_path, file_hash,
        created_at, updated_at, error_message, report_path, active_revision_id
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.jobId,
      record.jobStatus,
      record.originalFilename,
      record.uploadPath,
      record.fileHash,
      record.createdAt,
      record.updatedAt,
      record.errorMessage,
      record.reportPath,
      record.activeRevisionId,
    );
  }

  getJob(jobId: string): JobRecord | null {
    const row = this.db.prepare("select * from jobs where job_id = ?").get(jobId) as JobRow | undefined;
    return row ? mapJobRow(row) : null;
  }

  listRecentJobs(limit = 12): JobSummary[] {
    const rows = this.db.prepare(`
      select job_id, job_status, original_filename, created_at, updated_at
      from jobs
      order by created_at desc
      limit ?
    `).all(limit) as Array<Pick<JobRow, "job_id" | "job_status" | "original_filename" | "created_at" | "updated_at">>;
    return rows.map((row) => ({
      jobId: row.job_id,
      jobStatus: row.job_status,
      originalFilename: row.original_filename,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  updateJob(jobId: string, changes: JobUpdate): void {
    const existing = this.getJob(jobId);
    if (!existing) {
      throw new Error(`Job not found: ${jobId}`);
    }
    const next = {
      jobStatus: changes.jobStatus ?? existing.jobStatus,
      fileHash: changes.fileHash ?? existing.fileHash,
      errorMessage: changes.errorMessage ?? existing.errorMessage,
      reportPath: changes.reportPath ?? existing.reportPath,
      activeRevisionId: changes.activeRevisionId ?? existing.activeRevisionId,
      updatedAt: new Date().toISOString(),
    };
    this.db.prepare(`
      update jobs
      set job_status = ?, file_hash = ?, error_message = ?, report_path = ?,
        active_revision_id = ?, updated_at = ?
      where job_id = ?
    `).run(
      next.jobStatus,
      next.fileHash,
      next.errorMessage,
      next.reportPath,
      next.activeRevisionId,
      next.updatedAt,
      jobId,
    );
  }

  saveReviewState(state: JobReviewState): void {
    this.db.prepare(`
      insert into job_review_state (job_id, requested_inputs_json)
      values (?, ?)
      on conflict(job_id) do update set requested_inputs_json = excluded.requested_inputs_json
    `).run(state.jobId, JSON.stringify(state));
  }

  getReviewState(jobId: string): JobReviewState | null {
    const row = this.db.prepare(
      "select requested_inputs_json from job_review_state where job_id = ?",
    ).get(jobId) as { requested_inputs_json: string } | undefined;
    if (!row) return null;
    const parsed = JSON.parse(row.requested_inputs_json) as JobReviewState["requestedInputs"] | JobReviewState;
    return Array.isArray(parsed) ? { jobId, requestedInputs: parsed } : parsed;
  }

  saveTopologyReview(review: JobTopologyReview): void {
    const result = review.topologyResult;
    this.db.prepare("insert into job_topology_reviews (topology_review_id, job_id, source_revision_id, source_assembly_group_id, opportunity_id, construction_signature, idempotency_key, recipe_hash, request_id, bundle_json, payload_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(review.topologyReviewId, review.jobId, review.sourceRevisionId, review.sourceAssemblyGroupId, review.opportunityId, review.thermalConstructionSignature, review.idempotencyKey, review.recipeHash, result?.requestId ?? null, result ? canonicalTopologyJson(result.bundle) : null, JSON.stringify(review), review.createdAt);
  }

  listTopologyReviews(jobId: string): JobTopologyReview[] {
    const rows = this.db.prepare("select job_id, source_revision_id, source_assembly_group_id, opportunity_id, construction_signature, idempotency_key, recipe_hash, request_id, bundle_json, payload_json from job_topology_reviews where job_id = ? order by created_at asc").all(jobId) as PersistedTopologyReviewRow[];
    return rows.map((row) => parseTopologyReview(row.payload_json, row));
  }

  private ensureTopologyReviewColumns(): void {
    const columns = new Set((this.db.prepare("pragma table_info(job_topology_reviews)").all() as Array<{ name: string }>).map((column) => column.name));
    const required = [
      ["source_revision_id", "text not null default ''"],
      ["source_assembly_group_id", "text not null default ''"],
      ["opportunity_id", "text not null default ''"],
      ["construction_signature", "text not null default ''"],
      ["idempotency_key", "text not null default ''"],
      ["recipe_hash", "text"],
      ["request_id", "text"],
      ["bundle_json", "text"],
    ] as const;
    for (const [name, definition] of required) if (!columns.has(name)) this.db.exec(`alter table job_topology_reviews add column ${name} ${definition}`);
    // Legacy rows receive an empty migration default; only real semantic keys are unique.
    this.db.exec("create unique index if not exists job_topology_reviews_idempotency on job_topology_reviews(job_id, idempotency_key) where idempotency_key <> ''");
  }

  getTopologyReviewByIdempotencyKey(jobId: string, idempotencyKey: string): JobTopologyReview | null {
    const row = this.db.prepare("select job_id, source_revision_id, source_assembly_group_id, opportunity_id, construction_signature, idempotency_key, recipe_hash, request_id, bundle_json, payload_json from job_topology_reviews where job_id = ? and idempotency_key = ?").get(jobId, idempotencyKey) as PersistedTopologyReviewRow | undefined;
    return row ? parseTopologyReview(row.payload_json, row) : null;
  }
}

type PersistedTopologyReviewRow = { job_id: string; source_revision_id: string; source_assembly_group_id: string; opportunity_id: string; construction_signature: string; idempotency_key: string; recipe_hash: string | null; request_id: string | null; bundle_json: string | null; payload_json: string };

function parseTopologyReview(payload: string, row: PersistedTopologyReviewRow): JobTopologyReview {
  let value: Partial<JobTopologyReview>;
  try { value = JSON.parse(payload) as Partial<JobTopologyReview>; } catch { throw new Error("Persisted topology review is corrupt."); }
  const outcomes = new Set(["blocked", "rejected", "not-requested", "preliminary-unsafe", "failed", "cancelled"]);
  if (!value || typeof value.topologyReviewId !== "string" || typeof value.idempotencyKey !== "string" || typeof value.jobId !== "string" || typeof value.sourceRevisionId !== "string" || typeof value.sourceAssemblyGroupId !== "string" || typeof value.opportunityId !== "string" || typeof value.thermalConstructionSignature !== "string" || !outcomes.has(value.outcome ?? "") || !Array.isArray(value.missingKeys) || !value.missingKeys.every((key) => typeof key === "string") || typeof value.decisiveNextInput !== "string" && value.decisiveNextInput !== null || !isAnswers(value.answers) || (value.recipeHash !== null && !isValidTopologyRecipeHash(value.recipeHash)) || (value.errorCode !== null && typeof value.errorCode !== "string") || typeof value.createdAt !== "string") throw new Error("Persisted topology review is corrupt.");
  if (value.topologyResult === null) {
    if (value.outcome === "preliminary-unsafe") throw new Error("Persisted topology review is corrupt.");
  } else {
    const result = requireCompleteTopologyResult(value.topologyResult);
    if (result.sourceRevisionId !== value.sourceRevisionId || result.sourceAssemblyGroupId !== value.sourceAssemblyGroupId || result.idempotencyKey !== value.idempotencyKey || result.outcome !== value.outcome || result.recipeHash !== value.recipeHash || row.request_id !== result.requestId || row.bundle_json !== canonicalTopologyJson(result.bundle)) throw new Error("Persisted topology review is corrupt.");
  }
  if (value.jobId !== row.job_id || value.sourceRevisionId !== row.source_revision_id || value.sourceAssemblyGroupId !== row.source_assembly_group_id || value.opportunityId !== row.opportunity_id || value.thermalConstructionSignature !== row.construction_signature || value.idempotencyKey !== row.idempotency_key || value.recipeHash !== row.recipe_hash) throw new Error("Persisted topology review is corrupt.");
  return value as JobTopologyReview;
}

function isAnswers(value: unknown): value is JobTopologyReview["answers"] {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.values(value).every((answer) => typeof answer === "string" || typeof answer === "number" || typeof answer === "boolean" || answer === null);
}

function mapJobRow(row: JobRow): JobRecord {
  return {
    jobId: row.job_id,
    jobStatus: row.job_status,
    originalFilename: row.original_filename,
    uploadPath: row.upload_path,
    fileHash: row.file_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    errorMessage: row.error_message,
    reportPath: row.report_path,
    activeRevisionId: row.active_revision_id,
  };
}
