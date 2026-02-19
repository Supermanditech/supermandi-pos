-- Migration: 166_add_enrollment_code_hash
-- #404: Add enrollment_code_hash column to pos_device_enrollments
--
-- Problem: enroll.ts queries WHERE enrollment_code_hash = $1 but column doesn't exist.
-- The column was only in scripts/migrations/prov-001-enhance-devices.sql (provisioning),
-- never in the automated migration pipeline.
--
-- This migration:
--   1. Adds enrollment_code_hash column
--   2. Populates it from existing code values using SHA256
--   3. Creates trigger to auto-compute hash on INSERT/UPDATE
--   4. Creates unique index for fast lookup
--   5. Re-creates the composite index from migration 165 (which may have failed)
--
-- Safe: IF NOT EXISTS + DO $$ exception handlers
-- Requires: pgcrypto extension (for digest function)

BEGIN;

-- Ensure pgcrypto is available (needed for digest/SHA256)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Step 1: Add enrollment_code_hash column
ALTER TABLE pos_device_enrollments
  ADD COLUMN IF NOT EXISTS enrollment_code_hash TEXT;

-- Step 2: Populate hash from existing code values
-- SHA256 hash of the code, hex-encoded (matches backend hashCode() function:
--   createHash("sha256").update(code).digest("hex")
-- )
UPDATE pos_device_enrollments
  SET enrollment_code_hash = encode(digest(code, 'sha256'), 'hex')
  WHERE enrollment_code_hash IS NULL AND code IS NOT NULL;

-- Step 3: Trigger to auto-compute hash on INSERT/UPDATE
-- Ensures all future INSERTs automatically get the hash without code changes
CREATE OR REPLACE FUNCTION trg_enrollment_code_hash()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NOT NULL THEN
    NEW.enrollment_code_hash := encode(digest(NEW.code, 'sha256'), 'hex');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enrollment_code_hash_insert ON pos_device_enrollments;
CREATE TRIGGER trg_enrollment_code_hash_insert
  BEFORE INSERT OR UPDATE OF code ON pos_device_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION trg_enrollment_code_hash();

-- Step 4: Unique index on enrollment_code_hash for fast enrollment lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollments_code_hash
  ON pos_device_enrollments (enrollment_code_hash);

-- Step 5: Composite index (store_id, enrollment_code_hash) for admin dashboard
-- This was attempted in migration 165 but may have failed due to missing column
CREATE INDEX IF NOT EXISTS idx_enrollments_store_code_hash
  ON pos_device_enrollments (store_id, enrollment_code_hash);

COMMIT;
