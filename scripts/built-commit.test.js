'use strict';
// Tests of scripts/built-commit.js, the part of the gate that finds the commit a committed output
// was built from. Each test makes a small git repository in a temporary folder, with fixed
// author and committer dates, so the results never depend on the clock or on this checkout.
//
//   node --test scripts/built-commit.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const builtCommit = require('./built-commit.js');

const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'test', GIT_COMMITTER_NAME: 'test',
  GIT_AUTHOR_EMAIL: ['test', 'localhost'].join('@'), GIT_COMMITTER_EMAIL: ['test', 'localhost'].join('@'),
  GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull,
};
const git = (dir, ...args) => cp.execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: ENV, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };

// The recorded content version, as a build writes it into the discovery document.
const linkset = version => JSON.stringify({ linkset: [{ anchor: 'https://example.org/', describedby: [{ 'agsc-bundle-version': [version], href: 'https://example.org/graph.jsonld' }] }] });

/** A repository with one source commit S (tagged), its output committed alone as W. */
function repository(t, tag = 'vsite-2026-01-01') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'built-commit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(dir, '-c', 'init.defaultBranch=main', 'init', '-q');
  write(dir, 'site/page.md', 'one\n');
  write(dir, '.gitignore', 'dist/\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'first');
  write(dir, 'site/page.md', 'two\n');
  git(dir, 'commit', '-q', '-am', 'sources');
  git(dir, 'tag', '-a', tag, '-m', 'content');
  const S = git(dir, 'rev-parse', 'HEAD');
  write(dir, 'www/.well-known/knowledge-linkset', linkset(tag));
  write(dir, 'www/index.html', '<p>two</p>\n');
  git(dir, 'add', '-A', 'www');
  git(dir, 'commit', '-q', '-m', 'output');
  const W = git(dir, 'rev-parse', 'HEAD');
  return { dir, S, W, out: path.join(dir, 'www') };
}

test('the recorded version is read from the discovery document of the output', t => {
  const { out } = repository(t);
  assert.equal(builtCommit.recordedVersion(out), 'vsite-2026-01-01');
  assert.equal(builtCommit.recordedVersion(path.join(out, 'missing')), null);
  fs.writeFileSync(path.join(out, '.well-known', 'knowledge-linkset'), '{"linkset":[{}]}');
  assert.equal(builtCommit.recordedVersion(out), null);
});

test('a content version names its commit: a tag, the twelve-character hash, or nothing', t => {
  const { dir, S, W } = repository(t);
  assert.equal(builtCommit.commitOf(dir, 'vsite-2026-01-01'), S);
  assert.equal(builtCommit.commitOf(dir, `vsite-2026-01-01+1.g${W.slice(0, 12)}`), W);
  assert.equal(builtCommit.commitOf(dir, `0.0.0+3.g${W.slice(0, 12)}`), W);
  assert.equal(builtCommit.commitOf(dir, '0.0.0+20260101T000000Z'), null);
  assert.equal(builtCommit.commitOf(dir, 'v9.9.9+1.g0123456789ab'), null);
  assert.equal(builtCommit.commitOf(dir, ''), null);
});

test('an output committed on its own is checked at the commit it was built from', t => {
  const { dir, S, W, out } = repository(t);
  const r = builtCommit.resolve({ root: dir, out });
  assert.equal(r.recorded, 'vsite-2026-01-01');
  assert.equal(r.head, W);
  assert.equal(r.commit, S);
  assert.deepEqual(r.differs, []);
  assert.equal(r.use, true);
});

test('the same holds on a merge commit that brings the output in', t => {
  const { dir, S, out } = repository(t);
  git(dir, 'checkout', '-q', '-b', 'other', 'HEAD~2');
  git(dir, 'merge', '-q', '--no-ff', 'main', '-m', 'merge');
  const r = builtCommit.resolve({ root: dir, out });
  assert.equal(r.commit, S);
  assert.equal(r.use, true);
});

test('a source change after the build is not hidden: the commit is not used', t => {
  const { dir, S, out } = repository(t);
  write(dir, 'site/page.md', 'three\n');
  git(dir, 'commit', '-q', '-am', 'a change without a rebuild');
  const r = builtCommit.resolve({ root: dir, out });
  assert.equal(r.commit, S);
  assert.deepEqual(r.differs, ['site/page.md']);
  assert.equal(r.use, false);
});

test('an uncommitted or untracked source file is not hidden either', t => {
  const { dir, out } = repository(t);
  write(dir, 'site/page.md', 'edited\n');
  assert.deepEqual(builtCommit.resolve({ root: dir, out }).differs, ['site/page.md']);
  git(dir, 'checkout', '-q', '--', 'site/page.md');
  write(dir, 'site/new.md', 'new\n');
  assert.deepEqual(builtCommit.resolve({ root: dir, out }).differs, ['site/new.md']);
  fs.rmSync(path.join(dir, 'site/new.md'));
  write(dir, 'dist/ignored.txt', 'ignored\n');
  assert.equal(builtCommit.resolve({ root: dir, out }).use, true);
});

test('an output built at HEAD, or one that names no commit, is built where it is', t => {
  const { dir, W, out } = repository(t);
  fs.writeFileSync(path.join(out, '.well-known', 'knowledge-linkset'), linkset(`vsite-2026-01-01+1.g${W.slice(0, 12)}`));
  let r = builtCommit.resolve({ root: dir, out });
  assert.equal(r.commit, W);
  assert.equal(r.use, false);
  fs.writeFileSync(path.join(out, '.well-known', 'knowledge-linkset'), linkset('0.0.0+20260101T000000Z'));
  r = builtCommit.resolve({ root: dir, out });
  assert.equal(r.commit, null);
  assert.equal(r.use, false);
});

test('the scratch checkout has the commit, its first-parent history and every tag, and the source repository is untouched', t => {
  const { dir, S, out } = repository(t);
  const before = [git(dir, 'status', '--porcelain'), git(dir, 'for-each-ref'), git(dir, 'rev-parse', 'HEAD')];
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'built-commit-at-'));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const at = path.join(scratch, 'repo');
  builtCommit.checkoutAt(dir, S, at);
  assert.equal(git(at, 'rev-parse', 'HEAD'), S);
  assert.equal(fs.readFileSync(path.join(at, 'site/page.md'), 'utf8'), 'two\n');
  assert.equal(fs.existsSync(path.join(at, 'www')), false);
  const shas = r => git(r, 'log', '--first-parent', '--reverse', '--format=%H', 'HEAD').split('\n');
  assert.deepEqual(shas(at), git(dir, 'log', '--first-parent', '--reverse', '--format=%H', S).split('\n'));
  assert.match(git(at, 'log', '-1', '--format=%D', S), /tag: vsite-2026-01-01/);
  assert.deepEqual([git(dir, 'status', '--porcelain'), git(dir, 'for-each-ref'), git(dir, 'rev-parse', 'HEAD')], before);
  assert.equal(builtCommit.recordedVersion(out), 'vsite-2026-01-01');
});
