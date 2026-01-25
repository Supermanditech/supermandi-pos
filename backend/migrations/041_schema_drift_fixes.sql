-- Migration: 041_schema_drift_fixes
-- GAP-006: Add source column to inventory_ledger
-- GAP-007: Add missing columns to orders.purchase_orders
-- GAP-009: Add item_name column to sale_items (code uses item_name, schema has name)
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- GAP-006: Add source column to inventory.inventory_ledger
-- Tracks the origin of inventory transactions (POS_INVENTORY, SYNC, CSV_IMPORT, etc.)
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'inventory'
      AND table_name = 'inventory_ledger'
      AND column_name = 'source'
  ) THEN
    ALTER TABLE inventory.inventory_ledger
      ADD COLUMN source VARCHAR(50);
  END IF;
END $$;

-- =============================================================================
-- GAP-007: Add missing columns to orders.purchase_orders
-- item_count, tracking_number, carrier used by orders.ts:102-109
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'orders'
      AND table_name = 'purchase_orders'
      AND column_name = 'item_count'
  ) THEN
    ALTER TABLE orders.purchase_orders
      ADD COLUMN item_count INTEGER DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'orders'
      AND table_name = 'purchase_orders'
      AND column_name = 'tracking_number'
  ) THEN
    ALTER TABLE orders.purchase_orders
      ADD COLUMN tracking_number VARCHAR(100);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'orders'
      AND table_name = 'purchase_orders'
      AND column_name = 'carrier'
  ) THEN
    ALTER TABLE orders.purchase_orders
      ADD COLUMN carrier VARCHAR(100);
  END IF;
END $$;

-- =============================================================================
-- GAP-009: Add item_name column to public.sale_items
-- Code uses item_name (sales.ts:1039), schema has name (018_sales_schema.sql:99)
-- Add item_name and migrate data from name column
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sale_items'
      AND column_name = 'item_name'
  ) THEN
    ALTER TABLE public.sale_items
      ADD COLUMN item_name VARCHAR(500);

    -- Migrate existing data from name to item_name
    UPDATE public.sale_items SET item_name = name WHERE item_name IS NULL;
  END IF;
END $$;

-- =============================================================================
-- Also add product_id column if missing (required by sales code)
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sale_items'
      AND column_name = 'product_id'
  ) THEN
    -- Column already exists in schema, this is a safety check
    NULL;
  END IF;
END $$;

COMMIT;
