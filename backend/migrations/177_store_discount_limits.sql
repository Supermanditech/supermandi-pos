-- SA-P0-002: Store-level maximum discount percentage limit
-- Default 100.00 means no restriction (full discount allowed)
ALTER TABLE platform.stores ADD COLUMN IF NOT EXISTS max_discount_percent NUMERIC(5,2) DEFAULT 100.00;
COMMENT ON COLUMN platform.stores.max_discount_percent IS 'SA-P0-002: Maximum allowed discount percentage (0-100)';
