import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { basename, isAbsolute, join, resolve } from "node:path";

import type {
  TopologyBundleIdentity,
  TopologyEvidence,
  TopologyWorkerRuntime,
} from "../../domain/topology/topologyTypes.js";
import { canonicalTopologyJson } from "../../domain/topology/canonicalTopologyJson.js";

export const PROVEN_TOPOLOGY_BUNDLE: TopologyBundleIdentity = {
  moduleId: "repeating-parallel-profile-wall-2d",
  moduleVersion: "1.0.0-draft",
  registryHash: "97a73f5e277bc0971aec1d4ae62f2668447ff7cca587c5dc18f1ed51b3a21f12",
  packHash: "ce5b0c473dc6ccca8d295ae095548271c6ba821a99681b593104bdd002500cc9",
  runtimeHash: "b741ef6c97cec8a826ea89dc7d2c654d5b9a8b5d17eedb118d6acf4b4d8efbd6",
};

const PROVEN_TOPOLOGY_SOURCE_HASHES = {
  "compiler.py": "4aa773a24ae9578dee6d8484337f5dee072f18d12b0aa4e3e201da31526172b3",
  "primitive_plugins.py": "33e694ed060bb3b13f6127ea6f7d44429cbce6f792cee7c6f7f3ddcfabf819b2",
  "numerical_solver.py": "c2a3ec4bc4869733108d71b03583fcbe506a09969d3d461968b8e5bc6df06380",
  "numerical_utils.py": "a6b1555a550edd37c3ce187adac5fbe41d4616742535153c93799397bef3d6b3",
  "material-pack.json": "0063b56fe7238789d666682944abfd2f8a866b700879b953bca9fe51065b4f7b",
  "requirements.lock.txt": "66325fc5d019f70bee2d37155e0e4f741472c8801d3e49d4d42e82cb17f53619",
  "topology_worker.py": "8a7c17c03306650315d845a05445568c70b5516a45ad2754e05415fac0e07d52",
} as const;
const PROVEN_PYTHON_EXECUTABLE_SHA256 = "0b471133e110cfb53a061cad528ce8e517d7b9ac41a0a396c39ad795a487fc14";

const DEFAULT_WORKER_SCRIPT = fileURLToPath(new URL("./python/topology_worker.py", import.meta.url));
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
const CANCEL_GRACE_MS = 1_000;
let activeWorkerProcesses = 0;

/** Diagnostic counter used by lifecycle verification; it reaches zero only after child close. */
export function activeTopologyWorkerProcessCount(): number {
  return activeWorkerProcesses;
}

type CreateWorkerOptions = {
  /** An explicit release-owned CPython executable; PATH discovery is forbidden. */
  pythonExecutable: string;
  workerScript?: string;
};

/** Starts the pinned Python process. It contains no geometry or solver policy. */
export function createProvenPythonTopologyWorker(
  options: CreateWorkerOptions,
): TopologyWorkerRuntime {
  const pythonExecutable = resolvePinnedPath(options.pythonExecutable, "Python executable");
  const workerScript = resolvePinnedPath(
    options.workerScript ?? DEFAULT_WORKER_SCRIPT,
    "topology worker script",
  );

  return {
    runtimeIdentity: {
      executable: pythonExecutable,
      runtimeHash: PROVEN_TOPOLOGY_BUNDLE.runtimeHash,
    },
    async preflight() {
      await readFile(pythonExecutable);
      await readFile(workerScript);
      if (sha256(await readFile(pythonExecutable)) !== PROVEN_PYTHON_EXECUTABLE_SHA256) throw processFailure("failed", "topology_runtime_preflight_failed", "Pinned Python executable hash does not match the release identity.");
      await runRuntimePreflight(pythonExecutable, workerScript);
    },
    runJsonl(message, runOptions) {
      return runWorkerProcess({
        pythonExecutable,
        workerScript,
        message,
        deadlineAt: runOptions.deadlineAt,
        signal: runOptions.signal,
      });
    },
    verifyArtifacts(evidence, artifactDestination) {
      return verifyArtifacts(evidence, artifactDestination);
    },
  };
}

async function verifyArtifacts(
  evidence: TopologyEvidence,
  artifactDestination: string,
): Promise<void> {
  if (sha256(canonicalTopologyJson(evidence.reproducibilityManifest)) !== evidence.reproducibilityManifestHash) {
    throw processFailure("failed", "reproducibility_hash_mismatch", "Worker reproducibility manifest hash does not match its payload.");
  }
  for (const artifact of evidence.artifactIndex) {
    if (artifact.name !== basename(artifact.name)) {
      throw processFailure("failed", "invalid_artifact_index", "Worker artifact index contains an unsafe path.");
    }
    let bytes: Buffer;
    try {
      bytes = await readFile(join(artifactDestination, artifact.name));
    } catch {
      throw processFailure("failed", "missing_worker_artifact", `Worker artifact is missing: ${artifact.name}.`);
    }
    if (bytes.length !== artifact.sizeBytes || sha256(bytes) !== artifact.sha256) {
      throw processFailure("failed", "worker_artifact_hash_mismatch", `Worker artifact failed hash verification: ${artifact.name}.`);
    }
  }
}

function resolvePinnedPath(value: string, label: string): string {
  if (!value || (!isAbsolute(value) && value === "python")) {
    throw new Error(`${label} must be an explicit pinned filesystem path.`);
  }
  return resolve(value);
}

function runWorkerProcess(input: {
  pythonExecutable: string;
  workerScript: string;
  message: string;
  deadlineAt: string;
  signal?: AbortSignal;
}): Promise<string> {
  return new Promise((resolveOutput, reject) => {
    if (input.signal?.aborted) {
      reject(processFailure("cancelled", "worker_cancelled", "Topology worker was cancelled before start."));
      return;
    }
    const child = spawn(input.pythonExecutable, [input.workerScript], {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    activeWorkerProcesses += 1;
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let terminalFailure: ReturnType<typeof processFailure> | null = null;
    let cancelTimer: ReturnType<typeof setTimeout> | null = null;
    let stdinClosed = false;

    const terminate = (failure: ReturnType<typeof processFailure>) => {
      if (terminalFailure) return;
      terminalFailure = failure;
      const cancelReason = failure.outcome === "cancelled" ? "client-request" : "deadline";
      try {
        const request = JSON.parse(input.message) as Record<string, unknown>;
        if (!stdinClosed && child.stdin.writable && typeof request.requestId === "string" && typeof request.correlationId === "string" && typeof request.idempotencyKey === "string") {
          child.stdin.write(`${JSON.stringify({ schema: "topology-analysis.cancel.v1", requestId: request.requestId, correlationId: request.correlationId, idempotencyKey: request.idempotencyKey, reason: cancelReason })}\n`, "utf8");
          cancelTimer = setTimeout(() => killProcessTree(child), CANCEL_GRACE_MS);
          return;
        }
      } catch {
        // A malformed request cannot receive a protocol cancellation; terminate it directly.
      }
      killProcessTree(child);
    };
    const onAbort = () =>
      terminate(processFailure("cancelled", "worker_cancelled", "Topology worker was cancelled."));
    input.signal?.addEventListener("abort", onAbort, { once: true });

    const deadlineMs = Date.parse(input.deadlineAt) - Date.now();
    const deadlineTimer = setTimeout(
      () =>
        terminate(
          processFailure("failed", "worker_deadline_exceeded", "Topology worker exceeded its deadline."),
        ),
      Math.max(0, deadlineMs),
    );

    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT_BYTES) {
        terminate(processFailure("failed", "worker_output_limit", "Topology worker output exceeded its limit."));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.reduce((size, item) => size + item.length, 0) < MAX_OUTPUT_BYTES) stderr.push(chunk);
    });
    child.on("error", (error) => {
      terminalFailure ??= processFailure("failed", "worker_start_failed", error.message);
    });
    child.on("close", (code, signal) => {
      activeWorkerProcesses = Math.max(0, activeWorkerProcesses - 1);
      clearTimeout(deadlineTimer);
      if (cancelTimer) clearTimeout(cancelTimer);
      input.signal?.removeEventListener("abort", onAbort);
      if (terminalFailure) {
        reject(terminalFailure);
        return;
      }
      const output = Buffer.concat(stdout).toString("utf8");
      if (output.trim()) {
        resolveOutput(output);
        return;
      }
      const diagnostic = Buffer.concat(stderr).toString("utf8").trim();
      reject(
        processFailure(
          "failed",
          "worker_process_failed",
          `Topology worker exited without a protocol message (code ${String(code)}, signal ${String(signal)}).${diagnostic ? ` ${diagnostic}` : ""}`,
        ),
      );
    });
    child.stdin.on("error", () => {
      stdinClosed = true;
    });
    child.stdin.write(input.message, "utf8");
  });
}

function runRuntimePreflight(pythonExecutable: string, workerScript: string): Promise<void> {
  return new Promise((resolvePreflight, rejectPreflight) => {
    const child = spawn(pythonExecutable, [workerScript, "--preflight"], {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    activeWorkerProcesses += 1;
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let failure: (Error & { code?: string }) | null = null;
    const timer = setTimeout(() => {
      failure = processFailure("failed", "topology_runtime_preflight_failed", "Pinned topology runtime preflight exceeded its deadline.");
      killProcessTree(child);
    }, 30_000);
    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes <= 1024 * 1024) stdout.push(chunk);
      else if (!failure) {
        failure = processFailure("failed", "topology_runtime_preflight_failed", "Pinned topology runtime preflight output exceeded its limit.");
        killProcessTree(child);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.reduce((size, item) => size + item.length, 0) < 1024 * 1024) stderr.push(chunk);
    });
    child.on("error", (error) => {
      failure ??= processFailure("failed", "topology_runtime_preflight_failed", error.message);
    });
    child.on("close", (code) => {
      activeWorkerProcesses = Math.max(0, activeWorkerProcesses - 1);
      clearTimeout(timer);
      if (failure) {
        rejectPreflight(failure);
        return;
      }
      if (code !== 0) {
        const diagnostic = Buffer.concat(stderr).toString("utf8").trim();
        rejectPreflight(processFailure("failed", "topology_runtime_preflight_failed", `Pinned topology runtime preflight exited with code ${String(code)}.${diagnostic ? ` ${diagnostic}` : ""}`));
        return;
      }
      try {
        const lines = Buffer.concat(stdout).toString("utf8").trim().split(/\r?\n/).filter(Boolean);
        if (lines.length !== 1) throw new Error("Runtime preflight must emit exactly one JSON message.");
        const output = JSON.parse(lines[0]!) as Record<string, unknown>;
        const bundle = output.bundle as Record<string, unknown> | undefined;
        const sourceFiles = output.sourceFiles as Record<string, unknown> | undefined;
        const sourceHashesMatch = sourceFiles && Object.entries(PROVEN_TOPOLOGY_SOURCE_HASHES).every(([name, expected]) => sourceFiles[name] === expected);
        if (output.schema !== "topology-runtime.preflight.v1" || canonicalTopologyJson(bundle as never) !== canonicalTopologyJson(PROVEN_TOPOLOGY_BUNDLE) || output.registrySha256 !== PROVEN_TOPOLOGY_BUNDLE.registryHash || output.packSha256 !== PROVEN_TOPOLOGY_BUNDLE.packHash || output.runtimeIdentitySha256 !== PROVEN_TOPOLOGY_BUNDLE.runtimeHash || !sourceHashesMatch) {
          throw new Error("Pinned topology runtime identity did not match the release bundle.");
        }
        resolvePreflight();
      } catch (error) {
        rejectPreflight(processFailure("failed", "topology_runtime_preflight_failed", error instanceof Error ? error.message : "Pinned topology runtime preflight returned an invalid identity."));
      }
    });
  });
}

function killProcessTree(child: ReturnType<typeof spawn>): void {
  if (process.platform === "win32" && child.pid) {
    const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    killer.unref();
  } else {
    child.kill();
  }
}

function processFailure(
  outcome: "failed" | "cancelled",
  code: string,
  message: string,
): Error & { outcome: "failed" | "cancelled"; code: string } {
  return Object.assign(new Error(message), { outcome, code });
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
