import { once } from "node:events";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createLocalhostApp } from "../src/app/http/httpServer.js";
import { syntheticMilestone4CalculationInputEvidence } from "../src/application/jobs/syntheticMilestone4Fixture.js";
import type { CalculationInputEvidence } from "../src/domain/evidence/calculationInputEvidenceTypes.js";
import { defaultMaterialLibraryV1 } from "../src/domain/materials/library.v1.js";
import { planRequestedInputs } from "../src/domain/review/planRequestedInputs.js";

describe("Review workflow regressions", () => {
  it("does not parse in-progress evidence artifacts while the browser polls", async () => {
    const root = join(tmpdir(), `review-processing-read-${Date.now()}`);
    let finishExtraction!: () => void;
    const extractionGate = new Promise<void>((resolve) => {
      finishExtraction = resolve;
    });
    let createdJobId: string | null = null;
    const app = createLocalhostApp({
      databasePath: join(root, "data", "app.db"),
      storageRoot: join(root, "storage"),
      outputRoot: join(root, "outputs"),
      workerOverrides: {
        extractCalculationInputEvidence: async () => {
          await extractionGate;
          return [syntheticMilestone4CalculationInputEvidence()];
        },
      },
    });
    try {
      app.server.listen(0, "127.0.0.1");
      await once(app.server, "listening");
      const baseUrl = boundUrl(app.server);
      const form = new FormData();
      form.set("ifc", new Blob(["ISO-10303-21; fixture; END-ISO-10303-21;"]), "fixture.ifc");

      const created = await postJson(`${baseUrl}/api/jobs`, form);
      createdJobId = created.jobId;
      await waitForStoredStatus(app, created.jobId, "processing");
      const evidenceDirectory = join(root, "outputs", created.jobId, "evidence");
      await mkdir(evidenceDirectory, { recursive: true });
      await writeFile(join(evidenceDirectory, "calculation-input-evidence.json"), "{", "utf8");

      const response = await fetch(`${baseUrl}/api/jobs/${created.jobId}`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual(expect.objectContaining({
        jobStatus: "processing",
        review: null,
      }));
    } finally {
      finishExtraction();
      if (createdJobId !== null) {
        await waitForStoredStatus(app, createdJobId, "needs_review");
      }
      app.server.close();
      app.jobs.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps exact library matches actionable when another layer needs special physics", () => {
    const evidence = layeredEvidenceWithConcreteAndAir();

    const requestedInputs = planRequestedInputs({
      calculationInputEvidence: [evidence],
      materialLibrary: defaultMaterialLibraryV1,
      deferResolvedMaterialsToReview: true,
    }).requestedInputs;

    expect(requestedInputs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reviewGroupKind: "material_decision",
        materialResolution: expect.objectContaining({
          status: "resolved",
          matchedMaterialKey: "concrete",
        }),
      }),
    ]));
  });
});

function layeredEvidenceWithConcreteAndAir(): CalculationInputEvidence {
  const concrete = { layerIndex: 0, layerStepId: 301, materialName: "B\u00e9ton, coul\u00e9 sur place" };
  const air = { layerIndex: 1, layerStepId: 302, materialName: "LMA 07 Espacement air" };
  return {
    elementStepId: 10,
    elementGlobalId: "wall-10",
    elementClass: "IfcSlab",
    calculationInputBasis: "layered_needs_material_resolution",
    fixedInputs: [
      calculationInput("layer_order", [301, 302]),
      calculationInput("layer_thickness", 0.2, concrete),
      calculationInput("layer_material_name", concrete.materialName, concrete),
      calculationInput("layer_thickness", 0.02, air),
      calculationInput("layer_material_name", air.materialName, air),
    ],
    candidateInputs: [],
    missingInputs: [
      calculationInput("layer_lambda", null, concrete, "missing"),
      calculationInput("layer_lambda", null, air, "missing"),
    ],
    diagnostics: [],
  };
}

function calculationInput(
  field: CalculationInputEvidence["fixedInputs"][number]["field"],
  value: unknown,
  layer?: { layerIndex: number; layerStepId: number; materialName: string },
  source: "ifc_fixed" | "missing" = "ifc_fixed",
): CalculationInputEvidence["fixedInputs"][number] {
  return {
    field,
    value,
    source,
    confidence: source === "missing" ? "low" : "high",
    evidenceReferences: [{
      evidencePath: `IfcWall#10 -> IfcMaterialLayer#${layer?.layerStepId ?? 301}`,
      sourceStepIds: [10, layer?.layerStepId ?? 301],
      pathParts: [{ stepId: 10, entityClass: "IfcWall" }],
    }],
    reason: "Regression fixture.",
    ...(layer === undefined ? {} : { layer }),
  };
}

function boundUrl(server: { address(): ReturnType<import("node:http").Server["address"]> }): string {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Server is not bound.");
  return `http://127.0.0.1:${address.port}`;
}

async function postJson(url: string, body: FormData): Promise<any> {
  const response = await fetch(url, { method: "POST", body });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? response.statusText);
  return value;
}

async function waitForStoredStatus(
  app: ReturnType<typeof createLocalhostApp>,
  jobId: string,
  jobStatus: string,
): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (app.jobs.getJob(jobId)?.jobStatus === jobStatus) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for stored ${jobStatus}.`);
}
