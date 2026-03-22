-- GCP-STG-0351: Add billing_model column to orders.purchase_orders
-- orders.ts:267 INSERT writes billing_model but no migration ever created it.
-- Migration 196 added it to catalog.supplier_products only.
-- Migration 208 tried to update a CHECK constraint on purchase_orders but silently failed
-- because the column didn't exist (wrapped in EXCEPTION WHEN OTHERS THEN NULL).
-- ROLLBACK: ALTER TABLE orders.purchase_orders DROP COLUMN IF EXISTS billing_model;

ALTER TABLE orders.purchase_orders
  ADD COLUMN IF NOT EXISTS billing_model VARCHAR(30) DEFAULT 'SUPERMANDI_PRINCIPAL';

-- Drop the constraint that migration 208 may have partially created
ALTER TABLE orders.purchase_orders DROP CONSTRAINT IF EXISTS chk_po_billing_model;
ALTER TABLE orders.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_billing_model_check;

-- Add clean CHECK constraint
ALTER TABLE orders.purchase_orders
  ADD CONSTRAINT chk_po_billing_model
  CHECK (billing_model IN ('SUPERMANDI_PRINCIPAL', 'DIRECT_SUPPLIER'));
