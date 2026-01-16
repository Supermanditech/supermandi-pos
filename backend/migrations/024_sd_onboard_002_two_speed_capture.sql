-- =============================================================================
-- Migration: 024_sd_onboard_002_two_speed_capture
-- SD-ONBOARD-002: Two-Speed Product Capture + Internal Prefill
-- Safe to run multiple times (idempotent)
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Add purchase_price column to catalog.store_products
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'catalog'
    AND table_name = 'store_products'
    AND column_name = 'purchase_price'
  ) THEN
    ALTER TABLE catalog.store_products
    ADD COLUMN purchase_price INTEGER;

    COMMENT ON COLUMN catalog.store_products.purchase_price IS 'Purchase price in minor units (paise)';
  END IF;
END $$;

-- =============================================================================
-- 2. Add variant column to catalog.products
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'catalog'
    AND table_name = 'products'
    AND column_name = 'variant'
  ) THEN
    ALTER TABLE catalog.products
    ADD COLUMN variant VARCHAR(255);

    COMMENT ON COLUMN catalog.products.variant IS 'Product variant (e.g., "Red", "500ml")';
  END IF;
END $$;

-- =============================================================================
-- 3. Update source constraint on catalog.product_barcodes
-- Allow 'retailer_digitisation' as a valid source
-- =============================================================================
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_schema = 'catalog'
    AND table_name = 'product_barcodes'
    AND constraint_name = 'chk_barcode_source'
  ) THEN
    ALTER TABLE catalog.product_barcodes DROP CONSTRAINT chk_barcode_source;
  END IF;

  -- Add updated constraint with 'retailer_digitisation'
  ALTER TABLE catalog.product_barcodes
  ADD CONSTRAINT chk_barcode_source CHECK (
    source IN ('manual', 'supplier_sync', 'grn_scan', 'retailer_digitisation')
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- 4. Add created_by_store_id to catalog.product_barcodes for tracking
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'catalog'
    AND table_name = 'product_barcodes'
    AND column_name = 'created_by_store_id'
  ) THEN
    ALTER TABLE catalog.product_barcodes
    ADD COLUMN created_by_store_id UUID;

    COMMENT ON COLUMN catalog.product_barcodes.created_by_store_id IS 'Store ID that first digitised this barcode (NULL for supplier/manual)';
  END IF;
END $$;

-- =============================================================================
-- 5. Add digitisation_mode to catalog.store_products for tracking
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'catalog'
    AND table_name = 'store_products'
    AND column_name = 'digitisation_mode'
  ) THEN
    ALTER TABLE catalog.store_products
    ADD COLUMN digitisation_mode VARCHAR(20);

    COMMENT ON COLUMN catalog.store_products.digitisation_mode IS 'How product was added: FAST_SELL or DIGITISATION';
  END IF;
END $$;

-- =============================================================================
-- 6. Index for platform catalog barcode lookup (internal prefill)
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_product_barcodes_lookup
  ON catalog.product_barcodes (barcode);

COMMIT;
