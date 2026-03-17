-- AUDIT-007: SuperAdmin margin control on supplier products
-- ROLLBACK: ALTER TABLE catalog.supplier_products DROP COLUMN IF EXISTS admin_margin_pct, DROP COLUMN IF EXISTS admin_margin_fixed_minor, DROP COLUMN IF EXISTS admin_retail_price_minor, DROP COLUMN IF EXISTS admin_approved_at;

-- % margin (e.g., 15 means 15% markup on purchase_price)
ALTER TABLE catalog.supplier_products
  ADD COLUMN IF NOT EXISTS admin_margin_pct NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS admin_margin_fixed_minor INTEGER,
  ADD COLUMN IF NOT EXISTS admin_retail_price_minor INTEGER,
  ADD COLUMN IF NOT EXISTS admin_approved_at TIMESTAMPTZ;

-- Computed retail price: purchase_price + margin
-- If admin_margin_pct is set: retail = purchase_price * (1 + margin_pct/100)
-- If admin_margin_fixed_minor is set: retail = purchase_price + fixed
-- admin_retail_price_minor stores the final computed value

COMMENT ON COLUMN catalog.supplier_products.admin_margin_pct IS 'SuperAdmin % margin (e.g., 15.00 = 15%)';
COMMENT ON COLUMN catalog.supplier_products.admin_margin_fixed_minor IS 'SuperAdmin fixed margin in paise';
COMMENT ON COLUMN catalog.supplier_products.admin_retail_price_minor IS 'Final retail price after margin (paise)';
COMMENT ON COLUMN catalog.supplier_products.admin_approved_at IS 'When SuperAdmin approved/published this SKU';
