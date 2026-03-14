-- Migration: 189_khata_void_column
-- Add voided_at column to khata_entries for soft-delete void support
-- Safe to run multiple times (idempotent)
-- ROLLBACK: ALTER TABLE orders.khata_entries DROP COLUMN IF EXISTS voided_at; ALTER TABLE orders.khata_entries DROP COLUMN IF EXISTS voided_by;

BEGIN;

ALTER TABLE orders.khata_entries
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE orders.khata_entries
  ADD COLUMN IF NOT EXISTS voided_by UUID DEFAULT NULL;

COMMENT ON COLUMN orders.khata_entries.voided_at IS
  'When set, this entry is voided (soft-deleted). Running balance must be recalculated.';

COMMIT;
