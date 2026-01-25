-- Migration: 042_inventory_ledger_supplier_id
-- HIGH-002 (AUD-074-A): Add supplier_id column to inventory.inventory_ledger
-- Enables querying "all stock from supplier X" without parsing notes field
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- Add supplier_id column to inventory.inventory_ledger
-- Optional FK to supplier.suppliers - allows NULL for manual adjustments/sales
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'inventory'
      AND table_name = 'inventory_ledger'
      AND column_name = 'supplier_id'
  ) THEN
    ALTER TABLE inventory.inventory_ledger
      ADD COLUMN supplier_id UUID;

    -- Add FK constraint (deferrable for bulk inserts)
    ALTER TABLE inventory.inventory_ledger
      ADD CONSTRAINT fk_inventory_ledger_supplier
      FOREIGN KEY (supplier_id)
      REFERENCES supplier.suppliers(id)
      ON DELETE SET NULL
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- =============================================================================
-- Index for supplier-based queries
-- "Get all stock movements for supplier X in store Y"
-- =============================================================================
CREATE INDEX IF NOT EXISTS inventory_ledger_supplier_idx
  ON inventory.inventory_ledger (supplier_id, store_id, created_at DESC)
  WHERE supplier_id IS NOT NULL;

-- =============================================================================
-- Index for purchase_received transactions by supplier
-- Most common query pattern: "What did we receive from supplier X?"
-- =============================================================================
CREATE INDEX IF NOT EXISTS inventory_ledger_supplier_purchases_idx
  ON inventory.inventory_ledger (store_id, supplier_id, created_at DESC)
  WHERE transaction_type = 'purchase_received' AND supplier_id IS NOT NULL;

COMMIT;
