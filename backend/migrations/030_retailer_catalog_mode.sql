-- Migration: 030_retailer_catalog_mode
-- EPIC: Retailer Dashboard → POS Retailer-Owned Catalog
-- Adds product_mode column for PACKAGED/LOOSE_BULK distinction
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- Add product_mode column to catalog.store_products
-- Values: 'PACKAGED' (FMCG with manufacturer barcode)
--         'LOOSE_BULK' (open goods with generated barcode)
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'catalog'
      AND table_name = 'store_products'
      AND column_name = 'product_mode'
  ) THEN
    ALTER TABLE catalog.store_products
      ADD COLUMN product_mode VARCHAR(20) DEFAULT 'PACKAGED';

    COMMENT ON COLUMN catalog.store_products.product_mode IS
      'Product mode: PACKAGED (FMCG with manufacturer barcode) or LOOSE_BULK (open goods with generated barcode)';
  END IF;
END $$;

-- Add check constraint for valid values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'chk_store_products_mode'
  ) THEN
    ALTER TABLE catalog.store_products
      ADD CONSTRAINT chk_store_products_mode
      CHECK (product_mode IN ('PACKAGED', 'LOOSE_BULK'));
  END IF;
END $$;

-- =============================================================================
-- Update inventory.inventory_ledger to support opening_stock transaction type
-- This is for Ticket 4 (API-RCAT-003)
-- =============================================================================

-- The transaction_type column is VARCHAR(30), we just need to ensure the
-- application code accepts 'opening_stock' as a valid type.
-- No schema change needed - the column already accepts any string up to 30 chars.

-- Add a comment documenting the valid transaction types
COMMENT ON COLUMN inventory.inventory_ledger.transaction_type IS
  'Transaction type: sale, sale_return, purchase_received, adjustment, opening_stock';

COMMIT;
