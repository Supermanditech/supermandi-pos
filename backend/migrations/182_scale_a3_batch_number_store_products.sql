-- Migration: 182_scale_a3_batch_number_store_products
-- SCALE-A3: Add batch_number to store_products for FEFO tracking
-- batch_number currently only exists on purchase_order_items.
-- Store-level tracking needed so SCALE-C1 can capture batch on stock-in
-- and SCALE-C3 can apply FEFO (First Expired First Out) rotation logic.
--
-- AUD-010: expiry_date ownership note —
--   expiry_date was added to catalog.store_products in migration 156
--   (156_t303_t316_ai_automation_schema.sql) via ALTER TABLE ADD COLUMN IF NOT EXISTS.
--   This migration adds the sibling batch_number column to complete the FEFO pair.
--   Together batch_number + expiry_date enable SCALE-C FEFO sort and expiry alerts.

ALTER TABLE catalog.store_products
  ADD COLUMN IF NOT EXISTS batch_number VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_store_products_batch
  ON catalog.store_products(store_id, batch_number)
  WHERE batch_number IS NOT NULL;

COMMENT ON COLUMN catalog.store_products.batch_number IS 'Active batch number for FEFO tracking. Updated on stock-in.';
