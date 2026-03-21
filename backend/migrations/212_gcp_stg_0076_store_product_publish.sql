-- GCP-STG-0076: Selective store publishing — per-store product visibility control
-- ROLLBACK: DROP TABLE IF EXISTS catalog.store_product_exclusions;

CREATE TABLE IF NOT EXISTS catalog.store_product_exclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES platform.stores(id) ON DELETE CASCADE,
  supplier_product_id UUID NOT NULL REFERENCES catalog.supplier_products(id) ON DELETE CASCADE,
  excluded_by TEXT, -- admin user ID
  excluded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT,
  UNIQUE(store_id, supplier_product_id)
);

CREATE INDEX IF NOT EXISTS idx_spe_store ON catalog.store_product_exclusions(store_id);
CREATE INDEX IF NOT EXISTS idx_spe_product ON catalog.store_product_exclusions(supplier_product_id);

COMMENT ON TABLE catalog.store_product_exclusions IS 'GCP-STG-0076: Per-store product exclusion — products here are hidden from that store BUY catalog';
