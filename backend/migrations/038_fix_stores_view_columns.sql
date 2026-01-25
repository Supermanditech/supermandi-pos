-- Migration: 038_fix_stores_view_columns
-- FIX: Migration 021 dropped active, upi_vpa, store_code, scan_lookup_v2_enabled
-- from the public.stores view. These columns are still required by POS endpoints
-- (deviceToken middleware, getStore(), ui-status) AND SuperAdmin endpoints.
--
-- Also adds V1-compatible columns needed by SuperAdmin store management:
--   address, contact_name, contact_phone, contact_email, location,
--   pos_device_id, kyc_status, upi_vpa_updated_at, upi_vpa_updated_by
--
-- Safe to run multiple times (idempotent).

BEGIN;

-- =============================================================================
-- 1. Add SuperAdmin-required columns to platform.stores (if not exist)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='platform' AND table_name='stores' AND column_name='address') THEN
    ALTER TABLE platform.stores ADD COLUMN address TEXT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='platform' AND table_name='stores' AND column_name='contact_name') THEN
    ALTER TABLE platform.stores ADD COLUMN contact_name TEXT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='platform' AND table_name='stores' AND column_name='contact_phone') THEN
    ALTER TABLE platform.stores ADD COLUMN contact_phone TEXT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='platform' AND table_name='stores' AND column_name='contact_email') THEN
    ALTER TABLE platform.stores ADD COLUMN contact_email TEXT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='platform' AND table_name='stores' AND column_name='location') THEN
    ALTER TABLE platform.stores ADD COLUMN location TEXT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='platform' AND table_name='stores' AND column_name='pos_device_id') THEN
    ALTER TABLE platform.stores ADD COLUMN pos_device_id TEXT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='platform' AND table_name='stores' AND column_name='kyc_status') THEN
    ALTER TABLE platform.stores ADD COLUMN kyc_status TEXT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='platform' AND table_name='stores' AND column_name='upi_vpa_updated_at') THEN
    ALTER TABLE platform.stores ADD COLUMN upi_vpa_updated_at TIMESTAMPTZ NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='platform' AND table_name='stores' AND column_name='upi_vpa_updated_by') THEN
    ALTER TABLE platform.stores ADD COLUMN upi_vpa_updated_by TEXT NULL;
  END IF;
END $$;

-- =============================================================================
-- 2. Backfill: ensure active=true for stores with status='active' that may have
--    been incorrectly set to false by the removed ensureSchema upi_vpa gate.
-- =============================================================================

-- Wrapped in DO block to check if column exists first
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'platform' AND table_name = 'stores' AND column_name = 'active'
  ) THEN
    UPDATE platform.stores
    SET active = TRUE
    WHERE status = 'active' AND (active IS NULL OR active = FALSE);
    RAISE NOTICE 'Backfilled active column';
  ELSE
    RAISE NOTICE 'active column does not exist yet, skipping backfill';
  END IF;
END $$;

-- =============================================================================
-- 3. Recreate view with ALL columns needed by POS + SuperAdmin.
--    Uses direct column references (no COALESCE) so view is fully updatable.
-- =============================================================================

DROP VIEW IF EXISTS public.stores;
CREATE VIEW public.stores AS
  SELECT
    id::TEXT as id,
    name,
    code,
    store_code,
    phone,
    email,
    address_line1,
    address_line2,
    city,
    state,
    pincode,
    timezone,
    currency,
    status,
    store_type,
    active,
    upi_vpa,
    scan_lookup_v2_enabled,
    address,
    contact_name,
    contact_phone,
    contact_email,
    location,
    pos_device_id,
    kyc_status,
    upi_vpa_updated_at,
    upi_vpa_updated_by,
    created_at,
    updated_at
  FROM platform.stores;

COMMIT;
