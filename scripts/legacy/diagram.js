'use strict';
// Diagram compiler: site/diagrams/<id>.diagram → inline SVG. Ported from the retired
// pattern site's deterministic "minimal geometric" compiler (Node stdlib only, no rendering
// dependency). A diagram's source is its specification; the SVG is a build artefact that
// build.js inlines into the page, so it is themed by site.css (currentColor, .acc) and
// carries an accessible name (role="img" + aria-label from `label`).
//
//   canvas W H                       optional, default 460 260
//   label "text"                     accessible name (required)
//   caption "text"                   figure caption printed under the diagram (required)
//   box  id  x y w h  "line1|line2"  [acc] [dashed]     rounded box, text centred, `|` = newline
//   circle id cx cy r  "text"        [acc] [dashed]
//   region id x y w h "caption"      dashed rounded boundary with a small caption above it
//   arrow  fromId  toId  [dashed] [both] [via=x,y | via=x1,y1;x2,y2]
//   line   x1 y1 x2 y2 [dashed] [acc] [thick]
//   path   "M.. L.." [dashed] [acc] [arrow]
//   text   x y "text" [size=N] [left|right]
//   cross  cx cy
//   note   "text"                    footer line, must fit the canvas width
//   bar    x y w   [thick]
// Vocabulary: `dashed` marks a return leg only (a result, a verdict, something coming back);
// forward work is solid; a region is a boundary; exactly one element carries `acc` — the thing
// the caption talks about.
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Advance widths of Noto Sans at font-size 1 (the widest mainstream system-ui face, so the
// estimate errs conservatively); unlisted characters fall back to 0.62 em.
const GLYPH = {
  ' ': 0.26, '!': 0.269, '"': 0.408, '#': 0.646, '$': 0.572, '%': 0.831, '&': 0.732, "'": 0.225, '(': 0.3, ')': 0.3, '*': 0.551, '+': 0.572, ',': 0.268, '-': 0.322,
  '.': 0.268, '/': 0.372, '0': 0.572, '1': 0.572, '2': 0.572, '3': 0.572, '4': 0.572, '5': 0.572, '6': 0.572, '7': 0.572, '8': 0.572, '9': 0.572, ':': 0.268,
  ';': 0.268, '<': 0.572, '=': 0.572, '>': 0.572, '?': 0.434, '@': 0.899, 'A': 0.639, 'B': 0.65, 'C': 0.632, 'D': 0.73, 'E': 0.556, 'F': 0.519, 'G': 0.728, 'H': 0.741,
  'I': 0.339, 'J': 0.273, 'K': 0.619, 'L': 0.524, 'M': 0.907, 'N': 0.76, 'O': 0.781, 'P': 0.605, 'Q': 0.781, 'R': 0.622, 'S': 0.549, 'T': 0.556, 'U': 0.731, 'V': 0.6,
  'W': 0.93, 'X': 0.586, 'Y': 0.566, 'Z': 0.572, '[': 0.329, '\\': 0.372, ']': 0.329, '^': 0.572, '_': 0.444, '`': 0.281, 'a': 0.561, 'b': 0.615, 'c': 0.48,
  'd': 0.615, 'e': 0.564, 'f': 0.344, 'g': 0.615, 'h': 0.618, 'i': 0.258, 'j': 0.258, 'k': 0.534, 'l': 0.258, 'm': 0.935, 'n': 0.618, 'o': 0.605, 'p': 0.615,
  'q': 0.615, 'r': 0.413, 's': 0.479, 't': 0.361, 'u': 0.618, 'v': 0.508, 'w': 0.786, 'x': 0.529, 'y': 0.51, 'z': 0.47, '{': 0.38, '|': 0.551, '}': 0.38, '~': 0.572,
  '·': 0.268, '×': 0.572, '–': 0.5, '—': 1.0, '‘': 0.175, '’': 0.175, '“': 0.359, '”': 0.359, '…': 0.791, '→': 0.6, '←': 0.6, '↔': 0.6, '≥': 0.6, '≤': 0.6, '✓': 0.7, '✗': 0.7,
};
const textW = (s, size) => [...String(s)].reduce((w, ch) => w + (GLYPH[ch] === undefined ? 0.62 : GLYPH[ch]) * size, 0);
const NOTE_MARGIN = 16, TEXT_MARGIN = 4;

function tokens(line) {
  const out = []; let cur = '', q = false;
  for (const ch of line) {
    if (ch === '"') { q = !q; continue; }
    if (ch === ' ' && !q) { if (cur) out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function compile(id, source) {
  let W = 460, H = 260, label = '', caption = '';
  const mk = `ar-${id}`;
  const shapes = {}; const draw = []; const texts = []; const arrowGeo = new Map(); let accCount = 0;
  const flag = (t, f) => t.includes(f);
  const fail = m => { throw new Error(`${id}: ${m}`); };
  const num = (v, ctx) => { const n = Number(v); if (!Number.isFinite(n)) fail(`bad number "${v}" in ${ctx}`); return n; };
  const inCanvas = (x, y, ctx) => { if (x < 0 || y < 0 || x > W || y > H) fail(`${ctx} outside canvas (${x},${y})`); };
  const accAttr = () => (accCount++, ' class="acc" stroke-width="2.2"');
  const strokeAttrs = t => (flag(t, 'acc') ? accAttr() : '') + (flag(t, 'dashed') ? ' stroke-dasharray="4 3"' : '');
  const fit = (str, size, x0, x1, ctx) => { const w = textW(str, size); if (w > x1 - x0) fail(`text "${str}" (~${w.toFixed(0)}px at size ${size}) does not fit ${ctx} (${(x1 - x0).toFixed(0)}px)`); };
  const textLines = (x, y, str, size, box) => {
    const lines = str.split('|'); const lh = size + 4; const y0 = y - ((lines.length - 1) * lh) / 2;
    lines.forEach((ln, i) => { if (box) fit(ln, size, box.x + 4, box.x + box.w - 4, `box ${box.id}`); texts.push(`<text x="${x}" y="${(y0 + i * lh).toFixed(1)}" font-size="${size}">${esc(ln)}</text>`); });
  };
  const lines = source.split('\n').map(l => l.replace(/(^|\s)#.*$/, '').trim()).filter(Boolean);
  for (const raw of lines) {
    const t = tokens(raw); const cmd = t[0];
    switch (cmd) {
      case 'canvas': W = num(t[1], 'canvas'); H = num(t[2], 'canvas'); break;
      case 'label': label = t[1]; break;
      case 'caption': caption = t[1]; break;
      case 'box': {
        const [, bid, x, y, w, h, txt] = t; if (shapes[bid]) fail(`duplicate id ${bid}`);
        const b = { id: bid, x: num(x, bid), y: num(y, bid), w: num(w, bid), h: num(h, bid) }; shapes[bid] = b;
        inCanvas(b.x, b.y, bid); inCanvas(b.x + b.w, b.y + b.h, bid);
        draw.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="6"${strokeAttrs(t).replace('4 3', flag(t, 'acc') ? '4 3' : '5 3')}/>`);
        if (txt) textLines(b.x + b.w / 2, b.y + b.h / 2 + 4, txt, txt.length > 22 && !txt.includes('|') ? 11 : 12, b);
        break;
      }
      case 'circle': {
        const [, cid, cx, cy, r, txt] = t; if (shapes[cid]) fail(`duplicate id ${cid}`);
        const c = { cx: num(cx, cid), cy: num(cy, cid), r: num(r, cid) }; shapes[cid] = { id: cid, x: c.cx - c.r, y: c.cy - c.r, w: 2 * c.r, h: 2 * c.r };
        draw.push(`<circle cx="${c.cx}" cy="${c.cy}" r="${c.r}"${strokeAttrs(t)}/>`);
        if (txt) textLines(c.cx, c.cy + 4, txt, 11, shapes[cid]);
        break;
      }
      case 'region': {
        const [, rid, x, y, w, h, cap] = t; if (shapes[rid]) fail(`duplicate id ${rid}`);
        const r = { id: rid, x: num(x, rid), y: num(y, rid), w: num(w, rid), h: num(h, rid), region: true }; shapes[rid] = r;
        inCanvas(r.x, r.y, rid); inCanvas(r.x + r.w, r.y + r.h, rid);
        draw.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="8" stroke-dasharray="6 4"/>`);
        if (cap) { fit(cap, 11, r.x, r.x + r.w, `region ${rid} caption`); texts.push(`<text x="${r.x + r.w / 2}" y="${r.y - 6}" font-size="11">${esc(cap)}</text>`); }
        break;
      }
      case 'arrow': {
        const a = shapes[t[1]], b = shapes[t[2]]; if (!a || !b) fail(`arrow references unknown id (${t[1]} → ${t[2]})`);
        const via = t.find(x => x.startsWith('via='));
        const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
        const clip = (box, from, to) => {
          const dx = to.x - from.x, dy = to.y - from.y; const hw = box.w / 2, hh = box.h / 2;
          const s = Math.min(dx !== 0 ? hw / Math.abs(dx) : Infinity, dy !== 0 ? hh / Math.abs(dy) : Infinity);
          return { x: from.x + dx * s, y: from.y + dy * s };
        };
        let p1, p2, d, poly;
        if (via) {
          const pts = via.slice(4).split(';').map(s => s.split(',').map(Number));
          const first = { x: pts[0][0], y: pts[0][1] }, last = { x: pts[pts.length - 1][0], y: pts[pts.length - 1][1] };
          p1 = clip(a, ca, first); p2 = clip(b, cb, last);
          d = `M${p1.x.toFixed(1)} ${p1.y.toFixed(1)} ` + pts.map(([x, y]) => `L${x} ${y}`).join(' ') + ` L${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
          poly = [p1, ...pts.map(([x, y]) => ({ x, y })), p2];
        } else {
          p1 = clip(a, ca, cb); p2 = clip(b, cb, ca);
          poly = [p1, p2];
          const dx = p2.x - p1.x, dy = p2.y - p1.y, L = Math.hypot(dx, dy) || 1;
          p2 = { x: p2.x - (dx / L) * 4, y: p2.y - (dy / L) * 4 }; p1 = { x: p1.x + (dx / L) * 4, y: p1.y + (dy / L) * 4 };
          d = `M${p1.x.toFixed(1)} ${p1.y.toFixed(1)} L${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
        }
        const geo = poly.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).filter((_, i) => {
          if (i === 0 || i === poly.length - 1) return true;
          const A = poly[i - 1], P = poly[i], B = poly[i + 1];
          const len = Math.hypot(B.x - A.x, B.y - A.y) || 1;
          return Math.abs((B.x - A.x) * (P.y - A.y) - (B.y - A.y) * (P.x - A.x)) / len > 0.5;
        });
        const fwdKey = geo.join(' '), revKey = geo.slice().reverse().join(' ');
        const key = fwdKey < revKey ? fwdKey : revKey;
        const twin = arrowGeo.get(key);
        if (twin) fail(`arrows "${twin}" and "${t[1]} → ${t[2]}" resolve to the same path; separate them with via= or use "both"`);
        arrowGeo.set(key, `${t[1]} → ${t[2]}`);
        draw.push(`<path d="${d}" marker-end="url(#${mk})"${flag(t, 'both') ? ` marker-start="url(#${mk})"` : ''}${flag(t, 'dashed') ? ' stroke-dasharray="4 3"' : ''}${flag(t, 'acc') ? accAttr() : ''}/>`);
        break;
      }
      case 'line': {
        const [, x1, y1, x2, y2] = t;
        draw.push(`<path d="M${num(x1, 'line')} ${num(y1, 'line')} L${num(x2, 'line')} ${num(y2, 'line')}"${flag(t, 'acc') ? accAttr() : ''}${flag(t, 'dashed') ? ' stroke-dasharray="6 5"' : ''}${flag(t, 'thick') ? ' stroke-width="5"' : ''}/>`);
        break;
      }
      case 'path': draw.push(`<path d="${esc(t[1])}"${flag(t, 'arrow') ? ` marker-end="url(#${mk})"` : ''}${flag(t, 'acc') ? accAttr() : ''}${flag(t, 'dashed') ? ' stroke-dasharray="4 3"' : ''}/>`); break;
      case 'text': {
        const [, x, y, str] = t; const sz = Number((t.find(k => k.startsWith('size=')) || 'size=11').slice(5));
        const anchor = flag(t, 'left') ? ' text-anchor="start"' : flag(t, 'right') ? ' text-anchor="end"' : '';
        const tw = textW(str, sz), tx = num(x, 'text');
        const x0 = flag(t, 'left') ? tx : flag(t, 'right') ? tx - tw : tx - tw / 2, x1 = x0 + tw;
        if (x0 < TEXT_MARGIN || x1 > W - TEXT_MARGIN) fail(`text "${str}" (~${tw.toFixed(0)}px at size ${sz}) spans x=${x0.toFixed(0)}..${x1.toFixed(0)} on a ${W}px canvas`);
        texts.push(`<text x="${tx}" y="${num(y, 'text')}" font-size="${sz}"${anchor}>${esc(str)}</text>`); break;
      }
      case 'cross': { const cx = num(t[1], 'cross'), cy = num(t[2], 'cross'); draw.push(`<path d="M${cx - 8} ${cy - 8} L${cx + 8} ${cy + 8} M${cx + 8} ${cy - 8} L${cx - 8} ${cy + 8}" stroke-width="2"/>`); break; }
      case 'note': {
        const nw = textW(t[1], 11), max = W - 2 * NOTE_MARGIN;
        if (nw > max) fail(`note "${t[1]}" (~${nw.toFixed(0)}px) exceeds ${max}px; cut ~${Math.ceil((nw - max) / (nw / [...t[1]].length))} characters`);
        texts.push(`<text x="${W / 2}" y="${H - 12}" font-size="11">${esc(t[1])}</text>`); break;
      }
      case 'bar': { const [, x, y, w] = t; draw.push(`<path d="M${num(x, 'bar')} ${num(y, 'bar')} L${num(x, 'bar') + num(w, 'bar')} ${num(y, 'bar')}"${flag(t, 'thick') ? ' stroke-width="5"' : ''}/>`); break; }
      default: fail(`unknown statement "${cmd}"`);
    }
  }
  if (!label) fail('label missing'); if (!caption) fail('caption missing');
  if (accCount !== 1) fail(`exactly one element must be marked acc (found ${accCount})`);
  const ids = Object.keys(shapes);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = shapes[ids[i]], b = shapes[ids[j]];
    const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    if (overlap && !(a.region || b.region)) fail(`shapes "${ids[i]}" and "${ids[j]}" overlap`);
  }
  const hasNote = texts.some(t => t.includes(`y="${H - 12}"`));
  if (hasNote) for (const k of ids) if (!shapes[k].region && shapes[k].y + shapes[k].h > H - 26) fail(`shape "${k}" intrudes into the footer note band`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" font-family="system-ui, sans-serif" font-size="14">
<defs><marker id="${mk}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="currentColor"/></marker></defs>
<g fill="none" stroke="currentColor" stroke-width="1.5">
${draw.join('\n')}
</g>
<g fill="currentColor" text-anchor="middle">
${texts.join('\n')}
</g>
</svg>`;
  return { svg, label, caption, width: W, height: H };
}

module.exports = { compile, textW };
