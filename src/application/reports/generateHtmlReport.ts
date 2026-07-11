import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { CalculationSnapshot } from "../../domain/calculations/calculationTypes.js";
import type { Revision } from "../../domain/revisions/revisionTypes.js";

export async function generateHtmlReport(command: {
  outputRoot: string;
  fileHash: string;
  revision: Revision;
  calculationSnapshots: CalculationSnapshot[];
}): Promise<{ reportFilePath: string }> {
  const reportDir = join(command.outputRoot, command.fileHash, "reports");
  await mkdir(reportDir, { recursive: true });
  const reportFilePath = join(reportDir, `${command.revision.revisionId}.html`);
  await writeFile(reportFilePath, renderReport(command), "utf8");
  return { reportFilePath };
}

function renderReport(command: {
  fileHash: string;
  revision: Revision;
  calculationSnapshots: CalculationSnapshot[];
}): string {
  const rows = command.calculationSnapshots.map((snapshot) => {
    const uValue = formatUValue(snapshot);
    const rValue =
      snapshot.totalRValueM2KPerW === null
        ? "Blocked"
        : `${snapshot.totalRValueM2KPerW.toFixed(3)} m2K/W`;
    return `<tr><td>${escapeHtml(snapshot.assemblyGroupId)}</td><td>${escapeHtml(snapshot.readinessState)}</td><td>${uValue}</td><td>${rValue}</td><td>${escapeHtml(snapshot.confidence)}</td></tr>`;
  }).join("");
  const layerRows = command.calculationSnapshots.flatMap((snapshot) =>
    snapshot.layers.map((layer) =>
      `<tr><td>${escapeHtml(snapshot.assemblyGroupId)}</td><td>${escapeHtml(layer.materialName)}</td><td>${layer.thicknessM.toFixed(3)} m</td><td>${layer.lambdaWPerMK.toFixed(3)} W/mK</td><td>${layer.rValueM2KPerW.toFixed(3)} m2K/W</td></tr>`,
    ),
  ).join("");
  const assumptions = command.calculationSnapshots.flatMap((snapshot) => snapshot.assumptions);
  const warnings = command.calculationSnapshots.flatMap((snapshot) => snapshot.warnings);
  const provenance = command.calculationSnapshots.flatMap((snapshot) => snapshot.provenance);
  const temperatureRows = command.calculationSnapshots.flatMap((snapshot) =>
    snapshot.temperatureProfile?.points.map((point) =>
      `<tr><td>${escapeHtml(snapshot.assemblyGroupId)}</td><td>${escapeHtml(point.label)}</td><td>${point.temperatureC.toFixed(1)} C</td><td>${point.cumulativeRValueM2KPerW.toFixed(3)} m2K/W</td></tr>`,
    ) ?? [],
  ).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Thermal Calculation Report ${escapeHtml(command.revision.revisionId)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 32px; color: #1f2933; }
    h1, h2 { margin-bottom: 8px; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0 24px; }
    th, td { border: 1px solid #d9e2ec; padding: 8px; text-align: left; }
    th { background: #f0f4f8; }
    .muted { color: #52606d; }
    .warning { color: #9f6000; }
  </style>
</head>
<body>
  <h1>Thermal Calculation Report</h1>
  <p class="muted">Revision ${escapeHtml(command.revision.revisionId)} for file ${escapeHtml(command.fileHash)}</p>

  <h2>Summary</h2>
  <table>
    <thead><tr><th>Assembly Group</th><th>Readiness</th><th>U-value</th><th>R-value</th><th>Confidence</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <h2>Calculation Data</h2>
  <table>
    <thead><tr><th>Assembly Group</th><th>Material</th><th>Thickness</th><th>Lambda</th><th>Layer R-value</th></tr></thead>
    <tbody>${layerRows}</tbody>
  </table>

  <h2>Temperature Profile</h2>
  <table>
    <thead><tr><th>Assembly Group</th><th>Point</th><th>Temperature</th><th>Cumulative R-value</th></tr></thead>
    <tbody>${temperatureRows || '<tr><td colspan="4">No temperature profile available.</td></tr>'}</tbody>
  </table>

  <h2>Inputs and Assumptions</h2>
  <ul>${assumptions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>

  <h2>Warnings</h2>
  <ul>${warnings.map((item) => `<li class="warning">${escapeHtml(item)}</li>`).join("") || "<li>None</li>"}</ul>

  <h2>Provenance</h2>
  <p>${provenance.length} evidence references used.</p>
  <details>
    <summary>Evidence details</summary>
    <ul>${provenance.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
  </details>
</body>
</html>`;
}

function formatUValue(snapshot: CalculationSnapshot): string {
  if (snapshot.uValueWPerM2K !== null) {
    return `${snapshot.uValueWPerM2K.toFixed(3)} W/m2K`;
  }
  if (snapshot.uValueRangeWPerM2K !== null) {
    return `${snapshot.uValueRangeWPerM2K.min.toFixed(3)}-${snapshot.uValueRangeWPerM2K.max.toFixed(3)} W/m2K`;
  }
  return "Blocked";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
