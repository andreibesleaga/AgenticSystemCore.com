#!/usr/bin/env node
// Optional browser lane (not part of the zero-dependency gate): axe-core over every page of www/
// in both colour schemes at a phone width (390 px), a tablet width (768 px) and a desktop width
// (1280 px), and with the visitor's stored dark choice at 1280 px (WCAG 2.0/2.1/2.2 A+AA + best
// practices); CSP violations, third-party requests, first-Tab skip link, the 404 page and the
// search script. Besides axe it measures what decides how a page reads:
//   - no page scrolls sideways at 320, 390, 768 or 1280 px (WCAG 1.4.10);
//   - prose lines: at 768 and 1280 px no line of running text in the main column is longer
//     than 80 characters (WCAG 1.4.8; the stylesheet aims at about 70). Code blocks, tables,
//     diagrams and the card grid are not prose and are not measured; a diagram caption is;
//   - whole words in tables: no word of three or more letters is split across two lines inside
//     a table cell, at any of the three widths. A word inside code or a link may break anywhere
//     (a long identifier or address must not widen the page); those breaks are counted apart
//     and reported, not failed.
// Every file is served with the headers the generated `_headers` gives its address (Content-Type
// first), as the host serves it, so a wrong content type in that file is seen here; a file
// `_headers` gives no type gets the type of its extension.
// Run after `node scripts/check.js`. Needs, outside the repository:
//   npm i --no-save playwright-core@1.62.1 axe-core@4.13.0   (1.62.1 or a later 1.x works)
//   CHROME_EXE=<path to a Chromium or chrome-headless-shell binary> node scripts/a11y.js
// Exit 0 when clean, 1 with the list of problems.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
if (!process.env.CHROME_EXE) { console.error('a11y: set CHROME_EXE to a Chromium binary'); process.exit(2); }
// SITE_A11Y_WWW runs the same lane over another built node (e.g. the patterns site's www/).
const WWW = process.env.SITE_A11Y_WWW ? path.resolve(process.env.SITE_A11Y_WWW) : path.resolve(__dirname, '..', (JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'agsc.config.json'), 'utf8')).build || {}).out || 'www');
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const headers = fs.readFileSync(path.join(WWW, '_headers'), 'utf8');
// `_headers` as the host reads it: blocks of an address (a `*` matches any run of characters)
// followed by indented `Name: value` lines. Every block whose address matches a request applies.
const BLOCKS = [];
for (const line of headers.split('\n')) {
  if (/^\s*(#|$)/.test(line)) continue;
  if (!/^\s/.test(line)) { BLOCKS.push({ re: new RegExp('^' + line.trim().split('*').map(x => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$'), headers: [] }); continue; }
  const m = /^\s+([A-Za-z-]+):\s*(.*)$/.exec(line);
  if (m && BLOCKS.length) BLOCKS[BLOCKS.length - 1].headers.push([m[1], m[2]]);
}
const headersFor = url => BLOCKS.filter(b => b.re.test(url)).flatMap(b => b.headers);
const CSP = (headersFor('/').find(([n]) => n.toLowerCase() === 'content-security-policy') || [])[1];
if (!CSP) { console.error('a11y: _headers gives no Content-Security-Policy for /'); process.exit(2); }
const typeProblems = [];
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const pages = walk(WWW).filter(f => f.endsWith('index.html')).map(f => '/' + path.relative(WWW, path.dirname(f)).split(path.sep).join('/') + '/').map(p => p === '//' ? '/' : p).sort();
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
// The reading measures (they run inside the page; layout does not depend on the colour scheme,
// so they run once per width, in the light scheme).
const MAX_LINE = 80; // characters in one rendered line of prose (WCAG 1.4.8)
const SIZES = { 390: { width: 390, height: 844 }, 768: { width: 768, height: 1024 }, 1280: { width: 1280, height: 900 } };
/** The longest rendered line of prose in the main column, in characters, and whether any block wraps. */
function proseLines() {
  const main = document.querySelector('main');
  if (!main) return { longest: 0, wraps: false, sample: '' };
  const NOT_PROSE = 'pre, table, .table-wrap, svg, .modes, script, style, figure > :not(figcaption)';
  const blockOf = el => { while (el && el !== main && getComputedStyle(el).display.startsWith('inline')) el = el.parentElement; return el; };
  const one = document.createRange();
  let longest = 0, sample = '', wraps = false, block = null, top = 0, height = 0, text = '';
  const close = () => { const n = text.trim().length; if (n > longest) { longest = n; sample = text.trim(); } text = ''; };
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.parentElement || node.parentElement.closest(NOT_PROSE)) continue;
    const b = blockOf(node.parentElement);
    for (let i = 0; i < node.data.length; i++) {
      one.setStart(node, i); one.setEnd(node, i + 1);
      const r = one.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue; // collapsed white space
      if (b !== block) { close(); block = b; top = r.top; height = r.height; }
      else if (r.top > top + height / 2) { close(); wraps = true; top = r.top; height = r.height; }
      text += node.data[i] === '\n' || node.data[i] === '\t' ? ' ' : node.data[i];
    }
  }
  close();
  return { longest, wraps, sample: sample.slice(0, 60) };
}
/** Words of three or more letters split across two lines inside a table cell: outside code and links, and inside them. */
function splitWords() {
  const one = document.createRange();
  const found = { plain: [], codeOrLink: 0 };
  for (const cell of document.querySelectorAll('th, td')) {
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (const m of node.data.matchAll(/\p{L}{3,}/gu)) {
        one.setStart(node, m.index); one.setEnd(node, m.index + m[0].length);
        const tops = [...one.getClientRects()].filter(r => r.width > 0).map(r => r.top);
        if (!tops.some(t => Math.abs(t - tops[0]) > 2)) continue;
        if (node.parentElement.closest('code, a')) found.codeOrLink++;
        else found.plain.push(m[0]);
      }
    }
  }
  return found;
}
const sideways = () => document.documentElement.scrollWidth > document.documentElement.clientWidth;
const median = xs => { const v = [...xs].sort((a, b) => a - b); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : 0; };
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/__axe.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(AXE); }
  let f = path.join(WWW, u.endsWith('/') ? u + 'index.html' : u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404, { 'Content-Type': 'text/html' }); return res.end(fs.readFileSync(path.join(WWW, '404.html'))); }
  const own = headersFor(u), types = [...new Set(own.filter(([n]) => n.toLowerCase() === 'content-type').map(([, v]) => v))];
  if (types.length > 1) typeProblems.push(`${u}: _headers gives ${types.length} content types (${types.join(' | ')})`);
  for (const [n, v] of own) if (n.toLowerCase() !== 'content-type') res.setHeader(n, v);
  res.setHeader('Content-Type', types[0] || TYPES[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f));
});
srv.listen(0, async () => {
  const port = srv.address().port, base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE, headless: true });
  let violations = 0, cspViol = 0, thirdParty = 0, problems = [], scrolling = 0;
  const longest = { 768: [], 1280: [] }, split = { 390: 0, 768: 0, 1280: 0 }, splitInCode = { 390: 0, 768: 0, 1280: 0 };
  // 'light' and 'dark' follow the system scheme; 'chosen-dark' is a light system with the
  // visitor's stored switcher choice 'dark' (the manual override of the theme switcher).
  // Both system schemes at a phone (390 x 844), a tablet (768 x 1024) and a desktop width
  // (1280 x 900), and the chosen dark scheme at the desktop width. At 390 px diagrams and wide
  // tables scroll inside their own box; the page itself never scrolls sideways.
  const RUNS = [['light', 390], ['dark', 390], ['light', 768], ['dark', 768], ['light', 1280], ['dark', 1280], ['chosen-dark', 1280]];
  for (const [scheme, width] of RUNS) {
    const ctx = await browser.newContext({ colorScheme: scheme === 'chosen-dark' ? 'light' : scheme, viewport: SIZES[width] });
    if (scheme === 'chosen-dark') await ctx.addInitScript(() => { try { localStorage.setItem('agsc-theme', 'dark'); } catch (e) {} });
    for (const p of pages) {
      const page = await ctx.newPage();
      page.on('console', m => { if (/Content Security Policy/.test(m.text())) { cspViol++; problems.push(`${scheme} ${p}: CSP ${m.text().slice(0, 100)}`); } });
      page.on('request', r => { if (!r.url().startsWith(base)) { thirdParty++; problems.push(`${p}: third-party ${r.url()}`); } });
      await page.goto(base + p, { waitUntil: 'load' });
      await page.addScriptTag({ url: base + '/__axe.js' });
      const res = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }));
      for (const v of res.violations) { violations++; problems.push(`${scheme} ${width}px ${p}: ${v.id} (${v.impact}) ${v.nodes.length}x — ${v.nodes[0].target[0]}`); }
      if (scheme === 'chosen-dark' && await page.evaluate(() => document.documentElement.getAttribute('data-theme')) !== 'dark') problems.push(`${p}: the stored theme choice is not applied`);
      if (await page.evaluate(sideways)) { scrolling++; problems.push(`${scheme} ${p}: horizontal scroll at ${width}px`); }
      if (scheme === 'light') {
        const words = await page.evaluate(splitWords);
        split[width] += words.plain.length; splitInCode[width] += words.codeOrLink;
        if (words.plain.length) problems.push(`${width}px ${p}: ${words.plain.length} word(s) split across lines in a table cell (${words.plain.slice(0, 5).join(', ')})`);
        if (width !== 390) {
          const prose = await page.evaluate(proseLines);
          if (prose.wraps) longest[width].push(prose.longest);
          if (prose.longest > MAX_LINE) problems.push(`${width}px ${p}: a prose line of ${prose.longest} characters (more than ${MAX_LINE}): "${prose.sample}…"`);
        }
      }
      if (scheme === 'light' && width === 1280) {
        const sw = await page.evaluate(() => { const b = document.getElementById('theme'); const s = b && b.querySelector('select'); const n = s && s.getAttribute('aria-label'); const ul = document.querySelector('header.site ul'); const same = !ul || innerWidth < 1000 || Math.abs(s.getBoundingClientRect().top - ul.getBoundingClientRect().top) < 12; return !!(b && !b.hidden && s && n && same); });
        if (!sw) problems.push(`${p}: theme switcher missing, hidden, unnamed or not on the navigation line`);
        await page.keyboard.press('Tab');
        const first = await page.evaluate(() => { const a = document.activeElement; return a && a.className === 'skip' && getComputedStyle(a).top !== '-48px'; });
        if (!first) problems.push(`${p}: first Tab does not reveal the skip link`);
        await page.setViewportSize({ width: 320, height: 800 });
        if (await page.evaluate(sideways)) { scrolling++; problems.push(`${p}: horizontal scroll at 320px`); }
        await page.setViewportSize(SIZES[1280]);
      }
      await page.close();
    }
    await ctx.close();
  }
  // the theme switcher by keyboard alone: focus it, pick "Dark", reload, the choice holds
  {
    const kctx = await browser.newContext({ colorScheme: 'light' });
    const kp = await kctx.newPage();
    await kp.goto(base + '/', { waitUntil: 'load' });
    await kp.focus('#theme-select'); await kp.keyboard.press('ArrowDown'); await kp.keyboard.press('ArrowDown');
    await kp.selectOption('#theme-select', await kp.evaluate(() => document.getElementById('theme-select').value));
    const t1 = await kp.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await kp.reload({ waitUntil: 'load' });
    const t2 = await kp.evaluate(() => [document.documentElement.getAttribute('data-theme'), document.getElementById('theme-select').value, getComputedStyle(document.body).backgroundColor].join(' '));
    console.log(`theme switcher by keyboard: after choice ${t1}; after reload ${t2}`);
    if (t1 !== 'dark' || !t2.startsWith('dark dark')) problems.push(`theme switcher by keyboard failed: ${t1} / ${t2}`);
    await kctx.close();
  }
  // search page behaviour (this site's own search page only)
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  if (!process.env.SITE_A11Y_WWW) {
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
  }
  const r404 = await page.goto(base + '/no/such/page/'); console.log(`unknown path -> HTTP ${r404.status()}`);
  await browser.close(); srv.close();
  console.log(`pages: ${pages.length} × 2 schemes (system light, system dark) at 390, 768 and 1280 px, and the chosen dark scheme at 1280 px; axe violations: ${violations}; CSP violations: ${cspViol}; third-party requests: ${thirdParty}; content types from _headers`);
  console.log(`pages scrolling sideways (320, 390, 768, 1280 px): ${scrolling}`);
  for (const w of [768, 1280]) console.log(`prose at ${w} px: ${longest[w].length} pages with wrapped prose; median of each page's longest line ${median(longest[w])} characters, longest ${Math.max(0, ...longest[w])} (at most ${MAX_LINE})`);
  console.log(`words split across lines in table cells (390 / 768 / 1280 px): ${split[390]} / ${split[768]} / ${split[1280]}; breaks inside code or a link, allowed: ${splitInCode[390]} / ${splitInCode[768]} / ${splitInCode[1280]}`);
  problems.push(...typeProblems);
  if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
  console.log('a11y pass: OK');
});
