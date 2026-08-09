import { createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createLocalhostApp } from "../src/app/http/httpServer.js";
import { syntheticMilestone4CalculationInputEvidence } from "../src/application/jobs/syntheticMilestone4Fixture.js";
import { LocalJobArtifactStore } from "../src/infrastructure/storage/local-files/jobArtifactStore.js";

describe("Job artifact seam", () => {
  it("keeps every Job artifact category beneath one Job root", () => {
    const store = new LocalJobArtifactStore("C:\\tmp\\outputs");
    const paths = store.pathsFor("job_abc123");

    expect(paths.root).toBe(join("C:\\tmp\\outputs", "job_abc123"));
    expect(paths.evidenceDirectory).toBe(join(paths.root, "evidence"));
    expect(paths.revisionsDirectory).toBe(join(paths.root, "revisions"));
    expect(paths.reportsDirectory).toBe(join(paths.root, "reports"));
    expect(paths.viewerDirectory).toBe(join(paths.root, "viewer"));
    expect(paths.evidenceFile("calculation-input-evidence.json")).toBe(
      join(paths.root, "evidence", "calculation-input-evidence.json"),
    );
    expect(paths.revisionFile("rev_1")).toBe(join(paths.root, "revisions", "rev_1.json"));
    expect(paths.reportFile("rev_1")).toBe(join(paths.root, "reports", "rev_1.html"));
    expect(paths.viewerFile("geometry.json")).toBe(join(paths.root, "viewer", "geometry.json"));
  });

  it("rejects path traversal outside the Job artifact root", () => {
    const store = new LocalJobArtifactStore("C:\\tmp\\outputs");

    expect(() => store.pathsFor(".." as never)).toThrow("Invalid Job id");
    expect(() => store.pathsFor("job_abc/../other" as never)).toThrow("Invalid Job id");
  });

  it("keeps the upload hash stable while Job artifacts stay Job-scoped", async () => {
    const root = join(tmpdir(), `job-artifacts-${Date.now()}`);
    const app = createLocalhostApp({
      databasePath: join(root, "data", "app.db"),
      storageRoot: join(root, "storage"),
      outputRoot: join(root, "outputs"),
      workerOverrides: {
        extractCalculationInputEvidence: async () => [
          syntheticMilestone4CalculationInputEvidence(),
        ],
      },
    });
    try {
      app.server.listen(0, "127.0.0.1");
      await new Promise<void>((resolve) => app.server.once("listening", () => resolve()));
      const address = app.server.address();
      if (!address || typeof address === "string") throw new Error("Server is not bound.");
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const content = "ISO-10303-21; fixture; END-ISO-10303-21;";
      const form = new FormData();
      form.set("ifc", new Blob([content]), "fixture.ifc");
      const createdResponse = await fetch(`${baseUrl}/api/jobs`, { method: "POST", body: form });
      const created = await createdResponse.json() as { jobId: string };

      let job: any;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const response = await fetch(`${baseUrl}/api/jobs/${created.jobId}`);
        job = await response.json();
        if (job.jobStatus === "needs_review") break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      const expectedHash = createHash("sha256").update(content).digest("hex");
      expect(job.fileHash).toBe(expectedHash);
      const evidencePath = join(root, "outputs", created.jobId, "evidence", "calculation-input-evidence.json");
      await expect(readFile(evidencePath, "utf8")).resolves.toContain("layer_lambda");
      expect(job.reportPath).toBeNull();

      const input = job.review.requestedInputs[0];
      const completeResponse = await fetch(`${baseUrl}/api/jobs/${created.jobId}/review-inputs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputs: [{
            requestedInputId: input.requestedInputId,
            value: 0.04,
            unit: input.unit,
            overrideScope: input.scope.scopeKind,
          }],
        }),
      });
      expect(completeResponse.status).toBe(202);
      const completedResponse = await fetch(`${baseUrl}/api/jobs/${created.jobId}`);
      const completed = await completedResponse.json();
      expect(completed.fileHash).toBe(expectedHash);
      expect(completed.reportPath).toContain(join("outputs", created.jobId, "reports"));
      expect(completed.reportPath).not.toContain(join("outputs", expectedHash));
      await expect(readFile(completed.reportPath, "utf8")).resolves.toContain("Thermal Calculation Report");
      await expect(readFile(
        join(root, "outputs", created.jobId, "revisions", `${completed.activeRevisionId}.json`),
        "utf8",
      )).resolves.toContain(completed.activeRevisionId);
    } finally {
      app.server.close();
      app.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
