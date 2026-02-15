-- Migration: 144_t177_stock_version
-- T-177: Add stock_version column to inventory.stock_balances
-- Enables optimistic concurrency control for stock updates
-- Each stock update increments stock_version; concurrent updates detect conflicts
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- inventory.stock_balances — optimistic concurrency version counter
-- =============================================================================
ALTER TABLE inventory.stock_balances
  ADD COLUMN IF NOT EXISTS stock_version INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN inventory.stock_balances.stock_version IS
  'Optimistic concurrency control version. Incremented on every stock update. Used to detect concurrent modifications.';

COMMIT;
