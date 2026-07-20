import { once } from "node:events";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createLocalhostApp } from "../src/app/http/httpServer.js";

async function createRecognizedReviewJob() {
  const root = join(tmpdir(), `review-plan-reconcile-${Date.now()}`);
  const layer = { layerIndex: 0, layerStepId: 8801, materialName: "Mineral wool" };
  const evidence = {
    elementStepId: 88,
    elementGlobalId: "reconcile-wall",
    elementClass: "IfcWall" as const,
    calculationInputBasis: "layered_needs_material_resolution" as const,
    fixedInputs: [input("layer_order", [8801], layer), input("layer_thickness", 0.18, layer), input("layer_material_name", "Mineral wool", layer)],
    candidateInputs: [],
    missingInputs: [input("layer_lambda", null, layer, "missing")],
    diagnostics: [],
  };
  const app = createLocalhostApp({
    databasePath: join(root, "data", "app.db"), storageRoot: join(root, "storage"), outputRoot: join(root, "outputs"),
    workerOverrides: { extractCalculationInputEvidence: async () => [evidence] },
  });
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const address = app.server.address();
  if (!address || typeof address === "string") throw new Error("Server is not bound.");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const form = new FormData();
  form.set("ifc", new Blob(["ISO-10303-21; END-ISO-10303-21;"]), "fixture.ifc");
  const created = await (await fetch(`${baseUrl}/api/jobs`, { method: "POST", body: form })).json() as { jobId: string };
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const job = await (await fetch(`${baseUrl}/api/jobs/${created.jobId}`)).json() as { jobStatus: string };
    if (job.jobStatus === "needs_review") return { root, app, baseUrl, jobId: created.jobId };
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for Review.");
}

describe("review-plan reconciliation", () => {
  it("explicitly reconciles an outdated plan, completes it, and preserves evidence", async () => {
    const fixture = await createRecognizedReviewJob();
    try {
      fixture.app.jobs.saveReviewState({
        jobId: fixture.jobId,
        requestedInputs: fixture.app.jobs.getReviewState(fixture.jobId)?.requestedInputs ?? [],
        planVersion: "review-plan.v0",
        materialLibraryVersion: "materials.library.v0",
      });
      const response = await fetch(`${fixture.baseUrl}/api/jobs/${fixture.jobId}/reconcile-review-plan`, { method: "POST" });
      const result = await response.json() as { jobStatus: string; reconciled: boolean; revisionId?: string };
      expect(response.status).toBe(202);
      expect(result).toMatchObject({ jobStatus: "completed", reconciled: true });
      expect(result.revisionId).toMatch(/^rev_/);
      await expect(readFile(join(fixture.root, "outputs", fixture.jobId, "evidence", "calculation-input-evidence.json"), "utf8")).resolves.toContain("Mineral wool");
      expect(fixture.app.jobs.getReviewState(fixture.jobId)).toEqual(expect.objectContaining({ planVersion: "review-plan.v3", materialLibraryVersion: "materials.library.v1", requestedInputs: [expect.objectContaining({ required: false })] }));
    } finally {
      fixture.app.server.close(); fixture.app.jobs.close(); await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("is a no-op when the stored plan and material-library versions match", async () => {
    const fixture = await createRecognizedReviewJob();
    try {
      const state = fixture.app.jobs.getReviewState(fixture.jobId);
      const response = await fetch(`${fixture.baseUrl}/api/jobs/${fixture.jobId}/reconcile-review-plan`, { method: "POST" });
      await expect(response.json()).resolves.toEqual({ jobId: fixture.jobId, jobStatus: "needs_review", reconciled: false });
      expect(fixture.app.jobs.getReviewState(fixture.jobId)).toEqual(state);
    } finally {
      fixture.app.server.close(); fixture.app.jobs.close(); await rm(fixture.root, { recursive: true, force: true });
    }
  });
});

function input(field: "layer_order" | "layer_thickness" | "layer_material_name" | "layer_lambda", value: unknown, layer: { layerIndex: number; layerStepId: number; materialName: string }, source: "ifc_fixed" | "missing" = "ifc_fixed") {
  return { field, value, source, confidence: source === "missing" ? "low" as const : "high" as const, layer, evidenceReferences: [{ evidencePath: "IfcWall#88", sourceStepIds: [88, 8801], pathParts: [{ stepId: 88, entityClass: "IfcWall" }] }], reason: "Reconciliation fixture." };
}