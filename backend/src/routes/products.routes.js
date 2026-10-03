const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { imageCols, productCols, withImageUrls, sendImage, isOwnImageLink } = require('../imageUrls');

const router = express.Router();

// GET /api/products — optional query filters: ?gender=Men&brand=rasasi&q=search
router.get('/', async (req, res) => {
  const { gender, brand, q } = req.query;
  const clauses = [];
  const params = [];

  if (gender) { params.push(gender); clauses.push(`gender = $${params.length}`); }
  if (brand) { params.push(brand); clauses.push(`brand_id = $${params.length}`); }
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    clauses.push(`(LOWER(name) LIKE $${params.length} OR LOWER(short_desc) LIKE $${params.length})`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  try {
    const result = await pool.query(
      `SELECT ${productCols('p')}, b.name AS brand_name, b.logo AS brand_logo
       FROM products p
       LEFT JOIN brands b ON b.id = p.brand_id
       ${where}
       ORDER BY p.name`,
      params
    );
    // Short cache so repeat visits / other pages don't re-hit the (sleepy) server.
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
    res.json({ products: withImageUrls(result.rows, req) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET /api/products/brands — list all brands (used for filter dropdowns)
router.get('/brands', async (req, res) => {
  try {
    // Logos stored as base64 are served from /brands/:id/logo instead of inlined in the list.
    const result = await pool.query(
      `SELECT id, name, logo, ${imageCols('logo_url', 'logo')} FROM brands ORDER BY name`
    );
    const base = `${req.protocol}://${req.get('host')}`;
    const brands = result.rows.map(({ logo_is_data, logo_v, ...b }) => {
      if (logo_is_data) b.logo_url = `${base}/api/products/brands/${encodeURIComponent(b.id)}/logo?v=${logo_v}`;
      return b;
    });
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
    res.json({ brands });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch brands' });
  }
});

// GET /api/products/brands/:id/logo — brand logo as a real, long-cached image
router.get('/brands/:id/logo', async (req, res) => {
  try {
    const result = await pool.query('SELECT logo_url FROM brands WHERE id = $1', [req.params.id]);
    sendImage(res, result.rows[0] && result.rows[0].logo_url);
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

// POST /api/products/brands — admin only
router.post('/brands', requireAuth, requireAdmin, async (req, res) => {
  const { id, name, logo, logo_url } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'id and name are required' });
  try {
    const result = await pool.query(
      'INSERT INTO brands (id, name, logo, logo_url) VALUES ($1,$2,$3,$4) RETURNING id, name',
      [id, name, logo || null, (!isOwnImageLink(logo_url) && logo_url) || null]
    );
    res.status(201).json({ brand: result.rows[0] });
  } catch (err) {
    console.error(err);
    if (err.code === '23505') return res.status(409).json({ error: 'A brand with this id already exists' });
    res.status(500).json({ error: 'Failed to create brand' });
  }
});

// PUT /api/products/brands/:id — admin only
router.put('/brands/:id', requireAuth, requireAdmin, async (req, res) => {
  const { name, logo, logo_url } = req.body;
  if (name === undefined && logo === undefined && logo_url === undefined) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  const fields = [];
  const params = [];
  if (name !== undefined) { params.push(name); fields.push(`name = $${params.length}`); }
  if (logo !== undefined) { params.push(logo); fields.push(`logo = $${params.length}`); }
  if (logo_url !== undefined && !isOwnImageLink(logo_url)) { params.push(logo_url); fields.push(`logo_url = $${params.length}`); }
  params.push(req.params.id);
  try {
    const result = await pool.query(
      `UPDATE brands SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING id, name`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Brand not found' });
    res.json({ brand: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update brand' });
  }
});

// DELETE /api/products/brands/:id — admin only. Deletes the brand AND all its perfumes,
// in one transaction. Past orders are unaffected (order lines keep their own name/price);
// the perfumes drop out of any bundle they were in.
router.delete('/brands/:id', requireAuth, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const products = await client.query('DELETE FROM products WHERE brand_id = $1 RETURNING id', [req.params.id]);
    const result = await client.query('DELETE FROM brands WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Brand not found' }); }
    await client.query('COMMIT');
    res.json({ deleted: req.params.id, deletedProducts: products.rowCount });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to delete brand' });
  } finally {
    client.release();
  }
});

// GET /api/products/:id/image — the photo as a real image, cached by the browser for a year
router.get('/:id/image', async (req, res) => {
  try {
    const result = await pool.query('SELECT image_url FROM products WHERE id = $1', [req.params.id]);
    sendImage(res, result.rows[0] && result.rows[0].image_url);
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${productCols('p')}, b.name AS brand_name, b.logo AS brand_logo
       FROM products p LEFT JOIN brands b ON b.id = p.brand_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Product not found' });
    res.json({ product: withImageUrls(result.rows, req)[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// POST /api/products — admin only
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const {
    id, name, brand_id, gender, notes, short_desc, full_desc,
    badge, badge_class, price_cents, intensity, in_stock, is_featured, is_inspired,
  } = req.body;
  const image_url = isOwnImageLink(req.body.image_url) ? null : req.body.image_url;

  if (!id || !name || !gender || price_cents == null) {
    return res.status(400).json({ error: 'id, name, gender, and price_cents are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO products
        (id, name, brand_id, gender, notes, short_desc, full_desc, badge, badge_class, price_cents, intensity, in_stock, image_url, is_featured, is_inspired)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id`,
      [id, name, brand_id || null, gender, notes || [], short_desc || null, full_desc || null,
        badge || null, badge_class || null, price_cents, intensity || null, in_stock !== false, image_url || null,
        is_featured === true, is_inspired === true]
    );
    res.status(201).json({ product: { id: result.rows[0].id } });
  } catch (err) {
    console.error(err);
    if (err.code === '23505') return res.status(409).json({ error: 'A product with this id already exists' });
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// PUT /api/products/:id — admin only (partial update)
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const fields = ['name', 'brand_id', 'gender', 'notes', 'short_desc', 'full_desc',
    'badge', 'badge_class', 'price_cents', 'sale_price_cents', 'intensity', 'in_stock', 'image_url', 'is_featured', 'is_inspired'];
  const updates = [];
  const params = [];

  for (const field of fields) {
    if (field === 'image_url' && isOwnImageLink(req.body[field])) continue; // photo unchanged
    if (req.body[field] !== undefined) {
      params.push(req.body[field]);
      updates.push(`${field} = $${params.length}`);
    }
  }
  if (!updates.length) return res.json({ product: { id: req.params.id } }); // nothing changed

  params.push(req.params.id);
  try {
    const result = await pool.query(
      `UPDATE products SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING id`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Product not found' });
    res.json({ product: { id: result.rows[0].id } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// DELETE /api/products/:id — admin only
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Product not found' });
    res.json({ deleted: req.params.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

module.exports = router;
