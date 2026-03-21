-- GCP-STG-0110: Delivery terms versioning — snapshot version at PO creation time
-- ROLLBACK: ALTER TABLE orders.purchase_orders DROP COLUMN IF EXISTS delivery_terms_version;

ALTER TABLE orders.purchase_orders
  ADD COLUMN IF NOT EXISTS delivery_terms_version INT NOT NULL DEFAULT 1;

COMMENT ON COLUMN orders.purchase_orders.delivery_terms_version IS 'GCP-STG-0110: Snapshot of supplier delivery terms version at PO creation time';
