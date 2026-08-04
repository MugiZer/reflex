export type FoundationDecision = "GO" | "NO-GO" | "NOT-PROVEN" | "HARNESS-BLOCKED";

export type FoundationProof = Readonly<{
  id: string;
  file: string;
  testName: string;
  evidenceCase?: string;
}>;

export type FoundationGateDefinition = Readonly<{
  number: "1" | "2" | "3";
  id: "FND-G1" | "FND-G2" | "FND-G3";
  name: string;
  ticket: string;
  proofs: readonly FoundationProof[];
  sensitivityCases: readonly string[];
}>;

export const FOUNDATION_SCHEMA = "component-topology-foundation-gates/v2" as const;
export const FOUNDATION_EVIDENCE_PATH = ".scratch/component-topology-preliminary-v1-foundation/reports/foundation-gate-evidence.json" as const;
export const FOUNDATION_COMMAND = "npm run verify:component-topology-foundation -- --gate=<n>" as const;
export const FOUNDATION_NPM_SCRIPT = "verify:component-topology-foundation" as const;

export const FOUNDATION_GATES: Readonly<Record<FoundationGateDefinition["number"], FoundationGateDefinition>> = {
  "1": {
    number: "1",
    id: "FND-G1",
    name: "Identity contract",
    ticket: "01-centralize-component-evaluation-identity.md",
    proofs: [
      { id: "FND-I01", file: "tests/componentEvaluationIdentity.test.ts", testName: "derives durable identities from complete semantic inputs" },
      { id: "FND-I02", file: "tests/componentEvaluationPublicSeam.test.ts", testName: "converges duplicate submission, restart, and promoted replay append-only", evidenceCase: "component-public-duplicate-restart-replay" },
      { id: "FND-I03", file: "tests/componentEvaluationPublicSeam.test.ts", testName: "converges duplicate submission, restart, and promoted replay append-only", evidenceCase: "component-public-duplicate-restart-replay" },
      { id: "FND-I04", file: "tests/componentEvaluationIdentity.test.ts", testName: "component evaluation identities separate topology from dimensions" },
      { id: "FND-I05", file: "tests/componentEvaluationPublicSeam.test.ts", testName: "converges duplicate submission, restart, and promoted replay append-only", evidenceCase: "component-public-duplicate-restart-replay" },
      { id: "FND-I06", file: "tests/componentEvaluationSqlite.test.ts", testName: "component evaluation graph survives a fresh SQLite reader" },
      { id: "FND-I07", file: "tests/componentEvaluationIdentity.test.ts", testName: "fails closed for malformed required identity values" },
      { id: "FND-I08", file: "tests/componentEvaluationIdentity.test.ts", testName: "pattern lifecycle controls runtime eligibility" },
      { id: "FND-I09", file: "tests/componentEvaluationSqlite.test.ts", testName: "reloads an immutable database written with the legacy pattern node key" },
    ],
    sensitivityCases: ["component-public-duplicate-restart-replay"],
  },
  "2": {
    number: "2",
    id: "FND-G2",
    name: "Explicit persistence seam",
    ticket: "02-restore-component-evaluation-persistence-seam.md",
    proofs: [
      { id: "FND-P01", file: "tests/componentEvaluationSqlite.test.ts", testName: "component evaluation graph survives a fresh SQLite reader" },
      { id: "FND-P02", file: "tests/componentEvaluationPublicSeam.test.ts", testName: "converges duplicate submission, restart, and promoted replay append-only", evidenceCase: "component-public-duplicate-restart-replay" },
      { id: "FND-P03", file: "tests/componentScenarioHttpE2e.test.ts", testName: "known promoted match runs one durable Python scenario", evidenceCase: "exact-known" },
      { id: "FND-P04", file: "tests/componentScenarioHttpE2e.test.ts", testName: "restart recomputes the same range from stored scenarios", evidenceCase: "material-range" },
      { id: "FND-P05", file: "tests/componentEvaluationSqlite.test.ts", testName: "interrupted evaluation append publishes no trusted aggregate" },
      { id: "FND-P06", file: "tests/componentScenarioHttpE2e.test.ts", testName: "report refuses altered or incomplete success evidence", evidenceCase: "corruption" },
      { id: "FND-P07", file: "tests/componentScenarioHttpE2e.test.ts", testName: "simultaneous duplicate submission publishes one immutable evaluation", evidenceCase: "duplicates" },
      { id: "FND-P08", file: "tests/componentScenarioHttpE2e.test.ts", testName: "bounded unknown runs all three durable Python scenarios", evidenceCase: "bounded-unknown" },
      { id: "FND-P09", file: "tests/componentOccurrenceHttp.test.ts", testName: "invalid review authority cannot create derived success records" },
      { id: "FND-P10", file: "tests/componentEvaluationSqlite.test.ts", testName: "simultaneous evaluation writers publish one graph" },
    ],
    sensitivityCases: ["corruption", "duplicates", "bounded-unknown", "mixed-terminal"],
  },
  "3": {
    number: "3",
    id: "FND-G3",
    name: "One durable workflow authority",
    ticket: "03-deepen-durable-workflow-and-retire-in-memory-pilot.md",
    proofs: [
      { id: "FND-W01", file: "tests/componentScenarioHttpE2e.test.ts", testName: "bounded unknown runs all three durable Python scenarios", evidenceCase: "bounded-unknown" },
      { id: "FND-W02", file: "tests/componentPatternInterpreter.test.ts", testName: "scenario generation is complete and capped" },
      { id: "FND-W03", file: "tests/componentScenarioHttpE2e.test.ts", testName: "worker failure, cancellation, deadline, and incomplete outcomes are public and durable", evidenceCase: "failure-lifecycle" },
      { id: "FND-W04", file: "tests/componentScenarioHttpE2e.test.ts", testName: "one scenario non-success prevents a successful range", evidenceCase: "mixed-terminal" },
      { id: "FND-W05", file: "tests/componentScenarioHttpE2e.test.ts", testName: "simultaneous duplicate submission publishes one immutable evaluation", evidenceCase: "duplicates" },
      { id: "FND-W06", file: "tests/componentScenarioHttpE2e.test.ts", testName: "bounded unknown runs all three durable Python scenarios", evidenceCase: "bounded-unknown" },
      { id: "FND-W07", file: "tests/topologyOperationalPilot.test.ts", testName: "keeps the retired pilot behind a test-only reference seam" },
      { id: "FND-W08", file: "tests/topologyOperationalPilot.test.ts", testName: "limits work to the selected cohort, records safe correlation telemetry, and kills topology without changing layer-only state" },
      { id: "FND-W09", file: "tests/componentScenarioHttpE2e.test.ts", testName: "report refuses altered or incomplete success evidence", evidenceCase: "corruption" },
      { id: "FND-W10", file: "tests/componentScenarioHttpE2e.test.ts", testName: "bounded unknown runs all three durable Python scenarios", evidenceCase: "bounded-unknown" },
    ],
    sensitivityCases: ["corruption", "duplicates", "bounded-unknown", "mixed-terminal", "replay"],
  },
};

export type FoundationProofStatus = "passed" | "failed" | "unexecuted";

export type FoundationCounts = Readonly<{
  selected: number;
  passed: number;
  failed: number;
  unexecuted: number;
}>;

export type FoundationAssessment = Readonly<{
  decision: FoundationDecision;
  counts: FoundationCounts;
  reasons: readonly string[];
}>;

export function gateForNumber(value: string | undefined): FoundationGateDefinition | null {
  if (value !== "1" && value !== "2" && value !== "3") return null;
  return FOUNDATION_GATES[value];
}

export function validateGateRegistry(gates: Readonly<Record<string, FoundationGateDefinition>> = FOUNDATION_GATES): string[] {
  const errors: string[] = [];
  for (const number of ["1", "2", "3"] as const) {
    const gate = gates[number];
    if (!gate) {
      errors.push(`gate ${number} is not registered`);
      continue;
    }
    if (!gate.id || !gate.ticket || gate.proofs.length === 0) {
      errors.push(`${gate.id ?? `gate ${number}`} has no registered proofs`);
    }
    const proofIds = new Set<string>();
    for (const proof of gate.proofs) {
      if (!proof.id || proofIds.has(proof.id)) errors.push(`${gate.id} has a duplicate or empty proof id`);
      proofIds.add(proof.id);
      if (!proof.file || !proof.testName) errors.push(`${gate.id}/${proof.id} has no public test seam`);
    }
  }
  return errors;
}

export function assessGate(
  gate: FoundationGateDefinition,
  statuses: Readonly<Record<string, FoundationProofStatus | undefined>>,
  sensitivity: Readonly<Record<string, boolean>>,
  registered = true,
  runnerSucceeded = true,
): FoundationAssessment {
  const counts: FoundationCounts = {
    selected: gate.proofs.length,
    passed: gate.proofs.filter((proof) => statuses[proof.id] === "passed").length,
    failed: gate.proofs.filter((proof) => statuses[proof.id] === "failed").length,
    unexecuted: gate.proofs.filter((proof) => statuses[proof.id] !== "passed" && statuses[proof.id] !== "failed").length,
  };
  const reasons: string[] = [];
  if (!registered) reasons.push("gate command is not registered");
  if (counts.selected === 0) reasons.push("no proofs were selected");
  if (counts.failed > 0) reasons.push(`${counts.failed} proof(s) failed`);
  if (counts.unexecuted > 0) reasons.push(`${counts.unexecuted} proof(s) were unexecuted`);
  if (!runnerSucceeded) reasons.push("the proof runner exited non-zero or did not produce a machine-readable report");
  for (const caseId of gate.sensitivityCases) {
    if (sensitivity[caseId] !== true) reasons.push(`sensitivity case ${caseId} did not reject the known-bad mutation`);
  }

  let decision: FoundationDecision = "GO";
  if (!registered || counts.selected === 0) decision = "HARNESS-BLOCKED";
  else if (!runnerSucceeded || counts.failed > 0 || Object.values(sensitivity).some((value) => value === false)) decision = "NO-GO";
  else if (counts.unexecuted > 0) decision = "NOT-PROVEN";
  return { decision, counts, reasons };
}

export type FoundationEvidenceExpectation = Readonly<{
  gate: FoundationGateDefinition["id"];
  command: string;
  revision: string;
  committedTree: string;
  workingTreeSha256: string;
  proofIds: readonly string[];
}>;

export type EvidenceValidation = Readonly<{
  valid: boolean;
  reasons: readonly string[];
}>;

export function validateEvidenceForPreflight(value: unknown, expected: FoundationEvidenceExpectation): EvidenceValidation {
  const reasons: string[] = [];
  if (!isRecord(value)) return { valid: false, reasons: ["evidence artifact is not a JSON object"] };
  if (value.schema !== FOUNDATION_SCHEMA) reasons.push("evidence schema is missing or unsupported");
  if (value.gate !== expected.gate) reasons.push(`evidence gate is ${String(value.gate)}, expected ${expected.gate}`);
  const command = isRecord(value.command) ? value.command : null;
  if (!command || command.declared !== expected.command) reasons.push("evidence command is missing or does not match the registered command");
  const tested = isRecord(value.tested) ? value.tested : null;
  if (!tested || tested.revision !== expected.revision || tested.committedTree !== expected.committedTree || tested.workingTreeSha256 !== expected.workingTreeSha256) reasons.push("evidence is stale for the current tested revision or worktree");
  if (!tested || !Array.isArray(tested.changedFileManifest)) reasons.push("evidence changed-file manifest is missing");
  if (!command || !Array.isArray(command.argv) || typeof command.workingDirectory !== "string" || typeof command.exitStatus !== "number") reasons.push("evidence command execution details are missing");
  else if (value.decision === "GO" && command.exitStatus !== 0) reasons.push("GO is forbidden when the proof runner exited non-zero");
  const counts = isRecord(value.counts) ? value.counts : null;
  if (!counts || !isNonNegativeInteger(counts.selected) || !isNonNegativeInteger(counts.passed) || !isNonNegativeInteger(counts.failed) || !isNonNegativeInteger(counts.unexecuted)) reasons.push("evidence counts are missing or invalid");
  else {
    if (counts.selected === 0) reasons.push("evidence selected zero proofs");
    if (counts.passed + counts.failed + counts.unexecuted !== counts.selected) reasons.push("evidence counts do not reconcile");
    if (counts.selected !== expected.proofIds.length) reasons.push("evidence selected count does not match the registered proof count");
  }
  const proofs = Array.isArray(value.proofs) ? value.proofs : null;
  if (!proofs || proofs.length !== expected.proofIds.length || proofs.some((proof) => !isRecord(proof) || typeof proof.id !== "string" || !expected.proofIds.includes(proof.id))) reasons.push("evidence proof identities do not match the registered proof selection");
  else if (value.decision === "GO" && proofs.some((proof) => proof.status !== "passed")) reasons.push("GO is forbidden when a registered proof is not passed");
  for (const field of ["runtimeIdentities", "artifactIdentities", "recordIdentities", "fixtureIdentities", "oracleIdentities", "protectedStateObservations"] as const) {
    if (!Array.isArray(value[field])) reasons.push(`evidence ${field} are missing`);
  }
  const mutationResults = isRecord(value.mutationResults) ? value.mutationResults : null;
  const requiredMutations = mutationResults && isRecord(mutationResults.required) ? mutationResults.required : null;
  if (!mutationResults || mutationResults.knownBadMutationRejected !== true || !requiredMutations || Object.values(requiredMutations).some((result) => result !== true)) reasons.push("evidence mutation results are missing or not all rejected");
  if (value.decision === "GO" && counts && (counts.selected === 0 || counts.passed !== counts.selected || counts.failed !== 0 || counts.unexecuted !== 0)) reasons.push("GO is forbidden when proofs are missing, failed, or unexecuted");
  if (!["GO", "NO-GO", "NOT-PROVEN", "HARNESS-BLOCKED"].includes(value.decision as string)) reasons.push("evidence decision is missing or invalid");
  return { valid: reasons.length === 0, reasons };
}

export function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function commandRegistrationIsValid(packageJson: unknown): boolean {
  if (!isRecord(packageJson) || !isRecord(packageJson.scripts)) return false;
  return packageJson.scripts[FOUNDATION_NPM_SCRIPT] === "tsx scripts/verify-component-topology-foundation.ts";
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
