'use strict';
// The in-page anchors of the chunk export (AGSC-06-28, AGSC-06-30).
//
// An agent cites a chunk as its item IRI followed by `#chunk-` and the first 16 hex characters of
// the chunk's `id`, and the item page MUST carry that anchor on the chunk's heading; a chunk that
// does not begin with a heading (chunk 0, a later piece of a long section, a cluster's chunk, an
// attachment's chunk) is cited at the top of its page. The engine places the anchors
// (`src/distribution/html.js`, `chunkAnchors` and `withChunkAnchors`): an empty `<span>` opening
// the heading, so the heading keeps its own `id`. scripts/build.js calls those two functions over
// the engine's own `/chunks.jsonl`; this module reads the export back and checks the built pages
// without the engine, so a page that lost an anchor is found whatever placed it.

/**
 * The chunk records of a `/chunks.jsonl`: its lines, or, when it is the shard manifest of
 * AGSC-06-31, the lines of each shard in manifest order.
 *
 * @param {string} text the bytes of `/chunks.jsonl`, as text
 * @param {(route: string) => string} [readShard] the text of a shard, by its route
 * @returns {Array<object>}
 */
function records(text, readShard) {
  const lines = src => String(src).split('\n').filter(l => l.trim() !== '').map(l => JSON.parse(l));
  const all = lines(text);
  const manifest = all.length === 1 && Array.isArray(all[0].shards) && typeof all[0].id !== 'string' ? all[0] : null;
  if (manifest === null) return all;
  if (typeof readShard !== 'function') throw new Error('/chunks.jsonl is a shard manifest and no shard reader was given');
  return manifest.shards.flatMap(route => lines(readShard(route)));
}

/** AGSC-06-30: only a chunk that begins with a heading has an anchor of its own. */
const anchored = c => c.section !== '' && c.ordinal === 0 && c.type === 'text';

/** AGSC-06-28: the anchor's id, without the `#`. */
const anchorOf = c => `chunk-${String(c.id).slice(0, 16)}`;

/**
 * Every failure of the built pages against the chunk export: an item page that is missing, and a
 * heading chunk whose anchor is not an empty `<span>` opening the `<h2>` or `<h3>` whose `id` is
 * the chunk's `section`, exactly once on its page.
 *
 * @param {Array<object>} recs the chunk records
 * @param {(iri: string) => (string|null)} pageOf the HTML of the item page at an IRI, or null
 * @returns {{failures: string[], anchors: number, pages: number}}
 */
function check(recs, pageOf) {
  const failures = [];
  const pages = new Map();
  let anchors = 0;
  for (const c of recs) {
    if (!pages.has(c.iri)) pages.set(c.iri, pageOf(c.iri));
    const html = pages.get(c.iri);
    if (html == null) { failures.push(`chunk ${c.id}: its item page ${c.iri} is not built`); continue; }
    if (!anchored(c)) continue;
    const id = anchorOf(c);
    const span = `<span id="${id}"></span>`;
    const placed = new RegExp(`<h[23] id="${c.section.replace(/[^a-z0-9-]/g, '\\$&')}">${span}`).test(html);
    const count = html.split(`id="${id}"`).length - 1;
    if (!placed) failures.push(`chunk ${c.id}: ${c.iri}#${id} is not an anchor on the heading #${c.section} (AGSC-06-28)`);
    else if (count !== 1) failures.push(`chunk ${c.id}: the id ${id} appears ${count} times on ${c.iri}`);
    else anchors++;
  }
  return { failures, anchors, pages: pages.size };
}

/**
 * AGSC-03-13 on an item page: the ids of the body's headings, in document order, as the engine
 * computes them (`headings()` of the engine's `src/knowledge/markdown.js`, the same algorithm that
 * gives each chunk its `section`). The page's renderer takes one id per heading it meets; a
 * heading the engine does not have at that place and level, or one the renderer never reached,
 * is an error, so a heading a chunk names can never be rendered under another id.
 *
 * @param {Array<{level:number, text:string, id:string}>} headings the engine's headings of the body
 * @param {string} where the item, for the error message
 * @returns {{take: (level: number, text: string) => string, finish: () => void}}
 */
function headingIds(headings, where) {
  let at = 0;
  return {
    take(level, text) {
      const h = headings[at];
      at += 1;
      if (!h || h.level !== level) {
        throw new Error(`${where}: the heading "${text}" (level ${level}) is not the engine's heading ${at}${h ? ` "${h.text}" (level ${h.level})` : ''} (AGSC-03-13)`);
      }
      return h.id;
    },
    finish() {
      if (at !== headings.length) throw new Error(`${where}: the page rendered ${at} of the engine's ${headings.length} headings (AGSC-03-13)`);
    },
  };
}

module.exports = { records, check, anchored, anchorOf, headingIds };
