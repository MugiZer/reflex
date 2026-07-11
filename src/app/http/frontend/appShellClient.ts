export function renderAppShellClientScript(): string {
  return `
const app = document.getElementById("app");
const path = location.pathname;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

async function home() {
  app.innerHTML = '<div class="grid"><section class="panel"><div class="panel-head"><div><span class="eyebrow">IFC upload</span><h2>New analysis</h2></div></div><form id="upload" class="drop"><input name="ifc" type="file" accept=".ifc,.ifczip,.ifcxml" required><p><button>Start analysis</button></p><p id="uploadMsg" class="muted"></p></form></section><section><div class="panel-head"><div><span class="eyebrow">Workspace</span><h2>Recent analyses</h2></div></div><div id="jobs" class="jobs"></div></section></div>';
  document.getElementById("upload").onsubmit = async (event) => {
    event.preventDefault();
    document.getElementById("uploadMsg").textContent = "Preparing analysis...";
    const result = await api("/api/jobs", { method: "POST", body: new FormData(event.currentTarget) });
    location.href = "/jobs/" + result.jobId;
  };
  const data = await api("/api/jobs");
  document.getElementById("jobs").innerHTML = data.jobs.map(jobCard).join("") || '<section class="panel"><h2>No analyses yet</h2><p class="muted">Upload a local IFC to create the first isolated review analysis.</p></section>';
}

function jobCard(job) {
  return '<article class="job"><div><strong>' + esc(job.originalFilename) + '</strong><span class="muted">Run id: ' + esc(job.jobId) + '</span></div><div class="job-actions"><span class="' + statusClass(job.jobStatus) + '">' + esc(statusLabel(job.jobStatus)) + '</span> <a class="button secondary" href="/jobs/' + job.jobId + '">Open</a></div></article>';
}

async function jobPage(jobId) {
  while (true) {
    const job = await api("/api/jobs/" + jobId);
    const highlightStepIds = firstHighlightStepIds(job);
    app.innerHTML = viewerShell(job, highlightStepIds) + '<section class="panel"><div class="panel-head"><div><span class="eyebrow">Analysis</span><h2>' + esc(job.originalFilename) + '</h2></div><span class="' + statusClass(job.jobStatus) + '">' + esc(statusLabel(job.jobStatus)) + '</span></div><p class="muted">Run id: ' + esc(job.jobId) + '</p>' + stateMessage(job) + (job.errorMessage ? '<p class="error">Failure: ' + esc(job.errorMessage) + '</p>' : '') + actions(job) + '</section>';
    initViewer(geometryUrlFor(job.links && job.links.viewerGeometry, highlightStepIds), highlightStepIds);
    if (job.jobStatus !== "queued" && job.jobStatus !== "processing") break;
    await sleep(600);
  }
}

function actions(job) {
  let html = '<div class="action-row"><a class="button secondary" href="/">All analyses</a>';
  if (job.links.review) html += '<a class="button" href="' + job.links.review + '">Resolve missing inputs</a>';
  if (job.links.report) html += '<a class="button" href="' + job.links.report + '">Open report</a>';
  return html + '</div>';
}

function stateMessage(job) {
  if (job.jobStatus === "failed") return '<p class="error">Analysis failed before report generation.</p>';
  if (job.links.report) return '<p class="muted">Review complete. Report ready.</p>';
  if (job.links.review) return '<p class="muted">Missing inputs need resolution before the report is ready.</p>';
  if (job.jobStatus === "queued" || job.jobStatus === "processing") return '<p class="muted">Processing IFC evidence and preparing review inputs.</p>';
  return '<p class="muted">No next action is available for this analysis.</p>';
}

async function reviewPage(jobId) {
  const job = await api("/api/jobs/" + jobId);
  const inputs = (job.review && job.review.requestedInputs) || [];
  const context = job.review && job.review.context;
  const groups = context ? context.groups : fallbackGroups(inputs);
  const active = groups[0];
  const activeInputs = inputs.filter((input) => input.assemblyGroupId === active.assemblyGroupId);
  const displayStepIds = displayStepIdsForGroup(active);
  app.innerHTML = viewerShell(job, displayStepIds) + '<section class="review"><div class="panel-head"><div><span class="eyebrow">Review</span><h2>Resolve missing inputs</h2></div><span class="' + statusClass(job.jobStatus) + '">' + esc(statusLabel(job.jobStatus)) + '</span></div><div class="review-list"><nav class="rail">' + groups.map((group, index) => '<button type="button" class="' + (index === 0 ? 'active' : '') + '">' + esc(group.primaryLabel) + '<br><span class="muted">' + esc(group.secondaryLabel) + '</span></button>').join("") + '</nav><form id="reviewForm">' + activeInputs.map((input) => renderQuestion(input, questionContext(active, input))).join("") + '<p><button type="button" class="secondary" id="demoValues">Demo values</button> <button>Save inputs</button></p><p id="reviewMsg" class="muted"></p></form></div></section>';
  initViewer(geometryUrlFor(job.links && job.links.viewerGeometry, displayStepIds), displayStepIds);
  document.getElementById("demoValues").onclick = () => {
    const form = document.getElementById("reviewForm");
    activeInputs.forEach((input) => {
      form.elements[input.requestedInputId].value = demoValueFor(input, questionContext(active, input));
      form.elements[input.requestedInputId + "_scope"].value = input.scope && input.scope.scopeKind ? input.scope.scopeKind : "assembly_group";
    });
    document.getElementById("reviewMsg").textContent = "Demo values filled. Save inputs to calculate.";
  };
  document.getElementById("reviewForm").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = { assemblyGroupId: active.assemblyGroupId, inputs: activeInputs.map((input) => ({ requestedInputId: input.requestedInputId, value: form.elements[input.requestedInputId].value, unit: input.unit, overrideScope: form.elements[input.requestedInputId + "_scope"].value })) };
    document.getElementById("reviewMsg").textContent = "Saving inputs...";
    await api("/api/jobs/" + jobId + "/review-inputs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    location.href = "/jobs/" + jobId;
  };
}

function renderQuestion(input, context) {
  const evidence = context.evidenceSummary;
  const inputType = input.inputType === "number" ? "number" : "text";
  return '<div class="question"><strong>' + esc(context.question || input.question) + '</strong><p class="muted">' + esc(context.missingValueLabel || input.datapoint) + (input.unit ? ' - ' + esc(input.unit) : '') + '</p>' + renderEvidence(evidence) + '<input type="' + inputType + '" step="any" min="0" name="' + esc(input.requestedInputId) + '" required><select name="' + esc(input.requestedInputId) + '_scope">' + context.scopeOptions.map((option) => '<option value="' + esc(option.scopeKind) + '">' + esc(option.label) + '</option>').join("") + '</select><details><summary class="muted">Technical ids</summary><p class="muted">Requested input: ' + esc(input.requestedInputId) + '<br>Review group: ' + esc(input.assemblyGroupId) + '<br>Scope: ' + esc(input.scope.scopeKind) + '</p></details></div>';
}

function renderEvidence(evidence) {
  if (!evidence) return '<p class="muted">No direct evidence context.</p>';
  return '<div class="evidence"><h3>Evidence context</h3><dl><dt>IFC class</dt><dd>' + esc(evidence.ifcClassLabel) + '</dd><dt>Element</dt><dd>' + esc(evidence.elementLabel) + '</dd><dt>Layer</dt><dd>' + esc(evidence.layerLabel || "Not layer-specific") + '</dd><dt>Material</dt><dd>' + esc(evidence.materialLabel || "Unknown") + '</dd><dt>Source elements</dt><dd>' + esc(evidence.sourceElementCount) + '</dd><dt>Evidence path</dt><dd>' + esc(evidence.evidencePathLabel) + '</dd></dl></div>';
}

function questionContext(group, input) {
  return group.questions.find((question) => question.requestedInputId === input.requestedInputId) || fallbackQuestion(input);
}

function fallbackGroups(inputs) {
  const groupIds = [...new Set(inputs.map((input) => input.assemblyGroupId))];
  return groupIds.map((assemblyGroupId) => ({ assemblyGroupId, primaryLabel: "Assembly requiring review", secondaryLabel: "IFC element", questions: inputs.filter((input) => input.assemblyGroupId === assemblyGroupId).map(fallbackQuestion) }));
}

function fallbackQuestion(input) {
  return { requestedInputId: input.requestedInputId, question: input.question, missingValueLabel: input.datapoint, scopeOptions: [{ scopeKind: "layer_occurrence", label: "Only this layer in this element" }, { scopeKind: "material_decision", label: "All matching layers using this material" }, { scopeKind: "assembly_group", label: "All matching assemblies in this review group" }, { scopeKind: "element_type", label: "All elements using this IFC type" }], evidenceSummary: null };
}

function viewerShell(job, highlightStepIds) {
  if (!job.links || !job.links.ifc) return "";
  return '<section class="viewer"><div class="viewer-head"><h2>IFC Viewer</h2><span id="ifcViewerStatus" class="viewer-status">' + esc(viewerTargetText(highlightStepIds)) + '</span></div><div id="ifcViewerStage" class="viewer-stage"></div></section>';
}

async function initViewer(geometryUrl, highlightStepIds) {
  const container = document.getElementById("ifcViewerStage");
  const status = document.getElementById("ifcViewerStatus");
  if (!container || !status || !geometryUrl) return;
  if (!window.createIfcReviewViewer) {
    container.innerHTML = '<div class="viewer-unavailable">3D viewer adapter is not available.</div>';
    return;
  }
  try {
    if (window.activeIfcReviewViewer && window.activeIfcReviewViewer.dispose) {
      window.activeIfcReviewViewer.dispose();
    }
    window.activeIfcReviewViewer = await window.createIfcReviewViewer({
      container,
      status,
      geometryUrl,
      highlightStepIds,
    });
  } catch (error) {
    status.textContent = "3D viewer unavailable.";
    container.innerHTML = '<div class="viewer-unavailable">' + esc(error && error.message ? error.message : error) + '</div>';
  }
}

function firstHighlightStepIds(job) {
  const groups = job.review && job.review.context && job.review.context.groups;
  return groups && groups[0] ? displayStepIdsForGroup(groups[0]) : [];
}

function viewerTargetText(stepIds) {
  return stepIds && stepIds.length > 0 ? "Display STEP ids: " + stepIds.join(", ") : "Ready to load model.";
}

function geometryUrlFor(baseUrl, stepIds) {
  if (!baseUrl || !stepIds || stepIds.length === 0) return baseUrl;
  return baseUrl + "?stepIds=" + encodeURIComponent(stepIds.join(","));
}

function displayStepIdsForGroup(group) {
  return group.displayStepIds || group.highlightStepIds || [];
}

function demoValueFor(input, context) {
  if (input.datapoint === "layer_lambda") return demoLambdaFor(input, context);
  if (input.datapoint === "layer_thickness" || input.datapoint === "assembly_thickness") return "0.12";
  if (input.datapoint === "calculation_basis_evidence") return "Reviewed IFC evidence";
  return "Demo review value";
}

function demoLambdaFor(input, context) {
  const material = materialNameForDemo(input, context);
  const normalized = normalizeForDemo(material);
  if (containsAny(normalized, ["aluminium", "aluminum"])) return "205";
  if (containsAny(normalized, ["acier", "steel", "metal", "metallique", "metalique"])) return "50";
  if (containsAny(normalized, ["beton", "concrete", "bloc beton", "block"])) return "1.7";
  if (containsAny(normalized, ["brique", "brick", "masonry"])) return "0.77";
  if (containsAny(normalized, ["gypse", "gypsum", "plasterboard"])) return "0.25";
  if (containsAny(normalized, ["bois", "wood", "contreplaque", "plywood", "madrier"])) return "0.13";
  if (containsAny(normalized, ["air", "espacement", "cavity"])) return "0.18";
  if (containsAny(normalized, ["isolant", "insulation", "mineral wool", "wool", "rigide", "semi rigide"])) return "0.04";
  return "0.04";
}

function materialNameForDemo(input, context) {
  if (input.scope && input.scope.scopeKind === "material_decision") return input.scope.materialName;
  return context && context.evidenceSummary ? context.evidenceSummary.materialLabel : "";
}

function normalizeForDemo(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function containsAny(value, terms) {
  return terms.some((term) => value.includes(term));
}

function statusClass(status) {
  return "status status-" + esc(status);
}

function statusLabel(status) {
  if (status === "needs_review") return "Needs input";
  return String(status).replaceAll("_", " ");
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

if (path === "/") home().catch(showError);
else if (path.endsWith("/review")) reviewPage(path.split("/")[2]).catch(showError);
else jobPage(path.split("/")[2]).catch(showError);

function showError(error) {
  app.innerHTML = '<p class="error">' + esc(error.message) + '</p>';
}
`;
}
