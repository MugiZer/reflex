import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { PROVEN_TOPOLOGY_BUNDLE } from "../src/infrastructure/topology/createProvenPythonTopologyWorker.js";
import {
  assessReleaseVerification,
  RELEASE_VERIFICATION_SCHEMA,
  type ReleaseProfileId,
  type ReleaseProfileResult,
} from "../src/verifier/releaseVerificationGate.js";
import { TEST_INVENTORY, VERIFICATION_PROFILES, selectVerificationProfile, validateProfileInventory } from "../src/verifier/verificationProfiles.js";

const root = process.cwd();
const evidenceDirectory = resolve(argumentValue("--evidence") ?? ".scratch/production-readiness-checkup/evidence");
const knownBad = argumentValue("--known-bad");
const profiles: readonly ReleaseProfileId[] = ["fast", "integration", "numerical"];

let profileResults: ReleaseProfileResult[];
try {
  if (knownBad) profileResults = knownBadResults(knownBad);
  else {
    const discoveredFiles = execFileSync("rg", ["--files", "tests", "-g", "*.test.ts"], { cwd: root, encoding: "utf8" })
      .split(/\r?\n/).filter((file) => file.endsWith(".test.ts")).map((file) => file.replaceAll("\\", "/"));
    validateProfileInventory(TEST_INVENTORY, discoveredFiles);
    profileResults = [];
    for (const profile of profiles) profileResults.push(await runProfile(profile));
  }
} catch (error) {
  profileResults = profiles.map((profile) => blockedResult(profile, error instanceof Error ? error.message : String(error)));
}

const tested = { revision: git(["rev-parse", "HEAD"]), committedTree: git(["rev-parse", "HEAD^{tree}"]), workingTreeSha256: await worktreeSha() };
const assessment = assessReleaseVerification(profileResults, TEST_INVENTORY, Object.fromEntries(profiles.map((profile) => [profile, VERIFICATION_PROFILES[profile].budgetMs])) as Record<ReleaseProfileId, number>);
const evidence = {
  schema: RELEASE_VERIFICATION_SCHEMA,
  tested,
  workingDirectory: root,
  exactCommands: profileResults.map((result) => result.command),
  profileInventory: TEST_INVENTORY,
  profiles: profileResults,
  assessment,
  completedAt: new Date().toISOString(),
};
const evidencePath = await writeEvidence(evidenceDirectory, evidence);
console.log(`RELEASE decision=${assessment.decision} selected=${assessment.counts.selected} passed=${assessment.counts.passed} failed=${assessment.counts.failed} unexecuted=${assessment.counts.unexecuted}`);
console.log(`EVIDENCE ${evidencePath}`);
if (assessment.decision !== "GO") process.exitCode = 1;

async function runProfile(profile: ReleaseProfileId): Promise<ReleaseProfileResult> {
  const entries = selectVerificationProfile(profile);
  const startedAt = Date.now();
  const command = [resolve("node_modules/vitest/vitest.mjs"), "run", `--maxWorkers=${VERIFICATION_PROFILES[profile].maxWorkers}`, "--reporter=json", ...entries.map((entry) => entry.file)];
  const execution = await runChild(command, VERIFICATION_PROFILES[profile].budgetMs);
  const report = parseReport(execution.output);
  const selectedFiles = entries.map((entry) => entry.file);
  const reportedFiles = new Map<string, { passed: number; failed: number }>((report?.testResults ?? []).map((item: any) => [normalizePath(item.name), { passed: item.numPassingTests ?? 0, failed: item.numFailingTests ?? 0 }]));
  const passedFiles = selectedFiles.filter((file) => reportedFiles.get(file)?.passed && !reportedFiles.get(file)?.failed).length;
  const failed = selectedFiles.filter((file) => Boolean(reportedFiles.get(file)?.failed)).length;
  const unexecuted = selectedFiles.length - passedFiles - failed;
  return {
    profile,
    command: `node ${command.join(" ")}`,
    durationMs: execution.durationMs,
    outcome: execution.outcome,
    counts: { selected: selectedFiles.length, passed: passedFiles, failed, unexecuted },
    selectedFiles,
    runtimeIdentities: profile === "numerical" ? [await realWorkerIdentity()] : [],
    fixtureIdentities: profile === "numerical" ? await numericalFixtureIdentities() : [],
  };
}

function knownBadResults(mode: string): ReleaseProfileResult[] {
  if (mode !== "overlap" && mode !== "skip-worker") throw new Error("--known-bad must be overlap or skip-worker");
  const results = profiles.map((profile) => syntheticPassedResult(profile));
  if (mode === "overlap") results.push(syntheticPassedResult("fast"));
  if (mode === "skip-worker") {
    const numerical = results.find((result) => result.profile === "numerical")!;
    numerical.outcome = "unexecuted";
    numerical.counts = { ...numerical.counts, passed: 0, unexecuted: numerical.counts.selected };
    numerical.runtimeIdentities = [];
  }
  return results;
}

function syntheticPassedResult(profile: ReleaseProfileId): ReleaseProfileResult {
  const selectedFiles = selectVerificationProfile(profile).map((entry) => entry.file);
  return { profile, command: `synthetic known-bad ${profile}`, durationMs: 1, outcome: "passed", counts: { selected: selectedFiles.length, passed: selectedFiles.length, failed: 0, unexecuted: 0 }, selectedFiles, runtimeIdentities: profile === "numerical" ? [{ executable: "synthetic-known-bad", executableSha256: null, runtimeHash: PROVEN_TOPOLOGY_BUNDLE.runtimeHash, workerMode: "real-python" }] : [], fixtureIdentities: [] };
}

function blockedResult(profile: ReleaseProfileId, diagnostic: string): ReleaseProfileResult {
  const selectedFiles = selectVerificationProfile(profile).map((entry) => entry.file);
  return { profile, command: `npm run verify:${profile}`, durationMs: 0, outcome: "harness-blocked", counts: { selected: selectedFiles.length, passed: 0, failed: 0, unexecuted: selectedFiles.length }, selectedFiles, runtimeIdentities: [], fixtureIdentities: [{ path: "harness", sha256: sha(diagnostic) }] };
}

async function runChild(command: string[], budgetMs: number): Promise<{ outcome: ReleaseProfileResult["outcome"]; output: string; durationMs: number }> {
  const startedAt = Date.now();
  console.log(`START PROFILE ${command.at(-1)}`);
  return await new Promise((done) => {
    const child = spawn(process.execPath, command, { cwd: root, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; void killProcessTree(child.pid); }, budgetMs);
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
    child.once("error", (error) => { output += error.message; });
    child.once("close", (status) => {
      clearTimeout(timeout);
      done({ outcome: timedOut ? "unexecuted" : status === 0 ? "passed" : status === null ? "harness-blocked" : "failed", output, durationMs: Date.now() - startedAt });
    });
  });
}

async function numericalFixtureIdentities(): Promise<{ path: string; sha256: string }[]> {
  const paths = ["tests/provenPythonTopologyWorker.integration.test.ts", "tests/fixtures/component-patterns/repeating-c-profile-oracle-v1.json"];
  return await Promise.all(paths.filter((path) => existsSync(resolve(path))).map(async (path) => ({ path, sha256: sha(await readFile(resolve(path))) })));
}
async function realWorkerIdentity(): Promise<{ executable: string; executableSha256: string | null; runtimeHash: string; workerMode: "real-python" }> {
  const executable = resolve(process.env.TOPOLOGY_WORKER_PYTHON ?? ".scratch/component-topology-kernel/conformance-proof/.venv/Scripts/python.exe");
  return { executable, executableSha256: existsSync(executable) ? sha(await readFile(executable)) : null, runtimeHash: PROVEN_TOPOLOGY_BUNDLE.runtimeHash, workerMode: "real-python" };
}

async function writeEvidence(directory: string, value: unknown): Promise<string> {
  await mkdir(directory, { recursive: true });
  const path = join(directory, `release-${new Date().toISOString().replace(/[-:.TZ]/g, "")}-${process.pid}.json`);
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
  return path;
}

function parseReport(output: string): any { try { return JSON.parse(output.slice(output.indexOf("{"))); } catch { return null; } }
function normalizePath(value: string): string { return value.replaceAll("\\", "/").replace(`${root.replaceAll("\\", "/")}/`, ""); }
function argumentValue(name: string): string | undefined { return process.argv.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1); }
function git(arguments_: string[]): string { return (execFileSync("git", arguments_, { cwd: root, encoding: "utf8" }) ?? "").trim(); }
function sha(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }
async function worktreeSha(): Promise<string> {
  const statusLines = git(["status", "--short", "--untracked-files=all"]).split(/\r?\n/).filter(Boolean);
  const relevantLines = statusLines.filter((line) => !ignoredWorktreePath(line.slice(3)));
  const paths = [...new Set(relevantLines.map((line) => line.slice(3)).filter(Boolean))].sort();
  const hash = createHash("sha256");
  hash.update(relevantLines.join("\n"));
  for (const path of paths) {
    hash.update(`\0${path}\0`);
    const absolute = resolve(path);
    if (existsSync(absolute) && (await stat(absolute)).isFile()) hash.update(await readFile(absolute));
    else hash.update(execFileSync("git", ["diff", "--binary", "HEAD", "--", path], { cwd: root, encoding: "utf8" }));
  }
  return hash.digest("hex");
}
function ignoredWorktreePath(path: string): boolean { const normalized = path.replaceAll("\\", "/"); return normalized.startsWith(".scratch/production-readiness-checkup/evidence/") || ["graphify-out/", "node_modules/", "dist/", "outputs/", "storage/"].some((prefix) => normalized.startsWith(prefix)); }
async function killProcessTree(pid: number | undefined): Promise<void> { if (!pid) return; if (process.platform !== "win32") { try { process.kill(pid, "SIGTERM"); } catch { /* already closed */ } return; } await new Promise<void>((done) => { const child = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { shell: false, stdio: "ignore" }); child.once("close", () => done()); child.once("error", () => done()); }); }
