-- Migration: 033_store_products_purchase_price
-- RCAT-PROD-001: Add purchase_price and supplier_id to catalog.store_products
-- Required for retailer dashboard product management
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- Add purchase_price column to catalog.store_products
-- Stores the purchase price in minor units (paise) per product per store
-- =============================================================================
ALTER TABLE catalog.store_products
  ADD COLUMN IF NOT EXISTS purchase_price INTEGER;

COMMENT ON COLUMN catalog.store_products.purchase_price IS
  'Purchase price in minor units (paise). Used for margin calc and ledger entries.';

-- =============================================================================
-- Add supplier_id column to catalog.store_products
-- Links a product to its supplier for purchase tracking
-- =============================================================================
ALTER TABLE catalog.store_products
  ADD COLUMN IF NOT EXISTS supplier_id UUID;

COMMENT ON COLUMN catalog.store_products.supplier_id IS
  'Optional FK to supplier.suppliers - links product to its primary supplier for this store.';

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Index for supplier lookup on store products (composite with store_id for store-scoped queries)
-- NOTE: Migration 029 may have created a simpler (supplier_id) version of this index.
-- We drop and recreate to ensure the optimal composite version is in place.
DROP INDEX IF EXISTS catalog.store_products_supplier_idx;
CREATE INDEX IF NOT EXISTS store_products_supplier_idx
  ON catalog.store_products (store_id, supplier_id)
  WHERE supplier_id IS NOT NULL;

-- =============================================================================
-- RCAT-SEARCH-001: Add search indexes for product/supplier/barcode search
-- =============================================================================

-- Trigram index for product name search (store-scoped via store_products join)
CREATE INDEX IF NOT EXISTS idx_products_name_lower
  ON catalog.products (lower(name));

-- Trigram index for product brand search
CREATE INDEX IF NOT EXISTS idx_products_brand_lower
  ON catalog.products (lower(brand))
  WHERE brand IS NOT NULL;

-- Composite index for store_products store_id + product_id (for fast JOINs)
CREATE INDEX IF NOT EXISTS idx_store_products_store_product
  ON catalog.store_products (store_id, product_id)
  WHERE is_active = true;

-- Index for store_product_barcodes barcode lookup
CREATE INDEX IF NOT EXISTS idx_store_product_barcodes_store_barcode_lookup
  ON catalog.store_product_barcodes (store_id, barcode);

COMMIT;
