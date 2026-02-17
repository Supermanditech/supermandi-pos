-- PRA-080: Add missing concurrency safety constraints
-- CONC-004: Add CHECK constraint on legacy store_inventory table
-- Prevents negative stock at database level (defense-in-depth)

ALTER TABLE store_inventory
  ADD CONSTRAINT chk_store_inventory_qty CHECK (available_qty >= 0);

-- CONC-002: Add unique index for stock-in idempotency (belt-and-suspenders with advisory lock)
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_ledger_stockin_idempotency
  ON inventory.inventory_ledger (store_id, reference_id, transaction_type)
  WHERE transaction_type = 'purchase_received' AND reference_id IS NOT NULL;
