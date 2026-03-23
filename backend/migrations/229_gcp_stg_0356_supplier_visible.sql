-- GCP-STG-0356: Add supplier_visible toggle per SKU
-- When supplier_visible = false (default), supplier identity is hidden in BUY catalog
-- for SUPERMANDI_PRINCIPAL billing model products.
-- ROLLBACK: ALTER TABLE catalog.supplier_products DROP COLUMN IF EXISTS supplier_visible;

ALTER TABLE catalog.supplier_products
  ADD COLUMN IF NOT EXISTS supplier_visible BOOLEAN DEFAULT false;

COMMENT ON COLUMN catalog.supplier_products.supplier_visible
  IS 'GCP-STG-0356: When false, supplier identity hidden from retailer in BUY catalog (SUPERMANDI_PRINCIPAL model)';
