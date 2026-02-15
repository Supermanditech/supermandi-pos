-- Migration: 150_t236_t237_reorder_schema_unification
-- T-236: Unify dual reorder schema (007 canonical + 044 conflicting)
-- T-237: Add payment terms snapshot to purchase orders
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- T-236: REORDER SCHEMA UNIFICATION
-- Migration 044 created conflicting tables (store_settings, product_policies)
-- that duplicate 007's canonical tables (store_reorder_settings, reorder_policies).
-- Strategy: Add 044's new columns to 007 tables, then drop 044 conflicts.
-- =============================================================================

-- Step 1: Add 044's new columns to canonical store_reorder_settings
ALTER TABLE reorder.store_reorder_settings
  ADD COLUMN IF NOT EXISTS auto_approve_threshold INTEGER,
  ADD COLUMN IF NOT EXISTS default_lead_days INTEGER NOT NULL DEFAULT 3;

-- Step 2: Add max_reorder_qty to reorder_policies (T-239 prep)
ALTER TABLE reorder.reorder_policies
  ADD COLUMN IF NOT EXISTS max_reorder_qty INTEGER;

-- Constraint: max_reorder_qty must be positive if set
-- (Cannot add named constraint with ADD COLUMN IF NOT EXISTS, so use DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_schema = 'reorder' AND table_name = 'reorder_policies'
      AND constraint_name = 'chk_max_reorder_qty'
  ) THEN
    ALTER TABLE reorder.reorder_policies
      ADD CONSTRAINT chk_max_reorder_qty
      CHECK (max_reorder_qty IS NULL OR max_reorder_qty > 0);
  END IF;
END $$;

-- Step 3: Migrate any data from 044's conflicting tables into canonical tables
-- Copy store_settings → store_reorder_settings (if any data exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'reorder' AND table_name = 'store_settings'
  ) THEN
    INSERT INTO reorder.store_reorder_settings (
      store_id, reorder_enabled, require_approval, auto_approve_threshold, default_lead_days
    )
    SELECT
      store_id, reorder_enabled, require_approval, auto_approve_threshold, default_lead_days
    FROM reorder.store_settings
    ON CONFLICT (store_id) DO UPDATE SET
      auto_approve_threshold = COALESCE(EXCLUDED.auto_approve_threshold, reorder.store_reorder_settings.auto_approve_threshold),
      default_lead_days = COALESCE(EXCLUDED.default_lead_days, reorder.store_reorder_settings.default_lead_days);
  END IF;
END $$;

-- Copy product_policies → reorder_policies (if any data exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'reorder' AND table_name = 'product_policies'
  ) THEN
    INSERT INTO reorder.reorder_policies (
      store_id, product_id, min_stock, target_stock, preferred_supplier_id, is_enabled
    )
    SELECT
      store_id, product_id, min_threshold, target_stock, preferred_supplier_id, is_enabled
    FROM reorder.product_policies
    ON CONFLICT (store_id, product_id) DO NOTHING;
  END IF;
END $$;

-- Step 4: Drop conflicting 044 tables (now safely migrated)
DROP TABLE IF EXISTS reorder.store_settings CASCADE;
DROP TABLE IF EXISTS reorder.product_policies CASCADE;

-- =============================================================================
-- T-237: PAYMENT TERMS SNAPSHOT ON PURCHASE ORDERS
-- Captures supplier payment terms at PO creation time (immutable snapshot)
-- =============================================================================

ALTER TABLE orders.purchase_orders
  ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_terms_type VARCHAR(50) DEFAULT 'cod',
  ADD COLUMN IF NOT EXISTS payment_terms_notes TEXT,
  ADD COLUMN IF NOT EXISTS payment_due_date DATE;

COMMIT;
