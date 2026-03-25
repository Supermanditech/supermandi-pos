-- Migration: 249_gcp_stg_0744_order_status_history
-- GCP-STG-0744: Order status history table for real-time tracking
-- Records every status transition for purchase orders
-- Safe to run multiple times (idempotent)
-- ROLLBACK: DROP TABLE IF EXISTS orders.order_status_history;

BEGIN;

CREATE TABLE IF NOT EXISTS orders.order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders.purchase_orders(id),
  previous_status VARCHAR(30),
  new_status VARCHAR(30) NOT NULL,
  changed_by UUID,
  changed_by_role VARCHAR(20) NOT NULL DEFAULT 'system',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order
  ON orders.order_status_history (order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_status_history_created
  ON orders.order_status_history (created_at DESC);

COMMENT ON TABLE orders.order_status_history IS
  'Tracks every status transition for purchase orders. Used for real-time tracking.';

COMMIT;
