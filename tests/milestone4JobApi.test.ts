import { once } from "node:events";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createLocalhostApp } from "../src/app/http/httpServer.js";
import { syntheticMilestone4CalculationInputEvidence } from "../src/application/jobs/syntheticMilestone4Fixture.js";
import { renderAppShellClientScript } from "../src/app/http/frontend/appShellClient.js";
import { renderAppShell } from "../src/app/http/renderAppShell.js";

describe("Milestone 4 Job API", () => {
  it("keeps demo values as a UI-only Review affordance", () => {
    const html = renderAppShell();
    const client = renderAppShellClientScript();

    expect(html).toContain("/assets/app-shell.js");
    expect(html).toContain("Conformity");
    expect(html).toContain("Local thermal review workspace");
    expect(client).toContain("Start analysis");
    expect(client).toContain("Recent analyses");
    expect(client).toContain("Resolve missing inputs");
    expect(client).toContain("Demo values");
    expect(client).toContain("demoValueFor");
    expect(client).toContain("demoLambdaFor");
    expect(client).toContain("aluminium");
    expect(client).toContain("gypse");
    expect(client).toContain("isolant");
    expect(client).toContain("Save inputs");
    expect(client).toContain("Only this layer in this element");
    expect(client).toContain("All matching assemblies in this review group");
    expect(client).toContain("All elements using this IFC type");
    expect(client).toContain("IFC Viewer");
    expect(html).toContain("/assets/ifc-review-viewer.js");
    expect(client).not.toContain("Start Job");
    expect(client).not.toContain("Recent Jobs");
  });

  it("uploads an IFC, reaches Review, accepts input, and serves report", async () => {
    const root = join(tmpdir(), `m4-api-${Date.now()}`);
    const app = createLocalhostApp({
      databasePath: join(root, "data", "app.db"),
      storageRoot: join(root, "storage"),
      outputRoot: join(root, "outputs"),
      workerOverrides: {
        extractCalculationInputEvidence: async () => [
          syntheticMilestone4CalculationInputEvidence(),
        ],
      },
    });
    try {
      app.server.listen(0, "127.0.0.1");
      await once(app.server, "listening");
      const baseUrl = boundUrl(app.server);
      const form = new FormData();
      form.set("ifc", new Blob(["ISO-10303-21; fixture; END-ISO-10303-21;"]), "fixture.ifc");

      const created = await postJson(`${baseUrl}/api/jobs`, form);
      expect(created.jobId).toMatch(/^job_/);
      expect(created.jobStatus).toBe("queued");

      const needsReview = await waitForJob(baseUrl, created.jobId, "needs_review");
      expect(needsReview.review.requestedInputs[0]).toEqual(expect.objectContaining({
        assemblyGroupId: "ag_element_40",
        datapoint: "layer_lambda",
        unit: "W/mK",
      }));
      expect(needsReview.review.context.groups[0]).toEqual(expect.objectContaining({
        assemblyGroupId: "ag_element_40",
        primaryLabel: "Wall requiring thermal conductivity",
        highlightStepIds: [40],
      }));
      expect(needsReview.review.context.groups[0].questions[0].technicalIds)
        .toEqual(expect.objectContaining({ assemblyGroupId: "ag_element_40" }));
      const storedJob = app.jobs.getJob(created.jobId);
      expect(storedJob?.uploadPath).toContain(created.jobId);
      await expect(readFile(storedJob?.uploadPath ?? "", "utf8")).resolves.toContain("ISO-10303-21");

      expect(needsReview.links.ifc).toBe(`/api/jobs/${created.jobId}/ifc`);
      const ifc = await fetch(`${baseUrl}/api/jobs/${created.jobId}/ifc`);
      expect(ifc.status).toBe(200);
      expect(ifc.headers.get("content-type")).toBe("application/octet-stream");
      await expect(ifc.text()).resolves.toContain("ISO-10303-21");

      const viewerScript = await fetch(`${baseUrl}/assets/ifc-review-viewer.js`);
      expect(viewerScript.status).toBe(200);
      await expect(viewerScript.text()).resolves.toContain("createIfcReviewViewer");

      const appShellScript = await fetch(`${baseUrl}/assets/app-shell.js`);
      expect(appShellScript.status).toBe(200);
      await expect(appShellScript.text()).resolves.toContain("reviewPage");

      const submitted = await postJson(`${baseUrl}/api/jobs/${created.jobId}/review-inputs`, {
        assemblyGroupId: "ag_element_40",
        inputs: [
          {
            requestedInputId: needsReview.review.requestedInputs[0].requestedInputId,
            value: 0.04,
            unit: "W/mK",
            overrideScope: "assembly_group",
          },
        ],
      });
      expect(submitted.jobStatus).toBe("completed");
      expect(submitted.revisionId).toMatch(/^rev_/);

      const report = await fetch(`${baseUrl}/api/jobs/${created.jobId}/report`);
      expect(report.status).toBe(200);
      await expect(report.text()).resolves.toContain("Thermal Calculation Report");
    } finally {
      app.server.close();
      app.jobs.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses persisted worker-derived calculation input evidence for Review and Report", async () => {
    const root = join(tmpdir(), `m4-api-worker-evidence-${Date.now()}`);
    const app = createLocalhostApp({
      databasePath: join(root, "data", "app.db"),
      storageRoot: join(root, "storage"),
      outputRoot: join(root, "outputs"),
      workerOverrides: {
        extractCalculationInputEvidence: async () => [
          workerCalculationInputEvidence(),
        ],
      },
    });
    try {
      app.server.listen(0, "127.0.0.1");
      await once(app.server, "listening");
      const baseUrl = boundUrl(app.server);
      const form = new FormData();
      form.set("ifc", new Blob(["ISO-10303-21; worker fixture; END-ISO-10303-21;"]), "fixture.ifc");

      const created = await postJson(`${baseUrl}/api/jobs`, form);
      const needsReview = await waitForJob(baseUrl, created.jobId, "needs_review");

      expect(needsReview.review.requestedInputs[0]).toEqual(expect.objectContaining({
        assemblyGroupId: "ag_element_88",
        datapoint: "layer_lambda",
      }));
      expect(needsReview.review.context.groups[0]).toEqual(expect.objectContaining({
        assemblyGroupId: "ag_element_88",
        sourceElementCount: 1,
        highlightStepIds: [88],
      }));
      await expect(readFile(
        join(root, "outputs", created.jobId, "job", "calculation-input-evidence.json"),
        "utf8",
      )).resolves.toContain("Recovered insulation");

      await postJson(`${baseUrl}/api/jobs/${created.jobId}/review-inputs`, {
        assemblyGroupId: "ag_element_88",
        inputs: [
          {
            requestedInputId: needsReview.review.requestedInputs[0].requestedInputId,
            value: 0.04,
            unit: "W/mK",
            overrideScope: "assembly_group",
          },
        ],
      });

      const report = await fetch(`${baseUrl}/api/jobs/${created.jobId}/report`);
      expect(report.status).toBe(200);
      await expect(report.text()).resolves.toContain("Recovered insulation");
    } finally {
      app.server.close();
      app.jobs.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not expose arbitrary IFC paths for unknown Jobs", async () => {
    const root = join(tmpdir(), `m4-api-ifc-missing-${Date.now()}`);
    const app = createLocalhostApp({
      databasePath: join(root, "data", "app.db"),
      storageRoot: join(root, "storage"),
      outputRoot: join(root, "outputs"),
      workerOverrides: {
        extractCalculationInputEvidence: async () => [
          syntheticMilestone4CalculationInputEvidence(),
        ],
      },
    });
    try {
      app.server.listen(0, "127.0.0.1");
      await once(app.server, "listening");
      const response = await fetch(`${boundUrl(app.server)}/api/jobs/missing/ifc`);

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual(expect.objectContaining({
        error: "Job not found",
      }));
    } finally {
      app.server.close();
      app.jobs.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects invalid Review units and scopes", async () => {
    const root = join(tmpdir(), `m4-api-invalid-${Date.now()}`);
    const app = createLocalhostApp({
      databasePath: join(root, "data", "app.db"),
      storageRoot: join(root, "storage"),
      outputRoot: join(root, "outputs"),
      workerOverrides: {
        extractCalculationInputEvidence: async () => [
          syntheticMilestone4CalculationInputEvidence(),
        ],
      },
    });
    try {
      app.server.listen(0, "127.0.0.1");
      await once(app.server, "listening");
      const baseUrl = boundUrl(app.server);
      const form = new FormData();
      form.set("ifc", new Blob(["ISO-10303-21; fixture; END-ISO-10303-21;"]), "fixture.ifc");
      const created = await postJson(`${baseUrl}/api/jobs`, form);
      const needsReview = await waitForJob(baseUrl, created.jobId, "needs_review");

      const response = await fetch(`${baseUrl}/api/jobs/${created.jobId}/review-inputs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assemblyGroupId: "ag_element_40",
          inputs: [
            {
              requestedInputId: needsReview.review.requestedInputs[0].requestedInputId,
              value: 0.04,
              unit: "m",
              overrideScope: "job",
            },
          ],
        }),
      });

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual(expect.objectContaining({
        error: "Invalid overrideScope.",
      }));
    } finally {
      app.server.close();
      app.jobs.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});

function boundUrl(server: { address(): ReturnType<import("node:net").Server["address"]> }): string {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Server is not bound.");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function waitForJob(baseUrl: string, jobId: string, jobStatus: string): Promise<any> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const job = await getJson(`${baseUrl}/api/jobs/${jobId}`);
    if (job.jobStatus === jobStatus) {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${jobStatus}.`);
}

async function postJson(url: string, body: unknown): Promise<any> {
  const init: RequestInit =
    body instanceof FormData
      ? { method: "POST", body }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        };
  const response = await fetch(url, init);
  const value = await response.json();
  if (!response.ok) {
    throw new Error(value.error ?? response.statusText);
  }
  return value;
}

async function getJson(url: string): Promise<any> {
  const response = await fetch(url);
  const value = await response.json();
  if (!response.ok) {
    throw new Error(value.error ?? response.statusText);
  }
  return value;
}

function workerCalculationInputEvidence() {
  return {
    elementStepId: 88,
    elementGlobalId: "worker-wall",
    elementClass: "IfcWall" as const,
    calculationInputBasis: "layered_needs_material_resolution" as const,
    fixedInputs: [
      calculationInput("layer_order", [8801]),
      calculationInput("layer_thickness", 0.18),
      calculationInput("layer_material_name", "Recovered insulation"),
    ],
    candidateInputs: [],
    missingInputs: [
      calculationInput(
        "layer_lambda",
        null,
        "missing",
        "Lambda absent from recovered layer-set evidence.",
      ),
    ],
    diagnostics: [],
  };
}

function calculationInput(
  field: "layer_order" | "layer_thickness" | "layer_material_name" | "layer_lambda",
  value: unknown,
  source: "ifc_fixed" | "missing" = "ifc_fixed",
  reason = "Worker-derived test evidence.",
) {
  return {
    field,
    value,
    source,
    confidence: source === "missing" ? "low" as const : "high" as const,
    evidenceReferences: [
      {
        evidencePath: "IfcWall#88 -> recovered layer evidence",
        sourceStepIds: [88, 8801],
        pathParts: [
          { stepId: 88, entityClass: "IfcWall" },
          { stepId: 8801, entityClass: "IfcMaterialLayer" },
        ],
      },
    ],
    reason,
  };
}
