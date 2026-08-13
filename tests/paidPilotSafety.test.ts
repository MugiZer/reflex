import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { createLocalhostApp, type LocalhostApp } from "../src/app/http/httpServer.js";
import { safeOperationalDiagnostic } from "../src/application/safeOperationalDiagnostic.js";
import { syntheticMilestone4CalculationInputEvidence } from "../src/application/jobs/syntheticMilestone4Fixture.js";
import { SqliteJobRepository } from "../src/infrastructure/persistence/sqlite/SqliteJobRepository.js";
import { LocalJobFileStorage } from "../src/infrastructure/storage/local-files/jobFileStorage.js";
import { createPaidPilotWorkspaceBackup, restorePaidPilotWorkspaceBackup } from "../src/infrastructure/operations/paidPilotWorkspaceBackup.js";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!();
});

describe("paid-pilot safety through the real localhost composition", () => {
  it("redacts private paths, credentials, and SQL from operational diagnostics", () => {
    expect(safeOperationalDiagnostic(new Error("failed at C:\\pilot\\acme\\private.ifc"))).toEqual({
      name: "Error",
      message: "failed at [path redacted]",
    });
    expect(safeOperationalDiagnostic(new Error("token=customer-secret"))).toEqual({
      name: "Error",
      message: "token=[redacted]",
    });
    expect(safeOperationalDiagnostic(new Error("UPDATE jobs SET active_revision_id = 'secret'"))).toEqual({
      name: "Error",
      message: "Database operation failed.",
    });
  });

  it("rejects an oversized IFC body before creating a durable Job", async () => {
    const { app, baseUrl } = await startApp({ maxUploadBytes: 1_024 });
    const form = new FormData();
    form.set("ifc", new Blob(["x".repeat(2_048)]), "oversized.ifc");

    const response = await fetch(`${baseUrl}/api/jobs`, { method: "POST", body: form });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      code: "upload_too_large",
      error: "The IFC upload exceeds the configured size limit.",
    });
    expect(app.jobs.listRecentJobs()).toEqual([]);
  });

  it("marks interrupted work retryable after reconstruction and manually retries the stored upload", async () => {
    const root = await mkdtemp(join(tmpdir(), "paid-pilot-restart-"));
    const storage = new LocalJobFileStorage(join(root, "storage"));
    const saved = await storage.saveUpload({
      originalFilename: "interrupted.ifc",
      content: Buffer.from("ISO-10303-21; interrupted; END-ISO-10303-21;"),
    });
    const beforeRestart = new SqliteJobRepository(join(root, "data", "app.db"));
    const now = new Date().toISOString();
    beforeRestart.createJob({
      jobId: saved.jobId,
      jobStatus: "processing",
      originalFilename: "interrupted.ifc",
      uploadPath: saved.uploadPath,
      fileHash: saved.fileHash,
      createdAt: now,
      updatedAt: now,
      errorMessage: null,
      reportPath: null,
      activeRevisionId: null,
    });
    beforeRestart.close();

    const { app, baseUrl } = await openApp(root, {
      workerOverrides: {
        extractCalculationInputEvidence: async () => [syntheticMilestone4CalculationInputEvidence()],
      },
    });
    const recovered = await getJson(`${baseUrl}/api/jobs/${saved.jobId}`);
    expect(recovered).toEqual(expect.objectContaining({
      jobStatus: "failed",
      retryable: true,
      failureCode: "interrupted_on_restart",
      lastFailureMessage: "The application stopped before this Job finished.",
    }));

    const retryResponse = await fetch(`${baseUrl}/api/jobs/${saved.jobId}/retry`, { method: "POST" });
    expect(retryResponse.status).toBe(202);
    await expect(retryResponse.json()).resolves.toEqual(expect.objectContaining({
      jobId: saved.jobId,
      jobStatus: "queued",
    }));
    const retried = await waitForJob(baseUrl, saved.jobId, "needs_review");
    expect(retried.lastFailureMessage).toBe("The application stopped before this Job finished.");
    expect(app.jobs.getJob(saved.jobId)?.activeRevisionId).toBeNull();
  });

  it("demotes a completed Job whose Revision and Report cannot be reloaded", async () => {
    const root = await mkdtemp(join(tmpdir(), "paid-pilot-incomplete-"));
    const repository = new SqliteJobRepository(join(root, "data", "app.db"));
    const now = new Date().toISOString();
    repository.createJob({
      jobId: "job_incomplete",
      jobStatus: "completed",
      originalFilename: "incomplete.ifc",
      uploadPath: join(root, "storage", "missing.ifc"),
      fileHash: "f".repeat(64),
      createdAt: now,
      updatedAt: now,
      errorMessage: null,
      reportPath: join(root, "outputs", "job_incomplete", "reports", "rev_missing.html"),
      activeRevisionId: "rev_missing",
    });
    repository.close();

    const { baseUrl } = await openApp(root);
    const job = await getJson(`${baseUrl}/api/jobs/job_incomplete`);
    expect(job).toEqual(expect.objectContaining({
      jobStatus: "failed",
      retryable: false,
      failureCode: "missing_or_invalid_revision",
    }));
    const report = await fetch(`${baseUrl}/api/jobs/job_incomplete/report`);
    expect(report.status).toBe(409);
    await expect(report.json()).resolves.toEqual(expect.objectContaining({ code: "incomplete_job_output" }));
  });

  it("rejects a readable Report whose engineering body was truncated", async () => {
    const { app, baseUrl, root } = await startApp({ workerOverrides: { extractCalculationInputEvidence: async () => [syntheticMilestone4CalculationInputEvidence()] } });
    const form = new FormData();
    form.set("ifc", new Blob(["ISO-10303-21; forged; END-ISO-10303-21;"]), "forged.ifc");
    const created = await (await fetch(`${baseUrl}/api/jobs`, { method: "POST", body: form })).json() as { jobId: string };
    const review = await waitForJob(baseUrl, created.jobId, "needs_review");
    await postReviewInput(baseUrl, created.jobId, review.review.requestedInputs[0], 0.04);
    const completed = await getJson(`${baseUrl}/api/jobs/${created.jobId}`);
    const reportPath = completed.reportPath as string;
    const originalReport = await readFile(reportPath, "utf8");
    await writeFile(reportPath, `${originalReport.slice(0, originalReport.indexOf("</head>") + 7)}<body>truncated</body></html>`, "utf8");

    const response = await fetch(`${baseUrl}/api/jobs/${created.jobId}/report`);

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("incomplete_job_output");
    expect(app.jobs.getJob(created.jobId)).toEqual(expect.objectContaining({ jobStatus: "failed", failureCode: "invalid_report_lineage" }));
    expect(await readFile(reportPath, "utf8")).toContain("conformity-revision-sha256");
    expect(reportPath).toContain(join(root, "outputs", created.jobId));
  });

  it("requires restore when an active Revision no longer matches its intact Report", async () => {
    const { app, baseUrl, root } = await startApp({ workerOverrides: { extractCalculationInputEvidence: async () => [syntheticMilestone4CalculationInputEvidence()] } });
    const form = new FormData();
    form.set("ifc", new Blob(["ISO-10303-21; revision-corruption; END-ISO-10303-21;"]), "revision.ifc");
    const created = await (await fetch(`${baseUrl}/api/jobs`, { method: "POST", body: form })).json() as { jobId: string };
    const review = await waitForJob(baseUrl, created.jobId, "needs_review");
    await postReviewInput(baseUrl, created.jobId, review.review.requestedInputs[0], 0.04);
    const completed = await getJson(`${baseUrl}/api/jobs/${created.jobId}`);
    const revisionPath = join(root, "outputs", created.jobId, "revisions", `${completed.activeRevisionId}.json`);
    const revision = JSON.parse(await readFile(revisionPath, "utf8")) as Record<string, unknown>;
    await writeFile(revisionPath, JSON.stringify({ ...revision, reason: "corrupted after publication" }, null, 2), "utf8");

    expect((await fetch(`${baseUrl}/api/jobs/${created.jobId}/report`)).status).toBe(409);
    expect(app.jobs.getJob(created.jobId)).toEqual(expect.objectContaining({ failureCode: "revision_report_mismatch", retryable: false }));
  });

  it("uses safe 422, 404, 409, and correlated 500 responses", async () => {
    const { app, baseUrl, root } = await startApp();
    const malformed = await fetch(`${baseUrl}/api/jobs`, { method: "POST", body: "not multipart" });
    expect(malformed.status).toBe(422);
    await expect(malformed.json()).resolves.toEqual(expect.objectContaining({ code: "invalid_upload" }));

    const missing = await fetch(`${baseUrl}/api/jobs/job_missing/retry`, { method: "POST" });
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toEqual({ code: "job_not_found", error: "Job not found." });
    const missingThermal = await fetch(`${baseUrl}/api/jobs/job_missing/thermal-treatment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(missingThermal.status).toBe(404);

    const now = new Date().toISOString();
    app.jobs.createJob({
      jobId: "job_notretryable",
      jobStatus: "needs_review",
      originalFilename: "fixture.ifc",
      uploadPath: join(root, "storage", "fixture.ifc"),
      fileHash: null,
      createdAt: now,
      updatedAt: now,
      errorMessage: null,
      reportPath: null,
      activeRevisionId: null,
    });
    const conflict = await fetch(`${baseUrl}/api/jobs/job_notretryable/retry`, { method: "POST" });
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toEqual({ code: "job_not_retryable", error: "This Job is not currently retryable." });

    app.jobs.saveReviewState({ jobId: "job_notretryable", requestedInputs: [] });
    const internal = await fetch(`${baseUrl}/api/jobs/job_notretryable`);
    expect(internal.status).toBe(500);
    const internalBody = await internal.json() as Record<string, unknown>;
    expect(internalBody).toEqual(expect.objectContaining({
      code: "internal_error",
      error: "The request could not be completed.",
      correlationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    }));
    expect(JSON.stringify(internalBody)).not.toMatch(/storage|outputs|SELECT|stack|node_modules/i);
  });

  it("preserves the previously active Revision and Report when activation fails", async () => {
    const { baseUrl, root } = await startApp({
      workerOverrides: {
        extractCalculationInputEvidence: async () => [syntheticMilestone4CalculationInputEvidence()],
      },
    });
    const form = new FormData();
    form.set("ifc", new Blob(["ISO-10303-21; publication; END-ISO-10303-21;"]), "publication.ifc");
    const createdResponse = await fetch(`${baseUrl}/api/jobs`, { method: "POST", body: form });
    const created = await createdResponse.json() as { jobId: string };
    const review = await waitForJob(baseUrl, created.jobId, "needs_review");
    const requested = review.review.requestedInputs[0];
    const firstResponse = await postReviewInput(baseUrl, created.jobId, requested, 0.04);
    expect(firstResponse.status).toBe(202);
    const first = await firstResponse.json() as { revisionId: string };
    const before = await getJson(`${baseUrl}/api/jobs/${created.jobId}`);
    const beforeReportResponse = await fetch(`${baseUrl}/api/jobs/${created.jobId}/report`);
    expect(beforeReportResponse.status).toBe(200);
    const beforeReport = await beforeReportResponse.text();

    const triggerDatabase = new DatabaseSync(join(root, "data", "app.db"));
    triggerDatabase.exec(`
      create trigger reject_paid_pilot_activation
      before update of active_revision_id on jobs
      when new.active_revision_id <> old.active_revision_id
      begin select raise(abort, 'activation blocked by test'); end;
    `);
    triggerDatabase.close();

    const failed = await postReviewInput(baseUrl, created.jobId, requested, 0.05);
    expect(failed.status).toBe(500);
    await expect(failed.json()).resolves.toEqual(expect.objectContaining({
      code: "internal_error",
      error: "The request could not be completed.",
    }));
    const after = await getJson(`${baseUrl}/api/jobs/${created.jobId}`);
    expect(after).toEqual(expect.objectContaining({
      jobStatus: "completed",
      activeRevisionId: first.revisionId,
      reportPath: before.reportPath,
    }));
    const afterReportResponse = await fetch(`${baseUrl}/api/jobs/${created.jobId}/report`);
    expect(afterReportResponse.status).toBe(200);
    expect(await afterReportResponse.text()).toBe(beforeReport);
  });

  it("restores an explicitly empty active index when first publication activation fails", async () => {
    const { baseUrl, root } = await startApp({ workerOverrides: { extractCalculationInputEvidence: async () => [syntheticMilestone4CalculationInputEvidence()] } });
    const form = new FormData();
    form.set("ifc", new Blob(["ISO-10303-21; first-publication; END-ISO-10303-21;"]), "first.ifc");
    const created = await (await fetch(`${baseUrl}/api/jobs`, { method: "POST", body: form })).json() as { jobId: string };
    const review = await waitForJob(baseUrl, created.jobId, "needs_review");
    const triggerDatabase = new DatabaseSync(join(root, "data", "app.db"));
    triggerDatabase.exec(`create trigger reject_first_activation before update of active_revision_id on jobs when new.active_revision_id is not old.active_revision_id begin select raise(abort, 'first activation blocked'); end;`);
    triggerDatabase.close();

    expect((await postReviewInput(baseUrl, created.jobId, review.review.requestedInputs[0], 0.04)).status).toBe(500);

    const after = await getJson(`${baseUrl}/api/jobs/${created.jobId}`);
    expect(after).toEqual(expect.objectContaining({ jobStatus: "needs_review", activeRevisionId: null, reportPath: null }));
    const index = JSON.parse(await readFile(join(root, "outputs", created.jobId, "revisions", "index.json"), "utf8")) as Record<string, unknown>;
    expect(index.activeRevisionId).toBe("");
  });

  it("restores a completed Job, active Revision, upload, and Report as one isolated workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "paid-pilot-restore-"));
    const backupRoot = await mkdtemp(join(tmpdir(), "paid-pilot-backup-"));
    const databasePath = join(root, "data", "app.db");
    const storageRoot = join(root, "storage");
    const outputRoot = join(root, "outputs");
    const backupDirectory = join(backupRoot, "snapshot");
    let app: LocalhostApp | null = null;
    try {
      app = createLocalhostApp({
        databasePath,
        storageRoot,
        outputRoot,
        workerOverrides: { extractCalculationInputEvidence: async () => [syntheticMilestone4CalculationInputEvidence()] },
      });
      app.server.listen(0, "127.0.0.1");
      await once(app.server, "listening");
      const baseUrl = boundUrl(app);
      const form = new FormData();
      form.set("ifc", new Blob(["ISO-10303-21; restore; END-ISO-10303-21;"]), "restore.ifc");
      const created = await (await fetch(`${baseUrl}/api/jobs`, { method: "POST", body: form })).json() as { jobId: string };
      const review = await waitForJob(baseUrl, created.jobId, "needs_review");
      const completedResponse = await postReviewInput(baseUrl, created.jobId, review.review.requestedInputs[0], 0.04);
      const completed = await completedResponse.json() as { revisionId: string };
      const originalReport = await (await fetch(`${baseUrl}/api/jobs/${created.jobId}/report`)).text();
      await closeServer(app);
      app.close();
      app = null;

      const backup = await createPaidPilotWorkspaceBackup({ databasePath, storageRoot, outputRoot, backupDirectory });
      expect(backup.manifestPath).toBe(join(backupDirectory, "manifest.json"));
      const manifestText = await readFile(backup.manifestPath, "utf8");
      expect(manifestText).not.toContain(root);
      expect(manifestText).not.toContain(databasePath);
      await rm(join(root, "data"), { recursive: true, force: true });
      await rm(storageRoot, { recursive: true, force: true });
      await rm(outputRoot, { recursive: true, force: true });
      await restorePaidPilotWorkspaceBackup({ backupDirectory, databasePath, storageRoot, outputRoot });

      app = createLocalhostApp({ databasePath, storageRoot, outputRoot });
      app.server.listen(0, "127.0.0.1");
      await once(app.server, "listening");
      const restoredBaseUrl = boundUrl(app);
      const restored = await getJson(`${restoredBaseUrl}/api/jobs/${created.jobId}`);
      expect(restored).toEqual(expect.objectContaining({
        jobStatus: "completed",
        activeRevisionId: completed.revisionId,
      }));
      const restoredIfc = await fetch(`${restoredBaseUrl}/api/jobs/${created.jobId}/ifc`);
      expect(restoredIfc.status).toBe(200);
      expect(await restoredIfc.text()).toContain("ISO-10303-21; restore;");
      const restoredReport = await fetch(`${restoredBaseUrl}/api/jobs/${created.jobId}/report`);
      expect(restoredReport.status).toBe(200);
      expect(await restoredReport.text()).toBe(originalReport);
    } finally {
      if (app) {
        await closeServer(app);
        app.close();
      }
      await rm(root, { recursive: true, force: true });
      await rm(backupRoot, { recursive: true, force: true });
    }
  });
});

async function startApp(options: {
  maxUploadBytes?: number;
  workerOverrides?: Parameters<typeof createLocalhostApp>[0]["workerOverrides"];
} = {}): Promise<{
  app: LocalhostApp;
  baseUrl: string;
  root: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "paid-pilot-safety-"));
  return openApp(root, options);
}

async function openApp(root: string, options: {
  maxUploadBytes?: number;
  workerOverrides?: Parameters<typeof createLocalhostApp>[0]["workerOverrides"];
} = {}): Promise<{ app: LocalhostApp; baseUrl: string; root: string }> {
  const app = createLocalhostApp({
    databasePath: join(root, "data", "app.db"),
    storageRoot: join(root, "storage"),
    outputRoot: join(root, "outputs"),
    maxUploadBytes: options.maxUploadBytes,
    workerOverrides: options.workerOverrides,
  });
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  cleanups.push(async () => {
    app.server.close();
    app.close();
    await rm(root, { recursive: true, force: true });
  });
  return { app, baseUrl: boundUrl(app), root };
}

function boundUrl(app: LocalhostApp): string {
  const address = app.server.address();
  if (!address || typeof address === "string") throw new Error("Server is not bound.");
  return `http://127.0.0.1:${address.port}`;
}

async function getJson(url: string): Promise<any> {
  const response = await fetch(url);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? response.statusText);
  return value;
}

async function waitForJob(baseUrl: string, jobId: string, status: string): Promise<any> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const job = await getJson(`${baseUrl}/api/jobs/${jobId}`);
    if (job.jobStatus === status) return job;
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error(`Timed out waiting for ${status}.`);
}

function postReviewInput(baseUrl: string, jobId: string, requested: any, value: number): Promise<Response> {
  return fetch(`${baseUrl}/api/jobs/${jobId}/review-inputs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inputs: [{
        requestedInputId: requested.requestedInputId,
        value,
        unit: requested.unit,
        overrideScope: requested.scope.scopeKind,
      }],
    }),
  });
}

async function closeServer(app: LocalhostApp): Promise<void> {
  if (!app.server.listening) return;
  await new Promise<void>((resolveClose, rejectClose) => app.server.close((error) => error ? rejectClose(error) : resolveClose()));
}
