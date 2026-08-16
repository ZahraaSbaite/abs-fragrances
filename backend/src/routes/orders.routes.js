
const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const DELIVERY_CENTS = 500;

// POST /api/orders — guest checkout, no login required.
// body: { customer_name, customer_phone, customer_address, note?, items: [{ product_id, quantity }] }
// Prices are looked up server-side from the products table — never trust client-sent prices.
router.post('/', async (req, res) => {
  const { customer_name, customer_phone, customer_address, note, items: cartItems } = req.body;
  if (!customer_name || !customer_phone || !customer_address) {
    return res.status(400).json({ error: 'customer_name, customer_phone, and customer_address are required' });
  }
  if (!Array.isArray(cartItems) || !cartItems.length) {
    return res.status(400).json({ error: 'items must be a non-empty array of { product_id, quantity }' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const productIds = cartItems.map((i) => i.product_id);
    const productsResult = await client.query(
      `SELECT id, name, price_cents FROM products WHERE id = ANY($1::text[])`,
      [productIds]
    );
    const productsById = Object.fromEntries(productsResult.rows.map((p) => [p.id, p]));

    const items = [];
    for (const { product_id, quantity } of cartItems) {
      const product = productsById[product_id];
      if (!product) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: `Product not found: ${product_id}` });
      }
      const qty = Number(quantity) > 0 ? Number(quantity) : 1;
      items.push({ product_id, name: product.name, price_cents: product.price_cents, quantity: qty });
    }

    const subtotal_cents = items.reduce((sum, i) => sum + i.price_cents * i.quantity, 0);
    const total_cents = subtotal_cents + DELIVERY_CENTS;
    const orderId = 'ORD-' + Date.now();

    await client.query(
      `INSERT INTO orders (id, user_id, customer_name, customer_phone, customer_address, note, subtotal_cents, delivery_cents, total_cents)
       VALUES ($1,NULL,$2,$3,$4,$5,$6,$7,$8)`,
      [orderId, customer_name, customer_phone, customer_address, note || null, subtotal_cents, DELIVERY_CENTS, total_cents]
    );

    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, price_cents, quantity)
         VALUES ($1,$2,$3,$4,$5)`,
        [orderId, item.product_id, item.name, item.price_cents, item.quantity]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({ order: { id: orderId, subtotal_cents, delivery_cents: DELIVERY_CENTS, total_cents, status: 'Pending', items } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to place order' });
  } finally {
    client.release();
  }
});

// GET /api/orders — admin only, all orders with their line items included
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT o.*,
        COALESCE(
          (SELECT json_agg(json_build_object(
             'product_id', oi.product_id, 'product_name', oi.product_name,
             'price_cents', oi.price_cents, 'quantity', oi.quantity
           )) FROM order_items oi WHERE oi.order_id = o.id),
          '[]'
        ) AS items
      FROM orders o
      ORDER BY o.placed_at DESC
    `);
    res.json({ orders: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// GET /api/orders/:id — admin only — order detail with line items
router.get('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    const order = orderResult.rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const itemsResult = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [req.params.id]);
    res.json({ order: { ...order, items: itemsResult.rows } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// PUT /api/orders/:id/status — admin only — body: { status }
router.put('/:id/status', requireAuth, requireAdmin, async (req, res) => {
  const { status } = req.body;
  const valid = ['Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'];
  if (!valid.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${valid.join(', ')}` });
  }

  try {
    const result = await pool.query(
      `UPDATE orders SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Order not found' });
    res.json({ order: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// DELETE /api/orders/:id — admin only
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM orders WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Order not found' });
    res.json({ deleted: req.params.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

module.exports = router;
