import { describe, expect, it } from "vitest";
import { runThermalTreatment } from "../src/domain/thermal-treatment/runThermalTreatment.js";
import type { ThermalTreatmentCalculationWorker } from "../src/domain/thermal-treatment/thermalTreatmentTypes.js";
import {
  developmentReferenceThermalTreatmentFamilies,
  developmentReferenceThermalTreatmentRegistry,
  type DevelopmentReferenceThermalTreatmentFamily,
} from "../src/development/thermal-treatment/referenceThermalTreatmentFamilies.js";

const receivedAnalysisModels: unknown[] = [];

const fakeWorker: ThermalTreatmentCalculationWorker = {
  workerId: "reference-contract-worker",
  workerVersion: "1.0.0",
  async calculate({ analysisModel }) {
    receivedAnalysisModels.push(analysisModel);
    return {
      effectiveUValueWPerM2K: 0.31,
      assumptions: ["Deterministic reference worker."],
      provenance: ["Reference worker contract fixture."],
    };
  },
};

describe("development reference Thermal Treatment family contract", () => {
  it("keeps the two adapters discoverable only through the development registry", () => {
    expect(developmentReferenceThermalTreatmentRegistry.availableFamilies()).toEqual(
      developmentReferenceThermalTreatmentFamilies,
    );
    expect(developmentReferenceThermalTreatmentFamilies.every((family) => family.developmentOnly)).toBe(true);
  });

  for (const family of developmentReferenceThermalTreatmentFamilies) {
    runFamilyContractSuite(family);
  }

  it("keeps matching evidence and generated model topology distinct between adapters", () => {
    const [railFamily, studFamily] = developmentReferenceThermalTreatmentFamilies;
    expect(railFamily.matchingEvidence).not.toEqual(studFamily.matchingEvidence);
    expect(railFamily.requiredInputs().map((input) => input.key)).not.toEqual(studFamily.requiredInputs().map((input) => input.key));

    expect(railFamily.buildAnalysisModel({ assemblyGroupId: "ag_rail", confirmedInputs: validInputsFor(railFamily) }).model).toHaveProperty("rail");
    expect(studFamily.buildAnalysisModel({ assemblyGroupId: "ag_stud", confirmedInputs: validInputsFor(studFamily) }).model).toHaveProperty("stud");
  });
});

function runFamilyContractSuite(family: DevelopmentReferenceThermalTreatmentFamily): void {
  describe(`${family.identity.familyId} reference adapter`, () => {
    it("runs through the generic kernel with its own confirmed inputs and model", async () => {
      receivedAnalysisModels.length = 0;
      const result = await runThermalTreatment({
        assemblyGroupId: "ag_reference",
        selection: { ...family.identity, confirmedInputs: validInputsFor(family) },
        registry: developmentReferenceThermalTreatmentRegistry,
        worker: fakeWorker,
        now: new Date("2026-07-22T12:00:00.000Z"),
      });

      expect(result.record.selection).toMatchObject(family.identity);
      expect(result.record.confirmedInputs).toEqual(validInputsFor(family));
      expect(result.record.assumptions).toContain("Deterministic reference worker.");
      expect(result.record.provenance).toEqual(expect.arrayContaining(["Reference worker contract fixture.", expect.stringMatching(/^Development reference /)]));
      expect(receivedAnalysisModels).toHaveLength(1);
      expect(receivedAnalysisModels[0]).toMatchObject({ treatmentFamily: family.identity });
    });

    it("rejects invalid adapter inputs before the worker runs", async () => {
      receivedAnalysisModels.length = 0;
      await expect(runThermalTreatment({
        assemblyGroupId: "ag_reference_invalid",
        selection: { ...family.identity, confirmedInputs: invalidInputsFor(family) },
        registry: developmentReferenceThermalTreatmentRegistry,
        worker: fakeWorker,
      })).rejects.toThrow("Thermal Treatment inputs are invalid:");
      expect(receivedAnalysisModels).toHaveLength(0);
    });
  });
}

function validInputsFor(family: DevelopmentReferenceThermalTreatmentFamily): Record<string, number> {
  return family.referenceConfirmedInputs;
}

function invalidInputsFor(family: DevelopmentReferenceThermalTreatmentFamily): Record<string, number> {
  return Object.fromEntries(family.requiredInputs().map((input) => [input.key, 0]));
}
