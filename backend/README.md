# Abs Fragrances

A luxury perfume storefront with guest checkout and a full admin dashboard for managing products and orders.

**Stack:** Vanilla HTML/CSS/JS frontend · Node.js/Express backend · PostgreSQL (Neon)

---

## Features

- Browse perfumes by brand, gender, and search — no account needed
- Guest checkout: add to cart, place an order with name/phone/address — no login required
- WhatsApp ordering as an alternative to checkout
- Admin-only login (no customer accounts) with full product CRUD and order management
- Admin dashboard: order pipeline overview, status updates, product catalog management, editable admin profile

---

## Project Structure

```
abs-fragrances/
├── backend/              # Express API + PostgreSQL
│   ├── db/               # schema.sql, seed data, setup script
│   ├── src/
│   │   ├── routes/       # auth, products, orders
│   │   └── middleware/   # JWT auth
│   ├── server.js
│   └── .env.example
├── admin/
│   └── dashboard.html    # admin panel (products + orders + profile)
├── css/
├── js/
│   ├── auth.js           # admin login/session
│   ├── products.js       # fetches products/brands from the API
│   ├── cart.js           # guest cart (localStorage)
│   ├── orders.js         # guest checkout + admin order management
│   └── dashboard.js       # admin dashboard logic
├── images/
├── index.html, cart.html, all-perfumes.html, ...
└── README.md
```

---

## Setup

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env` and fill in:
- `DATABASE_URL` — your PostgreSQL connection string (e.g. from [Neon](https://neon.tech))
- `JWT_SECRET` — any long random string, e.g. generate one with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- `FRONTEND_ORIGIN` — where your frontend is served from (default `http://127.0.0.1:5500` for VS Code Live Server)

Then create and seed the database:

```bash
npm run db:setup
```

Start the server:

```bash
npm run dev
```

The API runs at `http://localhost:4000`. Check `http://localhost:4000/api/health` to confirm it's connected.

### 2. Frontend

Serve the project root with a static server — **don't** open `index.html` directly as a `file://` URL, or the API's CORS settings will block requests.

Easiest option: VS Code's **Live Server** extension — right-click `index.html` → "Open with Live Server". This serves at `http://127.0.0.1:5500`, which matches the default `FRONTEND_ORIGIN`.

---

## Admin Access

There are no customer accounts — everyone checks out as a guest. There's no full login page either: `admin/dashboard.html` shows a lightweight password-only prompt (see `js/auth.js` → `ensureAdminSession`) and exchanges the password for a JWT via `/api/auth/login`. The admin email is fixed as a constant in `js/auth.js`; the password itself is typed each session and never stored in source. The backend still requires a valid JWT for every admin route, so the API stays protected.

**Demo admin credentials:**
```
admin@abs.com / admin123
```

Change this via the Admin Profile tab in the dashboard, or by editing `backend/db/seed-data.js` and re-running `npm run db:setup` — if you change the email, update the `ADMIN_EMAIL` constant in `js/auth.js` to match.

---

## API Overview

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/login` | — | Admin only |
| PUT | `/api/auth/me` | admin | Update own name/email/password |
| GET | `/api/products` | — | Filters: `?gender=`, `?brand=`, `?q=` |
| GET | `/api/products/brands` | — | |
| POST/PUT/DELETE | `/api/products/:id` | admin | Product CRUD |
| POST | `/api/orders` | — | Guest checkout |
| GET/DELETE | `/api/orders` / `/api/orders/:id` | admin | View/manage orders |
| PUT | `/api/orders/:id/status` | admin | Update order status |

Full details in `backend/README.md`.

---

## Notes

- Prices are stored in cents (`price_cents`) to avoid floating-point rounding issues.
- Cart lives entirely in the browser (`localStorage`) — there's no server-side cart table.
- Product images are stored as either an external URL or a base64 data URL (uploaded via the admin dashboard).