/**
 * ABS FRAGRANCES — theme.js
 * Must be the first script loaded on every page so the correct theme is
 * set before first paint (avoids a flash of the wrong theme).
 */
(function() {
  const stored = localStorage.getItem('theme');
  document.documentElement.setAttribute('data-theme', stored || 'light');
})();

function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  document.querySelectorAll('.theme-toggle').forEach(updateThemeToggleIcon);
}

function updateThemeToggleIcon(btn) {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  btn.textContent = isDark ? '☀️' : '🌙';
  btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.theme-toggle').forEach(btn => {
    updateThemeToggleIcon(btn);
    btn.addEventListener('click', toggleTheme);
  });
});
