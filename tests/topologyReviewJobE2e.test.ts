import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createLocalhostApp } from "../src/app/http/httpServer.js";
import type { CalculationInputEvidence } from "../src/domain/evidence/calculationInputEvidenceTypes.js";
import { createProvenPythonTopologyWorker } from "../src/infrastructure/topology/createProvenPythonTopologyWorker.js";

const pythonExecutable = resolve(process.env.TOPOLOGY_WORKER_PYTHON ?? ".scratch/component-topology-kernel/conformance-proof/.venv/Scripts/python.exe");

describe("Ticket 03 real Job topology review", () => {
  it("crosses Job, HTTP, Python, SQLite restart, workspace, and report seams", async () => {
    const root = await mkdtemp(join(tmpdir(), "ticket-03-real-seam-"));
    const observedDeadlines: string[] = [];
    const config = {
      databasePath: join(root, "data", "app.db"),
      storageRoot: join(root, "storage"),
      outputRoot: join(root, "outputs"),
      workerOverrides: { extractCalculationInputEvidence: async () => repeatingWallEvidence() },
      topologyWorker: countedWorker(observedDeadlines),
    };
    let app = createLocalhostApp(config);
    try {
      const baseUrl = await listen(app);
      const sourceBytes = "ISO-10303-21; ticket-03-real-seam; END-ISO-10303-21;";
      const form = new FormData();
      form.set("ifc", new Blob([sourceBytes]), "ticket-03.ifc");
      const created = await json<{ jobId: string }>(await fetch(`${baseUrl}/api/jobs`, { method: "POST", body: form }));
      const job = await waitForCompletedJob(baseUrl, created.jobId);
      expect(job.fileHash).toBe(createHash("sha256").update(sourceBytes).digest("hex"));
      expect(job.topologyOpportunities).toHaveLength(1);

      const candidate = job.topologyOpportunities[0]!;
      const layerOnlyBefore = JSON.stringify(job.architectActions.assemblies);
      const reviewBody = JSON.stringify({
        opportunityId: candidate.opportunityId,
        thermalConstructionSignature: candidate.thermalConstructionSignature,
        sourceRevisionId: job.activeRevisionId,
        sourceAssemblyGroupId: candidate.sourceAssemblyGroupIds[0],
        answers: { memberKind: "rectangle", memberMaterial: "softwood", memberWidthM: 0.045, repeatSpacingM: 0.6, continuousThroughLayers: true, exteriorBoundary: "external-wall", interiorBoundary: "internal" },
      });
      const requestedDeadline = new Date(Date.now() + 120_000).toISOString();
      const blockedResponse = await fetch(`${baseUrl}/api/jobs/${created.jobId}/topology-reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...JSON.parse(reviewBody), answers: { ...JSON.parse(reviewBody).answers, memberWidthM: "i-dont-know" } }),
      });
      expect(await json<any>(blockedResponse)).toMatchObject({ outcome: "blocked", missingKeys: ["memberWidthM"], decisiveNextInput: "memberWidthM", topologyResult: null });
      const reviewResponse = await fetch(`${baseUrl}/api/jobs/${created.jobId}/topology-reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-topology-deadline-at": requestedDeadline },
        body: reviewBody,
      });
      expect(reviewResponse.status).toBe(202);
      const review = await json<any>(reviewResponse);
      expect(observedDeadlines).toContain(requestedDeadline);
      expect(review).toMatchObject({ outcome: "preliminary-unsafe", jobId: created.jobId });
      expect(review.topologyResult.evidence.canonicalAnalysisGeometry.schemaVersion).toBe("canonical-analysis-geometry/v1");

      await close(app);
      app = createLocalhostApp({ ...config, topologyWorker: countedWorker() });
      const restartedUrl = await listen(app);
      const reloaded = await json<any>(await fetch(`${restartedUrl}/api/jobs/${created.jobId}`));
      expect(reloaded.topologyReviews).toHaveLength(2);
      expect(reloaded.topologyReviews.some((item: any) => item.topologyReviewId === review.topologyReviewId)).toBe(true);
      expect(JSON.stringify(reloaded.architectActions.assemblies)).toBe(layerOnlyBefore);
      const report = await (await fetch(`${restartedUrl}/api/jobs/${created.jobId}/report`)).text();
      expect(report).toContain("Preliminary topology result");
      expect(report).toContain(review.topologyResult.requestId);
      expect(await readFile(join(root, "worker-invocations.txt"), "utf8")).toBe("1");

      const competitor = createLocalhostApp({ ...config, topologyWorker: countedWorker() });
      try {
        const competitorUrl = await listen(competitor);
        const replayRequest = (url: string) => fetch(`${url}/api/jobs/${created.jobId}/topology-reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: reviewBody }).then(json<any>);
        const [leftReplay, rightReplay] = await Promise.all([replayRequest(restartedUrl), replayRequest(competitorUrl)]);
        expect(leftReplay.topologyReviewId).toBe(review.topologyReviewId);
        expect(rightReplay.topologyReviewId).toBe(review.topologyReviewId);
        expect(await readFile(join(root, "worker-invocations.txt"), "utf8")).toBe("1");
      } finally {
        await close(competitor);
      }

      const invalidAnswerResponse = await fetch(`${restartedUrl}/api/jobs/${created.jobId}/topology-reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...JSON.parse(reviewBody), answers: { memberWidthM: { untrusted: true } } }),
      });
      expect(invalidAnswerResponse.status).toBe(202);
      const invalidReview = await json<any>(invalidAnswerResponse);
      expect(invalidReview).toMatchObject({ outcome: "rejected", errorCode: "invalid_answer_shape" });
      const wrongOwnerResponse = await fetch(`${restartedUrl}/api/jobs/${created.jobId}/topology-reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...JSON.parse(reviewBody), sourceAssemblyGroupId: "ag_wrong_owner" }),
      });
      expect(await json<any>(wrongOwnerResponse)).toMatchObject({ outcome: "rejected", errorCode: "wrong_assembly_group" });
      const reviewsAfterInvalid = await json<any>(await fetch(`${restartedUrl}/api/jobs/${created.jobId}/topology-reviews`));
      expect(reviewsAfterInvalid.topologyReviews).toHaveLength(4);
      expect(await readFile(join(root, "worker-invocations.txt"), "utf8")).toBe("1");

      const artifactName = review.topologyResult.evidence.artifactIndex[0].name as string;
      await rm(join(review.topologyResult.artifactDirectory, "worker", artifactName));
      const corrupted = await fetch(`${restartedUrl}/api/jobs/${created.jobId}`);
      expect(corrupted.status).toBe(500);
      expect(await corrupted.text()).not.toContain("effectiveUValueWPerM2K");
    } finally {
      if (app.server.listening) await close(app);
      else app.close();
      await rm(root, { recursive: true, force: true });
    }

    function countedWorker(deadlines: string[] = []) {
      const worker = createProvenPythonTopologyWorker({ pythonExecutable });
      return {
        ...worker,
        async runJsonl(message: string, options: { deadlineAt: string; signal?: AbortSignal }) {
          deadlines.push(options.deadlineAt);
          const marker = join(root, "worker-invocations.txt");
          let count = 0;
          try { count = Number(await readFile(marker, "utf8")); } catch { /* first invocation */ }
          const { writeFile } = await import("node:fs/promises");
          await writeFile(marker, String(count + 1), "utf8");
          return worker.runJsonl(message, options);
        },
      };
    }
  }, 180_000);
});

async function listen(app: ReturnType<typeof createLocalhostApp>): Promise<string> {
  app.server.listen(0, "127.0.0.1");
  await new Promise<void>((resolveListening) => app.server.once("listening", resolveListening));
  const address = app.server.address();
  if (!address || typeof address === "string") throw new Error("Server is not bound.");
  return `http://127.0.0.1:${address.port}`;
}

async function close(app: ReturnType<typeof createLocalhostApp>): Promise<void> {
  await new Promise<void>((resolveClose, reject) => app.server.close((error) => error ? reject(error) : resolveClose()));
  app.close();
}

async function json<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(body)}`);
  return body as T;
}

async function waitForCompletedJob(baseUrl: string, jobId: string): Promise<any> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const job = await json<any>(await fetch(`${baseUrl}/api/jobs/${jobId}`));
    if (job.jobStatus === "completed") return job;
    if (job.jobStatus === "failed") throw new Error(job.errorMessage ?? "Job failed.");
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  }
  throw new Error("Job did not complete.");
}

function repeatingWallEvidence(): CalculationInputEvidence[] {
  const reference = { evidencePath: "IfcMaterialLayerSet.MaterialLayers", sourceStepIds: [101], pathParts: [] };
  const layer = (field: "layer_material_name" | "layer_thickness" | "layer_lambda", value: string | number, layerIndex: number, materialName: string) => ({ field, value, source: "ifc_fixed" as const, confidence: "high" as const, evidenceReferences: [reference], reason: "Stored IFC fixture evidence.", layer: { layerIndex, layerStepId: 1000 + layerIndex, materialName } });
  return [{
    elementStepId: 101,
    elementGlobalId: "ticket-03-wall",
    elementName: "Ticket 03 repeating wall",
    elementClass: "IfcWall",
    calculationInputBasis: "layered_ifc_complete",
    fixedInputs: [
      layer("layer_material_name", "Timber stud", 0, "Timber stud"), layer("layer_thickness", 0.14, 0, "Timber stud"), layer("layer_lambda", 0.12, 0, "Timber stud"),
      layer("layer_material_name", "Mineral wool", 1, "Mineral wool"), layer("layer_thickness", 0.04, 1, "Mineral wool"), layer("layer_lambda", 0.04, 1, "Mineral wool"),
    ],
    candidateInputs: [], missingInputs: [], diagnostics: [],
  }];
}
