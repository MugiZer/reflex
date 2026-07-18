export function renderAppShell(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Conformity &mdash; Thermal design review</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #17201d;
      --muted: #63706a;
      --quiet: #8a948e;
      --line: #d8dfda;
      --line-strong: #b8c4bd;
      --canvas: #eef2ee;
      --surface: #ffffff;
      --surface-soft: #f7f9f6;
      --nav: #1f2926;
      --accent: #0f766e;
      --accent-strong: #115e59;
      --lime: #dff246;
      --blue: #2563eb;
      --red: #c53a2d;
      --amber: #d98b0b;
      --green: #39744a;
      --violet: #7353ba;
      --shadow: 0 10px 28px rgba(23,32,29,.07);
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Bahnschrift, Aptos, "Segoe UI", sans-serif; color: var(--ink); background: var(--canvas); }
    header.site-header { padding: 12px 24px; display: flex; align-items: center; justify-content: space-between; gap: 16px; background: var(--nav); color: white; border-bottom: 3px solid var(--lime); }
    main { max-width: 1600px; margin: 0 auto; padding: 20px 24px 38px; }
    h1, h2, h3, p { margin-top: 0; }
    h1 { margin: 0; font-size: 21px; letter-spacing: -.01em; }
    h2 { margin-bottom: 8px; font-size: 20px; line-height: 1.2; }
    h3 { margin-bottom: 7px; font-size: 15px; }
    p { line-height: 1.45; }
    a { color: var(--accent); text-underline-offset: 3px; }
    input, button { font: inherit; }
    button, .button { border: 0; border-radius: 7px; background: var(--accent); color: white; padding: 9px 12px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 7px; font-weight: 750; text-decoration: none; }
    button:hover, .button:hover { background: var(--accent-strong); }
    button:disabled { cursor: not-allowed; opacity: .45; }
    button.secondary, .button.secondary { color: var(--accent-strong); background: white; border: 1px solid var(--line-strong); }
    button.secondary:hover, .button.secondary:hover { background: var(--surface-soft); }
    input[type=file], input[type=number], input[type=text] { width: 100%; border: 1px solid var(--line-strong); border-radius: 7px; padding: 10px; background: white; color: var(--ink); }
    input:focus, button:focus, a:focus { outline: 2px solid rgba(15,118,110,.3); outline-offset: 2px; }
    table { border-collapse: collapse; width: 100%; }
    .brand { display: flex; align-items: center; gap: 10px; }
    .brand-mark { width: 27px; height: 27px; display: grid; place-items: center; border: 2px solid var(--lime); border-radius: 50%; color: var(--lime); font-size: 13px; font-weight: 900; }
    .brand-copy { display: grid; gap: 1px; }
    .descriptor, .prototype-note { color: #c5cfca; font-size: 12px; }
    .eyebrow { color: var(--quiet); font-size: 11px; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
    .muted { display: block; color: var(--muted); font-size: 13px; }
    .panel, .job { background: var(--surface); border: 1px solid var(--line); border-radius: 13px; box-shadow: var(--shadow); }
    .panel { padding: 19px; }
    .panel-head { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .grid { display: grid; grid-template-columns: 350px 1fr; gap: 20px; align-items: start; }
    .drop { padding: 16px; border: 1px dashed var(--line-strong); border-radius: 9px; background: var(--surface-soft); }
    .drop input { margin-bottom: 12px; }
    .jobs { display: grid; gap: 8px; }
    .job { padding: 14px 16px; display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 14px; }
    .job strong { display: block; margin-bottom: 4px; }
    .job-actions { display: flex; align-items: center; gap: 9px; }
    .status { display: inline-flex; width: max-content; padding: 4px 8px; border: 1px solid var(--line); border-radius: 999px; background: white; color: var(--muted); font-size: 10px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; }
    .status-processing, .status-queued { color: var(--accent); border-color: #b9d2cc; background: #edf7f4; }
    .status-needs_review { color: #8b5a05; border-color: #e6c778; background: #fff6db; }
    .status-completed { color: var(--green); border-color: #b9d3c0; background: #edf7ef; }
    .status-failed { color: var(--red); border-color: #e1b0aa; background: #fff0ee; }
    .project-header { display: grid; grid-template-columns: minmax(260px,1fr) auto; gap: 20px; align-items: center; padding: 15px 17px; margin-bottom: 12px; background: var(--surface); border: 1px solid var(--line); border-radius: 13px; box-shadow: var(--shadow); }
    .project-title h2 { margin: 3px 0 8px; font-size: 22px; }
    .project-meta { display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: 12px; }
    .project-actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 9px; }
    .target-form { width: 335px; padding-right: 10px; border-right: 1px solid var(--line); }
    .target-form > label { display: block; margin-bottom: 4px; color: var(--muted); font-size: 11px; font-weight: 750; text-transform: uppercase; }
    .target-form > div { display: grid; grid-template-columns: 86px auto auto; align-items: center; gap: 7px; }
    .target-form input { padding: 7px 8px; font-weight: 800; }
    .target-form span { color: var(--muted); font-size: 12px; }
    .target-form button { padding: 7px 9px; font-size: 12px; }
    .target-form small { display: block; margin-top: 4px; color: var(--quiet); font-size: 10px; }
    .architect-summary { display: grid; grid-template-columns: repeat(6,1fr); gap: 8px; margin-bottom: 12px; }
    .summary-metric { position: relative; overflow: hidden; min-height: 72px; padding: 12px 14px 11px 18px; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; }
    .summary-metric::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 4px; background: var(--line-strong); }
    .summary-metric strong, .summary-metric span { display: block; }
    .summary-metric strong { margin-bottom: 2px; font-size: 25px; line-height: 1; }
    .summary-metric span { color: var(--muted); font-size: 11px; font-weight: 750; text-transform: uppercase; }
    .summary-metric.critical::before { background: var(--amber); }
    .summary-metric.danger::before { background: var(--red); }
    .summary-metric.warning::before { background: #e6ae2c; }
    .summary-metric.success::before { background: var(--green); }
    .architect-workspace { display: grid; grid-template-columns: minmax(0,1.65fr) minmax(420px,.85fr); gap: 12px; align-items: start; }
    .model-column { min-width: 0; position: sticky; top: 10px; }
    .viewer { overflow: hidden; background: white; border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); }
    .viewer-toggle { width: 100%; margin-bottom: 8px; color: var(--accent); background: white; border: 1px solid var(--line); }
    .viewer-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 14px; border-bottom: 1px solid var(--line); background: #fbfcfa; }
    .viewer-head h2 { margin: 3px 0 0; font-size: 18px; }
    .viewer-status { max-width: 48%; color: var(--muted); font-size: 11px; text-align: right; }
    .viewer-tools { display: flex; align-items: center; gap: 6px; padding: 7px 10px; border-bottom: 1px solid var(--line); background: var(--surface-soft); }
    .viewer-tools .tool { padding: 6px 8px; color: var(--muted); background: white; border: 1px solid var(--line); font-size: 11px; }
    .viewer-tools .tool.active { color: white; background: var(--accent); border-color: var(--accent); }
    .context-toggle { display: inline-flex; align-items: center; gap: 5px; margin-left: auto; color: var(--muted); font-size: 11px; }
    .viewer-stage { min-height: 625px; height: calc(100vh - 275px); max-height: 850px; position: relative; background: linear-gradient(145deg,#e9eeea,#d5dfd9); }
    .viewer-unavailable { min-height: 300px; display: grid; place-items: center; padding: 28px; color: var(--muted); text-align: center; }
    .viewer-legend { display: flex; align-items: center; gap: 14px; padding: 8px 11px; border-top: 1px solid var(--line); color: var(--muted); font-size: 10px; }
    .viewer-legend span { display: inline-flex; align-items: center; gap: 5px; }
    .legend-swatch { width: 10px; height: 10px; display: inline-block; border-radius: 3px; }
    .legend-swatch.neutral { background: #9aa7a3; opacity: .55; }
    .legend-swatch.action { background: #f59e0b; }
    .legend-swatch.blocked { background: #dc2626; }
    .legend-swatch.selected { background: var(--blue); }
    .viewer-tooltip { position: absolute; z-index: 5; width: 255px; padding: 10px 11px; border-radius: 8px; background: rgba(23,32,29,.95); color: white; pointer-events: none; box-shadow: 0 8px 24px rgba(0,0,0,.2); }
    .viewer-tooltip strong, .viewer-tooltip span, .viewer-tooltip small { display: block; }
    .viewer-tooltip span { margin-top: 3px; color: #d9e2de; font-size: 11px; }
    .viewer-tooltip small { margin-top: 7px; color: var(--lime); }
    .action-aside { max-height: calc(100vh - 20px); overflow: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); }
    .action-aside-head { position: sticky; top: 0; z-index: 3; display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; padding: 14px 15px 10px; background: white; border-bottom: 1px solid var(--line); }
    .action-aside-head h2 { margin: 3px 0 0; font-size: 18px; }
    .action-count { min-width: 30px; height: 30px; display: grid; place-items: center; border-radius: 50%; background: var(--nav); color: white; font-size: 12px; font-weight: 800; }
    .action-filters { position: sticky; top: 65px; z-index: 3; display: flex; gap: 5px; padding: 8px 10px; background: var(--surface-soft); border-bottom: 1px solid var(--line); }
    .filter-chip { flex: 1; padding: 6px 5px; color: var(--muted); background: white; border: 1px solid var(--line); font-size: 10px; }
    .filter-chip span { opacity: .72; }
    .filter-chip.active { color: white; background: var(--nav); border-color: var(--nav); }
    .action-list { max-height: 245px; overflow: auto; display: grid; gap: 5px; padding: 9px 10px; border-bottom: 1px solid var(--line); background: #f5f7f4; }
    .action-card { position: relative; width: 100%; display: block; padding: 10px 11px 10px 14px; color: var(--ink); background: white; border: 1px solid var(--line); border-radius: 8px; text-align: left; font-weight: 400; }
    .action-card:hover { background: white; border-color: var(--line-strong); }
    .action-card.selected { border-color: var(--blue); box-shadow: inset 3px 0 var(--blue); }
    .action-card-top { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 6px; margin-bottom: 4px; }
    .state-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--quiet); }
    .action-state-label { color: var(--muted); font-size: 10px; font-weight: 800; text-transform: uppercase; }
    .action-card-top strong { font-size: 11px; }
    .action-card-title, .action-card small, .action-card-meta, .action-card-problem, .action-card-next { display: block; }
    .action-card-title { margin-bottom: 2px; font-size: 13px; font-weight: 800; }
    .action-card small, .action-card-meta { color: var(--muted); }
    .action-card-meta, .action-card-problem { margin-top: 4px; font-size: 10px; }
    .action-card-problem { color: var(--ink); line-height: 1.3; }
    .action-card-next { margin-top: 6px; color: var(--muted); font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .state-blocked .state-dot { background: var(--red); }
    .state-review .state-dot, .state-over .state-dot { background: var(--amber); }
    .state-verify .state-dot { background: var(--violet); }
    .state-meets .state-dot { background: var(--green); }
    .action-detail { padding: 14px 15px 18px; }
    .action-detail-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
    .action-detail-head h2 { margin: 3px 0 3px; font-size: 20px; }
    .action-detail-head p { margin: 0; color: var(--muted); font-size: 11px; }
    .state-pill { flex: 0 0 auto; padding: 5px 8px; border-radius: 999px; background: #eef1ef; color: var(--muted); font-size: 10px; font-weight: 800; text-transform: uppercase; }
    .state-pill.state-blocked { color: var(--red); background: #fff0ee; }
    .state-pill.state-review, .state-pill.state-over { color: #8b5a05; background: #fff4d6; }
    .state-pill.state-verify { color: var(--violet); background: #f2edff; }
    .state-pill.state-meets { color: var(--green); background: #edf7ef; }
    .result-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 6px; margin: 13px 0 10px; }
    .result-metric { min-height: 61px; padding: 9px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-soft); }
    .result-metric strong, .result-metric span { display: block; }
    .result-metric strong { margin-bottom: 3px; font-size: 14px; }
    .result-metric span { color: var(--muted); font-size: 9px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
    .diagnosis { display: grid; grid-template-columns: 72px 1fr; gap: 5px 9px; padding: 10px; border-left: 4px solid var(--lime); background: #f6f8e7; font-size: 11px; }
    .diagnosis span { color: var(--muted); font-weight: 800; text-transform: uppercase; }
    .diagnosis strong { line-height: 1.35; }
    .section-heading { display: flex; justify-content: space-between; gap: 10px; align-items: flex-end; }
    .section-heading h3 { margin: 2px 0 0; }
    .section-heading > span { color: var(--muted); font-size: 10px; }
    .composition, .composition-empty, .decision-inputs { margin-top: 14px; padding-top: 13px; border-top: 1px solid var(--line); }
    .composition-empty p { margin: 5px 0 0; color: var(--muted); font-size: 11px; }
    .composition-bar { height: 25px; display: flex; overflow: hidden; margin: 9px 0; border: 1px solid #b8bba6; border-radius: 5px; background: #f4f4ed; }
    .composition-segment { min-width: 3px; border-right: 1px solid rgba(255,255,255,.7); }
    .layer-table-wrap { overflow-x: auto; }
    .layer-table { min-width: 570px; font-size: 10px; }
    .layer-table th { padding: 6px; color: var(--muted); background: var(--surface-soft); border-bottom: 1px solid var(--line); text-align: right; text-transform: uppercase; }
    .layer-table th:first-child, .layer-table td:first-child { text-align: left; }
    .layer-table td { padding: 6px; border-bottom: 1px solid #edf0ed; text-align: right; }
    .layer-table td i { width: 8px; height: 8px; display: inline-block; margin-right: 5px; border-radius: 2px; }
    .draft-state { padding: 4px 7px; border-radius: 999px; color: #8b5a05; background: #fff4d6; font-size: 9px; font-weight: 800; text-transform: uppercase; }
    .draft-state.ready { color: var(--green); background: #edf7ef; }
    .question { padding: 11px 0; border-top: 1px solid #edf0ed; }
    .question:first-of-type { margin-top: 8px; }
    .question label { display: block; font-size: 12px; font-weight: 800; }
    .question-meta, .scope-help { margin: 3px 0 7px; color: var(--muted); font-size: 10px; }
    .scope-help { margin: 5px 0 0; }
    .library-suggestion { display: grid; grid-template-columns: 1fr auto; gap: 4px 8px; align-items: center; margin: 8px 0; padding: 9px; border: 1px solid #c7d8ce; border-radius: 7px; background: #f3f8f4; font-size: 10px; }
    .library-suggestion small { color: var(--muted); }
    .library-suggestion button { grid-row: span 2; }
    .evidence { margin: 8px 0; padding: 8px 9px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface-soft); color: var(--muted); font-size: 10px; }
    .evidence summary { cursor: pointer; font-weight: 750; }
    .evidence dl { display: grid; grid-template-columns: 70px 1fr; gap: 4px 7px; margin: 8px 0 0; }
    .evidence dt { font-weight: 750; }
    .evidence dd { margin: 0; overflow-wrap: anywhere; }
    .calculation-submit { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center; margin-top: 14px; padding: 11px; border-radius: 8px; background: var(--nav); color: white; }
    .calculation-submit strong, .calculation-submit span { display: block; }
    .calculation-submit strong { margin-bottom: 2px; font-size: 11px; }
    .calculation-submit span { color: #c7d0cc; font-size: 9px; }
    .calculation-submit button { background: var(--lime); color: var(--nav); white-space: nowrap; }
    .submit-actions { display: flex; gap: 7px; align-items: center; }
    .calculation-submit .secondary { color: white; background: transparent; border-color: #718079; }
    .empty-state { margin: 0; padding: 18px; color: var(--muted); text-align: center; }
    .processing-panel { min-height: 180px; display: flex; align-items: center; justify-content: center; gap: 15px; }
    .loading-dot { width: 14px; height: 14px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 0 rgba(15,118,110,.35); animation: pulse 1.3s infinite; }
    .error { color: var(--red); }
    @keyframes pulse { 70% { box-shadow: 0 0 0 12px rgba(15,118,110,0); } 100% { box-shadow: 0 0 0 0 rgba(15,118,110,0); } }
    @media (max-width: 1120px) {
      .project-header { grid-template-columns: 1fr; }
      .project-actions { justify-content: flex-start; }
      .architect-workspace { grid-template-columns: 1fr; }
      .model-column { position: static; }
      .viewer-stage { height: 560px; min-height: 500px; }
      .action-aside { max-height: none; }
    }
    @media (max-width: 720px) {
      header.site-header { padding: 11px 15px; }
      main { padding: 12px; }
      .prototype-note { display: none; }
      .grid, .job { grid-template-columns: 1fr; }
      .job-actions { justify-content: flex-start; }
      .project-actions { display: grid; grid-template-columns: 1fr; }
      .target-form { width: 100%; padding: 0 0 10px; border: 0; border-bottom: 1px solid var(--line); }
      .architect-summary { grid-template-columns: repeat(2,1fr); }
      .architect-summary .summary-metric:last-child { grid-column: span 2; }
      .viewer-stage { height: 430px; min-height: 390px; }
      .viewer-tools { overflow-x: auto; }
      .viewer-tools .tool { flex: 0 0 auto; }
      .viewer-legend { flex-wrap: wrap; }
      .result-grid { grid-template-columns: 1fr; }
      .calculation-submit { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header class="site-header">
    <div class="brand">
      <div class="brand-mark">C</div>
      <div class="brand-copy"><h1>Conformity</h1><span class="descriptor">Architect thermal action workspace</span></div>
    </div>
    <span class="prototype-note">IFC evidence &rarr; thermal decisions &rarr; report</span>
  </header>
  <main id="app"></main>
  <script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js"}}</script>
  <script src="/assets/ifc-review-viewer.js"></script>
  <script src="/assets/app-shell.js"></script>
</body>
</html>`;
}