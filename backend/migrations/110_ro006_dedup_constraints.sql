-- Migration: 110_ro006_dedup_constraints
-- RO-006: De-duplication Guarantees (DB-Level Constraints)
-- Adds created_via column and partial unique index on gst_number
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- STEP 1: Add created_via column to platform.stores
-- Tracks registration source: PORTAL, POS_DEVICE, POS_MOBILE, ADMIN
-- =============================================================================
ALTER TABLE platform.stores
  ADD COLUMN IF NOT EXISTS created_via VARCHAR(20) NOT NULL DEFAULT 'ADMIN';

-- Add CHECK constraint for valid values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_stores_created_via'
  ) THEN
    ALTER TABLE platform.stores
      ADD CONSTRAINT chk_stores_created_via CHECK (
        created_via IN ('PORTAL', 'POS_DEVICE', 'POS_MOBILE', 'ADMIN')
      );
  END IF;
END $$;

-- =============================================================================
-- STEP 2: Partial unique index on gst_number
-- The 'gstin' column (migration 102) already has ux_stores_gstin.
-- The older 'gst_number' column (migration 080) needs a unique index too
-- since deduplication.ts queries gst_number.
-- =============================================================================

-- First, handle any existing duplicates by NULLing older entries
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'platform' AND table_name = 'stores' AND column_name = 'gst_number'
  ) THEN
    -- Deduplicate: keep newest store for each gst_number, NULL the rest
    WITH duplicates AS (
      SELECT id, gst_number,
        ROW_NUMBER() OVER (PARTITION BY UPPER(gst_number) ORDER BY created_at DESC) as rn
      FROM platform.stores
      WHERE gst_number IS NOT NULL AND TRIM(gst_number) != ''
    )
    UPDATE platform.stores s
    SET gst_number = NULL
    FROM duplicates d
    WHERE s.id = d.id AND d.rn > 1;
  END IF;
END $$;

-- Create partial unique index (allows multiple NULLs and empty strings)
CREATE UNIQUE INDEX IF NOT EXISTS ux_stores_gst_number
  ON platform.stores (UPPER(gst_number))
  WHERE gst_number IS NOT NULL AND TRIM(gst_number) != '';

-- =============================================================================
-- STEP 3: Update public.stores VIEW to include created_via
-- Must DROP + CREATE because REPLACE cannot add columns
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
    gstin,
    gst_number,
    owner_name,
    document_urls,
    application_id,
    created_via,
    created_at,
    updated_at
  FROM platform.stores;

-- =============================================================================
-- STEP 4: Verification
-- =============================================================================
DO $$
DECLARE
  v_col_exists BOOLEAN;
  v_idx_exists BOOLEAN;
BEGIN
  -- Verify created_via column exists
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'platform' AND table_name = 'stores' AND column_name = 'created_via'
  ) INTO v_col_exists;

  IF NOT v_col_exists THEN
    RAISE EXCEPTION 'RO-006 VERIFICATION FAILED: created_via column not found';
  END IF;

  -- Verify unique index on gst_number exists
  SELECT EXISTS(
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'platform' AND tablename = 'stores' AND indexname = 'ux_stores_gst_number'
  ) INTO v_idx_exists;

  IF NOT v_idx_exists THEN
    RAISE EXCEPTION 'RO-006 VERIFICATION FAILED: ux_stores_gst_number index not found';
  END IF;

  RAISE NOTICE 'RO-006 VERIFICATION PASSED: created_via column + gst_number unique index';
END $$;

COMMIT;
