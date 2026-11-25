const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendMail, isConfigured: mailAvailable } = require('../mailer');

const router = express.Router();

const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+[1-9]\d{7,14}$/;            // international format, e.g. +96170123456
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESET_TTL_MINUTES = 10;
const RESET_MAX_ATTEMPTS = 5;
const RESET_RESEND_SECONDS = 60;

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, tv: user.token_version || 0 },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function publicUser(row) {
  const { password_hash, token_version, ...safe } = row;
  return safe;
}

// "+961 70-123 456" / "0096170123456" → "+96170123456"
function normalizePhone(p) {
  let s = String(p || '').replace(/[\s\-().]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  return s;
}

// Checks the acting admin's own password — required before sensitive changes
// (adding/removing admins, resetting someone's password) so a stolen session alone can't do them.
async function verifyActingPassword(userId, password) {
  if (!password) return false;
  const r = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (!r.rows[0]) return false;
  return bcrypt.compare(String(password), r.rows[0].password_hash);
}

// Registration is intentionally not exposed — there are no customer accounts.
// Customers check out as guests; only admin accounts can log in.

// POST /api/auth/login — admin only.
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [String(email).trim().toLowerCase()]);
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

// ───────────────────────── FORGOT PASSWORD (verified by email) ─────────────────────────

// POST /api/auth/forgot/request — body: { email }
// Emails a 6-digit code to that admin's email address.
router.post('/forgot/request', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!mailAvailable()) return res.status(503).json({ error: 'Password recovery by email is not set up on the server yet.' });

  // Same answer whether or not the account exists, so this can't be used to probe for admin emails.
  const generic = { ok: true, message: 'If this email belongs to an admin, a 6-digit code has been sent to it. Check your inbox (and spam).' };

  try {
    const r = await pool.query("SELECT id, name, email FROM users WHERE email = $1 AND role = 'admin'", [email]);
    const user = r.rows[0];
    if (!user) return res.json(generic);

    const recent = await pool.query(
      `SELECT 1 FROM password_resets WHERE user_id = $1 AND created_at > now() - make_interval(secs => $2)`,
      [user.id, RESET_RESEND_SECONDS]
    );
    if (recent.rows[0]) return res.json(generic);

    const code = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
    const codeHash = await bcrypt.hash(code, 8);

    await pool.query('UPDATE password_resets SET used = true WHERE user_id = $1 AND used = false', [user.id]);
    const ins = await pool.query(
      `INSERT INTO password_resets (user_id, code_hash, expires_at)
       VALUES ($1, $2, now() + make_interval(mins => $3)) RETURNING id`,
      [user.id, codeHash, RESET_TTL_MINUTES]
    );

    const safeName = String(user.name || 'there').replace(/[<>&"]/g, '');
    const sent = await sendMail({
      to: user.email,
      subject: 'Your ABS Fragrances password reset code',
      text: `Hi ${safeName},\n\nYour password reset code is ${code}.\nIt expires in ${RESET_TTL_MINUTES} minutes. If you didn't ask for this, ignore this email — your password stays the same.\n\nNever share this code with anyone.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;color:#163846">
        <h2 style="margin:0 0 12px">Password reset</h2>
        <p>Hi ${safeName}, use this code to reset your admin password:</p>
        <p style="font-size:32px;letter-spacing:8px;font-weight:bold;margin:16px 0">${code}</p>
        <p style="font-size:13px;color:#666">It expires in ${RESET_TTL_MINUTES} minutes. If you didn't ask for this, ignore this email — your password stays the same. Never share this code.</p>
      </div>`,
    });
    if (!sent) {
      await pool.query('UPDATE password_resets SET used = true WHERE id = $1', [ins.rows[0].id]);
      return res.status(502).json({ error: 'Could not send the email. Please try again in a minute.' });
    }

    res.json(generic);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not start password recovery' });
  }
});

// POST /api/auth/forgot/reset — body: { email, code, new_password }
router.post('/forgot/reset', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const code = String(req.body.code || '').trim();
  const newPassword = String(req.body.new_password || '');

  if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Enter your email and the 6-digit code.' });
  if (newPassword.length < MIN_PASSWORD) return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters` });

  const invalid = { error: 'Invalid or expired code.' };
  try {
    const u = await pool.query("SELECT id FROM users WHERE email = $1 AND role = 'admin'", [email]);
    const user = u.rows[0];
    if (!user) return res.status(400).json(invalid);

    const pr = await pool.query(
      `SELECT id FROM password_resets
       WHERE user_id = $1 AND used = false AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1`,
      [user.id]
    );
    if (!pr.rows[0]) return res.status(400).json(invalid);

    // Count the attempt first (atomically), so parallel guesses can't exceed the limit.
    const att = await pool.query(
      `UPDATE password_resets SET attempts = attempts + 1
       WHERE id = $1 AND attempts < $2 RETURNING id, code_hash, attempts`,
      [pr.rows[0].id, RESET_MAX_ATTEMPTS]
    );
    if (!att.rows[0]) {
      await pool.query('UPDATE password_resets SET used = true WHERE id = $1', [pr.rows[0].id]);
      return res.status(429).json({ error: 'Too many wrong attempts. Request a new code.' });
    }

    const ok = await bcrypt.compare(code, att.rows[0].code_hash);
    if (!ok) {
      const left = RESET_MAX_ATTEMPTS - att.rows[0].attempts;
      return res.status(400).json({ error: left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many wrong attempts. Request a new code.' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // token_version + 1 signs out every existing session of this admin.
      await client.query('UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2', [hash, user.id]);
      await client.query('UPDATE password_resets SET used = true WHERE user_id = $1', [user.id]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not reset the password' });
  }
});

// ───────────────────────── OWN PROFILE ─────────────────────────

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

// PUT /api/auth/me — admin updates their own name/email/phone/password.
// Any field can be omitted. Changing the password needs current_password.
router.put('/me', requireAuth, async (req, res) => {
  const { name, email, password, current_password, phone, address } = req.body;

  const updates = [];
  const params = [];

  if (name !== undefined) {
    if (!String(name).trim()) return res.status(400).json({ error: 'Name cannot be empty' });
    params.push(String(name).trim()); updates.push(`name = $${params.length}`);
  }
  if (email !== undefined) {
    const e = String(email).trim().toLowerCase();
    if (!EMAIL_RE.test(e)) return res.status(400).json({ error: 'Enter a valid email address' });
    params.push(e); updates.push(`email = $${params.length}`);
  }
  if (phone !== undefined) {
    const p = normalizePhone(phone);
    if (!PHONE_RE.test(p)) return res.status(400).json({ error: 'Phone must include the country code, e.g. +96170123456' });
    params.push(p); updates.push(`phone = $${params.length}`);
  }
  if (address !== undefined) { params.push(address); updates.push(`address = $${params.length}`); }
  if (password) {
    if (password.length < MIN_PASSWORD) return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters` });
    if (!(await verifyActingPassword(req.user.id, current_password))) {
      return res.status(403).json({ error: 'Your current password is incorrect.' });
    }
    const hash = await bcrypt.hash(password, 10);
    params.push(hash); updates.push(`password_hash = $${params.length}`);
    updates.push('token_version = token_version + 1'); // signs out other sessions; this one gets a fresh token below
  }
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

  params.push(req.user.id);
  try {
    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${params.length}
       RETURNING id, name, email, role, phone, address, created_at, token_version`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    // Re-issue a token since the email / token_version may have changed
    res.json({ user: publicUser(result.rows[0]), token: signToken(result.rows[0]) });
  } catch (err) {
    console.error(err);
    if (err.code === '23505') return res.status(409).json({ error: 'An account with this email already exists' });
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ───────────────────────── MANAGE ADMINS ─────────────────────────

// GET /api/auth/admins — list all admins
router.get('/admins', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email, phone, created_at FROM users WHERE role = 'admin' ORDER BY created_at ASC"
    );
    res.json({ admins: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch admins' });
  }
});

// POST /api/auth/admins — body: { name, email, phone, password, current_password }
router.post('/admins', requireAuth, requireAdmin, async (req, res) => {
  const { name, email, phone, password, current_password } = req.body;
  const cleanName = String(name || '').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPhone = normalizePhone(phone);

  if (!cleanName) return res.status(400).json({ error: 'Name is required' });
  if (!EMAIL_RE.test(cleanEmail)) return res.status(400).json({ error: 'Enter a valid email address' });
  if (cleanPhone && !PHONE_RE.test(cleanPhone)) return res.status(400).json({ error: 'Phone must include the country code, e.g. +96170123456' });
  if (!password || String(password).length < MIN_PASSWORD) return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters` });

  try {
    if (!(await verifyActingPassword(req.user.id, current_password))) {
      return res.status(403).json({ error: 'Your password is incorrect.' });
    }
    const hash = await bcrypt.hash(String(password), 10);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, phone)
       VALUES ($1, $2, $3, 'admin', $4)
       RETURNING id, name, email, phone, created_at`,
      [cleanName, cleanEmail, hash, cleanPhone || null]
    );
    res.status(201).json({ admin: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'An account with this email already exists' });
    console.error(err);
    res.status(500).json({ error: 'Failed to add admin' });
  }
});

// DELETE /api/auth/admins/:id — body: { current_password }
router.delete('/admins/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) return res.status(404).json({ error: 'Admin not found' });
  if (id === req.user.id) return res.status(400).json({ error: "You can't remove your own account." });

  try {
    if (!(await verifyActingPassword(req.user.id, (req.body || {}).current_password))) {
      return res.status(403).json({ error: 'Your password is incorrect.' });
    }
    // The subquery guarantees at least one admin always remains.
    const result = await pool.query(
      `DELETE FROM users
       WHERE id = $1 AND role = 'admin'
         AND (SELECT count(*) FROM users WHERE role = 'admin') > 1
       RETURNING id`,
      [id]
    );
    if (!result.rows[0]) {
      const exists = await pool.query("SELECT 1 FROM users WHERE id = $1 AND role = 'admin'", [id]);
      if (!exists.rows[0]) return res.status(404).json({ error: 'Admin not found' });
      return res.status(400).json({ error: "You can't remove the last admin." });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove admin' });
  }
});

// PUT /api/auth/admins/:id/password — set a new password for ANOTHER admin.
// body: { new_password, current_password }. They are signed out everywhere.
router.put('/admins/:id/password', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { new_password, current_password } = req.body;
  if (!UUID_RE.test(id)) return res.status(404).json({ error: 'Admin not found' });
  if (id === req.user.id) return res.status(400).json({ error: 'Change your own password from your Profile page.' });
  if (!new_password || String(new_password).length < MIN_PASSWORD) return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters` });

  try {
    if (!(await verifyActingPassword(req.user.id, current_password))) {
      return res.status(403).json({ error: 'Your password is incorrect.' });
    }
    const hash = await bcrypt.hash(String(new_password), 10);
    const result = await pool.query(
      "UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2 AND role = 'admin' RETURNING id",
      [hash, id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Admin not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router;