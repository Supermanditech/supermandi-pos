-- Migration: 005_inventory_schema
-- V3.0.9 Foundation: Inventory schema with ledger and stock balances
-- Safe to run multiple times (idempotent)

BEGIN;

-- Create inventory schema
CREATE SCHEMA IF NOT EXISTS inventory;

-- =============================================================================
-- TABLE: inventory.inventory_ledger
-- APPEND-ONLY ledger for stock movements - SOURCE OF TRUTH
-- =============================================================================
CREATE TABLE IF NOT EXISTS inventory.inventory_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  store_id UUID NOT NULL,  -- FK to platform.stores
  product_id UUID NOT NULL,  -- FK to catalog.products

  -- Movement
  delta_qty INTEGER NOT NULL,  -- Signed: negative for sale, positive for receive
  transaction_type VARCHAR(30) NOT NULL,

  -- Reference (for traceability)
  reference_type VARCHAR(20),
  reference_id VARCHAR(100),
  reference_sub_id VARCHAR(100),  -- V3.0.4: receiveId for partial GRN

  -- Stock snapshot at time of transaction
  stock_before INTEGER NOT NULL,
  stock_after INTEGER NOT NULL,

  -- Cost tracking
  unit_cost INTEGER,  -- Minor units (paise)

  -- Audit
  created_by_user_id UUID,  -- FK to auth.users
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_ledger_transaction_type CHECK (
    transaction_type IN ('sale', 'sale_return', 'purchase_received', 'adjustment')
  ),
  CONSTRAINT chk_ledger_reference_type CHECK (
    reference_type IS NULL OR reference_type IN ('sale', 'po', 'return', 'manual')
  ),
  CONSTRAINT chk_ledger_stock_consistency CHECK (
    stock_before + delta_qty = stock_after
  )
);

-- Store + product lookup
CREATE INDEX IF NOT EXISTS inventory_ledger_store_product_idx
  ON inventory.inventory_ledger (store_id, product_id, created_at DESC);

-- Reference lookup (find all ledger entries for a PO/sale)
CREATE INDEX IF NOT EXISTS inventory_ledger_reference_idx
  ON inventory.inventory_ledger (reference_type, reference_id)
  WHERE reference_id IS NOT NULL;

-- Recent transactions for a store
CREATE INDEX IF NOT EXISTS inventory_ledger_store_recent_idx
  ON inventory.inventory_ledger (store_id, created_at DESC);

-- =============================================================================
-- TABLE: inventory.stock_balances
-- Current stock level - FOR UPDATE locking target
-- =============================================================================
CREATE TABLE IF NOT EXISTS inventory.stock_balances (
  store_id UUID NOT NULL,  -- FK to platform.stores
  product_id UUID NOT NULL,  -- FK to catalog.products

  -- Current stock
  current_qty INTEGER NOT NULL DEFAULT 0,

  -- Last ledger entry that updated this
  last_ledger_id UUID,  -- FK to inventory_ledger

  -- Timestamps
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  PRIMARY KEY (store_id, product_id),
  CONSTRAINT chk_stock_balance_qty CHECK (current_qty >= 0)
);

-- =============================================================================
-- TABLE: inventory.idempotency_keys
-- Idempotency for inventory transactions
-- =============================================================================
CREATE TABLE IF NOT EXISTS inventory.idempotency_keys (
  key VARCHAR(255) NOT NULL,
  user_id UUID NOT NULL,  -- FK to auth.users

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
  CONSTRAINT chk_idempotency_status CHECK (
    status IN ('processing', 'completed', 'failed')
  )
);

-- Cleanup expired keys
CREATE INDEX IF NOT EXISTS idempotency_keys_expires_idx
  ON inventory.idempotency_keys (expires_at)
  WHERE status != 'processing';

-- =============================================================================
-- TABLE: inventory.event_inbox
-- Inbox for processing inventory events from other services
-- =============================================================================
CREATE TABLE IF NOT EXISTS inventory.event_inbox (
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
  CONSTRAINT event_inbox_event_id_unique UNIQUE (event_id),
  CONSTRAINT chk_event_inbox_retry CHECK (retry_count >= 0)
);

-- Index for unprocessed events
CREATE INDEX IF NOT EXISTS inventory_event_inbox_unprocessed_idx
  ON inventory.event_inbox (received_at)
  WHERE processed_at IS NULL;

-- =============================================================================
-- TABLE: inventory.event_outbox
-- Outbox for publishing inventory events
-- =============================================================================
CREATE TABLE IF NOT EXISTS inventory.event_outbox (
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
  CONSTRAINT chk_inventory_event_outbox_retry CHECK (retry_count >= 0)
);

-- Index for unprocessed events
CREATE INDEX IF NOT EXISTS inventory_event_outbox_unprocessed_idx
  ON inventory.event_outbox (created_at)
  WHERE processed_at IS NULL;

COMMIT;
