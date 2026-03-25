-- =============================================================================
-- Migration: 018b_create_v1_pos_tables
-- ROLLBACK: DROP TABLE IF EXISTS public.retailer_variants, public.barcodes, public.variants, public.products CASCADE;
-- Creates V1 POS tables required by scan/resolve and products/lookup endpoints
-- These tables are normally created by ensureSchema.ts at runtime
-- Safe to run multiple times (idempotent)
--
-- NOTE: 'stores' is a VIEW on platform.stores - we don't create it here.
-- retailer_variants uses TEXT store_id without FK (view can't be FK target).
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. PRODUCTS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NULL,
  retailer_status TEXT NULL,
  enrichment_status TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 2. VARIANTS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  unit_base TEXT NULL,
  size_base INTEGER NULL,
  retailer_status TEXT NULL,
  enrichment_status TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 3. BARCODES TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS barcodes (
  barcode TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  barcode_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 4. RETAILER_VARIANTS TABLE (links variants to stores with pricing)
-- NOTE: store_id is TEXT without FK because 'stores' is a VIEW
-- =============================================================================
CREATE TABLE IF NOT EXISTS retailer_variants (
  store_id TEXT NOT NULL,
  variant_id TEXT NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  selling_price_minor INTEGER NULL,
  digitised_by_retailer BOOLEAN NOT NULL DEFAULT TRUE,
  price_updated_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (store_id, variant_id)
);

-- =============================================================================
-- 5. INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_variants_product_id ON variants(product_id);
CREATE INDEX IF NOT EXISTS idx_barcodes_variant_id ON barcodes(variant_id);
CREATE INDEX IF NOT EXISTS idx_retailer_variants_store_id ON retailer_variants(store_id);
CREATE INDEX IF NOT EXISTS idx_retailer_variants_variant_id ON retailer_variants(variant_id);

COMMIT;
