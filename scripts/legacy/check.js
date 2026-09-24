#!/usr/bin/env node
// FROZEN COPY — the generator as it stood before the engine built this site.
// Do not develop this file. Read scripts/legacy/README.md before running it. It is kept only so the
// site can still be built the old way until launch + 30 days, and it is deleted after that.
// Site v0 gate. Run before every commit: `node scripts/check.js`. Exit 0 pass, 1 fail.
// No network. Checks: (0) every page has a summary line, every diagram a name and a caption, every rule its trace line, no e-mail address; (1) determinism — two builds are byte-identical and equal the committed
// www/; (2) the llms layout against vectors disc-0006/disc-0007 of the tagged specification;
// (3) the discovery document with the engine's tools/validate-wellknown at Level 0;
// (4) every HTML page: structure, accessibility basics, unique ids, internal links and
// fragments, no third-party loads, CSP-compatible markup, the 100 KB budget; (5) machine
// files: JSON parses, NFC, one trailing LF, _headers and _redirects content, sitemap targets;
// (6) WCAG contrast of the colour tokens in both schemes.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..'); // scripts/legacy/ -> the repository root (the one line changed when this copy was frozen)
const ENGINE = path.resolve(ROOT, process.env.AGSC_ENGINE || '../agentic-system-core');
const SPEC_TAG = process.env.AGSC_SPEC_TAG || '1.0.0-rc.5';
const WWW = path.join(ROOT, (JSON.parse(fs.readFileSync(path.join(ROOT, 'agsc.config.json'), 'utf8')).build || {}).out || 'www'); // www-next until launch (README)
const fails = [];
const NO_TRACE_IN_SOURCE = new Set(['AGSC-05-26']); // the one rule whose source ends in a table with no bracket
const ok = (c, m) => { if (!c) fails.push(m); };
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]).sort();
const rel = f => path.relative(WWW, f).split(path.sep).join('/');

// (1) determinism
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-site-'));
const build = out => cp.execFileSync(process.execPath, [path.join(__dirname, 'build.js'), '--out', out], { stdio: ['ignore', 'pipe', 'inherit'], env: process.env });
build(path.join(tmp, 'a')); build(path.join(tmp, 'b'));
const same = (x, y) => { try { cp.execFileSync('diff', ['-r', x, y], { stdio: 'pipe' }); return true; } catch (e) { return e.stdout.toString().split('\n').slice(0, 5).join('\n'); } };
const d1 = same(path.join(tmp, 'a'), path.join(tmp, 'b'));
ok(d1 === true, `build is not reproducible (AGSC-04-02):\n${d1}`);
const d2 = fs.existsSync(WWW) ? same(path.join(tmp, 'a'), WWW) : 'www/ missing';
ok(d2 === true, `committed output directory differs from a fresh build — run node scripts/build.js:\n${d2}`);

// (2) llms vectors
const llms = require('./llms.js');
for (const f of ['disc-0006-llms-txt-byte-layout', 'disc-0007-llms-full-and-primary-cluster']) {
  const v = JSON.parse(cp.execFileSync('git', ['-C', ENGINE, 'show', `${SPEC_TAG}:tests/vectors/discovery/${f}.json`], { encoding: 'utf8' }));
  const i = v.input;
  const out = llms({ title: i.bundle.title, base: i.bundle.base, description: i.bundle.description, license_prose: i.bundle.license_prose, terms: 'LicenseRef-AgenticSystemCore-Content-Use-1.0', spec_version: i.spec_version, generated_at: i.generated_at, clusters: i.clusters || [], items: i.items.map(x => ({ ...x, type: 'concept', iri: `${i.bundle.base}concepts/${x.slug}/` })) });
  const exp = v.expected.output !== undefined ? { index: v.expected.output } : { index: v.expected.llms_txt, full: v.expected.llms_full_txt };
  for (const k of Object.keys(exp)) ok(out[k] === exp[k], `llms layout fails vector ${v.id} (${k})`);
}

// (3) discovery document
const validator = path.join(ENGINE, 'tools', 'validate-wellknown');
if (!fs.existsSync(validator)) fails.push(`validator not found: ${validator}`);
else {
  const r = cp.spawnSync(process.execPath, [validator, path.join(WWW, '.well-known', 'knowledge-linkset'), '--level', '0', '--json'], { encoding: 'utf8' });
  let env = null; try { env = JSON.parse(r.stdout); } catch { /* reported below */ }
  ok(r.status === 0 && env && env.status === 'pass', `validate-wellknown --level 0 failed: ${r.stdout}${r.stderr}`);
}

// (4) HTML pages
const files = fs.existsSync(WWW) ? walk(WWW) : [];
const exists = p => fs.existsSync(p) && fs.statSync(p).isFile();
const targetFile = urlPath => {
  const p = decodeURIComponent(urlPath);
  const f = path.join(WWW, p);
  if (p.endsWith('/')) return exists(path.join(f, 'index.html')) ? path.join(f, 'index.html') : null;
  return exists(f) ? f : null;
};
const idsOf = new Map();
const idsIn = html => [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
for (const f of files.filter(f => f.endsWith('.html'))) idsOf.set(f, new Set(idsIn(fs.readFileSync(f, 'utf8'))));
for (const f of files.filter(f => f.endsWith('.html'))) {
  const r = rel(f), h = fs.readFileSync(f, 'utf8');
  const E = m => fails.push(`${r}: ${m}`);
  if (Buffer.byteLength(h) > 100 * 1000) E("exceeds the 100 KB page budget (AGSC-06-21)");
  if (!h.startsWith('<!doctype html>\n<html lang="en">')) E('doctype or lang missing');
  if ((h.match(/<h1[\s>]/g) || []).length !== 1) E('must have exactly one h1');
  if (!/<title>[^<]{3,}<\/title>/.test(h)) E('title missing');
  if (!/<meta name="description" content="[^"]{10,}">/.test(h)) E('meta description missing');
  if (r !== '404.html' && !/<link rel="canonical" href="https:\/\/agenticsystemcore\.com\/[^"]*">/.test(h)) E('canonical missing');
  if (!h.includes('<link rel="describedby" href="/.well-known/knowledge-linkset" type="application/linkset+json">')) E('describedby link missing (AGSC-06-25)');
  if (!h.includes('<a class="skip" href="#main">') || !h.includes('<main id="main"')) E('skip link or main landmark missing');
  const ids = idsIn(h); const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  if (dup.length) E(`duplicate ids: ${[...new Set(dup)].slice(0, 5).join(', ')}`);
  for (const m of h.matchAll(/<script(?![^>]*type="application\/ld\+json")[^>]*>/g)) if (m[0] !== '<script src="/assets/search.js" defer>') E(`script other than the same-origin search script: ${m[0]} (AGSC-06-05, CSP)`);
  if (!/<p class="summary"><strong>Summary<\/strong>[^<]{20,}<\/p>/.test(h)) E('summary line missing after the heading');
  for (const m of h.matchAll(/<figure class="diagram">([\s\S]*?)<\/figure>/g)) { if (!/<svg [^>]*role="img" aria-label="[^"]{20,}"/.test(m[1])) E('diagram without an accessible name'); if (!/<figcaption>[^<]{20,}<\/figcaption>/.test(m[1])) E('diagram without a caption'); }
  // Every rule carries a trailing trace bracket in the source except the ones listed (their source has none), so a missing trace line is a rendering defect.
  for (const m of h.matchAll(/<li id="(AGSC-\d{2}-\d{2,3}[a-z]?)" class="rule-item[^"]*">[\s\S]*?(?=<li id="AGSC-|<h[1-6] |<\/main>)/g)) if (!m[0].includes('<span class="trace">') && !m[0].includes('retired') && !NO_TRACE_IN_SOURCE.has(m[1])) E(`rule ${m[1]} rendered without its traceability line`);
  if (/\sstyle="|<style[\s>]/.test(h)) E('inline style present (CSP style-src \'self\')');
  if (/\son[a-z]+="/.test(h)) E('inline event handler present');
  for (const m of h.matchAll(/<(?:img|script|iframe|source|audio|video)[^>]*\ssrc="([^"]+)"/g)) if (/^[a-z]+:/i.test(m[1])) E(`third-party load: ${m[1]} (AGSC-06-05)`);
  for (const m of h.matchAll(/<link rel="(stylesheet|icon|preload|modulepreload)" href="([^"]+)"/g)) if (/^[a-z]+:/i.test(m[2])) E(`third-party load: ${m[2]} (AGSC-06-05)`);
  for (const m of h.matchAll(/<img\b[^>]*>/g)) if (!/\salt="/.test(m[0])) E('img without alt (AGSC-06-20)');
  for (const m of h.matchAll(/<th(?=[\s>])([^>]*)>/g)) if (!/scope="(col|row)"/.test(m[1])) E('th without scope');
  const levels = [...h.matchAll(/<h([1-6])[\s>]/g)].map(m => Number(m[1]));
  for (let i = 1; i < levels.length; i++) if (levels[i] > levels[i - 1] + 1) { E(`heading level skips from h${levels[i - 1]} to h${levels[i]}`); break; }
  for (const m of h.matchAll(/<a\s[^>]*href="([^"]+)"/g)) {
    const href = m[1].replace(/&amp;/g, '&');
    if (/^(https?:|mailto:)/.test(href)) continue;
    const [p, frag] = href.split('#');
    const tf = p === '' ? f : targetFile(p);
    if (!tf) { E(`broken internal link: ${href}`); continue; }
    if (frag !== undefined && frag !== '' && tf.endsWith('.html') && !idsOf.get(tf).has(frag)) E(`broken fragment: ${href}`);
  }
}

// (5) machine files
for (const f of files) {
  const r = rel(f), b = fs.readFileSync(f);
  if (/\.(png|jpe?g|gif|webp|ico|woff2?)$/.test(r)) { fails.push(`${r}: binary asset not expected in site v0`); continue; }
  const s = b.toString('utf8');
  if (!Buffer.from(s, 'utf8').equals(b)) { fails.push(`${r}: not UTF-8`); continue; }
  if (s.normalize('NFC') !== s) fails.push(`${r}: not NFC (AGSC-E604)`);
  if (s.includes('\r') || !s.endsWith('\n') || s.endsWith('\n\n')) fails.push(`${r}: LF only, exactly one trailing LF`);
  if (/\.(json|jsonld)$/.test(r) || r === '.well-known/knowledge-linkset') { try { JSON.parse(s); } catch (e) { fails.push(`${r}: invalid JSON: ${e.message}`); } }
  // The tagged requirements document names two forbidden framings in order to forbid them (NFR-12); that one quoted sentence is allowed.
  const t = ['no Web4/crypto framing, book or &quot;companion&quot; strings', 'no Web4/crypto framing, book or \\"companion\\" strings', 'with no reading order imposed', 'no &quot;start here&quot; link and no imposed reading order', 'no \\"start here\\" link and no imposed reading order'].reduce((x, q) => x.split(q).join(''), s);
  if (!r.startsWith('specs/') && r !== 'assets/search-site.json' && new RegExp(['wiley', 'companion', 'chapter \\d', 'reading order', 'discovery' + '-product', '05-' + 'WILEY'].join('|'), 'i').test(t)) fails.push(`${r}: forbidden string (AGSC-06-03 / private record)`);
  if (/\bWeb4\b|W3C (?:standard|Recommendation) for AgenticSystemCore/i.test(t)) fails.push(`${r}: forbidden claim`);
  if (/andrei\.besleaga\.nicolae@|abnmaster@|@gmail\.com/i.test(s)) fails.push(`${r}: the operator's e-mail address is published`);
}
// AGSC-06-21 as amended at rc.5: ≤1 MB per index document (decimal), sharded above 500 items.
const searchJson = path.join(WWW, 'search.json');
ok(exists(searchJson) && fs.statSync(searchJson).size <= 1000 * 1000, 'search.json missing or over the 1 MB index-document budget (AGSC-06-21)');
const headers = exists(path.join(WWW, '_headers')) ? fs.readFileSync(path.join(WWW, '_headers'), 'utf8') : '';
for (const need of [
  'Content-Type: application/linkset+json; profile="https://w3id.org/agentic-system-core/profile/agentic-knowledge"',
  'Link: <https://w3id.org/agentic-system-core/profile/agentic-knowledge>; rel="profile"',
  "Content-Security-Policy: default-src 'none'; script-src 'self'",
  'Access-Control-Allow-Origin: *', 'Access-Control-Expose-Headers: Link, ETag, Content-Type',
  'Link: </.well-known/knowledge-linkset>; rel="describedby"; type="application/linkset+json"',
]) ok(headers.includes(need), `_headers lacks: ${need} (AGSC-06-17, AGSC-11-03, AGSC-11-05)`);
ok(!/Access-Control-Allow-Credentials/i.test(headers), '_headers must not allow credentials (AGSC-11-03)');
const redirects = exists(path.join(WWW, '_redirects')) ? fs.readFileSync(path.join(WWW, '_redirects'), 'utf8') : '';
ok(/^\/\.well-known\/agentic-knowledge \/\.well-known\/knowledge-linkset 301$/m.test(redirects), '_redirects lacks the 0.0.x alias (AGSC-06-17)');
const sitemap = exists(path.join(WWW, 'sitemap.xml')) ? fs.readFileSync(path.join(WWW, 'sitemap.xml'), 'utf8') : '';
const locs = [...sitemap.matchAll(/<loc>https:\/\/agenticsystemcore\.com(\/[^<]*)<\/loc>/g)].map(m => m[1]);
ok(locs.length > 0 && locs.join('\n') === [...locs].sort().join('\n'), 'sitemap empty or not ordered by URL (AGSC-06-19)');
for (const l of locs) ok(targetFile(l), `sitemap URL has no page: ${l}`);
for (const need of ['.well-known/knowledge-linkset', '.well-known/security.txt', '.well-known/tdmrep.json', 'graph.jsonld', 'llms.txt', 'llms-full.txt', 'search.json', 'assets/search-site.json', 'assets/search.js', 'robots.txt', '404.html', 'ns/context.jsonld', 'ns/agsc.ttl', 'specs/agentic-knowledge/index.html', 'specs/mcp/index.html', 'legal/index.html', 'docs/index.html', 'docs/introduction/index.html', 'docs/modes/index.html', 'docs/requirements/index.html', 'docs/standards/index.html', 'docs/compliance/index.html', 'docs/status/index.html', 'search/index.html'])
  ok(exists(path.join(WWW, need)), `missing route: /${need}`);

// (6) contrast (WCAG 2.2 SC 1.4.3: 4.5:1 for body text)
{
  const css = fs.readFileSync(path.join(ROOT, 'assets', 'site.css'), 'utf8');
  const tokens = block => Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map(m => [m[1], m[2]]));
  const light = tokens(css.slice(css.indexOf(':root'), css.indexOf('}')));
  const darkStart = css.indexOf('prefers-color-scheme: dark');
  const dark = tokens(css.slice(darkStart, css.indexOf('}', css.indexOf(':root', darkStart))));
  const lum = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const [name, t] of [['light', light], ['dark', dark]])
    for (const [fg, bg] of [['fg', 'bg'], ['muted', 'bg'], ['link', 'bg'], ['accent', 'bg'], ['fg', 'code-bg'], ['link', 'code-bg'], ['fg', 'bg-alt'], ['muted', 'bg-alt'], ['link', 'bg-alt'], ['accent', 'bg-alt']]) {
      if (!t[fg] || !t[bg]) { fails.push(`contrast: token --${fg} or --${bg} missing in ${name} scheme`); continue; }
      const r = ratio(t[fg], t[bg]);
      ok(r >= 4.5, `contrast ${name} --${fg} on --${bg} is ${r.toFixed(2)}:1, below 4.5:1 (AGSC-06-20)`);
    }
}

fs.rmSync(tmp, { recursive: true, force: true });
if (fails.length) { process.stderr.write(fails.map(f => `FAIL ${f}`).join('\n') + `\ncheck: ${fails.length} failure(s)\n`); process.exit(1); }
process.stdout.write(`check: pass — ${files.length} files, ${files.filter(f => f.endsWith('.html')).length} pages, reproducible, llms vectors, validate-wellknown level 0, links and fragments, headers, contrast\n`);
