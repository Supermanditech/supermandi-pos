-- GCP-STG-0297: Add description column to catalog.supplier_products
-- Code already references this field but column was never created
-- ROLLBACK: ALTER TABLE catalog.supplier_products DROP COLUMN IF EXISTS description;

ALTER TABLE catalog.supplier_products
  ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN catalog.supplier_products.description IS
  'Product description from supplier catalog. Optional free-text.';
