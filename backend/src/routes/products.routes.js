const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

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
      `SELECT p.*, b.name AS brand_name, b.logo AS brand_logo
       FROM products p
       LEFT JOIN brands b ON b.id = p.brand_id
       ${where}
       ORDER BY p.name`,
      params
    );
    res.json({ products: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET /api/products/brands — list all brands (used for filter dropdowns)
router.get('/brands', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM brands ORDER BY name');
    res.json({ brands: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch brands' });
  }
});

// POST /api/products/brands — admin only
router.post('/brands', requireAuth, requireAdmin, async (req, res) => {
  const { id, name, logo, logo_url } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'id and name are required' });
  try {
    const result = await pool.query(
      'INSERT INTO brands (id, name, logo, logo_url) VALUES ($1,$2,$3,$4) RETURNING *',
      [id, name, logo || null, logo_url || null]
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
  if (logo_url !== undefined) { params.push(logo_url); fields.push(`logo_url = $${params.length}`); }
  params.push(req.params.id);
  try {
    const result = await pool.query(
      `UPDATE brands SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Brand not found' });
    res.json({ brand: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update brand' });
  }
});

// DELETE /api/products/brands/:id — admin only. Products referencing this
// brand keep existing (brand_id is set to NULL, per the schema's ON DELETE SET NULL).
router.delete('/brands/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM brands WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Brand not found' });
    res.json({ deleted: req.params.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete brand' });
  }
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, b.name AS brand_name, b.logo AS brand_logo
       FROM products p LEFT JOIN brands b ON b.id = p.brand_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Product not found' });
    res.json({ product: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// POST /api/products — admin only
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const {
    id, name, brand_id, gender, notes, short_desc, full_desc,
    badge, badge_class, price_cents, intensity, in_stock, image_url, is_featured,
  } = req.body;

  if (!id || !name || !gender || price_cents == null) {
    return res.status(400).json({ error: 'id, name, gender, and price_cents are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO products
        (id, name, brand_id, gender, notes, short_desc, full_desc, badge, badge_class, price_cents, intensity, in_stock, image_url, is_featured)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [id, name, brand_id || null, gender, notes || [], short_desc || null, full_desc || null,
        badge || null, badge_class || null, price_cents, intensity || null, in_stock !== false, image_url || null,
        is_featured === true]
    );
    res.status(201).json({ product: result.rows[0] });
  } catch (err) {
    console.error(err);
    if (err.code === '23505') return res.status(409).json({ error: 'A product with this id already exists' });
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// PUT /api/products/:id — admin only (partial update)
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const fields = ['name', 'brand_id', 'gender', 'notes', 'short_desc', 'full_desc',
    'badge', 'badge_class', 'price_cents', 'intensity', 'in_stock', 'image_url', 'is_featured'];
  const updates = [];
  const params = [];

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      params.push(req.body[field]);
      updates.push(`${field} = $${params.length}`);
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

  params.push(req.params.id);
  try {
    const result = await pool.query(
      `UPDATE products SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Product not found' });
    res.json({ product: result.rows[0] });
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
