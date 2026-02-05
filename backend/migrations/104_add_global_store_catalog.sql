-- Add global catalog + store-specific catalog tables (additive).
-- Safe to run multiple times.

BEGIN;

CREATE TABLE IF NOT EXISTS global_products (
  id TEXT PRIMARY KEY,
  global_name TEXT NOT NULL,
  category TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS global_product_identifiers (
  id TEXT PRIMARY KEY,
  global_product_id TEXT NOT NULL REFERENCES global_products(id) ON DELETE CASCADE,
  code_type TEXT NOT NULL,
  raw_value TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS store_products (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  global_product_id TEXT NOT NULL REFERENCES global_products(id) ON DELETE CASCADE,
  store_display_name TEXT NULL,
  sell_price_minor INTEGER NULL,
  purchase_price_minor INTEGER NULL,
  unit TEXT NULL,
  variant TEXT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, global_product_id)
);

CREATE TABLE IF NOT EXISTS store_inventory (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  global_product_id TEXT NOT NULL REFERENCES global_products(id) ON DELETE CASCADE,
  available_qty INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (store_id, global_product_id)
);

CREATE INDEX IF NOT EXISTS global_products_name_idx
  ON global_products (global_name);

CREATE INDEX IF NOT EXISTS global_product_identifiers_product_id_idx
  ON global_product_identifiers (global_product_id);

CREATE INDEX IF NOT EXISTS global_product_identifiers_code_type_idx
  ON global_product_identifiers (code_type);

CREATE UNIQUE INDEX IF NOT EXISTS global_product_identifiers_code_norm_uidx
  ON global_product_identifiers (code_type, normalized_value);

CREATE INDEX IF NOT EXISTS store_products_store_id_idx
  ON store_products (store_id);

CREATE INDEX IF NOT EXISTS store_products_global_product_id_idx
  ON store_products (global_product_id);

CREATE INDEX IF NOT EXISTS store_inventory_store_id_idx
  ON store_inventory (store_id);

CREATE INDEX IF NOT EXISTS store_inventory_global_product_id_idx
  ON store_inventory (global_product_id);

COMMIT;
