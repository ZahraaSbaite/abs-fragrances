const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { productCols, withImageUrls } = require('../imageUrls');

const router = express.Router();

// GET /api/sales — public. Perfumes currently on sale (sale price set and lower than regular price).
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${productCols('p')}, b.name AS brand_name, b.logo AS brand_logo
       FROM products p LEFT JOIN brands b ON b.id = p.brand_id
       WHERE p.sale_price_cents IS NOT NULL AND p.sale_price_cents < p.price_cents
       ORDER BY p.name`
    );
    res.json({ products: withImageUrls(result.rows, req) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch sales' });
  }
});

// PUT /api/sales — admin only. Sets sale prices in one go.
// body: { items: [{ product_id, sale_price_cents }] }  (sale_price_cents = null ends that sale)
router.put('/', requireAuth, requireAdmin, async (req, res) => {
  const items = req.body.items;
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'items must be a non-empty array' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const { product_id, sale_price_cents } of items) {
      const cents = sale_price_cents == null ? null : Math.round(Number(sale_price_cents));
      if (cents !== null && (!Number.isFinite(cents) || cents < 0)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Invalid sale price for ${product_id}` });
      }
      const r = await client.query(
        `UPDATE products SET sale_price_cents = $1
         WHERE id = $2 AND ($1::int IS NULL OR $1::int < price_cents)
         RETURNING id`,
        [cents, product_id]
      );
      if (!r.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Sale price must be lower than the regular price (${product_id})` });
      }
    }
    await client.query('COMMIT');
    res.json({ updated: items.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to save sales' });
  } finally {
    client.release();
  }
});

// DELETE /api/sales — admin only. Ends every sale at once.
router.delete('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const r = await pool.query('UPDATE products SET sale_price_cents = NULL WHERE sale_price_cents IS NOT NULL');
    res.json({ cleared: r.rowCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to clear sales' });
  }
});

module.exports = router;
