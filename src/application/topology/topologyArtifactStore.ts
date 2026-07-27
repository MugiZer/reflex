export type TopologyArtifactWorkspace = {
  temporaryDirectory: string;
  finalDirectory: string;
  workerArtifactDirectory: string;
  claimDirectory: string;
};

export type TopologyArtifactFile = {
  path: string;
  sha256: string;
  sizeBytes: number;
};

/** Application persistence port for immutable topology request artifacts. */
export type TopologyArtifactStore = {
  workspaceFor(idempotencyKey: string, requestId: string, variant?: string): TopologyArtifactWorkspace;
  workerArtifactDirectory(finalDirectory: string): string;
  createTemporaryDirectory(directory: string): Promise<void>;
  removeTemporaryDirectory(directory: string): Promise<void>;
  readManifest(finalDirectory: string): Promise<unknown | null>;
  claim(workspace: TopologyArtifactWorkspace): Promise<{ acquired: boolean; manifest: unknown | null }>;
  release(workspace: TopologyArtifactWorkspace): Promise<void>;
  writeJson(directory: string, filename: string, value: unknown): Promise<TopologyArtifactFile>;
  verifyFiles(directory: string, files: readonly TopologyArtifactFile[]): Promise<void>;
  publish(workspace: TopologyArtifactWorkspace): Promise<void>;
};
