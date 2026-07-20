import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";

import { createJob } from "../../application/jobs/createJob.js";
import { reconcileJobReviewPlan } from "../../application/jobs/reconcileJobReviewPlan.js";
import { getJobWorkspace } from "../../application/jobs/getJobWorkspace.js";
import type { ProcessIfcJobDeps } from "../../application/jobs/processIfcJob.js";
import { submitJobReviewInputs } from "../../application/jobs/submitJobReviewInputs.js";
import type { ClosableJobRepository, JobRepository } from "../../domain/jobs/jobRepository.js";
import type { JobRecord } from "../../domain/jobs/jobTypes.js";
import { WebIfcViewerGeometryExtractor } from "../../infrastructure/ifc/web-ifc/WebIfcViewerGeometryExtractor.js";
import { SqliteJobRepository } from "../../infrastructure/persistence/sqlite/SqliteJobRepository.js";
import { LocalJobArtifactStore } from "../../infrastructure/storage/local-files/jobArtifactStore.js";
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
  const artifactStore = new LocalJobArtifactStore(command.outputRoot);
  const viewerGeometryCache = new LocalViewerGeometryCache(artifactStore);
  const viewerGeometryExtractor = new WebIfcViewerGeometryExtractor();
  const workerDeps: ProcessIfcJobDeps = {
    jobs,
    outputRoot: command.outputRoot,
    artifactStore,
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
        return await sendJob(
          res,
          jobs,
          artifactStore,
          jobId,
          parseArchitectTarget(url.searchParams.get("targetU")),
        );
      }

      const reconcileJobId = matchPath(url.pathname, /^\/api\/jobs\/([^/]+)\/reconcile-review-plan$/);
      if (req.method === "POST" && reconcileJobId) {
        const result = await reconcileJobReviewPlan({ jobId: reconcileJobId, deps: workerDeps });
        return json(res, 202, result);
      }

      const reviewJobId = matchPath(url.pathname, /^\/api\/jobs\/([^/]+)\/review-inputs$/);
      if (req.method === "POST" && reviewJobId) {
        const body = await readJson(req);        const result = await submitJobReviewInputs({
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
  artifactStore: LocalJobArtifactStore,
  jobId: string,
  targetUValueWPerM2K: number | null,
): Promise<void> {
  const workspace = await getJobWorkspace({
    jobs,
    artifactStore,
    jobId,
    targetUValueWPerM2K,
  });
  if (!workspace) {
    return json(res, 404, { error: "Job not found" });
  }
  return json(res, 200, {
    ...workspace.job,
    review: workspace.review,
    architectActions: workspace.architectActions,
    materialLibrary: workspace.materialLibrary,
    links: linksFor(workspace.job),
  });
}

function parseArchitectTarget(value: string | null): number | null {
  if (value === null || value.trim() === "") {
    return null;
  }
  const target = Number(value);
  return Number.isFinite(target) && target > 0 && target <= 10 ? target : null;
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
): Promise<void> {
  const job = jobs.getJob(jobId);
  if (!job) {
    return json(res, 404, { error: "Job not found" });
  }
  try {
    const cacheKey = { jobId, fileHash: job.fileHash };
    const cached = await viewerGeometryCache.read(cacheKey);
    if (cached) {
      return json(res, 200, cached);
    }
    const sourceFileBytes = await storage.readUpload(jobId, job.uploadPath);
    const geometry = await viewerGeometryExtractor.extract({
      sourceFileBytes: new Uint8Array(sourceFileBytes),
    });
    await viewerGeometryCache.write(cacheKey, geometry);
    return json(res, 200, geometry);
  } catch (error) {
    return json(res, 422, {
      error: error instanceof Error ? error.message : "IFC geometry extraction failed.",
    });
  }
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
