import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import type { TopologyArtifactStore, TopologyArtifactWorkspace } from "../../application/topology/topologyArtifactStore.js";

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

/** Local immutable publication adapter for topology request/result artifacts. */
export class LocalTopologyArtifactStore implements TopologyArtifactStore {
  constructor(private readonly artifactRoot: string) {}

  workspaceFor(idempotencyKey: string, requestId: string): TopologyArtifactWorkspace {
    assertSafeSegment(idempotencyKey, "idempotency key");
    assertSafeSegment(requestId, "request id");
    const finalDirectory = join(this.artifactRoot, "topology", idempotencyKey);
    const temporaryDirectory = `${finalDirectory}.tmp-${requestId}`;
    return {
      temporaryDirectory,
      finalDirectory,
      workerArtifactDirectory: join(temporaryDirectory, "worker"),
    };
  }

  createTemporaryDirectory(directory: string): Promise<void> {
    return mkdir(directory, { recursive: true }).then(() => undefined);
  }

  workerArtifactDirectory(finalDirectory: string): string {
    return join(finalDirectory, "worker");
  }

  async removeStaleTemporaryArtifacts(finalDirectory: string): Promise<void> {
    const parent = dirname(finalDirectory);
    const prefix = `${basename(finalDirectory)}.tmp-`;
    try {
      const entries = await readdir(parent, { withFileTypes: true });
      await Promise.all(entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
        .map((entry) => rm(join(parent, entry.name), { recursive: true, force: true })));
    } catch (error) {
      if (!isNodeNotFound(error)) throw error;
    }
  }

  removeTemporaryDirectory(directory: string): Promise<void> {
    return rm(directory, { recursive: true, force: true });
  }

  async readManifest(finalDirectory: string): Promise<unknown | null> {
    try {
      return JSON.parse(await readFile(join(finalDirectory, "manifest.json"), "utf8")) as unknown;
    } catch (error) {
      if (isNodeNotFound(error)) return null;
      throw error;
    }
  }

  writeJson(directory: string, filename: string, value: unknown): Promise<void> {
    assertSafeSegment(filename, "artifact filename");
    return writeFile(join(directory, filename), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }

  async publish(workspace: TopologyArtifactWorkspace): Promise<void> {
    await mkdir(dirname(workspace.finalDirectory), { recursive: true });
    await rename(workspace.temporaryDirectory, workspace.finalDirectory);
  }
}

function assertSafeSegment(value: string, label: string): void {
  if (!SAFE_SEGMENT.test(value)) throw new Error(`Invalid topology ${label}.`);
}

function isNodeNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
