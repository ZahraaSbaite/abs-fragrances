
const GENDERS = ['Men', 'Women', 'Unisex', 'Musk'];

let BRANDS = {};
let PRODUCTS = {};
let BUNDLES = [];
let _productsPromise = null;

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

function initProducts(force) {
  if (_productsPromise && !force) return _productsPromise;
  _productsPromise = (async () => {
    try {
      const [brandsRes, productsRes, bundlesRes] = await Promise.all([
        fetch(`${API_BASE}/products/brands`),
        fetch(`${API_BASE}/products`),
        fetch(`${API_BASE}/bundles`).catch(() => null),
      ]);
      try { BUNDLES = bundlesRes && bundlesRes.ok ? (await bundlesRes.json()).bundles || [] : []; } catch { BUNDLES = []; }
      const brandsData = await brandsRes.json();
      const productsData = await productsRes.json();
      BRANDS = Object.fromEntries((brandsData.brands || []).map(b => [b.id, b]));
      PRODUCTS = Object.fromEntries((productsData.products || []).map(p => [p.id, mapProduct(p)]));
    } catch (err) {
      console.error('Failed to load products from API:', err);
      BRANDS = {}; PRODUCTS = {};
    }
    return PRODUCTS;
  })();
  return _productsPromise;
}

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
