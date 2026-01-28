-- Migration: 061_shipment_tracking_columns
-- GL-WF-039: Add shipment tracking columns to purchase_orders table
-- Also fixes order_events table to use purchase_order_id (used by supplier routes)

BEGIN;

-- =============================================================================
-- GL-WF-039: Add shipment tracking columns to purchase_orders (idempotent)
-- Note: Some columns may already exist from migrations 041 or 044
-- =============================================================================
ALTER TABLE orders.purchase_orders
  ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS carrier VARCHAR(100),
  ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS estimated_delivery TIMESTAMPTZ;

-- Add index for tracking lookup
CREATE INDEX IF NOT EXISTS idx_purchase_orders_tracking
  ON orders.purchase_orders(tracking_number)
  WHERE tracking_number IS NOT NULL;

-- =============================================================================
-- Fix order_events table: Add purchase_order_id column (code uses this)
-- The original schema has order_id, but supplier routes use purchase_order_id
-- =============================================================================
ALTER TABLE orders.order_events
  ADD COLUMN IF NOT EXISTS purchase_order_id UUID;

-- Create index for purchase_order_id lookups
CREATE INDEX IF NOT EXISTS idx_order_events_purchase_order
  ON orders.order_events(purchase_order_id)
  WHERE purchase_order_id IS NOT NULL;

-- Migrate data from order_id to purchase_order_id if order_id exists and has data
DO $$
BEGIN
  -- If order_id column exists and has data, copy to purchase_order_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'orders' AND table_name = 'order_events' AND column_name = 'order_id'
  ) THEN
    UPDATE orders.order_events
    SET purchase_order_id = order_id
    WHERE purchase_order_id IS NULL AND order_id IS NOT NULL;
  END IF;
END $$;

-- =============================================================================
-- Update order_events constraint to allow supplier status change events
-- =============================================================================
DO $$
BEGIN
  -- Drop the old constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_order_event_type'
  ) THEN
    ALTER TABLE orders.order_events DROP CONSTRAINT chk_order_event_type;
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not drop constraint: %', SQLERRM;
END $$;

-- Note: We don't re-add constraint to allow any event type for flexibility
-- The event_type column is VARCHAR(30) and can hold any value

COMMIT;
