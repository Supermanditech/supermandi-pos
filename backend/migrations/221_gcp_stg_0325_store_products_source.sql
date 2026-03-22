-- GCP-STG-0325: Add source column to catalog.store_products to track product origin
-- ROLLBACK: ALTER TABLE catalog.store_products DROP COLUMN IF EXISTS source;

ALTER TABLE catalog.store_products
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'manual'
  CHECK (source IN ('manual', 'csv_import', 'grn_inward', 'supplier_publish'));
