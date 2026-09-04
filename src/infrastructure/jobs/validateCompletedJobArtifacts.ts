import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

import type { CompletedJobPublicationValidator, CompletedJobPublicationValidation } from "../../application/jobs/completedJobPublication.js";
import type { JobRecord } from "../../domain/jobs/jobTypes.js";
import { LocalJobArtifactStore } from "../storage/local-files/jobArtifactStore.js";
import { restoreActiveRevisionIndex } from "../storage/local-files/writeRevisionArtifacts.js";

export class LocalCompletedJobPublicationValidator implements CompletedJobPublicationValidator {
  constructor(private readonly artifactStore: LocalJobArtifactStore) {}
  validate(job: JobRecord): Promise<CompletedJobPublicationValidation> {
    return validateCompletedJobArtifacts({ job, artifactStore: this.artifactStore });
  }
  restoreActiveRevision(jobId: string, revisionId: string | null): Promise<void> {
    return restoreActiveRevisionIndex({ artifactStore: this.artifactStore, jobId, activeRevisionId: revisionId });
  }
}

export async function validateCompletedJobArtifacts(command: {
  job: JobRecord;
  artifactStore: LocalJobArtifactStore;
}): Promise<CompletedJobPublicationValidation> {
  const { job, artifactStore } = command;
  if (!job.activeRevisionId) return { ok: false, code: "missing_active_revision" };
  const paths = artifactStore.pathsFor(job.jobId);
  const expectedReportPath = paths.reportFile(job.activeRevisionId);
  if (!job.reportPath || resolve(job.reportPath) !== resolve(expectedReportPath)) {
    return { ok: false, code: "report_path_mismatch" };
  }
  try {
    const revision = JSON.parse(await readFile(paths.revisionFile(job.activeRevisionId), "utf8")) as Record<string, unknown>;
    const index = JSON.parse(await readFile(paths.revisionIndexFile(), "utf8")) as Record<string, unknown>;
    if (revision.revisionId !== job.activeRevisionId || typeof revision.createdAt !== "string" || !Array.isArray(revision.userInputs) || !Array.isArray(revision.overrides) || !Array.isArray(revision.calculationSnapshots) || !Array.isArray(revision.diagnostics)) return { ok: false, code: "missing_or_invalid_revision" };
    if (index.activeRevisionId !== job.activeRevisionId || !Array.isArray(index.revisionIds) || !index.revisionIds.includes(job.activeRevisionId)) return { ok: false, code: "missing_or_invalid_revision" };
  } catch {
    return { ok: false, code: "missing_or_invalid_revision" };
  }
  try {
    const report = await readFile(expectedReportPath, "utf8");
    const expectedReportHash = (await readFile(`${expectedReportPath}.sha256`, "utf8")).trim();
    if (createHash("sha256").update(report).digest("hex") !== expectedReportHash) return { ok: false, code: "invalid_report_lineage" };
    const revision = JSON.parse(await readFile(paths.revisionFile(job.activeRevisionId), "utf8")) as Record<string, unknown>;
    const revisionHash = createHash("sha256").update(JSON.stringify(revision)).digest("hex");
    if (!report.includes(`<meta name="conformity-revision-sha256" content="${revisionHash}">`)) return { ok: false, code: "revision_report_mismatch" };
    if (!report.startsWith("<!doctype html>") || !report.includes(`<meta name="conformity-job-id" content="${job.jobId}">`) || !report.includes(`<title>Thermal Calculation Report ${job.activeRevisionId}</title>`)) return { ok: false, code: "invalid_report_lineage" };
  } catch {
    return { ok: false, code: "missing_report" };
  }
  return { ok: true };
}
