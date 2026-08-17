/**
 * ABS FRAGRANCES — theme.js
 * Must load as early as possible in <head>, before body content paints,
 * so a saved dark-mode choice applies with no flash of the wrong theme.
 * Scoped to storefront pages only (admin dashboard stays fixed light).
 */
(function () {
  function applyStoredTheme() {
    try {
      var t = localStorage.getItem('abs_theme');
      if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
    } catch (e) { /* localStorage unavailable — fall back to system preference via CSS media query */ }
  }
  applyStoredTheme();

  function currentlyDark() {
    var attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark') return true;
    if (attr === 'light') return false;
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function updateToggleUI() {
    var dark = currentlyDark();
    document.querySelectorAll('.theme-toggle').forEach(function (btn) {
      btn.classList.toggle('is-dark', dark);
      btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      btn.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    });
  }

  function toggleTheme() {
    var next = currentlyDark() ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('abs_theme', next); } catch (e) {}
    updateToggleUI();
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.theme-toggle').forEach(function (btn) {
      btn.addEventListener('click', toggleTheme);
    });
    updateToggleUI();
  });

  window.toggleSiteTheme = toggleTheme;
})();
