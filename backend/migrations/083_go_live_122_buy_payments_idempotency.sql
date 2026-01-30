-- GO-LIVE-122: Add idempotency key to buy_payments table
-- Prevents duplicate payment records from double-submits or retries

BEGIN;

-- Add idempotency_key column to buy_payments
ALTER TABLE payments.buy_payments
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);

-- Create unique index on idempotency_key (allowing NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_buy_payments_idempotency_key
  ON payments.buy_payments(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Add reference_id column to inventory_ledger for catalog schema
-- This ensures consistency with GO-LIVE-121 idempotency checks
ALTER TABLE inventory.inventory_ledger
  ADD COLUMN IF NOT EXISTS reference_id VARCHAR(100);

-- Create index for idempotency lookup on inventory.inventory_ledger
CREATE INDEX IF NOT EXISTS idx_inv_ledger_ref_lookup
  ON inventory.inventory_ledger(store_id, product_id, reference_type, reference_id)
  WHERE reference_id IS NOT NULL;

COMMENT ON COLUMN payments.buy_payments.idempotency_key IS
'GO-LIVE-122: Unique key to prevent duplicate payments from retries/double-submits';

COMMIT;
