-- Migration: 072_fix_go_live_schema
-- Fixes P0-CRITICAL blockers from Go-Live Audit
--
-- Resolves:
--   BLOCKER-001: payments.store_id missing (blocks migration 043 indexes)
--   BLOCKER-002: pos_devices missing columns (blocks migration 056 demo devices)
--
-- Safe to run multiple times (idempotent)
-- =============================================================================

BEGIN;

-- =============================================================================
-- PART 1: Fix pos_devices table (BLOCKER-002)
-- Add columns that migration 043 failed to add
-- =============================================================================

-- 1a. Add re_enrolled column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_devices' AND column_name = 're_enrolled'
  ) THEN
    ALTER TABLE pos_devices ADD COLUMN re_enrolled BOOLEAN NOT NULL DEFAULT FALSE;
    COMMENT ON COLUMN pos_devices.re_enrolled IS 'AUD-075-B: True if device was re-enrolled (recovery/re-use scenario)';
    RAISE NOTICE 'Added pos_devices.re_enrolled column';
  END IF;
END $$;

-- 1b. Add re_enrolled_at timestamp
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_devices' AND column_name = 're_enrolled_at'
  ) THEN
    ALTER TABLE pos_devices ADD COLUMN re_enrolled_at TIMESTAMPTZ NULL;
    COMMENT ON COLUMN pos_devices.re_enrolled_at IS 'AUD-075-A: Timestamp of most recent re-enrollment';
    RAISE NOTICE 'Added pos_devices.re_enrolled_at column';
  END IF;
END $$;

-- 1c. Add device_fingerprint column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_devices' AND column_name = 'device_fingerprint'
  ) THEN
    ALTER TABLE pos_devices ADD COLUMN device_fingerprint TEXT NULL;
    COMMENT ON COLUMN pos_devices.device_fingerprint IS 'AUD-075-A: Unique device hardware fingerprint for identity tracking';
    CREATE INDEX IF NOT EXISTS idx_pos_devices_fingerprint ON pos_devices(device_fingerprint) WHERE device_fingerprint IS NOT NULL;
    RAISE NOTICE 'Added pos_devices.device_fingerprint column';
  END IF;
END $$;

-- 1d. Add inventory_sync_status column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_devices' AND column_name = 'inventory_sync_status'
  ) THEN
    ALTER TABLE pos_devices ADD COLUMN inventory_sync_status TEXT DEFAULT 'synced';
    COMMENT ON COLUMN pos_devices.inventory_sync_status IS 'AUD-077-C: Tracks inventory sync status (synced, drift_detected, reconciling)';
    RAISE NOTICE 'Added pos_devices.inventory_sync_status column';
  END IF;
END $$;

-- =============================================================================
-- PART 2: Fix public.payments table (BLOCKER-001)
-- Add store_id column and backfill from related sales
-- =============================================================================

-- 2a. Add store_id column to payments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE public.payments ADD COLUMN store_id UUID;
    COMMENT ON COLUMN public.payments.store_id IS 'Store ID for analytics queries - backfilled from related sales';
    RAISE NOTICE 'Added public.payments.store_id column';
  END IF;
END $$;

-- 2b. Backfill store_id from related sales
UPDATE public.payments p
SET store_id = s.store_id
FROM public.sales s
WHERE p.sale_id = s.id AND p.store_id IS NULL;

-- 2c. Create indexes on payments table (these were the ones that failed in migration 043)
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON public.payments(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_store_id_created ON public.payments(store_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payments_mode ON public.payments(mode);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

-- =============================================================================
-- PART 3: Fix collections table indexes (from migration 043)
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_collections_store_id_created ON public.collections(store_id, created_at);
CREATE INDEX IF NOT EXISTS idx_collections_mode ON public.collections(mode);
CREATE INDEX IF NOT EXISTS idx_collections_status ON public.collections(status);

-- =============================================================================
-- PART 4: Mark failed migrations as "resolved" in schema_migrations
-- This prevents them from being re-run and failing again
-- =============================================================================
DO $$
BEGIN
  -- Insert migration 043 as completed (if not already)
  INSERT INTO schema_migrations (version, applied_at)
  VALUES ('043_aud999_go_live_fixes', NOW())
  ON CONFLICT (version) DO NOTHING;

  -- Insert migration 056 as completed (if not already) - will run demo device insert next
  INSERT INTO schema_migrations (version, applied_at)
  VALUES ('056_gl_aud_005_demo_device', NOW())
  ON CONFLICT (version) DO NOTHING;

  RAISE NOTICE 'Marked migrations 043 and 056 as completed';
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'schema_migrations table not found - skipping migration marking';
  WHEN undefined_column THEN
    RAISE NOTICE 'schema_migrations has different schema - skipping migration marking';
END $$;

-- =============================================================================
-- PART 5: Insert demo devices (from migration 056 that was blocked)
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
  'demo-device-001',
  'a0000000-0000-0000-0000-000000000001',
  TRUE,
  'demo-smoke-test-token-001',
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
  inventory_sync_status = 'synced',
  updated_at = NOW();

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
  inventory_sync_status = 'synced',
  updated_at = NOW();

-- =============================================================================
-- VERIFICATION
-- =============================================================================
DO $$
DECLARE
  payments_store_id_exists BOOLEAN;
  pos_devices_cols_exist BOOLEAN;
  demo_device_count INTEGER;
BEGIN
  -- Check payments.store_id
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'store_id'
  ) INTO payments_store_id_exists;

  -- Check pos_devices columns
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_devices' AND column_name = 'inventory_sync_status'
  ) INTO pos_devices_cols_exist;

  -- Check demo devices
  SELECT COUNT(*) INTO demo_device_count
  FROM pos_devices
  WHERE id IN ('demo-device-001', 'demo-device-002');

  RAISE NOTICE '=== Migration 072 Verification ===';
  RAISE NOTICE 'payments.store_id exists: %', payments_store_id_exists;
  RAISE NOTICE 'pos_devices.inventory_sync_status exists: %', pos_devices_cols_exist;
  RAISE NOTICE 'Demo devices created: %', demo_device_count;
  RAISE NOTICE '================================';
END $$;

COMMIT;
