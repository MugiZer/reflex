import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { access, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { createJob } from "../../application/jobs/createJob.js";
import { ApplicationFailure } from "../../application/applicationFailure.js";
import { safeOperationalDiagnostic } from "../../application/safeOperationalDiagnostic.js";
import { recoverPaidPilotJobs } from "../../application/jobs/recoverPaidPilotJobs.js";
import { requireCompletedJobPublication } from "../../application/jobs/completedJobPublication.js";
import { retryFailedJob } from "../../application/jobs/retryFailedJob.js";
import { reconcileJobReviewPlan } from "../../application/jobs/reconcileJobReviewPlan.js";
import { getJobWorkspace } from "../../application/jobs/getJobWorkspace.js";
import type { ProcessIfcJobDeps } from "../../application/jobs/processIfcJob.js";
import { submitJobReviewInputs } from "../../application/jobs/submitJobReviewInputs.js";
import { submitJobTopologyReview } from "../../application/topology/submitJobTopologyReview.js";
import { createTopologyAnalysisRequestService } from "../../application/topology/createTopologyAnalysisRequestService.js";
import { qualifyGeneratedTopologyAdapter } from "../../application/topology/qualifyGeneratedTopologyAdapter.js";
import { createGeneratedTopologyAdapterRuntime } from "../../infrastructure/topology/createGeneratedTopologyAdapterRuntime.js";
import { refreshJobTopologyReport } from "../../application/topology/refreshJobTopologyReport.js";
import { generateHtmlReport } from "../../application/reports/generateHtmlReport.js";
import type { TopologyWorkerRuntime } from "../../domain/topology/topologyTypes.js";
import type { TopologyPilotPolicy } from "../../domain/topology/topologyPilotPolicy.js";
import type { ComponentPattern } from "../../domain/topology/componentPatternInterpreter.js";
import type { GeneratedTopologyAdapter } from "../../domain/topology/generatedTopologyAdapter.js";
import { ReplayComponentEvaluationError, replayJobComponentEvaluation } from "../../application/topology/replayJobComponentEvaluation.js";
import { PROVEN_TOPOLOGY_BUNDLE, createProvenPythonTopologyWorker } from "../../infrastructure/topology/createProvenPythonTopologyWorker.js";
import { cleanupLocalTopologyArtifacts, LocalTopologyArtifactStore } from "../../infrastructure/topology/localTopologyArtifactStore.js";
import { createLocalTopologyReviewEvidenceLoader } from "../../infrastructure/topology/localTopologyReviewEvidenceLoader.js";
import { createLocalJobWorkspaceEvidenceLoader } from "../../infrastructure/jobs/localJobWorkspaceEvidenceLoader.js";
import { submitThermalTreatmentConfirmation } from "../../application/thermal-treatment/submitThermalTreatmentConfirmation.js";
import { continuousZGirtFamilyRegistry } from "../../domain/thermal-treatment/families/continuousZGirtFamily.js";
import type { ThermalTreatmentFamilyRegistry } from "../../domain/thermal-treatment/thermalTreatmentTypes.js";
import { OpenSource2dCalculationWorker } from "../../infrastructure/thermal-treatment/OpenSource2dCalculationWorker.js";
import type { ClosableJobRepository, JobRepository } from "../../domain/jobs/jobRepository.js";
import type { JobRecord } from "../../domain/jobs/jobTypes.js";
import { WebIfcViewerGeometryExtractor } from "../../infrastructure/ifc/web-ifc/WebIfcViewerGeometryExtractor.js";
import { SqliteJobRepository } from "../../infrastructure/persistence/sqlite/SqliteJobRepository.js";
import { SqliteComponentEvaluationRepository } from "../../infrastructure/persistence/sqlite/SqliteComponentEvaluationRepository.js";
import { assertCompletedPilotPublicationLineage, type ComponentEvaluationRepository } from "../../domain/topology/componentEvaluationRecords.js";
import { LocalJobArtifactStore } from "../../infrastructure/storage/local-files/jobArtifactStore.js";
import { LocalJobFileStorage } from "../../infrastructure/storage/local-files/jobFileStorage.js";
import { LocalViewerGeometryCache } from "../../infrastructure/storage/local-files/viewerGeometryCache.js";
import { LocalCompletedJobPublicationValidator } from "../../infrastructure/jobs/validateCompletedJobArtifacts.js";
import { defaultMaterialLibraryV1 } from "../../domain/materials/library.v1.js";
import { renderAppShellClientScript } from "./frontend/appShellClient.js";
import { renderIfcReviewViewerClientScript } from "./ifcReviewViewerClient.js";
import { parseMultipartUpload, readBuffer } from "./multipartUpload.js";
import { renderAppShell } from "./renderAppShell.js";

export type LocalhostApp = {
  server: Server;
  jobs: ClosableJobRepository;
  qualifyGeneratedTopologyAdapter: (adapter: unknown, testedRevision: string, now?: Date) => ReturnType<typeof qualifyGeneratedTopologyAdapter>;
  close(): void;
};

export function createLocalhostApp(command: {
  databasePath: string;
  storageRoot: string;
  outputRoot: string;
  workerOverrides?: Partial<Pick<ProcessIfcJobDeps, "extractCalculationInputEvidence">>;
  topologyWorker?: TopologyWorkerRuntime;
  topologyRequests?: ReturnType<typeof createTopologyAnalysisRequestService>;
  componentPatterns?: readonly ComponentPattern[];
  componentScreeningThresholdWPerM2K?: number | null;
  topologyPilotEnabled?: boolean;
  topologyPilotPolicy?: TopologyPilotPolicy;
  maxUploadBytes?: number;
  generatedTopologyAdapterManifestRoot?: string;
  thermalTreatmentRegistry?: ThermalTreatmentFamilyRegistry;
}): LocalhostApp {
  const jobs = new SqliteJobRepository(command.databasePath);
  const componentEvaluations = new SqliteComponentEvaluationRepository(command.databasePath);
  const storage = new LocalJobFileStorage(command.storageRoot);
  const artifactStore = new LocalJobArtifactStore(command.outputRoot);
  const completedJobPublication = new LocalCompletedJobPublicationValidator(artifactStore);
  const viewerGeometryCache = new LocalViewerGeometryCache(artifactStore);
  const viewerGeometryExtractor = new WebIfcViewerGeometryExtractor();
  const workerDeps: ProcessIfcJobDeps = {
    jobs,
    outputRoot: command.outputRoot,
    artifactStore,
    completedJobPublication,
    materialLibrary: defaultMaterialLibraryV1,
    ...command.workerOverrides,
  };
  const thermalTreatmentWorker = new OpenSource2dCalculationWorker({ artifactRoot: join(command.outputRoot, "thermal-treatment-worker") });
  const thermalTreatmentRegistry = command.thermalTreatmentRegistry ?? continuousZGirtFamilyRegistry;
  const topologyWorker = command.topologyWorker ?? configuredTopologyWorker();
  const generatedTopologyRuntime = createGeneratedTopologyAdapterRuntime(command.generatedTopologyAdapterManifestRoot ?? join(command.outputRoot, "generated-topology-adapters"));
  const startupCleanup = Promise.all([
    cleanupLocalTopologyArtifacts(command.outputRoot),
    recoverPaidPilotJobs({ jobs, validator: completedJobPublication }),
    generatedTopologyRuntime,
  ]);
  const topologyRequests = command.topologyRequests ?? createTopologyAnalysisRequestService({
    artifactStore: new LocalTopologyArtifactStore(command.outputRoot),
    worker: topologyWorker,
  });
  const server = createServer(async (req, res) => {
    try {
      await startupCleanup;
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method === "GET" && url.pathname === "/api/health") {
        return await sendHealth(res, jobs, command.outputRoot, topologyWorker);
      }
      if (req.method === "POST" && url.pathname === "/api/jobs") {
        const upload = await parseMultipartUpload(req, { maxBytes: command.maxUploadBytes });
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
          componentEvaluations,
          createLocalJobWorkspaceEvidenceLoader(artifactStore),
          topologyRequests,
          jobId,
          parseArchitectTarget(url.searchParams.get("targetU")),
          thermalTreatmentRegistry,
        );
      }

      const reconcileJobId = matchPath(url.pathname, /^\/api\/jobs\/([^/]+)\/reconcile-review-plan$/);
      if (req.method === "POST" && reconcileJobId) {
        const result = await reconcileJobReviewPlan({ jobId: reconcileJobId, deps: workerDeps });
        return json(res, 202, result);
      }

      const topologyReviewJobId = matchPath(url.pathname, /^\/api\/jobs\/([^/]+)\/topology-reviews$/);
      if (req.method === "GET" && topologyReviewJobId) {
        if (!jobs.getJob(topologyReviewJobId)) return json(res, 404, { error: "Job not found" });
        return json(res, 200, { topologyReviews: jobs.listTopologyReviews(topologyReviewJobId) });
      }

      const retryJobId = matchPath(url.pathname, /^\/api\/jobs\/([^/]+)\/retry$/);
      if (req.method === "POST" && retryJobId) {
        return json(res, 202, retryFailedJob({ jobId: retryJobId, jobs, deps: workerDeps }));
      }
      const replayJobId = matchPath(url.pathname, /^\/api\/jobs\/([^/]+)\/component-evaluations\/replay$/);
      if (req.method === "POST" && replayJobId) {
        const body = await readJson(req);
        if (!isRecord(body) || typeof body.evaluationId !== "string" || typeof body.patternId !== "string" || typeof body.patternVersion !== "string") return json(res,400,{error:"evaluationId, patternId, and patternVersion are required."});
        try{return json(res,202,replayJobComponentEvaluation({jobId:replayJobId,evaluationId:body.evaluationId,patternId:body.patternId,patternVersion:body.patternVersion,jobs,componentEvaluations,patterns:[...(await generatedTopologyRuntime).registry.componentPatterns(), ...(command.componentPatterns ?? [])]}));}catch(error){const status=error instanceof ReplayComponentEvaluationError&&error.code==="component_evaluation_not_found"?404:422;return json(res,status,{error:error instanceof Error?error.message:String(error)});}
      }
      if (req.method === "POST" && topologyReviewJobId) {
          const cancellation = requestCancellationSignal(req, res);
        try {
          const topologyEvidence = createLocalTopologyReviewEvidenceLoader(artifactStore);
          const result = await submitJobTopologyReview({ jobId: topologyReviewJobId, body: await readJson(req), jobs, componentEvaluations, evidence: topologyEvidence, requests: topologyRequests, bundle: PROVEN_TOPOLOGY_BUNDLE, deadlineAt: parseTopologyDeadline(req), cancellationSignal: cancellation.signal, componentPatterns: command.componentPatterns, generatedTopologyAdapters: (await generatedTopologyRuntime).registry, screeningThresholdWPerM2K: command.componentScreeningThresholdWPerM2K, topologyPilotEnabled: command.topologyPilotEnabled, topologyPilotPolicy: command.topologyPilotPolicy });
          await refreshJobTopologyReport({
            jobId: topologyReviewJobId,
            jobs,
            evidence: topologyEvidence,
            integrity: topologyRequests,
            writer: { write: (report) => generateHtmlReport({ artifactStore, outputRoot: command.outputRoot, jobId: report.jobId, fileHash: report.fileHash, revision: report.revision, calculationSnapshots: report.revision.calculationSnapshots, reportInventory: report.reportInventory, topologyResults: report.topologyResults }) },
          });
          return json(res, 202, "pilotRunId" in result ? { ...result, pilotRun: result } : result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return json(res, topologyReviewErrorStatus(message), { error: message });
        } finally {
          cancellation.dispose();
        }
      }

      const thermalTreatmentJobId = matchPath(url.pathname, /^\/api\/jobs\/([^/]+)\/thermal-treatment$/);
      if (req.method === "POST" && thermalTreatmentJobId) {
        const result = await submitThermalTreatmentConfirmation({ jobId: thermalTreatmentJobId, body: await readJson(req), jobs, deps: workerDeps, registry: thermalTreatmentRegistry, worker: thermalTreatmentWorker });
        return json(res, 202, result);
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
        return await sendReport(res, jobs, componentEvaluations, topologyRequests, completedJobPublication, reportJobId);
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
      return sendApplicationFailure(res, error);
    }
  });
  return {
    server,
    jobs,
    qualifyGeneratedTopologyAdapter: async (adapter, testedRevision, now) => {
      const receipt = await qualifyGeneratedTopologyAdapter({ adapter, outputRoot: command.outputRoot, pythonExecutable: topologyWorker.runtimeIdentity.executable, testedRevision, now });
      if (receipt.decision === "GO") {
        const outcome = await (await generatedTopologyRuntime).activate(adapter as GeneratedTopologyAdapter, receipt);
        if (outcome !== "activated" && outcome !== "duplicate") throw new Error(`Generated topology adapter activation failed: ${outcome}.`);
      }
      return receipt;
    },
    close: () => { try { componentEvaluations.close(); } finally { jobs.close(); } },
  };
}

function sendApplicationFailure(res: ServerResponse, error: unknown): void {
  if (error instanceof ApplicationFailure) {
    const status = error.kind === "payload_too_large" ? 413
      : error.kind === "invalid_input" ? 422
      : error.kind === "not_found" ? 404
      : 409;
    return json(res, status, { code: error.code, error: error.safeMessage });
  }
  const correlationId = randomUUID();
  console.error(`[${correlationId}] Unexpected localhost request failure.`, safeOperationalDiagnostic(error));
  return json(res, 500, {
    code: "internal_error",
    error: "The request could not be completed.",
    correlationId,
  });
}

async function sendJob(
  res: ServerResponse,
  jobs: JobRepository,
  componentEvaluations: ComponentEvaluationRepository,
  evidence: ReturnType<typeof createLocalJobWorkspaceEvidenceLoader>,
  topologyIntegrity: ReturnType<typeof createTopologyAnalysisRequestService>,
  jobId: string,
  targetUValueWPerM2K: number | null,
  thermalTreatmentRegistry: ThermalTreatmentFamilyRegistry,
): Promise<void> {
  const workspace = await getJobWorkspace({
    jobs,
    evidence,
    topologyIntegrity,
    jobId,
    targetUValueWPerM2K,
    thermalTreatmentRegistry,
  });
  if (!workspace) {
    return json(res, 404, { error: "Job not found" });
  }
  const componentProjection = await safeComponentEvaluations(jobs, componentEvaluations, topologyIntegrity, jobId);
  return json(res, 200, {
    ...workspace.job,
    review: workspace.review,
    architectActions: workspace.architectActions,
    materialLibrary: workspace.materialLibrary,
    thermalTreatmentCards: workspace.thermalTreatmentCards,
    topologyOpportunities: workspace.topologyOpportunities,
    topologyReviews: workspace.topologyReviews,
    pilotRuns: workspace.pilotRuns,
    pilotEvents: workspace.pilotEvents,
    componentEvaluations: componentProjection.evaluations,
    componentEvaluationDiagnostic: componentProjection.diagnostic,
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
  componentEvaluations: ComponentEvaluationRepository,
  topologyIntegrity: ReturnType<typeof createTopologyAnalysisRequestService>,
  completedJobPublication: LocalCompletedJobPublicationValidator,
  jobId: string,
): Promise<void> {
  const job = jobs.getJob(jobId);
  if (!job) {
    return json(res, 404, { error: "Job not found" });
  }
  if (!job.reportPath) {
    return json(res, 404, { error: "Report has not been generated." });
  }
  await requireCompletedJobPublication({ job, jobs, validator: completedJobPublication });
  const topologyResults = jobs.listTopologyReviews(jobId)
    .filter((review) => review.sourceRevisionId === job.activeRevisionId && review.topologyResult !== null)
    .map((review) => review.topologyResult!);
  await Promise.all(topologyResults.map((result) => topologyIntegrity.verifyPersistedResult(result)));
  const stored = await readFile(job.reportPath, "utf8");
  const projection = await safeComponentEvaluations(jobs, componentEvaluations, topologyIntegrity, jobId);
  const componentSection = projection.diagnostic
    ? `<section class="material-values topology-result"><h3>Component topology result unavailable</h3><p>${escapeHtml(projection.diagnostic)}</p></section>`
    : projection.evaluations.map(renderComponentEvaluation).join("");
  return html(res, 200, stored.replace("</main>", componentSection + "</main>"));
}

async function safeComponentEvaluations(jobs: JobRepository, componentEvaluations: ComponentEvaluationRepository, integrity: ReturnType<typeof createTopologyAnalysisRequestService>, jobId: string): Promise<{ evaluations: readonly import("../../domain/topology/componentEvaluationRecords.js").ComponentEvaluationGraph[]; diagnostic: string | null }> {
  try {
    const evaluations = componentEvaluations.listByJobId(jobId);
    const pilotRuns = jobs.listTopologyPilotRuns(jobId);
    const pilotEvents = jobs.listTopologyPilotEvents?.(jobId) ?? [];
    for (const graph of evaluations) {
      assertCompletedPilotPublicationLineage(graph, pilotRuns, pilotEvents);
      for (const result of graph.results) if (result.outcome === "preliminary-unsafe") await integrity.verifyPersistedResult(result.resultPayload as unknown as import("../../domain/topology/topologyTypes.js").TopologyResult);
    }
    return { evaluations, diagnostic: null };
  } catch { return { evaluations: [], diagnostic: "component_evaluation_corrupted: persisted component evaluation evidence failed integrity validation; no topology value is available." }; }
}

function renderComponentEvaluation(graph: import("../../domain/topology/componentEvaluationRecords.js").ComponentEvaluationGraph): string {
  if (!graph.aggregate) return "";
  const payload = graph.aggregate.payload as Record<string, unknown>;
  const range = typeof payload.minUValueWPerM2K === "number" && typeof payload.maxUValueWPerM2K === "number" ? `${payload.minUValueWPerM2K.toFixed(3)}–${payload.maxUValueWPerM2K.toFixed(3)} W/m2K` : "No topology range";
  const lineage = graph.requests.map((request) => {
    const recipe = graph.recipes.find((item) => item.recipeId === request.recipeId)!;
    const result = graph.results.find((item) => item.scenarioRequestId === request.scenarioRequestId)!;
    const resultPayload = result.resultPayload as Record<string, unknown>;
    const bundle = resultPayload.bundle as Record<string, unknown> | undefined;
    return `<li>Recipe ${escapeHtml(recipe.recipeId)} · request ${escapeHtml(request.scenarioRequestId)} · result ${escapeHtml(result.scenarioResultId)} · artifact ${escapeHtml(result.artifactIdentity ?? "none")} · worker bundle ${escapeHtml(String(bundle?.moduleId ?? "unknown"))}/${escapeHtml(String(bundle?.moduleVersion ?? "unknown"))} registry ${escapeHtml(String(bundle?.registryHash ?? "unknown"))} pack ${escapeHtml(String(bundle?.packHash ?? "unknown"))} runtime ${escapeHtml(String(bundle?.runtimeHash ?? "unknown"))}</li>`;
  }).join("");
  return `<section class="material-values topology-result"><div class="section-title"><div><span class="eyebrow">Component topology evaluation</span><h3>Preliminary — not verified</h3></div></div><p><b>Outcome:</b> ${escapeHtml(graph.aggregate.outcome)} · <b>Range:</b> ${escapeHtml(range)}</p><p><b>Evaluation:</b> ${escapeHtml(graph.evaluation.evaluationId)} · <b>Aggregate:</b> ${escapeHtml(graph.aggregate.aggregateId)}</p><ul>${lineage}</ul></section>`;
}

function escapeHtml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

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
  } catch {
    return json(res, 422, { code: "viewer_geometry_unavailable", error: "IFC geometry extraction failed." });
  }
}

function linksFor(job: JobRecord): Record<string, string> {
  const links: Record<string, string> = {
    self: `/api/jobs/${job.jobId}`,
    page: `/jobs/${job.jobId}`,
    ifc: `/api/jobs/${job.jobId}/ifc`,
    viewerGeometry: `/api/jobs/${job.jobId}/viewer-geometry`,
    topologyReviews: `/api/jobs/${job.jobId}/topology-reviews`,
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
  try {
    return JSON.parse((await readBuffer(req, 1024 * 1024)).toString("utf8"));
  } catch (error) {
    if (error instanceof ApplicationFailure) throw error;
    throw new ApplicationFailure("invalid_input", "invalid_json", "Expected a valid JSON request body.");
  }
}

function parseTopologyDeadline(req: IncomingMessage): string | undefined {
  const raw = req.headers["x-topology-deadline-at"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return undefined;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : undefined;
}

function requestCancellationSignal(req: IncomingMessage, res: ServerResponse): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const onAborted = () => controller.abort();
  const onResponseClosed = () => { if (!res.writableEnded) controller.abort(); };
  if (req.aborted) controller.abort();
  req.once("aborted", onAborted);
  res.once("close", onResponseClosed);
  return { signal: controller.signal, dispose: () => { req.off("aborted", onAborted); res.off("close", onResponseClosed); } };
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

async function sendHealth(res: ServerResponse, jobs: JobRepository, outputRoot: string, worker: TopologyWorkerRuntime): Promise<void> {
  const checks: Record<string, { status: "ready" | "unavailable"; diagnostic: string | null }> = {
    sqlite: { status: "ready", diagnostic: null },
    artifactStorage: { status: "ready", diagnostic: null },
    pinnedRuntime: { status: "ready", diagnostic: null },
    workerPreflight: { status: "ready", diagnostic: null },
    selectedBundle: { status: "ready", diagnostic: null },
  };
  try { jobs.listRecentJobs(1); } catch { checks.sqlite = { status: "unavailable", diagnostic: "SQLite is unavailable." }; }
  try { await mkdir(outputRoot, { recursive: true }); await access(outputRoot); } catch { checks.artifactStorage = { status: "unavailable", diagnostic: "Artifact storage is unavailable." }; }
  if (!worker.runtimeIdentity.executable || worker.runtimeIdentity.runtimeHash !== PROVEN_TOPOLOGY_BUNDLE.runtimeHash) checks.pinnedRuntime = { status: "unavailable", diagnostic: "Configured topology runtime is not pinned to the selected release hash." };
  if (checks.pinnedRuntime.status === "ready" && worker.preflight) {
    try { await worker.preflight(); } catch { checks.workerPreflight = { status: "unavailable", diagnostic: "Topology worker preflight failed." }; }
  }
  const topologyAvailable = Object.values(checks).every((check) => check.status === "ready");
  const layerOnlyAvailable = checks.sqlite.status === "ready";
  const overallStatus = !layerOnlyAvailable ? "unavailable" : topologyAvailable ? "ready" : "degraded";
  return json(res, !layerOnlyAvailable ? 503 : 200, { schema: "topology-pilot-health/v1", overallStatus, layerOnly: { available: layerOnlyAvailable }, topology: { available: topologyAvailable }, checks });
}

/** Expected topology-review input failures are client-visible, not server faults. */
function topologyReviewErrorStatus(message: string): number {
  if (message === "Job not found.") return 404;
  if (message.startsWith("Expected a topology review") || message.includes(" is required.") || message.startsWith("answers must") || message.startsWith("Topology review answers")) return 422;
  return 500;
}

function configuredTopologyWorker(): TopologyWorkerRuntime {
  const pythonExecutable = process.env.TOPOLOGY_WORKER_PYTHON;
  if (pythonExecutable) return createProvenPythonTopologyWorker({ pythonExecutable });
  return {
    runtimeIdentity: { executable: "unavailable-release-topology-runtime", runtimeHash: PROVEN_TOPOLOGY_BUNDLE.runtimeHash },
    async preflight() {
      throw Object.assign(new Error("Topology runtime is not configured. Set TOPOLOGY_WORKER_PYTHON to the release-owned Python executable."), { outcome: "failed" as const, code: "topology_runtime_unavailable" });
    },
    async verifyArtifacts() {},
    async runJsonl() {
      throw Object.assign(new Error("Topology runtime is not configured. Set TOPOLOGY_WORKER_PYTHON to the release-owned Python executable."), { outcome: "failed" as const, code: "topology_runtime_unavailable" });
    },
  };
}
