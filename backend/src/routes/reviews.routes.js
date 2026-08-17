const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/reviews — public, shown on the homepage
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM reviews ORDER BY created_at DESC');
    res.json({ reviews: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// POST /api/reviews — public, no login required. Published immediately (no
// moderation queue) — admin can delete any review after the fact.
router.post('/', async (req, res) => {
  const stars = Number(req.body.stars);
  const review_text = (req.body.review_text || '').trim();
  const author_name = (req.body.author_name || '').trim();
  const product_label = (req.body.product_label || '').trim();
  const author_location = (req.body.author_location || '').trim();

  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return res.status(400).json({ error: 'stars must be a whole number from 1 to 5' });
  }
  if (!author_name) return res.status(400).json({ error: 'Name is required' });
  if (!product_label) return res.status(400).json({ error: 'Please tell us which perfume you got' });
  if (!review_text) return res.status(400).json({ error: 'Review text is required' });
  if (author_name.length > 80) return res.status(400).json({ error: 'Name is too long' });
  if (product_label.length > 80) return res.status(400).json({ error: 'Perfume name is too long' });
  if (author_location.length > 80) return res.status(400).json({ error: 'Location is too long' });
  if (review_text.length > 1000) return res.status(400).json({ error: 'Review is too long (max 1000 characters)' });

  try {
    const id = 'review-' + crypto.randomUUID();
    const result = await pool.query(
      `INSERT INTO reviews (id, stars, review_text, author_name, product_label, author_location)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, stars, review_text, author_name, product_label, author_location || null]
    );
    res.status(201).json({ review: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

// DELETE /api/reviews/:id — admin only
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM reviews WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Review not found' });
    res.json({ deleted: req.params.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete review' });
  }
});

module.exports = router;
