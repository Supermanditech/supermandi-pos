-- Migration: 203_fix_gstin_partial_unique
-- GCP-STG-0001: Replace hard UNIQUE on supplier.suppliers.gstin with partial unique index
-- Problem: GSTIN gets permanently locked after first registration attempt, even if
-- application is rejected/abandoned. Legitimate suppliers cannot re-register.
-- Fix: Only enforce GSTIN uniqueness for ACTIVE suppliers.
-- ROLLBACK: DROP INDEX IF EXISTS supplier.idx_suppliers_gstin_active_unique; ALTER TABLE supplier.suppliers ADD CONSTRAINT suppliers_gstin_unique UNIQUE (gstin);

BEGIN;

-- Step 1: Drop the hard UNIQUE constraint from migration 003
ALTER TABLE supplier.suppliers
DROP CONSTRAINT IF EXISTS suppliers_gstin_unique;

-- Step 2: Create partial unique index — only ACTIVE suppliers must have unique GSTIN
-- This allows re-registration after rejection (NEEDS_FIX) or before approval (KYC_SUBMITTED)
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_gstin_active_unique
ON supplier.suppliers (gstin)
WHERE verification_status = 'ACTIVE' AND gstin IS NOT NULL AND gstin != '';

COMMIT;
