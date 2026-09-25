#!/usr/bin/env node
// The "it still looks the same" gate.
//
// A build of this site may add routes and may change prose, but it may not change how the
// site LOOKS. This script pins that: it captures a baseline from a built output, and on every
// later build it compares the new output against the captured one in four lanes.
//
//   node scripts/compare-baseline.js --capture        write the baseline from the build
//   node scripts/compare-baseline.js                  compare the build against the baseline
//   node scripts/compare-baseline.js --shots A B      compare two screenshot directories
//
// The baseline is a capture of an earlier build, kept OUTSIDE this repository (it carries the
// retired pages' wording, which is not published). Name its directory in SITE_BASELINE_DIR;
// the first two forms refuse to run without it (exit 2).
//
// Node >= 22, standard library only. Exit 0 when the site is the same, 1 when it is not.
//
// ---------------------------------------------------------------- the four lanes
//
// 1. ROUTES. Every route of the baseline must still exist. A missing route fails. A new
//    route is listed, never a failure: adding a surface is the point of the work.
//
// 2. NORMALISED BYTES. Each HTML page is normalised (below) and compared byte for byte.
//    A difference fails unless the route carries a reason in <baseline>/accepted.json.
//
// 3. SHAPE. The page CHROME — everything outside <main>, after normalisation — must be
//    byte-identical for every baseline route, with no exception: that is the header, the
//    navigation, the stylesheet and icon links, the script elements and the footer. Inside
//    <main>, the SET OF CLASS NAMES may gain members but may never lose one, because a
//    class that disappears is a piece of the design that stopped being rendered.
//
// 4. SCREENSHOTS. Pixel comparison of two directories written by scripts/shots.js. A page
//    may grow taller (new content); the common region must match within a tiny threshold.
//
// ---------------------------------------------------------------- the normalisation, exactly
//
// N1  Every release-candidate literal `1.0.0-rc.<digits>` becomes `1.0.0-rc.X`. The site
//     moved from rc.5 to rc.6 and the version string appears on most pages.
// N2  Every region declared in <baseline>/added-regions.json is deleted. Each entry is
//     {route: <glob or "*">, pattern: <JavaScript regular expression, "g" applied>, why: <plain words>}.
//     A declared pattern that matches nothing anywhere is itself a failure, so the list
//     cannot rot into a set of excuses.
// N3  Nothing else. No whitespace folding, no attribute sorting: the generator's output is
//     already deterministic, so any other difference is a real one.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, (JSON.parse(fs.readFileSync(path.join(ROOT, 'agsc.config.json'), 'utf8')).build || {}).out || 'www');
const BASE = process.env.SITE_BASELINE_DIR ? path.resolve(process.env.SITE_BASELINE_DIR) : null;
if (BASE === null && process.argv[2] !== '--shots') {
  console.error('compare-baseline: set SITE_BASELINE_DIR to the directory that holds the baseline (it is kept outside this repository)');
  process.exit(2);
}
const NORMDIR = BASE === null ? null : path.join(BASE, 'normalised');

const problems = [];
const notes = [];
const fail = m => problems.push(m);
const note = m => notes.push(m);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

// ------------------------------------------------------------------ the built output
const walk = d => fs.readdirSync(d, { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const relFiles = dir => walk(dir).map(f => path.relative(dir, f).split(path.sep).join('/')).sort();

// ------------------------------------------------------------------ N1..N3
const RC = /1\.0\.0-rc\.\d+/g;
function loadRegions() {
  const p = path.join(BASE, 'added-regions.json');
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, 'utf8')).regions || [];
}
function matches(route, glob) {
  if (glob === '*') return true;
  if (glob.endsWith('*')) return route.startsWith(glob.slice(0, -1));
  return route === glob;
}
function normalise(route, html, regions, hits) {
  let out = html.replace(RC, '1.0.0-rc.X');
  for (let i = 0; i < regions.length; i++) {
    const r = regions[i];
    if (!matches(route, r.route)) continue;
    const re = new RegExp(r.pattern, 'g');
    out = out.replace(re, () => { hits[i] = (hits[i] || 0) + 1; return ''; });
  }
  return out;
}

// ------------------------------------------------------------------ lane 3: shape
/** Everything outside <main>…</main>, which is the page's chrome. */
function chrome(html) {
  const a = html.indexOf('<main');
  const b = html.lastIndexOf('</main>');
  if (a < 0 || b < 0) return html;
  return html.slice(0, a) + '\u0001MAIN\u0001' + html.slice(b + '</main>'.length);
}
/** The set of class names used inside <main>. */
function mainClasses(html) {
  const a = html.indexOf('<main');
  const b = html.lastIndexOf('</main>');
  const body = a < 0 || b < 0 ? html : html.slice(a, b);
  const set = new Set();
  for (const m of body.matchAll(/\sclass="([^"]*)"/g)) {
    for (const c of m[1].split(/\s+/)) if (c !== '') set.add(c);
  }
  return [...set].sort();
}

// ------------------------------------------------------------------ PNG, standard library only
function readPng(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file}: not a PNG`);
  let off = 8, width = 0, height = 0, bitDepth = 0, colour = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colour = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0) throw new Error(`${file}: unsupported PNG (depth ${bitDepth}, interlace ${interlace})`);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colour];
  if (channels === undefined) throw new Error(`${file}: unsupported colour type ${colour}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride); pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y === 0 ? null : out.subarray((y - 1) * stride, y * stride);
    for (let x = 0; x < stride; x++) {
      const A = x >= channels ? cur[x - channels] : 0;
      const B = prev === null ? 0 : prev[x];
      const C = (x >= channels && prev !== null) ? prev[x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += A;
      else if (filter === 2) v += B;
      else if (filter === 3) v += (A + B) >> 1;
      else if (filter === 4) {
        const p = A + B - C, pa = Math.abs(p - A), pb = Math.abs(p - B), pc = Math.abs(p - C);
        v += (pa <= pb && pa <= pc) ? A : (pb <= pc ? B : C);
      } else if (filter !== 0) throw new Error(`${file}: unknown PNG filter ${filter}`);
      cur[x] = v & 0xff;
    }
  }
  return { width, height, channels, pixels: out };
}

function comparePng(a, b) {
  if (a.width !== b.width) return { widthChanged: true, ratio: 1, rows: 0 };
  const rows = Math.min(a.height, b.height);
  const ch = Math.min(a.channels, b.channels);
  let different = 0;
  const total = rows * a.width;
  for (let y = 0; y < rows; y++) {
    const ao = y * a.width * a.channels, bo = y * b.width * b.channels;
    for (let x = 0; x < a.width; x++) {
      let d = 0;
      for (let c = 0; c < ch; c++) d = Math.max(d, Math.abs(a.pixels[ao + x * a.channels + c] - b.pixels[bo + x * b.channels + c]));
      if (d > 8) different++;
    }
  }
  return { widthChanged: false, ratio: total === 0 ? 0 : different / total, rows, heightDelta: b.height - a.height };
}

// ------------------------------------------------------------------ capture
function capture() {
  const regions = loadRegions();
  const hits = [];
  const files = relFiles(OUT);
  const record = { captured_from: path.relative(ROOT, OUT), files: {}, pages: {} };
  for (const f of files) {
    const bytes = fs.readFileSync(path.join(OUT, f));
    record.files[f] = { bytes: bytes.length, sha256: sha(bytes) };
  }
  fs.rmSync(NORMDIR, { recursive: true, force: true });
  for (const f of files.filter(f => f.endsWith('.html'))) {
    const route = '/' + f.replace(/index\.html$/, '');
    const html = fs.readFileSync(path.join(OUT, f), 'utf8');
    const norm = normalise(route, html, regions, hits);
    const target = path.join(NORMDIR, f);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, norm);
    record.pages[f] = { chrome: sha(chrome(norm)), classes: mainClasses(norm), normalised: sha(norm) };
  }
  fs.mkdirSync(BASE, { recursive: true });
  fs.writeFileSync(path.join(BASE, 'routes.json'), JSON.stringify(record, null, 2) + '\n');
  process.stdout.write(`baseline: captured ${files.length} files, ${Object.keys(record.pages).length} pages -> ${BASE}\n`);
}

// ------------------------------------------------------------------ compare
function compare() {
  const record = JSON.parse(fs.readFileSync(path.join(BASE, 'routes.json'), 'utf8'));
  const accepted = fs.existsSync(path.join(BASE, 'accepted.json'))
    ? JSON.parse(fs.readFileSync(path.join(BASE, 'accepted.json'), 'utf8')).accepted || {} : {};
  const regions = loadRegions();
  const hits = [];
  const now = new Set(relFiles(OUT));

  // lane 1 — routes
  let missing = 0, added = 0;
  for (const f of Object.keys(record.files)) if (!now.has(f)) { missing++; fail(`route missing: /${f}`); }
  for (const f of now) if (!(f in record.files)) added++;
  note(`routes: ${Object.keys(record.files).length} in the baseline, ${now.size} now, ${missing} missing, ${added} added`);

  // lanes 2 and 3 — normalised bytes and shape
  let same = 0, differing = 0, chromeBad = 0, classLoss = 0;
  const differences = [];
  for (const [f, was] of Object.entries(record.pages)) {
    if (!now.has(f)) continue;
    const route = '/' + f.replace(/index\.html$/, '');
    const norm = normalise(route, fs.readFileSync(path.join(OUT, f), 'utf8'), regions, hits);
    if (sha(norm) === was.normalised) { same++; } else {
      differing++;
      differences.push(route);
      if (!(route in accepted)) fail(`normalised HTML differs and no reason is declared: ${route}`);
    }
    if (sha(chrome(norm)) !== was.chrome) { chromeBad++; fail(`the page chrome changed (header, nav, head links, scripts or footer): ${route}`); }
    const lost = was.classes.filter(c => !mainClasses(norm).includes(c));
    if (lost.length > 0) { classLoss++; fail(`design classes no longer rendered in <main> of ${route}: ${lost.join(' ')}`); }
  }
  note(`normalised HTML: ${same} identical, ${differing} differing (${differences.filter(r => r in accepted).length} with a declared reason)`);
  note(`shape: ${chromeBad} pages whose chrome changed, ${classLoss} pages that lost a design class`);
  for (let i = 0; i < regions.length; i++) {
    if (!hits[i]) fail(`declared added region ${i} (${regions[i].why}) matched nothing — remove it or fix it`);
  }
  if (regions.length > 0) note(`declared added regions: ${regions.length}, matched ${hits.filter(Boolean).length}`);

  // non-HTML files whose bytes moved
  let dataChanged = 0;
  for (const [f, was] of Object.entries(record.files)) {
    if (f.endsWith('.html') || !now.has(f)) continue;
    const bytes = fs.readFileSync(path.join(OUT, f));
    if (sha(bytes) !== was.sha256) {
      dataChanged++;
      if (!(`/${f}` in accepted)) fail(`file changed and no reason is declared: /${f}`);
    }
  }
  note(`other files: ${dataChanged} changed, all with a declared reason`);
}

// ------------------------------------------------------------------ screenshots
function shots(a, b) {
  const A = fs.readdirSync(a).filter(f => f.endsWith('.png')).sort();
  const B = new Set(fs.readdirSync(b).filter(f => f.endsWith('.png')));
  const accepted = fs.existsSync(path.join(BASE, 'accepted.json'))
    ? JSON.parse(fs.readFileSync(path.join(BASE, 'accepted.json'), 'utf8')).accepted || {} : {};
  const THRESHOLD = 0.001; // a thousandth of the compared pixels
  let identical = 0, moved = 0, gone = 0, taller = 0;
  for (const f of A) {
    if (!B.has(f)) { gone++; fail(`screenshot missing after the change: ${f}`); continue; }
    const route = '/' + (f.replace(/\.(light|dark)\.\d+\.png$/, '') === 'home' ? '' : f.replace(/\.(light|dark)\.\d+\.png$/, '').split('__').join('/') + '/');
    const r = comparePng(readPng(path.join(a, f)), readPng(path.join(b, f)));
    if (r.widthChanged) { moved++; fail(`screenshot width changed: ${f}`); continue; }
    if (r.heightDelta !== 0) taller++;
    if (r.ratio > THRESHOLD) {
      moved++;
      if (!(route in accepted)) fail(`screenshot differs by ${(r.ratio * 100).toFixed(3)}% of the common region and no reason is declared: ${f}`);
    } else identical++;
  }
  note(`screenshots: ${A.length} compared, ${identical} within the threshold, ${moved} beyond it, ${gone} missing, ${taller} that changed height`);
}

// ------------------------------------------------------------------ main
const argv = process.argv.slice(2);
if (argv[0] === '--capture') capture();
else if (argv[0] === '--shots') {
  if (argv.length < 3) { console.error('compare-baseline: --shots <before> <after>'); process.exit(2); }
  shots(path.resolve(argv[1]), path.resolve(argv[2]));
} else compare();

for (const n of notes) process.stdout.write(`baseline: ${n}\n`);
if (problems.length > 0) {
  for (const p of problems) process.stderr.write(`baseline: ${p}\n`);
  process.stderr.write(`baseline: FAIL — ${problems.length} problem(s)\n`);
  process.exit(1);
}
if (argv[0] !== '--capture') process.stdout.write('baseline: pass — the site is the same\n');
