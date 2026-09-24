const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const puppeteer = require('C:/Users/moham/AppData/Local/npm-cache/_npx/668c188756b835f3/node_modules/puppeteer');
const root = __dirname;
const assets = path.join(root, '..', 'assets');
const out = path.join(root, 'v2-frames');
fs.mkdirSync(out, { recursive: true });
const titles = [
  ['01-matched-comparison', 'Match the right healthy execution', 'Compare compatible execution contexts.', 'MATCHED COMPARISON'],
  ['02-execution-path', 'Reconstruct where the work went', 'Correlation IDs and dependencies connect the execution path.', 'EXECUTION PATH'],
  ['03-evidence-ranking', 'Combine evidence. Rank possible causes.', 'Timing, execution structure, and attribution contribute to the diagnosis.', 'CAUSE RANKING'],
  ['04-measurement-selection', 'Choose the next useful measurement', 'Prefer evidence that separates the remaining explanations.', 'ACTIVE MEASUREMENT'],
  ['05-controlled-verification', 'Test the explanation', 'Verify the predicted mechanism change and end-to-end recovery.', 'CONTROLLED VERIFICATION'],
  ['06-real-t4-result', 'SmolVLA on NVIDIA T4', 'Real device latency and matched per-kernel GPU anomaly.', 'REAL GPU RESULT'],
];
const esc = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const header = ([, title, subtitle, label]) => `<rect width="1920" height="1080" fill="#11181c"/><g font-family="Arial, sans-serif"><text x="80" y="70" fill="#80d5bd" font-size="22" letter-spacing="3">ROOT / ${label}</text><text x="80" y="147" fill="#f4f6f7" font-size="54" font-weight="600">${esc(title)}</text><text x="80" y="198" fill="#b0bfc7" font-size="27">${esc(subtitle)}</text></g>`;
const label = (x, y, lines, size = 30, fill = '#f4f6f7') => `<text x="${x}" y="${y - (lines.length - 1) * 18}" font-family="Arial, sans-serif" font-size="${size}" fill="${fill}" text-anchor="middle" dominant-baseline="middle">${lines.map((line, i) => `<tspan x="${x}" dy="${i ? 36 : 0}">${esc(line)}</tspan>`).join('')}</text>`;
function verification() {
  const box = (x, y, w, h, lines, green = false) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${green ? '#183e3a' : '#253138'}" stroke="${green ? '#80d5bd' : '#778b97'}" stroke-width="2"/>${label(x + w / 2, y + h / 2, lines)}`;
  const diamond = (x, y, lines) => `<path d="M${x},${y - 85} L${x + 150},${y} L${x},${y + 85} L${x - 150},${y} Z" fill="#253138" stroke="#778b97" stroke-width="2"/>${label(x, y, lines)}`;
  const edge = (d, dashed = false) => `<path d="${d}" fill="none" stroke="#a6b6bf" stroke-width="2.5" ${dashed ? 'stroke-dasharray="7 6"' : ''} marker-end="url(#arrow)"/>`;
  return `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z" fill="#a6b6bf"/></marker></defs>
${box(80, 292, 360, 110, ['Suspected cause'])}
${box(520, 292, 360, 110, ['Predict', 'mechanism change'])}
${box(960, 292, 360, 110, ['Targeted', 'intervention'])}
${box(1400, 292, 360, 110, ['Controlled rerun'])}
${edge('M440,347 H510')}${edge('M880,347 H950')}${edge('M1320,347 H1390')}
${edge('M1580,402 V472 H260 V549')}
${diamond(260, 640, ['Mechanism', 'changed?'])}
${diamond(740, 640, ['Latency', 'recovered?'])}
${box(1120, 590, 300, 100, ['VERIFIED'], true)}
${edge('M410,640 H580')}${label(495, 613, ['Yes'], 25, '#80d5bd')}
${edge('M890,640 H1110')}${label(1000, 613, ['Yes'], 25, '#80d5bd')}
${box(650, 826, 390, 90, ['TESTED', 'Keep investigating'])}
${edge('M260,725 V782 H805 V816', true)}${label(288, 755, ['No'], 24, '#b0bfc7')}
${edge('M740,725 V765 H925 V816', true)}${label(765, 751, ['No'], 24, '#b0bfc7')}`;
}
(async () => {
  const browser = await puppeteer.launch({executablePath:'C:/Users/moham/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe', headless:true});
  try {
    const page = await browser.newPage();
    await page.setViewport({width:1920,height:1080,deviceScaleFactor:1});
    for (let i = 0; i < titles.length; i++) {
      const info = titles[i];
      let content;
      if (i === 4) content = verification();
      else {
        const original = fs.readFileSync(path.join(assets, info[0] + '.diagram.svg'), 'utf8');
        const vb = original.match(/viewBox="([^"]+)"/)[1];
        const [vx, vy, w, h] = vb.split(/\s+/).map(Number);
        const inner = original.slice(original.indexOf('>') + 1, original.lastIndexOf('</svg>'));
        const availableHeight = i === 5 ? 560 : 570;
        const scale = Math.min(1760 / w, availableHeight / h, 1.9);
        const x = (1920 - w * scale) / 2;
        const y = 240 + (availableHeight - h * scale) / 2;
        content = `<svg id="diagram${i}" x="${x}" y="${y}" width="${w * scale}" height="${h * scale}" viewBox="${vx} ${vy} ${w} ${h}">${inner}</svg>`;
      }
      const footer = i === 5 ? 'Device latency: ms  |  Anomaly: dimensionless z-scale score' : '';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">${header(info)}${content}<text x="80" y="1014" fill="#b0bfc7" font-family="Arial" font-size="22">${footer}</text></svg>`;
      const file = path.join(out, info[0] + '.svg');
      fs.writeFileSync(file, svg);
      await page.goto(pathToFileURL(file).href);
      await page.screenshot({path:path.join(out, info[0] + '.png')});
      console.log(info[0] + ': prepared with webcam space');
    }
  } finally {await browser.close();}
})().catch(e => {console.error(e); process.exitCode=1;});
