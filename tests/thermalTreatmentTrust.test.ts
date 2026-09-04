import { describe, expect, it } from "vitest";
import { createThermalTreatmentFamilyRegistry } from "../src/domain/thermal-treatment/createThermalTreatmentFamilyRegistry.js";
import { runThermalTreatment } from "../src/domain/thermal-treatment/runThermalTreatment.js";
import type { ThermalTreatmentCalculationWorker, ThermalTreatmentFamily } from "../src/domain/thermal-treatment/thermalTreatmentTypes.js";
import { developmentReferenceThermalTreatmentFamilies } from "../src/development/thermal-treatment/referenceThermalTreatmentFamilies.js";

const validWorker: ThermalTreatmentCalculationWorker = {
  workerId: "reference-contract-worker",
  workerVersion: "1.0.0",
  async calculate() {
    return { effectiveUValueWPerM2K: 0.31, assumptions: [], provenance: [], validity: { isValid: true, diagnostics: [] } };
  },
};

const railFamily = developmentReferenceThermalTreatmentFamilies[0]!;

describe("Thermal Treatment versioned knowledge and trust", () => {
  it("downgrades an envelope-external case without losing its calculation record", async () => {
    const result = await runThermalTreatment({
      assemblyGroupId: "ag_outside_envelope",
      selection: { ...railFamily.identity, confirmedInputs: { railSpacingMm: 1700, railDepthMm: 100 } },
      registry: createThermalTreatmentFamilyRegistry([railFamily]),
      worker: validWorker,
    });

    expect(result.record).toMatchObject({
      trustState: "preliminary_unsafe_estimate",
      trustReasons: expect.arrayContaining([expect.objectContaining({ code: "outside_validation_envelope", inputKey: "railSpacingMm" })]),
      packVersions: { codeAdapterVersion: "1.0.0", knowledgePackVersion: "1.0.0", validationPackVersion: "1.0.0" },
    });
    expect(result.record.actionsRequiredForVerification).toEqual(expect.arrayContaining([expect.stringContaining("validated envelope")]));
  });

  it("downgrades a result when the worker validity check fails", async () => {
    const invalidWorker: ThermalTreatmentCalculationWorker = { ...validWorker, async calculate() { return { effectiveUValueWPerM2K: 0.31, assumptions: [], provenance: [], validity: { isValid: false, diagnostics: ["solver did not converge"] } }; } };
    const result = await runThermalTreatment({
      assemblyGroupId: "ag_invalid_worker",
      selection: { ...railFamily.identity, confirmedInputs: railFamily.referenceConfirmedInputs },
      registry: createThermalTreatmentFamilyRegistry([railFamily]),
      worker: invalidWorker,
    });

    expect(result.record.trustReasons).toContainEqual(expect.objectContaining({ code: "worker_invalid", message: "solver did not converge" }));
  });

  it("rejects malformed packs with an actionable registration diagnostic", () => {
    const malformed = { ...railFamily, packs: { ...railFamily.packs, validationPack: { ...railFamily.packs.validationPack, referenceCases: [] } } } satisfies ThermalTreatmentFamily;
    expect(() => createThermalTreatmentFamilyRegistry([malformed])).toThrow("validation pack requires at least one reference case");
  });

  it("retains the exact changed pack versions in a new historical result", async () => {
    const upgraded = {
      ...railFamily,
      packs: {
        ...railFamily.packs,
        knowledgePack: { ...railFamily.packs.knowledgePack, version: "2.0.0" },
        validationPack: { ...railFamily.packs.validationPack, version: "3.0.0" },
      },
    } satisfies ThermalTreatmentFamily;
    const result = await runThermalTreatment({
      assemblyGroupId: "ag_versioned",
      selection: { ...upgraded.identity, confirmedInputs: upgraded.referenceConfirmedInputs },
      registry: createThermalTreatmentFamilyRegistry([upgraded]),
      worker: validWorker,
    });

    expect(result.record.packVersions).toEqual({ codeAdapterVersion: "1.0.0", knowledgePackVersion: "2.0.0", validationPackVersion: "3.0.0" });
  });
});