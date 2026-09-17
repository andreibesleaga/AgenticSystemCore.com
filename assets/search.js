// Site search: same-origin, no dependencies, nothing leaves the browser (AGSC-06-05).
// Loads /assets/search-site.json once (every page and every rule of this site) and ranks
// entries by the query's tokens. Without JavaScript the page shows the full index instead.
(function () {
  'use strict';
  var form = document.getElementById('search-form'), input = document.getElementById('q'), out = document.getElementById('results');
  var status = document.getElementById('search-status'), fallback = document.getElementById('site-index');
  if (!form || !input || !out) return;
  var index = null, loading = null;
  var tokenize = function (s) { return s.normalize('NFC').toLowerCase().split(/[^\p{L}\p{Nd}\p{M}]+/u).filter(function (t) { return t.length >= 2; }); };
  var load = function () {
    if (index) return Promise.resolve(index);
    if (!loading) loading = fetch('/assets/search-site.json', { credentials: 'omit' }).then(function (r) { return r.json(); }).then(function (j) { index = j.map(function (e) { return { url: e.url, title: e.title, text: e.text, kind: e.kind, lower: (e.title + ' ' + e.text).normalize('NFC').toLowerCase() }; }); return index; });
    return loading;
  };
  var esc = function (s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var snippet = function (text, terms) {
    var lower = text.toLowerCase(), pos = -1;
    for (var i = 0; i < terms.length && pos < 0; i++) pos = lower.indexOf(terms[i]);
    var start = Math.max(0, pos - 70), end = Math.min(text.length, (pos < 0 ? 0 : pos) + 150);
    return (start > 0 ? '… ' : '') + esc(text.slice(start, end)) + (end < text.length ? ' …' : '');
  };
  var run = function () {
    var q = input.value.trim(), terms = tokenize(q);
    if (!terms.length) { out.innerHTML = ''; if (fallback) fallback.hidden = false; status.textContent = ''; return; }
    load().then(function (idx) {
      var hits = [];
      var qLower = q.toLowerCase();
      for (var i = 0; i < idx.length; i++) {
        var e = idx[i], score = 0, titleLower = e.title.toLowerCase();
        if (titleLower === qLower) score += 100; else if (titleLower.indexOf(qLower) === 0) score += 30;
        for (var t = 0; t < terms.length; t++) {
          var term = terms[t];
          if (titleLower.indexOf(term) >= 0) score += 5;
          if (e.lower.indexOf(term) >= 0) score += 1; else { score = 0; break; }
        }
        if (score > 0) hits.push({ e: e, score: score });
      }
      hits.sort(function (a, b) { return b.score - a.score || (a.e.title < b.e.title ? -1 : 1); });
      var top = hits.slice(0, 40);
      if (fallback) fallback.hidden = true;
      status.textContent = hits.length ? hits.length + (hits.length === 1 ? ' result' : ' results') + (hits.length > 40 ? ', showing the first 40' : '') : 'No results for “' + q + '”.';
      out.innerHTML = top.map(function (h) {
        return '<li><a href="' + esc(h.e.url) + '">' + esc(h.e.title) + '</a> <span class="id">' + esc(h.e.kind) + '</span><br><span class="snippet">' + snippet(h.e.text, terms) + '</span></li>';
      }).join('');
    }).catch(function () { status.textContent = 'The search index could not be loaded; the full index below is still available.'; if (fallback) fallback.hidden = false; });
  };
  form.addEventListener('submit', function (ev) { ev.preventDefault(); run(); });
  var timer = null;
  input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(run, 120); });
  var params = new URLSearchParams(location.search);
  if (params.get('q')) { input.value = params.get('q'); run(); }
})();
