export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export type TopologyBundleIdentity = {
  moduleId: string;
  moduleVersion: string;
  registryHash: string;
  packHash: string;
  runtimeHash: string;
};

export type TopologyAnalysisOutcome = "not-requested" | "preliminary-unsafe" | "blocked" | "rejected" | "failed" | "cancelled";

export type TopologyWorkerRuntime = {
  /** Release-pinned executable or container identity. Never resolve a worker from PATH. */
  runtimeIdentity: { executable: string; runtimeHash: string };
  /** Optional infrastructure preflight for release-owned executable and worker assets. */
  preflight?: () => Promise<void>;
  runJsonl(message: string, options: { deadlineAt: string; signal?: AbortSignal }): Promise<string>;
  verifyArtifacts(evidence: TopologyEvidence, artifactDestination: string): Promise<void>;
};

export type TopologyEvidence = {
  canonicalAnalysisGeometry: {
    schemaVersion: "canonical-analysis-geometry/v1";
    materialRegions: readonly JsonValue[];
    interfaces: readonly JsonValue[];
    [key: string]: JsonValue;
  };
  topologyAudit: {
    gap_area_m2: number;
    overlap_area_m2: number;
    area_residual_m2: number;
    out_of_host_area_m2: number;
    sliver_count: number;
    [key: string]: number;
  };
  numericalProof: {
    refinements: readonly JsonValue[];
    doubleCell: JsonValue;
    oneTwoCellRelativeDifference: number;
    gates: {
      topology_audit: true;
      mesh_convergence: true;
      solver_residual: true;
      hot_cold_balance: true;
      periodic_balance: true;
      repeat_cell_stability: true;
    };
    [key: string]: JsonValue;
  };
  reproducibilityManifest: JsonValue;
  reproducibilityManifestHash: string;
  artifactIndex: readonly { name: string; sha256: string; sizeBytes: number }[];
};

export type TopologyDiagnostics = {
  code: string;
  message: string;
  phase: string | null;
  retryable: boolean;
};

export type SubmitTopologyAnalysisRequest = {
  sourceRevisionId: string;
  sourceAssemblyGroupId: string;
  correlationId: string;
  idempotencyKey: string;
  recipe: JsonValue | null;
  recipeHash: string | null;
  bundle: TopologyBundleIdentity;
  /** Carried only to prove preservation at the application seam; topology never writes it. */
  layerOnlySnapshot: JsonValue;
  deadlineAt?: string;
  cancellationSignal?: AbortSignal;
};

export type TopologyResult = {
  requestId: string;
  sourceRevisionId: string;
  sourceAssemblyGroupId: string;
  correlationId: string;
  idempotencyKey: string;
  /** Hash of the immutable Recipe used for this request, or null for no-request outcomes. */
  recipeHash: string | null;
  outcome: TopologyAnalysisOutcome;
  bundle: TopologyBundleIdentity;
  layerOnlySnapshot: JsonValue;
  effectiveUValueWPerM2K: number | null;
  evidence: TopologyEvidence | null;
  artifactDirectory: string;
  errorCode: string | null;
  diagnostics: TopologyDiagnostics | null;
};

export type TopologyAnalysisRequestMessage = {
  schema: "topology-analysis.request.v1";
  requestId: string;
  correlationId: string;
  idempotencyKey: string;
  sourceRevisionId: string;
  sourceAssemblyGroupId: string;
  recipe: JsonValue;
  recipeHash: string;
  bundle: TopologyBundleIdentity;
  artifactDestination: string;
};

export type TopologyAnalysisCancelMessage = {
  schema: "topology-analysis.cancel.v1";
  requestId: string;
  correlationId: string;
  idempotencyKey: string;
  reason: "deadline" | "client-request" | "worker-shutdown";
};
