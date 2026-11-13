#!/usr/bin/env node
// The preview card of a shared link: assets/og-card.png, the image every page names in its Open
// Graph tags (`og:image`, with `og:image:alt`; The Open Graph protocol, ogp.me) and that a chat
// or a social site shows beside a link to this site.
//
//   CHROME_EXE=<chromium> NODE_PATH=<dir>/node_modules node scripts/og-card.js   writes assets/og-card.png
//
// A plain text card, 1200 × 630 px (the size the common previews use): the site's name and one
// line, in the light colours of the engine theme (assets/site.css) and its system font stack,
// drawn by a headless Chromium and stripped of every PNG chunk that is not image data, so the same
// browser writes the same bytes. The PNG is an INPUT of the build, copied as it is, like the touch
// icon: run this only to change the card, then commit the new file. Any other 1200 × 630 PNG may
// replace it; keep CARD.alt below true to what the image shows.
//
// Needs, outside the repository: `npm i --no-save playwright-core` and a Chromium binary in CHROME_EXE.
// Exit 0 written, 1 failed, 2 not set up.
'use strict';
const fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WIDTH = 1200, HEIGHT = 630;
// The text of the card. The line is the first clause of the Bundle's own description
// (content/index.md). scripts/build.js names CARD.alt as the image's text alternative.
const CARD = {
  title: 'AgenticSystemCore',
  line: 'An open specification for knowledge that people and software agents can both read, verify and build on.',
};
CARD.alt = `${CARD.title}: ${CARD.line}`;

/** The light-scheme colour tokens of a stylesheet's first `:root` block. */
function tokens(css) {
  const block = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')));
  return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map(m => [m[1], m[2]]));
}

/** The body font stack of a stylesheet. */
function fontStack(css) {
  const m = /body\s*\{[^}]*font:\s*[^;]*?\/[0-9.]+\s+([^;]+);/.exec(css);
  if (!m) throw new Error('assets/site.css: no body font stack found');
  return m[1].trim();
}

/** The page the browser draws: plain HTML and CSS, nothing loaded. */
function cardHtml(css) {
  const t = tokens(css);
  for (const k of ['bg', 'fg', 'muted', 'accent', 'rule']) if (!t[k]) throw new Error(`assets/site.css: no --${k} colour`);
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
html, body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; }
body { background: ${t.bg}; color: ${t.fg}; font-family: ${fontStack(css)}; display: flex; flex-direction: column; justify-content: center;
  padding: 0 96px; box-sizing: border-box; border-top: 16px solid ${t.accent}; border-bottom: 2px solid ${t.rule}; }
h1 { font-size: 88px; line-height: 1.1; margin: 0 0 32px; font-weight: 700; letter-spacing: -0.01em; }
p { font-size: 40px; line-height: 1.35; margin: 0; color: ${t.muted}; max-width: 1008px; text-wrap: balance; }
</style></head><body><h1>${esc(CARD.title)}</h1><p>${esc(CARD.line)}</p></body></html>`;
}

/** The PNG with only its IHDR, PLTE, tRNS, IDAT and IEND chunks: no date, no text, no colour profile. */
function stripPng(png) {
  const SIGNATURE = png.subarray(0, 8);
  const keep = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);
  const parts = [SIGNATURE];
  for (let i = 8; i < png.length;) {
    const len = png.readUInt32BE(i), type = png.toString('latin1', i + 4, i + 8), end = i + 12 + len;
    if (keep.has(type)) parts.push(png.subarray(i, end));
    i = end;
  }
  return Buffer.concat(parts);
}

async function main() {
  if (!process.env.CHROME_EXE) { console.error('og-card: set CHROME_EXE to a Chromium binary'); process.exit(2); }
  let chromium;
  try { ({ chromium } = require('playwright-core')); } catch { console.error('og-card: playwright-core is not installed (npm i --no-save playwright-core outside this repository, then NODE_PATH)'); process.exit(2); }
  const css = fs.readFileSync(path.join(ROOT, 'assets', 'site.css'), 'utf8');
  const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1, colorScheme: 'light' });
    await page.setContent(cardHtml(css), { waitUntil: 'load' });
    const png = stripPng(await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } }));
    if (png.readUInt32BE(16) !== WIDTH || png.readUInt32BE(20) !== HEIGHT) throw new Error(`the card is ${png.readUInt32BE(16)} × ${png.readUInt32BE(20)}`);
    fs.writeFileSync(path.join(ROOT, 'assets', 'og-card.png'), png);
    process.stdout.write(`og-card: wrote assets/og-card.png, ${WIDTH} × ${HEIGHT}, ${png.length} bytes\n`);
  } finally {
    await browser.close();
  }
}

module.exports = { CARD, cardHtml, stripPng, HEIGHT, WIDTH };

if (require.main === module) main().catch(e => { console.error(`og-card: ${e.message}`); process.exit(1); });
