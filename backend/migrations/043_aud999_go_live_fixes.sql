-- Migration 043: AUD-999 Go-Live Fixes
-- Addresses:
--   AUD-075-B: Persist reEnrolled flag in pos_devices
--   AUD-075-A: Add constraint for storeId consistency
--   AUD-077-C: Add sync reconciliation tracking

BEGIN;

-- =============================================================================
-- AUD-075-B: Add re_enrolled column to pos_devices
-- Tracks whether a device was re-enrolled (recovered) vs fresh enrollment
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_devices' AND column_name = 're_enrolled'
  ) THEN
    ALTER TABLE pos_devices ADD COLUMN re_enrolled BOOLEAN NOT NULL DEFAULT FALSE;
    COMMENT ON COLUMN pos_devices.re_enrolled IS 'AUD-075-B: True if device was re-enrolled (recovery/re-use scenario)';
  END IF;
END $$;

-- =============================================================================
-- AUD-075-A: Add re_enrolled_at timestamp for audit
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_devices' AND column_name = 're_enrolled_at'
  ) THEN
    ALTER TABLE pos_devices ADD COLUMN re_enrolled_at TIMESTAMPTZ NULL;
    COMMENT ON COLUMN pos_devices.re_enrolled_at IS 'AUD-075-A: Timestamp of most recent re-enrollment';
  END IF;
END $$;

-- =============================================================================
-- AUD-075-A: Add fingerprint column for device identity tracking
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_devices' AND column_name = 'device_fingerprint'
  ) THEN
    ALTER TABLE pos_devices ADD COLUMN device_fingerprint TEXT NULL;
    COMMENT ON COLUMN pos_devices.device_fingerprint IS 'AUD-075-A: Unique device hardware fingerprint for identity tracking';
    CREATE INDEX IF NOT EXISTS idx_pos_devices_fingerprint ON pos_devices(device_fingerprint) WHERE device_fingerprint IS NOT NULL;
  END IF;
END $$;

-- =============================================================================
-- AUD-077-C: Add inventory_sync_status column for reconciliation tracking
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_devices' AND column_name = 'inventory_sync_status'
  ) THEN
    ALTER TABLE pos_devices ADD COLUMN inventory_sync_status TEXT DEFAULT 'synced';
    COMMENT ON COLUMN pos_devices.inventory_sync_status IS 'AUD-077-C: Tracks inventory sync status (synced, drift_detected, reconciling)';
  END IF;
END $$;

-- =============================================================================
-- PAYMENTS: Ensure store_id column exists (ensureSchema.ts adds it at runtime,
-- but migration 040 does not include it)
-- =============================================================================
ALTER TABLE payments ADD COLUMN IF NOT EXISTS store_id TEXT NULL;

-- PAYMENTS: Ensure payments table has proper indexes for SuperAdmin dashboard
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_store_id_created ON payments(store_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payments_mode ON payments(mode);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- =============================================================================
-- COLLECTIONS: Ensure collections table has proper indexes
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_collections_store_id_created ON collections(store_id, created_at);
CREATE INDEX IF NOT EXISTS idx_collections_mode ON collections(mode);
CREATE INDEX IF NOT EXISTS idx_collections_status ON collections(status);

COMMIT;
