/**
 * Product/bundle photos are stored in the database as base64 "data:" URLs.
 * Sending those inside the JSON lists made every page load download megabytes.
 *
 * Instead, list endpoints now return a small URL per photo
 * (/api/products/:id/image?v=<hash>) and the browser fetches + caches each
 * image separately. The ?v= hash changes when the photo changes, so caching
 * for a year is safe.
 */

// Column list for products WITHOUT the heavy image_url blob.
// Always includes image_is_data / image_v so withImageUrls() can build the link.
function productCols(a = 'p') {
  return `${a}.id, ${a}.name, ${a}.brand_id, ${a}.gender, ${a}.notes, ${a}.short_desc, ${a}.full_desc,
    ${a}.badge, ${a}.badge_class, ${a}.price_cents, ${a}.sale_price_cents, ${a}.intensity, ${a}.in_stock,
    ${a}.is_featured, ${a}.is_inspired, ${a}.created_at,
    ${imageCols(`${a}.image_url`, 'image')}`;
}

// url / is_data / v columns for a stored image. Built only from the first few KB and the
// byte length (which Postgres reads without loading the value), so listing never pulls
// every full photo off disk just to hash it.
function imageCols(col, as) {
  const isData = `left(${col}, 5) = 'data:'`;
  return `CASE WHEN ${isData} THEN NULL ELSE ${col} END AS ${as}_url,
    COALESCE(${isData}, false) AS ${as}_is_data,
    md5(COALESCE(left(${col}, 4000), '') || octet_length(${col})::text) AS ${as}_v`;
}

function origin(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function withImageUrls(rows, req) {
  const base = origin(req);
  return rows.map((r) => {
    if (r.image_is_data) r.image_url = `${base}/api/products/${encodeURIComponent(r.id)}/image?v=${r.image_v}`;
    delete r.image_is_data;
    delete r.image_v;
    return r;
  });
}

// Sends a stored image (data: URL or normal URL) as a real, long-cached image response.
function sendImage(res, value) {
  if (!value) return res.status(404).end();
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(value);
  if (!m) return res.redirect(302, value); // plain https:// URL — just point at it
  const buf = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]));
  res.set({
    'Content-Type': m[1],
    'Content-Length': buf.length,
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
  return res.send(buf);
}

// If the admin dashboard sends back one of our own image links unchanged,
// that means "photo not changed" — never overwrite the stored image with a link.
function isOwnImageLink(v) {
  return typeof v === 'string' && /\/api\/(products|bundles)\/[^/]+\/image\?v=|\/api\/products\/brands\/[^/]+\/logo\?v=/.test(v);
}

module.exports = { imageCols, productCols, withImageUrls, sendImage, isOwnImageLink };
