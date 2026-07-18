import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { IfcViewerGeometryPayload } from "../../ifc/web-ifc/WebIfcViewerGeometryExtractor.js";

export type ViewerGeometryCacheKey = {
  jobId: string;
  fileHash: string | null;
  targetStepIds: number[];
};

export class LocalViewerGeometryCache {
  constructor(private readonly outputRoot: string) {}

  async read(key: ViewerGeometryCacheKey): Promise<IfcViewerGeometryPayload | null> {
    try {
      const content = await readFile(this.pathFor(key), "utf8");
      const parsed = JSON.parse(content);
      return isViewerGeometryPayload(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  async write(
    key: ViewerGeometryCacheKey,
    payload: IfcViewerGeometryPayload,
  ): Promise<string> {
    const path = this.pathFor(key);
    await mkdir(join(this.outputRoot, key.jobId, "viewer"), { recursive: true });
    await writeFile(path, JSON.stringify(payload), "utf8");
    return path;
  }

  pathFor(key: ViewerGeometryCacheKey): string {
    return join(
      this.outputRoot,
      key.jobId,
      "viewer",
      `geometry-${cacheKeySuffix(key)}.json`,
    );
  }
}

function cacheKeySuffix(key: ViewerGeometryCacheKey): string {
  const normalizedStepIds = [...new Set(key.targetStepIds)].sort((a, b) => a - b);
  return createHash("sha256")
    .update(JSON.stringify({
      fileHash: key.fileHash,
      targetStepIds: normalizedStepIds,
    }))
    .digest("hex")
    .slice(0, 16);
}

function isViewerGeometryPayload(value: unknown): value is IfcViewerGeometryPayload {
  return typeof value === "object" &&
    value !== null &&
    (value as { schemaVersion?: unknown }).schemaVersion === "ifc-viewer-geometry.v4" &&
    Array.isArray((value as { meshes?: unknown }).meshes);
}
