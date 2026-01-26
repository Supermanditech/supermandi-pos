-- =============================================================================
-- Migration: 046_golive_demo_enrollments
-- GO-LIVE FIX: Create demo enrollment codes for device enrollment
-- This is the MISSING piece - enrollment codes must exist before devices can enroll
-- Safe to run multiple times (idempotent)
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Ensure pos_device_enrollments table exists (normally created by ensureSchema)
-- =============================================================================
CREATE TABLE IF NOT EXISTS pos_device_enrollments (
  code TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NULL,
  max_uses INTEGER DEFAULT 1,
  uses_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL
);

-- =============================================================================
-- 2. Ensure required columns exist (for older schemas)
-- =============================================================================
DO $$
BEGIN
  -- Add max_uses if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_device_enrollments' AND column_name = 'max_uses') THEN
    ALTER TABLE pos_device_enrollments ADD COLUMN max_uses INTEGER DEFAULT 1;
  END IF;

  -- Add uses_count if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_device_enrollments' AND column_name = 'uses_count') THEN
    ALTER TABLE pos_device_enrollments ADD COLUMN uses_count INTEGER DEFAULT 0;
  END IF;

  -- Add last_used_at if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_device_enrollments' AND column_name = 'last_used_at') THEN
    ALTER TABLE pos_device_enrollments ADD COLUMN last_used_at TIMESTAMPTZ NULL;
  END IF;

  -- Add revoked_at if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_device_enrollments' AND column_name = 'revoked_at') THEN
    ALTER TABLE pos_device_enrollments ADD COLUMN revoked_at TIMESTAMPTZ NULL;
  END IF;
END $$;

-- =============================================================================
-- 3. Create demo enrollment codes (multi-use, long expiry for demo stores)
-- GO-LIVE: These are the codes users will enter on their POS devices
-- =============================================================================

-- SM-DEMO01: Primary demo code for DEMO001 store
INSERT INTO pos_device_enrollments (
  code,
  store_id,
  expires_at,
  max_uses,
  uses_count,
  created_by
) VALUES (
  'SM-DEMO01',
  'a0000000-0000-0000-0000-000000000001',
  NOW() + INTERVAL '10 years',  -- Demo codes don't expire
  9999,                          -- Unlimited enrollments for demo
  0,
  'migration-046'
) ON CONFLICT (code) DO UPDATE SET
  expires_at = NOW() + INTERVAL '10 years',
  max_uses = 9999,
  revoked_at = NULL,  -- Ensure not revoked
  updated_at = NOW();

-- SM-DEMO02: Secondary demo code for DEMO001 store
INSERT INTO pos_device_enrollments (
  code,
  store_id,
  expires_at,
  max_uses,
  uses_count,
  created_by
) VALUES (
  'SM-DEMO02',
  'a0000000-0000-0000-0000-000000000001',
  NOW() + INTERVAL '10 years',
  9999,
  0,
  'migration-046'
) ON CONFLICT (code) DO UPDATE SET
  expires_at = NOW() + INTERVAL '10 years',
  max_uses = 9999,
  revoked_at = NULL,
  updated_at = NOW();

-- DEMO001: Simple code (store code itself) for ease of use
INSERT INTO pos_device_enrollments (
  code,
  store_id,
  expires_at,
  max_uses,
  uses_count,
  created_by
) VALUES (
  'DEMO001',
  'a0000000-0000-0000-0000-000000000001',
  NOW() + INTERVAL '10 years',
  9999,
  0,
  'migration-046'
) ON CONFLICT (code) DO UPDATE SET
  expires_at = NOW() + INTERVAL '10 years',
  max_uses = 9999,
  revoked_at = NULL,
  updated_at = NOW();

-- =============================================================================
-- 4. Ensure DEMO001 store exists and is active
-- =============================================================================
INSERT INTO platform.stores (
  id,
  name,
  code,
  phone,
  email,
  address_line1,
  city,
  state,
  pincode,
  status,
  max_devices
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'SuperMandi Demo Store',
  'DEMO001',
  '+91-9876543210',
  'demo@supermandi.in',
  '123 Market Street',
  'Bengaluru',
  'Karnataka',
  '560001',
  'active',
  100  -- Allow 100 devices for demo store
) ON CONFLICT (id) DO UPDATE SET
  status = 'active',
  max_devices = 100,
  updated_at = NOW();

-- =============================================================================
-- 5. Also update by code in case id changed
-- =============================================================================
UPDATE platform.stores
SET status = 'active', max_devices = 100, updated_at = NOW()
WHERE code = 'DEMO001';

-- =============================================================================
-- 6. Verification query (for logging)
-- =============================================================================
DO $$
DECLARE
  enrollment_count INTEGER;
  store_status TEXT;
BEGIN
  SELECT COUNT(*) INTO enrollment_count
  FROM pos_device_enrollments
  WHERE code IN ('SM-DEMO01', 'SM-DEMO02', 'DEMO001');

  SELECT status INTO store_status
  FROM platform.stores
  WHERE code = 'DEMO001';

  RAISE NOTICE 'GO-LIVE: Created % demo enrollment codes, store status: %', enrollment_count, store_status;
END $$;

COMMIT;
