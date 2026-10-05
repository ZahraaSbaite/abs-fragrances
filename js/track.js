/**
 * ABS FRAGRANCES — track.js
 * Counts page views for Admin → Analytics. Each browser gets a random id kept in
 * localStorage (no names, no cookies, nothing personal). Sent with sendBeacon, so it
 * never slows the page down or waits on the (sometimes sleeping) API.
 * Load after config.js.
 */
(function trackVisit() {
  if (navigator.webdriver || !window.API_BASE) return;
  let id;
  try {
    id = localStorage.getItem('abs_vid');
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
      localStorage.setItem('abs_vid', id);
    }
  } catch {
    id = 'tmp-' + Math.random().toString(36).slice(2, 14); // storage blocked: counted as a one-off visitor
  }
  const utm = new URLSearchParams(location.search).get('utm_source') || '';
  const body = JSON.stringify({ visitor_id: id, path: location.pathname, referrer: document.referrer, utm });
  const url = `${API_BASE}/analytics/visit`;
  try {
    // text/plain keeps it a "simple" request: no CORS preflight.
    if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }))) return;
  } catch { /* fall through */ }
  fetch(url, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => {});
})();
