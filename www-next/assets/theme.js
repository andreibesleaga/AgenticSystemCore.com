(function () {
  'use strict';
  // The visitor's theme choice: 'light', 'dark' or absent ('auto', the system theme).
  // Stored in this browser only, under one key; never sent anywhere, no cookie.
  var KEY = 'agsc-theme';
  var root = document.documentElement;
  function read() {
    try {
      var v = window.localStorage.getItem(KEY);
      return v === 'light' || v === 'dark' ? v : 'auto';
    } catch (e) { return 'auto'; }
  }
  function apply(v) {
    if (v === 'light' || v === 'dark') root.setAttribute('data-theme', v);
    else root.removeAttribute('data-theme');
  }
  apply(read());
  function wire() {
    var box = document.getElementById('theme');
    var select = box && box.querySelector('select');
    if (!select) return;
    select.value = read();
    select.addEventListener('change', function () {
      var v = select.value === 'light' || select.value === 'dark' ? select.value : 'auto';
      try {
        if (v === 'auto') window.localStorage.removeItem(KEY);
        else window.localStorage.setItem(KEY, v);
      } catch (e) { /* storage unavailable: the choice lasts for this page only */ }
      apply(v);
    });
    box.hidden = false;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
}());
