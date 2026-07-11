import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type BrowserSmokeMode = "http_dom_fallback" | "driver";

export type BrowserSmokeResult = {
  mode: BrowserSmokeMode;
  artifactPaths: string[];
  diagnostics: string[];
};

export type RunBrowserSmokeCommand = {
  baseUrl: string;
  jobId: string;
  artifactRoot: string;
};

export type BrowserSmokeAdapter = {
  run(command: RunBrowserSmokeCommand): Promise<BrowserSmokeResult>;
};

export function discoverBrowserSmokeAdapter(): BrowserSmokeAdapter {
  return httpDomFallbackBrowserSmokeAdapter;
}

export const httpDomFallbackBrowserSmokeAdapter: BrowserSmokeAdapter = {
  async run(command: RunBrowserSmokeCommand): Promise<BrowserSmokeResult> {
    await mkdir(command.artifactRoot, { recursive: true });
    const home = await fetchText(`${command.baseUrl}/`);
    const appShell = await fetchText(`${command.baseUrl}/assets/app-shell.js`);
    const jobPage = await fetchText(`${command.baseUrl}/jobs/${command.jobId}`);
    const report = await fetchText(`${command.baseUrl}/api/jobs/${command.jobId}/report`);
    if (!appShell.includes("New analysis") || !jobPage.includes("Conformity")) {
      throw new Error("Browser smoke fallback did not find UI shell markers.");
    }
    if (!report.includes("Thermal Calculation Report")) {
      throw new Error("Browser smoke fallback did not find report marker.");
    }
    const path = join(command.artifactRoot, "browser-smoke.html");
    await writeFile(
      path,
      `${home}\n<!-- APP SHELL -->\n${appShell}\n<!-- JOB PAGE -->\n${jobPage}\n<!-- REPORT -->\n${report}`,
      "utf8",
    );
    return {
      mode: "http_dom_fallback",
      artifactPaths: [path],
      diagnostics: ["No browser driver configured; used HTTP DOM fallback."],
    };
  },
};

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text);
  }
  return text;
}
