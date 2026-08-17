const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/messages — admin only
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM messages ORDER BY created_at DESC');
    res.json({ messages: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// POST /api/messages — public, no login required. Submissions from the
// "Send us a Message" contact form; admin reads and replies manually.
router.post('/', async (req, res) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim();
  const phone = (req.body.phone || '').trim();
  const inquiry_type = (req.body.inquiry_type || '').trim();
  const message_text = (req.body.message_text || '').trim();

  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (!email) return res.status(400).json({ error: 'Email is required' });
  if (!message_text) return res.status(400).json({ error: 'Message is required' });
  if (name.length > 80) return res.status(400).json({ error: 'Name is too long' });
  if (email.length > 120) return res.status(400).json({ error: 'Email is too long' });
  if (phone.length > 40) return res.status(400).json({ error: 'Phone number is too long' });
  if (message_text.length > 2000) return res.status(400).json({ error: 'Message is too long (max 2000 characters)' });

  try {
    const id = 'msg-' + crypto.randomUUID();
    const result = await pool.query(
      `INSERT INTO messages (id, name, email, phone, inquiry_type, message_text)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, name, email, phone || null, inquiry_type || null, message_text]
    );
    res.status(201).json({ message: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// DELETE /api/messages/:id — admin only
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM messages WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Message not found' });
    res.json({ deleted: req.params.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

module.exports = router;
