-- SM-019: Add BNPL/Credit columns to platform.stores

-- BNPL settings per store
ALTER TABLE platform.stores
  ADD COLUMN IF NOT EXISTS bnpl_enabled BOOLEAN DEFAULT FALSE;

ALTER TABLE platform.stores
  ADD COLUMN IF NOT EXISTS bnpl_credit_limit INTEGER DEFAULT 5000000;  -- Default 50k

ALTER TABLE platform.stores
  ADD COLUMN IF NOT EXISTS bnpl_max_days INTEGER DEFAULT 7;

-- Credit settings per store
ALTER TABLE platform.stores
  ADD COLUMN IF NOT EXISTS credit_enabled BOOLEAN DEFAULT FALSE;

ALTER TABLE platform.stores
  ADD COLUMN IF NOT EXISTS credit_limit INTEGER DEFAULT 0;
