-- Migration: 180_scale_a1_product_compliance_fields
-- SCALE-A1: Add manufacturer, country of origin, and shelf life fields
-- Legal Metrology Act compliance + FSSAI traceability

ALTER TABLE catalog.products
  ADD COLUMN IF NOT EXISTS manufacturer_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS country_of_origin VARCHAR(100),
  ADD COLUMN IF NOT EXISTS shelf_life_days INTEGER;

COMMENT ON COLUMN catalog.products.manufacturer_name IS 'Product manufacturer name (Legal Metrology Act 2009 compliance)';
COMMENT ON COLUMN catalog.products.country_of_origin IS 'Country of origin for imported goods (Consumer Protection Act)';
COMMENT ON COLUMN catalog.products.shelf_life_days IS 'Shelf life in days from manufacturing date. Used for auto-calculating expiry on stock-in.';

-- Also add to supplier_products for supplier-submitted compliance data
ALTER TABLE catalog.supplier_products
  ADD COLUMN IF NOT EXISTS manufacturer_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS country_of_origin VARCHAR(100),
  ADD COLUMN IF NOT EXISTS shelf_life_days INTEGER;

COMMENT ON COLUMN catalog.supplier_products.manufacturer_name IS 'Manufacturer name as submitted by supplier';
COMMENT ON COLUMN catalog.supplier_products.country_of_origin IS 'Country of origin as submitted by supplier';
COMMENT ON COLUMN catalog.supplier_products.shelf_life_days IS 'Shelf life in days as submitted by supplier';

-- Index for filtering by manufacturer (admin/analytics)
CREATE INDEX IF NOT EXISTS idx_products_manufacturer
  ON catalog.products (manufacturer_name)
  WHERE manufacturer_name IS NOT NULL;
