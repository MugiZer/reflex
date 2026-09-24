const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = process.env.MERMAID_PACKAGE_ROOT;
if (!root || !process.env.CHROME_PATH) throw new Error('Set MERMAID_PACKAGE_ROOT and CHROME_PATH.');
const puppeteer = require(path.join(root, 'puppeteer'));
const out = __dirname;
const frames = [
  ['01-matched-comparison', 'Match the right healthy execution', 'Compare compatible execution contexts.', 'MATCHED COMPARISON'],
  ['02-execution-path', 'Reconstruct where the work went', 'Correlation IDs and dependencies connect the execution path.', 'EXECUTION PATH'],
  ['03-evidence-ranking', 'Combine evidence. Rank possible causes.', 'Timing, execution structure, and attribution contribute to the diagnosis.', 'CAUSE RANKING'],
  ['04-measurement-selection', 'Choose the next useful measurement', 'Prefer evidence that separates the remaining explanations.', 'ACTIVE MEASUREMENT'],
  ['05-controlled-verification', 'Test the explanation', 'Verify the predicted mechanism change and end-to-end recovery.', 'CONTROLLED VERIFICATION'],
  ['06-real-t4-result', 'SmolVLA on NVIDIA T4', 'Real device latency and matched per-kernel GPU anomaly.', 'REAL GPU RESULT'],
];
const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
    await page.setContent('<html><body style="margin:0"></body></html>');
    await page.addScriptTag({ path: path.join(root, 'mermaid/dist/mermaid.min.js') });
    await page.evaluate(() => mermaid.initialize({
      startOnLoad: false, theme: 'base', securityLevel: 'strict',
      flowchart: { htmlLabels: false, curve: 'linear', nodeSpacing: 45, rankSpacing: 38, padding: 23, wrappingWidth: 420 },
      themeVariables: {
        fontFamily: 'Arial', fontSize: '28px', background: '#11181c',
        primaryColor: '#253138', primaryTextColor: '#f4f6f7', primaryBorderColor: '#778b97',
        lineColor: '#a6b6bf', edgeLabelBackground: '#11181c',
        secondaryColor: '#253138', tertiaryColor: '#253138',
      },
    }));
    let codeDoc = '# Root demo — Mermaid source\n\nSee README.md for reveal order, explanations, and implementation notes.\n\n';
    for (let i = 0; i < frames.length; i++) {
      const [stem, title, subtitle, label] = frames[i];
      const code = fs.readFileSync(path.join(out, stem + '.mmd'), 'utf8');
      codeDoc += `## ${i + 1}. ${title}\n\n\`\`\`mermaid\n${code}\`\`\`\n\n`;
      const rendered = await page.evaluate(async ({ code, i }) => {
        const result = await mermaid.render('diagram' + i, code);
        const svg = new DOMParser().parseFromString(result.svg, 'text/html').querySelector('svg');
        const viewBox = svg.getAttribute('viewBox').split(/\s+/).map(Number);
        const clean = new XMLSerializer().serializeToString(svg);
        return { svg: clean, inner: clean.slice(clean.indexOf('>') + 1, clean.lastIndexOf('</svg>')), viewBox };
      }, { code, i });
      fs.writeFileSync(path.join(out, stem + '.diagram.svg'), rendered.svg);
      const [vx, vy, w, h] = rendered.viewBox;
      const scale = Math.min(1710 / w, 665 / h, 1.85);
      const x = (1920 - w * scale) / 2;
      const y = 295 + (665 - h * scale) / 2;
      const footer = i === 5 ? 'Device latency: ms     |     Anomaly: dimensionless z-scale score' :
        i === 3 ? 'Information gain is adjusted for reliability and repeated signals; cost includes shared setup.' :
        i === 4 ? 'Verification requires a measured improvement and the predicted mechanism effect.' : '';
      const frame = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1920" height="1080" viewBox="0 0 1920 1080">
<rect width="1920" height="1080" fill="#11181c"/>
<g font-family="Arial, sans-serif"><text x="96" y="88" fill="#80d5bd" font-size="22" letter-spacing="3">ROOT / ${label}</text>
<text x="96" y="171" fill="#f4f6f7" font-size="56" font-weight="600">${escape(title)}</text>
<text x="96" y="224" fill="#b0bfc7" font-size="27">${escape(subtitle)}</text>
<text x="96" y="1020" fill="#b0bfc7" font-size="22">${escape(footer)}</text></g>
<svg id="diagram${i}" x="${x}" y="${y}" width="${w * scale}" height="${h * scale}" viewBox="${vx} ${vy} ${w} ${h}">${rendered.inner}</svg></svg>`;
      const file = path.join(out, stem + '.svg');
      fs.writeFileSync(file, frame);
      const shot = await browser.newPage();
      await shot.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
      await shot.goto(pathToFileURL(file).href);
      await shot.screenshot({ path: path.join(out, stem + '.png') });
      await shot.close();
      console.log(`${stem}: rendered; diagram ${Math.round(w)} × ${Math.round(h)}, scale ${scale.toFixed(2)}`);
    }
    fs.writeFileSync(path.join(out, 'mermaid-source.md'), codeDoc);
    const contact = await browser.newPage();
    await contact.setViewport({ width: 1440, height: 1215, deviceScaleFactor: 1 });
    const cards = frames.map(([stem, title]) => `<div><img src="${stem}.svg" style="width:100%;display:block"/><p>${escape(title)}</p></div>`).join('');
    const sheet = path.join(out, 'contact-sheet.html');
    fs.writeFileSync(sheet, `<html><body style="margin:0;background:#070c0f;color:white;font:18px Arial"><main style="display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:16px">${cards}</main><style>p{margin:10px 0 0}</style></body></html>`);
    await contact.goto(pathToFileURL(sheet).href);
    await contact.screenshot({ path: path.join(out, 'contact-sheet.png'), fullPage: true });
    console.log('Six Mermaid diagrams validated and rendered.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
