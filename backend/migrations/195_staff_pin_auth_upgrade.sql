-- Migration 195: Staff PIN auth upgrade
-- V3-SESSION-025 + V3-BIZ-026: Owner/staff PIN auth model
-- Adds: pin_lookup_hash for PIN-only login, owner_user_id, durable lockout, audit columns
-- Makes phone nullable (no longer POS login identifier)
-- Adds unique PIN per store constraint
-- ROLLBACK: ALTER TABLE platform.store_staff DROP COLUMN IF EXISTS pin_lookup_hash; ALTER TABLE platform.store_staff DROP COLUMN IF EXISTS owner_user_id; ALTER TABLE platform.store_staff DROP COLUMN IF EXISTS updated_at; ALTER TABLE platform.store_staff DROP COLUMN IF EXISTS last_login_at; ALTER TABLE platform.store_staff DROP COLUMN IF EXISTS last_failed_login_at; ALTER TABLE platform.store_staff DROP COLUMN IF EXISTS failed_login_count; ALTER TABLE platform.store_staff DROP COLUMN IF EXISTS locked_until; ALTER TABLE platform.store_staff DROP COLUMN IF EXISTS is_owner;

BEGIN;

-- PIN lookup hash for indexed store-scoped unique PIN login
ALTER TABLE platform.store_staff
  ADD COLUMN IF NOT EXISTS pin_lookup_hash TEXT;

-- Owner link: if this staff identity represents the store owner
ALTER TABLE platform.store_staff
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id);

-- Flag: is this the owner's POS identity?
ALTER TABLE platform.store_staff
  ADD COLUMN IF NOT EXISTS is_owner BOOLEAN NOT NULL DEFAULT FALSE;

-- Audit/lockout columns
ALTER TABLE platform.store_staff
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE platform.store_staff
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE platform.store_staff
  ADD COLUMN IF NOT EXISTS last_failed_login_at TIMESTAMPTZ;
ALTER TABLE platform.store_staff
  ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE platform.store_staff
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- Make phone nullable (PIN is now the login identifier, phone is optional profile)
ALTER TABLE platform.store_staff
  ALTER COLUMN phone DROP NOT NULL;

-- Unique PIN per store (only for active staff with a pin_lookup_hash)
CREATE UNIQUE INDEX IF NOT EXISTS store_staff_store_pin_uq
  ON platform.store_staff(store_id, pin_lookup_hash)
  WHERE pin_lookup_hash IS NOT NULL AND is_active = true;

-- Index for PIN-only login lookup
CREATE INDEX IF NOT EXISTS store_staff_pin_lookup_idx
  ON platform.store_staff(store_id, pin_lookup_hash, is_active);

-- Owner identity per store (at most one owner per store)
CREATE UNIQUE INDEX IF NOT EXISTS store_staff_owner_uq
  ON platform.store_staff(store_id)
  WHERE is_owner = true AND is_active = true;

COMMIT;
