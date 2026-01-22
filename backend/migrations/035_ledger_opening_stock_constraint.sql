-- Migration: 035_ledger_opening_stock_constraint
-- Fix CHECK constraint on inventory.inventory_ledger.transaction_type
-- to include 'opening_stock' (used by retailer dashboard product creation,
-- CSV import, and bulk paste flows)
-- Safe to run multiple times (idempotent: DROP IF EXISTS + CREATE)

BEGIN;

-- Drop the existing CHECK constraint
ALTER TABLE inventory.inventory_ledger
  DROP CONSTRAINT IF EXISTS chk_ledger_transaction_type;

-- Re-create with 'opening_stock' included
ALTER TABLE inventory.inventory_ledger
  ADD CONSTRAINT chk_ledger_transaction_type CHECK (
    transaction_type IN ('sale', 'sale_return', 'purchase_received', 'adjustment', 'opening_stock')
  );

COMMIT;
