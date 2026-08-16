# Abs Fragrances — Full Stack Landing Page

## Project Structure
```
abs-fragrances/
├── index.html              ← Main landing page (public)
├── admin/
│   └── dashboard.html      ← Admin management panel
├── css/
│   ├── shared.css          ← Navbar, buttons, footer, trust bar
│   ├── landing.css         ← Hero, products, collections, story
│   └── dashboard.css       ← Sidebar, tables, forms, stats
├── js/
│   ├── auth.js             ← Admin password prompt, session, logout
│   ├── products.js         ← Product data
│   ├── cart.js             ← Cart logic
│   └── main.js             ← Landing page interactions
└── README.md
```

## Quick Start
See `backend/README.md` for full setup — the storefront needs the Express/PostgreSQL API running and to be served over HTTP (not opened as a `file://` URL).

## Admin Access
There's no separate login page. Visiting `admin/dashboard.html` shows a lightweight password prompt (no email field, no registration) — enter the admin password and it's exchanged for a JWT via the login API. The admin email is fixed in `js/auth.js`; the password is never stored in source.

| Role  | Email          | Password (demo) |
|-------|----------------|------------------|
| Admin | admin@abs.com  | admin123         |

## Features

### Landing Page (index.html)
- Hero section with animated floating bottle and smoke effects
- Navbar: Admin icon + Cart badge icon
- Cart drawer: slide-in panel with qty controls, remove, place order
- Product cards: View Details modal + Add to Cart
- Scroll-triggered fade-up animations
- Trust bar, Collections, Story, DM CTA section
- Floating pulsing WhatsApp button

### Admin Dashboard (admin/dashboard.html)
- Overview: KPI cards (total orders, pending, delivered, customer count)
- Products: full table with custom/built-in labels, delete custom products
- Orders: search by ID or customer name, filter by status, update status dropdown, delete
- Customers: all users table with order counts, delete any non-self user
- Add Product: form to add new products (persisted to localStorage)
- View Live Store link

## Customization

### WhatsApp Number
Search for `wa.me/96178901234` in all files and replace with your real number.

### Instagram Handle
Search for `instagram.com/absfragrances` and replace with yours.

### Add Products
- Via Admin dashboard: Admin > Add Product form
- Via code: edit js/products.js and add entries to the PRODUCTS object

### Brand Colors
All colors are CSS variables in css/shared.css:
  --bg:    #F8F8F9
  --navy:  #163846
  --gold:  #C4A270

## Tech Stack
- Pure HTML / CSS / Vanilla JavaScript
- No frameworks, no build tools, no dependencies
- Google Fonts (Playfair Display, Cormorant Garamond, Jost)
- All data stored in localStorage (sessions, users, orders, cart)
