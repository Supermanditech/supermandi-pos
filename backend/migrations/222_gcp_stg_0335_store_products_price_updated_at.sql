-- GCP-STG-0335: Add price_updated_at column to catalog.store_products
-- ROLLBACK: ALTER TABLE catalog.store_products DROP COLUMN IF EXISTS price_updated_at; DROP INDEX IF EXISTS idx_store_products_price_updated;
-- Enables Last-Write-Wins guard on price update endpoints (POS + Retailer Admin)
-- When two clients update the same product price simultaneously, the server
-- rejects stale writes (409) instead of silently overwriting.

ALTER TABLE catalog.store_products
  ADD COLUMN IF NOT EXISTS price_updated_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN catalog.store_products.price_updated_at
  IS 'GCP-STG-0335: Timestamp of last price change, used for LWW conflict detection';

-- Index for freshness queries that include price changes
CREATE INDEX CONCURRENTLY IF NOT EXISTS store_products_price_updated_at_idx
  ON catalog.store_products (store_id, price_updated_at)
  WHERE is_active = true AND price_updated_at IS NOT NULL;
