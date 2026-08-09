import { once } from "node:events";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createLocalhostApp } from "../src/app/http/httpServer.js";
import { syntheticMilestone4CalculationInputEvidence } from "../src/application/jobs/syntheticMilestone4Fixture.js";
import { renderAppShellClientScript } from "../src/app/http/frontend/appShellClient.js";
import { renderAppShell } from "../src/app/http/renderAppShell.js";

describe("Milestone 4 Job API", () => {
  it("renders the Review setup and Architect Action View", () => {
    const html = renderAppShell();
    const client = renderAppShellClientScript();

    expect(html).toContain("/assets/app-shell.js");
    expect(html).toContain("Conformity");
    expect(html).toContain("Architect thermal action workspace");
    expect(client).toContain("Start analysis");
    expect(client).toContain("Recent analyses");
    expect(client).toContain("Architect action view");
    expect(client).toContain("Working U-value target");
    expect(client).toContain("code-compliance verdict");
    expect(client).toContain("Problem");
    expect(client).toContain("Next action");
    expect(client).toContain("Layer proportion and calculated values");
    expect(client).toContain("Run thermal calculation");
    expect(client).toContain("Calculate available assemblies");
    expect(client).toContain("allowPartial: true");
    expect(client).not.toContain("if (availableInputs.length === 0) return");
    expect(client).toContain("Review mode:");
    expect(client).toContain("Model-linked thermal review");
    expect(client).toContain("action-card-meta");
    expect(client).toContain("action-card-problem");
    expect(client).not.toContain("storeySelect");
    expect(client).not.toContain("localStorage");
    expect(html).toContain("/assets/ifc-review-viewer.js");
    expect(client).toContain("How should we resolve missing values?");
    expect(client).toContain("Use Material Library values");
    expect(client).toContain("Enter values manually");
    expect(client).toContain("Use a mix");
    expect(client).not.toContain("demo");
    expect(client).toContain("Hide 3D model");
    expect(client).toContain("Use suggested value");
    expect(client).toContain("createThermalReviewWorkspace(jobId, initial = {})");
    expect(client).toContain("history.replaceState(null, \"\", next.pathname + next.search)");
    expect(client).not.toContain("sessionStorage");
    expect(client).toContain("workspace.setReviewMode(mode)");
    expect(client).toContain("workspace.setTarget(nextTarget)");
    expect(client).toContain("workspace.setDraft(field.dataset.requestedInputId, field.value, { source: \"manual\" })");
    expect(client).toContain("workspace.setDraft(button.dataset.libraryInputId, button.dataset.libraryValue, { source: \"material_library\"");
    expect(client).toContain("workspace.setFilter(button.dataset.actionFilter)");
    expect(client).toContain("workspace.setViewer(createdViewer)");
    expect(client).toContain("workspace.navigationUrl()");
    expect(client).toContain("actionDetail(active, job, allInputs, drafts, hasUnresolvedReview, reviewMode)");
    expect(client).toContain("job.review.projection && job.review.projection.decisions");
      expect(client).not.toContain("function normalizeMaterialName");
    expect(() => new Function(client)).not.toThrow();
  });

  it("keeps a recognized bilingual material in Review so the startup mode can prefill it", async () => {
    const root = join(tmpdir(), `m4-api-library-startup-${Date.now()}`);
    const recognized = workerCalculationInputEvidence();
    const layer = {
      layerIndex: 0,
      layerStepId: 8801,
      materialName: "Project_06_Contreplaqu\u00e9 trait\u00e9_18mm",
    };
    recognized.fixedInputs = recognized.fixedInputs.map((entry) => ({
      ...entry,
      value: entry.field === "layer_material_name" ? layer.materialName : entry.value,
      layer,
    }));
    recognized.missingInputs = recognized.missingInputs.map((entry) => ({ ...entry, layer }));
    const app = createLocalhostApp({
      databasePath: join(root, "data", "app.db"),
      storageRoot: join(root, "storage"),
      outputRoot: join(root, "outputs"),
      workerOverrides: { extractCalculationInputEvidence: async () => [recognized] },
    });
    try {
      app.server.listen(0, "127.0.0.1");
      await once(app.server, "listening");
      const baseUrl = boundUrl(app.server);
      const form = new FormData();
      form.set("ifc", new Blob(["ISO-10303-21; bilingual fixture; END-ISO-10303-21;"]), "fixture.ifc");

      const created = await postJson(`${baseUrl}/api/jobs`, form);
      const needsReview = await waitForJob(baseUrl, created.jobId, "needs_review");

      const requiredInputs = needsReview.review.requestedInputs.filter((input: any) => input.required !== false);
      expect(requiredInputs).toEqual([
        expect.objectContaining({
          datapoint: "layer_lambda",
          materialResolution: expect.objectContaining({
            status: "resolved",
            matchedMaterialKey: "plywood",
          }),
        }),
      ]);

      const selected = requiredInputs[0];
      await postJson(`${baseUrl}/api/jobs/${created.jobId}/review-inputs`, {
        inputs: [{
          requestedInputId: selected.requestedInputId,
          unit: selected.unit,
          overrideScope: selected.scope.scopeKind,
          materialLibraryKey: selected.materialResolution.matchedMaterialKey,
        }],
      });

      const completedWorkspace = await getJson(`${baseUrl}/api/jobs/${created.jobId}`);
      expect(completedWorkspace.architectActions.assemblies[0]).toEqual(expect.objectContaining({
        readinessState: "ready",
        evidenceState: expect.objectContaining({ status: "library_assisted" }),
      }));
      expect(completedWorkspace.architectActions.assemblies[0].layers[0]).toEqual(expect.objectContaining({
        materialLibraryKey: "plywood",
        datapointSources: expect.arrayContaining(["material_library"]),
      }));
    } finally {
      app.server.close();
      app.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("applies recognized Material Library decisions on the server when Library mode is submitted", async () => {
    const root = join(tmpdir(), `m4-api-library-mode-${Date.now()}`);
    const recognized = workerCalculationInputEvidence();
    const layer = {
      layerIndex: 0,
      layerStepId: 8801,
      materialName: "Project_06_Contreplaqu\u00e9 trait\u00e9_18mm",
    };
    recognized.fixedInputs = recognized.fixedInputs.map((entry) => ({
      ...entry,
      value: entry.field === "layer_material_name" ? layer.materialName : entry.value,
      layer,
    }));
    recognized.missingInputs = recognized.missingInputs.map((entry) => ({ ...entry, layer }));
    const app = createLocalhostApp({
      databasePath: join(root, "data", "app.db"),
      storageRoot: join(root, "storage"),
      outputRoot: join(root, "outputs"),
      workerOverrides: { extractCalculationInputEvidence: async () => [recognized] },
    });
    try {
      app.server.listen(0, "127.0.0.1");
      await once(app.server, "listening");
      const baseUrl = boundUrl(app.server);
      const form = new FormData();
      form.set("ifc", new Blob(["ISO-10303-21; bilingual fixture; END-ISO-10303-21;"]), "fixture.ifc");

      const created = await postJson(`${baseUrl}/api/jobs`, form);
      await waitForJob(baseUrl, created.jobId, "needs_review");

      const completed = await postJson(`${baseUrl}/api/jobs/${created.jobId}/review-inputs`, {
        reviewMode: "library",
        inputs: [],
      });

      expect(completed.jobStatus).toBe("completed");
      const revision = JSON.parse(await readFile(
        join(root, "outputs", created.jobId, "revisions", completed.revisionId + ".json"),
        "utf8",
      ));
      expect(revision.userInputs).toEqual([
        expect.objectContaining({
          value: 0.13,
          valueSource: "material_library",
          materialLibraryKey: "plywood",
        }),
      ]);
    } finally {
      app.server.close();
      app.close();
      await rm(root, { recursive: true, force: true });
    }
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
      expect(needsReview.architectActions.summary.needsReviewCount).toBe(1);
      expect(needsReview.architectActions.assemblies[0]).toEqual(expect.objectContaining({
        displayStepIds: [40],
        problem: "1 required input is still missing.",
        nextAction: expect.objectContaining({ kind: "resolve_input" }),
      }));
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
      await expect(appShellScript.text()).resolves.toContain("workspacePage");

      const submitted = await postJson(`${baseUrl}/api/jobs/${created.jobId}/review-inputs`, {
        assemblyGroupId: "ag_element_40",
        inputs: [
          {
            requestedInputId: needsReview.review.requestedInputs[0].requestedInputId,
            value: 0.99,
            unit: "W/mK",
            overrideScope: "assembly_group",
            materialLibraryKey: "mineral_wool",
          },
        ],
      });
      expect(submitted.jobStatus).toBe("completed");
      expect(submitted.revisionId).toMatch(/^rev_/);
      const completed = await getJson(`${baseUrl}/api/jobs/${created.jobId}?targetU=0.24`);
      expect(completed.architectActions.assemblies[0].layers[0].lambdaWPerMK).toBe(0.04);
      expect(completed.architectActions.assemblies[0]).toEqual(expect.objectContaining({
        readinessState: "ready",
        evidenceState: expect.objectContaining({ status: "library_assisted" }),
        performance: expect.objectContaining({ verdict: "misses_target" }),
      }));

      const report = await fetch(`${baseUrl}/api/jobs/${created.jobId}/report`);
      expect(report.status).toBe(200);
      await expect(report.text()).resolves.toContain("Thermal Calculation Report");
    } finally {
      app.server.close();
      app.close();
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
        join(root, "outputs", created.jobId, "evidence", "calculation-input-evidence.json"),
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
      app.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps strict Review submissions and allows opt-in partial calculation", async () => {
    const root = join(tmpdir(), `m4-api-all-decisions-${Date.now()}`);
    const first = workerCalculationInputEvidence();
    const second = workerCalculationInputEvidence();
    second.elementStepId = 99;
    second.elementGlobalId = "worker-wall-99";
    second.fixedInputs = second.fixedInputs.map((entry) => ({
      ...entry,
      value: entry.field === "layer_material_name" ? "Second insulation" : entry.value,
      evidenceReferences: entry.evidenceReferences.map((reference) => ({
        ...reference,
        evidencePath: reference.evidencePath.replaceAll("88", "99"),
        sourceStepIds: [99, 9901],
      })),
    }));
    second.missingInputs = second.missingInputs.map((entry) => ({
      ...entry,
      evidenceReferences: entry.evidenceReferences.map((reference) => ({
        ...reference,
        evidencePath: reference.evidencePath.replaceAll("88", "99"),
        sourceStepIds: [99, 9901],
      })),
    }));
    const app = createLocalhostApp({
      databasePath: join(root, "data", "app.db"),
      storageRoot: join(root, "storage"),
      outputRoot: join(root, "outputs"),
      workerOverrides: { extractCalculationInputEvidence: async () => [first, second] },
    });
    try {
      app.server.listen(0, "127.0.0.1");
      await once(app.server, "listening");
      const baseUrl = boundUrl(app.server);
      const form = new FormData();
      form.set("ifc", new Blob(["ISO-10303-21; fixture; END-ISO-10303-21;"]), "fixture.ifc");
      const created = await postJson(`${baseUrl}/api/jobs`, form);
      const needsReview = await waitForJob(baseUrl, created.jobId, "needs_review");
      expect(needsReview.review.requestedInputs).toHaveLength(2);

      const partial = await fetch(`${baseUrl}/api/jobs/${created.jobId}/review-inputs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputs: [{
            requestedInputId: needsReview.review.requestedInputs[0].requestedInputId,
            value: 0.04,
            unit: "W/mK",
            overrideScope: "layer_occurrence",
          }],
        }),
      });
      expect(partial.status).toBe(500);
      await expect(partial.json()).resolves.toEqual(expect.objectContaining({
        error: "All required Review inputs must be supplied before calculation.",
      }));
      expect((await getJson(`${baseUrl}/api/jobs/${created.jobId}`)).jobStatus).toBe("needs_review");

      const noInputCalculation = await postJson(`${baseUrl}/api/jobs/${created.jobId}/review-inputs`, {
        allowPartial: true,
        inputs: [],
      });
      expect(noInputCalculation).toEqual(expect.objectContaining({
        jobStatus: "needs_review",
        calculatedAssemblyCount: 0,
        skippedAssemblyCount: 2,
        unresolvedDecisionCount: 2,
      }));

      const partialCalculation = await postJson(`${baseUrl}/api/jobs/${created.jobId}/review-inputs`, {
        allowPartial: true,
        inputs: [{
          requestedInputId: needsReview.review.requestedInputs[0].requestedInputId,
          value: 0.04,
          unit: "W/mK",
          overrideScope: "layer_occurrence",
        }],
      });
      expect(partialCalculation).toEqual(expect.objectContaining({
        jobStatus: "needs_review",
        calculatedAssemblyCount: 1,
        skippedAssemblyCount: 1,
        unresolvedDecisionCount: 1,
      }));
      const partiallyCalculated = await getJson(`${baseUrl}/api/jobs/${created.jobId}`);
      expect(partiallyCalculated.review.projection.decisions.filter((decision: any) =>
        decision.required && decision.status === "pending"
      )).toHaveLength(1);

      const completed = await postJson(`${baseUrl}/api/jobs/${created.jobId}/review-inputs`, {
        inputs: needsReview.review.requestedInputs.map((input: any, index: number) => ({
          requestedInputId: input.requestedInputId,
          value: index === 0 ? 0.04 : 0.05,
          unit: input.unit,
          overrideScope: input.scope.scopeKind,
        })),
      });
      expect(completed.jobStatus).toBe("completed");

      const recalculated = await postJson(`${baseUrl}/api/jobs/${created.jobId}/review-inputs`, {
        inputs: [{
          requestedInputId: needsReview.review.requestedInputs[0].requestedInputId,
          value: 0.06,
          unit: needsReview.review.requestedInputs[0].unit,
          overrideScope: needsReview.review.requestedInputs[0].scope.scopeKind,
        }],
      });
      expect(recalculated.revisionId).not.toBe(completed.revisionId);
      const revised = JSON.parse(await readFile(
        join(root, "outputs", created.jobId, "revisions", recalculated.revisionId + ".json"),
        "utf8",
      ));
      expect(revised.parentRevisionId).toBe(completed.revisionId);
      expect(revised.userInputs).toHaveLength(2);
    } finally {
      app.server.close();
      app.close();
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
      app.close();
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
      app.close();
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
