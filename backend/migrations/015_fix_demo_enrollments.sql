-- Migration: 015_fix_demo_enrollments.sql
-- DEV-071 BUG-FIX: Update existing demo enrollment codes to multi-use
--
-- Problem: Demo enrollment codes (like SM-DEMO02) were created before multi-use
-- logic was implemented, so they have max_uses=1 and fail on second device.
--
-- Solution:
-- 1. Ensure all required columns exist (last_used_at, revoked_at)
-- 2. Update all existing demo store enrollments to max_uses=9999
-- Detection: store.is_demo = TRUE OR store_code matches demo patterns

BEGIN;

-- ============================================================================
-- 1. Ensure required columns exist on pos_device_enrollments
-- ============================================================================

-- last_used_at: timestamp of most recent enrollment (for monitoring)
ALTER TABLE pos_device_enrollments
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

-- revoked_at: timestamp when code was revoked (prevents new enrollments)
ALTER TABLE pos_device_enrollments
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

-- updated_at: generic update timestamp
ALTER TABLE pos_device_enrollments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add comments for documentation
COMMENT ON COLUMN pos_device_enrollments.last_used_at IS
  'Timestamp of the most recent device enrollment with this code. Updated on each use.';

COMMENT ON COLUMN pos_device_enrollments.revoked_at IS
  'If set, code is revoked and cannot be used for new enrollments.';

-- ============================================================================
-- 2. Update demo enrollments to multi-use (9999 uses, 1 year expiry)
-- ============================================================================

-- Update enrollments for stores with is_demo = TRUE
UPDATE pos_device_enrollments e
SET
  max_uses = 9999,
  expires_at = GREATEST(expires_at, NOW() + INTERVAL '1 year')
FROM stores s
WHERE e.store_id = s.id
  AND s.is_demo = TRUE
  AND (e.max_uses IS NULL OR e.max_uses < 9999);

-- Update enrollments for stores with demo-pattern store_code
-- Patterns: DM*, QA*, TS*, ST* prefixes OR contains 'demo', 'test', 'qa-', 'staging'
UPDATE pos_device_enrollments e
SET
  max_uses = 9999,
  expires_at = GREATEST(expires_at, NOW() + INTERVAL '1 year')
FROM stores s
WHERE e.store_id = s.id
  AND (e.max_uses IS NULL OR e.max_uses < 9999)
  AND (
    -- Prefix patterns (2-char uppercase)
    UPPER(LEFT(COALESCE(s.store_code, s.code, ''), 2)) IN ('DM', 'QA', 'TS', 'ST')
    OR
    -- Legacy patterns (case-insensitive contains)
    LOWER(COALESCE(s.store_code, s.code, '')) LIKE '%demo%'
    OR LOWER(COALESCE(s.store_code, s.code, '')) LIKE '%test%'
    OR LOWER(COALESCE(s.store_code, s.code, '')) LIKE '%qa-%'
    OR LOWER(COALESCE(s.store_code, s.code, '')) LIKE '%staging%'
  );

-- ============================================================================
-- 3. IMPORTANT: Also update enrollments by code pattern (SM-DEMO*)
--    This catches codes that may have been created for stores without
--    proper is_demo flag or store_code pattern
-- ============================================================================

UPDATE pos_device_enrollments
SET
  max_uses = 9999,
  expires_at = GREATEST(expires_at, NOW() + INTERVAL '1 year')
WHERE (max_uses IS NULL OR max_uses < 9999)
  AND (
    code LIKE 'SM-DEMO%'
    OR code LIKE 'SM-TEST%'
    OR code LIKE 'SM-QA%'
  );

-- ============================================================================
-- 4. Add index for revoked_at lookups (if not exists)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_enrollments_revoked_at
  ON pos_device_enrollments(revoked_at)
  WHERE revoked_at IS NOT NULL;

-- ============================================================================
-- 5. Log updated rows (for audit)
-- ============================================================================

DO $$
DECLARE
  demo_count INTEGER;
  single_use_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO demo_count
  FROM pos_device_enrollments
  WHERE max_uses = 9999;

  SELECT COUNT(*) INTO single_use_count
  FROM pos_device_enrollments
  WHERE max_uses IS NULL OR max_uses = 1;

  RAISE NOTICE 'Migration 015 complete:';
  RAISE NOTICE '  Demo enrollments (multi-use): %', demo_count;
  RAISE NOTICE '  Production enrollments (single-use): %', single_use_count;
END $$;

COMMIT;
