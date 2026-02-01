-- Migration: 097_core_002_supplier_status_enum
-- CORE-002: Supplier State Machine - Status Enum Update
-- Standardizes supplier verification_status to: KYC_SUBMITTED, ACTIVE, NEEDS_FIX, SUSPENDED
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- Step 1: Drop existing constraint on supplier.suppliers.verification_status
-- =============================================================================
DO $$
BEGIN
  ALTER TABLE supplier.suppliers DROP CONSTRAINT IF EXISTS chk_suppliers_verification_status;
  RAISE NOTICE 'CORE-002: Dropped existing chk_suppliers_verification_status constraint';
EXCEPTION WHEN undefined_object THEN
  RAISE NOTICE 'CORE-002: No existing chk_suppliers_verification_status constraint to drop';
END;
$$;

-- =============================================================================
-- Step 2: Migrate existing verification_status values to new enum values
-- Mapping:
--   'pending' -> 'KYC_SUBMITTED'
--   'unverified' -> 'KYC_SUBMITTED'
--   'verified' -> 'ACTIVE'
--   'rejected' -> 'NEEDS_FIX'
--   'suspended' -> 'SUSPENDED'
-- =============================================================================
UPDATE supplier.suppliers
SET verification_status = 'KYC_SUBMITTED'
WHERE LOWER(verification_status) IN ('pending', 'unverified');

UPDATE supplier.suppliers
SET verification_status = 'ACTIVE'
WHERE LOWER(verification_status) = 'verified';

UPDATE supplier.suppliers
SET verification_status = 'NEEDS_FIX'
WHERE LOWER(verification_status) = 'rejected';

UPDATE supplier.suppliers
SET verification_status = 'SUSPENDED'
WHERE LOWER(verification_status) = 'suspended';

-- Handle any NULL verification_status
UPDATE supplier.suppliers
SET verification_status = 'KYC_SUBMITTED'
WHERE verification_status IS NULL;

-- Migrated existing supplier verification_status values to new enum

-- =============================================================================
-- Step 3: Add new constraint with all valid statuses
-- =============================================================================
ALTER TABLE supplier.suppliers
ADD CONSTRAINT chk_suppliers_verification_status
CHECK (verification_status IN (
  'KYC_SUBMITTED', -- Initial state: Supplier registered, KYC submitted
  'ACTIVE',        -- Approved and fully operational
  'NEEDS_FIX',     -- Admin rejected, needs resubmission
  'SUSPENDED'      -- Admin suspended the supplier
));

-- Added new chk_suppliers_verification_status constraint

-- =============================================================================
-- Step 4: Add status tracking columns (similar to stores)
-- =============================================================================

-- status_updated_at: When the verification_status was last changed
ALTER TABLE supplier.suppliers
ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ DEFAULT NOW();

-- status_updated_by: Who changed the status (admin user ID)
ALTER TABLE supplier.suppliers
ADD COLUMN IF NOT EXISTS status_updated_by UUID;

-- Added status tracking columns to supplier.suppliers

-- =============================================================================
-- Step 5: Update existing suppliers with status timestamps
-- =============================================================================
UPDATE supplier.suppliers
SET status_updated_at = COALESCE(verified_at, updated_at, NOW())
WHERE status_updated_at IS NULL;

-- =============================================================================
-- Step 6: Add indexes for status filtering
-- =============================================================================

-- Index for pending suppliers queue
CREATE INDEX IF NOT EXISTS idx_suppliers_kyc_submitted
ON supplier.suppliers(verification_status)
WHERE verification_status = 'KYC_SUBMITTED';

-- Index for suppliers needing attention
CREATE INDEX IF NOT EXISTS idx_suppliers_needs_attention
ON supplier.suppliers(verification_status)
WHERE verification_status IN ('KYC_SUBMITTED', 'NEEDS_FIX');

-- Created supplier status indexes

-- =============================================================================
-- Step 7: Add documentation comments
-- =============================================================================
COMMENT ON COLUMN supplier.suppliers.verification_status IS 'Supplier verification status: KYC_SUBMITTED -> ACTIVE (or NEEDS_FIX for rejection, SUSPENDED for admin action)';
COMMENT ON COLUMN supplier.suppliers.status_updated_at IS 'Timestamp when verification_status was last changed';
COMMENT ON COLUMN supplier.suppliers.status_updated_by IS 'Admin user ID who last changed the verification_status';

COMMIT;
