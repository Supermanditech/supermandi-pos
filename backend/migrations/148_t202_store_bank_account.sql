-- T-202: Add bank account fields to platform.stores for retailer payouts
-- Additive only: new nullable columns with defaults

ALTER TABLE platform.stores
  ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(20) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bank_ifsc VARCHAR(11) DEFAULT NULL;

-- Index for IFSC lookups (settlements)
CREATE INDEX IF NOT EXISTS idx_stores_bank_ifsc
  ON platform.stores (bank_ifsc) WHERE bank_ifsc IS NOT NULL;
