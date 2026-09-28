const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { imageCols, sendImage, isOwnImageLink } = require('../imageUrls');

const router = express.Router();

// Every bundle with its perfumes attached. `onlyActive` hides bundles the admin switched off.
async function loadBundles(onlyActive, req) {
  const result = await pool.query(
    `SELECT b.id, b.name, b.description, b.price_cents, b.is_active, b.created_at,
       ${imageCols('b.image_url', 'image')},
       COALESCE((
         SELECT json_agg(json_build_object(
           'product_id', p.id, 'name', p.name, 'quantity', bi.quantity,
           'price_cents', p.price_cents,
           'image_url', CASE WHEN left(p.image_url, 5) = 'data:' THEN NULL ELSE p.image_url END,
           'image_is_data', COALESCE(left(p.image_url, 5) = 'data:', false),
           'image_v', md5(COALESCE(left(p.image_url, 4000), '') || octet_length(p.image_url)::text),
           'brand_name', br.name) ORDER BY p.name)
         FROM bundle_items bi
         JOIN products p ON p.id = bi.product_id
         LEFT JOIN brands br ON br.id = p.brand_id
         WHERE bi.bundle_id = b.id), '[]'::json) AS items
     FROM bundles b
     ${onlyActive ? 'WHERE b.is_active = true' : ''}
     ORDER BY b.created_at DESC`
  );
  const base = `${req.protocol}://${req.get('host')}`;
  return result.rows.map((b) => {
    if (b.image_is_data) b.image_url = `${base}/api/bundles/${encodeURIComponent(b.id)}/image?v=${b.image_v}`;
    delete b.image_is_data; delete b.image_v;
    b.items = b.items.map((it) => {
      if (it.image_is_data) it.image_url = `${base}/api/products/${encodeURIComponent(it.product_id)}/image?v=${it.image_v}`;
      delete it.image_is_data; delete it.image_v;
      return it;
    });
    return b;
  });
}

// GET /api/bundles/:id/image — bundle photo as a real, long-cached image
router.get('/:id/image', async (req, res) => {
  try {
    const r = await pool.query('SELECT image_url FROM bundles WHERE id = $1', [req.params.id]);
    sendImage(res, r.rows[0] && r.rows[0].image_url);
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

// GET /api/bundles — public, active bundles only (shown on the home page)
router.get('/', async (req, res) => {
  try {
    const bundles = (await loadBundles(true, req)).filter((b) => b.items.length);
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
    res.json({ bundles });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch bundles' });
  }
});

// GET /api/bundles/all — admin only, includes inactive bundles
router.get('/all', requireAuth, requireAdmin, async (req, res) => {
  try {
    res.json({ bundles: await loadBundles(false, req) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch bundles' });
  }
});

// Validates the request body; returns { error } or the cleaned values.
function parseBundle(body) {
  const name = (body.name || '').trim();
  const price = Math.round(Number(body.price_cents));
  const items = Array.isArray(body.items) ? body.items : [];
  if (!name) return { error: 'Bundle name is required' };
  if (!Number.isFinite(price) || price < 0) return { error: 'A valid bundle price is required' };
  if (!items.length) return { error: 'Pick at least one perfume for the bundle' };
  const seen = new Set();
  const clean = [];
  for (const it of items) {
    if (!it.product_id || seen.has(it.product_id)) continue;
    seen.add(it.product_id);
    clean.push({ product_id: it.product_id, quantity: Math.max(1, parseInt(it.quantity, 10) || 1) });
  }
  return { name, price, items: clean, description: body.description || null,
    image_url: body.image_url || null, keepImage: isOwnImageLink(body.image_url), is_active: body.is_active !== false };
}

async function saveItems(client, bundleId, items) {
  await client.query('DELETE FROM bundle_items WHERE bundle_id = $1', [bundleId]);
  for (const it of items) {
    await client.query(
      'INSERT INTO bundle_items (bundle_id, product_id, quantity) VALUES ($1,$2,$3)',
      [bundleId, it.product_id, it.quantity]
    );
  }
}

// POST /api/bundles — admin only
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const b = parseBundle(req.body);
  if (b.error) return res.status(400).json({ error: b.error });
  const id = 'bundle-' + Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO bundles (id, name, description, image_url, price_cents, is_active)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, b.name, b.description, b.keepImage ? null : b.image_url, b.price, b.is_active]
    );
    await saveItems(client, id, b.items);
    await client.query('COMMIT');
    res.status(201).json({ id });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(err.code === '23503' ? 400 : 500).json({ error: 'Failed to create bundle' });
  } finally {
    client.release();
  }
});

// PUT /api/bundles/:id — admin only (full update, including on/off)
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const b = parseBundle(req.body);
  if (b.error) return res.status(400).json({ error: b.error });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `UPDATE bundles SET name=$1, description=$2,
         image_url = CASE WHEN $7::boolean THEN image_url ELSE $3 END,
         price_cents=$4, is_active=$5
       WHERE id=$6 RETURNING id`,
      [b.name, b.description, b.image_url, b.price, b.is_active, req.params.id, b.keepImage]
    );
    if (!r.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Bundle not found' }); }
    await saveItems(client, req.params.id, b.items);
    await client.query('COMMIT');
    res.json({ id: req.params.id });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to update bundle' });
  } finally {
    client.release();
  }
});

// DELETE /api/bundles/:id — admin only
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM bundles WHERE id = $1 RETURNING id', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Bundle not found' });
    res.json({ deleted: req.params.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete bundle' });
  }
});

module.exports = router;
