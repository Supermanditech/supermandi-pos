-- Migration: 094_core_001_store_status_enum
-- CORE-001: Canonical Store State Machine - Status Enum Update
-- Adds new store statuses: DRAFT, ENROLLED, KYC_SUBMITTED, PAYMENTS_SUBMITTED, ACTIVE, NEEDS_FIX, SUSPENDED
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- Step 1: Drop existing constraint on platform.stores.status
-- =============================================================================
DO $$
BEGIN
  -- Drop the existing constraint if it exists
  ALTER TABLE platform.stores DROP CONSTRAINT IF EXISTS stores_status_check;
  RAISE NOTICE 'CORE-001: Dropped existing stores_status_check constraint';
EXCEPTION WHEN undefined_object THEN
  RAISE NOTICE 'CORE-001: No existing stores_status_check constraint to drop';
END;
$$;

-- =============================================================================
-- Step 2: Migrate existing status values to new enum values
-- Mapping:
--   'active' -> 'ACTIVE'
--   'inactive' -> 'DRAFT'
--   'suspended' -> 'SUSPENDED'
--   'deleted' -> keep as is (handled by soft delete)
-- =============================================================================
UPDATE platform.stores
SET status = 'ACTIVE'
WHERE LOWER(status) = 'active';

UPDATE platform.stores
SET status = 'DRAFT'
WHERE LOWER(status) = 'inactive';

UPDATE platform.stores
SET status = 'SUSPENDED'
WHERE LOWER(status) = 'suspended';

-- Handle any NULL status (shouldn't exist but just in case)
UPDATE platform.stores
SET status = 'DRAFT'
WHERE status IS NULL;

-- =============================================================================
-- Step 3: Add new constraint with all valid statuses
-- =============================================================================
ALTER TABLE platform.stores
ADD CONSTRAINT stores_status_check
CHECK (status IN (
  'DRAFT',              -- Initial state: Store created but not enrolled
  'ENROLLED',           -- Device bound to store
  'KYC_SUBMITTED',      -- Documents uploaded
  'PAYMENTS_SUBMITTED', -- UPI/bank details submitted
  'ACTIVE',             -- Approved and fully operational
  'NEEDS_FIX',          -- Admin rejected, needs resubmission
  'SUSPENDED',          -- Admin suspended the store
  'deleted'             -- Soft-deleted (kept for backward compatibility)
));

-- =============================================================================
-- Step 4: Add index for filtering by status (if not exists)
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_stores_status ON platform.stores(status);

-- Add index for common status queries
CREATE INDEX IF NOT EXISTS idx_stores_pending_approval
ON platform.stores(status)
WHERE status = 'PAYMENTS_SUBMITTED';

CREATE INDEX IF NOT EXISTS idx_stores_needs_fix
ON platform.stores(status)
WHERE status = 'NEEDS_FIX';

COMMIT;

-- Add documentation comment
COMMENT ON COLUMN platform.stores.status IS 'Store lifecycle status: DRAFT -> ENROLLED -> KYC_SUBMITTED -> PAYMENTS_SUBMITTED -> ACTIVE (or NEEDS_FIX for rejection, SUSPENDED for admin action)';
