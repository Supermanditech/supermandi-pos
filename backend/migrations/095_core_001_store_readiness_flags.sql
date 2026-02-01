-- Migration: 095_core_001_store_readiness_flags
-- CORE-001: Canonical Store State Machine - Readiness Flag Columns
-- Adds columns to track store readiness for ACTIVE status
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- Step 1: Add readiness flag columns to platform.stores
-- =============================================================================

-- device_bound: True when a POS device has been activated for this store
ALTER TABLE platform.stores
ADD COLUMN IF NOT EXISTS device_bound BOOLEAN DEFAULT FALSE;

-- kyc_complete: True when all required documents are uploaded and verified
ALTER TABLE platform.stores
ADD COLUMN IF NOT EXISTS kyc_complete BOOLEAN DEFAULT FALSE;

-- upi_complete: True when UPI address is set and validated
ALTER TABLE platform.stores
ADD COLUMN IF NOT EXISTS upi_complete BOOLEAN DEFAULT FALSE;

-- admin_approved: True when admin has approved the store
ALTER TABLE platform.stores
ADD COLUMN IF NOT EXISTS admin_approved BOOLEAN DEFAULT FALSE;

-- status_reason: Reason for current status (especially for NEEDS_FIX, SUSPENDED)
ALTER TABLE platform.stores
ADD COLUMN IF NOT EXISTS status_reason TEXT;

-- status_updated_at: When the status was last changed
ALTER TABLE platform.stores
ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ DEFAULT NOW();

-- status_updated_by: Who changed the status (admin user ID)
ALTER TABLE platform.stores
ADD COLUMN IF NOT EXISTS status_updated_by UUID;

-- Added readiness flag columns to platform.stores

-- =============================================================================
-- Step 2: Update existing stores to have correct flag values
-- =============================================================================

-- For existing ACTIVE stores, set all flags to true
UPDATE platform.stores
SET
  device_bound = TRUE,
  kyc_complete = TRUE,
  upi_complete = TRUE,
  admin_approved = TRUE,
  status_updated_at = COALESCE(updated_at, NOW())
WHERE status = 'ACTIVE';

-- For existing non-ACTIVE stores, estimate flags based on available data
-- Note: pos.pos_devices may not exist yet; handle gracefully
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'pos' AND table_name = 'pos_devices'
  ) THEN
    UPDATE platform.stores
    SET
      device_bound = EXISTS (
        SELECT 1 FROM pos.pos_devices pd
        WHERE pd.store_id = platform.stores.id
        AND pd.revoked_at IS NULL
      ),
      upi_complete = (upi_vpa IS NOT NULL AND upi_vpa != ''),
      status_updated_at = COALESCE(updated_at, NOW())
    WHERE status != 'ACTIVE';
  ELSE
    -- Table doesn't exist, just set default flags
    UPDATE platform.stores
    SET
      device_bound = FALSE,
      upi_complete = (upi_vpa IS NOT NULL AND upi_vpa != ''),
      status_updated_at = COALESCE(updated_at, NOW())
    WHERE status != 'ACTIVE';
  END IF;
END;
$$;

-- Updated existing stores with readiness flags

-- =============================================================================
-- Step 3: Add indexes for readiness queries
-- =============================================================================

-- Index for finding stores ready for approval
CREATE INDEX IF NOT EXISTS idx_stores_ready_for_approval
ON platform.stores(status)
WHERE status = 'PAYMENTS_SUBMITTED'
  AND device_bound = TRUE
  AND kyc_complete = TRUE
  AND upi_complete = TRUE;

-- Index for finding stores with issues
CREATE INDEX IF NOT EXISTS idx_stores_needs_attention
ON platform.stores(status)
WHERE status IN ('NEEDS_FIX', 'SUSPENDED');

-- Created readiness indexes

-- =============================================================================
-- Step 4: Add comments for documentation
-- =============================================================================

COMMENT ON COLUMN platform.stores.device_bound IS 'True when a POS device is activated and bound to this store';
COMMENT ON COLUMN platform.stores.kyc_complete IS 'True when all required KYC documents are uploaded and verified';
COMMENT ON COLUMN platform.stores.upi_complete IS 'True when UPI address is validated';
COMMENT ON COLUMN platform.stores.admin_approved IS 'True when admin has approved the store for ACTIVE status';
COMMENT ON COLUMN platform.stores.status_reason IS 'Reason for current status (rejection reason, suspension reason, etc.)';
COMMENT ON COLUMN platform.stores.status_updated_at IS 'Timestamp when status was last changed';
COMMENT ON COLUMN platform.stores.status_updated_by IS 'Admin user ID who last changed the status';

COMMIT;
