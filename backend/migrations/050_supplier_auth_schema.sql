-- Migration: 050_supplier_auth_schema
-- SM-005: Supplier Auth Schema Migration
-- Adds password_hash for supplier authentication and email unique constraint
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- ALTER supplier.suppliers: Add authentication fields
-- =============================================================================

-- Password hash for supplier login (bcrypt)
ALTER TABLE supplier.suppliers
  ADD COLUMN IF NOT EXISTS password_hash VARCHAR(100);

-- Add unique constraint on email for login
-- Use partial unique index to allow NULL emails but enforce uniqueness for non-NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_email_unique
  ON supplier.suppliers(primary_email)
  WHERE primary_email IS NOT NULL;

-- Add index on verification_status for quick filtering
CREATE INDEX IF NOT EXISTS idx_suppliers_verification_status
  ON supplier.suppliers(verification_status);

COMMIT;
