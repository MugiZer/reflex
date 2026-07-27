export type TopologyArtifactWorkspace = {
  temporaryDirectory: string;
  finalDirectory: string;
  workerArtifactDirectory: string;
};

/** Persistence seam for topology evidence; filesystem mechanics stay in infrastructure. */
export type TopologyArtifactStore = {
  workspaceFor(idempotencyKey: string, requestId: string): TopologyArtifactWorkspace;
  workerArtifactDirectory(finalDirectory: string): string;
  createTemporaryDirectory(directory: string): Promise<void>;
  removeStaleTemporaryArtifacts(finalDirectory: string): Promise<void>;
  removeTemporaryDirectory(directory: string): Promise<void>;
  readManifest(finalDirectory: string): Promise<unknown | null>;
  writeJson(directory: string, filename: string, value: unknown): Promise<void>;
  publish(workspace: TopologyArtifactWorkspace): Promise<void>;
};
