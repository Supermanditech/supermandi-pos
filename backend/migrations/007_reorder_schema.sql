-- Migration: 007_reorder_schema
-- ROLLBACK: DROP SCHEMA IF EXISTS reorder CASCADE;
-- V3.0.9 Foundation: Reorder schema with policies and pending reorders
-- Safe to run multiple times (idempotent)

BEGIN;

-- Create reorder schema
CREATE SCHEMA IF NOT EXISTS reorder;

-- =============================================================================
-- TABLE: reorder.store_reorder_settings
-- Store-level reorder configuration
-- =============================================================================
CREATE TABLE IF NOT EXISTS reorder.store_reorder_settings (
  store_id UUID PRIMARY KEY,  -- FK to platform.stores

  -- Settings
  reorder_enabled BOOLEAN NOT NULL DEFAULT true,
  require_approval BOOLEAN NOT NULL DEFAULT true,
  notify_on_low_stock BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- TABLE: reorder.reorder_policies
-- Per-product reorder thresholds and preferences
-- =============================================================================
CREATE TABLE IF NOT EXISTS reorder.reorder_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  store_id UUID NOT NULL,  -- FK to platform.stores
  product_id UUID NOT NULL,  -- FK to catalog.products

  -- Thresholds
  min_stock INTEGER NOT NULL,
  target_stock INTEGER NOT NULL,

  -- Preferences
  preferred_supplier_id UUID,  -- FK to supplier.suppliers

  -- Status
  is_enabled BOOLEAN NOT NULL DEFAULT true,

  -- Audit
  created_by_user_id UUID,  -- FK to auth.users

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT reorder_policies_unique UNIQUE (store_id, product_id),
  CONSTRAINT chk_reorder_policy_bounds CHECK (
    min_stock >= 0 AND
    target_stock >= min_stock
  )
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_reorder_policies_updated_at ON reorder.reorder_policies;
CREATE TRIGGER update_reorder_policies_updated_at
  BEFORE UPDATE ON reorder.reorder_policies
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- Store policies lookup
CREATE INDEX IF NOT EXISTS reorder_policies_store_idx
  ON reorder.reorder_policies (store_id)
  WHERE is_enabled = true;

-- =============================================================================
-- TABLE: reorder.pending_reorders
-- Pending reorder suggestions awaiting approval
-- =============================================================================
CREATE TABLE IF NOT EXISTS reorder.pending_reorders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  store_id UUID NOT NULL,  -- FK to platform.stores
  product_id UUID NOT NULL,  -- FK to catalog.products

  -- Product info (snapshot)
  product_name VARCHAR(500) NOT NULL,
  barcode VARCHAR(100),

  -- Stock info
  current_stock INTEGER NOT NULL,
  min_threshold INTEGER NOT NULL,
  target_stock INTEGER NOT NULL,

  -- Suggestion
  suggested_quantity INTEGER NOT NULL,
  suggested_supplier_id UUID,  -- FK to supplier.suppliers
  suggested_supplier_name VARCHAR(255),
  suggested_unit_price INTEGER,  -- Minor units
  supplier_product_id UUID,  -- FK to catalog.supplier_products

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  dismissed_reason TEXT,

  -- Outcome
  purchase_order_id UUID,  -- FK to orders.purchase_orders

  -- Expiry
  expires_at TIMESTAMPTZ NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_pending_reorders_status CHECK (
    status IN ('pending', 'approved', 'dismissed', 'expired')
  ),
  CONSTRAINT chk_pending_reorders_quantities CHECK (
    current_stock >= 0 AND
    min_threshold >= 0 AND
    target_stock >= min_threshold AND
    suggested_quantity > 0
  )
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_pending_reorders_updated_at ON reorder.pending_reorders;
CREATE TRIGGER update_pending_reorders_updated_at
  BEFORE UPDATE ON reorder.pending_reorders
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- PARTIAL UNIQUE: Only one pending reorder per store+product
CREATE UNIQUE INDEX IF NOT EXISTS ux_pending_reorders_active
  ON reorder.pending_reorders (store_id, product_id)
  WHERE status = 'pending';

-- Store pending reorders lookup
CREATE INDEX IF NOT EXISTS pending_reorders_store_idx
  ON reorder.pending_reorders (store_id, created_at DESC)
  WHERE status = 'pending';

-- Expiry cleanup
CREATE INDEX IF NOT EXISTS pending_reorders_expires_idx
  ON reorder.pending_reorders (expires_at)
  WHERE status = 'pending';

-- =============================================================================
-- TABLE: reorder.reorder_runs
-- Log of reorder evaluation runs
-- =============================================================================
CREATE TABLE IF NOT EXISTS reorder.reorder_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  store_id UUID NOT NULL,  -- FK to platform.stores

  -- Run info
  run_type VARCHAR(20) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,

  -- Results
  evaluated_products INTEGER NOT NULL DEFAULT 0,
  created_pending INTEGER NOT NULL DEFAULT 0,
  skipped_existing INTEGER NOT NULL DEFAULT 0,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'success',
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_reorder_runs_type CHECK (
    run_type IN ('cron', 'event')
  ),
  CONSTRAINT chk_reorder_runs_status CHECK (
    status IN ('success', 'failed')
  )
);

-- Store runs lookup
CREATE INDEX IF NOT EXISTS reorder_runs_store_idx
  ON reorder.reorder_runs (store_id, created_at DESC);

-- =============================================================================
-- TABLE: reorder.idempotency_keys
-- Idempotency for reorder operations
-- =============================================================================
CREATE TABLE IF NOT EXISTS reorder.idempotency_keys (
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
  CONSTRAINT chk_reorder_idempotency_status CHECK (
    status IN ('processing', 'completed', 'failed')
  )
);

-- Cleanup expired keys
CREATE INDEX IF NOT EXISTS reorder_idempotency_keys_expires_idx
  ON reorder.idempotency_keys (expires_at)
  WHERE status != 'processing';

-- =============================================================================
-- TABLE: reorder.event_inbox
-- Inbox for processing reorder events (e.g., stock_low events)
-- =============================================================================
CREATE TABLE IF NOT EXISTS reorder.event_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event identification
  event_id UUID NOT NULL,
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
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT reorder_event_inbox_event_id_unique UNIQUE (event_id),
  CONSTRAINT chk_reorder_event_inbox_retry CHECK (retry_count >= 0)
);

-- Index for unprocessed events
CREATE INDEX IF NOT EXISTS reorder_event_inbox_unprocessed_idx
  ON reorder.event_inbox (received_at)
  WHERE processed_at IS NULL;

-- =============================================================================
-- TABLE: reorder.event_outbox
-- Outbox for publishing reorder events
-- =============================================================================
CREATE TABLE IF NOT EXISTS reorder.event_outbox (
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
  CONSTRAINT chk_reorder_event_outbox_retry CHECK (retry_count >= 0)
);

-- Index for unprocessed events
CREATE INDEX IF NOT EXISTS reorder_event_outbox_unprocessed_idx
  ON reorder.event_outbox (created_at)
  WHERE processed_at IS NULL;

-- =============================================================================
-- SEED: Demo store reorder settings
-- =============================================================================
INSERT INTO reorder.store_reorder_settings (store_id, reorder_enabled, require_approval, notify_on_low_stock)
VALUES ('a0000000-0000-0000-0000-000000000001', true, true, true)
ON CONFLICT (store_id) DO NOTHING;

-- Sample reorder policies for demo products
INSERT INTO reorder.reorder_policies (store_id, product_id, min_stock, target_stock, preferred_supplier_id, is_enabled)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 5, 30, 'b0000000-0000-0000-0000-000000000001', true),
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 3, 15, 'b0000000-0000-0000-0000-000000000001', true),
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 5, 20, 'b0000000-0000-0000-0000-000000000001', true)
ON CONFLICT (store_id, product_id) DO NOTHING;

COMMIT;
