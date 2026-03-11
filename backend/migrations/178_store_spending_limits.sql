-- SA-P1-002: Store spending limits for purchase orders
-- Allows retailers to set daily and monthly spend caps on purchase orders (in paise).
-- NULL means no limit is enforced.

ALTER TABLE platform.stores
  ADD COLUMN IF NOT EXISTS daily_order_limit_paise BIGINT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS monthly_order_limit_paise BIGINT DEFAULT NULL;

COMMENT ON COLUMN platform.stores.daily_order_limit_paise IS 'SA-P1-002: Max daily purchase order spend in paise (NULL = no limit)';
COMMENT ON COLUMN platform.stores.monthly_order_limit_paise IS 'SA-P1-002: Max monthly purchase order spend in paise (NULL = no limit)';
