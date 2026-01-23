-- Migration 036: Search performance indexes for 10k stores go-live
-- Ensures POS search and scan remain responsive with large catalogs

-- Required: pg_trgm extension for similarity() and gin_trgm_ops indexes
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram index on catalog.products.name for ILIKE + similarity() search
CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON catalog.products USING gin (name gin_trgm_ops)
  WHERE name IS NOT NULL;

-- Trigram index on catalog.products.brand for brand similarity search
CREATE INDEX IF NOT EXISTS idx_products_brand_trgm
  ON catalog.products USING gin (brand gin_trgm_ops)
  WHERE brand IS NOT NULL;

-- Trigram index on store_products.display_name for ILIKE search
CREATE INDEX IF NOT EXISTS idx_store_products_display_name_trgm
  ON catalog.store_products USING gin (display_name gin_trgm_ops)
  WHERE display_name IS NOT NULL;

-- Composite index for the main search query filter path:
-- WHERE sp.store_id = $1 AND sp.is_active = true
-- The partial index covers store-scoped active product lookups efficiently
CREATE INDEX IF NOT EXISTS idx_store_products_store_active_updated
  ON catalog.store_products (store_id, updated_at DESC)
  WHERE is_active = true;

-- Index on catalog.products.is_active to speed up the JOIN filter
CREATE INDEX IF NOT EXISTS idx_products_active
  ON catalog.products (id)
  WHERE is_active = true;

-- Ensure barcode lookup index covers the JOIN path for scan resolve
-- (store_product_barcodes → store_products via store_product_id + store_id)
CREATE INDEX IF NOT EXISTS idx_store_product_barcodes_sp_store
  ON catalog.store_product_barcodes (store_product_id, store_id);

-- Fast barcode lookup by (store_id, barcode) for scan and search
CREATE INDEX IF NOT EXISTS idx_store_product_barcodes_store_barcode
  ON catalog.store_product_barcodes (store_id, barcode);

-- Index on products.primary_barcode for exact barcode match in search
CREATE INDEX IF NOT EXISTS idx_products_primary_barcode
  ON catalog.products (primary_barcode)
  WHERE primary_barcode IS NOT NULL;

-- Stock balances lookup by (store_id, product_id) for fast stock resolution
CREATE INDEX IF NOT EXISTS idx_stock_balances_store_product
  ON inventory.stock_balances (store_id, product_id);
