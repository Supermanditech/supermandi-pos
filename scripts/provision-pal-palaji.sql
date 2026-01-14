-- Provision PAL PALAJI STORE for Go-Live Testing
-- Run: docker exec -i supermandi-postgres psql -U supermandi -d supermandi < provision-pal-palaji.sql

-- =============================================================================
-- STEP 1: Create the store
-- =============================================================================
INSERT INTO stores (id, name, active, created_at, updated_at)
VALUES (
  'pal-palaji-store',
  'PAL PALAJI STORE',
  TRUE,  -- Active for testing
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  active = EXCLUDED.active,
  updated_at = NOW();

-- =============================================================================
-- STEP 2: Create enrollment code (valid for 24 hours for testing)
-- Schema: id, code, store_id, expires_at, used_at, created_at, created_by,
--         enrollment_code_hash, used_device_id
-- =============================================================================
-- Delete any existing enrollment codes for this store
DELETE FROM pos_device_enrollments WHERE store_id = 'pal-palaji-store';

-- Create new enrollment code: SM-PALAJI
-- Note: enrollment_code_hash = SHA256('SM-PALAJI')
INSERT INTO pos_device_enrollments (
  id,
  code,
  store_id,
  expires_at,
  created_by,
  enrollment_code_hash
)
VALUES (
  gen_random_uuid(),
  'SM-PALAJI',
  'pal-palaji-store',
  NOW() + INTERVAL '24 hours',
  'superadmin',
  encode(sha256('SM-PALAJI'::bytea), 'hex')
);

-- =============================================================================
-- STEP 3: Verify
-- =============================================================================
SELECT 'STORE CREATED' as status, id, name, active FROM stores WHERE id = 'pal-palaji-store';
SELECT 'ENROLLMENT CODE' as status, code, store_id, expires_at FROM pos_device_enrollments WHERE store_id = 'pal-palaji-store';

-- =============================================================================
-- USAGE INSTRUCTIONS
-- =============================================================================
-- On Redmi, when the app loads:
-- 1. Enter enrollment code: SM-PALAJI
-- 2. Complete onboarding flow
--
-- The store is now ready for go-live testing!
-- =============================================================================
