-- Migration: 227_gcp_stg_0387_poi_quantity_unit
-- GCP-STG-0387: Add quantity_unit to purchase_order_items to prevent GRN double-expansion
-- BUY checkout pre-expands qty (cartons×caseSize→PCS) and marks it 'BASE'.
-- GRN checks this field: if 'BASE', skip multiplication; if 'PROCUREMENT', multiply by procurementPackQty.
-- Safe to run multiple times (idempotent via IF NOT EXISTS pattern)
-- ROLLBACK: ALTER TABLE orders.purchase_order_items DROP COLUMN IF EXISTS quantity_unit;

BEGIN;

-- Add quantity_unit column — defaults to 'BASE' since all existing orders have pre-expanded quantities
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'orders'
      AND table_name = 'purchase_order_items'
      AND column_name = 'quantity_unit'
  ) THEN
    ALTER TABLE orders.purchase_order_items
      ADD COLUMN quantity_unit VARCHAR(15) NOT NULL DEFAULT 'BASE';

    ALTER TABLE orders.purchase_order_items
      ADD CONSTRAINT chk_poi_quantity_unit CHECK (quantity_unit IN ('BASE', 'PROCUREMENT'));
  END IF;
END $$;

COMMIT;
