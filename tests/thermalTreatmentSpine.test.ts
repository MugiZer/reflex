import { access, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createThermalTreatmentReportWorkflow } from "../src/application/thermal-treatment/runThermalTreatmentCalculationReport.js";
import { createThermalTreatmentFamilyRegistry } from "../src/domain/thermal-treatment/createThermalTreatmentFamilyRegistry.js";
import { calculateThermalPerformance } from "../src/domain/calculations/calculateThermalPerformance.js";
import type { ThermalTreatmentCalculationWorker, ThermalTreatmentFamily } from "../src/domain/thermal-treatment/thermalTreatmentTypes.js";

const syntheticFamily: ThermalTreatmentFamily = {
  identity: { familyId: "synthetic-development", familyVersion: "1.0.0" },
  trustState: "preliminary",
  requiredInputs: () => [{ key: "multiplier", label: "Synthetic multiplier", required: true }],
  validateConfirmedInputs: ({ confirmedInputs }) => typeof confirmedInputs.multiplier === "number" && confirmedInputs.multiplier > 0 ? [] : [{ inputKey: "multiplier", message: "Synthetic multiplier must be positive." }],
  buildAnalysisModel: ({ assemblyGroupId, confirmedInputs }) => ({ assemblyGroupId, treatmentFamily: { familyId: "synthetic-development", familyVersion: "1.0.0" }, confirmedInputs, model: { multiplier: confirmedInputs.multiplier }, assumptions: ["Synthetic family assumption."], provenance: ["Synthetic family provenance."] }),
};
const fakeWorker: ThermalTreatmentCalculationWorker = { workerId: "fake-worker", workerVersion: "1.0.0", async calculate({ analysisModel }) { return { effectiveUValueWPerM2K: 0.42 * Number(analysisModel.model.multiplier), assumptions: ["Fake worker assumption."], provenance: ["Fake worker provenance."] }; } };

describe("Generic Thermal Treatment spine", () => {
  it("persists a selected family calculation and renders it in the Report", async () => {
    const outputRoot = join(tmpdir(), `thermal-treatment-${Date.now()}`);
    try {
      const workflow = createThermalTreatmentReportWorkflow({ outputRoot, registry: createThermalTreatmentFamilyRegistry([syntheticFamily]), worker: fakeWorker, now: new Date("2026-07-22T12:00:00.000Z") });
      const result = await workflow.run({ fileHash: "fixture-hash", jobId: "job_thermal", assemblyGroup: { assemblyGroupId: "ag_thermal", thermalTreatmentSelection: { familyId: "synthetic-development", familyVersion: "1.0.0", confirmedInputs: { multiplier: 2 } } }, baselineSnapshot: baselineSnapshot() });
      expect(result.calculationSnapshot.uValueWPerM2K).toBeCloseTo(0.84);
      expect(result.revision.calculationSnapshots[0]?.thermalTreatment).toMatchObject({ selection: { familyId: "synthetic-development" }, trustState: "preliminary", worker: { workerId: "fake-worker" }, confirmedInputs: { multiplier: 2 } });
      await expect(readFile(result.revisionFilePath, "utf8")).resolves.toContain("synthetic-development");
      await expect(readFile(result.reportFilePath, "utf8")).resolves.toContain("Thermal Treatment");
    } finally { await rm(outputRoot, { recursive: true, force: true }); }
  });
  it("rejects invalid confirmed inputs before calling the worker", async () => {
    const workflow = createThermalTreatmentReportWorkflow({ outputRoot: join(tmpdir(), "thermal-treatment-invalid"), registry: createThermalTreatmentFamilyRegistry([syntheticFamily]), worker: fakeWorker });
    await expect(workflow.run({ fileHash: "fixture", jobId: "job_invalid", assemblyGroup: { assemblyGroupId: "ag_invalid", thermalTreatmentSelection: { familyId: "synthetic-development", familyVersion: "1.0.0", confirmedInputs: { multiplier: 0 } } }, baselineSnapshot: baselineSnapshot() })).rejects.toThrow("Synthetic multiplier must be positive");
  });
  it("surfaces a worker failure without creating a revision", async () => {
    const outputRoot = join(tmpdir(), `thermal-treatment-failure-${Date.now()}`);
    const failingWorker: ThermalTreatmentCalculationWorker = { ...fakeWorker, async calculate() { throw new Error("worker unavailable"); } };
    const workflow = createThermalTreatmentReportWorkflow({ outputRoot, registry: createThermalTreatmentFamilyRegistry([syntheticFamily]), worker: failingWorker });
    await expect(workflow.run({ fileHash: "fixture", jobId: "job_failure", assemblyGroup: { assemblyGroupId: "ag_failure", thermalTreatmentSelection: { familyId: "synthetic-development", familyVersion: "1.0.0", confirmedInputs: { multiplier: 1 } } }, baselineSnapshot: baselineSnapshot() })).rejects.toThrow("worker unavailable");
    await expect(access(join(outputRoot, "job_failure", "revisions"))).rejects.toThrow();
  });
  it("keeps the layer-only calculation unchanged when no selection is used", () => {
    expect(baselineSnapshot().thermalTreatment).toBeUndefined();
    expect(baselineSnapshot().uValueWPerM2K).toBeCloseTo(0.315);
  });
});
function baselineSnapshot() {
  return calculateThermalPerformance({ physicsAssembly: { assemblyGroupId: "ag_layer_only", elementClass: "IfcWall", calculationBasis: "extracted_layered", confidence: "high", surfaceResistanceProfile: { profileId: "external_wall_vertical", rsi: 0.13, rse: 0.04, sourceLabel: "test", assumptions: [] }, layers: [{ layerOccurrenceId: "layer_1", materialName: "Mineral wool", thicknessM: 0.12, lambdaWPerMK: 0.04, datapointSources: ["ifc_extracted"], provenance: ["IfcMaterialLayer#1"] }] } }).calculationSnapshot;
}
