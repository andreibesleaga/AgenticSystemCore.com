'use strict';
// AgenticSystemCore page tools (AGSC-09-13, AGSC-09-16). GENERATED — every
// function below is the SOURCE TEXT of the function Node runs, so the local
// tools and the page tools cannot drift. No network beyond this origin, no key,
// no server, no cookie, no storage.
// spec_version: 1.0.0-rc.6
(function () {
function pageTerms() {
  return 'LicenseRef-AgenticSystemCore-Content-Use-1.0';
}
function pageNoAnswer() {
  return 'no answer in this memory';
}
function pageLinkKeys() {
  return ['related', 'broader', 'narrower', 'uses', 'requires', 'excludes', 'derived-from',
    'contradicts', 'supersedes', 'implements', 'verifies', 'covers', 'blocked-by', 'decided-by'];
}
function pageInverseKeys() {
  return {
    'blocked-by': 'blocks',
    broader: 'narrower',
    contradicts: 'contradicts',
    covers: 'covered-by',
    'decided-by': 'decides',
    'derived-from': 'derivation-of',
    excludes: 'excludes',
    implements: 'implemented-by',
    narrower: 'broader',
    related: 'related',
    requires: 'required-by',
    supersedes: 'superseded-by',
    uses: 'used-by',
    verifies: 'verified-by',
  };
}
function pageTypePlural(type) {
  return type === 'cluster' ? 'clusters' : `${String(type === undefined || type === null ? 'concept' : type)}s`;
}
function pageTypedScalars() {
  return {
    cost_usd: 'number',
    estimate: 'boolean',
    order: 'integer',
    signature: 'boolean',
    tokens_in: 'integer',
    tokens_out: 'integer',
  };
}
function pageApplyTypes(value, key) {
  const typed = pageTypedScalars();
  if (Array.isArray(value)) return value.map((v) => pageApplyTypes(v, key));
  if (value !== null && typeof value === 'object') {
    const out = {};
    const names = Object.keys(value);
    for (let i = 0; i < names.length; i += 1) out[names[i]] = pageApplyTypes(value[names[i]], names[i]);
    return out;
  }
  const type = typed[key];
  if (type === undefined || typeof value !== 'string') return value;
  if (type === 'integer' && /^-?(?:0|[1-9][0-9]*)$/u.test(value)) return Number(value);
  if (type === 'number' && /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][-+]?[0-9]+)?$/u.test(value)) return Number(value);
  if (type === 'boolean' && (value === 'true' || value === 'false')) return value === 'true';
  return value;
}
function pageKindToType() {
  // FV29-01: prototype-free. `kinds[args.kind]` is the guard `remember` uses to fall
  // back to `concept`; on a plain object literal it answered a function for
  // `constructor` and the item's `type` became the `Object` constructor.
  const kinds = Object.create(null);
  kinds.concept = 'concept';
  kinds.episode = 'episode';
  kinds.gate = 'gate';
  kinds.lesson = 'lesson';
  kinds.procedure = 'procedure';
  return kinds;
}
function pageEnvelope(source, type, body) {
  return { body, license: pageTerms(), source, trust: 'untrusted', type };
}
function pageErrorEnvelope(source, code, message) {
  return pageEnvelope(source, 'error', { code, message: message === undefined ? '' : message });
}
function pageBaseIri(base) {
  return `${String(base === undefined || base === null ? '/' : base).replace(/\/+$/, '')}/`;
}
function pageItemIri(base, type, slug) {
  return `${pageBaseIri(base)}${pageTypePlural(type)}/${slug}/`;
}
function pageNfc(text) {
  const value = String(text === undefined || text === null ? '' : text);
  return typeof value.normalize === 'function' ? value.normalize('NFC') : value;
}
function pageTokenize(text) {
  const lowered = pageNfc(text).replace(/[A-Z]/g, (c) => c.toLowerCase());
  const parts = lowered.split(/[^a-z0-9\p{L}\p{Nd}\p{M}]+/u);
  const out = [];
  for (let i = 0; i < parts.length; i += 1) {
    if (Array.from(parts[i]).length >= 2) out.push(parts[i]);
  }
  return out;
}
function pageAnchorOf(text) {
  return pageNfc(text)
    .replace(/[A-Z]/g, (c) => c.toLowerCase())
    .replace(/[^a-z0-9 -]/gu, '')
    .replace(/ /g, '-')
    .replace(/-+/g, '-')
    .replace(/^-/, '')
    .replace(/-$/, '');
}
function pageSlugify(title) {
  const base = pageAnchorOf(title);
  return base === '' ? 'note' : base;
}
function pageDedupe(slug, taken) {
  if (!taken || typeof taken.has !== 'function' || !taken.has(slug)) return slug;
  let n = 2;
  while (taken.has(`${slug}-${n}`)) n += 1;
  return `${slug}-${n}`;
}
function pageSplitFrontmatter(text) {
  const source = String(text === undefined || text === null ? '' : text);
  if (source.slice(0, 4) !== '---\n') return { block: '', body: source, yamlText: '' };
  const end = source.indexOf('\n---\n', 3);
  if (end === -1) return { block: '', body: source, yamlText: '' };
  return {
    block: source.slice(0, end + 5),
    body: source.slice(end + 5),
    yamlText: source.slice(4, end + 1),
  };
}
function pageParseFrontmatter(yamlText) {
  const state = { i: 0, lines: String(yamlText === undefined || yamlText === null ? '' : yamlText).split('\n') };
  return pageParseMap(state, 0);
}
function pageIndentOf(line) {
  return line.length - line.replace(/^ +/, '').length;
}
function pageNextMeaningful(state) {
  while (state.i < state.lines.length) {
    const trimmed = state.lines[state.i].trim();
    if (trimmed === '' || trimmed.charAt(0) === '#') {
      state.i += 1;
      continue;
    }
    return true;
  }
  return false;
}
function pageParseMap(state, indent) {
  const out = {};
  for (;;) {
    if (!pageNextMeaningful(state)) return out;
    const line = state.lines[state.i];
    const at = pageIndentOf(line);
    if (at < indent) return out;
    const text = line.slice(at);
    if (text.charAt(0) === '-' && (text.length === 1 || text.charAt(1) === ' ')) return out;
    const colon = pageKeyEnd(text);
    if (colon === -1) {
      state.i += 1;
      continue;
    }
    const key = pageScalar(text.slice(0, colon).trim());
    const rest = text.slice(colon + 1).trim();
    state.i += 1;
    if (rest === '') {
      out[key] = pageParseValue(state, at);
    } else if (rest.charAt(0) === '|' || rest.charAt(0) === '>') {
      out[key] = pageBlockScalar(state, at, rest);
    } else {
      out[key] = pageScalar(rest);
    }
  }
}
function pageParseValue(state, parentIndent) {
  if (!pageNextMeaningful(state)) return '';
  const line = state.lines[state.i];
  const at = pageIndentOf(line);
  if (at <= parentIndent) return '';
  const text = line.slice(at);
  if (text.charAt(0) === '-' && (text.length === 1 || text.charAt(1) === ' ')) return pageParseSeq(state, at);
  return pageParseMap(state, at);
}
function pageParseSeq(state, indent) {
  const out = [];
  for (;;) {
    if (!pageNextMeaningful(state)) return out;
    const line = state.lines[state.i];
    const at = pageIndentOf(line);
    if (at !== indent) return out;
    const text = line.slice(at);
    if (!(text.charAt(0) === '-' && (text.length === 1 || text.charAt(1) === ' '))) return out;
    const after = text.slice(1);
    const rest = after.trim();
    const inner = indent + 1 + pageIndentOf(after);
    state.i += 1;
    if (rest === '') {
      out.push(pageParseValue(state, indent));
      continue;
    }
    const colon = pageKeyEnd(rest);
    if (colon === -1) {
      out.push(pageScalar(rest));
      continue;
    }
    const map = {};
    const key = pageScalar(rest.slice(0, colon).trim());
    const value = rest.slice(colon + 1).trim();
    if (value === '') map[key] = pageParseValue(state, inner);
    else if (value.charAt(0) === '|' || value.charAt(0) === '>') map[key] = pageBlockScalar(state, inner, value);
    else map[key] = pageScalar(value);
    const more = pageParseMap(state, inner);
    const names = Object.keys(more);
    for (let i = 0; i < names.length; i += 1) map[names[i]] = more[names[i]];
    out.push(map);
  }
}
function pageKeyEnd(text) {
  const quote = text.charAt(0);
  if (quote === '"' || quote === '\'') {
    for (let i = 1; i < text.length; i += 1) {
      if (text.charAt(i) === '\\' && quote === '"') {
        i += 1;
        continue;
      }
      if (text.charAt(i) === quote) return text.charAt(i + 1) === ':' ? i + 1 : -1;
    }
    return -1;
  }
  const at = text.indexOf(': ');
  if (at !== -1) return at;
  return text.slice(-1) === ':' ? text.length - 1 : -1;
}
function pageScalar(raw) {
  const text = String(raw);
  if (text.length >= 2 && text.charAt(0) === '\'' && text.slice(-1) === '\'') {
    return text.slice(1, -1).split('\'\'').join('\'');
  }
  if (text.length >= 2 && text.charAt(0) === '"' && text.slice(-1) === '"') {
    return text.slice(1, -1)
      .replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return text;
}
function pageBlockScalar(state, parentIndent, header) {
  const style = header.charAt(0);
  const collected = [];
  let blockIndent = -1;
  while (state.i < state.lines.length) {
    const line = state.lines[state.i];
    if (line.trim() !== '') {
      const at = pageIndentOf(line);
      if (at <= parentIndent) break;
      if (blockIndent === -1) blockIndent = at;
    }
    collected.push(line.trim() === '' ? '' : line.slice(blockIndent === -1 ? 0 : blockIndent));
    state.i += 1;
  }
  while (collected.length > 0 && collected[collected.length - 1] === '') collected.pop();
  const joined = style === '>' ? collected.join(' ') : collected.join('\n');
  const chomp = header.indexOf('-') !== -1 ? '' : '\n';
  return joined === '' ? '' : joined + chomp;
}
function pageShardRoutes(manifest) {
  const out = [];
  if (!manifest || !Array.isArray(manifest.shards)) return out;
  for (let i = 0; i < manifest.shards.length; i += 1) {
    const route = String(manifest.shards[i]);
    if (/^\/search-[0-9]{2,}\.json$/.test(route) && out.indexOf(route) === -1) out.push(route);
  }
  return out;
}
function pageIndexOf(map) {
  const sources = map || {};
  const parse = (route) => {
    if (typeof sources[route] !== 'string') return null;
    try {
      return JSON.parse(sources[route]);
    } catch (e) {
      return null;
    }
  };
  const root = parse('/search.json');
  if (root === null || typeof root !== 'object') return null;
  if (!Array.isArray(root.shards)) return root;

  const routes = pageShardRoutes(root);
  const missing = [];
  for (let i = 0; i < root.shards.length; i += 1) {
    const named = String(root.shards[i]);
    if (routes.indexOf(named) === -1) missing.push(named);
  }
  const docs = [];
  const terms = Object.create(null);
  for (let i = 0; i < routes.length; i += 1) {
    const shard = parse(routes[i]);
    if (shard === null || !Array.isArray(shard.docs)) {
      missing.push(routes[i]);
      continue;
    }
    const offset = docs.length;
    for (let d = 0; d < shard.docs.length; d += 1) docs.push(shard.docs[d]);
    const shardTerms = shard.terms || {};
    const names = Object.keys(shardTerms);
    for (let n = 0; n < names.length; n += 1) {
      const postings = shardTerms[names[n]];
      if (!Array.isArray(postings)) continue;
      if (terms[names[n]] === undefined) terms[names[n]] = [];
      for (let p = 0; p < postings.length; p += 1) terms[names[n]].push(postings[p] + offset);
    }
  }
  const total = typeof root.docs_total === 'number' ? root.docs_total : docs.length;
  const index = { docs, docs_total: total, terms };
  if (missing.length > 0 || docs.length !== total) {
    index.incomplete = true;
    index.missing = missing.length > 0 ? missing
      : [`${docs.length} document(s) over ${routes.length} shard(s) against docs_total ${total}`];
  }
  return index;
}
function pageCorpus(sources, options) {
  const map = sources || {};
  const opts = options || {};
  const base = pageBaseOf(map);
  const items = [];
  const routes = Object.keys(map).sort();
  for (let i = 0; i < routes.length; i += 1) {
    const route = routes[i];
    if (route.slice(0, 7) !== '/pages/' || route.slice(-3) !== '.md') continue;
    const slug = route.slice(7, route.length - 3);
    const split = pageSplitFrontmatter(map[route]);
    const frontmatter = pageApplyTypes(pageParseFrontmatter(split.yamlText), null);
    const type = typeof frontmatter.type === 'string' ? frontmatter.type : 'concept';
    items.push({
      block: split.block,
      body: split.body,
      frontmatter,
      path: `content/${pageTypePlural(type)}/${slug}.md`,
      slug,
      type,
    });
  }
  // FV29-01: a PROTOTYPE-FREE index. A plain object literal answers a function for
  // `constructor`, `toString`, `__proto__` and the rest of `Object.prototype`, so the
  // `item === undefined` guard of every tool below never fired for those names and a
  // page answered a SUCCESS envelope where `mcp-tools.js` (a `Map`) answers
  // `AGSC-E301` — an AGSC-09-16 divergence between the two transports.
  const bySlug = Object.create(null);
  for (let i = 0; i < items.length; i += 1) bySlug[items[i].slug] = items[i];
  // AGSC-06-21 (FV29-06): `/search.json` is the index at or below 500 items and the
  // MANIFEST above it. `pageIndexOf` reads both shapes, so the corpus carries one
  // index whatever the node's size.
  const index = pageIndexOf(map);
  return { base, bundleId: opts.bundleId, bySlug, index, items };
}
function pageBaseOf(map) {
  const raw = map['/.well-known/knowledge-linkset'];
  if (typeof raw === 'string') {
    try {
      const doc = JSON.parse(raw);
      const context = (doc && doc.linkset && doc.linkset[0]) || null;
      if (context && typeof context.anchor === 'string') return context.anchor;
    } catch (e) {
      // A document the page cannot read yields the relative base, never a guess.
    }
  }
  return '/';
}
function pageEdges(items) {
  const list = Array.isArray(items) ? items : [];
  // FV29-01: prototype-free, so a Link target spelled `constructor` resolves to
  // nothing rather than to a member of `Object.prototype`.
  const bySlug = Object.create(null);
  const byPath = Object.create(null);
  for (let i = 0; i < list.length; i += 1) {
    bySlug[list[i].slug] = list[i];
    byPath[list[i].path] = list[i];
  }
  const index = {};
  const edges = [];
  const add = (source, key, target, computed) => {
    const id = `${source}\u0000${key}\u0000${target}`;
    if (index[id] === undefined) {
      index[id] = { computed, key, source, target };
      edges.push(index[id]);
      return;
    }
    if (!computed) index[id].computed = false;
  };
  const inverse = pageInverseKeys();
  const keys = pageLinkKeys();
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    const fm = item.frontmatter || {};
    const names = Object.keys(fm);
    for (let k = 0; k < names.length; k += 1) {
      const key = names[k];
      if (keys.indexOf(key) === -1) continue;
      const values = Array.isArray(fm[key]) ? fm[key] : [fm[key]];
      for (let v = 0; v < values.length; v += 1) {
        const raw = values[v];
        if (typeof raw !== 'string') continue;
        const hash = raw.indexOf('#');
        const targetSlug = hash === -1 ? raw : raw.slice(0, hash);
        const fragment = hash === -1 ? null : raw.slice(hash + 1);
        const target = bySlug[targetSlug];
        if (target === undefined) continue;
        if (fragment !== null && pageAnchors(target.body).indexOf(fragment) === -1) continue;
        add(item.slug, key, targetSlug, false);
        add(targetSlug, inverse[key], item.slug, true);
      }
    }
  }
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    const targets = pageInlineTargets(item.body);
    for (let t = 0; t < targets.length; t += 1) {
      const target = pageResolveBodyReference(item, targets[t], byPath);
      if (target !== null) add(item.slug, 'mentions', target.slug, true);
    }
  }
  edges.sort((a, b) => pageCompare(a.source, b.source)
    || pageCompare(a.key, b.key)
    || pageCompare(a.target, b.target));
  return edges;
}
function pageCompare(a, b) {
  const left = Array.from(String(a));
  const right = Array.from(String(b));
  const n = left.length < right.length ? left.length : right.length;
  for (let i = 0; i < n; i += 1) {
    const x = left[i].codePointAt(0);
    const y = right[i].codePointAt(0);
    if (x !== y) return x < y ? -1 : 1;
  }
  return left.length === right.length ? 0 : (left.length < right.length ? -1 : 1);
}
function pageAnchors(body) {
  const lines = String(body === undefined || body === null ? '' : body).split('\n');
  const texts = [];
  let fence = '';
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const opened = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence !== '') {
      if (opened !== null && opened[1].charAt(0) === fence.charAt(0) && opened[1].length >= fence.length) fence = '';
      continue;
    }
    if (opened !== null) { fence = opened[1]; continue; }
    const heading = /^ {0,3}#{1,6}(?: +(.*))?$/.exec(line);
    if (heading === null) continue;
    texts.push(String(heading[1] === undefined ? '' : heading[1]).replace(/ +#+ *$/, '').trim());
  }
  let empties = 0;
  const first = texts.map((t) => {
    const a = pageAnchorOf(t);
    if (a !== '') return a;
    empties += 1;
    return `section-${empties}`;
  });
  const taken = {};
  return first.map((candidateBase) => {
    let n = 1;
    let candidate = candidateBase;
    while (taken[candidate] === true) {
      n += 1;
      candidate = `${candidateBase}-${n}`;
    }
    taken[candidate] = true;
    return candidate;
  });
}
function pageInlineTargets(body) {
  const out = [];
  const lines = String(body === undefined || body === null ? '' : body).split('\n');
  let fence = '';
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const opened = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence !== '') {
      if (opened !== null && opened[1].charAt(0) === fence.charAt(0) && opened[1].length >= fence.length) fence = '';
      continue;
    }
    if (opened !== null) { fence = opened[1]; continue; }
    const stripped = line.replace(/`[^`]*`/g, '');
    const pattern = /!?\[[^\]]*\]\(([^()\s]*)(?:\s+"[^"]*")?\)/g;
    let match = pattern.exec(stripped);
    while (match !== null) {
      if (match[1] !== '') out.push(match[1]);
      match = pattern.exec(stripped);
    }
  }
  return out;
}
function pageResolveBodyReference(item, raw, byPath) {
  const text = String(raw);
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(text) || text.slice(0, 2) === '//' || text.charAt(0) === '/') return null;
  const hash = text.indexOf('#');
  const relative = hash === -1 ? text : text.slice(0, hash);
  const fragment = hash === -1 ? null : text.slice(hash + 1);
  if (relative === '') return null;
  const from = item.path.slice(0, item.path.lastIndexOf('/'));
  const segments = from === '' ? [] : from.split('/');
  const parts = relative.split('/');
  for (let i = 0; i < parts.length; i += 1) {
    if (parts[i] === '' || parts[i] === '.') continue;
    if (parts[i] === '..') {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(parts[i]);
  }
  const path = segments.join('/');
  const target = byPath[path] === undefined ? byPath[`${path}.md`] : byPath[path];
  if (target === undefined) return null;
  if (fragment !== null && pageAnchors(target.body).indexOf(fragment) === -1) return null;
  return target;
}
function pageToolset(corpus, core) {
  const model = corpus || { base: '/', bundleId: undefined, bySlug: {}, index: null, items: [] };
  const base = model.base;
  // FV29-01: re-key into a prototype-free map whatever the caller supplied, so that a
  // corpus built by hand is as safe as one `pageCorpus` built.
  const bySlug = Object.create(null);
  {
    const supplied = model.bySlug || {};
    const names = Object.keys(supplied);
    for (let i = 0; i < names.length; i += 1) bySlug[names[i]] = supplied[names[i]];
  }

  // AGSC-06-21 (FV29-06): an index the page could not read WHOLE is not an empty
  // index. Returning no hit over a manifest whose shard was not served is a wrong
  // answer and a silent one — so the two tools that read the index say what is
  // missing, with the registered code for a file that is not there.
  const indexFault = () => {
    const index = model.index;
    if (index === null || index === undefined || index.incomplete !== true) return null;
    const missing = Array.isArray(index.missing) ? index.missing.join(', ') : 'a shard';
    return `the search index is incomplete: this node published /search.json as the`
      + ` AGSC-06-21 manifest and ${missing} could not be read from this origin`;
  };

  const hitsFor = (query) => {
    const wanted = pageTokenize(query);
    const index = model.index;
    if (wanted.length === 0 || index === null || index === undefined || !Array.isArray(index.docs)) return [];
    const terms = index.terms || {};
    const hits = [];
    for (let d = 0; d < index.docs.length; d += 1) {
      const doc = index.docs[d];
      let score = 0;
      for (let w = 0; w < wanted.length; w += 1) {
        const postings = terms[wanted[w]];
        if (Array.isArray(postings) && postings.indexOf(d) !== -1) score += 1;
      }
      if (score === 0) continue;
      const item = bySlug[doc.slug];
      hits.push({
        iri: pageItemIri(base, item === undefined ? 'concept' : item.type, doc.slug),
        score,
        slug: doc.slug,
        title: doc.title,
      });
    }
    hits.sort((a, b) => b.score - a.score || pageCompare(a.slug, b.slug));
    return hits;
  };

  const describe = (slug) => {
    const item = bySlug[slug];
    const fm = (item && item.frontmatter) || {};
    return typeof fm.description === 'string' && fm.description !== '' ? fm.description : String(fm.title === undefined ? '' : fm.title);
  };

  const implementations = {
    ask: (args) => {
      const fault = indexFault();
      if (fault !== null) return pageErrorEnvelope('ask', 'AGSC-E901', fault);
      const question = typeof args.question === 'string' ? args.question : '';
      const hits = hitsFor(question);
      if (hits.length === 0) {
        return {
          body: pageNoAnswer(), citations: [], license: pageTerms(),
          source: 'ask', trust: 'untrusted', type: 'answer',
        };
      }
      const cited = hits.slice(0, 3);
      return {
        body: `${cited.map((h) => describe(h.slug)).join(' ')} Content Use Terms: ${pageTerms()}.`,
        citations: cited.map((h) => h.iri),
        license: pageTerms(),
        source: 'ask',
        trust: 'untrusted',
        type: 'answer',
      };
    },

    compose: (args) => {
      const selection = Array.isArray(args.selection) ? args.selection : [];
      const flat = model.items.map((i) => {
        const copy = { slug: i.slug, type: i.type };
        const fm = i.frontmatter || {};
        const names = Object.keys(fm);
        for (let k = 0; k < names.length; k += 1) copy[names[k]] = fm[names[k]];
        return copy;
      });
      const result = core.compose(flat, selection);
      return pageEnvelope('compose', 'verdict', {
        added: result.added,
        conflicts: result.conflicts,
        hidden: result.hidden,
        selection: result.selection,
        valid: result.valid,
        warnings: result.warnings,
      });
    },

    links: (args) => {
      let slug = args.slug;
      if (slug === undefined && args.iri !== undefined) {
        const resolved = pageSlugOfIri(String(args.iri), base, model.bundleId);
        if (resolved.code !== null) {
          return pageErrorEnvelope('links', resolved.code, resolved.code === 'AGSC-E309'
            ? 'memory:// names a foreign bundle — use the https:// IRI'
            : 'no item with that IRI in this Bundle');
        }
        slug = resolved.slug;
      }
      const item = bySlug[slug];
      if (item === undefined) return pageErrorEnvelope('links', 'AGSC-E301', 'no item with that slug in this Bundle');
      const edges = pageEdges(model.items).filter((e) => e.source === item.slug);
      return pageEnvelope('links', 'links', { edges, slug: item.slug });
    },

    // AGSC-08-04 / AGSC-11-14: the payload is RETURNED. A page performs no write of
    // any kind — no network write, and not even the local patch file the stdio
    // transport's caller may write. `markdown` is the published source file with the
    // blank line `mcp-tools.js` puts between the frontmatter block and the body, so
    // the bytes are the local server's bytes.
    propose: (args) => {
      const item = bySlug[args.slug];
      if (item === undefined) return pageErrorEnvelope('propose', 'AGSC-E301', 'no item with that slug in this Bundle');
      return pageEnvelope('propose', 'proposal', {
        iri: pageItemIri(base, item.type, item.slug),
        markdown: `${item.block}\n${item.body}`,
        slug: item.slug,
      });
    },

    read: (args) => {
      const item = bySlug[args.slug];
      if (item === undefined) return pageErrorEnvelope('read', 'AGSC-E301', 'no item with that slug in this Bundle');
      return pageEnvelope('read', 'item', {
        body: item.body,
        frontmatter: item.frontmatter,
        iri: pageItemIri(base, item.type, item.slug),
        slug: item.slug,
      });
    },

    // AGSC-09-14b: a total function — an invalid `sources[]` entry is DROPPED with
    // AGSC-E506, never rejected. `at` supplies the instant; a clock is never read.
    remember: (args) => {
      const kinds = pageKindToType();
      const kind = kinds[args.kind] === undefined ? 'concept' : args.kind;
      const type = kinds[kind];
      const title = typeof args.title === 'string' ? args.title : '';
      const findings = [];
      const taken = new Set(Object.keys(bySlug));
      const slug = pageDedupe(pageSlugify(title), taken);
      const frontmatter = { title, type };
      if (type === 'concept') frontmatter.kind = 'explainer';
      if (type === 'episode') {
        frontmatter.started = args.at;
        frontmatter.outcome = args.outcome === undefined ? 'partial' : args.outcome;
        frontmatter.severity = args.severity === undefined ? 'info' : args.severity;
      }
      if (typeof args.actor === 'string') frontmatter.actor = args.actor;
      frontmatter.prov = {
        agent: args.agent,
        model: args.model,
        operator: args.operator,
        origin: args.origin === 'human' ? 'human' : 'ai-generated',
      };
      const sources = [];
      const supplied = Array.isArray(args.sources) ? args.sources : [];
      for (let i = 0; i < supplied.length; i += 1) {
        const source = supplied[i];
        if (!source || typeof source.resource !== 'string'
          || !/^(https?:\/\/\S+|urn:agsc:channel:[a-z0-9-]+:\S+)$/u.test(source.resource)) {
          findings.push({ code: 'AGSC-E506', message: 'source dropped', severity: 'warn' });
          continue;
        }
        sources.push({ id: source.id, resource: source.resource });
      }
      if (sources.length > 0) frontmatter.sources = sources;
      return pageEnvelope('remember', 'proposal', {
        body: typeof args.body === 'string' ? pageNfc(args.body) : '',
        findings,
        frontmatter,
        path: `content/${pageTypePlural(type)}/${slug}.md`,
        slug,
      });
    },

    search: (args) => {
      const fault = indexFault();
      if (fault !== null) return pageErrorEnvelope('search', 'AGSC-E901', fault);
      return pageEnvelope('search', 'items', {
        hits: hitsFor(typeof args.query === 'string' ? args.query : ''),
      });
    },
  };

  return {
    call: (name, args) => {
      // AGSC-09-13: the tool set is the set of implementations above and is stated
      // nowhere else in this module — `boundary/surfaces.js#TOOL_NAMES` is the one
      // declaration of the seven names, and `tests/distribution/page-tools.test.js`
      // asserts that these implementations are exactly those names.
      if (!Object.prototype.hasOwnProperty.call(implementations, name)) {
        return pageErrorEnvelope(String(name), 'AGSC-E001', 'no such tool');
      }
      const supplied = args && typeof args === 'object' ? args : {};
      const required = pageRequiredArguments()[name];
      const missing = required.filter((key) => supplied[key] === undefined || supplied[key] === null);
      if (missing.length > 0) {
        return pageErrorEnvelope(name, 'AGSC-E003', `missing required argument: ${missing.join(', ')}`);
      }
      const cap = 1024 * 1024;
      const oversized = pageArguments()[name].filter((key) => typeof supplied[key] === 'string'
        && new TextEncoder().encode(supplied[key]).length > cap);
      if (oversized.length > 0) {
        return pageErrorEnvelope(name, 'AGSC-E904',
          `argument above the ${cap}-byte cap: ${oversized.join(', ')} (AGSC-01-16)`);
      }
      return implementations[name](supplied);
    },
  };
}
function pageArguments() {
  return {
    ask: ['question'],
    compose: ['selection'],
    links: ['iri', 'slug'],
    propose: ['slug'],
    read: ['slug'],
    remember: ['at', 'body', 'kind', 'outcome', 'severity', 'sources', 'title'],
    search: ['query'],
  };
}
function pageRequiredArguments() {
  return {
    ask: ['question'],
    compose: ['selection'],
    links: [],
    propose: ['slug'],
    read: ['slug'],
    remember: ['body', 'kind', 'title'],
    search: ['query'],
  };
}
function pageSlugOfIri(iri, base, bundleId) {
  const text = String(iri);
  const memory = /^memory:\/\/([^/]+)\/(?:[a-z]+\/)?([^/#?]+)/u.exec(text);
  if (memory) {
    if (memory[1] !== bundleId) return { code: 'AGSC-E309', slug: null };
    return { code: null, slug: memory[2] };
  }
  const prefix = pageBaseIri(base);
  if (base !== '' && text.slice(0, prefix.length) === prefix) {
    const parts = text.slice(prefix.length).split('/').filter((p) => p !== '');
    if (parts.length >= 2) return { code: null, slug: parts[1] };
  }
  return { code: 'AGSC-E301', slug: null };
}
  var API = {
    pageTerms: pageTerms,
    pageNoAnswer: pageNoAnswer,
    pageLinkKeys: pageLinkKeys,
    pageInverseKeys: pageInverseKeys,
    pageTypePlural: pageTypePlural,
    pageTypedScalars: pageTypedScalars,
    pageApplyTypes: pageApplyTypes,
    pageKindToType: pageKindToType,
    pageEnvelope: pageEnvelope,
    pageErrorEnvelope: pageErrorEnvelope,
    pageBaseIri: pageBaseIri,
    pageItemIri: pageItemIri,
    pageNfc: pageNfc,
    pageTokenize: pageTokenize,
    pageAnchorOf: pageAnchorOf,
    pageSlugify: pageSlugify,
    pageDedupe: pageDedupe,
    pageSplitFrontmatter: pageSplitFrontmatter,
    pageParseFrontmatter: pageParseFrontmatter,
    pageIndentOf: pageIndentOf,
    pageNextMeaningful: pageNextMeaningful,
    pageParseMap: pageParseMap,
    pageParseValue: pageParseValue,
    pageParseSeq: pageParseSeq,
    pageKeyEnd: pageKeyEnd,
    pageScalar: pageScalar,
    pageBlockScalar: pageBlockScalar,
    pageShardRoutes: pageShardRoutes,
    pageIndexOf: pageIndexOf,
    pageCorpus: pageCorpus,
    pageBaseOf: pageBaseOf,
    pageEdges: pageEdges,
    pageCompare: pageCompare,
    pageAnchors: pageAnchors,
    pageInlineTargets: pageInlineTargets,
    pageResolveBodyReference: pageResolveBodyReference,
    pageToolset: pageToolset,
    pageArguments: pageArguments,
    pageRequiredArguments: pageRequiredArguments,
    pageSlugOfIri: pageSlugOfIri
  };
  globalThis.AGSC_PAGE_TOOLS = API;

  // AGSC-05-04b: a page resolves `memory://<bundle-id>/<slug>` only for THIS
  // Bundle's id, which no published route carries, so the writer emits it here.
  API.BUNDLE_ID = "agenticsystemcore";

  // AGSC-06-01: the routes a page reads, and no others. Every one is same-origin.
  API.ROUTES = ['/.well-known/knowledge-linkset', '/search.json'];

  API.load = function (fetchLike) {
    var get = function (route) {
      return fetchLike(route).then(function (r) { return r.ok ? r.text() : null; })
        .catch(function () { return null; });
    };
    var sources = {};
    return Promise.all(API.ROUTES.map(function (route) {
      return get(route).then(function (text) { if (text !== null) sources[route] = text; });
    })).then(function () {
      // AGSC-06-21: above 500 items /search.json is the MANIFEST {docs_total,
      // shards[]} and the index is the shards. The page follows it exactly as the
      // local tools do, and only to the /search-<nn>.json routes of this origin
      // (pageShardRoutes) — never to a URL a document named.
      var manifest = null;
      try { manifest = JSON.parse(sources['/search.json']); } catch (e) { manifest = null; }
      return Promise.all(pageShardRoutes(manifest).map(function (route) {
        return get(route).then(function (text) { if (text !== null) sources[route] = text; });
      }));
    }).then(function () {
      var index = pageIndexOf(sources);
      var docs = (index && index.docs) || [];
      return Promise.all(docs.map(function (doc) {
        return get('/pages/' + encodeURIComponent(doc.slug) + '.md').then(function (text) {
          if (text !== null) sources['/pages/' + doc.slug + '.md'] = text;
        });
      }));
    }).then(function () { return pageCorpus(sources, { bundleId: API.BUNDLE_ID }); });
  };

  API.install = function (corpus, core) {
    var toolset = pageToolset(corpus, core);
    globalThis.AGSC_TOOLS = toolset;
    return toolset;
  };

  // Feature detection is WebMCP's, in webmcp.js; this bootstrap only makes the
  // implementation available. A page without `fetch` or without `document` keeps
  // working and simply has no page tools (AGSC-09-16).
  API.ready = null;
  if (typeof document !== 'undefined' && typeof fetch === 'function' && globalThis.AGSC_TOOLS === undefined) {
    var pending = API.load(function (route) { return fetch(route); })
      .then(function (corpus) { return pageToolset(corpus, globalThis.AGSC_CORE); });
    globalThis.AGSC_TOOLS = {
      call: function (name, args) {
        return pending.then(function (toolset) { return toolset.call(name, args); });
      }
    };
    // Once the corpus is in, the SYNCHRONOUS toolset replaces the promise wrapper, so
    // a tool call costs no round trip and executeTool resolves immediately.
    API.ready = pending.then(function (toolset) {
      globalThis.AGSC_TOOLS = toolset;
      return toolset;
    }).catch(function () { return globalThis.AGSC_TOOLS; });
  }
}());
