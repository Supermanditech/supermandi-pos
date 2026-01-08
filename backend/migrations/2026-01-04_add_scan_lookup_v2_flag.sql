-- Add per-store / per-device flag for scan_lookup_v2 rollout.
-- Safe to run multiple times.

BEGIN;

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS scan_lookup_v2_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE pos_devices
  ADD COLUMN IF NOT EXISTS scan_lookup_v2_enabled BOOLEAN NULL;

COMMIT;
