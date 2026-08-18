const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/settings — public, read by every page to fill in WhatsApp/social links
router.get('/', async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM site_settings WHERE id = 'main'");
    res.json({ settings: result.rows[0] || {} });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/settings — admin only
router.put('/', requireAuth, requireAdmin, async (req, res) => {
  const fields = ['whatsapp_number', 'facebook_url', 'instagram_url', 'tiktok_url'];
  const updates = [];
  const params = [];

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      params.push(req.body[field] || null);
      updates.push(`${field} = $${params.length}`);
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  updates.push('updated_at = now()');

  try {
    const result = await pool.query(
      `UPDATE site_settings SET ${updates.join(', ')} WHERE id = 'main' RETURNING *`,
      params
    );
    res.json({ settings: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;
