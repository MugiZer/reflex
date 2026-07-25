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
  runJsonl(message: string, options: { deadlineAt: string | null }): Promise<string>;
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
};

export type TopologyResult = {
  requestId: string;
  sourceRevisionId: string;
  sourceAssemblyGroupId: string;
  correlationId: string;
  idempotencyKey: string;
  outcome: TopologyAnalysisOutcome;
  bundle: TopologyBundleIdentity;
  layerOnlySnapshot: JsonValue;
  effectiveUValueWPerM2K: number | null;
  artifactDirectory: string;
  errorCode: string | null;
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
