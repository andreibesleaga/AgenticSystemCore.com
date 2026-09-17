#!/usr/bin/env node
// Optional browser lane (not part of the zero-dependency gate): axe-core over every page of www/
// in both colour schemes (WCAG 2.0/2.1/2.2 A+AA + best practices), CSP violations, third-party
// requests, first-Tab skip link, horizontal scroll at 320 px, the 404 page and the search script.
// Run after `node scripts/check.js`. Needs, outside the repository:
//   npm i --no-save playwright-core@1.62.1 axe-core@4.13.0
//   CHROME_EXE=<path to a Chromium or chrome-headless-shell binary> node scripts/a11y.js
// Exit 0 when clean, 1 with the list of problems.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
if (!process.env.CHROME_EXE) { console.error('a11y: set CHROME_EXE to a Chromium binary'); process.exit(2); }
const WWW = path.resolve(__dirname, '..', (JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'agsc.config.json'), 'utf8')).build || {}).out || 'www');
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const headers = fs.readFileSync(path.join(WWW, '_headers'), 'utf8');
const CSP = /Content-Security-Policy: (.*)/.exec(headers)[1];
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const pages = walk(WWW).filter(f => f.endsWith('index.html')).map(f => '/' + path.relative(WWW, path.dirname(f)).split(path.sep).join('/') + '/').map(p => p === '//' ? '/' : p).sort();
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/__axe.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(AXE); }
  let f = path.join(WWW, u.endsWith('/') ? u + 'index.html' : u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404, { 'Content-Type': 'text/html' }); return res.end(fs.readFileSync(path.join(WWW, '404.html'))); }
  res.setHeader('Content-Type', TYPES[path.extname(f)] || 'application/octet-stream'); res.setHeader('Content-Security-Policy', CSP); res.end(fs.readFileSync(f));
});
srv.listen(0, async () => {
  const port = srv.address().port, base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE, headless: true });
  let violations = 0, cspViol = 0, thirdParty = 0, problems = [];
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 1200, height: 900 } });
    for (const p of pages) {
      const page = await ctx.newPage();
      page.on('console', m => { if (/Content Security Policy/.test(m.text())) { cspViol++; problems.push(`${scheme} ${p}: CSP ${m.text().slice(0, 100)}`); } });
      page.on('request', r => { if (!r.url().startsWith(base)) { thirdParty++; problems.push(`${p}: third-party ${r.url()}`); } });
      await page.goto(base + p, { waitUntil: 'load' });
      await page.addScriptTag({ url: base + '/__axe.js' });
      const res = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }));
      for (const v of res.violations) { violations++; problems.push(`${scheme} ${p}: ${v.id} (${v.impact}) ${v.nodes.length}x — ${v.nodes[0].target[0]}`); }
      if (scheme === 'light') {
        await page.keyboard.press('Tab');
        const first = await page.evaluate(() => { const a = document.activeElement; return a && a.className === 'skip' && getComputedStyle(a).top !== '-48px'; });
        if (!first) problems.push(`${p}: first Tab does not reveal the skip link`);
        await page.setViewportSize({ width: 320, height: 800 });
        const hs = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
        if (hs) problems.push(`${p}: horizontal scroll at 320px`);
        await page.setViewportSize({ width: 1200, height: 900 });
      }
      await page.close();
    }
    await ctx.close();
  }
  // search page behaviour
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(base + '/search/?q=digest', { waitUntil: 'load' });
  await page.waitForTimeout(600);
  const n = await page.evaluate(() => document.querySelectorAll('#results li').length);
  const status = await page.evaluate(() => document.getElementById('search-status').textContent);
  const hidden = await page.evaluate(() => document.getElementById('site-index').hidden);
  console.log(`search "digest": ${n} results shown; status "${status}"; index hidden=${hidden}`);
  if (n < 5) problems.push('search returned fewer than 5 results for "digest"');
  await page.fill('#q', 'AGSC-03-01'); await page.waitForTimeout(400);
  const t = await page.evaluate(() => document.querySelector('#results li a') && document.querySelector('#results li a').textContent);
  console.log(`search "AGSC-03-01": first result ${t}`);
  const r404 = await page.goto(base + '/no/such/page/'); console.log(`unknown path -> HTTP ${r404.status()}`);
  await browser.close(); srv.close();
  console.log(`pages: ${pages.length} × 2 schemes; axe violations: ${violations}; CSP violations: ${cspViol}; third-party requests: ${thirdParty}`);
  if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
  console.log('a11y pass: OK');
});
