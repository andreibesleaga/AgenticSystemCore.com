// Tests of scripts/release-feed.js and of the feed checks in scripts/check-release.js.
// No network, no clock: every date is a fixed past instant.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const feed = require('./release-feed.js');
const { xmlFault } = require('./check-release.js');

const CHANGELOG = [
  '# Changelog', '', '## [Unreleased]', '', '## [1.0.0] - 2026-10-14', '', 'text', '',
  '## [1.0.0-rc.7] - 2026-10-08', '', '## [1.0.0-rc.6] - 2026-09-29', '',
].join('\n');
const TAGS = [
  { name: '1.0.0-rc.3', unix: 1789635610 }, // a tag with no section of the change log
  { name: '1.0.0-rc.6', unix: 1790706477 },
  { name: 'v1.0.0-rc.6', unix: 1790706477 }, // a package tag
  { name: '1.0.0-rc.7', unix: 1791445525 },
  { name: '1.0.0', unix: 1791968400 },
  { name: 'site-2026-10-14', unix: 1791968400 },
];

test('GitHub anchors of the change-log headings and of the claim heading', () => {
  assert.equal(feed.githubAnchor('[1.0.0-rc.6] - 2026-09-29'), '100-rc6---2026-09-29');
  assert.equal(feed.githubAnchor('[1.0.0] - 2026-10-14'), '100---2026-10-14');
  assert.equal(feed.githubAnchor("The reference engine's claim"), 'the-reference-engines-claim');
});

test('a release is a specification-version tag with a section of the change log, newest first', () => {
  const list = feed.releases(TAGS, CHANGELOG);
  assert.deepEqual(list.map(r => r.name), ['1.0.0', '1.0.0-rc.7', '1.0.0-rc.6']);
  assert.equal(list[2].date, '2026-09-29');
  assert.equal(list[0].heading, '[1.0.0] - 2026-10-14');
});

test('the feed is well-formed RSS 2.0 with one item per release, dated by its tag', () => {
  const xml = feed.rss({ origin: 'https://example.org', engineRepo: 'https://forge.example/engine', releases: feed.releases(TAGS, CHANGELOG) });
  assert.equal(xmlFault(xml), null);
  assert.ok(xml.endsWith('</rss>\n') && !xml.endsWith('\n\n'));
  assert.deepEqual([...xml.matchAll(/<guid isPermaLink="false">([^<]+)<\/guid>/g)].map(m => m[1]), ['1.0.0', '1.0.0-rc.7', '1.0.0-rc.6']);
  assert.ok(xml.includes('<pubDate>Tue, 29 Sep 2026 18:27:57 GMT</pubDate>'));
  assert.ok(xml.includes('<link>https://forge.example/engine/blob/1.0.0-rc.6/CHANGELOG.md#100-rc6---2026-09-29</link>'));
  assert.ok(xml.includes('&lt;a href=&quot;https://example.org/changelog/&quot;&gt;'));
  assert.equal(feed.rss({ origin: 'https://example.org', engineRepo: 'https://forge.example/engine', releases: feed.releases(TAGS, CHANGELOG) }), xml, 'two runs give the same bytes');
});

test('a release with no summary, or with too few or too many lines, stops the build', () => {
  const list = feed.releases([{ name: '9.9.9', unix: 1791968400 }], '## [9.9.9] - 2026-10-14\n');
  assert.throws(() => feed.rss({ origin: 'o', engineRepo: 'e', releases: list }), /has no summary/);
  assert.throws(() => feed.rss({ origin: 'o', engineRepo: 'e', releases: list, summaries: { '9.9.9': ['a', 'b'] } }), /2 summary lines/);
  assert.throws(() => feed.rss({ origin: 'o', engineRepo: 'e', releases: list, summaries: { '9.9.9': Array(11).fill('a') } }), /11 summary lines/);
});

// The wording public pages never use, built from parts so that this file does not match itself.
const FORBIDDEN = new RegExp(['\\bthe first\\b', '\\bunique\\b', '100 ?%', 'W3C ' + 'standard', '\\bendorsed\\b', 'Web' + '4'].join('|'), 'i');

test('every written summary has five to ten plain lines, without the words public pages never use', () => {
  for (const [tag, lines] of Object.entries(feed.SUMMARIES)) {
    assert.ok(feed.RELEASE_TAG.test(tag), tag);
    assert.ok(lines.length >= 5 && lines.length <= 10, `${tag}: ${lines.length} lines`);
    for (const l of lines) {
      assert.ok(!/[<>&`*]/.test(l), `${tag}: markup in "${l}"`);
      assert.ok(!FORBIDDEN.test(l), `${tag}: "${l}"`);
    }
  }
});

test('the 1.0.0 summary says what the version adds: one section, and no rule', () => {
  const lines = feed.SUMMARIES['1.0.0'];
  const text = lines.join('\n');
  assert.ok(!/adds no section/i.test(text), 'the specification of 1.0.0 adds a section, so the summary must not say it adds none');
  assert.ok(text.includes('one section, §0.7'), 'the summary names the section 1.0.0 adds');
  assert.ok(/adds, renumbers and removes no rule/.test(lines[0]), 'the opening line still says no rule is added, renumbered or removed');
  assert.ok(text.includes('where it runs the case'), 'the cross-check line says the Python checker runs the case');
  assert.ok(!text.includes('where it runs the area'), 'the cross-check line does not say the Python checker runs the area');
});

test('the well-formedness check sees a broken feed', () => {
  assert.match(xmlFault('<?xml version="1.0" encoding="UTF-8"?>\n<rss><channel></rss>\n'), /closes the wrong element/);
  assert.match(xmlFault('<?xml version="1.0" encoding="UTF-8"?>\n<rss>a & b</rss>\n'), /bad entity/);
  assert.match(xmlFault('<rss></rss>\n'), /no XML declaration/);
  assert.equal(xmlFault('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><a x="1"/>&amp;&#39;</rss>\n'), null);
});
