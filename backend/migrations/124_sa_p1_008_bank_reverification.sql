-- Migration: 124_sa_p1_008_bank_reverification
-- SA-P1-008: Supplier Bank Detail Re-Verification
-- Expands approval_logs to support bank_change entity type
-- Adds index for efficient pending bank verification queries

BEGIN;

-- SA-P1-008: Expand approval_logs to support bank_change entity type
ALTER TABLE supplier.approval_logs
  DROP CONSTRAINT IF EXISTS chk_approval_logs_entity_type;
ALTER TABLE supplier.approval_logs
  ADD CONSTRAINT chk_approval_logs_entity_type
  CHECK (entity_type IN ('supplier', 'product', 'bank_change'));

-- Add partial index for efficient bank verification pending queries
CREATE INDEX IF NOT EXISTS idx_suppliers_bank_verification_status
  ON supplier.suppliers(bank_verification_status)
  WHERE bank_verification_status = 'pending';

COMMIT;
