-- Migration: 017_fix_legacy_demo_codes.sql
-- CRITICAL: Fix legacy demo enrollment codes (SM-DEMO01, SM-DEMO02, etc.)
-- These codes were created before multi-use logic and have:
--   max_uses = 1 (or NULL)
--
-- Solution:
--   1. Set max_uses = 9999 for demo codes
--   2. Extend expires_at to 1 year from now

BEGIN;

-- ============================================================================
-- 1. Fix specific known demo codes (SM-DEMO01, SM-DEMO02)
-- ============================================================================

UPDATE pos_device_enrollments
SET
  max_uses = 9999,
  expires_at = GREATEST(expires_at, NOW() + INTERVAL '1 year')
WHERE code IN ('SM-DEMO01', 'SM-DEMO02');

-- ============================================================================
-- 2. Fix ALL codes matching demo patterns (SM-DEMO*, SM-TEST*, SM-QA*)
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
    OR code LIKE 'SM-PRELIVE%'
  );

-- ============================================================================
-- 3. Fix enrollments for stores with demo-pattern code
-- Use platform.stores (not stores view) to avoid UUID/TEXT type mismatch
-- ============================================================================

UPDATE pos_device_enrollments e
SET
  max_uses = 9999,
  expires_at = GREATEST(e.expires_at, NOW() + INTERVAL '1 year')
FROM platform.stores s
WHERE e.store_id = s.id
  AND (e.max_uses IS NULL OR e.max_uses < 9999)
  AND (
    -- Prefix patterns (2-char uppercase)
    UPPER(LEFT(COALESCE(s.code, ''), 2)) IN ('DM', 'QA', 'TS', 'ST', 'PR')
    OR
    -- Legacy patterns (case-insensitive contains)
    LOWER(COALESCE(s.code, '')) LIKE '%demo%'
    OR LOWER(COALESCE(s.code, '')) LIKE '%test%'
    OR LOWER(COALESCE(s.code, '')) LIKE '%qa-%'
    OR LOWER(COALESCE(s.code, '')) LIKE '%staging%'
    OR LOWER(COALESCE(s.code, '')) LIKE '%prelive%'
    -- Also match by store name
    OR s.name ILIKE '%demo%'
    OR s.name ILIKE '%prelive%'
    OR s.name ILIKE '%test%'
  );

-- ============================================================================
-- 4. Verification output
-- ============================================================================

DO $$
DECLARE
  demo_count INTEGER;
  prod_count INTEGER;
  sm_demo_status TEXT;
BEGIN
  -- Count demo vs production enrollments
  SELECT COUNT(*) INTO demo_count
  FROM pos_device_enrollments
  WHERE max_uses = 9999;

  SELECT COUNT(*) INTO prod_count
  FROM pos_device_enrollments
  WHERE max_uses IS NULL OR max_uses = 1;

  -- Check SM-DEMO01/02 specifically
  SELECT string_agg(
    code || ': max_uses=' || COALESCE(max_uses::text, 'NULL'),
    '; '
  ) INTO sm_demo_status
  FROM pos_device_enrollments
  WHERE code IN ('SM-DEMO01', 'SM-DEMO02');

  RAISE NOTICE '=== Migration 017 Results ===';
  RAISE NOTICE 'Demo enrollments (multi-use): %', demo_count;
  RAISE NOTICE 'Production enrollments (single-use): %', prod_count;
  RAISE NOTICE 'SM-DEMO codes: %', COALESCE(sm_demo_status, 'not found');
END $$;

COMMIT;
