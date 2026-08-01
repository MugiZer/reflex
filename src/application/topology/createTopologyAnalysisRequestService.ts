import { createHash, randomUUID } from "node:crypto";

import type { TopologyArtifactFile, TopologyArtifactStore, TopologyArtifactWorkspace } from "./topologyArtifactStore.js";
import { canonicalTopologyJson } from "../../domain/topology/canonicalTopologyJson.js";
import type { JsonValue, SubmitTopologyAnalysisRequest, TopologyAnalysisOutcome, TopologyAnalysisRequestMessage, TopologyEvidence, TopologyResult, TopologyWorkerRuntime } from "../../domain/topology/topologyTypes.js";

type Options = { artifactStore: TopologyArtifactStore; worker: TopologyWorkerRuntime; now?: () => string };
const DEFAULT_WORKER_DEADLINE_MS = 120_000;
const MAX_WORKER_OUTPUT_BYTES = 32 * 1024 * 1024;
type WorkerFailure = { outcome: Extract<TopologyAnalysisOutcome, "blocked" | "rejected" | "failed" | "cancelled">; code: string; message: string; phase?: string; retryable?: boolean };

/** Canonical boundary validator for persisted and application-consumed topology outcomes. */
export function requireCompleteTopologyResult(value: unknown): TopologyResult {
  if (!isTopologyResult(value)) throw new Error("Topology request seam returned an incomplete result.");
  return value;
}

/** Coordinates the optional topology use case without owning persistence mechanics or layer-only state. */
export function createTopologyAnalysisRequestService(options: Options) {
  const outcomesByKey = new Map<string, { semanticPayload: string; result: TopologyResult }>();
  const inFlightByKey = new Map<string, { semanticPayload: string; promise: Promise<TopologyResult> }>();
  const now = options.now ?? (() => new Date().toISOString());

  return {
    async submit(command: SubmitTopologyAnalysisRequest): Promise<TopologyResult> {
      const semanticPayload = canonicalTopologyJson({ sourceRevisionId: command.sourceRevisionId, sourceAssemblyGroupId: command.sourceAssemblyGroupId, recipe: command.recipe, recipeHash: command.recipeHash, bundle: command.bundle });
      const idempotencyKey = safePathSegment(command.idempotencyKey);
      const existing = outcomesByKey.get(idempotencyKey);
      if (existing) {
        if (existing.semanticPayload !== semanticPayload) {
          return publishDurableFailure(command, semanticPayload, idempotencyKey, failure("rejected", "idempotency_conflict", "Topology idempotency key was already used with a different semantic payload."));
        }
        try {
          const persisted = await readPersistedOutcome(existing.result.artifactDirectory, semanticPayload, options.worker, options.artifactStore);
          if (persisted) return persisted;
        } catch (error) {
          return publishDurableFailure(command, semanticPayload, idempotencyKey, classifyPersistenceFailure(error));
        }
      }

      const inFlight = inFlightByKey.get(idempotencyKey);
      if (inFlight) {
        if (inFlight.semanticPayload !== semanticPayload) {
          return publishDurableFailure(command, semanticPayload, idempotencyKey, failure("rejected", "idempotency_conflict", "Topology idempotency key was already used with a different semantic payload."));
        }
        return inFlight.promise;
      }

      const promise = submitFresh(command, semanticPayload, idempotencyKey);
      inFlightByKey.set(idempotencyKey, { semanticPayload, promise });
      try {
        return await promise;
      } finally {
        if (inFlightByKey.get(idempotencyKey)?.promise === promise) inFlightByKey.delete(idempotencyKey);
      }
    },
    getByIdempotencyKey(idempotencyKey: string): TopologyResult | null { return outcomesByKey.get(idempotencyKey)?.result ?? null; },
    async verifyPersistedResult(expected: TopologyResult): Promise<TopologyResult> {
      const manifest = await options.artifactStore.readManifest(expected.artifactDirectory) as { semanticPayload?: unknown } | null;
      if (!manifest || typeof manifest.semanticPayload !== "string") throw Object.assign(new Error("Persisted topology artifact manifest is incomplete and cannot be used."), { code: "artifact_integrity_failure" });
      const persisted = await readPersistedOutcome(expected.artifactDirectory, manifest.semanticPayload, options.worker, options.artifactStore, manifest);
      if (!persisted || canonicalTopologyJson(persisted as unknown as JsonValue) !== canonicalTopologyJson(expected as unknown as JsonValue)) throw Object.assign(new Error("Persisted topology result does not match its immutable Job review."), { code: "artifact_integrity_failure" });
      return persisted;
    },
  };

  async function submitFresh(command: SubmitTopologyAnalysisRequest, semanticPayload: string, idempotencyKey: string): Promise<TopologyResult> {
    const requestId = randomUUID();
    const workspace = options.artifactStore.workspaceFor(idempotencyKey, requestId);
    let claim: { acquired: boolean; manifest: unknown | null };
    try {
      claim = await options.artifactStore.claim(workspace);
    } catch (error) {
      return publishDurableFailure(command, semanticPayload, idempotencyKey, classifyPersistenceFailure(error));
    }
    if (!claim.acquired) {
      try {
        const persisted = await readPersistedOutcome(workspace.finalDirectory, semanticPayload, options.worker, options.artifactStore, claim.manifest);
        if (!persisted) throw new Error("Topology artifact claim resolved to an incomplete published outcome.");
        outcomesByKey.set(idempotencyKey, { semanticPayload, result: persisted });
        return persisted;
      } catch (error) {
        const result = await publishDurableFailure(command, semanticPayload, idempotencyKey, classifyPersistenceFailure(error));
        outcomesByKey.set(idempotencyKey, { semanticPayload, result });
        return result;
      }
    }

    const base = { requestId, sourceRevisionId: command.sourceRevisionId, sourceAssemblyGroupId: command.sourceAssemblyGroupId, correlationId: command.correlationId, idempotencyKey, bundle: command.bundle, createdAt: now() };
    const request = createRequestMessage(command, base, workspace);
    let result: TopologyResult;
    try {
      await options.artifactStore.removeTemporaryDirectory(workspace.temporaryDirectory);
      await options.artifactStore.createTemporaryDirectory(workspace.temporaryDirectory);
      try {
        validateCommand(command, options.worker);
        if (request) await options.artifactStore.writeJson(workspace.temporaryDirectory, "request.json", request);
        if (!request) {
          result = await publishOutcome({ ...base, semanticPayload, outcome: "not-requested", effectiveUValueWPerM2K: null, evidence: null, errorCode: null, layerOnlySnapshot: command.layerOnlySnapshot, workspace, request, artifactStore: options.artifactStore, worker: options.worker });
        } else {
          if (options.worker.preflight) {
            try {
              await options.worker.preflight();
            } catch (error) {
              throw failure("failed", "topology_runtime_preflight_failed", error instanceof Error ? error.message : "Topology runtime preflight failed.");
            }
          }
          const rawOutput = await options.worker.runJsonl(JSON.stringify(request) + "\n", {
            deadlineAt: command.deadlineAt ?? new Date(Date.now() + DEFAULT_WORKER_DEADLINE_MS).toISOString(),
            signal: command.cancellationSignal,
          });
          if (Buffer.byteLength(rawOutput, "utf8") > MAX_WORKER_OUTPUT_BYTES) throw failure("failed", "worker_output_limit", "Topology worker output exceeded its limit.");
          const workerResult = validateWorkerResult(rawOutput, request);
          await options.worker.verifyArtifacts(workerResult.evidence, request.artifactDestination);
          result = await publishOutcome({ ...base, semanticPayload, outcome: workerResult.outcome, effectiveUValueWPerM2K: workerResult.effectiveUValueWPerM2K, evidence: workerResult.evidence, errorCode: null, layerOnlySnapshot: command.layerOnlySnapshot, workspace, request, workerResult, artifactStore: options.artifactStore, worker: options.worker });
        }
      } catch (error) {
        const failure = classifyFailure(error);
        result = await publishOutcome({ ...base, semanticPayload, outcome: failure.outcome, effectiveUValueWPerM2K: null, evidence: null, errorCode: failure.code, layerOnlySnapshot: command.layerOnlySnapshot, workspace, request, error: failure, artifactStore: options.artifactStore, worker: options.worker });
      }
    } catch (error) {
      throw error;
    } finally {
      await options.artifactStore.removeTemporaryDirectory(workspace.temporaryDirectory);
      await options.artifactStore.release(workspace);
    }
    outcomesByKey.set(idempotencyKey, { semanticPayload, result });
    return result;
  }

  async function publishDurableFailure(command: SubmitTopologyAnalysisRequest, semanticPayload: string, idempotencyKey: string, error: WorkerFailure): Promise<TopologyResult> {
    const requestId = randomUUID();
    const variant = `replay-${sha256(semanticPayload).slice(0, 16)}`;
    const workspace = options.artifactStore.workspaceFor(idempotencyKey, requestId, variant);
    const claim = await options.artifactStore.claim(workspace);
    if (!claim.acquired) {
      const persisted = await readPersistedOutcome(workspace.finalDirectory, semanticPayload, options.worker, options.artifactStore, claim.manifest);
      if (persisted) return persisted;
      throw new Error("Topology replay-failure artifact claim resolved to an incomplete outcome.");
    }
    try {
      await options.artifactStore.removeTemporaryDirectory(workspace.temporaryDirectory);
      await options.artifactStore.createTemporaryDirectory(workspace.temporaryDirectory);
      const base = { requestId, sourceRevisionId: command.sourceRevisionId, sourceAssemblyGroupId: command.sourceAssemblyGroupId, correlationId: command.correlationId, idempotencyKey, bundle: command.bundle, createdAt: now() };
      const request = createRequestMessage(command, base, workspace);
      return await publishOutcome({ ...base, semanticPayload, outcome: error.outcome, effectiveUValueWPerM2K: null, evidence: null, errorCode: error.code, layerOnlySnapshot: command.layerOnlySnapshot, workspace, request, error, artifactStore: options.artifactStore, worker: options.worker });
    } finally {
      await options.artifactStore.removeTemporaryDirectory(workspace.temporaryDirectory);
      await options.artifactStore.release(workspace);
    }
  }
}

function createRequestMessage(command: SubmitTopologyAnalysisRequest, base: { requestId: string; sourceRevisionId: string; sourceAssemblyGroupId: string; correlationId: string; idempotencyKey: string; bundle: SubmitTopologyAnalysisRequest["bundle"]; createdAt: string }, workspace: TopologyArtifactWorkspace): TopologyAnalysisRequestMessage | null {
  if (command.recipe === null || command.recipeHash === null) return null;
  return { schema: "topology-analysis.request.v1", ...base, recipe: command.recipe, recipeHash: command.recipeHash, artifactDestination: workspace.workerArtifactDirectory };
}

async function publishOutcome(input: { requestId: string; sourceRevisionId: string; sourceAssemblyGroupId: string; correlationId: string; idempotencyKey: string; bundle: SubmitTopologyAnalysisRequest["bundle"]; semanticPayload: string; outcome: TopologyAnalysisOutcome; effectiveUValueWPerM2K: number | null; evidence: TopologyEvidence | null; errorCode: string | null; layerOnlySnapshot: JsonValue; workspace: TopologyArtifactWorkspace; request: TopologyAnalysisRequestMessage | null; artifactStore: TopologyArtifactStore; worker: TopologyWorkerRuntime; workerResult?: unknown; error?: WorkerFailure }): Promise<TopologyResult> {
  if (input.outcome !== "preliminary-unsafe" && (input.effectiveUValueWPerM2K !== null || input.evidence !== null)) throw new Error("Non-successful topology outcomes cannot publish numerical evidence or a U-value.");
  const diagnostics = input.error ? { code: input.error.code, message: input.error.message, phase: input.error.phase ?? null, retryable: input.error.retryable ?? false } : null;
  const result: TopologyResult = { requestId: input.requestId, sourceRevisionId: input.sourceRevisionId, sourceAssemblyGroupId: input.sourceAssemblyGroupId, correlationId: input.correlationId, idempotencyKey: input.idempotencyKey, outcome: input.outcome, bundle: input.bundle, layerOnlySnapshot: input.layerOnlySnapshot, effectiveUValueWPerM2K: input.effectiveUValueWPerM2K, evidence: input.evidence, artifactDirectory: input.workspace.finalDirectory, errorCode: input.errorCode, diagnostics };
  const files: TopologyArtifactFile[] = [];
  if (input.request) files.push(await input.artifactStore.writeJson(input.workspace.temporaryDirectory, "request.json", input.request));
  if (input.error) {
    const errorFilename = input.outcome === "cancelled" ? "cancel.json" : "error.json";
    const errorFile = await input.artifactStore.writeJson(input.workspace.temporaryDirectory, errorFilename, { schema: "topology-analysis.error.v1", ...input.error, requestId: input.requestId, correlationId: input.correlationId, idempotencyKey: input.idempotencyKey, bundle: input.bundle });
    files.push(errorFile);
  } else {
    files.push(await input.artifactStore.writeJson(input.workspace.temporaryDirectory, "result.json", { schema: "topology-analysis.result.v1", ...result, workerResult: input.workerResult ?? null }));
  }
  for (const artifact of input.evidence?.artifactIndex ?? []) files.push({ path: `worker/${artifact.name}`, sha256: artifact.sha256, sizeBytes: artifact.sizeBytes });
  const manifestPayload = { schema: "topology-artifact-manifest.v1", requestId: input.requestId, outcome: input.outcome, semanticPayload: input.semanticPayload, result, files };
  const manifestSha256 = sha256(canonicalTopologyJson(manifestPayload as JsonValue));
  await input.artifactStore.writeJson(input.workspace.temporaryDirectory, "manifest.json", { ...manifestPayload, manifestSha256 });
  try {
    await input.artifactStore.publish(input.workspace);
    return result;
  } catch (error) {
    const persisted = await readPersistedOutcome(input.workspace.finalDirectory, input.semanticPayload, input.worker, input.artifactStore);
    if (persisted) return persisted;
    throw error;
  }
}

async function readPersistedOutcome(finalDirectory: string, semanticPayload: string, worker: TopologyWorkerRuntime, artifactStore: TopologyArtifactStore, knownManifest?: unknown): Promise<TopologyResult | null> {
  const manifest = (knownManifest ?? await artifactStore.readManifest(finalDirectory)) as { semanticPayload?: unknown; result?: unknown; manifestSha256?: unknown; files?: unknown } | null;
  if (!manifest) return null;
  if (typeof manifest.manifestSha256 !== "string" || !Array.isArray(manifest.files) || !manifest.files.every(isArtifactFile)) throw Object.assign(new Error("Persisted topology artifact manifest is incomplete and cannot be reused."), { code: "artifact_integrity_failure" });
  const { manifestSha256, ...manifestPayload } = manifest;
  if (sha256(canonicalTopologyJson(manifestPayload as JsonValue)) !== manifestSha256) throw Object.assign(new Error("Persisted topology artifact manifest failed integrity verification."), { code: "artifact_integrity_failure" });
  if (manifest.semanticPayload !== semanticPayload) throw Object.assign(new Error("Topology idempotency key was already used with a different semantic payload."), { code: "idempotency_conflict" });
  await artifactStore.verifyFiles(finalDirectory, manifest.files);
  if (!isTopologyResult(manifest.result)) throw Object.assign(new Error("Persisted topology artifact is incomplete and cannot be reused."), { code: "artifact_integrity_failure" });
  await verifyPersistedEvidence(manifest.result, worker, artifactStore);
  return manifest.result;
}

function validateCommand(command: SubmitTopologyAnalysisRequest, worker: TopologyWorkerRuntime): void {
  if (!command.sourceRevisionId || !command.sourceAssemblyGroupId || !command.correlationId || !command.idempotencyKey) throw failure("rejected", "invalid_request", "Topology request identities are incomplete.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(command.correlationId)) throw failure("rejected", "invalid_correlation_id", "Topology correlation identifier must be a UUID.");
  if (!isSha256(command.idempotencyKey)) throw failure("rejected", "invalid_idempotency_key", "Topology idempotency key must be a SHA-256 identity.");
  if ((command.recipe === null) !== (command.recipeHash === null)) throw failure("rejected", "invalid_request", "Topology Recipe and recipe hash must be supplied together.");
  if (command.recipeHash !== null && (!isSha256(command.recipeHash) || sha256(canonicalTopologyJson(command.recipe)) !== command.recipeHash)) throw failure("rejected", "recipe_hash_mismatch", "Topology Recipe hash does not match its immutable payload.");
  if (!isRecord(command.recipe) && command.recipe !== null) throw failure("rejected", "incomplete_recipe", "Topology Recipe must be a complete object.");
  if (!command.bundle.moduleId || !/^\d+\./.test(command.bundle.moduleVersion)) throw failure("rejected", "incompatible_bundle_identity", "Topology request has an incompatible module identity.");
  if (![command.bundle.registryHash, command.bundle.packHash, command.bundle.runtimeHash].every(isSha256)) throw failure("rejected", "incompatible_bundle_identity", "Topology request requires SHA-256 bundle identities.");
  if (!worker.runtimeIdentity.executable || worker.runtimeIdentity.runtimeHash !== command.bundle.runtimeHash) throw failure("rejected", "incompatible_runtime_identity", "Topology request runtime is not pinned to the requested bundle.");
}

function validateWorkerResult(rawOutput: string, request: TopologyAnalysisRequestMessage): { outcome: "preliminary-unsafe"; effectiveUValueWPerM2K: number; evidence: TopologyEvidence; [key: string]: unknown } {
  const lines = rawOutput.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length !== 1) throw failure("failed", "malformed_output", "Worker must emit exactly one JSONL result message.");
  let output: unknown;
  try { output = JSON.parse(lines[0]!); } catch { throw failure("failed", "malformed_output", "Worker emitted invalid JSON."); }
  if (!isRecord(output)) throw failure("failed", "malformed_output", "Worker result must be an object.");
  if (output.schema !== "topology-analysis.result.v1" && output.schema !== "topology-analysis.error.v1") throw failure("failed", "malformed_output", "Worker returned an unsupported or malformed protocol message.");
  if (output.requestId !== request.requestId || output.correlationId !== request.correlationId || output.idempotencyKey !== request.idempotencyKey || canonicalTopologyJson(output.bundle as JsonValue) !== canonicalTopologyJson(request.bundle)) throw failure("rejected", "identity_mismatch", "Worker result identities do not match the immutable request.");
  if (output.schema === "topology-analysis.error.v1") {
    if (!isFailure(output) || "effectiveUValueWPerM2K" in output) throw failure("failed", "malformed_error", "Worker returned a malformed error message.");
    throw failure(output.outcome, output.code, output.message, typeof output.phase === "string" ? output.phase : undefined, output.retryable === true);
  }
  if (output.outcome !== "preliminary-unsafe" || typeof output.effectiveUValueWPerM2K !== "number" || !Number.isFinite(output.effectiveUValueWPerM2K) || !isCompleteEvidence(output.evidence) || !evidenceMatchesRequest(output.evidence, request) || !uValueMatchesFinalRefinement(output.effectiveUValueWPerM2K, output.evidence)) throw failure("rejected", "invalid_result", "Worker did not return a complete preliminary result and all required pinned evidence.");
  return output as { outcome: "preliminary-unsafe"; effectiveUValueWPerM2K: number; evidence: TopologyEvidence; [key: string]: unknown };
}

async function verifyPersistedEvidence(result: TopologyResult, worker: TopologyWorkerRuntime, artifactStore: TopologyArtifactStore): Promise<void> {
  if (result.outcome === "preliminary-unsafe" && result.evidence) await worker.verifyArtifacts(result.evidence, artifactStore.workerArtifactDirectory(result.artifactDirectory));
}

function classifyFailure(error: unknown): WorkerFailure { return isFailure(error) ? error : failure("failed", "worker_failure", error instanceof Error ? error.message : "Topology worker failed."); }
function classifyPersistenceFailure(error: unknown): WorkerFailure {
  const code = error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "artifact_integrity_failure";
  const outcome = code === "idempotency_conflict" ? "rejected" : "failed";
  return failure(outcome, code, error instanceof Error ? error.message : "Persisted topology artifact failed integrity verification.");
}
function failure(outcome: WorkerFailure["outcome"], code: string, message: string, phase?: string, retryable = false): WorkerFailure { return { outcome, code, message, ...(phase ? { phase } : {}), retryable }; }
function isFailure(value: unknown): value is WorkerFailure { return isRecord(value) && (value.outcome === "blocked" || value.outcome === "rejected" || value.outcome === "failed" || value.outcome === "cancelled") && typeof value.code === "string" && typeof value.message === "string"; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isArtifactFile(value: unknown): value is TopologyArtifactFile { return isRecord(value) && typeof value.path === "string" && /^[a-f0-9]{64}$/.test(String(value.sha256)) && typeof value.sizeBytes === "number" && Number.isInteger(value.sizeBytes) && value.sizeBytes >= 0; }
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
  return Math.abs(calculatedCellDifference - proof.oneTwoCellRelativeDifference) <= 1e-12 && (final.relative_change as number) <= (thresholds.mesh_relative_change as number) && (final.flux_diagnostics.hot_cold_relative_imbalance as number) <= (thresholds.hot_cold_balance as number) && (final.flux_diagnostics.periodic_relative_imbalance as number) <= (thresholds.periodic_balance as number) && proof.oneTwoCellRelativeDifference <= (thresholds.repeat_cell_stability as number);
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
  return manifest.request.requestId === request.requestId && manifest.request.recipeSha256 === request.recipeHash && canonicalTopologyJson(manifest.request.bundle as JsonValue) === canonicalTopologyJson(request.bundle) && manifest.module.id === request.bundle.moduleId && manifest.module.version === request.bundle.moduleVersion && manifest.primitiveRegistrySha256 === request.bundle.registryHash && manifest.packBundleSha256 === request.bundle.packHash && manifest.runtimeIdentitySha256 === request.bundle.runtimeHash;
}
function isFiniteNumber(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function isSha256(value: string): boolean { return /^[a-f0-9]{64}$/.test(value); }
function isTopologyResult(value: unknown): value is TopologyResult {
  return isRecord(value) && typeof value.requestId === "string" && typeof value.sourceRevisionId === "string" && typeof value.sourceAssemblyGroupId === "string" && typeof value.correlationId === "string" && typeof value.idempotencyKey === "string" && typeof value.artifactDirectory === "string" && isTopologyOutcome(value.outcome) && (value.diagnostics === null || (isRecord(value.diagnostics) && typeof value.diagnostics.code === "string" && typeof value.diagnostics.message === "string")) && ((value.outcome === "preliminary-unsafe" && typeof value.effectiveUValueWPerM2K === "number" && isCompleteEvidence(value.evidence)) || (value.outcome !== "preliminary-unsafe" && value.effectiveUValueWPerM2K === null && value.evidence === null));
}
function isTopologyOutcome(value: unknown): value is TopologyAnalysisOutcome { return value === "not-requested" || value === "preliminary-unsafe" || value === "blocked" || value === "rejected" || value === "failed" || value === "cancelled"; }
function safePathSegment(value: string): string { if (!SAFE_SEGMENT.test(value)) throw new Error("Topology idempotency key contains an unsafe artifact path segment."); return value; }
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;
