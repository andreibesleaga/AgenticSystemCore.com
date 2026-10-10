#!/usr/bin/env node
// Site v0 gate. Run before every commit: `node scripts/check.js`. Exit 0 pass, 1 fail.
// No network. Checks: (0) every page has a summary line, every diagram a name and a caption, every rule its trace line, no e-mail address; (1) determinism — two builds are byte-identical and equal the committed
// www/; (2) the llms layout against vectors disc-0013/disc-0014 of the specification;
// (3) the discovery document with the engine's tools/validate-wellknown at Level 0;
// (3b) every frozen copy of the vocabulary under /ns/<version>/ by SHA-256, beside the copy of the
// current version;
// (4) every HTML page: structure, accessibility basics, unique ids, internal links and
// fragments, no third-party loads, CSP-compatible markup, the 100 KB budget; (4a) every active
// rule of spec/ anchored exactly once under /specs/, and every link to a rule id — in a page, in
// the graph, in a machine view — landing on the page that carries it, since a section over the
// page budget is published in parts; (5) machine files: JSON parses, NFC, one trailing LF,
// _headers and _redirects content, sitemap targets; (6) WCAG contrast of the colour tokens in
// both schemes; (7) the page tools; (8) the content gate, scripts/check-content.js.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..');
const ENGINE = path.resolve(ROOT, process.env.SITE_ENGINE || '../agentic-system-core');
const SPEC_TAG = process.env.SITE_SPEC_TAG || '1.0.0-rc.7';
// The same parameter scripts/build.js reads: the vectors come from the release tag, and from the
// engine's working tree while the candidate has not been tagged yet.
const tagExists = cp.spawnSync('git', ['-C', ENGINE, 'rev-parse', '-q', '--verify', `${SPEC_TAG}^{commit}`], { stdio: 'ignore' }).status === 0;
const SPEC_SOURCE = process.env.SITE_SPEC_SOURCE || (tagExists ? 'tag' : 'worktree');
const engineFile = p => SPEC_SOURCE === 'tag'
  ? cp.execFileSync('git', ['-C', ENGINE, 'show', `${SPEC_TAG}:${p}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  : fs.readFileSync(path.join(ENGINE, p), 'utf8');
const WWW = path.join(ROOT, (JSON.parse(fs.readFileSync(path.join(ROOT, 'agsc.config.json'), 'utf8')).build || {}).out || 'www'); // build.out in agsc.config.json (README)
const fails = [];
const NO_TRACE_IN_SOURCE = new Set(['AGSC-05-26']); // the one rule whose source ends in a table with no bracket
// AGSC-06-05/06-17: the only <script> elements any page may carry — all same-origin, all classic,
// all deferred, none inline. The four page-tool files are the engine's own emitted bytes;
// `node scripts/page-tools-check.js` proves that and runs them.
const ALLOWED_SCRIPTS = new Set([
  '<script src="/assets/theme.js">', // the theme switcher (engine default theme)
  '<script src="/assets/search.js" defer>',
  '<script src="/compose/agsc-core.js" defer>',
  '<script src="/compose/agsc-page-tools.js" defer>',
  '<script src="/compose/agsc-compose.js" defer>',
  '<script src="/compose/webmcp.js" defer>',
]);
const ok = (c, m) => { if (!c) fails.push(m); };
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]).sort();
const rel = f => path.relative(WWW, f).split(path.sep).join('/');

// (1) determinism
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-site-'));
// Removed on every way out — a failed build throws before the end of this file.
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));
const build = out => cp.execFileSync(process.execPath, [path.join(__dirname, 'build.js'), '--out', out], { stdio: ['ignore', 'pipe', 'inherit'], env: process.env });
build(path.join(tmp, 'a')); build(path.join(tmp, 'b'));
const same = (x, y) => { try { cp.execFileSync('diff', ['-r', x, y], { stdio: 'pipe' }); return true; } catch (e) { return e.stdout.toString().split('\n').slice(0, 5).join('\n'); } };
const d1 = same(path.join(tmp, 'a'), path.join(tmp, 'b'));
ok(d1 === true, `build is not reproducible (AGSC-04-02):\n${d1}`);
const d2 = fs.existsSync(WWW) ? same(path.join(tmp, 'a'), WWW) : 'www/ missing';
ok(d2 === true, `committed output directory differs from a fresh build — run node scripts/build.js:\n${d2}`);

// (2) llms vectors
const llms = require('./llms.js');
const provenanceLines = require(path.join(ENGINE, 'src/knowledge/provenance-header.js')).provenanceLines;
// disc-0006 and disc-0007 were WITHDRAWN at rc.6 and replaced by the pair below, which carries
// the `bundle_version:` and `assistance:` lines. A withdrawn vector has no expected output, so a
// build that still named the old pair would have proved nothing at all.
for (const f of ['disc-0013-llms-txt-byte-layout-with-content-version', 'disc-0014-llms-full-with-content-version']) {
  const v = JSON.parse(engineFile(`tests/vectors/discovery/${f}.json`));
  ok(v.expected.withdrawn === undefined, `llms vector ${f} is withdrawn — name the vector that replaced it`);
  const i = v.input;
  const out = llms({ title: i.bundle.title, base: i.bundle.base, description: i.bundle.description, license_prose: i.bundle.license_prose, terms: 'LicenseRef-AgenticSystemCore-Content-Use-1.0', spec_version: i.spec_version, bundle_version: i.bundle_version, generated_at: i.generated_at, clusters: i.clusters || [], items: i.items.map(x => ({ ...x, type: 'concept', iri: `${i.bundle.base}concepts/${x.slug}/` })), provenanceLines });
  const exp = v.expected.output !== undefined ? { index: v.expected.output } : { index: v.expected.llms_txt, full: v.expected.llms_full_txt };
  for (const k of Object.keys(exp)) ok(out[k] === exp[k], `llms layout fails vector ${v.id || f} (${k})`);
}

// (3) discovery document
const validator = path.join(ENGINE, 'tools', 'validate-wellknown');
if (!fs.existsSync(validator)) fails.push(`validator not found: ${validator}`);
else {
  // at Level 0 as before, AND at Level 2, which the document now satisfies because the
  // node publishes the graph in three serialisations, the NOW page, the chunk export and the
  // skill packs, and carries the RFC 9530 digest of every artefact it links.
  for (const level of ['0', '2']) {
    const r = cp.spawnSync(process.execPath, [validator, path.join(WWW, '.well-known', 'knowledge-linkset'), '--level', level, '--json'], { encoding: 'utf8' });
    let env = null; try { env = JSON.parse(r.stdout); } catch { /* reported below */ }
    ok(r.status === 0 && env && env.status === 'pass', `validate-wellknown --level ${level} failed: ${r.stdout}${r.stderr}`);
  }
  // AGSC-06-08a: a declared digest must be the digest of the bytes actually served. A document
  // that says `sha-256=:…:` about a file nobody compared is a promise, not a check.
  const doc = JSON.parse(fs.readFileSync(path.join(WWW, '.well-known', 'knowledge-linkset'), 'utf8'));
  let checked = 0;
  for (const links of Object.values(doc.linkset[0])) {
    if (!Array.isArray(links)) continue;
    for (const link of links) {
      if (!link || !Array.isArray(link.digest) || typeof link.href !== 'string') continue;
      const route = link.href.replace(/^https:\/\/agenticsystemcore\.com/, '');
      const f = path.join(WWW, route.replace(/\/$/, '/index.html'));
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { fails.push(`the discovery document declares a digest for ${route}, which this build does not serve`); continue; }
      const want = `sha-256=:${require('crypto').createHash('sha256').update(fs.readFileSync(f)).digest('base64')}:`;
      ok(link.digest[0] === want, `the declared digest of ${route} is not the digest of the bytes served (AGSC-06-08a)`);
      checked++;
    }
  }
  ok(checked >= 8, `only ${checked} declared digests were checked — the discovery document should carry one per artefact link (AGSC-06-08a)`);
}

// (3a) the vocabulary documents, against the engine's own generator
// `tools/gen-ns` derives /ns/context.jsonld, /ns/agsc.ttl and /ns/agsc.rdf from ontology/agsc.ttl
// and, with --check, compares them with the bytes a site publishes. Zero errors AND zero warnings
// is the bar: a warning here means this site carries a second derivation of a file the engine
// already derives, which is exactly the drift removed. The generator and its inputs come from the
// same specification source the build used: at the tag in tag mode (an archive of the tag's
// `tools/gen-ns`, `ontology/`, `spec/` and `package.json`, with the engine's installed libraries),
// from the working tree otherwise, so that a vocabulary changed in the working tree does not fail a
// build that publishes the tagged one.
{
  let root = ENGINE;
  if (SPEC_SOURCE === 'tag') {
    root = path.join(tmp, 'gen-ns-root');
    fs.mkdirSync(root);
    const archive = cp.spawnSync('git', ['-C', ENGINE, 'archive', '--format=tar', SPEC_TAG, 'tools/gen-ns', 'ontology', 'spec', 'package.json'], { maxBuffer: 256 * 1024 * 1024 });
    if (archive.status === 0) cp.execFileSync('tar', ['-x', '-C', root], { input: archive.stdout });
    else fails.push(`cannot archive the vocabulary generator at tag ${SPEC_TAG}: ${String(archive.stderr)}`);
  }
  const gen = path.join(root, 'tools', 'gen-ns');
  if (!fs.existsSync(gen)) fails.push(`generator not found: ${gen}`);
  else {
    const childEnv = { ...process.env, NODE_PATH: [path.join(ENGINE, 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter) };
    const r = cp.spawnSync(process.execPath, [gen, '--check', path.join(WWW, 'ns'), '--json', root], { encoding: 'utf8', env: childEnv });
    let env = null; try { env = JSON.parse(r.stdout); } catch { /* reported below */ }
    ok(r.status === 0 && env && env.status === 'pass' && env.counts.error === 0 && env.counts.warn === 0,
      `gen-ns --check on /ns/ is not clean: ${r.stdout}${r.stderr}`);
  }
}

// (4) HTML pages
// Public means clean: the engine's hygiene sweep over this repository and its built
// output (private paths and names, process vocabulary, secrets, e-mail addresses,
// personal data, forbidden wording, owner-addressed files, links to absent files).
// The allowed hits and their reasons are in `.public-hygiene.json`.
{
  const hygiene = path.join(ENGINE, 'tools', 'public-hygiene');
  if (!fs.existsSync(hygiene)) fails.push(`hygiene sweep not found: ${hygiene}`);
  else {
    const r = cp.spawnSync(process.execPath, [hygiene, ROOT], { encoding: 'utf8' });
    if (r.status !== 0) fails.push(`public-hygiene: exit ${r.status}\n${(r.stderr || '').split('\n').slice(0, 20).join('\n')}`);
  }
}

// The generator's own knobs never carry the engine's `AGSC_` prefix: the engine reads every
// `AGSC_*` name of the process environment as a configuration override (AGSC-01-37, AGSC-09-09)
// and refuses one it does not know (`AGSC-E004`), and every script here hands its environment to
// the engine's child processes. So a knob of this repository — in a script or in a workflow's
// `env:` block — is named `SITE_*` (or `ENGINE_REF`), never `AGSC_*`.
{
  const scripts = fs.readdirSync(path.join(ROOT, 'scripts')).filter(f => f.endsWith('.js')).map(f => path.join(ROOT, 'scripts', f));
  for (const f of scripts) {
    const hit = /process\.env\.(AGSC_[A-Z0-9_]+)/.exec(fs.readFileSync(f, 'utf8'));
    ok(hit === null, `${path.relative(ROOT, f)} reads ${hit && hit[1]}: a knob of this repository must not carry the engine's AGSC_ prefix (the engine refuses it as an unknown override, AGSC-E004)`);
  }
  const workflows = path.join(ROOT, '.github', 'workflows');
  for (const f of fs.existsSync(workflows) ? fs.readdirSync(workflows).filter(f => /\.ya?ml$/.test(f)) : []) {
    const hit = /^\s+(AGSC_[A-Z0-9_]+):\s/m.exec(fs.readFileSync(path.join(workflows, f), 'utf8'));
    ok(hit === null, `.github/workflows/${f} sets ${hit && hit[1]} in an env block: the engine's child processes would refuse it (AGSC-E004)`);
  }
}

const files = fs.existsSync(WWW) ? walk(WWW) : [];
const exists = p => fs.existsSync(p) && fs.statSync(p).isFile();
const targetFile = urlPath => {
  const p = decodeURIComponent(urlPath);
  const f = path.join(WWW, p);
  if (p.endsWith('/')) return exists(path.join(f, 'index.html')) ? path.join(f, 'index.html') : null;
  return exists(f) ? f : null;
};
// (3b) the versioned copies of the vocabulary (AGSC-05-25, AGSC-00-16). A published versioned
// copy never changes, and it stays served when a later version is published beside it. Each
// frozen copy is a static input of this site, static/ns/<version>/ (static/README.md), holding
// exactly the four files below, each with the SHA-256 recorded here: the bytes as published. The
// build serves those bytes under /ns/<version>/ with a page of its own, and serves the copy of the
// current version, the one /ns/agsc.ttl names in owl:versionInfo, beside them.
const FROZEN_NS = {
  '1.0.0-draft.1': {
    'agsc.nt': 'e9e04762e90d609207b4a85bacd8c5dc3b257b93f2eee26b0dfcf7b8a68ab2f4',
    'agsc.rdf': 'b79f375dfc15915ce8f10236895233bc444640628ba89871ddf6d0e285e433fd',
    'agsc.ttl': '45c958a3f1adc7e51de1bfd5c83b1a19c4e3a7431611ffcbe45c54c2e3eab87a',
    'context.jsonld': '8f25f2d250db309a2462c62a24e776bfb450252efce631b17832f52658438030',
  },
};
const VOCABULARY_FILES = ['agsc.nt', 'agsc.rdf', 'agsc.ttl', 'context.jsonld'];
let currentVocabulary = null;
{
  const sha = b => require('crypto').createHash('sha256').update(b).digest('hex');
  const staticNs = path.join(ROOT, 'static', 'ns');
  for (const v of fs.existsSync(staticNs) ? fs.readdirSync(staticNs).sort() : []) {
    ok(Object.hasOwn(FROZEN_NS, v), `static/ns/${v}/ is a frozen vocabulary copy whose SHA-256 values scripts/check.js does not record`);
  }
  for (const [v, want] of Object.entries(FROZEN_NS)) {
    const dir = path.join(staticNs, v);
    const held = fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
    ok(held.join(', ') === VOCABULARY_FILES.join(', '), `static/ns/${v}/ must hold exactly ${VOCABULARY_FILES.join(', ')}; it holds ${held.join(', ') || 'nothing'} (AGSC-05-25)`);
    for (const f of VOCABULARY_FILES) {
      const src = path.join(dir, f), out = path.join(WWW, 'ns', v, f);
      if (exists(src)) ok(sha(fs.readFileSync(src)) === want[f], `static/ns/${v}/${f} is not the copy as published: its SHA-256 is not ${want[f]}; a published versioned copy never changes (AGSC-05-25, AGSC-00-16)`);
      ok(exists(out) && sha(fs.readFileSync(out)) === want[f], `/ns/${v}/${f} is missing or is not the frozen copy (AGSC-05-25, AGSC-00-16)`);
    }
    ok(exists(path.join(WWW, 'ns', v, 'index.html')), `missing route: /ns/${v}/ (AGSC-05-25)`);
  }
  const top = path.join(WWW, 'ns', 'agsc.ttl');
  const m = exists(top) ? /owl:versionInfo\s+"([^"]+)"/.exec(fs.readFileSync(top, 'utf8')) : null;
  ok(m !== null, '/ns/agsc.ttl is missing or declares no owl:versionInfo (AGSC-05-25)');
  if (m) {
    currentVocabulary = m[1];
    for (const f of VOCABULARY_FILES) {
      const copy = path.join(WWW, 'ns', currentVocabulary, f);
      ok(exists(copy) && fs.readFileSync(copy).equals(fs.readFileSync(path.join(WWW, 'ns', f))), `/ns/${currentVocabulary}/${f} is missing or differs from /ns/${f}: the copy of the current version is the same bytes (AGSC-05-25, AGSC-06-32)`);
    }
    ok(exists(path.join(WWW, 'ns', currentVocabulary, 'index.html')), `missing route: /ns/${currentVocabulary}/ (AGSC-05-25)`);
  }
}
// (4a) the page each rule lives on. A section over the page budget is published in parts
// (AGSC-06-21; scripts/build.js, "the layout of the specification pages"), so the page a rule
// lives on is a fact of the build, not of the section's name. Every active rule of spec/ has
// exactly one anchor under /specs/, and every link to a rule id must land on that page.
const engineList = dir => (SPEC_SOURCE === 'tag'
  ? cp.execFileSync('git', ['-C', ENGINE, 'ls-tree', '--name-only', `${SPEC_TAG}:${dir}`], { encoding: 'utf8' }).split('\n')
  : fs.readdirSync(path.join(ENGINE, dir))).filter(Boolean).sort();
const RULE_PAGE = new Map(); // rule id or error code -> the built page that anchors it
const RULE_ID = /^AGSC-(?:\d{2}-\d{2,3}[a-z]?|E\d{3})$/;
let retiredAnchors = 0;
for (const f of files.filter(f => /^specs\/.*index\.html$/.test(rel(f)))) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/<(?:li|tr) id="(AGSC-(?:\d{2}-\d{2,3}[a-z]?|E\d{3}))"(?: class="rule-item( retired)?")?>/g)) {
    if (RULE_PAGE.has(m[1])) fails.push(`${rel(f)}: ${m[1]} is anchored a second time (first on ${rel(RULE_PAGE.get(m[1]))})`);
    else RULE_PAGE.set(m[1], f);
    if (m[2]) retiredAnchors++;
  }
}
const activeRules = new Set(), retiredRules = new Set();
for (const f of engineList('spec').filter(f => /^\d{2}-[a-z0-9-]+\.md$/.test(f)))
  for (const m of engineFile(`spec/${f}`).matchAll(/^\s*- \*\*(AGSC-\d{2}-\d{2,3}[a-z]?)\*\*(\s*\*\((?:retired at |reserved:))?/gm)) (m[2] ? retiredRules : activeRules).add(m[1]);
for (const id of activeRules) ok(RULE_PAGE.has(id), `active rule ${id} has no anchor under /specs/`);
for (const [id, f] of RULE_PAGE) if (!id.startsWith('AGSC-E')) ok(activeRules.has(id) || retiredRules.has(id), `${rel(f)}: anchors ${id}, which spec/ does not define`);
const activeAnchors = [...RULE_PAGE.keys()].filter(id => activeRules.has(id)).length;
const specPageCount = new Set([...RULE_PAGE.values()]).size;
/** The page a rule link must land on, as a route, for a message. */
const routeOf = f => '/' + rel(path.dirname(f)) + '/';
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
  for (const m of h.matchAll(/<script(?![^>]*type="application\/ld\+json")[^>]*>/g)) if (!ALLOWED_SCRIPTS.has(m[0])) E(`script other than the same-origin search and page-tool scripts: ${m[0]} (AGSC-06-05, CSP)`);
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
    else if (frag !== undefined && RULE_ID.test(frag) && RULE_PAGE.has(frag) && RULE_PAGE.get(frag) !== tf) E(`rule link lands on the wrong page: ${href} — ${frag} is on ${routeOf(RULE_PAGE.get(frag))} (AGSC-06-21 parts)`);
  }
}

// (5) machine files
for (const f of files) {
  const r = rel(f), b = fs.readFileSync(f);
  // The one binary file: the touch icon, copied from assets/ as it is (scripts/check-content.js checks its size).
  if (r === 'apple-touch-icon.png') { ok(b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')), `${r}: not a PNG`); continue; }
  if (/\.(png|jpe?g|gif|webp|ico|woff2?)$/.test(r)) { fails.push(`${r}: binary asset not expected in site v0`); continue; }
  const s = b.toString('utf8');
  if (!Buffer.from(s, 'utf8').equals(b)) { fails.push(`${r}: not UTF-8`); continue; }
  if (s.normalize('NFC') !== s) fails.push(`${r}: not NFC (AGSC-E604)`);
  if (s.includes('\r') || !s.endsWith('\n') || s.endsWith('\n\n')) fails.push(`${r}: LF only, exactly one trailing LF`);
  if (/\.(json|jsonld)$/.test(r) || r === '.well-known/knowledge-linkset') { try { JSON.parse(s); } catch (e) { fails.push(`${r}: invalid JSON: ${e.message}`); } }
  // (4a) for the machine files too — an item's `sources[].resource` in the graph, a machine
  // view, the search index — a rule link names the page that carries the rule.
  if (!r.endsWith('.html')) for (const m of s.matchAll(/(?:https:\/\/agenticsystemcore\.com)?\/specs\/([a-z0-9/-]+\/)#(AGSC-(?:\d{2}-\d{2,3}[a-z]?|E\d{3}))\b/g)) {
    const want = RULE_PAGE.get(m[2]);
    if (!want) fails.push(`${r}: links ${m[2]}, which no specification page anchors`);
    else if (want !== targetFile(`/specs/${m[1]}`)) fails.push(`${r}: rule link lands on the wrong page: ${m[0]} — ${m[2]} is on ${routeOf(want)} (AGSC-06-21 parts)`);
  }
  // The tagged requirements document names two forbidden framings in order to forbid them (NFR-12); that one quoted sentence is allowed.
  const t = ['no Web4/crypto framing, book or &quot;companion&quot; strings', 'no Web4/crypto framing, book or \\"companion\\" strings', 'with no reading order imposed', 'no &quot;start here&quot; link and no imposed reading order', 'no \\"start here\\" link and no imposed reading order'].reduce((x, q) => x.split(q).join(''), s);
  if (!r.startsWith('specs/') && r !== 'assets/search-site.json' && new RegExp(['wiley', 'companion', 'chapter \\d', 'reading order', 'discovery' + '-product', '05-' + 'WILEY'].join('|'), 'i').test(t)) fails.push(`${r}: forbidden string (AGSC-06-03 / private record)`);
  if (/\bWeb4\b|W3C (?:standard|Recommendation) for AgenticSystemCore/i.test(t)) fails.push(`${r}: forbidden claim`);
  if (/andrei\.besleaga\.nicolae@|abnmaster@|@gmail\.com/i.test(s)) fails.push(`${r}: the operator's e-mail address is published`);
}
// AGSC-06-21: ≤1 MB per index document (decimal), sharded above 500 items.
const searchJson = path.join(WWW, 'search.json');
ok(exists(searchJson) && fs.statSync(searchJson).size <= 1000 * 1000, 'search.json missing or over the 1 MB index-document budget (AGSC-06-21)');
const headers = exists(path.join(WWW, '_headers')) ? fs.readFileSync(path.join(WWW, '_headers'), 'utf8') : '';
for (const need of [
  '/pages/*.md\n  Content-Type: text/markdown; charset=utf-8; variant=GFM',
  '/pages/*.jsonld\n  Content-Type: application/ld+json; charset=utf-8',
  '/chunks.jsonl\n  Content-Type: application/jsonl; charset=utf-8',
  '/ledger.jsonl\n  Content-Type: application/jsonl\n  Cache-Control: no-cache',
  '/ns/*.ttl\n  Content-Type: text/turtle; charset=utf-8',
  '/ns/*.jsonld\n  Content-Type: application/ld+json; charset=utf-8',
  '/ns/*.rdf\n  Content-Type: application/rdf+xml; charset=utf-8',
  '/ns/*.nt\n  Content-Type: application/n-triples; charset=utf-8',
  '/ns/schema/*.json\n  Content-Type: application/json; charset=utf-8',
  '/llms.txt\n  Content-Type: text/plain; charset=utf-8',
  '/llms-full.txt\n  Content-Type: text/plain; charset=utf-8',
  '/graph.nq\n  Content-Type: application/n-quads; charset=utf-8',
  '/graph.ttl\n  Content-Type: text/turtle; charset=utf-8',
  '/now.md\n  Content-Type: text/markdown; charset=utf-8; variant=GFM\n  Cache-Control: no-cache',
  '/skills/*.md\n  Content-Type: text/markdown; charset=utf-8; variant=GFM',
  '/exports/chunks-index.toon\n  Content-Type: text/plain; charset=utf-8',
  '/exports/llms-ctx.txt\n  Content-Type: text/plain; charset=utf-8',
  '/agent-skill/agentic-system-core/SKILL.md\n  Content-Type: text/markdown; charset=utf-8; variant=GFM',
  'Content-Type: application/linkset+json; profile="https://w3id.org/agentic-system-core/profile/agentic-knowledge"',
  'Link: <https://w3id.org/agentic-system-core/profile/agentic-knowledge>; rel="profile"',
  "Content-Security-Policy: default-src 'none'; script-src 'self'",
  'Access-Control-Allow-Origin: *', 'Access-Control-Expose-Headers: Link, ETag, Content-Type',
  'Link: </.well-known/knowledge-linkset>; rel="describedby"; type="application/linkset+json"',
]) ok(headers.includes(need), `_headers lacks: ${need} (AGSC-06-17, AGSC-11-03, AGSC-11-05)`);
ok(!/Access-Control-Allow-Credentials/i.test(headers), '_headers must not allow credentials (AGSC-11-03)');
// One block per address: Cloudflare Pages keeps only the later of two blocks for the same
// address, so a repeated address silently drops headers (it once dropped AGSC-11-03's).
const headerBlocks = new Map();
for (const block of headers.split(/\n\n+/)) {
  const lines = block.split('\n').filter(l => l && !l.startsWith('#'));
  if (!lines.length) continue;
  if (headerBlocks.has(lines[0])) fails.push(`_headers: the address ${lines[0]} has two blocks; the host keeps only the later one`);
  headerBlocks.set(lines[0], lines.slice(1).map(l => l.trim()));
}
for (const route of ['/.well-known/knowledge-linkset', '/graph.jsonld', '/graph.nq', '/graph.ttl', '/llms.txt', '/llms-full.txt', '/search.json', '/chunks.jsonl', '/ledger.jsonl', '/now.md', '/exports/chunks-index.toon', '/exports/llms-ctx.txt']) {
  const lines = headerBlocks.get(route) || [];
  ok(lines.includes('Access-Control-Expose-Headers: Link, ETag, Content-Type') && lines.includes('Access-Control-Allow-Origin: *'), `_headers: ${route} lacks the cross-origin headers in its own block (AGSC-11-03)`);
}
// A pattern that also matches a page would give that page a machine content type (it once served /exports/ as text).
for (const route of headerBlocks.keys()) if (/\/\*$/.test(route) && route !== '/*' && (headerBlocks.get(route) || []).some(l => /^Content-Type:/.test(l))) fails.push(`_headers: ${route} sets a Content-Type on a pattern that also matches the folder's index page`);
const redirects = exists(path.join(WWW, '_redirects')) ? fs.readFileSync(path.join(WWW, '_redirects'), 'utf8') : '';
ok(/^\/\.well-known\/agentic-knowledge \/\.well-known\/knowledge-linkset 301$/m.test(redirects), '_redirects lacks the 0.0.x alias (AGSC-06-17)');
const sitemap = exists(path.join(WWW, 'sitemap.xml')) ? fs.readFileSync(path.join(WWW, 'sitemap.xml'), 'utf8') : '';
const locs = [...sitemap.matchAll(/<loc>https:\/\/agenticsystemcore\.com(\/[^<]*)<\/loc>/g)].map(m => m[1]);
ok(locs.length > 0 && locs.join('\n') === [...locs].sort().join('\n'), 'sitemap empty or not ordered by URL (AGSC-06-19)');
for (const l of locs) ok(targetFile(l), `sitemap URL has no page: ${l}`);
for (const need of ['.well-known/knowledge-linkset', '.well-known/security.txt', '.well-known/tdmrep.json', 'graph.jsonld', 'llms.txt', 'llms-full.txt', 'search.json', 'assets/search-site.json', 'assets/search.js', 'robots.txt', '404.html', 'ns/context.jsonld', 'ns/agsc.ttl', 'specs/agentic-knowledge/index.html', 'specs/mcp/index.html', 'legal/index.html', 'docs/index.html', 'docs/introduction/index.html', 'docs/modes/index.html', 'docs/requirements/index.html', 'docs/standards/index.html', 'docs/compliance/index.html', 'docs/status/index.html', 'search/index.html',
  // AGSC-06-01/06-02/09-16: the page-tool route family.
  'compose/index.html', 'compose/agsc-core.js', 'compose/agsc-page-tools.js', 'compose/agsc-compose.js', 'compose/webmcp.js',
  // the surfaces the engine now builds for this node.
  'chunks.jsonl', 'graph.nq', 'graph.ttl', 'now.md', 'now/index.html', 'skills/index.json', 'skills/index.html',
  'tags/index.html', 'tags/vocabulary/index.html', 'exports/index.html',
  'exports/chunks-index.toon', 'exports/llms-ctx.txt',
  // the agent skill and its guide page
  'agent-skill/agentic-system-core/SKILL.md', 'docs/agent-skill/index.html'])
  ok(exists(path.join(WWW, need)), `missing route: /${need}`);
// The scenarios (AGSC-06-21): /docs/scenarios/ carries the coverage table and one link per feature
// file of the engine, and each feature file is a page of its own, /docs/scenarios/<file stem>/, so
// that no page grows past the budget as scenarios are added.
{
  const index = path.join(WWW, 'docs/scenarios/index.html');
  const indexHtml = exists(index) ? fs.readFileSync(index, 'utf8') : '';
  for (const f of engineList('features').filter(x => x.endsWith('.feature'))) {
    const stem = f.slice(0, -'.feature'.length), page = path.join(WWW, 'docs/scenarios', stem, 'index.html');
    ok(exists(page), `missing route: /docs/scenarios/${stem}/ (the page of features/${f})`);
    ok(indexHtml.includes(`href="/docs/scenarios/${stem}/"`), `/docs/scenarios/ does not link to /docs/scenarios/${stem}/`);
    if (exists(page)) ok((fs.readFileSync(page, 'utf8').match(/<pre tabindex="0" class="feature" data-lang="gherkin">/g) || []).length === 1, `/docs/scenarios/${stem}/ must carry exactly one feature file`);
  }
  ok(!indexHtml.includes('class="feature"'), '/docs/scenarios/ must link to the feature files, not carry them');
}
// (7) the page tools: their inputs, their declaration, and the tools themselves RUN.
{
  const index = exists(searchJson) ? JSON.parse(fs.readFileSync(searchJson, 'utf8')) : { docs: [] };
  ok(Array.isArray(index.docs) && index.docs.length > 0 && index.terms && typeof index.terms === 'object',
    'search.json is not the engine-shaped index {docs, terms} the page tools read (AGSC-06-16)');
  for (const d of index.docs || []) {
    ok(exists(path.join(WWW, 'pages', `${d.slug}.md`)), `missing route: /pages/${d.slug}.md (AGSC-06-02)`);
    ok(exists(path.join(WWW, 'pages', `${d.slug}.jsonld`)), `missing route: /pages/${d.slug}.jsonld (AGSC-06-02)`);
  }
  for (const f of files.filter(x => /^pages\//.test(rel(x)) && x.endsWith('.md'))) {
    ok(fs.readFileSync(f, 'utf8').startsWith('---\n'), `${rel(f)}: the Markdown machine view must begin with the frontmatter block (AGSC-05-07)`);
  }
  // AGSC-11-16/11-19: /compose/ is emitted, so the `webmcp` surface must be DECLARED.
  const linkset = JSON.parse(fs.readFileSync(path.join(WWW, '.well-known', 'knowledge-linkset'), 'utf8'));
  const surfaces = (linkset.linkset || [])[0]['https://w3id.org/agentic-system-core/rel#surface'] || [];
  const webmcp = surfaces.find(x => (x['agsc-surface'] || [])[0] === 'webmcp');
  ok(webmcp !== undefined, 'the discovery document declares no `webmcp` surface although /compose/ is emitted (AGSC-11-19)');
  if (webmcp) {
    ok((webmcp['agsc-access'] || [])[0] === 'consent', 'the `webmcp` surface must declare the access class `consent` (AGSC-11-16)');
    ok(/^\d{4}-\d{2}-\d{2}$/.test((webmcp['agsc-surface-version'] || [])[0] || ''), 'the `webmcp` surface must declare the Draft Community Group Report date it targets (AGSC-11-16)');
    ok(String(webmcp.href).endsWith('/compose/'), `the webmcp surface points at ${webmcp.href}`);
  }
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'page-tools-check.js'), '--out', WWW], { encoding: 'utf8' });
  ok(r.status === 0, `page-tools-check failed:\n${r.stdout}${r.stderr}`);
}

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

// (8) the content gate: sentences and routes that must stay true for the version this site publishes.
for (const f of require('./check-content.js').check(WWW)) fails.push(`content: ${f}`);

if (fails.length) { process.stderr.write(fails.map(f => `FAIL ${f}`).join('\n') + `\ncheck: ${fails.length} failure(s)\n`); process.exit(1); }
process.stdout.write(`check: pass — ${files.length} files, ${files.filter(f => f.endsWith('.html')).length} pages, reproducible, llms vectors, gen-ns --check on /ns/ (spec from ${SPEC_SOURCE === 'tag' ? `tag ${SPEC_TAG}` : 'the working tree'}), content, vocabulary copies ${[...Object.keys(FROZEN_NS), currentVocabulary].filter((v, i, a) => a.indexOf(v) === i).map(v => `/ns/${v}/`).join(' and ')}${Object.keys(FROZEN_NS).length ? ` (${Object.keys(FROZEN_NS).join(', ')} frozen by SHA-256)` : ''}, validate-wellknown levels 0 and 2 with every declared digest verified, links and fragments, ${activeAnchors} active rule anchors (${activeRules.size} in spec/) and ${retiredAnchors} reserved on ${specPageCount} specification pages with every rule link on its page, headers, contrast, public hygiene\n`);
