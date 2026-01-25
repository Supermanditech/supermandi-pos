-- Migration: 039_store_products_brand
-- MT-8: Add brand column to catalog.store_products for store-level brand override
-- This allows each store to have their own brand naming, similar to display_name
-- Safe to run multiple times (idempotent)

BEGIN;

-- Add brand column if it doesn't exist
ALTER TABLE catalog.store_products
  ADD COLUMN IF NOT EXISTS brand character varying(255);

-- Add index for brand search (trigram for fuzzy matching)
CREATE INDEX IF NOT EXISTS idx_store_products_brand_trgm
  ON catalog.store_products USING gin (brand gin_trgm_ops)
  WHERE brand IS NOT NULL;

COMMIT;
