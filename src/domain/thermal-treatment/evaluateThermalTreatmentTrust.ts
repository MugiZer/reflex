import type { ThermalTreatmentCalculationWorker, ThermalTreatmentFamily, ThermalTreatmentInputValue, ThermalTreatmentTrustReason, ThermalTreatmentWorkerResult } from "./thermalTreatmentTypes.js";

export function assertValidThermalTreatmentPacks(family: ThermalTreatmentFamily): void {
  const { identity, packs } = family;
  const problems: string[] = [];
  if (!packs.codeAdapterVersion) problems.push("codeAdapterVersion is required");
  if (!packs.knowledgePack.version) problems.push("knowledge pack version is required");
  if (!packs.validationPack.version) problems.push("validation pack version is required");
  const keys = new Set<string>();
  for (const parameter of packs.knowledgePack.parameters) {
    if (!parameter.key || !parameter.label || !parameter.unit) problems.push("each knowledge parameter needs key, label, and unit");
    if (keys.has(parameter.key)) problems.push(`knowledge parameter '${parameter.key}' is duplicated`);
    keys.add(parameter.key);
    validateBounds(parameter.key, parameter.range, problems);
  }
  for (const [key, bounds] of Object.entries(packs.validationPack.supportedParameterEnvelope)) {
    if (!keys.has(key)) problems.push(`validation envelope references unknown parameter '${key}'`);
    validateBounds(key, bounds, problems);
  }
  if (!packs.validationPack.referenceCases.length) problems.push("validation pack requires at least one reference case");
  if (!packs.validationPack.compatibleCodeAdapterVersions.includes(packs.codeAdapterVersion)) problems.push("validation pack must declare compatibility with the code adapter version");
  if (!packs.validationPack.compatibleWorkers.length) problems.push("validation pack requires at least one compatible worker");
  if (typeof packs.validationPack.approvedForVerification !== "boolean") problems.push("validation pack must declare approvedForVerification");
  for (const referenceCase of packs.validationPack.referenceCases) {
    if (!referenceCase.caseId || !Number.isFinite(referenceCase.expectedEffectiveUValueWPerM2K) || referenceCase.expectedEffectiveUValueWPerM2K <= 0 || !Number.isFinite(referenceCase.toleranceWPerM2K) || referenceCase.toleranceWPerM2K <= 0) problems.push("each reference case needs an id, positive expected U-value, and positive tolerance");
  }
  if (problems.length) throw new Error(`Thermal Treatment pack schema invalid for '${identity.familyId}' v${identity.familyVersion}: ${problems.join("; ")}.`);
}

export function evaluateThermalTreatmentTrust(command: {
  family: ThermalTreatmentFamily;
  confirmedInputs: Record<string, ThermalTreatmentInputValue>;
  inputEvidence: Record<string, { status: "confirmed" | "estimated" | "missing" | "conflicting"; detail: string }> | undefined;
  worker: ThermalTreatmentCalculationWorker;
  workerResult: ThermalTreatmentWorkerResult;
}): { trustReasons: ThermalTreatmentTrustReason[]; actionsRequiredForVerification: string[] } {
  const reasons: ThermalTreatmentTrustReason[] = [];
  if (!command.family.packs.validationPack.approvedForVerification) reasons.push({ code: "validation_pack_not_approved", inputKey: null, message: "The validation pack is not approved for Verified results." });
  const actions: string[] = [];
  for (const parameter of command.family.packs.knowledgePack.parameters.filter((item) => item.critical)) {
    const evidence = command.inputEvidence?.[parameter.key];
    const status = evidence?.status ?? "confirmed";
    if (status === "confirmed") continue;
    const code = `critical_input_${status}` as Extract<ThermalTreatmentTrustReason["code"], `critical_input_${string}`>;
    reasons.push({ code, inputKey: parameter.key, message: evidence?.detail || `${parameter.label} is ${status}.` });
    actions.push(`Confirm ${parameter.label} (${parameter.unit}) from ${parameter.evidenceRequirements.join(" or ")}.`);
  }
  for (const [key, bounds] of Object.entries(command.family.packs.validationPack.supportedParameterEnvelope)) {
    if (!isWithinBounds(command.confirmedInputs[key], bounds)) {
      reasons.push({ code: "outside_validation_envelope", inputKey: key, message: `${key} is outside the validation envelope.` });
      actions.push(`Use a ${key} value inside the validated envelope or select a supported family.`);
    }
  }
  const workerCompatible = command.family.packs.validationPack.compatibleWorkers.some((worker) => worker.workerId === command.worker.workerId && worker.workerVersion === command.worker.workerVersion);
  if (!workerCompatible) {
    reasons.push({ code: "worker_incompatible", inputKey: null, message: `Worker '${command.worker.workerId}' v${command.worker.workerVersion} is not compatible with this validation pack.` });
    actions.push("Run a worker version declared compatible by the validation pack.");
  }
  if (!command.workerResult.validity?.isValid) {
    reasons.push({ code: "worker_invalid", inputKey: null, message: command.workerResult.validity?.diagnostics.join(" ") || "Worker did not provide a passing validity check." });
    actions.push("Resolve the worker validity diagnostics and recalculate.");
  }
  return { trustReasons: reasons, actionsRequiredForVerification: [...new Set(actions)] };
}

function validateBounds(key: string, bounds: { minimum?: number; maximum?: number; allowedValues?: readonly ThermalTreatmentInputValue[] } | undefined, problems: string[]): void {
  if (!bounds) return;
  if (bounds.minimum !== undefined && bounds.maximum !== undefined && bounds.minimum > bounds.maximum) problems.push(`bounds for '${key}' have minimum greater than maximum`);
}

function isWithinBounds(value: ThermalTreatmentInputValue | undefined, bounds: { minimum?: number; maximum?: number; allowedValues?: readonly ThermalTreatmentInputValue[] }): boolean {
  if (bounds.allowedValues && !bounds.allowedValues.includes(value ?? null)) return false;
  if (bounds.minimum !== undefined && (typeof value !== "number" || value < bounds.minimum)) return false;
  if (bounds.maximum !== undefined && (typeof value !== "number" || value > bounds.maximum)) return false;
  return true;
}