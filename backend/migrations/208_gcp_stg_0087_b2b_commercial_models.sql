-- ROLLBACK: ALTER TABLE catalog.supplier_products DROP COLUMN IF EXISTS billing_model; DROP TABLE IF EXISTS invoicing.platform_fees;
-- GCP-STG-0087: B2B Commercial Models (DIRECT_SUPPLIER + SUPERMANDI_PRINCIPAL)
-- Adds billing_model enum on supplier_products and platform_fees tracking table

-- 1. Per-SKU billing model on supplier_products
--    SUPERMANDI_PRINCIPAL = SuperMandi buys from supplier, resells to retailer (default)
--    DIRECT_SUPPLIER = Supplier invoices retailer directly, SuperMandi collects platform fee
ALTER TABLE catalog.supplier_products ADD COLUMN IF NOT EXISTS billing_model VARCHAR(30) DEFAULT 'SUPERMANDI_PRINCIPAL'
  CHECK (billing_model IN ('SUPERMANDI_PRINCIPAL', 'DIRECT_SUPPLIER'));

-- 2. Platform fees table — tracks SuperMandi's commission per order for DIRECT_SUPPLIER model
CREATE TABLE IF NOT EXISTS invoicing.platform_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  invoice_id UUID REFERENCES invoicing.invoices(id),
  commission_invoice_id UUID REFERENCES invoicing.invoices(id),
  supplier_id UUID NOT NULL,
  store_id UUID NOT NULL,
  billing_model VARCHAR(30) NOT NULL DEFAULT 'DIRECT_SUPPLIER',
  order_subtotal_minor BIGINT NOT NULL DEFAULT 0,
  platform_fee_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  platform_fee_minor BIGINT NOT NULL DEFAULT 0,
  gst_on_fee_minor BIGINT NOT NULL DEFAULT 0,
  net_supplier_payout_minor BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'invoiced', 'settled', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_platform_fees_order ON invoicing.platform_fees (order_id);
CREATE INDEX IF NOT EXISTS idx_platform_fees_supplier ON invoicing.platform_fees (supplier_id, status);
CREATE INDEX IF NOT EXISTS idx_platform_fees_store ON invoicing.platform_fees (store_id);

-- 3. Update purchase_orders billing_model constraint to accept both values
-- (Column already exists from migration 196 but may have tighter constraints)
DO $$ BEGIN
  ALTER TABLE orders.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_billing_model_check;
  ALTER TABLE orders.purchase_orders ADD CONSTRAINT purchase_orders_billing_model_check
    CHECK (billing_model IS NULL OR billing_model IN ('SUPERMANDI_PRINCIPAL', 'DIRECT_SUPPLIER'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
