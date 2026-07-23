import { assertValidThermalTreatmentPacks, evaluateThermalTreatmentTrust } from "./evaluateThermalTreatmentTrust.js";
import type { ThermalTreatmentCalculationWorker, ThermalTreatmentFamilyRegistry, ThermalTreatmentRecord, ThermalTreatmentSelection, ThermalTreatmentWorkerResult } from "./thermalTreatmentTypes.js";

export type RunThermalTreatmentResult = { result: ThermalTreatmentWorkerResult; record: ThermalTreatmentRecord };

/** Coordinates generic pack validation, family model construction, worker execution, and trust assignment. */
export async function runThermalTreatment(command: {
  assemblyGroupId: string;
  selection: ThermalTreatmentSelection;
  registry: ThermalTreatmentFamilyRegistry;
  worker: ThermalTreatmentCalculationWorker;
  now?: Date;
}): Promise<RunThermalTreatmentResult> {
  const family = command.registry.findByIdentity(command.selection);
  if (!family) throw new Error(`No registered Thermal Treatment family matches '${command.selection.familyId}' version '${command.selection.familyVersion}'.`);
  assertValidThermalTreatmentPacks(family);
  const issues = family.validateConfirmedInputs({ confirmedInputs: command.selection.confirmedInputs });
  if (issues.length > 0) throw new Error("Thermal Treatment inputs are invalid: " + issues.map((issue) => issue.message).join(" "));
  const analysisModel = family.buildAnalysisModel({ assemblyGroupId: command.assemblyGroupId, confirmedInputs: command.selection.confirmedInputs });
  const result = await command.worker.calculate({ analysisModel });
  if (!Number.isFinite(result.effectiveUValueWPerM2K) || result.effectiveUValueWPerM2K <= 0) throw new Error("Thermal Treatment worker returned an invalid effective U-value.");
  const trust = evaluateThermalTreatmentTrust({
    family,
    confirmedInputs: command.selection.confirmedInputs,
    inputEvidence: command.selection.inputEvidence,
    worker: command.worker,
    workerResult: result,
  });
  return {
    result,
    record: {
      trustState: trust.trustReasons.length ? "preliminary_unsafe_estimate" : "verified",
      trustReasons: trust.trustReasons,
      actionsRequiredForVerification: trust.actionsRequiredForVerification,
      packVersions: {
        codeAdapterVersion: family.packs.codeAdapterVersion,
        knowledgePackVersion: family.packs.knowledgePack.version,
        validationPackVersion: family.packs.validationPack.version,
      },
      baselineUValueWPerM2K: 0,
      effectiveUValueWPerM2K: result.effectiveUValueWPerM2K,
      selection: command.selection,
      worker: { workerId: command.worker.workerId, workerVersion: command.worker.workerVersion },
      calculatedAt: (command.now ?? new Date()).toISOString(),
      confirmedInputs: command.selection.confirmedInputs,
      assumptions: [...analysisModel.assumptions, ...result.assumptions],
      provenance: [...analysisModel.provenance, ...result.provenance],
    },
  };
}