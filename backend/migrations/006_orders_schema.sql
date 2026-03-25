-- Migration: 006_orders_schema
-- ROLLBACK: DROP SCHEMA IF EXISTS orders CASCADE;
-- V3.0.9 Foundation: Orders schema with purchase orders
-- Safe to run multiple times (idempotent)

BEGIN;

-- Create orders schema
CREATE SCHEMA IF NOT EXISTS orders;

-- =============================================================================
-- TABLE: orders.order_sequences
-- Atomic PO number generation per store
-- =============================================================================
CREATE TABLE IF NOT EXISTS orders.order_sequences (
  store_id UUID PRIMARY KEY,  -- FK to platform.stores
  store_code VARCHAR(50) NOT NULL,
  current_year INTEGER NOT NULL,
  current_seq INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- TABLE: orders.purchase_orders
-- Purchase orders from stores to suppliers
-- =============================================================================
CREATE TABLE IF NOT EXISTS orders.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Order identification
  order_number VARCHAR(50) NOT NULL,

  -- Parties
  store_id UUID NOT NULL,  -- FK to platform.stores
  supplier_id UUID NOT NULL,  -- FK to supplier.suppliers

  -- Order type
  order_type VARCHAR(20) NOT NULL DEFAULT 'manual',
  source_reorder_ids UUID[],  -- V3.0.9: Array of pending_reorder IDs

  -- Status
  status VARCHAR(30) NOT NULL DEFAULT 'draft',

  -- Amounts (minor units - paise)
  subtotal INTEGER NOT NULL DEFAULT 0,
  tax_amount INTEGER NOT NULL DEFAULT 0,
  delivery_charges INTEGER NOT NULL DEFAULT 0,
  discount_amount INTEGER NOT NULL DEFAULT 0,
  total_amount INTEGER NOT NULL DEFAULT 0,

  -- Delivery
  expected_delivery_date DATE,
  actual_delivery_date DATE,
  delivery_address TEXT,

  -- Payment
  payment_status VARCHAR(20) NOT NULL DEFAULT 'pending',

  -- Notes
  store_notes TEXT,
  supplier_notes TEXT,

  -- Audit
  created_by_user_id UUID,  -- FK to auth.users

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT orders_order_number_unique UNIQUE (order_number),
  CONSTRAINT chk_po_status CHECK (
    status IN ('draft', 'submitted', 'confirmed', 'shipped', 'partial_received', 'delivered', 'cancelled')
  ),
  CONSTRAINT chk_po_order_type CHECK (
    order_type IN ('manual', 'reorder')
  ),
  CONSTRAINT chk_po_payment_status CHECK (
    payment_status IN ('pending', 'partial', 'paid')
  ),
  CONSTRAINT chk_po_amounts CHECK (
    subtotal >= 0 AND
    tax_amount >= 0 AND
    delivery_charges >= 0 AND
    discount_amount >= 0 AND
    total_amount >= 0
  )
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_orders_purchase_orders_updated_at ON orders.purchase_orders;
CREATE TRIGGER update_orders_purchase_orders_updated_at
  BEFORE UPDATE ON orders.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- Store orders lookup
CREATE INDEX IF NOT EXISTS purchase_orders_store_idx
  ON orders.purchase_orders (store_id, created_at DESC);

-- Supplier orders lookup
CREATE INDEX IF NOT EXISTS purchase_orders_supplier_idx
  ON orders.purchase_orders (supplier_id, created_at DESC);

-- Status filter
CREATE INDEX IF NOT EXISTS purchase_orders_status_idx
  ON orders.purchase_orders (status);

-- Store + status (for dashboard)
CREATE INDEX IF NOT EXISTS purchase_orders_store_status_idx
  ON orders.purchase_orders (store_id, status);

-- =============================================================================
-- TABLE: orders.purchase_order_items
-- Line items for purchase orders
-- =============================================================================
CREATE TABLE IF NOT EXISTS orders.purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  order_id UUID NOT NULL REFERENCES orders.purchase_orders(id) ON DELETE CASCADE,

  -- Product references
  supplier_product_id UUID NOT NULL,  -- FK to catalog.supplier_products
  product_id UUID NOT NULL,  -- FK to catalog.products

  -- Product info (snapshot at order time)
  product_name VARCHAR(500) NOT NULL,
  supplier_sku VARCHAR(100),
  barcode VARCHAR(100),

  -- Quantities
  ordered_quantity INTEGER NOT NULL,
  received_quantity INTEGER NOT NULL DEFAULT 0,

  -- Pricing (minor units)
  unit_price INTEGER NOT NULL,
  mrp INTEGER,
  tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  line_total INTEGER NOT NULL,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_order_item_bounds CHECK (
    ordered_quantity > 0 AND
    received_quantity >= 0 AND
    received_quantity <= ordered_quantity AND
    unit_price >= 0 AND
    (mrp IS NULL OR mrp >= 0) AND
    tax_rate >= 0 AND tax_rate <= 100 AND
    discount_percent >= 0 AND discount_percent <= 100 AND
    line_total >= 0
  ),
  CONSTRAINT chk_order_item_status CHECK (
    status IN ('pending', 'partial', 'received', 'rejected')
  )
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_orders_purchase_order_items_updated_at ON orders.purchase_order_items;
CREATE TRIGGER update_orders_purchase_order_items_updated_at
  BEFORE UPDATE ON orders.purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- Order items lookup
CREATE INDEX IF NOT EXISTS purchase_order_items_order_idx
  ON orders.purchase_order_items (order_id);

-- Product lookup (find all orders containing a product)
CREATE INDEX IF NOT EXISTS purchase_order_items_product_idx
  ON orders.purchase_order_items (product_id);

-- =============================================================================
-- TABLE: orders.order_events
-- Audit trail for order status changes
-- =============================================================================
CREATE TABLE IF NOT EXISTS orders.order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  order_id UUID NOT NULL REFERENCES orders.purchase_orders(id) ON DELETE CASCADE,

  -- Event
  event_type VARCHAR(30) NOT NULL,
  from_status VARCHAR(30),
  to_status VARCHAR(30),

  -- Actor
  actor_type VARCHAR(20),
  actor_id UUID,
  actor_name VARCHAR(255),

  -- Details
  details JSONB,
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_order_event_type CHECK (
    event_type IN ('created', 'submitted', 'confirmed', 'shipped', 'received', 'partial_received', 'cancelled', 'note_added')
  )
);

-- Order events lookup
CREATE INDEX IF NOT EXISTS order_events_order_idx
  ON orders.order_events (order_id, created_at DESC);

-- =============================================================================
-- TABLE: orders.idempotency_keys
-- Idempotency for order operations
-- =============================================================================
CREATE TABLE IF NOT EXISTS orders.idempotency_keys (
  key VARCHAR(255) NOT NULL,
  user_id UUID NOT NULL,

  -- Request info
  route VARCHAR(255) NOT NULL,
  request_hash VARCHAR(64),

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'processing',

  -- Response cache
  response_status INTEGER,
  response_json JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,

  -- Constraints
  PRIMARY KEY (key, user_id),
  CONSTRAINT chk_orders_idempotency_status CHECK (
    status IN ('processing', 'completed', 'failed')
  )
);

-- Cleanup expired keys
CREATE INDEX IF NOT EXISTS orders_idempotency_keys_expires_idx
  ON orders.idempotency_keys (expires_at)
  WHERE status != 'processing';

-- =============================================================================
-- TABLE: orders.event_outbox
-- Outbox for publishing order events
-- =============================================================================
CREATE TABLE IF NOT EXISTS orders.event_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event identification
  event_type VARCHAR(100) NOT NULL,
  aggregate_type VARCHAR(50) NOT NULL,
  aggregate_id UUID NOT NULL,

  -- Event payload
  payload JSONB NOT NULL,

  -- Processing status
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_orders_event_outbox_retry CHECK (retry_count >= 0)
);

-- Index for unprocessed events
CREATE INDEX IF NOT EXISTS orders_event_outbox_unprocessed_idx
  ON orders.event_outbox (created_at)
  WHERE processed_at IS NULL;

COMMIT;
