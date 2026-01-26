-- Migration 047: Fix device_enrollment_events.device_id column type
-- GO-LIVE FIX: The device_id column was UUID but device IDs can be strings like 'dev_*'
-- This migration changes the column to TEXT to handle both UUID and string formats

BEGIN;

-- =============================================================================
-- FIX: Change device_id and previous_device_id from UUID to TEXT
-- This prevents "invalid input syntax for uuid" errors when logging re-enrollment
-- events for devices with string-format IDs like 'dev_92vf5mu4dfb'
-- =============================================================================

-- Step 1: Add temporary TEXT columns
ALTER TABLE public.device_enrollment_events
  ADD COLUMN IF NOT EXISTS device_id_text TEXT,
  ADD COLUMN IF NOT EXISTS previous_device_id_text TEXT;

-- Step 2: Copy existing data (convert UUID to TEXT)
UPDATE public.device_enrollment_events
SET
  device_id_text = device_id::TEXT,
  previous_device_id_text = previous_device_id::TEXT
WHERE device_id_text IS NULL OR previous_device_id_text IS NULL;

-- Step 3: Drop the old UUID columns
ALTER TABLE public.device_enrollment_events
  DROP COLUMN IF EXISTS device_id,
  DROP COLUMN IF EXISTS previous_device_id;

-- Step 4: Rename TEXT columns to original names
ALTER TABLE public.device_enrollment_events
  RENAME COLUMN device_id_text TO device_id;
ALTER TABLE public.device_enrollment_events
  RENAME COLUMN previous_device_id_text TO previous_device_id;

-- Step 5: Add index for device_id lookups
CREATE INDEX IF NOT EXISTS device_enrollment_events_device_idx
  ON public.device_enrollment_events (device_id)
  WHERE device_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.device_enrollment_events.device_id IS 'GO-LIVE FIX: Device ID as TEXT to support both UUID and string formats (dev_*)';
COMMENT ON COLUMN public.device_enrollment_events.previous_device_id IS 'GO-LIVE FIX: Previous device ID as TEXT for re-enrollment tracking';

COMMIT;
