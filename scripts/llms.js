'use strict';
// The byte layout of /llms.txt and /llms-full.txt (AGSC-06-13a), as a pure function so that
// scripts/check.js can run it against the specification's vectors disc-0024 and disc-0025 (the 1.1
// layout: the title, then the summary, then the provenance block, as llms.txt v2 orders them; in a
// link line the backslash, `[`, `]` and `(` of the title and the description are escaped).
const byCode = (a, b) => a < b ? -1 : a > b ? 1 : 0;
// The nine lines of the AGSC-06-15 provenance block are NOT written here. They are the ENGINE's
// own `knowledge/provenance-header.js#provenanceLines`, injected by the caller, so that the
// `bundle_version:` and `assistance:` lines rc.6 added — and any line a later candidate adds —
// reach this site without anybody editing this file. The caller passes it; there is no fallback,
// because a second copy of the block is exactly the drift the injection exists to prevent.
module.exports = function llmsFiles({ title, base, description, license_prose, terms, spec_version, bundle_version, generated_at, clusters, items, provenanceLines }) {
  if (typeof provenanceLines !== 'function') throw new Error('llms: provenanceLines (the engine\'s own) is required');
  const head = [
    `# ${title}`,
    `> ${description.replace(/\s*\n\s*/g, ' ')}`,
    provenanceLines({ bundle: base, license: license_prose, terms, specVersion: spec_version, bundleVersion: bundle_version, generatedAt: generated_at }).join('\n'),
  ];
  const published = items.filter(it => it.status !== 'draft' && it.status !== 'retired' && it.type !== 'cluster');
  const primary = it => (it.clusters || [])[0];
  const escapeLink = t => t.replace(/[\\[\](]/g, c => `\\${c}`);
  const line = it => `- [${escapeLink(it.title)}](${it.iri}): ${escapeLink(it.description || it.title)}`;
  const blocks = [], order = [];
  const bySlug = (a, b) => byCode(a.slug, b.slug);
  for (const c of [...clusters].sort(bySlug)) {
    const m = published.filter(it => primary(it) === c.slug).sort(bySlug);
    if (m.length) { blocks.push(`## ${c.title}\n\n` + m.map(line).join('\n')); order.push(...m); }
  }
  const other = published.filter(it => !primary(it)).sort(bySlug);
  if (other.length) { blocks.push('## Other\n\n' + other.map(line).join('\n')); order.push(...other); }
  const index = [...head, ...blocks].join('\n\n') + '\n';
  const full = index + order.map(it => `\n## ${it.title}\n<!-- agsc:item ${it.iri} -->\n\`\`\`text agsc-content\n${(it.body || '').replace(/\n*$/, '\n')}\`\`\`\n`).join('');
  return { index, full };
};
