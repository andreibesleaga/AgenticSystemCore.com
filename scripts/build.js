#!/usr/bin/env node
// Site generator for AgenticSystemCore.com — a Level-0 node of its own specification
// (AGSC-10-02). Throwaway by design: the engine's writer replaces it at site v0.1.
// Node >= 22 stdlib only. Deterministic: every instant derives from SOURCE_DATE_EPOCH,
// every listing is sorted, and the normative inputs (spec/, docs/, features/, ontology/agsc.ttl,
// LICENSE-CONTENT) are read from the engine repository's release tag, never from its
// working tree, so the site publishes exactly the tagged standard.
//
//   node scripts/build.js [--out <dir>]      (default: www)
//   SOURCE_DATE_EPOCH=<seconds> node scripts/build.js
//   AGSC_ENGINE=<path> AGSC_SPEC_TAG=<tag>   (defaults: ../agentic-system-core, 1.0.0-rc.5)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), cp = require('child_process');
const { compile: compileDiagram } = require('./diagram.js');

const ROOT = path.resolve(__dirname, '..');
const ENGINE = path.resolve(ROOT, process.env.AGSC_ENGINE || '../agentic-system-core');
const SPEC_TAG = process.env.AGSC_SPEC_TAG || '1.0.0-rc.5';
// Output directory: `build.out` of agsc.config.json. It is `www-next` until launch so that the
// repository can be pushed without Cloudflare Pages publishing the new site (Pages serves `www/`);
// at launch the owner sets `build.out` to `www` (runbook §1a).
const CONFIG_OUT = (JSON.parse(fs.readFileSync(path.join(ROOT, 'agsc.config.json'), 'utf8')).build || {}).out || 'www';
const OUT = path.resolve(ROOT, (() => { const i = process.argv.indexOf('--out'); return i > 0 ? process.argv[i + 1] : CONFIG_OUT; })());

// Status of the external steps. Update these, rebuild and redeploy after each step (the
// owner's filing runbook, status-refresh section). Never write "registered" before the IANA
// registry shows the entry (AGSC-06-07), and never a DOI before it resolves.
const STATUS = {
  wellknown: 'not-requested',   // not-requested | requested | registered
  profile: 'not-filed',         // not-filed | filed | registered
  draft: null,                  // e.g. 'draft-besleaga-agentic-knowledge-wellknown-00' once posted
  w3id: false,                  // true once the w3id.org namespace redirects are live
  preprint: null,               // e.g. { doi: '10.5281/zenodo.NNNNNNN', title: '…', date: 'YYYY-MM-DD' } once published
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
const engineFile = p => { try { return git('show', `${SPEC_TAG}:${p}`); } catch { die(`cannot read ${p} at tag ${SPEC_TAG} in ${ENGINE}`); } };
const checkText = (name, s) => {
  if (s.includes('\r')) die(`${name}: CR found (LF only, AGSC-01-14)`);
  if (s.normalize('NFC') !== s) die(`${name}: not NFC (AGSC-01-14)`);
  if (s.charCodeAt(0) === 0xFEFF) die(`${name}: BOM`);
};
const stripH1 = s => s.replace(/^# .*\n+/, '');
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
  return Number(git('log', '-1', '--format=%ct', SPEC_TAG).trim()); // the tagged specification's commit instant
})();
const iso = s => new Date(s * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
const GENERATED_AT = iso(EPOCH);
const SPEC_DATE = iso(Number(git('log', '-1', '--format=%ct', SPEC_TAG).trim())).slice(0, 10);

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
let RULE_INDEX = new Map(); // rule id or error code -> spec page slug
let REQ_IDS = new Set();    // PRD-nnn / NFR-nn ids that the requirements page defines
const RULES_WITHOUT_TRACE = []; // rules whose source carries no trailing trace bracket (reported at the end)
// Rules and codes drafted for the next release candidate in the engine working tree: the guide may cite
// them, rendered unlinked and marked, until the owner tags the next candidate and AGSC_SPEC_TAG moves
// (then empty this set again). Emptied when rc.4 was tagged and published: every identifier drafted for
// it is now in the published specification.
const PENDING_RULES = new Set();
const PENDING_REQS = new Set();
function idTarget(code, o) {
  if (!/^AGSC-(?:\d{2}-\d{2,3}[a-z]?|E\d{3})$/.test(code) || !RULE_INDEX.has(code)) return null;
  const page = RULE_INDEX.get(code);
  return page === o.page ? `#${code}` : `/specs/${page}/#${code}`;
}
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
          out += `<a href="${esc(url)}">${mdInline(s.slice(i + 1, close), { ...o, inLink: true })}</a>`;
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
// The trailing traceability record of a rule: "[PRD-002 ← D41, G04, research/16 §3.3]". It is
// rendered as a separate small line (class trace) so that the rule sentence reads on its own.
// Since rc.5 a rule may close with an italic amendment note after its bracket — "[…] *(trace
// corrected at rc.5, …)*" — so the note is allowed to follow and is kept where the author put it.
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
        const retired = isRule && /^\*\*AGSC-[^*]+\*\*\s*\*\(retired at/.test(first);
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
  return `<figure class="diagram">\n${d.svg}\n<figcaption>${esc(d.caption)}</figcaption>\n</figure>\n`;
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
// The forges the "Propose an edit" links point at. The site's own repository is the contribution
// target declared in `contribute[]`; the specification pages are generated from the engine
// repository's files, so they link there (AGSC-11-14 names the channel, not the link).
const FORGE = {
  site: (config.contribute || []).find(c => c.mode === 'pr') ? config.contribute.find(c => c.mode === 'pr').target.replace(/\/$/, '') : null,
  engine: 'https://github.com/andreibesleaga/agentic-system-core',
};
if (!FORGE.site) die('agsc.config.json: contribute[] needs one entry with mode "pr" (AGSC-11-14)');

// rc.5 configuration guards, against schema/config.schema.json at the tag.
// `build.feed` and `build.rdfxml` are RESERVED names of 1.1 and are rejected (AGSC-06-01, AGSC-01-18, R-15).
for (const k of Object.keys(config.build || {})) if (k !== 'out') die(`agsc.config.json: build.${k} is a reserved name, AGSC-E004 (withdrawn at rc.5)`);
const PEERS = config.peers || [];
const PEER_RE = /^https:\/\/[^\x00-\x20/?#]+(?:\/[^\x00-\x20/?#]+)*\/\.well-known\/knowledge-linkset$/;
for (const p of PEERS) if (!PEER_RE.test(p)) die(`agsc.config.json: peers[] entry is not a canonical well-known URL: ${p} (AGSC-10-12)`);
if (new Set(PEERS).size !== PEERS.length) die('agsc.config.json: peers[] must be unique (AGSC-10-12)');
const CONTRIBUTE = config.contribute || [];
for (const c of CONTRIBUTE) {
  if (!['pr', 'channel', 'form'].includes(c.mode)) die(`agsc.config.json: contribute[].mode ${c.mode} (AGSC-E209, AGSC-11-14)`);
  const okTarget = c.mode === 'channel' ? /^(mailto:[^\x00-\x20]+|urn:agsc:channel:[a-z0-9-]+)$/.test(c.target) : /^https:\/\/[^\x00-\x20]+$/.test(c.target);
  if (!okTarget) die(`agsc.config.json: contribute[].target ${c.target} does not match mode ${c.mode} (AGSC-E209, AGSC-11-14)`);
  for (const k of Object.keys(c)) if (!['mode', 'target', 'channel'].includes(k)) die(`agsc.config.json: contribute[].${k} is not a member of this site's configuration`);
}
// AGSC-02-24 as amended at rc.5: an authored single-line string carries no C0 control, U+007F,
// U+0085, U+2028 or U+2029, because a writer puts it on a line of a line-oriented text surface.
const BAD_LINE_CP = c => c <= 0x1f || c === 0x7f || c === 0x85 || c === 0x2028 || c === 0x2029;
const singleLine = (where, v) => { if (typeof v === 'string') for (const ch of v) if (BAD_LINE_CP(ch.codePointAt(0))) die(`${where}: U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} is a control character or line separator in a single-line string (AGSC-E204, AGSC-02-24 at rc.5)`); return v; };
for (const [k, v] of Object.entries(config.site)) singleLine(`agsc.config.json: site.${k}`, v);
for (const [k, v] of Object.entries(config.bundle)) singleLine(`agsc.config.json: bundle.${k}`, v);

const index = splitFrontmatter(read('content/index.md'), 'content/index.md');
for (const k of ['spec_version', 'okf_version', 'title', 'description', 'base']) if (!index.fm[k]) die(`content/index.md: ${k} missing (AGSC-01-04)`);
if (index.fm.type !== undefined) die('content/index.md must not carry type (AGSC-01-04)');
if (index.fm.base.replace(/\/?$/, '/') !== BASE) die('content/index.md base must equal site.base (AGSC-E204)');
if (index.fm.spec_version !== SPEC_VERSION) die('spec_version differs between content/index.md and agsc.config.json (AGSC-00-17)');

const SPEC_FILES = git('ls-tree', '--name-only', `${SPEC_TAG}:spec`).split('\n').filter(f => /^\d{2}-[a-z0-9-]+\.md$/.test(f)).sort();
const declared = (engineFile('spec/00-overview.md').match(/`spec_version: "([^"]+)"`/) || [])[1];
if (declared !== SPEC_VERSION) die(`tag ${SPEC_TAG} declares spec_version ${declared}, config says ${SPEC_VERSION}`);

// No authored page may name a release candidate other than the one being published: a stale
// literal is how a site restates a version it no longer builds (AGSC-00-17).
{
  const walkSrc = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walkSrc(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of [...walkSrc(path.join(ROOT, 'site')), ...walkSrc(path.join(ROOT, 'content'))].filter(f => /\.(md|json)$/.test(f)).sort()) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/\b1\.0\.0-rc\.\d+\b/g)) {
      if (m[0] !== SPEC_VERSION) die(`${path.relative(ROOT, f)}: names ${m[0]} while this build publishes ${SPEC_VERSION} (AGSC-00-17)`);
    }
  }
}

const PLURAL = { concept: 'concepts', episode: 'episodes', procedure: 'procedures', lesson: 'lessons', cluster: 'clusters', gate: 'gates' };
const KINDS = new Set(['pattern', 'taxonomy', 'explainer', 'principle', 'decision', 'spec', 'task', 'term', 'architecture']);
const cp_len = s => [...s].length;
const items = [];
for (const [type, plural] of Object.entries(PLURAL)) {
  const dir = path.join(ROOT, 'content', plural);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort()) {
    const rel = `content/${plural}/${f}`, slug = f.slice(0, -3);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || cp_len(slug) > 64) die(`${rel}: slug grammar (AGSC-01-10)`);
    const { fm, body } = splitFrontmatter(read(rel), rel);
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
    for (const k of Object.keys(fm)) if (!['type', 'title', 'description', 'kind', 'tags', 'clusters', 'prov', 'sources', 'when'].includes(k)) die(`${rel}: key ${k} not used by this site`);
    items.push({ type, plural, slug, fm, body, rel, iri: `${BASE}${plural}/${slug}/`, url: `/${plural}/${slug}/` });
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
const onto = parseTurtle(TTL);
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const OWL = 'http://www.w3.org/2002/07/owl#', RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const ONTOLOGY_IRI = 'https://w3id.org/agentic-system-core/ns';
const tri = (s, p) => onto.triples.filter(t => t.s === s && t.p === p).map(t => t.o);
const one = (s, p) => (tri(s, p)[0] || {}).v;
const VERSION_INFO = one(ONTOLOGY_IRI, OWL + 'versionInfo');
if (!VERSION_INFO) die('ontology: owl:versionInfo missing (AGSC-05-25)');
const ascSubjects = [...new Set(onto.triples.map(t => t.s))].filter(s => s.startsWith(NS)).sort(byCode);
const kindOf = s => { const ts = tri(s, RDF_TYPE).map(o => o.v); return ts.includes(OWL + 'Class') ? 'class' : ts.includes(OWL + 'ObjectProperty') ? 'object' : ts.includes(OWL + 'DatatypeProperty') ? 'datatype' : 'other'; };

const ntTerm = o => {
  const escLit = v => v.replace(/[\\"\n\r\t]|[\x00-\x1f]/g, c => ({ '\\': '\\\\', '"': '\\"', '\n': '\\n', '\r': '\\r', '\t': '\\t' }[c] || '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')));
  if (o.t === 'iri') return `<${o.v}>`;
  if (o.lang) return `"${escLit(o.v)}"@${o.lang}`;
  return `"${escLit(o.v)}"^^<${o.dt || XSD + 'string'}>`; // AGSC-05-31: plain literals carry xsd:string explicitly in N-Triples/N-Quads
};
const NT = [...new Set(onto.triples.map(t => `<${t.s}> <${t.p}> ${ntTerm(t.o)} .`))].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))).join('\n') + '\n';

const RDFXML_NS = { asc: NS, dcterms: 'http://purl.org/dc/terms/', owl: OWL, prov: 'http://www.w3.org/ns/prov#', rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', rdfs: RDFS, skos: 'http://www.w3.org/2004/02/skos/core#', xsd: XSD };
const qname = iri => { for (const [p, ns] of Object.entries(RDFXML_NS)) if (iri.startsWith(ns) && /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(iri.slice(ns.length))) return `${p}:${iri.slice(ns.length)}`; die(`rdf/xml: no QName for ${iri}`); };
const RDFXML = (() => {
  const subs = [...new Set(onto.triples.map(t => t.s))].sort(byCode);
  let x = '<?xml version="1.0" encoding="utf-8"?>\n<rdf:RDF\n' + Object.entries(RDFXML_NS).map(([p, ns]) => `  xmlns:${p}="${esc(ns)}"`).join('\n') + '>\n';
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
// its compact IRI (DS-7 default for finding F5; the specification does not pin term names).
const EXTERNAL = [
  ['rdfs:seeAlso', '@id'], ['skos:prefLabel', null], ['skos:altLabel', null], ['skos:definition', null],
  ['skos:inScheme', '@id'], ['skos:member', '@id'], ['skos:broader', '@id'], ['skos:narrower', '@id'], ['skos:related', '@id'],
  ['dcterms:requires', '@id'], ['dcterms:isRequiredBy', '@id'], ['dcterms:replaces', '@id'], ['dcterms:isReplacedBy', '@id'],
  ['dcterms:source', null], ['dcterms:title', null], ['dcterms:creator', null], ['dcterms:date', null], ['dcterms:format', null],
  // rc.5 amendments (2026-09-21, NS-07): AGSC-05-26 gained `dcterms:created` and
  // `dcterms:modified` as `xsd:dateTime` (V8-91/R-06), and AGSC-05-31(c) makes
  // `schema:usageInfo` a literal, not an IRI (V9A-02). These three rows lagged, so
  // this context and the engine's could not be the byte-identical copy AGSC-05-09
  // asks for.
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
const GRAPH = (() => {
  const lit = v => ({ '@language': 'en', '@value': v });
  const single = a => a.length === 1 ? a[0] : a;
  const nodes = [{
    '@id': BASE, '@type': 'Bundle', specVersion: SPEC_VERSION,
    // AGSC-05-26 / AGSC-06-18 as amended at rc.5: `schema:usageInfo` carries the
    // Content Use Terms IDENTIFIER as an `xsd:string` literal, not a link to the
    // page that prints the terms — "a LicenseRef- or SPDX identifier is text, not
    // an IRI" (2026-09-21, NS-07).
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
  }
  nodes.sort((a, b) => byCode(a['@id'], b['@id']));
  return { '@context': CONTEXT_URL, '@graph': nodes };
})();

// ------------------------------------------------------------------ llms.txt and llms-full.txt (AGSC-06-13a)
const LLMS = require('./llms.js')({
  title: config.site.title, base: BASE, description: index.fm.description, license_prose: LICENSE_PROSE, terms: TERMS_ID,
  spec_version: SPEC_VERSION, generated_at: GENERATED_AT,
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

// ------------------------------------------------------------------ the discovery document (AGSC-06-07…10, 06-08a, 11-16)
const WELLKNOWN_DOC = {
  linkset: [{
    anchor: BASE,
    alternate: [{ href: `${BASE}llms.txt`, type: 'text/plain' }],
    describedby: [{ href: `${BASE}graph.jsonld`, type: 'application/ld+json' }],
    license: [{ href: `${BASE}legal/` }],
    'service-doc': [{ href: `${BASE}specs/` }],
    [`${REL}context`]: [{ href: `${BASE}ns/context.jsonld`, type: 'application/ld+json' }],
    [`${REL}ontology`]: [{ href: `${BASE}ns/agsc.ttl`, type: 'text/turtle' }],
    [`${REL}surface`]: [{ 'agsc-access': ['none'], 'agsc-surface': ['llms-txt'], href: `${BASE}llms.txt` }],
    // One `…/rel#contribute` link per `contribute[]` entry, carrying the mode (AGSC-11-14).
    ...(CONTRIBUTE.length ? { [`${REL}contribute`]: CONTRIBUTE.map(c => ({ 'agsc-contribute-mode': [c.mode], href: c.target })).sort((a, b) => byCode(a.href, b.href)) } : {}),
    // One `…/rel#peer` link per `peers[]` entry: another node's canonical well-known URL, for the
    // mutual-conformance check of AGSC-10-12.
    ...(PEERS.length ? { [`${REL}peer`]: [...PEERS].sort(byCode).map(href => ({ href, type: 'application/linkset+json' })) } : {}),
  }],
};
const WELLKNOWN_BYTES = jcs(WELLKNOWN_DOC) + '\n';

// ------------------------------------------------------------------ specification pages and the tagged documents
const specPages = SPEC_FILES.map(f => {
  const src = engineFile(`spec/${f}`);
  checkText(`spec/${f}`, src);
  const slug = f.slice(0, -3);
  const h1 = (/^# (.*)$/m.exec(src) || [])[1] || slug;
  return { file: f, slug, src, h1, url: `/specs/${slug}/` };
});
RULE_INDEX = new Map();
for (const p of specPages) {
  for (const m of p.src.matchAll(/^\s*- \*\*(AGSC-\d{2}-\d{2,3}[a-z]?)\*\*/gm)) if (!RULE_INDEX.has(m[1])) RULE_INDEX.set(m[1], p.slug);
  for (const m of p.src.matchAll(/^\| `(AGSC-E\d{3})` \|/gm)) if (!RULE_INDEX.has(m[1])) RULE_INDEX.set(m[1], p.slug);
}
const DOC = {}; // tagged documents rendered on the guide pages
for (const [k, f] of Object.entries({ prd: 'docs/PRD.md', glossary: 'docs/GLOSSARY.md', related: 'docs/RELATED-WORK.md', crosswalk: 'docs/COMPLIANCE-CROSSWALK.md', security: 'docs/SECURITY-CONSIDERATIONS.md', specIndex: 'docs/SPEC.md', featuresReadme: 'features/README.md' })) { DOC[k] = engineFile(f); checkText(f, DOC[k]); }
for (const m of DOC.prd.matchAll(/^\| \*{0,2}((?:PRD-\d{3}|NFR-\d{2}))\b/gm)) REQ_IDS.add(m[1]);
const FEATURES = git('ls-tree', '--name-only', `${SPEC_TAG}:features`).split('\n').filter(f => f.endsWith('.feature')).sort().map(f => ({ name: f.slice(0, -8), src: engineFile(`features/${f}`) }));
const PLAIN = Object.fromEntries(specPages.map(p => [p.slug, engineFile(`docs/plain/${p.slug}.md`)]));
const SPEC_DIAGRAM = { '00-overview': 'spec-00-conformance', '01-bundle': 'spec-01-bundle', '02-item': 'spec-02-item', '03-links': 'spec-03-links', '04-canonicalization': 'spec-04-canonicalization', '05-graph': 'spec-05-graph', '06-surfaces': 'spec-06-surfaces', '07-composition': 'spec-07-composition', '08-governance': 'spec-08-governance', '09-conformance': 'spec-09-conformance', '10-implementation-profiles': 'spec-10-profiles', '11-boundary': 'spec-11-boundary' };

// ------------------------------------------------------------------ HTML layout
const NAV = [['/docs/', 'Guide'], ['/specs/', 'Specification'], ['/concepts/', 'Vocabulary'], ['/ns/', 'Ontology'], ['/specs/agentic-knowledge/', 'Discovery'], ['/docs/standards/', 'Standards'], ['/about/', 'About'], ['/search/', 'Search']];
const summaryOf = url => { const s = SUMMARIES[url]; if (!s) die(`no summary for ${url} (site/summaries.json)`); return s; };
function page({ url, title, heading, summary, description, body, jsonld, section, wide, script }) {
  const canonical = ORIGIN + url;
  if (!summary || cp_len(summary) < 20) die(`${url}: summary missing`);
  const ld = jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>\n` : '';
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
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="${url === '/' ? 'website' : 'article'}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
${ld}${script ? `<script src="${esc(script)}" defer></script>\n` : ''}</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site">
<nav aria-label="Site">
<a class="brand" href="/"${url === '/' ? ' aria-current="page"' : ''}>${esc(config.site.title)}</a>
<ul>
${NAV.map(([h, t]) => `<li><a href="${h}"${section === h ? ' aria-current="page"' : ''}>${t}</a></li>`).join('\n')}
</ul>
</nav>
</header>
<main id="main"${wide ? ' class="wide"' : ''}>
<h1>${heading || esc(title)}</h1>
<p class="summary"><strong>Summary</strong>${esc(summary)}</p>
${body}</main>
<footer class="site">
<p>Prose: <a href="/legal/#content-use-terms">Content Use Terms 1.0</a>. Schemas, ontology, identifiers and the discovery document: CC0 1.0. Specification text: Apache License 2.0.</p>
<p><a href="/legal/">Legal and privacy</a> · <a href="/docs/compliance/">Compliance and security</a> · <a href="/docs/status/">Status</a> · <a href="${WELLKNOWN}">Discovery document</a> · <a href="/llms.txt">llms.txt</a> · <a rel="me" href="https://orcid.org/0009-0001-3464-5283">ORCID 0009-0001-3464-5283</a></p>
</footer>
</body>
</html>
`;
}
const ORIGIN_TEXT = { human: 'Written by a person', 'ai-assisted': 'Written with AI assistance and reviewed by the operator', 'ai-generated': 'Generated by a model and published by the operator', imported: 'Imported from another source' };
const itemMeta = it => {
  const parts = [`<dt>Type</dt><dd>${esc(it.type)}${it.fm.kind ? ` · kind <code>${esc(it.fm.kind)}</code>` : ''}</dd>`];
  if ((it.fm.clusters || []).length) parts.push(`<dt>Cluster</dt><dd>${it.fm.clusters.map(c => `<a href="${bySlug.get(c).url}">${esc(bySlug.get(c).fm.title)}</a>`).join(', ')}</dd>`);
  parts.push(`<dt>IRI</dt><dd><code>${esc(it.iri)}</code></dd>`);
  parts.push(`<dt>Provenance</dt><dd>${esc(ORIGIN_TEXT[it.fm.prov.origin])} (origin <code>${esc(it.fm.prov.origin)}</code>, operator <code>${esc(it.fm.prov.operator)}</code>)</dd>`);
  return `<dl class="meta">\n${parts.join('\n')}\n</dl>\n`;
};
const sourcesList = it => (it.fm.sources || []).length ? `<h2 id="sources">Sources</h2>\n<ol class="sources">\n${it.fm.sources.map((s, k) => `<li id="source-${k + 1}"><a href="${esc(s.resource.startsWith(BASE) ? '/' + s.resource.slice(BASE.length) : s.resource)}">${esc(s.title || s.resource)}</a>${s.grade ? ` <span class="grade">(${esc(s.grade)})</span>` : ''}</li>`).join('\n')}\n</ol>\n` : '';
const statusBlock = () => `<section class="status" aria-labelledby="status-heading">
<h2 id="status-heading">Status of this document</h2>
<p>Specification <code>${esc(SPEC_VERSION)}</code>, a release candidate tagged on ${esc(SPEC_DATE)}. It is an independent specification: it is not a standard of the IETF, the W3C or any other body, and no body has endorsed it. Released sections are immutable; a correction ships as a new version.</p>
</section>
`;
// "Propose an edit": a plain link to the forge's edit-in-browser view of the page's own source
// file. No script and no form (the CSP sets form-action 'none'): the forge opens its editor, and
// a submitted change becomes a pull request that a person reviews and merges — the Proposal route
// of AGSC-08-03/AGSC-11-14, which is the contribution channel this node declares.
const editLink = (repo, file) => `<p class="edit"><a rel="noopener" href="${esc(`${FORGE[repo]}/edit/main/${file}`)}">Propose an edit</a> — opens <code>${esc(file)}</code>${repo === 'engine' ? ' in the specification repository' : ''}; a submitted change becomes a pull request a person reviews.</p>\n`;

const regText = {
  wellknown: { 'not-requested': 'Not yet requested. The suffix <code>knowledge-linkset</code> will be requested for the Well-Known URIs registry (RFC 8615) through an Internet-Draft; it is not registered.', requested: 'Requested for the Well-Known URIs registry (RFC 8615); not yet registered.', registered: 'Registered in the Well-Known URIs registry (RFC 8615).' }[STATUS.wellknown],
  profile: { 'not-filed': 'Not yet filed in the Profile URIs registry (RFC 7284).', filed: 'Filed in the Profile URIs registry (RFC 7284); not yet registered.', registered: 'Registered in the Profile URIs registry (RFC 7284).' }[STATUS.profile],
  draft: STATUS.draft ? `<a href="https://datatracker.ietf.org/doc/${esc(STATUS.draft.replace(/-\d{2}$/, ''))}/"><code>${esc(STATUS.draft)}</code></a>` : 'Not yet posted.',
  w3id: STATUS.w3id ? 'The namespace <code>https://w3id.org/agentic-system-core/</code> resolves.' : 'The namespace <code>https://w3id.org/agentic-system-core/</code> does not resolve yet; the pull request to w3id.org has not been opened.',
  preprint: STATUS.preprint ? `Published: <a href="https://doi.org/${esc(STATUS.preprint.doi)}">${esc(STATUS.preprint.title)}</a> (${esc(STATUS.preprint.date)}), DOI <code>${esc(STATUS.preprint.doi)}</code>.` : 'In preparation; not yet published.',
};

// ------------------------------------------------------------------ outputs
const files = new Map(); // relative path -> string | Buffer
const put = (p, content) => { if (files.has(p)) die(`duplicate output ${p}`); files.set(p, content); };
const routes = []; // HTML routes for the sitemap
const pageTexts = new Map(); // url -> { title, html } for the site search index

function addPage(url, opts) { const html = page({ url, ...opts }); put(url.replace(/^\//, '') + 'index.html', html); routes.push(url); pageTexts.set(url, { title: opts.title, summary: opts.summary, html }); }

// home
const MODE_CARDS = [
  ['Auto-wiki', 'Markdown in, a checked and linked website out; no model needed.', '/docs/modes/#mode-0-the-automatic-self-correcting-wiki'],
  ['Distributed agentic memory', 'Agents read, cite and propose; people ratify; nodes peer with each other.', '/docs/modes/#mode-1-distributed-agentic-memory'],
  ['Live specifications', 'A project\'s decisions, specs, tasks and gates as one governed memory.', '/docs/modes/#mode-2-live-specifications-and-the-memory-of-a-software-project'],
  ['Evolving skills', 'Procedures become skill packs; improved skills come back as Procedures.', '/docs/modes/#mode-3-the-evolving-skills-library'],
  ['Runnable knowledge', 'Select Concepts, get a Harness of seven files a runtime can execute.', '/docs/modes/#mode-4-runnable-knowledge'],
  ['The live board', 'Agents and people pull, claim and finish a project\'s tasks on one shared board until it is done.', '/docs/modes/#mode-5-the-live-board-self-driving-product-and-project-management'],
];
addPage('/', {
  title: config.site.title, summary: summaryOf('/'), description: index.fm.description, section: null,
  jsonld: { '@context': 'https://schema.org', '@type': 'WebSite', name: config.site.title, url: BASE, description: index.fm.description, author: { '@type': 'Person', name: config.site.author, sameAs: ['https://orcid.org/0009-0001-3464-5283'] } },
  body: `<p class="tagline">${esc(config.site.tagline)}</p>
${md(index.body)}<h2 id="what-you-can-do">What you can do with it</h2>
<ul class="modes">
${MODE_CARDS.map(([t, d, h]) => `<li><strong><a href="${h}">${esc(t)}</a></strong>${esc(d)}</li>`).join('\n')}
</ul>
<p>One folder of files, one format, six ways of using it. The <a href="/docs/modes/">six modes</a> explain each; the <a href="/docs/introduction/">introduction</a> says what is new.</p>
${figure('system-overview')}<h2 id="this-site">This site is a node of itself</h2>
<p>Everything published here follows the rules it publishes. The vocabulary items, the discovery document, the graph and the agent-facing text file are the Level-0 form of the specification, and the <a href="/docs/status/">status page</a> says which further parts are live.</p>
<h2 id="start">Where to start</h2>
<ul>
<li><strong>People:</strong> the <a href="/docs/">guide</a>, then the <a href="/specs/">specification</a> and the <a href="/concepts/">vocabulary</a>.</li>
<li><strong>Architects and implementers:</strong> the <a href="/docs/architecture/">architecture</a>, the <a href="/docs/requirements/">requirements</a>, the <a href="/specs/agentic-knowledge/">discovery profile</a> and the <a href="/ns/">ontology</a>.</li>
<li><strong>Agents:</strong> <a href="${WELLKNOWN}"><code>${WELLKNOWN}</code></a> or <a href="/llms.txt"><code>/llms.txt</code></a>.</li>
<li><strong>Publishers:</strong> <a href="/procedures/publish-a-level-0-node/">publish a Level-0 node</a> from any CMS or wiki export.</li>
</ul>
${editLink('site', 'content/index.md')}`,
});

// specification index and sections
addPage('/specs/', {
  title: 'Specification', summary: summaryOf('/specs/'), description: `The AgenticSystemCore specification ${SPEC_VERSION}: twelve sections, the discovery profile and the conformance levels.`, section: '/specs/',
  jsonld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'AgenticSystemCore specification', url: `${BASE}specs/`, version: SPEC_VERSION },
  body: `${statusBlock()}<p>New to the notation? Read <a href="/docs/reading-the-specification/">how to read the specification</a> first: it explains the rule identifiers, the key words and the small bracketed references. Each section below opens with a summary, a plain-language box and a diagram before the normative text.</p>
<h2 id="sections">Sections</h2>
<ol class="index" start="0">
${specPages.map(p => `<li><a href="${p.url}">${esc(p.h1.replace(/^AGSC-\d{2} — /, ''))}</a> <span class="id">AGSC-${p.slug.slice(0, 2)}</span><br><span class="snippet">${esc(summaryOf(p.url))}</span></li>`).join('\n')}
</ol>
<h2 id="profile">Discovery profile</h2>
<p><a href="/specs/agentic-knowledge/">The knowledge link set profile</a> documents the discovery document that every node serves at <code>${WELLKNOWN}</code>.</p>
<h2 id="mcp-extension">MCP extension</h2>
<p><a href="/specs/mcp/">The MCP knowledge extension</a> is the reference text of <code>${esc(MCP_EXTENSION)}</code>, the identifier by which a Model Context Protocol server says that the knowledge it serves is also published as a Bundle.</p>
<h2 id="conformance">Conformance</h2>
<p>A claim names exactly one Level, the <code>spec_version</code> and the vector set it passed (<a class="ref" href="/specs/00-overview/#AGSC-00-12">AGSC-00-12</a>, <a class="ref" href="/specs/10-implementation-profiles/#AGSC-10-01">AGSC-10-01</a>). This site claims <strong>Level 0</strong> against <code>${esc(SPEC_VERSION)}</code>.</p>
${figure('levels')}<h2 id="licence">Licence</h2>
<p>The specification text is published under the Apache License 2.0 with the reference implementation. The schemas, the ontology and the identifiers are released under CC0 1.0.</p>
`,
});
for (const p of specPages) {
  const toc = [], used = new Set(['main', 'status-heading', 'contents', 'plain']);
  const tables = { n: 0 };
  const bodyHtml = md(p.src, { ruleLinks: true, page: p.slug, toc, used, tables });
  const h1end = bodyHtml.indexOf('</h1>\n') + 6;
  const plainSrc = stripH1(PLAIN[p.slug]).replace(/\n+Rules: [^\n]*\n?$/, '\n');
  addPage(p.url, {
    title: p.h1, summary: summaryOf(p.url), description: `${p.h1} — section ${p.slug.slice(0, 2)} of the AgenticSystemCore specification ${SPEC_VERSION}.`, section: '/specs/', wide: true,
    jsonld: { '@context': 'https://schema.org', '@type': 'TechArticle', headline: p.h1, url: `${BASE}specs/${p.slug}/`, version: SPEC_VERSION, license: 'https://www.apache.org/licenses/LICENSE-2.0', author: { '@type': 'Person', name: config.site.author }, isPartOf: `${BASE}specs/` },
    body: statusBlock()
      + `<aside class="plain" aria-labelledby="plain"><h2 id="plain">In plain language</h2>\n${md(plainSrc, { ruleLinks: true, page: p.slug, used, tables })}<p class="id">This box explains; the rules below decide. New to the notation? See <a href="/docs/reading-the-specification/">how to read the specification</a>.</p>\n</aside>\n`
      + figure(SPEC_DIAGRAM[p.slug])
      + (toc.length ? `<nav class="toc" aria-labelledby="contents"><h2 id="contents">Contents</h2>\n<ol>\n${toc.map(t => `<li><a href="#${t.id}">${t.html}</a></li>`).join('\n')}\n</ol></nav>\n` : '')
      + bodyHtml.slice(h1end)
      + editLink('engine', `spec/${p.file}`),
  });
}

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
  ];
  const registered = [
    ['describedby', 'The target describes this node. On the anchor it points at <code>graph.jsonld</code>; in page headers it points at this document.', ['AGSC-06-08', 'AGSC-06-25']],
    ['alternate', 'The same knowledge in another representation, such as <code>/llms.txt</code>.', ['AGSC-06-10']],
    ['license', 'The licence page of the node.', ['AGSC-06-10']],
    ['service-doc', 'Human documentation, such as <code>/specs/</code>.', ['AGSC-06-10']],
    ['author', 'The author of the node.', ['AGSC-06-10']],
    ['related, service-desc, service-meta, collection, item', 'Related-system links, OPTIONAL, each carrying <code>type</code>. Admitted by both rules since rc.5.', ['AGSC-06-10', 'AGSC-06-35']],
  ];
  const attrs = [
    ['digest', 'One string <code>sha-256=:&lt;base64&gt;:</code> over the bytes of the target (RFC 9530, RFC 9651). Level 2 and above.', ['AGSC-06-08']],
    ['agsc-spec-version', 'The <code>spec_version</code> of the Bundle. On the <code>describedby</code> link to <code>graph.jsonld</code>; Level 2 and above.', ['AGSC-06-08']],
    ['agsc-generated-at', 'The build instant, derived from <code>SOURCE_DATE_EPOCH</code>. Level 2 and above.', ['AGSC-06-08', 'AGSC-06-11']],
    ['agsc-counts', 'One <code>&lt;type-plural&gt;=&lt;n&gt;</code> string per item type, over the published set. Level 2 and above.', ['AGSC-06-08']],
    ['agsc-bundle-hash', 'The bundle hash, in RFC 9530 syntax. Level 2 and above.', ['AGSC-06-08']],
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
  const level2 = { linkset: [{ alternate: [{ digest: ['sha-256=:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=:'], href: 'https://example.org/llms.txt', type: 'text/plain' }], anchor: 'https://example.org/', describedby: [{ 'agsc-bundle-hash': ['sha-256=:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=:'], 'agsc-counts': ['clusters=0', 'concepts=0', 'episodes=0', 'gates=0', 'lessons=0', 'procedures=0'], 'agsc-generated-at': ['2026-01-01T00:00:00Z'], 'agsc-spec-version': [SPEC_VERSION], digest: ['sha-256=:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=:'], href: 'https://example.org/graph.jsonld', type: 'application/ld+json' }], [`${REL}ledger`]: [{ 'agsc-ledger-head': ['bee9ba6593162f59dae28f42ba25fa04ea3fd65ae4f80685fb1c4ede151189ac'], digest: ['sha-256=:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=:'], href: 'https://example.org/ledger.jsonl', type: 'application/jsonl' }], license: [{ href: 'https://example.org/legal/' }], 'service-doc': [{ href: 'https://example.org/specs/' }] }] };
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
    // AGSC-06-01 (amended at rc.5): each row's anchor is named exactly as the fragment of the
    // relation URI — `#graph`, not `#rel-graph` — so a client that does follow `…/rel#graph`
    // keeps that fragment and lands on this row.
    relations: `<p>Registered relations (IANA Link Relations registry):</p>\n` + table(['Relation', 'Meaning', 'Rules'], registered, null, r => `<code>${esc(r[0])}</code>`)
      + `<p>Extension relations. Each URI <code>${REL}&lt;name&gt;</code> resolves to its row below.</p>\n`
      + table(['Extension relation', 'Target', 'Rules'], relations, r => r[0], r => `<code>…/rel#${r[0]}</code>`),
    attributes: `<p>Extension target attributes use the prefix <code>agsc-</code>, except <code>digest</code>. Every attribute value is an array of strings (${R('AGSC-06-10')}).</p>\n`
      + table(['Attribute', 'Meaning', 'Rules'], attrs, r => `attr-${r[0]}`, r => `<code>${esc(r[0])}</code>`),
    'example-self': `<p>The live document is at <a href="${WELLKNOWN}"><code>${WELLKNOWN}</code></a>; a browser shows it as text. The same bytes, pretty-printed:</p>\n<pre tabindex="0" data-lang="json"><code>${esc(pretty(WELLKNOWN_DOC))}</code></pre>\n`,
    'example-level2': `<pre tabindex="0" data-lang="json"><code>${esc(pretty(level2))}</code></pre>\n`,
  };
  const used = new Set(['main', 'status-heading', ...relations.map(r => r[0]), ...attrs.map(r => `attr-${r[0]}`)]);
  const src = read('site/profile.md');
  checkText('site/profile.md', src);
  addPage('/specs/agentic-knowledge/', {
    title: 'Knowledge link set profile', summary: summaryOf('/specs/agentic-knowledge/'), description: 'The profile of the application/linkset+json discovery document that an AgenticSystemCore node serves at /.well-known/knowledge-linkset.', section: '/specs/agentic-knowledge/', wide: true,
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
<dt>Protocol revision</dt><dd>Model Context Protocol <code>${esc(MCP_REVISION)}</code></dd>
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
    jsonld: { '@context': 'https://schema.org', '@type': 'TechArticle', headline: 'MCP knowledge extension', url: `${BASE}specs/mcp/`, identifier: MCP_EXTENSION, version: SPEC_VERSION, license: 'https://www.apache.org/licenses/LICENSE-2.0', author: { '@type': 'Person', name: config.site.author }, isPartOf: `${BASE}specs/` },
    body: md(src, { ruleLinks: true, page: 'mcp', slots, used }) + editLink('site', 'site/mcp-extension.md'),
  });
}

// ontology pages and files
function nsPage(url, versioned) {
  const rows = kind => ascSubjects.filter(s => kindOf(s) === kind).map(s => {
    const name = s.slice(NS.length);
    const details = onto.triples.filter(t => t.s === s && ![RDF_TYPE, RDFS + 'label', RDFS + 'comment', RDFS + 'isDefinedBy'].includes(t.p))
      .map(t => `<code>${esc(qname(t.p))}</code> ${t.o.t === 'iri' ? `<code>${esc(t.o.v.startsWith(NS) ? 'asc:' + t.o.v.slice(NS.length) : (() => { try { return qname(t.o.v); } catch { return t.o.v; } })())}</code>` : esc(t.o.v)}`)
      .sort(byCode);
    return `<tr id="${esc(name)}"><th scope="row"><code>asc:${esc(name)}</code></th><td>${esc(one(s, RDFS + 'label') || name)}</td><td>${esc(one(s, RDFS + 'comment') || '')}</td><td>${details.join('<br>')}</td></tr>`;
  }).join('\n');
  const tbl = (id, title, kind) => `<h2 id="${id}">${title}</h2>\n<div class="table-wrap" tabindex="0" role="region" aria-label="${title}"><table>\n<thead><tr><th scope="col">Term</th><th scope="col">Label</th><th scope="col">Definition</th><th scope="col">Axioms</th></tr></thead>\n<tbody>\n${rows(kind)}\n</tbody></table></div>\n`;
  const counts = ['class', 'object', 'datatype'].map(k => ascSubjects.filter(s => kindOf(s) === k).length);
  const prefix = versioned ? `/ns/${VERSION_INFO}/` : '/ns/';
  addPage(url, {
    title: `${one(ONTOLOGY_IRI, 'http://purl.org/dc/terms/title')}${versioned ? ` ${VERSION_INFO}` : ''}`, summary: summaryOf('/ns/'), description: one(ONTOLOGY_IRI, 'http://purl.org/dc/terms/description'), section: '/ns/', wide: true,
    jsonld: { '@context': 'https://schema.org', '@type': 'DefinedTermSet', name: one(ONTOLOGY_IRI, 'http://purl.org/dc/terms/title'), url: BASE + url.slice(1), identifier: ONTOLOGY_IRI, version: VERSION_INFO, license: 'https://creativecommons.org/publicdomain/zero/1.0/', hasDefinedTerm: ascSubjects.map(s => ({ '@type': 'DefinedTerm', termCode: 'asc:' + s.slice(NS.length), name: one(s, RDFS + 'label') || s.slice(NS.length), url: `${BASE}${url.slice(1)}#${s.slice(NS.length)}` })) },
    body: `<p>${esc(one(ONTOLOGY_IRI, 'http://purl.org/dc/terms/description'))}</p>
<dl class="meta">
<dt>Namespace</dt><dd><code>${NS}</code></dd>
<dt>Version IRI</dt><dd><code>${esc(one(ONTOLOGY_IRI, OWL + 'versionIRI'))}</code> (<code>owl:versionInfo</code> ${esc(VERSION_INFO)})</dd>
<dt>Terms</dt><dd>${counts[0]} classes, ${counts[1]} object properties, ${counts[2]} datatype properties</dd>
<dt>Licence</dt><dd><a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0 1.0</a></dd>
<dt>Profile</dt><dd>OWL 2 RL (<a class="ref" href="/specs/05-graph/#AGSC-05-22">AGSC-05-22</a>)</dd>
</dl>
${versioned ? '' : figure('spec-05-graph')}<h2 id="representations">Representations</h2>
<ul>
<li><a href="${prefix}agsc.ttl">Turtle</a>, <code>text/turtle</code>: the normative source.</li>
<li><a href="${prefix}context.jsonld">JSON-LD context</a>, <code>application/ld+json</code>, generated from the Turtle (<a class="ref" href="/specs/06-surfaces/#AGSC-06-32">AGSC-06-32</a>).</li>
<li><a href="${prefix}agsc.rdf">RDF/XML</a>, <code>application/rdf+xml</code>, and <a href="${prefix}agsc.nt">N-Triples</a>, <code>application/n-triples</code>, both generated from the Turtle. Most browsers download these two rather than showing them.</li>
</ul>
<p>${STATUS.w3id ? 'The namespace IRI negotiates between these representations through w3id.org' : 'Once the w3id.org redirects are registered, the namespace IRI will negotiate between these representations'} (<a class="ref" href="/specs/06-surfaces/#AGSC-06-06">AGSC-06-06</a>). ${versioned ? `This is the copy of version <code>${esc(VERSION_INFO)}</code>.` : `The copy of this version is at <a href="/ns/${esc(VERSION_INFO)}/"><code>/ns/${esc(VERSION_INFO)}/</code></a>; the pre-release version path stays in use until the specification reaches 1.0.0 (<a class="ref" href="/specs/05-graph/#AGSC-05-25">AGSC-05-25</a>).`}</p>
${tbl('classes', 'Classes', 'class')}${tbl('object-properties', 'Object properties', 'object')}${tbl('datatype-properties', 'Datatype properties', 'datatype')}`,
  });
  put(`${prefix.slice(1)}agsc.ttl`, TTL);
  put(`${prefix.slice(1)}agsc.nt`, NT);
  put(`${prefix.slice(1)}agsc.rdf`, RDFXML);
  put(`${prefix.slice(1)}context.jsonld`, jcs(CONTEXT) + '\n');
}
nsPage('/ns/', false);
nsPage(`/ns/${VERSION_INFO}/`, true);

// items, indexes, clusters
const itemPage = it => addPage(it.url, {
  title: it.fm.title, summary: it.fm.description || it.fm.title, description: it.fm.description || it.fm.title, section: it.type === 'concept' ? '/concepts/' : null,
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

// the guide (site/docs/*.md, hand-authored, plus the tagged documents rendered through slots)
const statusRows = [
  ['Specification <code>' + esc(SPEC_VERSION) + '</code>', 'Live', `Tagged on ${esc(SPEC_DATE)}; twelve sections at <a href="/specs/">/specs/</a>; the vocabulary and the vectors are frozen at the tag.`],
  ['This site as a Level-0 node', 'Live', `Items, <a href="/graph.jsonld"><code>graph.jsonld</code></a>, <a href="/llms.txt"><code>llms.txt</code></a> and the <a href="${WELLKNOWN}">discovery document</a> in its Level-0 form, checked by the Level-0 vectors and the discovery validator before every publish.`],
  ['Ontology files', 'Live', `Turtle, JSON-LD context, RDF/XML and N-Triples at <a href="/ns/">/ns/</a>.`],
  ['Namespace through w3id.org', STATUS.w3id ? 'Live' : 'Not yet resolving', regText.w3id],
  ['Well-known URI <code>knowledge-linkset</code>', { 'not-requested': 'Not requested', requested: 'Requested', registered: 'Registered' }[STATUS.wellknown], regText.wellknown],
  ['Profile URI', { 'not-filed': 'Not filed', filed: 'Filed', registered: 'Registered' }[STATUS.profile], regText.profile],
  ['Internet-Draft', STATUS.draft ? 'Posted' : 'Not yet posted', regText.draft + (STATUS.draft ? '' : ' It will describe the discovery layer only and request two registrations: the well-known suffix and the profile URI.')],
  ['Preprint', STATUS.preprint ? 'Published' : 'In preparation', regText.preprint],
  ['Reference engine <code>agsc</code>', 'In preparation', 'The engine that implements Levels 1 to 3 is not published. This site is generated without it.'],
  ['Independent validators', 'In preparation', 'One validator, for the discovery document, exists and checked this site; the validators ship with the reference implementation.'],
  ['Contribution channel', 'Live', `Declared in the <a href="${WELLKNOWN}">discovery document</a> as a pull-request target (<a class="ref" href="/specs/11-boundary/#AGSC-11-14">AGSC-11-14</a>), and every page generated from a source file carries a <em>Propose an edit</em> link to that file. Nothing is written without a person merging it.`],
  ['Patterns catalogue as a second node', 'In preparation', `The catalogue of agentic system patterns is being prepared as a second node at <code>patterns.agenticsystemcore.com</code>. ${PEERS.length ? 'This node already names it as a peer in the discovery document; the mutual check of <a class="ref" href="/specs/10-implementation-profiles/#AGSC-10-12">AGSC-10-12</a> passes once both are published.' : 'It is not declared as a peer yet.'}`],
  ['Papers', 'Planned', 'Journal and conference papers follow the preprint; none is submitted.'],
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
<tr><th scope="row">Well-known URI suffix <code>knowledge-linkset</code></th><td>IANA Well-Known URIs registry (RFC 8615)</td><td>Specification Required; requested through the Internet-Draft</td><td>${regText.wellknown}</td></tr>
<tr><th scope="row">Profile URI <code>${PROFILE}</code></th><td>IANA Profile URIs registry (RFC 7284)</td><td>First Come First Served</td><td>${regText.profile}</td></tr>
<tr><th scope="row">Internet-Draft on the discovery layer</th><td>IETF Datatracker, Independent Submission Stream</td><td>Reviewed by the Independent Submissions Editor</td><td>${regText.draft}</td></tr>
<tr><th scope="row">Namespace <code>agentic-system-core</code></th><td>w3id.org permanent identifiers</td><td>Pull request reviewed by the w3id maintainers</td><td>${regText.w3id}</td></tr>
<tr><th scope="row">Discovery link relation</th><td>IANA Link Relations registry</td><td>None needed: the registered relation <code>describedby</code> (registered by W3C POWDER; RFC 6892 registers its inverse <code>describes</code>) is used with the media type (<a class="ref" href="/specs/06-surfaces/#AGSC-06-25">AGSC-06-25</a>)</td><td>No request</td></tr>
<tr><th scope="row">MCP extension identifier <code>${esc(MCP_EXTENSION)}</code></th><td>MCP extensions mechanism (SEP-2133)</td><td>Reverse-domain identifier declared by the server; no registry entry (<a class="ref" href="/specs/11-boundary/#AGSC-11-18">AGSC-11-18</a>)</td><td>Declared in the specification; the reference text is at <a href="/specs/mcp/">/specs/mcp/</a></td></tr>
</tbody></table></div>
`;
const publicationsHtml = `<ul>
<li><strong>Preprint.</strong> ${regText.preprint}${STATUS.preprint ? '' : ' It will establish the specification, its vectors and its discovery layer as of the tagged release, with a persistent identifier.'}</li>
<li><strong>Internet-Draft.</strong> ${regText.draft}</li>
<li><strong>Papers.</strong> Journal and conference papers are planned after the preprint; none has been submitted.</li>
</ul>
<h3 id="how-to-cite">How to cite</h3>
<p>${STATUS.preprint ? `Cite the preprint by its DOI, <code>${esc(STATUS.preprint.doi)}</code>, and the specification by version.` : 'Until the preprint is published, cite the specification by version and tag:'}</p>
<pre tabindex="0"><code>${esc(config.site.author)}. AgenticSystemCore specification ${esc(SPEC_VERSION)}, ${esc(SPEC_DATE)}. ${esc(BASE)}specs/</code></pre>
`;
const featuresCoverage = sectionOf(DOC.featuresReadme, '## Scenario-coverage table').replace(/`([a-z0-9-]+)\.feature`/g, (_, n) => `[${n}](#${n})`);
const featuresHtml = FEATURES.map(f => {
  const title = (/^\s*Feature: (.*)$/m.exec(f.src) || [, f.name])[1];
  return `<h3 id="${esc(f.name)}">${esc(f.name)}: ${esc(title)}</h3>\n<pre tabindex="0" class="feature" data-lang="gherkin"><code>${esc(f.src.replace(/\n+$/, ''))}</code></pre>\n`;
}).join('');
const relatedWork = ['## 1. One sentence', '## 3. The agent-discovery mechanisms', '## 4. Adjacent work', '## 5. What is new here'].map(h => {
  const line = DOC.related.split('\n').find(l => l.startsWith(h));
  return `### ${line.replace(/^## /, '')}\n\n${sectionOf(DOC.related, h)}`;
}).join('\n');
const DOCS = fs.readdirSync(path.join(ROOT, 'site/docs')).filter(f => f.endsWith('.md')).sort();
const WIDE_DOCS = new Set(['architecture', 'requirements', 'scenarios', 'standards', 'compliance', 'glossary']);
for (const f of DOCS) {
  const slug = f === 'index.md' ? '' : f.slice(0, -3), url = `/docs/${slug}${slug ? '/' : ''}`;
  const { fm, body } = splitFrontmatter(read(`site/docs/${f}`), `site/docs/${f}`);
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
    jsonld: { '@context': 'https://schema.org', '@type': 'TechArticle', headline: fm.title, description: fm.description, url: ORIGIN + url, author: { '@type': 'Person', name: config.site.author }, isPartOf: `${BASE}docs/` },
    body: md(body, { ...o, slots }) + editLink('site', `site/docs/${f}`),
  });
}

// about, legal
addPage('/about/', {
  title: 'About', summary: summaryOf('/about/'), description: 'Who writes AgenticSystemCore, how to read this node, the status of the specification and how to get in touch.', section: '/about/',
  jsonld: { '@context': 'https://schema.org', '@type': 'AboutPage', name: 'About AgenticSystemCore', url: `${BASE}about/`, author: { '@type': 'Person', name: config.site.author, sameAs: ['https://orcid.org/0009-0001-3464-5283', 'https://github.com/andreibesleaga', CONTACT_URL] } },
  body: md(read('site/about.md'), { ruleLinks: true }) + editLink('site', 'site/about.md'),
});
// AGSC-06-18 as amended at rc.5 pins the text the identifier names: the file `LICENSE-CONTENT`
// at the root of the specification's distribution, with this SHA-256 over its bytes. The Bundle
// root carries its own copy; both are checked to be that text, or `/legal/` would publish terms
// the identifier does not name.
const TERMS_SHA256 = 'b2e8da62e6a41886296d2d2358fb4642cc7418e806eb4a29ada12b588ac32857';
const TERMS_TEXT = engineFile('LICENSE-CONTENT');
if (!TERMS_TEXT.includes(`SPDX-License-Identifier: ${TERMS_ID}`)) die('LICENSE-CONTENT does not carry the terms identifier');
if (sha256hex(Buffer.from(TERMS_TEXT, 'utf8')) !== TERMS_SHA256) die(`LICENSE-CONTENT at tag ${SPEC_TAG} is not the text AGSC-06-18 pins (${TERMS_SHA256})`);
if (sha256hex(fs.readFileSync(path.join(ROOT, 'LICENSE-CONTENT'))) !== TERMS_SHA256) die('the Bundle root LICENSE-CONTENT is not the text AGSC-06-18 pins');
addPage('/legal/', {
  title: 'Legal and privacy', summary: summaryOf('/legal/'), description: 'The Content Use Terms, the licences of each kind of artefact, the machine-readable signals and the privacy notice of this node.', section: null,
  jsonld: { '@context': 'https://schema.org', '@type': 'WebPage', name: 'Legal and privacy', url: `${BASE}legal/` },
  body: `<h2 id="licences">Licences</h2>
<div class="table-wrap" tabindex="0" role="region" aria-label="Licences"><table>
<thead><tr><th scope="col">What</th><th scope="col">Licence</th></tr></thead>
<tbody>
<tr><td>The prose of the items, and the pages and text files that carry it, including <code>/llms.txt</code>, <code>/llms-full.txt</code> and <code>/graph.jsonld</code></td><td><a href="#content-use-terms">Content Use Terms 1.0</a> (<code>${TERMS_ID}</code>)</td></tr>
<tr><td>The schemas, the ontology, the JSON-LD context, the identifiers and the discovery document</td><td><a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0 1.0</a></td></tr>
<tr><td>The specification text</td><td><a href="https://www.apache.org/licenses/LICENSE-2.0">Apache License 2.0</a>, as published with the reference implementation</td></tr>
</tbody></table></div>
<h2 id="content-use-terms">Content Use Terms 1.0</h2>
<p>The identifier <code>${TERMS_ID}</code> names this exact text, not a file name: the file <code>LICENSE-CONTENT</code> at the root of the specification's distribution, ${Buffer.byteLength(TERMS_TEXT)} bytes, SHA-256 <code>${TERMS_SHA256}</code> (<a class="ref" href="/specs/06-surfaces/#AGSC-06-18">AGSC-06-18</a>). A distribution that ships different wording must use a different identifier; a reader may check the hash.</p>
<pre tabindex="0" class="terms"><code>${esc(TERMS_TEXT.replace(/\n$/, ''))}</code></pre>
<h2 id="signals">Machine-readable signals</h2>
<p>The same policy is stated three ways (<a class="ref" href="/specs/06-surfaces/#AGSC-06-18">AGSC-06-18</a>): the AI-usage signals of <a href="/robots.txt"><code>/robots.txt</code></a>, the TDM reservation in <a href="/.well-known/tdmrep.json"><code>/.well-known/tdmrep.json</code></a>, and the <code>schema:license</code> and <code>schema:usageInfo</code> members of <a href="/graph.jsonld"><code>/graph.jsonld</code></a> together with the provenance header of <a href="/llms.txt"><code>/llms.txt</code></a>.</p>
<h2 id="privacy">Privacy</h2>
${md(read('site/privacy.md'))}<p>Operator of this site: ${esc(config.site.author)}. Retention: the git history of the site's repository is the only record kept; no request logs are kept by the operator.</p>
`,
});

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
  body: `<div class="search" role="search"><form class="search" id="search-form"><label for="q">Search pages and rules</label><input id="q" name="q" type="search" autocomplete="off" spellcheck="false"><button type="submit">Search</button></form></div>
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
const SITE_INDEX = [];
for (const [url, p] of pageTexts) {
  const main = p.html.slice(p.html.indexOf('<main'), p.html.indexOf('</main>'));
  SITE_INDEX.push({ kind: 'page', text: textOf(main).slice(0, 1200), title: p.title, url });
  for (const m of main.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>\n([\s\S]*?)(?=<h2 |$)/g)) if (!/^(contents|status-heading|plain|sources|members|index-)/.test(m[1])) SITE_INDEX.push({ kind: 'section', text: textOf(m[3]).slice(0, 400), title: `${p.title} › ${textOf(m[2])}`, url: `${url}#${m[1]}` });
  for (const m of main.matchAll(/<li id="(AGSC-\d{2}-\d{2,3}[a-z]?)" class="rule-item[^"]*">([\s\S]*?)<\/li>/g)) SITE_INDEX.push({ kind: 'rule', text: textOf(m[2].replace(/<span class="trace">[\s\S]*?<\/span>/, '')).replace(/^AGSC-\S+\s*/, '').slice(0, 400), title: m[1], url: `${url}#${m[1]}` });
  for (const m of main.matchAll(/<tr id="(AGSC-E\d{3})"><td>[\s\S]*?<\/td><td>([\s\S]*?)<\/td>/g)) SITE_INDEX.push({ kind: 'error code', text: textOf(m[2]), title: m[1], url: `${url}#${m[1]}` });
}
SITE_INDEX.sort((a, b) => byCode(a.url, b.url) || byCode(a.title, b.title));
put('assets/search-site.json', JSON.stringify(SITE_INDEX) + '\n');

// machine files
put('graph.jsonld', jcs(GRAPH) + '\n');
put('llms.txt', LLMS.index);
put('llms-full.txt', LLMS.full);
put('search.json', SEARCH_JSON);
put('.well-known/knowledge-linkset', WELLKNOWN_BYTES);
put('.well-known/security.txt', [
  `Contact: ${CONTACT_URL}`,
  `Expires: ${iso(EPOCH + 364 * 86400)}`,
  'Preferred-Languages: en',
  `Canonical: ${BASE}.well-known/security.txt`,
  `Policy: ${BASE}docs/compliance/`,
].join('\n') + '\n');
const TDM = [{ location: '/', 'tdm-reservation': 1 }];
put('.well-known/tdmrep.json', JSON.stringify(TDM) + '\n');
const ROBOTS = `User-agent: *\n# Content Signals Policy (contentsignals.org): the same policy as /.well-known/tdmrep.json and /legal/\nContent-Signal: search=yes, ai-input=yes, ai-train=no\nAllow: /\n\nSitemap: ${BASE}sitemap.xml\n`;
put('robots.txt', ROBOTS);
// AGSC-06-18: the three dialects MUST agree; a divergence fails the build.
if (!(/ai-train=no/.test(ROBOTS) && TDM.every(r => r['tdm-reservation'] === 1) && GRAPH['@graph'][0][ctxKey('schema:license')] === LICENSE_PROSE && LLMS.index.includes(`terms: ${TERMS_ID}`) && TERMS_TEXT.includes('text and data mining rights are expressly reserved'))) die('licence dialects diverge (AGSC-06-18)');
routes.sort(byCode);
put('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes.map(r => `<url><loc>${esc(ORIGIN + r)}</loc><lastmod>${GENERATED_AT.slice(0, 10)}</lastmod></url>`).join('\n')}\n</urlset>\n`);

// _headers: Cloudflare Pages merges every matching block, so each header is set once.
const PUBLIC_ARTEFACT = ['/.well-known/knowledge-linkset', '/graph.jsonld', '/llms.txt', '/llms-full.txt', '/search.json', '/ns/*'];
put('_headers', `# Generated by scripts/build.js — do not hand-edit (AGSC-06-04).
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
  Permissions-Policy: interest-cohort=()

/
  Link: <${WELLKNOWN}>; rel="describedby"; type="application/linkset+json"

${PUBLIC_ARTEFACT.map(p => `${p}\n  Access-Control-Allow-Origin: *\n  Access-Control-Expose-Headers: Link, ETag, Content-Type`).join('\n\n')}

/.well-known/knowledge-linkset
  Content-Type: application/linkset+json; profile="${PROFILE}"
  Link: <${PROFILE}>; rel="profile"
  Cache-Control: no-cache

/.well-known/tdmrep.json
  Content-Type: application/json; charset=utf-8

/.well-known/security.txt
  Content-Type: text/plain; charset=utf-8

/graph.jsonld
  Content-Type: application/ld+json; charset=utf-8

/search.json
  Content-Type: application/json; charset=utf-8

/llms.txt
  Content-Type: text/plain; charset=utf-8

/llms-full.txt
  Content-Type: text/plain; charset=utf-8

/ns/*.ttl
  Content-Type: text/turtle; charset=utf-8

/ns/*.jsonld
  Content-Type: application/ld+json; charset=utf-8

/ns/*.rdf
  Content-Type: application/rdf+xml; charset=utf-8

/ns/*.nt
  Content-Type: application/n-triples; charset=utf-8
`);
put('_redirects', `# Generated by scripts/build.js — do not hand-edit (AGSC-06-04).
# The 0.0.x discovery path (D60, AGSC-06-17).
/.well-known/agentic-knowledge ${WELLKNOWN} 301
`);

// assets
for (const f of ['assets/site.css', 'assets/search.js', 'favicon.svg']) { const s = read(`assets/${path.basename(f)}`); checkText(f, s); put(f, s); }
for (const id of DIAGRAMS.keys()) if (!usedDiagrams.has(id)) die(`diagram ${id} is compiled but shown on no page`);

// ------------------------------------------------------------------ budgets and final checks, then write
// Quoted requirement text that names a forbidden framing in order to forbid it (rendered from the tagged PRD).
const ALLOWED_QUOTES = ['no Web4/crypto framing, book or &quot;companion&quot; strings', 'no Web4/crypto framing, book or \\"companion\\" strings', 'with no reading order imposed (R23)', 'no &quot;start here&quot; link and no imposed reading order', 'no \\"start here\\" link and no imposed reading order'];
for (const [p, c] of files) {
  const s = typeof c === 'string' ? c : null;
  if (s !== null) {
    if (s.normalize('NFC') !== s) die(`${p}: output not NFC (AGSC-E604)`);
    if (!s.endsWith('\n') || s.endsWith('\n\n')) die(`${p}: output must end with exactly one LF`);
    if (p.endsWith('.html') && Buffer.byteLength(s) > 100 * 1000) die(`${p}: ${Buffer.byteLength(s)} bytes exceeds the 100 KB page budget (AGSC-06-21; KB is decimal at rc.5)`);
    // AGSC-06-21 as amended at rc.5: ≤1 MB per index document, and `/search.json` carries the docs
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
process.stdout.write(`build: ${files.size} files, ${routes.length} pages, ${items.length} items, ${DIAGRAMS.size} diagrams, spec ${SPEC_VERSION} from tag ${SPEC_TAG}, generated_at ${GENERATED_AT} -> ${path.relative(ROOT, OUT) || '.'}\n`);
