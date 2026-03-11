-- Migration: 181_scale_a2_net_content_fields
-- SCALE-A2: Add net content value and unit for Legal Metrology Act compliance
-- Distinct from pack_size (items per case) — net_content is per-unit weight/volume (e.g. 500g, 1L)

ALTER TABLE catalog.products
  ADD COLUMN IF NOT EXISTS net_content_value NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS net_content_unit VARCHAR(10);

COMMENT ON COLUMN catalog.products.net_content_value IS 'Net content per unit (e.g. 500 for 500g). Legal Metrology Act compliance. Distinct from pack_size.';
COMMENT ON COLUMN catalog.products.net_content_unit IS 'Unit for net content: g, kg, ml, l, pcs. Displayed as badge on product tiles.';

-- Also add to supplier_products for supplier catalog display
ALTER TABLE catalog.supplier_products
  ADD COLUMN IF NOT EXISTS net_content_value NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS net_content_unit VARCHAR(10);

COMMENT ON COLUMN catalog.supplier_products.net_content_value IS 'Net content per unit from supplier. Used in buy catalog tile display.';
COMMENT ON COLUMN catalog.supplier_products.net_content_unit IS 'Unit for net content from supplier: g, kg, ml, l, pcs.';
