-- STG-009: Add pending_mrp column to supplier_products
-- The pending_purchase_price column was added in migration 146 but pending_mrp was missed.
-- Both are needed for the T-147 price-change-pending workflow.

ALTER TABLE catalog.supplier_products
  ADD COLUMN IF NOT EXISTS pending_mrp BIGINT;

COMMENT ON COLUMN catalog.supplier_products.pending_mrp IS
  'T-147/STG-009: MRP pending admin approval (in paise). Set alongside price_change_pending.';
