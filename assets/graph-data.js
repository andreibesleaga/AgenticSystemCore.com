/* AgenticSystemCore.com graph explorer: the data half. Pure functions over the files a node
   publishes (its discovery document, graph.jsonld and chunks.jsonl), and the loader that follows
   the node's peer links. No DOM. In a page this file defines `window.AGSCGraph`; under Node it is
   a module, so scripts/graph-explorer.test.js runs the same code. Nothing here sends anything but
   GET requests for published files, and nothing read is ever turned into markup or code. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AGSCGraph = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const REL = 'https://w3id.org/agentic-system-core/rel#';
  const WELLKNOWN = '/.well-known/knowledge-linkset';
  // The fields an item's summary is read from, first present wins, in the page's language.
  const SUMMARY_KEYS = ['definition', 'description', 'schema:description', 'skos:definition', 'dcterms:abstract',
    'https://schema.org/description', 'http://www.w3.org/2004/02/skos/core#definition', 'http://purl.org/dc/terms/abstract'];
  // Where a graph names a page for a node whose identifier is not itself a page of a known node.
  const PAGE_KEYS = ['schema:url', 'url', 'foaf:page', 'page', 'https://schema.org/url'];
  // The relations that make the tree: a cluster's members, an item's sources, a broader term's narrower ones.
  const TREE_RELS = new Set(['member', 'source', 'narrower', 'hasPart', 'schema:hasPart']);
  const ORDER = ['Bundle', 'Cluster', 'Concept', 'Procedure', 'Episode', 'Lesson', 'Gate', 'Task', 'Source'];
  const SUMMARY_MAX = 300;
  const TIMEOUT_MS = 8000;
  // Limits on what one address can make a visitor's browser read: the peers followed from each
  // node, and the bytes of each file. What is cut is reported, never silently dropped.
  const MAX_PEERS = 16;
  const MAX_BYTES = 10 * 1024 * 1024;
  // Limits on what is drawn: a graph larger than this would hold the visitor's tab for seconds in
  // the force layout. The first nodes of the merged order (the opened node's first) are drawn, and
  // the status line says how many were left out.
  const MAX_NODES = 5000;
  const MAX_LINKS = 10000;

  const asArray = v => (v == null ? [] : Array.isArray(v) ? v : [v]);
  const iriOf = v => (typeof v === 'string' ? v : v && typeof v === 'object' && typeof v['@id'] === 'string' ? v['@id'] : null);

  /** The text of a JSON-LD value in the language `lang`: a string, a value object, an array of
   *  either, or a language map. A value in `lang` wins, then one with no language, then the first. */
  function textOf(v, lang) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (Array.isArray(v)) {
      const vals = v.filter(x => x != null);
      const pick = vals.find(x => x && typeof x === 'object' && x['@language'] === lang)
        || vals.find(x => typeof x === 'string' || (x && typeof x === 'object' && '@value' in x && !x['@language']))
        || vals[0];
      return pick === undefined ? '' : textOf(pick, lang);
    }
    if (typeof v === 'object') {
      if ('@value' in v) return v['@value'] == null ? '' : String(v['@value']);
      if ('@id' in v) return String(v['@id']);
      const keys = Object.keys(v);
      if (keys.length && keys.every(k => /^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/.test(k))) return textOf(v[lang] !== undefined ? v[lang] : v[keys.sort()[0]], lang);
    }
    return '';
  }
  const typeOf = raw => String(asArray(raw['@type'])[0] || 'Thing').replace(/^.*[#/]/, '') || 'Thing';
  function labelOf(raw, lang) {
    for (const k of ['prefLabel', 'skos:prefLabel', 'title', 'name', 'schema:name', 'rdfs:label', 'label']) {
      const t = textOf(raw[k], lang).trim();
      if (t) return t;
    }
    const id = String(raw['@id'] || '');
    const frag = /#(.+)$/.exec(id);
    if (frag) return frag[1];
    const parts = id.replace(/\/+$/, '').split('/');
    return parts[parts.length - 1] || id;
  }

  /** `s` as an absolute http(s) address (resolved against `base`), or null for any other scheme. */
  function httpUrl(s, base) {
    if (typeof s !== 'string' || s.trim() === '') return null;
    let u;
    try { u = base ? new URL(s.trim(), base) : new URL(s.trim()); } catch { return null; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.username || u.password) return null;
    return u.href;
  }
  /** An address safe to put in a link's href: http(s) only. */
  const safeHref = s => httpUrl(s);
  const originOf = s => { try { return new URL(s).origin; } catch { return null; } };

  /** What the Node field names: a site root (or any page of it), a discovery document or a graph file.
   *  Returns the discovery document to read and, when the address names one, the graph file itself. */
  function resolveAddress(input, base) {
    let s = typeof input === 'string' ? input.trim() : '';
    const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(s);
    const isPath = /^(?:\/|\.\.?\/)/.test(s); // "/graph.jsonld", "./x", "../x": read against the page
    const isHost = /^[^\s/]+\.[^\s/]+/.test(s); // "example.org" or "example.org/path"
    if (s && !hasScheme && !isPath) {
      if (!isHost) return null; // "foo", "not a url": not an address
      s = `https://${s}`;
    }
    const href = httpUrl(s, base);
    if (!href) return null;
    const u = new URL(href);
    u.hash = '';
    if (u.pathname === WELLKNOWN) { u.search = ''; return { origin: u.origin, linkset: u.href, graph: null }; }
    if (/\.jsonld$/i.test(u.pathname)) return { origin: u.origin, linkset: u.origin + WELLKNOWN, graph: u.href };
    return { origin: u.origin, linkset: u.origin + WELLKNOWN, graph: null };
  }

  /** The link-context object of an RFC 9264 link set (the first one, which a node's document is). */
  const contextOf = doc => (doc && Array.isArray(doc.linkset) && doc.linkset[0] && typeof doc.linkset[0] === 'object' ? doc.linkset[0] : {});
  const linksOf = (doc, rel) => asArray(contextOf(doc)[rel]).filter(l => l && typeof l.href === 'string');
  const anchorOf = doc => httpUrl(contextOf(doc).anchor);
  /** The discovery documents of the peers this node declares (…/rel#peer), http(s) only, each once. */
  function peersOf(doc, base) {
    const out = [];
    for (const l of linksOf(doc, `${REL}peer`)) { const h = httpUrl(l.href, base); if (h && !out.includes(h)) out.push(h); }
    return out;
  }
  const firstOf = v => (Array.isArray(v) ? v[0] : v);
  /** The node's graph.jsonld and its declared digest: the `describedby` link to JSON-LD, else a
   *  `…/rel#graph` link to a .jsonld file; null when the document names none. */
  function graphLinkOf(doc, base) {
    const isLd = l => /ld\+json/.test(String(l.type || '')) || /\.jsonld(?:$|[?#])/.test(l.href);
    const l = linksOf(doc, 'describedby').find(isLd) || linksOf(doc, `${REL}graph`).find(isLd);
    if (!l) return null;
    const href = httpUrl(l.href, base);
    return href ? { href, digest: firstOf(l.digest) || null, version: firstOf(l['agsc-bundle-version']) || null, generatedAt: firstOf(l['agsc-generated-at']) || null, counts: asArray(l['agsc-counts']).map(String) } : null;
  }
  /** The chunk export the node declares as an agent surface, or null. */
  function chunksLinkOf(doc, base) {
    const l = linksOf(doc, `${REL}surface`).find(x => firstOf(x['agsc-surface']) === 'chunks');
    return l ? httpUrl(l.href, base) : null;
  }
  const licenseOf = (doc, base) => { const l = linksOf(doc, 'license')[0]; return l ? httpUrl(l.href, base) : null; };
  /** An address on `from` moved to `to` (same path): a copy of a node served elsewhere, such as a
   *  preview or a local server, reads its own files, not the published origin's. */
  function rebase(href, from, to) {
    if (!href || !from || !to || from === to) return href;
    return originOf(href) === from ? to + href.slice(from.length) : href;
  }

  /** One node's graph.jsonld as nodes and links. `src` is the index of the node it came from. */
  function parseGraph(doc, src, lang) {
    const g = Array.isArray(doc) ? doc : doc && Array.isArray(doc['@graph']) ? doc['@graph'] : [];
    const nodes = [], byId = new Map(), links = [], seen = new Set();
    for (const raw of g) {
      if (!raw || typeof raw !== 'object') continue;
      const id = iriOf(raw);
      if (!id || byId.has(id)) continue;
      const n = { id, type: typeOf(raw), label: labelOf(raw, lang), raw, src, deg: 0, ext: [] };
      byId.set(id, n); nodes.push(n);
    }
    for (const n of nodes) {
      for (const k of Object.keys(n.raw)) {
        if (k === '@id' || k === '@type' || k === '@context') continue;
        for (const v of asArray(n.raw[k])) {
          const t = iriOf(v);
          if (!t || t === n.id) continue;
          if (byId.has(t)) {
            const key = `${n.id}\n${k}\n${t}`;
            if (!seen.has(key)) { seen.add(key); links.push({ source: n.id, target: t, rel: k }); }
          } else if (httpUrl(t)) n.ext.push({ rel: k, iri: t });
        }
      }
    }
    return { nodes, links };
  }
  const typeRank = t => { const i = ORDER.indexOf(t); return i < 0 ? ORDER.length : i; };
  const sameIri = (byId, iri) => byId.get(iri) || byId.get(iri.endsWith('/') ? iri.slice(0, -1) : `${iri}/`) || null;

  /** Several nodes' graphs as one picture: the union of their nodes (the first graph to name an
   *  identifier keeps it), their own links, a `peer` link between the Bundle roots of every declared
   *  peer pair, and a link wherever an item of one graph names a node of another. */
  function merge(parts, peerPairs) {
    const nodes = [], byId = new Map(), links = [], seen = new Set();
    const add = (s, t, rel, extra) => {
      const key = `${s}\n${rel}\n${t}`;
      if (s === t || seen.has(key)) return;
      seen.add(key); links.push(Object.assign({ source: s, target: t, rel }, extra || {}));
    };
    for (const p of parts) for (const n of p.nodes) if (!byId.has(n.id)) { const c = Object.assign({}, n, { deg: 0 }); byId.set(n.id, c); nodes.push(c); }
    for (const p of parts) for (const l of p.links) add(l.source, l.target, l.rel);
    for (const n of nodes) for (const e of n.ext) { const t = sameIri(byId, e.iri); if (t && t.src !== n.src) add(n.id, t.id, e.rel, { cross: true }); }
    const roots = new Map();
    for (const n of nodes) if (n.type === 'Bundle' && !roots.has(n.src)) roots.set(n.src, n.id);
    for (const [a, b] of peerPairs || []) if (roots.has(a) && roots.has(b)) add(roots.get(a), roots.get(b), 'peer', { cross: true });
    const adj = new Map(nodes.map(n => [n.id, []]));
    for (const l of links) { adj.get(l.source).push({ id: l.target, rel: l.rel, dir: 'out' }); adj.get(l.target).push({ id: l.source, rel: l.rel, dir: 'in' }); byId.get(l.source).deg++; byId.get(l.target).deg++; }
    nodes.sort((a, b) => a.src - b.src || typeRank(a.type) - typeRank(b.type) || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0) || (a.id < b.id ? -1 : 1));
    return { nodes, links, byId, adj, roots };
  }

  /** `model` cut to at most `maxNodes` nodes (the first ones in its order) and `maxLinks` links
   *  between them, its degrees and adjacency recomputed. Returns { model, cut } where `cut` lists
   *  what was left out, or the model itself and an empty list when it is within both limits. */
  function capModel(model, maxNodes, maxLinks) {
    const mn = maxNodes || MAX_NODES, ml = maxLinks || MAX_LINKS;
    if (model.nodes.length <= mn && model.links.length <= ml) return { model, cut: [] };
    const cut = [];
    const nodes = model.nodes.slice(0, mn).map(n => Object.assign({}, n, { deg: 0 }));
    if (model.nodes.length > mn) cut.push(`${model.nodes.length} nodes, the first ${mn} drawn`);
    const byId = new Map(nodes.map(n => [n.id, n]));
    let links = model.links.filter(l => byId.has(l.source) && byId.has(l.target));
    if (links.length > ml) { cut.push(`${links.length} links between them, the first ${ml} drawn`); links = links.slice(0, ml); }
    const adj = new Map(nodes.map(n => [n.id, []]));
    for (const l of links) { adj.get(l.source).push({ id: l.target, rel: l.rel, dir: 'out' }); adj.get(l.target).push({ id: l.source, rel: l.rel, dir: 'in' }); byId.get(l.source).deg++; byId.get(l.target).deg++; }
    const roots = new Map([...model.roots].filter(([, id]) => byId.has(id)));
    return { model: { nodes, links, byId, adj, roots }, cut };
  }

  /** The tree: each Bundle root, its clusters, their members, the members' sources; an item in no
   *  cluster hangs from its Bundle; a peer's Bundle hangs from the Bundle that declared it. */
  function treeLinks(model) {
    const out = [], parent = new Set();
    const put = (s, t, rel) => { if (!parent.has(t) && s !== t) { out.push({ source: s, target: t, rel }); parent.add(t); } };
    for (const l of model.links) if (l.rel === 'peer') put(l.source, l.target, 'peer');
    for (const l of model.links) if (TREE_RELS.has(l.rel) && !l.cross) put(l.source, l.target, l.rel);
    for (const n of model.nodes) {
      const root = model.roots.get(n.src);
      if (!root || n.id === root || parent.has(n.id)) continue;
      if (n.type === 'Cluster') put(root, n.id, 'cluster of');
    }
    for (const n of model.nodes) {
      const root = model.roots.get(n.src);
      if (!root || n.id === root || parent.has(n.id) || n.type === 'Source') continue;
      put(root, n.id, 'in scheme');
    }
    return out;
  }

  /** At most `max` characters, cut at a word boundary, with an ellipsis when cut. */
  function truncate(s, max) {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    const m = max || SUMMARY_MAX;
    if (t.length <= m) return t;
    const cut = t.slice(0, m - 1), sp = cut.lastIndexOf(' ');
    return `${(sp > m * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.]+$/, '')}…`;
  }
  /** A node's summary as its page shows it: the first present summary field, in `lang`, shortened. */
  function summaryText(raw, lang, max) {
    for (const k of SUMMARY_KEYS) { const t = textOf(raw && raw[k], lang).trim(); if (t) return truncate(t, max || SUMMARY_MAX); }
    return '';
  }
  /** The web page of a node: its identifier when that is an http(s) page on a known node's origin,
   *  else a page the graph names for it (schema:url and the like), else null. */
  function pageHref(node, knownOrigins) {
    const id = safeHref(node.id);
    if (id && knownOrigins && knownOrigins.has(originOf(id))) return id;
    for (const k of PAGE_KEYS) for (const v of asArray(node.raw && node.raw[k])) { const h = safeHref(iriOf(v) || textOf(v)); if (h) return h; }
    return null;
  }

  /** For a Source or a Bundle, which carry no summary field: what the graph (and, for a Bundle,
   *  the node's link set: `info` = { version, counts }) says of it, in one short sentence. */
  function fallbackSummary(n, lang, info) {
    const raw = (n && n.raw) || {};
    if (n && n.type === 'Source') {
      const title = (textOf(raw.title, lang) || textOf(raw['dcterms:title'], lang)).trim();
      const at = httpUrl(iriOf(asArray(raw['dcterms:source'])[0]) || textOf(raw['dcterms:source'], lang));
      if (title && at) return truncate(`A source: ${title}, at ${at}`);
      if (title) return truncate(`A source: ${title}`);
      return at ? truncate(`A source at ${at}`) : '';
    }
    if (n && n.type === 'Bundle') {
      const id = httpUrl(n.id || raw['@id']);
      const host = id ? new URL(id).host : '';
      const counts = asArray(info && info.counts).map(c => /^([a-z]+)=(\d+)$/.exec(String(c))).filter(m => m && Number(m[2]) > 0)
        .map(m => `${m[2]} ${Number(m[2]) === 1 ? m[1].replace(/s$/, '') : m[1]}`);
      const spec = textOf(raw.specVersion, lang).trim();
      const version = info && info.version ? String(info.version) : '';
      return truncate(`The root of the knowledge node${host ? ` at ${host}` : ''}${counts.length ? `: ${counts.join(', ')}` : ''}${spec ? `; specification ${spec}` : ''}${version ? `; version ${version}` : ''}.`);
    }
    return '';
  }

  /** The chunks of one item from a chunks.jsonl text, in section order. Bad lines are skipped. */
  function parseChunks(text, iri) {
    const out = [];
    for (const line of String(text || '').split('\n')) {
      if (!line.trim()) continue;
      let c; try { c = JSON.parse(line); } catch { continue; }
      if (c && c.iri === iri) out.push({ section: String(c.section || ''), ordinal: Number(c.ordinal) || 0, digest: String(c.digest || ''), text: String(c.text || ''), title: String(c.title || '') });
    }
    return out.sort((a, b) => a.ordinal - b.ordinal);
  }
  /** "verified", "differs" or "not declared": an RFC 9530 `sha-256=:<base64>:` against the base64 SHA-256 of the bytes read. */
  function digestStatus(declared, actualB64) {
    const m = /^sha-256=:([A-Za-z0-9+/=]+):$/.exec(String(declared || ''));
    if (!m) return 'not declared';
    return m[1] === actualB64 ? 'verified' : 'differs';
  }

  /** Reads a node and its peers, `depth` hops out (1 = the peers the node declares).
   *  opts: fetch (the platform's), sha256 (bytes -> base64 promise), lang, timeoutMs, base (the page's own address).
   *  Every node is { url, origin, anchor, linkset, graph, chunks, license, digest, version, counts, depth, error, doc, parsed }.
   *  A failure is recorded on its node and never stops the others. */
  async function loadNetwork(address, opts) {
    const o = Object.assign({ depth: 1, timeoutMs: TIMEOUT_MS, lang: 'en', maxPeers: MAX_PEERS, maxBytes: MAX_BYTES, maxNodes: MAX_NODES, maxLinks: MAX_LINKS }, opts || {});
    const start = resolveAddress(address, o.base);
    if (!start) throw new Error('not an http(s) address');
    const sizeText = m => (m % (1024 * 1024) === 0 ? `${m / 1024 / 1024} MB` : `${m} bytes`);
    const tooBig = () => new Error(`larger than ${sizeText(o.maxBytes)}, not read`);
    /** The body of `r`, at most o.maxBytes: refused from its declared length, else while it streams. */
    async function readCapped(r) {
      const len = r.headers && typeof r.headers.get === 'function' ? Number(r.headers.get('content-length')) : NaN;
      if (Number.isFinite(len) && len > o.maxBytes) throw tooBig();
      if (r.body && typeof r.body.getReader === 'function') {
        const reader = r.body.getReader(), chunks = [];
        let total = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.length;
          if (total > o.maxBytes) { try { reader.cancel(); } catch (e) { /* already closed */ } throw tooBig(); }
          chunks.push(value);
        }
        const out = new Uint8Array(total);
        let at = 0; for (const c of chunks) { out.set(c, at); at += c.length; }
        return out;
      }
      const out = new Uint8Array(await r.arrayBuffer());
      if (out.length > o.maxBytes) throw tooBig();
      return out;
    }
    const decoder = typeof TextDecoder === 'function' ? new TextDecoder('utf-8') : null;
    const decode = bytes => (decoder ? decoder.decode(bytes) : Buffer.from(bytes).toString('utf8'));
    /** One published file, as bytes, within the time and size limits. */
    const get = async (url, kind) => {
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      let timer = null;
      const late = `no answer in ${Math.round(o.timeoutMs / 1000)} s`;
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => { if (ctl) ctl.abort(); reject(new Error(late)); }, o.timeoutMs); });
      const read = (async () => {
        const r = await o.fetch(url, { headers: { Accept: kind === 'json' ? 'application/ld+json, application/linkset+json, application/json' : '*/*' }, credentials: 'omit', redirect: 'follow', signal: ctl ? ctl.signal : undefined });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return readCapped(r);
      })();
      read.catch(() => {}); // a read that loses the race to the timer is settled quietly
      try {
        return await Promise.race([read, timeout]);
      } catch (e) {
        throw new Error(e && e.name === 'AbortError' ? late : e && e.message === 'Failed to fetch' ? 'blocked or unreachable (CORS, network or this page\'s connect policy)' : (e && e.message) || String(e));
      } finally { clearTimeout(timer); }
    };
    const nodes = [], pairs = [], seen = new Set();
    async function one(linksetUrl, graphUrl, depth, from) {
      const node = { url: linksetUrl, origin: originOf(linksetUrl), anchor: null, linkset: linksetUrl, graph: graphUrl, chunks: null, license: null, digest: 'not declared', version: null, counts: [], depth, from, error: null, doc: null, parsed: null, peers: [], cut: [] };
      const index = nodes.push(node) - 1;
      if (from !== null) pairs.push([from, index]);
      let ls = null;
      try { ls = JSON.parse(decode(await get(linksetUrl, 'json'))); } catch (e) { node.lsError = e.message; }
      if (ls) {
        node.anchor = anchorOf(ls);
        const anchorOrigin = node.anchor ? originOf(node.anchor) : null;
        const move = h => rebase(h, anchorOrigin, node.origin);
        if (anchorOrigin) seen.add(anchorOrigin);
        const gl = graphLinkOf(ls, linksetUrl);
        if (!graphUrl && gl) node.graph = move(gl.href);
        if (gl && move(gl.href) === node.graph) { node.declaredDigest = gl.digest; node.version = gl.version; node.counts = gl.counts; node.generatedAt = gl.generatedAt; }
        node.chunks = move(chunksLinkOf(ls, linksetUrl));
        node.license = licenseOf(ls, linksetUrl);
        node.peers = peersOf(ls, linksetUrl);
      }
      if (!node.graph) node.graph = `${node.origin}/graph.jsonld`;
      if (!node.chunks) node.chunks = `${originOf(node.graph)}/chunks.jsonl`;
      try {
        const bytes = await get(node.graph, 'bytes');
        node.doc = JSON.parse(decode(bytes));
        node.parsed = parseGraph(node.doc, index, o.lang);
        if (node.declaredDigest && o.sha256) node.digest = digestStatus(node.declaredDigest, await o.sha256(bytes));
        if (!node.anchor) { const b = node.parsed.nodes.find(n => n.type === 'Bundle'); node.anchor = b ? safeHref(b.id) : null; }
      } catch (e) {
        node.error = node.lsError && !ls ? `${node.lsError}; graph: ${e.message}` : e.message;
      }
      seen.add(node.origin);
      if (node.anchor) seen.add(originOf(node.anchor));
      return node;
    }
    const first = await one(start.linkset, start.graph, 0, null);
    let frontier = [[0, first]];
    for (let d = 1; d <= o.depth; d++) {
      const next = [];
      for (const [i, n] of frontier) {
        if (n.peers.length > o.maxPeers) n.cut.push(`${n.peers.length} peers named, ${o.maxPeers} read`);
        for (const p of n.peers.slice(0, o.maxPeers)) {
          const po = originOf(p);
          if (seen.has(po)) { const j = nodes.findIndex(x => x.origin === po || (x.anchor && originOf(x.anchor) === po)); if (j >= 0 && j !== i && !pairs.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) pairs.push([i, j]); continue; }
          seen.add(po);
          next.push(one(p, null, d, i).then(m => [nodes.indexOf(m), m]));
        }
      }
      frontier = await Promise.all(next);
    }
    const parts = nodes.filter(n => n.parsed).map(n => n.parsed);
    const capped = capModel(merge(parts, pairs.filter(([a, b]) => nodes[a].parsed && nodes[b].parsed)), o.maxNodes, o.maxLinks);
    const cuts = nodes.flatMap(n => n.cut.map(c => `${new URL(n.origin).host}: ${c}`)).concat(capped.cut.map(c => `picture: ${c}`));
    return { nodes, model: capped.model, start, cuts };
  }

  return { REL, WELLKNOWN, SUMMARY_KEYS, TREE_RELS, ORDER, SUMMARY_MAX, TIMEOUT_MS, MAX_PEERS, MAX_BYTES, MAX_NODES, MAX_LINKS, asArray, iriOf, textOf, typeOf, labelOf, httpUrl, safeHref, originOf, resolveAddress, linksOf, anchorOf, peersOf, graphLinkOf, chunksLinkOf, licenseOf, rebase, parseGraph, merge, capModel, treeLinks, truncate, summaryText, fallbackSummary, pageHref, parseChunks, digestStatus, loadNetwork };
});
