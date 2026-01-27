-- =============================================================================
-- Migration: 056_gl_aud_005_demo_device
-- GL-AUD-005: Create a stable demo device with a known token for smoke testing
--
-- This creates a pre-enrolled device that can be used for:
-- 1. Smoke testing POS APIs without going through enrollment flow
-- 2. CI/CD integration tests
-- 3. Demo/presentation scenarios
--
-- STABLE TOKEN: demo-smoke-test-token-001
--
-- Safe to run multiple times (idempotent)
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Create the stable demo device
-- =============================================================================

-- Generate a deterministic device ID for the demo device
INSERT INTO pos_devices (
  id,
  store_id,
  active,
  device_token,
  label,
  device_type,
  manufacturer,
  model,
  android_version,
  app_version,
  printing_mode,
  device_fingerprint,
  scan_lookup_v2_enabled,
  inventory_sync_status,
  created_at,
  updated_at
) VALUES (
  'demo-device-001',
  'a0000000-0000-0000-0000-000000000001',  -- Demo store ID
  TRUE,
  'demo-smoke-test-token-001',  -- STABLE TOKEN for smoke tests
  'Demo Smoke Test Device',
  'tablet',
  'Google',
  'Pixel Tablet',
  '14',
  '1.0.0-demo',
  'direct',
  'smoke-test-fingerprint',
  TRUE,
  'synced',
  NOW(),
  NOW()
) ON CONFLICT (id) DO UPDATE SET
  active = TRUE,
  device_token = 'demo-smoke-test-token-001',
  label = 'Demo Smoke Test Device',
  updated_at = NOW();

-- =============================================================================
-- 2. Create a secondary demo device for multi-device testing
-- =============================================================================
INSERT INTO pos_devices (
  id,
  store_id,
  active,
  device_token,
  label,
  device_type,
  manufacturer,
  model,
  android_version,
  app_version,
  printing_mode,
  device_fingerprint,
  scan_lookup_v2_enabled,
  inventory_sync_status,
  created_at,
  updated_at
) VALUES (
  'demo-device-002',
  'a0000000-0000-0000-0000-000000000001',
  TRUE,
  'demo-smoke-test-token-002',
  'Demo Smoke Test Device 2',
  'tablet',
  'Samsung',
  'Galaxy Tab A',
  '13',
  '1.0.0-demo',
  'bluetooth',
  'smoke-test-fingerprint-2',
  TRUE,
  'synced',
  NOW(),
  NOW()
) ON CONFLICT (id) DO UPDATE SET
  active = TRUE,
  device_token = 'demo-smoke-test-token-002',
  label = 'Demo Smoke Test Device 2',
  updated_at = NOW();

-- =============================================================================
-- 3. Verification query
-- =============================================================================
DO $$
DECLARE
  device_count INTEGER;
  store_name TEXT;
BEGIN
  SELECT COUNT(*) INTO device_count
  FROM pos_devices
  WHERE id IN ('demo-device-001', 'demo-device-002')
    AND device_token IS NOT NULL
    AND active = TRUE;

  SELECT name INTO store_name
  FROM platform.stores
  WHERE id = 'a0000000-0000-0000-0000-000000000001';

  RAISE NOTICE 'GL-AUD-005: Created % demo devices for store: %', device_count, store_name;
  RAISE NOTICE 'GL-AUD-005: Primary token: demo-smoke-test-token-001';
  RAISE NOTICE 'GL-AUD-005: Secondary token: demo-smoke-test-token-002';
END $$;

COMMIT;
