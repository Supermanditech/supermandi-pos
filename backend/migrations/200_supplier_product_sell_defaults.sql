-- Migration 200: SuperAdmin-approved sell-side conversion defaults
-- V3-FIX-169: Stores the approved "sells as" unit and suggested retail variants
-- for retailer-ready conversion after publish.
-- ROLLBACK: ALTER TABLE catalog.supplier_products DROP COLUMN IF EXISTS sell_unit, DROP COLUMN IF EXISTS default_retail_variants;

BEGIN;

ALTER TABLE catalog.supplier_products
  ADD COLUMN IF NOT EXISTS sell_unit VARCHAR(20),
  ADD COLUMN IF NOT EXISTS default_retail_variants TEXT;

-- sell_unit: what retailers sell this as (KG, GM, PCS, LTR, ML, DOZEN)
ALTER TABLE catalog.supplier_products
  DROP CONSTRAINT IF EXISTS chk_sp_sell_unit;
ALTER TABLE catalog.supplier_products
  ADD CONSTRAINT chk_sp_sell_unit
  CHECK (sell_unit IS NULL OR sell_unit IN (
    'KG','GM','PCS','DOZEN','LTR','ML'
  ));

COMMIT;
