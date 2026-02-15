-- Migration: 130_t060_sale_items_stock_quantity
-- T-060: Add stock_quantity column to sale_items for retail variant sales
-- For non-variant sales: stock_quantity = quantity
-- For variant sales: stock_quantity = effective deduction in parent unit
-- Example: 2 packs of "500 gm" variant → quantity=2 (billing), stock_quantity=1 (KG deduction)
-- Safe to run multiple times (idempotent)

BEGIN;

-- Add stock_quantity column (defaults to quantity for backward compatibility)
ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS stock_quantity NUMERIC(12,4);

-- Backfill: set stock_quantity = quantity for all existing rows where it's null
UPDATE sale_items
  SET stock_quantity = quantity
  WHERE stock_quantity IS NULL;

-- Set default for new rows (will be overwritten by the app for variant sales)
ALTER TABLE sale_items
  ALTER COLUMN stock_quantity SET DEFAULT NULL;

COMMENT ON COLUMN sale_items.stock_quantity IS
  'Effective stock deduction quantity in parent product units. For variant sales, differs from billing quantity. For "500 gm" variant: quantity=2 (packs for billing), stock_quantity=1.0 (KG for stock). NULL means same as quantity (non-variant).';

COMMIT;
