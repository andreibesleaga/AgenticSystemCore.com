'use strict';
// The byte layout of /llms.txt and /llms-full.txt (AGSC-06-13a), as a pure function so that
// scripts/check.js can run it against the specification's vectors disc-0006 and disc-0007.
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
    provenanceLines({ bundle: base, license: license_prose, terms, specVersion: spec_version, bundleVersion: bundle_version, generatedAt: generated_at }).join('\n'),
    `> ${description.replace(/\s*\n\s*/g, ' ')}`,
  ];
  const published = items.filter(it => it.status !== 'draft' && it.status !== 'retired' && it.type !== 'cluster');
  const primary = it => (it.clusters || [])[0];
  const line = it => `- [${it.title}](${it.iri}): ${it.description || it.title}`;
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
