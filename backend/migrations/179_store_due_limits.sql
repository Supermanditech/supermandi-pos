-- SA-P1-003: Store due limits enforcement
-- Adds max outstanding dues limit column to stores table
ALTER TABLE platform.stores
  ADD COLUMN IF NOT EXISTS max_outstanding_dues_paise BIGINT DEFAULT NULL;
COMMENT ON COLUMN platform.stores.max_outstanding_dues_paise IS 'SA-P1-003: Max total outstanding dues in paise (NULL = no limit)';
