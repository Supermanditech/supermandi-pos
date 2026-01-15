-- =============================================================================
-- Migration: 018b_create_v1_pos_tables
-- Creates V1 POS tables required by scan/resolve and products/lookup endpoints
-- These tables are normally created by ensureSchema.ts at runtime
-- Safe to run multiple times (idempotent)
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. STORES TABLE (if not exists)
-- =============================================================================
CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  upi_vpa TEXT NULL,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  scan_lookup_v2_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  address TEXT NULL,
  contact_name TEXT NULL,
  contact_phone TEXT NULL,
  contact_email TEXT NULL,
  location TEXT NULL,
  pos_device_id TEXT NULL,
  kyc_status TEXT NULL,
  upi_vpa_updated_at TIMESTAMPTZ NULL,
  upi_vpa_updated_by TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 2. PRODUCTS TABLE
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
-- 3. VARIANTS TABLE
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
-- 4. BARCODES TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS barcodes (
  barcode TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  barcode_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 5. RETAILER_VARIANTS TABLE (links variants to stores with pricing)
-- =============================================================================
CREATE TABLE IF NOT EXISTS retailer_variants (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  selling_price_minor INTEGER NULL,
  digitised_by_retailer BOOLEAN NOT NULL DEFAULT TRUE,
  price_updated_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (store_id, variant_id)
);

-- =============================================================================
-- 6. INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_variants_product_id ON variants(product_id);
CREATE INDEX IF NOT EXISTS idx_barcodes_variant_id ON barcodes(variant_id);
CREATE INDEX IF NOT EXISTS idx_retailer_variants_store_id ON retailer_variants(store_id);
CREATE INDEX IF NOT EXISTS idx_retailer_variants_variant_id ON retailer_variants(variant_id);

-- =============================================================================
-- 7. INSERT DEMO STORE (if not exists)
-- =============================================================================
INSERT INTO stores (id, name, active, created_at)
VALUES ('a0000000-0000-0000-0000-000000000001', 'SuperMandi Demo Store', true, NOW())
ON CONFLICT (id) DO UPDATE SET active = true;

COMMIT;
