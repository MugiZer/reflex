import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createLocalhostApp } from "../src/app/http/httpServer.js";

describe("topology review HTTP contract", () => {
  it("returns an explicit client rejection for malformed review input instead of a blanket server failure", async () => {
    const root = join(tmpdir(), `topology-review-http-${Date.now()}`);
    const app = createLocalhostApp({
      databasePath: join(root, "data", "app.db"),
      storageRoot: join(root, "storage"),
      outputRoot: join(root, "outputs"),
    });
    try {
      app.server.listen(0, "127.0.0.1");
      await new Promise<void>((resolve) => app.server.once("listening", resolve));
      const address = app.server.address();
      if (!address || typeof address === "string") throw new Error("Server is not bound.");
      const response = await fetch(`http://127.0.0.1:${address.port}/api/jobs/unknown/topology-reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: {} }),
      });
      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: "opportunityId is required." }));
    } finally {
      app.server.close();
      app.jobs.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
