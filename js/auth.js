/**
 * ABS FRAGRANCES — auth.js
 * There is no separate login page. Instead admin/dashboard.html calls
 * ensureAdminSession(), which shows a lightweight password prompt (see
 * below) and exchanges it for a JWT via the login API — the password
 * itself is never stored in source, only the fixed admin email is.
 */
const API_BASE = window.API_BASE || 'http://localhost:4000/api';
const KEYS = { SESSION: 'abs_admin_session' };
const LAST_EMAIL_KEY = 'abs_admin_last_email';

function getSession() {
  try { return JSON.parse(localStorage.getItem(KEYS.SESSION)); }
  catch { return null; }
}
function setSession(user, token) {
  localStorage.setItem(KEYS.SESSION, JSON.stringify({ ...user, token }));
}
function clearSession() {
  localStorage.removeItem(KEYS.SESSION);
}
function getToken() {
  return getSession()?.token || null;
}

// Admin login only — the backend itself also rejects non-admin accounts.
async function login(email, password) {
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || 'Login failed' };
    setSession(data.user, data.token);
    return { ok: true, user: data.user };
  } catch (err) {
    return { ok: false, error: 'Could not reach the server. Is the backend running?' };
  }
}

// Small helper for authenticated calls to /api/auth/*
async function authApi(method, path, body) {
  try {
    const res = await fetch(`${API_BASE}/auth${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: data.error || 'Request failed' };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: 'Could not reach the server.' };
  }
}

// Same, without a token (login / forgot-password screens).
async function publicAuthPost(path, body) {
  try {
    const res = await fetch(`${API_BASE}/auth${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data, error: data.error };
  } catch (err) {
    return { ok: false, error: 'Could not reach the server.', data: {} };
  }
}

// Update the logged-in admin's own name / email / phone / password.
// Only include the fields you want to change. Changing the password
// requires current_password (the backend checks it).
async function updateProfile({ name, email, password, current_password, phone, address }) {
  const body = {};
  if (name !== undefined) body.name = name;
  if (email !== undefined) body.email = email;
  if (phone !== undefined) body.phone = phone;
  if (address !== undefined) body.address = address;
  if (password) { body.password = password; body.current_password = current_password; }

  const r = await authApi('PUT', '/me', body);
  if (!r.ok) return { ok: false, error: r.error };
  setSession(r.data.user, r.data.token); // token is re-issued in case email/password changed
  return { ok: true, user: r.data.user };
}

function logout() {
  clearSession();
  window.location.href = getRootPath() + 'index.html';
}

// Reuses the saved session if the server still accepts it; otherwise shows
// the login screen (email + password, with "Forgot password?" by SMS code).
// Only ever called from admin/dashboard.html.
async function ensureAdminSession() {
  const existing = getSession();
  if (existing && existing.token) {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${existing.token}` } });
      if (res.status !== 401) return existing;  // still valid (or the server hiccuped — keep the saved session)
      clearSession();                            // removed / password changed elsewhere → log in again
    } catch (err) {
      return existing;                           // offline / server asleep — keep the saved session
    }
  }
  return showLoginOverlay();
}

function showLoginOverlay() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(13,34,48,.92);z-index:5000;display:flex;align-items:center;justify-content:center;font-family:sans-serif;padding:1rem';
    document.body.appendChild(overlay);

    const FORM = 'background:#fff;padding:2rem;width:100%;max-width:340px;box-sizing:border-box;display:flex;flex-direction:column;gap:.9rem';
    const INPUT = 'padding:.7rem .9rem;border:1px solid #ccc;font-size:.9rem;box-sizing:border-box;width:100%';
    const BTN = 'padding:.8rem;background:#163846;color:#fff;border:none;cursor:pointer;font-size:.8rem;letter-spacing:.06em;text-transform:uppercase';
    const LINK = 'background:none;border:none;color:#163846;font-size:.78rem;cursor:pointer;text-decoration:underline;padding:0;align-self:flex-start';
    const H2 = 'margin:0;font-size:1.15rem;color:#163846';
    const P = 'margin:0;font-size:.8rem;color:#666';
    const attr = (s) => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

    // Renders one screen and wires its submit handler. Returns { form, say }.
    function mount(inner, onSubmit) {
      overlay.innerHTML = `<form style="${FORM}">${inner}<div data-msg style="font-size:.78rem;display:none"></div></form>`;
      const form = overlay.querySelector('form');
      const msg = form.querySelector('[data-msg]');
      const btn = form.querySelector('button[type=submit]');
      const label = btn.textContent;
      const say = (text, ok) => { msg.textContent = text; msg.style.color = ok ? '#2e7d32' : '#c0392b'; msg.style.display = 'block'; };
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        btn.disabled = true; btn.textContent = 'Please wait…'; msg.style.display = 'none';
        try { await onSubmit(form, say); }
        finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = label; } }
      });
      return { form, say };
    }

    function showLogin(notice, prefillEmail) {
      const email = prefillEmail || localStorage.getItem(LAST_EMAIL_KEY) || '';
      const { form, say } = mount(`
        <h2 style="${H2}">Admin Access</h2>
        <p style="${P}">Sign in with your admin email and password.</p>
        <input name="email" type="email" placeholder="Email" autocomplete="username" value="${attr(email)}" required style="${INPUT}" />
        <input name="password" type="password" placeholder="Password" autocomplete="current-password" required style="${INPUT}" />
        <button type="submit" style="${BTN}">Unlock Dashboard</button>
        <button type="button" data-forgot style="${LINK}">Forgot password?</button>`,
        async (f, sayNow) => {
          const em = f.email.value.trim().toLowerCase();
          const result = await login(em, f.password.value);
          if (!result.ok) { sayNow(result.error); f.password.value = ''; f.password.focus(); return; }
          localStorage.setItem(LAST_EMAIL_KEY, em);
          overlay.remove();
          resolve(getSession());
        });
      form.querySelector('[data-forgot]').onclick = () => showForgot(form.email.value.trim());
      if (notice) say(notice, true);
      (email ? form.password : form.email).focus();
    }

    function showForgot(prefillEmail) {
      const { form } = mount(`
        <h2 style="${H2}">Reset password</h2>
        <p style="${P}">Enter your admin email. We'll email a 6-digit code to that address.</p>
        <input name="email" type="email" placeholder="Email" value="${attr(prefillEmail)}" required style="${INPUT}" />
        <button type="submit" style="${BTN}">Send code</button>
        <button type="button" data-back style="${LINK}">← Back to login</button>`,
        async (f, say) => {
          const em = f.email.value.trim().toLowerCase();
          const r = await publicAuthPost('/forgot/request', { email: em });
          if (!r.ok) { say(r.error || 'Could not send the code.'); return; }
          showReset(em, r.data.message);
        });
      form.querySelector('[data-back]').onclick = () => showLogin(null, form.email.value.trim());
      form.email.focus();
    }

    function showReset(email, note) {
      const { form, say } = mount(`
        <h2 style="${H2}">Enter the code</h2>
        <p style="${P}">${attr(note || 'Check your email for the 6-digit code.')}</p>
        <input name="code" inputmode="numeric" maxlength="6" placeholder="6-digit code" autocomplete="one-time-code" required style="${INPUT};letter-spacing:.3em;text-align:center" />
        <input name="pw" type="password" placeholder="New password (min 8 characters)" autocomplete="new-password" required style="${INPUT}" />
        <input name="pw2" type="password" placeholder="Repeat new password" autocomplete="new-password" required style="${INPUT}" />
        <button type="submit" style="${BTN}">Change password</button>
        <button type="button" data-resend style="${LINK}">Didn't get a code? Send again</button>
        <button type="button" data-back style="${LINK}">← Back to login</button>`,
        async (f, sayNow) => {
          if (f.pw.value.length < 8) { sayNow('Password must be at least 8 characters.'); return; }
          if (f.pw.value !== f.pw2.value) { sayNow('The two passwords do not match.'); return; }
          const r = await publicAuthPost('/forgot/reset', { email, code: f.code.value.trim(), new_password: f.pw.value });
          if (!r.ok) { sayNow(r.error || 'Could not reset the password.'); return; }
          showLogin('Password changed. Sign in with your new password.', email);
        });
      form.querySelector('[data-resend]').onclick = () => showForgot(email);
      form.querySelector('[data-back]').onclick = () => showLogin(null, email);
      form.code.focus();
    }

    showLogin();
  });
}

function getRootPath() {
  const p = window.location.pathname;
  return (p.includes('/admin/')) ? '../' : '';
}

// Public pages: the nav "account" spot links to the admin dashboard.
// Once an admin session exists, it shows the admin name + logout instead.
function updateNavbarAuth() {
  const session = getSession();
  const area = document.getElementById('navAccount');
  if (!area) return;

  if (session && session.token) {
    area.innerHTML = `
      <a href="${getRootPath()}admin/dashboard.html" class="nav-account" title="Admin Dashboard">
        <svg class="nav-account-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        <div class="nav-account-text">
          <span class="nav-account-name">${session.name.split(' ')[0]}</span>
          <span class="nav-account-sub" onclick="event.preventDefault();logout()">Log out</span>
        </div>
      </a>`;
  } else {
    area.innerHTML = `
      <a href="${getRootPath()}admin/dashboard.html" class="nav-account" title="Admin Dashboard">
        <svg class="nav-account-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        <div class="nav-account-text">
          <span class="nav-account-name">Admin</span>
        </div>
      </a>`;
  }
}