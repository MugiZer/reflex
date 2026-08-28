#!/usr/bin/env node

/**
 * The small public facade over Gate Session for the first readiness slice.
 *
 * Gate Session continues to own clean worktrees, committed-gate checks, red
 * sealing, and verifier inputs. This entrypoint owns only the durable work
 * item binding and the workflow decision about whether it is safe to disclose
 * the managed candidate to an implementation agent.
 */
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

type Authority = "advisory" | "protected";
type Json = Record<string, unknown>;

type WorkItem = Json & {
  version: 1;
  kind: "gate-readiness-work-item";
  workItemId: string;
  claim: string;
  claimHash: string;
  ticketRef: string;
  sourceRevision: string;
  authority: Authority;
  phase: "DRAFTED";
  gateId: string;
  gateSessionPath: string;
  candidatePath: string;
  reviewReceiptPath: string;
};

// A host may inject a released verifier adapter. The default follows the
// documented local installation without binding the workflow to one account.
const verifierCli = resolve(process.env.GATE_READINESS_VERIFIER ?? process.env.PROTECTED_VERIFIER_CLI ?? join(homedir(), ".agents", "tools", "protected-verifier", "src", "cli.ts"));

const exitCode = await main(process.argv.slice(2));
process.exitCode = exitCode;

async function main(args: string[]): Promise<number> {
  const [command, ...rest] = args;
  try {
    if (command === "start") return output(await start(parseStart(rest)));
    if (command === "advance") return output(await advance(parseAdvance(rest)));
    if (command === "status") return output(await status(parseStatus(rest)));
    throw new Error("usage: gate-readiness <start|advance|status> --repo <path> [--ticket <path>|--work-item <id>] [--json]");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return 2;
  }
}

async function start(options: { repositoryPath: string; ticketPath: string }): Promise<Json> {
  const repositoryPath = repositoryRoot(options.repositoryPath);
  const ticketPath = resolve(options.ticketPath);
  const ticket = await readTicket(ticketPath);
  const sourceRevision = git(repositoryPath, ["rev-parse", "HEAD"]);
  const existing = await findMatchingWorkItem(repositoryPath, ticketPath, ticket.claim, sourceRevision);
  const workItem = existing ?? await createWorkItem(repositoryPath, ticketPath, ticket, sourceRevision);
  return advanceWorkItem(repositoryPath, workItem, false);
}

async function advance(options: { repositoryPath: string; workItemId: string }): Promise<Json> {
  const repositoryPath = repositoryRoot(options.repositoryPath);
  const workItem = await findWorkItem(repositoryPath, options.workItemId);
  return advanceWorkItem(repositoryPath, workItem, true);
}

async function status(options: { repositoryPath: string; workItemId: string }): Promise<Json> {
  const repositoryPath = repositoryRoot(options.repositoryPath);
  const workItem = await findWorkItem(repositoryPath, options.workItemId);
  return readinessStatus(repositoryPath, workItem);
}

async function advanceWorkItem(repositoryPath: string, workItem: WorkItem, requestAudit: boolean): Promise<Json> {
  const session = await ensureSession(repositoryPath, workItem);
  if (session.phase !== "IMPLEMENTATION_READY") {
    let continued = runVerifier(["continue", workItem.gateSessionPath], repositoryPath);
    let continuedValue = parseJson(continued.stdout);
    if (continuedValue?.action === "AUTHOR_GATE") {
      const role = await runSemanticRole({
        action: "AUTHOR_GATE",
        repositoryPath,
        workItemId: workItem.workItemId,
        claim: workItem.claim,
        claimHash: workItem.claimHash,
        authority: workItem.authority,
        gateId: workItem.gateId,
        gateOwnerPath: stringAt(session, "worktrees", "gateOwnerPath"),
      });
      if (!role.ok) return blocked(workItem, "AUTHOR_GATE", role.reason);
      continued = runVerifier(["continue", workItem.gateSessionPath], repositoryPath);
      continuedValue = parseJson(continued.stdout);
    }
    if (!continued.ok || continuedValue?.status !== "READY_FOR_IMPLEMENTATION") {
      return blocked(workItem, String(continuedValue?.action ?? "CONTINUE_GATE_SESSION"), String(continuedValue?.reason ?? (continued.reason || "Gate Session did not seal a behavioral red")));
    }
  }

  const refreshed = await loadSession(workItem);
  const publication = protectedPublication(repositoryPath, refreshed, workItem.authority);
  if (requestAudit && publication.ok && !validateReceipt(repositoryPath, workItem).ok) {
    await writeAuditReceipt(repositoryPath, workItem, refreshed);
  }
  return readinessStatus(repositoryPath, workItem);
}

async function readinessStatus(repositoryPath: string, workItem: WorkItem): Promise<Json> {
  let session: Json;
  try {
    session = await loadSession(workItem);
  } catch (error) {
    return blocked(workItem, "PREPARE_CLEAN_CANDIDATE", errorMessage(error));
  }

  if (session.phase !== "IMPLEMENTATION_READY") {
    return blocked(workItem, "CONTINUE_GATE_SESSION", "Gate Session has not sealed behavioral-red evidence");
  }
  const candidate = candidateIsAttributable(session, workItem);
  if (!candidate.ok) return blocked(workItem, "PREPARE_CLEAN_CANDIDATE", candidate.reason);

  const publication = protectedPublication(repositoryPath, session, workItem.authority);
  if (!publication.ok) return blocked(workItem, "PUBLISH_GATE", publication.reason);

  const receipt = validateReceipt(repositoryPath, workItem);
  if (!receipt.ok) return blocked(workItem, "AUDIT_GATE", receipt.reason);

  return {
    status: "IMPLEMENTATION_READY",
    phase: "IMPLEMENTATION_READY",
    workItemId: workItem.workItemId,
    workItemRecordPath: recordPath(repositoryPath, workItem.workItemId),
    candidatePath: workItem.candidatePath,
    gateSessionPath: workItem.gateSessionPath,
  };
}

async function ensureSession(repositoryPath: string, workItem: WorkItem): Promise<Json> {
  if (existsSync(workItem.gateSessionPath)) {
    return loadSession(workItem);
  }
  const prepared = runVerifier([
    "prepare", workItem.gateId,
    "--repo", repositoryPath,
    "--authority", workItem.authority,
    "--work-item-record", recordPath(repositoryPath, workItem.workItemId),
  ], repositoryPath);
  if (!prepared.ok) throw new Error(prepared.reason);
  return loadSession(workItem);
}

async function writeAuditReceipt(repositoryPath: string, workItem: WorkItem, session: Json): Promise<void> {
  const role = await runSemanticRole({
    action: "AUDIT_GATE",
    repositoryPath,
    workItemId: workItem.workItemId,
    claim: workItem.claim,
    claimHash: workItem.claimHash,
    authority: workItem.authority,
    gateCommit: stringAt(session, "gate", "revision"),
    gateHash: stringAt(session, "gate", "hash"),
    redHash: stringAt(session, "red", "reportHash"),
    gateSessionPath: workItem.gateSessionPath,
  });
  if (!role.ok || !role.value) return;
  const findings = typeof role.value.findings === "string" ? role.value.findings : undefined;
  const findingsRef = typeof role.value.findingsRef === "string" ? role.value.findingsRef : "findings.md";
  if (!findings || isAbsolute(findingsRef) || findingsRef.includes("..")) return;
  const receiptPath = workItem.reviewReceiptPath;
  await mkdir(dirname(receiptPath), { recursive: true });
  await atomicWrite(resolve(dirname(receiptPath), findingsRef), findings);
  const { findings: _, ...receipt } = role.value;
  await atomicWrite(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
}

function validateReceipt(repositoryPath: string, workItem: WorkItem): { ok: true } | { ok: false; reason: string } {
  if (!existsSync(workItem.reviewReceiptPath)) return { ok: false, reason: "a fresh GATE-READY receipt has not been recorded" };
  const result = runVerifier(["validate-gate-review-receipt", workItem.gateSessionPath, workItem.reviewReceiptPath], repositoryPath);
  const validation = parseJson(result.stdout);
  return result.ok && validation?.receipt && typeof validation.receipt === "object" &&
    (validation.receipt as Json).decision === "GATE-READY"
    ? { ok: true }
    : { ok: false, reason: result.ok ? "the independent review did not issue GATE-READY" : result.reason };
}

function protectedPublication(repositoryPath: string, session: Json, authority: Authority): { ok: true } | { ok: false; reason: string } {
  if (authority === "advisory") return { ok: true };
  const ref = process.env.GATE_READINESS_PROTECTED_REF ?? "refs/heads/protected";
  const gateCommit = stringAt(session, "gate", "revision");
  const gateHash = stringAt(session, "gate", "hash");
  const gateId = typeof session.id === "string" ? session.id : undefined;
  if (!gateCommit || !gateHash || !gateId) return { ok: false, reason: "Gate Session lacks sealed publication facts" };
  if (!gitResult(repositoryPath, ["merge-base", "--is-ancestor", gateCommit, ref]).ok) {
    return { ok: false, reason: "the sealed gate commit is not reachable from the configured protected ref" };
  }
  const packagePrefix = `.verification/gates/${gateId}`;
  if (!gitResult(repositoryPath, ["cat-file", "-e", `${ref}:${packagePrefix}/gate.json`]).ok) {
    return { ok: false, reason: "the protected ref does not retain the sealed gate package" };
  }
  const actual = hashPackageAtRef(repositoryPath, ref, packagePrefix);
  return actual === gateHash
    ? { ok: true }
    : { ok: false, reason: actual
      ? `the protected ref gate bytes do not match the sealed gate hash (${actual})`
      : "the protected ref gate package cannot be hashed" };
}

function hashPackageAtRef(repositoryPath: string, ref: string, prefix: string): string | undefined {
  const listed = gitResult(repositoryPath, ["ls-tree", "-r", "--name-only", ref, "--", prefix]);
  if (!listed.ok) return undefined;
  const files = listed.stdout.split(/\r?\n/).filter(Boolean).sort();
  if (files.length === 0) return undefined;
  const hash = createHash("sha256");
  for (const file of files) {
    const contents = spawnSync("git", ["-C", repositoryPath, "show", `${ref}:${file}`], { encoding: null, windowsHide: true });
    if (contents.status !== 0 || !Buffer.isBuffer(contents.stdout)) return undefined;
    hash.update(file.slice(prefix.length + 1).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(contents.stdout);
  }
  return hash.digest("hex");
}

function candidateIsAttributable(session: Json, workItem: WorkItem): { ok: true } | { ok: false; reason: string } {
  const candidatePath = stringAt(session, "worktrees", "candidatePath");
  const sourceRevision = stringAt(session, "source", "revision");
  if (!candidatePath || candidatePath !== workItem.candidatePath || !sourceRevision) return { ok: false, reason: "record candidate is not the sealed managed candidate" };
  const revision = gitResult(candidatePath, ["rev-parse", "HEAD"]);
  const clean = gitResult(candidatePath, ["status", "--porcelain=v1"]);
  return revision.ok && clean.ok && revision.stdout === sourceRevision && clean.stdout === ""
    ? { ok: true }
    : { ok: false, reason: "managed candidate is dirty or no longer attributable to the source revision" };
}

async function createWorkItem(repositoryPath: string, ticketPath: string, ticket: { claim: string; authority: Authority }, sourceRevision: string): Promise<WorkItem> {
  const workItemId = randomUUID();
  const gateId = configuredGateId(workItemId);
  const commonDirectory = resolve(repositoryPath, git(repositoryPath, ["rev-parse", "--git-common-dir"]));
  const worktreeRoot = join(dirname(repositoryPath), `.${basename(repositoryPath)}-protected-verifier-worktrees`, gateId);
  const workItem: WorkItem = {
    version: 1,
    kind: "gate-readiness-work-item",
    workItemId,
    claim: ticket.claim,
    claimHash: claimHash(ticket.claim),
    ticketRef: ticketPath,
    sourceRevision,
    authority: ticket.authority,
    phase: "DRAFTED",
    gateId,
    gateSessionPath: join(commonDirectory, "protected-verifier", "sessions", `${gateId}.json`),
    candidatePath: join(worktreeRoot, "candidate"),
    reviewReceiptPath: join(repositoryPath, ".gate-readiness", "receipts", `${workItemId}.json`),
    createdAt: new Date().toISOString(),
  };
  await atomicWrite(recordPath(repositoryPath, workItemId), JSON.stringify(workItem, null, 2) + "\n");
  return workItem;
}

async function findMatchingWorkItem(repositoryPath: string, ticketPath: string, claim: string, sourceRevision: string): Promise<WorkItem | undefined> {
  const directory = workItemDirectory(repositoryPath);
  if (!existsSync(directory)) return undefined;
  for (const entry of await readdir(directory)) {
    if (!entry.endsWith(".json")) continue;
    const item = await readWorkItem(join(directory, entry)).catch(() => undefined);
    if (item?.ticketRef === ticketPath && item.claim === claim && item.sourceRevision === sourceRevision) return item;
  }
  return undefined;
}

async function findWorkItem(repositoryPath: string, workItemId: string): Promise<WorkItem> {
  const item = await readWorkItem(recordPath(repositoryPath, workItemId));
  if (!item || item.workItemId !== workItemId) throw new Error("work item was not found in this repository");
  return item;
}

async function readWorkItem(path: string): Promise<WorkItem | undefined> {
  const value = parseJson(await readFile(path, "utf8"));
  return value?.version === 1 && value.kind === "gate-readiness-work-item" && typeof value.workItemId === "string" &&
    typeof value.claim === "string" && typeof value.gateId === "string" && value.claimHash === claimHash(value.claim) ? value as WorkItem : undefined;
}

async function loadSession(workItem: WorkItem): Promise<Json> {
  const value = parseJson(await readFile(workItem.gateSessionPath, "utf8"));
  if (!value || value.kind !== "gate-session" || value.id !== workItem.gateId) throw new Error("work item Gate Session is unavailable or invalid");
  return value;
}

async function readTicket(ticketPath: string): Promise<{ claim: string; authority: Authority }> {
  const content = await readFile(ticketPath, "utf8");
  const claim = /^Claim:\s*(.+)$/mi.exec(content)?.[1]?.trim();
  const authority = /^Authority:\s*(advisory|protected)\s*$/mi.exec(content)?.[1] as Authority | undefined;
  const eligible = /^Status:\s*(approved|gate-pending)\s*$/mi.test(content);
  if (!eligible || !claim || !authority) throw new Error("ticket must be approved or gate-pending and declare Authority and Claim");
  return { claim, authority };
}

async function runSemanticRole(order: Json): Promise<{ ok: boolean; reason: string; value?: Json }> {
  const adapter = process.env.GATE_READINESS_SEMANTIC_ADAPTER;
  if (!adapter) return { ok: false, reason: "a configured semantic-role adapter is required" };
  const result = spawnSync(process.execPath, [resolve(adapter), JSON.stringify(order)], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) return { ok: false, reason: (result.stderr || result.stdout || result.error?.message || "semantic role failed").trim() };
  const value = parseJson(result.stdout);
  return value ? { ok: true, reason: "", value } : { ok: false, reason: "semantic role did not return structured JSON" };
}

function runVerifier(args: string[], cwd: string): { ok: boolean; stdout: string; reason: string } {
  const result = spawnSync(process.execPath, [verifierCli, ...args], { cwd, encoding: "utf8", windowsHide: true });
  const stdout = result.stdout ?? "";
  return {
    ok: result.status === 0,
    stdout,
    reason: (result.stderr || stdout || result.error?.message || "protected verifier failed").trim(),
  };
}

function parseStart(args: string[]): { repositoryPath: string; ticketPath: string } {
  const values = flags(args, ["repo", "ticket", "json"]);
  if (!values.repo || !values.ticket) throw new Error("start requires --repo <path> and --ticket <approved-ticket>");
  return { repositoryPath: values.repo, ticketPath: values.ticket };
}

function parseAdvance(args: string[]): { repositoryPath: string; workItemId: string } {
  const values = flags(args, ["repo", "work-item", "json"]);
  if (!values.repo || !values["work-item"]) throw new Error("advance requires --repo <path> and --work-item <id>");
  return { repositoryPath: values.repo, workItemId: values["work-item"] };
}

function parseStatus(args: string[]): { repositoryPath: string; workItemId: string } {
  return parseAdvance(args);
}

function flags(args: string[], allowed: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]?.replace(/^--/, "");
    if (!key || !allowed.includes(key)) throw new Error(`unknown argument: ${args[index]}`);
    if (key === "json") { values.json = "true"; continue; }
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error(`--${key} requires a value`);
    values[key] = value;
  }
  return values;
}

function output(value: Json): number { process.stdout.write(`${JSON.stringify(value)}\n`); return 0; }
function blocked(workItem: WorkItem, action: string, reason: string): Json {
  return { status: "ACTION_REQUIRED", phase: "GATE_PENDING", workItemId: workItem.workItemId, workItemRecordPath: recordPath(repositoryRootFromRecord(workItem), workItem.workItemId), gateSessionPath: workItem.gateSessionPath, action, reason };
}
function repositoryRoot(path: string): string { return resolve(git(resolve(path), ["rev-parse", "--show-toplevel"])); }
function repositoryRootFromRecord(workItem: WorkItem): string { return dirname(dirname(dirname(workItem.reviewReceiptPath))); }
function workItemDirectory(repositoryPath: string): string { return join(repositoryPath, ".gate-readiness", "work-items"); }
function recordPath(repositoryPath: string, workItemId: string): string { return join(workItemDirectory(repositoryPath), `${workItemId}.json`); }
function configuredGateId(workItemId: string): string {
  if (process.env.GATE_READINESS_GATE_ID) return process.env.GATE_READINESS_GATE_ID;
  const protectedGate = process.env.PROTECTED_VERIFIER_GATE;
  if (protectedGate) {
    try {
      const gate = JSON.parse(readFileSync(join(protectedGate, "gate.json"), "utf8")) as { id?: unknown };
      if (typeof gate.id === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(gate.id)) return gate.id;
    } catch { /* The normal CLI may run outside a protected gate adapter. */ }
  }
  return `gate-readiness-${workItemId}`;
}
function claimHash(claim: string): string { return createHash("sha256").update(JSON.stringify({ claim: claim.replace(/\r\n/g, "\n") })).digest("hex"); }
function parseJson(value: string): Json | undefined { try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Json : undefined; } catch { return undefined; } }
function stringAt(value: Json, first: string, second: string): string | undefined { const nested = value[first]; return nested && typeof nested === "object" && !Array.isArray(nested) && typeof (nested as Json)[second] === "string" ? (nested as Json)[second] as string : undefined; }
function git(path: string, args: string[]): string { const result = gitResult(path, args); if (!result.ok) throw new Error(result.reason); return result.stdout; }
function gitResult(path: string, args: string[]): { ok: boolean; stdout: string; reason: string } { const result = spawnSync("git", ["-C", path, ...args], { encoding: "utf8", windowsHide: true }); return { ok: result.status === 0, stdout: (result.stdout ?? "").trim(), reason: (result.stderr || result.error?.message || "git failed").trim() }; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
async function atomicWrite(path: string, contents: string): Promise<void> { await mkdir(dirname(path), { recursive: true }); const temporary = `${path}.${randomUUID()}.tmp`; try { await writeFile(temporary, contents, { flag: "wx" }); await rename(temporary, path); } catch (error) { await unlink(temporary).catch(() => undefined); throw error; } }
