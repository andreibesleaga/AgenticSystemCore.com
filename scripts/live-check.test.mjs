// Tests of scripts/live-check.mjs with recorded responses: no network, a fixed instant, and the
// committed pages of a temporary output folder. Each test starts from a clean recording of every
// node, changes one thing and reads the verdict.
//
//   node --test scripts/live-check.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { liveCheck, checkerRuns, NODES, W3ID, REGISTRIES } from './live-check.mjs';

const NOW = new Date('2026-10-10T12:00:00Z');
const PAGE = '<!doctype html>\n<html lang="en"><head><title>Page</title></head><body><p>Run printf to write a contact line.</p></body></html>\n';
const LEGAL = '<p>The pages this site builds load nothing from any other host.</p>';
const NAMED = '<p>Cloudflare can add a Network Error Logging header and a speculation rules header of its own.</p>';

const html = { 'content-type': 'text/html; charset=utf-8', 'strict-transport-security': 'max-age=15552000; includeSubDomains', 'content-security-policy': "default-src 'none'; script-src 'self'" };
const response = (status, headers, body = '') => ({ status, headers: { ...headers }, body: Buffer.from(body) });

/** A clean recording of every address the check reads, and the committed pages it compares. */
function recording(t) {
  const www = fs.mkdtempSync(path.join(os.tmpdir(), 'live-check-'));
  t.after(() => fs.rmSync(www, { recursive: true, force: true }));
  const map = new Map();
  for (const node of NODES) {
    const at = route => new URL(route.replace(/^\//, ''), node.base).href;
    map.set(at('/'), response(200, { ...html, link: '</.well-known/knowledge-linkset>; rel="describedby"; type="application/linkset+json"' }, PAGE));
    for (const route of node.pages) if (route !== '/') map.set(at(route), response(200, html, PAGE));
    for (const route of node.statements) map.set(at(route), response(200, html, LEGAL));
    map.set(at('/.well-known/knowledge-linkset'), response(200, {
      'content-type': 'application/linkset+json; profile="https://w3id.org/agentic-system-core/profile/agentic-knowledge"',
      link: '<https://w3id.org/agentic-system-core/profile/agentic-knowledge>; rel="profile"',
      etag: '"0123"', 'access-control-allow-origin': '*', 'access-control-expose-headers': 'Link, ETag, Content-Type',
      'strict-transport-security': 'max-age=15552000',
    }, '{"linkset":[]}'));
    map.set(at('/.well-known/security.txt'), response(200, { 'content-type': 'text/plain; charset=utf-8', 'strict-transport-security': 'max-age=15552000' },
      'Contact: https://example.org/contact/\nExpires: 2027-10-07T07:30:56Z\nPreferred-Languages: en\n'));
    if (node.report) map.set(at('/.well-known/sustainability-data'), response(200, { 'content-type': 'application/sustainability-data+json', 'strict-transport-security': 'max-age=15552000' },
      JSON.stringify({ period: { start: '2026-09-01T00:00:00Z', end: '2026-10-01T00:00:00Z' }, target: new URL(node.base).host })));
    if (node.network) {
      const name = node.network.address.split('/').pop();
      const folder = node.network.address.slice(0, -name.length);
      const json = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'strict-transport-security': 'max-age=15552000' };
      map.set(at(`${folder}agent-manifest.json`), response(200, json, JSON.stringify({ networks: [{ name, hocon: `./${name}.network.json` }] })));
      map.set(at(`${folder}${name}.network.json`), response(200, json, '{"tools":[]}'));
      if (node.network.page) map.set(at(node.network.address), response(302, { location: node.network.page, 'strict-transport-security': 'max-age=15552000' }));
    }
    for (const [route, file] of Object.entries(node.committed)) {
      fs.mkdirSync(path.dirname(path.join(www, file)), { recursive: true });
      fs.writeFileSync(path.join(www, file), PAGE);
      map.set(at(route), map.get(at(route)) || response(200, html, PAGE));
    }
  }
  for (const p of W3ID.paths) map.set(new URL(p, W3ID.base).href, response(303, { location: 'https://agenticsystemcore.com/ns/' }));
  map.set(REGISTRIES.npm, response(200, { 'content-type': 'application/json' }, JSON.stringify({ 'dist-tags': { latest: '1.0.0' }, versions: { '1.0.0': {} } })));
  map.set(REGISTRIES.pypi, response(200, { 'content-type': 'application/json' }, JSON.stringify({ info: { version: '1.0.0' }, releases: { '1.0.0': [{}] } })));
  const seen = [];
  const get = async url => { seen.push(url); const r = map.get(url); if (!r) throw new Error(`no recording for ${url}`); return r; };
  const checkers = async () => [{ name: 'Node checker, Level 2, every node and the mutual checks', ok: true, detail: 'pass' }, { name: 'Python checker, Level 2, every node and the mutual checks', ok: true, detail: 'pass' }];
  return { map, get, seen, www, checkers, at: (node, route) => new URL(route.replace(/^\//, ''), node.base).href };
}

const run = (r, extra = {}) => liveCheck({ get: r.get, now: NOW, committedRoot: r.www, checkers: r.checkers, requireCheckers: true, ...extra });
const fails = report => report.results.filter(x => x.severity === 'fail');
const warns = report => report.results.filter(x => x.severity === 'warn');
const [MAIN, DEMO, STANDARDS] = NODES;

test('the clean recording passes, and every address it reads is recorded', async t => {
  const r = recording(t);
  const report = await run(r);
  assert.deepEqual(fails(report), []);
  assert.deepEqual(warns(report), []);
  assert.ok(report.results.length >= 20, `only ${report.results.length} results`);
  assert.ok(r.seen.includes(r.at(MAIN, '/docs/guides/mode-0/')));
  assert.ok(r.seen.includes(r.at(DEMO, '/.well-known/knowledge-linkset')));
  assert.ok(r.seen.includes(r.at(STANDARDS, '/.well-known/security.txt')));
});

test('a node that publishes no sustainability report is not asked for one', async t => {
  const r = recording(t);
  await run(r);
  assert.equal(STANDARDS.report, false);
  assert.ok(r.seen.includes(r.at(MAIN, '/.well-known/sustainability-data')));
  assert.ok(r.seen.includes(r.at(DEMO, '/.well-known/sustainability-data')));
  assert.ok(!r.seen.includes(r.at(STANDARDS, '/.well-known/sustainability-data')));
});

test('the checkers run once per node, each with the next node as its peer, so every pair is checked', () => {
  const linkset = node => new URL('.well-known/knowledge-linkset', node.base).href;
  assert.deepEqual(checkerRuns(NODES), [
    [linkset(MAIN), linkset(DEMO)],
    [linkset(DEMO), linkset(STANDARDS)],
    [linkset(STANDARDS), linkset(MAIN)],
  ]);
});

test('a page whose e-mail text the edge rewrote fails, and so does any script from /cdn-cgi/', async t => {
  const r = recording(t);
  r.map.set(r.at(MAIN, '/docs/guides/mode-0/'), response(200, html, PAGE.replace('a contact line', '<span class="__cf_email__" data-cfemail="00">[email protected]</span>')));
  r.map.set(r.at(DEMO, '/'), response(200, { ...html, link: '</.well-known/knowledge-linkset>; rel="describedby"' }, PAGE.replace('</body>', '<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script></body>')));
  const report = await run(r);
  const messages = fails(report).map(x => `${x.node} ${x.message}`).join('\n');
  assert.match(messages, /main site .*__cf_email__/);
  assert.match(messages, /main site .*differ from the committed/);
  assert.match(messages, /demonstration node .*\/cdn-cgi\//);
});

test('a Network Error Logging or speculation rules header fails unless the node\'s statements name it', async t => {
  const r = recording(t);
  const home = r.map.get(r.at(MAIN, '/'));
  r.map.set(r.at(MAIN, '/'), { ...home, headers: { ...home.headers, nel: '{"report_to":"cf-nel"}', 'report-to': '{"group":"cf-nel"}', 'speculation-rules': '"/cdn-cgi/speculation"' } });
  let report = await run(r);
  assert.deepEqual(fails(report).map(x => x.message.split(':')[0]).sort(), ['the edge adds the header nel', 'the edge adds the header report-to', 'the edge adds the header speculation-rules']);
  for (const route of MAIN.statements) r.map.set(r.at(MAIN, route), response(200, html, NAMED));
  report = await run(r);
  assert.deepEqual(fails(report), []);
  assert.equal(warns(report).length, 3);
});

test('security.txt must expire more than sixty days ahead', async t => {
  const r = recording(t);
  const url = r.at(DEMO, '/.well-known/security.txt');
  const with_ = expires => r.map.set(url, response(200, { 'content-type': 'text/plain', 'strict-transport-security': 'max-age=1' }, `Contact: https://example.org/\n${expires}`));
  with_('Expires: 2026-11-09T12:00:00Z\n');
  assert.match(fails(await run(r)).map(x => x.message).join('\n'), /expires 2026-11-09T12:00:00Z, 30 day\(s\) ahead/);
  with_('Expires: 2026-12-10T12:00:01Z\n');
  assert.deepEqual(fails(await run(r)), []);
  with_('Preferred-Languages: en\n');
  assert.match(fails(await run(r)).map(x => x.message).join('\n'), /no Expires field/);
});

test('a sustainability report more than two months old fails', async t => {
  const r = recording(t);
  const url = r.at(MAIN, '/.well-known/sustainability-data');
  const report = (start, end) => response(200, { 'content-type': 'application/sustainability-data+json', 'strict-transport-security': 'max-age=1' },
    JSON.stringify({ period: { start, end } }));
  r.map.set(url, report('2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z'));
  assert.match(fails(await run(r)).map(x => x.message).join('\n'), /the period ending 2026-08-01T00:00:00Z is 3 month\(s\) old/);
  r.map.set(url, report('2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z'));
  assert.deepEqual(fails(await run(r)), []);
  // A year-long period is as recent as its last month.
  r.map.set(url, report('2025-09-01T00:00:00Z', '2026-09-01T00:00:00Z'));
  assert.deepEqual(fails(await run(r)), []);
  // An offset is honoured: this period ends on 1 September in UTC, so its last month is August.
  r.map.set(url, report('2026-08-01T03:00:00+03:00', '2026-09-01T03:00:00+03:00'));
  assert.deepEqual(fails(await run(r)), []);
  // The pre-draft-10 field alone, a period whose end is not after its start, or no JSON at all.
  for (const body of ['{"reporting-period":"2026-09"}', JSON.stringify({ period: { start: '2026-09-01T00:00:00Z', end: '2026-09-01T00:00:00Z' } }), 'not json']) {
    r.map.set(url, response(200, { 'content-type': 'application/sustainability-data+json', 'strict-transport-security': 'max-age=1' }, body));
    assert.match(fails(await run(r)).map(x => x.message).join('\n'), /no period \{ start, end \} with start before end/, body);
  }
  r.map.set(url, response(404, { 'strict-transport-security': 'max-age=1' }, 'not found'));
  assert.match(fails(await run(r)).map(x => x.message).join('\n'), /answers 404/);
});

test('the headers the nodes promise are checked', async t => {
  const r = recording(t);
  const doc = r.map.get(r.at(MAIN, '/.well-known/knowledge-linkset'));
  const { etag, ...noEtag } = doc.headers;
  assert.equal(etag, '"0123"');
  r.map.set(r.at(MAIN, '/.well-known/knowledge-linkset'), { ...doc, headers: { ...noEtag, 'content-type': 'application/json' } });
  const home = r.map.get(r.at(DEMO, '/'));
  const { link, 'strict-transport-security': hsts, 'content-security-policy': csp, ...bare } = home.headers;
  assert.ok(link && hsts && csp);
  r.map.set(r.at(DEMO, '/'), { ...home, headers: bare });
  const messages = fails(await run(r)).map(x => `${x.node} ${x.message}`).join('\n');
  assert.match(messages, /main site .*no ETag/);
  assert.match(messages, /main site .*Content-Type application\/json/);
  assert.match(messages, /demonstration node .*no Link header with rel="describedby"/);
  assert.match(messages, /demonstration node .*no Strict-Transport-Security/);
  assert.match(messages, /demonstration node .*no Content-Security-Policy/);
});

test('the w3id addresses must answer 303, and both registries must name a version', async t => {
  const r = recording(t);
  r.map.set(new URL(W3ID.paths[1], W3ID.base).href, response(404, {}, 'not found'));
  r.map.set(REGISTRIES.pypi, response(200, {}, JSON.stringify({ info: { version: '1.0.0' }, releases: {} })));
  const messages = fails(await run(r)).map(x => x.message).join('\n');
  assert.match(messages, new RegExp(`${W3ID.paths[1].replace(/[.]/g, '\\.')} answers 404, not 303`));
  assert.match(messages, /PyPI: agentic-system-core 1\.0\.0 has no files/);
});

test('an agent network: the manifest lists it, its file answers for other sites, and its address leads to its page', async t => {
  const r = recording(t);
  const clean = await run(r);
  const passes = clean.results.filter(x => x.check === 'agent network' && x.severity === 'pass').map(x => `${x.node}: ${x.message}`);
  assert.equal(passes.length, NODES.length + 3, passes.join(' | ')); // one per node, and the three addresses
  assert.ok(passes.some(m => m.includes('/desk/brief_desk: the address itself leads to /desk/')));
  // The two peers' addresses lead to the node's home page.
  assert.ok(passes.some(m => m.includes('/agents/pattern_cards: the address itself leads to /')));
  assert.ok(passes.some(m => m.includes('/agents/standards_map: the address itself leads to /')));
  assert.deepEqual([DEMO, STANDARDS].map(n => n.network.page), ['/', '/']);

  // The address named in public texts answers 404: a failure that says where it must lead.
  r.map.set(r.at(MAIN, MAIN.network.address), response(404, {}, 'not found'));
  assert.match(fails(await run(r)).map(x => x.message).join('\n'), /\/desk\/brief_desk: answers 404; a person who opens the network's address must reach \/desk\//);
  // It redirects, but somewhere else.
  r.map.set(r.at(MAIN, MAIN.network.address), response(301, { location: 'https://agenticsystemcore.com/' }));
  assert.match(fails(await run(r)).map(x => x.message).join('\n'), /answers 301 to https:\/\/agenticsystemcore\.com\/; a person/);
  // The right place, without Strict-Transport-Security: the redirect is a response like any other.
  r.map.set(r.at(MAIN, MAIN.network.address), response(302, { location: 'https://agenticsystemcore.com/desk/' }));
  assert.deepEqual(fails(await run(r)).map(x => x.message), ['/desk/brief_desk: no Strict-Transport-Security header']);
  r.map.set(r.at(MAIN, MAIN.network.address), response(302, { location: 'https://agenticsystemcore.com/desk/', 'strict-transport-security': 'max-age=1' }));
  assert.deepEqual(fails(await run(r)), []);

  // A peer's address that answers 404 again, or leads somewhere else, fails and says where it must lead.
  const peers = recording(t);
  peers.map.set(peers.at(DEMO, DEMO.network.address), response(404, {}, 'not found'));
  assert.match(fails(await run(peers)).map(x => x.message).join('\n'), /\/agents\/pattern_cards: answers 404; a person who opens the network's address must reach \//);
  peers.map.set(peers.at(DEMO, DEMO.network.address), response(302, { location: 'https://patterns.agenticsystemcore.com/', 'strict-transport-security': 'max-age=1' }));
  peers.map.set(peers.at(STANDARDS, STANDARDS.network.address), response(302, { location: 'https://standards.agenticsystemcore.com/concepts/', 'strict-transport-security': 'max-age=1' }));
  assert.match(fails(await run(peers)).map(x => x.message).join('\n'), /\/agents\/standards_map: answers 302 to https:\/\/standards\.agenticsystemcore\.com\/concepts\/; a person/);
  // A peer's manifest that no longer lists the network, then a file other sites cannot read.
  r.map.set(r.at(DEMO, '/agents/agent-manifest.json'), response(200, { 'access-control-allow-origin': '*', 'strict-transport-security': 'max-age=1' }, JSON.stringify({ networks: [{ name: 'other', hocon: './other.network.json' }] })));
  assert.match(fails(await run(r)).map(x => `${x.node}: ${x.message}`).join('\n'), /demonstration node: \/agents\/agent-manifest\.json: no network named pattern_cards with a file/);
  // A manifest whose entry names no file must not count the manifest itself as the network file.
  const empty = recording(t);
  empty.map.set(empty.at(STANDARDS, '/agents/agent-manifest.json'), response(200, { 'access-control-allow-origin': '*', 'strict-transport-security': 'max-age=1' }, JSON.stringify({ networks: [{ name: 'standards_map', hocon: '' }] })));
  assert.match(fails(await run(empty)).map(x => x.message).join('\n'), /\/agents\/agent-manifest\.json: no network named standards_map with a file/);
  // A network file on another origin is read there, not on the node.
  const elsewhere = recording(t);
  elsewhere.map.set(elsewhere.at(DEMO, '/agents/agent-manifest.json'), response(200, { 'access-control-allow-origin': '*', 'strict-transport-security': 'max-age=1' }, JSON.stringify({ networks: [{ name: 'pattern_cards', hocon: 'https://files.example/pattern_cards.network.json' }] })));
  elsewhere.map.delete(elsewhere.at(DEMO, '/agents/pattern_cards.network.json'));
  elsewhere.map.set('https://files.example/pattern_cards.network.json', response(200, { 'access-control-allow-origin': '*' }, '{"tools":[]}'));
  assert.deepEqual(fails(await run(elsewhere)), []);
  assert.ok(elsewhere.seen.includes('https://files.example/pattern_cards.network.json'));
  const closed = recording(t);
  closed.map.set(closed.at(STANDARDS, '/agents/standards_map.network.json'), response(200, { 'strict-transport-security': 'max-age=1' }, '{}'));
  assert.match(fails(await run(closed)).map(x => x.message).join('\n'), /no Access-Control-Allow-Origin: \*, so other sites cannot load the network/);
});

test('a failed checker fails the run; checkers that did not run fail only when they are required', async t => {
  const r = recording(t);
  let report = await run(r, { checkers: async () => [{ name: 'Python checker', ok: false, detail: 'fail (level 2): 1 error(s)' }] });
  assert.match(fails(report).map(x => x.message).join('\n'), /Python checker: fail \(level 2\)/);
  report = await run(r, { checkers: null });
  assert.match(fails(report).map(x => x.message).join('\n'), /checkers were not run/);
  report = await run(r, { checkers: null, requireCheckers: false });
  assert.deepEqual(fails(report), []);
  assert.match(warns(report).map(x => x.message).join('\n'), /checkers were not run/);
});

test('an address that cannot be read is a failure with its reason, not a crash', async t => {
  const r = recording(t);
  r.map.delete(r.at(DEMO, '/.well-known/security.txt'));
  const report = await run(r);
  assert.match(fails(report).map(x => `${x.node} ${x.message}`).join('\n'), /demonstration node .*security\.txt.*no recording/);
});

// The query page (AGSC-06-39), once the committed output has one: `/query/` must carry exactly one
// policy, the one of its own `_headers` block with 'wasm-unsafe-eval' (the block's detach line drops
// the site-wide one), and the engine file must be served as application/wasm.
const QUERY_POLICY = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'";
function withQueryPage(r) {
  fs.mkdirSync(path.join(r.www, 'query', 'vendor', 'oxigraph-0.5.13'), { recursive: true });
  fs.writeFileSync(path.join(r.www, 'query', 'index.html'), PAGE);
  fs.writeFileSync(path.join(r.www, 'query', 'vendor', 'oxigraph-0.5.13', 'web_bg.wasm'), Buffer.from('0061736d01000000', 'hex'));
  r.map.set(r.at(MAIN, '/query/'), response(200, { ...html, 'content-security-policy': QUERY_POLICY }, PAGE));
  r.map.set(r.at(MAIN, '/query/vendor/oxigraph-0.5.13/web_bg.wasm'), response(200, { 'content-type': 'application/wasm', 'strict-transport-security': 'max-age=15552000' }, '\0asm'));
}

test('a committed output without a query page reads no /query/ address', async t => {
  const r = recording(t);
  const report = await run(r);
  assert.deepEqual(fails(report), []);
  assert.ok(!r.seen.some(u => u.includes('/query/')), `read ${r.seen.filter(u => u.includes('/query/')).join(', ')}`);
});

test('the query page: one policy with wasm-unsafe-eval, and the engine served as application/wasm', async t => {
  const r = recording(t);
  withQueryPage(r);
  let report = await run(r);
  assert.deepEqual(fails(report), []);
  assert.match(report.results.filter(x => x.severity === 'pass').map(x => x.message).join('\n'), /\/query\/: one Content-Security-Policy, with 'wasm-unsafe-eval'/);
  r.map.set(r.at(MAIN, '/query/'), response(200, { ...html, 'content-security-policy': `${html['content-security-policy']}, ${QUERY_POLICY}` }, PAGE));
  r.map.set(r.at(MAIN, '/query/vendor/oxigraph-0.5.13/web_bg.wasm'), response(200, { 'content-type': 'application/octet-stream', 'strict-transport-security': 'max-age=15552000' }, '\0asm'));
  report = await run(r);
  const messages = fails(report).map(x => x.message).join('\n');
  assert.match(messages, /\/query\/: 2 Content-Security-Policy policies are served; the \/query\/\* block must replace the site-wide one/);
  assert.match(messages, /web_bg\.wasm: Content-Type application\/octet-stream, not application\/wasm/);
  r.map.set(r.at(MAIN, '/query/'), response(200, html, PAGE));
  report = await run(r);
  assert.match(fails(report).map(x => x.message).join('\n'), /\/query\/: the Content-Security-Policy has no 'wasm-unsafe-eval'/);
});

test('the weekly check reads the w3id address of the vocabulary version the site declares, and of 1.0.0', () => {
  const declared = JSON.parse(fs.readFileSync(new URL('../agsc.config.json', import.meta.url), 'utf8')).spec_version;
  assert.ok(W3ID.paths.includes(`ns/${declared}`), `W3ID.paths lacks ns/${declared}`);
  assert.ok(W3ID.paths.includes('ns/1.0.0'));
});
