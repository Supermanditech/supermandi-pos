-- Migration: 135_t070_product_invoice_config
-- T-070: Invoice mode per product — configurable at supplier_product level
-- SuperAdmin can set invoice_model and HSN code per product
-- Safe to run multiple times (idempotent)

BEGIN;

-- Add invoice configuration columns to supplier_products
ALTER TABLE catalog.supplier_products
  ADD COLUMN IF NOT EXISTS invoice_model VARCHAR(20) DEFAULT 'buy_resell',
  ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,2) DEFAULT 0;

-- Add constraint for invoice_model
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_sp_invoice_model'
    AND conrelid = 'catalog.supplier_products'::regclass
  ) THEN
    ALTER TABLE catalog.supplier_products
      ADD CONSTRAINT chk_sp_invoice_model
      CHECK (invoice_model IN ('buy_resell', 'platform_fee'));
  END IF;
END
$$;

-- Add default invoice model per supplier (overridable per product)
ALTER TABLE supplier.suppliers
  ADD COLUMN IF NOT EXISTS default_invoice_model VARCHAR(20) DEFAULT 'buy_resell',
  ADD COLUMN IF NOT EXISTS default_gst_rate DECIMAL(5,2) DEFAULT 0;

COMMENT ON COLUMN catalog.supplier_products.invoice_model IS
  'Invoice model: buy_resell (SM buys, resells) or platform_fee (supplier sells, SM takes commission)';

COMMENT ON COLUMN catalog.supplier_products.hsn_code IS
  'HSN/SAC code for GST classification of this product';

COMMENT ON COLUMN catalog.supplier_products.gst_rate IS
  'GST rate percentage for this product (e.g., 5.00, 12.00, 18.00, 28.00)';

COMMIT;
