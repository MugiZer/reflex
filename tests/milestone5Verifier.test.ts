import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runE2eVerifier } from "../src/verifier/e2eVerifier.js";

describe("Milestone 5 E2E verifier", () => {
  it("runs the localhost Job loop and writes verifier artifacts", async () => {
    const outputRoot = join(tmpdir(), `m5-verifier-${Date.now()}`);

    const result = await runE2eVerifier({
      outputRoot,
      runBrowserSmoke: true,
      fixture: {
        filename: "synthetic-test.ifc",
        content: "ISO-10303-21; test milestone 5; END-ISO-10303-21;",
      },
    });

    expect(result.passed).toBe(true);
    expect(result.jobId).toMatch(/^job_/);
    expect(result.revisionId).toMatch(/^rev_/);
    expect(result.reportPath).toBeTruthy();
    expect(result.screenshotPaths).toHaveLength(1);
    expect(result.browserSmoke?.mode).toBe("http_dom_fallback");
    expect(result.steps.map((step) => step.name)).toEqual(expect.arrayContaining([
      "upload job created",
      "review input persisted",
      "revision created",
      "calculation snapshot created",
      "report generated",
      "report contains provenance",
      "browser smoke captured",
    ]));

    const summary = await readFile(result.summaryPath, "utf8");
    expect(summary).toContain('"passed": true');
    expect(summary).toContain('"mode": "http_dom_fallback"');
    await expect(readFile(result.reportPath ?? "", "utf8")).resolves.toContain("Thermal Calculation Report");
    await expect(readFile(result.screenshotPaths[0], "utf8")).resolves.toContain("New analysis");

    await rm(outputRoot, { recursive: true, force: true });
  });

  it("surfaces Browser Smoke adapter mode in summary JSON", async () => {
    const outputRoot = join(tmpdir(), `m5-verifier-adapter-${Date.now()}`);

    const result = await runE2eVerifier({
      outputRoot,
      fixture: {
        filename: "synthetic-test.ifc",
        content: "ISO-10303-21; test milestone 5; END-ISO-10303-21;",
      },
      browserSmokeAdapter: {
        async run() {
          return {
            mode: "driver",
            artifactPaths: [],
            diagnostics: ["fake driver adapter"],
          };
        },
      },
    });

    expect(result.passed).toBe(true);
    expect(result.browserSmoke).toEqual({
      mode: "driver",
      artifactPaths: [],
      diagnostics: ["fake driver adapter"],
    });
    await expect(readFile(result.summaryPath, "utf8")).resolves.toContain('"mode": "driver"');

    await rm(outputRoot, { recursive: true, force: true });
  });
});
