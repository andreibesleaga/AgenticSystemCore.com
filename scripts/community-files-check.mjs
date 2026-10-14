#!/usr/bin/env node
// The community files of a node repository route people the way the project decided.
//
//   node scripts/community-files-check.mjs [<repository root>] [--repo <owner>/<name>] [--json]
//
// With no argument it checks this repository. Given another root, it checks that one
// (the demonstration node: `node scripts/community-files-check.mjs ../agsc-demo-node
// --repo andreibesleaga/agsc-demo-node`). The GitHub repository whose private reporting
// the files must name is `--repo`, or else the `pr` target of `contribute` in the root's
// `agsc.config.json`.
//
// What it asserts (GitHub shows these files on the repository's pages, so a missing or
// wrong file sends a reporter to the wrong place):
//   1. SECURITY.md names the repository's private vulnerability reporting first and the
//      contact page second, links the engine's policy, and every sentence that mentions
//      opening an issue says not to;
//   2. CONTRIBUTING.md names the `CA-v1` sign-off for outside contributions and links the
//      contributor agreement;
//   3. CODE_OF_CONDUCT.md points to the engine's code of conduct;
//   4. the issue chooser sends a security report to private reporting, at least one issue
//      form exists, and the pull-request template carries the sign-off reminder;
//   5. README.md names the `CA-v1` sign-off and links SECURITY.md.
//
// Node built-ins only; reads files, writes nothing, no network. Exit 0 pass, 1 fail, 2 usage.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE = 'https://github.com/andreibesleaga/agentic-system-core/blob/main/';
const CONTACT = 'https://andreibesleaga.com/contact/';

const args = process.argv.slice(2);
const json = args.includes('--json');
const repoAt = args.indexOf('--repo');
let repo = repoAt >= 0 ? args[repoAt + 1] : undefined;
const positional = args.filter((a, i) => !a.startsWith('--') && !(repoAt >= 0 && i === repoAt + 1));
const ROOT = path.resolve(positional[0] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));

if (!repo) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'agsc.config.json'), 'utf8'));
    const pr = (cfg.contribute || []).find((c) => c && c.mode === 'pr' && typeof c.target === 'string');
    const m = pr && /^https:\/\/github\.com\/([^/]+\/[^/]+?)\/?$/.exec(pr.target);
    if (m) repo = m[1];
  } catch { /* no configuration: --repo is required */ }
}
if (!repo || !/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo)) {
  process.stderr.write('community-files-check: name the repository with --repo <owner>/<name>\n');
  process.exit(2);
}
const ADVISORY = `https://github.com/${repo}/security/advisories/new`;

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); return cond; };
const read = (rel) => {
  const full = path.join(ROOT, rel);
  if (!ok(fs.existsSync(full) && fs.statSync(full).isFile(), `${rel}: missing`)) return null;
  return fs.readFileSync(full, 'utf8').split(/\s+/).join(' ');
};
const sentencesWith = (text, re) => [...text.matchAll(re)].map((m) => {
  const start = text.lastIndexOf('. ', m.index) + 1;
  const end = text.indexOf('. ', m.index + m[0].length);
  return text.slice(start, end < 0 ? text.length : end);
});

const security = read('SECURITY.md');
if (security !== null) {
  const priv = security.indexOf('private vulnerability reporting');
  const contact = security.indexOf(CONTACT);
  ok(priv >= 0, 'SECURITY.md: private vulnerability reporting is not named');
  ok(contact >= 0, 'SECURITY.md: the contact page is not named');
  ok(priv < 0 || contact < 0 || priv < contact, 'SECURITY.md: private reporting must come before the contact page');
  ok(security.includes(ADVISORY), `SECURITY.md: no link to ${ADVISORY}`);
  ok(security.includes(`${ENGINE}SECURITY.md`), "SECURITY.md: the engine's policy is not linked");
  const issue = sentencesWith(security, /\bopen (?:a public|an|a) issue\b/gi);
  ok(issue.length > 0, 'SECURITY.md: the sentence that says not to open a public issue is missing');
  for (const s of issue) ok(/\b(?:not|never)\b/i.test(s), `SECURITY.md: sends a reporter to an issue: "${s}"`);
}

const contributing = read('CONTRIBUTING.md');
if (contributing !== null) {
  ok(contributing.includes('Signed-off-by:') && contributing.includes('(CA-v1)'), 'CONTRIBUTING.md: the CA-v1 sign-off line is not shown');
  ok(/\boutside contributions?\b/i.test(contributing), 'CONTRIBUTING.md: does not say the sign-off is for outside contributions');
  ok(contributing.includes(`${ENGINE}CONTRIBUTOR-AGREEMENT`), 'CONTRIBUTING.md: the contributor agreement is not linked');
}

const conduct = read('CODE_OF_CONDUCT.md');
if (conduct !== null) ok(conduct.includes(`${ENGINE}CODE_OF_CONDUCT.md`), "CODE_OF_CONDUCT.md: the engine's code of conduct is not linked");

const chooser = read('.github/ISSUE_TEMPLATE/config.yml');
if (chooser !== null) ok(chooser.includes(ADVISORY), '.github/ISSUE_TEMPLATE/config.yml: security reports are not sent to private reporting');
const formDir = path.join(ROOT, '.github', 'ISSUE_TEMPLATE');
const forms = fs.existsSync(formDir) ? fs.readdirSync(formDir).filter((f) => f.endsWith('.yml') && f !== 'config.yml').sort() : [];
ok(forms.length > 0, '.github/ISSUE_TEMPLATE/: no issue form');
for (const f of forms) {
  const body = fs.readFileSync(path.join(formDir, f), 'utf8');
  ok(/^name: \S/m.test(body) && /^body:$/m.test(body), `.github/ISSUE_TEMPLATE/${f}: not an issue form (name and body)`);
}
const prTemplate = read('.github/pull_request_template.md');
if (prTemplate !== null) ok(prTemplate.includes('(CA-v1)'), '.github/pull_request_template.md: no sign-off reminder');

const readme = read('README.md');
if (readme !== null) {
  ok(readme.includes('CA-v1'), 'README.md: the CA-v1 sign-off is not named');
  ok(readme.includes('](SECURITY.md)'), 'README.md: SECURITY.md is not linked');
}

if (json) process.stdout.write(JSON.stringify({ root: ROOT, repo, ok: fails.length === 0, fails }, null, 2) + '\n');
else if (fails.length) process.stderr.write(fails.map((f) => `community-files-check: ${f}\n`).join(''));
else process.stdout.write(`community-files-check: pass (${repo})\n`);
process.exit(fails.length ? 1 : 0);
