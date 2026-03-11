-- SA-P1-003: Configurable max outstanding dues limit per store
-- NULL = no limit enforced

ALTER TABLE platform.stores
  ADD COLUMN IF NOT EXISTS max_outstanding_dues_paise BIGINT DEFAULT NULL;

COMMENT ON COLUMN platform.stores.max_outstanding_dues_paise IS 'SA-P1-003: Max total outstanding dues in paise (NULL = no limit)';
