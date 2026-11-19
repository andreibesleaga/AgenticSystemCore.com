#!/usr/bin/env node
// Serves the built site on 127.0.0.1 with the response headers its `_headers` file gives each
// address, the way the host applies them: blocks in file order, a `! Name` line removing a
// header an earlier block set. For trying a page in a browser under its real policy.
//
//   node scripts/serve-www.mjs [--port 8090] [--www www]
//
// Read-only, loopback only, Node standard library only.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jsonl': 'application/jsonl', '.jsonld': 'application/ld+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.xml': 'application/xml', '.wasm': 'application/wasm', '.ttl': 'text/turtle; charset=utf-8', '.nq': 'application/n-quads' };

/** The blocks of a `_headers` file: [{ pattern, lines: [[name, value] | ['!', name]] }]. */
export function parseHeaders(text) {
  const blocks = [];
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    if (!/^\s/.test(line)) { blocks.push({ pattern: line.trim(), lines: [] }); continue; }
    const t = line.trim();
    if (t.startsWith('! ')) blocks.at(-1).lines.push(['!', t.slice(2).trim()]);
    else { const i = t.indexOf(':'); blocks.at(-1).lines.push([t.slice(0, i).trim(), t.slice(i + 1).trim()]); }
  }
  return blocks;
}

const matches = (pattern, route) => (pattern.includes('*')
  ? new RegExp(`^${pattern.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`).test(route)
  : pattern === route);

/** The headers `_headers` gives one address. */
export function headersFor(blocks, route) {
  const out = new Map();
  for (const b of blocks) {
    if (!matches(b.pattern, route)) continue;
    for (const [name, value] of b.lines) {
      if (name === '!') out.delete(value.toLowerCase());
      else out.set(name.toLowerCase(), out.has(name.toLowerCase()) && name.toLowerCase() !== 'content-type' ? `${out.get(name.toLowerCase())}, ${value}` : value);
    }
  }
  return out;
}

function main(argv) {
  const arg = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback; };
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', arg('--www', 'www'));
  const port = Number(arg('--port', '8090'));
  const blocks = parseHeaders(fs.readFileSync(path.join(root, '_headers'), 'utf8'));
  http.createServer((req, res) => {
    const route = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(root, route);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found\n'); return; }
    const headers = { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' };
    for (const [name, value] of headersFor(blocks, route)) headers[name] = value;
    res.writeHead(200, headers).end(fs.readFileSync(file));
  }).listen(port, '127.0.0.1', () => process.stdout.write(`serving ${root} at http://127.0.0.1:${port}/\n`));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
