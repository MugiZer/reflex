import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createLocalhostApp } from "../src/app/http/httpServer.js";

describe("localhost composition lifecycle", () => {
  it("closes both persistence repositories before storage cleanup", async () => {
    const root = await mkdtemp(join(tmpdir(), "localhost-app-lifecycle-"));
    const app = createLocalhostApp({ databasePath: join(root, "data", "app.db"), storageRoot: join(root, "storage"), outputRoot: join(root, "outputs") });
    app.close();
    await expect(rm(root, { recursive: true, force: true })).resolves.toBeUndefined();
  });

  it("closes independent localhost compositions concurrently without shared cleanup contention", async () => {
    const roots = await Promise.all([
      mkdtemp(join(tmpdir(), "localhost-app-lifecycle-a-")),
      mkdtemp(join(tmpdir(), "localhost-app-lifecycle-b-")),
    ]);
    const apps = roots.map((root) => createLocalhostApp({ databasePath: join(root, "data", "app.db"), storageRoot: join(root, "storage"), outputRoot: join(root, "outputs") }));
    try {
      await Promise.all(apps.map(async (app) => { app.close(); }));
      await expect(Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })))).resolves.toEqual([undefined, undefined]);
    } finally {
      await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
    }
  });
});
