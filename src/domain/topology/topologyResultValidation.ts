import type {
  JsonValue,
  TopologyAnalysisOutcome,
  TopologyAnalysisRequestMessage,
  TopologyEvidence,
  TopologyResult,
} from "./topologyTypes.js";
import { canonicalTopologyJson } from "./canonicalTopologyJson.js";

/** Canonical shape gate for topology results crossing a durable boundary. */
export function requireCompleteTopologyResult(value: unknown): TopologyResult {
  if (!isTopologyResult(value)) throw new Error("Topology request seam returned an incomplete result.");
  return value;
}

export function isCompleteTopologyResult(value: unknown): value is TopologyResult {
  return isTopologyResult(value);
}

export function isValidTopologyRecipeHash(value: unknown): value is string {
  return isSha256(value);
}

export function isCompleteTopologyEvidence(value: unknown): value is TopologyEvidence {
  return isCompleteEvidence(value);
}

export function topologyEvidenceMatchesRequest(evidence: TopologyEvidence, request: TopologyAnalysisRequestMessage): boolean {
  const manifestValue = evidence.reproducibilityManifest;
  if (!isRecord(manifestValue)) return false;
  const manifest = manifestValue as Record<string, any>;
  if (!isRecord(manifest.request) || !isRecord(manifest.module)) return false;
  return manifest.request.requestId === request.requestId && manifest.request.recipeSha256 === request.recipeHash && canonicalTopologyJson(manifest.request.bundle as JsonValue) === canonicalTopologyJson(request.bundle) && manifest.module.id === request.bundle.moduleId && manifest.module.version === request.bundle.moduleVersion && manifest.primitiveRegistrySha256 === request.bundle.registryHash && manifest.packBundleSha256 === request.bundle.packHash && manifest.runtimeIdentitySha256 === request.bundle.runtimeHash;
}

export function topologyUValueMatchesFinalRefinement(uValue: number, evidence: TopologyEvidence): boolean {
  const finalValue = evidence.numericalProof.refinements.at(-1);
  const final = finalValue as Record<string, any>;
  if (!isRecord(final) || !isFiniteNumber(final.u_value_w_m2k)) return false;
  return Math.abs(uValue - final.u_value_w_m2k) <= Math.max(1e-12, Math.abs(final.u_value_w_m2k) * 1e-12);
}

function isTopologyResult(value: unknown): value is TopologyResult {
  return isRecord(value)
    && typeof value.requestId === "string"
    && typeof value.sourceRevisionId === "string"
    && typeof value.sourceAssemblyGroupId === "string"
    && typeof value.correlationId === "string"
    && typeof value.idempotencyKey === "string"
    && (value.recipeHash === null || isSha256(value.recipeHash))
    && typeof value.artifactDirectory === "string"
    && isTopologyOutcome(value.outcome)
    && isBundle(value.bundle)
    && "layerOnlySnapshot" in value
    && (value.outcome !== "preliminary-unsafe" || isSha256(value.recipeHash))
    && (value.errorCode === null || typeof value.errorCode === "string")
    && (value.diagnostics === null || (isRecord(value.diagnostics) && typeof value.diagnostics.code === "string" && typeof value.diagnostics.message === "string" && (value.diagnostics.phase === null || typeof value.diagnostics.phase === "string") && typeof value.diagnostics.retryable === "boolean"))
    && ((value.outcome === "preliminary-unsafe" && typeof value.effectiveUValueWPerM2K === "number" && isCompleteEvidence(value.evidence)) || (value.outcome !== "preliminary-unsafe" && value.effectiveUValueWPerM2K === null && value.evidence === null));
}

function isTopologyOutcome(value: unknown): value is TopologyAnalysisOutcome {
  return value === "not-requested" || value === "preliminary-unsafe" || value === "blocked" || value === "rejected" || value === "failed" || value === "cancelled";
}

function isBundle(value: unknown): boolean {
  return isRecord(value) && typeof value.moduleId === "string" && typeof value.moduleVersion === "string" && isSha256(value.registryHash) && isSha256(value.packHash) && isSha256(value.runtimeHash);
}

function isCompleteEvidence(value: unknown): value is TopologyEvidence {
  if (!isRecord(value) || !isRecord(value.canonicalAnalysisGeometry) || value.canonicalAnalysisGeometry.schemaVersion !== "canonical-analysis-geometry/v1" || !Array.isArray(value.canonicalAnalysisGeometry.materialRegions) || value.canonicalAnalysisGeometry.materialRegions.length < 2 || !Array.isArray(value.canonicalAnalysisGeometry.interfaces)) return false;
  if (!isRecord(value.topologyAudit)) return false;
  const topologyAudit = value.topologyAudit;
  if (!["gap_area_m2", "overlap_area_m2", "area_residual_m2", "out_of_host_area_m2", "sliver_count"].every((key) => typeof topologyAudit[key] === "number" && Number.isFinite(topologyAudit[key]))) return false;
  if (["gap_area_m2", "overlap_area_m2", "area_residual_m2", "out_of_host_area_m2"].some((key) => Math.abs(topologyAudit[key] as number) > 1e-11) || topologyAudit.sliver_count !== 0) return false;
  if (!isRecord(value.numericalProof) || !Array.isArray(value.numericalProof.refinements) || value.numericalProof.refinements.length < 3 || !isRecord(value.numericalProof.doubleCell) || typeof value.numericalProof.oneTwoCellRelativeDifference !== "number" || !isRecord(value.numericalProof.gates)) return false;
  const gates = value.numericalProof.gates;
  if (!["topology_audit", "mesh_convergence", "solver_residual", "hot_cold_balance", "periodic_balance", "repeat_cell_stability"].every((key) => gates[key] === true)) return false;
  if (!isRecord(value.reproducibilityManifest) || typeof value.reproducibilityManifestHash !== "string" || !isSha256(value.reproducibilityManifestHash)) return false;
  if (!Array.isArray(value.artifactIndex) || value.artifactIndex.length === 0 || !value.artifactIndex.every((item) => isRecord(item) && typeof item.name === "string" && isSha256(item.sha256) && typeof item.sizeBytes === "number" && Number.isInteger(item.sizeBytes) && item.sizeBytes >= 0)) return false;
  return numericalEvidencePasses(value.numericalProof);
}

function numericalEvidencePasses(proof: Record<string, unknown>): boolean {
  if (!isRecord(proof.thresholds) || !Array.isArray(proof.refinements) || !isFiniteNumber(proof.oneTwoCellRelativeDifference)) return false;
  const thresholds = proof.thresholds;
  const requiredThresholds = ["mesh_relative_change", "solver_residual", "hot_cold_balance", "periodic_balance", "repeat_cell_stability"];
  if (!requiredThresholds.every((key) => isFiniteNumber(thresholds[key]) && (thresholds[key] as number) >= 0)) return false;
  const refinements = proof.refinements;
  if (!refinements.every((refinement, index) => solveRecordPasses(refinement, thresholds) && (index === 0 ? isRecord(refinement) && refinement.relative_change === null : isRecord(refinement) && isFiniteNumber(refinement.relative_change)))) return false;
  const final = refinements.at(-1);
  if (!isRecord(final) || !isRecord(final.flux_diagnostics) || !solveRecordPasses(proof.doubleCell, thresholds)) return false;
  const doubleCell = proof.doubleCell as Record<string, unknown>;
  const calculatedCellDifference = Math.abs((final.u_value_w_m2k as number) - (doubleCell.u_value_w_m2k as number)) / Math.abs(final.u_value_w_m2k as number);
  return Math.abs(calculatedCellDifference - proof.oneTwoCellRelativeDifference) <= 1e-12 && (final.relative_change as number) <= (thresholds.mesh_relative_change as number) && (final.flux_diagnostics.hot_cold_relative_imbalance as number) <= (thresholds.hot_cold_balance as number) && (final.flux_diagnostics.periodic_relative_imbalance as number) <= (thresholds.periodic_balance as number) && proof.oneTwoCellRelativeDifference <= (thresholds.repeat_cell_stability as number);
}

function solveRecordPasses(value: unknown, thresholds: Record<string, unknown>): value is Record<string, unknown> {
  if (!isRecord(value) || !isFiniteNumber(value.free_dof_solver_residual) || value.free_dof_solver_residual > (thresholds.solver_residual as number) || !isFiniteNumber(value.u_value_w_m2k) || value.u_value_w_m2k <= 0 || !isRecord(value.flux_diagnostics)) return false;
  const flux = value.flux_diagnostics;
  return isFiniteNumber(flux.hot_in_w_per_m) && isFiniteNumber(flux.cold_out_w_per_m) && isFiniteNumber(flux.periodic_net_out_w_per_m) && isFiniteNumber(flux.hot_cold_relative_imbalance) && flux.hot_cold_relative_imbalance <= (thresholds.hot_cold_balance as number) && isFiniteNumber(flux.periodic_relative_imbalance) && flux.periodic_relative_imbalance <= (thresholds.periodic_balance as number);
}

function isFiniteNumber(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function isSha256(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function isRecord(value: unknown): value is Record<string, any> { return typeof value === "object" && value !== null && !Array.isArray(value); }
