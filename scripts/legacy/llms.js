'use strict';
// The byte layout of /llms.txt and /llms-full.txt (AGSC-06-13a), as a pure function so that
// scripts/check.js can run it against the specification's vectors disc-0006 and disc-0007.
const byCode = (a, b) => a < b ? -1 : a > b ? 1 : 0;
module.exports = function llmsFiles({ title, base, description, license_prose, terms, spec_version, generated_at, clusters, items }) {
  const head = [
    `# ${title}`,
    ['<!-- agsc:provenance', `bundle: ${base}`, `license: ${license_prose}`, `terms: ${terms}`, `spec_version: ${spec_version}`, `generated_at: ${generated_at}`, '-->'].join('\n'),
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
