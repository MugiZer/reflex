import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";

import {
  assessGate,
  commandRegistrationIsValid,
  FOUNDATION_COMMAND,
  FOUNDATION_EVIDENCE_PATH,
  FOUNDATION_SCHEMA,
  gateForNumber,
  isRecord,
  type FoundationGateDefinition,
  type FoundationProof,
  type FoundationProofStatus,
  validateEvidenceForPreflight,
  validateGateRegistry,
} from "../src/verifier/foundationGateVerifier.js";

type JsonAssertion = Readonly<{
  fullName?: string;
  status?: string;
}>;

type JsonTestFile = Readonly<{
  name?: string;
  assertionResults?: readonly JsonAssertion[];
}>;

type VitestReport = Readonly<{
  testResults?: readonly JsonTestFile[];
}>;

type CaseEvidence = Record<string, any> & { caseId: string };

type WorkspaceIdentity = Readonly<{
  revision: string;
  committedTree: string;
  workingTreeSha256: string;
  changedFiles: readonly string[];
}>;

type ProofResult = Readonly<{
  proof: FoundationProof;
  status: FoundationProofStatus;
  detail: string;
  evidence: CaseEvidence | null;
}>;

const root = process.cwd();
const gateArgument = argumentValue("--gate");
const gate = gateForNumber(gateArgument);
const preflight = process.argv.includes("--preflight");
const knownRed = process.argv.includes("--known-red") || process.argv.includes("--known-bad");
const evidencePath = resolve(root, FOUNDATION_EVIDENCE_PATH);

if (!gate) {
  console.error("Usage: npm run verify:component-topology-foundation -- --gate=<1|2|3> [--preflight|--known-red]");
  process.exitCode = 1;
} else {
  await main(gate);
}

async function main(selectedGate: FoundationGateDefinition): Promise<void> {
  const registryErrors = validateGateRegistry();
  if (registryErrors.length > 0) {
    console.error(`Foundation gate registry is invalid: ${registryErrors.join("; ")}`);
    process.exitCode = 1;
    return;
  }

  const identity = collectWorkspaceIdentity(root);
  const declaredCommand = FOUNDATION_COMMAND.replace("<n>", selectedGate.number);

  if (preflight) {
    await runPreflight(selectedGate, identity, declaredCommand);
    return;
  }

  if (knownRed) {
    runKnownRedCheck(selectedGate);
    return;
  }

  const startedAt = new Date().toISOString();
  const started = performance.now();
  const runner = await runVitest(selectedGate);
  const proofResults = evaluateProofs(selectedGate, runner.report, runner.output);
  const statuses = Object.fromEntries(proofResults.map((result) => [result.proof.id, result.status]));
  const protectedStateObservations = collectProtectedState(runner.output);
  const sensitivity = Object.fromEntries(selectedGate.sensitivityCases.map((caseId) => [caseId, sensitivityPassed(caseId, runner.caseEvidence.get(caseId), protectedStateObservations)]));
  const runnerSucceeded = runner.exitStatus === 0 && runner.report !== null && runner.error === null;
  const assessment = assessGate(selectedGate, statuses, sensitivity, true, runnerSucceeded);
  const knownBadMutationRejected = knownBadMutationIsRejected(selectedGate, sensitivity);
  const requiredMutations = requiredMutationResults(selectedGate, proofResults, sensitivity);
  const decision = knownBadMutationRejected ? assessment.decision : "NO-GO";
  const completedAt = new Date().toISOString();

  const artifact = {
    schema: FOUNDATION_SCHEMA,
    gate: selectedGate.id,
    gateName: selectedGate.name,
    ticket: selectedGate.ticket,
    requiredDepth: "P5",
    tested: {
      revision: identity.revision,
      committedTree: identity.committedTree,
      workingTreeSha256: identity.workingTreeSha256,
      changedFileManifest: identity.changedFiles,
    },
    command: {
      declared: declaredCommand,
      exact: `npm run verify:component-topology-foundation -- --gate=${selectedGate.number}`,
      argv: process.argv.slice(2),
      workingDirectory: root,
      runtime: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        workerExecutables: collectWorkerExecutables(runner.caseEvidence),
      },
      startedAt,
      completedAt,
      durationMs: Math.round(performance.now() - started),
      exitStatus: runner.exitStatus,
      stdoutSha256: sha256(runner.stdout),
      stderrSha256: sha256(runner.stderr),
      runnerError: runner.error,
    },
    proofs: proofResults.map((result) => ({
      id: result.proof.id,
      file: result.proof.file,
      testName: result.proof.testName,
      evidenceCase: result.proof.evidenceCase ?? null,
      status: result.status,
      detail: result.detail,
    })),
    counts: assessment.counts,
    runtimeIdentities: collectRuntimeIdentities(runner.caseEvidence),
    artifactIdentities: collectArtifactIdentities(runner.caseEvidence),
    recordIdentities: collectRecordIdentities(runner.caseEvidence),
    protectedStateObservations,
    mutationResults: {
      sensitivity,
      required: requiredMutations,
      knownBadMutationRejected,
      knownBadMutationDescription: "An unexecuted selected proof is forced through the decision rule and must not produce GO.",
    },
    decision,
    reasons: assessment.reasons,
  };

  await writeJsonAtomically(evidencePath, artifact);
  console.log(`Foundation ${selectedGate.id}: selected=${assessment.counts.selected} passed=${assessment.counts.passed} failed=${assessment.counts.failed} unexecuted=${assessment.counts.unexecuted} decision=${decision}`);
  console.log(`Evidence: ${relative(root, evidencePath)}`);
  if (decision !== "GO") process.exitCode = 1;
}

async function runPreflight(selectedGate: FoundationGateDefinition, identity: WorkspaceIdentity, declaredCommand: string): Promise<void> {
  console.log(`Foundation preflight identity: revision=${identity.revision} tree=${identity.committedTree} worktree=${identity.workingTreeSha256}`);
  if (!commandRegistrationIsValid(await readPackageJson(root))) {
    console.error("Foundation preflight blocked: verify:component-topology-foundation is not registered in package.json.");
    process.exitCode = 1;
    return;
  }
  let artifact: unknown;
  try {
    artifact = JSON.parse(await readFile(evidencePath, "utf8")) as unknown;
  } catch (error) {
    console.error(`Foundation preflight blocked: evidence artifact is missing or unreadable at ${relative(root, evidencePath)}.`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const validation = validateEvidenceForPreflight(artifact, {
    gate: selectedGate.id,
    command: declaredCommand,
    revision: identity.revision,
    committedTree: identity.committedTree,
    workingTreeSha256: identity.workingTreeSha256,
    proofIds: selectedGate.proofs.map((proof) => proof.id),
  });
  if (!validation.valid) {
    console.error(`Foundation preflight blocked: ${validation.reasons.join("; ")}`);
    process.exitCode = 1;
    return;
  }
  if (!isRecord(artifact) || artifact.decision !== "GO") {
    console.error(`Foundation preflight blocked: evidence decision is ${isRecord(artifact) ? String(artifact.decision) : "invalid"}; only GO is admissible.`);
    process.exitCode = 1;
    return;
  }
  console.log(`Foundation preflight passed: ${selectedGate.id} evidence is current and GO.`);
}

function runKnownRedCheck(selectedGate: FoundationGateDefinition): void {
  const passingStatuses = Object.fromEntries(selectedGate.proofs.map((proof) => [proof.id, "passed" as const]));
  const sensitivity = Object.fromEntries(selectedGate.sensitivityCases.map((caseId) => [caseId, true]));
  const proofToMutate = selectedGate.proofs[0];
  if (!proofToMutate) {
    console.error(`Foundation known-red failed to run: ${selectedGate.id} has no proofs.`);
    process.exitCode = 1;
    return;
  }
  const mutatedStatuses = { ...passingStatuses, [proofToMutate.id]: "unexecuted" as const };
  const result = assessGate(selectedGate, mutatedStatuses, sensitivity);
  if (result.decision === "GO") {
    console.error(`Foundation known-red FAILED: ${selectedGate.id} accepted an unexecuted proof.`);
    process.exitCode = 1;
    return;
  }
  console.error(`Foundation known-red rejected as expected: ${selectedGate.id} decision=${result.decision}.`);
  process.exitCode = 1;
}

async function runVitest(selectedGate: FoundationGateDefinition): Promise<{
  report: VitestReport | null;
  output: string;
  stdout: string;
  stderr: string;
  exitStatus: number;
  error: string | null;
  caseEvidence: ReadonlyMap<string, CaseEvidence>;
}> {
  const temporaryRoot = await import("node:fs/promises").then(({ mkdtemp }) => mkdtemp(join(tmpdir(), "component-topology-foundation-")));
  const reportPath = join(temporaryRoot, "vitest.json");
  const testFiles = [...new Set(selectedGate.proofs.map((proof) => proof.file))];
  const args = [join("node_modules", "vitest", "vitest.mjs"), "run", ...testFiles, "--reporter=verbose", "--reporter=json", "--outputFile", reportPath, "--maxWorkers=1"];
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
    maxBuffer: 128 * 1024 * 1024,
  });
  const stdout = stringOutput(result.stdout);
  const stderr = stringOutput(result.stderr);
  const output = `${stdout}\n${stderr}`;
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  let report: VitestReport | null = null;
  let error: string | null = result.error ? result.error.message : null;
  try {
    report = JSON.parse(await readFile(reportPath, "utf8")) as VitestReport;
  } catch (readError) {
    error = error ?? (readError instanceof Error ? readError.message : String(readError));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
  return {
    report,
    output,
    stdout,
    stderr,
    exitStatus: result.status ?? 1,
    error,
    caseEvidence: parseCaseEvidence(output),
  };
}

function evaluateProofs(selectedGate: FoundationGateDefinition, report: VitestReport | null, output: string): ProofResult[] {
  const assertions = (report?.testResults ?? []).flatMap((file) => (file.assertionResults ?? []).map((assertion) => ({ ...assertion, file: file.name ?? "" })));
  return selectedGate.proofs.map((proof) => {
    const assertion = assertions.find((item) => samePath(item.file, proof.file) && (item.fullName === proof.testName || item.fullName?.endsWith(` > ${proof.testName}`) || item.fullName?.endsWith(` ${proof.testName}`)));
    const evidence = proof.evidenceCase ? parseCaseEvidence(output).get(proof.evidenceCase) ?? null : null;
    if (!assertion) return { proof, status: "unexecuted", detail: "Vitest did not report the registered public test.", evidence };
    if (assertion.status !== "passed") return { proof, status: assertion.status === "failed" ? "failed" : "unexecuted", detail: `Vitest status: ${assertion.status ?? "unknown"}.`, evidence };
    if (proof.evidenceCase && !validCaseEvidence(proof.evidenceCase, evidence)) return { proof, status: "failed", detail: `Missing or incomplete CASE_EVIDENCE for ${proof.evidenceCase}.`, evidence };
    return { proof, status: "passed", detail: "Public test and required evidence executed.", evidence };
  });
}

function validCaseEvidence(caseId: string, evidence: CaseEvidence | null): boolean {
  if (!evidence || evidence.caseId !== caseId) return false;
  if (evidence.freshReloadOutcome === "not-applicable") return false;
  if (["exact-known", "bounded-unknown", "material-range", "duplicates", "corruption", "conservative-range"].includes(caseId)) {
    if (!isRecord(evidence.recordIdentities) || !isRecord(evidence.workerInvocation) || !Array.isArray(evidence.artifactHashes)) return false;
  }
  if (["bounded-unknown", "mixed-terminal"].includes(caseId)) {
    if (!validProtectedState(evidence)) return false;
  }
  if (caseId === "duplicates" && (evidence.simultaneous !== true || evidence.restarted !== true || evidence.retried !== true)) return false;
  if (caseId === "corruption" && evidence.failClosed !== true) return false;
  if (caseId === "mixed-terminal" && evidence.aggregateRange !== false) return false;
  if (caseId === "replay" && (evidence.evaluationCount !== 2 || evidence.originalRetained !== true)) return false;
  return true;
}

function sensitivityPassed(caseId: string, evidence: CaseEvidence | undefined, protectedStateObservations: readonly any[]): boolean {
  if (!evidence) return false;
  if (caseId === "component-public-duplicate-restart-replay") return evidence.appendOnly === true && evidence.freshReloadOutcome !== "not-applicable";
  if (caseId === "corruption") return evidence.failClosed === true;
  if (caseId === "duplicates") return evidence.simultaneous === true && evidence.restarted === true && evidence.retried === true;
  if (caseId === "bounded-unknown") return evidence.scenarioCount === 3 && validProtectedState(evidence) && protectedStateObservations.some((row) => row.caseId === caseId && validProtectedState(row));
  if (caseId === "mixed-terminal") return evidence.aggregateRange === false && validProtectedState(evidence) && protectedStateObservations.some((row) => row.caseId === caseId && validProtectedState(row));
  if (caseId === "replay") return evidence.originalRetained === true && evidence.evaluationCount === 2;
  return false;
}

function validProtectedState(evidence: CaseEvidence): boolean {
  return isRecord(evidence.protectedStateHashes) && ["ifcBefore", "ifcAfter", "layerBefore", "layerAfter"].every((key) => typeof evidence.protectedStateHashes[key] === "string" && evidence.protectedStateHashes[key].length > 0) && evidence.protectedStateHashes.ifcBefore === evidence.protectedStateHashes.ifcAfter && evidence.protectedStateHashes.layerBefore === evidence.protectedStateHashes.layerAfter;
}

function requiredMutationResults(selectedGate: FoundationGateDefinition, proofResults: readonly ProofResult[], sensitivity: Readonly<Record<string, boolean>>): Record<string, boolean> {
  const passed = (proofId: string) => proofResults.find((result) => result.proof.id === proofId)?.status === "passed";
  if (selectedGate.id === "FND-G1") {
    return {
      malformedIdentityInputRejected: passed("FND-I07"),
      semanticIdentityChangeIsolated: passed("FND-I04"),
      duplicateRestartReplayConverged: passed("FND-I02") && sensitivity["component-public-duplicate-restart-replay"] === true,
      legacyHistoryReloaded: passed("FND-I09"),
    };
  }
  if (selectedGate.id === "FND-G2") {
    return {
      partialExecutionRejected: passed("FND-P05"),
      corruptionRejected: passed("FND-P06") && sensitivity.corruption === true,
      concurrentDuplicateConverged: passed("FND-P07") && sensitivity.duplicates === true,
      protectedStatePreserved: passed("FND-P08") && sensitivity["bounded-unknown"] === true,
      restartReloaded: passed("FND-P04"),
    };
  }
  return {
    nonSuccessHasNoAggregate: passed("FND-W04") && sensitivity["mixed-terminal"] === true,
    durableWorkerEvidence: passed("FND-W01") && sensitivity["bounded-unknown"] === true,
    duplicateAndReplayPreserveHistory: passed("FND-W05") && passed("FND-W10") && sensitivity.duplicates === true && sensitivity.replay === true,
    corruptionFailsClosed: passed("FND-W09") && sensitivity.corruption === true,
    honestLifecycleOutcomes: passed("FND-W03") && passed("FND-W08"),
  };
}

function knownBadMutationIsRejected(selectedGate: FoundationGateDefinition, sensitivity: Readonly<Record<string, boolean>>): boolean {
  const allPassingStatuses = Object.fromEntries(selectedGate.proofs.map((proof) => [proof.id, "passed" as const]));
  const baseline = assessGate(selectedGate, allPassingStatuses, sensitivity);
  const first = selectedGate.proofs[0];
  if (!first || baseline.decision !== "GO") return false;
  const mutated = assessGate(selectedGate, { ...allPassingStatuses, [first.id]: "unexecuted" }, sensitivity);
  return mutated.decision !== "GO";
}

function parseCaseEvidence(output: string): Map<string, CaseEvidence> {
  const evidence = new Map<string, CaseEvidence>();
  for (const match of output.matchAll(/CASE_EVIDENCE\s+(\{[^\r\n]+\})/g)) {
    try {
      const value = JSON.parse(match[1]!) as unknown;
      if (isRecord(value) && typeof value.caseId === "string") evidence.set(value.caseId, value as CaseEvidence);
    } catch {
      // The proof remains failed because its required evidence was not parseable.
    }
  }
  return evidence;
}

function collectProtectedState(output: string): any[] {
  const rows: any[] = [];
  for (const match of output.matchAll(/PROTECTED_STATE\s+(\{[^\r\n]+\})/g)) {
    try {
      const value = JSON.parse(match[1]!) as unknown;
      if (isRecord(value)) rows.push(value);
    } catch {
      // Invalid protected-state output is intentionally omitted from evidence.
    }
  }
  return rows;
}

function collectRuntimeIdentities(evidence: ReadonlyMap<string, CaseEvidence>): any[] {
  return [...evidence.values()].flatMap((row) => {
    if (!isRecord(row.workerInvocation)) return [];
    return [{ caseId: row.caseId, workerInvocation: row.workerInvocation }];
  });
}

function collectWorkerExecutables(evidence: ReadonlyMap<string, CaseEvidence>): string[] {
  return [...new Set(collectRuntimeIdentities(evidence).flatMap((row) => typeof row.workerInvocation.executable === "string" ? [row.workerInvocation.executable] : []))];
}

function collectArtifactIdentities(evidence: ReadonlyMap<string, CaseEvidence>): any[] {
  return [...evidence.values()].flatMap((row) => Array.isArray(row.artifactHashes) ? [{ caseId: row.caseId, hashes: row.artifactHashes }] : []);
}

function collectRecordIdentities(evidence: ReadonlyMap<string, CaseEvidence>): any[] {
  return [...evidence.values()].flatMap((row) => isRecord(row.recordIdentities) ? [{ caseId: row.caseId, identities: row.recordIdentities }] : []);
}

function collectWorkspaceIdentity(directory: string): WorkspaceIdentity {
  const revision = git(directory, ["rev-parse", "HEAD"]);
  const committedTree = git(directory, ["rev-parse", "HEAD^{tree}"]);
  const diff = git(directory, ["diff", "--binary", "HEAD", "--", "."]);
  const status = git(directory, ["status", "--short", "--untracked-files=all"]);
  const untracked = git(directory, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(isSourceFile).sort();
  const untrackedHashes = untracked.map((file) => `${file}:${sha256File(resolve(directory, file))}`);
  return {
    revision,
    committedTree,
    workingTreeSha256: sha256(`${sha256(diff)}\n${untrackedHashes.join("\n")}`),
    changedFiles: [...status.split(/\r?\n/).filter(Boolean), ...untracked.map((file) => `?? ${file}`)],
  };
}

async function readPackageJson(directory: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(join(directory, "package.json"), "utf8")) as unknown;
  } catch {
    return null;
  }
}

function git(directory: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd: directory, encoding: "utf8", shell: false, maxBuffer: 128 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${stringOutput(result.stderr)}`);
  return stringOutput(result.stdout).trim();
}

function isSourceFile(file: string): boolean {
  const normalized = file.replaceAll("\\", "/");
  if (normalized.startsWith("graphify-out/") || normalized.startsWith(".codex/") || normalized.startsWith(".graph-engineering/") || normalized.startsWith(".scratch/")) return false;
  return /\.(c|m)?js|json|ts|tsx|mts|cts|md|yml|yaml|toml$/i.test(normalized);
}

function sha256File(file: string): string {
  try {
    return sha256(readFileSync(file));
  } catch {
    return "missing";
  }
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function samePath(reported: string, expected: string): boolean {
  const normalizedReported = reported.replaceAll("\\", "/").toLowerCase();
  const normalizedExpected = resolve(root, expected).replaceAll(sep, "/").toLowerCase();
  return normalizedReported === normalizedExpected || normalizedReported.endsWith(`/${expected.replaceAll("\\", "/").toLowerCase()}`);
}

function stringOutput(value: string | Buffer | null | undefined): string {
  return typeof value === "string" ? value : value ? value.toString("utf8") : "";
}

async function writeJsonAtomically(file: string, value: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}

function argumentValue(prefix: string): string | undefined {
  const inline = process.argv.find((argument) => argument.startsWith(`${prefix}=`));
  if (inline) return inline.slice(prefix.length + 1);
  const index = process.argv.indexOf(prefix);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
