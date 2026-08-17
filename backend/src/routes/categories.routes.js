const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/categories — public
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY name');
    res.json({ categories: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// POST /api/categories — admin only
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { id, name, icon, description } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'id and name are required' });
  try {
    const result = await pool.query(
      `INSERT INTO categories (id, name, icon, description) VALUES ($1,$2,$3,$4) RETURNING *`,
      [id, name, icon || null, description || null]
    );
    res.status(201).json({ category: result.rows[0] });
  } catch (err) {
    console.error(err);
    if (err.code === '23505') return res.status(409).json({ error: 'A category with this id already exists' });
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// PUT /api/categories/:id — admin only
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const fields = ['name', 'icon', 'description'];
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
      `UPDATE categories SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Category not found' });
    res.json({ category: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// DELETE /api/categories/:id — admin only
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM categories WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Category not found' });
    res.json({ deleted: req.params.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

module.exports = router;
