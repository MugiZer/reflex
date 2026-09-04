import { mkdtemp, readFile, rm } from "node:fs/promises";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createThermalTreatmentReportWorkflow } from "../src/application/thermal-treatment/runThermalTreatmentCalculationReport.js";
import { createLocalhostApp } from "../src/app/http/httpServer.js";
import { disableGeneratedThermalTreatmentFamily, generateContinuousZGirtFamilyFromStoredDataset, qualifyGeneratedThermalTreatmentFamily } from "../src/application/thermal-treatment/qualifyGeneratedThermalTreatmentFamily.js";
import { calculateThermalPerformance } from "../src/domain/calculations/calculateThermalPerformance.js";
import { createThermalTreatmentFamilyRegistry } from "../src/domain/thermal-treatment/createThermalTreatmentFamilyRegistry.js";
import { referenceConfirmedInputs } from "../src/domain/thermal-treatment/families/continuousZGirtFamily.js";
import type { ThermalTreatmentCalculationWorker } from "../src/domain/thermal-treatment/thermalTreatmentTypes.js";
import { LocalThermalTreatmentDatasetStore } from "../src/infrastructure/thermal-treatment/LocalThermalTreatmentDatasetStore.js";
import { LocalThermalTreatmentQualificationOracleStore } from "../src/infrastructure/thermal-treatment/LocalThermalTreatmentQualificationOracleStore.js";
import { OpenSource2dCalculationWorker } from "../src/infrastructure/thermal-treatment/OpenSource2dCalculationWorker.js";

describe("generated Thermal Treatment family qualification", () => {
  it("qualifies a stored, versioned Z-girt dataset with an independent reference pack before publishing its IFC Revision and Report", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "conformity-generated-family-"));
    try {
      const datasets = new LocalThermalTreatmentDatasetStore({ rootDirectory: join(outputRoot, "datasets") });
      const oracles = new LocalThermalTreatmentQualificationOracleStore({ rootDirectory: join(outputRoot, "oracles") });
      const dataset = await datasets.store({
        datasetId: "z-girt-source-data",
        datasetVersion: "2026.08",
        content: { familyTemplate: "continuous-z-girt", source: "founder-reviewed schedule" },
        sourceCitation: "Founder-reviewed Z-girt schedule, drawing A-402",
        acquiredAt: "2026-08-12",
        licensingUsageStatus: "project-authorized",
      });
      const oracle = await oracles.store({ oracleId: "reviewed-z-girt-oracle", oracleVersion: "2026.08", sourceCitation: "Independent reviewed numerical reference, case ZG-1", acquiredAt: "2026-08-12", licensingUsageStatus: "project-authorized", referenceCases: [{ caseId: "independent-z-girt-reference-v1", expectedEffectiveUValueWPerM2K: 0.254, toleranceWPerM2K: 0.01 }] });
      const reloadedDatasets = new LocalThermalTreatmentDatasetStore({ rootDirectory: join(outputRoot, "datasets") });
      const reloadedOracles = new LocalThermalTreatmentQualificationOracleStore({ rootDirectory: join(outputRoot, "oracles") });
      const candidate = await generateContinuousZGirtFamilyFromStoredDataset({
        datasets: reloadedDatasets,
        dataset: { datasetId: dataset.datasetId, datasetVersion: dataset.datasetVersion },
        oracles: reloadedOracles,
        oracle: { oracleId: oracle.oracleId, oracleVersion: oracle.oracleVersion },
        generator: { generatorId: "conformity-family-generator", generatorVersion: "1.0.0" },
      });

      expect(createThermalTreatmentFamilyRegistry([candidate]).availableFamilies()).toEqual([]);

      const worker = new OpenSource2dCalculationWorker({ artifactRoot: join(outputRoot, "worker") });
      const qualified = await qualifyGeneratedThermalTreatmentFamily({ candidate, worker, now: new Date("2026-08-12T12:00:00.000Z") });
      expect(qualified.qualification).toMatchObject({ decision: "go", dataset: { datasetId: dataset.datasetId, contentHash: dataset.contentHash } });

      const workflow = createThermalTreatmentReportWorkflow({
        outputRoot,
        registry: createThermalTreatmentFamilyRegistry([qualified]),
        worker,
        now: new Date("2026-08-12T12:01:00.000Z"),
      });
      const result = await workflow.run({
        fileHash: "real-ifc-fixture",
        jobId: "job_generatedzgirt",
        assemblyGroup: { assemblyGroupId: "ifc-wall-101", thermalTreatmentSelection: { ...qualified.identity, confirmedInputs: referenceConfirmedInputs } },
        baselineSnapshot: baselineSnapshot(),
      });

      expect(result.revision.calculationSnapshots[0]?.thermalTreatment).toMatchObject({
        trustState: "verified",
        generation: { dataset: { datasetId: dataset.datasetId, datasetVersion: dataset.datasetVersion, contentHash: dataset.contentHash }, generator: { generatorId: "conformity-family-generator", generatorVersion: "1.0.0" } },
        qualification: { decision: "go", validationPackVersion: "1.0.0-qualified-z-girt-reference", oracle: { oracleId: oracle.oracleId, contentHash: oracle.contentHash }, worker: { workerId: worker.workerId, workerVersion: worker.workerVersion } },
      });
      await expect(readFile(result.reportFilePath, "utf8")).resolves.toContain(dataset.contentHash);
      await expect(readFile(result.reportFilePath, "utf8")).resolves.toContain("Qualification");
      await expect(readFile(result.reportFilePath, "utf8")).resolves.toContain(oracle.contentHash);
      await expect(readFile(result.reportFilePath, "utf8")).resolves.toContain("Supported envelope");
      const disabled = disableGeneratedThermalTreatmentFamily({ family: qualified, reason: "Reference case was superseded.", now: new Date("2026-08-13T00:00:00.000Z") });
      expect(createThermalTreatmentFamilyRegistry([disabled]).availableFamilies()).toEqual([]);
      expect(result.revision.calculationSnapshots[0]?.thermalTreatment?.qualification?.decision).toBe("go");
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });

  it("keeps a candidate disabled when its independent expectation is corrupted or its worker is incompatible", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "conformity-generated-family-no-go-"));
    try {
      const datasets = new LocalThermalTreatmentDatasetStore({ rootDirectory: join(outputRoot, "datasets") });
      const oracles = new LocalThermalTreatmentQualificationOracleStore({ rootDirectory: join(outputRoot, "oracles") });
      const dataset = await datasets.store({ datasetId: "z-girt-source-data", datasetVersion: "2026.08", content: { familyTemplate: "continuous-z-girt" }, sourceCitation: "drawing A-402", acquiredAt: "2026-08-12", licensingUsageStatus: "project-authorized" });
      const oracle = await oracles.store({ oracleId: "reviewed-z-girt-oracle", oracleVersion: "2026.08", sourceCitation: "Independent reviewed numerical reference, case ZG-1", acquiredAt: "2026-08-12", licensingUsageStatus: "project-authorized", referenceCases: [{ caseId: "independent-z-girt-reference-v1", expectedEffectiveUValueWPerM2K: 0.254, toleranceWPerM2K: 0.01 }] });
      const candidate = await generateContinuousZGirtFamilyFromStoredDataset({ datasets, dataset, oracles, oracle, generator: { generatorId: "conformity-family-generator", generatorVersion: "1.0.0" } });
      const corruptedExpectation = {
        ...candidate,
        packs: { ...candidate.packs, validationPack: { ...candidate.packs.validationPack, referenceCases: candidate.packs.validationPack.referenceCases.map((item) => ({ ...item, expectedEffectiveUValueWPerM2K: 0.01 })) } },
      };
      const worker = new OpenSource2dCalculationWorker({ artifactRoot: join(outputRoot, "worker") });
      const noGo = await qualifyGeneratedThermalTreatmentFamily({ candidate: corruptedExpectation, worker });
      expect(noGo.qualification.decision).toBe("no-go");
      expect(noGo.qualification.reasons.join(" ")).toMatch(/tolerance/i);
      expect(createThermalTreatmentFamilyRegistry([noGo]).availableFamilies()).toEqual([]);
      const incompatibleWorker: ThermalTreatmentCalculationWorker = { workerId: "fake-worker", workerVersion: "1.0.0", async calculate() { return { effectiveUValueWPerM2K: 0.55, assumptions: [], provenance: [], validity: { isValid: true, diagnostics: [] } }; } };
      await expect(qualifyGeneratedThermalTreatmentFamily({ candidate, worker: incompatibleWorker })).resolves.toMatchObject({ qualification: { decision: "no-go", reasons: [expect.stringMatching(/not declared compatible/i)] } });
      expect(candidate.qualification.decision).toBe("candidate");
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });

  it("takes a stored IFC upload through the real HTTP report route using the qualified generated registry", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "conformity-generated-family-http-"));
    const datasets = new LocalThermalTreatmentDatasetStore({ rootDirectory: join(outputRoot, "datasets") });
    const oracles = new LocalThermalTreatmentQualificationOracleStore({ rootDirectory: join(outputRoot, "oracles") });
    try {
      const dataset = await datasets.store({ datasetId: "z-girt-source-data", datasetVersion: "2026.08", content: { familyTemplate: "continuous-z-girt" }, sourceCitation: "drawing A-402", acquiredAt: "2026-08-12", licensingUsageStatus: "project-authorized" });
      const oracle = await oracles.store({ oracleId: "reviewed-z-girt-oracle", oracleVersion: "2026.08", sourceCitation: "Independent reviewed numerical reference, case ZG-1", acquiredAt: "2026-08-12", licensingUsageStatus: "project-authorized", referenceCases: [{ caseId: "independent-z-girt-reference-v1", expectedEffectiveUValueWPerM2K: 0.254, toleranceWPerM2K: 0.01 }] });
      const candidate = await generateContinuousZGirtFamilyFromStoredDataset({ datasets, dataset, oracles, oracle, generator: { generatorId: "conformity-family-generator", generatorVersion: "1.0.0" } });
      const worker = new OpenSource2dCalculationWorker({ artifactRoot: join(outputRoot, "qualification-worker") });
      const qualified = await qualifyGeneratedThermalTreatmentFamily({ candidate, worker });
      const app = createLocalhostApp({
        databasePath: join(outputRoot, "data", "app.db"), storageRoot: join(outputRoot, "storage"), outputRoot,
        thermalTreatmentRegistry: createThermalTreatmentFamilyRegistry([qualified]),
        workerOverrides: { extractCalculationInputEvidence: async () => [zGirtIfcEvidence()] },
      });
      try {
        app.server.listen(0, "127.0.0.1");
        await once(app.server, "listening");
        const address = app.server.address();
        if (!address || typeof address === "string") throw new Error("Server is not bound.");
        const baseUrl = `http://127.0.0.1:${address.port}`;
        const form = new FormData();
        form.set("ifc", new Blob(["ISO-10303-21; real IFC upload boundary; END-ISO-10303-21;"]), "real-z-girt.ifc");
        const created = await json(`${baseUrl}/api/jobs`, form);
        const completed = await waitForJob(baseUrl, created.jobId, "completed");
        const workspace = await json(`${baseUrl}/api/jobs/${created.jobId}`);
        const card = workspace.thermalTreatmentCards[0];
        expect(card.family.familyId).toBe(qualified.identity.familyId);
        await json(`${baseUrl}/api/jobs/${created.jobId}/thermal-treatment`, {
          suggestionId: card.suggestionId, thermalConstructionSignature: card.thermalConstructionSignature, familyId: qualified.identity.familyId, familyVersion: qualified.identity.familyVersion, assemblyGroupId: card.assemblyGroupIds[0], inputs: referenceConfirmedInputs,
        });
        const report = await fetch(`${baseUrl}/api/jobs/${created.jobId}/report`);
        expect(report.status).toBe(200);
        await expect(report.text()).resolves.toContain(oracle.contentHash);
        expect(completed.jobStatus).toBe("completed");
      } finally { app.server.close(); app.close(); }
    } finally { await rm(outputRoot, { recursive: true, force: true }); }
  });
});

function baselineSnapshot() {
  return calculateThermalPerformance({ physicsAssembly: { assemblyGroupId: "ifc-wall-101", elementClass: "IfcWall", calculationBasis: "extracted_layered", confidence: "high", surfaceResistanceProfile: { profileId: "external_wall_vertical", rsi: 0.13, rse: 0.04, sourceLabel: "test", assumptions: [] }, layers: [{ layerOccurrenceId: "insulation", materialName: "Mineral wool", thicknessM: 0.14, lambdaWPerMK: 0.04, datapointSources: ["ifc_extracted"], provenance: ["IfcMaterialLayer#1"] }] } }).calculationSnapshot;
}
function zGirtIfcEvidence() {
  const layers = [{ materialName: "Gypsum board", thickness: 0.013, lambda: 0.16 }, { materialName: "Z fixation", thickness: 0.14, lambda: 0.04 }, { materialName: "Sheathing", thickness: 0.012, lambda: 0.2 }];
  return {
    elementStepId: 101, elementGlobalId: "real-ifc-wall-101", elementName: "Real IFC exterior wall", elementClass: "IfcWall" as const, calculationInputBasis: "layered_ifc_complete" as const,
    fixedInputs: layers.flatMap((layer, layerIndex) => [
      evidence("layer_material_name", layer.materialName, layerIndex), evidence("layer_thickness", layer.thickness, layerIndex), evidence("layer_lambda", layer.lambda, layerIndex),
    ]), candidateInputs: [], missingInputs: [], diagnostics: [],
  };
}
function evidence(field: "layer_material_name" | "layer_thickness" | "layer_lambda", value: string | number, layerIndex: number) {
  const materialName = ["Gypsum board", "Z fixation", "Sheathing"][layerIndex]!;
  return { field, value, source: "ifc_fixed" as const, confidence: "high" as const, evidenceReferences: [{ evidencePath: `IfcWall#101 -> IfcMaterialLayer#${110 + layerIndex}`, sourceStepIds: [101, 110 + layerIndex], pathParts: [] }], reason: "Recovered from stored IFC upload.", layer: { layerIndex, layerStepId: 110 + layerIndex, materialName }, entrySources: [] };
}
async function json(url: string, body?: unknown): Promise<any> {
  const response = await fetch(url, body instanceof FormData ? { method: "POST", body } : body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? response.statusText);
  return value;
}
async function waitForJob(baseUrl: string, jobId: string, status: string): Promise<any> {
  for (let attempt = 0; attempt < 50; attempt += 1) { const job = await json(`${baseUrl}/api/jobs/${jobId}`); if (job.jobStatus === status) return job; await new Promise((resolve) => setTimeout(resolve, 30)); }
  throw new Error(`Timed out waiting for ${status}.`);
}
