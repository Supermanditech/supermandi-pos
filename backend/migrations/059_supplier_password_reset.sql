-- Migration: 059_supplier_password_reset
-- GL-WF-035: Supplier Password Reset Flow
-- Adds password_reset_token and password_reset_expires columns for password recovery
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- ALTER supplier.suppliers: Add password reset fields
-- =============================================================================

-- Password reset token (6-digit code)
ALTER TABLE supplier.suppliers
  ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(10);

-- Password reset token expiry timestamp
ALTER TABLE supplier.suppliers
  ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ;

-- Add index on password_reset_token for quick lookup during reset
CREATE INDEX IF NOT EXISTS idx_suppliers_password_reset_token
  ON supplier.suppliers(password_reset_token)
  WHERE password_reset_token IS NOT NULL;

COMMIT;
