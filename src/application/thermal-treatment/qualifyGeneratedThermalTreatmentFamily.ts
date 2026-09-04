import { createHash } from "node:crypto";

import { createContinuousZGirtFamily, referenceConfirmedInputs } from "../../domain/thermal-treatment/families/continuousZGirtFamily.js";
import type { GeneratedThermalTreatmentFamily, ThermalTreatmentCalculationWorker, ThermalTreatmentDatasetIdentity, ThermalTreatmentPackSet, ThermalTreatmentQualification } from "../../domain/thermal-treatment/thermalTreatmentTypes.js";
import type { LocalThermalTreatmentDatasetStore } from "../../infrastructure/thermal-treatment/LocalThermalTreatmentDatasetStore.js";
import type { LocalThermalTreatmentQualificationOracleStore, StoredThermalTreatmentQualificationOracle } from "../../infrastructure/thermal-treatment/LocalThermalTreatmentQualificationOracleStore.js";

/** Creates the one supported generated-family shape from a persisted founder dataset. */
export async function generateContinuousZGirtFamilyFromStoredDataset(command: {
  datasets: LocalThermalTreatmentDatasetStore;
  dataset: Pick<ThermalTreatmentDatasetIdentity, "datasetId" | "datasetVersion">;
  oracles: LocalThermalTreatmentQualificationOracleStore;
  oracle: Pick<StoredThermalTreatmentQualificationOracle, "oracleId" | "oracleVersion">;
  generator: { generatorId: string; generatorVersion: string };
}): Promise<GeneratedThermalTreatmentFamily> {
  const dataset = await command.datasets.load(command.dataset);
  const oracle = await command.oracles.load(command.oracle);
  validateDatasetTemplate(dataset.content);
  const fingerprint = sha256(JSON.stringify({ datasetId: dataset.datasetId, datasetVersion: dataset.datasetVersion, contentHash: dataset.contentHash, generator: command.generator }));
  const identity = { familyId: "generated-continuous-z-girt", familyVersion: `1.0.0+${fingerprint.slice(0, 12)}` };
  const baseFamily = createContinuousZGirtFamily();
  const family = createContinuousZGirtFamily({ identity, packs: generatedPacks(baseFamily.packs, oracle) });
  const generation = {
    dataset: pickIdentity(dataset),
    generator: command.generator,
    generatedFamily: identity,
    knowledgePackVersion: family.packs.knowledgePack.version,
    validationPackVersion: family.packs.validationPack.version,
    codeAdapterVersion: family.packs.codeAdapterVersion,
    generationFingerprint: fingerprint,
  };
  return {
    ...family,
    generation,
    qualification: candidateQualification(generation, oracle, family.packs.validationPack.supportedParameterEnvelope),
  };
}

/** Qualifies against frozen validation-pack expectations, never the calculation path's own output. */
export async function qualifyGeneratedThermalTreatmentFamily(command: { candidate: GeneratedThermalTreatmentFamily; worker: ThermalTreatmentCalculationWorker; now?: Date }): Promise<GeneratedThermalTreatmentFamily> {
  const { candidate, worker } = command;
  const compatible = candidate.packs.validationPack.compatibleWorkers.some((item) => item.workerId === worker.workerId && item.workerVersion === worker.workerVersion);
  const reasons: string[] = compatible ? [] : [`Worker '${worker.workerId}' v${worker.workerVersion} is not declared compatible by validation pack ${candidate.packs.validationPack.version}.`];
  const referenceCases: Array<ThermalTreatmentQualification["referenceCases"][number]> = [];
  if (compatible) {
    for (const referenceCase of candidate.packs.validationPack.referenceCases) {
      try {
        const confirmedInputs = { ...referenceConfirmedInputs, ...referenceCase.parameters };
        const result = await worker.calculate({ analysisModel: candidate.buildAnalysisModel({ assemblyGroupId: `qualification_${referenceCase.caseId}`, confirmedInputs }) });
        const passed = result.validity?.isValid === true && result.numericalResult?.convergence.passed === true && Math.abs(result.effectiveUValueWPerM2K - referenceCase.expectedEffectiveUValueWPerM2K) <= referenceCase.toleranceWPerM2K;
        referenceCases.push({ caseId: referenceCase.caseId, expectedEffectiveUValueWPerM2K: referenceCase.expectedEffectiveUValueWPerM2K, actualEffectiveUValueWPerM2K: Number.isFinite(result.effectiveUValueWPerM2K) ? result.effectiveUValueWPerM2K : null, toleranceWPerM2K: referenceCase.toleranceWPerM2K, passed });
        if (!passed) reasons.push(`Reference case '${referenceCase.caseId}' did not pass its independent tolerance.`);
      } catch (error) {
        referenceCases.push({ caseId: referenceCase.caseId, expectedEffectiveUValueWPerM2K: referenceCase.expectedEffectiveUValueWPerM2K, actualEffectiveUValueWPerM2K: null, toleranceWPerM2K: referenceCase.toleranceWPerM2K, passed: false });
        reasons.push(`Reference case '${referenceCase.caseId}' could not be calculated: ${error instanceof Error ? error.message : "unknown worker failure"}.`);
      }
    }
  }
  const decision = reasons.length === 0 && referenceCases.length === candidate.packs.validationPack.referenceCases.length ? "go" : "no-go";
  return {
    ...candidate,
    packs: { ...candidate.packs, validationPack: { ...candidate.packs.validationPack, approvedForVerification: decision === "go" } },
    qualification: {
      decision,
      performedAt: (command.now ?? new Date()).toISOString(),
      dataset: candidate.generation.dataset,
      generatedFamily: candidate.identity,
      codeAdapterVersion: candidate.packs.codeAdapterVersion,
      validationPackVersion: candidate.packs.validationPack.version,
      worker: { workerId: worker.workerId, workerVersion: worker.workerVersion },
      supportedParameterEnvelope: candidate.packs.validationPack.supportedParameterEnvelope,
      oracle: candidate.qualification.oracle,
      referenceCases,
      reasons,
    },
  };
}

/** Removes a faulty generated family from future registry loading without changing already-published revisions. */
export function disableGeneratedThermalTreatmentFamily(command: { family: GeneratedThermalTreatmentFamily; reason: string; now?: Date }): GeneratedThermalTreatmentFamily {
  if (!command.reason.trim()) throw new Error("A generated Thermal Treatment family requires a disable reason.");
  return {
    ...command.family,
    packs: { ...command.family.packs, validationPack: { ...command.family.packs.validationPack, approvedForVerification: false } },
    qualification: {
      ...command.family.qualification,
      decision: "no-go",
      performedAt: (command.now ?? new Date()).toISOString(),
      reasons: [...command.family.qualification.reasons, `Disabled by founder: ${command.reason}`],
    },
  };
}

function generatedPacks(base: ThermalTreatmentPackSet, oracle: StoredThermalTreatmentQualificationOracle): ThermalTreatmentPackSet {
  return {
    ...base,
    validationPack: {
      ...base.validationPack,
      version: "1.0.0-qualified-z-girt-reference",
      approvedForVerification: false,
      referenceCases: oracle.referenceCases.map((reference) => ({ caseId: reference.caseId, parameters: { zDepthMm: 140, repeatSpacingMm: 600, steelThicknessMm: 1.5 }, expectedEffectiveUValueWPerM2K: reference.expectedEffectiveUValueWPerM2K, toleranceWPerM2K: reference.toleranceWPerM2K })),
    },
  };
}
function candidateQualification(generation: GeneratedThermalTreatmentFamily["generation"], oracle: StoredThermalTreatmentQualificationOracle, supportedParameterEnvelope: ThermalTreatmentPackSet["validationPack"]["supportedParameterEnvelope"]): ThermalTreatmentQualification {
  return { decision: "candidate", performedAt: null, dataset: generation.dataset, generatedFamily: generation.generatedFamily, codeAdapterVersion: generation.codeAdapterVersion, validationPackVersion: generation.validationPackVersion, worker: null, supportedParameterEnvelope, oracle: pickOracleIdentity(oracle), referenceCases: [], reasons: ["Qualification has not yet run."] };
}
function pickOracleIdentity(oracle: StoredThermalTreatmentQualificationOracle): ThermalTreatmentQualification["oracle"] { const { oracleId, oracleVersion, contentHash, sourceCitation, acquiredAt, licensingUsageStatus } = oracle; return { oracleId, oracleVersion, contentHash, sourceCitation, acquiredAt, licensingUsageStatus }; }
function validateDatasetTemplate(content: unknown): void { if (!isRecord(content) || content.familyTemplate !== "continuous-z-girt") throw new Error("Stored dataset does not declare the supported continuous-z-girt family template."); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

function pickIdentity(dataset: Awaited<ReturnType<LocalThermalTreatmentDatasetStore["load"]>>): ThermalTreatmentDatasetIdentity {
  const { datasetId, datasetVersion, contentHash, sourceCitation, acquiredAt, licensingUsageStatus } = dataset;
  return { datasetId, datasetVersion, contentHash, sourceCitation, acquiredAt, licensingUsageStatus };
}
function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
