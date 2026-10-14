'use strict';
// Tests of the graph explorer's data half (assets/graph-data.js): a node's graph.jsonld as nodes
// and links, the peers read from its discovery document, the merged picture with the peer link
// and the cross-node links, the tree, the tooltip's summary and its link. Small fixtures, a fake
// fetch, no network: node --test scripts/graph-explorer.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const G = require('../assets/graph-data.js');

const REL = 'https://w3id.org/agentic-system-core/rel#';
const A = 'https://a.example.org', B = 'https://b.example.net', C = 'https://c.example.com';
const en = v => ({ '@language': 'en', '@value': v });
const graphA = { '@context': `${A}/ns/context.jsonld`, '@graph': [
  { '@id': `${A}/`, '@type': 'Bundle' },
  { '@id': `${A}/clusters/core/`, '@type': 'Cluster', prefLabel: en('Core'), definition: en('The core terms.'), member: [`${A}/concepts/item/`, `${A}/concepts/link/`] },
  { '@id': `${A}/concepts/item/`, '@type': 'Concept', prefLabel: en('Item'), definition: [{ '@language': 'fr', '@value': 'Un élément.' }, en('One unit of knowledge.')], inScheme: `${A}/`, source: `${A}/concepts/item/#source-1`, related: `${B}/concepts/pattern/` },
  { '@id': `${A}/concepts/link/`, '@type': 'Concept', prefLabel: en('Link'), inScheme: `${A}/`, 'dcterms:source': 'https://example.org/elsewhere' },
  { '@id': `${A}/concepts/item/#source-1`, '@type': 'Source', title: 'AGSC-00-04', 'dcterms:source': `${A}/specs/00/#AGSC-00-04` },
] };
const graphB = { '@graph': [
  { '@id': `${B}/`, '@type': 'Bundle' },
  { '@id': `${B}/concepts/pattern/`, '@type': 'Concept', prefLabel: en('Pattern'), 'schema:description': 'A reusable shape.', related: `${A}/concepts/link` },
] };
const linkset = (origin, graphBytes, peers, extra) => ({ linkset: [Object.assign({
  anchor: `${origin}/`,
  describedby: [{ digest: [`sha-256=:${crypto.createHash('sha256').update(graphBytes).digest('base64')}:`], href: `${origin}/graph.jsonld`, type: 'application/ld+json', 'agsc-bundle-version': ['v1.0.0'], 'agsc-counts': ['concepts=2'] }],
  [`${REL}graph`]: [{ href: `${origin}/graph.nq`, type: 'application/n-quads' }],
  [`${REL}surface`]: [{ 'agsc-surface': ['chunks'], href: `${origin}/chunks.jsonl`, type: 'application/jsonl' }],
  license: [{ href: `${origin}/legal/` }],
}, peers.length ? { [`${REL}peer`]: peers.map(p => ({ href: `${p}/.well-known/knowledge-linkset`, type: 'application/linkset+json' })) } : {}, extra || {})] });

/** A fake fetch over a map of address -> body (string) or a function returning a promise. */
function fakeFetch(routes, log) {
  return async url => {
    if (log) log.push(url);
    const body = routes[url];
    if (typeof body === 'function') return body();
    if (body === undefined) return { ok: false, status: 404, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) };
    const bytes = Buffer.from(body, 'utf8');
    return { ok: true, status: 200, text: async () => body, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) };
  };
}
const sha256 = async bytes => crypto.createHash('sha256').update(Buffer.from(bytes)).digest('base64');

test('a graph.jsonld becomes nodes and links; external addresses stay out-links', () => {
  const p = G.parseGraph(graphA, 0, 'en');
  assert.equal(p.nodes.length, 5);
  assert.deepEqual(p.nodes.map(n => n.type), ['Bundle', 'Cluster', 'Concept', 'Concept', 'Source']);
  assert.equal(p.nodes[1].label, 'Core');
  assert.equal(p.nodes[4].label, 'AGSC-00-04');
  const rels = p.links.map(l => `${l.rel} ${l.source.replace(A, '')} -> ${l.target.replace(A, '')}`).sort();
  assert.deepEqual(rels, ['inScheme /concepts/item/ -> /', 'inScheme /concepts/link/ -> /', 'member /clusters/core/ -> /concepts/item/', 'member /clusters/core/ -> /concepts/link/', 'source /concepts/item/ -> /concepts/item/#source-1']);
  const item = p.nodes.find(n => n.label === 'Item');
  assert.deepEqual(item.ext, [{ rel: 'related', iri: `${B}/concepts/pattern/` }]);
  assert.equal(G.parseGraph({}, 0).nodes.length, 0, 'a document with no @graph gives no nodes');
  assert.equal(G.parseGraph({ '@graph': [null, 3, { '@type': 'Concept' }] }, 0).nodes.length, 0, 'entries without @id are skipped');
});

test('the address field: a site root, a discovery document or a graph file, http(s) only', () => {
  assert.deepEqual(G.resolveAddress('https://b.example.net/'), { origin: B, linkset: `${B}/.well-known/knowledge-linkset`, graph: null });
  assert.deepEqual(G.resolveAddress('https://b.example.net/concepts/x/?q=1#f'), { origin: B, linkset: `${B}/.well-known/knowledge-linkset`, graph: null });
  assert.deepEqual(G.resolveAddress(`${B}/.well-known/knowledge-linkset`), { origin: B, linkset: `${B}/.well-known/knowledge-linkset`, graph: null });
  assert.deepEqual(G.resolveAddress(`${B}/graph.jsonld`), { origin: B, linkset: `${B}/.well-known/knowledge-linkset`, graph: `${B}/graph.jsonld` });
  assert.deepEqual(G.resolveAddress('b.example.net'), { origin: B, linkset: `${B}/.well-known/knowledge-linkset`, graph: null });
  assert.deepEqual(G.resolveAddress('/graph.jsonld', `${A}/graph/`), { origin: A, linkset: `${A}/.well-known/knowledge-linkset`, graph: `${A}/graph.jsonld` });
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'ftp://x.example/', '', '   ', null]) assert.equal(G.resolveAddress(bad), null, String(bad));
});

test('peer resolution from a link set: rel#peer links, the graph link and its digest, the chunks surface', () => {
  const doc = linkset(A, '{}', [B, B, C], { [`${REL}peer`]: [{ href: `${B}/.well-known/knowledge-linkset` }, { href: 'javascript:alert(1)' }, { href: `${C}/.well-known/knowledge-linkset` }] });
  assert.deepEqual(G.peersOf(doc), [`${B}/.well-known/knowledge-linkset`, `${C}/.well-known/knowledge-linkset`]);
  const gl = G.graphLinkOf(doc);
  assert.equal(gl.href, `${A}/graph.jsonld`);
  assert.match(gl.digest, /^sha-256=:/);
  assert.equal(gl.version, 'v1.0.0');
  assert.equal(G.chunksLinkOf(doc), `${A}/chunks.jsonl`);
  assert.equal(G.anchorOf(doc), `${A}/`);
  assert.equal(G.licenseOf(doc), `${A}/legal/`);
  // a document that names its graph only through …/rel#graph
  assert.equal(G.graphLinkOf({ linkset: [{ [`${REL}graph`]: [{ href: `${C}/g.nq` }, { href: `${C}/data/g.jsonld` }] }] }).href, `${C}/data/g.jsonld`);
  assert.equal(G.graphLinkOf({ linkset: [{}] }), null);
  assert.deepEqual(G.peersOf({}), []);
  assert.equal(G.rebase(`${A}/graph.jsonld`, A, 'http://127.0.0.1:8080'), 'http://127.0.0.1:8080/graph.jsonld');
  assert.equal(G.rebase(`${B}/graph.jsonld`, A, 'http://127.0.0.1:8080'), `${B}/graph.jsonld`);
});

test('merging: the peer link between the Bundle roots and a link wherever one graph names a node of the other', () => {
  const m = G.merge([G.parseGraph(graphA, 0, 'en'), G.parseGraph(graphB, 1, 'en')], [[0, 1]]);
  assert.equal(m.nodes.length, 7);
  const cross = m.links.filter(l => l.cross).map(l => `${l.rel} ${l.source} -> ${l.target}`).sort();
  assert.deepEqual(cross, [
    `peer ${A}/ -> ${B}/`,
    `related ${A}/concepts/item/ -> ${B}/concepts/pattern/`,
    `related ${B}/concepts/pattern/ -> ${A}/concepts/link/`, // named without the trailing slash
  ]);
  assert.equal(m.roots.get(0), `${A}/`);
  assert.equal(m.roots.get(1), `${B}/`);
  assert.ok(m.adj.get(`${B}/`).some(a => a.id === `${A}/` && a.rel === 'peer' && a.dir === 'in'));
  const tree = G.treeLinks(m).map(l => `${l.rel} ${l.target}`);
  assert.ok(tree.includes(`peer ${B}/`), 'the peer Bundle hangs from the Bundle that declared it');
  assert.ok(tree.includes(`member ${A}/concepts/item/`));
  assert.ok(tree.includes(`in scheme ${B}/concepts/pattern/`), 'an item in no cluster hangs from its Bundle');
  assert.equal(new Set(tree.map(t => t.split(' ').pop())).size, tree.length, 'every node has at most one parent');
});

test('the tooltip summary: first present field, in the page language, about 300 characters', () => {
  assert.equal(G.summaryText(graphA['@graph'][2], 'en'), 'One unit of knowledge.');
  assert.equal(G.summaryText(graphA['@graph'][2], 'fr'), 'Un élément.');
  assert.equal(G.summaryText(graphB['@graph'][1], 'en'), 'A reusable shape.', 'schema:description when there is no definition');
  assert.equal(G.summaryText({ description: '', 'skos:definition': { en: 'From a language map.', de: 'x' } }, 'en'), 'From a language map.');
  assert.equal(G.summaryText({ 'dcterms:abstract': 'Abstract.' }, 'en'), 'Abstract.');
  assert.equal(G.summaryText({ definition: 'First.', description: 'Second.' }, 'en'), 'First.');
  assert.equal(G.summaryText({ title: 'no summary field' }, 'en'), '');
  const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ');
  const t = G.summaryText({ definition: long }, 'en');
  assert.ok(t.length <= 300 && t.endsWith('…'), `${t.length} characters`);
  assert.ok(!/\s…$/.test(t) && /word\d+…$/.test(t), 'cut at a word boundary');
  assert.equal(G.truncate('  short   text ', 300), 'short text');
  assert.equal(G.truncate('abcdefghij', 5), 'abcd…');
});

test('the tooltip link: http(s) only, the node page when it is on a known node, else the page the graph names', () => {
  const known = new Set([A, B]);
  const node = (id, raw) => ({ id, raw: Object.assign({ '@id': id }, raw || {}) });
  assert.equal(G.pageHref(node(`${A}/concepts/item/`), known), `${A}/concepts/item/`);
  assert.equal(G.pageHref(node(`${A}/concepts/item/#source-1`), known), `${A}/concepts/item/#source-1`);
  assert.equal(G.pageHref(node('urn:x:1', { 'schema:url': `${C}/page/` }), known), `${C}/page/`);
  assert.equal(G.pageHref(node(`${C}/elsewhere/`), known), null, 'not a page of a node that was read');
  assert.equal(G.pageHref(node('urn:x:2', { url: 'javascript:alert(1)' }), known), null);
  for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', ' data:text/html,<b>x</b>', 'vbscript:x', '//evil.example/', 'https://user:pw@x.example/', 'mailto:a@b.c', '']) assert.equal(G.safeHref(bad), null, bad);
  assert.equal(G.safeHref('https://b.example.net/a b'), 'https://b.example.net/a%20b');
});

test('chunks of one item in section order, and the digest status', () => {
  const lines = [{ iri: 'x', ordinal: 2, section: 'Two', digest: 'd2', text: 't2' }, { iri: 'y', ordinal: 0 }, { iri: 'x', ordinal: 0, section: '', digest: 'd0', text: 't0' }].map(c => JSON.stringify(c)).join('\n') + '\nnot json\n';
  assert.deepEqual(G.parseChunks(lines, 'x').map(c => c.ordinal), [0, 2]);
  assert.equal(G.digestStatus('sha-256=:abc=:', 'abc='), 'verified');
  assert.equal(G.digestStatus('sha-256=:abc=:', 'abd='), 'differs');
  assert.equal(G.digestStatus(null, 'abc='), 'not declared');
});

test('loading a node follows its peers one hop, verifies digests and survives a failing peer', async () => {
  const ga = JSON.stringify(graphA), gb = JSON.stringify(graphB);
  const routes = {
    [`${A}/.well-known/knowledge-linkset`]: JSON.stringify(linkset(A, ga, [B, C])),
    [`${A}/graph.jsonld`]: ga,
    [`${B}/.well-known/knowledge-linkset`]: JSON.stringify(linkset(B, gb + ' ', [A])), // declares a digest of other bytes
    [`${B}/graph.jsonld`]: gb,
    // C never answers: the 8-second limit, shortened here
    [`${C}/.well-known/knowledge-linkset`]: () => new Promise(() => {}),
  };
  const log = [];
  const net = await G.loadNetwork(`${A}/`, { fetch: fakeFetch(routes, log), sha256, timeoutMs: 50 });
  assert.equal(net.nodes.length, 3);
  const [a, b, c] = net.nodes;
  assert.equal(a.digest, 'verified');
  assert.equal(b.digest, 'differs');
  assert.equal(a.version, 'v1.0.0');
  assert.match(c.error, /no answer in/);
  assert.equal(net.model.nodes.length, 7);
  assert.ok(net.model.links.some(l => l.rel === 'peer' && l.source === `${A}/` && l.target === `${B}/`));
  assert.ok(!log.includes(`${A}/.well-known/knowledge-linkset`) || log.filter(u => u === `${A}/.well-known/knowledge-linkset`).length === 1, 'the start node is read once, not again as the peer of its peer');
  // depth 0: the node alone
  const alone = await G.loadNetwork(`${A}/graph.jsonld`, { fetch: fakeFetch(routes), sha256, depth: 0 });
  assert.equal(alone.nodes.length, 1);
  assert.equal(alone.nodes[0].graph, `${A}/graph.jsonld`);
});

test('a copy served elsewhere reads its own files: hrefs on the published origin are rebased', async () => {
  const L = 'http://127.0.0.1:8080', ga = JSON.stringify(graphA);
  const routes = { [`${L}/.well-known/knowledge-linkset`]: JSON.stringify(linkset(A, ga, [])), [`${L}/graph.jsonld`]: ga };
  const net = await G.loadNetwork(`${L}/`, { fetch: fakeFetch(routes), sha256 });
  assert.equal(net.nodes[0].graph, `${L}/graph.jsonld`);
  assert.equal(net.nodes[0].chunks, `${L}/chunks.jsonl`);
  assert.equal(net.nodes[0].digest, 'verified');
  assert.equal(net.nodes[0].anchor, `${A}/`);
});

test('a node with no discovery document still draws from its graph file, and a missing graph is an error on that node only', async () => {
  const ga = JSON.stringify(graphA);
  const net = await G.loadNetwork(`${A}/graph.jsonld`, { fetch: fakeFetch({ [`${A}/graph.jsonld`]: ga }), sha256 });
  assert.equal(net.nodes[0].error, null);
  assert.equal(net.nodes[0].digest, 'not declared');
  assert.equal(net.model.nodes.length, 5);
  const none = await G.loadNetwork(`${C}/`, { fetch: fakeFetch({}), sha256 });
  assert.match(none.nodes[0].error, /HTTP 404/);
  assert.equal(none.model.nodes.length, 0);
  await assert.rejects(G.loadNetwork('javascript:alert(1)', { fetch: fakeFetch({}) }), /not an http\(s\) address/);
});

test('a node that names too many peers or too large a file is cut, and the cut is reported', async () => {
  const ga = JSON.stringify(graphA);
  const many = Array.from({ length: 20 }, (_, i) => `https://p${i}.example.org`);
  const routes = { [`${A}/.well-known/knowledge-linkset`]: JSON.stringify(linkset(A, ga, many)), [`${A}/graph.jsonld`]: ga };
  const log = [];
  const net = await G.loadNetwork(`${A}/`, { fetch: fakeFetch(routes, log), sha256, timeoutMs: 50 });
  assert.equal(G.MAX_PEERS, 16);
  assert.equal(net.nodes.length, 1 + 16, 'sixteen peers read, the other four left out');
  assert.equal(log.filter(u => /p1[6-9]\.example/.test(u)).length, 0, 'no request to a peer past the cap');
  assert.match(net.nodes[0].cut.join(' '), /20 peers named, 16 read/);
  assert.deepEqual(net.cuts, [`${A.replace('https://', '')}: 20 peers named, 16 read`]);
  // a file above the byte cap: refused, from its declared length or from what was read
  assert.equal(G.MAX_BYTES, 10 * 1024 * 1024);
  const big = JSON.stringify({ '@graph': [{ '@id': `${C}/`, '@type': 'Bundle', pad: 'x'.repeat(5000) }] });
  const bigRoutes = { [`${C}/graph.jsonld`]: big };
  const cut = await G.loadNetwork(`${C}/graph.jsonld`, { fetch: fakeFetch(bigRoutes), sha256, maxBytes: 1000 });
  assert.match(cut.nodes[0].error, /larger than 1000 bytes/);
  assert.equal(cut.model.nodes.length, 0);
  const declared = async url => (url === `${C}/graph.jsonld` ? { ok: true, status: 200, headers: { get: k => (k.toLowerCase() === 'content-length' ? '999999999' : null) }, arrayBuffer: async () => { throw new Error('the body must not be read'); }, text: async () => '' } : { ok: false, status: 404 });
  const early = await G.loadNetwork(`${C}/graph.jsonld`, { fetch: declared, sha256 });
  assert.match(early.nodes[0].error, /larger than 10 MB/);
  // a link set above the cap counts as no link set: the graph file is still read
  const lsBig = { [`${A}/.well-known/knowledge-linkset`]: JSON.stringify(linkset(A, ga, [])) + ' '.repeat(3000), [`${A}/graph.jsonld`]: ga };
  const still = await G.loadNetwork(`${A}/`, { fetch: fakeFetch(lsBig), sha256, maxBytes: 2900 });
  assert.equal(still.model.nodes.length, 5);
});

test('a Source or a Bundle with no summary field gets a short description from what the graph and the link set say', () => {
  const src = { id: `${A}/concepts/item/#source-1`, type: 'Source', raw: graphA['@graph'][4] };
  assert.equal(G.fallbackSummary(src, 'en'), `A source: AGSC-00-04, at ${A}/specs/00/#AGSC-00-04`);
  assert.equal(G.fallbackSummary({ type: 'Source', raw: { title: 'Only a title' } }, 'en'), 'A source: Only a title');
  assert.equal(G.fallbackSummary({ type: 'Source', raw: { 'dcterms:source': 'javascript:alert(1)' } }, 'en'), '');
  const bundle = { id: `${A}/`, type: 'Bundle', raw: { '@id': `${A}/`, specVersion: '1.0.0' } };
  const info = { version: 'v1.0.0', counts: ['clusters=3', 'concepts=13', 'episodes=0', 'procedures=1', 'nonsense'] };
  assert.equal(G.fallbackSummary(bundle, 'en', info), 'The root of the knowledge node at a.example.org: 3 clusters, 13 concepts, 1 procedure; specification 1.0.0; version v1.0.0.');
  assert.equal(G.fallbackSummary(bundle, 'en'), 'The root of the knowledge node at a.example.org; specification 1.0.0.');
  assert.equal(G.fallbackSummary({ type: 'Concept', raw: {} }, 'en'), '', 'only a Source or a Bundle has a fallback');
  assert.ok(G.fallbackSummary({ type: 'Source', raw: { title: 'w '.repeat(400) } }, 'en').length <= 300);
});
