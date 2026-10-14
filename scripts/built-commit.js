'use strict';
// THE COMMIT A COMMITTED OUTPUT WAS BUILT FROM.
//
// The content version of AGSC-04-25 names the commit a build ran on: the tag of that commit, or
// `<tag>+<n>.g<hash>` with twelve characters of its hash. The output is committed AFTER the build,
// so the commit that holds `www/` is always one commit later than the one the output names, and a
// fresh build at that later commit derives another content version. Comparing the two would fail
// on every commit that carries its own output. scripts/check.js therefore asks this module where
// the committed output says it was built, and builds there:
//
//   - `recordedVersion(out)`: the content version the output records, read from the
//     `agsc-bundle-version` attribute of its discovery document (AGSC-06-08);
//   - `commitOf(root, version)`: the commit that version names, through its tag or its hash;
//   - `resolve({root, out})`: that commit, and every path in which the working tree differs
//     from it outside the output folder; the commit is used only when there is none, so a source
//     changed after the build is never hidden (the build at HEAD then differs, and the gate fails);
//   - `checkoutAt(root, commit, dir)`: a scratch repository at that commit, sharing the objects
//     and the tags of this one, so the build there reads the same git log. It writes nothing into
//     the source repository.
//
// Node >= 22 stdlib only.
const fs = require('fs'), path = require('path'), cp = require('child_process');

const run = (dir, args) => cp.spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const lines = s => String(s || '').split('\n').filter(Boolean);

/** The content version recorded by the output in `out`, or null. */
function recordedVersion(out) {
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(out, '.well-known', 'knowledge-linkset'), 'utf8'));
    const link = ((doc.linkset || [])[0] || {}).describedby;
    const value = Array.isArray(link) && link[0] ? link[0]['agsc-bundle-version'] : undefined;
    const version = Array.isArray(value) ? value[0] : value;
    return typeof version === 'string' && version !== '' ? version : null;
  } catch { return null; }
}

/** The full hash of the commit a content version names, or null (AGSC-04-25 branches 1 to 3). */
function commitOf(root, version) {
  if (typeof version !== 'string' || version === '') return null;
  const peel = ref => { const r = run(root, ['rev-parse', '-q', '--verify', `${ref}^{commit}`]); return r.status === 0 ? r.stdout.trim() : null; };
  const tagged = peel(`refs/tags/${version}`);
  if (tagged) return tagged;
  const m = /\+[0-9]+\.g([0-9a-f]{12})$/.exec(version);
  return m ? peel(m[1]) : null;
}

/**
 * Where the committed output in `out` was built, and whether a build there stands for this tree.
 *
 * @returns {{recorded: string|null, commit: string|null, head: string|null, differs: string[], use: boolean}}
 *   `use` is true only when the output names a commit other than HEAD and the working tree differs
 *   from that commit in nothing but the output folder (tracked or untracked, ignored files aside).
 */
function resolve({ root, out }) {
  const recorded = recordedVersion(out);
  const commit = commitOf(root, recorded);
  const h = run(root, ['rev-parse', '-q', '--verify', 'HEAD^{commit}']);
  const head = h.status === 0 ? h.stdout.trim() : null;
  let differs = [];
  if (commit && commit !== head) {
    const outside = ['--', '.', `:(exclude)${path.relative(root, out).split(path.sep).join('/')}`];
    const changed = run(root, ['diff', '--name-only', '--no-renames', commit, ...outside]);
    const untracked = run(root, ['ls-files', '--others', '--exclude-standard', ...outside]);
    differs = changed.status === 0 && untracked.status === 0
      ? [...new Set([...lines(changed.stdout), ...lines(untracked.stdout)])].sort()
      : ['(git could not compare the working tree with that commit)'];
  }
  return { commit, differs, head, recorded, use: Boolean(commit && head && commit !== head && differs.length === 0) };
}

/** A scratch repository in `dir` (which must not exist) checked out at `commit` of `root`. */
function checkoutAt(root, commit, dir) {
  const must = (where, args, input) => {
    const r = cp.spawnSync('git', ['-C', where, ...args], { encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
    return r.stdout;
  };
  const common = path.resolve(root, must(root, ['rev-parse', '--git-common-dir']).trim());
  fs.mkdirSync(dir, { recursive: true });
  must(dir, ['-c', 'init.defaultBranch=built', 'init', '-q']);
  fs.writeFileSync(path.join(dir, '.git', 'objects', 'info', 'alternates'), `${path.join(common, 'objects')}\n`);
  if (fs.existsSync(path.join(common, 'shallow'))) fs.copyFileSync(path.join(common, 'shallow'), path.join(dir, '.git', 'shallow'));
  const tags = lines(must(root, ['for-each-ref', '--format=create %(refname) %(objectname)', 'refs/tags']));
  if (tags.length) must(dir, ['update-ref', '--stdin'], `${tags.join('\n')}\n`);
  must(dir, ['-c', 'advice.detachedHead=false', 'checkout', '-q', '--detach', commit]);
  return dir;
}

module.exports = { recordedVersion, commitOf, resolve, checkoutAt };
