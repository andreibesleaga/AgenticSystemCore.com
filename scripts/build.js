#!/usr/bin/env node
// Site generator for AgenticSystemCore.com — a node of its own specification, checked
// at Level 2 by the discovery validator before every publish (AGSC-10-02). Throwaway by design: the engine's writer replaces it at site v0.1.
// Node >= 22 stdlib only. Deterministic: every instant derives from SOURCE_DATE_EPOCH,
// every listing is sorted, and the normative inputs (spec/, docs/, features/, ontology/agsc.ttl,
// LICENSE-CONTENT) are read from the engine repository's release tag, never from its
// working tree, so the site publishes exactly the tagged standard.
//
//   node scripts/build.js [--out <dir>]      (default: www)
//   SOURCE_DATE_EPOCH=<seconds> node scripts/build.js
//   SITE_ENGINE=<path> SITE_SPEC_TAG=<tag>   (defaults: ../agentic-system-core, 1.0.0-rc.7)
//   SITE_SPEC_SOURCE=tag|worktree            (default: tag when the tag exists, else worktree)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), cp = require('child_process');
const { compile: compileDiagram } = require('./diagram.js');

const ROOT = path.resolve(__dirname, '..');
const ENGINE = path.resolve(ROOT, process.env.SITE_ENGINE || '../agentic-system-core');
const SPEC_TAG = process.env.SITE_SPEC_TAG || '1.0.0-rc.7';
// Output directory: `build.out` of agsc.config.json, `www` — the folder Cloudflare Pages serves,
// so a push to `main` publishes what this script wrote.
const CONFIG_OUT = (JSON.parse(fs.readFileSync(path.join(ROOT, 'agsc.config.json'), 'utf8')).build || {}).out || 'www';
const OUT = path.resolve(ROOT, (() => { const i = process.argv.indexOf('--out'); return i > 0 ? process.argv[i + 1] : CONFIG_OUT; })());

// Status of the external steps. Update these, rebuild and redeploy after each step (the
// filing procedure, status-refresh section). Never write "registered" before the IANA
// registry shows the entry (AGSC-06-07), and never a DOI before it resolves.
const STATUS = {
  wellknown: 'not-requested',   // not-requested | requested | registered
  profile: 'registered',         // not-filed | filed | registered
  draft: 'draft-besleaga-agentic-knowledge-wellknown-00',                  // e.g. 'draft-besleaga-agentic-knowledge-wellknown-00' once posted
  w3id: true,                   // true once the w3id.org namespace redirects are live
  preprint: { doi: '10.5281/zenodo.23052710', title: 'AgenticSystemCore: Distributed Knowledge Bundles and Runnable Systems, for People and Agents', date: '2026-09-30' },               // e.g. { doi: '10.5281/zenodo.NNNNNNN', title: '…', date: 'YYYY-MM-DD' } once published
};

// ------------------------------------------------------------------ basics
const die = m => { process.stderr.write(`build: ${m}\n`); process.exit(1); };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = s => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const sha256hex = b => crypto.createHash('sha256').update(b).digest('hex');
const jcs = v => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(jcs).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + jcs(v[k])).join(',') + '}';
};
const pretty = (v, ind = '') => { // sorted keys, two-space indent: for display only
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  const n = ind + '  ';
  if (Array.isArray(v)) return v.length ? '[\n' + v.map(x => n + pretty(x, n)).join(',\n') + '\n' + ind + ']' : '[]';
  const ks = Object.keys(v).sort();
  return ks.length ? '{\n' + ks.map(k => n + JSON.stringify(k) + ': ' + pretty(v[k], n)).join(',\n') + '\n' + ind + '}' : '{}';
};
const byCode = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const git = (...args) => cp.execFileSync('git', ['-C', ENGINE, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
// WHERE THE NORMATIVE TEXT COMES FROM. The site publishes the tagged standard, so the
// default is the release tag and the launch build reads `git show <tag>:<path>`. A candidate that
// has not been tagged yet cannot be read that way, so the source is a PARAMETER: `tag` or
// `worktree`, defaulting to the tag when it exists and to the engine's working tree when it does
// not. The last line of the build says which of the two it used, so a build from an untagged
// working tree can never be mistaken for a build of a frozen candidate.
const tagExists = (() => { try { git('rev-parse', '-q', '--verify', `${SPEC_TAG}^{commit}`); return true; } catch { return false; } })();
const SPEC_SOURCE = process.env.SITE_SPEC_SOURCE || (tagExists ? 'tag' : 'worktree');
if (SPEC_SOURCE !== 'tag' && SPEC_SOURCE !== 'worktree') die(`SITE_SPEC_SOURCE must be "tag" or "worktree", not ${SPEC_SOURCE}`);
if (SPEC_SOURCE === 'tag' && !tagExists) die(`tag ${SPEC_TAG} does not exist in ${ENGINE}`);
const engineFile = p => {
  if (SPEC_SOURCE === 'tag') { try { return git('show', `${SPEC_TAG}:${p}`); } catch { die(`cannot read ${p} at tag ${SPEC_TAG} in ${ENGINE}`); } }
  try { return fs.readFileSync(path.join(ENGINE, p), 'utf8'); } catch { return die(`cannot read ${p} in the working tree of ${ENGINE}`); }
};
/** The file names directly under one directory of the normative source, sorted. */
const engineList = dir => (SPEC_SOURCE === 'tag'
  ? git('ls-tree', '--name-only', `${SPEC_TAG}:${dir}`).split('\n')
  : fs.readdirSync(path.join(ENGINE, dir))).filter(Boolean).sort();
const checkText = (name, s) => {
  if (s.includes('\r')) die(`${name}: CR found (LF only, AGSC-01-14)`);
  if (s.normalize('NFC') !== s) die(`${name}: not NFC (AGSC-01-14)`);
  if (s.charCodeAt(0) === 0xFEFF) die(`${name}: BOM`);
};
// The title, and the repository-reader header an engine document may carry under it
// ("**Who this is for:** … **Read after:** …"): its links are relative to the engine
// repository and mean nothing on this site, which gives every page its own summary.
const stripH1 = s => s.replace(/^# .*\n+/, '').replace(/^\*\*Who this is for:\*\*.*\n+/, '');

// ------------------------------------------------------------------ the engine's own emitters
// The seven in-page tools of AGSC-09-13/AGSC-09-16 are the ENGINE's implementation, not a second
// one written here. The four scripts this site serves under /compose/ are produced by the engine's
// own emitters, required from the sibling repository at build time, so their bytes are exactly the
// bytes the patterns node serves and the two sites cannot drift. The Markdown machine view and the
// surface declaration go through the engine's functions for the same reason. Unlike spec/, docs/
// and ontology/ — which are read from the frozen TAG — these modules are read from the engine's
// working tree, because a page tool must never lag the implementation it mirrors: the tag
// freezes the normative text, not the code that renders a page's tools.
// `node scripts/page-tools-check.js` records the SHA-256 of every emitted script.
const enginePath = p => path.join(ENGINE, p);
const engineModule = p => { try { return require(enginePath(p)); } catch (e) { return die(`cannot load the engine module ${p} from ${ENGINE}: ${e.message}`); } };
const engineBrowser = engineModule('src/composition/browser.js');
const enginePageTools = engineModule('src/distribution/page-tools.js');
const engineWebmcp = engineModule('src/distribution/webmcp.js');
const engineComposePage = engineModule('src/distribution/compose-page.js');
const engineTheme = engineModule('src/distribution/theme.js');
const engineSurfaces = engineModule('src/boundary/surfaces.js');
const engineAdopt = engineModule('src/knowledge/adopt.js');
const engineFrontmatter = engineModule('src/knowledge/frontmatter.js');
const engineYaml = engineModule('src/knowledge/yaml.js');
// AGSC-06-15 and AGSC-04-25, added at rc.6: the provenance block and the CONTENT VERSION are one
// derivation each, in the engine, and this site takes both from there rather than restating them.
const engineProvenance = engineModule('src/knowledge/provenance-header.js');
const engineContentVersion = engineModule('src/knowledge/content-version.js');
const engineLedger = engineModule('src/governance/ledger.js');

// The body of one "## …" section of a Markdown document, without its heading.
const sectionOf = (src, start) => {
  const lines = src.split('\n'); const i = lines.findIndex(l => l.startsWith(start));
  if (i < 0) die(`section not found: ${start}`);
  let j = i + 1; while (j < lines.length && !/^## /.test(lines[j])) j++;
  return lines.slice(i + 1, j).join('\n').trim() + '\n';
};

// ------------------------------------------------------------------ build instant (AGSC-04-09)
const EPOCH = (() => {
  const e = process.env.SOURCE_DATE_EPOCH;
  if (e !== undefined) { if (!/^\d+$/.test(e)) die('SOURCE_DATE_EPOCH malformed (AGSC-E603)'); return Number(e); }
  // The tagged specification's commit instant; from an untagged working tree, the engine's
  // last commit — a committed instant either way, never a clock (AGSC-04-09).
  return Number(git('log', '-1', '--format=%ct', SPEC_SOURCE === 'tag' ? SPEC_TAG : 'HEAD').trim());
})();
const iso = s => new Date(s * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
const GENERATED_AT = iso(EPOCH);
// The copyright year of every page footer. Neither the name nor the year is written into this
// generator: the name is `site.author` and the year is the year of the BUILD INSTANT, which comes
// from a commit and never from a clock, so the footer stays byte-reproducible (AGSC-04-09).
const FOOTER_YEAR = GENERATED_AT.slice(0, 4);
// ------------------------------------------------------------------ content version (AGSC-04-25)
// The one short name for the state this build publishes, derived by the ENGINE's own function
// from THIS repository's git log and the build instant — never typed, never configured, never
// stored. With no `v*` tag anywhere it is AGSC-04-25's branch 3: `0.0.0+<commits>.g<12 hex>`.
// Only tags that start with `v` reach the git-log file (AGSC-08-20b), so a tag meant to name this
// site's content starts with `v`; any other tag is not read here. The version names the commit the
// build runs on, and the output is committed after it, on its own: scripts/check.js then builds at
// the commit the output names (scripts/built-commit.js), not at the commit that holds the output.
let GIT_LOG = null; // the AGSC-08-20b git-log file of this repository: the content version and the ledger read it
const BUNDLE_VERSION = (() => {
  const GIT_LOG_FORMAT = '--format=%x1e%H%x1f%P%x1f%ct%x1f%D%x1f%s';
  let commits = [];
  try {
    const out = cp.execFileSync('git', ['-C', ROOT, 'log', '--first-parent', '--reverse', GIT_LOG_FORMAT, 'HEAD'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    for (const record of out.split('\u001e')) {
      const text = record.replace(/^\n+/, '');
      if (text === '') continue;
      const [sha, parents, seconds, decorations, message] = text.split('\u001f');
      if (!/^[0-9a-f]{40,64}$/.test(String(sha)) || !/^[0-9]+$/.test(String(seconds))) { commits = []; break; }
      commits.push({
        committer_timestamp: iso(Number(seconds)),
        message: message === undefined ? '' : message,
        parents: String(parents) === '' ? [] : String(parents).split(' '),
        sha: String(sha),
        tags: String(decorations || '').split(',').map(o => o.trim()).filter(o => o.startsWith('tag: ')).map(o => o.slice(5)),
      });
    }
  } catch { commits = []; }
  GIT_LOG = commits.length ? engineLedger.produce(commits) : null;
  const derived = engineContentVersion.bundleVersion({ buildInstant: GENERATED_AT, gitLog: engineLedger.produce(commits) });
  for (const f of derived.findings) process.stderr.write(`build: ${f.code} ${f.message}\n`);
  return derived.version;
})();

const SPEC_DATE = iso(Number(git('log', '-1', '--format=%ct', SPEC_SOURCE === 'tag' ? SPEC_TAG : 'HEAD').trim())).slice(0, 10);

// ------------------------------------------------------------------ YAML failsafe subset (AGSC-02-02/03)
function parseYaml(text, file) {
  const lines = text.split('\n');
  const bad = (i, m) => die(`${file}:${i + 1}: ${m}`);
  const scalar = (raw, i) => {
    raw = raw.trim();
    if (/^[&*!]/.test(raw)) bad(i, 'anchors, aliases and tags are not allowed (AGSC-E103/E104)');
    if (raw.startsWith('"')) { if (!raw.endsWith('"') || raw.length < 2) bad(i, 'unterminated string'); return JSON.parse(raw); }
    if (raw.startsWith("'")) { if (!raw.endsWith("'") || raw.length < 2) bad(i, 'unterminated string'); return raw.slice(1, -1).replace(/''/g, "'"); }
    if (raw.startsWith('{')) bad(i, 'flow mappings are not allowed (AGSC-E105)');
    if (raw.startsWith('[')) {
      if (!raw.endsWith(']')) bad(i, 'unterminated flow sequence');
      const inner = raw.slice(1, -1).trim();
      return inner ? inner.split(',').map(x => scalar(x, i)) : [];
    }
    return raw.replace(/\s+#.*$/, '');
  };
  let i = 0;
  const indentOf = l => l.match(/^ */)[0].length;
  const skip = () => { while (i < lines.length && (/^\s*$/.test(lines[i]) || /^\s*#/.test(lines[i]))) i++; };
  function block(ind) {
    skip();
    if (i >= lines.length) return null;
    if (lines[i].slice(ind).startsWith('- ') || lines[i].slice(ind) === '-') return seq(ind);
    return map(ind);
  }
  function map(ind) {
    const o = {};
    for (;;) {
      skip();
      if (i >= lines.length || indentOf(lines[i]) < ind) return o;
      if (indentOf(lines[i]) > ind) bad(i, 'unexpected indentation');
      const m = /^ *([a-z][a-z0-9_-]*):(?: +(.*))?$/.exec(lines[i]);
      if (!m) bad(i, 'expected "key: value"');
      if (Object.prototype.hasOwnProperty.call(o, m[1])) bad(i, `duplicate key ${m[1]} (AGSC-E106)`);
      const here = i++;
      if (m[2] !== undefined && m[2].trim() !== '') {
        if (m[2].trim() === '|' || m[2].trim() === '>') bad(here, 'block scalars are not used by this site');
        o[m[1]] = scalar(m[2], here);
      } else { skip(); o[m[1]] = i < lines.length && indentOf(lines[i]) > ind ? block(indentOf(lines[i])) : (lines[i] && lines[i].slice(ind).startsWith('- ') ? seq(ind) : ''); }
    }
  }
  function seq(ind) {
    const a = [];
    for (;;) {
      skip();
      if (i >= lines.length || indentOf(lines[i]) !== ind || !lines[i].slice(ind).startsWith('-')) return a;
      const rest = lines[i].slice(ind + 1);
      if (/^ +[a-z][a-z0-9_-]*:(?: |$)/.test(rest)) { // a mapping item: re-read this line as a map at ind+2
        lines[i] = ' '.repeat(ind + 2) + rest.trimStart();
        a.push(map(ind + 2));
      } else { a.push(scalar(rest, i)); i++; }
    }
  }
  const v = map(0);
  skip();
  if (i < lines.length) bad(i, 'unparsed content');
  return v;
}
function splitFrontmatter(text, file) {
  checkText(file, text);
  if (!text.endsWith('\n') || text.endsWith('\n\n')) die(`${file}: must end with exactly one LF (AGSC-E108)`);
  if (!text.startsWith('---\n')) die(`${file}: frontmatter missing (AGSC-E101)`);
  const end = text.indexOf('\n---\n', 3);
  if (end < 0) die(`${file}: frontmatter not terminated (AGSC-E102)`);
  return { fm: parseYaml(text.slice(4, end + 1), file), body: text.slice(end + 5).replace(/^\n+/, '') };
}

// ------------------------------------------------------------------ Markdown (the subset the specification uses)
const SAFE_URL = /^(https?:\/\/|mailto:|\/|#|\.{0,2}\/)/;
let RULE_INDEX = new Map(); // rule id or error code -> the spec page that carries it: `<section>` or `<section>/page-n` (see "the layout of the specification pages")
let RULE_INDEX_DECIDED = false; // false until every section is laid out; a rule link derived before that could name the wrong part
let REQ_IDS = new Set();    // PRD-nnn / NFR-nn ids that the requirements page defines
const RULES_WITHOUT_TRACE = []; // rules whose source carries no trailing trace bracket (reported at the end)
// Rules and codes drafted for the next release candidate in the engine working tree: the guide may cite
// them, rendered unlinked and marked, until the next candidate is tagged and SITE_SPEC_TAG moves
// (then empty this set again). Empty now: every identifier the guide cites is in the published
// specification.
const PENDING_RULES = new Set();
const PENDING_REQS = new Set();
function idTarget(code, o) {
  if (!/^AGSC-(?:\d{2}-\d{2,3}[a-z]?|E\d{3})$/.test(code) || !RULE_INDEX.has(code)) return null;
  if (!RULE_INDEX_DECIDED) die(`a link to ${code} was derived before the specification pages were laid out`);
  const page = RULE_INDEX.get(code);
  return page === o.page ? `#${code}` : `/specs/${page}/#${code}`;
}
// A link to a rule or an error code from hand-written page text. The page it lands on is the
// rule index's, never a section name typed by hand, so a section published in parts breaks no link.
const ruleHref = id => {
  if (!RULE_INDEX_DECIDED) die(`a link to ${id} was asked for before the specification pages were laid out`);
  if (!RULE_INDEX.has(id)) die(`no rule or error code ${id} in the specification`);
  return `/specs/${RULE_INDEX.get(id)}/#${id}`;
};
const REF = id => `<a class="ref" href="${ruleHref(id)}">${id}</a>`;
function linkIds(text, o) {
  let out = '', last = 0;
  for (const m of text.matchAll(/\bAGSC-(?:\d{2}-\d{2,3}[a-z]?|E\d{3})\b|\b(?:PRD-\d{3}|NFR-\d{2})\b/g)) {
    let t = null;
    if (!o.inLink) t = m[0].startsWith('AGSC') ? idTarget(m[0], o) : (REQ_IDS.has(m[0]) && o.page !== 'requirements' ? `/docs/requirements/#${m[0]}` : null);
    const pending = !t && !o.inLink && (PENDING_RULES.has(m[0]) || PENDING_REQS.has(m[0]));
    out += esc(text.slice(last, m.index)) + (t ? `<a class="ref" href="${esc(t)}">${esc(m[0])}</a>` : pending ? `<span class="ref pending" title="drafted for the next release candidate; not yet in the published ${SPEC_VERSION}">${esc(m[0])}</span>` : esc(m[0]));
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}
const REF_LABEL = /^`?AGSC-(?:E\d{3}|\d{2}(?:-\d{2}[a-z]?)?)`?$/;
function mdInline(s, o = {}) {
  let out = '', i = 0, text = '';
  const flush = () => { if (text) { out += o.ruleLinks ? linkIds(text, o) : esc(text); text = ''; } };
  const closeBackticks = (from, n) => { // index of a run of exactly n backticks
    for (let j = from; j < s.length; j++) if (s[j] === '`') { let k = j; while (s[k] === '`') k++; if (k - j === n) return j; j = k - 1; }
    return -1;
  };
  const findClose = (from, tok) => { // skip code spans
    for (let j = from; j < s.length; j++) {
      if (s[j] === '\\') { j++; continue; }
      if (s[j] === '`') { let k = j; while (s[k] === '`') k++; const c = closeBackticks(k, k - j); if (c < 0) { j = k - 1; continue; } j = c + (k - j) - 1; continue; }
      if (s.startsWith(tok, j)) return j;
    }
    return -1;
  };
  while (i < s.length) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length && /[!-\/:-@\[-`{-~]/.test(s[i + 1])) { text += s[i + 1]; i += 2; continue; }
    if (c === '`') {
      let k = i; while (s[k] === '`') k++;
      const n = k - i, close = closeBackticks(k, n);
      if (close < 0) { text += s.slice(i, k); i = k; continue; }
      flush();
      let code = s.slice(k, close).replace(/\n/g, ' ');
      if (code.length > 2 && code.startsWith(' ') && code.endsWith(' ') && code.trim()) code = code.slice(1, -1);
      const target = o.ruleLinks && !o.inLink ? idTarget(code, o) : null;
      out += target ? `<a class="ref" href="${esc(target)}"><code>${esc(code)}</code></a>` : `<code>${esc(code)}</code>`;
      i = close + n; continue;
    }
    if (c === '[' && !o.inLink) {
      const close = findClose(i + 1, ']');
      if (close > 0 && s[close + 1] === '(') {
        const end = s.indexOf(')', close + 2);
        const url = end > 0 ? s.slice(close + 2, end) : '';
        if (end > 0 && !/\s/.test(url) && SAFE_URL.test(url)) {
          flush();
          // A link whose whole text is a rule, chapter or code id reads as a reference
          // (small, muted), the same as the ids this renderer links by itself.
          const label = s.slice(i + 1, close);
          const cls = REF_LABEL.test(label.trim()) ? ' class="ref"' : '';
          out += `<a${cls} href="${esc(url)}">${mdInline(label, { ...o, inLink: true })}</a>`;
          i = end + 1; continue;
        }
      }
    }
    if (c === '<' && !o.inLink) {
      const m = /^<(https?:\/\/[^\s<>]+)>/.exec(s.slice(i));
      if (m) { flush(); out += `<a href="${esc(m[1])}">${esc(m[1])}</a>`; i += m[0].length; continue; }
    }
    if (s.startsWith('**', i)) {
      const close = findClose(i + 2, '**');
      if (close > i + 2) { flush(); out += `<strong>${mdInline(s.slice(i + 2, close), o)}</strong>`; i = close + 2; continue; }
    }
    if (c === '*' && s[i + 1] && s[i + 1] !== ' ' && s[i + 1] !== '*' && !/[A-Za-z0-9]/.test(s[i - 1] || '')) {
      let close = -1;
      for (let j = i + 1; j < s.length; j++) {
        const f = findClose(j, '*'); if (f < 0) break;
        if (s[f + 1] !== '*' && s[f - 1] !== ' ' && s[f - 1] !== '*') { close = f; break; }
        j = f + (s[f + 1] === '*' ? 1 : 0);
      }
      if (close > i + 1) { flush(); out += `<em>${mdInline(s.slice(i + 1, close), o)}</em>`; i = close + 1; continue; }
    }
    text += c; i++;
  }
  flush();
  return out;
}
function headingId(text, used) {
  const num = /^(\d+(?:\.\d+)*)\s/.exec(text);
  let id = num ? 'section-' + num[1].replace(/\./g, '-') : text.toLowerCase().replace(/`/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!id) id = 'section';
  let k = id, n = 2; while (used.has(k)) k = `${id}-${n++}`;
  used.add(k); return k;
}
// The trailing traceability record of a rule: "[PRD-002, OKF v0.2]". It is
// rendered as a separate small line (class trace) so that the rule sentence reads on its own.
// A rule may close with an italic amendment note after its bracket — "[…] *(Amended
// <date> for <version>: …)*" — so the note is allowed to follow and is kept where the author put it.
const TRACE_RE = /\s\[([^\[\]]{3,})\]((?:\s*\*\(.*\)\*)?)\s*$/;
// Mark the trace record of a rule: the trailing bracket group on the last prose line of the item
// (never a table row, never a line inside a fenced block). Returns true when one was found.
function markTrace(c) {
  let fenced = false; const eligible = [];
  c.forEach((ln, k) => { if (/^\s*(`{3,}|~{3,})/.test(ln)) { fenced = !fenced; return; } if (!fenced && ln.trim() && !/^\s*\|/.test(ln)) eligible.push(k); });
  const k = eligible[eligible.length - 1];
  if (k === undefined || !TRACE_RE.test(c[k])) return false;
  c[k] = c[k].replace(TRACE_RE, ' \u0001$1\u0002$2'); return true;
}
function md(src, o = {}) {
  const used = o.used || new Set(), toc = o.toc || [];
  const lines = src.replace(/\n+$/, '').split('\n');
  const isFence = l => /^ {0,3}(`{3,}|~{3,})/.exec(l);
  const isList = l => /^( {0,3})([-*+]) +(.*)$/.exec(l);
  const isTableSep = l => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(l);
  const cells = l => {
    const r = []; let cur = '', tick = 0;
    const t = l.trim().replace(/^\|/, '').replace(/\|$/, '');
    for (let i = 0; i < t.length; i++) {
      if (t[i] === '\\' && t[i + 1] === '|') { cur += '|'; i++; continue; }
      if (t[i] === '`') { let k = i; while (t[k] === '`') k++; const n = k - i; tick = tick === 0 ? n : (tick === n ? 0 : tick); cur += t.slice(i, k); i = k - 1; continue; }
      if (t[i] === '|' && tick === 0) { r.push(cur.trim()); cur = ''; continue; }
      cur += t[i];
    }
    r.push(cur.trim()); return r;
  };
  let html = '', i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*$/.test(l)) { i++; continue; }
    let m;
    if ((m = isFence(l))) {
      const fence = m[1], info = l.slice(l.indexOf(fence) + fence.length).trim(), body = [];
      i++;
      while (i < lines.length && !new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(lines[i])) body.push(lines[i++]);
      i++;
      const lang = info.split(/\s+/)[0];
      html += `<pre tabindex="0"${lang ? ` data-lang="${esc(lang)}"` : ''}><code>${esc(body.join('\n'))}</code></pre>\n`;
      continue;
    }
    if ((m = /^(#{1,6}) +(.*?)\s*$/.exec(l))) {
      const level = Math.min(6, m[1].length + (o.shift || 0)), text = m[2], id = headingId(text, used);
      if (level === 2 && o.toc) toc.push({ id, html: mdInline(text, o) });
      html += `<h${level} id="${id}">${mdInline(text, o)}</h${level}>\n`; i++; continue;
    }
    if (/^ {0,3}>/.test(l)) {
      const q = [];
      while (i < lines.length && /^ {0,3}>/.test(lines[i])) q.push(lines[i++].replace(/^ {0,3}> ?/, ''));
      html += `<blockquote>\n${md(q.join('\n'), { ...o, used, toc: null })}</blockquote>\n`; continue;
    }
    if (l.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      let head = cells(l); i += 2;
      let rows = [];
      while (i < lines.length && lines[i].includes('|') && !/^\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      if (o.dropColumns) { // omit named columns (the requirements page drops the internal trace column)
        const keep = head.map((h, k) => !o.dropColumns.includes(h) ? k : -1).filter(k => k >= 0);
        head = keep.map(k => head[k]); rows = rows.map(r => keep.map(k => r[k] || ''));
      }
      const rowId = r => {
        const c = /^`(AGSC-E\d{3})`$/.exec(r[0] || '') || /^((?:PRD-\d{3}|NFR-\d{2}))\b/.exec(r[0] || '');
        if (!c || !o.ruleLinks || used.has(c[1])) return '';
        used.add(c[1]); return ` id="${c[1]}"`;
      };
      o.tables = o.tables || { n: 0 }; o.tables.n++; // one shared counter per page: every table region gets a distinct accessible name
      html += `<div class="table-wrap" tabindex="0" role="region" aria-label="Table ${o.tables.n}"><table>\n<thead><tr>${head.map(h => `<th scope="col">${mdInline(h, o)}</th>`).join('')}</tr></thead>\n<tbody>\n`
        + rows.map(r => `<tr${rowId(r)}>${r.map(c => `<td>${mdInline(c, { ...o, inRow: true })}</td>`).join('')}</tr>`).join('\n')
        + `\n</tbody></table></div>\n`;
      continue;
    }
    if ((m = isList(l))) {
      const base = m[1].length, items = [];
      while (i < lines.length) {
        const lm = isList(lines[i]);
        if (!lm || lm[1].length !== base) break;
        const content = [lm[3]], contentIndent = base + 2; i++;
        while (i < lines.length) {
          const x = lines[i];
          if (/^\s*$/.test(x)) {
            let j = i; while (j < lines.length && /^\s*$/.test(lines[j])) j++;
            if (j < lines.length && lines[j].match(/^ */)[0].length >= contentIndent) { while (i < j) { content.push(''); i++; } continue; }
            break;
          }
          const ind = x.match(/^ */)[0].length;
          if (ind >= contentIndent) { content.push(x.slice(contentIndent)); i++; continue; }
          if (isList(x) || isFence(x) || /^#{1,6} /.test(x) || /^ {0,3}>/.test(x)) break;
          content.push(x.trimStart()); i++; // lazy continuation
        }
        items.push(content);
      }
      html += '<ul>\n' + items.map(c => {
        const first = c[0], lead = /^\*\*(AGSC-\d{2}-\d{2,3}[a-z]?)\*\*/.exec(first);
        const isRule = !!(lead && o.ruleLinks);
        const retired = isRule && /^\*\*AGSC-[^*]+\*\*\s*\*\((?:retired at |reserved:)/.test(first);
        if (isRule && !retired && !markTrace(c)) RULES_WITHOUT_TRACE.push(lead[1]);
        const simple = c.length === 1 || c.slice(1).every(x => x !== '' && !isList(x) && !isFence(x) && !x.includes('|'));
        let inner = simple ? mdInline(c.join('\n'), o) : md(c.join('\n'), { ...o, used, toc: null, inItem: true });
        if (isRule) {
          inner = inner.replace(`<strong><a class="ref" href="#${lead[1]}">${lead[1]}</a></strong>`, `<a class="rule" href="#${lead[1]}"><strong>${lead[1]}</strong></a>`);
          if (!inner.includes('<a class="rule"')) die(`rule ${lead[1]}: identifier chip not rendered`);
          inner = inner.replace(/\u0001([\s\S]*?)\u0002/, (_, t) => `<span class="trace">[${t}]</span>`);
        }
        const cls = isRule ? ` class="rule-item${retired ? ' retired' : ''}"` : '';
        return `<li${isRule ? ` id="${lead[1]}"` : ''}${cls}>${inner}</li>`;
      }).join('\n') + '\n</ul>\n';
      continue;
    }
    const para = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !isFence(lines[i]) && !/^#{1,6} /.test(lines[i]) && !/^ {0,3}>/.test(lines[i]) && !isList(lines[i])
      && !(lines[i].includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1]))) para.push(lines[i++].trim());
    const placeholder = /^\{\{([a-z0-9-]+)(?::([a-z0-9-]+))?\}\}$/.exec(para.join(' '));
    if (placeholder && placeholder[1] === 'diagram') html += figure(placeholder[2]);
    else if (placeholder && o.slots && o.slots[placeholder[1]] !== undefined) html += o.slots[placeholder[1]];
    else if (placeholder) die(`unresolved placeholder {{${placeholder[0].slice(2, -2)}}}`);
    else {
      // On specification pages a paragraph that continues a rule after its table or code block carries the rule's trace bracket.
      const text = para.join('\n'), traced = o.ruleLinks && !o.inItem && TRACE_RE.test(text);
      html += `<p>${mdInline(traced ? text.replace(TRACE_RE, ' \u0001$1\u0002$2') : text, o).replace(/\u0001([\s\S]*?)\u0002/, (_, t) => `<span class="trace">[${t}]</span>`)}</p>\n`;
    }
  }
  return html;
}

// ------------------------------------------------------------------ diagrams (site/diagrams/*.diagram → inline SVG)
const DIAGRAMS = new Map();
for (const f of fs.readdirSync(path.join(ROOT, 'site/diagrams')).filter(f => f.endsWith('.diagram')).sort()) {
  const src = read(`site/diagrams/${f}`); checkText(f, src);
  try { DIAGRAMS.set(f.slice(0, -8), compileDiagram(f.slice(0, -8), src)); } catch (e) { die(`diagram ${e.message}`); }
}
const usedDiagrams = new Set();
function figure(id) {
  const d = DIAGRAMS.get(id); if (!d) die(`unknown diagram: ${id}`);
  usedDiagrams.add(id);
  // tabindex: on a phone the drawing is wider than its box and scrolls inside it, and a scrolling
  // region must be reachable by keyboard (WCAG 2.1.1, AGSC-06-20); the tables do the same.
  return `<figure class="diagram" tabindex="0">\n${d.svg}\n<figcaption>${esc(d.caption)}</figcaption>\n</figure>\n`;
}

// ------------------------------------------------------------------ inputs
const config = JSON.parse(read('agsc.config.json'));
checkText('agsc.config.json', read('agsc.config.json'));
const BASE = config.site.base.replace(/\/?$/, '/');
if (!/^https:\/\//.test(BASE)) die('site.base must be https (AGSC-01-19)');
const ORIGIN = BASE.replace(/\/$/, '');
const SPEC_VERSION = config.spec_version;
const TERMS_ID = 'LicenseRef-AgenticSystemCore-Content-Use-1.0';
const LICENSE_PROSE = config.bundle.license_prose || TERMS_ID;
const PROFILE = 'https://w3id.org/agentic-system-core/profile/agentic-knowledge';
const MCP_EXTENSION = 'com.agenticsystemcore/knowledge'; // the MCP extension identifier (AGSC-11-18)
const MCP_REVISION = '2026-07-28';                       // the MCP revision the node targets (AGSC-11-16)
const REL = 'https://w3id.org/agentic-system-core/rel#';
const NS = 'https://w3id.org/agentic-system-core/ns#';
const WELLKNOWN = '/.well-known/knowledge-linkset';
const TAGS = new Set((config.tags || {}).allowed || []);
const SUMMARIES = JSON.parse(read('site/summaries.json'));
const CONTACT_URL = 'https://andreibesleaga.com/contact/';
// security.txt Contact (RFC 9116 §2.5.3: "These SHOULD be listed in order of preference"): the
// engine repository's private vulnerability reporting first, the contact page second — the same
// two routes, in the same order, as SECURITY.md and both privacy notices. No public issue tracker.
const SECURITY_CONTACT_URLS = ['https://github.com/andreibesleaga/agentic-system-core/security/advisories/new', CONTACT_URL];
// The forges the "Propose an edit" links point at. The site's own repository is the contribution
// target declared in `contribute[]`; the specification pages are generated from the engine
// repository's files, so they link there (AGSC-11-14 names the channel, not the link).
const FORGE = {
  site: (config.contribute || []).find(c => c.mode === 'pr') ? config.contribute.find(c => c.mode === 'pr').target.replace(/\/$/, '') : null,
  engine: 'https://github.com/andreibesleaga/agentic-system-core',
};
if (!FORGE.site) die('agsc.config.json: contribute[] needs one entry with mode "pr" (AGSC-11-14)');

// Configuration guards, against schema/config.schema.json at the tag.
// `build.feed` and `build.rdfxml` are RESERVED names of 1.1 and are rejected (AGSC-06-01, AGSC-01-18).
for (const k of Object.keys(config.build || {})) if (k !== 'out') die(`agsc.config.json: build.${k} is a reserved name, AGSC-E004`);
// THE PATTERNS-NODE SWITCH. One setting turns the second node on or off for this
// site: `"x-patterns-node": false` in agsc.config.json. It lives in the vendor-extension
// namespace the FROZEN config schema reserves (`^x-[a-z0-9]+(-[a-z0-9]+)+$`, verified in
// schema/config.schema.json at the tag), which is the only place a setting no rule
// defines may go in a file whose schema is `additionalProperties: false`. Absent means ON,
// so a configuration written before this switch existed keeps behaving as it did.
// OFF drops three things and nothing else: the `peers` line from the emitted discovery
// document, the status-page row about the second node, and the clause in the guide that
// promises it. The `peers[]` member itself stays in the file and is still validated, so
// switching back on is one word.
if (!['boolean', 'undefined'].includes(typeof config['x-patterns-node'])) {
  die('agsc.config.json: x-patterns-node must be true or false');
}
const PATTERNS_NODE = config['x-patterns-node'] !== false;
const DECLARED_PEERS = config.peers || [];
const PEER_RE = /^https:\/\/[^\x00-\x20/?#]+(?:\/[^\x00-\x20/?#]+)*\/\.well-known\/knowledge-linkset$/;
for (const p of DECLARED_PEERS) if (!PEER_RE.test(p)) die(`agsc.config.json: peers[] entry is not a canonical well-known URL: ${p} (AGSC-10-12)`);
if (new Set(DECLARED_PEERS).size !== DECLARED_PEERS.length) die('agsc.config.json: peers[] must be unique (AGSC-10-12)');
const PEERS = PATTERNS_NODE ? DECLARED_PEERS : [];
// The sentences of the authored guide that promise the second node, and what they read
// when the switch is off. Each substitution MUST match, or the build stops: prose moves,
// and a switch that silently stops hiding something is worse than no switch.
const PATTERNS_PROSE = [
  { from: 'Beside it stand the open-source reference engine and a second node that runs it as a live demonstration; the Internet-Draft and the registrations follow.',
    hits: 0,
    to: 'Beside it stands the open-source reference engine; the Internet-Draft and the registrations follow.' },
];
// Counted on every build, in BOTH states, and checked once the guide has been read: a
// sentence this list no longer finds means the prose moved and the switch has quietly
// stopped hiding it. That is a build failure, not a warning.
const hidePatternsProse = text => {
  let out = text;
  for (const entry of PATTERNS_PROSE) {
    if (!out.includes(entry.from)) continue;
    entry.hits += 1;
    if (!PATTERNS_NODE) out = out.split(entry.from).join(entry.to);
  }
  return out;
};
const checkPatternsProse = () => {
  for (const entry of PATTERNS_PROSE) {
    if (entry.hits === 0) die(`scripts/build.js: the patterns-node switch expects this sentence in site/docs/ and no file carries it: ${JSON.stringify(entry.from)}`);
  }
};
const CONTRIBUTE = config.contribute || [];
for (const c of CONTRIBUTE) {
  if (!['pr', 'channel', 'form'].includes(c.mode)) die(`agsc.config.json: contribute[].mode ${c.mode} (AGSC-E209, AGSC-11-14)`);
  const okTarget = c.mode === 'channel' ? /^(mailto:[^\x00-\x20]+|urn:agsc:channel:[a-z0-9-]+)$/.test(c.target) : /^https:\/\/[^\x00-\x20]+$/.test(c.target);
  if (!okTarget) die(`agsc.config.json: contribute[].target ${c.target} does not match mode ${c.mode} (AGSC-E209, AGSC-11-14)`);
  for (const k of Object.keys(c)) if (!['mode', 'target', 'channel'].includes(k)) die(`agsc.config.json: contribute[].${k} is not a member of this site's configuration`);
}
// AGSC-02-24: an authored single-line string carries no C0 control, U+007F,
// U+0085, U+2028 or U+2029, because a writer puts it on a line of a line-oriented text surface.
const BAD_LINE_CP = c => c <= 0x1f || c === 0x7f || c === 0x85 || c === 0x2028 || c === 0x2029;
const singleLine = (where, v) => { if (typeof v === 'string') for (const ch of v) if (BAD_LINE_CP(ch.codePointAt(0))) die(`${where}: U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} is a control character or line separator in a single-line string (AGSC-E204, AGSC-02-24)`); return v; };
for (const [k, v] of Object.entries(config.site)) singleLine(`agsc.config.json: site.${k}`, v);
for (const [k, v] of Object.entries(config.bundle)) singleLine(`agsc.config.json: bundle.${k}`, v);

const index = splitFrontmatter(read('content/index.md'), 'content/index.md');
for (const k of ['spec_version', 'okf_version', 'title', 'description', 'base']) if (!index.fm[k]) die(`content/index.md: ${k} missing (AGSC-01-04)`);
if (index.fm.type !== undefined) die('content/index.md must not carry type (AGSC-01-04)');
if (index.fm.base.replace(/\/?$/, '/') !== BASE) die('content/index.md base must equal site.base (AGSC-E204)');
if (index.fm.spec_version !== SPEC_VERSION) die('spec_version differs between content/index.md and agsc.config.json (AGSC-00-17)');

const SPEC_FILES = engineList('spec').filter(f => /^\d{2}-[a-z0-9-]+\.md$/.test(f));
const declared = (engineFile('spec/00-overview.md').match(/`spec_version: "([^"]+)"`/) || [])[1];
if (declared !== SPEC_VERSION) die(`tag ${SPEC_TAG} declares spec_version ${declared}, config says ${SPEC_VERSION}`);

// No authored page may name a release candidate other than the one being published: a stale
// literal is how a site restates a version it no longer builds (AGSC-00-17).
{
  const walkSrc = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walkSrc(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of [...walkSrc(path.join(ROOT, 'site')), ...walkSrc(path.join(ROOT, 'content'))].filter(f => /\.(md|json)$/.test(f)).sort()) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\b1\.0\.0-rc\.\d+\b/g)) {
      if (m[0] === SPEC_VERSION) continue;
      // No carve-out: a page states the candidate this build publishes and no other, not even
      // as history (the change log carries the history). Any other candidate literal is stale,
      // whatever words introduce it; the sentence is rewritten, never excused.
      // (A version the specification itself quotes reaches the site through the tagged text,
      // which this walk does not read.)
      die(`${path.relative(ROOT, f)}: names ${m[0]} while this build publishes ${SPEC_VERSION} (AGSC-00-17)`);
    }
  }
}

const PLURAL = { concept: 'concepts', episode: 'episodes', procedure: 'procedures', lesson: 'lessons', cluster: 'clusters', gate: 'gates' };
const TASK_STATES = [...engineModule('src/governance/boards.js').TASK_STATES];
const KINDS = new Set(['pattern', 'taxonomy', 'explainer', 'principle', 'decision', 'spec', 'task', 'term', 'architecture']);
const cp_len = s => [...s].length;
const items = [];
for (const [type, plural] of Object.entries(PLURAL)) {
  const dir = path.join(ROOT, 'content', plural);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort()) {
    const rel = `content/${plural}/${f}`, slug = f.slice(0, -3);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || cp_len(slug) > 64) die(`${rel}: slug grammar (AGSC-01-10)`);
    const src = read(rel);
    const { fm, body } = splitFrontmatter(src, rel);
    if (fm.type !== type) die(`${rel}: type does not match folder (AGSC-E205)`);
    if (!fm.title || cp_len(fm.title) < 3 || cp_len(fm.title) > 120) die(`${rel}: title 3-120 code points (AGSC-E204)`);
    if (fm.description !== undefined && (cp_len(fm.description) < 40 || cp_len(fm.description) > 200)) die(`${rel}: description 40-200 code points (AGSC-E204)`);
    singleLine(`${rel}: title`, fm.title); singleLine(`${rel}: description`, fm.description);
    for (const a of fm.aliases || []) singleLine(`${rel}: aliases[]`, a);
    for (const s of fm.sources || []) for (const k of ['title', 'author']) singleLine(`${rel}: sources[].${k}`, s[k]);
    if ((type === 'concept' || type === 'cluster') && !fm.description) die(`${rel}: description required on ${type} for this site (AGSC-E408)`);
    if (type === 'concept' && !KINDS.has(fm.kind)) die(`${rel}: kind (AGSC-02-12)`);
    if (!fm.prov || !['human', 'ai-assisted', 'ai-generated', 'imported'].includes(fm.prov.origin)) die(`${rel}: prov.origin (AGSC-02-07)`);
    if (!/^human:[a-z0-9][a-z0-9._-]*$/.test(fm.prov.operator || '')) die(`${rel}: prov.operator (AGSC-02-07)`);
    if (fm.status !== undefined) die(`${rel}: this site authors no status (all items are published)`);
    const tags = fm.tags || [];
    if (tags.length < 2 || tags.length > 5 || !tags.every(t => TAGS.has(t))) die(`${rel}: 2-5 tags from tags.allowed (AGSC-E203)`);
    for (const s of fm.sources || []) if (!/^https?:\/\/[^\x00-\x20]+$/.test(s.resource || '')) die(`${rel}: sources[].resource (AGSC-02-10)`);
    for (const k of Object.keys(fm)) if (!['type', 'title', 'description', 'kind', 'tags', 'clusters', 'prov', 'sources', 'when', 'task_state'].includes(k)) die(`${rel}: key ${k} not used by this site`);
    // A task (the project's own board, Mode 5): the state is one of the nine the engine knows (AGSC-02-99).
    if (fm.task_state !== undefined && (fm.kind !== 'task' || !TASK_STATES.includes(fm.task_state))) die(`${rel}: task_state only on a concept of kind task, one of ${TASK_STATES.join(', ')} (AGSC-02-99)`);
    items.push({ type, plural, slug, fm, body, src, rel, iri: `${BASE}${plural}/${slug}/`, url: `/${plural}/${slug}/` });
  }
}
items.sort((a, b) => byCode(a.slug, b.slug));
{ const seen = new Set(); for (const it of items) { if (seen.has(it.slug)) die(`slug not unique: ${it.slug} (AGSC-E206)`); seen.add(it.slug); } }
const bySlug = new Map(items.map(it => [it.slug, it]));
const clusters = items.filter(it => it.type === 'cluster');
for (const it of items) for (const c of it.fm.clusters || []) if (!bySlug.has(c) || bySlug.get(c).type !== 'cluster') die(`${it.rel}: unknown cluster ${c} (AGSC-E301)`);
const members = c => items.filter(it => (it.fm.clusters || []).includes(c.slug));

// ------------------------------------------------------------------ ontology: Turtle subset -> triples
function parseTurtle(src) {
  const prefixes = {}, triples = [];
  let i = 0;
  const ws = () => { for (;;) { while (i < src.length && /\s/.test(src[i])) i++; if (src[i] === '#') { while (i < src.length && src[i] !== '\n') i++; continue; } break; } };
  const term = () => {
    ws();
    if (src[i] === '<') { const e = src.indexOf('>', i); const v = src.slice(i + 1, e); i = e + 1; return { t: 'iri', v }; }
    if (src[i] === '"') {
      let v = ''; i++;
      while (src[i] !== '"') { if (src[i] === '\\') { const e = src[i + 1]; v += { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\' }[e] ?? die('turtle escape'); i += 2; } else v += src[i++]; }
      i++;
      if (src[i] === '@') { const m = /^@([A-Za-z]+(?:-[A-Za-z0-9]+)*)/.exec(src.slice(i)); i += m[0].length; return { t: 'lit', v, lang: m[1].toLowerCase() }; }
      if (src.startsWith('^^', i)) { i += 2; const d = term(); return { t: 'lit', v, dt: d.v }; }
      return { t: 'lit', v };
    }
    const m = /^([A-Za-z][A-Za-z0-9_-]*)?:([A-Za-z0-9_][A-Za-z0-9_.-]*[A-Za-z0-9_-]|[A-Za-z0-9_]?)/.exec(src.slice(i));
    if (m) { i += m[0].length; if (prefixes[m[1] || ''] === undefined) die(`turtle: unknown prefix ${m[1]}`); return { t: 'iri', v: prefixes[m[1] || ''] + m[2] }; }
    if (/^a\s/.test(src.slice(i))) { i += 1; return { t: 'iri', v: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' }; }
    if (/^(true|false)\b/.test(src.slice(i))) { const b = /^(true|false)/.exec(src.slice(i))[1]; i += b.length; return { t: 'lit', v: b, dt: 'http://www.w3.org/2001/XMLSchema#boolean' }; }
    die(`turtle: unexpected input at ${i}: ${JSON.stringify(src.slice(i, i + 30))}`);
  };
  for (;;) {
    ws();
    if (i >= src.length) break;
    if (src.startsWith('@prefix', i)) {
      i += 7; ws(); const m = /^([A-Za-z][A-Za-z0-9_-]*)?:/.exec(src.slice(i)); i += m[0].length;
      const iri = term(); prefixes[m[1] || ''] = iri.v; ws(); if (src[i++] !== '.') die('turtle: "." after @prefix'); continue;
    }
    const s = term();
    for (;;) {
      const p = term();
      for (;;) { const o = term(); triples.push({ s: s.v, p: p.v, o }); ws(); if (src[i] === ',') { i++; continue; } break; }
      ws();
      if (src[i] === ';') { i++; ws(); if (src[i] === '.') { i++; break; } continue; }
      if (src[i] === '.') { i++; break; }
      die(`turtle: expected ";" or "." at ${i}`);
    }
  }
  return { prefixes, triples };
}
const TTL = engineFile('ontology/agsc.ttl');
checkText('ontology/agsc.ttl', TTL);
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const OWL = 'http://www.w3.org/2002/07/owl#', RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const ONTOLOGY_IRI = 'https://w3id.org/agentic-system-core/ns';
// One vocabulary file, read: its triples and the accessors the /ns/ pages use. The current
// version is ontology/agsc.ttl; each frozen copy below is read from its own Turtle file.
function vocabularyOf(ttl) {
  const parsed = parseTurtle(ttl);
  const tri = (s, p) => parsed.triples.filter(t => t.s === s && t.p === p).map(t => t.o);
  const one = (s, p) => (tri(s, p)[0] || {}).v;
  const ascSubjects = [...new Set(parsed.triples.map(t => t.s))].filter(s => s.startsWith(NS)).sort(byCode);
  const kindOf = s => { const ts = tri(s, RDF_TYPE).map(o => o.v); return ts.includes(OWL + 'Class') ? 'class' : ts.includes(OWL + 'ObjectProperty') ? 'object' : ts.includes(OWL + 'DatatypeProperty') ? 'datatype' : 'other'; };
  return { onto: parsed, tri, one, ascSubjects, kindOf, versionInfo: one(ONTOLOGY_IRI, OWL + 'versionInfo') };
}
const VOCABULARY = vocabularyOf(TTL);
const { onto, tri, one, ascSubjects, kindOf } = VOCABULARY;
const VERSION_INFO = VOCABULARY.versionInfo;
if (!VERSION_INFO) die('ontology: owl:versionInfo missing (AGSC-05-25)');
// ------------------------------------------------------------------ the frozen copies of the vocabulary (AGSC-05-25, AGSC-00-16)
// A versioned copy, once published under /ns/<version>/, never changes, and it stays served when a
// later version is published beside it. Each one is kept as a static input of this site,
// static/ns/<version>/ (static/README.md): the four files exactly as published, which
// scripts/check.js holds by SHA-256. The build serves those bytes, never a regeneration, and gives
// each copy its page; the copy of the current version is generated from ontology/agsc.ttl as before,
// and if a frozen copy carries the same version, the generated files must be its bytes.
const VOCABULARY_FILES = ['agsc.nt', 'agsc.rdf', 'agsc.ttl', 'context.jsonld'];
const FROZEN_NS = new Map(); // version -> Map(file name -> bytes as published)
{
  const dir = path.join(ROOT, 'static', 'ns');
  for (const e of fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => byCode(a.name, b.name)) : []) {
    if (!e.isDirectory()) die(`static/ns/${e.name}: only one folder per frozen vocabulary version belongs here (static/README.md)`);
    const held = fs.readdirSync(path.join(dir, e.name)).sort(byCode);
    if (held.join(', ') !== VOCABULARY_FILES.join(', ')) die(`static/ns/${e.name}/ must hold exactly ${VOCABULARY_FILES.join(', ')}; it holds ${held.join(', ') || 'nothing'} (AGSC-05-25)`);
    const copy = new Map(VOCABULARY_FILES.map(f => [f, fs.readFileSync(path.join(dir, e.name, f))]));
    const said = vocabularyOf(copy.get('agsc.ttl').toString('utf8')).versionInfo;
    if (said !== e.name) die(`static/ns/${e.name}/agsc.ttl says owl:versionInfo ${said}, not ${e.name} (AGSC-05-25)`);
    FROZEN_NS.set(e.name, copy);
  }
}
// Every versioned copy this site serves, in code-point order: the frozen ones and the current one.
const SERVED_NS = [...new Set([...FROZEN_NS.keys(), VERSION_INFO])].sort(byCode);

const ntTerm = o => {
  const escLit = v => v.replace(/[\\"\n\r\t]|[\x00-\x1f]/g, c => ({ '\\': '\\\\', '"': '\\"', '\n': '\\n', '\r': '\\r', '\t': '\\t' }[c] || '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')));
  if (o.t === 'iri') return `<${o.v}>`;
  if (o.lang) return `"${escLit(o.v)}"@${o.lang}`;
  return `"${escLit(o.v)}"^^<${o.dt || XSD + 'string'}>`; // AGSC-05-31: plain literals carry xsd:string explicitly in N-Triples/N-Quads
};
const NT = [...new Set(onto.triples.map(t => `<${t.s}> <${t.p}> ${ntTerm(t.o)} .`))].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))).join('\n') + '\n';

// exactly the prefix set, the order, the declaration case and the indentation of the
// engine's own `tools/gen-ns`, so that `gen-ns --check www/ns` reports nothing at all. The
// `schema` prefix is declared and used by no triple of this vocabulary, as it is there: a
// declared prefix nothing uses is legal RDF/XML, and agreeing byte for byte with the checker is
// worth more than dropping it. scripts/check.js runs that checker on every run.
const RDFXML_NS = { asc: NS, dcterms: 'http://purl.org/dc/terms/', owl: OWL, prov: 'http://www.w3.org/ns/prov#', rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', rdfs: RDFS, schema: 'https://schema.org/', skos: 'http://www.w3.org/2004/02/skos/core#', vann: 'http://purl.org/vocab/vann/', xsd: XSD };
const qname = iri => { for (const [p, ns] of Object.entries(RDFXML_NS)) if (iri.startsWith(ns) && /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(iri.slice(ns.length))) return `${p}:${iri.slice(ns.length)}`; die(`rdf/xml: no QName for ${iri}`); };
const RDFXML = (() => {
  const subs = [...new Set(onto.triples.map(t => t.s))].sort(byCode);
  let x = '<?xml version="1.0" encoding="UTF-8"?>\n<rdf:RDF\n' + Object.entries(RDFXML_NS).map(([p, ns]) => `    xmlns:${p}="${esc(ns)}"`).join('\n') + '>\n';
  for (const s of subs) {
    x += `  <rdf:Description rdf:about="${esc(s)}">\n`;
    const ts = onto.triples.filter(t => t.s === s).map(t => ({ q: qname(t.p), p: t.p, o: t.o, k: ntTerm(t.o) }));
    ts.sort((a, b) => byCode(a.p, b.p) || byCode(a.k, b.k));
    for (const t of ts) {
      if (t.o.t === 'iri') x += `    <${t.q} rdf:resource="${esc(t.o.v)}"/>\n`;
      else x += `    <${t.q}${t.o.lang ? ` xml:lang="${t.o.lang}"` : ''}${t.o.dt ? ` rdf:datatype="${esc(t.o.dt)}"` : ''}>${esc(t.o.v)}</${t.q}>\n`;
    }
    x += '  </rdf:Description>\n';
  }
  return x + '</rdf:RDF>\n';
})();

// JSON-LD context (AGSC-06-32). External properties the rules of §03, §05, §06 and §11 emit.
// A local name that collides with an asc: term or with another external local name is keyed by
// its compact IRI (the specification does not pin term names).
const EXTERNAL = [
  ['rdfs:seeAlso', '@id'], ['skos:prefLabel', null], ['skos:altLabel', null], ['skos:definition', null],
  ['skos:inScheme', '@id'], ['skos:member', '@id'], ['skos:broader', '@id'], ['skos:narrower', '@id'], ['skos:related', '@id'],
  ['dcterms:requires', '@id'], ['dcterms:isRequiredBy', '@id'], ['dcterms:replaces', '@id'], ['dcterms:isReplacedBy', '@id'],
  ['dcterms:source', null], ['dcterms:title', null], ['dcterms:creator', null], ['dcterms:date', null], ['dcterms:format', null],
  // AGSC-05-26 types `dcterms:created` and `dcterms:modified` as
  // `xsd:dateTime`, and AGSC-05-31(c) makes `schema:usageInfo` a literal, not an
  // IRI. These three rows keep this context and the engine's the byte-identical
  // copy AGSC-05-09 asks for.
  ['dcterms:license', null], ['dcterms:created', XSD + 'dateTime'], ['dcterms:modified', XSD + 'dateTime'],
  ['prov:wasDerivedFrom', '@id'], ['schema:license', null], ['schema:usageInfo', null],
];
const CONTEXT = (() => {
  const c = { '@protected': true, '@version': 1.1, asc: NS, dcterms: 'http://purl.org/dc/terms/', prov: 'http://www.w3.org/ns/prov#', rdfs: RDFS, schema: 'https://schema.org/', skos: 'http://www.w3.org/2004/02/skos/core#', xsd: XSD };
  const ascNames = new Set();
  for (const s of ascSubjects) {
    const name = s.slice(NS.length); ascNames.add(name);
    const k = kindOf(s), def = { '@id': `asc:${name}` };
    if (k === 'object') def['@type'] = '@id';
    if (k === 'datatype') { const r = one(s, RDFS + 'range'); if (r) def['@type'] = r; }
    c[name] = def;
  }
  const local = EXTERNAL.map(([q]) => q.split(':')[1]);
  for (const [q, type] of EXTERNAL) {
    const name = q.split(':')[1];
    const key = ascNames.has(name) || local.filter(x => x === name).length > 1 ? q : name;
    c[key] = type ? { '@id': q, '@type': type } : { '@id': q };
  }
  return { '@context': c };
})();
const CONTEXT_URL = `${BASE}ns/${VERSION_INFO}/context.jsonld`;
const ctxKey = q => CONTEXT['@context'][q.split(':')[1]] && CONTEXT['@context'][q.split(':')[1]]['@id'] === q ? q.split(':')[1] : q;

// ------------------------------------------------------------------ graph.jsonld (AGSC-05, JSON-LD view)
// AGSC-06-02: the per-item JSON-LD view `/pages/<slug>.jsonld` is this same graph restricted to
// one item — its node, the Source nodes it names, and the Bundle node every view carries.
const ITEM_NODES = new Map();
const GRAPH = (() => {
  const lit = v => ({ '@language': 'en', '@value': v });
  const single = a => a.length === 1 ? a[0] : a;
  const nodes = [{
    '@id': BASE, '@type': 'Bundle', specVersion: SPEC_VERSION,
    // AGSC-05-26 / AGSC-06-18: `schema:usageInfo` carries the
    // Content Use Terms IDENTIFIER as an `xsd:string` literal, not a link to the
    // page that prints the terms — "a LicenseRef- or SPDX identifier is text, not
    // an IRI".
    [ctxKey('schema:license')]: LICENSE_PROSE, [ctxKey('schema:usageInfo')]: TERMS_ID,
  }];
  const TYPE = { concept: 'Concept', procedure: 'Procedure', cluster: 'Cluster', episode: 'Episode', lesson: 'Lesson', gate: 'Gate' };
  for (const it of items) {
    const n = { '@id': it.iri, '@type': TYPE[it.type], [ctxKey('skos:prefLabel')]: lit(it.fm.title) };
    if (it.fm.description) n[ctxKey('skos:definition')] = lit(it.fm.description);
    if (it.type === 'concept') { n[ctxKey('skos:inScheme')] = BASE; n.kind = it.fm.kind; }
    if (it.type !== 'cluster' || it.fm.prov) { n.origin = it.fm.prov.origin; n.operator = it.fm.prov.operator; }
    if (it.type === 'cluster') { const m = members(it).map(x => x.iri).sort(byCode); if (m.length) n[ctxKey('skos:member')] = single(m); }
    const srcs = (it.fm.sources || []).map((s, k) => ({ '@id': `${it.iri}#source-${k + 1}`, '@type': 'Source', [ctxKey('dcterms:source')]: s.resource, ...(s.title ? { [ctxKey('dcterms:title')]: s.title } : {}), ...(s.grade ? { grade: s.grade } : {}) }));
    if (srcs.length) n.source = single(srcs.map(s => s['@id']));
    nodes.push(n, ...srcs);
    ITEM_NODES.set(it.slug, [nodes[0], n, ...srcs].sort((a, b) => byCode(a['@id'], b['@id'])));
  }
  nodes.sort((a, b) => byCode(a['@id'], b['@id']));
  return { '@context': CONTEXT_URL, '@graph': nodes };
})();

// ------------------------------------------------------------------ llms.txt and llms-full.txt (AGSC-06-13a)
const LLMS = require('./llms.js')({
  title: config.site.title, base: BASE, description: index.fm.description, license_prose: LICENSE_PROSE, terms: TERMS_ID,
  spec_version: SPEC_VERSION, bundle_version: BUNDLE_VERSION, generated_at: GENERATED_AT,
  provenanceLines: engineProvenance.provenanceLines,
  clusters: clusters.map(c => ({ slug: c.slug, title: c.fm.title })),
  items: items.map(it => ({ slug: it.slug, type: it.type, title: it.fm.title, description: it.fm.description, clusters: it.fm.clusters, iri: it.iri, body: it.body, status: it.fm.status })),
});

// ------------------------------------------------------------------ search.json (AGSC-06-16, tokenizer AGSC-06-23)
function tokenize(s) {
  const lowered = s.normalize('NFC').replace(/[A-Z]/g, c => c.toLowerCase()); // ASCII lower-casing only
  const toks = lowered.split(/[^a-z0-9\p{L}\p{Nd}\p{M}]+/u).filter(t => [...t].length >= 2);
  return toks;
}
function searchIndex(list) {
  const docs = [...list].sort((a, b) => byCode(a.slug, b.slug));
  const terms = {};
  docs.forEach((d, k) => {
    const body = (d.body || '').replace(/^ {0,3}(`{3,}|~{3,})[\s\S]*?\n {0,3}\1[`~]*\s*$/gm, '');
    const input = [d.title, d.description || '', ...(d.tags || []), body].join('\n');
    for (const t of new Set(tokenize(input))) (terms[t] = terms[t] || []).push(k);
  });
  const doc = d => ({ ...(d.clusters && d.clusters.length ? { cluster: d.clusters[0] } : {}), ...(d.description ? { description: d.description } : {}), slug: d.slug, title: d.title });
  return { docs: docs.map(doc), terms: Object.fromEntries(Object.keys(terms).sort().map(t => [t, terms[t]])) };
}
for (const vf of ['build-0001-search-tokenizer', 'build-0002-tokenizer-non-latin', 'build-0003-search-astral-member-order']) { // the tokenizer is normative: prove it against the tagged vectors
  const v = JSON.parse(engineFile(`tests/vectors/build/${vf}.json`));
  const got = searchIndex(v.input.items);
  if (jcs(got) !== jcs(v.expected.search)) die(`search index disagrees with vector ${v.id}`);
  if (v.expected.output !== undefined && jcs(got) + '\n' !== v.expected.output) die(`search index bytes disagree with vector ${v.id}`);
}
const SEARCH_JSON = jcs(searchIndex(items.map(it => ({ slug: it.slug, title: it.fm.title, description: it.fm.description, tags: it.fm.tags, clusters: it.fm.clusters, body: it.body })))) + '\n';

// ------------------------------------------------------------------ the engine builds the Bundle
// /. Everything whose bytes a rule pins and which carries no design of its own comes
// from a real `agsc build` over this repository's own content — the same engine, the same rules
// and the same bytes as the patterns node. `scripts/engine.js` says how and why; the routes this
// generator ADOPTS and the routes it still writes itself are the two lists below, and a route in
// neither list is a build error, so a surface the engine gains cannot be quietly ignored.
const SECURITY_TXT = [
  ...SECURITY_CONTACT_URLS.map(u => `Contact: ${u}`),
  `Expires: ${iso(EPOCH + 364 * 86400)}`,
  'Preferred-Languages: en',
  `Canonical: ${BASE}.well-known/security.txt`,
  // Policy (RFC 9116 §2.5.7) is the vulnerability disclosure policy: the engine repository's SECURITY.md,
  // which names the two Contact routes above in the same order.
  `Policy: ${FORGE.engine}/blob/main/SECURITY.md`,
].join('\n') + '\n';
const ENGINE_BUILD = require('./engine.js').build({
  engine: ENGINE, config, epoch: EPOCH, privacy: read('site/privacy.md'), securityTxt: SECURITY_TXT,
});
if (ENGINE_BUILD.version !== SPEC_VERSION) die(`the engine at ${ENGINE} is ${ENGINE_BUILD.version}, this build publishes ${SPEC_VERSION}`);
// The routes taken from the engine, byte for byte. Each is a machine artefact: a rule fixes its
// bytes and no part of it is this site's design.
const ADOPTED = [
  '/search.json', '/graph.jsonld', '/graph.nq', '/graph.ttl',
  '/ns/context.jsonld', '/chunks.jsonl', '/now.md', '/skills/index.json', '/ledger.jsonl',
];
const ADOPTED_PREFIX = ['/pages/', '/skills/', '/boards/', '/graph/fragments/'];
// The routes the engine emits that this generator writes itself, with the reason. An HTML page is
// here because the engine's page shell has no slot for this site's stylesheet, header or footer
// (specification item); the rest are named one by one.
const ENGINE_ROUTES_KEPT = new Map([
  ['/llms.txt', 'this site states its own section order and the site generator is proved against the tagged vectors; only the provenance block is the engine\'s'],
  ['/llms-full.txt', 'as /llms.txt'],
  ['/.well-known/knowledge-linkset', 'this node declares peers, a contribute channel and a registration status the scratch Bundle does not carry'],
  ['/.well-known/security.txt', 'authored here and handed to the engine as its input'],
  ['/.well-known/tdmrep.json', 'the relative location form this site has published since v0'],
  ['/robots.txt', 'generated here from the same site.tdm_crawlers[] the engine reads, and checked against it on every build'],
  ['/sitemap.xml', 'this site has 54 pages the scratch Bundle has no idea about'],
  ['/_headers', 'the deployment profile carries this site\'s own content types'],
  ['/_redirects', 'as _headers'],
  ['/404.html', 'an HTML page'],
  ['/assets/site.css', 'the engine default theme; this site publishes the same bytes from assets/site.css (checked below)'],
  ['/assets/theme.js', 'the engine theme switcher; this site publishes the engine\'s own bytes'],
  // The versioned context copies, one per version this site serves: the frozen ones from static/ns/,
  // the current one generated here beside the other versioned vocabulary documents.
  ...SERVED_NS.map(v => [`/ns/${v}/context.jsonld`, FROZEN_NS.has(v) ? `the frozen copy of version ${v}, served from static/ns/${v}/` : 'emitted here beside the other versioned vocabulary documents this namespace site serves']),
  ['/search/agsc-search.js', 'the engine\'s /search/ page script; this site keeps its own /search/ page and /assets/search.js over assets/search-site.json (every page, section, rule and error code, which the scratch Bundle does not carry)'],
]);
{
  const adopted = r => ADOPTED.includes(r) || ADOPTED_PREFIX.some(pre => r.startsWith(pre));
  // An engine working tree whose vocabulary is already newer than the tagged specification this
  // build publishes emits the versioned context of ITS version. This site serves the versions above
  // and names /ns/context.jsonld in its own graph, so that one route is left out, not adopted.
  const engineAhead = r => /^\/ns\/[^/]+\/context\.jsonld$/.test(r) && SPEC_SOURCE === 'tag';
  const unaccounted = [...ENGINE_BUILD.files.keys()]
    .filter(r => !adopted(r) && !ENGINE_ROUTES_KEPT.has(r) && !engineAhead(r) && !r.endsWith('index.html') && !r.startsWith('/compose/'));
  if (unaccounted.length) die(`the engine emits routes this generator neither adopts nor accounts for: ${unaccounted.join(', ')}`);
}

// ------------------------------------------------------------------ the derived ledger (AGSC-08-20a, AGSC-06-08, AGSC-10-04)
// This node publishes the Level-2 form of its discovery document, with the derived ledger. When the engine's build emits
// `/ledger.jsonl` (with its `…/rel#ledger` link) this site publishes those bytes; until it does,
// the ledger is derived here by the ENGINE's own function over the same git-log file the content
// version reads, the content tree of `content/` at HEAD and the same build instant, and the link
// is added to the discovery document below. Either way the bytes are the engine's derivation.
const LEDGER = (() => {
  if (ENGINE_BUILD.files.has('/ledger.jsonl')) return { fromEngine: true };
  if (!GIT_LOG) die('no git history to derive /ledger.jsonl from; this node publishes the Level-2 form, which links it (AGSC-08-20a, AGSC-10-04)');
  const tree = cp.execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD:content'], { encoding: 'utf8' }).trim();
  if (!/^[0-9a-f]{40,64}$/.test(tree)) die(`the content tree hash is not a git object id: ${tree}`);
  const derived = engineLedger.derive(GIT_LOG, tree, ENGINE_BUILD.version, { epoch: EPOCH });
  return { fromEngine: false, bytes: derived.ledger, head: derived.head };
})();

// ------------------------------------------------------------------ the discovery document (AGSC-06-07…10, 06-08a, 11-16)
// the document is the ENGINE's, for this Bundle, with two additions this site owns.
// It is a strict superset of what this generator used to write by hand: it declares the graph in
// its three serialisations, the NOW page and the skill packs — relations that had no target here
// before — and it carries the RFC 9530 digest of every linked file, the item counts, the bundle
// hash, the specification version and the content version, none of which a hand-written document
// could keep true. `agsc-generated-at` on the `describedby` link, which the `/compose/` page
// reads, is the engine's too (AGSC-06-08).
//
// The two additions:
//   `…/rel#ontology`  — the vocabulary in Turtle. A content node does not publish `/ns/agsc.ttl`
//                       and the engine rightly does not declare it; THIS node is also the
//                       namespace document site the w3id negotiation of AGSC-06-06 resolves to,
//                       so it serves the file and says so.
//   two `alternate`s  — the `llm-context` adapter's two additive files, which the engine writes
//                       outside `build.out` and tells its caller to declare exactly this way
//                       (AGSC-06-35, AGSC-01-26a).
const WELLKNOWN_DOC = (() => {
  const doc = JSON.parse(String(ENGINE_BUILD.files.get('/.well-known/knowledge-linkset')));
  const set = doc.linkset[0];
  if (!Array.isArray(set.describedby) || set.describedby[0]['agsc-generated-at'] === undefined) die('the engine\'s discovery document carries no agsc-generated-at (AGSC-06-08)');
  // AGSC-06-08a: at Level >= 2 every artefact link carries the RFC 9530 digest of the bytes
  // served at it, so a reader can tell that what it fetched is what was declared. The engine
  // stamps its own links; these three are this site's and are stamped here from the same bytes
  // the build publishes — never from a file read a second time.
  const digest = bytes => [`sha-256=:${crypto.createHash('sha256').update(bytes).digest('base64')}:`];
  set[`${REL}ontology`] = [{ digest: digest(TTL), href: `${BASE}ns/agsc.ttl`, type: 'text/turtle' }];
  // AGSC-06-08's link table: `service-doc` names `/specs/` when the node serves that route. This
  // node serves it and the scratch Bundle does not, so the engine leaves the link out; it is added
  // here in the table's form (no `type`, no `digest`), beside the `/docs/` guide link that
  // agsc.config.json declares as a related-system link (AGSC-06-35).
  set['service-doc'] = [...(set['service-doc'] || []), { href: `${BASE}specs/` }].sort((a, b) => byCode(a.href, b.href));
  if (!LEDGER.fromEngine) {
    if (set[`${REL}ledger`] !== undefined) die('the engine declares a ledger link but emitted no /ledger.jsonl (AGSC-06-08)');
    set[`${REL}ledger`] = [{ 'agsc-ledger-head': [LEDGER.head], digest: digest(Buffer.from(LEDGER.bytes, 'utf8')), href: `${BASE}ledger.jsonl`, type: 'application/jsonl' }];
  }
  set.alternate = [...set.alternate,
    { digest: digest(ENGINE_BUILD.exports.get('chunks-index.toon')), href: `${BASE}exports/chunks-index.toon`, type: 'text/plain' },
    { digest: digest(ENGINE_BUILD.exports.get('llms-ctx.txt')), href: `${BASE}exports/llms-ctx.txt`, type: 'text/plain' },
  ].sort((a, b) => byCode(a.href, b.href));
  // the patterns-node switch, applied to the emitted document. With the switch off this
  // node declares no peer, and `peers[]` deliberately STAYS in the configuration so that turning
  // the second node back on is one word. The engine reads that configuration and declares the
  // peers, rightly, so the switch is applied here, to the document, and the guard below then
  // compares what is emitted with what the switch allows. (Found by's two-position test:
  // before this line the build died in the off position, because the engine's document named a
  // peer the switch had removed.)
  if (!PATTERNS_NODE) delete set[`${REL}peer`];
  // The peers this node names are the configuration's, and the engine took them from the same
  // configuration; a missing one would break the mutual check of AGSC-10-12 silently.
  const declaredPeers = (set[`${REL}peer`] || []).map(l => l.href).sort(byCode);
  if (declaredPeers.join(',') !== [...PEERS].sort(byCode).join(',')) die(`the discovery document declares peers ${declaredPeers.join(', ')} but peers[] names ${PEERS.join(', ')} (AGSC-10-12)`);
  return doc;
})();
const WELLKNOWN_BYTES = jcs(WELLKNOWN_DOC) + '\n';

// ------------------------------------------------------------------ specification pages and the tagged documents
const specPages = SPEC_FILES.map(f => {
  const src = engineFile(`spec/${f}`);
  checkText(`spec/${f}`, src);
  const slug = f.slice(0, -3);
  const h1 = (/^# (.*)$/m.exec(src) || [])[1] || slug;
  return { file: f, slug, src, h1, url: `/specs/${slug}/` };
});
// Provisional: the SECTION each rule id and error code belongs to. The layout of the
// specification pages (below, before the pages are written) replaces the value by the PART
// that carries the id when a section is published in parts; nothing derives a link before that.
RULE_INDEX = new Map();
for (const p of specPages) {
  for (const m of p.src.matchAll(/^\s*- \*\*(AGSC-\d{2}-\d{2,3}[a-z]?)\*\*/gm)) if (!RULE_INDEX.has(m[1])) RULE_INDEX.set(m[1], p.slug);
  for (const m of p.src.matchAll(/^\| `(AGSC-E\d{3})` \|/gm)) if (!RULE_INDEX.has(m[1])) RULE_INDEX.set(m[1], p.slug);
}
const DOC = {}; // tagged documents rendered on the guide pages
for (const [k, f] of Object.entries({ prd: 'docs/PRD.md', glossary: 'docs/GLOSSARY.md', related: 'docs/RELATED-WORK.md', crosswalk: 'docs/COMPLIANCE-CROSSWALK.md', security: 'docs/SECURITY-CONSIDERATIONS.md', specIndex: 'docs/SPEC.md', featuresReadme: 'features/README.md' })) { DOC[k] = engineFile(f); checkText(f, DOC[k]); }
for (const m of DOC.prd.matchAll(/^\| \*{0,2}((?:PRD-\d{3}|NFR-\d{2}))\b/gm)) REQ_IDS.add(m[1]);
const FEATURES = engineList('features').filter(f => f.endsWith('.feature')).map(f => ({ name: f.slice(0, -8), src: engineFile(`features/${f}`) }));
const PLAIN = Object.fromEntries(specPages.map(p => [p.slug, engineFile(`docs/plain/${p.slug}.md`)]));
const SPEC_DIAGRAM = { '00-overview': 'spec-00-conformance', '01-bundle': 'spec-01-bundle', '02-item': 'spec-02-item', '03-links': 'spec-03-links', '04-canonicalization': 'spec-04-canonicalization', '05-graph': 'spec-05-graph', '06-surfaces': 'spec-06-surfaces', '07-composition': 'spec-07-composition', '08-governance': 'spec-08-governance', '09-conformance': 'spec-09-conformance', '10-implementation-profiles': 'spec-10-profiles', '11-boundary': 'spec-11-boundary' };

// ------------------------------------------------------------------ HTML layout
const NAV = [['/docs/', 'Guide'], ['/specs/', 'Specification'], ['/concepts/', 'Vocabulary'], ['/ns/', 'Ontology'], ['/specs/agentic-knowledge/', 'Discovery'], ['/docs/standards/', 'Standards'], ['/about/', 'About'], ['/search/', 'Search']];
const summaryOf = url => { const s = SUMMARIES[url]; if (!s) die(`no summary for ${url} (site/summaries.json)`); return s; };
function page({ url, title, heading, summary, description, body, jsonld, section, wide, script, scripts }) {
  const canonical = ORIGIN + url;
  if (!summary || cp_len(summary) < 20) die(`${url}: summary missing`);
  const ld = jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>\n` : '';
  // Same-origin classic scripts, deferred so the parse is never interrupted (AGSC-06-17's
  // `script-src 'self'` admits no inline script and no other host).
  const js = [...(script ? [script] : []), ...(scripts || [])]
    .map(s => `<script src="${esc(s)}" defer></script>\n`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title === config.site.title ? title : `${title} — ${config.site.title}`)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<link rel="describedby" href="${WELLKNOWN}" type="application/linkset+json">
<link rel="stylesheet" href="/assets/site.css">
<script src="/assets/theme.js"></script>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:type" content="${url === '/' ? 'website' : 'article'}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
${ld}${js}</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site">
<nav aria-label="Site">
<a class="brand" href="/"${url === '/' ? ' aria-current="page"' : ''}>${esc(config.site.title)}</a>
<ul>
${NAV.map(([h, t]) => `<li><a href="${h}"${section === h ? ' aria-current="page"' : ''}>${t}</a></li>`).join('\n')}
</ul>
${engineTheme.SWITCHER}
</nav>
</header>
<main id="main"${wide ? ' class="wide"' : ''}>
<h1>${heading || esc(title)}</h1>
<p class="summary"><strong>Summary</strong>${esc(summary)}</p>
${body}</main>
<footer class="site">
<p class="copyright">&#169; ${esc(FOOTER_YEAR)} ${esc(config.site.author)}. All rights reserved, citing and linking allowed. Spec: Apache-2.0. Schemas, ontology, IDs, discovery: CC0-1.0. AI-assisted, human-reviewed. As is, no warranty or liability; not advice. Unaffiliated with named organisations; marks belong to their owners. <a href="/legal/">Legal &amp; privacy</a> · <a href="/legal/#terms" rel="license">Content Use Terms</a> · <a href="/docs/compliance/">Compliance</a> · <a href="/docs/status/">Status</a> · <a href="${WELLKNOWN}">Discovery file</a> · <a href="/llms.txt">llms.txt</a>${PATTERNS_NODE ? ' · <a href="https://patterns.agenticsystemcore.com/">Second node (live demo)</a>' : ''}</p>
</footer>
</body>
</html>
`;
}
const ORIGIN_TEXT = { human: 'Written by a person', 'ai-assisted': 'Written with AI assistance and reviewed by the operator', 'ai-generated': 'Generated by a model and published by the operator', imported: 'Imported from another source' };
const itemMeta = it => {
  const parts = [`<dt>Type</dt><dd>${esc(it.type)}${it.fm.kind ? ` · kind <code>${esc(it.fm.kind)}</code>` : ''}</dd>`];
  if (it.fm.task_state) parts.push(`<dt>Task state</dt><dd><code>${esc(it.fm.task_state)}</code></dd>`);
  if ((it.fm.clusters || []).length) parts.push(`<dt>Cluster</dt><dd>${it.fm.clusters.map(c => `<a href="${bySlug.get(c).url}">${esc(bySlug.get(c).fm.title)}</a>`).join(', ')}</dd>`);
  parts.push(`<dt>IRI</dt><dd><code>${esc(it.iri)}</code></dd>`);
  parts.push(`<dt>Provenance</dt><dd>${esc(ORIGIN_TEXT[it.fm.prov.origin])} (origin <code>${esc(it.fm.prov.origin)}</code>, operator <code>${esc(it.fm.prov.operator)}</code>)</dd>`);
  return `<dl class="meta">\n${parts.join('\n')}\n</dl>\n`;
};
const sourcesList = it => (it.fm.sources || []).length ? `<h2 id="sources">Sources</h2>\n<ol class="sources">\n${it.fm.sources.map((s, k) => `<li id="source-${k + 1}"><a${REF_LABEL.test(String(s.title || '')) ? ' class="ref"' : ''} href="${esc(s.resource.startsWith(BASE) ? '/' + s.resource.slice(BASE.length) : s.resource)}">${esc(s.title || s.resource)}</a></li>`).join('\n')}\n</ol>\n` : '';
const statusBlock = () => `<section class="status" aria-labelledby="status-heading">
<h2 id="status-heading">Status of this document</h2>
<p>Specification <code>${esc(SPEC_VERSION)}</code>, ${SPEC_SOURCE === 'tag' ? `a release candidate tagged on ${esc(SPEC_DATE)}` : 'a draft release candidate, not yet tagged'}. It is an independent specification: it is not a standard of the IETF, the W3C or any other body, and no standards body has reviewed or adopted it. Released sections are immutable; a correction ships as a new version.</p>
</section>
`;
// "Propose an edit": a plain link to the forge's edit-in-browser view of the page's own source
// file. No script and no form (the CSP sets form-action 'none'): the forge opens its editor, and
// a submitted change becomes a pull request that a person reviews and merges — the Proposal route
// of AGSC-08-03/AGSC-11-14, which is the contribution channel this node declares.
const editLink = (repo, file) => `<p class="edit"><a rel="noopener" href="${esc(`${FORGE[repo]}/edit/main/${file}`)}">Propose an edit</a> — opens <code>${esc(file)}</code>${repo === 'engine' ? ' in the specification repository' : ''}; a submitted change becomes a pull request a person reviews.</p>\n`;

const regText = {
  wellknown: { 'not-requested': STATUS.draft ? 'Not registered. Its registration in the Well-Known URIs registry (RFC 8615) is asked for in the Internet-Draft, which is posted; no request has been sent to the registry.' : 'Not yet requested. The suffix <code>knowledge-linkset</code> will be requested for the Well-Known URIs registry (RFC 8615) through an Internet-Draft; it is not registered.', requested: 'Requested for the Well-Known URIs registry (RFC 8615); not yet registered.', registered: 'Registered in the Well-Known URIs registry (RFC 8615).' }[STATUS.wellknown],
  profile: { 'not-filed': 'Not yet filed in the Profile URIs registry (RFC 7284).', filed: 'Filed in the Profile URIs registry (RFC 7284); not yet registered.', registered: 'Registered in the Profile URIs registry (RFC 7284).' }[STATUS.profile],
  draft: STATUS.draft ? `<a href="https://datatracker.ietf.org/doc/${esc(STATUS.draft.replace(/-\d{2}$/, ''))}/"><code>${esc(STATUS.draft)}</code></a>` : 'Not yet posted.',
  w3id: STATUS.w3id ? 'The namespace <code>https://w3id.org/agentic-system-core/</code> resolves to this site. Its permanent addresses redirect (HTTP 303) to the pages and files they name: the vocabulary at <code>/ns</code> and its versioned copies, by content negotiation to the vocabulary file in the format asked for; the two specification pages at <code>/specs/mcp/</code> and <code>/specs/agentic-knowledge/</code>; and the profile URI at <code>/profile/agentic-knowledge</code>.' : 'The namespace <code>https://w3id.org/agentic-system-core/</code> does not resolve yet; the pull request to w3id.org is open and not yet merged.',
  preprint: STATUS.preprint ? `Published: <a href="https://doi.org/${esc(STATUS.preprint.doi)}">${esc(STATUS.preprint.title)}</a> (${esc(STATUS.preprint.date)}), DOI <code>${esc(STATUS.preprint.doi)}</code>.` : 'In preparation; not yet published.',
};

// ------------------------------------------------------------------ the page tools (AGSC-09-16)
// The three scripts an ITEM, GUIDE or PROFILE page loads, in the engine's own load order: the
// composition algebra (which the `compose` tool runs), the seven page tools, and the WebMCP
// registration. They are referenced absolutely, so one copy is fetched once for the whole site,
// and each page pays three elements against the 100 KB budget of AGSC-06-21.
const PAGE_TOOL_SCRIPTS = engineComposePage.PAGE_TOOL_SCRIPTS;

// ------------------------------------------------------------------ outputs
const files = new Map(); // relative path -> string | Buffer
const put = (p, content) => { if (files.has(p)) die(`duplicate output ${p}`); files.set(p, content); };
/** Publish the engine's own bytes for one route; refuse if the engine did not emit it. */
const putEngine = route => {
  const bytes = ENGINE_BUILD.files.get(route);
  if (bytes === undefined) die(`the engine emitted no ${route} — this site publishes the engine's bytes for it`);
  put(route.replace(/^\//, ''), bytes);
  return bytes;
};
const routes = []; // HTML routes for the sitemap
const pageTexts = new Map(); // url -> { title, html } for the site search index

function addPage(url, opts) { const html = page({ url, ...opts }); put(url.replace(/^\//, '') + 'index.html', html); routes.push(url); pageTexts.set(url, { title: opts.title, summary: opts.summary, html }); }

// home
const MODE_CARDS = [
  ['Auto-wiki', 'Markdown in, a checked and linked website out; no model needed.', '/docs/modes/#mode-0-the-automatic-self-correcting-wiki'],
  ['Distributed agentic memory', 'Agents read, cite and propose; people ratify; nodes peer with each other.', '/docs/modes/#mode-1-distributed-agentic-memory'],
  ['Live specifications', 'A project\'s decisions, specs, tasks and gates as one governed memory.', '/docs/modes/#mode-2-live-specifications-and-the-memory-of-a-software-project'],
  ['Evolving skills', 'Each cluster becomes a skill pack of its published items; improved skills come back as Procedures.', '/docs/modes/#mode-3-the-evolving-skills-library'],
  ['Runnable knowledge', 'Select Concepts, get a starting Harness: seven kinds of file an architect or a runtime starts from.', '/docs/modes/#mode-4-runnable-knowledge'],
  ['The live board', 'Agents and people pull, claim and finish a project\'s tasks on one shared board until it is done.', '/docs/modes/#mode-5-the-live-board-self-driving-product-and-project-management'],
];
// THE FRONT PAGE FOR PEOPLE. Everything the "works with" lists name is read from the engine's
// own registries at build time, and the build stops if a name here has no registry entry or a
// registry entry has no name here — so the page cannot list a route the engine does not have.
// The measured numbers are read from the engine's docs/measurements.json, never typed.
const REGISTRY = {
  steer: Object.keys(engineModule('src/interchange/steer.js').TARGETS),
  boards: Object.keys(engineModule('src/interchange/board-formats.js').FORMATS),
  skills: [...engineModule('src/interchange/adapters/skills.js').LAYOUTS],
  hosts: engineModule('src/distribution/hosts/index.js').map(p => p.name),
  adapters: engineList('src/interchange/adapters').filter(f => f.endsWith('.js')).map(f => f.slice(0, -3)),
};
const NAMES = {
  steer: { agents: 'AGENTS.md', aider: 'Aider', claude: 'Claude Code', cline: 'Cline', codex: 'Codex', copilot: 'GitHub Copilot', cursor: 'Cursor', gabbe: 'GABBE', gemini: 'Gemini CLI', kiro: 'Kiro', windsurf: 'Windsurf' },
  boards: { 'agsc-board': 'this format\'s own board file', asana: 'Asana', github: 'GitHub issues and projects', gitlab: 'GitLab', jira: 'Jira', linear: 'Linear', markdown: 'plain Markdown', notion: 'Notion', 'obsidian-kanban': 'Obsidian Kanban', todotxt: 'Todo.txt', trello: 'Trello' },
  skills: { agentskills: 'Agent Skills folders', 'claude-plugin': 'Claude Code plugins', marketplace: 'plugin marketplaces', cursor: 'Cursor rules', windsurf: 'Windsurf rules' },
  hosts: { 'cloudflare-pages': 'Cloudflare Pages', 'static-host': 'nginx or Apache', 'github-pages': 'GitHub Pages behind a proxy', local: 'your own machine', 'git-clone': 'a clone of the repository', ipfs: 'IPFS through a gateway', 'ledger-anchor': 'a ledger-anchored record' },
  adapters: { board: 'project boards', cogx: 'COGX memory archives', gabbe: 'GABBE kits', 'llm-context': 'a compact context file for a model', mermaid: 'Mermaid link diagrams', skills: 'skills repositories' },
};
for (const [k, list] of Object.entries(REGISTRY)) {
  for (const n of list) if (!NAMES[k][n]) die(`front page: the engine's ${k} registry has "${n}", which the page does not name`);
  for (const n of Object.keys(NAMES[k])) if (!list.includes(n)) die(`front page: the page names ${k} "${n}", which the engine's registry does not have`);
}
const shown = k => REGISTRY[k].map(n => esc(NAMES[k][n])).join(', ');
const MEASURED = JSON.parse(engineFile('docs/measurements.json'));
const ML = MEASURED.layers;
const num = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const perfRow = items => ML.perf.rows.find(r => r.items === items) || die(`docs/measurements.json: no perf row for ${items} items`);
const siteA11y = ML.a11y.nodes['main-site'] || die('docs/measurements.json: no a11y row for main-site');
const MEASURES = [
  ['Conformance', `${num(ML.conformance.vector_run.pass)} vectors pass, ${ML.conformance.vector_run.fail} fail, of ${num(ML.conformance.vector_run.total)} (${ML.conformance.vector_run.withdrawn} withdrawn); ${num(ML.conformance.rule_coverage.any_check)} of ${num(ML.conformance.rule_coverage.active)} active rules have a machine check`, ML.conformance.command],
  ['Determinism', `${ML.determinism.double_build.compared} files compared across two builds, and across time zones and locales: ${ML.determinism.double_build.different.length + ML.determinism.tz_locale.different.length} differ`, ML.determinism.command],
  ['Security floor', `${ML.security.totals.score} seeded faults handled, ${ML.security.totals.controls_clean} clean controls left alone. This proves neither safety nor the absence of new kinds of injection (AGSC-08-19)`, ML.security.command],
  ['Accessibility', `${siteA11y.violations} automated violations on the ${siteA11y.pages} pages this site had when it was measured, in the ${ML.a11y.schemes.join(' and ')} schemes; automated checks find only part of what matters, so this is a floor, not a claim`, ML.a11y.command],
  ['Build scale', `${num(perfRow(5000).items)} items built in ${(perfRow(5000).ms_median / 1000).toFixed(1)} s, ${num(perfRow(10000).items)} in ${(perfRow(10000).ms_median / 1000).toFixed(1)} s (median of three runs, one machine); ${perfRow(10000).html_over_budget} pages over the 100 KB budget`, ML.perf.command],
  ['Tokens per chunk', `median ${ML.tokens.nodes.main.vocabularies.cl100k_base.chunks_text.median} tokens per chunk of this site's chunk export (cl100k_base)`, ML.tokens.command],
];
addPage('/', {
  title: config.site.title, summary: summaryOf('/'), description: index.fm.description, section: null,
  jsonld: { '@context': 'https://schema.org', '@type': 'WebSite', name: config.site.title, url: BASE, description: index.fm.description, author: { '@type': 'Person', name: config.site.author, sameAs: ['https://orcid.org/0009-0001-3464-5283'] } },
  body: `<p class="tagline">${esc(config.site.tagline)}</p>
<p class="lead">AgenticSystemCore turns one folder of Markdown into a website, a knowledge graph and a local tool server for AI assistants at once — every link typed, every published artefact carrying a digest a reader can check, every change merged by a person or by a rule that person recorded — so people, search engines and AI agents read the same checked knowledge, with no server, database or language model needed to build, check or publish it.</p>
<ul>
<li><a href="/docs/demos/">Try it in five minutes</a>: install the package and run each mode from an empty folder.</li>
<li><a href="/docs/guides/">Use it on your own files</a>: one short guide per mode, every command with the lines it prints.</li>
<li><a href="/docs/modes/">The six ways to use it</a>: one folder of files, six modes.</li>
<li><a href="/specs/">Read the specification</a>: the rules, the schemas and the test cases.</li>
</ul>
${md(index.body)}<h2 id="benefits">What each reader gets</h2>
<div class="table-wrap" tabindex="0" role="region" aria-label="What each reader gets"><table>
<thead><tr><th scope="col">You are</th><th scope="col">You get</th><th scope="col">Where</th></tr></thead>
<tbody>
<tr><th scope="row">A person with notes</th><td>a wiki that checks and links itself, and a project's living memory</td><td><a href="/docs/guides/mode-0/">the Mode 0 guide</a>: <code>agsc init</code>, a security contact, one commit, <code>agsc ci</code>, <code>agsc build</code></td></tr>
<tr><th scope="row">A team</th><td>a live board and shared skills</td><td><a href="/docs/modes/">the six modes</a>, <a href="/skills/">skill packs</a>, <a href="/boards/project-board/">this site's own board</a></td></tr>
<tr><th scope="row">An agent or an assistant</th><td>memory it can find, verify and cite; tools on every item page</td><td><a href="${WELLKNOWN}">the discovery document</a>, <a href="/llms.txt">llms.txt</a>, <a href="/chunks.jsonl">the chunk export</a></td></tr>
<tr><th scope="row">An implementer</th><td>a specification with vectors and standalone checkers, in any language</td><td><a href="/specs/">the specification</a>, <a href="/docs/reading-the-specification/">how to read it</a></td></tr>
<tr><th scope="row">A publisher</th><td>static files, no server to run and nothing to pay for beyond hosting</td><td><a href="/procedures/publish-a-level-0-node/">publish a Level-0 node</a></td></tr>
</tbody></table></div>
<h2 id="different">What is different about it</h2>
<p class="lead">Other systems have some of these. To the author's knowledge none has them together: a knowledge base a machine can find through registered web mechanisms, a digest on every artefact its discovery document links, a typed graph with a published vocabulary, bytes pinned by conformance vectors, a person on every merge — directly, or by a standing rule that person recorded — and a starting harness out of the same files, with no server.</p>
<p>These are claims about the specification's text and its test vectors, not performance claims. The dated comparison with other systems is in the <a href="/docs/standards/#related-work">related work</a>, and the full sentence in the <a href="/docs/introduction/">introduction</a>.</p>
<h2 id="compares">How it compares</h2>
<p>What it shares with others' work, and how it differs:</p>
<ul>
<li><strong>LLM wikis</strong> (<a href="https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f">Andrej Karpathy's idea</a>, the <a href="https://github.com/decodingai-magazine/llm-wiki-workshop">Decoding AI workshop</a>): the same aim — Markdown pages, sources kept apart, knowledge prepared in advance. There a model writes pages and a link's kind lives in prose; here links are typed, deterministic checks find orphans and stale links, and a model proposes but never merges.</li>
<li><strong><a href="https://technicspub.com/ontology-pipeline/">The Ontology Pipeline</a></strong> (Jessica Talisman): six stages from controlled vocabulary to knowledge graph. The graph stage works today, the others in part; version 1.1 is planned to follow them. No compatibility is claimed.</li>
<li><strong>Google's <a href="https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md">Open Knowledge Format</a></strong>: also Markdown with a header, but link kinds stay in prose; no discovery layer or digests.</li>
<li><strong><a href="https://llmstxt.org/">llms.txt</a></strong>: a node publishes one, with a fixed grammar, beside a discovery document giving each artefact's digest.</li>
<li><strong>Agent discovery</strong> (<a href="https://datatracker.ietf.org/doc/draft-jimenez-dawn-discovery-landscape/">IETF survey</a>) finds who can act; this finds what is known. <a href="https://www.rfc-editor.org/info/rfc9727">RFC 9727 (api-catalog)</a> is the design precedent.</li>
<li><strong><a href="https://wikiba.se/">Wikibase and Wikidata</a></strong>: a typed graph in a served wiki with live writes; here, static files under version control.</li>
</ul>
<p>${STATUS.preprint ? `Details in <a href="https://doi.org/${esc(STATUS.preprint.doi)}">the paper</a>` : 'Details in the <a href="/docs/standards/#related-work">related work</a>'}; source on <a href="https://github.com/andreibesleaga/agentic-system-core">GitHub</a>.</p>
<h2 id="what-you-can-do">Six ways to use it</h2>
<ul class="modes">
${MODE_CARDS.map(([t, d, h]) => `<li><strong><a href="${h}">${esc(t)}</a></strong>${esc(d)}</li>`).join('\n')}
</ul>
<p>One folder of files, one format, six ways of using it. The <a href="/docs/modes/">six modes</a> explain each.</p>
<h2 id="best-uses">What it is best for</h2>
<h3 id="for-agents">For agents</h3>
<ul class="modes">
<li><strong><a href="/docs/modes/#mode-1-distributed-agentic-memory">Memory for one agent</a></strong>Run <code>agsc mcp</code> in a Bundle: an assistant gets seven tools to search, read, follow links and cite items by address, and nothing leaves the machine.</li>
<li><strong><a href="/docs/modes/#mode-1-distributed-agentic-memory">Shared memory for many</a></strong>Every agent reads the same published files and changes them only by proposals a person ratifies.</li>
<li><strong><a href="/skills/">A source of skills</a></strong>Each cluster becomes one skill pack holding its items, procedures first, with a lockfile of their digests, installable into agent tool folders.</li>
<li><strong><a href="/compose/">A starting harness</a></strong>Selected Concepts become a harness of seven kinds of file an architect or a runtime starts from; not a running system.</li>
<li><strong><a href="/docs/modes/#mode-5-the-live-board-self-driving-product-and-project-management">A live board for a team of agents</a></strong>Agents claim and finish tasks until a board is done; decisions stay with people.</li>
<li><strong><a href="/docs/how-it-works/">Knowledge across nodes</a></strong>A client reads several nodes' graph dumps and joins them on its own side, every foreign result marked with its origin.</li>
</ul>
<h3 id="for-people">For people</h3>
<ul class="modes">
<li><strong><a href="/docs/modes/#mode-0-the-automatic-self-correcting-wiki">A wiki that corrects itself</a></strong>Markdown in; a checked, linked, searchable site out, with every change reviewed.</li>
<li><strong><a href="/docs/modes/#mode-2-live-specifications-and-the-memory-of-a-software-project">A project's living specifications</a></strong>Decisions, specifications, tasks and gates as one governed memory.</li>
<li><strong><a href="/concepts/">A library of patterns</a></strong>Concepts with sources and provenance, readable without JavaScript, composable into a starting architecture.</li>
<li><strong><a href="/docs/modes/#mode-5-the-live-board-self-driving-product-and-project-management">A team board</a></strong>A board exported from a project tool becomes a live board and goes back again: ${REGISTRY.boards.length} board formats, listed below.</li>
</ul>
<h2 id="works-with">Works with the tools you already use</h2>
<p>Every name below is read from the reference engine's own registries when this page is built.</p>
<ul>
<li><strong>Imports and exports:</strong> Markdown, the Open Knowledge Format, JSON-LD, JSONL and chunk exports, and adapters for ${shown('adapters')}.</li>
<li><strong>Steering files for coding assistants:</strong> ${shown('steer')}.</li>
<li><strong>Skills, both ways:</strong> ${shown('skills')}.</li>
<li><strong>Project boards, both ways:</strong> ${shown('boards')}.</li>
<li><strong>For assistants:</strong> a local MCP server (<code>agsc mcp</code>), and the same seven tools registered on every item page and on <code>/compose/</code> of a built site for a browser's own agent.</li>
<li><strong>In your repository:</strong> a GitHub Action that runs <code>agsc ci</code>, and a pre-commit hook that runs <code>agsc lint</code>.</li>
<li><strong>Where a node can live:</strong> ${shown('hosts')} — any place that serves the files over HTTPS; <code>agsc-host list</code> says what each place can and cannot do.</li>
</ul>
<h2 id="brain">A distributed brain, with no server</h2>
<p>Each node is a folder of files published as a static site. Nodes find and read each other through registered web mechanisms, every file they point at carries its digest, and they share one vocabulary. A node names its peers; a reader walks from one to the next. No node calls another, and no server sits in between.${PATTERNS_NODE ? ' This node&#39;s peer is a second node, <a href="https://patterns.agenticsystemcore.com/">patterns.agenticsystemcore.com</a>: a demonstration node run by the same reference engine, whose sample content is a small set of well-known agent-system patterns described from public sources.' : ''}</p>
${figure('system-overview')}<h2 id="measured">Measured, reproducible</h2>
<p>Measured against specification ${esc(MEASURED.spec_version)} with the reference engine; each command reproduces its line. None of these is a comparison with another system.</p>
<div class="table-wrap" tabindex="0" role="region" aria-label="Measured, reproducible"><table>
<thead><tr><th scope="col">What</th><th scope="col">Result</th><th scope="col">Reproduce with</th></tr></thead>
<tbody>
${MEASURES.map(([w, r, c]) => `<tr><th scope="row">${esc(w)}</th><td>${esc(r)}</td><td><code>${esc(c)}</code></td></tr>`).join('\n')}
</tbody></table></div>
<h2 id="get-started">Get started</h2>
<p>Install the command line (Node.js 22.13 or later, <code>git</code>), then, in a folder of Markdown notes:</p>
<pre tabindex="0"><code>npm install --global agentic-system-core   # puts agsc on the PATH
agsc init     # each note gets a type, a title and its provenance
mkdir -p .well-known &amp;&amp; printf 'Contact: mailto:you@example.org\\n' &gt; .well-known/security.txt
git init -q &amp;&amp; git add -A &amp;&amp; git commit -q -m 'my notes'   # the build takes its instant from this commit
agsc ci       # lint, build twice, compare the bytes, verify
agsc build    # the site, the graph and the agent files in www/
agsc mcp      # give an assistant seven tools over the same folder</code></pre>
<p>Without the security contact, <code>agsc ci</code> stops with <code>AGSC-E901</code>; without a commit (or <code>SOURCE_DATE_EPOCH</code>), with <code>AGSC-E204</code>. The <a href="/docs/guides/mode-0/">Mode 0 guide</a> walks through it with the lines each command prints, and the <a href="/docs/guides/">guides</a> do the same for every mode. The <a href="/docs/demos/">demos</a> run each mode from an empty folder; the <a href="${FORGE.engine}/blob/main/docs/USING-WITH-ASSISTANTS.md">assistant setup guide</a> and the <a href="/docs/start-here/">start page for each kind of reader</a> go further.</p>
<h2 id="this-site">This site is a node of itself</h2>
<p>Everything published here follows the rules it publishes: the vocabulary items, the discovery document, the graph and the agent-facing text file are written by the reference engine, and the discovery validator checks this site at Level 2 before every publish. The <a href="/docs/status/">status page</a> says which further parts are live.</p>
<h2 id="start">Where to start</h2>
<ul>
<li><strong>Everyone:</strong> <a href="/docs/start-here/">start here</a> — one path for each kind of reader.</li>
<li><strong>People:</strong> the <a href="/docs/">guide</a>, then the <a href="/specs/">specification</a> and the <a href="/concepts/">vocabulary</a>.</li>
<li><strong>Architects and implementers:</strong> the <a href="/docs/architecture/">architecture</a>, the <a href="/docs/requirements/">requirements</a>, the <a href="/specs/agentic-knowledge/">discovery profile</a> and the <a href="/ns/">ontology</a>.</li>
<li><strong>Agents:</strong> <a href="${WELLKNOWN}"><code>${WELLKNOWN}</code></a> or <a href="/llms.txt"><code>/llms.txt</code></a>.</li>
<li><strong>Publishers:</strong> <a href="/procedures/publish-a-level-0-node/">publish a Level-0 node</a> from any CMS or wiki export.</li>
</ul>
${editLink('site', 'content/index.md')}`,
});

// ------------------------------------------------------------------ the layout of the specification pages
// AGSC-06-21 gives every HTML page a budget of 100 KB, and a section's page is the section's own
// text: a rule or a note is never shortened to fit. A section whose page would exceed the budget
// is therefore published in parts, `/specs/<section>/` and `/specs/<section>/page-2/` (page-3/ if
// ever needed), each under the budget and each carrying the section's title, its summary, its
// status block, its plain-language box, its diagram, the contents of the whole section and a
// "Part n of m" line with links to the other parts. The cut falls between two `##` headings where
// such a layout fits, else at any heading, else between two rules — never inside a rule, its
// notes, its tables, its code or its trace line. The rule index then names, for every rule id and
// error code, the part that carries it, so every link derived from an id lands on the right page.
// A fragment never reaches the server, so no `_redirects` entry could do this; the index is the
// only mechanism, and scripts/check.js fails on any rule link that lands on another page.
const PAGE_BUDGET = Math.min(100 * 1000, Number(process.env.SITE_PAGE_BUDGET) || Infinity); // decimal, AGSC-06-21; a smaller value exercises the split, a larger one is refused (not AGSC_-prefixed: the engine reads those as configuration overrides)
const PART_WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
// The source of a section cut into blocks: a heading with the text under it, or one rule with
// everything that follows it up to the next rule or the next heading (its notes, its tables, its
// code and its trace line). A cut between two blocks is never inside a rule.
function specBlocks(src) {
  const blocks = []; let cur = null, fenced = false, section = null;
  const open = heading => { cur = { heading, section, lines: [] }; blocks.push(cur); };
  open(null);
  for (const l of src.replace(/^# .*\n+/, '').replace(/\n+$/, '').split('\n')) {
    if (/^ {0,3}(`{3,}|~{3,})/.test(l)) fenced = !fenced;
    else if (!fenced && /^#{2,6} +\S/.test(l)) { if (/^## /.test(l)) section = l; open(l); }
    else if (!fenced && /^[-*+] +\*\*AGSC-\d{2}-\d{2,3}[a-z]?\*\*/.test(l)) open(null);
    cur.lines.push(l);
  }
  return blocks.filter(b => b.lines.some(x => x.trim()));
}
const isSectionHeading = b => b.heading !== null && /^## /.test(b.heading);
const headingNumber = h => { const m = /^#{2,6} +(\d+(?:\.\d+)*)\b/.exec(h); return m ? m[1] : h.replace(/^#+ +/, ''); };
// The m-part layout of a kind (`##` cuts, heading cuts, rule cuts) whose largest part is
// smallest, so that growth lands evenly; null when the kind admits fewer than m parts. Dynamic
// programming over the block prefix sums: best[k][i] is the smallest largest part of the first
// i blocks in k parts, the last part starting at an allowed cut; ties go to the earliest cut.
function layoutParts(blocks, sizes, m, allowed) {
  const n = blocks.length;
  if (m === 1) return [[0, n]];
  const prefix = [0]; for (const s of sizes) prefix.push(prefix[prefix.length - 1] + s);
  let best = new Array(n + 1).fill(Infinity); best[0] = 0; // zero parts cover zero blocks
  const starts = []; // starts[k - 1][i]: where the last of k parts covering i blocks begins
  for (let k = 1; k <= m; k++) {
    const cur = new Array(n + 1).fill(Infinity), at = new Array(n + 1).fill(-1);
    for (let i = 1; i <= n; i++) {
      for (let j = 0; j < i; j++) {
        if (best[j] === Infinity || (j > 0 && !allowed(blocks[j]))) continue;
        const v = Math.max(best[j], prefix[i] - prefix[j]);
        if (v < cur[i]) { cur[i] = v; at[i] = j; }
      }
    }
    starts.push(at); best = cur;
  }
  if (best[n] === Infinity) return null;
  const parts = []; let i = n;
  for (let k = m; k >= 1; k--) { const j = starts[k - 1][i]; parts.unshift([j, i]); i = j; }
  return parts;
}
// One section's pages from its parts: the page options addPage takes, in part order. With one
// part this is the page the site always published; with more, every part repeats the section's
// front matter and carries the part line, the whole contents and the links to the other parts.
function specSectionPages(p, parts) {
  const m = parts.length;
  const plainSrc = stripH1(PLAIN[p.slug]).replace(/\n+Rules: [^\n]*\n?$/, '\n');
  const bodies = parts.map(part => {
    const toc = [], used = new Set(['main', 'status-heading', 'contents', 'plain']), tables = { n: 0 };
    const html = md(part.src, { ruleLinks: true, page: part.page, toc, used, tables });
    return { toc, used, tables, html };
  });
  const contents = bodies.flatMap((b, k) => b.toc.filter(t => !/ \(continued\)$/.test(t.html)).map(t => ({ ...t, part: k })));
  const partLink = x => `<a href="${x.url}">part ${x.n}</a>`;
  return parts.map((part, k) => {
    const { used, tables, html } = bodies[k];
    const prev = parts[k - 1], next = parts[k + 1];
    const partLine = m === 1 ? '' : `<nav class="toc" aria-label="Parts of this section"><p><strong>Part ${part.n} of ${m}</strong>, ${part.range}. This section is published in ${PART_WORDS[m] || m} parts so that each page stays within the budget of ${REF('AGSC-06-21')}; a rule's link names the part that carries it. ${parts.filter(x => x !== part).map(x => `<a href="${x.url}"${x === prev ? ' rel="prev"' : x === next ? ' rel="next"' : ''}>Part ${x.n}</a> carries ${x.range}`).join('; ')}.</p></nav>\n`;
    const endLine = m === 1 ? '' : `<p class="parts">${next ? `End of part ${part.n} of ${m}; <a href="${next.url}" rel="next">part ${next.n}</a> continues with ${next.range}.` : `End of part ${part.n} of ${m}, the last part of this section; ${partLink(parts[0])} begins it${prev && prev !== parts[0] ? ` and ${partLink(prev)} precedes this one` : ''}.`}</p>\n`;
    return { url: part.url, opts: {
      title: m === 1 ? p.h1 : `${p.h1} (part ${part.n} of ${m})`, heading: esc(p.h1), summary: summaryOf(p.url),
      description: `${p.h1} — section ${p.slug.slice(0, 2)} of the AgenticSystemCore specification ${SPEC_VERSION}${m === 1 ? '' : `, part ${part.n} of ${m} (${part.range})`}.`, section: '/specs/', wide: true,
      jsonld: { '@context': 'https://schema.org', '@type': 'TechArticle', headline: p.h1, url: `${BASE}specs/${part.page}/`, version: SPEC_VERSION, license: 'https://www.apache.org/licenses/LICENSE-2.0', author: { '@type': 'Person', name: config.site.author }, isPartOf: `${BASE}specs/`, ...(m === 1 ? {} : { pagination: `Part ${part.n} of ${m}` }) },
      body: statusBlock()
        + partLine
        + `<aside class="plain" aria-labelledby="plain"><h2 id="plain">In plain language</h2>\n${md(plainSrc, { ruleLinks: true, page: part.page, used, tables })}<p class="id">This box explains; the rules below decide. New to the notation? See <a href="/docs/reading-the-specification/">how to read the specification</a>.</p>\n</aside>\n`
        + figure(SPEC_DIAGRAM[p.slug])
        + (contents.length ? `<nav class="toc" aria-labelledby="contents"><h2 id="contents">Contents</h2>\n<ol>\n${contents.map(t => `<li><a href="${t.part === k ? '' : parts[t.part].url}#${t.id}">${t.html}</a>${t.part === k ? '' : ` <span class="id">part ${parts[t.part].n}</span>`}</li>`).join('\n')}\n</ol></nav>\n` : '')
        + html
        + endLine
        + editLink('engine', `spec/${p.file}`),
    } };
  });
}
const SPEC_PARTS = new Map(); // section slug -> its parts [{ n, page, url, src, range }]
RULE_INDEX_DECIDED = true; // from here on the index is refined section by section, and every trial render below uses it
{
  const traced = RULES_WITHOUT_TRACE.length; // trial renders report the same rules again; only the final render's report counts
  const kinds = [isSectionHeading, b => b.heading !== null, () => true];
  const OWNER = new Map(RULE_INDEX); // the section each id belongs to, as the provisional index says
  // Sections are laid out in order, and a trial render links a rule of a LATER section to the
  // page the index still names for it — a few bytes shorter than the final link if that section
  // is then split. So the layout is confirmed by a final render of every page; if one overflows
  // the budget by that drift, every section is laid out again with a margin, until none does.
  for (let margin = 0; ; margin += 1000) {
    if (margin > 5000) die('the layout of the specification pages does not settle (AGSC-06-21)');
    for (const p of specPages) {
      const own = [...OWNER].filter(([, v]) => v === p.slug).map(([k]) => k); // the ids this section carries
      for (const id of own) RULE_INDEX.set(id, p.slug);
      // the size of each block rendered on its own, on the section's first page
      const blocks = specBlocks(p.src), sizes = blocks.map(b => Buffer.byteLength(md(`${b.lines.join('\n')}\n`, { ruleLinks: true, page: p.slug, used: new Set(), tables: { n: 0 } })));
      const partsOf = ranges => ranges.map(([a, b], k) => {
        const n = k + 1, page = n === 1 ? p.slug : `${p.slug}/page-${n}`;
        const first = blocks[a], continued = n > 1 && !isSectionHeading(first);
        const src = `${continued ? `${first.section} (continued)\n\n` : ''}${blocks.slice(a, b).map(x => x.lines.join('\n')).join('\n')}\n`;
        const numbers = blocks.slice(a, b).filter(isSectionHeading).map(x => headingNumber(x.heading));
        if (continued) numbers.unshift(`${headingNumber(first.section)} (continued)`);
        const range = numbers.length > 1 ? `${numbers[0]} to ${numbers[numbers.length - 1]}` : numbers[0] || 'the opening';
        return { n, page, url: `/specs/${page}/`, src, range };
      });
      let parts = null;
      for (let m = 1; m <= 9 && !parts; m++) {
        for (const allowed of kinds) {
          const ranges = layoutParts(blocks, sizes, m, allowed);
          if (!ranges) continue;
          const candidate = partsOf(ranges);
          for (const id of own) RULE_INDEX.set(id, p.slug);
          for (const part of candidate) {
            for (const x of part.src.matchAll(/^\s*- \*\*(AGSC-\d{2}-\d{2,3}[a-z]?)\*\*/gm)) if (own.includes(x[1])) RULE_INDEX.set(x[1], part.page);
            for (const x of part.src.matchAll(/^\| `(AGSC-E\d{3})` \|/gm)) if (own.includes(x[1])) RULE_INDEX.set(x[1], part.page);
          }
          if (specSectionPages(p, candidate).every(({ url, opts }) => Buffer.byteLength(page({ url, ...opts })) <= PAGE_BUDGET - margin)) { parts = candidate; break; }
        }
      }
      if (!parts) die(`spec/${p.file}: no layout in up to nine parts keeps every page within the ${PAGE_BUDGET} byte budget (AGSC-06-21); the largest block that cannot be cut renders to ${Math.max(...sizes)} bytes`);
      SPEC_PARTS.set(p.slug, parts);
    }
    if (specPages.every(p => specSectionPages(p, SPEC_PARTS.get(p.slug)).every(({ url, opts }) => Buffer.byteLength(page({ url, ...opts })) <= PAGE_BUDGET))) break;
  }
  RULES_WITHOUT_TRACE.length = traced;
}

// specification index and sections
addPage('/specs/', {
  title: 'Specification', summary: summaryOf('/specs/'), description: `The AgenticSystemCore specification ${SPEC_VERSION}: twelve sections, the discovery profile and the conformance levels.`, section: '/specs/',
  jsonld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'AgenticSystemCore specification', url: `${BASE}specs/`, version: SPEC_VERSION },
  body: `${statusBlock()}<p>New to the notation? Read <a href="/docs/reading-the-specification/">how to read the specification</a> first: it explains the rule identifiers, the key words and the small bracketed references. Each section below opens with a summary, a plain-language box and a diagram before the normative text.</p>
<h2 id="sections">Sections</h2>
<ol class="index" start="0">
${specPages.map(p => `<li><a href="${p.url}">${esc(p.h1.replace(/^AGSC-\d{2} — /, ''))}</a> <span class="id">AGSC-${p.slug.slice(0, 2)}</span><br><span class="snippet">${esc(summaryOf(p.url))}</span>${SPEC_PARTS.get(p.slug).length > 1 ? `<br><span class="snippet">Published in ${PART_WORDS[SPEC_PARTS.get(p.slug).length] || SPEC_PARTS.get(p.slug).length} parts: ${SPEC_PARTS.get(p.slug).map(x => `<a href="${x.url}">part ${x.n}</a> (${x.range})`).join(', ')}.</span>` : ''}</li>`).join('\n')}
</ol>
<h2 id="profile">Discovery profile</h2>
<p><a href="/specs/agentic-knowledge/">The knowledge link set profile</a> documents the discovery document that every node serves at <code>${WELLKNOWN}</code>.</p>
<h2 id="mcp-extension">MCP extension</h2>
<p><a href="/specs/mcp/">The MCP knowledge extension</a> is the reference text of <code>${esc(MCP_EXTENSION)}</code>, the identifier by which a Model Context Protocol server says that the knowledge it serves is also published as a Bundle.</p>
<h2 id="conformance">Conformance</h2>
<p>A claim names exactly one Level, the <code>spec_version</code> and the vector set it passed (${REF('AGSC-00-12')}, ${REF('AGSC-10-01')}). This site claims <strong>Level 0</strong> against <code>${esc(SPEC_VERSION)}</code>, with the vector set published in that version; the engine that builds it passes every vector of that set.</p>
${figure('levels')}<h2 id="licence">Licence</h2>
<p>The specification text is published under the Apache License 2.0 with the reference implementation. The schemas, the ontology and the identifiers are released under CC0 1.0.</p>
`,
});
// The section pages, one per part, rendered now that every section is laid out and every
// rule link therefore names its final page.
for (const p of specPages) for (const { url, opts } of specSectionPages(p, SPEC_PARTS.get(p.slug))) addPage(url, opts);

// the profile page (the 303 target of the profile URI and of every …/rel#<name>)
{
  const R = r => `<a class="ref" href="/specs/${RULE_INDEX.get(r)}/#${r}">${r}</a>`;
  const relations = [
    ['graph', 'The RDF views of the Bundle, <code>/graph.ttl</code> and <code>/graph.nq</code>.', ['AGSC-06-10', 'AGSC-05-06']],
    ['ontology', 'The vocabulary the graph uses, <code>/ns/</code> and its files.', ['AGSC-06-10', 'AGSC-06-06']],
    ['context', 'The JSON-LD context file, <code>/ns/context.jsonld</code>.', ['AGSC-06-10', 'AGSC-06-32']],
    ['now', 'The generated state page, <code>/now/</code> and <code>/now.md</code>.', ['AGSC-06-10', 'AGSC-06-22']],
    ['skills', 'The skill packs exported from Procedures, <code>/skills/index.json</code>.', ['AGSC-06-10', 'AGSC-06-01']],
    ['ledger', 'The derived ledger, <code>/ledger.jsonl</code>, carrying <code>digest</code> and <code>agsc-ledger-head</code>.', ['AGSC-06-08', 'AGSC-06-11']],
    ['peer', 'Another node\'s discovery document, for the mutual-conformance check.', ['AGSC-06-10', 'AGSC-10-12']],
    ['surface', 'An agent surface the node serves, such as <code>llms-txt</code>, <code>chunks</code> or <code>mcp</code>, with its access class.', ['AGSC-11-16']],
    ['contribute', 'A contribution endpoint, with <code>agsc-contribute-mode</code>.', ['AGSC-11-14']],
    ['access', 'Where a reader obtains credentials for a restricted node.', ['AGSC-11-20']],
    ['signature', 'A detached signature over the canonical bytes of the discovery document. OPTIONAL: at 1.x no rule pins the signature format, no Level requires the link, and a reader ignores it.', ['AGSC-06-08', 'AGSC-06-10']],
    ['boards', 'The live boards of the node, <code>/boards/index.json</code>, present when the Bundle holds at least one task item.', ['AGSC-06-10', 'AGSC-10-13']],
  ];
  const registered = [
    ['describedby', 'The target describes this node. On the anchor it points at <code>graph.jsonld</code>; in page headers it points at this document.', ['AGSC-06-08', 'AGSC-06-25']],
    ['alternate', 'The same knowledge in another representation, such as <code>/llms.txt</code>.', ['AGSC-06-10']],
    ['license', 'The licence page of the node.', ['AGSC-06-10']],
    ['service-doc', 'Human documentation, such as <code>/specs/</code>.', ['AGSC-06-10']],
    ['author', 'The author of the node.', ['AGSC-06-10']],
    ['related, service-desc, service-meta, collection, item, cite-as', 'Related-system links, OPTIONAL, each carrying <code>type</code>. Admitted by both rules.', ['AGSC-06-10', 'AGSC-06-35']],
  ];
  const attrs = [
    ['digest', 'One string <code>sha-256=:&lt;base64&gt;:</code> over the bytes of the target (RFC 9530, RFC 9651). Level 2 and above.', ['AGSC-06-08']],
    ['agsc-spec-version', 'The <code>spec_version</code> of the Bundle. On the <code>describedby</code> link to <code>graph.jsonld</code>; Level 2 and above.', ['AGSC-06-08']],
    ['agsc-generated-at', 'The build instant, derived from <code>SOURCE_DATE_EPOCH</code>. Level 2 and above.', ['AGSC-06-08', 'AGSC-06-11']],
    ['agsc-counts', 'One <code>&lt;type-plural&gt;=&lt;n&gt;</code> string per item type, over the published set. Level 2 and above.', ['AGSC-06-08']],
    ['agsc-bundle-hash', 'The bundle hash, in RFC 9530 syntax. Level 2 and above.', ['AGSC-06-08']],
    ['agsc-bundle-version', 'The content version of the Bundle, the name its publisher gives the published state (for example <code>v1.0.0</code>). On the <code>describedby</code> link to <code>graph.jsonld</code>; Level 2 and above.', ['AGSC-06-08', 'AGSC-06-08a', 'AGSC-04-25']],
    ['agsc-ledger-head', 'The lowercase hex head of the derived ledger, on the ledger link. Level 2 and above.', ['AGSC-06-08', 'AGSC-06-11']],
    ['agsc-surface', 'The surface name on a <code>…/rel#surface</code> link. Any Level.', ['AGSC-11-16']],
    ['agsc-surface-version', 'The external revision a surface targets; required for <code>mcp</code>, <code>webmcp</code>, <code>a2a-card</code>, <code>solid</code> and <code>responder</code>. Any Level.', ['AGSC-11-16', 'AGSC-11-21']],
    ['agsc-access', 'The access class of a surface: <code>none</code>, <code>consent</code> or <code>credential</code>. Any Level.', ['AGSC-11-16']],
    ['agsc-visibility', '<code>restricted</code> on the anchor\'s <code>describedby</code> link of a restricted node; absent on a public node. Any Level.', ['AGSC-11-20']],
    ['agsc-contribute-mode', '<code>pr</code>, <code>channel</code> or <code>form</code> on a <code>…/rel#contribute</code> link. Any Level.', ['AGSC-11-14']],
    ['agsc-tombstone', 'The instant a node stopped publishing, on the anchor\'s <code>describedby</code> link. Any Level.', ['AGSC-11-23']],
  ];
  const table = (head, rows, idOf, nameCell) => `<div class="table-wrap" tabindex="0" role="region" aria-label="${esc(head[0])}"><table>
<thead><tr>${head.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead>
<tbody>
${rows.map(r => `<tr${idOf ? ` id="${idOf(r)}"` : ''}><th scope="row">${nameCell(r)}</th><td>${r[1]}</td><td>${r[2].map(R).join(', ')}</td></tr>`).join('\n')}
</tbody></table></div>
`;
  const level2 = { linkset: [{ alternate: [{ digest: ['sha-256=:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=:'], href: 'https://example.org/llms.txt', type: 'text/plain' }], anchor: 'https://example.org/', describedby: [{ 'agsc-bundle-hash': ['sha-256=:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=:'], 'agsc-bundle-version': ['v1.0.0'], 'agsc-counts': ['clusters=0', 'concepts=0', 'episodes=0', 'gates=0', 'lessons=0', 'procedures=0'], 'agsc-generated-at': ['2026-01-01T00:00:00Z'], 'agsc-spec-version': [SPEC_VERSION], digest: ['sha-256=:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=:'], href: 'https://example.org/graph.jsonld', type: 'application/ld+json' }], [`${REL}ledger`]: [{ 'agsc-ledger-head': ['bee9ba6593162f59dae28f42ba25fa04ea3fd65ae4f80685fb1c4ede151189ac'], digest: ['sha-256=:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=:'], href: 'https://example.org/ledger.jsonl', type: 'application/jsonl' }], license: [{ href: 'https://example.org/legal/' }], 'service-doc': [{ href: 'https://example.org/specs/' }] }] };
  const slots = {
    status: `<section class="status" aria-labelledby="status-heading">
<h2 id="status-heading">Status</h2>
<dl class="meta">
<dt>Profile URI</dt><dd><code>${PROFILE}</code></dd>
<dt>Specification</dt><dd><code>${esc(SPEC_VERSION)}</code>, a release candidate. It is an independent specification, not a standard of the IETF, the W3C or any other body.</dd>
<dt>Well-known URI</dt><dd>${regText.wellknown}</dd>
<dt>Profile URI registration</dt><dd>${regText.profile}</dd>
<dt>Internet-Draft</dt><dd>${regText.draft}</dd>
</dl>
</section>
${figure('agentic-knowledge')}`,
    // AGSC-06-01: each row's anchor is named exactly as the fragment of the
    // relation URI — `#graph`, not `#rel-graph` — so a client that does follow `…/rel#graph`
    // keeps that fragment and lands on this row.
    relations: `<p>Registered relations (IANA Link Relations registry):</p>\n` + table(['Relation', 'Meaning', 'Rules'], registered, null, r => `<code>${esc(r[0])}</code>`)
      + `<p>Extension relations. Each URI <code>${REL}&lt;name&gt;</code> resolves to its row below.</p>\n`
      + table(['Extension relation', 'Target', 'Rules'], relations, r => r[0], r => `<code>…/rel#${r[0]}</code>`),
    attributes: `<p>Extension target attributes use the prefix <code>agsc-</code>, except <code>digest</code>. Every extension target attribute value (<code>digest</code> and every <code>agsc-*</code> attribute) is an array of strings; <code>type</code>, <code>title</code> and <code>media</code> are strings and <code>hreflang</code> is an array of strings (RFC 9264 §4.2.4.1) (${R('AGSC-06-10')}).</p>\n`
      + table(['Attribute', 'Meaning', 'Rules'], attrs, r => `attr-${r[0]}`, r => `<code>${esc(r[0])}</code>`),
    'example-self': `<p>The live document is at <a href="${WELLKNOWN}"><code>${WELLKNOWN}</code></a>; a browser shows it as text. The same bytes, pretty-printed:</p>\n<pre tabindex="0" data-lang="json"><code>${esc(pretty(WELLKNOWN_DOC))}</code></pre>\n`,
    'example-level2': `<pre tabindex="0" data-lang="json"><code>${esc(pretty(level2))}</code></pre>\n`,
  };
  const used = new Set(['main', 'status-heading', ...relations.map(r => r[0]), ...attrs.map(r => `attr-${r[0]}`)]);
  const src = read('site/profile.md');
  checkText('site/profile.md', src);
  addPage('/specs/agentic-knowledge/', {
    title: 'Knowledge link set profile', summary: summaryOf('/specs/agentic-knowledge/'), description: 'The profile of the application/linkset+json discovery document that an AgenticSystemCore node serves at /.well-known/knowledge-linkset.', section: '/specs/agentic-knowledge/', wide: true,
    scripts: PAGE_TOOL_SCRIPTS,
    jsonld: { '@context': 'https://schema.org', '@type': 'TechArticle', headline: 'Knowledge link set profile', url: `${BASE}specs/agentic-knowledge/`, identifier: PROFILE, version: SPEC_VERSION, author: { '@type': 'Person', name: config.site.author } },
    body: md(src, { ruleLinks: true, page: 'agentic-knowledge', slots, used }) + editLink('site', 'site/profile.md'),
  });
}

// the MCP extension note (the documentation route a node declaring the `mcp` surface points at, AGSC-11-16)
{
  const R = r => `<a class="ref" href="/specs/${RULE_INDEX.get(r)}/#${r}">${r}</a>`;
  const slots = {
    status: `<section class="status" aria-labelledby="status-heading">
<h2 id="status-heading">Status</h2>
<dl class="meta">
<dt>Extension identifier</dt><dd><code>${esc(MCP_EXTENSION)}</code></dd>
<dt>Protocol revision</dt><dd>Model Context Protocol <code>${esc(MCP_REVISION)}</code>, the revision this text is written against; the reference engine's tool server, <code>agsc mcp</code>, speaks the earlier revision <code>2025-11-25</code></dd>
<dt>Standing</dt><dd>An unofficial extension under MCP SEP-2133, which says that "Unofficial extensions are not recognized by MCP governance and may be introduced and governed by developers outside the MCP organization". It needs no permission and has no registry entry, and it has not been submitted as an MCP SEP.</dd>
<dt>Specification</dt><dd><code>${esc(SPEC_VERSION)}</code>, a release candidate. It is an independent specification, not a standard of the IETF, the W3C or any other body.</dd>
<dt>This node</dt><dd>Does not declare the <code>mcp</code> surface: no tool server is published yet (${R('AGSC-11-16')}).</dd>
</dl>
</section>
`,
  };
  const used = new Set(['main', 'status-heading']);
  const src = read('site/mcp-extension.md');
  checkText('site/mcp-extension.md', src);
  addPage('/specs/mcp/', {
    title: 'MCP knowledge extension', summary: summaryOf('/specs/mcp/'), description: `The reference text of ${MCP_EXTENSION}, the unofficial Model Context Protocol extension by which a server says that the knowledge it serves is also published as a static Bundle.`, section: '/specs/', wide: true,
    scripts: PAGE_TOOL_SCRIPTS,
    jsonld: { '@context': 'https://schema.org', '@type': 'TechArticle', headline: 'MCP knowledge extension', url: `${BASE}specs/mcp/`, identifier: MCP_EXTENSION, version: SPEC_VERSION, license: 'https://www.apache.org/licenses/LICENSE-2.0', author: { '@type': 'Person', name: config.site.author }, isPartOf: `${BASE}specs/` },
    body: md(src, { ruleLinks: true, page: 'mcp', slots, used }) + editLink('site', 'site/mcp-extension.md'),
  });
}

// The vocabulary page and files of one route: `/ns/` (the current version, unversioned), or one
// versioned copy `/ns/<version>/` — the current version's, generated here, or a frozen one,
// whose page is written from its own Turtle and whose files are its bytes as published.
function nsPage(url, versioned, V = VOCABULARY) {
  const current = V === VOCABULARY;
  const version = V.versionInfo;
  const rows = kind => V.ascSubjects.filter(s => V.kindOf(s) === kind).map(s => {
    const name = s.slice(NS.length);
    const details = V.onto.triples.filter(t => t.s === s && ![RDF_TYPE, RDFS + 'label', RDFS + 'comment', RDFS + 'isDefinedBy'].includes(t.p))
      .map(t => `<code>${esc(qname(t.p))}</code> ${t.o.t === 'iri' ? `<code>${esc(t.o.v.startsWith(NS) ? 'asc:' + t.o.v.slice(NS.length) : (() => { try { return qname(t.o.v); } catch { return t.o.v; } })())}</code>` : esc(t.o.v)}`)
      .sort(byCode);
    return `<tr id="${esc(name)}"><th scope="row"><code>asc:${esc(name)}</code></th><td>${esc(V.one(s, RDFS + 'label') || name)}</td><td>${linkIds(V.one(s, RDFS + 'comment') || '', { ruleLinks: true, page: 'ns' })}</td><td>${details.join('<br>')}</td></tr>`;
  }).join('\n');
  const tbl = (id, title, kind) => `<h2 id="${id}">${title}</h2>\n<div class="table-wrap" tabindex="0" role="region" aria-label="${title}"><table>\n<thead><tr><th scope="col">Term</th><th scope="col">Label</th><th scope="col">Definition</th><th scope="col">Axioms</th></tr></thead>\n<tbody>\n${rows(kind)}\n</tbody></table></div>\n`;
  const counts = ['class', 'object', 'datatype'].map(k => V.ascSubjects.filter(s => V.kindOf(s) === k).length);
  // The vocabulary diagram is drawn by hand (site/diagrams/vocabulary.diagram); it must name every
  // class of the vocabulary, and its text alternative says "twelve", so a class added or removed
  // stops the build until the drawing is updated. It shows the current version only.
  if (current) {
    const src = read('site/diagrams/vocabulary.diagram');
    const classes = ascSubjects.filter(s => kindOf(s) === 'class').map(s => s.slice(NS.length));
    const missing = classes.filter(c => !new RegExp(`^box \\S+ [\\d ]+"${c}(\\||")`, 'm').test(src));
    if (missing.length) die(`site/diagrams/vocabulary.diagram does not draw the class(es) ${missing.join(', ')}`);
    if (classes.length !== 12 || !/twelve classes/.test(src)) die(`the vocabulary has ${classes.length} classes; update the count in site/diagrams/vocabulary.diagram`);
  }
  const prefix = versioned ? `/ns/${version}/` : '/ns/';
  // What the closing paragraph says about the copies. The unversioned page names the copy of the
  // current version and every frozen one; a frozen page that is not the current version says so.
  const earlier = [...FROZEN_NS.keys()].filter(v => v !== VERSION_INFO);
  const nsLink = v => `<a href="/ns/${esc(v)}/"><code>/ns/${esc(v)}/</code></a>`;
  const copies = versioned
    ? `This is the copy of version <code>${esc(version)}</code>.${current ? '' : ` It never changes, and it stays served beside the copy of the current version, ${nsLink(VERSION_INFO)} (${REF('AGSC-05-25')}).`}`
    : `${[`The copy of this version is at ${nsLink(VERSION_INFO)}`,
      ...(earlier.length ? [`the copy of each earlier version stays served and never changes: ${earlier.map(nsLink).join(', ')}`] : []),
      ...(/-/.test(VERSION_INFO) ? ['the pre-release version path stays in use until the specification reaches 1.0.0'] : [])].join('; ')} (${REF('AGSC-05-25')}).`;
  addPage(url, {
    title: `${V.one(ONTOLOGY_IRI, 'http://purl.org/dc/terms/title')}${versioned ? ` ${version}` : ''}`, summary: summaryOf('/ns/'), description: versioned ? `The copy of version ${version} of the vocabulary: ${V.one(ONTOLOGY_IRI, 'http://purl.org/dc/terms/description')}` : V.one(ONTOLOGY_IRI, 'http://purl.org/dc/terms/description'), section: '/ns/', wide: true,
    jsonld: { '@context': 'https://schema.org', '@type': 'DefinedTermSet', name: V.one(ONTOLOGY_IRI, 'http://purl.org/dc/terms/title'), url: BASE + url.slice(1), identifier: ONTOLOGY_IRI, version, license: 'https://creativecommons.org/publicdomain/zero/1.0/', hasDefinedTerm: V.ascSubjects.map(s => ({ '@type': 'DefinedTerm', termCode: 'asc:' + s.slice(NS.length), name: V.one(s, RDFS + 'label') || s.slice(NS.length), url: `${BASE}${url.slice(1)}#${s.slice(NS.length)}` })) },
    body: `<p>${esc(V.one(ONTOLOGY_IRI, 'http://purl.org/dc/terms/description'))}</p>
<dl class="meta">
<dt>Namespace</dt><dd><code>${NS}</code></dd>
<dt>Version IRI</dt><dd><code>${esc(V.one(ONTOLOGY_IRI, OWL + 'versionIRI'))}</code> (<code>owl:versionInfo</code> ${esc(version)})</dd>
<dt>Terms</dt><dd>${counts[0]} classes, ${counts[1]} object properties, ${counts[2]} datatype properties</dd>
<dt>Licence</dt><dd><a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0 1.0</a></dd>
<dt>Profile</dt><dd>OWL 2 RL (${REF('AGSC-05-22')})</dd>
</dl>
${versioned ? '' : figure('vocabulary')}<h2 id="representations">Representations</h2>
<ul>
<li><a href="${prefix}agsc.ttl">Turtle</a>, <code>text/turtle</code>: the normative source.</li>
<li><a href="${prefix}context.jsonld">JSON-LD context</a>, <code>application/ld+json</code>, generated from the Turtle (${REF('AGSC-06-32')}).</li>
<li><a href="${prefix}agsc.rdf">RDF/XML</a>, <code>application/rdf+xml</code>, and <a href="${prefix}agsc.nt">N-Triples</a>, <code>application/n-triples</code>, both generated from the Turtle. Most browsers download these two rather than showing them.</li>
${versioned ? '' : '<li>The JSON Schemas of the specification, <a href="/ns/schema/item.schema.json">item</a>, <a href="/ns/schema/bundle.schema.json">bundle</a> and <a href="/ns/schema/config.schema.json">configuration</a>, <code>application/json</code>, at the addresses their <code>$id</code> names.</li>\n'}</ul>
<p>${STATUS.w3id ? 'The namespace IRI negotiates between these representations through w3id.org' : 'Once the w3id.org redirects are registered, the namespace IRI will negotiate between these representations'} (${REF('AGSC-06-06')}). ${copies}</p>
${tbl('classes', 'Classes', 'class')}${tbl('object-properties', 'Object properties', 'object')}${tbl('datatype-properties', 'Datatype properties', 'datatype')}`,
  });
  const frozen = versioned ? FROZEN_NS.get(version) : undefined;
  if (!current) { for (const f of VOCABULARY_FILES) put(`${prefix.slice(1)}${f}`, frozen.get(f)); return; }
  // AGSC-06-32: the JSON-LD context is the engine's for the unversioned route, which is the one
  // AGSC-06-01 names; the immutable versioned copy beside the other vocabulary documents this
  // namespace site serves is compared against it and must be the same bytes.
  const ctxBytes = versioned ? jcs(CONTEXT) + '\n' : String(putEngine('/ns/context.jsonld'));
  if (versioned && ctxBytes !== String(ENGINE_BUILD.files.get('/ns/context.jsonld'))) die(`${prefix}context.jsonld differs from the engine's /ns/context.jsonld`);
  const generated = new Map([['agsc.ttl', TTL], ['agsc.nt', NT], ['agsc.rdf', RDFXML], ...(versioned ? [['context.jsonld', ctxBytes]] : [])]);
  // A frozen copy of the current version: what ontology/agsc.ttl generates must be its bytes. A
  // vocabulary that changed under the same version would rewrite a published copy (AGSC-05-25).
  if (frozen) {
    const changed = VOCABULARY_FILES.filter(f => !frozen.get(f).equals(Buffer.from(generated.get(f), 'utf8')));
    if (changed.length) die(`ontology/agsc.ttl says owl:versionInfo ${version}, whose copy static/ns/${version}/ is frozen, but generates other bytes for ${changed.join(', ')}: a changed vocabulary takes a new version (AGSC-05-25, AGSC-00-16)`);
  }
  for (const [f, bytes] of [...generated].sort((a, b) => byCode(a[0], b[0]))) put(`${prefix.slice(1)}${f}`, frozen ? frozen.get(f) : bytes);
}
nsPage('/ns/', false);
// Every versioned copy, in code-point order of its version: the frozen ones and the current one.
for (const v of SERVED_NS) nsPage(`/ns/${v}/`, true, v === VERSION_INFO ? VOCABULARY : vocabularyOf(FROZEN_NS.get(v).get('agsc.ttl').toString('utf8')));
// The three JSON Schemas at the addresses their `$id`s name, `/ns/schema/<name>.schema.json`, so a
// validator that dereferences an `$id` finds the schema. The bytes are the engine's files at the
// specification version this site publishes; an `$id` that names another address stops the build.
for (const n of ['bundle', 'config', 'item']) {
  const src = engineFile(`schema/${n}.schema.json`);
  const id = JSON.parse(src).$id;
  if (id !== `${BASE}ns/schema/${n}.schema.json`) die(`schema/${n}.schema.json: $id ${id} is not this site's /ns/schema/ address`);
  put(`ns/schema/${n}.schema.json`, src);
}

// items, indexes, clusters
const itemPage = it => addPage(it.url, {
  // a cluster page's title says it is the cluster, so it is not taken for the index page of the same name
  title: it.type === 'cluster' ? `${it.fm.title} cluster` : it.fm.title, heading: esc(it.fm.title), summary: it.fm.description || it.fm.title, description: it.fm.description || it.fm.title, section: it.type === 'concept' ? '/concepts/' : null,
  scripts: PAGE_TOOL_SCRIPTS,
  jsonld: it.type === 'concept'
    ? { '@context': 'https://schema.org', '@type': 'DefinedTerm', name: it.fm.title, description: it.fm.description, url: it.iri, inDefinedTermSet: `${BASE}concepts/` }
    : { '@context': 'https://schema.org', '@type': 'TechArticle', headline: it.fm.title, description: it.fm.description, url: it.iri, author: { '@type': 'Person', name: config.site.author } },
  body: `${itemMeta(it)}${it.fm.when ? `<p><strong>When:</strong> ${esc(it.fm.when)}</p>\n` : ''}${md(it.body, { ruleLinks: true, shift: 0 })}${it.type === 'cluster' ? `<h2 id="members">Members</h2>\n<ul>\n${members(it).map(m => `<li><a href="${m.url}">${esc(m.fm.title)}</a>: ${esc(m.fm.description || '')}</li>`).join('\n')}\n</ul>\n` : ''}${sourcesList(it)}${editLink('site', it.rel)}`,
});
items.forEach(itemPage);
const listPage = (url, title, description, list, section) => addPage(url, {
  title, summary: summaryOf(url), description, section,
  jsonld: { '@context': 'https://schema.org', '@type': url === '/concepts/' ? 'DefinedTermSet' : 'CollectionPage', name: title, url: ORIGIN + url },
  body: `<p>${esc(description)}</p>\n<ul class="index">\n${list.map(it => `<li><a href="${it.url}">${esc(it.fm.title)}</a>: ${esc(it.fm.description || '')}</li>`).join('\n')}\n</ul>\n`,
});
listPage('/concepts/', 'Vocabulary', 'The concepts of this node: the terms of the specification\'s ubiquitous language.', items.filter(it => it.type === 'concept'), '/concepts/');
listPage('/procedures/', 'Procedures', 'Step-by-step procedures derived from the specification.', items.filter(it => it.type === 'procedure'), null);
listPage('/clusters/', 'Clusters', 'The navigational groupings of this node.', clusters, null);
// AGSC-06-01 names the six type routes unconditionally and AGSC-06-02 says an empty type
// folder is omitted from navigation but still resolves: the three types this site does not
// author get their index page, out of the navigation, as the engine emits them.
for (const [plural, title] of [['lessons', 'Lessons'], ['episodes', 'Episodes'], ['gates', 'Gates']]) {
  listPage(`/${plural}/`, title, `This node publishes no ${plural} yet. The route exists because the specification names it for every node (AGSC-06-01); it is kept out of the navigation while it is empty (AGSC-06-02).`, items.filter(it => it.plural === plural), null);
}

// ------------------------------------------------------------------ the machine views of an item
// AGSC-06-02 + AGSC-05-07: every item has two machine views. `/pages/<slug>.md` MUST be a
// byte-identical copy of the LINT-NORMALIZED source file — the frontmatter block as the engine's
// `knowledge/adopt.js#serialize` writes it, then the body — because the `read` and `propose` page
// tools return exactly those bytes, and a page tool can return what a local `read` returns only if
// the frontmatter is published. The block is produced by the engine's own functions, so the bytes
// are the engine's bytes and this generator holds no second serializer.
const pageMarkdown = it => {
  const split = engineFrontmatter.split(it.src);
  return engineAdopt.serialize(engineYaml.parse(split.yamlText)) + split.body;
};
// both views are now the ENGINE's own emitted bytes rather than this generator's — the
// engine built the same Bundle and its `/pages/<slug>.md` and `.jsonld` are taken as they are.
// The Markdown this generator would have written is still produced and COMPARED, because the two
// agreeing byte for byte is what proves that the item source this repository holds and the item
// the engine parsed are the same item.
for (const it of items) {
  const md = pageMarkdown(it);
  if (!md.startsWith('---\n')) die(`pages/${it.slug}.md: no frontmatter block (AGSC-05-07)`);
  const engineMd = putEngine(`/pages/${it.slug}.md`);
  if (String(engineMd) !== md) die(`pages/${it.slug}.md: the engine's bytes and this generator's differ`);
  putEngine(`/pages/${it.slug}.jsonld`);
}

// ------------------------------------------------------------------ /compose/ (AGSC-06-01, AGSC-09-16)
// The combiner in the browser, and the route the `webmcp` surface declaration points at. The four
// scripts are the ENGINE's own emitted bytes: the algebra, the seven page tools, this
// page's controller and the WebMCP registration. No inline script, no third-party origin, no key,
// no upload — the page fetches only this node's own published routes.
put('compose/agsc-core.js', engineBrowser.bundle({ specVersion: SPEC_VERSION }));
put('compose/agsc-page-tools.js', enginePageTools.bundle({ bundleId: config.bundle.id, specVersion: SPEC_VERSION }));
put('compose/agsc-compose.js', engineComposePage.controller({ licenseProse: LICENSE_PROSE, specVersion: SPEC_VERSION }));
put('compose/webmcp.js', engineWebmcp.script());
addPage('/compose/', {
  title: 'Compose', summary: summaryOf('/compose/'), description: 'Select items and compute a Harness in this page — no server, no key, no upload; the same seven tools a browser assistant sees.', section: null,
  scripts: ['/compose/agsc-core.js', '/compose/agsc-page-tools.js', '/compose/agsc-compose.js', '/compose/webmcp.js'],
  jsonld: { '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Compose', url: `${BASE}compose/`, applicationCategory: 'DeveloperApplication', offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' }, author: { '@type': 'Person', name: config.site.author } },
  body: `<p>Tick the items you want. The closure algebra of ${REF('AGSC-07-01')} runs <em>in this page</em>: no request leaves this origin, no key is needed and nothing is uploaded. The Harness files, of seven kinds, are offered one download per file, or all together as one .zip.</p>
<p>This page also offers the seven tools of ${REF('AGSC-09-13')} to a browser assistant that supports them, as every item and guide page does. See <a href="/about/#tools-for-browser-assistants">Tools for browser assistants</a>.</p>
<h2 id="items-heading">Items</h2>
<ul id="items" aria-labelledby="items-heading"><li>Loading the published graph… This page needs JavaScript; without it, <code>agsc compose &lt;slug&gt;…</code> on a copy of this node gives the same Harness.</li></ul>
<h2 id="verdict-heading">Verdict</h2>
<p id="validity">Nothing selected.</p>
<pre id="verdict" tabindex="0"></pre>
<h3 id="explanations-heading" hidden>Why an item was added</h3>
<ul id="explanations" hidden></ul>
<h3 id="conflicts-heading" hidden>Conflicts</h3>
<ul id="conflicts" hidden></ul>
<h2 id="harness">Harness</h2>
<p><button id="download" type="button" disabled>Build the Harness</button></p>
<ul id="files"></ul>
<p id="archive" aria-live="polite"></p>
`,
});

// the guide (site/docs/*.md, hand-authored, plus the tagged documents rendered through slots)
const statusRows = [
  ['Specification <code>' + esc(SPEC_VERSION) + '</code>', SPEC_SOURCE === 'tag' ? 'Live' : 'Draft', SPEC_SOURCE === 'tag' ? `Tagged on ${esc(SPEC_DATE)}; twelve sections at <a href="/specs/">/specs/</a>; the vocabulary and the vectors are frozen at the tag.` : 'A draft release candidate, not yet tagged; twelve sections at <a href="/specs/">/specs/</a>. The vocabulary and the vectors freeze at the tag.'],
  ['This site as a node of its own specification', 'Live', `Items, <a href="/graph.jsonld"><code>graph.jsonld</code></a> with <a href="/graph.nq"><code>graph.nq</code></a> and <a href="/graph.ttl"><code>graph.ttl</code></a>, <a href="/llms.txt"><code>llms.txt</code></a>, <a href="/chunks.jsonl"><code>chunks.jsonl</code></a>, the <a href="/skills/">skill packs</a>, the <a href="/now/">NOW page</a> and the <a href="${WELLKNOWN}">discovery document</a>. The discovery validator checks it at Level 2 before every publish, and every digest it declares is compared with the bytes served. It claims Level 0 against the specification version above (${REF('AGSC-00-12')}); the reference engine&#39;s own Level-3 claim waits for its <code>1.0.0</code> release (${REF('AGSC-10-05')}).`],
  ['The machine files, written by the reference engine', 'Live', `Every file above is emitted by <code>agsc build</code> over this repository's own content, and this site republishes those bytes rather than deriving them a second time. The pages of this site are written by this repository's own generator, which keeps the hand-written guide; the engine writes the same design for every other node. See <a href="/exports/">the list of machine-readable files</a>.`],
  ['Ontology files', 'Live', `Turtle, JSON-LD context, RDF/XML and N-Triples at <a href="/ns/">/ns/</a>.`],
  ['Namespace through w3id.org', STATUS.w3id ? 'Live' : 'Not yet resolving', regText.w3id],
  ['Well-known URI <code>knowledge-linkset</code>', { 'not-requested': 'Not requested', requested: 'Requested', registered: 'Registered' }[STATUS.wellknown], regText.wellknown],
  ['Profile URI', { 'not-filed': 'Not filed', filed: 'Filed', registered: 'Registered' }[STATUS.profile], regText.profile],
  ['Internet-Draft', STATUS.draft ? 'Posted' : 'Not yet posted', regText.draft + (STATUS.draft ? '' : ' It will describe the discovery layer only, request the registration of the well-known suffix <code>knowledge-linkset</code>, and record the fields of the profile URI, which is registered separately in the Profile URIs registry.')],
  ['Preprint', STATUS.preprint ? 'Published' : 'In preparation', regText.preprint],
  ['Reference engine <code>agsc</code>', 'Published', 'The engine is written, and it builds this site: every machine-readable file here is emitted by <code>agsc build</code> over this repository&#39;s own content. Published as <code>agentic-system-core</code> (short alias <code>agsc-cli</code>) on npm and as <code>agentic-system-core</code> on PyPI, at <code>1.0.0-rc.7</code>.'],
  ['Independent validators', 'Published', `The nine checker contracts of ${REF('AGSC-09-90')} &#8212; seven validators and two generators &#8212; ship in the published npm package beside its artefact counter and its benchmark tool; the maintainer&#39;s own tools stay in the repository. One validator, for the discovery document, checks this site at Level 2 before every publish.`],
  ['Contribution channel', 'Live', `Declared in the <a href="${WELLKNOWN}">discovery document</a> as a pull-request target (${REF('AGSC-11-14')}), and every page generated from a source file carries a <em>Propose an edit</em> link to that file. Nothing is written without a person merging it.`],
  ...(PATTERNS_NODE ? [['Second node (live demonstration)', 'Live', `A second node, at <code>patterns.agenticsystemcore.com</code>, is online: a live demonstration of the reference engine, running on a small sample of well-known agent-system patterns described from public sources. Its published items are in the repository <a href="https://github.com/andreibesleaga/agsc-demo-node">agsc-demo-node</a>. ${PEERS.length ? `Each names the other as a peer in its discovery document, and the mutual check of ${REF('AGSC-10-12')} passes.` : 'It is not declared as a peer yet.'}`]] : []),
  ['Papers', 'Submitted', 'Papers based on this work have been submitted for review; none is published yet. This page names a paper once it is published.'],
];
const statusTable = `<div class="table-wrap" tabindex="0" role="region" aria-label="Status"><table>
<thead><tr><th scope="col">What</th><th scope="col">State</th><th scope="col">Detail</th></tr></thead>
<tbody>
${statusRows.map(r => `<tr><th scope="row">${r[0]}</th><td>${esc(r[1])}</td><td>${r[2]}</td></tr>`).join('\n')}
</tbody></table></div>
`;
const registrationsTable = `<div class="table-wrap" tabindex="0" role="region" aria-label="Registrations"><table>
<thead><tr><th scope="col">Registration</th><th scope="col">Where</th><th scope="col">Policy</th><th scope="col">Status</th></tr></thead>
<tbody>
<tr><th scope="row">Well-known URI suffix <code>knowledge-linkset</code></th><td>IANA Well-Known URIs registry (RFC 8615)</td><td>Specification Required; asked for in the Internet-Draft</td><td>${regText.wellknown}</td></tr>
<tr><th scope="row">Profile URI <code>${PROFILE}</code></th><td>IANA Profile URIs registry (RFC 7284)</td><td>First Come First Served</td><td>${regText.profile}</td></tr>
<tr><th scope="row">Internet-Draft on the discovery layer</th><td>IETF Datatracker, individual Internet-Draft</td><td>An individual draft: on no stream and adopted by no working group; it may be revised or left to expire</td><td>${regText.draft}</td></tr>
<tr><th scope="row">Namespace <code>agentic-system-core</code></th><td>w3id.org permanent identifiers</td><td>Pull request reviewed by the w3id maintainers</td><td>${regText.w3id}</td></tr>
<tr><th scope="row">Discovery link relation</th><td>IANA Link Relations registry</td><td>None needed: the registered relation <code>describedby</code> (registered by W3C POWDER; RFC 6892 registers its inverse <code>describes</code>) is used with the media type (${REF('AGSC-06-25')})</td><td>No request</td></tr>
<tr><th scope="row">MCP extension identifier <code>${esc(MCP_EXTENSION)}</code></th><td>MCP extensions mechanism (SEP-2133)</td><td>Reverse-domain identifier declared by the server; no registry entry (${REF('AGSC-11-18')})</td><td>Declared in the specification; the reference text is at <a href="/specs/mcp/">/specs/mcp/</a></td></tr>
</tbody></table></div>
`;
const publicationsHtml = `<ul>
<li><strong>Preprint.</strong> ${regText.preprint}${STATUS.preprint ? '' : ' It will establish the specification, its vectors and its discovery layer as of the tagged release, with a persistent identifier.'}</li>
<li><strong>Internet-Draft.</strong> ${regText.draft}</li>
<li><strong>Papers.</strong> Papers based on this work have been submitted for review; none is published yet. This page names a paper once it is published.</li>
</ul>
<h3 id="how-to-cite">How to cite</h3>
<p>${STATUS.preprint ? `Cite the preprint by its DOI, <code>${esc(STATUS.preprint.doi)}</code>, and the specification by version.` : 'Until the preprint is published, cite the specification by version and tag:'}</p>
<pre tabindex="0"><code>${esc(config.site.author)}. AgenticSystemCore specification ${esc(SPEC_VERSION)}, ${esc(SPEC_DATE)}. ${esc(BASE)}specs/</code></pre>
`;
// AGSC-06-21: /docs/scenarios/ carries the coverage table and one link per feature file; each feature
// file is a page of its own, /docs/scenarios/<file stem>/, so that no page grows past the budget as
// scenarios are added. The id on each entry keeps an older link to /docs/scenarios/#<file stem> landing.
const featuresCoverage = sectionOf(DOC.featuresReadme, '## Scenario-coverage table').replace(/`([a-z0-9-]+)\.feature`/g, (_, n) => `[${n}](/docs/scenarios/${n}/)`);
const featureTitle = f => (/^\s*Feature: (.*)$/m.exec(f.src) || [, f.name])[1];
const featureUrl = f => `/docs/scenarios/${f.name}/`;
const featuresHtml = `<ul>\n${FEATURES.map(f => `<li id="${esc(f.name)}"><a href="${esc(featureUrl(f))}"><code>${esc(f.name)}.feature</code></a>: ${esc(featureTitle(f))}</li>`).join('\n')}\n</ul>\n`;
const relatedWork = ['## 1. One sentence', '## 3. The agent-discovery mechanisms', '## 4. Adjacent work', '## 5. What is new here'].map(h => {
  const line = DOC.related.split('\n').find(l => l.startsWith(h));
  return `### ${line.replace(/^## /, '')}\n\n${sectionOf(DOC.related, h)}`;
}).join('\n');
// a folder README describes the source folder, not a page; site/docs/guides/ holds the six mode
// guides under /docs/guides/ (index.md is /docs/guides/ itself)
const pagesOf = dir => fs.readdirSync(path.join(ROOT, 'site/docs', dir)).filter(f => f.endsWith('.md') && f !== 'README.md').sort().map(f => dir ? `${dir}/${f}` : f);
const DOCS = [...pagesOf(''), ...pagesOf('guides')];
const WIDE_DOCS = new Set(['architecture', 'requirements', 'scenarios', 'standards', 'compliance', 'glossary', 'how-to-use']);
// The guides are the engine's docs/guides/*.md with site links; their commands and the lines they
// quote MUST be the engine's, which tests/docs/guides.test.js runs. Compared block by block with the
// engine working tree whenever it carries the guides: a guide edited on one side only stops the build.
const fencedBlocks = text => [...text.matchAll(/^(`{3,})([^\n]*)\n([\s\S]*?)^\1$/gm)].map(m => `${m[2]}\n${m[3]}`);
if (fs.existsSync(path.join(ENGINE, 'docs/guides'))) {
  for (const f of pagesOf('guides').filter(f => f !== 'guides/index.md')) {
    const engineFile = path.join(ENGINE, 'docs', f);
    if (!fs.existsSync(engineFile)) die(`site/docs/${f}: the engine has no docs/${f}`);
    const site = fencedBlocks(read(`site/docs/${f}`)), engine = fencedBlocks(fs.readFileSync(engineFile, 'utf8'));
    const at = site.findIndex((b, i) => b !== engine[i]);
    if (at !== -1 || site.length !== engine.length) die(`site/docs/${f}: code block ${at === -1 ? site.length + 1 : at + 1} differs from the engine's docs/${f}; copy the guide's commands and quoted lines from the engine`);
  }
}
for (const f of DOCS) {
  const slug = f.replace(/(^|\/)index\.md$/, '').replace(/\.md$/, '').replace(/\/$/, ''), url = `/docs/${slug}${slug ? '/' : ''}`;
  const { fm, body: authored } = splitFrontmatter(read(`site/docs/${f}`), `site/docs/${f}`);
  const body = hidePatternsProse(authored);
  for (const k of ['title', 'summary', 'description']) if (!fm[k]) die(`site/docs/${f}: ${k} missing`);
  for (const m of body.matchAll(/\bAGSC-(?:\d{2}-\d{2,3}[a-z]?|E\d{3})\b/g)) if (!RULE_INDEX.has(m[0]) && !PENDING_RULES.has(m[0])) die(`site/docs/${f} cites ${m[0]}, which is not in the specification`);
  for (const m of body.matchAll(/\b(?:PRD-\d{3}|NFR-\d{2})\b/g)) if (!REQ_IDS.has(m[0]) && !PENDING_REQS.has(m[0])) die(`site/docs/${f} cites ${m[0]}, which is not in the requirements`);
  const used = new Set(['main']);
  const o = { ruleLinks: true, page: slug, used, tables: { n: 0 } };
  const slots = {
    requirements: { prd: md(stripH1(DOC.prd), { ...o, page: 'requirements', dropColumns: ['Trace'] }) },
    scenarios: { coverage: md(featuresCoverage, o), features: featuresHtml },
    glossary: { glossary: md(stripH1(DOC.glossary), o) },
    standards: { registrations: registrationsTable, 'building-blocks': md(sectionOf(DOC.related, '## 2. Normative building blocks'), o), 'standards-register': md(sectionOf(DOC.specIndex, '## 4. Standards Register'), o), 'related-work': md(relatedWork, o), publications: publicationsHtml },
    compliance: { crosswalk: md(stripH1(DOC.crosswalk), o), security: md(stripH1(DOC.security), { ...o, shift: 1 }) },
    status: { 'status-table': statusTable },
  }[slug] || {};
  addPage(url, {
    title: fm.title, summary: fm.summary, description: fm.description, section: slug === 'standards' ? '/docs/standards/' : '/docs/', wide: WIDE_DOCS.has(slug),
    scripts: PAGE_TOOL_SCRIPTS,
    jsonld: { '@context': 'https://schema.org', '@type': 'TechArticle', headline: fm.title, description: fm.description, url: ORIGIN + url, author: { '@type': 'Person', name: config.site.author }, isPartOf: `${BASE}docs/` },
    body: md(body, { ...o, slots }) + editLink('site', `site/docs/${f}`),
  });
}
FEATURES.forEach((f, k) => {
  const url = featureUrl(f), title = featureTitle(f), prev = FEATURES[k - 1], next = FEATURES[k + 1];
  const n = (f.src.match(/^\s*Scenario(?: Outline)?:/gm) || []).length;
  const link = (x, rel) => `<a href="${esc(featureUrl(x))}" rel="${rel}"><code>${esc(x.name)}.feature</code></a>`;
  const around = `<p>One of the feature files of the <a href="/docs/scenarios/">scenarios</a>, where the coverage table names the requirements each file proves.${prev ? ` Previous: ${link(prev, 'prev')}.` : ''}${next ? ` Next: ${link(next, 'next')}.` : ''}</p>\n`;
  addPage(url, {
    title: `Scenarios: ${title}`, summary: `The ${n === 1 ? 'scenario' : `${n} scenarios`} of the feature file ${f.name}.feature, in the Given/When/Then form the reference engine runs; each names the requirement it proves.`,
    description: `The behaviour-driven scenarios of ${f.name}.feature: ${title}.`, section: '/docs/', wide: true,
    scripts: PAGE_TOOL_SCRIPTS,
    jsonld: { '@context': 'https://schema.org', '@type': 'TechArticle', headline: `Scenarios: ${title}`, description: `The behaviour-driven scenarios of ${f.name}.feature: ${title}.`, url: ORIGIN + url, author: { '@type': 'Person', name: config.site.author }, isPartOf: `${BASE}docs/scenarios/` },
    body: around + `<pre tabindex="0" class="feature" data-lang="gherkin"><code>${linkIds(f.src.replace(/\n+$/, ''), { ruleLinks: true, page: `scenarios/${f.name}` })}</code></pre>\n` + editLink('engine', `features/${f.name}.feature`),
  });
});
checkPatternsProse();

// AGSC-06-24: `/about/` carries a Quickstart — one path of at most ten lines per persona,
// P0 first with the three commands — generated from this template so that it cannot drift
// from the verb set: every `agsc <verb>` a step names is checked against the sixteen verbs
// the engine declares, and the build stops on a verb that does not exist.
const ENGINE_VERBS = new Set(engineModule('src/application/cli/main.js').VERBS);
const QUICKSTART = [
  ['P0', 'Drop-in user', ['agsc init', 'add .well-known/security.txt with a Contact: line (agsc init says so)', 'commit once, or set SOURCE_DATE_EPOCH, so the build has an instant', 'agsc ci', 'agsc build']],
  ['P1', 'Human reader', ['open /docs/ then /specs/', 'search from /search/', 'follow an item\'s links and sources']],
  ['P2', 'Human contributor', ['fork the repository and edit one item file', 'agsc lint --fix', 'agsc propose <slug>', 'open the pull request the proposal describes']],
  ['P3', 'Agent reader', ['fetch /.well-known/knowledge-linkset', 'fetch /llms.txt or /graph.jsonld', 'agsc mcp   (a local tool server over stdio)']],
  ['P4', 'Agent proposer', ['agsc mcp', 'call the propose tool', 'a person reviews and merges the proposal']],
  ['P5', 'Architect', ['open /compose/', 'tick the items you want', 'download the Harness (or: agsc compose <slug>… --zip)']],
  ['P6', 'Integrator', ['agsc skills install', 'agsc export --steer --target <tool>', 'agsc export --to cogx']],
  ['P7', 'Project team', ['author kind: spec, decision and task items', 'agsc lint', 'agsc build   (boards and gates render with the site)']],
  ['P8', 'Agent using a node as memory', ['agsc mcp', 'call remember, then ask', 'agsc import --from <format> <dir>   to bring memory back']],
  ['P9', 'Maintainer', ['agsc ci', 'agsc verify --ledger', 'agsc refresh --agent <name> --dry-run   (an agent lane declared in agsc.config.json)']],
  ['P10', 'Port implementer', ['read spec/, schema/, ontology/ and tests/vectors/', 'run the vector set against your engine', 'agsc conform --level <n>   to write the claim']],
  ['P11', 'Standards implementer', ['fetch /.well-known/knowledge-linkset', 'validate-wellknown <file> --level 2', 'follow rel="describedby" from any page']],
  // P12 is a persona of the requirements (Mode 5) that the quickstart rule does not list yet; its
  // path is this site's content, beyond what AGSC-06-24 asks.
  ['P12', 'Self-driving team on a live board', ['author task items in a cluster', 'agsc build   (the board renders as a page and a JSON file)', 'agsc mcp', 'call propose with a task_state to claim or move a task', 'a person reviews and merges the proposal']],
];
const quickstartHtml = () => {
  for (const [id, , steps] of QUICKSTART) {
    if (steps.length > 10) die(`quickstart ${id}: more than ten lines (AGSC-06-24)`);
    for (const step of steps) {
      const m = /^agsc ([a-z-]+)/.exec(step);
      if (m && !ENGINE_VERBS.has(m[1])) die(`quickstart ${id}: "${m[1]}" is not a verb of the engine (AGSC-09-07)`);
    }
  }
  return `<h2 id="quickstart">Quickstart</h2>\n<p>One short path per kind of visitor, each of at most ten lines; the commands are the reference engine\'s (${REF('AGSC-09-07')}) and the build checks every verb named here against it (${REF('AGSC-06-24')}).</p>\n`
    + QUICKSTART.map(([id, title, steps]) => `<h3 id="quickstart-${id.toLowerCase()}">${esc(id)} &#8212; ${esc(title)}</h3>\n<ol>\n${steps.map(s => `<li><code>${esc(s)}</code></li>`).join('\n')}\n</ol>\n`).join('');
};

// changelog (AGSC-06-01: `/changelog/` is derived from the git-log file the build is given).
// The list is the ENGINE's derivation for this Bundle — its own `/changelog/` page, read here
// for its rows — published in this site's page shell, which the engine's page shell cannot carry
// (see scripts/engine.js). A row the engine writes that this parser does not recognise stops the build.
{
  const engineHtml = String(ENGINE_BUILD.files.get('/changelog/index.html') || die('the engine emitted no /changelog/ (AGSC-06-01)'));
  const tbody = /<tbody>([\s\S]*?)<\/tbody>/.exec(engineHtml);
  const rows = [];
  if (tbody) {
    for (const tr of tbody[1].match(/<tr>[\s\S]*?<\/tr>/g) || []) {
      const m = /^<tr><td><code>([^<]+)<\/code><\/td><td>(\d{4}-\d{2}-\d{2})<\/td><td><code>([0-9a-f]{40,64})<\/code><\/td><\/tr>$/.exec(tr);
      if (!m) die(`the engine's /changelog/ has a row this generator does not read: ${tr}`);
      rows.push(m.slice(1));
    }
  } else if (!/published no tagged version/.test(engineHtml)) die('the engine\'s /changelog/ has neither a table nor its empty-state sentence');
  const body = rows.length === 0
    ? '<p>This node has published no tagged content version yet.</p>\n'
    : `<p>Each row is a tag of this site's repository, the day of its commit and the commit itself. These are this node's content versions, numbered on their own; they are not versions of the specification. The content version of the last build is on the <a href="/now/">NOW page</a> and in the discovery document; the specification's own releases are listed in its <a href="${FORGE.engine}/blob/main/CHANGELOG.md">change log</a>.</p>\n`
      + '<div class="table-wrap" tabindex="0" role="region" aria-label="Content versions"><table>\n<thead><tr><th scope="col">Version</th><th scope="col">Date</th><th scope="col">Commit</th></tr></thead>\n<tbody>\n'
      + rows.map(([v, d, c]) => `<tr><th scope="row"><code>${esc(v)}</code></th><td>${esc(d)}</td><td><a href="${esc(`${FORGE.site}/commit/${c}`)}"><code>${esc(c.slice(0, 12))}</code></a></td></tr>`).join('\n')
      + '\n</tbody></table></div>\n';
  addPage('/changelog/', {
    title: 'Changelog', summary: summaryOf('/changelog/'), description: 'Every content version this node has published, with its date and commit.', section: null,
    body,
  });
}

// about, legal
addPage('/about/', {
  title: 'About', summary: summaryOf('/about/'), description: 'Who writes AgenticSystemCore, how to read this node, the status of the specification and how to get in touch.', section: '/about/',
  jsonld: { '@context': 'https://schema.org', '@type': 'AboutPage', name: 'About AgenticSystemCore', url: `${BASE}about/`, author: { '@type': 'Person', name: config.site.author, sameAs: ['https://orcid.org/0009-0001-3464-5283', 'https://github.com/andreibesleaga', CONTACT_URL] } },
  body: md(read('site/about.md'), { ruleLinks: true }).replace('<h2 id="status">', quickstartHtml() + '<h2 id="status">') + editLink('site', 'site/about.md'),
});
// AGSC-06-18 pins the text the identifier names: the file `LICENSE-CONTENT`
// at the root of the specification's distribution, with this SHA-256 over its bytes. The Bundle
// root carries its own copy; both are checked to be that text, or `/legal/` would publish terms
// the identifier does not name.
const TERMS_SHA256 = 'b2e8da62e6a41886296d2d2358fb4642cc7418e806eb4a29ada12b588ac32857';
const TERMS_TEXT = engineFile('LICENSE-CONTENT');
if (!TERMS_TEXT.includes(`SPDX-License-Identifier: ${TERMS_ID}`)) die('LICENSE-CONTENT does not carry the terms identifier');
if (sha256hex(Buffer.from(TERMS_TEXT, 'utf8')) !== TERMS_SHA256) die(`LICENSE-CONTENT at tag ${SPEC_TAG} is not the text AGSC-06-18 pins (${TERMS_SHA256})`);
if (sha256hex(fs.readFileSync(path.join(ROOT, 'LICENSE-CONTENT'))) !== TERMS_SHA256) die('the Bundle root LICENSE-CONTENT is not the text AGSC-06-18 pins');
addPage('/legal/', {
  title: 'Legal and privacy', summary: summaryOf('/legal/'), description: 'The Content Use Terms, the licences of each kind of artefact, copyright, citing, first publication, the machine-readable signals and the privacy notice of this node.', section: null,
  jsonld: { '@context': 'https://schema.org', '@type': 'WebPage', name: 'Legal and privacy', url: `${BASE}legal/` },
  body: `<h2 id="licences">Licences</h2>
<div class="table-wrap" tabindex="0" role="region" aria-label="Licences"><table>
<thead><tr><th scope="col">What</th><th scope="col">Licence</th></tr></thead>
<tbody>
<tr><td>The prose of the items, and the pages and text files that carry it, including <code>/llms.txt</code>, <code>/llms-full.txt</code> and <code>/graph.jsonld</code></td><td><a href="#terms">Content Use Terms 1.0</a> (<code>${TERMS_ID}</code>)</td></tr>
<tr><td>The schemas, the ontology, the JSON-LD context, the identifiers and the discovery document</td><td><a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0 1.0</a></td></tr>
<tr><td>The specification text</td><td><a href="https://www.apache.org/licenses/LICENSE-2.0">Apache License 2.0</a>, as published with the reference implementation</td></tr>
<tr><td>The reference engine, its command line and checkers, and the conformance vectors</td><td><a href="https://www.apache.org/licenses/LICENSE-2.0">Apache License 2.0</a></td></tr>
</tbody></table></div>
<h2 id="copyright">Copyright and authorship</h2>
<p>&#169; ${esc(FOOTER_YEAR)} ${esc(config.site.author)}. The author wrote the specification, the reference engine, the vocabulary, the schemas, the guide and the items of this node, except where an item&#39;s provenance names another author, and holds the copyright in all of it except the parts dedicated to the public domain under CC0 1.0. The licences above grant the permissions they state and nothing more; every other right is kept by the author, including the right to publish the same material elsewhere, in any form. The right to be named as the author, and to object to a change that harms the work&#39;s integrity, stays with the author wherever the law gives it.</p>
<h2 id="terms">Content Use Terms 1.0</h2>
<p>The identifier <code>${TERMS_ID}</code> names this exact text, not a file name: the file <code>LICENSE-CONTENT</code> at the root of the specification's distribution, ${Buffer.byteLength(TERMS_TEXT)} bytes, SHA-256 <code>${TERMS_SHA256}</code> (${REF('AGSC-06-18')}). A distribution that ships different wording must use a different identifier; a reader may check the hash.</p>
<pre tabindex="0" class="terms"><code>${esc(TERMS_TEXT.replace(/\n$/, ''))}</code></pre>
<h2 id="citing">Citing and quoting</h2>
<p>Cite this work as <a href="/docs/standards/#how-to-cite">the standards page</a> shows: the specification by its version, and the paper by its DOI once it is published. Clause 3 of the Content Use Terms lets anyone quote the prose, with attribution to this node&#39;s address and the item&#39;s address, in any work that adds their own contribution; the licences of the specification, the engine and the vocabulary allow more. Nothing on this page limits a quotation, or any other use, that the law of your country allows without permission.</p>
<h2 id="prior-art">First publication and prior art</h2>
<p>Specification <code>${esc(SPEC_VERSION)}</code>, tagged on ${esc(SPEC_DATE)}, is the version in which this work was first made public, together with its reference engine, its vocabulary, its schemas and its conformance vectors. ${STATUS.preprint ? `The permanent record is the Zenodo deposit <a href="https://doi.org/${esc(STATUS.preprint.doi)}">${esc(STATUS.preprint.doi)}</a> of ${esc(STATUS.preprint.date)}: the paper, and a sealed archive of the tagged sources whose SHA-256 digests are listed in the deposit&#39;s <code>SHA256SUMS</code> file, with an OpenTimestamps proof of that list.` : 'The permanent record &#8212; a deposit with a persistent identifier holding the paper and a sealed archive of the tagged sources, with their SHA-256 digests and an OpenTimestamps proof of them &#8212; is named here once it is published.'}</p>
<p>Everything these artefacts describe &#8212; the format, the rules, the discovery mechanism, the vocabulary and the designs of the engine &#8212; is published so that it is on the public record from that date, and it is free to implement under the licences on this page. Publication does not stop anyone from applying for a patent; it places what is published here in the state of the art against which the novelty of a later application is judged.</p>
<h2 id="signals">Machine-readable signals</h2>
<p>The same policy is stated three ways (${REF('AGSC-06-18')}): the per-crawler groups of <a href="/robots.txt"><code>/robots.txt</code></a>, the TDM reservation in <a href="/.well-known/tdmrep.json"><code>/.well-known/tdmrep.json</code></a>, and the <code>schema:license</code> and <code>schema:usageInfo</code> members of <a href="/graph.jsonld"><code>/graph.jsonld</code></a> together with the provenance header of <a href="/llms.txt"><code>/llms.txt</code></a>. The reservation of text and data mining does not limit what the law of your country allows researchers to do without permission.</p>
<h2 id="ai-assistance">How this text was written</h2>
<p>${esc(config.site.author)} writes and maintains this work with the help of AI assistants. A person decides what is written and why. An assistant drafts and checks text under the author&#39;s direction. The author reads, edits and approves every sentence before it is published, and answers for all of it.</p>
<p>Every item on this node records how its text was made &#8212; written by a person, written with AI assistance, generated by a model, or imported from elsewhere &#8212; and names the person accountable for it. You can read that record on the item&#39;s own page and in the machine-readable views.</p>
<p>No model runs on this site, in its build, or in any check that decides whether a change is accepted.</p>
<p><strong>What the assistance covered.</strong> Text, code, figures and diagrams alike. ${esc(config.site.author)} reviewed all of it and answers for it.</p>
<p><strong>Models are optional, and belong to whoever runs them.</strong> The reference engine contains no model adapter and calls no model. The model steps the specification describes &#8212; an agent lane, a review lane, automatic correction, a narrated answer &#8212; are optional: each stays off unless the person running an engine adds an adapter of their own and turns it on, each runs under that person&#39;s spend cap (${REF('AGSC-01-38')}), and each is that person&#39;s responsibility.</p>
<p><strong>What your assistant says is not this site speaking.</strong> The page tools, the tool server and the exports hand this node&#39;s published text to software that someone else runs. What an assistant or agent writes from it is that software&#39;s output and the responsibility of the person who runs it: it is not a statement by the author, and it can be wrong even where the text it read is right. The Content Use Terms still apply to any of this node&#39;s text it reproduces, and text an agent sends back as a proposal becomes part of this node only after a person reviews and merges it.</p>
<p>In the words the machine-readable exports use, which are a constant of the specification and are never authored here (${REF('AGSC-06-15')}): <q>${esc(engineProvenance.ASSISTANCE)}</q></p>
<h2 id="disclaimer">What this work does not claim</h2>
<p><strong>No warranty.</strong> This work is published as it is. Nothing here is promised to be complete, correct, current or fit for any purpose.</p>
<p><strong>No liability.</strong> Use it at your own risk. To the fullest extent the law allows, the author is not liable for anything that follows from using it, including any indirect, incidental, special or consequential loss and any loss of data, profit or business. Nothing here excludes or limits a liability that the law does not allow to be excluded or limited.</p>
<p><strong>Not advice.</strong> Nothing here is legal, professional, financial, medical or safety advice. Where a page describes a rule, a regulation or a standard, it is a description and nothing more, and it may be wrong or out of date.</p>
<p><strong>Verify before relying.</strong> The specification, the guide and the items describe formats, designs and practices. Check them against your own requirements and against the sources they cite, and test what you build, before you rely on them. Nothing here is security advice either: following the specification&#39;s security rules does not by itself make a system secure.</p>
<p><strong>The software.</strong> The reference engine and this site&#39;s code are provided under the Apache License 2.0, which carries its own disclaimer of warranty (section 7) and limitation of liability (section 8).</p>
<p><strong>Links to other sites.</strong> Links to other sites are there for reference. What they lead to belongs to its owners; the author does not control it and is not responsible for it, and a link does not mean the author approves of it.</p>
<p><strong>Nobody else is behind this.</strong> This is the independent work of one person. No standards body, no foundation, no company and no institution named anywhere on this site has reviewed, approved, sponsored or is otherwise connected with it. This is not a document of the IETF, of the W3C or of any other body, and none of them has adopted it.</p>
<p><strong>Other people&#39;s names belong to them.</strong> Product, project and organisation names used here &#8212; among them those of the IETF, IANA, the W3C, the Linux Foundation, Cloudflare, GitHub, npm, Google, OpenAI, Anthropic, Meta and Zenodo &#8212; are used only to say what is being talked about. They are the marks of their respective owners, and using a name is not a claim of any connection with its owner.</p>
<p><strong>The name of this project.</strong> AgenticSystemCore&#8482; is a trademark of Andrei N. Besleaga. Other names belong to their owners.</p>
<p><strong>What you may do with this text.</strong> The prose of this node is published under the <a href="#terms">Content Use Terms</a> above: all rights are reserved, and you may read it, quote it with attribution, index it, cite a chunk with its provenance, and compose items into a Harness for your own project. See the terms in full on this page.</p>
<p><strong>No guarantee of availability.</strong> This site, its files and its addresses may change, move or stop at any time, without notice. Nothing here promises that any version, address or service will stay available.</p>
<p><strong>Rights not granted are reserved.</strong> Every right in this work that the licences on this page do not expressly grant is reserved by its author.</p>
<p><strong>These notices may change.</strong> They may be updated at any time, and the text on this page when you use the work is the one that applies to that use. A change never takes away a permission that a licence already gave for the version you received.</p>
<p><strong>If one part does not hold.</strong> If any part of these notices is found to be unenforceable, the rest still applies.</p>
<p><strong>What the checks prove.</strong> The specification states its own limit, and this node holds to it: these lints prove neither safety nor the absence of novel injection; hashes and attestations prove only that an artefact is what was published. Nothing here claims more.</p>
<h2 id="privacy">Privacy</h2>
${md(read('site/privacy.md'))}<p>Operator of this site: ${esc(config.site.author)}. Retention: the git history of the site's repository is the only record kept; no request logs are kept by the operator.</p>
`,
});

// ------------------------------------------------------------------ the new machine surfaces
// /. Four pages AGSC-06-01 names and this site did not have. Every fact on them is
// read from what the ENGINE emitted for this Bundle — the NOW state, the skill-pack index, the
// tag pages — and only the page shell is this site's, so nothing here is a second derivation.

// `/now/` — the machine half is `/now.md`, the engine's own bytes; this page is the same state
// in this site's shell, so a reader and an agent see one thing (AGSC-06-01, AGSC-10-07).
{
  const nowMd = String(ENGINE_BUILD.files.get('/now.md'));
  const html = nowMd.split('\n').reduce((acc, line) => {
    if (/^## /.test(line)) { if (acc.list) { acc.out.push('</ul>'); acc.list = false; } acc.out.push(`<h2 id="${line.slice(3).toLowerCase().replace(/[^a-z0-9]+/g, '-')}">${esc(line.slice(3))}</h2>`); }
    else if (/^- /.test(line)) { if (!acc.list) { acc.out.push('<ul>'); acc.list = true; } acc.out.push(`<li>${esc(line.slice(2))}</li>`); }
    else if (/^# /.test(line)) { /* the page's own <h1> */ }
    else if (line.trim() !== '') { if (acc.list) { acc.out.push('</ul>'); acc.list = false; } acc.out.push(`<p>${esc(line)}</p>`); }
    return acc;
  }, { out: [], list: false });
  if (html.list) html.out.push('</ul>');
  addPage('/now/', {
    title: 'Now', summary: summaryOf('/now/'), description: 'The state of this node at the last build: content version, graph fingerprint, item counts and monthly model spend.', section: null,
    jsonld: { '@context': 'https://schema.org', '@type': 'WebPage', name: 'Now', url: `${BASE}now/` },
    body: `${html.out.join('\n')}
<p class="views">Machine view: <a href="/now.md">/now.md</a>, the same state as Markdown, written by the engine.</p>
`,
  });
}

// `/skills/` — one pack per cluster (AGSC-07-19); `/skills/index.json` is both the index and the
// lockfile of AGSC-07-20, so a runtime can check that the pack it loaded is the pack published.
{
  const idx = JSON.parse(String(ENGINE_BUILD.files.get('/skills/index.json')));
  addPage('/skills/', {
    title: 'Skill packs', summary: summaryOf('/skills/'), description: 'One skill pack per cluster of this node, each a single SKILL.md an agent runtime can load, with a lockfile of their digests.', section: null,
    jsonld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Skill packs', url: `${BASE}skills/` },
    body: `<p>A skill pack is one file. It gathers a cluster's items into the form an agent runtime loads, and it is generated from the same items the pages above show &#8212; nobody writes a pack by hand. The index beside them is also the lockfile: it carries the SHA-256 of every pack, so a runtime can tell that what it loaded is what was published.</p>
<ul class="packs">
${idx.packs.map(pk => `<li><a href="${esc(pk.path)}"><code>${esc(pk.name)}</code></a>: ${esc(pk.description)} <span class="grade">(${pk.members.length} item${pk.members.length === 1 ? '' : 's'})</span></li>`).join('\n')}
</ul>
<p class="views">Machine views: <a href="/skills/index.json">/skills/index.json</a>, the index and the lockfile.</p>
`,
  });
}

// `/tags/<tag>/` — the tag pages of AGSC-06-01, one per tag an item actually carries.
{
  const tagged = new Map();
  for (const it of items) for (const t of (it.fm.tags || [])) { if (!tagged.has(t)) tagged.set(t, []); tagged.get(t).push(it); }
  const tagList = [...tagged.keys()].sort(byCode);
  addPage('/tags/', {
    title: 'Tags', summary: summaryOf('/tags/'), description: 'The tags the items of this node carry, and what each gathers.', section: null,
    jsonld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Tags', url: `${BASE}tags/` },
    body: `<p>A tag is a flat label an item carries in its own file; the allowed set is fixed in this node's configuration, and every item carries between two and five of them. Clusters, not tags, are what this site navigates by &#8212; a tag is the cheaper way to ask "what else is about this?".</p>
<ul>
${tagList.map(t => `<li><a href="/tags/${esc(t)}/"><code>${esc(t)}</code></a>: ${tagged.get(t).length} item${tagged.get(t).length === 1 ? '' : 's'}</li>`).join('\n')}
</ul>
`,
  });
  for (const t of tagList) {
    const list = tagged.get(t).slice().sort((a, b) => byCode(a.slug, b.slug));
    addPage(`/tags/${t}/`, {
      title: t, summary: `The ${list.length} item${list.length === 1 ? '' : 's'} of this node tagged ${t}.`, description: `Items of this node tagged ${t}.`, section: null,
      jsonld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: t, url: `${BASE}tags/${t}/` },
      body: `<ul>
${list.map(it => `<li><a href="${esc(it.url)}">${esc(it.fm.title)}</a>: ${esc(it.fm.description || it.fm.title)}</li>`).join('\n')}
</ul>
<p><a href="/tags/">All tags</a></p>
`,
    });
  }
}

// `/exports/` — the index of everything on this node a program reads, in plain words, plus the
// two additive files of the `llm-context` adapter, which are declared from the discovery
// document with a `related[]` link of relation `alternate` (AGSC-06-35).
const LLM_CONTEXT = [...ENGINE_BUILD.exports.keys()].sort();
for (const f of LLM_CONTEXT) put(`exports/${f}`, ENGINE_BUILD.exports.get(f));
{
  const rows = [
    ['/.well-known/knowledge-linkset', 'application/linkset+json', 'The one file to fetch first: it says what this node is, where its graph, ontology, skills and NOW page are, which nodes it peers with, and how to propose a change.'],
    ['/llms.txt', 'text/plain', 'The node in one page, for a model with a small context: a title, a provenance header and one line per item.'],
    ['/llms-full.txt', 'text/plain', 'The same, with every item\'s whole body.'],
    ['/search.json', 'application/json', 'The search index a page or an agent searches offline, the same bytes the engine emits.'],
    ['/graph.jsonld', 'application/ld+json', 'Every item as RDF, in JSON-LD.'],
    ['/graph.nq', 'application/n-quads', 'The same graph as N-Quads &#8212; the form its fingerprint is taken over.'],
    ['/graph.ttl', 'text/turtle', 'The same graph as Turtle, for a reader.'],
    ['/chunks.jsonl', 'application/jsonl', 'One line per passage, each with its digest, its item, its licence and its IRI: what a retrieval system indexes when it wants to cite what it found.'],
    ['/pages/&lt;slug&gt;.md', 'text/markdown', 'The source file of one item, exactly as it is stored.'],
    ['/pages/&lt;slug&gt;.jsonld', 'application/ld+json', 'One item as RDF, on its own.'],
    ['/skills/index.json', 'application/json', 'The skill packs and their digests.'],
    ['/boards/index.json', 'application/json', 'The live boards of this node. Each board is also a page, such as <a href="/boards/project-board/">the project board</a>, and a JSON file.'],
    ['/now.md', 'text/markdown', 'The state of this node at the last build.'],
    ['/ledger.jsonl', 'application/jsonl', 'The derived ledger: one hash-chained line per commit of this site\'s history and one for the build, re-verifiable offline. Its head is on the ledger link of the discovery document.'],
    ['/ns/context.jsonld', 'application/ld+json', 'The JSON-LD context the graph files use.'],
    ['/exports/chunks-index.toon', 'text/plain', 'The metadata of every passage in TOON tabular form &#8212; the same rows as <code>/chunks.jsonl</code> without the bodies, in about a quarter fewer tokens. Additive and non-normative.'],
    ['/exports/llms-ctx.txt', 'text/plain', 'A skim view: one labelled section per passage. It drops the digests, the licence and the IRIs on purpose, so anything that needs to cite goes back to <code>/chunks.jsonl</code>. Additive and non-normative.'],
    ['/robots.txt', 'text/plain', 'Who may crawl, and the text-and-data-mining reservation, in the crawler dialect.'],
    ['/.well-known/tdmrep.json', 'application/json', 'The same reservation, in the TDM dialect.'],
    ['/sitemap.xml', 'application/xml', 'Every page of this site.'],
  ];
  addPage('/exports/', {
    title: 'Machine-readable files', summary: summaryOf('/exports/'), description: 'Every machine-readable file this node publishes, what each is for, and which are additive.', section: null,
    jsonld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Machine-readable files', url: `${BASE}exports/` },
    wide: true,
    body: `<p>Everything a program needs from this node is a static file it can fetch without a key, an account or a request to anyone. Start at the discovery document; everything else is reachable from it. The two files under <code>/exports/</code> are <strong>additive</strong>: no rule pins their bytes, nothing depends on them, and they exist because they are cheaper to read than the files they are derived from.</p>
<div class="table-wrap" tabindex="0" role="region" aria-label="Machine-readable files"><table>
<thead><tr><th scope="col">File</th><th scope="col">Media type</th><th scope="col">What it is</th></tr></thead>
<tbody>
${rows.map(([r, t, w]) => `<tr><td><a href="${r.replace(/&lt;slug&gt;/, 'bundle')}"><code>${r}</code></a></td><td><code>${t}</code></td><td>${w}</td></tr>`).join('\n')}
</tbody></table></div>
<h2 id="in-the-page">Tools inside the page</h2>
<p>Every item page and every guide page of this site also offers seven tools to an assistant running in the visitor's browser: search, read, links, ask, compose, propose and remember. They read only the files above, contact no other host, carry no key and write nothing. <a href="/about/#tools-for-browser-assistants">How they work</a>, and <a href="/compose/">the page that uses them</a>.</p>
`,
  });
}

// search
const SECTIONS = [['Guide', r => r.startsWith('/docs/')], ['Specification', r => r.startsWith('/specs/')], ['Vocabulary and items', r => /^\/(concepts|procedures|clusters)\//.test(r)], ['Ontology', r => r.startsWith('/ns/')], ['Site', () => true]];
const siteIndexHtml = () => {
  const seen = new Set();
  return SECTIONS.map(([name, test]) => {
    const rs = routes.filter(r => !seen.has(r) && test(r) && r !== '/search/');
    rs.forEach(r => seen.add(r));
    return rs.length ? `<h2 id="index-${name.toLowerCase().replace(/[^a-z]+/g, '-')}">${esc(name)}</h2>\n<ul>\n${rs.sort(byCode).map(r => `<li><a href="${esc(r)}">${esc(pageTexts.get(r).title)}</a>: ${esc(pageTexts.get(r).summary)}</li>`).join('\n')}\n</ul>\n` : '';
  }).join('');
};
addPage('/search/', {
  title: 'Search', summary: summaryOf('/search/'), description: 'Search every page and every rule of AgenticSystemCore.com; the index is built with the site and nothing leaves the browser.', section: '/search/', script: '/assets/search.js',
  jsonld: { '@context': 'https://schema.org', '@type': 'WebPage', name: 'Search', url: `${BASE}search/` },
  body: `<div class="search" role="search" id="search-box" hidden><form class="search" id="search-form"><label for="q">Search pages and rules</label><input id="q" name="q" type="search" autocomplete="off" spellcheck="false"><button type="submit">Search</button></form></div>
<p id="search-status" role="status" aria-live="polite"></p>
<ol id="results"></ol>
<section id="site-index" aria-labelledby="index-heading">
<h2 id="index-heading">Every page of this site</h2>
${siteIndexHtml()}</section>
`,
});

// 404
put('404.html', page({ url: '/404.html', title: 'Page not found', summary: summaryOf('/404.html'), description: 'The requested page does not exist on this node.', section: null, body: `<p>There is no page at this address. Try the <a href="/">home page</a>, the <a href="/docs/">guide</a>, the <a href="/specs/">specification</a> or the <a href="/search/">search</a>.</p>\n` }).replace(`<link rel="canonical" href="${ORIGIN}/404.html">\n`, ''));

// site search index: every page, every H2 section, every rule and every error code
const textOf = html => unesc(html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
// An excerpt ends at the last whole word within its length, so no word — the author's name
// included — is ever cut in the middle.
const excerpt = (text, max) => (text.length <= max ? text : text.slice(0, text.lastIndexOf(' ', max) > 0 ? text.lastIndexOf(' ', max) : max));
const SITE_INDEX = [];
for (const [url, p] of pageTexts) {
  const main = p.html.slice(p.html.indexOf('<main'), p.html.indexOf('</main>'));
  SITE_INDEX.push({ kind: 'page', text: excerpt(textOf(main), 1200), title: p.title, url });
  for (const m of main.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>\n([\s\S]*?)(?=<h2 |$)/g)) if (!/^(contents|status-heading|plain|sources|members|index-)/.test(m[1])) SITE_INDEX.push({ kind: 'section', text: excerpt(textOf(m[3]), 400), title: `${p.title} › ${textOf(m[2])}`, url: `${url}#${m[1]}` });
  for (const m of main.matchAll(/<li id="(AGSC-\d{2}-\d{2,3}[a-z]?)" class="rule-item[^"]*">([\s\S]*?)<\/li>/g)) SITE_INDEX.push({ kind: 'rule', text: excerpt(textOf(m[2].replace(/<span class="trace">[\s\S]*?<\/span>/, '')).replace(/^AGSC-\S+\s*/, ''), 400), title: m[1], url: `${url}#${m[1]}` });
  for (const m of main.matchAll(/<tr id="(AGSC-E\d{3})"><td>[\s\S]*?<\/td><td>([\s\S]*?)<\/td>/g)) SITE_INDEX.push({ kind: 'error code', text: textOf(m[2]), title: m[1], url: `${url}#${m[1]}` });
}
SITE_INDEX.sort((a, b) => byCode(a.url, b.url) || byCode(a.title, b.title));
put('assets/search-site.json', JSON.stringify(SITE_INDEX) + '\n');

// machine files
// the RDF views are the ENGINE's. `/graph.nq` and `/graph.ttl` are new here; they are
// the same graph in the two other serialisations AGSC-06-01 names, and a reader that wants
// triples no longer has to parse JSON-LD to get them.
const GRAPH_BYTES = String(putEngine('/graph.jsonld'));
putEngine('/graph.nq');
putEngine('/graph.ttl');
const ENGINE_GRAPH = JSON.parse(GRAPH_BYTES);
// The chunk export of AGSC-06-26…31 and the skill packs of AGSC-07-19/07-20: new surfaces, and
// the engine's bytes exactly. `/now.md` is the machine half of the NOW page.
putEngine('/chunks.jsonl');
putEngine('/now.md');
if (LEDGER.fromEngine) putEngine('/ledger.jsonl'); else put('ledger.jsonl', LEDGER.bytes);
putEngine('/skills/index.json');
const SKILL_PACKS = [...ENGINE_BUILD.files.keys()].filter(r => /^\/skills\/[^/]+\/SKILL\.md$/.test(r)).sort();
for (const r of SKILL_PACKS) putEngine(r);
const BOARD_ROUTES = [...ENGINE_BUILD.files.keys()].filter(r => r.startsWith('/boards/')).sort();
for (const r of BOARD_ROUTES) putEngine(r);
// The board pages are the engine's bytes, so they are not in `routes` (the search index has no text
// of theirs); they are pages of this site all the same, so the sitemap lists them (AGSC-06-19).
const BOARD_PAGES = BOARD_ROUTES.filter(r => r.endsWith('/index.html')).map(r => r.slice(0, -'index.html'.length));
// AGSC-06-13a: both files are the ENGINE's bytes. This generator's own layout function — which
// `scripts/check.js` proves against the tagged vectors disc-0013 and disc-0014 on every run — is
// still produced and COMPARED, so the vector lane keeps meaning something: `/llms.txt` must be
// identical, and `/llms-full.txt` may differ ONLY by the blank line the engine keeps at the top of
// each fenced body, which is the leading newline of the item body it does not strip.
{
  const engineIndex = String(putEngine('/llms.txt'));
  if (engineIndex !== LLMS.index) die('llms.txt: the engine\'s bytes and this generator\'s differ');
  const engineFull = String(putEngine('/llms-full.txt'));
  if (engineFull !== LLMS.full && engineFull.replace(/(```text agsc-content\n)\n/g, '$1') !== LLMS.full) {
    die('llms-full.txt: the engine\'s bytes and this generator\'s differ by more than the leading blank line of a fenced body');
  }
}
// AGSC-06-16: the reader's index is the engine's, and this generator's own tokenizer — which is
// proved against the tagged vectors build-0001/0002/0003 on every build — must agree with it.
{
  const engineSearch = String(putEngine('/search.json'));
  if (engineSearch !== SEARCH_JSON) die('search.json: the engine\'s index and this generator\'s differ');
}
put('.well-known/knowledge-linkset', WELLKNOWN_BYTES);
put('.well-known/security.txt', SECURITY_TXT);
const TDM = [{ location: '/', 'tdm-reservation': 1 }];
put('.well-known/tdmrep.json', JSON.stringify(TDM) + '\n');
// AGSC-06-18: a node that publishes a text-and-data-mining reservation names
// the crawlers it reserves against, one blocked group per RFC 9309 product token, BEFORE the
// default group; everything not named — an assistant fetching a page for a person, a search
// crawler — stays invited by the default group. The tokens are the publisher's, in
// `site.tdm_crawlers[]`, never this generator's: each one verified on 2026-09-22 against
// the operator's own documentation. An empty list with a reservation published is a build error,
// because the published terms would then say something untrue.
const TDM_CRAWLERS = (config.site.tdm_crawlers || []).slice().sort();
if (TDM.some(r => r['tdm-reservation'] === 1) && TDM_CRAWLERS.length === 0) die('this node publishes a TDM reservation and site.tdm_crawlers[] names no crawler (AGSC-06-18, AGSC-E202)');
for (const t of TDM_CRAWLERS) if (!/^[A-Za-z0-9_.:\/-]{1,64}$/.test(t)) die(`site.tdm_crawlers[]: ${t} is not an RFC 9309 product token (AGSC-06-18)`);
const SIGNAL = 'Content-Signal: search=yes, ai-input=yes, ai-train=no';
const ROBOTS = [
  '# This node reserves text and data mining rights. The same policy is stated in',
  '# /.well-known/tdmrep.json, in the Content Use Terms at /legal/, and here.',
  '# Crawlers that collect material to train models: please do not.',
  '# Assistants fetching a page for a person, and search indexers: welcome.',
  '',
  ...TDM_CRAWLERS.flatMap(t => [`User-agent: ${t}`, SIGNAL, 'Disallow: /', '']),
  'User-agent: *',
  '# Content Signals Policy (contentsignals.org): the same policy as /.well-known/tdmrep.json and /legal/',
  SIGNAL,
  'Allow: /',
  '',
  `Sitemap: ${BASE}sitemap.xml`,
].join('\n') + '\n';
put('robots.txt', ROBOTS);
// AGSC-06-18: the dialects MUST agree; a divergence fails the build. At rc.6 the agreement also
// covers the named tokens: one `Disallow: /` group per token, which is what an engine-built node
// now emits, so the hand-written generator cannot fall behind it.
const blocked = [...ROBOTS.matchAll(/^User-agent: (.+)$\n[^\n]*\nDisallow: \/$/gm)].map(m => m[1]).sort();
if (blocked.join(',') !== TDM_CRAWLERS.join(',')) die(`robots.txt blocks ${blocked.join(', ') || 'nothing'} but site.tdm_crawlers[] names ${TDM_CRAWLERS.join(', ')} (AGSC-06-18)`);
if (!(/ai-train=no/.test(ROBOTS) && TDM.every(r => r['tdm-reservation'] === 1) && ENGINE_GRAPH['@graph'][0][ctxKey('schema:license')] === LICENSE_PROSE && LLMS.index.includes(`terms: ${TERMS_ID}`) && TERMS_TEXT.includes('text and data mining rights are expressly reserved'))) die('licence dialects diverge (AGSC-06-18)');
routes.sort(byCode);
put('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...routes, ...BOARD_PAGES].sort(byCode).map(r => `<url><loc>${esc(ORIGIN + r)}</loc><lastmod>${GENERATED_AT.slice(0, 10)}</lastmod></url>`).join('\n')}\n</urlset>\n`);

// _headers: ONE block per address. Cloudflare Pages merges blocks whose patterns differ, but when
// the same address is written twice it keeps only the later block, which once dropped the
// cross-origin headers of every machine file (AGSC-11-03); scripts/check.js refuses a repeated
// address. The machine routes a visiting agent — or this site's own page tools on another
// origin — may read cross-origin. `/pages/*` is on the list because it is what the `read` and
// `propose` page tools return (AGSC-06-02, AGSC-09-16). The files under `/exports/` are named
// one by one: a pattern `/exports/*` would also match the index page `/exports/`.
const EXPORT_FILES = LLM_CONTEXT.map(f => `/exports/${f}`);
const PUBLIC_ARTEFACT = ['/.well-known/knowledge-linkset', '/graph.jsonld', '/graph.nq', '/graph.ttl', '/llms.txt', '/llms-full.txt', '/search.json', '/pages/*.md', '/pages/*.jsonld', '/ns/*', '/chunks.jsonl', '/ledger.jsonl', '/now.md', '/skills/*', '/boards/*', ...EXPORT_FILES];
const HEADER_BLOCKS = new Map(); // address -> header lines, in the order they are written
const addHeaders = (route, ...lines) => { if (!HEADER_BLOCKS.has(route)) HEADER_BLOCKS.set(route, []); HEADER_BLOCKS.get(route).push(...lines); };
addHeaders('/*', 'X-Content-Type-Options: nosniff', 'X-Frame-Options: DENY', 'Referrer-Policy: strict-origin-when-cross-origin',
  "Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'Permissions-Policy: interest-cohort=()');
addHeaders('/', `Link: <${WELLKNOWN}>; rel="describedby"; type="application/linkset+json"`);
addHeaders('/.well-known/knowledge-linkset', `Content-Type: application/linkset+json; profile="${PROFILE}"`, `Link: <${PROFILE}>; rel="profile"`, 'Cache-Control: no-cache');
for (const [route, type, ...rest] of [
  ['/.well-known/tdmrep.json', 'application/json; charset=utf-8'],
  ['/.well-known/security.txt', 'text/plain; charset=utf-8'],
  ['/graph.jsonld', 'application/ld+json; charset=utf-8'],
  ['/search.json', 'application/json; charset=utf-8'],
  ['/pages/*.md', 'text/markdown; charset=utf-8; variant=GFM'],
  ['/pages/*.jsonld', 'application/ld+json; charset=utf-8'],
  ['/graph.nq', 'application/n-quads; charset=utf-8'],
  ['/graph.ttl', 'text/turtle; charset=utf-8'],
  ['/chunks.jsonl', 'application/jsonl; charset=utf-8'],
  ['/ledger.jsonl', 'application/jsonl', 'Cache-Control: no-cache'],
  ['/boards/*.json', 'application/json; charset=utf-8'],
  ['/now.md', 'text/markdown; charset=utf-8; variant=GFM', 'Cache-Control: no-cache'],
  ['/skills/index.json', 'application/json; charset=utf-8'],
  ['/skills/*.md', 'text/markdown; charset=utf-8; variant=GFM'],
  ...EXPORT_FILES.map(f => [f, 'text/plain; charset=utf-8']),
  ['/llms.txt', 'text/plain; charset=utf-8'],
  ['/llms-full.txt', 'text/plain; charset=utf-8'],
  ['/ns/*.ttl', 'text/turtle; charset=utf-8'],
  ['/ns/*.jsonld', 'application/ld+json; charset=utf-8'],
  ['/ns/*.rdf', 'application/rdf+xml; charset=utf-8'],
  ['/ns/*.nt', 'application/n-triples; charset=utf-8'],
  ['/ns/schema/*.json', 'application/json; charset=utf-8'],
]) addHeaders(route, `Content-Type: ${type}`, ...rest);
for (const route of PUBLIC_ARTEFACT) addHeaders(route, 'Access-Control-Allow-Origin: *', 'Access-Control-Expose-Headers: Link, ETag, Content-Type');
// The signed monthly sustainability report (draft-besleaga-sustainability-wellknown), written into
// static/ by the operator's report tool and republished byte for byte (static/README.md): a
// rebuild keeps it, and its header block is part of this file instead of being appended later.
const SUSTAINABILITY = path.join(ROOT, 'static', '.well-known', 'sustainability-data');
if (fs.existsSync(SUSTAINABILITY)) {
  put('.well-known/sustainability-data', fs.readFileSync(SUSTAINABILITY));
  addHeaders('/.well-known/sustainability-data', 'Content-Type: application/sustainability-data+json', 'Access-Control-Allow-Origin: *', 'Cache-Control: public, max-age=3600');
}
// The agent skill (site/agent-skill/): a SKILL.md in the Agent Skills format and its reference
// files, republished byte for byte under /agent-skill/ so that a person or an agent can install it
// with one download; the guide page /docs/agent-skill/ explains it. Each file is named one by one
// in _headers, as the /exports/ files are, because a pattern would also match a folder's index page.
const SKILL_FILES = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.md')) SKILL_FILES.push(path.relative(path.join(ROOT, 'site'), p).split(path.sep).join('/'));
  }
})(path.join(ROOT, 'site', 'agent-skill'));
if (!SKILL_FILES.includes('agent-skill/agentic-system-core/SKILL.md')) die('site/agent-skill/agentic-system-core/SKILL.md is missing');
// The engine repository carries the same skill in skills/agentic-system-core/ (its own test keeps
// the plugin copy equal). When the engine checkout beside this repository has it, the bytes must match.
for (const f of SKILL_FILES) {
  const engineCopy = path.join(ENGINE, 'skills', f.replace(/^agent-skill\//, ''));
  if (fs.existsSync(engineCopy) && !fs.readFileSync(engineCopy).equals(fs.readFileSync(path.join(ROOT, 'site', f)))) die(`site/${f} differs from the engine's skills/${f.replace(/^agent-skill\//, '')}: change both together`);
}
for (const f of SKILL_FILES) {
  const s = read(`site/${f}`);
  checkText(`site/${f}`, s);
  put(f, s);
  addHeaders(`/${f}`, 'Content-Type: text/markdown; charset=utf-8; variant=GFM', 'Access-Control-Allow-Origin: *', 'Access-Control-Expose-Headers: Link, ETag, Content-Type');
}
put('_headers', `# Generated by scripts/build.js — do not hand-edit (AGSC-06-04).\n${[...HEADER_BLOCKS].map(([route, lines]) => `${route}\n${lines.map(l => `  ${l}`).join('\n')}`).join('\n\n')}\n`);
// No entry for a section published in parts: a fragment such as `/specs/06-surfaces/#AGSC-06-22`
// never reaches the server, so nothing here could send it to `/specs/06-surfaces/page-2/`. Every
// link to a rule is derived from the rule index instead, and scripts/check.js refuses one that lands
// on the wrong page.
put('_redirects', `# Generated by scripts/build.js — do not hand-edit (AGSC-06-04).
# The 0.0.x discovery path (AGSC-06-17).
/.well-known/agentic-knowledge ${WELLKNOWN} 301
# Browsers and tools that ask for the classic icon address get the site's icon.
/favicon.ico /favicon.svg 301
`);

// assets
for (const f of ['assets/site.css', 'assets/search.js', 'favicon.svg']) { const s = read(`assets/${path.basename(f)}`); checkText(f, s); put(f, s); }
// The touch icon phones ask for at /apple-touch-icon.png, named by every page head: the icon of
// assets/favicon.svg drawn edge to edge (the phone rounds the corners itself) at 180 × 180 px,
// rendered once with a headless Chromium screenshot and stripped of its date chunks. Its bytes are
// an input, copied as they are.
put('apple-touch-icon.png', fs.readFileSync(path.join(ROOT, 'assets', 'apple-touch-icon.png')));
// The stylesheet is also the engine's default theme (src/distribution/theme.js), so every
// engine-built node looks like this site; the two copies must be the same bytes.
if (read('assets/site.css') !== engineTheme.stylesheet()) die('assets/site.css differs from the engine default theme (src/distribution/theme.js): change both together');
put('assets/theme.js', engineTheme.script());
for (const id of DIAGRAMS.keys()) if (!usedDiagrams.has(id)) die(`diagram ${id} is compiled but shown on no page`);

// ------------------------------------------------------------------ budgets and final checks, then write
// Quoted requirement text that names a forbidden framing in order to forbid it (rendered from the tagged PRD).
const ALLOWED_QUOTES = ['no Web4/crypto framing, book or &quot;companion&quot; strings', 'no Web4/crypto framing, book or \\"companion\\" strings', 'with no reading order imposed', 'no &quot;start here&quot; link and no imposed reading order', 'no \\"start here\\" link and no imposed reading order'];
for (const [p, c] of files) {
  const s = typeof c === 'string' ? c : null;
  if (s !== null) {
    if (s.normalize('NFC') !== s) die(`${p}: output not NFC (AGSC-E604)`);
    if (!s.endsWith('\n') || s.endsWith('\n\n')) die(`${p}: output must end with exactly one LF`);
    if (p.endsWith('.html') && Buffer.byteLength(s) > 100 * 1000) die(`${p}: ${Buffer.byteLength(s)} bytes exceeds the 100 KB page budget (AGSC-06-21; KB is decimal)`);
    // AGSC-06-21: ≤1 MB per index document, and `/search.json` carries the docs
    // of at most 500 items before it becomes a manifest over `/search-<nn>.json` shards.
    if (p === 'search.json') {
      if (Buffer.byteLength(s) > 1000 * 1000) die(`search.json: ${Buffer.byteLength(s)} bytes exceeds the 1 MB index-document budget (AGSC-06-21)`);
      if (items.length > 500) die(`search.json: ${items.length} items — the index must be sharded above 500 (AGSC-06-21, AGSC-06-31)`);
    }
    const t = ALLOWED_QUOTES.reduce((x, q) => x.split(q).join(''), s);
    const hit = /wiley|companion|chapter \d|reading order/i.exec(t);
    // The specification's own clean-room rule names the framings it forbids, so spec pages and the
    // search index derived from them (every other page in it is checked on its own) are exempt.
    if (hit && !p.startsWith('specs/') && p !== 'assets/search-site.json') die(`${p}: forbidden framing string (AGSC-06-03): …${t.slice(Math.max(0, hit.index - 60), hit.index + 40)}…`);
  }
}
const tmp = OUT + '.tmp-' + process.pid;
fs.rmSync(tmp, { recursive: true, force: true });
for (const [p, c] of [...files].sort((a, b) => byCode(a[0], b[0]))) {
  const f = path.join(tmp, p);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, c);
}
fs.rmSync(OUT, { recursive: true, force: true });
fs.renameSync(tmp, OUT);
if (RULES_WITHOUT_TRACE.length) process.stdout.write(`build: rules without a trailing trace bracket in the source: ${RULES_WITHOUT_TRACE.join(', ')}\n`);
process.stdout.write(`build: ${files.size} files, ${routes.length} pages, ${items.length} items, ${DIAGRAMS.size} diagrams, spec ${SPEC_VERSION} from ${SPEC_SOURCE === 'tag' ? `tag ${SPEC_TAG}` : `the WORKING TREE of ${path.basename(ENGINE)} (${SPEC_TAG} is not tagged yet)`}, generated_at ${GENERATED_AT} -> ${path.relative(ROOT, OUT) || '.'}\n`);
