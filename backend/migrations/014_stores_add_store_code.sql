-- Migration: 014_stores_add_store_code
-- Adds store_code column to platform.stores and updates VIEW
-- GO-LIVE: Ensures backend routes can access store_code
-- Safe: Idempotent, additive-only
-- FIXED: DROP VIEW before recreating to allow column type changes

BEGIN;

-- Add store_code column if not exists (nullable initially for backfill)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'platform'
      AND table_name = 'stores'
      AND column_name = 'store_code'
  ) THEN
    ALTER TABLE platform.stores ADD COLUMN store_code VARCHAR(20);
    RAISE NOTICE 'Added store_code column to platform.stores';
  ELSE
    RAISE NOTICE 'store_code column already exists';
  END IF;
END $$;

-- Create unique index on store_code (if not exists)
CREATE UNIQUE INDEX IF NOT EXISTS stores_store_code_unique
  ON platform.stores (store_code) WHERE store_code IS NOT NULL;

-- Backfill store_code from existing code column where NULL
UPDATE platform.stores
SET store_code = code
WHERE store_code IS NULL AND code IS NOT NULL;

-- Add active column if not exists (for backward compat with routes expecting boolean)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'platform'
      AND table_name = 'stores'
      AND column_name = 'active'
  ) THEN
    ALTER TABLE platform.stores ADD COLUMN active BOOLEAN DEFAULT true;
    -- Backfill from status column
    UPDATE platform.stores SET active = (status = 'active');
    RAISE NOTICE 'Added active column to platform.stores';
  END IF;
END $$;

-- Add upi_vpa column if not exists (referenced by ui-status)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'platform'
      AND table_name = 'stores'
      AND column_name = 'upi_vpa'
  ) THEN
    ALTER TABLE platform.stores ADD COLUMN upi_vpa VARCHAR(100);
    RAISE NOTICE 'Added upi_vpa column to platform.stores';
  END IF;
END $$;

-- Add scan_lookup_v2_enabled column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'platform'
      AND table_name = 'stores'
      AND column_name = 'scan_lookup_v2_enabled'
  ) THEN
    ALTER TABLE platform.stores ADD COLUMN scan_lookup_v2_enabled BOOLEAN DEFAULT false;
    RAISE NOTICE 'Added scan_lookup_v2_enabled column to platform.stores';
  END IF;
END $$;

-- CRITICAL: DROP VIEW first to allow column type changes (id UUID -> TEXT)
DROP VIEW IF EXISTS public.stores;

-- Recreate VIEW with all columns
-- Use COALESCE for columns that might not exist yet
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
    COALESCE(active, status = 'active') as active,
    upi_vpa,
    scan_lookup_v2_enabled,
    created_at,
    updated_at
  FROM platform.stores;

COMMIT;
