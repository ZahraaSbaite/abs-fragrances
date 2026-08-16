const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function publicUser(row) {
  const { password_hash, ...safe } = row;
  return safe;
}

// Registration is intentionally not exposed — there are no customer accounts.
// Customers check out as guests; only the seeded admin account can log in.

// POST /api/auth/login — admin only. Customers never had accounts, so any
// successful password match for a non-admin row is rejected too (defense in
// depth in case a non-admin row ever ends up in the table).
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'No account found with this email.' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Incorrect password.' });

    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'This site has no customer accounts — admin access only.' });
    }

    res.json({ user: publicUser(user), token: signToken(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me — return the logged-in admin based on the token
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, phone, address, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// PUT /api/auth/me — admin updates their own name/email/password.
// Any field can be omitted; password is only changed if a new one is sent.
router.put('/me', requireAuth, async (req, res) => {
  const { name, email, password, phone, address } = req.body;

  const updates = [];
  const params = [];

  if (name !== undefined) { params.push(name); updates.push(`name = $${params.length}`); }
  if (email !== undefined) { params.push(email.toLowerCase()); updates.push(`email = $${params.length}`); }
  if (phone !== undefined) { params.push(phone); updates.push(`phone = $${params.length}`); }
  if (address !== undefined) { params.push(address); updates.push(`address = $${params.length}`); }
  if (password) {
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const hash = await bcrypt.hash(password, 10);
    params.push(hash); updates.push(`password_hash = $${params.length}`);
  }
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

  params.push(req.user.id);
  try {
    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${params.length}
       RETURNING id, name, email, role, phone, address, created_at`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    // Re-issue a token since the email (part of the token payload) may have changed
    res.json({ user: result.rows[0], token: signToken(result.rows[0]) });
  } catch (err) {
    console.error(err);
    if (err.code === '23505') return res.status(409).json({ error: 'An account with this email already exists' });
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;