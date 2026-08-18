/**
 * ABS FRAGRANCES — settings.js
 * Loads the site's WhatsApp number + social links from the backend and
 * fills them into every element marked with a data-wa-link / data-ig-link /
 * data-fb-link / data-tiktok-link / data-email-link attribute. Elements keep
 * their original hardcoded href as a fallback until this resolves (or if the API is down).
 */
window.SITE_SETTINGS = {
  whatsapp_number: '96178901234',
  facebook_url: '',
  instagram_url: 'https://www.instagram.com/absfragrances',
  tiktok_url: '',
  email: '',
};

function buildWaLink(text) {
  const num = (window.SITE_SETTINGS.whatsapp_number || '').replace(/\D/g, '');
  return 'https://wa.me/' + num + (text ? '?text=' + encodeURIComponent(text) : '');
}
window.buildWaLink = buildWaLink;

function applySiteSettingsToDOM() {
  const s = window.SITE_SETTINGS;
  document.querySelectorAll('[data-wa-link]').forEach(el => {
    el.href = buildWaLink(el.getAttribute('data-wa-text') || '');
  });
  document.querySelectorAll('[data-wa-number-text]').forEach(el => {
    if (s.whatsapp_number) el.textContent = '+' + s.whatsapp_number;
  });
  document.querySelectorAll('[data-ig-link]').forEach(el => {
    if (s.instagram_url) el.href = s.instagram_url;
  });
  document.querySelectorAll('[data-fb-link]').forEach(el => {
    if (s.facebook_url) { el.href = s.facebook_url; el.style.display = ''; }
    else { el.style.display = 'none'; }
  });
  document.querySelectorAll('[data-tiktok-link]').forEach(el => {
    if (s.tiktok_url) { el.href = s.tiktok_url; el.style.display = ''; }
    else { el.style.display = 'none'; }
  });
  document.querySelectorAll('[data-email-link]').forEach(el => {
    if (s.email) { el.href = 'mailto:' + s.email; el.style.display = ''; }
    else { el.style.display = 'none'; }
  });
  document.querySelectorAll('[data-email-text]').forEach(el => {
    if (s.email) el.textContent = s.email;
  });
}
window.applySiteSettingsToDOM = applySiteSettingsToDOM;

(async function loadSiteSettings() {
  try {
    const res = await fetch(`${API_BASE}/settings`);
    const data = await res.json();
    if (data.settings) Object.assign(window.SITE_SETTINGS, data.settings);
  } catch (err) {
    console.error('Failed to load site settings:', err);
  }
  applySiteSettingsToDOM();
})();
