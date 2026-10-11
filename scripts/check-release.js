#!/usr/bin/env node
// The release gate: what the built site says about the version it publishes, the status page's
// rows that can be checked against the engine, and the releases feed `/changelog.xml`.
// `scripts/check.js` runs it on every build; it also runs on its own:
//
//   node scripts/check-release.js [<built site folder>]   (default: build.out of agsc.config.json)
//
// Exit 0 pass, 1 fail. No network, no clock: the facts come from the engine checkout beside this
// repository (SITE_ENGINE), read from the specification tag (SITE_SPEC_TAG) when it exists, as
// scripts/build.js reads them.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'https://agenticsystemcore.com';
const ENGINE_REPO = 'https://github.com/andreibesleaga/agentic-system-core';
const FEED_LINK = '<link rel="alternate" type="application/rss+xml" title="AgenticSystemCore releases" href="/changelog.xml">';
// A release tag names a specification version: MAJOR.MINOR.PATCH with an optional pre-release,
// and no `v` (the `v…` tags are the package tags, cut from the same commit).
const RELEASE_TAG = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** GitHub's anchor for a Markdown heading: lower case, punctuation dropped, spaces to hyphens. */
const githubAnchor = heading => heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/ /g, '-');
const rfc822 = unix => new Date(unix * 1000).toUTCString();
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The XML of the feed is well-formed: every element closed in order, one root, attributes
 * quoted, every `&` an entity this format defines or a character reference. Enough for a file
 * this generator writes; not a general XML parser.
 * @param {string} xml
 * @returns {string|null} the first fault, or null
 */
function xmlFault(xml) {
  if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')) return 'no XML declaration';
  const body = xml.slice(xml.indexOf('?>') + 2);
  for (const m of body.matchAll(/&([^;\s]*);?/g)) if (!/^&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);$/.test(m[0])) return `bad entity ${m[0]}`;
  const stack = []; let roots = 0;
  for (const m of body.matchAll(/<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>|<|>/g)) {
    if (m[0] === '<') return 'a "<" that opens no tag';
    if (m[0] === '>') continue;
    const [, close, name, , empty] = m;
    if (close) { if (stack.pop() !== name) return `</${name}> closes the wrong element`; continue; }
    if (stack.length === 0) roots++;
    if (!empty) stack.push(name);
  }
  if (stack.length) return `<${stack[stack.length - 1]}> is not closed`;
  return roots === 1 ? null : `${roots} root elements`;
}

/**
 * @param {string} www the built site folder
 * @param {{engine?: string, specTag?: string, specSource?: string}} [opts]
 * @returns {string[]} the failures, empty when every check holds
 */
function check(www, opts = {}) {
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };
  const ENGINE = path.resolve(ROOT, opts.engine || process.env.SITE_ENGINE || '../agentic-system-core');
  const SPEC_TAG = opts.specTag || process.env.SITE_SPEC_TAG || '1.0.0';
  const git = (...a) => cp.execFileSync('git', ['-C', ENGINE, ...a], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const tagExists = cp.spawnSync('git', ['-C', ENGINE, 'rev-parse', '-q', '--verify', `${SPEC_TAG}^{commit}`], { stdio: 'ignore' }).status === 0;
  const SPEC_SOURCE = opts.specSource || process.env.SITE_SPEC_SOURCE || (tagExists ? 'tag' : 'worktree');
  const engineFile = p => (SPEC_SOURCE === 'tag' ? git('show', `${SPEC_TAG}:${p}`) : fs.readFileSync(path.join(ENGINE, p), 'utf8'));
  const SPEC_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'agsc.config.json'), 'utf8')).spec_version;
  const FINAL = !SPEC_VERSION.includes('-');
  const file = r => path.join(www, r);
  const exists = r => fs.existsSync(file(r)) && fs.statSync(file(r)).isFile();
  const read = r => (exists(r) ? fs.readFileSync(file(r), 'utf8') : '');
  const text = html => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&#8212;/g, '—').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').replace(/ ([,.;:)])/g, '$1').replace(/\( /g, '(');
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]).sort();
  const pages = fs.existsSync(www) ? walk(www).filter(f => f.endsWith('.html')).map(f => path.relative(www, f).split(path.sep).join('/')) : [];
  ok(pages.length > 0, `no page built in ${www}`);

  // (1) The version this site publishes is called what it is. A final version is never "a release
  // candidate" and never "not yet released"; a page may still say that earlier versions were.
  const ver = reEsc(SPEC_VERSION) + '(?![-.\\w])';
  const calledCandidate = new RegExp(`${ver},? (?:is )?(?:a|the) (?:draft |\\w+ public )?release candidate`, 'i');
  const notYetReleased = new RegExp(`until ${ver} is released`, 'i');
  if (FINAL) {
    for (const r of pages) {
      const t = text(read(r));
      ok(!calledCandidate.test(t), `/${r}: calls ${SPEC_VERSION} a release candidate: "${(calledCandidate.exec(t) || [''])[0]}"`);
      ok(!notYetReleased.test(t), `/${r}: says ${SPEC_VERSION} is not released yet`);
      ok(!/release candidate tagged on|a draft release candidate/i.test(t), `/${r}: describes the specification as a release candidate`);
    }
    if (SPEC_SOURCE === 'tag') {
      ok(text(read('specs/00-overview/index.html')).includes(`Specification ${SPEC_VERSION}, released and tagged on`), `/specs/00-overview/ does not say that ${SPEC_VERSION} is released and tagged`);
      // The project board's release task for this version is done once the version is tagged.
      const task = `concepts/release-version-${SPEC_VERSION.replace(/\./g, '-')}/index.html`;
      if (exists(task)) ok(text(read(task)).includes('TASK_STATE_COMPLETED'), `/${task.replace(/index\.html$/, '')}: the release task of ${SPEC_VERSION} is not TASK_STATE_COMPLETED, though ${SPEC_VERSION} is tagged`);
    }
  }

  // (2) The status page: the rows a reader acts on, each with the facts the engine can confirm.
  const statusHtml = read('docs/status/index.html');
  const rows = new Map();
  for (const m of statusHtml.matchAll(/<tr><th scope="row">([\s\S]*?)<\/th><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><\/tr>/g)) rows.set(text(m[1]).trim(), { state: text(m[2]).trim(), html: m[3], text: text(m[3]) });
  const row = (what, state) => {
    const r = rows.get(what);
    ok(r !== undefined, `/docs/status/ has no row "${what}"`);
    if (r && state) ok(r.state === state, `/docs/status/ row "${what}" says "${r.state}", not "${state}"`);
    return r || { state: '', html: '', text: '' };
  };
  const surfaces = require(path.join(ENGINE, 'src', 'boundary', 'surfaces.js'));
  const server = JSON.parse(engineFile('server.json'));
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const packages = row('Packages on npm and PyPI', 'Published');
  for (const href of ['https://www.npmjs.com/package/agentic-system-core', 'https://www.npmjs.com/package/agsc-cli', 'https://pypi.org/project/agentic-system-core/']) ok(packages.html.includes(`href="${href}"`), `/docs/status/ packages row does not link ${href}`);
  ok(!/\d+\.\d+\.\d+/.test(packages.text), '/docs/status/ packages row names a package version: the site is published before the packages, so it names none (it would be untrue for an hour on release day)');
  const mcp = row('Local MCP tool server', 'Published');
  ok(mcp.text.includes(`MCP revision ${surfaces.MCP_PROTOCOL_VERSION}`), `/docs/status/ tool-server row does not name the MCP revision the engine speaks, ${surfaces.MCP_PROTOCOL_VERSION}`);
  ok(mcp.text.includes(`${words[surfaces.TOOL_NAMES.length]} tools (${surfaces.TOOL_NAMES.join(', ')})`), `/docs/status/ tool-server row does not name the engine's ${surfaces.TOOL_NAMES.length} tools`);
  ok(mcp.text.includes(`MCP Registry as ${server.name}`), `/docs/status/ tool-server row does not give the MCP Registry name of server.json, ${server.name}`);
  const webmcp = row('WebMCP page tools', 'Experimental');
  ok(webmcp.text.includes(`same ${words[surfaces.TOOL_NAMES.length]} tools`), '/docs/status/ WebMCP row does not say that the page offers the same tools');
  ok(webmcp.html.includes('href="/compose/"'), '/docs/status/ WebMCP row does not link /compose/');
  const skill = row('Agent skill', 'Published');
  ok(skill.html.includes('href="/docs/agent-skill/"') && skill.html.includes('href="/agent-skill/agentic-system-core/SKILL.md"'), '/docs/status/ agent-skill row does not link the skill file and its page');
  const node = row('This site as a node of its own specification', 'Live');
  if (FINAL) {
    ok(!/waits for/.test(node.text), '/docs/status/ node row still says the Level-3 claim waits for a release');
    const claim = row('Reference engine conformance claim', 'Published');
    ok(claim.text.includes(`Level 3 against specification ${SPEC_VERSION}`), `/docs/status/ claim row does not state Level 3 against ${SPEC_VERSION}`);
    const at = SPEC_SOURCE === 'tag' ? SPEC_TAG : 'main';
    const want = `${ENGINE_REPO}/blob/${at}/docs/CONFORMANCE-STATEMENTS.md#the-reference-engines-claim`;
    ok(claim.html.includes(`href="${want}"`), `/docs/status/ claim row does not link ${want}`);
    const headings = engineFile('docs/CONFORMANCE-STATEMENTS.md').split('\n').filter(l => /^#{1,6} /.test(l)).map(l => githubAnchor(l.replace(/^#+ /, '')));
    ok(headings.includes('the-reference-engines-claim'), `docs/CONFORMANCE-STATEMENTS.md (${SPEC_SOURCE === 'tag' ? `tag ${SPEC_TAG}` : 'working tree'}) has no heading "The reference engine's claim", which the status page links`);
  }
  const vocab = row('Vocabulary and semantics', 'Live');
  {
    const nt = read('ns/agsc.nt');
    const count = kind => new Set([...nt.matchAll(new RegExp(`^<(https://w3id\\.org/agentic-system-core/ns#[^>]+)> <http://www\\.w3\\.org/1999/02/22-rdf-syntax-ns#type> <http://www\\.w3\\.org/2002/07/owl#${kind}> \\.$`, 'gm'))].map(m => m[1])).size;
    const c = count('Class'), o = count('ObjectProperty'), d = count('DatatypeProperty');
    ok(c > 0 && vocab.text.includes(`${c + o + d} terms (${c} classes, ${o} object properties and ${d} datatype properties)`), `/docs/status/ vocabulary row does not give the counts of /ns/agsc.nt: ${c + o + d} terms (${c} classes, ${o} object properties and ${d} datatype properties)`);
    for (const name of ['OWL 2 RL', 'SKOS', 'PROV-O', 'Dublin Core']) ok(vocab.text.includes(name), `/docs/status/ vocabulary row does not name ${name}`);
  }
  const modes = row('Modes for people and agents', 'Live');
  ok(modes.html.includes('href="/docs/modes/"') && modes.html.includes('href="/docs/guides/"'), '/docs/status/ modes row does not link the modes and the guides');
  const compares = row('How it compares', 'Live');
  ok(compares.html.includes('href="/#compares"') && read('index.html').includes('<h2 id="compares">'), '/docs/status/ comparison row does not link the front page\'s comparison');
  const feedRow = row('Releases feed', 'Live');
  ok(feedRow.html.includes('href="/changelog.xml"'), '/docs/status/ releases-feed row does not link /changelog.xml');
  // Planned: exactly the three rows the owner chose, with no date and no version promised.
  const planned = [...rows].filter(([, r]) => r.state === 'Planned').map(([w]) => w);
  ok(planned.join(' | ') === ['Hosted tool server', 'Messages into a node', 'A change feed on every node'].join(' | '), `/docs/status/ planned rows are ${planned.join(' | ') || 'none'}`);
  for (const w of planned) ok(!/\b20\d\d\b|\b\d+\.\d+\b/.test(rows.get(w).text), `/docs/status/ planned row "${w}" names a date or a version`);

  // (3) The releases feed: RSS 2.0, one item per release tag, newest first, each linking its
  // section of the change log at that tag; named in every page head and linked visibly.
  const feed = read('changelog.xml');
  ok(feed !== '', '/changelog.xml is not built');
  if (feed !== '') {
    const fault = xmlFault(feed);
    ok(fault === null, `/changelog.xml is not well-formed XML: ${fault}`);
    ok(/^<rss version="2\.0" xmlns:atom="http:\/\/www\.w3\.org\/2005\/Atom">$/m.test(feed), '/changelog.xml: the root is not <rss version="2.0"> with the Atom namespace');
    const open = feed.indexOf('<channel>'), firstItem = feed.indexOf('<item>');
    const channel = open < 0 ? '' : feed.slice(open, firstItem < 0 ? feed.indexOf('</channel>') : firstItem);
    for (const el of ['title', 'link', 'description', 'language']) ok(new RegExp(`<${el}>[^<]+</${el}>`).test(channel), `/changelog.xml: the channel has no <${el}>`);
    ok(channel.includes(`<atom:link href="${ORIGIN}/changelog.xml" rel="self" type="application/rss+xml"/>`), '/changelog.xml: the channel names no self link');
    const items = [...feed.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]);
    const field = (it, el) => (new RegExp(`<${el}(?: [^>]*)?>([^<]*)</${el}>`).exec(it) || [])[1];
    // The release tags, as the build must have read them: specification-version tags that have a
    // section in the change log of the specification source, newest tag first.
    const changelog = engineFile('CHANGELOG.md');
    const tags = git('for-each-ref', '--format=%(refname:short) %(creatordate:unix)', 'refs/tags').split('\n').filter(Boolean)
      .map(l => { const [name, unix] = l.split(' '); return { name, unix: Number(unix) }; })
      .filter(t => RELEASE_TAG.test(t.name) && new RegExp(`^## \\[${reEsc(t.name)}\\]`, 'm').test(changelog))
      .sort((a, b) => b.unix - a.unix || (a.name < b.name ? 1 : -1));
    ok(items.length === tags.length && items.every((it, k) => field(it, 'guid') === tags[k].name), `/changelog.xml: items ${items.map(it => field(it, 'guid')).join(', ')}; the release tags are ${tags.map(t => t.name).join(', ')}`);
    if (SPEC_SOURCE === 'tag') ok(tags.length > 0 && tags[0].name === SPEC_TAG, `/changelog.xml: the newest release is not ${SPEC_TAG}, the tag this site is built from`);
    items.forEach((it, k) => {
      const t = tags[k] || { name: '?', unix: NaN };
      ok(field(it, 'title') === t.name, `/changelog.xml: item ${k + 1} has the title ${field(it, 'title')}, not ${t.name}`);
      ok(field(it, 'pubDate') === rfc822(t.unix), `/changelog.xml: item ${t.name} has pubDate ${field(it, 'pubDate')}, not the tag's date ${rfc822(t.unix)}`);
      ok(/<guid isPermaLink="false">/.test(it), `/changelog.xml: item ${t.name}: the guid is not marked isPermaLink="false"`);
      const description = (field(it, 'description') || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
      const lines = (description.match(/<li>/g) || []).length;
      ok(lines >= 5 && lines <= 10, `/changelog.xml: item ${t.name} summarises its release in ${lines} lines, not 5 to 10`);
      const section = `${ENGINE_REPO}/blob/${t.name}/CHANGELOG.md#`;
      ok((field(it, 'link') || '').startsWith(section), `/changelog.xml: item ${t.name} does not link its change-log section at its own tag`);
      for (const href of [field(it, 'link') || '', ...[...description.matchAll(/href="([^"]+)"/g)].map(m => m[1])]) {
        if (href.startsWith(`${ORIGIN}/`)) {
          const p = decodeURIComponent(href.slice(ORIGIN.length).split('#')[0]);
          ok(exists(p.endsWith('/') ? `${p.slice(1)}index.html` : p.slice(1)), `/changelog.xml: item ${t.name} links ${href}, which this build does not serve`);
        } else if (href.startsWith(section)) {
          let at = ''; try { at = git('show', `${t.name}:CHANGELOG.md`); } catch { /* reported below */ }
          const anchors = at.split('\n').filter(l => l.startsWith('## ')).map(l => githubAnchor(l.slice(3)));
          ok(anchors.includes(href.slice(section.length)), `/changelog.xml: item ${t.name} links ${href}, a heading its change log at that tag does not have`);
        } else fails.push(`/changelog.xml: item ${t.name} links ${href}, neither this site nor the engine repository's change log`);
      }
    });
    const headers = read('_headers');
    const block = (headers.split(/\n\n+/).find(b => b.startsWith('/changelog.xml\n')) || '').split('\n').map(l => l.trim());
    for (const need of ['Content-Type: application/rss+xml; charset=utf-8', 'Access-Control-Allow-Origin: *', 'Access-Control-Expose-Headers: Link, ETag, Content-Type']) ok(block.includes(need), `_headers: /changelog.xml lacks ${need}`);
  }
  // Every page this generator writes names the feed in its head. The board pages under /boards/
  // are the engine's own bytes, republished unchanged (scripts/build.js), so they are not edited here.
  for (const r of pages.filter(p => !p.startsWith('boards/'))) ok(read(r).includes(FEED_LINK), `/${r}: the head does not name the releases feed (${FEED_LINK})`);
  for (const r of ['changelog/index.html', 'docs/status/index.html']) ok(/<a href="\/changelog\.xml">Releases feed \(RSS\)<\/a>/.test(read(r)), `/${r.replace(/index\.html$/, '')} has no visible "Releases feed (RSS)" link`);
  return fails;
}

module.exports = { check, githubAnchor, rfc822, xmlFault, RELEASE_TAG };

if (require.main === module) {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'agsc.config.json'), 'utf8'));
  const www = path.resolve(process.argv[2] || path.join(ROOT, (config.build || {}).out || 'www'));
  const fails = check(www);
  if (fails.length) { process.stderr.write(fails.map(f => `FAIL ${f}`).join('\n') + `\ncheck-release: ${fails.length} failure(s)\n`); process.exit(1); }
  process.stdout.write('check-release: pass\n');
}
