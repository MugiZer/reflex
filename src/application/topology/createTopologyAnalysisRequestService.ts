import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { JsonValue, SubmitTopologyAnalysisRequest, TopologyAnalysisOutcome, TopologyAnalysisRequestMessage, TopologyEvidence, TopologyResult, TopologyWorkerRuntime } from "../../domain/topology/topologyTypes.js";
import { canonicalTopologyJson } from "../../domain/topology/canonicalTopologyJson.js";

type Options = { artifactRoot: string; worker: TopologyWorkerRuntime; now?: () => string };
type WorkerFailure = { outcome: Extract<TopologyAnalysisOutcome, "blocked" | "rejected" | "failed" | "cancelled">; code: string; message: string };

/** The optional topology boundary. It owns request identity, protocol checks, immutable artifacts, and no layer-only state. */
export function createTopologyAnalysisRequestService(options: Options) {
  const outcomesByKey = new Map<string, { semanticPayload: string; result: TopologyResult }>();
  const now = options.now ?? (() => new Date().toISOString());

  return {
    async submit(command: SubmitTopologyAnalysisRequest): Promise<TopologyResult> {
      validateCommand(command, options.worker);
      const semanticPayload = canonicalTopologyJson({ sourceRevisionId: command.sourceRevisionId, sourceAssemblyGroupId: command.sourceAssemblyGroupId, recipe: command.recipe, recipeHash: command.recipeHash, bundle: command.bundle });
      const existing = outcomesByKey.get(command.idempotencyKey);
      if (existing) {
        if (existing.semanticPayload !== semanticPayload) throw new Error("Topology idempotency key was already used with a different semantic payload.");
        await verifyPersistedEvidence(existing.result, options.worker);
        return existing.result;
      }

      const requestId = randomUUID();
      const finalDirectory = join(options.artifactRoot, "topology", safePathSegment(command.idempotencyKey));
      const persisted = await readPersistedOutcome(finalDirectory, semanticPayload, options.worker);
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
          result = await publishOutcome({ ...base, semanticPayload, outcome: "not-requested", effectiveUValueWPerM2K: null, evidence: null, errorCode: null, layerOnlySnapshot: command.layerOnlySnapshot, temporaryDirectory, finalDirectory, request: null });
        } else {
          const request: TopologyAnalysisRequestMessage = { schema: "topology-analysis.request.v1", ...base, recipe: command.recipe, recipeHash: command.recipeHash, artifactDestination: join(temporaryDirectory, "worker") };
          await writeJson(join(temporaryDirectory, "request.json"), request);
          try {
            const rawOutput = await options.worker.runJsonl(JSON.stringify(request) + "\n", { deadlineAt: command.deadlineAt ?? null, signal: command.cancellationSignal });
            const workerResult = validateWorkerResult(rawOutput, request);
            await options.worker.verifyArtifacts(workerResult.evidence, request.artifactDestination);
            result = await publishOutcome({ ...base, semanticPayload, outcome: workerResult.outcome, effectiveUValueWPerM2K: workerResult.effectiveUValueWPerM2K, evidence: workerResult.evidence, errorCode: null, layerOnlySnapshot: command.layerOnlySnapshot, temporaryDirectory, finalDirectory, request, workerResult });
          } catch (error) {
            const failure = classifyFailure(error);
            result = await publishOutcome({ ...base, semanticPayload, outcome: failure.outcome, effectiveUValueWPerM2K: null, evidence: null, errorCode: failure.code, layerOnlySnapshot: command.layerOnlySnapshot, temporaryDirectory, finalDirectory, request, error: failure });
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

async function publishOutcome(input: { requestId: string; sourceRevisionId: string; sourceAssemblyGroupId: string; correlationId: string; idempotencyKey: string; bundle: SubmitTopologyAnalysisRequest["bundle"]; semanticPayload: string; outcome: TopologyAnalysisOutcome; effectiveUValueWPerM2K: number | null; evidence: TopologyEvidence | null; errorCode: string | null; layerOnlySnapshot: JsonValue; temporaryDirectory: string; finalDirectory: string; request: TopologyAnalysisRequestMessage | null; workerResult?: unknown; error?: WorkerFailure }): Promise<TopologyResult> {
  if (input.outcome !== "preliminary-unsafe" && (input.effectiveUValueWPerM2K !== null || input.evidence !== null)) throw new Error("Non-successful topology outcomes cannot publish numerical evidence or a U-value.");
  const result: TopologyResult = { requestId: input.requestId, sourceRevisionId: input.sourceRevisionId, sourceAssemblyGroupId: input.sourceAssemblyGroupId, correlationId: input.correlationId, idempotencyKey: input.idempotencyKey, outcome: input.outcome, bundle: input.bundle, layerOnlySnapshot: input.layerOnlySnapshot, effectiveUValueWPerM2K: input.effectiveUValueWPerM2K, evidence: input.evidence, artifactDirectory: input.finalDirectory, errorCode: input.errorCode };
  if (input.error) await writeJson(join(input.temporaryDirectory, "error.json"), { schema: "topology-analysis.error.v1", ...input.error, requestId: input.requestId, correlationId: input.correlationId, idempotencyKey: input.idempotencyKey, bundle: input.bundle });
  else await writeJson(join(input.temporaryDirectory, "result.json"), { schema: "topology-analysis.result.v1", ...result, workerResult: input.workerResult ?? null });
  await writeJson(join(input.temporaryDirectory, "manifest.json"), { requestId: input.requestId, outcome: input.outcome, semanticPayload: input.semanticPayload, result, files: input.error ? ["error.json"] : ["result.json", ...(input.evidence?.artifactIndex.map((artifact) => `worker/${artifact.name}`) ?? [])] });
  await mkdir(join(input.finalDirectory, ".."), { recursive: true });
  await rename(input.temporaryDirectory, input.finalDirectory);
  return result;
}

async function readPersistedOutcome(finalDirectory: string, semanticPayload: string, worker: TopologyWorkerRuntime): Promise<TopologyResult | null> {
  try {
    const manifest = JSON.parse(await readFile(join(finalDirectory, "manifest.json"), "utf8")) as { semanticPayload?: unknown; result?: unknown };
    if (manifest.semanticPayload !== semanticPayload) throw new Error("Topology idempotency key was already used with a different semantic payload.");
    if (!isTopologyResult(manifest.result)) throw new Error("Persisted topology artifact is incomplete and cannot be reused.");
    await verifyPersistedEvidence(manifest.result, worker);
    return manifest.result;
  } catch (error) {
    if (isNodeNotFound(error)) return null;
    throw error;
  }
}

function validateCommand(command: SubmitTopologyAnalysisRequest, worker: TopologyWorkerRuntime): void {
  if (!command.sourceRevisionId || !command.sourceAssemblyGroupId || !command.correlationId || !command.idempotencyKey) throw new Error("Topology request requires source Revision, Assembly Group, correlation, and idempotency identities.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(command.correlationId)) throw new Error("Topology correlation identifier must be a UUID.");
  if (!isSha256(command.idempotencyKey)) throw new Error("Topology idempotency key must be a SHA-256 identity.");
  if ((command.recipe === null) !== (command.recipeHash === null)) throw new Error("Topology Recipe and recipe hash must be supplied together.");
  if (command.recipeHash !== null && !isSha256(command.recipeHash)) throw new Error("Topology Recipe hash must be SHA-256.");
  if (!command.bundle.moduleId || !/^\d+\./.test(command.bundle.moduleVersion)) throw new Error("Topology request has an incompatible module identity.");
  if (![command.bundle.registryHash, command.bundle.packHash, command.bundle.runtimeHash].every(isSha256)) throw new Error("Topology request requires SHA-256 bundle identities.");
  if (!worker.runtimeIdentity.executable || worker.runtimeIdentity.runtimeHash !== command.bundle.runtimeHash) throw new Error("Topology request runtime is not pinned to the requested bundle.");
}

function validateWorkerResult(rawOutput: string, request: TopologyAnalysisRequestMessage): { outcome: "preliminary-unsafe"; effectiveUValueWPerM2K: number; evidence: TopologyEvidence; [key: string]: unknown } {
  const lines = rawOutput.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length !== 1) throw failure("failed", "malformed_output", "Worker must emit exactly one JSONL result message.");
  let output: unknown;
  try { output = JSON.parse(lines[0]!); } catch { throw failure("failed", "malformed_output", "Worker emitted invalid JSON."); }
  if (!isRecord(output)) throw failure("failed", "malformed_output", "Worker result must be an object.");
  if (output.schema !== "topology-analysis.result.v1" && output.schema !== "topology-analysis.error.v1") throw failure("rejected", "unsupported_protocol", "Worker returned an unsupported protocol major version.");
  if (output.requestId !== request.requestId || output.correlationId !== request.correlationId || output.idempotencyKey !== request.idempotencyKey || canonicalTopologyJson(output.bundle as JsonValue) !== canonicalTopologyJson(request.bundle)) throw failure("rejected", "identity_mismatch", "Worker result identities do not match the immutable request.");
  if (output.schema === "topology-analysis.error.v1") {
    if (!isFailure(output) || "effectiveUValueWPerM2K" in output) throw failure("failed", "malformed_error", "Worker returned a malformed error message.");
    throw failure(output.outcome, output.code, output.message);
  }
  if (output.outcome !== "preliminary-unsafe" || typeof output.effectiveUValueWPerM2K !== "number" || !Number.isFinite(output.effectiveUValueWPerM2K) || !isCompleteEvidence(output.evidence) || !evidenceMatchesRequest(output.evidence, request) || !uValueMatchesFinalRefinement(output.effectiveUValueWPerM2K, output.evidence)) throw failure("rejected", "invalid_result", "Worker did not return a complete preliminary result and all required pinned evidence.");
  return output as { outcome: "preliminary-unsafe"; effectiveUValueWPerM2K: number; evidence: TopologyEvidence; [key: string]: unknown };
}

async function verifyPersistedEvidence(result: TopologyResult, worker: TopologyWorkerRuntime): Promise<void> {
  if (result.outcome === "preliminary-unsafe" && result.evidence) await worker.verifyArtifacts(result.evidence, join(result.artifactDirectory, "worker"));
}

function classifyFailure(error: unknown): WorkerFailure { return isFailure(error) ? error : failure("failed", "worker_failure", error instanceof Error ? error.message : "Topology worker failed."); }
function failure(outcome: WorkerFailure["outcome"], code: string, message: string): WorkerFailure { return { outcome, code, message }; }
function isFailure(value: unknown): value is WorkerFailure { return isRecord(value) && (value.outcome === "blocked" || value.outcome === "rejected" || value.outcome === "failed" || value.outcome === "cancelled") && typeof value.code === "string" && typeof value.message === "string"; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isCompleteEvidence(value: unknown): value is TopologyEvidence {
  if (!isRecord(value) || !isRecord(value.canonicalAnalysisGeometry) || value.canonicalAnalysisGeometry.schemaVersion !== "canonical-analysis-geometry/v1" || !Array.isArray(value.canonicalAnalysisGeometry.materialRegions) || value.canonicalAnalysisGeometry.materialRegions.length < 2 || !Array.isArray(value.canonicalAnalysisGeometry.interfaces)) return false;
  if (!isRecord(value.topologyAudit)) return false;
  const topologyAudit = value.topologyAudit;
  if (!["gap_area_m2", "overlap_area_m2", "area_residual_m2", "out_of_host_area_m2", "sliver_count"].every((key) => typeof topologyAudit[key] === "number" && Number.isFinite(topologyAudit[key]))) return false;
  if (["gap_area_m2", "overlap_area_m2", "area_residual_m2", "out_of_host_area_m2"].some((key) => Math.abs(topologyAudit[key] as number) > 1e-11) || topologyAudit.sliver_count !== 0) return false;
  if (!isRecord(value.numericalProof) || !Array.isArray(value.numericalProof.refinements) || value.numericalProof.refinements.length < 3 || !isRecord(value.numericalProof.doubleCell) || typeof value.numericalProof.oneTwoCellRelativeDifference !== "number" || !isRecord(value.numericalProof.gates)) return false;
  const gates = value.numericalProof.gates;
  if (!["topology_audit", "mesh_convergence", "solver_residual", "hot_cold_balance", "periodic_balance", "repeat_cell_stability"].every((key) => gates[key] === true)) return false;
  if (!isRecord(value.reproducibilityManifest) || typeof value.reproducibilityManifestHash !== "string" || !/^[a-f0-9]{64}$/.test(value.reproducibilityManifestHash)) return false;
  if (!Array.isArray(value.artifactIndex) || value.artifactIndex.length === 0 || !value.artifactIndex.every((item) => isRecord(item) && typeof item.name === "string" && typeof item.sha256 === "string" && /^[a-f0-9]{64}$/.test(item.sha256) && typeof item.sizeBytes === "number")) return false;
  return numericalEvidencePasses(value.numericalProof);
}
function numericalEvidencePasses(proof: Record<string, unknown>): boolean {
  if (!isRecord(proof.thresholds) || !Array.isArray(proof.refinements) || !isFiniteNumber(proof.oneTwoCellRelativeDifference)) return false;
  const thresholds = proof.thresholds;
  const requiredThresholds = ["mesh_relative_change", "solver_residual", "hot_cold_balance", "periodic_balance", "repeat_cell_stability"];
  if (!requiredThresholds.every((key) => isFiniteNumber(thresholds[key]) && (thresholds[key] as number) >= 0)) return false;
  const refinements = proof.refinements;
  if (!refinements.every((refinement, index) => solveRecordPasses(refinement, thresholds) && (index === 0 ? refinement.relative_change === null : isFiniteNumber(refinement.relative_change)))) return false;
  const final = refinements.at(-1);
  if (!isRecord(final) || !isRecord(final.flux_diagnostics) || !solveRecordPasses(proof.doubleCell, thresholds)) return false;
  const doubleCell = proof.doubleCell;
  const calculatedCellDifference = Math.abs((final.u_value_w_m2k as number) - (doubleCell.u_value_w_m2k as number)) / Math.abs(final.u_value_w_m2k as number);
  return Math.abs(calculatedCellDifference - proof.oneTwoCellRelativeDifference) <= 1e-12
    && (final.relative_change as number) <= (thresholds.mesh_relative_change as number)
    && (final.flux_diagnostics.hot_cold_relative_imbalance as number) <= (thresholds.hot_cold_balance as number)
    && (final.flux_diagnostics.periodic_relative_imbalance as number) <= (thresholds.periodic_balance as number)
    && proof.oneTwoCellRelativeDifference <= (thresholds.repeat_cell_stability as number);
}
function solveRecordPasses(value: unknown, thresholds: Record<string, unknown>): value is Record<string, unknown> {
  if (!isRecord(value) || !isFiniteNumber(value.free_dof_solver_residual) || value.free_dof_solver_residual > (thresholds.solver_residual as number) || !isFiniteNumber(value.u_value_w_m2k) || value.u_value_w_m2k <= 0 || !isRecord(value.flux_diagnostics)) return false;
  const flux = value.flux_diagnostics;
  return isFiniteNumber(flux.hot_in_w_per_m) && isFiniteNumber(flux.cold_out_w_per_m) && isFiniteNumber(flux.periodic_net_out_w_per_m) && isFiniteNumber(flux.hot_cold_relative_imbalance) && flux.hot_cold_relative_imbalance <= (thresholds.hot_cold_balance as number) && isFiniteNumber(flux.periodic_relative_imbalance) && flux.periodic_relative_imbalance <= (thresholds.periodic_balance as number);
}
function uValueMatchesFinalRefinement(uValue: number, evidence: TopologyEvidence): boolean {
  const final = evidence.numericalProof.refinements.at(-1);
  if (!isRecord(final) || !isFiniteNumber(final.u_value_w_m2k)) return false;
  return Math.abs(uValue - final.u_value_w_m2k) <= Math.max(1e-12, Math.abs(final.u_value_w_m2k) * 1e-12);
}
function evidenceMatchesRequest(evidence: TopologyEvidence, request: TopologyAnalysisRequestMessage): boolean {
  if (!isRecord(evidence.reproducibilityManifest)) return false;
  const manifest = evidence.reproducibilityManifest;
  if (!isRecord(manifest.request) || !isRecord(manifest.module)) return false;
  return manifest.request.requestId === request.requestId
    && manifest.request.recipeSha256 === request.recipeHash
    && canonicalTopologyJson(manifest.request.bundle as JsonValue) === canonicalTopologyJson(request.bundle)
    && manifest.module.id === request.bundle.moduleId
    && manifest.module.version === request.bundle.moduleVersion
    && manifest.primitiveRegistrySha256 === request.bundle.registryHash
    && manifest.packBundleSha256 === request.bundle.packHash
    && manifest.runtimeIdentitySha256 === request.bundle.runtimeHash;
}
function isFiniteNumber(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function isSha256(value: string): boolean { return /^[a-f0-9]{64}$/.test(value); }
function isTopologyResult(value: unknown): value is TopologyResult { return isRecord(value) && typeof value.requestId === "string" && typeof value.sourceRevisionId === "string" && typeof value.sourceAssemblyGroupId === "string" && typeof value.correlationId === "string" && typeof value.idempotencyKey === "string" && typeof value.artifactDirectory === "string" && typeof value.outcome === "string" && ((value.outcome === "preliminary-unsafe" && typeof value.effectiveUValueWPerM2K === "number" && isCompleteEvidence(value.evidence)) || (value.outcome !== "preliminary-unsafe" && value.effectiveUValueWPerM2K === null && value.evidence === null)); }
function isNodeNotFound(error: unknown): boolean { return isRecord(error) && error.code === "ENOENT"; }
function safePathSegment(value: string): string { if (!/^[A-Za-z0-9._-]+$/.test(value)) throw new Error("Topology idempotency key contains an unsafe artifact path segment."); return value; }
async function writeJson(path: string, value: unknown): Promise<void> { await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
