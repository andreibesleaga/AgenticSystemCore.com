'use strict';
// SPDX-License-Identifier: Apache-2.0 (the engine's code; the prose it carries keeps its own terms)
// AgenticSystemCore page tools (AGSC-09-13, AGSC-09-16). GENERATED — every
// function below is the SOURCE TEXT of the function Node runs, so the local
// tools and the page tools cannot drift. No network beyond this origin, no key,
// no server, no cookie, no storage.
// spec_version: 1.0.0-rc.7
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
  // prototype-free. `kinds[args.kind]` is the guard `remember` uses to fall
  // back to `concept`; on a plain object literal it answered a function for
  // `constructor` and the item's `type` became the `Object` constructor.
  const kinds = Object.create(null);
  kinds.concept = 'concept';
  kinds.episode = 'episode';
  kinds.gate = 'gate';
  kinds.lesson = 'lesson';
  kinds.procedure = 'procedure';
  kinds.task = 'concept';
  return kinds;
}
function pageRememberFault(args, type, has) {
  const line = /^[^\x00-\x1F\x7F\x85\u2028\u2029]*$/u;
  const fault = (code, message) => ({ code, message: `${message} (AGSC-09-14b)` });
  if (typeof args.kind !== 'string' || pageKindToType()[args.kind] === undefined) {
    return fault('AGSC-E203', 'kind must be concept, episode, lesson, procedure or task');
  }
  if (args.about !== undefined && (typeof args.about !== 'string' || typeof has !== 'function' || !has(args.about))) {
    return fault('AGSC-E301', 'about names no item of this Bundle');
  }
  const title = args.title;
  if (typeof title !== 'string' || [...title].length < 3 || [...title].length > 120 || !line.test(title)) {
    return fault('AGSC-E204', 'title must be text of 3 to 120 characters on one line (AGSC-02-24)');
  }
  if (args.operator !== undefined && (typeof args.operator !== 'string' || !/^human:[a-z0-9][a-z0-9._-]*$/u.test(args.operator))) {
    return fault('AGSC-E204', 'operator must be human:<id> (AGSC-02-07)');
  }
  for (const key of ['agent', 'model']) {
    if (args[key] !== undefined && (typeof args[key] !== 'string' || !line.test(args[key]))) {
      return fault('AGSC-E204', `${key} must be text on one line (AGSC-02-24)`);
    }
  }
  if (type === 'lesson' && args.severity !== undefined && ['info', 'warn', 'block'].indexOf(args.severity) === -1) {
    return fault('AGSC-E203', 'severity must be info, warn or block');
  }
  if (type === 'episode') {
    if (typeof args.at !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/u.test(args.at)) {
      return fault('AGSC-E204', 'at must be an instant, YYYY-MM-DDTHH:MM:SSZ (AGSC-02-06)');
    }
    if (args.outcome !== undefined && ['success', 'partial', 'failure'].indexOf(args.outcome) === -1) {
      return fault('AGSC-E203', 'outcome must be success, partial or failure');
    }
    const usage = args.usage;
    if (usage !== null && typeof usage === 'object' && !Array.isArray(usage)) {
      const wrong = (key, ok) => usage[key] !== undefined && !ok(usage[key]);
      if (wrong('tokens_in', Number.isSafeInteger) || wrong('tokens_out', Number.isSafeInteger)
        || wrong('cost_usd', Number.isFinite) || wrong('estimate', (v) => typeof v === 'boolean')
        || wrong('model', (v) => typeof v === 'string' && line.test(v))) {
        return fault('AGSC-E201', 'usage carries tokens_in and tokens_out as integers, cost_usd as a number, estimate as a boolean and model as one line (AGSC-02-14)');
      }
    }
  }
  return null;
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
  // a PROTOTYPE-FREE index. A plain object literal answers a function for
  // `constructor`, `toString`, `__proto__` and the rest of `Object.prototype`, so the
  // `item === undefined` guard of every tool below never fired for those names and a
  // page answered a SUCCESS envelope where `mcp-tools.js` (a `Map`) answers
  // `AGSC-E301` — an AGSC-09-16 divergence between the two transports.
  const bySlug = Object.create(null);
  for (let i = 0; i < items.length; i += 1) bySlug[items[i].slug] = items[i];
  // AGSC-06-21: `/search.json` is the index at or below 500 items and the
  // MANIFEST above it. `pageIndexOf` reads both shapes, so the corpus carries one
  // index whatever the node's size.
  const index = pageIndexOf(map);
  return { base, bundleId: opts.bundleId, bySlug, claimed: pageClaimants(map), index, items };
}
function pageClaimants(map) {
  const out = Object.create(null);
  const routes = Object.keys(map || {}).sort();
  for (let i = 0; i < routes.length; i += 1) {
    const route = routes[i];
    if (route.slice(0, 8) !== '/boards/' || route.slice(-5) !== '.json' || route === '/boards/index.json') continue;
    let board = null;
    try {
      board = JSON.parse(String(map[route]));
    } catch (e) {
      board = null;
    }
    const tasks = (board && Array.isArray(board.tasks)) ? board.tasks : [];
    for (let j = 0; j < tasks.length; j += 1) {
      const task = tasks[j];
      if (task && typeof task.slug === 'string' && typeof task.claimed_by === 'string') out[task.slug] = task.claimed_by;
    }
  }
  return out;
}
function pageDeclaresBoards(map) {
  const raw = (map || {})['/.well-known/knowledge-linkset'];
  if (typeof raw !== 'string') return false;
  try {
    const doc = JSON.parse(raw);
    const context = (doc && doc.linkset && doc.linkset[0]) || null;
    if (context === null || typeof context !== 'object') return false;
    // The relation is `https://` + this suffix; matched by its suffix so that the
    // emitted script names no absolute origin (AGSC-06-05).
    const suffix = '//w3id.org/agentic-system-core/rel#boards';
    return Object.keys(context).some((name) => name.slice(-suffix.length) === suffix
      && Array.isArray(context[name]) && context[name].length > 0);
  } catch (e) {
    return false;
  }
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
  // prototype-free, so a Link target spelled `constructor` resolves to
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
  // re-key into a prototype-free map whatever the caller supplied, so that a
  // corpus built by hand is as safe as one `pageCorpus` built.
  const bySlug = Object.create(null);
  {
    const supplied = model.bySlug || {};
    const names = Object.keys(supplied);
    for (let i = 0; i < names.length; i += 1) bySlug[names[i]] = supplied[names[i]];
  }

  // AGSC-06-21: an index the page could not read WHOLE is not an empty
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
      // AGSC-09-13a: a selection that is not an array is not the empty one (finding G4).
      if (!Array.isArray(args.selection)) {
        return pageErrorEnvelope('compose', 'AGSC-E201', 'selection must be an array of slugs (AGSC-09-13)');
      }
      const selection = args.selection;
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
    // transport's caller may write. `markdown` is the published source file with
    // exactly one blank line between the frontmatter block and the body, as
    // `mcp-tools.js` writes it, so the bytes are the local server's bytes.
    propose: (args) => {
      const item = bySlug[args.slug];
      if (item === undefined) return pageErrorEnvelope('propose', 'AGSC-E301', 'no item with that slug in this Bundle');
      if (args.task_state !== undefined) {
        const moved = pageBoardMove(item.block, item.body, item.frontmatter, item.type, item.slug, args,
          (model.claimed || {})[item.slug]);
        if (moved.code !== undefined) return pageErrorEnvelope('propose', moved.code, moved.message);
        return pageEnvelope('propose', 'proposal', {
          from: moved.from,
          iri: pageItemIri(base, item.type, item.slug),
          markdown: moved.markdown,
          patch: moved.patch,
          path: moved.path,
          slug: item.slug,
          task_state: moved.task_state,
        });
      }
      return pageEnvelope('propose', 'proposal', {
        iri: pageItemIri(base, item.type, item.slug),
        markdown: `${item.block}${item.body.charAt(0) === '\n' ? '' : '\n'}${item.body}`,
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
      // AGSC-09-14b: a Gate's Level is a governance decision a
      // tool call may not invent, and an episode's schema branch requires `actor`.
      if (args.kind === 'gate') {
        return pageErrorEnvelope('remember', 'AGSC-E203', 'remember does not accept kind "gate": a Gate\'s Level is a governance decision (AGSC-09-14b)');
      }
      if (type === 'episode' && typeof args.actor !== 'string') {
        return pageErrorEnvelope('remember', 'AGSC-E003', 'an episode needs the declared actor (AGSC-09-14b)');
      }
      // AGSC-09-14b: no `at` on an episode is AGSC-E003; an actor outside AGSC-02-09 is refused.
      if (type === 'episode' && typeof args.at !== 'string') {
        return pageErrorEnvelope('remember', 'AGSC-E003', 'an episode needs the instant it started, `at` (AGSC-09-14b)');
      }
      if (args.actor !== undefined && !/^(?:human:[a-z0-9][a-z0-9._-]*|process:[a-z0-9][a-z0-9._-]*|[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._+-]*)$/u.test(String(args.actor))) {
        return pageErrorEnvelope('remember', 'AGSC-E204', 'actor must be human:<id>, process:<id> or <producer>/<version> (AGSC-02-09)');
      }
      const refused = pageRememberFault(args, type, (slug) => bySlug[slug] !== undefined);
      if (refused !== null) return pageErrorEnvelope('remember', refused.code, refused.message);
      const title = typeof args.title === 'string' ? args.title : '';
      const findings = [];
      // AGSC-09-14b (2026-09-25): the page has no identity to declare, so a call
      // without an operator returns the item with `prov.operator` absent and says
      // so; the Proposal path refuses it until a person supplies one.
      if (typeof args.operator !== 'string') {
        findings.push({ code: 'AGSC-E506', message: 'no operator declared: prov.operator is absent and the Proposal needs one (AGSC-09-14b)', severity: 'warn' });
      }
      const taken = new Set(Object.keys(bySlug));
      const slug = pageDedupe(pageSlugify(title), taken);
      const frontmatter = { title, type };
      if (type === 'concept') frontmatter.kind = args.kind === 'task' ? 'task' : 'explainer';
      // AGSC-10-16: a new task on a board — SUBMITTED, filed in the cluster named.
      if (args.kind === 'task') {
        frontmatter.task_state = 'TASK_STATE_SUBMITTED';
        if (typeof args.cluster === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/u.test(args.cluster)) frontmatter.clusters = [args.cluster];
      }
      // A comment on a task (or any item) links to it.
      if (typeof args.about === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/u.test(args.about)) frontmatter.related = [args.about];
      if (type === 'episode') {
        frontmatter.started = args.at;
        frontmatter.outcome = args.outcome === undefined ? 'partial' : args.outcome;
        // no `severity`: the episode branch has no such key (AGSC-09-14b, 2026-09-24)
      }
      // the lesson branch requires `severity` (AGSC-09-14b default).
      if (type === 'lesson') frontmatter.severity = args.severity === undefined ? 'info' : args.severity;
      if (typeof args.actor === 'string') frontmatter.actor = args.actor;
      // AGSC-09-14b / AGSC-02-14: `usage` is carried onto the episode verbatim.
      if (type === 'episode' && args.usage !== null && typeof args.usage === 'object' && !Array.isArray(args.usage)) {
        frontmatter.usage = args.usage;
      }
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
      // AGSC-05-04b: a `memory://` alias is accepted wherever a slug argument is and
      // normalized to the slug before any other rule runs — `mcp-tools.js#memoryAliases`.
      const normalized = Object.assign({}, supplied);
      let refused = null;
      const prefix = pageBaseIri(base);
      const one = (value) => {
        if (refused !== null || typeof value !== 'string') return value;
        // AGSC-05-04a: wherever `memory://` is accepted, this node's https item IRI is too.
        const iri = /^https?:\/\//u.test(prefix) && value.slice(0, prefix.length) === prefix;
        if (value.slice(0, 9) !== 'memory://' && !iri) return value;
        const resolved = pageSlugOfIri(value, base, model.bundleId);
        if (resolved.code !== null) refused = resolved.code;
        return resolved.slug;
      };
      ['about', 'cluster', 'slug'].forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(normalized, key)) normalized[key] = one(normalized[key]);
      });
      if (Array.isArray(normalized.selection)) normalized.selection = normalized.selection.map(one);
      if (refused !== null) {
        return pageErrorEnvelope(name, refused, refused === 'AGSC-E309'
          ? 'memory:// names a foreign bundle — use the https:// IRI'
          : 'no item with that IRI in this Bundle');
      }
      return implementations[name](normalized);
    },
  };
}
function pageArguments() {
  return {
    ask: ['question'],
    compose: ['selection'],
    links: ['iri', 'slug'],
    propose: ['agent', 'at', 'slug', 'task_state'],
    read: ['slug'],
    remember: ['about', 'actor', 'agent', 'at', 'body', 'cluster', 'kind', 'model', 'operator', 'origin',
      'outcome', 'severity', 'sources', 'title', 'usage'],
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
function pageTaskStates() {
  return ['TASK_STATE_UNSPECIFIED', 'TASK_STATE_SUBMITTED', 'TASK_STATE_WORKING',
    'TASK_STATE_INPUT_REQUIRED', 'TASK_STATE_AUTH_REQUIRED', 'TASK_STATE_COMPLETED',
    'TASK_STATE_FAILED', 'TASK_STATE_CANCELED', 'TASK_STATE_REJECTED'];
}
function pageQuoteTemporal(block) {
  return block.split('\n').map((line) => line.replace(
    /^(\s*(?:- )?(?:[A-Za-z_][A-Za-z0-9_-]*: )?)(\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}Z)?)$/u,
    (_, lead, value) => `${lead}"${value}"`,
  )).join('\n');
}
function pageSetLine(block, key, value, after, before) {
  const lines = block.split('\n');
  const line = `${key}: ${value}`;
  const keyOf = (text) => {
    const m = /^([A-Za-z_][A-Za-z0-9_-]*):/u.exec(text);
    return m === null ? null : m[1];
  };
  for (let i = 0; i < lines.length; i += 1) {
    if (keyOf(lines[i]) === key) {
      lines[i] = line;
      return lines.join('\n');
    }
  }
  for (let a = 0; a < after.length; a += 1) {
    for (let i = 0; i < lines.length; i += 1) {
      if (keyOf(lines[i]) !== after[a]) continue;
      let end = i + 1;
      while (end < lines.length && /^(?: |- )/u.test(lines[end])) end += 1;
      lines.splice(end, 0, line);
      return lines.join('\n');
    }
  }
  for (let i = 0; i < lines.length; i += 1) {
    if (keyOf(lines[i]) === before) {
      lines.splice(i, 0, line);
      return lines.join('\n');
    }
  }
  const close = lines.lastIndexOf('---');
  lines.splice(close, 0, line);
  return lines.join('\n');
}
function pageUnifiedDiff(path, before, after) {
  const a = before.split('\n');
  const b = after.split('\n');
  const endA = a.indexOf('---', 1);
  const endB = b.indexOf('---', 1);
  const x = a.slice(0, endA + 1);
  const y = b.slice(0, endB + 1);
  const table = [];
  for (let i = x.length; i >= 0; i -= 1) {
    table[i] = [];
    for (let j = y.length; j >= 0; j -= 1) {
      if (i === x.length || j === y.length) table[i][j] = 0;
      else if (x[i] === y[j]) table[i][j] = table[i + 1][j + 1] + 1;
      else table[i][j] = Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) {
      out.push(` ${x[i]}`);
      i += 1;
      j += 1;
    } else if (i < x.length && (j === y.length || table[i + 1][j] >= table[i][j + 1])) {
      out.push(`-${x[i]}`);
      i += 1;
    } else {
      out.push(`+${y[j]}`);
      j += 1;
    }
  }
  return [`--- a/${path}`, `+++ b/${path}`, `@@ -1,${x.length} +1,${y.length} @@`, ...out, ''].join('\n');
}
function pageBoardMove(block, body, frontmatter, type, slug, args, claimedBy) {
  const states = pageTaskStates();
  if (states.indexOf(args.task_state) === -1) {
    return { code: 'AGSC-E203', message: `task_state must be one of ${states.join(', ')} (AGSC-02-99)` };
  }
  if (type !== 'concept' || frontmatter.kind !== 'task') {
    return { code: 'AGSC-E207', message: 'only a concept of kind task has a task_state (AGSC-02-99)' };
  }
  // AGSC-10-17: a claim of a task already held in TASK_STATE_WORKING by another
  // participant is AGSC-E511, for EVERY caller — a person, an agent that declares
  // no lane, a lane. The holder is the derived `claimed_by` of the board export,
  // else the task's `prov.agent`; a lane's commit author `process:<name>` and the
  // lane name `<name>` are one participant.
  if (args.task_state === 'TASK_STATE_WORKING' && frontmatter.task_state === 'TASK_STATE_WORKING') {
    const prov = frontmatter.prov || {};
    const holder = claimedBy !== undefined && claimedBy !== null ? String(claimedBy)
      : (prov.agent === undefined || prov.agent === null ? null : String(prov.agent));
    const caller = args.agent !== undefined && args.agent !== null ? String(args.agent)
      : (args.operator !== undefined && args.operator !== null ? String(args.operator) : null);
    const bare = (v) => v.replace(/^process:/u, '');
    // A holder no history names is still somebody: only the known holder may re-claim.
    if (holder === null || caller === null || bare(holder) !== bare(caller)) {
      return { code: 'AGSC-E511', message: `the task "${slug}" is already TASK_STATE_WORKING${holder === null ? '' : ` under ${holder}`}; the first merged claim wins (AGSC-10-17)` };
    }
  }
  const current = pageQuoteTemporal(block);
  let next = pageSetLine(current, 'task_state', args.task_state, ['kind'], 'prov');
  if (args.at !== undefined) {
    const day = /^\d{4}-\d{2}-\d{2}/u.exec(String(args.at));
    if (day === null) return { code: 'AGSC-E204', message: 'at must be a date or an instant (AGSC-02-06)' };
    next = pageSetLine(next, 'modified', `"${day[0]}"`, ['date'], 'prov');
  }
  const path = `content/${pageTypePlural(type)}/${slug}.md`;
  const before = `${current}${body}`;
  const after = `${next}${body}`;
  return {
    from: frontmatter.task_state === undefined ? 'TASK_STATE_UNSPECIFIED' : String(frontmatter.task_state),
    markdown: after,
    patch: pageUnifiedDiff(path, before, after),
    path,
    task_state: args.task_state,
  };
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
    pageRememberFault: pageRememberFault,
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
    pageClaimants: pageClaimants,
    pageDeclaresBoards: pageDeclaresBoards,
    pageBaseOf: pageBaseOf,
    pageEdges: pageEdges,
    pageCompare: pageCompare,
    pageAnchors: pageAnchors,
    pageInlineTargets: pageInlineTargets,
    pageResolveBodyReference: pageResolveBodyReference,
    pageToolset: pageToolset,
    pageArguments: pageArguments,
    pageRequiredArguments: pageRequiredArguments,
    pageSlugOfIri: pageSlugOfIri,
    pageTaskStates: pageTaskStates,
    pageQuoteTemporal: pageQuoteTemporal,
    pageSetLine: pageSetLine,
    pageUnifiedDiff: pageUnifiedDiff,
    pageBoardMove: pageBoardMove
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
    }).then(function () {
      // AGSC-10-13: the board exports carry the derived `claimed_by` a claim is
      // checked against (AGSC-10-17). A node with no task has no /boards/ route and
      // no rel#boards link, so the page asks for the index only when it is declared.
      if (!pageDeclaresBoards(sources)) return null;
      return get('/boards/index.json').then(function (text) {
        var boards = [];
        try { boards = (JSON.parse(text) || {}).boards || []; } catch (e) { boards = []; }
        return Promise.all(boards.map(function (entry) {
          var cluster = entry && typeof entry.cluster === 'string' ? entry.cluster : '';
          if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(cluster)) return null;
          return get('/boards/' + cluster + '.json').then(function (board) {
            if (board !== null) sources['/boards/' + cluster + '.json'] = board;
          });
        }));
      });
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
  //
  // WHEN the corpus is read. The corpus is every published item's Markdown view
  // plus the index, the discovery document and the boards — the whole node, one
  // same-origin request per item — and a person reading one item page never calls
  // a tool. So the read starts at once only where a caller is expected: a browser
  // that exposes `document.modelContext` (an agent may call the moment the tools
  // register) and the `/compose/` page (its controller calls `start`). Elsewhere
  // the first `AGSC_TOOLS.call` starts it, and every call before the corpus is in
  // returns a promise of the envelope, exactly as before. No answer changes: the
  // same routes, the same bytes, the same toolset — read later or not at all.
  API.ready = null;
  API.start = function () {
    if (API.ready !== null) return API.ready;
    var pending = API.load(function (route) { return fetch(route); })
      .then(function (corpus) { return pageToolset(corpus, globalThis.AGSC_CORE); });
    // Once the corpus is in, the SYNCHRONOUS toolset replaces the promise wrapper, so
    // a tool call costs no round trip and executeTool resolves immediately.
    API.ready = pending.then(function (toolset) {
      globalThis.AGSC_TOOLS = toolset;
      return toolset;
    }).catch(function () { return globalThis.AGSC_TOOLS; });
    return API.ready;
  };
  if (typeof document !== 'undefined' && typeof fetch === 'function' && globalThis.AGSC_TOOLS === undefined) {
    globalThis.AGSC_TOOLS = {
      call: function (name, args) {
        return API.start().then(function (toolset) { return toolset.call(name, args); });
      }
    };
    var context = document.modelContext;
    if (context && typeof context.registerTool === 'function') API.start();
  }
}());
