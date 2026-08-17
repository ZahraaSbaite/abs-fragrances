-- Abs Fragrances — database schema
-- Run this once against your Postgres database (see db/setup.js for automated setup + seeding)

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

-- ─────────────────────────────────────────────
-- BRANDS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brands (
  id        TEXT PRIMARY KEY,        -- e.g. 'rasasi'
  name      TEXT NOT NULL,           -- e.g. 'Rasasi'
  logo      TEXT,                    -- emoji or icon, kept from the old frontend data
  logo_url  TEXT                     -- uploaded/linked logo image, shown instead of the emoji when present
);

-- Safe to re-run against a database where `brands` already exists without this column.
ALTER TABLE brands ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- ─────────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  phone         TEXT,
  address       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- PRODUCTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id           TEXT PRIMARY KEY,          -- keep readable slugs like 'shuhrah', 'hawasRasasi'
  name         TEXT NOT NULL,
  brand_id     TEXT REFERENCES brands(id) ON DELETE SET NULL,
  gender       TEXT NOT NULL CHECK (gender IN ('Men', 'Women', 'Unisex', 'Musk')),
  notes        TEXT[] DEFAULT '{}',       -- e.g. {'Bergamot','Saffron','Rose Oud'}
  short_desc   TEXT,
  full_desc    TEXT,
  badge        TEXT,                      -- e.g. 'Bestseller', 'New Arrival'
  badge_class  TEXT,                      -- e.g. 'badge-best'
  price_cents  INTEGER NOT NULL DEFAULT 0,
  intensity    TEXT,                      -- 'Light' | 'Moderate' | 'Strong' | 'Intense'
  in_stock     BOOLEAN NOT NULL DEFAULT true,
  image_url    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_brand  ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_gender ON products(gender);

-- ─────────────────────────────────────────────
-- ORDERS
-- Guest checkout: user_id stays NULL for all customer orders now.
-- Only admins ever log in, so this column is kept only for legacy/back-office reference.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                TEXT PRIMARY KEY,          -- e.g. 'ORD-1731593200000'
  user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  customer_name     TEXT NOT NULL,
  customer_phone    TEXT NOT NULL,
  customer_email    TEXT,                      -- optional
  customer_address  TEXT NOT NULL,
  location_url      TEXT,                      -- optional Google Maps link from "Share my location"
  payment_method    TEXT NOT NULL DEFAULT 'Cash on Delivery',
  note              TEXT,
  status            TEXT NOT NULL DEFAULT 'Pending'
                      CHECK (status IN ('Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled')),
  subtotal_cents    INTEGER NOT NULL,
  delivery_cents    INTEGER NOT NULL DEFAULT 500,
  total_cents       INTEGER NOT NULL,
  placed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Safe to re-run against a database where `orders` already exists without these columns.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS location_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'Cash on Delivery';

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);

CREATE TABLE IF NOT EXISTS order_items (
  id             SERIAL PRIMARY KEY,
  order_id       TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id     TEXT REFERENCES products(id) ON DELETE SET NULL,
  product_name   TEXT NOT NULL,   -- snapshot, so it's preserved even if product is later edited/deleted
  price_cents    INTEGER NOT NULL, -- snapshot of price at time of order
  quantity       INTEGER NOT NULL CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- ─────────────────────────────────────────────
-- REVIEWS
-- Customer testimonials shown on the homepage. Anyone can submit one
-- (published immediately, no moderation queue); admin can delete any
-- review. Seeded starter rows come from db/seed-data.js.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id               TEXT PRIMARY KEY,
  stars            INTEGER NOT NULL DEFAULT 5 CHECK (stars BETWEEN 1 AND 5),
  review_text      TEXT NOT NULL,
  author_name      TEXT NOT NULL,
  author_location  TEXT,
  product_label    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- CATEGORIES
-- Admin-managed, independent of the fixed products.gender field
-- (Men/Women/Unisex/Musk) — this is a separate curated list, e.g. for
-- a marketing/collections showcase, that admin can freely add to.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id           TEXT PRIMARY KEY,        -- e.g. 'signature-line'
  name         TEXT NOT NULL,           -- e.g. 'Signature Line'
  icon         TEXT,                    -- emoji, e.g. '✨'
  description  TEXT,                    -- short blurb shown under the name
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
