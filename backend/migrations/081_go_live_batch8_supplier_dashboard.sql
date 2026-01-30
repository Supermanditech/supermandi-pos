-- GO-LIVE Batch 8: Supplier Web Dashboard improvements
-- Migration 081

BEGIN;

-- =============================================================================
-- GO-LIVE-029: Add shipment date fields to purchase_orders
-- =============================================================================

ALTER TABLE orders.purchase_orders
  ADD COLUMN IF NOT EXISTS shipment_date DATE,
  ADD COLUMN IF NOT EXISTS expected_delivery_date DATE;

COMMENT ON COLUMN orders.purchase_orders.shipment_date IS
'GO-LIVE-029: Date when order was shipped';

COMMENT ON COLUMN orders.purchase_orders.expected_delivery_date IS
'GO-LIVE-029: Expected delivery date';

-- =============================================================================
-- GO-LIVE-030: Order communication/notes table
-- =============================================================================

CREATE TABLE IF NOT EXISTS orders.order_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders.purchase_orders(id) ON DELETE CASCADE,
  author_type VARCHAR(20) NOT NULL CHECK (author_type IN ('supplier', 'retailer', 'system')),
  author_id UUID,
  author_name VARCHAR(200),
  message TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,  -- Internal notes not visible to other party
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_notes_order_id
  ON orders.order_notes(order_id, created_at DESC);

COMMENT ON TABLE orders.order_notes IS
'GO-LIVE-030: Order communication channel between suppliers and retailers';

-- =============================================================================
-- GO-LIVE-031: Add order references to payouts
-- =============================================================================

-- Create payout_order_items table to track which orders contributed to each payout
CREATE TABLE IF NOT EXISTS supplier.payout_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID NOT NULL,  -- Reference to payouts table
  order_id UUID NOT NULL REFERENCES orders.purchase_orders(id),
  amount_paise BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payout_order_items_payout_id
  ON supplier.payout_order_items(payout_id);

CREATE INDEX IF NOT EXISTS idx_payout_order_items_order_id
  ON supplier.payout_order_items(order_id);

COMMENT ON TABLE supplier.payout_order_items IS
'GO-LIVE-031: Tracks which orders contributed to each supplier payout';

COMMIT;
