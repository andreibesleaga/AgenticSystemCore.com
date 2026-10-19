'use strict';
// Tests of scripts/chunk-anchors.js: reading the chunk export (lines, and the shard manifest of
// AGSC-06-31), checking the anchors of AGSC-06-28 on built pages, and the item heading ids of
// AGSC-03-13. No network; the one engine-backed case loads the engine beside this repository
// (SITE_ENGINE, or ../agentic-system-core), as scripts/build.js does.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { records, check, anchored, anchorOf, headingIds } = require('./chunk-anchors.js');
const ENGINE = path.resolve(__dirname, '..', process.env.SITE_ENGINE || '../agentic-system-core');

const IRI = 'https://example.org/procedures/p/';
const ID_TOP = '1'.repeat(64);
const ID_STEPS = 'abcdef0123456789'.padEnd(64, '0');
const ID_STEPS_1 = '2'.repeat(64);
const line = (id, section, ordinal, extra = {}) => JSON.stringify({ id, iri: IRI, item: 'p', section, ordinal, type: 'text', ...extra });
const EXPORT = [line(ID_TOP, '', 0), line(ID_STEPS, 'steps', 0), line(ID_STEPS_1, 'steps', 1)].join('\n') + '\n';

test('records reads one chunk per line', () => {
  const r = records(EXPORT);
  assert.deepStrictEqual(r.map(c => [c.section, c.ordinal]), [['', 0], ['steps', 0], ['steps', 1]]);
});

test('records follows the shard manifest in its order', () => {
  const shards = { '/chunks-01.jsonl': line(ID_TOP, '', 0) + '\n', '/chunks-02.jsonl': line(ID_STEPS, 'steps', 0) + '\n' };
  const manifest = JSON.stringify({ bundle_version: 'v', lines_total: 2, shards: ['/chunks-01.jsonl', '/chunks-02.jsonl'] }) + '\n';
  assert.deepStrictEqual(records(manifest, r => shards[r]).map(c => c.id), [ID_TOP, ID_STEPS]);
  assert.throws(() => records(manifest), /shard manifest/);
});

test('only a chunk that begins with a heading is anchored, as chunk- and 16 hex characters', () => {
  const [top, steps, later] = records(EXPORT);
  assert.deepStrictEqual([top, steps, later].map(anchored), [false, true, false]);
  assert.strictEqual(anchorOf(steps), 'chunk-abcdef0123456789');
  assert.strictEqual(anchored({ ...steps, type: 'image/png', section: 'attachment-1' }), false);
});

test('a page with the anchor opening the heading passes', () => {
  const html = '<main><h1>P</h1><h2 id="steps"><span id="chunk-abcdef0123456789"></span>Steps</h2></main>';
  const r = check(records(EXPORT), iri => (iri === IRI ? html : null));
  assert.deepStrictEqual(r, { failures: [], anchors: 1, pages: 1 });
});

test('a missing anchor, a misplaced one, a duplicated one and a missing page each fail', () => {
  const recs = records(EXPORT);
  const missing = check(recs, () => '<h2 id="steps">Steps</h2>');
  assert.strictEqual(missing.failures.length, 1);
  assert.match(missing.failures[0], /#chunk-abcdef0123456789 is not an anchor on the heading #steps/);
  const misplaced = check(recs, () => '<h2 id="when"><span id="chunk-abcdef0123456789"></span>When</h2><h2 id="steps">Steps</h2>');
  assert.strictEqual(misplaced.failures.length, 1);
  const twice = check(recs, () => '<h2 id="steps"><span id="chunk-abcdef0123456789"></span>Steps</h2><p id="chunk-abcdef0123456789"></p>');
  assert.match(twice.failures[0], /appears 2 times/);
  const noPage = check(recs, () => null);
  assert.strictEqual(noPage.failures.length, 3);
  assert.match(noPage.failures[0], /is not built/);
});

test('item heading ids are taken from the engine\'s headings, in order and at their level', () => {
  const ids = headingIds([{ level: 2, text: 'When', id: 'when' }, { level: 3, text: 'Foo/Bar', id: 'foobar' }], 'p.md');
  assert.strictEqual(ids.take(2, 'When'), 'when');
  assert.strictEqual(ids.take(3, 'Foo/Bar'), 'foobar');
  assert.doesNotThrow(() => ids.finish());
  const wrongLevel = headingIds([{ level: 2, text: 'When', id: 'when' }], 'p.md');
  assert.throws(() => wrongLevel.take(3, 'When'), /p\.md: the heading "When" \(level 3\) is not the engine's heading 1 "When" \(level 2\)/);
  const extra = headingIds([], 'p.md');
  assert.throws(() => extra.take(2, 'Steps'), /is not the engine's heading 1 \(AGSC-03-13\)/);
  const unread = headingIds([{ level: 2, text: 'When', id: 'when' }], 'p.md');
  assert.throws(() => unread.finish(), /rendered 0 of the engine's 1 headings/);
});

// Regression (PR #10 review): an item heading with punctuation. The site's own heading ids turn
// "Foo/Bar" into #foo-bar, while AGSC-03-13 drops the "/" and the chunk's section is #foobar, so the
// anchor of AGSC-06-28 had no heading to open and the build stopped on valid content.
test('an item heading with punctuation gets the id its chunk names (AGSC-03-13, AGSC-06-28)', () => {
  const markdown = require(path.join(ENGINE, 'src/knowledge/markdown.js'));
  const chunks = require(path.join(ENGINE, 'src/knowledge/chunks.js'));
  const html = require(path.join(ENGINE, 'src/distribution/html.js'));
  const body = 'Intro.\n\n## Foo/Bar\n\nText.\n\n### A.B (c) — `x_y`\n\nMore.\n\n## Foo/Bar\n\nAgain.\n';
  const sections = chunks.sections(body).map(s => s.section).filter(Boolean);
  assert.deepStrictEqual(sections, ['foobar', 'ab-c-xy', 'foobar-2']);
  const heads = markdown.headings(body);
  const ids = headingIds(heads, 'p.md');
  const rendered = heads.map(h => `<h${h.level} id="${ids.take(h.level, h.text)}">${h.text}</h${h.level}>`).join('\n');
  ids.finish();
  const recs = sections.map((section, k) => ({ id: String(k + 3).repeat(64), iri: IRI, item: 'p', section, ordinal: 0, type: 'text' }));
  const page = html.withChunkAnchors(rendered, html.chunkAnchors(recs).get('p'));
  assert.deepStrictEqual(check(recs, () => page), { failures: [], anchors: 3, pages: 1 });
  assert.match(page, /<h2 id="foobar"><span id="chunk-3{16}"><\/span>Foo\/Bar<\/h2>/);
});
