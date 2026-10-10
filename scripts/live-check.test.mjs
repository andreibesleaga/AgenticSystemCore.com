// Tests of scripts/live-check.mjs with recorded responses: no network, a fixed instant, and the
// committed pages of a temporary output folder. Each test starts from a clean recording of both
// nodes, changes one thing and reads the verdict.
//
//   node --test scripts/live-check.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { liveCheck, NODES, W3ID, REGISTRIES } from './live-check.mjs';

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
    map.set(at('/.well-known/sustainability-data'), response(200, { 'content-type': 'application/sustainability-data+json', 'strict-transport-security': 'max-age=15552000' },
      JSON.stringify({ 'reporting-period': '2026-09', target: new URL(node.base).host })));
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
  const checkers = async () => [{ name: 'Node checker, Level 2, both nodes and the mutual check', ok: true, detail: 'pass' }, { name: 'Python checker, Level 2, both nodes and the mutual check', ok: true, detail: 'pass' }];
  return { map, get, seen, www, checkers, at: (node, route) => new URL(route.replace(/^\//, ''), node.base).href };
}

const run = (r, extra = {}) => liveCheck({ get: r.get, now: NOW, committedRoot: r.www, checkers: r.checkers, requireCheckers: true, ...extra });
const fails = report => report.results.filter(x => x.severity === 'fail');
const warns = report => report.results.filter(x => x.severity === 'warn');
const [MAIN, DEMO] = NODES;

test('the clean recording passes, and every address it reads is recorded', async t => {
  const r = recording(t);
  const report = await run(r);
  assert.deepEqual(fails(report), []);
  assert.deepEqual(warns(report), []);
  assert.ok(report.results.length >= 20, `only ${report.results.length} results`);
  assert.ok(r.seen.includes(r.at(MAIN, '/docs/guides/mode-0/')));
  assert.ok(r.seen.includes(r.at(DEMO, '/.well-known/knowledge-linkset')));
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
  r.map.set(url, response(200, { 'content-type': 'application/sustainability-data+json', 'strict-transport-security': 'max-age=1' }, '{"reporting-period":"2026-07"}'));
  assert.match(fails(await run(r)).map(x => x.message).join('\n'), /reporting period 2026-07 is 3 month\(s\) old/);
  r.map.set(url, response(200, { 'content-type': 'application/sustainability-data+json', 'strict-transport-security': 'max-age=1' }, '{"reporting-period":"2026-08"}'));
  assert.deepEqual(fails(await run(r)), []);
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
