/* AgenticSystemCore.com graph explorer: the page half. Draws a node's published graph, and the
   graphs of the peers it declares, with force-graph (2D canvas) and, on request, 3d-force-graph
   (WebGL); both libraries are served from this site, pinned by version and by SRI hash. Every
   string from the data goes into the page as text (textContent), every link is checked to be
   http(s), and nothing is sent anywhere: the script only reads published files.

   The two libraries add a <style> element to the document head when they load. This site's
   Content-Security-Policy (style-src 'self') refuses inline styles, so while a library loads,
   `document.head` points at an element that is in no document: the library's rules land there
   and are never applied, so nothing is refused, and graph-explorer.css carries the few rules the
   pictures need. The real head is back as soon as the library has run. */
(function () {
  'use strict';

  // ---------------------------------------------------------------- the libraries' style elements
  const quiet = {
    on() { if (this.box) return; try { const box = document.createElement('div'); Object.defineProperty(document, 'head', { configurable: true, get: () => box }); this.box = box; } catch (e) { this.box = null; } },
    off() { if (!this.box) return; try { delete document.head; } catch (e) { /* the real head was never shadowed */ } this.box = null; },
  };
  quiet.on();
  const lib2d = document.querySelector('script[src*="/assets/vendor/force-graph-"]');
  if (lib2d) { lib2d.addEventListener('load', () => quiet.off(), { once: true }); lib2d.addEventListener('error', () => quiet.off(), { once: true }); } else quiet.off();
  document.addEventListener('DOMContentLoaded', () => { quiet.off(); start(); }, { once: true });

  function start() {
    const root = document.querySelector('.gx[data-gx]');
    const G = window.AGSCGraph;
    if (!root || !G) return;
    const FULL = root.getAttribute('data-gx') === 'full';
    const $ = sel => root.querySelector(sel);
    const stage = $('.gx-stage'), view = $('.gx-view'), statusEl = $('.gx-status'), legendEl = $('.gx-legend'), tipEl = $('.gx-tip');
    if (typeof window.ForceGraph !== 'function') {
      // The drawing library did not load: the explorer stays hidden and the page says where the data is.
      if (root.getAttribute('data-gx') === 'full') {
        const p = document.createElement('p');
        p.append('The drawing library did not load, so the explorer is not shown. The same graph is published as data: ');
        for (const [href, text, sep] of [['/graph.jsonld', 'graph.jsonld', ' and '], ['/graph.nq', 'graph.nq', '.']]) { const a = document.createElement('a'); a.href = href; a.textContent = text; p.append(a, sep); }
        root.before(p);
      }
      return;
    }
    root.hidden = false;
    stage.hidden = false;
    // data-state on the explorer's root: "loading" while it reads, "ready" once the picture is drawn
    // and fitted and the panel filled, "error" when nothing could be drawn. Tests wait for it.
    const setState = v => root.setAttribute('data-state', v);
    setState('loading');
    const P = new URLSearchParams(location.search);
    const LANG = (document.documentElement.lang || 'en').toLowerCase().split('-')[0];
    const mq = q => (window.matchMedia ? window.matchMedia(q) : { matches: false, addEventListener() {} });
    const motionQuery = mq('(prefers-reduced-motion: reduce)');
    const reduced = () => motionQuery.matches || P.get('motion') === 'reduce';
    const KNOWN_TYPES = new Set(['Bundle', 'Cluster', 'Concept', 'Procedure', 'Episode', 'Lesson', 'Gate', 'Task', 'Source']);
    const st = { net: null, model: null, hiddenTypes: new Set(), hiddenSrc: new Set(), mode: P.get('mode') === 'tree' && FULL ? 'tree' : 'graph', dim: 2, graph: null, selected: null, hover: null, q: '', userMoved: false, known: new Set(), chunks: new Map(), loading: 0, pending: 0, shown: null, preselect: null, wantDim: 2, depth: FULL ? (P.get('depth') === '2' ? 2 : P.get('depth') === '1' ? 1 : 0) : 0 };

    // ---------------------------------------------------------------- small DOM helpers (text only)
    function h(tag, attrs, ...kids) {
      const el = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs || {})) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else el.setAttribute(k, v === true ? '' : String(v));
      }
      for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
      return el;
    }
    const link = (href, text, cls) => { const safe = G.safeHref(href); return safe ? h('a', { href: safe, class: cls || null }, text) : h('span', null, text); };
    const tok = name => getComputedStyle(root).getPropertyValue(name).trim();
    const typeClass = t => `gx-t-${KNOWN_TYPES.has(t) ? t : 'other'}`;
    const typeColor = t => tok(`--gx-c-${KNOWN_TYPES.has(t) ? t : 'other'}`) || tok('--gx-c-other');
    const originColor = src => tok(`--gx-o${((src - 1) % 3) + 1}`);
    const dot = (type, src) => h('span', { class: `gx-dot ${typeClass(type)}${src ? ` gx-ring gx-o-${((src - 1) % 3) + 1}` : ''}`, 'aria-hidden': 'true' });
    const hostOf = i => { const n = st.net && st.net.nodes[i]; try { return new URL((n && (n.anchor || n.url)) || location.href).host; } catch (e) { return '?'; } };
    const nodeOf = id => (st.model ? st.model.byId.get(id) : null);
    const visible = n => { const m = nodeOf(n.id) || n; return !st.hiddenTypes.has(m.type) && !st.hiddenSrc.has(m.src); };
    const endId = e => (typeof e === 'object' && e ? e.id : e);
    const linkVisible = l => { const s = nodeOf(endId(l.source)), t = nodeOf(endId(l.target)); return !!(s && t && visible(s) && visible(t)); };
    const live = FULL ? $('.gx-live') : null;
    // A node's drawn radius in graph units: larger for a node with more links.
    const radiusOf = n => 4 * Math.sqrt(1 + Math.sqrt(n.deg || 0));
    // The least radius, in screen pixels, at which a pointer finds a node: a drawn node can be under
    // 3 px across on a phone, which a finger cannot hit.
    const coarsePointer = mq('(pointer: coarse)');
    const minTargetPx = () => (coarsePointer.matches ? 14 : 6);
    const say = text => { if (live) live.textContent = text; };

    // ---------------------------------------------------------------- tooltip (hover 1 s, focus, long-press)
    const tip = { node: null, showTimer: 0, hideTimer: 0, pointer: null, suppressClickUntil: 0, byFocus: false, over: false };
    // The summary the page shows; for a Source or a Bundle, which carry none, what the graph and the link set say of it.
    const summaryOf = (n, max) => G.summaryText(n.raw, LANG, max) || G.fallbackSummary(n, LANG, st.net && st.net.nodes[n.src]);
    function tipContent(n) {
      const net = st.net && st.net.nodes[n.src];
      const summary = summaryOf(n, G.SUMMARY_MAX);
      const href = G.pageHref(n, st.known);
      tipEl.replaceChildren(
        h('p', { class: 'gx-tip-title' }, dot(n.type, n.src), h('strong', null, n.label)),
        h('p', { class: 'gx-tip-meta' }, `${n.type} · ${hostOf(n.src)}${net && net.depth ? ' (peer node)' : ''}`),
        summary ? h('p', { class: 'gx-tip-sum' }, summary) : h('p', { class: 'gx-tip-sum gx-muted' }, 'This node carries no summary in its graph.'),
        href ? h('p', { class: 'gx-tip-go' }, link(href, 'Open the page')) : null,
      );
    }
    function placeTip(x, y) {
      const sw = stage.clientWidth, sh = stage.clientHeight;
      tipEl.style.left = '0px'; tipEl.style.top = '0px';
      const w = tipEl.offsetWidth, ht = tipEl.offsetHeight;
      let left = x + 14, top = y + 14;
      if (left + w > sw - 6) left = Math.max(6, x - w - 14);
      if (top + ht > sh - 6) top = Math.max(6, y - ht - 14);
      tipEl.style.left = `${Math.round(Math.min(Math.max(6, left), Math.max(6, sw - w - 6)))}px`;
      tipEl.style.top = `${Math.round(Math.min(Math.max(6, top), Math.max(6, sh - ht - 6)))}px`;
    }
    // Coordinates are the canvas's (the view's); the tooltip is placed in the stage, which may hold
    // the status line above the canvas on a narrow screen.
    function screenOf(n) {
      if (!st.graph || n.x === undefined) return { x: view.clientWidth / 2, y: view.clientHeight / 2 };
      const p = st.dim === 3 ? st.graph.graph2ScreenCoords(n.x, n.y, n.z || 0) : st.graph.graph2ScreenCoords(n.x, n.y);
      return { x: p.x, y: p.y };
    }
    function showTip(n, at, byFocus) {
      clearTimeout(tip.hideTimer); clearTimeout(tip.showTimer);
      if (!n) return;
      tip.node = n.id;
      tip.byFocus = !!byFocus; // only a tooltip that keyboard focus opened closes when that focus leaves
      tipContent(n);
      tipEl.hidden = false;
      const p = at || screenOf(n);
      placeTip(p.x + view.offsetLeft, p.y + view.offsetTop);
    }
    // Two ways to close the tooltip:
    //   closeTip() closes the open tooltip and leaves a pending one alone, so the grace period of
    //   the node the pointer has left never cancels the tooltip of the node it has moved on to;
    //   hideTip() also cancels the pending one (Escape, a click elsewhere, a new picture).
    function closeTip() {
      clearTimeout(tip.hideTimer);
      tip.node = null;
      tip.over = false;
      tip.byFocus = false;
      tipEl.hidden = true;
      for (const b of root.querySelectorAll('[aria-describedby="gx-tip"]')) b.removeAttribute('aria-describedby');
    }
    function hideTip() {
      clearTimeout(tip.showTimer);
      closeTip();
      // On the front page a click selects a node only to show its tooltip: closing it ends the highlight.
      if (!FULL && st.selected) select(null);
    }
    // Closes the tooltip after 400 ms, the time the pointer needs to travel from the node onto
    // the tooltip; the tooltip stays open while the pointer is on it, so its link can be followed.
    function graceHide() {
      clearTimeout(tip.hideTimer);
      if (tip.over) return;
      tip.hideTimer = setTimeout(() => { if (!tip.over) closeTip(); }, 400);
    }
    tipEl.addEventListener('pointerenter', () => {
      tip.over = true;
      clearTimeout(tip.hideTimer);
    });
    tipEl.addEventListener('pointerleave', () => {
      tip.over = false;
      const backOnItsNode = st.hover && st.hover === tip.node;
      if (!backOnItsNode) graceHide();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !tipEl.hidden) hideTip(); });
    // A press anywhere but on the tooltip closes it; a touch on the picture is left to the
    // long-press and tap handlers below.
    document.addEventListener('pointerdown', e => {
      if (tipEl.hidden || tipEl.contains(e.target)) return;
      const touchOnPicture = e.pointerType === 'touch' && view.contains(e.target);
      if (!touchOnPicture) hideTip();
    }, true);
    view.addEventListener('pointermove', e => {
      if (!e.isTrusted) return;
      tip.inView = true;
      const r = view.getBoundingClientRect();
      tip.pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
      tip.lastPointer = e.pointerType;
    });
    // The drawing libraries learn where the pointer is only from moves over the picture, so a
    // pointer that leaves it (for the legend, the status line, the tooltip or the page) would leave
    // the last node hovered, highlighted and its tooltip pending. One move far outside the picture,
    // sent to the canvas, tells them the pointer has gone.
    view.addEventListener('pointerleave', e => {
      if (!e.isTrusted) return;
      tip.inView = false;
      if (e.pointerType === 'touch') return;
      const canvas = view.querySelector('canvas');
      const away = new PointerEvent('pointermove', { bubbles: true, clientX: -1e5, clientY: -1e5, pointerType: e.pointerType || 'mouse' });
      if (canvas) canvas.dispatchEvent(away);
    });
    view.addEventListener('contextmenu', e => { if (tip.longPressed) e.preventDefault(); });
    // touch: a press held for more than half a second shows the tooltip; a tap selects
    let press = null;
    // The visitor has taken the picture in hand (a mouse press, a two-finger touch, a zooming wheel;
    // on /graph/ any touch, which pans there): no automatic fit after this. On the front page one
    // finger scrolls the page, so a touch alone does not count.
    const touches = new Set();
    view.addEventListener('pointerdown', e => {
      const r0 = view.getBoundingClientRect();
      tip.pointer = { x: e.clientX - r0.left, y: e.clientY - r0.top }; // a tap fires no pointermove
      tip.inView = true;
      tip.lastPointer = e.pointerType;
      if (e.pointerType === 'touch') touches.add(e.pointerId);
      if (e.pointerType !== 'touch' || FULL || touches.size > 1) st.userMoved = true;
      if (e.pointerType !== 'touch') return;
      // A second finger starts a pinch, not a long press: the first press is dropped.
      if (press) { clearTimeout(press.timer); press = null; }
      if (touches.size > 1) return;
      const r = view.getBoundingClientRect();
      const at = { x: e.clientX - r.left, y: e.clientY - r.top };
      press = { ...at, timer: setTimeout(() => {
        const n = nodeAt(at.x, at.y);
        if (n) { tip.longPressed = true; tip.suppressClickUntil = Date.now() + 800; showTip(n, at); }
      }, 500) };
    });
    const endPress = () => { if (press) { clearTimeout(press.timer); press = null; } setTimeout(() => { tip.longPressed = false; }, 50); };
    for (const t of ['pointerup', 'pointercancel']) view.addEventListener(t, e => {
      touches.delete(e.pointerId);
      if (e.pointerType === 'touch' && st.hover) { st.hover = null; restyle(); }
    });
    if (!FULL) view.addEventListener('wheel', ctrlWheelZoom, { passive: false, capture: true });
    // Capture phase: d3-zoom stops the wheel event on the canvas, so a bubbling listener never runs.
    view.addEventListener('wheel', e => { if (FULL || e.ctrlKey || e.metaKey) st.userMoved = true; }, { passive: true, capture: true });
    view.addEventListener('pointermove', e => { if (!press) return; const r = view.getBoundingClientRect(); if (Math.hypot(e.clientX - r.left - press.x, e.clientY - r.top - press.y) > 10) endPress(); });
    view.addEventListener('pointerup', endPress);
    view.addEventListener('pointercancel', endPress);
    // The front page's Ctrl/Cmd + wheel: a mouse notch zooms by about 1.25x, a trackpad pinch (small
    // steps) smoothly, always about the point under the pointer. d3-zoom would multiply a Ctrl-wheel
    // by 10, which made each mouse notch zoom 4x.
    function ctrlWheelZoom(e) {
      if (!(e.ctrlKey || e.metaKey) || !st.graph || st.dim !== 2) return;
      e.preventDefault(); e.stopPropagation();
      const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY; // lines to pixels
      const perPx = Math.abs(px) >= 50 ? 0.003 : 0.02; // a mouse notch is about 100 px
      const k0 = st.graph.zoom(), k1 = Math.min(40, Math.max(0.05, k0 * 2 ** Math.max(-1, Math.min(1, -px * perPx))));
      const r = view.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const p = st.graph.screen2GraphCoords(x, y);
      st.graph.zoom(k1, 0);
      st.graph.centerAt(p.x - (x - r.width / 2) / k1, p.y - (y - r.height / 2) / k1, 0);
      st.userMoved = true;
    }
    // The visible node nearest to a point of the picture (view coordinates), within reach of a
    // finger or a pointer; the same rule in 2D and 3D, from each node's position on screen.
    function nodeAt(x, y) {
      if (!st.graph) return null;
      const k = st.dim === 2 ? st.graph.zoom() || 1 : 1;
      let best = null, bestD = Infinity;
      for (const n of st.model.nodes) {
        if (!visible(n) || n.x === undefined) continue;
        const p = screenOf(n), d = Math.hypot(p.x - x, p.y - y);
        const reach = Math.max(st.dim === 2 ? radiusOf(n) * k : 0, minTargetPx()) + 4;
        if (d <= reach && d < bestD) { best = n; bestD = d; }
      }
      return best;
    }

    // ---------------------------------------------------------------- legend
    function renderLegend() {
      const counts = new Map();
      for (const n of st.model.nodes) counts.set(n.type, (counts.get(n.type) || 0) + 1);
      const types = [...counts.keys()].sort((a, b) => (G.ORDER.indexOf(a) + 99) % 99 - (G.ORDER.indexOf(b) + 99) % 99 || (a < b ? -1 : 1));
      const kids = types.map(t => h('button', { type: 'button', 'data-type': t, 'aria-pressed': String(!st.hiddenTypes.has(t)) }, dot(t, 0), t, h('span', { class: 'gx-badge' }, counts.get(t))));
      const read = st.net.nodes.map((n, i) => [n, i]).filter(([n]) => n.parsed);
      if (read.length > 1) for (const [, i] of read) kids.push(h('button', { type: 'button', 'data-src': i, 'aria-pressed': String(!st.hiddenSrc.has(i)), title: i ? 'Nodes of a peer node: a ring in 2D, their colour in 3D' : 'Nodes of the node you opened' }, h('span', { class: `gx-dot gx-origin${i ? ` gx-ring gx-o-${((i - 1) % 3) + 1}` : ''}`, 'aria-hidden': 'true' }), hostOf(i)));
      legendEl.replaceChildren(...kids);
    }
    const toggle = (set, v) => { if (set.has(v)) set.delete(v); else set.add(v); return !set.has(v); };
    // A legend button hides or shows one type or one origin. The button is updated in place, so
    // keyboard focus stays on it; a selection, hover or tooltip on a node now hidden is dropped.
    legendEl.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const shown = b.hasAttribute('data-type') ? toggle(st.hiddenTypes, b.getAttribute('data-type')) : toggle(st.hiddenSrc, Number(b.getAttribute('data-src')));
      b.setAttribute('aria-pressed', String(shown));
      const hidden = id => !!id && !visible(nodeOf(id) || { id });
      if (hidden(tip.node)) hideTip();
      if (hidden(st.hover)) st.hover = null;
      if (hidden(st.selected)) select(null);
      if (FULL) renderList();
      if (st.graph) st.graph.nodeVisibility(visible).linkVisibility(linkVisible);
      restyle();
    });

    // ---------------------------------------------------------------- the side panel (full page)
    const panel = FULL ? $('.gx-panel') : null;
    const listEl = FULL ? $('.gx-list') : null, countEl = FULL ? $('.gx-count') : null, detailEl = FULL ? $('.gx-detail') : null;
    const sourcesEl = FULL ? $('.gx-sources-list') : null, treeBox = FULL ? $('.gx-treebox') : null, treeEl = FULL ? $('.gx-tree') : null;
    function nodeButton(n, note) {
      return h('button', { type: 'button', class: 'gx-nb', 'data-id': n.id, 'aria-pressed': String(st.selected === n.id) },
        dot(n.type, n.src), h('span', { class: 'gx-nb-label' }, n.label), h('span', { class: 'gx-rel' }, `${n.type}${note ? ` · ${note}` : ''}${n.src ? ` · ${hostOf(n.src)}` : ''}`));
    }
    // A node chosen in the picture: its details are at the top of the side panel, so the panel
    // (only the panel, never the page) scrolls back to the top.
    function showDetails() { panel.scrollTop = 0; }
    function matches(n) { const q = st.q.toLowerCase(); return !q || `${n.label} ${n.type} ${n.id}`.toLowerCase().includes(q); }
    function renderList() {
      if (!FULL) return;
      const shown = st.model.nodes.filter(n => visible(n) && matches(n));
      listEl.replaceChildren(...shown.map(n => h('li', null, nodeButton(n))));
      countEl.textContent = shown.length === st.model.nodes.length ? String(shown.length) : `${shown.length} of ${st.model.nodes.length}`;
    }
    function renderSources() {
      if (!FULL) return;
      sourcesEl.replaceChildren(...st.net.nodes.map((n, i) => {
        const role = i === 0 ? 'the node you opened' : `peer of ${hostOf(n.from)}${n.depth > 1 ? ' (peer of a peer)' : ''}`;
        const facts = [];
        if (n.parsed) facts.push(`${n.parsed.nodes.length} nodes, ${n.parsed.links.length} links`);
        if (n.version) facts.push(`content version ${n.version}`);
        const digest = n.parsed ? (n.digest === 'verified' ? 'digest verified' : n.digest === 'differs' ? 'digest differs from the discovery document' : n.digest === 'not checked' ? 'digest not checked here' : 'no digest declared') : null;
        return h('li', { class: n.error ? 'gx-failed' : null },
          h('span', { class: `gx-dot gx-origin${i ? ` gx-ring gx-o-${((i - 1) % 3) + 1}` : ''}`, 'aria-hidden': 'true' }),
          h('strong', null, hostOf(i)), ` — ${role}`,
          facts.length ? h('br') : null, facts.join('; '),
          digest ? h('br') : null, digest ? h('span', { class: n.digest === 'differs' ? 'gx-warn' : null }, `graph.jsonld: ${digest}`) : null,
          n.error ? h('br') : null, n.error ? h('span', { class: 'gx-warn' }, `Not read: ${n.error}`) : null,
          h('br'), link(n.graph, 'graph.jsonld'), ' · ', link(n.linkset, 'discovery document'), n.license ? [' · ', link(n.license, 'licence')] : null,
          i ? [' · ', h('button', { type: 'button', class: 'gx-linkish', 'data-open': n.anchor || n.url }, `Explore ${hostOf(i)}`)] : null);
      }));
    }
    function detailRows(n) {
      const rows = [];
      for (const k of Object.keys(n.raw)) {
        if (k === '@id') continue;
        const vals = G.asArray(n.raw[k]).map(v => {
          const t = G.iriOf(v);
          if (t && nodeOf(t)) return nodeButton(nodeOf(t));
          if (t && G.safeHref(t)) return link(t, t.replace(/^https?:\/\//, ''));
          return h('span', null, G.textOf(v, LANG));
        });
        rows.push(h('dt', null, k), h('dd', null, ...vals.flatMap((v, i) => (i ? [h('br'), v] : [v]))));
      }
      return rows;
    }
    function renderDetail(n) {
      if (!FULL) return;
      if (!n) { detailEl.replaceChildren(h('h2', null, 'No node selected'), h('p', { class: 'gx-muted' }, 'Pick a node in the list below, or click one in the picture. Hover a node for a second to read its summary.')); return; }
      const net = st.net.nodes[n.src];
      const href = G.pageHref(n, st.known);
      const base = (() => { try { return new URL(n.id).origin; } catch (e) { return null; } })();
      const slug = n.id.replace(/#.*$/, '').replace(/\/$/, '').split('/').pop();
      const isItem = !['Bundle', 'Source'].includes(n.type) && base && slug;
      const groups = new Map();
      for (const a of st.model.adj.get(n.id) || []) { const k = a.dir === 'out' ? a.rel : `${a.rel} (of)`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a.id); }
      const prov = [G.textOf(n.raw.origin, LANG), G.textOf(n.raw.operator, LANG), G.textOf(n.raw.model, LANG)].filter(Boolean);
      const lic = G.textOf(n.raw['schema:license'] || n.raw.usageInfo, LANG);
      const summary = summaryOf(n, 2000);
      detailEl.replaceChildren(
        h('h2', null, dot(n.type, n.src), ' ', n.label, ' ', h('span', { class: 'gx-badge' }, n.type)),
        h('p', { class: 'gx-muted' }, `${hostOf(n.src)} · ${n.deg} link${n.deg === 1 ? '' : 's'}`),
        summary ? h('p', null, summary) : null,
        h('p', { class: 'gx-links' }, href ? link(href, 'Open the page') : null, isItem ? [' · ', link(`${base}/pages/${slug}.md`, 'source text'), ' · ', link(`${base}/pages/${slug}.jsonld`, 'JSON-LD')] : null),
        h('dl', { class: 'gx-dl' },
          prov.length ? [h('dt', null, 'Provenance'), h('dd', null, prov.join(' · '))] : null,
          lic ? [h('dt', null, 'Licence'), h('dd', null, lic)] : null,
          h('dt', null, 'Graph file'), h('dd', null, net ? `${net.digest === 'verified' ? 'digest verified' : net.digest === 'differs' ? 'digest differs' : net.digest === 'not checked' ? 'digest not checked here' : 'no digest declared'} (${hostOf(n.src)}/graph.jsonld)` : '')),
        h('h3', null, 'Relations'),
        groups.size ? h('ul', { class: 'gx-groups' }, ...[...groups.keys()].sort().map(k => h('li', null, h('span', { class: 'gx-rel' }, k), h('ul', null, ...groups.get(k).map(id => h('li', null, nodeButton(nodeOf(id)))))))) : h('p', { class: 'gx-muted' }, 'No relation to another node that was read.'),
        isItem ? h('section', { class: 'gx-chunks', 'aria-label': 'Chunks' }, h('h3', null, 'Chunks'), h('p', { class: 'gx-muted' }, 'Reading the chunk export…')) : null,
        h('h3', null, 'Properties'), h('dl', { class: 'gx-dl' }, ...detailRows(n)));
      if (isItem) loadChunks(n);
    }
    async function loadChunks(n) {
      const net = st.net.nodes[n.src];
      if (!net || !net.chunks) return;
      if (!st.chunks.has(n.src)) st.chunks.set(n.src, fetch(net.chunks, { credentials: 'omit' }).then(r => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))));
      let list = null, err = null;
      try { list = G.parseChunks(await st.chunks.get(n.src), n.id); } catch (e) { err = e.message; }
      if (st.selected !== n.id) return;
      const box = detailEl.querySelector('.gx-chunks'); if (!box) return;
      const head = box.querySelector('h3');
      if (err) { box.replaceChildren(head, h('p', { class: 'gx-muted' }, `The chunk export could not be read (${err}).`)); return; }
      if (!list.length) { box.replaceChildren(head, h('p', { class: 'gx-muted' }, 'No chunk of this item in the chunk export.')); return; }
      box.replaceChildren(head, h('ol', { class: 'gx-chunk-list' }, ...list.map(c => h('li', null,
        h('strong', null, c.section || 'Opening'), h('span', { class: 'gx-rel' }, ` chunk ${c.ordinal} · digest ${c.digest.slice(0, 12)}`), h('br'), G.truncate(c.text, 160)))));
    }
    function renderTree() {
      if (!FULL) return;
      treeBox.hidden = st.mode !== 'tree';
      if (st.mode !== 'tree') return;
      const kids = new Map(), hasParent = new Set();
      for (const l of G.treeLinks(st.model)) { if (!kids.has(l.source)) kids.set(l.source, []); kids.get(l.source).push(l); hasParent.add(l.target); }
      const seen = new Set();
      const ul = (id, depth) => {
        const ks = (kids.get(id) || []).filter(l => !seen.has(l.target));
        if (!ks.length || depth > 8) return null;
        return h('ul', null, ...ks.map(l => { seen.add(l.target); return h('li', null, nodeButton(nodeOf(l.target), l.rel), ul(l.target, depth + 1)); }));
      };
      const roots = st.model.nodes.filter(n => !hasParent.has(n.id) && (kids.has(n.id) || n.type === 'Bundle'));
      treeEl.replaceChildren(...roots.map(r => { seen.add(r.id); return h('div', null, nodeButton(r), ul(r.id, 0)); }));
    }
    if (FULL) {
      panel.addEventListener('click', e => {
        const b = e.target.closest('button.gx-nb');
        if (b) {
          const fromDetail = detailEl.contains(b); // this button is about to be replaced
          select(b.getAttribute('data-id'), true);
          if (fromDetail) { const h2 = detailEl.querySelector('h2'); if (h2) { h2.tabIndex = -1; h2.focus(); } }
          return;
        }
        const o = e.target.closest('button[data-open]'); if (o) { srcInput.value = o.getAttribute('data-open'); load(o.getAttribute('data-open'), true); }
      });
      panel.addEventListener('keydown', e => { if (e.key === 'Escape' && tipEl.hidden) select(null); });
      // keyboard focus on a node shows its tooltip too
      panel.addEventListener('focusin', e => {
        const b = e.target.closest('button.gx-nb'); if (!b || !b.matches(':focus-visible')) return;
        const n = nodeOf(b.getAttribute('data-id')); if (!n) return;
        clearTimeout(tip.showTimer);
        tip.showTimer = setTimeout(() => { if (document.activeElement === b) { showTip(n, null, true); b.setAttribute('aria-describedby', 'gx-tip'); } }, 600);
      });
      panel.addEventListener('focusout', e => { if (e.target.closest('button.gx-nb')) { clearTimeout(tip.showTimer); if (tip.byFocus && !tipEl.contains(e.relatedTarget)) hideTip(); } });
    }

    // ---------------------------------------------------------------- selection and highlight
    function select(id, centre) {
      st.selected = id && nodeOf(id) ? id : null;
      const n = st.selected ? nodeOf(st.selected) : null;
      if (FULL) {
        for (const b of root.querySelectorAll('button.gx-nb')) b.setAttribute('aria-pressed', String(b.getAttribute('data-id') === st.selected));
        renderDetail(n);
        if (n) say(`Selected ${n.label}, ${n.type}, ${n.deg} links`);
      }
      restyle();
      if (!n || !st.graph) return;
      if (centre) {
        st.userMoved = true; // a later automatic fit must not move the picture away from the selection
        const ms = reduced() ? 0 : 600;
        if (st.dim === 2) { st.graph.centerAt(n.x, n.y, ms); st.graph.zoom(Math.max(st.graph.zoom(), 3), ms); }
        else { const d = Math.hypot(n.x || 0, n.y || 0, n.z || 0) || 1, r = 1 + 90 / d; st.graph.cameraPosition({ x: (n.x || 0) * r, y: (n.y || 0) * r, z: (n.z || 0) * r }, n, reduced() ? 0 : 900); }
      }
    }
    const neighbours = id => { const s = new Set(); if (!id) return s; s.add(id); for (const a of st.model.adj.get(id) || []) s.add(a.id); return s; };
    function restyle() {
      if (!st.graph) return;
      const focus = st.hover || st.selected, ns = neighbours(focus), dim = tok('--gx-dim'), muted = tok('--muted'), q = st.q.toLowerCase();
      const colorOf = n => {
        const m = nodeOf(n.id) || n;
        if ((q && !matches(m)) || (focus && !ns.has(m.id))) return dim;
        return st.dim === 3 && m.src ? originColor(m.src) : typeColor(m.type);
      };
      st.colorOf = colorOf;
      st.graph.nodeColor(colorOf)
        .linkColor(l => { const s = endId(l.source), t = endId(l.target); if (focus && !(s === focus || t === focus)) return dim; if (l.cross) return originColor(Math.max(nodeOf(s).src, nodeOf(t).src) || 1); return muted; })
        .linkWidth(l => { const s = endId(l.source), t = endId(l.target); return focus && (s === focus || t === focus) ? 2.2 : l.cross ? 1.4 : 0.8; });
      if (st.dim === 3) st.graph.backgroundColor(tok('--bg'));
    }

    // ---------------------------------------------------------------- the picture
    const graphData = () => ({ nodes: st.model.nodes, links: (st.mode === 'tree' ? G.treeLinks(st.model) : st.model.links).map(l => ({ source: l.source, target: l.target, rel: l.rel, cross: !!l.cross || l.rel === 'peer' })) });
    // Each node's own nodes gather round its own centre: the node you opened in the middle, each peer beside it.
    function originForce() {
      let nodes = [];
      const centres = () => { const k = Math.max(1, st.net.nodes.length - 1), r = 260; return i => (i === 0 ? { x: 0, y: 0 } : { x: r * Math.cos((2 * Math.PI * (i - 1)) / k), y: r * Math.sin((2 * Math.PI * (i - 1)) / k) }); };
      const f = alpha => { const c = centres(); for (const n of nodes) { const p = c(n.src); n.vx += (p.x - n.x) * 0.05 * alpha; n.vy += (p.y - n.y) * 0.05 * alpha; } };
      f.initialize = ns => { nodes = ns; };
      return f;
    }
    const size = () => ({ w: Math.max(1, view.clientWidth), h: Math.max(1, view.clientHeight) });
    function common(g) {
      const s = size();
      g.width(s.w).height(s.h).nodeId('id').nodeLabel(() => '').linkLabel(() => '')
        .nodeVal(n => 1 + Math.sqrt(n.deg || 0)).linkDirectionalArrowLength(st.dim === 2 ? 4 : 3).linkDirectionalArrowRelPos(1)
        .onNodeClick(n => {
          if (tip.longPressed || Date.now() < tip.suppressClickUntil) return; // the long press showed the tooltip
          select(n.id, false);
          if (FULL) showDetails();
          else showTip(nodeOf(n.id), tip.lastPointer === 'touch' ? null : tip.pointer);
        })
        .onNodeHover(found => {
          const n = tip.inView ? found : null; // no pointer over the picture: nothing is hovered
          if ((n ? n.id : null) === st.hover) return;
          st.hover = n ? n.id : null;
          view.classList.toggle('gx-pointing', !!n);
          restyle();
          clearTimeout(tip.showTimer);
          if (n && tip.lastPointer === 'touch') return; // on touch a long press opens the tooltip
          if (n) {
            // A second's rest opens the tooltip; while one is open, the next node's opens sooner.
            if (tip.node === n.id) clearTimeout(tip.hideTimer);
            else tip.showTimer = setTimeout(() => { if (st.hover === n.id) showTip(nodeOf(n.id), tip.pointer); }, tipEl.hidden ? 1000 : 300);
          } else if (!tipEl.hidden && !tip.byFocus) graceHide();
        })
        .onBackgroundClick(() => { hideTip(); select(null); })
        .nodeVisibility(visible).linkVisibility(linkVisible)
        .dagMode(st.mode === 'tree' ? 'radialout' : null).onDagError(() => {});
      if (st.mode === 'tree') g.dagLevelDistance(st.dim === 2 ? 70 : 60);
      // The layout runs ahead before the first paint (fewer ticks for a large graph, so a big node
      // never blocks the tab), so the first fit already sees the graph near its final shape.
      const n = st.model.nodes.length, ahead = n <= 1000 ? 120 : n <= 3000 ? 30 : 10;
      if (reduced()) g.warmupTicks(Math.min(300, Math.max(ahead, Math.round(30000 / Math.max(1, n))))).cooldownTicks(0); else g.warmupTicks(ahead).cooldownTime(4000);
      g.graphData(graphData());
      if (st.mode !== 'tree' && st.net.nodes.length > 1) g.d3Force('gxOrigin', originForce());
      if (st.dim === 2) { g.d3Force('charge').strength(st.mode === 'tree' ? -60 : -120); g.d3Force('link').distance(st.mode === 'tree' ? 30 : 40); }
      // The picture fits itself into view: at once on the first frame of the layout, again (animated,
      // unless reduced motion is asked for) when the layout comes to rest, and on a resize; never
      // after the visitor has moved the picture or selected a node. The first fit marks the explorer
      // ready, but only while the picture shows the last load that completed: once a newer load has
      // started (st.pending is set until it ends) this graph's callbacks and timer no longer touch
      // the state, so a replacement request is never marked ready before its data arrives, and an
      // error it reports is never overwritten.
      const fit = ms => { if (st.graph === g && !st.pending && (st.userMoved || fitView(ms))) markReady(); };
      // In 3D the first ticks still hold the positions from before the layout ran, so the picture
      // is fitted again every 300 ms while the layout spreads out, until it rests or the visitor moves it.
      let first = true, lastFit = 0;
      g.onEngineTick(() => {
        if (st.graph !== g) return;
        const now = performance.now();
        if (first) { first = false; lastFit = now; fit(0); return; }
        if (st.dim === 3 && !st.userMoved && !st.pending && now - lastFit > 300) { lastFit = now; fitView(0); }
      });
      g.onEngineStop(() => fit(400));
      setTimeout(() => { if (root.getAttribute('data-state') !== 'ready') fit(0); }, reduced() ? 400 : 1500);
      return g;
    }
    /** Fits the visible nodes into the part of the picture no overlay covers: on a wide screen the
     *  status line lies over the top of the picture and the legend over its bottom, so the graph is
     *  centred in the band between them. Returns false while the layout has no position yet. */
    function fitView(ms) {
      const g = st.graph; if (!g || !st.model) return false;
      const t = reduced() ? 0 : ms;
      if (st.dim === 3) { g.zoomToFit(t, 30, visible); return true; }
      const W = view.clientWidth, H = view.clientHeight;
      if (W < 2 || H < 2) return false;
      // Each visible node with a position: its centre, its radius (graph units, as drawn) and the
      // width of the name drawn to its right (screen px, 11 px type), which make2D draws for every
      // Bundle, the node in focus, every node but a Source once the scale reaches 0.9, and every
      // node, Sources too, once it reaches 1.6 (the same condition as the renderer's).
      const ctx = labelCtx(), focus = st.hover || st.selected, pts = [];
      for (const n of st.model.nodes) {
        if (!visible(n) || !Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
        const r = radiusOf(n) + 3, m = nodeOf(n.id) || n;
        const text = m.label.length > 40 ? `${m.label.slice(0, 39)}…` : m.label;
        const lw = ctx ? Math.ceil(ctx.measureText(text).width) + 4 : text.length * 6.5;
        pts.push({ x: n.x, y: n.y, r, always: m.type === 'Bundle' || focus === n.id, some: m.type !== 'Source', lw });
      }
      if (!pts.length) return false;
      const vr = view.getBoundingClientRect();
      const over = el => (el && !el.hidden && getComputedStyle(el).position === 'absolute' ? el.getBoundingClientRect() : null);
      const s = over(statusEl), l = over(legendEl);
      const top = s ? Math.min(H / 3, Math.max(0, s.bottom - vr.top)) : 0;
      const bottom = l ? Math.min(H / 3, Math.max(0, vr.bottom - l.top)) : 0;
      const pad = Math.max(12, Math.min(32, W * 0.04));
      const aw = Math.max(20, W - 2 * pad), ah = Math.max(20, H - top - bottom - 2 * pad);
      // The horizontal extent at scale k, in screen px: the nodes scale, their names do not.
      const extent = k => {
        let a = Infinity, b = -Infinity;
        for (const p of pts) {
          const named = p.always || k >= 1.6 || (k >= 0.9 && p.some);
          a = Math.min(a, (p.x - p.r) * k); b = Math.max(b, (p.x + p.r) * k + (named ? p.lw : 0));
        }
        return [a, b];
      };
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of pts) { x0 = Math.min(x0, p.x - p.r); x1 = Math.max(x1, p.x + p.r); y0 = Math.min(y0, p.y - p.r); y1 = Math.max(y1, p.y + p.r); }
      let k = Math.min(4, ah / Math.max(1, y1 - y0), aw / Math.max(1, x1 - x0));
      for (let i = 0; i < 8; i++) { const [a, b] = extent(k); if (b - a <= aw + 0.5) break; k *= Math.max(0.5, Math.min(0.99, aw / (b - a))); }
      k = Math.max(0.01, k);
      const [a, b] = extent(k);
      const cx = (a + b) / 2 / k, cy = (y0 + y1) / 2 - (top + pad + ah / 2 - H / 2) / k;
      g.centerAt(cx, cy, t); g.zoom(k, t);
      return true;
    }
    let labelCanvas = null;
    function labelCtx() {
      try { if (!labelCanvas) { labelCanvas = document.createElement('canvas').getContext('2d'); labelCanvas.font = '11px system-ui, sans-serif'; } } catch (e) { labelCanvas = null; }
      return labelCanvas;
    }
    // Marks the explorer ready, then applies a selection the address asked for (?node=): it waits
    // for the final picture, so a 3D view that loads later still centres it.
    function markReady() {
      if (root.getAttribute('data-state') !== 'ready') setState('ready');
      const id = st.preselect;
      if (id && st.wantDim === st.dim) { st.preselect = null; setTimeout(() => select(id, true), reduced() ? 50 : 1500); }
    }
    // 2D drawing. Each node: a ring in its origin's colour when it comes from a peer node, the dot
    // in its type's colour, and its name to the right when it is in focus, a Bundle, or the picture
    // is zoomed in far enough (0.9 for every node but a Source, 1.6 for every node).
    function drawNode(n, ctx, scale) {
      const r = radiusOf(n), m = nodeOf(n.id) || n;
      if (m.src) {
        ctx.beginPath(); ctx.arc(n.x, n.y, r + 2.4, 0, 2 * Math.PI);
        ctx.lineWidth = 1.8; ctx.strokeStyle = originColor(m.src); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = st.colorOf ? st.colorOf(n) : typeColor(m.type); ctx.fill();
      const focus = st.hover || st.selected;
      const named = focus === n.id || m.type === 'Bundle' || scale >= 1.6 || (scale >= 0.9 && m.type !== 'Source');
      if (!named) return;
      ctx.font = `${Math.max(11 / scale, 2.2)}px system-ui, sans-serif`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = tok('--fg');
      ctx.fillText(m.label.length > 40 ? `${m.label.slice(0, 39)}…` : m.label, n.x + r + 3, n.y);
    }
    // The area where the pointer finds a node (painted on the library's hidden hit canvas): the
    // drawn dot, and never less than minTargetPx() on screen.
    function paintPointerArea(n, color, ctx, scale) {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(n.x, n.y, Math.max(radiusOf(n), minTargetPx() / scale), 0, 2 * Math.PI); ctx.fill();
    }
    function make2D() {
      const g = new window.ForceGraph(view);
      common(g)
        .linkLineDash(l => (l.cross ? [4, 2] : null))
        .nodeCanvasObjectMode(() => 'replace').nodeCanvasObject(drawNode)
        .nodePointerAreaPaint(paintPointerArea);
      if (!FULL) embedGestures(g);
      return g;
    }
    // The front page's picture sits in a scrolling page: one finger scrolls the page (two pan and
    // zoom), the wheel scrolls the page unless Ctrl or Cmd is held, and on a touch screen a node is
    // not dragged, so a swipe that starts on one still scrolls. The library sets touch-action: none
    // on its canvas when it is made; it is set back here.
    function embedGestures(g) {
      g.enableZoomInteraction(e => !!(e && (e.ctrlKey || e.metaKey)));
      g.enablePanInteraction(e => !(e && e.type === 'touchstart' && e.touches && e.touches.length < 2));
      if (coarsePointer.matches) g.enableNodeDrag(false);
      const canvas = view.querySelector('canvas');
      if (canvas) canvas.style.touchAction = 'pan-y';
    }
    // Whether this browser can draw WebGL: probed once, and the probe's context released at once
    // (a browser keeps only a few contexts alive).
    let hasWebgl = null;
    function webgl() {
      if (hasWebgl !== null) return hasWebgl;
      try {
        const c = document.createElement('canvas'), gl = window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'));
        hasWebgl = !!gl;
        const lose = gl && gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      } catch (e) { hasWebgl = false; }
      return hasWebgl;
    }
    function make3D() {
      const g = new window.ForceGraph3D(view, { controlType: 'orbit' });
      common(g).showNavInfo(false).nodeOpacity(0.95).linkOpacity(0.4).backgroundColor(tok('--bg'));
      return g;
    }
    function mount() {
      if (st.graph) {
        try {
          if (st.webglGraph === st.graph) st.graph.renderer().forceContextLoss(); // free the old 3D picture's WebGL context
          st.graph._destructor();
        } catch (e) { /* already gone */ }
        st.graph = null; view.replaceChildren();
      }
      hideTip();
      st.userMoved = false;
      tip.inView = false;
      if (st.dim === 3) {
        try { if (!webgl()) throw new Error('no WebGL'); st.graph = st.webglGraph = make3D(); }
        catch (e) { view.replaceChildren(); st.dim = 2; st.wantDim = 2; setPressed(); notice('WebGL is not available in this browser, so the picture stays in 2D.'); }
      }
      if (!st.graph) st.graph = make2D();
      restyle();
      rotate(false);
      renderTree();
      setStatus();
    }
    new ResizeObserver(() => { if (st.graph) { const s = size(); st.graph.width(s.w).height(s.h); if (!st.userMoved) fitView(0); } }).observe(view);
    const onTheme = () => { if (st.graph) restyle(); };
    new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    mq('(prefers-color-scheme: dark)').addEventListener('change', onTheme);

    // ---------------------------------------------------------------- status line
    let noticeText = '';
    const notice = t => { noticeText = t; setStatus(); };
    function setStatus() {
      if (!st.net) return;
      const parts = st.net.nodes.map((n, i) => (n.parsed ? `${hostOf(i)}: ${n.parsed.nodes.length} nodes` : `${hostOf(i)}: not read (${n.error || 'no graph'})`));
      const drawn = st.mode === 'tree' ? G.treeLinks(st.model).length : st.model.links.length;
      statusEl.textContent = `${parts.join(' · ')} · ${drawn} links · ${st.dim === 3 ? '3D' : '2D'}${st.mode === 'tree' ? ' tree' : ''}${st.net.cuts && st.net.cuts.length ? ` · cut: ${st.net.cuts.join('; ')}` : ''}${noticeText ? ` · ${noticeText}` : ''}`;
    }

    // ---------------------------------------------------------------- controls (full page)
    const srcInput = FULL ? $('#gx-src') : null;
    function setPressed() {
      if (!FULL) return;
      $('#gx-m-graph').setAttribute('aria-pressed', String(st.mode === 'graph'));
      $('#gx-m-tree').setAttribute('aria-pressed', String(st.mode === 'tree'));
      $('#gx-d-2').setAttribute('aria-pressed', String(st.dim === 2));
      $('#gx-d-3').setAttribute('aria-pressed', String(st.dim === 3));
      const rot = $('#gx-rotate'); rot.hidden = st.dim !== 3; rot.disabled = reduced();
    }
    let rotating = false;
    function rotate(on) {
      rotating = !!on && st.dim === 3 && !reduced();
      if (st.dim === 3 && st.graph && st.graph.controls) { const c = st.graph.controls(); if (c && 'autoRotate' in c) { c.autoRotate = rotating; c.autoRotateSpeed = 0.6; } }
      if (FULL) $('#gx-rotate').setAttribute('aria-pressed', String(rotating));
    }
    // The 3D library is downloaded on first use, once (lib3d holds that download); the dimension
    // asked for last wins, so 2D chosen while it downloads is kept.
    let lib3d = null;
    function load3dLibrary() {
      if (lib3d) return lib3d;
      const src = root.getAttribute('data-gx-3d'), sri = root.getAttribute('data-gx-3d-integrity');
      if (!src || !sri) return Promise.reject(new Error('no 3D library on this page'));
      notice('loading the 3D library (3d-force-graph 1.80.1, from this site)');
      lib3d = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src; s.integrity = sri; s.crossOrigin = 'anonymous';
        quiet.on();
        s.onload = () => { quiet.off(); notice(''); resolve(); };
        s.onerror = () => { quiet.off(); lib3d = null; notice('the 3D library could not be loaded, so the picture stays in 2D'); reject(new Error('3D library not loaded')); };
        document.body.appendChild(s);
      });
      return lib3d;
    }
    async function setDim(d) {
      st.wantDim = d;
      if (d === 2 && noticeText) notice('');
      if (d === 3 && typeof window.ForceGraph3D !== 'function') {
        const stay2d = text => { if (text) notice(text); st.wantDim = st.dim; if (!st.pending) markReady(); };
        if (!webgl()) { stay2d('WebGL is not available in this browser, so the picture stays in 2D.'); return; }
        try { await load3dLibrary(); } catch (e) { stay2d(''); return; }
        if (st.wantDim !== 3) return; // the visitor chose 2D meanwhile
      }
      st.dim = d; setPressed(); if (st.model) mount();
      say(d === 3 ? '3D view' : '2D view');
    }
    function setMode(m) { st.mode = m; setPressed(); if (st.model) mount(); say(m === 'tree' ? 'Tree view: each node, its clusters, their items, their sources' : 'Graph view: every relation'); }
    if (FULL) {
      $('#gx-m-graph').addEventListener('click', () => setMode('graph'));
      $('#gx-m-tree').addEventListener('click', () => setMode('tree'));
      $('#gx-d-2').addEventListener('click', () => setDim(2));
      $('#gx-d-3').addEventListener('click', () => setDim(3));
      $('#gx-rotate').addEventListener('click', () => rotate(!rotating));
      $('#gx-fit').addEventListener('click', () => { st.userMoved = false; fitView(400); });
      const q = $('#gx-q');
      q.addEventListener('input', () => { st.q = q.value.trim(); renderList(); restyle(); });
      q.addEventListener('keydown', e => { if (e.key === 'Enter') { const b = listEl.querySelector('button.gx-nb'); if (b) { select(b.getAttribute('data-id'), true); b.focus(); } } });
      $('#gx-load').addEventListener('click', () => load(srcInput.value, true));
      srcInput.addEventListener('keydown', e => { if (e.key === 'Enter') load(srcInput.value, true); });
      const depth = $('#gx-depth');
      // The picture starts with the node alone; Peers reads the peer nodes it names (one hop; the
      // address ?depth=2 reads their peers too).
      depth.checked = st.depth >= 1;
      depth.addEventListener('change', () => { st.depth = depth.checked ? 1 : 0; load(st.shown || srcInput.value, true); });
      setPressed();
    }

    // ---------------------------------------------------------------- resizable side panel (full page)
    if (FULL) {
      const body = $('.gx-body'), split = $('.gx-split'), KEY = 'agsc-graph-panel', MIN = 240;
      // At most 60 % of the explorer's own width (it sits in the page's 60rem container, not the window).
      const max = () => Math.max(MIN, Math.round((body.clientWidth || window.innerWidth) * 0.6));
      // The default width: 352 px, or 40 % of the explorer on a tablet, so the picture keeps the
      // larger part; a width the visitor chose is remembered and kept.
      const byDefault = () => Math.max(MIN, Math.min(352, Math.round((body.clientWidth || window.innerWidth) * 0.4)));
      let width = byDefault(), chosen = false;
      try { const v = Number(localStorage.getItem(KEY)); if (v >= MIN) { width = v; chosen = true; } } catch (e) { /* no storage: the default width */ }
      const apply = w => {
        width = Math.round(Math.min(max(), Math.max(MIN, w)));
        body.style.setProperty('--gx-panel-w', `${width}px`);
        split.setAttribute('aria-valuemin', String(MIN)); split.setAttribute('aria-valuemax', String(max()));
        split.setAttribute('aria-valuenow', String(width)); split.setAttribute('aria-valuetext', `side panel ${width} pixels wide`);
      };
      const save = () => { chosen = true; try { localStorage.setItem(KEY, String(width)); } catch (e) { /* not kept: fine */ } };
      apply(width);
      // A tap (or a click) that does not drag steps the width: narrowest, default, widest, then
      // narrowest again. It is the single-pointer alternative to dragging (WCAG 2.5.7).
      const step = () => {
        const stops = [MIN, byDefault(), max()].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);
        apply(stops.find(v => v > width + 1) ?? stops[0]);
      };
      split.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        e.preventDefault(); split.setPointerCapture(e.pointerId); split.classList.add('gx-dragging');
        const x0 = e.clientX;
        let moved = false;
        const move = ev => {
          if (!moved && Math.abs(ev.clientX - x0) < 5) return;
          moved = true; apply(body.getBoundingClientRect().right - ev.clientX - split.offsetWidth / 2);
        };
        const up = ev => {
          split.releasePointerCapture(e.pointerId); split.classList.remove('gx-dragging'); split.removeEventListener('pointermove', move); split.removeEventListener('pointerup', up); split.removeEventListener('pointercancel', up);
          if (!moved && ev.type === 'pointerup') step();
          save();
        };
        split.addEventListener('pointermove', move); split.addEventListener('pointerup', up); split.addEventListener('pointercancel', up);
      });
      split.addEventListener('keydown', e => {
        const step = e.shiftKey ? 64 : 16;
        const next = { ArrowLeft: width + step, ArrowRight: width - step, Home: MIN, End: max() }[e.key];
        if (next === undefined) return;
        e.preventDefault(); apply(next); save();
      });
      window.addEventListener('resize', () => apply(chosen ? width : byDefault()));
      // The explorer fills the window below its controls: graph-explorer.css sizes it from the height
      // of the controls and the help line above it, which wrap differently at each width.
      const controls = $('.gx-controls'), help = $('.gx-help');
      const chrome = () => { const h = controls.offsetHeight + (help ? help.offsetHeight : 0); root.style.setProperty('--gx-chrome', `${Math.ceil(h)}px`); };
      chrome();
      new ResizeObserver(chrome).observe(controls);
    }

    // ---------------------------------------------------------------- load
    async function sha256(bytes) {
      if (!(window.crypto && crypto.subtle)) throw new Error('no Web Crypto');
      const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      let s = ''; for (const b of d) s += String.fromCharCode(b);
      return btoa(s);
    }
    // Reads a node (and, with Peers ticked, the peers it names) and draws it. A newer load replaces
    // one still in flight (the ticket). A load that fails, or finds nothing to draw, leaves the
    // picture and the panel as they were and says why in the status line.
    async function load(address, user) {
      const ticket = ++st.loading;
      const target = (address || '').trim() || `${location.origin}/`;
      st.pending = ticket;
      hideTip();
      setState('loading');
      statusEl.textContent = `Reading ${target}${st.depth ? ' and the peers it names' : ''}…`;
      let net = null, problem = null;
      try {
        net = await G.loadNetwork(target, { fetch: (u, o) => window.fetch(u, o), sha256: window.crypto && crypto.subtle ? sha256 : null, depth: st.depth, base: location.href, lang: LANG });
      } catch (e) {
        problem = `Could not read ${target}: ${e.message}. Give a node's address, its discovery document or its graph.jsonld.`;
      }
      if (ticket !== st.loading) return; // a newer load has started
      st.pending = 0;
      if (!problem && !net.model.nodes.length) problem = `Nothing to draw from ${target}: ${net.nodes[0].error || 'the graph has no nodes'}.`;
      if (problem) { statusEl.textContent = problem; setState('error'); return; }
      show(net, target, user);
    }
    function show(net, target, user) {
      if (!(window.crypto && crypto.subtle)) for (const n of net.nodes) if (n.declaredDigest) n.digest = 'not checked';
      st.net = net; st.model = net.model; st.shown = target;
      st.selected = null; st.hover = null; st.hiddenSrc.clear(); st.chunks.clear();
      st.known = new Set(net.nodes.flatMap(n => [n.anchor, n.url].filter(Boolean).map(G.originOf)));
      if (FULL && user) rememberInAddress(net, target);
      renderLegend(); renderList(); renderSources(); renderDetail(null);
      mount();
      const read = net.nodes.filter(n => n.parsed).length;
      say(`Read ${st.model.nodes.length} nodes and ${st.model.links.length} links from ${read} node${read === 1 ? '' : 's'}`);
      const pre = P.get('node');
      if (pre && nodeOf(pre) && !user) st.preselect = pre; // applied by markReady()
    }
    // The page's address records what is shown (src, depth), so a reload or a shared link shows it again.
    function rememberInAddress(net, target) {
      const u = new URL(location.href);
      const ownNode = G.originOf(net.start.linkset) === location.origin && !net.start.graph;
      if (ownNode) u.searchParams.delete('src'); else u.searchParams.set('src', target);
      if (st.depth >= 1) u.searchParams.set('depth', String(st.depth)); else u.searchParams.delete('depth');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    }

    const first = FULL ? (P.get('src') || `${location.origin}/`) : `${location.origin}/`;
    if (FULL) srcInput.value = first;
    if (FULL && P.get('dim') === '3') { load(first, false).then(() => setDim(3)); } else load(first, false);
  }
})();
