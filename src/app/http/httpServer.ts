import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { createJob } from "../../application/jobs/createJob.js";
import type { ProcessIfcJobDeps } from "../../application/jobs/processIfcJob.js";
import { submitJobReviewInputs } from "../../application/jobs/submitJobReviewInputs.js";
import { buildReviewContextViewModel } from "../../application/review/buildReviewContextViewModel.js";
import type { CalculationInputEvidence } from "../../domain/evidence/calculationInputEvidenceTypes.js";
import type { ClosableJobRepository, JobRepository } from "../../domain/jobs/jobRepository.js";
import type { JobRecord } from "../../domain/jobs/jobTypes.js";
import { WebIfcViewerGeometryExtractor } from "../../infrastructure/ifc/web-ifc/WebIfcViewerGeometryExtractor.js";
import { SqliteJobRepository } from "../../infrastructure/persistence/sqlite/SqliteJobRepository.js";
import { LocalJobFileStorage } from "../../infrastructure/storage/local-files/jobFileStorage.js";
import { LocalViewerGeometryCache } from "../../infrastructure/storage/local-files/viewerGeometryCache.js";
import { renderAppShellClientScript } from "./frontend/appShellClient.js";
import { renderIfcReviewViewerClientScript } from "./ifcReviewViewerClient.js";
import { parseMultipartUpload, readBuffer } from "./multipartUpload.js";
import { renderAppShell } from "./renderAppShell.js";

export type LocalhostApp = {
  server: Server;
  jobs: ClosableJobRepository;
};

export function createLocalhostApp(command: {
  databasePath: string;
  storageRoot: string;
  outputRoot: string;
  workerOverrides?: Partial<Pick<ProcessIfcJobDeps, "extractCalculationInputEvidence">>;
}): LocalhostApp {
  const jobs = new SqliteJobRepository(command.databasePath);
  const storage = new LocalJobFileStorage(command.storageRoot);
  const viewerGeometryCache = new LocalViewerGeometryCache(command.outputRoot);
  const viewerGeometryExtractor = new WebIfcViewerGeometryExtractor();
  const workerDeps: ProcessIfcJobDeps = {
    jobs,
    outputRoot: command.outputRoot,
    ...command.workerOverrides,
  };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method === "POST" && url.pathname === "/api/jobs") {
        const upload = await parseMultipartUpload(req);
        const result = await createJob({
          originalFilename: upload.filename,
          content: upload.content,
          jobs,
          storage,
          workerDeps,
        });
        return json(res, 202, result);
      }
      if (req.method === "GET" && url.pathname === "/api/jobs") {
        return json(res, 200, { jobs: jobs.listRecentJobs() });
      }

      const jobId = matchPath(url.pathname, /^\/api\/jobs\/([^/]+)$/);
      if (req.method === "GET" && jobId) {
        return await sendJob(res, jobs, jobId, command.outputRoot);
      }

      const reviewJobId = matchPath(url.pathname, /^\/api\/jobs\/([^/]+)\/review-inputs$/);
      if (req.method === "POST" && reviewJobId) {
        const body = await readJson(req);
        const result = await submitJobReviewInputs({
          jobId: reviewJobId,
          body,
          jobs,
          deps: workerDeps,
        });
        return json(res, 202, result);
      }

      const reportJobId = matchPath(url.pathname, /^\/api\/jobs\/([^/]+)\/report$/);
      if (req.method === "GET" && reportJobId) {
        return await sendReport(res, jobs, reportJobId);
      }

      const ifcJobId = matchPath(url.pathname, /^\/api\/jobs\/([^/]+)\/ifc$/);
      if (req.method === "GET" && ifcJobId) {
        return await sendIfc(res, jobs, storage, ifcJobId);
      }

      const viewerGeometryJobId = matchPath(url.pathname, /^\/api\/jobs\/([^/]+)\/viewer-geometry$/);
      if (req.method === "GET" && viewerGeometryJobId) {
        return await sendViewerGeometry(
          res,
          jobs,
          storage,
          viewerGeometryCache,
          viewerGeometryExtractor,
          viewerGeometryJobId,
          url,
        );
      }

      if (req.method === "GET" && url.pathname === "/assets/ifc-review-viewer.js") {
        return javascript(res, 200, renderIfcReviewViewerClientScript());
      }

      if (req.method === "GET" && url.pathname === "/assets/app-shell.js") {
        return javascript(res, 200, renderAppShellClientScript());
      }

      if (req.method === "GET" && isUiRoute(url.pathname)) {
        return html(res, 200, renderAppShell());
      }
      return text(res, 404, "Not found");
    } catch (error) {
      return json(res, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  return { server, jobs };
}

async function sendJob(
  res: ServerResponse,
  jobs: JobRepository,
  jobId: string,
  outputRoot: string,
): Promise<void> {
  const job = jobs.getJob(jobId);
  if (!job) {
    return json(res, 404, { error: "Job not found" });
  }
  const review = jobs.getReviewState(jobId);
  const calculationInputEvidence = review
    ? await readCalculationInputEvidence(outputRoot, jobId)
    : undefined;
  return json(res, 200, {
    ...job,
    review: review
      ? {
          ...review,
          context: buildReviewContextViewModel({
            jobId,
            requestedInputs: review.requestedInputs,
            calculationInputEvidence,
          }),
        }
      : null,
    links: linksFor(job),
  });
}

async function readCalculationInputEvidence(
  outputRoot: string,
  jobId: string,
): Promise<CalculationInputEvidence[] | undefined> {
  try {
    const content = await readFile(
      join(outputRoot, jobId, "job", "calculation-input-evidence.json"),
      "utf8",
    );
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed as CalculationInputEvidence[] : undefined;
  } catch {
    return undefined;
  }
}

async function sendReport(
  res: ServerResponse,
  jobs: JobRepository,
  jobId: string,
): Promise<void> {
  const job = jobs.getJob(jobId);
  if (!job) {
    return json(res, 404, { error: "Job not found" });
  }
  if (!job.reportPath) {
    return json(res, 404, { error: "Report has not been generated." });
  }
  return html(res, 200, await readFile(job.reportPath, "utf8"));
}

async function sendIfc(
  res: ServerResponse,
  jobs: JobRepository,
  storage: LocalJobFileStorage,
  jobId: string,
): Promise<void> {
  const job = jobs.getJob(jobId);
  if (!job) {
    return json(res, 404, { error: "Job not found" });
  }
  try {
    const content = await storage.readUpload(jobId, job.uploadPath);
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `inline; filename="${job.originalFilename.replaceAll('"', "")}"`,
    });
    res.end(content);
  } catch {
    return json(res, 404, { error: "IFC upload not found." });
  }
}

async function sendViewerGeometry(
  res: ServerResponse,
  jobs: JobRepository,
  storage: LocalJobFileStorage,
  viewerGeometryCache: LocalViewerGeometryCache,
  viewerGeometryExtractor: WebIfcViewerGeometryExtractor,
  jobId: string,
  url: URL,
): Promise<void> {
  const job = jobs.getJob(jobId);
  if (!job) {
    return json(res, 404, { error: "Job not found" });
  }
  try {
    const targetStepIds = parseStepIds(url.searchParams.get("stepIds"));
    const cached = await viewerGeometryCache.read({
      jobId,
      fileHash: job.fileHash,
      targetStepIds,
    });
    if (cached) {
      return json(res, 200, cached);
    }
    const sourceFileBytes = await storage.readUpload(jobId, job.uploadPath);
    const geometry = await viewerGeometryExtractor.extract({
      sourceFileBytes: new Uint8Array(sourceFileBytes),
      targetStepIds,
    });
    await viewerGeometryCache.write({
      jobId,
      fileHash: job.fileHash,
      targetStepIds,
    }, geometry);
    return json(res, 200, geometry);
  } catch (error) {
    return json(res, 422, {
      error: error instanceof Error ? error.message : "IFC geometry extraction failed.",
    });
  }
}

function parseStepIds(value: string | null): number[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((stepId) => Number.isInteger(stepId) && stepId > 0);
}

function linksFor(job: JobRecord): Record<string, string> {
  const links: Record<string, string> = {
    self: `/api/jobs/${job.jobId}`,
    page: `/jobs/${job.jobId}`,
    ifc: `/api/jobs/${job.jobId}/ifc`,
    viewerGeometry: `/api/jobs/${job.jobId}/viewer-geometry`,
  };
  if (job.jobStatus === "needs_review") {
    links.review = `/jobs/${job.jobId}/review`;
  }
  if (job.reportPath) {
    links.report = `/api/jobs/${job.jobId}/report`;
  }
  return links;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  return JSON.parse((await readBuffer(req)).toString("utf8"));
}

function matchPath(pathname: string, pattern: RegExp): string | null {
  return pathname.match(pattern)?.[1] ?? null;
}

function isUiRoute(pathname: string): boolean {
  return pathname === "/" || /^\/jobs\/[^/]+(\/review|\/report)?$/.test(pathname);
}

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
}

function html(res: ServerResponse, status: number, value: string): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(value);
}

function javascript(res: ServerResponse, status: number, value: string): void {
  res.writeHead(status, { "Content-Type": "text/javascript; charset=utf-8" });
  res.end(value);
}

function text(res: ServerResponse, status: number, value: string): void {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(value);
}
