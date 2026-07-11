import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { IfcViewerGeometryPayload } from "../src/infrastructure/ifc/web-ifc/WebIfcViewerGeometryExtractor.js";
import { LocalViewerGeometryCache } from "../src/infrastructure/storage/local-files/viewerGeometryCache.js";

describe("LocalViewerGeometryCache", () => {
  it("stores viewer geometry by job, file hash, and normalized target STEP ids", async () => {
    const root = join(tmpdir(), `viewer-geometry-cache-${Date.now()}`);
    const cache = new LocalViewerGeometryCache(root);
    try {
      const payload: IfcViewerGeometryPayload = {
        schemaVersion: "ifc-viewer-geometry.v1",
        meshes: [],
        truncated: false,
        elementCount: 0,
        triangleCount: 0,
      };
      const firstKey = { jobId: "job_1", fileHash: "hash_1", targetStepIds: [40, 10, 40] };
      const equivalentKey = { jobId: "job_1", fileHash: "hash_1", targetStepIds: [10, 40] };
      const differentKey = { jobId: "job_1", fileHash: "hash_1", targetStepIds: [11, 40] };

      const path = await cache.write(firstKey, payload);

      await expect(readFile(path, "utf8")).resolves.toContain("ifc-viewer-geometry.v1");
      await expect(cache.read(equivalentKey)).resolves.toEqual(payload);
      await expect(cache.read(differentKey)).resolves.toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
