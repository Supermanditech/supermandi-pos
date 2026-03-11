-- Migration: 181_scale_a2_net_content_fields
-- SCALE-A2: Add net_content_value and net_content_unit fields
-- Legal Metrology Act compliance — net quantity declaration on packaged goods

ALTER TABLE catalog.products
  ADD COLUMN IF NOT EXISTS net_content_value NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS net_content_unit VARCHAR(10);

COMMENT ON COLUMN catalog.products.net_content_value IS 'Net content per unit (e.g. 500 for 500g). Legal Metrology Act compliance.';
COMMENT ON COLUMN catalog.products.net_content_unit IS 'Unit for net content: g, kg, ml, l, pcs';

-- Also add to supplier_products for supplier-submitted content data
ALTER TABLE catalog.supplier_products
  ADD COLUMN IF NOT EXISTS net_content_value NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS net_content_unit VARCHAR(10);

COMMENT ON COLUMN catalog.supplier_products.net_content_value IS 'Net content per unit (e.g. 500 for 500g). Legal Metrology Act compliance.';
COMMENT ON COLUMN catalog.supplier_products.net_content_unit IS 'Unit for net content: g, kg, ml, l, pcs';
