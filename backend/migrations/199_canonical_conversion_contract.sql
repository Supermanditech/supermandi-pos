-- Migration 199: Canonical procurement-to-retail measurement and conversion contract
-- V3-FIX-167: One authoritative conversion model across supplier→retailer→POS→ledger
-- Adds procurement-side truth to supplier_products and store_products
-- so every SKU has explicit buy-as / stock-as / sell-as semantics.
-- ROLLBACK: ALTER TABLE catalog.supplier_products DROP COLUMN IF EXISTS procurement_unit, DROP COLUMN IF EXISTS procurement_pack_qty, DROP COLUMN IF EXISTS base_stock_unit, DROP COLUMN IF EXISTS split_sell_eligible; ALTER TABLE catalog.store_products DROP COLUMN IF EXISTS procurement_unit, DROP COLUMN IF EXISTS procurement_pack_qty, DROP COLUMN IF EXISTS base_stock_unit, DROP COLUMN IF EXISTS allow_fractional_sell, DROP COLUMN IF EXISTS conversion_precision, DROP COLUMN IF EXISTS conversion_confirmed;

BEGIN;

-- ============================================================
-- 1. Supplier products: procurement packaging truth
-- ============================================================
ALTER TABLE catalog.supplier_products
  ADD COLUMN IF NOT EXISTS procurement_unit VARCHAR(20),
  ADD COLUMN IF NOT EXISTS procurement_pack_qty NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS base_stock_unit VARCHAR(20),
  ADD COLUMN IF NOT EXISTS split_sell_eligible BOOLEAN NOT NULL DEFAULT false;

-- Valid procurement units (superset — includes packaging types)
ALTER TABLE catalog.supplier_products
  DROP CONSTRAINT IF EXISTS chk_sp_procurement_unit;
ALTER TABLE catalog.supplier_products
  ADD CONSTRAINT chk_sp_procurement_unit
  CHECK (procurement_unit IS NULL OR procurement_unit IN (
    'KG','GM','PCS','DOZEN','LTR','ML',
    'CARTON','CASE','BAG','TIN','DRUM','TRAY','BOTTLE','PIECE','PACK'
  ));

-- Valid base stock units (canonical — no packaging types)
ALTER TABLE catalog.supplier_products
  DROP CONSTRAINT IF EXISTS chk_sp_base_stock_unit;
ALTER TABLE catalog.supplier_products
  ADD CONSTRAINT chk_sp_base_stock_unit
  CHECK (base_stock_unit IS NULL OR base_stock_unit IN (
    'KG','GM','PCS','LTR','ML'
  ));

-- Pack qty must be positive when set
ALTER TABLE catalog.supplier_products
  DROP CONSTRAINT IF EXISTS chk_sp_procurement_pack_qty_positive;
ALTER TABLE catalog.supplier_products
  ADD CONSTRAINT chk_sp_procurement_pack_qty_positive
  CHECK (procurement_pack_qty IS NULL OR procurement_pack_qty > 0);


-- ============================================================
-- 2. Store products: per-store conversion profile
-- ============================================================
ALTER TABLE catalog.store_products
  ADD COLUMN IF NOT EXISTS procurement_unit VARCHAR(20),
  ADD COLUMN IF NOT EXISTS procurement_pack_qty NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS base_stock_unit VARCHAR(20),
  ADD COLUMN IF NOT EXISTS allow_fractional_sell BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS conversion_precision SMALLINT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS conversion_confirmed BOOLEAN NOT NULL DEFAULT false;

-- Same constraints as supplier_products
ALTER TABLE catalog.store_products
  DROP CONSTRAINT IF EXISTS chk_storeprod_procurement_unit;
ALTER TABLE catalog.store_products
  ADD CONSTRAINT chk_storeprod_procurement_unit
  CHECK (procurement_unit IS NULL OR procurement_unit IN (
    'KG','GM','PCS','DOZEN','LTR','ML',
    'CARTON','CASE','BAG','TIN','DRUM','TRAY','BOTTLE','PIECE','PACK'
  ));

ALTER TABLE catalog.store_products
  DROP CONSTRAINT IF EXISTS chk_storeprod_base_stock_unit;
ALTER TABLE catalog.store_products
  ADD CONSTRAINT chk_storeprod_base_stock_unit
  CHECK (base_stock_unit IS NULL OR base_stock_unit IN (
    'KG','GM','PCS','LTR','ML'
  ));

ALTER TABLE catalog.store_products
  DROP CONSTRAINT IF EXISTS chk_storeprod_pack_qty_positive;
ALTER TABLE catalog.store_products
  ADD CONSTRAINT chk_storeprod_pack_qty_positive
  CHECK (procurement_pack_qty IS NULL OR procurement_pack_qty > 0);

ALTER TABLE catalog.store_products
  DROP CONSTRAINT IF EXISTS chk_storeprod_conversion_precision;
ALTER TABLE catalog.store_products
  ADD CONSTRAINT chk_storeprod_conversion_precision
  CHECK (conversion_precision BETWEEN 0 AND 6);


-- ============================================================
-- 3. Back-fill existing data with inferred defaults
-- ============================================================

-- For LOOSE_BULK products with rate_unit set, infer base_stock_unit
UPDATE catalog.store_products
SET base_stock_unit = CASE
  WHEN rate_unit IN ('KG','GM') THEN 'KG'
  WHEN rate_unit IN ('LTR','ML') THEN 'LTR'
  WHEN rate_unit IN ('PCS','DOZEN') THEN 'PCS'
  ELSE NULL
END
WHERE product_mode = 'LOOSE_BULK'
  AND rate_unit IS NOT NULL
  AND base_stock_unit IS NULL;

-- For PACKAGED products, default base_stock_unit = PCS
UPDATE catalog.store_products
SET base_stock_unit = 'PCS'
WHERE (product_mode = 'PACKAGED' OR product_mode IS NULL)
  AND base_stock_unit IS NULL;

-- For all products, default procurement_unit = base_stock_unit when not set
UPDATE catalog.store_products
SET procurement_unit = base_stock_unit
WHERE procurement_unit IS NULL
  AND base_stock_unit IS NOT NULL;

-- Default pack qty = 1 (1:1 procurement to stock) when not set
UPDATE catalog.store_products
SET procurement_pack_qty = 1
WHERE procurement_pack_qty IS NULL
  AND procurement_unit IS NOT NULL;

-- Mark all existing store products as conversion_confirmed (legacy data)
UPDATE catalog.store_products
SET conversion_confirmed = true
WHERE conversion_confirmed = false
  AND base_stock_unit IS NOT NULL;

-- Back-fill supplier_products from their unit field
-- CI-FIX: Map unit aliases to canonical values that satisfy chk_sp_procurement_unit
UPDATE catalog.supplier_products
SET procurement_unit = CASE
      WHEN UPPER(TRIM(unit)) IN ('KG','GM','G') THEN 'KG'
      WHEN UPPER(TRIM(unit)) IN ('LTR','ML','L') THEN 'LTR'
      WHEN UPPER(TRIM(unit)) IN ('PCS','PIECE','PIECES','EA','EACH') THEN 'PCS'
      WHEN UPPER(TRIM(unit)) IN ('DOZ','DOZEN') THEN 'DOZEN'
      ELSE UPPER(TRIM(unit))
    END,
    base_stock_unit = CASE
      WHEN UPPER(TRIM(unit)) IN ('KG','GM','G') THEN 'KG'
      WHEN UPPER(TRIM(unit)) IN ('LTR','ML','L') THEN 'LTR'
      ELSE 'PCS'
    END,
    procurement_pack_qty = COALESCE(pack_size, 1)
WHERE procurement_unit IS NULL
  AND unit IS NOT NULL;


COMMIT;
