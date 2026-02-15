-- Migration: 141_t144_batch_lot_expiry
-- T-144: Batch/lot number and expiry date tracking on purchase order items
-- Enables FMCG expiry tracking and batch traceability for GRN
-- Added to orders.purchase_order_items (line items for purchase orders)
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- orders.purchase_order_items — batch number and expiry date
-- =============================================================================
ALTER TABLE orders.purchase_order_items
  ADD COLUMN IF NOT EXISTS batch_number VARCHAR(100);

ALTER TABLE orders.purchase_order_items
  ADD COLUMN IF NOT EXISTS expiry_date DATE;

COMMENT ON COLUMN orders.purchase_order_items.batch_number IS
  'Manufacturer batch/lot number for traceability (e.g., "LOT-2026-001")';
COMMENT ON COLUMN orders.purchase_order_items.expiry_date IS
  'Product expiry/best-before date for this batch. Used for FEFO (First Expiry First Out) management.';

-- Index for expiry tracking (find items expiring soon)
CREATE INDEX IF NOT EXISTS idx_po_items_expiry
  ON orders.purchase_order_items (expiry_date)
  WHERE expiry_date IS NOT NULL;

-- Index for batch lookup
CREATE INDEX IF NOT EXISTS idx_po_items_batch
  ON orders.purchase_order_items (batch_number)
  WHERE batch_number IS NOT NULL;

COMMIT;
