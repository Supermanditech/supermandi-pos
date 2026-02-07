-- Migration: 100_ledger_bulk_sale_type
-- POS-INV-002: Add 'bulk_sale' to inventory_ledger transaction_type constraint
-- Allows ledger entries for bulk inventory deductions from POS sales
-- Safe to run multiple times (idempotent: DROP IF EXISTS + CREATE)

BEGIN;

ALTER TABLE inventory.inventory_ledger
  DROP CONSTRAINT IF EXISTS chk_ledger_transaction_type;

ALTER TABLE inventory.inventory_ledger
  ADD CONSTRAINT chk_ledger_transaction_type CHECK (
    transaction_type IN ('sale', 'sale_return', 'purchase_received', 'adjustment', 'opening_stock', 'bulk_sale')
  );

COMMIT;
