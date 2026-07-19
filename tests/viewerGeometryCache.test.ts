import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { IfcViewerGeometryPayload } from "../src/infrastructure/ifc/web-ifc/WebIfcViewerGeometryExtractor.js";
import { LocalViewerGeometryCache } from "../src/infrastructure/storage/local-files/viewerGeometryCache.js";

describe("LocalViewerGeometryCache", () => {
  it("stores one full-model payload per job source hash", async () => {
    const root = join(tmpdir(), `viewer-geometry-cache-${Date.now()}`);
    const cache = new LocalViewerGeometryCache(root);
    try {
      const payload: IfcViewerGeometryPayload = {
        schemaVersion: "ifc-viewer-geometry.v6",
        meshes: [],
        truncated: false,
        elementCount: 0,
        triangleCount: 0,
        storeys: [],
      };
      const firstKey = { jobId: "job_1", fileHash: "hash_1" };
      const equivalentKey = { jobId: "job_1", fileHash: "hash_1" };
      const differentKey = { jobId: "job_1", fileHash: "hash_2" };

      const path = await cache.write(firstKey, payload);

      await expect(readFile(path, "utf8")).resolves.toContain("ifc-viewer-geometry.v6");
      expect(path).toBe(cache.pathFor(equivalentKey));
      await expect(cache.read(equivalentKey)).resolves.toEqual(payload);
      await expect(cache.read(differentKey)).resolves.toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
