-- Sales & bundle offers. Safe to re-run (idempotent).
-- Run against your Neon database (SQL editor) or via `npm run db:setup`.

-- A perfume is "on sale" when sale_price_cents is not NULL (and lower than price_cents).
-- price_cents always stays the regular price, so ending a sale just clears this column.
ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_price_cents INTEGER
  CHECK (sale_price_cents IS NULL OR sale_price_cents >= 0);
CREATE INDEX IF NOT EXISTS idx_products_sale ON products(sale_price_cents) WHERE sale_price_cents IS NOT NULL;

-- Bundle offers: several perfumes sold together at one price. Managed by the admin only.
CREATE TABLE IF NOT EXISTS bundles (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT,
  image_url    TEXT,
  price_cents  INTEGER NOT NULL CHECK (price_cents >= 0),
  is_active    BOOLEAN NOT NULL DEFAULT true,   -- inactive bundles are hidden from the home page
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bundle_items (
  bundle_id   TEXT NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity    INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  PRIMARY KEY (bundle_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_bundle_items_bundle ON bundle_items(bundle_id);
