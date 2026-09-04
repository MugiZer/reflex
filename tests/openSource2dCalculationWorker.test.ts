import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OpenSource2dCalculationWorker } from "../src/infrastructure/thermal-treatment/OpenSource2dCalculationWorker.js";
import { developmentReferenceThermalTreatmentFamilies } from "../src/development/thermal-treatment/referenceThermalTreatmentFamilies.js";
import type { ThermalTreatmentAnalysisModel } from "../src/domain/thermal-treatment/thermalTreatmentTypes.js";

function model(model: ThermalTreatmentAnalysisModel["model"]["twoDimensionalThermalModel"]): ThermalTreatmentAnalysisModel {
  return {
    assemblyGroupId: "ag_2d",
    treatmentFamily: { familyId: "generic-reference", familyVersion: "1.0.0" },
    confirmedInputs: {},
    model: { twoDimensionalThermalModel: model! },
    assumptions: [],
    provenance: [],
  };
}

const controls = { maxCellSizeM: 0.02, refinementLevels: 2, convergenceToleranceRelative: 0.005, maxIterations: 50_000, timeoutMilliseconds: 2_000 };

describe("OpenSource2dCalculationWorker", () => {
  it("returns the known U-value for a homogeneous slab and durable reproducibility artifacts", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "conformity-2d-worker-"));
    try {
      const worker = new OpenSource2dCalculationWorker({ artifactRoot });
      const result = await worker.calculate({ analysisModel: model({
        domain: { widthM: 0.1, heightM: 0.1 },
        regions: [{ regionId: "slab", xMinM: 0, xMaxM: 0.1, yMinM: 0, yMaxM: 0.1, conductivityWPerMK: 0.04 }],
        boundaries: [
          { boundaryId: "inside", edge: "left", kind: "temperature", temperatureK: 293.15 },
          { boundaryId: "outside", edge: "right", kind: "temperature", temperatureK: 273.15 },
        ],
        periodicEdges: ["top", "bottom"],
        solverControls: controls,
      }) });

      expect(result.effectiveUValueWPerM2K).toBeCloseTo(0.4, 2);
      expect(result.validity).toEqual({ isValid: true, diagnostics: [] });
      expect(result.numericalResult).toMatchObject({ totalHeatFlowWPerM: expect.any(Number), convergence: { passed: true } });
      expect(result.artifactReferences).toHaveLength(2);
      expect(JSON.parse(await readFile(result.artifactReferences![0]!, "utf8"))).toMatchObject({ model: { twoDimensionalThermalModel: expect.any(Object) } });
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  it("uses mesh refinement for a layered reference model", async () => {
    const worker = new OpenSource2dCalculationWorker();
    const result = await worker.calculate({ analysisModel: model({
      domain: { widthM: 0.1, heightM: 0.1 },
      regions: [
        { regionId: "insulation", xMinM: 0, xMaxM: 0.08, yMinM: 0, yMaxM: 0.1, conductivityWPerMK: 0.04 },
        { regionId: "board", xMinM: 0.08, xMaxM: 0.1, yMinM: 0, yMaxM: 0.1, conductivityWPerMK: 0.2 },
      ],
      boundaries: [
        { boundaryId: "inside", edge: "left", kind: "temperature", temperatureK: 293.15 },
        { boundaryId: "outside", edge: "right", kind: "temperature", temperatureK: 273.15 },
      ],
      periodicEdges: ["top", "bottom"],
      solverControls: controls,
    }) });

    // Independent series-resistance solution: 1 / (0.08/0.04 + 0.02/0.2) = 0.47619 W/m2K.
    expect(result.effectiveUValueWPerM2K).toBeCloseTo(0.47619, 2);
    expect(result.numericalResult?.convergence).toMatchObject({ passed: true, refinementLevels: 2 });
  });

  it("solves models emitted by both development reference adapters without family branching", async () => {
    const worker = new OpenSource2dCalculationWorker();
    for (const family of developmentReferenceThermalTreatmentFamilies) {
      const result = await worker.calculate({ analysisModel: family.buildAnalysisModel({ assemblyGroupId: family.identity.familyId, confirmedInputs: family.referenceConfirmedInputs }) });
      expect(result.validity).toEqual({ isValid: true, diagnostics: [] });
    }
  });

  it("fails safely with actionable diagnostics for invalid geometry and a timed-out solve", async () => {
    const worker = new OpenSource2dCalculationWorker();
    const invalid = await worker.calculate({ analysisModel: model({
      domain: { widthM: 0.1, heightM: 0.1 },
      regions: [{ regionId: "partial", xMinM: 0, xMaxM: 0.05, yMinM: 0, yMaxM: 0.1, conductivityWPerMK: 0.04 }],
      boundaries: [
        { boundaryId: "inside", edge: "left", kind: "temperature", temperatureK: 293.15 },
        { boundaryId: "outside", edge: "right", kind: "temperature", temperatureK: 273.15 },
      ], periodicEdges: ["top", "bottom"], solverControls: controls,
    }) });
    expect(invalid.validity).toMatchObject({ isValid: false, diagnostics: [expect.stringMatching(/uncovered/i)] });

    const timedOut = await worker.calculate({ analysisModel: model({
      domain: { widthM: 0.1, heightM: 0.1 },
      regions: [{ regionId: "slab", xMinM: 0, xMaxM: 0.1, yMinM: 0, yMaxM: 0.1, conductivityWPerMK: 0.04 }],
      boundaries: [
        { boundaryId: "inside", edge: "left", kind: "temperature", temperatureK: 293.15 },
        { boundaryId: "outside", edge: "right", kind: "temperature", temperatureK: 273.15 },
      ],
      periodicEdges: ["top", "bottom"],
      solverControls: { ...controls, timeoutMilliseconds: 0 },
    }) });
    expect(timedOut.validity).toMatchObject({ isValid: false, diagnostics: [expect.stringMatching(/timed out/i)] });
  });
});


