
const GENDERS = ['Men', 'Women', 'Unisex', 'Musk'];

let BRANDS = {};
let PRODUCTS = {};
let BUNDLES = [];
let _productsPromise = null;

// GET an API path as JSON. If the server doesn't start answering within `timeout` ms the
// attempt is cut off and retried (a sleeping server gets ~a minute in total to wake up).
// Once it has answered, the body gets up to `bodyTimeout` ms — a big response on a slow
// connection must be allowed to finish, not be cut off and retried from scratch.
async function fetchJson(path, { timeout = 20000, bodyTimeout = 120000, retries = 2 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    let timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const r = await fetch(`${API_BASE}${path}`, { signal: ctrl.signal });
      clearTimeout(timer);
      timer = setTimeout(() => ctrl.abort(), bodyTimeout);
      if (!r.ok) throw new Error(`${path} → ${r.status}`);
      return await r.json();
    } catch (err) {
      if (attempt >= retries) throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

function formatPrice(cents) {
  if (cents == null) return 'On Request';
  return '$' + (cents / 100).toFixed(2);
}

function mapProduct(row) {
  return {
    id: row.id, name: row.name, brand: row.brand_id,
    brandName: row.brand_name || (BRANDS[row.brand_id] && BRANDS[row.brand_id].name) || '',
    gender: row.gender, notes: row.notes || [],
    shortDesc: row.short_desc || '', fullDesc: row.full_desc || '',
    badge: row.badge || '', badgeClass: row.badge_class || '',
    priceCents: row.price_cents, regularPrice: formatPrice(row.price_cents),
    saleCents: row.sale_price_cents != null && row.sale_price_cents < row.price_cents ? row.sale_price_cents : null,
    onSale: row.sale_price_cents != null && row.sale_price_cents < row.price_cents,
    // finalCents / price = what the customer actually pays (sale price when on sale)
    finalCents: row.sale_price_cents != null && row.sale_price_cents < row.price_cents ? row.sale_price_cents : row.price_cents,
    price: formatPrice(row.sale_price_cents != null && row.sale_price_cents < row.price_cents ? row.sale_price_cents : row.price_cents),
    intensity: row.intensity || '', stock: row.in_stock !== false,
    image: row.image_url || null, isFeatured: row.is_featured === true, isInspired: row.is_inspired === true,
  };
}

// ── Speed: the catalog is cached in localStorage so repeat visits (and moving between
// pages) render instantly, while a fresh copy is fetched in the background. The API lives
// on a free host that can take 30-60s to wake up, so we never make visitors wait on it
// when we already have a recent copy.
const CATALOG_CACHE_KEY = 'abs_catalog_v1';
const CATALOG_CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // ignore caches older than a day

function readCatalogCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CATALOG_CACHE_KEY) || 'null');
    if (c && c.brands && c.products && Date.now() - c.t < CATALOG_CACHE_MAX_AGE) return c;
  } catch { /* ignore */ }
  return null;
}
function writeCatalogCache(data) {
  try { localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({ ...data, t: Date.now() })); } catch { /* storage full/blocked */ }
}
function applyCatalog(c) {
  BRANDS = Object.fromEntries((c.brands || []).map(b => [b.id, b]));
  PRODUCTS = Object.fromEntries((c.products || []).map(p => [p.id, mapProduct(p)]));
  if (c.bundles) setBundles(c.bundles);
}

// Bundles load on their own, so products never wait on them. Pages that show bundles
// listen for this event and re-render whenever the list arrives or changes.
function setBundles(list) {
  BUNDLES = list || [];
  document.dispatchEvent(new CustomEvent('bundles:updated'));
}

async function fetchCatalog() {
  const [brandsData, productsData] = await Promise.all([fetchJson('/products/brands'), fetchJson('/products')]);
  return { brands: brandsData.brands || [], products: productsData.products || [] };
}

function initProducts(force) {
  if (_productsPromise && !force) return _productsPromise;

  const cached = force ? null : readCatalogCache();
  const refresh = fetchCatalog();
  const bundles = fetchJson('/bundles').then(d => d.bundles || [], () => null);

  // Save brands+products+bundles together once all have come back.
  Promise.all([refresh, bundles]).then(([fresh, b]) => {
    writeCatalogCache({ ...fresh, bundles: b || (cached && cached.bundles) || [] });
  }).catch(() => {});
  bundles.then(b => { if (b) setBundles(b); });

  if (cached) {
    // Instant render from cache; quietly update the globals for next time.
    applyCatalog(cached);
    refresh.then(applyCatalog).catch(err => console.warn('Background refresh failed:', err));
    _productsPromise = Promise.resolve(PRODUCTS);
    return _productsPromise;
  }

  _productsPromise = (async () => {
    try {
      applyCatalog(await refresh);
    } catch (err) {
      console.error('Failed to load products from API:', err);
      BRANDS = {}; PRODUCTS = {};
    }
    return PRODUCTS;
  })();
  return _productsPromise;
}

// Start downloading right away instead of waiting for DOMContentLoaded.
// (Skipped on the admin dashboard, which manages its own loading.)
if (!location.pathname.includes('/admin/')) initProducts();

function getAllProductsCatalog() { return PRODUCTS; }
function getBundles() { return BUNDLES; }
function getSaleProducts() { return Object.values(PRODUCTS).filter(p => p.onSale); }
// Price block: regular price struck through next to the sale price when on sale.
function priceHTML(p) {
  return p.onSale
    ? `<span class="price-old">${p.regularPrice}</span><span class="price-now">${p.price}</span>`
    : p.price;
}
function getProductsByGender(gender) {
  return Object.values(PRODUCTS).filter(p => p.gender?.toLowerCase() === gender.toLowerCase());
}
function getProductsByBrand(brandId) {
  return Object.values(PRODUCTS).filter(p => p.brand === brandId);
}
function getProductsByGenderAndBrand(gender, brandId) {
  return Object.values(PRODUCTS).filter(p =>
    p.gender.toLowerCase() === gender.toLowerCase() && p.brand === brandId);
}
function searchProducts(query) {
  const q = query.toLowerCase().trim();
  const all = Object.values(PRODUCTS);
  if (!q) return all;
  return all.filter(p =>
    p.name.toLowerCase().includes(q) ||
    (p.brand && BRANDS[p.brand]?.name.toLowerCase().includes(q)) ||
    p.notes?.some(n => n.toLowerCase().includes(q)) ||
    p.gender.toLowerCase().includes(q) ||
    p.shortDesc.toLowerCase().includes(q));
}
