-- DR-011: Single-Store per Owner Enforcement
--
-- v2 policy: one phone number = one store. An owner user (is_owner=true)
-- cannot be linked to multiple stores. This partial unique index enforces
-- that constraint at the DB level.
--
-- NOTE: This does NOT prevent non-owner staff from being in multiple stores
-- (future multi-store staff support). Only owner accounts are restricted.

BEGIN;

-- Partial unique index: each user can own at most one store
CREATE UNIQUE INDEX IF NOT EXISTS idx_store_users_single_owner
  ON auth.store_users (user_id)
  WHERE is_owner = true AND is_active = true;

COMMIT;
