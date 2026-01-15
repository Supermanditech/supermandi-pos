-- Migration: 016_add_enrollment_tracking_columns.sql
-- Ensures all required tracking columns exist for enrollment management
-- Safe to run multiple times (idempotent)

BEGIN;

-- ============================================================================
-- 1. Add tracking columns to pos_device_enrollments (if not exist)
-- ============================================================================

-- revoked_at: timestamp when code was revoked (blocks ALL new enrollments)
ALTER TABLE pos_device_enrollments
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

-- last_used_at: timestamp of most recent enrollment (for monitoring)
ALTER TABLE pos_device_enrollments
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

-- updated_at: generic update timestamp
ALTER TABLE pos_device_enrollments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- max_uses: ensure column exists (should exist from 012, but be safe)
ALTER TABLE pos_device_enrollments
  ADD COLUMN IF NOT EXISTS max_uses INTEGER DEFAULT 1;

-- uses_count: ensure column exists
ALTER TABLE pos_device_enrollments
  ADD COLUMN IF NOT EXISTS uses_count INTEGER DEFAULT 0;

-- ============================================================================
-- 2. Add indexes for efficient lookups
-- ============================================================================

-- Index for revoked_at lookups
CREATE INDEX IF NOT EXISTS idx_enrollments_revoked_at
  ON pos_device_enrollments(revoked_at)
  WHERE revoked_at IS NOT NULL;

-- Index for code lookups (should exist, but ensure)
CREATE INDEX IF NOT EXISTS idx_enrollments_code
  ON pos_device_enrollments(code);

-- ============================================================================
-- 3. Add comments for documentation
-- ============================================================================

COMMENT ON COLUMN pos_device_enrollments.revoked_at IS
  'If set, code is revoked and cannot be used for ANY new enrollments (even demo).';

COMMENT ON COLUMN pos_device_enrollments.last_used_at IS
  'Timestamp of the most recent device enrollment with this code. Updated on each use.';

COMMENT ON COLUMN pos_device_enrollments.max_uses IS
  'Maximum enrollments allowed. 1=single-use (production), 9999=multi-use (demo). NULL treated as 1.';

COMMENT ON COLUMN pos_device_enrollments.uses_count IS
  'Current number of times this code has been used. Incremented on each new enrollment.';

-- ============================================================================
-- 4. Backfill uses_count for legacy records that have used_at but uses_count=0
-- ============================================================================

UPDATE pos_device_enrollments
SET uses_count = 1
WHERE used_at IS NOT NULL
  AND (uses_count IS NULL OR uses_count = 0);

COMMIT;
