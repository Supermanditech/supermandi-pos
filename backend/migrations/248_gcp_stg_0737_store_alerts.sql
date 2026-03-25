-- GCP-STG-0737: Store alerts table for low-stock and other automated alerts
-- ROLLBACK: DROP TABLE IF EXISTS platform.store_alerts CASCADE;

CREATE TABLE IF NOT EXISTS platform.store_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id TEXT NOT NULL REFERENCES platform.stores(id),
  alert_type TEXT NOT NULL CHECK (alert_type IN ('LOW_STOCK', 'EXPIRY_SOON', 'REORDER_DUE', 'SYSTEM')),
  product_id UUID,
  title TEXT NOT NULL,
  message TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS store_alerts_store_unread_idx
  ON platform.store_alerts (store_id, is_read) WHERE is_read = false;

CREATE INDEX IF NOT EXISTS store_alerts_store_product_type_idx
  ON platform.store_alerts (store_id, product_id, alert_type) WHERE is_read = false;

COMMENT ON TABLE platform.store_alerts IS 'GCP-STG-0737: Automated store alerts (low stock, expiry, reorder)';
