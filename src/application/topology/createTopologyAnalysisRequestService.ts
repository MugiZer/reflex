import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { JsonValue, SubmitTopologyAnalysisRequest, TopologyAnalysisOutcome, TopologyAnalysisRequestMessage, TopologyResult, TopologyWorkerRuntime } from "../../domain/topology/topologyTypes.js";

type Options = { artifactRoot: string; worker: TopologyWorkerRuntime; now?: () => string };
type WorkerFailure = { outcome: Extract<TopologyAnalysisOutcome, "rejected" | "failed" | "cancelled">; code: string; message: string };

/** The optional topology boundary. It owns request identity, protocol checks, immutable artifacts, and no layer-only state. */
export function createTopologyAnalysisRequestService(options: Options) {
  const outcomesByKey = new Map<string, { semanticPayload: string; result: TopologyResult }>();
  const now = options.now ?? (() => new Date().toISOString());

  return {
    async submit(command: SubmitTopologyAnalysisRequest): Promise<TopologyResult> {
      validateCommand(command, options.worker);
      const semanticPayload = canonicalJson({ sourceRevisionId: command.sourceRevisionId, sourceAssemblyGroupId: command.sourceAssemblyGroupId, recipe: command.recipe, recipeHash: command.recipeHash, bundle: command.bundle });
      const existing = outcomesByKey.get(command.idempotencyKey);
      if (existing) {
        if (existing.semanticPayload !== semanticPayload) throw new Error("Topology idempotency key was already used with a different semantic payload.");
        return existing.result;
      }

      const requestId = randomUUID();
      const finalDirectory = join(options.artifactRoot, "topology", safePathSegment(command.idempotencyKey));
      const persisted = await readPersistedOutcome(finalDirectory, semanticPayload);
      if (persisted) {
        outcomesByKey.set(command.idempotencyKey, { semanticPayload, result: persisted });
        return persisted;
      }
      const temporaryDirectory = `${finalDirectory}.tmp-${requestId}`;
      await rm(temporaryDirectory, { recursive: true, force: true });
      await mkdir(temporaryDirectory, { recursive: true });
      const base = { requestId, sourceRevisionId: command.sourceRevisionId, sourceAssemblyGroupId: command.sourceAssemblyGroupId, correlationId: command.correlationId, idempotencyKey: command.idempotencyKey, bundle: command.bundle, createdAt: now() };
      let result: TopologyResult;
      try {
        if (command.recipe === null || command.recipeHash === null) {
          result = await publishOutcome({ ...base, semanticPayload, outcome: "not-requested", effectiveUValueWPerM2K: null, errorCode: null, layerOnlySnapshot: command.layerOnlySnapshot, temporaryDirectory, finalDirectory, request: null });
        } else {
          const request: TopologyAnalysisRequestMessage = { schema: "topology-analysis.request.v1", ...base, recipe: command.recipe, recipeHash: command.recipeHash, artifactDestination: finalDirectory };
          await writeJson(join(temporaryDirectory, "request.json"), request);
          try {
            const rawOutput = await options.worker.runJsonl(JSON.stringify(request) + "\n", { deadlineAt: command.deadlineAt ?? null });
            const workerResult = validateWorkerResult(rawOutput, request);
            result = await publishOutcome({ ...base, semanticPayload, outcome: workerResult.outcome, effectiveUValueWPerM2K: workerResult.effectiveUValueWPerM2K, errorCode: null, layerOnlySnapshot: command.layerOnlySnapshot, temporaryDirectory, finalDirectory, request, workerResult });
          } catch (error) {
            const failure = classifyFailure(error);
            result = await publishOutcome({ ...base, semanticPayload, outcome: failure.outcome, effectiveUValueWPerM2K: null, errorCode: failure.code, layerOnlySnapshot: command.layerOnlySnapshot, temporaryDirectory, finalDirectory, request, error: failure });
          }
        }
      } catch (error) {
        await rm(temporaryDirectory, { recursive: true, force: true });
        throw error;
      }
      outcomesByKey.set(command.idempotencyKey, { semanticPayload, result });
      return result;
    },
    getByIdempotencyKey(idempotencyKey: string): TopologyResult | null { return outcomesByKey.get(idempotencyKey)?.result ?? null; },
  };
}

async function publishOutcome(input: { requestId: string; sourceRevisionId: string; sourceAssemblyGroupId: string; correlationId: string; idempotencyKey: string; bundle: SubmitTopologyAnalysisRequest["bundle"]; semanticPayload: string; outcome: TopologyAnalysisOutcome; effectiveUValueWPerM2K: number | null; errorCode: string | null; layerOnlySnapshot: JsonValue; temporaryDirectory: string; finalDirectory: string; request: TopologyAnalysisRequestMessage | null; workerResult?: unknown; error?: WorkerFailure }): Promise<TopologyResult> {
  const result: TopologyResult = { requestId: input.requestId, sourceRevisionId: input.sourceRevisionId, sourceAssemblyGroupId: input.sourceAssemblyGroupId, correlationId: input.correlationId, idempotencyKey: input.idempotencyKey, outcome: input.outcome, bundle: input.bundle, layerOnlySnapshot: input.layerOnlySnapshot, effectiveUValueWPerM2K: input.effectiveUValueWPerM2K, artifactDirectory: input.finalDirectory, errorCode: input.errorCode };
  if (input.error) await writeJson(join(input.temporaryDirectory, "error.json"), { schema: "topology-analysis.error.v1", ...input.error, requestId: input.requestId, correlationId: input.correlationId, idempotencyKey: input.idempotencyKey, bundle: input.bundle });
  else await writeJson(join(input.temporaryDirectory, "result.json"), { schema: "topology-analysis.result.v1", ...result, workerResult: input.workerResult ?? null });
  await writeJson(join(input.temporaryDirectory, "manifest.json"), { requestId: input.requestId, outcome: input.outcome, semanticPayload: input.semanticPayload, result, files: input.error ? ["error.json"] : ["result.json"] });
  await mkdir(join(input.finalDirectory, ".."), { recursive: true });
  await rename(input.temporaryDirectory, input.finalDirectory);
  return result;
}

async function readPersistedOutcome(finalDirectory: string, semanticPayload: string): Promise<TopologyResult | null> {
  try {
    const manifest = JSON.parse(await readFile(join(finalDirectory, "manifest.json"), "utf8")) as { semanticPayload?: unknown; result?: unknown };
    if (manifest.semanticPayload !== semanticPayload) throw new Error("Topology idempotency key was already used with a different semantic payload.");
    if (!isTopologyResult(manifest.result)) throw new Error("Persisted topology artifact is incomplete and cannot be reused.");
    return manifest.result;
  } catch (error) {
    if (isNodeNotFound(error)) return null;
    throw error;
  }
}

function validateCommand(command: SubmitTopologyAnalysisRequest, worker: TopologyWorkerRuntime): void {
  if (!command.sourceRevisionId || !command.sourceAssemblyGroupId || !command.correlationId || !command.idempotencyKey) throw new Error("Topology request requires source Revision, Assembly Group, correlation, and idempotency identities.");
  if ((command.recipe === null) !== (command.recipeHash === null)) throw new Error("Topology Recipe and recipe hash must be supplied together.");
  if (!command.bundle.moduleId || !/^\d+\./.test(command.bundle.moduleVersion)) throw new Error("Topology request has an incompatible module identity.");
  if (!command.bundle.registryHash || !command.bundle.packHash || !command.bundle.runtimeHash) throw new Error("Topology request requires immutable bundle identities.");
  if (!worker.runtimeIdentity.executable || worker.runtimeIdentity.runtimeHash !== command.bundle.runtimeHash) throw new Error("Topology request runtime is not pinned to the requested bundle.");
}

function validateWorkerResult(rawOutput: string, request: TopologyAnalysisRequestMessage): { outcome: "preliminary-unsafe"; effectiveUValueWPerM2K: number; [key: string]: unknown } {
  const lines = rawOutput.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length !== 1) throw failure("failed", "malformed_output", "Worker must emit exactly one JSONL result message.");
  let output: unknown;
  try { output = JSON.parse(lines[0]!); } catch { throw failure("failed", "malformed_output", "Worker emitted invalid JSON."); }
  if (!isRecord(output)) throw failure("failed", "malformed_output", "Worker result must be an object.");
  if (output.schema !== "topology-analysis.result.v1") throw failure("rejected", "unsupported_protocol", "Worker returned an unsupported protocol major version.");
  if (output.requestId !== request.requestId || output.correlationId !== request.correlationId || output.idempotencyKey !== request.idempotencyKey || canonicalJson(output.bundle as JsonValue) !== canonicalJson(request.bundle)) throw failure("rejected", "identity_mismatch", "Worker result identities do not match the immutable request.");
  if (output.outcome !== "preliminary-unsafe" || typeof output.effectiveUValueWPerM2K !== "number" || !Number.isFinite(output.effectiveUValueWPerM2K)) throw failure("rejected", "invalid_result", "Worker did not return a complete preliminary result.");
  return output as { outcome: "preliminary-unsafe"; effectiveUValueWPerM2K: number; [key: string]: unknown };
}

function classifyFailure(error: unknown): WorkerFailure { return isFailure(error) ? error : failure("failed", "worker_failure", error instanceof Error ? error.message : "Topology worker failed."); }
function failure(outcome: WorkerFailure["outcome"], code: string, message: string): WorkerFailure { return { outcome, code, message }; }
function isFailure(value: unknown): value is WorkerFailure { return isRecord(value) && (value.outcome === "rejected" || value.outcome === "failed" || value.outcome === "cancelled") && typeof value.code === "string" && typeof value.message === "string"; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isTopologyResult(value: unknown): value is TopologyResult { return isRecord(value) && typeof value.requestId === "string" && typeof value.sourceRevisionId === "string" && typeof value.sourceAssemblyGroupId === "string" && typeof value.correlationId === "string" && typeof value.idempotencyKey === "string" && typeof value.artifactDirectory === "string" && typeof value.outcome === "string"; }
function isNodeNotFound(error: unknown): boolean { return isRecord(error) && error.code === "ENOENT"; }
function safePathSegment(value: string): string { if (!/^[A-Za-z0-9._-]+$/.test(value)) throw new Error("Topology idempotency key contains an unsafe artifact path segment."); return value; }
async function writeJson(path: string, value: unknown): Promise<void> { await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function canonicalJson(value: JsonValue): string { if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`; if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key] as JsonValue)}`).join(",")}}`; return JSON.stringify(value); }
