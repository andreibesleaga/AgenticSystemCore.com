#!/usr/bin/env node
// Optional browser lane (not part of the zero-dependency gate): one full-page screenshot of
// every page of the built site, in both colour schemes, at two widths. Written for's
// "the site must look the same" gate (R97): capture a set before a change and a set after,
// then `node scripts/compare-baseline.js --shots <before> <after>` compares them pixel by pixel.
//
// Needs, outside the repository (the same install scripts/a11y.js uses):
//   npm i --no-save playwright-core@1.62.1
//   CHROME_EXE=<chromium or chrome-headless-shell> node scripts/shots.js --out <dir>
//
// Screenshots never enter the repository: <dir> belongs outside it.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');

if (!process.env.CHROME_EXE) { console.error('shots: set CHROME_EXE to a Chromium binary'); process.exit(2); }
const ROOT = path.resolve(__dirname, '..');
const WWW = path.resolve(ROOT, (JSON.parse(fs.readFileSync(path.join(ROOT, 'agsc.config.json'), 'utf8')).build || {}).out || 'www');
const OUT = (() => { const i = process.argv.indexOf('--out'); if (i < 0) { console.error('shots: --out <dir> is required'); process.exit(2); } return path.resolve(process.argv[i + 1]); })();
if (OUT.startsWith(ROOT + path.sep)) { console.error('shots: --out must be outside the repository'); process.exit(2); }

// The two widths: a narrow phone (the 320 px the a11y lane already checks for horizontal
// scroll) and a desktop column wide enough for the site's 46rem measure.
const WIDTHS = [360, 1200];
const SCHEMES = ['light', 'dark'];

const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const pages = walk(WWW).filter(f => f.endsWith('index.html'))
  .map(f => '/' + path.relative(WWW, path.dirname(f)).split(path.sep).join('/') + '/')
  .map(p => p === '//' ? '/' : p).sort();
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.jsonld': 'application/ld+json', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.md': 'text/markdown', '.jsonl': 'application/jsonl' };
const headers = fs.readFileSync(path.join(WWW, '_headers'), 'utf8');
const CSP = /Content-Security-Policy: (.*)/.exec(headers)[1];

const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(WWW, u.endsWith('/') ? u + 'index.html' : u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404, { 'Content-Type': 'text/html' }); return res.end(fs.readFileSync(path.join(WWW, '404.html'))); }
  res.setHeader('Content-Type', TYPES[path.extname(f)] || 'application/octet-stream');
  res.setHeader('Content-Security-Policy', CSP);
  res.end(fs.readFileSync(f));
});

const name = (route, scheme, width) =>
  (route === '/' ? 'home' : route.replace(/^\/|\/$/g, '').split('/').join('__')) + `.${scheme}.${width}.png`;

srv.listen(0, async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const port = srv.address().port, base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE, headless: true });
  let n = 0;
  for (const scheme of SCHEMES) {
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
      for (const route of pages) {
        const page = await ctx.newPage();
        await page.goto(base + route, { waitUntil: 'load' });
        // A full-page capture of the tallest specification chapter times out in
        // chrome-headless-shell, so the viewport is grown to the document instead and an
        // ordinary viewport capture is taken: the same pixels, one compositing pass.
        const h = Math.min(await page.evaluate(() => document.documentElement.scrollHeight), 30000);
        await page.setViewportSize({ width, height: Math.max(h, 400) });
        await page.screenshot({ path: path.join(OUT, name(route, scheme, width)), animations: 'disabled', timeout: 120000 });
        await page.close();
        n++;
      }
      await ctx.close();
    }
  }
  await browser.close();
  srv.close();
  process.stdout.write(`shots: ${n} screenshots of ${pages.length} pages (${SCHEMES.join('/')} x ${WIDTHS.join('/')}) -> ${OUT}\n`);
});
