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

const DEFAULT_WORKER_SCRIPT = fileURLToPath(new URL("./python/topology_worker.py", import.meta.url));
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;

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
  deadlineAt: string | null;
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
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let terminalFailure: ReturnType<typeof processFailure> | null = null;

    const terminate = (failure: ReturnType<typeof processFailure>) => {
      if (terminalFailure) return;
      terminalFailure = failure;
      child.kill();
    };
    const onAbort = () =>
      terminate(processFailure("cancelled", "worker_cancelled", "Topology worker was cancelled."));
    input.signal?.addEventListener("abort", onAbort, { once: true });

    const deadlineMs = input.deadlineAt ? Date.parse(input.deadlineAt) - Date.now() : null;
    const deadlineTimer =
      deadlineMs === null
        ? null
        : setTimeout(
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
      if (deadlineTimer) clearTimeout(deadlineTimer);
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
    child.stdin.end(input.message, "utf8");
  });
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
