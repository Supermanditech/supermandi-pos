-- Migration: 231_gcp_stg_0390_reorder_procurement_units
-- GCP-STG-0390: Add procurement unit columns to pending_reorders
-- so reorder suggestions show "Order 2 x 50kg bags" instead of "Order 100 KG"
-- ROLLBACK: ALTER TABLE reorder.pending_reorders DROP COLUMN IF EXISTS procurement_unit, DROP COLUMN IF EXISTS procurement_pack_qty, DROP COLUMN IF EXISTS base_stock_unit, DROP COLUMN IF EXISTS suggested_procurement_qty;

BEGIN;

ALTER TABLE reorder.pending_reorders
  ADD COLUMN IF NOT EXISTS procurement_unit VARCHAR(20),
  ADD COLUMN IF NOT EXISTS procurement_pack_qty NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS base_stock_unit VARCHAR(20),
  ADD COLUMN IF NOT EXISTS suggested_procurement_qty NUMERIC(12,3);

-- procurement_pack_qty must be positive when set
ALTER TABLE reorder.pending_reorders
  DROP CONSTRAINT IF EXISTS chk_pr_procurement_pack_qty_positive;
ALTER TABLE reorder.pending_reorders
  ADD CONSTRAINT chk_pr_procurement_pack_qty_positive
  CHECK (procurement_pack_qty IS NULL OR procurement_pack_qty > 0);

-- suggested_procurement_qty must be positive when set
ALTER TABLE reorder.pending_reorders
  DROP CONSTRAINT IF EXISTS chk_pr_suggested_procurement_qty_positive;
ALTER TABLE reorder.pending_reorders
  ADD CONSTRAINT chk_pr_suggested_procurement_qty_positive
  CHECK (suggested_procurement_qty IS NULL OR suggested_procurement_qty > 0);

COMMIT;
