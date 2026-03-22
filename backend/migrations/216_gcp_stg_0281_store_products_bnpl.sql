-- GCP-STG-0281: Add bnpl_eligible column to catalog.store_products
-- The column exists on catalog.supplier_products (migration 048) but NOT on store_products.
-- Retailer web sends bnplEligible in PATCH but backend silently drops it.
-- This migration adds the column so the backend can persist it.

BEGIN;

ALTER TABLE catalog.store_products
  ADD COLUMN IF NOT EXISTS bnpl_eligible BOOLEAN DEFAULT false;

COMMENT ON COLUMN catalog.store_products.bnpl_eligible IS 'Whether product is eligible for Buy Now Pay Later credit';

COMMIT;

-- ROLLBACK: ALTER TABLE catalog.store_products DROP COLUMN IF EXISTS bnpl_eligible;
