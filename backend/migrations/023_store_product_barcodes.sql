-- =============================================================================
-- Migration: 023_store_product_barcodes
-- ROLLBACK: DROP TABLE IF EXISTS catalog.store_product_barcodes CASCADE;
-- SD-ONBOARD-001B: Store-scoped barcode mapping for multi-tenant correctness
-- Safe to run multiple times (idempotent)
-- =============================================================================

BEGIN;

-- =============================================================================
-- TABLE: catalog.store_product_barcodes
-- Store-scoped barcode mapping: allows same barcode to map to different products
-- per store (required for 10k+ stores multi-tenant correctness)
-- =============================================================================
CREATE TABLE IF NOT EXISTS catalog.store_product_barcodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  store_id UUID NOT NULL,  -- FK to platform.stores
  store_product_id UUID NOT NULL,  -- FK to catalog.store_products
  barcode TEXT NOT NULL,

  -- Source tracking
  source VARCHAR(50) NOT NULL DEFAULT 'retailer_digitisation',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_store_product_barcodes_source CHECK (
    source IN ('retailer_digitisation', 'supplier_sync', 'manual', 'supermandi_generated')
  )
);

-- Store-scoped unique barcode constraint (critical for multi-tenant)
CREATE UNIQUE INDEX IF NOT EXISTS ux_store_product_barcodes_store_barcode
  ON catalog.store_product_barcodes (store_id, barcode);

-- Lookup by store_product_id (find all barcodes for a store product)
CREATE INDEX IF NOT EXISTS idx_store_product_barcodes_store_product
  ON catalog.store_product_barcodes (store_id, store_product_id);

-- Barcode lookup across stores (for analytics/dedup)
CREATE INDEX IF NOT EXISTS idx_store_product_barcodes_barcode
  ON catalog.store_product_barcodes (barcode);

COMMIT;
