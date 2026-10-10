#!/usr/bin/env node
// THE LIVE CHECK of the two public nodes: this site and the demonstration node. Read-only: it
// sends GET requests and runs the released checkers, and it writes nothing anywhere except its own
// report. `.github/workflows/live.yml` runs it once a week and on request; it is not a required
// check, because what it reads (the served bytes, the edge network's headers, the registries,
// w3id) can change without any commit here.
//
//   node scripts/live-check.mjs [--require-checkers] [--www <dir>]
//   SITE_LIVE_NODE_CHECKER=<path of tools/validate-wellknown from the npm package>
//   SITE_LIVE_PYTHON=<a Python with the PyPI package installed>
//
// What it checks, on each node:
//   - the served bytes of the pages listed below equal the committed output (this site), and no
//     page carries a rewritten e-mail text (`__cf_email__`) or a script from `/cdn-cgi/`;
//   - the response headers the nodes promise: the `describedby` Link and the page policy on the
//     home page, HSTS on every response, and on the discovery document its media type with the
//     profile, the profile Link, an ETag and the cross-origin headers (AGSC-06-17, AGSC-11-03,
//     AGSC-11-05);
//   - no Network Error Logging (`NEL`, `Report-To`) or speculation rules header from the edge
//     network, unless the node's own statements name it (then a warning);
//   - `/.well-known/security.txt` expires more than 60 days ahead (RFC 9116 §2.5.5);
//   - `/.well-known/sustainability-data` reports a month at most two months old;
// and once: the w3id addresses answer 303, npm and PyPI each name a version of
// `agentic-system-core` with files, and both released checkers pass Level 2 on both nodes with the
// mutual check (AGSC-10-12).
//
// Exit 0 when nothing failed (warnings allowed), 1 otherwise. Node >= 22 stdlib only.
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const NODES = [
  {
    name: 'main site',
    base: 'https://agenticsystemcore.com/',
    pages: ['/', '/docs/guides/mode-0/'],
    committed: { '/': 'index.html', '/docs/guides/mode-0/': 'docs/guides/mode-0/index.html' },
    statements: ['/legal/', '/docs/compliance/'],
  },
  {
    name: 'demonstration node',
    base: 'https://patterns.agenticsystemcore.com/',
    pages: ['/'],
    committed: {},
    statements: ['/legal/'],
  },
];
export const W3ID = {
  base: 'https://w3id.org/agentic-system-core/',
  paths: ['ns', 'ns/1.0.0', 'profile/agentic-knowledge', 'rel', 'specs/mcp/'],
  target: 'https://agenticsystemcore.com/',
};
export const REGISTRIES = {
  npm: 'https://registry.npmjs.org/agentic-system-core',
  pypi: 'https://pypi.org/pypi/agentic-system-core/json',
};
const PROFILE = 'https://w3id.org/agentic-system-core/profile/agentic-knowledge';
const DISCOVERY = '/.well-known/knowledge-linkset';
// The edge network's own headers, and the words a node's statements use when they name them.
const EDGE_HEADERS = [
  { header: 'nel', named: /network error logging/i },
  { header: 'report-to', named: /network error logging/i },
  { header: 'speculation-rules', named: /speculation rules/i },
];
const EXPIRES_DAYS = 60;
const REPORT_MONTHS = 2;
const DAY = 24 * 60 * 60 * 1000;

/**
 * Run every check with the reader given. Nothing here reads the network, the clock or the
 * environment by itself: `get` reads one address, `now` is the instant, `committedRoot` is the
 * committed output folder and `checkers` runs the two released checkers (or is null).
 *
 * @param {{get: (url: string) => Promise<{status: number, headers: object, body: Buffer}>,
 *   now: Date, committedRoot: string, checkers: (() => Promise<Array<{name: string, ok: boolean, detail: string}>>)|null,
 *   requireCheckers?: boolean}} o
 * @returns {Promise<{results: Array<{node: string, check: string, severity: 'pass'|'warn'|'fail', message: string}>}>}
 */
export async function liveCheck({ get, now, committedRoot, checkers, requireCheckers = true }) {
  const results = [];
  const add = (node, check, severity, message) => results.push({ check, message, node, severity });
  const read = async url => { try { return await get(url); } catch (e) { return { error: e && e.message ? e.message : String(e) }; } };

  for (const node of NODES) {
    const at = route => new URL(route.replace(/^\//, ''), node.base).href;
    const seen = new Map(); // route -> response, for the edge-header and HSTS checks
    const fetchRoute = async route => { const r = await read(at(route)); seen.set(route, r); return r; };
    const usable = (route, r, check) => {
      if (r.error !== undefined) { add(node.name, check, 'fail', `${route}: cannot be read: ${r.error}`); return false; }
      if (r.status !== 200) { add(node.name, check, 'fail', `${route}: answers ${r.status}, not 200`); return false; }
      return true;
    };

    // Pages: the served bytes, the home page's headers.
    for (const route of node.pages) {
      const r = await fetchRoute(route);
      if (!usable(route, r, 'page')) continue;
      const body = r.body.toString('utf8');
      const h = r.headers;
      if (!/^text\/html\b/i.test(h['content-type'] || '')) add(node.name, 'headers', 'fail', `${route}: Content-Type ${h['content-type'] || 'missing'}, not text/html`);
      if (!/default-src 'none'/.test(h['content-security-policy'] || '')) add(node.name, 'headers', 'fail', `${route}: no Content-Security-Policy header with default-src 'none'`);
      if (route === '/') {
        const describedby = (h.link || '').split(/,(?=\s*<)/).some(l => l.includes(`<${DISCOVERY}>`) && /rel="?describedby"?/.test(l));
        add(node.name, 'headers', describedby ? 'pass' : 'fail', describedby ? '/: Link rel="describedby" to the discovery document' : `/: no Link header with rel="describedby" to ${DISCOVERY}`);
      }
      const injected = [];
      if (body.includes('__cf_email__')) injected.push('carries __cf_email__ (the edge rewrote an e-mail-shaped text)');
      if (body.includes('/cdn-cgi/')) injected.push('loads /cdn-cgi/ (a script the edge added)');
      for (const m of injected) add(node.name, 'served bytes', 'fail', `${route}: ${m}`);
      const file = node.committed[route];
      if (file !== undefined) {
        const local = path.join(committedRoot, file);
        if (!fs.existsSync(local)) add(node.name, 'served bytes', 'fail', `${route}: no committed copy at ${file}`);
        else {
          const committed = fs.readFileSync(local);
          if (committed.equals(r.body)) add(node.name, 'served bytes', 'pass', `${route}: the served bytes equal the committed ${file}`);
          else {
            let i = 0; while (i < committed.length && i < r.body.length && committed[i] === r.body[i]) i++;
            add(node.name, 'served bytes', 'fail', `${route}: the served bytes differ from the committed ${file} (from byte ${i}; served ${r.body.length} bytes, committed ${committed.length})`);
          }
        }
      } else if (injected.length === 0) add(node.name, 'served bytes', 'pass', `${route}: nothing added by the edge`);
    }

    // The discovery document's headers.
    {
      const r = await fetchRoute(DISCOVERY);
      if (usable(DISCOVERY, r, 'headers')) {
        const h = r.headers;
        const type = h['content-type'] || '';
        const problems = [];
        if (!/^application\/linkset\+json\b/i.test(type) || !type.includes(PROFILE)) problems.push(`Content-Type ${type || 'missing'}, not application/linkset+json with the profile`);
        if (!(h.link || '').includes(`<${PROFILE}>`) || !/rel="?profile"?/.test(h.link || '')) problems.push('no Link header with rel="profile"');
        if (!h.etag) problems.push('no ETag header');
        if ((h['access-control-allow-origin'] || '') !== '*') problems.push('no Access-Control-Allow-Origin: *');
        const exposed = (h['access-control-expose-headers'] || '').toLowerCase().split(/\s*,\s*/);
        for (const name of ['link', 'etag', 'content-type']) if (!exposed.includes(name)) problems.push(`Access-Control-Expose-Headers lacks ${name}`);
        for (const p of problems) add(node.name, 'headers', 'fail', `${DISCOVERY}: ${p}`);
        if (problems.length === 0) add(node.name, 'headers', 'pass', `${DISCOVERY}: media type, profile Link, ETag and cross-origin headers`);
      }
    }

    // security.txt
    {
      const route = '/.well-known/security.txt';
      const r = await fetchRoute(route);
      if (usable(route, r, 'security.txt')) {
        const m = /^expires:[ \t]*(\S+)[ \t]*$/im.exec(r.body.toString('utf8'));
        const when = m ? Date.parse(m[1]) : NaN;
        if (!m || Number.isNaN(when)) add(node.name, 'security.txt', 'fail', `${route}: no Expires field with a date`);
        else {
          const days = Math.floor((when - now.getTime()) / DAY);
          const ok = when - now.getTime() > EXPIRES_DAYS * DAY;
          add(node.name, 'security.txt', ok ? 'pass' : 'fail', `${route}: expires ${m[1]}, ${days} day(s) ahead${ok ? '' : `; it must be more than ${EXPIRES_DAYS}`}`);
        }
      }
    }

    // The sustainability report.
    {
      const route = '/.well-known/sustainability-data';
      const r = await fetchRoute(route);
      if (usable(route, r, 'sustainability')) {
        let period = null;
        try { period = JSON.parse(r.body.toString('utf8'))['reporting-period']; } catch { /* reported below */ }
        const m = /^(\d{4})-(\d{2})$/.exec(String(period));
        if (!m) add(node.name, 'sustainability', 'fail', `${route}: no reporting-period of the form YYYY-MM`);
        else {
          const months = (now.getUTCFullYear() * 12 + now.getUTCMonth()) - (Number(m[1]) * 12 + Number(m[2]) - 1);
          const ok = months <= REPORT_MONTHS;
          add(node.name, 'sustainability', ok ? 'pass' : 'fail', `${route}: reporting period ${period} is ${months} month(s) old${ok ? '' : `; at most ${REPORT_MONTHS} are allowed`}`);
        }
      }
    }

    // The node's statements, then the edge network's headers and HSTS on every response read.
    let statements = '';
    for (const route of node.statements) {
      const r = await fetchRoute(route);
      if (usable(route, r, 'statements')) statements += `${r.body.toString('utf8')}\n`;
    }
    for (const { header, named } of EDGE_HEADERS) {
      const where = [...seen].filter(([, r]) => r.headers && r.headers[header] !== undefined);
      if (where.length === 0) { add(node.name, 'edge headers', 'pass', `no ${header} header`); continue; }
      const value = where[0][1].headers[header];
      const shown = value.length > 60 ? `${value.slice(0, 60)}…` : value;
      if (named.test(statements)) add(node.name, 'edge headers', 'warn', `the edge adds the header ${header}: ${shown} on ${where.length} address(es); the node's statements (${node.statements.join(', ')}) name it`);
      else add(node.name, 'edge headers', 'fail', `the edge adds the header ${header}: ${shown} on ${where.length} address(es), and the node's statements (${node.statements.join(', ')}) do not name it`);
    }
    const noHsts = [...seen].filter(([, r]) => r.headers && !/max-age=\d+/i.test(r.headers['strict-transport-security'] || '')).map(([route]) => route);
    for (const route of noHsts) add(node.name, 'headers', 'fail', `${route}: no Strict-Transport-Security header`);
  }

  // w3id: every address answers 303 to this site.
  for (const p of W3ID.paths) {
    const r = await read(new URL(p, W3ID.base).href);
    if (r.error !== undefined) add('w3id', 'redirects', 'fail', `w3id ${p}: cannot be read: ${r.error}`);
    else if (r.status !== 303) add('w3id', 'redirects', 'fail', `w3id ${p} answers ${r.status}, not 303`);
    else if (!String(r.headers.location || '').startsWith(W3ID.target)) add('w3id', 'redirects', 'fail', `w3id ${p} answers 303 to ${r.headers.location || 'nowhere'}, not to ${W3ID.target}`);
    else add('w3id', 'redirects', 'pass', `w3id ${p} answers 303 to ${r.headers.location}`);
  }

  // The registries.
  {
    const r = await read(REGISTRIES.npm);
    let latest = null;
    try { const d = JSON.parse(r.body.toString('utf8')); latest = d['dist-tags'] && d['dist-tags'].latest; if (!(d.versions && d.versions[latest])) latest = latest ? `${latest} (not in versions)` : null; } catch { /* reported below */ }
    if (r.error !== undefined || r.status !== 200 || !latest || / /.test(latest)) add('npm', 'registries', 'fail', `npm: agentic-system-core has no resolvable latest version (${r.error || `status ${r.status}`}, ${latest})`);
    else add('npm', 'registries', 'pass', `npm: agentic-system-core latest ${latest}`);
  }
  {
    const r = await read(REGISTRIES.pypi);
    let version = null, files = 0;
    try { const d = JSON.parse(r.body.toString('utf8')); version = d.info && d.info.version; files = ((d.releases || {})[version] || []).length; } catch { /* reported below */ }
    if (r.error !== undefined || r.status !== 200 || !version) add('PyPI', 'registries', 'fail', `PyPI: agentic-system-core names no version (${r.error || `status ${r.status}`})`);
    else if (files === 0) add('PyPI', 'registries', 'fail', `PyPI: agentic-system-core ${version} has no files`);
    else add('PyPI', 'registries', 'pass', `PyPI: agentic-system-core ${version}, ${files} file(s)`);
  }

  // The released checkers, Level 2 on both nodes with the mutual check.
  const ran = checkers ? await checkers() : null;
  if (!ran || ran.length === 0) add('checkers', 'checkers', requireCheckers ? 'fail' : 'warn', 'the checkers were not run (set SITE_LIVE_NODE_CHECKER and SITE_LIVE_PYTHON)');
  else for (const c of ran) add('checkers', 'checkers', c.ok ? 'pass' : 'fail', `${c.name}: ${c.detail}`);

  return { results };
}

/** One released checker, run as a child process; its AGSC-09-11 envelope decides. */
function runChecker(name, command, args) {
  const r = cp.spawnSync(command, args, { encoding: 'utf8', timeout: 300 * 1000, maxBuffer: 64 * 1024 * 1024 });
  let env = null;
  try { env = JSON.parse(r.stdout); } catch { /* reported below */ }
  if (!env || !env.counts) return { name, ok: false, detail: `no envelope (exit ${r.status}): ${String(r.stderr || r.stdout || r.error || '').trim().split('\n').slice(0, 3).join(' | ')}` };
  const findings = (env.findings || []).filter(f => f.severity === 'error').slice(0, 5).map(f => `${f.code} ${f.file || ''} ${f.message}`.trim());
  return { name, ok: r.status === 0 && env.status === 'pass', detail: `${env.status} (level 2): ${env.counts.error} error(s), ${env.counts.warn} warning(s)${findings.length ? `; ${findings.join(' | ')}` : ''}` };
}

/** The real reader: one GET, redirects not followed, one retry on a network error. */
async function httpGet(url) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30 * 1000), headers: { 'user-agent': 'agentic-system-core-live-check' } });
      const headers = {};
      res.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });
      return { body: Buffer.from(await res.arrayBuffer()), headers, status: res.status };
    } catch (e) {
      if (attempt >= 2) throw e;
    }
  }
}

async function main(argv) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const i = argv.indexOf('--www');
  const out = i >= 0 ? argv[i + 1] : ((JSON.parse(fs.readFileSync(path.join(root, 'agsc.config.json'), 'utf8')).build || {}).out || 'www');
  const requireCheckers = argv.includes('--require-checkers');
  const nodeChecker = process.env.SITE_LIVE_NODE_CHECKER || '';
  const python = process.env.SITE_LIVE_PYTHON || '';
  const [a, b] = NODES.map(n => new URL(DISCOVERY.slice(1), n.base).href);
  const checkers = nodeChecker || python ? async () => [
    nodeChecker ? runChecker('Node checker (npm), Level 2, both nodes and the mutual check', process.execPath, [nodeChecker, a, '--level', '2', '--peer', b, '--json'])
      : { name: 'Node checker (npm)', ok: !requireCheckers, detail: 'not run: SITE_LIVE_NODE_CHECKER is not set' },
    python ? runChecker('Python checker (PyPI), Level 2, both nodes and the mutual check', python, ['-m', 'agentic_system_core.cli', 'validate-wellknown', a, '--level', '2', '--peer', b, '--allow-network', '--json'])
      : { name: 'Python checker (PyPI)', ok: !requireCheckers, detail: 'not run: SITE_LIVE_PYTHON is not set' },
  ] : null;
  const { results } = await liveCheck({ get: httpGet, now: new Date(), committedRoot: path.resolve(root, out), checkers, requireCheckers });
  const count = s => results.filter(r => r.severity === s).length;
  for (const r of results) process.stdout.write(`${r.severity.toUpperCase().padEnd(4)}  ${r.node.padEnd(18)}  ${r.message}\n`);
  const line = `live-check: ${count('pass')} pass, ${count('warn')} warn, ${count('fail')} fail`;
  process.stdout.write(`${line}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const cell = s => s.replace(/\|/g, '\\|');
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Live check\n\n${line}\n\n| result | node | check |\n|---|---|---|\n${results.filter(r => r.severity !== 'pass').map(r => `| ${r.severity} | ${cell(r.node)} | ${cell(r.message)} |`).join('\n')}\n`);
  }
  return count('fail') === 0 ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, e => { process.stderr.write(`live-check: ${e && e.stack ? e.stack : e}\n`); process.exitCode = 1; });
}
