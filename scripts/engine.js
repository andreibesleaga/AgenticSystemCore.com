'use strict';
// THE ENGINE BUILDS THIS BUNDLE (SITE-4, D110).
//
// Everything on this site whose bytes a rule pins, and which carries no design of its own, is
// now emitted by the reference engine rather than by scripts/build.js. This module is how: it
// materialises the repository's own Bundle — the configuration, content/, the Content Use Terms,
// the privacy notice and the security contact — in a scratch directory INSIDE this repository,
// runs `agsc build` there, and hands the emitted routes back as bytes.
//
// Why a scratch directory and not the repository root. AGSC-01-19 makes `build.out` a path
// relative to the Bundle root and the engine's FileSystem port refuses to write outside it, so an
// engine build started at the repository root would write over `www-next`, which is this
// generator's output. The scratch Bundle is a copy of the same inputs with `build.out` pointed at
// a directory of its own.
//
// Why INSIDE the repository. The content version of AGSC-04-25 is derived from the git log of the
// working tree the build runs in. A scratch Bundle under /tmp has no git history, so the version
// would fall to the build instant; under `dist/` (which .gitignore already excludes) git resolves
// the same repository and the same 16 commits, so the engine and this generator derive the same
// string.
//
// What is NOT taken from the engine, and why: every HTML page. The engine's page shell has no
// place for a stylesheet, an icon, a site header, a skip link or this site's footer — `shell()` in
// its `distribution/html.js` emits `<nav>`, `<main>` and a bare `<footer>` and nothing else — so
// an engine-built page of this site would be an unstyled document. Per-Bundle page templates are
// a specification item (SITE4-01), and until they exist the HTML stays this generator's.

const fs = require('fs'), path = require('path'), cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');

/** Copy one directory tree, files only, deterministically. */
function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const src = path.join(from, entry.name), dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(src, dst);
    else if (entry.isFile()) fs.copyFileSync(src, dst);
  }
}

const walk = d => fs.readdirSync(d, { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

/**
 * Run the engine over this repository's Bundle.
 *
 * @param {object} o
 * @param {string} o.engine       the engine repository's path
 * @param {object} o.config       the parsed agsc.config.json
 * @param {number} o.epoch        SOURCE_DATE_EPOCH, so the two builds share one instant
 * @param {string} o.privacy      the privacy notice, as Markdown (the engine's PRIVACY.md input)
 * @param {string} o.securityTxt  the authored RFC 9116 contact file (AGSC-06-36)
 * @returns {{files: Map<string, Buffer>, skipped: string[], findings: object[], version: string}}
 *   `files` is keyed by absolute route, `/chunks.jsonl` and the like.
 */
function build({ engine, config, epoch, privacy, securityTxt }) {
  const scratch = path.join(ROOT, 'dist', 'engine-bundle');
  fs.rmSync(scratch, { recursive: true, force: true });
  fs.mkdirSync(scratch, { recursive: true });

  copyTree(path.join(ROOT, 'content'), path.join(scratch, 'content'));
  fs.copyFileSync(path.join(ROOT, 'LICENSE-CONTENT'), path.join(scratch, 'LICENSE-CONTENT'));
  // The two AUTHORED inputs of the scratch Bundle name routes of the published site that the
  // scratch Bundle itself does not emit — the privacy notice links `/about/#contact` and the
  // security contact names `/docs/compliance/` as its policy. The engine refuses to emit a link
  // to a route it does not build (AGSC-E901), and it is right to: on the PUBLISHED site both
  // targets exist, but in this shadow they do not. So the shadow's copies carry the label without
  // the link, and its policy points at `/legal/`, which the shadow does emit. Neither file is
  // adopted from the engine — `/legal/` and `/.well-known/security.txt` are this generator's —
  // and no adopted route reads either of them, so nothing published depends on this.
  const unlinked = md => md.replace(/\[([^\]]+)\]\((\/[^)\s]*)\)/g, '$1');
  fs.writeFileSync(path.join(scratch, 'PRIVACY.md'), unlinked(privacy));
  fs.mkdirSync(path.join(scratch, '.well-known'), { recursive: true });
  fs.writeFileSync(path.join(scratch, '.well-known', 'security.txt'),
    securityTxt.replace(/^Policy: .*$/mu, `Policy: ${String((config.site || {}).base || '').replace(/\/?$/, '/')}legal/`));
  // The same configuration, with the output directory pointed inside the scratch Bundle. The
  // `x-` extension member this site carries is passed through untouched: it is the operator's.
  const cfg = JSON.parse(JSON.stringify(config));
  cfg.build = { out: 'out' };
  const sorted = v => (v === null || typeof v !== 'object' || Array.isArray(v) ? v
    : Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])));
  fs.writeFileSync(path.join(scratch, 'agsc.config.json'), JSON.stringify(sorted(cfg), null, 2) + '\n');

  const r = cp.spawnSync(process.execPath, [path.join(engine, 'bin', 'agsc.js'), 'build', '--json'], {
    cwd: scratch,
    encoding: 'utf8',
    env: { ...process.env, SOURCE_DATE_EPOCH: String(epoch) },
    maxBuffer: 256 * 1024 * 1024,
  });
  // `--json` writes the AGSC-09-11 envelope and the notes to STDERR, one JSON document per line
  // among plain `wrote:`/`skipped:` notes; stdout carries nothing.
  const lines = `${r.stdout || ''}\n${r.stderr || ''}`.split('\n').filter(Boolean);
  let envelope = null;
  for (const line of lines) { try { const v = JSON.parse(line); if (v && v.schema === 'agsc.diagnostics.v1') envelope = v; } catch { /* a note, not JSON */ } }
  const skipped = lines.filter(l => l.startsWith('skipped: ')).map(l => l.slice(9));
  if (envelope === null) throw new Error(`the engine build produced no diagnostics envelope:\n${r.stdout}\n${r.stderr}`);
  if (envelope.status !== 'pass') {
    const errs = (envelope.findings || []).filter(f => f.severity === 'error').map(f => `${f.code} ${f.file}: ${f.message}`);
    throw new Error(`the engine refused to build this Bundle:\n  ${errs.join('\n  ')}`);
  }

  const out = path.join(scratch, 'out');
  const files = new Map();
  for (const f of walk(out).sort()) files.set('/' + path.relative(out, f).split(path.sep).join('/'), fs.readFileSync(f));

  // The `llm-context` memory adapter (AGSC-01-26a): two ADDITIVE, DERIVED, NON-NORMATIVE files
  // the engine deliberately writes OUTSIDE `build.out` and tells its caller to declare with a
  // `related[]` link of relation `alternate` (AGSC-06-35). They are not part of the route set and
  // are published here as deployed files, which AGSC-06-01 as amended at rc.6 admits: "this route
  // set bounds what a writer MUST emit; it is not a bound on every file that may sit in the
  // deployed directory".
  const e = cp.spawnSync(process.execPath, [path.join(engine, 'bin', 'agsc.js'), 'export', '--to', 'llm-context', '--json'], {
    cwd: scratch, encoding: 'utf8', env: { ...process.env, SOURCE_DATE_EPOCH: String(epoch) }, maxBuffer: 256 * 1024 * 1024,
  });
  if (e.status !== 0) throw new Error(`the engine refused to export llm-context:\n${e.stdout}\n${e.stderr}`);
  const exports_ = new Map();
  const exportDir = path.join(scratch, 'dist', 'export', 'llm-context');
  for (const f of walk(exportDir).sort()) exports_.set(path.relative(exportDir, f).split(path.sep).join('/'), fs.readFileSync(f));

  return { files, exports: exports_, skipped, findings: envelope.findings || [], version: envelope.version };
}

module.exports = { build };
