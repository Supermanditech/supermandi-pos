-- Migration: 122_sa_p1_004_grn_excess_alerts
-- SA-P1-004: GRN Quantity Validation — Excess Receipt Alerts
-- 1. Relax chk_order_item_bounds to allow received_quantity > ordered_quantity
-- 2. Create platform.grn_excess_alerts table for SA monitoring
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- Step 1: Drop the composite CHECK that blocks excess receipt
-- Original constraint (migration 006) enforces received_quantity <= ordered_quantity
-- which silently blocks GRN when more goods arrive than ordered.
-- SA-P1-004 requires excess to be ALLOWED but FLAGGED.
-- =============================================================================
ALTER TABLE orders.purchase_order_items
  DROP CONSTRAINT IF EXISTS chk_order_item_bounds;

-- =============================================================================
-- Step 2: Recreate constraint WITHOUT the received_quantity <= ordered_quantity cap
-- All other bounds checks are preserved.
-- =============================================================================
ALTER TABLE orders.purchase_order_items
  ADD CONSTRAINT chk_order_item_bounds CHECK (
    ordered_quantity > 0 AND
    received_quantity >= 0 AND
    unit_price >= 0 AND
    (mrp IS NULL OR mrp >= 0) AND
    tax_rate >= 0 AND tax_rate <= 100 AND
    discount_percent >= 0 AND discount_percent <= 100 AND
    line_total >= 0
  );

-- =============================================================================
-- Step 3: Create GRN excess alerts table
-- One row per excess receipt event (per order item per GRN).
-- SA views and acknowledges these alerts.
-- =============================================================================
CREATE TABLE IF NOT EXISTS platform.grn_excess_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES platform.stores(id),
  purchase_order_id UUID NOT NULL,
  order_item_id UUID NOT NULL,
  receive_id UUID NOT NULL,
  product_name TEXT NOT NULL,
  ordered_qty INTEGER NOT NULL,
  total_received_qty INTEGER NOT NULL,
  excess_qty INTEGER NOT NULL,
  excess_pct NUMERIC(5,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'DISMISSED')),
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index: SA dashboard queries (open alerts by store)
CREATE INDEX IF NOT EXISTS idx_grn_excess_alerts_store
  ON platform.grn_excess_alerts(store_id, created_at DESC);

-- Partial index: fast lookup for open alerts count
CREATE INDEX IF NOT EXISTS idx_grn_excess_alerts_open
  ON platform.grn_excess_alerts(status, created_at DESC)
  WHERE status = 'OPEN';

-- =============================================================================
-- Step 4: Documentation
-- =============================================================================
COMMENT ON TABLE platform.grn_excess_alerts IS
  'SA-P1-004: Alerts created when GRN received_qty exceeds ordered_qty. SA views and acknowledges.';
COMMENT ON COLUMN platform.grn_excess_alerts.excess_pct IS
  'Percentage excess: ((total_received - ordered) / ordered) * 100';
COMMENT ON COLUMN platform.grn_excess_alerts.status IS
  'OPEN = needs SA attention, ACKNOWLEDGED = SA reviewed, DISMISSED = SA closed without action';

COMMIT;
