import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { PRELIMINARY_TOPOLOGY_PILOT_PROOF_IDS, PRELIMINARY_TOPOLOGY_PILOT_SCHEMA, validatePreliminaryTopologyPilotEvidence } from "../src/verifier/preliminaryTopologyPilotEvidence.js";

const proofCases = [
  ["PILOT-A01", "localhost eligible review uses the durable Ticket 4 evaluator"], ["PILOT-A02", "localhost policy exclusions do not invoke topology work"], ["PILOT-A03", "pilot disposition survives a fresh SQLite reader"], ["PILOT-A03", "pilot event history is append-only and idempotent"], ["PILOT-A04", "report reloads the persisted pilot result without fabrication"], ["PILOT-A05", "invalid or incomplete persisted success fails closed"], ["PILOT-A06", "aborted or deadline-exceeded work publishes no partial result"], ["PILOT-A07", "transient retry does not duplicate durable calculation"], ["PILOT-A07", "deterministic failure is not automatically retried"], ["PILOT-A08", "simultaneous independent pilot submissions converge"], ["PILOT-A09", "health reports actual dependency readiness"], ["PILOT-A10", "cleanup preserves published and referenced evidence"], ["PILOT-A11", "restart kill and bundle rollback preserve history"], ["PILOT-A12", "pilot verifier rejects missing skipped stale and mutated proof"], ["PILOT-A13", "pilot evidence manifest binds GO to the current revision and every proof ID"], ["PILOT-S01", "pilot policy produces deterministic typed decisions"], ["PILOT-S02", "invalid or incomplete persisted success fails closed"], ["PILOT-S03", "simultaneous independent pilot submissions converge"], ["PILOT-S04", "pilot policy produces deterministic typed decisions"], ["PILOT-S05", "restart kill and bundle rollback preserve history"],
] as const;
const baselineFiles = ["tests/preliminaryTopologyPilotPolicy.test.ts", "tests/preliminaryTopologyPilotSqlite.test.ts", "tests/preliminaryTopologyPilotHttp.test.ts", "tests/preliminaryTopologyPilotLifecycle.test.ts", "tests/preliminaryTopologyPilotOperational.test.ts", "tests/preliminaryTopologyPilotVerifier.test.ts", "tests/preliminaryTopologyPilotEvidence.test.ts"];
const sensitivityFiles = ["tests/preliminaryTopologyPilotSensitivity.test.ts", "tests/preliminaryTopologyPilotHttp.test.ts", "tests/preliminaryTopologyPilotVerifier.test.ts", "tests/preliminaryTopologyPilotEvidence.test.ts"];
const evidencePath = resolve(".scratch/component-topology-preliminary-v1/reports/05-preliminary-topology-pilot-gate-evidence.json");
const fixturePath = resolve("tests/fixtures/ifc/repeating-c-profile.ifc");
const oraclePath = resolve("tests/fixtures/component-patterns/repeating-c-profile-oracle-v1.json");
const args = process.argv.slice(2);
const gate = args.find((arg) => arg.startsWith("--gate="))?.slice("--gate=".length) ?? "all";
const selectedCases = gate === "1" ? proofCases.filter(([id]) => ["PILOT-A01", "PILOT-A02", "PILOT-A03", "PILOT-A04", "PILOT-A05", "PILOT-S01", "PILOT-S02", "PILOT-S03"].includes(id)) : gate === "2" ? proofCases.filter(([id]) => ["PILOT-A06", "PILOT-A07", "PILOT-A08", "PILOT-S03"].includes(id)) : gate === "3" ? proofCases.filter(([id]) => ["PILOT-A09", "PILOT-A10", "PILOT-A11", "PILOT-S02", "PILOT-S04", "PILOT-S05"].includes(id)) : proofCases;
const selectedFiles = gate === "1" ? baselineFiles.slice(0, 3) : gate === "2" ? [baselineFiles[3]!] : gate === "3" ? [baselineFiles[4]!] : baselineFiles;
const baseline = runVitest(selectedFiles);
const sensitivityProbeDir = mkdtempSync(join(tmpdir(), "preliminary-topology-pilot-sensitivity-"));
const sensitivityProbePath = join(sensitivityProbeDir, "protected-state.json");
const sensitivity = runVitest(sensitivityFiles, { PILOT_PROTECTED_STATE_PATH: sensitivityProbePath });
const proofs = selectedCases.map(([proofId, testName], index) => ({ id: `${proofId}-${index + 1}`, proofId, testName, status: assertionStatus(baseline.report, testName) }));
const proofIds = [...new Set(selectedCases.map(([id]) => id))];
const proofRows = proofIds.map((id) => { const matching = proofs.filter((proof) => proof.proofId === id); const status = matching.some((proof) => proof.status === "failed") ? "failed" : matching.length > 0 && matching.every((proof) => proof.status === "passed") ? "passed" : "unexecuted"; return { id, testName: matching[0]?.testName ?? `verifier proof ${id}`, status }; });
const counts = { selected: proofRows.length, passed: proofRows.filter((proof) => proof.status === "passed").length, failed: proofRows.filter((proof) => proof.status === "failed").length, unexecuted: proofRows.filter((proof) => proof.status === "unexecuted").length };
const sensitivityObservation = readProtectedState(sensitivityProbePath);
const sensitivityFlags = {
  missingProofRejected: assertionStatus(sensitivity.report, "rejects a missing proof") === "passed",
  skippedProofRejected: assertionStatus(sensitivity.report, "rejects an unexecuted proof") === "passed",
  staleRevisionRejected: assertionStatus(sensitivity.report, "rejects a stale revision") === "passed",
  mutatedProtectedStateRejected: assertionStatus(sensitivity.report, "rejects protected-state mutation") === "passed" && assertionStatus(sensitivity.report, "invalid or incomplete persisted success fails closed") === "passed" && Boolean(sensitivityObservation && sensitivityObservation.ifcBytes?.before === sensitivityObservation.ifcBytes?.after && sensitivityObservation.layerOnlySnapshot?.before === sensitivityObservation.layerOnlySnapshot?.after),
  fabricatedValueRejected: assertionStatus(sensitivity.report, "rejects a fabricated oracle value") === "passed",
  candidatePatternRejected: assertionStatus(sensitivity.report, "sensitivity public boundary rejects candidate pattern") === "passed",
  workerLaunchRequired: assertionStatus(sensitivity.report, "sensitivity public boundary rejects skipped worker") === "passed",
  failedRangeRejected: assertionStatus(sensitivity.report, "sensitivity public boundary rejects a range with a failed scenario") === "passed",
  fabricatedWorkerValueRejected: assertionStatus(sensitivity.report, "sensitivity public boundary rejects a fabricated worker value") === "passed",
  publicBoundaryRerun: assertionStatus(sensitivity.report, "localhost eligible review uses the durable Ticket 4 evaluator") === "passed" && assertionStatus(sensitivity.report, "report reloads the persisted pilot result without fabrication") === "passed",
};
const oracle = JSON.parse(readFileSync(oraclePath, "utf8")) as { scenarios: readonly { expectedUValueWPerM2K: number }[] };
const revision = git(["rev-parse", "HEAD"]);
const testedTreeSha256 = worktreeSha();
const decision = baseline.status === 0 && sensitivity.status === 0 && counts.unexecuted === 0 && Object.values(sensitivityFlags).every(Boolean) ? "GO" : baseline.status === null || sensitivity.status === null ? "HARNESS-BLOCKED" : counts.unexecuted > 0 ? "NOT-PROVEN" : "NO-GO";
const manifest = {
  schema: PRELIMINARY_TOPOLOGY_PILOT_SCHEMA,
  ticket: ".scratch/component-topology-preliminary-v1/issues/05-preliminary-result-reporting-operational-pilot.md",
  gate,
  tested: { revision, testedTreeSha256 },
  command: { argv: baseline.argv, workingDirectory: process.cwd(), exitStatus: baseline.status, stdoutSha256: sha(baseline.stdout), stderrSha256: sha(baseline.stderr) },
  sensitivityCommand: { argv: sensitivity.argv, workingDirectory: process.cwd(), exitStatus: sensitivity.status, stdoutSha256: sha(sensitivity.stdout), stderrSha256: sha(sensitivity.stderr) },
  counts,
  proofIds,
  proofs: proofRows,
  selectedTestNames: selectedCases.map(([, name]) => name),
  sensitivity: sensitivityFlags,
  fixture: { path: "tests/fixtures/ifc/repeating-c-profile.ifc", sha256: sha(readFileSync(fixturePath)) },
  oracle: { path: "tests/fixtures/component-patterns/repeating-c-profile-oracle-v1.json", sha256: sha(readFileSync(oraclePath)) },
  oracleValues: oracle.scenarios.map((scenario) => scenario.expectedUValueWPerM2K),
  protectedState: sensitivityObservation ?? { ifcBefore: "", ifcAfter: "", layerBefore: "", layerAfter: "" },
  decision,
};
mkdirSync(dirname(evidencePath), { recursive: true });
writeFileSync(evidencePath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
const validation = validatePreliminaryTopologyPilotEvidence(manifest, { revision, testedTreeSha256, proofIds });
console.log(`preliminary topology pilot gate=${gate} selected=${counts.selected} passed=${counts.passed} failed=${counts.failed} unexecuted=${counts.unexecuted} decision=${decision}`);
const verificationFailed = !validation.valid || decision !== "GO";
rmSync(sensitivityProbeDir, { recursive: true, force: true });
if (verificationFailed) process.exit(baseline.status ?? 1);

function runVitest(files: readonly string[], extraEnv: Record<string, string> = {}) {
  const argv = [join("node_modules", "vitest", "vitest.mjs"), "run", ...files, "--reporter=json"];
  const result = spawnSync(process.execPath, argv, { cwd: process.cwd(), encoding: "utf8", shell: false, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...extraEnv } });
  return { argv: [process.execPath, ...argv], status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "", report: parseReport(result.stdout ?? "") };
}
function parseReport(output: string): any { try { return JSON.parse(output.slice(output.indexOf("{"))); } catch { return null; } }
function assertionStatus(report: any, title: string): "passed" | "failed" | "unexecuted" { const assertion = report?.testResults?.flatMap((file: any) => file.assertionResults ?? []).find((item: any) => item.title === title); return assertion?.status === "passed" ? "passed" : assertion?.status === "failed" ? "failed" : "unexecuted"; }
function readProtectedState(path: string): Record<string, any> | null { try { return JSON.parse(readFileSync(path, "utf8")) as Record<string, any>; } catch { return null; } }
function git(arguments_: string[]): string { return (spawnSync("git", arguments_, { cwd: process.cwd(), encoding: "utf8", shell: false }).stdout ?? "").trim(); }
function sha(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }
function worktreeSha(): string {
  const statusLines = git(["status", "--short", "--untracked-files=all"]).split(/\r?\n/).filter(Boolean);
  const paths = [...new Set(statusLines.map((line) => line.slice(3)).filter((path) => path && !ignoredWorktreePath(path)))].sort();
  const hash = createHash("sha256");
  hash.update(statusLines.filter((line) => !ignoredWorktreePath(line.slice(3))).join("\n"));
  for (const path of paths) {
    hash.update(`\0${path}\0`);
    const absolute = resolve(path);
    if (existsSync(absolute) && statSync(absolute).isFile()) hash.update(readFileSync(absolute));
    else hash.update(git(["diff", "--binary", "HEAD", "--", path]));
  }
  return hash.digest("hex");
}
function ignoredWorktreePath(path: string): boolean { const normalized = path.replaceAll("\\", "/"); return normalized.includes("05-preliminary-topology-pilot-gate-evidence.json") || ["graphify-out/", "node_modules/", "dist/", "outputs/", "storage/"].some((prefix) => normalized.startsWith(prefix)); }
