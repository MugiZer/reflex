export const PRELIMINARY_TOPOLOGY_PILOT_SCHEMA = "preliminary-topology-pilot-gate-evidence/v1" as const;
export const PRELIMINARY_TOPOLOGY_PILOT_PROOF_IDS = [
  "PILOT-A01", "PILOT-A02", "PILOT-A03", "PILOT-A04", "PILOT-A05", "PILOT-A06", "PILOT-A07", "PILOT-A08", "PILOT-A09", "PILOT-A10", "PILOT-A11", "PILOT-A12", "PILOT-A13", "PILOT-S01", "PILOT-S02", "PILOT-S03", "PILOT-S04", "PILOT-S05",
] as const;
const REQUIRED_SENSITIVITY_KEYS = ["missingProofRejected", "skippedProofRejected", "staleRevisionRejected", "mutatedProtectedStateRejected", "fabricatedValueRejected", "publicBoundaryRerun"] as const;

export type PilotEvidenceValidation = { valid: boolean; reasons: string[] };

export function validatePreliminaryTopologyPilotEvidence(value: unknown, expected: { revision: string; testedTreeSha256: string; proofIds?: readonly string[] }): PilotEvidenceValidation {
  const reasons: string[] = [];
  const record = asRecord(value);
  if (!record) return { valid: false, reasons: ["evidence manifest is not an object"] };
  if (record.schema !== PRELIMINARY_TOPOLOGY_PILOT_SCHEMA) reasons.push("unsupported evidence schema");
  const tested = asRecord(record.tested);
  if (!tested || tested.revision !== expected.revision || tested.testedTreeSha256 !== expected.testedTreeSha256) reasons.push("evidence is stale for the current revision/worktree");
  const counts = asRecord(record.counts);
  if (!counts || !isCount(counts.selected) || !isCount(counts.passed) || !isCount(counts.failed) || !isCount(counts.unexecuted) || counts.selected !== counts.passed + counts.failed + counts.unexecuted) reasons.push("evidence counts are missing or do not reconcile");
  const expectedProofIds = expected.proofIds ?? PRELIMINARY_TOPOLOGY_PILOT_PROOF_IDS;
  const proofs = Array.isArray(record.proofs) ? record.proofs : [];
  const proofIds = proofs.map((proof) => asRecord(proof)?.id).filter((id): id is string => typeof id === "string");
  if (proofIds.length !== expectedProofIds.length || new Set(proofIds).size !== expectedProofIds.length || expectedProofIds.some((id) => !proofIds.includes(id))) reasons.push("proof identity selection is incomplete or altered");
  const command = asRecord(record.command);
  if (!command || typeof command.exitStatus !== "number" || !Array.isArray(command.argv) || typeof command.workingDirectory !== "string") reasons.push("command execution evidence is missing");
  const sensitivity = asRecord(record.sensitivity);
  const sensitivityCommand = asRecord(record.sensitivityCommand);
  if (!sensitivity || REQUIRED_SENSITIVITY_KEYS.some((key) => sensitivity[key] !== true) || Object.keys(sensitivity).some((key) => !REQUIRED_SENSITIVITY_KEYS.includes(key as (typeof REQUIRED_SENSITIVITY_KEYS)[number]))) reasons.push("sensitivity checks are incomplete");
  if (!sensitivityCommand || typeof sensitivityCommand.exitStatus !== "number" || sensitivityCommand.exitStatus !== 0 || !Array.isArray(sensitivityCommand.argv) || typeof sensitivityCommand.workingDirectory !== "string") reasons.push("sensitivity rerun evidence is missing or abnormal");
  if (record.oracleValues !== undefined && JSON.stringify(record.oracleValues) !== JSON.stringify([0.8424804269783203, 0.9136190712232274, 0.9955419279501067])) reasons.push("independent numerical oracle values were altered");
  const protectedState = asRecord(record.protectedState);
  if (record.decision === "GO" && (!protectedState || protectedState.ifcBefore !== protectedState.ifcAfter || protectedState.layerBefore !== protectedState.layerAfter)) reasons.push("protected state hashes do not prove preservation");
  if (record.decision === "GO") {
    if (!counts || counts.passed !== counts.selected || counts.failed !== 0 || counts.unexecuted !== 0) reasons.push("GO is forbidden with failed or unexecuted proofs");
    if (command?.exitStatus !== 0) reasons.push("GO is forbidden after an abnormal verifier exit");
    if (proofs.some((proof) => asRecord(proof)?.status !== "passed")) reasons.push("GO is forbidden with a non-passed proof");
  }
  if (!["GO", "NO-GO", "NOT-PROVEN", "HARNESS-BLOCKED"].includes(String(record.decision))) reasons.push("invalid evidence decision");
  return { valid: reasons.length === 0, reasons };
}

function asRecord(value: unknown): Record<string, any> | null { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, any> : null; }
function isCount(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value >= 0; }
