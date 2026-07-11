export function renderAppShell(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Conformity</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #18201d;
      --muted: #63706a;
      --quiet: #8a948e;
      --line: #d9dfda;
      --line-strong: #b9c4bd;
      --panel: #f4f6f1;
      --surface: #ffffff;
      --accent: #176c64;
      --accent-strong: #0f4f49;
      --danger: #9a2d20;
      --warning: #8a5a10;
      --ready: #315f32;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Bahnschrift, Aptos, "Segoe UI", sans-serif; color: var(--ink); background: #f8f9f4; }
    header { border-bottom: 1px solid var(--line); padding: 14px 24px; display: flex; justify-content: space-between; gap: 16px; align-items: center; background: rgba(255,255,255,0.86); }
    main { max-width: 1180px; margin: 0 auto; padding: 24px; }
    h1 { font-size: 22px; margin: 0; letter-spacing: 0; font-weight: 700; }
    h2 { font-size: 17px; margin: 0 0 12px; font-weight: 700; }
    h3 { font-size: 14px; margin: 0 0 8px; font-weight: 700; }
    p { line-height: 1.45; }
    a { color: var(--accent); text-decoration-thickness: 1px; text-underline-offset: 3px; }
    input, select, button { font: inherit; }
    input[type=file], input[type=number], input[type=text], select { width: 100%; margin-top: 8px; }
    input[type=file] { border: 1px dashed var(--line-strong); border-radius: 6px; padding: 12px; background: var(--surface); color: var(--muted); }
    input[type=number], input[type=text], select { border: 1px solid var(--line-strong); border-radius: 6px; padding: 10px; background: white; color: var(--ink); }
    input:focus, select:focus, button:focus, a:focus { outline: 2px solid rgba(23,108,100,0.32); outline-offset: 2px; }
    button, .button { border: 0; border-radius: 6px; background: var(--accent); color: white; padding: 10px 13px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none; font-weight: 700; }
    button:hover, .button:hover { background: var(--accent-strong); }
    button.secondary, .button.secondary { background: white; color: var(--accent); border: 1px solid var(--line-strong); }
    button.secondary:hover, .button.secondary:hover { background: var(--panel); }
    .brand { display: grid; gap: 2px; }
    .brand-mark { display: flex; align-items: baseline; gap: 10px; }
    .brand-mark::before { content: ""; width: 10px; height: 10px; border: 2px solid var(--accent); border-radius: 2px; transform: rotate(45deg); }
    .descriptor { color: var(--muted); font-size: 13px; }
    .prototype-note { color: var(--quiet); font-size: 13px; }
    .grid { display: grid; grid-template-columns: 340px 1fr; gap: 20px; align-items: start; }
    .panel, .job, .review { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 16px; box-shadow: 0 1px 0 rgba(24,32,29,0.03); }
    .panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .eyebrow { color: var(--quiet); font-size: 12px; text-transform: uppercase; }
    .drop { border: 1px solid var(--line); background: var(--panel); padding: 16px; border-radius: 8px; }
    .muted { color: var(--muted); }
    .status { display: inline-block; border: 1px solid var(--line); border-radius: 999px; padding: 3px 9px; font-size: 12px; text-transform: uppercase; background: white; color: var(--muted); }
    .status-processing, .status-queued { border-color: #bfd0ca; color: var(--accent); background: #eef6f3; }
    .status-needs_review { border-color: #e4c98e; color: var(--warning); background: #fff8e8; }
    .status-completed { border-color: #bed1bd; color: var(--ready); background: #eef7ed; }
    .status-failed { border-color: #e3b6ae; color: var(--danger); background: #fff0ed; }
    .jobs, .rail { display: grid; gap: 8px; }
    .job { display: grid; grid-template-columns: 1fr auto; gap: 14px; align-items: center; }
    .job strong { display: block; margin-bottom: 4px; }
    .job-actions, .action-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .review-list { display: grid; grid-template-columns: 280px 1fr; gap: 18px; }
    .rail button { background: white; color: var(--ink); border: 1px solid var(--line); text-align: left; display: block; width: 100%; font-weight: 700; }
    .rail button.active { border-color: var(--accent); color: var(--accent); box-shadow: inset 3px 0 0 var(--accent); }
    .question { border-top: 1px solid var(--line); padding: 16px 0; }
    .question:first-child { border-top: 0; padding-top: 0; }
    .viewer { border: 1px solid var(--line); background: white; border-radius: 8px; margin-bottom: 18px; overflow: hidden; }
    .viewer-head { display: flex; justify-content: space-between; gap: 12px; padding: 11px 14px; border-bottom: 1px solid var(--line); align-items: center; background: #fbfcf8; }
    .viewer-stage { min-height: 430px; background: #e9eee9; position: relative; }
    .viewer-status { color: var(--muted); font-size: 13px; }
    .viewer-unavailable { display: grid; place-items: center; min-height: 420px; color: var(--muted); padding: 24px; text-align: center; }
    .evidence { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 12px; margin: 12px 0; }
    .evidence dl { display: grid; grid-template-columns: 140px 1fr; gap: 6px 12px; margin: 0; }
    .evidence dt { color: var(--muted); }
    .evidence dd { margin: 0; }
    .error { color: #8a1f11; }
    @media (max-width: 760px) {
      header, .panel-head { display: block; }
      main { padding: 16px; }
      .grid, .review-list, .evidence dl, .job { grid-template-columns: 1fr; }
      .job-actions { justify-content: flex-start; }
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <div class="brand-mark"><h1>Conformity</h1></div>
      <span class="descriptor">Local thermal review workspace</span>
    </div>
    <span class="prototype-note">IFC evidence review</span>
  </header>
  <main id="app"></main>
  <script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js"}}</script>
  <script src="/assets/ifc-review-viewer.js"></script>
  <script src="/assets/app-shell.js"></script>
</body>
</html>`;
}
