-- Migration: 031_retailer_catalog_extended_fields
-- EPIC: Retailer Dashboard → POS Retailer-Owned Catalog
-- Adds extended fields per E2E Go-Live Document spec:
-- - low_stock_alert_qty: threshold for low stock alerts
-- - notes: internal notes (store-specific)
-- - pack_unit: unit for pack size (e.g., g, ml, pcs)
-- - sold_by: how LOOSE_BULK products are sold (WEIGHT/COUNT)
-- - rate_unit: unit for rate pricing (KG, GM, PCS, etc.)
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- Add pack_unit column to catalog.products
-- For PACKAGED products: the unit of pack_size (e.g., 500g means pack_size=500, pack_unit='g')
-- =============================================================================
ALTER TABLE catalog.products
  ADD COLUMN IF NOT EXISTS pack_unit VARCHAR(20);

COMMENT ON COLUMN catalog.products.pack_unit IS
  'Unit for pack_size (e.g., g, ml, pcs). Combined with pack_size: 500g pack = pack_size=500, pack_unit=g';

-- =============================================================================
-- Add extended fields to catalog.store_products
-- =============================================================================

-- low_stock_alert_qty: Alert threshold (optional, store-specific)
ALTER TABLE catalog.store_products
  ADD COLUMN IF NOT EXISTS low_stock_alert_qty INTEGER;

COMMENT ON COLUMN catalog.store_products.low_stock_alert_qty IS
  'Stock quantity threshold for low stock alerts. NULL means use default (10).';

-- notes: Internal notes (optional, store-specific)
ALTER TABLE catalog.store_products
  ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN catalog.store_products.notes IS
  'Internal notes about the product. For store use only, not shown on POS.';

-- sold_by: For LOOSE_BULK products - how the product is measured at sale
ALTER TABLE catalog.store_products
  ADD COLUMN IF NOT EXISTS sold_by VARCHAR(20);

COMMENT ON COLUMN catalog.store_products.sold_by IS
  'For LOOSE_BULK products: WEIGHT (by KG/GM) or COUNT (by pieces). NULL for PACKAGED.';

-- rate_unit: For LOOSE_BULK products - the unit the rate is quoted in
ALTER TABLE catalog.store_products
  ADD COLUMN IF NOT EXISTS rate_unit VARCHAR(20);

COMMENT ON COLUMN catalog.store_products.rate_unit IS
  'For LOOSE_BULK products: Unit for price rate (KG, GM, PCS, DOZEN). NULL for PACKAGED.';

-- =============================================================================
-- Add check constraints for valid values
-- =============================================================================

-- sold_by constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'chk_store_products_sold_by'
  ) THEN
    ALTER TABLE catalog.store_products
      ADD CONSTRAINT chk_store_products_sold_by
      CHECK (sold_by IS NULL OR sold_by IN ('WEIGHT', 'COUNT'));
  END IF;
END $$;

-- rate_unit constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'chk_store_products_rate_unit'
  ) THEN
    ALTER TABLE catalog.store_products
      ADD CONSTRAINT chk_store_products_rate_unit
      CHECK (rate_unit IS NULL OR rate_unit IN ('KG', 'GM', 'PCS', 'DOZEN', 'LTR', 'ML'));
  END IF;
END $$;

-- low_stock_alert_qty must be non-negative
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'chk_store_products_low_stock_alert'
  ) THEN
    ALTER TABLE catalog.store_products
      ADD CONSTRAINT chk_store_products_low_stock_alert
      CHECK (low_stock_alert_qty IS NULL OR low_stock_alert_qty >= 0);
  END IF;
END $$;

-- =============================================================================
-- Index for low stock alerts (uses custom threshold if set)
-- =============================================================================
DROP INDEX IF EXISTS catalog.store_products_custom_low_stock_idx;
CREATE INDEX store_products_custom_low_stock_idx
  ON catalog.store_products (store_id, current_stock, low_stock_alert_qty)
  WHERE is_active = true AND low_stock_alert_qty IS NOT NULL;

COMMIT;
