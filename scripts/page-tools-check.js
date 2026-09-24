#!/usr/bin/env node
// The seven in-page tools, PROVED against the artefact this site actually ships (AGSC-09-16).
//
//   node scripts/page-tools-check.js [--out <dir>] [--json]
//
// It never starts a browser and never touches the network. The built output directory is read from
// disk, the emitted scripts are run inside a `node:vm` context that holds the language, a fake
// `document.modelContext` and a `fetch` served from the built site's own file map — and nothing
// else: no `require`, no `process`, no real network. A route the site did not publish answers
// `ok: false`, and any attempt to reach a host fails the run.
//
// What it asserts:
//   1. the four /compose/ scripts are BYTE-IDENTICAL to the engine's own emitters (no second
//      implementation of any tool lives in this repository), and their SHA-256 is recorded;
//   2. with `document.modelContext`, seven tools register with the names, argument names and the
//      three WebMCP annotations the specification fixes;
//   3. every tool answers over this site's published routes: search finds every item, read returns
//      the item, links follows the authored connections, ask cites, compose composes this node's
//      own concepts and procedures, propose and remember return prepared text and write nothing;
//   4. the asynchronous path a real browser takes — the corpus loaded by fetch — reaches the same
//      answers, and touches only published same-origin routes;
//   5. a browser WITHOUT WebMCP registers nothing, raises nothing and keeps a working page.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('node:vm'), crypto = require('crypto'), cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ENGINE = path.resolve(ROOT, process.env.AGSC_ENGINE || '../agentic-system-core');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'agsc.config.json'), 'utf8'));
const OUT = path.resolve(ROOT, (() => {
  const i = process.argv.indexOf('--out');
  return i > 0 ? process.argv[i + 1] : (CONFIG.build || {}).out || 'www';
})());
const JSON_OUT = process.argv.includes('--json');

const fails = [];
const notes = [];
const ok = (c, m) => { if (!c) fails.push(m); return c; };
const sha256 = s => crypto.createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');

// ------------------------------------------------------------------ the built site, as routes
const walk = d => fs.readdirSync(d, { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]).sort();
if (!fs.existsSync(OUT)) { process.stderr.write(`page-tools-check: no built output at ${OUT} — run node scripts/build.js\n`); process.exit(1); }
const files = new Map();
for (const f of walk(OUT)) files.set('/' + path.relative(OUT, f).split(path.sep).join('/'), fs.readFileSync(f, 'utf8'));
// A directory route is its index.html, exactly as a static host serves it.
for (const [route, body] of [...files]) if (route.endsWith('/index.html')) files.set(route.slice(0, -'index.html'.length), body);

// ------------------------------------------------------------------ (1) the engine's own bytes
const engineModule = p => require(path.join(ENGINE, p));
const engineBrowser = engineModule('src/composition/browser.js');
const enginePageTools = engineModule('src/distribution/page-tools.js');
const engineWebmcp = engineModule('src/distribution/webmcp.js');
const engineComposePage = engineModule('src/distribution/compose-page.js');
const engineSurfaces = engineModule('src/boundary/surfaces.js');
const SPEC_VERSION = CONFIG.spec_version;
const BUNDLE_ID = (CONFIG.bundle || {}).id;
const LICENSE_PROSE = (CONFIG.bundle || {}).license_prose;
const engineGit = (...a) => { try { return cp.execFileSync('git', ['-C', ENGINE, ...a], { encoding: 'utf8' }).trim(); } catch { return 'unknown'; } };
const ENGINE_COMMIT = engineGit('rev-parse', 'HEAD');
const ENGINE_DESCRIBE = engineGit('describe', '--tags', '--always', '--dirty');
const ENGINE_VERSION = (() => { try { return JSON.parse(fs.readFileSync(path.join(ENGINE, 'package.json'), 'utf8')).version; } catch { return 'unknown'; } })();

const EXPECTED = {
  '/compose/agsc-core.js': engineBrowser.bundle({ specVersion: SPEC_VERSION }),
  '/compose/agsc-page-tools.js': enginePageTools.bundle({ bundleId: BUNDLE_ID, specVersion: SPEC_VERSION }),
  '/compose/agsc-compose.js': engineComposePage.controller({ licenseProse: LICENSE_PROSE, specVersion: SPEC_VERSION }),
  '/compose/webmcp.js': engineWebmcp.script(),
};
const digests = {};
for (const [route, expected] of Object.entries(EXPECTED)) {
  const served = files.get(route);
  ok(served !== undefined, `${route} is not published`);
  ok(served === expected, `${route} is not the engine's emitted bytes — this repository must hold no second implementation`);
  digests[route] = { bytes: Buffer.byteLength(served || ''), sha256: sha256(served || '') };
}
// A script anywhere else would be a second implementation by another name.
for (const route of [...files.keys()]) {
  if (route.endsWith('.js') && !route.startsWith('/compose/') && route !== '/assets/search.js' && route !== '/assets/theme.js') {
    fails.push(`${route}: an unexpected script — the page tools are the engine's four /compose/ files only`);
  }
}

// ------------------------------------------------------------------ the fake browser
/** The smallest DOM the emitted scripts touch. `modelContext` is present only when asked for. */
function fakeDocument(withModelContext) {
  const nodes = new Map();
  const make = id => {
    const node = {
      checked: false, children: [], disabled: false, id, listeners: [],
      addEventListener(t, h) { node.listeners.push([t, h]); },
      appendChild(c) { node.children.push(c); return c; },
      set textContent(v) { node.text = String(v); node.children.length = 0; },
      get textContent() { return node.text === undefined ? '' : node.text; },
    };
    return node;
  };
  for (const id of ['items', 'validity', 'verdict', 'explanations', 'conflicts', 'download', 'files']) nodes.set(id, make(id));
  const registered = [];
  const document = { createElement: t => Object.assign(make(''), { tag: t }), getElementById: id => (nodes.has(id) ? nodes.get(id) : null), nodes };
  if (withModelContext) document.modelContext = { registerTool: tool => { registered.push(tool); return Promise.resolve(); } };
  return { document, registered };
}

/**
 * Open a page in a throwaway realm. `assets` is the script list the page loads;
 * `network` is 'trap' (any fetch is a failure — the corpus is installed synchronously) or 'files'
 * (fetch is served from the built site's own routes, which is the path a real browser takes).
 */
function openPage({ assets, modelContext = true, network = 'trap' }) {
  const { document, registered } = fakeDocument(modelContext);
  const fetched = [];
  const refused = [];
  let networkCalls = 0;
  const trap = () => { networkCalls += 1; throw new Error('the page tools must perform no network call (AGSC-09-16)'); };
  const consoleCalls = [];
  const recorder = name => (...args) => consoleCalls.push([name, args.map(String).join(' ')]);
  const sandbox = {
    Blob: class { constructor(parts, options) { this.parts = parts; this.options = options; } },
    Promise, TextEncoder, setTimeout,
    URL: { createObjectURL: b => `blob:${b.parts.length}` },
    console: { debug: recorder('debug'), error: recorder('error'), info: recorder('info'), log: recorder('log'), warn: recorder('warn') },
    crypto: require('crypto').webcrypto,
    document,
    location: { origin: 'https://agenticsystemcore.com', search: '' },
    navigator: { sendBeacon: trap },
    XMLHttpRequest: trap,
  };
  if (network === 'files') {
    sandbox.fetch = url => {
      const route = String(url);
      if (/^[a-z]+:/i.test(route) || route.startsWith('//')) { refused.push(route); return Promise.reject(new Error('not same-origin')); }
      fetched.push(route);
      const body = files.get(route);
      if (body === undefined) return Promise.resolve({ ok: false, json: () => Promise.reject(new Error('404')), text: () => Promise.resolve('') });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(body)), text: () => Promise.resolve(body) });
    };
  } else {
    sandbox.fetch = trap;
    sandbox.AGSC_TOOLS = null; // stands the bootstrap down; the corpus is installed below
  }
  const context = vm.createContext(sandbox);
  for (const asset of assets) {
    const text = files.get(asset);
    if (text === undefined) { fails.push(`${asset}: not published`); continue; }
    vm.runInContext(text, context, { filename: asset });
  }
  return { consoleCalls, context, document, fetched, networkCalls, refused, registered, sandbox };
}

/** The corpus assembled synchronously from the built site's own bytes. */
function installCorpus(page) {
  const sources = {};
  for (const [route, text] of files) sources[route] = text;
  const api = page.sandbox.AGSC_PAGE_TOOLS;
  return api.install(api.pageCorpus(sources, { bundleId: api.BUNDLE_ID }), page.sandbox.AGSC_CORE);
}

const plain = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

// ------------------------------------------------------------------ the site's own item set
const ITEMS = [...files.keys()].filter(r => r.startsWith('/pages/') && r.endsWith('.md'))
  .map(r => r.slice('/pages/'.length, -'.md'.length)).sort();
ok(ITEMS.length > 0, 'no /pages/<slug>.md was published — the page tools would read an empty node');

// ------------------------------------------------------------------ (2) registration
const ITEM_PAGE_ASSETS = engineComposePage.PAGE_TOOL_SCRIPTS;
const COMPOSE_ASSETS = engineComposePage.ASSETS.map(n => `/compose/${n}`);

const item = openPage({ assets: ITEM_PAGE_ASSETS });
const toolset = installCorpus(item);
// webmcp.js ran before the corpus was installed, exactly as in a browser; re-run it so the
// registration is observed over the loaded implementation as well as before it.
vm.runInContext(files.get('/compose/webmcp.js'), item.context, { filename: 'webmcp.js' });
const registered = item.registered.slice(item.registered.length / 2);
const SEVEN = engineSurfaces.TOOL_NAMES ? [...engineSurfaces.TOOL_NAMES] : ['ask', 'compose', 'links', 'propose', 'read', 'remember', 'search'];
ok(registered.length === 7, `${registered.length} tools registered, expected seven (AGSC-09-13)`);
ok(JSON.stringify(registered.map(t => t.name).sort()) === JSON.stringify([...SEVEN].sort()),
  `the registered tool names are ${JSON.stringify(registered.map(t => t.name).sort())}`);
for (const tool of registered) {
  ok(/^[A-Za-z0-9_.-]{1,128}$/.test(tool.name), `${tool.name}: not a WebMCP tool name`);
  ok(typeof tool.description === 'string' && tool.description.length > 10, `${tool.name}: no description for an agent to read`);
  ok(typeof tool.execute === 'function', `${tool.name}: no execute callback`);
  ok(tool.inputSchema && tool.inputSchema.type === 'object', `${tool.name}: inputSchema is not an object schema`);
  const annotations = plain(tool.annotations) || {};
  for (const key of Object.keys(annotations)) {
    ok(['readOnlyHint', 'untrustedContentHint', 'consequentialHint'].includes(key), `${tool.name}: unknown annotation ${key}`);
  }
  const expected = engineSurfaces.WEBMCP_ANNOTATIONS[tool.name];
  ok(JSON.stringify(annotations) === JSON.stringify(plain(expected)),
    `${tool.name}: annotations ${JSON.stringify(annotations)} != ${JSON.stringify(plain(expected))} (AGSC-11-18)`);
}
ok(item.networkCalls === 0, `the page made ${item.networkCalls} network call(s) while registering`);
// The registration script reads document.modelContext, never the deprecated navigator form.
const registration = files.get('/compose/webmcp.js') || '';
ok(registration.includes('document.modelContext'), 'webmcp.js does not read document.modelContext');
ok(!registration.includes('navigator.modelContext'), 'webmcp.js reads the deprecated navigator.modelContext');
ok(/typeof context\.registerTool !== 'function'/.test(registration),
  'webmcp.js does not feature-detect the registerTool METHOD (a property check is not enough)');

// ------------------------------------------------------------------ (3) every tool answers
const call = (name, args) => plain(toolset.call(name, args));
const envelope = (r, tool) => {
  ok(r && r.trust === 'untrusted', `${tool}: trust is not fixed at untrusted (AGSC-08-18)`);
  ok(r && typeof r.license === 'string' && r.license !== '', `${tool}: no Content Use Terms in the envelope`);
  ok(r && r.source === tool, `${tool}: envelope names ${r && r.source}`);
  return r;
};

// search — every published item is findable by its own title
const found = new Set();
for (const slug of ITEMS) {
  const md = files.get(`/pages/${slug}.md`) || '';
  const title = (/^title: (.*)$/m.exec(md) || [])[1] || slug;
  const r = envelope(call('search', { query: title.replace(/^"|"$/g, '') }), 'search');
  ok(r.type === 'items', `search("${title}"): type ${r.type}`);
  if ((r.body.hits || []).some(h => h.slug === slug)) found.add(slug);
}
ok(found.size === ITEMS.length, `search found ${found.size} of ${ITEMS.length} items by title: missing ${ITEMS.filter(s => !found.has(s)).join(', ')}`);
const emptySearch = call('search', { query: 'zzzznothingmatchesthis' });
ok(emptySearch.type === 'items' && emptySearch.body.hits.length === 0, 'search over a word nothing carries did not return an empty hit list');

// read — the item comes back whole, and its IRI is this node's
for (const slug of ITEMS) {
  const r = envelope(call('read', { slug }), 'read');
  ok(r.type === 'item', `read(${slug}): type ${r.type}`);
  ok(r.body.slug === slug, `read(${slug}): returned ${r.body.slug}`);
  ok(typeof r.body.frontmatter.title === 'string' && r.body.frontmatter.title !== '', `read(${slug}): no title in the frontmatter`);
  ok(typeof r.body.frontmatter.type === 'string', `read(${slug}): no type in the frontmatter`);
  ok(typeof r.body.body === 'string' && r.body.body.length > 100, `read(${slug}): body is ${String(r.body.body).length} characters`);
  ok(String(r.body.iri).startsWith(CONFIG.site.base), `read(${slug}): IRI ${r.body.iri} is not under this node's base`);
}
const missing = call('read', { slug: 'no-such-item-on-this-node' });
ok(missing.type === 'error' && missing.body.code === 'AGSC-E301', `read of an unknown slug answered ${JSON.stringify(missing.body)}`);

// links — an item is resolved by slug, by this node's own memory:// IRI and by its https IRI,
// and the two refusals answer their registered codes. This node authors no Link key and no inline
// item reference today, so every edge list is empty and that is a property of the CONTENT, not of
// the tool: the assertion is on the resolution, and the empty lists are counted and reported.
let edgeTotal = 0;
for (const slug of ITEMS) {
  const r = envelope(call('links', { slug }), 'links');
  ok(r.type === 'links', `links(${slug}): type ${r.type}`);
  ok(r.body.slug === slug, `links(${slug}): answered for ${r.body.slug}`);
  ok(Array.isArray(r.body.edges), `links(${slug}): no edge list`);
  edgeTotal += r.body.edges.length;
  const item = plain(call('read', { slug }));
  const byHttps = call('links', { iri: item.body.iri });
  ok(byHttps.type === 'links' && byHttps.body.slug === slug, `links by the https IRI of ${slug} answered ${JSON.stringify(byHttps.body).slice(0, 120)}`);
  const byMemory = call('links', { iri: `memory://${BUNDLE_ID}/${slug}` });
  ok(byMemory.type === 'links' && byMemory.body.slug === slug, `links by the memory:// IRI of ${slug} answered ${JSON.stringify(byMemory.body).slice(0, 120)}`);
}
const foreign = call('links', { iri: 'memory://some-other-node/whatever' });
ok(foreign.type === 'error' && foreign.body.code === 'AGSC-E309', `links on a foreign memory:// IRI answered ${JSON.stringify(foreign.body)}`);
const noSuchLink = call('links', { slug: 'no-such-item-on-this-node' });
ok(noSuchLink.type === 'error' && noSuchLink.body.code === 'AGSC-E301', `links on an unknown slug answered ${JSON.stringify(noSuchLink.body)}`);
notes.push(`links resolved ${ITEMS.length} items by slug, by https IRI and by memory:// IRI; ${edgeTotal} edge(s) authored across the node`);

// ask — an answer with at least one cited item address, and the fixed refusal otherwise
const asked = envelope(call('ask', { question: 'What is a Bundle?' }), 'ask');
ok(asked.type === 'answer', `ask: type ${asked.type}`);
ok(asked.citations.length >= 1, 'ask answered with no citation (AGSC-09-14a)');
ok(asked.citations.every(c => String(c).startsWith(CONFIG.site.base)), `ask cited something off this node: ${asked.citations.join(', ')}`);
ok(String(asked.body).includes('Content Use Terms'), 'ask did not carry the Content Use Terms inside the answer');
const unanswerable = call('ask', { question: 'zzzznothingmatchesthis' });
ok(unanswerable.body === 'no answer in this memory', `ask with nothing matching answered ${JSON.stringify(unanswerable.body)}`);

// compose — this node's own concepts and procedures
const composable = ITEMS.filter(s => !['guides', 'vocabulary'].includes(s));
const composed = envelope(call('compose', { selection: composable }), 'compose');
ok(composed.type === 'verdict', `compose: type ${composed.type}`);
ok(composed.body.valid === true, `compose over this node's own ${composable.length} items is not valid: ${JSON.stringify(composed.body.conflicts)}`);
ok(composed.body.selection.length === composable.length, `compose returned ${composed.body.selection.length} of ${composable.length} selected`);
const oneProcedure = envelope(call('compose', { selection: ['publish-a-level-0-node'] }), 'compose');
ok(oneProcedure.type === 'verdict' && oneProcedure.body.valid === true, 'compose over one procedure is not valid');
const emptyCompose = call('compose', { selection: [] });
ok(emptyCompose.type === 'verdict', `compose over an empty selection answered ${emptyCompose.type}`);

// propose — prepared text only, and no write. The payload is the published source file's own
// bytes: the frontmatter BLOCK byte for byte, exactly one blank line, then the body — the rule
// both transports use (`mcp-tools.js#propose` and the page tool), so `/pages/<slug>.md` and the
// payload are equal whenever the published body opens with its blank line.
for (const slug of ITEMS) {
  const r = envelope(call('propose', { slug }), 'propose');
  ok(r.type === 'proposal', `propose(${slug}): type ${r.type}`);
  const published = files.get(`/pages/${slug}.md`);
  const split = enginePageTools.pageSplitFrontmatter(published);
  ok(r.body.markdown === `${split.block}${split.body.startsWith('\n') ? '' : '\n'}${split.body}`,
    `propose(${slug}) did not return the published source file's own bytes`);
  ok(r.body.markdown.startsWith(split.block), `propose(${slug}): the frontmatter block is not the published one`);
  ok(Object.keys(r.body).every(k => ['iri', 'markdown', 'slug'].includes(k)), `propose(${slug}): unexpected member in the payload`);
}

// remember — a conforming new item handed back, nothing written, no clock read
const remembered = envelope(call('remember', {
  actor: 'process:ci', at: '2026-01-01T00:00:00Z', body: 'A note taken while reading this node.', kind: 'episode',
  title: 'A Recorded Run', sources: [{ id: 's1', resource: 'not a url' }],
}), 'remember');
ok(remembered.type === 'proposal', `remember: type ${remembered.type}`);
ok(remembered.body.path.startsWith('content/'), `remember: path ${remembered.body.path}`);
ok(remembered.body.frontmatter.prov.origin === 'ai-generated', 'remember did not mark the origin as machine-generated');
ok((remembered.body.findings || []).some(f => f.code === 'AGSC-E506'), 'remember did not drop the malformed source with AGSC-E506');
const twice = call('remember', { actor: 'process:ci', at: '2026-01-01T00:00:00Z', body: 'A note.', kind: 'episode', title: 'A Recorded Run' });
ok(JSON.stringify(plain(twice)) === JSON.stringify(plain(call('remember', { actor: 'process:ci', at: '2026-01-01T00:00:00Z', body: 'A note.', kind: 'episode', title: 'A Recorded Run' }))),
  'remember is not deterministic for the same input');
ok(item.networkCalls === 0, `the write tools made ${item.networkCalls} network call(s) — a page performs no write (AGSC-08-04)`);

// an unknown tool is the same envelope, not a transport error
const unknown = call('no-such-tool', {});
ok(unknown.type === 'error' && unknown.body.code === 'AGSC-E001', `an unknown tool answered ${JSON.stringify(unknown.body)}`);

// ------------------------------------------------------------------ (4) the path a browser takes
const asyncResults = [];
async function asynchronousPath() {
  const page = openPage({ assets: ITEM_PAGE_ASSETS, network: 'files' });
  await vm.runInContext('globalThis.AGSC_PAGE_TOOLS.ready', page.context);
  const tools = page.sandbox.AGSC_TOOLS;
  const r = plain(await tools.call('read', { slug: ITEMS[0] }));
  ok(r.type === 'item' && r.body.slug === ITEMS[0], `the asynchronously loaded page answered ${JSON.stringify(r).slice(0, 120)}`);
  const s = plain(await tools.call('search', { query: 'bundle' }));
  ok(s.type === 'items' && s.body.hits.length > 0, 'the asynchronously loaded page found nothing for "bundle"');
  ok(page.refused.length === 0, `the page tried to reach ${page.refused.join(', ')}`);
  // AGSC-10-13 / AGSC-10-17: on a node with a live board the page tools also read the board
  // exports, whose derived `claimed_by` a claim is checked against — and nothing else.
  const boardRoutes = files.has('/boards/index.json')
    ? ['/boards/index.json', ...JSON.parse(files.get('/boards/index.json')).boards.map(b => `/boards/${b.cluster}.json`)]
    : [];
  const wanted = new Set(['/.well-known/knowledge-linkset', '/search.json', ...ITEMS.map(s2 => `/pages/${s2}.md`), ...boardRoutes]);
  const unexpected = page.fetched.filter(route => !wanted.has(route));
  ok(unexpected.length === 0, `the page fetched routes the tools have no business reading: ${unexpected.join(', ')}`);
  const notFetched = [...wanted].filter(route => !page.fetched.includes(route));
  ok(notFetched.length === 0, `the page did not read ${notFetched.join(', ')}`);
  asyncResults.push(`${page.fetched.length} same-origin routes read, 0 refused`);

  // The /compose/ page itself, with its controller, over the same file map.
  const composePage = openPage({ assets: COMPOSE_ASSETS, network: 'files' });
  const state = vm.runInContext('globalThis.AGSC_COMPOSE', composePage.context);
  await state.start();
  ok(state.items.length >= ITEMS.length, `the compose page recovered ${state.items.length} items from the published graph`);
  await vm.runInContext('globalThis.AGSC_PAGE_TOOLS.ready', composePage.context);
  const composeTools = composePage.sandbox.AGSC_TOOLS;
  for (const name of SEVEN) {
    const answer = plain(await composeTools.call(name, {
      actor: 'process:ci', at: '2026-01-01T00:00:00Z', body: 'A note.', kind: 'episode', question: 'bundle',
      query: 'bundle', selection: [ITEMS[0]], slug: ITEMS[0], title: 'A Recorded Run',
    }));
    ok(answer.type !== 'error', `/compose/: ${name} answered ${JSON.stringify(answer.body).slice(0, 160)}`);
  }
  ok(composePage.registered.length === 7, `/compose/ registered ${composePage.registered.length} tools`);
  ok(composePage.consoleCalls.filter(c => c[0] === 'error').length === 0,
    `/compose/ wrote to the console: ${JSON.stringify(composePage.consoleCalls)}`);
}

// ------------------------------------------------------------------ (5) a browser WITHOUT WebMCP
async function withoutWebmcp() {
  for (const [label, assets] of [['an item page', ITEM_PAGE_ASSETS], ['the compose page', COMPOSE_ASSETS]]) {
    let page;
    try {
      page = openPage({ assets, modelContext: false, network: 'files' });
    } catch (e) {
      fails.push(`${label} threw without document.modelContext: ${e.message}`);
      continue;
    }
    ok(page.registered.length === 0, `${label} registered a tool although the browser exposes no document.modelContext`);
    const state = vm.runInContext('globalThis.AGSC_WEBMCP', page.context);
    ok(state && state.registered === 0, `${label}: the registration script did not stand down`);
    await vm.runInContext('globalThis.AGSC_PAGE_TOOLS.ready', page.context);
    const r = plain(await page.sandbox.AGSC_TOOLS.call('read', { slug: ITEMS[0] }));
    ok(r.type === 'item', `${label} is not functional without WebMCP`);
    ok(page.consoleCalls.length === 0, `${label} wrote to the console without WebMCP: ${JSON.stringify(page.consoleCalls)}`);
    ok(page.refused.length === 0 && page.networkCalls === 0, `${label} reached outside this origin without WebMCP`);
  }
  // And with no `fetch` at all — a page that is only parsed, never run against a network.
  const bare = { AGSC_TOOLS: undefined, TextEncoder, console: { error: () => fails.push('the bare page wrote to the console') } };
  const context = vm.createContext(bare);
  for (const asset of ITEM_PAGE_ASSETS) vm.runInContext(files.get(asset), context, { filename: asset });
  ok(vm.runInContext('typeof globalThis.AGSC_PAGE_TOOLS', context) === 'object', 'the page tools did not install in a document-less realm');
  ok(vm.runInContext('globalThis.AGSC_WEBMCP.registered', context) === 0, 'the registration script registered in a document-less realm');
}

// ------------------------------------------------------------------ report
(async () => {
  try {
    await asynchronousPath();
    await withoutWebmcp();
  } catch (e) {
    fails.push(`the harness threw: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`);
  }
  const summary = {
    engine: { commit: ENGINE_COMMIT, describe: ENGINE_DESCRIBE, version: ENGINE_VERSION },
    items: ITEMS.length,
    scripts: digests,
    status: fails.length ? 'fail' : 'pass',
    surface_version: engineSurfaces.WEBMCP_SURFACE_VERSION,
    tools: SEVEN,
  };
  if (JSON_OUT) process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  if (fails.length) {
    process.stderr.write(fails.map(f => `FAIL ${f}`).join('\n') + `\npage-tools-check: ${fails.length} failure(s)\n`);
    process.exit(1);
  }
  if (!JSON_OUT) {
    for (const line of notes) process.stdout.write(`page-tools-check: ${line}\n`);
    process.stdout.write(`page-tools-check: pass — 7 tools over ${ITEMS.length} items, ${asyncResults.join('; ')}, engine ${ENGINE_DESCRIBE}\n`);
    for (const [route, d] of Object.entries(digests)) process.stdout.write(`  ${route} ${d.bytes} bytes sha256:${d.sha256}\n`);
  }
})();
