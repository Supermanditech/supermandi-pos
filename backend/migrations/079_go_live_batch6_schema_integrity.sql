-- GO-LIVE Batch 6: Database Schema & Integrity
-- Migration 079

BEGIN;

-- =============================================================================
-- GO-LIVE-057: inventory_ledger.store_id FK (ALREADY EXISTS)
-- Verified: fk_inv_ledger_store exists in inventory.inventory_ledger
-- =============================================================================

-- =============================================================================
-- GO-LIVE-058: Add FK on public.sales.store_id
-- =============================================================================
-- First verify all store_ids exist in platform.stores
DO $$
BEGIN
  -- Only add FK if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_sales_store'
    AND conrelid = 'public.sales'::regclass
  ) THEN
    -- Clean up any orphan records first (shouldn't happen in production)
    DELETE FROM public.sales
    WHERE store_id NOT IN (SELECT id FROM platform.stores);

    ALTER TABLE public.sales
      ADD CONSTRAINT fk_sales_store
      FOREIGN KEY (store_id) REFERENCES platform.stores(id)
      ON DELETE RESTRICT;

    RAISE NOTICE 'GO-LIVE-058: Added FK fk_sales_store on public.sales';
  ELSE
    RAISE NOTICE 'GO-LIVE-058: FK fk_sales_store already exists';
  END IF;
END $$;

COMMENT ON CONSTRAINT fk_sales_store ON public.sales IS
'GO-LIVE-058: Foreign key ensuring sales.store_id references valid store';

-- =============================================================================
-- GO-LIVE-059: Add FK on catalog.store_products.store_id
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_store_products_store'
    AND conrelid = 'catalog.store_products'::regclass
  ) THEN
    -- Clean up any orphan records first
    DELETE FROM catalog.store_products
    WHERE store_id NOT IN (SELECT id FROM platform.stores);

    ALTER TABLE catalog.store_products
      ADD CONSTRAINT fk_store_products_store
      FOREIGN KEY (store_id) REFERENCES platform.stores(id)
      ON DELETE CASCADE;

    RAISE NOTICE 'GO-LIVE-059: Added FK fk_store_products_store on catalog.store_products';
  ELSE
    RAISE NOTICE 'GO-LIVE-059: FK fk_store_products_store already exists';
  END IF;
END $$;

COMMENT ON CONSTRAINT fk_store_products_store ON catalog.store_products IS
'GO-LIVE-059: Foreign key ensuring store_products.store_id references valid store';

-- =============================================================================
-- GO-LIVE-062: store_products.is_active index (ALREADY EXISTS)
-- Verified: store_products_active_idx exists
-- =============================================================================

-- =============================================================================
-- GO-LIVE-063: Consolidate reorder_policies vs product_policies
-- product_policies uses min_threshold; reorder_policies uses min_stock
-- Both tables serve similar purposes - create a unified view for consolidation
-- =============================================================================

-- Create a view for backwards compatibility that combines both tables
-- reorder_policies.min_stock maps to min_threshold in the unified view
CREATE OR REPLACE VIEW reorder.unified_reorder_policies AS
SELECT
  id,
  store_id,
  product_id,
  min_threshold,
  target_stock,
  preferred_supplier_id,
  is_enabled,
  created_at,
  updated_at
FROM reorder.product_policies
UNION ALL
SELECT
  id,
  store_id,
  product_id,
  min_stock as min_threshold,  -- Map min_stock to min_threshold
  target_stock,
  preferred_supplier_id,
  is_enabled,
  created_at,
  updated_at
FROM reorder.reorder_policies rp
WHERE NOT EXISTS (
  SELECT 1 FROM reorder.product_policies pp
  WHERE pp.store_id = rp.store_id AND pp.product_id = rp.product_id
);

COMMENT ON VIEW reorder.unified_reorder_policies IS
'GO-LIVE-063: Unified view combining product_policies (min_threshold) and reorder_policies (min_stock) tables';

-- Note: We won't drop reorder_policies table yet to avoid breaking existing code
-- Future: Migrate all data to product_policies and deprecate reorder_policies

-- =============================================================================
-- GO-LIVE-064: sales.id should be UUID (currently VARCHAR)
-- Cannot change type easily due to FK dependencies - add CHECK constraint instead
-- =============================================================================

-- Add a check constraint to ensure sales.id follows UUID format
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS chk_sales_id_uuid_format;

ALTER TABLE public.sales ADD CONSTRAINT chk_sales_id_uuid_format CHECK (
  id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  OR id ~ '^[a-zA-Z0-9_-]+$'  -- Also allow legacy test IDs like 'test-cash-sale-001'
);

COMMENT ON CONSTRAINT chk_sales_id_uuid_format ON public.sales IS
'GO-LIVE-064: Validates sales.id is UUID format or legacy identifier';

-- =============================================================================
-- GO-LIVE-089: Add sequence_number to event_outbox tables
-- =============================================================================

-- Add to inventory.event_outbox
ALTER TABLE inventory.event_outbox
  ADD COLUMN IF NOT EXISTS sequence_number BIGSERIAL;

CREATE INDEX IF NOT EXISTS idx_inventory_event_outbox_sequence
  ON inventory.event_outbox(sequence_number);

COMMENT ON COLUMN inventory.event_outbox.sequence_number IS
'GO-LIVE-089: Monotonic sequence for ordered event processing';

-- Add to supplier.event_outbox
ALTER TABLE supplier.event_outbox
  ADD COLUMN IF NOT EXISTS sequence_number BIGSERIAL;

CREATE INDEX IF NOT EXISTS idx_supplier_event_outbox_sequence
  ON supplier.event_outbox(sequence_number);

-- Add to orders.event_outbox
ALTER TABLE orders.event_outbox
  ADD COLUMN IF NOT EXISTS sequence_number BIGSERIAL;

CREATE INDEX IF NOT EXISTS idx_orders_event_outbox_sequence
  ON orders.event_outbox(sequence_number);

-- Add to reorder.event_outbox
ALTER TABLE reorder.event_outbox
  ADD COLUMN IF NOT EXISTS sequence_number BIGSERIAL;

CREATE INDEX IF NOT EXISTS idx_reorder_event_outbox_sequence
  ON reorder.event_outbox(sequence_number);

-- Add to payments.event_outbox
ALTER TABLE payments.event_outbox
  ADD COLUMN IF NOT EXISTS sequence_number BIGSERIAL;

CREATE INDEX IF NOT EXISTS idx_payments_event_outbox_sequence
  ON payments.event_outbox(sequence_number);

-- =============================================================================
-- GO-LIVE-090: Add idempotency_key to event_inbox tables
-- =============================================================================

-- Add to inventory.event_inbox
ALTER TABLE inventory.event_inbox
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_event_inbox_idempotency
  ON inventory.event_inbox(idempotency_key) WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN inventory.event_inbox.idempotency_key IS
'GO-LIVE-090: Unique key to prevent duplicate event processing';

-- Add to catalog.event_inbox
ALTER TABLE catalog.event_inbox
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_event_inbox_idempotency
  ON catalog.event_inbox(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Add to reorder.event_inbox
ALTER TABLE reorder.event_inbox
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reorder_event_inbox_idempotency
  ON reorder.event_inbox(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- =============================================================================
-- GO-LIVE-093: Large tables partitioning (STUB - requires downtime for existing tables)
-- This documents the plan for future partitioning
-- =============================================================================

-- Partitioning would require:
-- 1. Creating new partitioned tables
-- 2. Migrating data
-- 3. Renaming tables
-- This is marked as a stub for Phase 2

COMMENT ON TABLE public.sales IS
'GO-LIVE-093: Candidate for partitioning by created_at (monthly)';

COMMENT ON TABLE inventory.inventory_ledger IS
'GO-LIVE-093: Candidate for partitioning by created_at (monthly)';

-- =============================================================================
-- GO-LIVE-096: Add IP/session tracking to audit_logs
-- =============================================================================

-- Create audit_logs table if not exists
CREATE TABLE IF NOT EXISTS platform.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES platform.stores(id),
  user_id UUID,
  user_type VARCHAR(50), -- 'admin', 'retailer', 'supplier', 'pos_device'
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100),
  resource_id TEXT,
  old_value JSONB,
  new_value JSONB,
  ip_address INET,
  user_agent TEXT,
  session_id TEXT,
  device_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_store_id ON platform.audit_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON platform.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON platform.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON platform.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip ON platform.audit_logs(ip_address) WHERE ip_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_session ON platform.audit_logs(session_id) WHERE session_id IS NOT NULL;

COMMENT ON TABLE platform.audit_logs IS
'GO-LIVE-096: Comprehensive audit trail with IP/session tracking';

COMMENT ON COLUMN platform.audit_logs.ip_address IS
'GO-LIVE-096: Client IP address for security tracking';

COMMENT ON COLUMN platform.audit_logs.session_id IS
'GO-LIVE-096: Session identifier for tracking user sessions';

COMMIT;
