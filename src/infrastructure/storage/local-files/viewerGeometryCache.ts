import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { isIfcViewerGeometryPayload, type IfcViewerGeometryPayload } from "../../ifc/web-ifc/WebIfcViewerGeometryExtractor.js";
import { LocalJobArtifactStore } from "./jobArtifactStore.js";

export type ViewerGeometryCacheKey = {
  jobId: string;
  fileHash: string | null;
};

export class LocalViewerGeometryCache {
  private readonly artifactStore: LocalJobArtifactStore;

  constructor(outputRootOrStore: string | LocalJobArtifactStore) {
    this.artifactStore = typeof outputRootOrStore === "string"
      ? new LocalJobArtifactStore(outputRootOrStore)
      : outputRootOrStore;
  }

  async read(key: ViewerGeometryCacheKey): Promise<IfcViewerGeometryPayload | null> {
    try {
      const content = await readFile(this.pathFor(key), "utf8");
      const parsed = JSON.parse(content);
      return isIfcViewerGeometryPayload(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  async write(
    key: ViewerGeometryCacheKey,
    payload: IfcViewerGeometryPayload,
  ): Promise<string> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(payload), "utf8");
    return path;
  }

  pathFor(key: ViewerGeometryCacheKey): string {
    return this.artifactStore.pathsFor(key.jobId).viewerFile(`geometry-${cacheKeySuffix(key)}.json`);
  }
}

function cacheKeySuffix(key: ViewerGeometryCacheKey): string {
  return createHash("sha256")
    .update(JSON.stringify({ fileHash: key.fileHash }))
    .digest("hex")
    .slice(0, 16);
}
