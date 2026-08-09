import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { validatePreliminaryTopologyPilotEvidence } from "../src/verifier/preliminaryTopologyPilotEvidence.js";

const path = resolve(".scratch/component-topology-preliminary-v1/reports/05-preliminary-topology-pilot-gate-evidence.json");
const EVIDENCE_PATHSPEC = ":(exclude).scratch/component-topology-preliminary-v1/reports/05-preliminary-topology-pilot-gate-evidence.json";
const manifest = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
const revision = runGit(["rev-parse", "HEAD"]);
const workingTree = worktreeSha();
const result = validatePreliminaryTopologyPilotEvidence(manifest, { revision, testedTreeSha256: workingTree });
console.log(JSON.stringify({ schema: manifest.schema, decision: manifest.decision, valid: result.valid, reasons: result.reasons }, null, 2));
if (!result.valid || manifest.decision !== "GO") process.exit(1);

function runGit(arguments_: string[]): string { return (spawnSync("git", arguments_, { cwd: process.cwd(), encoding: "utf8", shell: false }).stdout ?? "").trim(); }
function sha(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function worktreeSha(): string {
  const statusLines = runGit(["status", "--short", "--untracked-files=all"]).split(/\r?\n/).filter(Boolean);
  const paths = [...new Set(statusLines.map((line) => line.slice(3)).filter((path) => path && !ignoredWorktreePath(path)))].sort();
  const hash = createHash("sha256");
  hash.update(statusLines.filter((line) => !ignoredWorktreePath(line.slice(3))).join("\n"));
  for (const path of paths) {
    hash.update(`\0${path}\0`);
    const absolute = resolve(path);
    if (existsSync(absolute) && statSync(absolute).isFile()) hash.update(readFileSync(absolute));
    else hash.update(runGit(["diff", "--binary", "HEAD", "--", path]));
  }
  return hash.digest("hex");
}
function ignoredWorktreePath(path: string): boolean { const normalized = path.replaceAll("\\", "/"); return normalized.includes("05-preliminary-topology-pilot-gate-evidence.json") || ["graphify-out/", "node_modules/", "dist/", "outputs/", "storage/"].some((prefix) => normalized.startsWith(prefix)); }
