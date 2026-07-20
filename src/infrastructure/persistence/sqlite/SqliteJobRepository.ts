import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { ClosableJobRepository, JobUpdate } from "../../../domain/jobs/jobRepository.js";
import type { JobRecord, JobReviewState, JobStatus, JobSummary } from "../../../domain/jobs/jobTypes.js";

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
    `);
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
