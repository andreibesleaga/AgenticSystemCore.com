'use strict';
// Tests of scripts/chunk-anchors.js: reading the chunk export (lines, and the shard manifest of
// AGSC-06-31) and checking the anchors of AGSC-06-28 on built pages. No engine, no network.
const test = require('node:test');
const assert = require('node:assert');
const { records, check, anchored, anchorOf } = require('./chunk-anchors.js');

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
