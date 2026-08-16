/**
 * ABS FRAGRANCES — auth.js
 * There is no separate login page. Instead admin/dashboard.html calls
 * ensureAdminSession(), which shows a lightweight password prompt (see
 * below) and exchanges it for a JWT via the login API — the password
 * itself is never stored in source, only the fixed admin email is.
 */
const API_BASE = window.API_BASE || 'http://localhost:4000/api';
const KEYS = { SESSION: 'abs_admin_session' };
const ADMIN_EMAIL = 'admin@abs.com';

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

// Update the logged-in admin's own name/email/password.
// Only include fields you want to change; password is optional.
async function updateProfile({ name, email, password, phone, address }) {
  try {
    const body = {};
    if (name !== undefined) body.name = name;
    if (email !== undefined) body.email = email;
    if (phone !== undefined) body.phone = phone;
    if (address !== undefined) body.address = address;
    if (password) body.password = password;

    const res = await fetch(`${API_BASE}/auth/me`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || 'Failed to update profile' };
    setSession(data.user, data.token); // token is re-issued in case email changed
    return { ok: true, user: data.user };
  } catch (err) {
    return { ok: false, error: 'Could not reach the server.' };
  }
}

function logout() {
  clearSession();
  window.location.href = getRootPath() + 'index.html';
}

// Reuses a cached session if there is one; otherwise shows a password
// prompt overlay and exchanges it for a JWT via the login API. The
// password is typed by the admin each time — it's never in source.
// Only ever called from admin/dashboard.html.
function ensureAdminSession() {
  const existing = getSession();
  if (existing && existing.token) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(13,34,48,.92);z-index:5000;display:flex;align-items:center;justify-content:center;font-family:sans-serif;padding:1rem';
    overlay.innerHTML = `
      <form style="background:#fff;padding:2rem;width:100%;max-width:320px;box-sizing:border-box;display:flex;flex-direction:column;gap:.9rem">
        <h2 style="margin:0;font-size:1.15rem;color:#163846">Admin Access</h2>
        <p style="margin:0;font-size:.8rem;color:#666">Enter the admin password to continue.</p>
        <input type="password" placeholder="Password" autocomplete="current-password" autofocus
          style="padding:.7rem .9rem;border:1px solid #ccc;font-size:.9rem;box-sizing:border-box" />
        <div style="color:#c0392b;font-size:.78rem;display:none"></div>
        <button type="submit"
          style="padding:.8rem;background:#163846;color:#fff;border:none;cursor:pointer;font-size:.8rem;letter-spacing:.06em;text-transform:uppercase">
          Unlock Dashboard
        </button>
      </form>`;
    document.body.appendChild(overlay);

    const form = overlay.querySelector('form');
    const input = overlay.querySelector('input');
    const errEl = overlay.querySelector('div');
    const btn = overlay.querySelector('button');
    input.focus();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = input.value;
      if (!password) return;
      btn.disabled = true;
      btn.textContent = 'Checking…';
      const result = await login(ADMIN_EMAIL, password);
      if (!result.ok) {
        errEl.textContent = result.error;
        errEl.style.display = 'block';
        input.value = '';
        input.focus();
        btn.disabled = false;
        btn.textContent = 'Unlock Dashboard';
        return;
      }
      overlay.remove();
      resolve(getSession());
    });
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