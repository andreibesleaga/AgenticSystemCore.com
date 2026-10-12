// The releases feed of this site, `/changelog.xml`: RSS 2.0, one item per release of the
// specification, newest first. scripts/build.js writes it; scripts/check-release.js checks the
// built file against the engine's tags; release-feed.test.js tests these functions.
//
// Deterministic: everything comes from the engine repository's tags and change log, never from a
// clock. A release is a tag that names a specification version (MAJOR.MINOR.PATCH with an
// optional pre-release, no `v`: the `v…` tags are the package tags of the same commit) AND has a
// section `## [<tag>]` in the change log the build reads. Its date is the tag's own date.
//
// The summary of each release is written here, five to ten plain lines drawn from that release's
// section of the engine's CHANGELOG.md; the full section is one link away. A release with no
// summary stops the build, so a new tag gets its lines in the same change that moves
// SITE_SPEC_TAG.
'use strict';

const RELEASE_TAG = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** Five to ten plain lines per release, newest release first. */
const SUMMARIES = {
  '1.0.0': [
    'Version 1.0.0 adds one section, §0.7, which lists the documents the rules already cite normatively, and adds, renumbers and removes no rule: a Bundle that conforms to the last release candidate conforms to it, unless it breaks one of the rules the change log lists as now reported.',
    'Defect fixes against rules that already stood, in the engine and in both discovery checkers, each proved by a test written first.',
    'Every clarified rule carries a dated amendment note, and the change log lists every rule amended since the last release candidate.',
    'The vocabulary is inside OWL 2 RL and OWL 2 DL; its fixed copy /ns/1.0.0/ is served beside the frozen /ns/1.0.0-draft.1/.',
    'New conformance cases, a new export area among them, each passed by the engine and cross-checked by the Python checker where it runs the case.',
    'The reference engine publishes its own Level-3 conformance claim.',
    'Security: agsc-host writes nothing outside the Bundle, its local server refuses a request for a foreign host name, and the slow patterns found on hostile input are linear scans.',
    'Continuous integration: a coverage gate inside a required leg, both packages packed and installed on every leg, Node 26 and a weekly run.',
  ],
  '1.0.0-rc.7': [
    'A release candidate of defect fixes, clarifications and documentation: a Bundle that conforms to the previous candidate keeps building.',
    'lint, build and ci now refuse or warn about input that was already outside the rules, such as a build folder inside content/ or dist/, or a site address with a path.',
    'The agent skill: a SKILL.md with two reference files, also shipped as a Claude Code plugin with a plugin marketplace file.',
    'server.json, the entry that lists the local tool server in the MCP Registry.',
    'Six short guides, one per mode, each run as a test on every change and shipped in the npm package.',
    'The Internet-Draft on the discovery layer, posted as an individual Internet-Draft.',
    'Conformance cases for the tool server\'s resources and prompt, its seven tools and the Level-2 discovery document.',
  ],
  '1.0.0-rc.6': [
    'The specification made public as a release candidate: twelve chapters of numbered rules, three JSON Schemas, an OWL 2 RL vocabulary and expected-byte conformance vectors.',
    'The reference engine, agentic-system-core on npm with the short alias agsc-cli: the agsc command line lints a Bundle, builds it into a static knowledge node and composes items into a Harness.',
    'A local MCP tool server, and the same seven tools in every published page.',
    'The nine independent checkers: seven validators and two generators that anyone can run against any distribution of the format.',
    'The Python package agentic-system-core on PyPI: the discovery checker, the conformance-vector runner and a small reading API.',
    'This site, with the specification\'s pages, the profile page and the namespace pages the vocabulary\'s identifiers resolve to.',
  ],
};

const xml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** GitHub's anchor for a Markdown heading: lower case, punctuation dropped, spaces to hyphens. */
const githubAnchor = heading => heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/ /g, '-');
/** RFC 822 date-time, as RSS 2.0 asks for, in GMT. */
const rfc822 = unix => new Date(unix * 1000).toUTCString();

/**
 * The releases, newest first.
 * @param {{name: string, unix: number}[]} tags every tag of the engine repository with its date
 * @param {string} changelog the engine's CHANGELOG.md, as the build reads it
 * @returns {{name: string, unix: number, date: string, heading: string}[]}
 */
function releases(tags, changelog) {
  const headings = new Map();
  for (const line of changelog.split('\n')) {
    const m = /^## \[([^\]]+)\](.*)$/.exec(line);
    if (m && !headings.has(m[1])) headings.set(m[1], line.slice(3));
  }
  return tags.filter(t => RELEASE_TAG.test(t.name) && headings.has(t.name))
    .map(t => ({ name: t.name, unix: t.unix, date: new Date(t.unix * 1000).toISOString().slice(0, 10), heading: headings.get(t.name) }))
    .sort((a, b) => b.unix - a.unix || (a.name < b.name ? 1 : -1));
}

/**
 * The feed.
 * @param {{origin: string, engineRepo: string, releases: ReturnType<typeof releases>, summaries?: Record<string, string[]>}} o
 * @returns {string} the RSS 2.0 document, ending with one LF
 */
function rss({ origin, engineRepo, releases: list, summaries = SUMMARIES }) {
  const items = list.map(r => {
    const lines = summaries[r.name];
    if (!Array.isArray(lines)) throw new Error(`release ${r.name} has no summary in scripts/release-feed.js: write five to ten lines from its section of the change log`);
    if (lines.length < 5 || lines.length > 10) throw new Error(`release ${r.name} has ${lines.length} summary lines in scripts/release-feed.js, not 5 to 10`);
    const section = `${engineRepo}/blob/${r.name}/CHANGELOG.md#${githubAnchor(r.heading)}`;
    const description = `<ul>${lines.map(l => `<li>${xml(l)}</li>`).join('')}</ul>`
      + `<p><a href="${xml(section)}">The change log of ${xml(r.name)}</a>, every change in full. <a href="${xml(`${origin}/changelog/`)}">The content versions of this site</a>.</p>`;
    return `<item>
<title>${xml(r.name)}</title>
<link>${xml(section)}</link>
<guid isPermaLink="false">${xml(r.name)}</guid>
<pubDate>${rfc822(r.unix)}</pubDate>
<description>${xml(description)}</description>
</item>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>AgenticSystemCore releases</title>
<link>${xml(`${origin}/changelog/`)}</link>
<description>Each release of the AgenticSystemCore specification and its reference engine, newest first, with a short summary and a link to its change log.</description>
<language>en</language>
<atom:link href="${xml(`${origin}/changelog.xml`)}" rel="self" type="application/rss+xml"/>
${items.join('\n')}${items.length ? '\n' : ''}</channel>
</rss>
`;
}

module.exports = { RELEASE_TAG, SUMMARIES, githubAnchor, releases, rfc822, rss };
