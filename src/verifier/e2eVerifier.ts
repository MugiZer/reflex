import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { createLocalhostApp } from "../app/http/httpServer.js";
import { syntheticMilestone4CalculationInputEvidence } from "../application/jobs/syntheticMilestone4Fixture.js";
import {
  discoverBrowserSmokeAdapter,
  type BrowserSmokeAdapter,
  type BrowserSmokeResult,
} from "./browserSmoke.js";

export type E2eVerifierStep = {
  name: string;
  passed: boolean;
  detail?: string;
};

export type RunE2eVerifierCommand = {
  outputRoot: string;
  fixture?: {
    filename: string;
    content: Buffer | string;
  };
  fixtureIfcPath?: string;
  keepTemp?: boolean;
  runBrowserSmoke?: boolean;
  browserSmokeAdapter?: BrowserSmokeAdapter;
};

export type RunE2eVerifierResult = {
  passed: boolean;
  runId: string;
  artifactRoot: string;
  summaryPath: string;
  reportPath: string | null;
  screenshotPaths: string[];
  browserSmoke: BrowserSmokeResult | null;
  jobId: string | null;
  revisionId: string | null;
  steps: E2eVerifierStep[];
};

type JobResponse = {
  jobId: string;
  jobStatus: string;
  errorMessage?: string | null;
  review?: {
    requestedInputs?: Array<{
      requestedInputId: string;
      assemblyGroupId: string;
      datapoint: string;
      unit: string | null;
      inputType: "number" | "text" | "choice";
    }>;
  } | null;
  links?: Record<string, string>;
  activeRevisionId?: string | null;
};

export async function runE2eVerifier(
  command: RunE2eVerifierCommand,
): Promise<RunE2eVerifierResult> {
  const runId = `run_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  const artifactRoot = join(command.outputRoot, "verifier", runId);
  const screenshotRoot = join(artifactRoot, "screenshots");
  const tempRoot = await mkdtemp(join(tmpdir(), "m5-verifier-"));
  const steps: E2eVerifierStep[] = [];
  let jobId: string | null = null;
  let revisionId: string | null = null;
  let reportPath: string | null = null;
  const screenshotPaths: string[] = [];
  let browserSmoke: BrowserSmokeResult | null = null;

  await mkdir(screenshotRoot, { recursive: true });
  const app = createLocalhostApp({
    databasePath: join(tempRoot, "data", "app.db"),
    storageRoot: join(tempRoot, "storage"),
    outputRoot: join(tempRoot, "outputs"),
    workerOverrides: command.fixtureIfcPath
      ? undefined
      : {
          extractCalculationInputEvidence: async () => [
            syntheticMilestone4CalculationInputEvidence(),
          ],
        },
  });

  try {
    app.server.listen(0, "127.0.0.1");
    await once(app.server, "listening");
    const baseUrl = boundUrl(app.server);
    pass(steps, "server started", baseUrl);

    const fixture = await resolveFixture(command);
    const form = new FormData();
    form.set("ifc", new Blob([blobPartFor(fixture.content)]), fixture.filename);

    const created = await postJson(`${baseUrl}/api/jobs`, form);
    jobId = stringField(created, "jobId");
    pass(steps, "upload job created", jobId);

    const reviewable = await waitForJob(baseUrl, jobId, ["needs_review", "completed"]);
    pass(steps, `job reached ${reviewable.jobStatus}`, jobId);

    if (reviewable.jobStatus === "needs_review") {
      const requestedInputs = requiredRequestedInputs(reviewable);
      const submitted = await postJson(`${baseUrl}/api/jobs/${jobId}/review-inputs`, {
        inputs: requestedInputs.map((requestedInput) => ({
          requestedInputId: requestedInput.requestedInputId,
          value: demoValueFor(requestedInput),
          unit: requestedInput.unit,
          overrideScope: "assembly_group",
        })),
      });
      revisionId = stringField(submitted, "revisionId");
      pass(steps, "review input persisted", `${requestedInputs.length} inputs`);
      pass(steps, "revision created", revisionId);
    }

    const completed = await waitForJob(baseUrl, jobId, ["completed"]);
    revisionId = revisionId ?? (typeof completed.activeRevisionId === "string" ? completed.activeRevisionId : null);
    pass(steps, "calculation snapshot created", completed.jobStatus);

    const reportResponse = await fetch(`${baseUrl}/api/jobs/${jobId}/report`);
    const reportHtml = await reportResponse.text();
    if (!reportResponse.ok) {
      throw new Error(`Report fetch failed: ${reportResponse.status}`);
    }
    assertReport(reportHtml);
    reportPath = join(artifactRoot, "report.html");
    await writeFile(reportPath, reportHtml, "utf8");
    pass(steps, "report generated", reportPath);
    pass(steps, "report contains provenance", "Provenance marker found");

    if (command.runBrowserSmoke !== false) {
      browserSmoke = await (command.browserSmokeAdapter ?? discoverBrowserSmokeAdapter()).run({
        baseUrl,
        jobId,
        artifactRoot: screenshotRoot,
      });
      screenshotPaths.push(...browserSmoke.artifactPaths);
      pass(steps, "browser smoke captured", browserSmoke.mode);
    }

    return await writeSummary({
      passed: true,
      runId,
      artifactRoot,
      summaryPath: join(artifactRoot, "summary.json"),
      reportPath,
      screenshotPaths,
      browserSmoke,
      jobId,
      revisionId,
      steps,
      fixtureFilename: fixture.filename,
    });
  } catch (error) {
    steps.push({
      name: "verifier failed",
      passed: false,
      detail: error instanceof Error ? error.message : String(error),
    });
    return await writeSummary({
      passed: false,
      runId,
      artifactRoot,
      summaryPath: join(artifactRoot, "summary.json"),
      reportPath,
      screenshotPaths,
      browserSmoke,
      jobId,
      revisionId,
      steps,
      fixtureFilename: command.fixture?.filename ?? command.fixtureIfcPath ?? "synthetic.ifc",
    });
  } finally {
    app.server.close();
    app.close();
    if (command.keepTemp !== true) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }
}

export function printVerifierResult(result: RunE2eVerifierResult): void {
  for (const step of result.steps) {
    const prefix = step.passed ? "PASS" : "FAIL";
    console.log(`${prefix} ${step.name}${step.detail ? ` - ${step.detail}` : ""}`);
  }
  console.log(`ARTIFACTS ${result.artifactRoot}`);
}

async function resolveFixture(command: RunE2eVerifierCommand): Promise<{
  filename: string;
  content: Buffer | string;
}> {
  if (command.fixture) {
    return command.fixture;
  }
  if (command.fixtureIfcPath) {
    return {
      filename: basename(command.fixtureIfcPath),
      content: await readFile(command.fixtureIfcPath),
    };
  }
  return {
    filename: "synthetic-milestone-5.ifc",
    content: "ISO-10303-21; synthetic milestone 5 verifier; END-ISO-10303-21;",
  };
}

async function waitForJob(
  baseUrl: string,
  jobId: string,
  terminalStatuses: string[],
): Promise<JobResponse> {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const job = await getJson(`${baseUrl}/api/jobs/${jobId}`) as JobResponse;
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

function requiredRequestedInputs(job: JobResponse): NonNullable<NonNullable<JobResponse["review"]>["requestedInputs"]> {
  const requestedInputs = job.review?.requestedInputs ?? [];
  if (!requestedInputs.length) {
    throw new Error("Job needs Review but has no Requested Inputs.");
  }
  return requestedInputs;
}
function assertReport(reportHtml: string): void {
  if (!reportHtml.includes("Thermal Calculation Report")) {
    throw new Error("Report missing title.");
  }
  if (!reportHtml.includes("U-value") && !reportHtml.includes("U-Value")) {
    throw new Error("Report missing U-value marker.");
  }
  if (!reportHtml.includes("Provenance")) {
    throw new Error("Report missing provenance marker.");
  }
}

function demoValueFor(requestedInput: NonNullable<NonNullable<JobResponse["review"]>["requestedInputs"]>[number]): string | number {
  if (requestedInput.inputType !== "number") return "Verifier fixture input";
  const datapoint = requestedInput.datapoint;
  if (datapoint === "layer_lambda") {
    return 0.04;
  }
  if (datapoint === "layer_thickness" || datapoint === "assembly_thickness") {
    return 0.12;
  }
  return 1;
}

function blobPartFor(content: Buffer | string): BlobPart {
  if (typeof content === "string") {
    return content;
  }
  const copy = new Uint8Array(content.byteLength);
  copy.set(content);
  return copy;
}

async function postJson(url: string, body: unknown): Promise<unknown> {
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
    throw new Error(typeof value === "object" && value !== null && "error" in value ? String(value.error) : response.statusText);
  }
  return value;
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  const value = await response.json();
  if (!response.ok) {
    throw new Error(typeof value === "object" && value !== null && "error" in value ? String(value.error) : response.statusText);
  }
  return value;
}

function stringField(value: unknown, field: string): string {
  if (typeof value === "object" && value !== null && typeof (value as Record<string, unknown>)[field] === "string") {
    return (value as Record<string, string>)[field];
  }
  throw new Error(`Missing string field: ${field}`);
}

function boundUrl(server: { address(): ReturnType<import("node:net").Server["address"]> }): string {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Server is not bound.");
  }
  return `http://127.0.0.1:${address.port}`;
}

function pass(steps: E2eVerifierStep[], name: string, detail?: string): void {
  steps.push({ name, passed: true, detail });
}

async function writeSummary(command: RunE2eVerifierResult & { fixtureFilename: string }): Promise<RunE2eVerifierResult> {
  await mkdir(command.artifactRoot, { recursive: true });
  await writeFile(command.summaryPath, JSON.stringify({
    passed: command.passed,
    runId: command.runId,
    jobId: command.jobId,
    revisionId: command.revisionId,
    fixtureFilename: command.fixtureFilename,
    reportPath: command.reportPath,
    screenshotPaths: command.screenshotPaths,
    browserSmoke: command.browserSmoke,
    steps: command.steps,
  }, null, 2), "utf8");
  return {
    passed: command.passed,
    runId: command.runId,
    artifactRoot: command.artifactRoot,
    summaryPath: command.summaryPath,
    reportPath: command.reportPath,
    screenshotPaths: command.screenshotPaths,
    browserSmoke: command.browserSmoke,
    jobId: command.jobId,
    revisionId: command.revisionId,
    steps: command.steps,
  };
}
