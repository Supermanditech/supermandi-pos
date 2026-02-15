-- Migration: 142_t145_purchase_cart_drafts
-- T-145: Purchase cart drafts table
-- Stores in-progress purchase cart state per store+device
-- Allows retailers to save purchase carts and resume later
-- cart_data JSONB holds the full cart state (items, quantities, supplier, notes)
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- TABLE: orders.purchase_cart_drafts
-- In-progress purchase cart state per store + device
-- =============================================================================
CREATE TABLE IF NOT EXISTS orders.purchase_cart_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Store isolation
  store_id UUID NOT NULL REFERENCES platform.stores(id),

  -- Device that owns this draft (nullable for web-based carts)
  device_id UUID,

  -- Cart state as JSONB (items, quantities, supplier selection, notes, etc.)
  cart_data JSONB NOT NULL DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One active draft per store + device
  CONSTRAINT ux_purchase_cart_store_device UNIQUE (store_id, device_id)
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_purchase_cart_drafts_updated_at ON orders.purchase_cart_drafts;
CREATE TRIGGER update_purchase_cart_drafts_updated_at
  BEFORE UPDATE ON orders.purchase_cart_drafts
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- Store lookup
CREATE INDEX IF NOT EXISTS idx_purchase_cart_drafts_store
  ON orders.purchase_cart_drafts (store_id);

COMMENT ON TABLE orders.purchase_cart_drafts IS
  'In-progress purchase cart drafts. One active draft per store+device. Cart state stored as JSONB.';

COMMIT;
