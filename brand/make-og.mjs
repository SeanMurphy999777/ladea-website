// Renders public/assets/og-image.png (EN) and og-image-fr.png (FR), 1200×630.
//   node brand/make-og.mjs      (needs Playwright with Chromium)
// Uses the site's own fonts and logo files, so it matches the live pages.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const require = createRequire(join(execSync('npm root -g').toString().trim(), 'x.js'));
const { chromium } = require('playwright');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// inlined as data: URLs so the page needs no file access
const MIME = { woff2: 'font/woff2', png: 'image/png' };
const pub = (p) => `data:${MIME[p.split('.').pop()]};base64,${readFileSync(join(ROOT, 'public', p)).toString('base64')}`;

const cards = [
  { file: 'og-image.png', lang: 'en', title: 'Find the friction first.', sub: 'Then decide whether AI belongs there.' },
  { file: 'og-image-fr.png', lang: 'fr', title: 'Repérer la friction d’abord.', sub: 'Ensuite, décider si l’IA a sa place.' },
];

const html = (c) => `<!doctype html><html lang="${c.lang}"><head><meta charset="utf-8"><style>
@font-face { font-family: Newsreader; src: url(${pub('fonts/newsreader-latin-wght-normal.woff2')}); font-weight: 200 800; }
@font-face { font-family: Newsreader; src: url(${pub('fonts/newsreader-latin-wght-italic.woff2')}); font-weight: 200 800; font-style: italic; }
@font-face { font-family: "Instrument Sans"; src: url(${pub('fonts/instrument-sans-latin-wght-normal.woff2')}); font-weight: 400 700; }
* { margin: 0; box-sizing: border-box; }
body { width: 1200px; height: 630px; background: #FAF8F5; color: #390941; display: flex; align-items: center; padding: 0 100px; gap: 84px; }
.brand { flex: none; display: flex; flex-direction: column; align-items: center; gap: 36px; width: 300px; }
.brand .icon { width: 280px; height: 280px; display: block; }
.brand .word { height: 70px; width: auto; display: block; }
.copy { flex: 1; }
.label { font: 600 17px/1 "Instrument Sans"; letter-spacing: .14em; text-transform: uppercase; color: #B8360A; }
h1 { margin-top: 26px; font: 400 64px/1.08 Newsreader; letter-spacing: -.015em; }
hr { margin: 44px 0 30px; border: 0; height: 2px; width: 72px; background: #FD5210; }
p { font: italic 400 30px/1.3 Newsreader; }
</style></head><body>
<div class="brand"><img class="icon" src="${pub('assets/ladea-icon-800.png')}" alt=""><img class="word" src="${pub('assets/ladea-wordmark.png')}" alt=""></div>
<div class="copy"><div class="label">Ladea Technologies</div><h1>${c.title}</h1><hr><p>${c.sub}</p></div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const c of cards) {
  await page.setContent(html(c), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(ROOT, 'public/assets', c.file) });
  console.log('✓', c.file);
}
await browser.close();
