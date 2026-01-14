-- Migration: 012_multiuse_enrollments.sql
-- DEV-071: Multi-use enrollment codes for DEMO stores + device fingerprint support
--
-- Features:
-- 1. max_uses/uses_count for multi-use codes (DEMO stores only)
-- 2. device_fingerprint on pos_devices for idempotent enrollment
-- 3. Better tracking of which devices used which codes

BEGIN;

-- ============================================================================
-- 1. Add multi-use columns to pos_device_enrollments
-- ============================================================================

-- max_uses: how many times this code can be used (1 = single-use, NULL = 1)
ALTER TABLE pos_device_enrollments
  ADD COLUMN IF NOT EXISTS max_uses INTEGER DEFAULT 1;

-- uses_count: how many times this code has been used
ALTER TABLE pos_device_enrollments
  ADD COLUMN IF NOT EXISTS uses_count INTEGER DEFAULT 0;

-- Update existing records: set uses_count based on used_at
UPDATE pos_device_enrollments
SET uses_count = CASE WHEN used_at IS NOT NULL THEN 1 ELSE 0 END
WHERE uses_count IS NULL OR uses_count = 0;

-- ============================================================================
-- 2. Add device fingerprint to pos_devices
-- ============================================================================

-- device_fingerprint: stable identifier from Android (ANDROID_ID or similar)
-- Used for idempotent enrollment - same device can retry without error
ALTER TABLE pos_devices
  ADD COLUMN IF NOT EXISTS device_fingerprint TEXT;

-- Index for quick fingerprint lookups
CREATE INDEX IF NOT EXISTS idx_pos_devices_fingerprint
  ON pos_devices(device_fingerprint)
  WHERE device_fingerprint IS NOT NULL;

-- ============================================================================
-- 3. Track which enrollments created which devices (for multi-use)
-- ============================================================================

-- enrollment_id: links device to the enrollment code that created it
ALTER TABLE pos_devices
  ADD COLUMN IF NOT EXISTS enrollment_id UUID;

-- Index for enrollment lookups
CREATE INDEX IF NOT EXISTS idx_pos_devices_enrollment_id
  ON pos_devices(enrollment_id)
  WHERE enrollment_id IS NOT NULL;

-- ============================================================================
-- 4. Add constraint: uses_count <= max_uses
-- ============================================================================

-- Note: We don't add a CHECK constraint because max_uses can be NULL (means 1)
-- The application logic handles this

-- ============================================================================
-- 5. Comments for documentation
-- ============================================================================

COMMENT ON COLUMN pos_device_enrollments.max_uses IS
  'Maximum number of times this code can be used. 1 for single-use, >1 for demo/testing. NULL treated as 1.';

COMMENT ON COLUMN pos_device_enrollments.uses_count IS
  'Current number of times this code has been used. Must be <= max_uses.';

COMMENT ON COLUMN pos_devices.device_fingerprint IS
  'Stable device identifier (e.g., Android ANDROID_ID). Used for idempotent enrollment.';

COMMENT ON COLUMN pos_devices.enrollment_id IS
  'UUID of the enrollment record that created this device.';

COMMIT;
