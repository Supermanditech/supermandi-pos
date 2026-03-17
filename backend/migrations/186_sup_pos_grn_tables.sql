-- Migration: 186_sup_pos_grn_tables
-- SUP-POS-011: Create order_receives and order_receive_items tables for GRN flow
-- Safe to run multiple times (idempotent)
-- ROLLBACK: DROP TABLE IF EXISTS orders.order_receive_items; DROP TABLE IF EXISTS orders.order_receives;

BEGIN;

-- =============================================================================
-- TABLE: orders.order_receives
-- A single GRN (Goods Receive Note) event against a purchase order.
-- One purchase order can have multiple partial receives.
-- =============================================================================
CREATE TABLE IF NOT EXISTS orders.order_receives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- FK to the purchase order being received
  purchase_order_id UUID NOT NULL REFERENCES orders.purchase_orders(id) ON DELETE CASCADE,

  -- Notes from the receiver (POS operator)
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for looking up receives by purchase order
CREATE INDEX IF NOT EXISTS idx_order_receives_po
  ON orders.order_receives(purchase_order_id, created_at DESC);

-- =============================================================================
-- TABLE: orders.order_receive_items
-- Individual line items within a GRN receive event.
-- Tracks how many units of each order item were received in this batch.
-- =============================================================================
CREATE TABLE IF NOT EXISTS orders.order_receive_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- FK to the receive record
  receive_id UUID NOT NULL REFERENCES orders.order_receives(id) ON DELETE CASCADE,

  -- FK to the purchase order item
  order_item_id UUID NOT NULL REFERENCES orders.purchase_order_items(id) ON DELETE CASCADE,

  -- How many units were received in this batch
  quantity_received INTEGER NOT NULL,

  -- Optional notes per item
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_receive_item_qty CHECK (quantity_received > 0)
);

-- Index for looking up receive items by receive record
CREATE INDEX IF NOT EXISTS idx_order_receive_items_receive
  ON orders.order_receive_items(receive_id);

-- Index for looking up all receives for a specific order item
CREATE INDEX IF NOT EXISTS idx_order_receive_items_order_item
  ON orders.order_receive_items(order_item_id);

COMMIT;
