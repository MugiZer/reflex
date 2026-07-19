export function renderAppShellClientScript(): string {
  return `
const app = document.getElementById("app");
const path = location.pathname;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || response.statusText);
  return response.json();
}

function createThermalReviewWorkspace(jobId, initial = {}) {
  const url = new URL(location.href);
  let viewer = null;
  const state = {
    targetU: validTarget(initial.targetU ?? url.searchParams.get("targetU"))
      ? String(initial.targetU ?? url.searchParams.get("targetU"))
      : "0.24",
    reviewMode: validReviewMode(initial.reviewMode ?? url.searchParams.get("reviewMode")),
    filter: validFilter(initial.filter ?? url.searchParams.get("filter")),
    drafts: { ...(initial.drafts || {}) },
    sources: { ...(initial.sources || {}) },
  };

  function syncUrl() {
    const next = new URL(location.href);
    next.searchParams.set("targetU", state.targetU);
    if (state.reviewMode) next.searchParams.set("reviewMode", state.reviewMode);
    else next.searchParams.delete("reviewMode");
    if (state.filter !== "all") next.searchParams.set("filter", state.filter);
    else next.searchParams.delete("filter");
    history.replaceState(null, "", next.pathname + next.search);

  }

  return {
    state,
    seed(job) {
      const seeded = seedReviewMode(job, state.drafts, state.sources, state.reviewMode);
      state.drafts = seeded.drafts;
      state.sources = seeded.sources;
      return state;
    },
    setReviewMode(mode) {
      if (!validReviewMode(mode)) return;
      state.reviewMode = mode;
      syncUrl();
    },
    setTarget(target) {
      if (!validTarget(target)) return;
      state.targetU = String(target);
      syncUrl();
    },
    setFilter(filter) {
      state.filter = validFilter(filter);
      syncUrl();
    },
    setDraft(requestedInputId, value, source) {
      state.drafts[requestedInputId] = value;
      state.sources[requestedInputId] = source;
    },
    clearDrafts() {
      state.drafts = {};
      state.sources = {};
    },
    setViewer(nextViewer) {
      viewer = nextViewer;
    },
    hasViewer() {
      return Boolean(viewer);
    },
    selectViewer(stepIds) {
      if (viewer && viewer.select) viewer.select(stepIds);
    },
    navigationUrl() {
      syncUrl();
      return location.pathname + location.search;
    },
  };
}

function validReviewMode(value) {
  return value === "library" || value === "manual" || value === "mixed" ? value : null;
}

function validFilter(value) {
  return value === "action" || value === "over" || value === "meets" ? value : "all";
}
async function home() {
  app.innerHTML = '<div class="grid home-grid"><section class="panel"><div class="panel-head"><div><span class="eyebrow">IFC upload</span><h2>New analysis</h2></div></div><form id="upload" class="drop"><input name="ifc" type="file" accept=".ifc,.ifczip,.ifcxml" required><p><button>Start analysis</button></p><p id="uploadMsg" class="muted"></p></form></section><section><div class="panel-head"><div><span class="eyebrow">Workspace</span><h2>Recent analyses</h2></div></div><div id="jobs" class="jobs"></div></section></div>';
  document.getElementById("upload").onsubmit = async (event) => {
    event.preventDefault();
    document.getElementById("uploadMsg").textContent = "Preparing analysis...";
    const result = await api("/api/jobs", { method: "POST", body: new FormData(event.currentTarget) });
    location.href = "/jobs/" + result.jobId;
  };
  const data = await api("/api/jobs");
  document.getElementById("jobs").innerHTML = data.jobs.map(jobCard).join("") || '<section class="panel"><h2>No analyses yet</h2><p class="muted">Upload a local IFC to create the first thermal review.</p></section>';
}

function jobCard(job) {
  return '<article class="job"><div><strong>' + esc(job.originalFilename) + '</strong><span class="muted">' + esc(jobStateNote(job)) + '</span></div><div class="job-actions"><span class="' + statusClass(job.jobStatus) + '">' + esc(statusLabel(job.jobStatus)) + '</span><a class="button secondary" href="/jobs/' + esc(job.jobId) + '">Open</a></div></article>';
}

async function workspacePage(jobId, targetU = currentTargetU(), draftSeed = {}, draftSourceSeed = {}, reviewModeSeed = currentReviewMode()) {
  const workspace = createThermalReviewWorkspace(jobId, {
    targetU,
    drafts: draftSeed,
    sources: draftSourceSeed,
    reviewMode: reviewModeSeed,
  });
  let job;
  while (true) {
    job = await api("/api/jobs/" + encodeURIComponent(jobId) + "?targetU=" + encodeURIComponent(workspace.state.targetU));
    if (job.jobStatus !== "queued" && job.jobStatus !== "processing") break;
    renderProcessing(job, workspace.state.targetU);
    await sleep(600);
  }
  if (!workspace.state.reviewMode && hasReviewInputs(job)) {
    renderReviewSetup(job, workspace);
    return;
  }
  workspace.seed(job);
  renderArchitectWorkspace(job, workspace);
}

function renderReviewSetup(job, workspace) {



  const targetU = workspace.state.targetU;
  const inputs = reviewInputsFor(job);
  const matchedCount = inputs.filter((input) => librarySuggestion(job, input, reviewQuestionContext(job, input.requestedInputId))).length;
  app.innerHTML = projectHeader(job, targetU) + '<section class="review-setup panel"><div class="review-setup-intro"><span class="eyebrow">Before you review</span><h1>How should we resolve missing values?</h1><p>Choose how you want to fill the calculation inputs. You can change any individual value later.</p><p class="review-setup-count"><strong>' + esc(matchedCount) + ' of ' + esc(inputs.length) + '</strong> inputs have an exact Material Library match. The rest need a manual value or a different material selection.</p></div><div class="review-mode-grid"><button type="button" class="review-mode-card" data-review-mode="library"><span class="mode-kicker">Fastest start</span><strong>Use Material Library values</strong><span>Prefill exact matches from the reference library and show the selected material and lambda for every input.</span></button><button type="button" class="review-mode-card" data-review-mode="manual"><span class="mode-kicker">Full control</span><strong>Enter values manually</strong><span>Start with blank inputs and provide the thermal values yourself.</span></button><button type="button" class="review-mode-card" data-review-mode="mixed"><span class="mode-kicker">Recommended</span><strong>Use a mix</strong><span>Prefill credible library matches and manually complete the remaining inputs.</span></button></div><p class="review-setup-note">Material Library values are reference data. Confirm them against the product or specification before relying on the final report.</p></section>';
  wireTargetForm();
  document.querySelectorAll("[data-review-mode]").forEach((button) => {
    button.onclick = () => {
      const mode = button.dataset.reviewMode;
      workspace.setReviewMode(mode);
      workspace.seed(job);
      renderArchitectWorkspace(job, workspace);
    };
  });
}

function reviewInputsFor(job) {
  const model = job.architectActions || emptyActionModel(job);
  const assemblies = model.assemblies || [];
  const unresolvedInputIds = new Set(assemblies.flatMap((assembly) => assembly.nextAction.requestedInputIds || []));
  return uniqueRequestedInputs((job.review && job.review.requestedInputs) || []).filter((input) => unresolvedInputIds.has(input.requestedInputId));
}

function seedReviewMode(job, draftSeed, draftSourceSeed, mode) {
  const drafts = { ...(draftSeed || {}) };
  const sources = { ...(draftSourceSeed || {}) };
  if (mode !== "manual") {
    reviewInputsFor(job).forEach((input) => {
      const library = librarySuggestion(job, input, reviewQuestionContext(job, input.requestedInputId));
      if (!library || hasDraftValue(drafts[input.requestedInputId])) return;
      drafts[input.requestedInputId] = String(library.lambdaWPerMK);
      sources[input.requestedInputId] = { source: "material_library", materialLibraryKey: library.materialKey };
    });
  }
  return { drafts, sources };
}
function hasReviewInputs(job) {
  const model = job.architectActions || emptyActionModel(job);
  const unresolved = new Set((model.assemblies || []).flatMap((assembly) => assembly.nextAction.requestedInputIds || []));
  return Boolean(job.review && (job.review.requestedInputs || []).some((input) => unresolved.has(input.requestedInputId)));
}
function renderProcessing(job, targetU) {
  app.innerHTML = projectHeader(job, targetU) + '<section class="panel processing-panel"><span class="loading-dot"></span><div><h2>Reading IFC evidence</h2><p class="muted">The model is being grouped into thermal assemblies. This page updates automatically.</p></div></section>';
  wireTargetForm();
}

function renderArchitectWorkspace(job, workspace) {
  const targetU = workspace.state.targetU;
  const reviewMode = workspace.state.reviewMode;
  const model = job.architectActions || emptyActionModel(job);
  const assemblies = model.assemblies || [];
  const unresolvedInputIds = new Set(assemblies.flatMap((assembly) => assembly.nextAction.requestedInputIds || []));
  const allInputs = uniqueRequestedInputs((job.review && job.review.requestedInputs) || []).filter((input) => unresolvedInputIds.has(input.requestedInputId));
  const drafts = workspace.state.drafts;
  const draftSources = workspace.state.sources;
  let viewerVisible = true;
  const hasUnresolvedReview = allInputs.length > 0;
  let activeAssemblyGroupId = (assemblies.find(needsAction) || assemblies[0] || {}).assemblyGroupId || null;
  let activeFilter = workspace.state.filter;

  app.innerHTML = projectHeader(job, targetU) + summaryBar(model.summary) +
    '<div class="architect-workspace"><div class="model-column">' + (job.links && job.links.viewerGeometry ? '<button type="button" id="viewerToggle" class="viewer-toggle">Hide 3D model</button>' : "") + viewerShell(job) + '</div><aside id="actionAside" class="action-aside"></aside></div>';
  wireTargetForm(function (nextTarget) {
    workspace.setTarget(nextTarget);
    workspacePage(job.jobId, workspace.state.targetU, drafts, draftSources, reviewMode).catch(showError);
  });
  renderAside();
  const viewerToggle = document.getElementById("viewerToggle");
  const viewerPanel = document.getElementById("ifcViewer");
  if (viewerToggle && viewerPanel) viewerToggle.onclick = () => {
    viewerVisible = !viewerVisible;
    viewerPanel.hidden = !viewerVisible;
    viewerToggle.textContent = viewerVisible ? "Hide 3D model" : "Show 3D model";
  };

  const actionStepIds = uniqueNumbers(assemblies.filter(needsAction).flatMap((assembly) => assembly.displayStepIds || []));
  initViewer(job.links && job.links.viewerGeometry, actionStepIds, assemblies, function (_stepId, info) {
    if (info && info.groupId) selectAssembly(info.groupId, true);
  }).then(function (createdViewer) {
    workspace.setViewer(createdViewer);
    if (createdViewer && activeAssemblyGroupId) {
      const active = assemblies.find((assembly) => assembly.assemblyGroupId === activeAssemblyGroupId);
      if (active) workspace.selectViewer(active.displayStepIds || []);
    }
  });

  function visibleAssemblies() {
    if (activeFilter === "action") return assemblies.filter(needsAction);
    if (activeFilter === "over") return assemblies.filter((assembly) => assembly.performance.verdict === "misses_target");
    if (activeFilter === "meets") return assemblies.filter((assembly) => assembly.performance.verdict === "meets_target");
    return assemblies;
  }

  function selectAssembly(assemblyGroupId, scrollCard) {
    if (!assemblies.some((assembly) => assembly.assemblyGroupId === assemblyGroupId)) return;
    if (!visibleAssemblies().some((assembly) => assembly.assemblyGroupId === assemblyGroupId)) {
      workspace.setFilter("all");
      activeFilter = workspace.state.filter;
    }
    activeAssemblyGroupId = assemblyGroupId;
    renderAside();
    const active = assemblies.find((assembly) => assembly.assemblyGroupId === assemblyGroupId);
    if (workspace.hasViewer() && active) workspace.selectViewer(active.displayStepIds || []);
    if (scrollCard) {
      const card = document.querySelector('[data-action-id="' + attributeSelectorValue(assemblyGroupId) + '"]');
      if (card) card.scrollIntoView({ block: "nearest" });
    }
  }

  function renderAside() {
    const aside = document.getElementById("actionAside");
    const visible = visibleAssemblies();
    if (!visible.some((assembly) => assembly.assemblyGroupId === activeAssemblyGroupId)) {
      activeAssemblyGroupId = (visible[0] || assemblies[0] || {}).assemblyGroupId || null;
    }
    const active = assemblies.find((assembly) => assembly.assemblyGroupId === activeAssemblyGroupId) || null;
    aside.innerHTML = '<div class="action-aside-head"><div><span class="eyebrow">Architect action view</span><h2>Assemblies, ordered by risk</h2></div><span class="action-count">' + esc(assemblies.length) + '</span></div>' +
      filterBar(activeFilter, model.summary) +
      '<nav class="action-list" aria-label="Thermal assembly actions">' + (visible.map((assembly) => actionCard(assembly, assembly === active, drafts, allInputs)).join("") || '<p class="empty-state">No assemblies match this view.</p>') + '</nav>' +
      (active ? actionDetail(active, job, allInputs, drafts, hasUnresolvedReview, reviewMode) : '<section class="empty-state"><h3>No assembly data</h3><p>The IFC did not produce an assembly action yet.</p></section>');

    aside.querySelectorAll("[data-action-id]").forEach((button) => {
      button.onclick = () => selectAssembly(button.dataset.actionId, false);
    });
    aside.querySelectorAll("[data-action-filter]").forEach((button) => {
      button.onclick = () => {
        workspace.setFilter(button.dataset.actionFilter);
        activeFilter = workspace.state.filter;
        renderAside();
        const selected = assemblies.find((assembly) => assembly.assemblyGroupId === activeAssemblyGroupId);
        if (workspace.hasViewer() && selected) workspace.selectViewer(selected.displayStepIds || []);
      };
    });
    aside.querySelectorAll("[data-requested-input-id]").forEach((field) => {
      field.oninput = () => {
        workspace.setDraft(field.dataset.requestedInputId, field.value, { source: "manual" });
        updateDraftProgress(aside, allInputs, drafts, active);
      };
    });
    aside.querySelectorAll("[data-use-library]").forEach((button) => {
      button.onclick = () => {
        workspace.setDraft(button.dataset.libraryInputId, button.dataset.libraryValue, { source: "material_library", materialLibraryKey: button.dataset.libraryKey });
        renderAside();
      };
    });
    aside.querySelectorAll("[data-library-picker]").forEach((picker) => {
      picker.onchange = () => {
        const entry = ((job.materialLibrary && job.materialLibrary.entries) || []).find((candidate) => candidate.materialKey === picker.value);
        if (!entry) return;
        workspace.setDraft(picker.dataset.libraryInputId, String(entry.lambdaWPerMK), { source: "material_library", materialLibraryKey: entry.materialKey });
        renderAside();
      };
    });
    aside.querySelectorAll("[data-apply-optional]").forEach((button) => {
      button.onclick = async () => {
        const requestedInputId = button.dataset.optionalInputId;
        const requested = (job.review && job.review.requestedInputs || []).find((input) => input.requestedInputId === requestedInputId);
        const select = document.getElementById("optionalLibrary_" + requestedInputId);
        const manual = document.getElementById("optionalValue_" + requestedInputId);
        const entry = ((job.materialLibrary && job.materialLibrary.entries) || []).find((candidate) => candidate.materialKey === (select && select.value));
        const value = entry ? entry.lambdaWPerMK : Number(manual && manual.value);
        if (!requested || !Number.isFinite(value) || value <= 0) return;
        button.disabled = true;
        try {
          await api("/api/jobs/" + encodeURIComponent(job.jobId) + "/review-inputs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              inputs: [{
                requestedInputId,
                value: String(value),
                unit: requested.unit,
                overrideScope: requested.scope.scopeKind,
                materialLibraryKey: entry && entry.materialKey,
              }],
            }),
          });
          workspacePage(job.jobId, workspace.state.targetU, workspace.state.drafts, workspace.state.sources, workspace.state.reviewMode).catch(showError);
        } catch (error) {
          button.disabled = false;
          const message = document.getElementById("reviewMsg");
          if (message) message.textContent = error.message || String(error);
        }
      };
    });

    const runButton = document.getElementById("runCalculation");
    if (runButton) {
      runButton.onclick = async () => {
        if (!allInputs.every((input) => hasValidDraft(input, drafts[input.requestedInputId]))) return;
        runButton.disabled = true;
        const message = document.getElementById("reviewMsg");
        message.textContent = "Calculating every reviewed assembly...";
        const payload = {
          inputs: allInputs.map((input) => ({
            requestedInputId: input.requestedInputId,
            value: drafts[input.requestedInputId],
            unit: input.unit,
            overrideScope: input.scope.scopeKind,
            materialLibraryKey: draftSources[input.requestedInputId] && draftSources[input.requestedInputId].materialLibraryKey,
          })),
        };
        try {
          await api("/api/jobs/" + encodeURIComponent(job.jobId) + "/review-inputs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          workspace.clearDrafts();
          location.href = workspace.navigationUrl();
        } catch (error) {
          message.textContent = error && error.message ? error.message : "Calculation could not be started.";
          updateDraftProgress(aside, allInputs, drafts, active);
        }
      };
    }
    updateDraftProgress(aside, allInputs, drafts, active);
  }
}

function projectHeader(job, targetU) {
  const hasUnresolved = job.architectActions && (job.architectActions.summary.needsReviewCount + job.architectActions.summary.blockedCount) > 0;
  const displayStatus = hasUnresolved ? "needs_review" : job.jobStatus;
  const reportLabel = hasUnresolved ? "Open previous report ->" : "Open Ubakus-style report ->";
  const reportLink = job.links && job.links.report ? '<a class="button" href="' + esc(job.links.report) + '">' + reportLabel + '</a>' : '';
  return '<section class="project-header"><div class="project-title"><span class="eyebrow">Thermal design review</span><h2>' + esc(job.originalFilename) + '</h2><div class="project-meta"><span class="' + statusClass(displayStatus) + '">' + esc(statusLabel(displayStatus)) + '</span><span>' + esc(jobStateNote(job)) + '</span></div></div><div class="project-actions"><form id="targetForm" class="target-form"><label for="targetU">Working U-value target</label><div><input id="targetU" type="number" min="0.01" max="10" step="0.01" value="' + esc(targetU) + '"><span>W/m2K</span><button class="secondary">Apply</button></div><small>Editable design benchmark - not a code-compliance verdict.</small></form>' + reportLink + '<a class="button secondary" href="/">All analyses</a></div></section>';
}

function wireTargetForm(onApply) {
  const form = document.getElementById("targetForm");
  if (!form) return;
  form.onsubmit = (event) => {
    event.preventDefault();
    const value = Number(document.getElementById("targetU").value);
    if (!Number.isFinite(value) || value <= 0 || value > 10) return;
    if (onApply) {
      onApply(value);
      return;
    }
    const next = new URL(location.href);
    next.searchParams.set("targetU", String(value));
    location.href = next.pathname + next.search;
  };
}

function summaryBar(summary) {
  return '<section class="architect-summary">' +
    summaryMetric(summary.needsActionCount, "Need action", "critical") +
    summaryMetric(summary.blockedCount, "Blocked", "danger") +
    summaryMetric(summary.failingTargetCount, "Over target", "danger") +
    summaryMetric(summary.needsReviewCount, "Needs input", "warning") +
    summaryMetric(summary.passingTargetCount, "Meet target", "success") +
    summaryMetric(summary.assemblyCount, "Assemblies", "neutral") +
    '</section>';
}

function summaryMetric(value, label, tone) {
  return '<div class="summary-metric ' + tone + '"><strong>' + esc(value || 0) + '</strong><span>' + esc(label) + '</span></div>';
}

function filterBar(activeFilter, summary) {
  return '<div class="action-filters" role="toolbar" aria-label="Assembly filters">' +
    filterButton("all", "All", summary.assemblyCount, activeFilter) +
    filterButton("action", "Need action", summary.needsActionCount, activeFilter) +
    filterButton("over", "Over target", summary.failingTargetCount, activeFilter) +
    filterButton("meets", "Meets", summary.passingTargetCount, activeFilter) +
    '</div>';
}

function filterButton(value, label, count, activeFilter) {
  return '<button type="button" data-action-filter="' + value + '" class="filter-chip ' + (value === activeFilter ? "active" : "") + '">' + esc(label) + ' <span>' + esc(count || 0) + '</span></button>';
}

function actionCard(assembly, selected, drafts, allInputs) {
  const requestedIds = assembly.nextAction.requestedInputIds || [];
  const inputsById = new Map(allInputs.map((input) => [input.requestedInputId, input]));
  const readyLocally = requestedIds.length > 0 && requestedIds.every((id) => hasValidDraft(inputsById.get(id), drafts[id]));
  return '<button type="button" data-action-id="' + esc(assembly.assemblyGroupId) + '" class="action-card ' + (selected ? "selected " : "") + stateClass(assembly) + '"><div class="action-card-top"><span class="state-dot"></span><span class="action-state-label">' + esc(readyLocally ? "Ready locally" : actionStateLabel(assembly)) + '</span><strong>' + esc(resultText(assembly.performance.result)) + '</strong></div><span class="action-card-title">' + esc(assembly.label) + '</span><small>' + esc(assembly.locationLabel) + '</small><span class="action-card-meta">Target: ' + esc(targetText(assembly.performance.target)) + ' | ' + esc(confidenceText(assembly)) + '</span><span class="action-card-problem">' + esc(assembly.problem) + '</span><span class="action-card-next">' + esc(assembly.nextAction.label) + '</span></button>';
}

function actionDetail(assembly, job, allInputs, drafts, hasUnresolvedReview, reviewMode) {
  const requestedIds = new Set(assembly.nextAction.requestedInputIds || []);
  const actionInputs = allInputs.filter((input) => requestedIds.has(input.requestedInputId));
  return '<section class="action-detail"><header class="action-detail-head"><div><span class="eyebrow">Selected assembly</span><h2>' + esc(assembly.label) + '</h2><p>' + esc(assembly.locationLabel) + '</p></div><span class="state-pill ' + stateClass(assembly) + '">' + esc(actionStateLabel(assembly)) + '</span></header>' +
    '<div class="result-grid">' + resultMetric(resultText(assembly.performance.result), "Calculated U-value") + resultMetric(targetText(assembly.performance.target), "Working target") + resultMetric(confidenceText(assembly), "Evidence") + resultMetric(String(assembly.sourceElementCount), "IFC elements") + '</div>' +
    '<div class="diagnosis"><span>Problem</span><strong>' + esc(assembly.problem) + '</strong><span>Next action</span><strong>' + esc(assembly.nextAction.label) + '</strong></div>' +
    layerComposition(assembly.layers || []) +
    optionalMaterialOverride(job, assembly) +
    (actionInputs.length ? '<section class="decision-inputs"><div class="section-heading"><div><span class="eyebrow">Required evidence</span><h3>Complete this assembly decision</h3></div><span class="draft-state" id="activeDraftState">Needs input</span></div>' + actionInputs.map((input, index) => renderQuestion(job, input, drafts, index)).join("") + '</section>' : '') +
    reviewSubmit(job, allInputs, hasUnresolvedReview, reviewMode) + '</section>';
}

function optionalMaterialOverride(job, assembly) {
  const overrides = assembly.optionalOverrides || [];
  const entries = (job.materialLibrary && job.materialLibrary.entries) || [];
  if (!overrides.length) return "";
  return '<section class="optional-override"><div class="section-heading"><div><span class="eyebrow">Material Library assistance</span><h3>Choose another material (optional)</h3></div><span>Does not change IFC evidence</span></div>' +
    overrides.map((override) => '<div class="optional-override-row"><p>Original IFC name: <strong>' + esc(override.rawMaterialName) + '</strong><br>Current match: ' + esc(override.matchedMaterialName) + (override.matchBasis ? ' (' + esc(override.matchBasis) + ')' : '') + '</p><label>Library material<select id="optionalLibrary_' + esc(override.requestedInputId) + '"><option value="">Choose a library material</option>' + entries.map((entry) => '<option value="' + esc(entry.materialKey) + '">' + esc(entry.displayName + ' - ' + number(entry.lambdaWPerMK, 3) + ' W/mK') + '</option>').join("") + '</select></label><label>Manual lambda<input id="optionalValue_' + esc(override.requestedInputId) + '" type="number" min="0.000001" step="any" placeholder="Optional product value"></label><button type="button" class="secondary" data-apply-optional data-optional-input-id="' + esc(override.requestedInputId) + '">Apply material override</button></div>').join("") +
    '</section>';
}


function resultMetric(value, label) {
  return '<div class="result-metric"><strong>' + esc(value) + '</strong><span>' + esc(label) + '</span></div>';
}

function layerComposition(layers) {
  if (!layers.length) return '<section class="composition-empty"><span class="eyebrow">Assembly composition</span><p>Layer calculations will appear after the required evidence is complete.</p></section>';
  const palette = ["#eab308", "#0f766e", "#2563eb", "#b45309", "#7c3aed", "#dc2626", "#4d7c0f"];
  const bar = layers.map((layer, index) => '<span class="composition-segment" style="width:' + Number(layer.thicknessSharePercent) + '%;background:' + palette[index % palette.length] + '" title="' + esc(layer.materialName + "  |  " + layer.thicknessSharePercent + "%") + '"></span>').join("");
  const rows = layers.map((layer, index) => '<tr><td><i style="background:' + palette[index % palette.length] + '"></i>' + esc(layer.materialName) + '</td><td>' + number(layer.thicknessSharePercent, 1) + '%</td><td>' + number(layer.thicknessMm, 1) + '</td><td>' + number(layer.lambdaWPerMK, 3) + '</td><td>' + number(layer.rValueM2KPerW, 3) + '</td><td>' + esc(sourceText(layer.datapointSources)) + '</td></tr>').join("");
  return '<section class="composition"><div class="section-heading"><div><span class="eyebrow">Assembly composition</span><h3>Layer proportion and calculated values</h3></div><span>' + esc(layers.length) + ' layers</span></div><div class="composition-bar" aria-label="Wall layer proportions">' + bar + '</div><div class="layer-table-wrap"><table class="layer-table"><thead><tr><th>Material</th><th>Share</th><th>mm</th><th>lambda W/mK</th><th>R m2K/W</th><th>Source</th></tr></thead><tbody>' + rows + '</tbody></table></div></section>';
}

function renderQuestion(job, input, drafts, index) {
  const context = reviewQuestionContext(job, input.requestedInputId);
  const evidence = context && context.evidenceSummary;
  const type = input.inputType === "number" ? "number" : "text";
  const value = drafts[input.requestedInputId] || "";
  const library = librarySuggestion(job, input, context);
  const evidenceHtml = evidence ? '<details class="evidence"><summary>Why this input?</summary><dl><dt>Element</dt><dd>' + esc(evidence.elementLabel) + '</dd><dt>Layer</dt><dd>' + esc(evidence.layerLabel || "Not layer-specific") + '</dd><dt>Material</dt><dd>' + esc(evidence.materialLabel || "Unknown") + '</dd></dl></details>' : '';
  const candidateKeys = input.materialResolution && input.materialResolution.candidateMaterialKeys;
  const libraryOptions = input.datapoint === "layer_lambda" ? ((job.materialLibrary && job.materialLibrary.entries) || []).filter((entry) => candidateKeys === undefined || candidateKeys.includes(entry.materialKey)).map((entry) => '<option value="' + esc(entry.materialKey) + '">' + esc(entry.displayName + " - " + number(entry.lambdaWPerMK, 3) + " W/mK") + '</option>').join("") : "";
  const suggestionHtml = input.datapoint === "layer_lambda" ? '<div class="library-suggestion">' + (library ? '<span>Suggested: <strong>' + number(library.lambdaWPerMK, 3) + ' W/mK</strong> | ' + esc(library.displayName) + '</span><small>' + esc(library.sourceLabel) + '</small><button type="button" class="secondary" data-use-library data-library-input-id="' + esc(input.requestedInputId) + '" data-library-value="' + esc(library.lambdaWPerMK) + '" data-library-key="' + esc(library.materialKey) + '">Use suggested value</button>' : '<span>No exact library match.</span><small>Choose a reference material or enter a manual value.</small>') + '<label class="library-picker">Material database<select data-library-picker data-library-input-id="' + esc(input.requestedInputId) + '"><option value="">Choose another material</option>' + libraryOptions + '</select></label></div>' : "";
  return '<div class="question"><label for="reviewInput' + index + '">' + esc(input.question) + '</label><p class="question-meta">' + esc((context && context.missingValueLabel) || input.datapoint) + (input.unit ? '  |  ' + esc(input.unit) : '') + '</p>' + suggestionHtml + evidenceHtml + '<input id="reviewInput' + index + '" data-requested-input-id="' + esc(input.requestedInputId) + '" type="' + type + '" ' + (type === "number" ? 'step="any" min="0.000001" ' : '') + 'value="' + esc(value) + '" required placeholder="Enter a manual value"><p class="scope-help">Applies to: ' + esc(scopeLabel(input.scope.scopeKind)) + '</p></div>';
}

function librarySuggestion(job, input, context) {
  if (input.datapoint !== "layer_lambda") return null;
  const materialName = input.scope && input.scope.scopeKind === "material_decision" ? input.scope.materialName : context && context.evidenceSummary && context.evidenceSummary.materialLabel;
  const key = normalizeMaterialName(materialName);
  return ((job.materialLibrary && job.materialLibrary.entries) || []).find((entry) => [entry.displayName].concat(entry.aliases || []).some((alias) => normalizeMaterialName(alias) === key)) || null;
}

function normalizeMaterialName(value) {
  return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function reviewSubmit(job, allInputs, hasUnresolvedReview, reviewMode) {
  if (!hasUnresolvedReview || allInputs.length === 0) return "";
  return '<section class="calculation-submit"><div><strong id="draftProgress">0 of ' + allInputs.length + ' decisions ready</strong><span>Review mode: ' + esc(reviewModeLabel(reviewMode)) + '. Library values remain traceable and any value can be changed manually.</span><span id="reviewMsg"></span></div><div class="submit-actions"><button type="button" id="runCalculation" disabled>Run thermal calculation -></button></div></section>';
}
function updateDraftProgress(aside, allInputs, drafts, activeAssembly) {
  const completed = allInputs.filter((input) => hasValidDraft(input, drafts[input.requestedInputId])).length;
  const progress = aside.querySelector("#draftProgress");
  if (progress) progress.textContent = completed + " of " + allInputs.length + " decisions ready";
  const runButton = aside.querySelector("#runCalculation");
  if (runButton) runButton.disabled = completed !== allInputs.length;
  const activeState = aside.querySelector("#activeDraftState");
  if (activeState && activeAssembly) {
    const ids = activeAssembly.nextAction.requestedInputIds || [];
    const inputsById = new Map(allInputs.map((input) => [input.requestedInputId, input]));
    const complete = ids.length > 0 && ids.every((id) => hasValidDraft(inputsById.get(id), drafts[id]));
    activeState.textContent = complete ? "Ready locally" : "Needs input";
    activeState.className = "draft-state " + (complete ? "ready" : "");
  }
}

function viewerShell(job) {
  if (!job.links || !job.links.viewerGeometry) return '<section class="viewer-unavailable panel">3D geometry is not available for this analysis.</section>';
  return '<section id="ifcViewer" class="viewer"><div class="viewer-head"><div><span class="eyebrow">IFC coordination view</span><h2>Model-linked thermal review</h2></div><span id="ifcViewerStatus" class="viewer-status">Ready to load model</span></div><div class="viewer-tools" role="toolbar" aria-label="Viewer controls"><button type="button" class="tool active" data-view="all">Show all</button><button type="button" class="tool" data-view="actions">Show actions</button><button type="button" class="tool" data-view="isolated">Isolate selected</button><button type="button" class="tool" data-view="fit">Fit building</button><label class="context-toggle"><input id="contextToggle" type="checkbox" checked> Context</label></div><div id="ifcViewerStage" class="viewer-stage"></div><div class="viewer-legend"><span><i class="legend-swatch neutral"></i>Model context</span><span><i class="legend-swatch action"></i>Needs action</span><span><i class="legend-swatch blocked"></i>Blocked</span><span><i class="legend-swatch selected"></i>Selected assembly</span></div></section>';
}

async function initViewer(geometryUrl, actionStepIds, assemblies, onSelect) {
  const container = document.getElementById("ifcViewerStage");
  const status = document.getElementById("ifcViewerStatus");
  if (!container || !status || !geometryUrl || !window.createIfcReviewViewer) return null;
  if (window.activeIfcReviewViewer && window.activeIfcReviewViewer.dispose) window.activeIfcReviewViewer.dispose();
  try {
    const viewer = await window.createIfcReviewViewer({
      container,
      status,
      geometryUrl,
      highlightStepIds: actionStepIds,
      elementInfo: buildElementInfo(assemblies),
      onSelect,
    });
    window.activeIfcReviewViewer = viewer;
    wireViewerTools(viewer);
    return viewer;
  } catch (error) {
    status.textContent = "3D viewer unavailable.";
    container.innerHTML = '<div class="viewer-unavailable">' + esc(error && error.message ? error.message : error) + '</div>';
    return null;
  }
}

function wireViewerTools(viewer) {
  const contextToggle = document.getElementById("contextToggle");
  if (contextToggle) contextToggle.onchange = (event) => viewer.setContextVisible(event.currentTarget.checked);
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.onclick = () => {
      const mode = button.dataset.view;
      if (mode === "fit") viewer.fit();
      if (mode === "all") viewer.showAll();
      if (mode === "actions") viewer.showActions();
      if (mode === "isolated") viewer.isolateSelected();
      document.querySelectorAll("[data-view]").forEach((item) => item.classList.toggle("active", item === button && mode !== "fit"));
    };
  });
}

function buildElementInfo(assemblies) {
  const info = {};
  assemblies.forEach((assembly) => (assembly.displayStepIds || []).forEach((id) => {
    if (info[id]) return;
    info[id] = {
      groupId: assembly.assemblyGroupId,
      label: assembly.label,
      detail: actionStateLabel(assembly) + "  |  " + assembly.nextAction.label,
      status: assembly.readinessState === "blocked" ? "blocked" : "action",
    };
  }));
  return info;
}

function reviewQuestionContext(job, requestedInputId) {
  const groups = job.review && job.review.context && job.review.context.groups || [];
  for (const group of groups) {
    const question = (group.questions || []).find((candidate) => candidate.requestedInputId === requestedInputId);
    if (question) return question;
  }
  return null;
}

function uniqueRequestedInputs(inputs) {
  const seen = new Set();
  return inputs.filter((input) => {
    if (seen.has(input.requestedInputId)) return false;
    seen.add(input.requestedInputId);
    return true;
  });
}

function emptyActionModel(job) {
  return { jobId: job.jobId, summary: { assemblyCount: 0, needsActionCount: 0, needsReviewCount: 0, blockedCount: 0, failingTargetCount: 0, passingTargetCount: 0, unassessedCount: 0 }, assemblies: [] };
}

function reviewModeLabel(mode) {
  if (mode === "library") return "Material Library values";
  if (mode === "manual") return "Manual values";
  if (mode === "mixed") return "Mixed library and manual values";
  return "Not selected";
}

function currentReviewMode() {
  return validReviewMode(new URLSearchParams(location.search).get("reviewMode"));
}
function currentTargetU() {
  const requested = new URLSearchParams(location.search).get("targetU");
  return validTarget(requested) ? requested : "0.24";
}

function validTarget(value) {
  const numberValue = Number(value);
  return value !== null && Number.isFinite(numberValue) && numberValue > 0 && numberValue <= 10;
}

function needsAction(assembly) {
  return assembly.nextAction && assembly.nextAction.kind !== "none";
}

function actionStateLabel(assembly) {
  if (assembly.readinessState === "blocked") return "Blocked";
  if (assembly.readinessState === "needs_review") return "Needs input";
  if (assembly.performance.verdict === "misses_target") return "Over target";
  if (assembly.performance.verdict === "indeterminate") return "Verify estimate";
  if (assembly.performance.verdict === "meets_target") return "Meets target";
  if (assembly.performance.result.kind === "unavailable") return "Awaiting result";
  return "Not assessed";
}

function stateClass(assembly) {
  if (assembly.readinessState === "blocked") return "state-blocked";
  if (assembly.readinessState === "needs_review") return "state-review";
  if (assembly.performance.verdict === "misses_target") return "state-over";
  if (assembly.performance.verdict === "indeterminate" || assembly.readinessState === "estimated") return "state-verify";
  if (assembly.performance.verdict === "meets_target") return "state-meets";
  return "state-neutral";
}

function resultText(result) {
  if (!result || result.kind === "unavailable") return "-";
  if (result.kind === "range") return number(result.min, 3) + "-" + number(result.max, 3) + " W/m2K";
  return number(result.uValueWPerM2K, 3) + " W/m2K";
}

function targetText(target) {
  return target ? "<= " + number(target.maxUValueWPerM2K, 3) + " W/m2K" : "Not set";
}

function confidenceText(assembly) {
  const status = assembly.evidenceState && assembly.evidenceState.status || "incomplete";
  const labels = { incomplete: "Incomplete", ifc_extracted: "IFC extracted", library_assisted: "Library assisted", user_completed: "User reviewed", estimated: "Estimated" };
  const confidence = assembly.calculationConfidence ? "  |  " + assembly.calculationConfidence + " confidence" : "";
  return (labels[status] || status) + confidence;
}

function sourceText(sources) {
  const labels = { ifc_extracted: "IFC", material_library: "Library", system_estimate: "Estimate", user_input: "Review" };
  return (sources || []).map((source) => labels[source] || source).join(" + ") || "-";
}

function scopeLabel(scopeKind) {
  if (scopeKind === "material_decision") return "all matching layers using this material";
  if (scopeKind === "assembly_group") return "this assembly group";
  if (scopeKind === "element_type") return "all elements using this IFC type";
  return "this layer occurrence";
}

function jobStateNote(job) {
  const unresolved = job.architectActions && (job.architectActions.summary.needsReviewCount + job.architectActions.summary.blockedCount) || 0;
  if (unresolved > 0) return unresolved + " unresolved review decisions or IFC evidence gaps remain. Recalculate before relying on the report.";
  if (job.jobStatus === "needs_review") return "Missing inputs need resolution before the report is ready.";
  if (job.jobStatus === "completed") return "Review complete. Report ready.";
  if (job.jobStatus === "failed") return "Analysis failed before report generation. Failure: " + (job.errorMessage || "Unknown processing error");
  if (job.jobStatus === "processing" || job.jobStatus === "queued") return "IFC analysis in progress.";
  return "No next action is available for this analysis.";
}

function hasDraftValue(value) { return value !== undefined && String(value).trim() !== ""; }
function hasValidDraft(input, value) {
  if (!input || !hasDraftValue(value)) return false;
  return input.inputType !== "number" || (Number.isFinite(Number(value)) && Number(value) > 0);
}
function number(value, digits) { return Number(value).toFixed(digits); }
function statusClass(status) { return "status status-" + esc(status); }
function statusLabel(status) { return status === "needs_review" ? "Needs review" : String(status).replaceAll("_", " "); }
function uniqueNumbers(values) { return [...new Set(values.map(Number).filter(Number.isFinite))]; }
function attributeSelectorValue(value) { return String(value).replace(/["\\\\]/g, "\\\\$&"); }
function esc(value) { return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character])); }

if (path === "/") home().catch(showError);
else workspacePage(path.split("/")[2]).catch(showError);

function showError(error) { app.innerHTML = '<section class="panel"><h2>Unable to open analysis</h2><p class="error">' + esc(error.message) + '</p></section>'; }
`;
}
