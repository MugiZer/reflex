import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createLocalhostApp } from "../src/app/http/httpServer.js";
import { syntheticMilestone4CalculationInputEvidence } from "../src/application/jobs/syntheticMilestone4Fixture.js";

const root = await mkdtemp(join(tmpdir(), "m4-verifier-"));
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
  await once(app.server, "listening");
  const address = app.server.address();
  if (!address || typeof address === "string") {
    throw new Error("Server did not bind to a TCP port.");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const form = new FormData();
  form.set("ifc", new Blob(["ISO-10303-21; synthetic milestone 4 verifier; END-ISO-10303-21;"]), "synthetic.ifc");

  const created = await postJson(`${baseUrl}/api/jobs`, form);
  const jobId = stringField(created, "jobId");
  const needsReview = await waitForJob(baseUrl, jobId, ["needs_review", "completed"]);
  if (needsReview.jobStatus === "needs_review") {
    const requestedInput = needsReview.review.requestedInputs[0];
    await postJson(`${baseUrl}/api/jobs/${jobId}/review-inputs`, {
      assemblyGroupId: requestedInput.assemblyGroupId,
      inputs: [
        {
          requestedInputId: requestedInput.requestedInputId,
          value: 0.04,
          unit: requestedInput.unit,
          overrideScope: "assembly_group",
        },
      ],
    });
  }

  const completed = await waitForJob(baseUrl, jobId, ["completed"]);
  const reportResponse = await fetch(`${baseUrl}/api/jobs/${jobId}/report`);
  const report = await reportResponse.text();
  if (!reportResponse.ok || !report.includes("Thermal Calculation Report")) {
    throw new Error("Report route did not serve generated report HTML.");
  }
  if (!report.includes("Revision") || !report.includes("Provenance")) {
    throw new Error("Report missing revision/provenance markers.");
  }

  console.log(`Milestone 4 verifier passed: ${jobId}`);
  console.log(`Status: ${completed.jobStatus}`);
  console.log(`Report: /api/jobs/${jobId}/report`);
} finally {
  app.server.close();
  app.close();
  await rm(root, { recursive: true, force: true });
}

async function waitForJob(
  baseUrl: string,
  jobId: string,
  terminalStatuses: string[],
): Promise<any> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const job = await getJson(`${baseUrl}/api/jobs/${jobId}`);
    if (terminalStatuses.includes(job.jobStatus)) {
      return job;
    }
    if (job.jobStatus === "failed") {
      throw new Error(job.errorMessage ?? "Job failed.");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${terminalStatuses.join(", ")}.`);
}

async function postJson(url: string, body: unknown): Promise<any> {
  const init: RequestInit =
    body instanceof FormData
      ? { method: "POST", body }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        };
  const response = await fetch(url, init);
  const value = await response.json();
  if (!response.ok) {
    throw new Error(value.error ?? response.statusText);
  }
  return value;
}

async function getJson(url: string): Promise<any> {
  const response = await fetch(url);
  const value = await response.json();
  if (!response.ok) {
    throw new Error(value.error ?? response.statusText);
  }
  return value;
}

function stringField(value: unknown, field: string): string {
  if (typeof value === "object" && value !== null && typeof (value as Record<string, unknown>)[field] === "string") {
    return (value as Record<string, string>)[field];
  }
  throw new Error(`Missing string field: ${field}`);
}
