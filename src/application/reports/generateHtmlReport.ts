import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { CalculationSnapshot, LayerCalculation } from "../../domain/calculations/calculationTypes.js";
import type { Revision } from "../../domain/revisions/revisionTypes.js";
import type { ReportInventoryView } from "./buildReportInventory.js";
import { LocalJobArtifactStore } from "../../infrastructure/storage/local-files/jobArtifactStore.js";

export async function generateHtmlReport(command: {
  artifactStore?: LocalJobArtifactStore;
  outputRoot: string;
  jobId?: string;
  fileHash: string;
  revision: Revision;
  calculationSnapshots: CalculationSnapshot[];
  reportInventory?: ReportInventoryView[];
}): Promise<{ reportFilePath: string }> {
  const artifactStore = command.artifactStore ?? new LocalJobArtifactStore(command.outputRoot);
  const reportFilePath = artifactStore.pathsFor(command.jobId ?? legacyJobId(command.fileHash)).reportFile(command.revision.revisionId);
  await mkdir(dirname(reportFilePath), { recursive: true });
  await writeFile(reportFilePath, renderReport(command), "utf8");
  return { reportFilePath };
}

function legacyJobId(fileHash: string): string {
  return fileHash.startsWith("job_") ? fileHash : `job_${fileHash.replace(/[^A-Za-z0-9]/g, "")}`;
}

function renderReport(command: {
  fileHash: string;
  revision: Revision;
  calculationSnapshots: CalculationSnapshot[];
  reportInventory?: ReportInventoryView[];
}): string {
  const inventory = command.reportInventory ?? command.calculationSnapshots.map((snapshot) => ({
    assemblyGroupId: snapshot.assemblyGroupId,
    elementClass: "IfcWall" as const,
    sources: [],
    layers: snapshot.layers.map((layer, layerIndex) => ({ layerIndex, rawMaterialName: layer.rawMaterialName ?? layer.materialName, thicknessM: layer.thicknessM, lambdaWPerMK: layer.lambdaWPerMK, materialResolution: layer.materialResolution, provenance: [] })),
    snapshot,
    readinessState: snapshot.readinessState,
    nextActions: [],
    specialIssues: [],
  }));
  const views = inventory.map((view, index) => renderInventoryAssembly(view, index)).join("");
  const multiLayerInventory = inventory.filter((view) => view.layers.length > 1);
  const multiLayerSourceCount = multiLayerInventory.reduce((count, view) => count + view.sources.length, 0);
  const options = inventory.map((view, index) => {
    const material = view.layers[0]?.rawMaterialName ?? "Unresolved assembly";
    const result = view.snapshot === null ? humanizeToken(view.readinessState) : formatUValue(view.snapshot);
    return "<option value=\"" + index + "\">" + twoDigits(index + 1) + " · " + escapeHtml(material) + " · " + escapeHtml(shortId(view.assemblyGroupId)) + " · " + escapeHtml(result) + "</option>";
  }).join("");

  return "<!doctype html>" +
    "<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
    "<title>Thermal Calculation Report " + escapeHtml(command.revision.revisionId) + "</title>" +
    "<style>" + reportStyles() + "</style></head><body>" +
    "<header class=\"brandbar\"><div class=\"brand\"><span class=\"brand-icon\">C</span>Conformity</div><div class=\"product\">THERMAL ASSEMBLY ANALYSIS</div><div class=\"revision\">REV " + escapeHtml(shortId(command.revision.revisionId)) + "</div></header>" +
    "<div class=\"toolbar\"><button type=\"button\" id=\"previous\" aria-label=\"Previous assembly\">‹</button><label for=\"assembly-picker\">Assembly</label><select id=\"assembly-picker\">" + options + "</select><button type=\"button\" id=\"next\" aria-label=\"Next assembly\">›</button><span id=\"assembly-count\">" + (inventory.length ? "1 / " + inventory.length : "0 / 0") + "</span><button type=\"button\" class=\"print\" onclick=\"window.print()\">Print</button></div>" +
    "<div class=\"app-frame\"><nav class=\"rail\"><a id=\"nav-layers\" href=\"#layers-0\"><b>≡</b>Layers</a><a id=\"nav-thermal\" href=\"#thermal-0\"><b>ϑ</b>U-value</a><a id=\"nav-temperature\" href=\"#temperature-0\"><b>⌁</b>Heat</a><a id=\"nav-evidence\" href=\"#evidence-0\"><b>✓</b>Evidence</a></nav>" +
    "<main class=\"workspace\"><h1 class=\"sr-only\">Thermal Calculation Report</h1>" +
    (views || "<section class=\"empty\"><h2>No calculable assemblies</h2><p>Resolve the missing inputs to generate a thermal result.</p></section>") +
    "</main></div>" +
    "<script>" + reportScript(inventory.length) + "</script></body></html>";
}

function renderInventoryAssembly(view: ReportInventoryView, index: number): string {
  const sourceMembership = renderSourceMembership(view);
  if (view.snapshot !== null) return renderAssembly(view.snapshot, index).replace("</article>", sourceMembership + "</article>");
  const layers = view.layers.map((layer) => "<tr><td>" + (layer.layerIndex + 1) + "</td><td>" + escapeHtml(layer.rawMaterialName ?? "Unnamed layer") + "</td><td>" + escapeHtml(layer.materialResolution?.matchedMaterialName ?? "Unresolved") + "</td><td>" + escapeHtml(layer.materialResolution?.matchBasis ?? "none") + "</td><td>" + (layer.thicknessM === null ? "Unknown" : formatNumber(layer.thicknessM * 1000, 1) + " mm") + "</td><td>" + (layer.lambdaWPerMK === null ? "Unresolved" : formatNumber(layer.lambdaWPerMK, 3) + " W/mK") + "</td></tr>").join("");
  const active = index === 0 ? " active" : "";
  return "<article class=\"assembly-view" + active + "\" data-assembly-index=\"" + index + "\"><header class=\"assembly-heading\"><div><span class=\"eyebrow\">Assembly " + twoDigits(index + 1) + "</span><h2>Evidence-first layer build-up</h2><code>" + escapeHtml(view.assemblyGroupId) + "</code></div><div class=\"heading-result\"><span class=\"status " + view.readinessState + "\">" + escapeHtml(humanizeToken(view.readinessState)) + "</span><strong>Calculation pending</strong></div></header><section class=\"material-values\"><div class=\"section-title\"><div><span class=\"eyebrow\">Known IFC evidence</span><h3>Ordered layers</h3></div><span>No serial U-value has been fabricated.</span></div><div class=\"table-scroll\"><table><thead><tr><th>#</th><th>Raw IFC material</th><th>Matched material</th><th>Match basis</th><th>Thickness</th><th>Resolved lambda</th></tr></thead><tbody>" + layers + "</tbody></table></div></section><section class=\"technical\"><details open><summary>Required next actions</summary>" + renderList(view.nextActions, "No further action recorded.") + "</details><details><summary>Special physics</summary>" + renderList(view.specialIssues.map((issue) => issue.label + ": " + issue.message), "None.") + "</details></section>" + sourceMembership + "</article>";
}
function renderSourceMembership(view: ReportInventoryView): string {
  const rows = view.sources.map((source) => "<tr><td>#" + source.elementStepId + "</td><td>" + escapeHtml(source.elementGlobalId ?? "�") + "</td><td>" + escapeHtml(source.elementName ?? "�") + "</td><td>" + escapeHtml(source.elementObjectType ?? "�") + "</td><td>" + escapeHtml(source.elementClass) + "</td></tr>").join("");
  return "<section class=\"material-values source-membership\"><div class=\"section-title\"><div><span class=\"eyebrow\">Source-wall coverage</span><h3>" + view.sources.length + " represented source element" + (view.sources.length === 1 ? "" : "s") + "</h3></div></div><div class=\"table-scroll\"><table><thead><tr><th>IFC step id</th><th>GlobalId</th><th>Name</th><th>ObjectType</th><th>Class</th></tr></thead><tbody>" + rows + "</tbody></table></div></section>";
}
function renderAssembly(snapshot: CalculationSnapshot, index: number): string {
  const layers = snapshot.layers;
  const totalThickness = layers.reduce((sum, layer) => sum + layer.thicknessM, 0);
  const totalLayerR = layers.reduce((sum, layer) => sum + layer.rValueM2KPerW, 0);
  const uValue = formatUValue(snapshot);
  const assumptionItems = unique(snapshot.assumptions);
  const warningItems = unique(snapshot.warnings);
  const provenanceItems = unique(snapshot.provenance);
  const thermalTreatment = snapshot.thermalTreatment;
  const resolutionItems = unique(layers.flatMap((layer) => layer.materialResolution
    ? [
        "Raw IFC material: " + (layer.rawMaterialName ?? layer.materialName),
        "Matched library material: " + (layer.materialLibraryName ?? "none"),
        "Lambda source: " + (layer.evidenceState === "library_assisted" ? "library-assisted / assumed" : layer.evidenceState ?? layer.materialResolution.evidenceState),
        "Match basis: " + (layer.materialResolution.matchBasis ?? "none") + "; evidence state: " + (layer.evidenceState ?? layer.materialResolution.evidenceState),
      ]
    : []));
  const active = index === 0 ? " active" : "";
  const materialRows = layers.length
    ? layers.map((layer, layerIndex) => renderMaterialRow(layer, layerIndex, totalThickness, totalLayerR)).join("")
    : "<tr><td colspan=\"8\" class=\"empty-cell\">Layer values are not resolved.</td></tr>";

  return "<article class=\"assembly-view" + active + "\" data-assembly-index=\"" + index + "\">" +
    "<header class=\"assembly-heading\"><div><span class=\"eyebrow\">Assembly " + twoDigits(index + 1) + "</span><h2>" + escapeHtml(primaryAssemblyLabel(snapshot)) + "</h2><code>" + escapeHtml(snapshot.assemblyGroupId) + "</code></div>" +
    "<div class=\"heading-result\"><span class=\"status " + escapeHtml(snapshot.readinessState) + "\">" + escapeHtml(humanizeToken(snapshot.readinessState)) + " · " + escapeHtml(humanizeToken(snapshot.confidence)) + " confidence</span><strong>" + escapeHtml(uValue) + "</strong></div></header>" +
    "<section class=\"conditions\"><span><b>Inside</b> " + temperature(snapshot.temperatureProfile?.indoorTemperatureC) + "</span><span>Rsi " + snapshot.surfaceResistanceProfile.rsi.toFixed(3) + "</span><span>From inside to outside →</span><span>Rse " + snapshot.surfaceResistanceProfile.rse.toFixed(3) + "</span><span><b>Outside</b> " + temperature(snapshot.temperatureProfile?.outdoorTemperatureC) + "</span></section>" +
    "<div class=\"work-grid\">" +
      "<section class=\"layer-panel\" id=\"layers-" + index + "\"><div class=\"section-title\"><div><span class=\"eyebrow\">Construction</span><h3>Layer build-up</h3></div><strong>" + formatNumber(totalThickness * 1000, 1) + " mm</strong></div>" +
      "<div class=\"layer-list\">" + (layers.length ? layers.map(renderLayerLine).join("") : "<p class=\"empty-cell\">No layer data.</p>") + "</div>" +
      "<div class=\"composition-block\"><div class=\"section-title compact\"><div><span class=\"eyebrow\">Assembly composition</span><h3>Thickness proportion</h3></div><span>100%</span></div>" +
      renderComposition(layers, totalThickness) + "</div></section>" +
      "<section class=\"diagram-panel\"><div class=\"section-title\"><div><span class=\"eyebrow\">Schematic</span><h3>Assembly section</h3></div><span>Inside → Outside</span></div>" + renderDiagram(layers, totalThickness) + renderTemperature(snapshot, index) + "</section>" +
    "</div>" +
    "<section class=\"material-values\" id=\"thermal-" + index + "\"><div class=\"section-title\"><div><span class=\"eyebrow\">Calculated values</span><h3>Per material</h3></div><span>Resistance contribution is based on layer R-values</span></div>" +
    "<div class=\"table-scroll\"><table><thead><tr><th>Material</th><th>Thickness</th><th>Assembly share</th><th>λ</th><th>Layer R</th><th>R contribution</th><th>Source</th></tr></thead><tbody>" + materialRows + "</tbody></table></div></section>" +
    "<section class=\"technical\" id=\"evidence-" + index + "\"><details><summary>Inputs and assumptions</summary>" + renderList(assumptionItems, "No additional assumptions.") + "</details>" +
    "<details><summary>Warnings</summary>" + renderList(warningItems, "No warnings.") + "</details>" +
    (thermalTreatment ? "<details><summary>Thermal Treatment</summary><h3>Family</h3><p>" + escapeHtml(thermalTreatment.selection.familyId + " v" + thermalTreatment.selection.familyVersion) + "</p><h3>Trust state</h3><p>" + escapeHtml(thermalTreatment.trustState === "verified" ? "Verified" : "Preliminary Unsafe Estimate � Not verified") + "</p><h3>Baseline versus effective U-value</h3><p>" + thermalTreatment.baselineUValueWPerM2K.toFixed(3) + " -> " + thermalTreatment.effectiveUValueWPerM2K.toFixed(3) + " W/m2K</p><h3>Confirmed inputs</h3>" + renderList(Object.entries(thermalTreatment.confirmedInputs).map(([key, value]) => key + ": " + String(value)), "No confirmed inputs.") + "<h3>Trust reasons</h3>" + renderList(thermalTreatment.trustReasons.map((reason) => reason.message), "No verification blockers.") + "<h3>Actions required for verification</h3>" + renderList(thermalTreatment.actionsRequiredForVerification, "No further action required.") + "<h3>Pack versions</h3><p>Adapter " + escapeHtml(thermalTreatment.packVersions.codeAdapterVersion) + " / Knowledge " + escapeHtml(thermalTreatment.packVersions.knowledgePackVersion) + " / Validation " + escapeHtml(thermalTreatment.packVersions.validationPackVersion) + "</p><h3>Worker</h3><p>" + escapeHtml(thermalTreatment.worker.workerId + " v" + thermalTreatment.worker.workerVersion) + " / " + escapeHtml(thermalTreatment.calculatedAt) + "</p></details>" : "") +
    "<details><summary>Evidence details</summary><h3>Material resolution</h3>" + renderList(resolutionItems, "No library material resolution was applied.") + "<h3>Provenance</h3>" + renderList(provenanceItems, "No evidence references.") + "</details></section>" +
    renderResultDock(snapshot, totalThickness, provenanceItems.length, warningItems.length) +
    "</article>";
}

function renderLayerLine(layer: LayerCalculation, index: number): string {
  return "<div class=\"layer-line\"><span class=\"drag\">⋮⋮</span><span class=\"number\">" + (index + 1) + "</span><span class=\"swatch c" + (index % 8) + "\"></span><strong title=\"" + escapeHtml(layer.materialName) + "\">" + escapeHtml(layer.materialName) + "</strong><span>" + formatNumber(layer.thicknessM * 1000, 1) + " mm</span><span>λ " + formatNumber(layer.lambdaWPerMK, 3) + "</span><span>R " + formatSmall(layer.rValueM2KPerW) + "</span></div>";
}

function renderComposition(layers: LayerCalculation[], totalThickness: number): string {
  if (!layers.length || totalThickness <= 0) return "<div class=\"composition-empty\">Composition unavailable</div>";
  const segments = layers.map((layer, index) => {
    const percentage = layer.thicknessM / totalThickness * 100;
    const label = percentage >= 8 ? escapeHtml(shortMaterial(layer.materialName)) + " " + formatNumber(percentage, 0) + "%" : "";
    return "<div class=\"composition-segment c" + (index % 8) + "\" data-composition-segment=\"" + index + "\" style=\"width:" + percentage.toFixed(4) + "%\" title=\"" + escapeHtml(layer.materialName) + ": " + percentage.toFixed(1) + "%\"><span>" + label + "</span></div>";
  }).join("");
  const legend = layers.map((layer, index) => {
    const percentage = layer.thicknessM / totalThickness * 100;
    return "<div class=\"legend-item\"><span class=\"legend-swatch c" + (index % 8) + "\"></span><b>" + escapeHtml(layer.materialName) + "</b><span>" + percentage.toFixed(1) + "% · " + formatNumber(layer.thicknessM * 1000, 1) + " mm</span></div>";
  }).join("");
  return "<div class=\"composition-bar\" aria-label=\"Assembly composition by thickness\">" + segments + "</div><div class=\"composition-legend\">" + legend + "</div>";
}

function renderMaterialRow(layer: LayerCalculation, index: number, totalThickness: number, totalLayerR: number): string {
  const thicknessShare = totalThickness > 0 ? layer.thicknessM / totalThickness * 100 : 0;
  const rShare = totalLayerR > 0 ? layer.rValueM2KPerW / totalLayerR * 100 : 0;
  return "<tr><td><span class=\"legend-swatch c" + (index % 8) + "\"></span><strong>" + escapeHtml(layer.materialName) + "</strong></td>" +
    "<td>" + formatNumber(layer.thicknessM * 1000, 1) + " mm</td><td><b>" + thicknessShare.toFixed(1) + "%</b></td>" +
    "<td>" + formatNumber(layer.lambdaWPerMK, 3) + " W/mK</td><td>" + formatSmall(layer.rValueM2KPerW) + " m²K/W</td>" +
    "<td><div class=\"share\"><span style=\"width:" + rShare.toFixed(2) + "%\"></span></div><b>" + rShare.toFixed(1) + "%</b></td>" +
    "<td>" + escapeHtml(layer.datapointSources.map(humanizeToken).join(" + ")) + "</td></tr>";
}

function renderDiagram(layers: LayerCalculation[], totalThickness: number): string {
  if (!layers.length || totalThickness <= 0) return "<div class=\"diagram-empty\">Layer section unavailable</div>";
  let cursor = 55;
  const drawable = 570;
  const rects: string[] = [];
  const labels: string[] = [];
  layers.forEach((layer, index) => {
    const width = Math.max(8, layer.thicknessM / totalThickness * drawable);
    rects.push("<rect class=\"svg-c" + (index % 8) + "\" x=\"" + cursor.toFixed(2) + "\" y=\"48\" width=\"" + width.toFixed(2) + "\" height=\"142\"/><circle cx=\"" + (cursor + width / 2).toFixed(2) + "\" cy=\"119\" r=\"13\"/><text class=\"layer-n\" x=\"" + (cursor + width / 2).toFixed(2) + "\" y=\"123\">" + (index + 1) + "</text>");
    const labelY = 45 + index * 22;
    labels.push("<line x1=\"" + (cursor + width / 2).toFixed(2) + "\" y1=\"48\" x2=\"675\" y2=\"" + labelY + "\"/><text x=\"684\" y=\"" + (labelY + 4) + "\">" + escapeHtml(shortMaterial(layer.materialName)) + " (" + formatNumber(layer.thicknessM * 1000, 1) + "mm)</text>");
    cursor += width;
  });
  return "<svg class=\"assembly-svg\" viewBox=\"0 0 940 250\" role=\"img\" aria-label=\"Layered assembly schematic\"><text x=\"55\" y=\"28\">Inside</text><text x=\"565\" y=\"28\">Outside</text>" +
    rects.join("") + labels.join("") + "<line class=\"dimension\" x1=\"55\" y1=\"218\" x2=\"" + cursor.toFixed(2) + "\" y2=\"218\"/><text class=\"dimension-label\" x=\"" + ((55 + cursor) / 2).toFixed(2) + "\" y=\"238\">" + formatNumber(totalThickness * 1000, 1) + " mm total</text></svg>";
}

function renderTemperature(snapshot: CalculationSnapshot, assemblyIndex: number): string {
  const profile = snapshot.temperatureProfile;
  if (!profile || !profile.points.length) return "<section class=\"temperature\" id=\"temperature-" + assemblyIndex + "\"><h2>Temperature Profile</h2><p>Profile unavailable.</p></section>";
  const points = profile.points;
  const min = Math.min(...points.map((point) => point.temperatureC));
  const max = Math.max(...points.map((point) => point.temperatureC));
  const span = Math.max(1, max - min);
  const width = 680;
  const totalR = Math.max(0.001, points[points.length - 1]?.cumulativeRValueM2KPerW ?? 1);
  const coords = points.map((point) => {
    const x = 55 + point.cumulativeRValueM2KPerW / totalR * width;
    const y = 112 - (point.temperatureC - min) / span * 72;
    return { point, x, y };
  });
  const polyline = coords.map(({ x, y }) => x.toFixed(1) + "," + y.toFixed(1)).join(" ");
  const dots = coords.map(({ point, x, y }) => "<circle cx=\"" + x.toFixed(1) + "\" cy=\"" + y.toFixed(1) + "\" r=\"4\"><title>" + escapeHtml(point.label) + ": " + point.temperatureC.toFixed(1) + "°C</title></circle>").join("");
  return "<section class=\"temperature\" id=\"temperature-" + assemblyIndex + "\"><h2>Temperature Profile</h2><svg viewBox=\"0 0 800 145\" role=\"img\" aria-label=\"Temperature through assembly\"><line x1=\"55\" y1=\"112\" x2=\"735\" y2=\"112\"/><polyline points=\"" + polyline + "\"/>" + dots + "<text x=\"55\" y=\"135\">" + min.toFixed(1) + "°C outside</text><text x=\"650\" y=\"135\">" + max.toFixed(1) + "°C inside</text></svg></section>";
}

function renderResultDock(snapshot: CalculationSnapshot, totalThickness: number, provenanceCount: number, warningCount: number): string {
  const temp = snapshot.temperatureProfile;
  const basis = humanizeToken(snapshot.calculationBasis);
  return "<footer class=\"result-dock\">" +
    "<div class=\"primary\"><small>U-value</small><strong>" + escapeHtml(formatUValue(snapshot)) + "</strong><span>" + escapeHtml(humanizeToken(snapshot.readinessState)) + " result</span></div>" +
    "<div><small>R-value</small><strong>" + (snapshot.totalRValueM2KPerW === null ? "--" : snapshot.totalRValueM2KPerW.toFixed(3)) + "</strong><span>m2K/W</span></div>" +
    "<div><small>Thickness</small><strong>" + formatNumber(totalThickness * 1000, 1) + "</strong><span>mm</span></div>" +
    "<div><small>Temperature</small><strong>" + (temp ? temp.indoorTemperatureC.toFixed(1) + " -> " + temp.outdoorTemperatureC.toFixed(1) : "--") + "</strong><span>C inside -> outside</span></div>" +
    "<div><small>Calculation basis</small><strong>" + escapeHtml(basis) + "</strong><span>" + provenanceCount + " refs / " + warningCount + " warnings</span></div></footer>";
}
function renderList(items: string[], emptyText: string): string {
  return "<ul>" + (items.length ? items.map((item) => "<li>" + escapeHtml(item) + "</li>").join("") : "<li>" + escapeHtml(emptyText) + "</li>") + "</ul>";
}

function reportStyles(): string {
  return [
    ":root{--yellow:#ffe500;--chrome:#3d403f;--dark:#292c2b;--canvas:#f5f6f3;--line:#d2d7d2;--text:#282d2b;--muted:#6b746f;--green:#8fc44c}",
    "*{box-sizing:border-box}html,body{min-height:100%}body{margin:0;background:var(--dark);color:var(--text);font:13px Arial,\"Segoe UI\",sans-serif}",
    ".brandbar{height:56px;background:var(--yellow);display:flex;align-items:center;gap:28px;padding:0 16px;border-bottom:1px solid #c3b000}.brand{display:flex;align-items:center;gap:8px;font-size:24px;font-weight:900;letter-spacing:-.05em}.brand-icon{width:27px;height:27px;border:2px solid #333;border-radius:50%;display:grid;place-items:center;font-size:13px}.product{font-size:10px;font-weight:800;letter-spacing:.13em}.revision{margin-left:auto;font:10px Consolas,monospace}",
    ".toolbar{height:43px;padding:6px 14px;background:linear-gradient(#5a5d5c,#393c3b);color:#fff;display:flex;align-items:center;gap:8px}.toolbar button,.toolbar select{height:29px;border:1px solid #242625;background:#fff;color:#222}.toolbar button{min-width:30px;cursor:pointer}.toolbar select{width:min(520px,60vw);padding:0 8px}.toolbar label{font-size:10px;text-transform:uppercase;letter-spacing:.08em}.toolbar #assembly-count{font-size:11px;color:#d4d8d6}.toolbar .print{margin-left:auto;padding:0 12px}",
    ".app-frame{display:grid;grid-template-columns:68px minmax(0,1fr);min-height:calc(100vh - 99px)}.rail{background:#414443;color:#fff}.rail a{height:72px;color:#fff;text-decoration:none;border-bottom:1px solid #292c2b;display:grid;place-items:center;align-content:center;gap:5px;font-size:9px}.rail b{font-size:19px;font-weight:400}.workspace{min-width:0;background:var(--canvas);padding:16px 18px 130px}",
    ".assembly-view{display:none}.assembly-view.active{display:block}.assembly-heading{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;padding:11px 14px;background:#fff;border:1px solid var(--line);border-bottom:0}.assembly-heading h2{font-size:19px;margin:3px 0}.assembly-heading code{font-size:10px;color:var(--muted)}.eyebrow{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted)}.heading-result{text-align:right}.heading-result strong{display:block;margin-top:6px;font-size:25px}.status{display:inline-block;padding:4px 7px;background:#dff0c8;border:1px solid #b6d48c;color:#466629;text-transform:uppercase;font-size:9px;font-weight:800}.status.estimated,.status.needs_review,.status.blocked{background:#fff1c7;border-color:#e0c274;color:#79531c}",
    ".conditions{padding:9px 14px;background:#f0f2ef;border:1px solid var(--line);display:flex;justify-content:space-between;gap:10px;color:var(--muted);font-size:10px}.work-grid{display:grid;grid-template-columns:minmax(420px,.9fr) minmax(480px,1.1fr);background:#fff;border:1px solid var(--line);border-top:0;min-height:410px}.layer-panel{padding:18px;border-right:1px solid var(--line)}.diagram-panel{padding:18px;min-width:0}.section-title{display:flex;justify-content:space-between;align-items:end;gap:14px;margin-bottom:12px}.section-title h3{margin:3px 0 0;font-size:14px}.section-title>span{color:var(--muted);font-size:10px}.section-title.compact{margin-top:20px}",
    ".layer-line{display:grid;grid-template-columns:18px 24px 13px minmax(130px,1fr) 72px 84px 82px;align-items:center;gap:7px;min-height:37px;border-bottom:1px solid #e5e8e5;font-size:11px}.layer-line .drag{color:#a4aaa6}.layer-line .number{color:var(--muted)}.layer-line strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.swatch,.legend-swatch{display:inline-block;border:1px solid rgba(0,0,0,.17)}.swatch{width:11px;height:27px}.legend-swatch{width:11px;height:11px;flex:0 0 auto}",
    ".c0,.svg-c0{fill:#d8d4cc;background:repeating-linear-gradient(135deg,#c8c5be 0 4px,#eeece7 4px 8px)}.c1,.svg-c1{fill:#f6df4d;background:repeating-linear-gradient(90deg,#efd647 0 4px,#fff286 4px 9px)}.c2,.svg-c2{fill:#cda471;background:repeating-linear-gradient(45deg,#be9363 0 5px,#e3bd8c 5px 10px)}.c3,.svg-c3{fill:#b9c8cc;background:repeating-linear-gradient(135deg,#aebfc4 0 4px,#e2e8ea 4px 9px)}.c4,.svg-c4{fill:#98b798;background:repeating-linear-gradient(90deg,#8cab8c 0 4px,#c9dac9 4px 9px)}.c5,.svg-c5{fill:#d5b4d7;background:repeating-linear-gradient(45deg,#cba3cd 0 4px,#ead7eb 4px 9px)}.c6,.svg-c6{fill:#d7a15b;background:#d7a15b}.c7,.svg-c7{fill:#8bb4d8;background:#8bb4d8}",
    ".composition-bar{height:50px;display:flex;overflow:hidden;border:1px solid #777;background:#eee}.composition-segment{height:100%;min-width:2px;display:grid;place-items:center;overflow:hidden;border-right:1px solid rgba(0,0,0,.25)}.composition-segment span{font-size:9px;font-weight:800;white-space:nowrap;padding:0 5px;text-shadow:0 1px rgba(255,255,255,.7)}.composition-legend{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px 12px;margin-top:9px}.legend-item{display:grid;grid-template-columns:12px minmax(0,1fr) auto;gap:6px;align-items:center;font-size:9px}.legend-item b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.legend-item>span:last-child{color:var(--muted)}",
    ".assembly-svg{width:100%;height:auto;min-height:230px;background:#fbfcfa;border:1px solid #e1e4e1}.assembly-svg rect{stroke:#747a76;stroke-width:1}.assembly-svg circle{fill:#fff;stroke:#606662}.assembly-svg text{font-size:10px;fill:#4b514e}.assembly-svg .layer-n{font-size:10px;font-weight:bold;text-anchor:middle}.assembly-svg line{stroke:#a0a7a2;stroke-width:1}.assembly-svg .dimension{stroke:#777}.assembly-svg .dimension-label{text-anchor:middle;font-weight:bold}.temperature{margin-top:12px}.temperature h2{font-size:12px;margin:0 0 5px}.temperature svg{width:100%;height:88px;background:#f8faf7;border:1px solid #e1e4e1}.temperature line{stroke:#b3bab5}.temperature polyline{fill:none;stroke:#d16b3d;stroke-width:3}.temperature circle{fill:#ffe500;stroke:#5b5f5d}.temperature text{font-size:9px;fill:var(--muted)}",
    ".material-values{margin-top:12px;background:#fff;border:1px solid var(--line);padding:14px}.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse;font-size:10px}th,td{padding:9px 8px;text-align:left;border-bottom:1px solid #e1e5e1;white-space:nowrap}th{background:#f0f2ef;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;font-size:8px}td:first-child{min-width:170px}.share{display:inline-block;vertical-align:middle;width:70px;height:5px;background:#dfe4df;margin-right:7px}.share span{display:block;height:100%;background:var(--green)}",
    ".technical{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}.technical details{background:#fff;border:1px solid var(--line);padding:10px}.technical summary{font-weight:800;cursor:pointer}.technical ul{padding-left:18px;color:var(--muted);font-size:10px;line-height:1.5}.technical h3{font-size:11px}.result-dock{position:fixed;left:68px;right:0;bottom:0;z-index:4;display:grid;grid-template-columns:1.4fr repeat(4,1fr);min-height:112px;padding:13px 18px;background:linear-gradient(#4c4f4e,#303332);border-top:3px solid var(--yellow);color:#fff}.result-dock>div{padding:0 16px;border-right:1px solid #656967}.result-dock>div:last-child{border-right:0}.result-dock small,.result-dock span{display:block;color:#c6ccc9;font-size:9px}.result-dock strong{display:block;margin:4px 0;font-size:17px}.result-dock .primary strong{font-size:28px}",
    ".empty,.empty-cell,.diagram-empty,.composition-empty{padding:32px;text-align:center;color:var(--muted)}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}",
    "@media(max-width:1050px){.work-grid{grid-template-columns:1fr}.layer-panel{border-right:0;border-bottom:1px solid var(--line)}.result-dock{position:static}.workspace{padding-bottom:16px}.technical{grid-template-columns:1fr}}@media(max-width:700px){.app-frame{grid-template-columns:1fr}.rail{display:none}.workspace{padding:8px}.conditions{flex-wrap:wrap}.layer-line{grid-template-columns:18px 20px 11px minmax(110px,1fr) 64px}.layer-line span:nth-last-child(-n+2){display:none}.composition-legend{grid-template-columns:1fr}.result-dock{grid-template-columns:1fr 1fr}.result-dock>div{border:0;padding:8px}.product,.revision{display:none}}",
    "@media print{.toolbar,.rail{display:none}.app-frame{display:block}.workspace{padding:0}.assembly-view{display:block!important;break-after:page}.result-dock{position:static}.brandbar{height:42px}}"
  ].join("");
}

function reportScript(count: number): string {
  return "(function(){var count=" + count + ";var picker=document.getElementById(\"assembly-picker\");var label=document.getElementById(\"assembly-count\");var sections=[\"layers\",\"thermal\",\"temperature\",\"evidence\"];function show(index){if(!count)return;index=(index+count)%count;picker.value=String(index);document.querySelectorAll(\".assembly-view\").forEach(function(view,i){view.classList.toggle(\"active\",i===index);});sections.forEach(function(section){document.getElementById(\"nav-\"+section).setAttribute(\"href\",\"#\"+section+\"-\"+index);});label.textContent=(index+1)+\" / \"+count;window.scrollTo({top:0,behavior:\"smooth\"});}if(picker){picker.addEventListener(\"change\",function(){show(Number(picker.value));});document.getElementById(\"previous\").addEventListener(\"click\",function(){show(Number(picker.value)-1);});document.getElementById(\"next\").addEventListener(\"click\",function(){show(Number(picker.value)+1);});}})();";
}
function formatUValue(snapshot: CalculationSnapshot): string {
  if (snapshot.uValueWPerM2K !== null) return snapshot.uValueWPerM2K.toFixed(3) + " W/m2K";
  if (snapshot.uValueRangeWPerM2K !== null) return snapshot.uValueRangeWPerM2K.min.toFixed(3) + "-" + snapshot.uValueRangeWPerM2K.max.toFixed(3) + " W/m2K";
  return "Blocked";
}

function primaryAssemblyLabel(snapshot: CalculationSnapshot): string {
  if (snapshot.layers.length === 1) return snapshot.layers[0].materialName;
  if (snapshot.layers.length > 1) {
    const materials = snapshot.layers.slice(0, 2).map((layer) => layer.materialName).join(" + ");
    const remainder = snapshot.layers.length > 2 ? " + " + (snapshot.layers.length - 2) + " more" : "";
    return materials + remainder;
  }
  return humanizeToken(snapshot.assemblyGroupId);
}

function shortMaterial(value: string): string {
  return value.length > 24 ? value.slice(0, 22) + "…" : value;
}

function shortId(value: string): string {
  return value.length > 18 ? value.slice(0, 8) + "…" + value.slice(-6) : value;
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

function temperature(value: number | undefined): string {
  return value === undefined ? "—" : value.toFixed(1) + " °C";
}

function humanizeToken(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatNumber(value: number, digits: number): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function formatSmall(value: number): string {
  if (value > 0 && value < 0.001) return "<0.001";
  return formatNumber(value, 3);
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
