-- Migration: 146_t192_staff_shifts
-- T-192: Staff shifts table + miscellaneous Phase 5A schema additions
-- Staff shifts: tracks shift start/end, cash drawer, and sales per shift
-- Also adds columns for:
--   T-193: due_date on sell_payments (overdue tracking)
--   T-153: paid_amount_minor on sell_payments (BNPL partial pay)
--   T-147: price_change_pending + pending_purchase_price on supplier_products (price continuity)
--   T-185: max_devices on stores (already exists from migration 044, skip if present)
--   T-158: bnpl_interest_rate on supplier_store_links (BNPL interest)
--   T-156: receipt_settings on stores (custom receipt config)
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- TABLE: platform.staff_shifts
-- Staff shift tracking with cash drawer and sales aggregates
-- =============================================================================
CREATE TABLE IF NOT EXISTS platform.staff_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Store isolation
  store_id UUID NOT NULL REFERENCES platform.stores(id),

  -- Staff reference (FK to platform.store_staff or auth.users)
  staff_user_id UUID NOT NULL,

  -- Shift timing
  shift_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  shift_end TIMESTAMPTZ,

  -- Cash drawer (in paise)
  opening_cash_minor BIGINT NOT NULL DEFAULT 0,
  closing_cash_minor BIGINT,

  -- Shift sales aggregates (updated by app logic)
  sales_count INTEGER NOT NULL DEFAULT 0,
  sales_total_minor BIGINT NOT NULL DEFAULT 0,

  -- Notes
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_staff_shift_sales CHECK (
    sales_count >= 0 AND sales_total_minor >= 0
  )
);

-- Primary lookup: shifts for a staff member at a store
CREATE INDEX IF NOT EXISTS idx_staff_shifts_store_staff
  ON platform.staff_shifts (store_id, staff_user_id, shift_start DESC);

-- Active shifts (shift_end IS NULL)
CREATE INDEX IF NOT EXISTS idx_staff_shifts_active
  ON platform.staff_shifts (store_id, staff_user_id)
  WHERE shift_end IS NULL;

-- Store shift history
CREATE INDEX IF NOT EXISTS idx_staff_shifts_store
  ON platform.staff_shifts (store_id, shift_start DESC);

COMMENT ON TABLE platform.staff_shifts IS
  'Staff shift tracking — start/end times, cash drawer amounts, and per-shift sales aggregates.';

-- =============================================================================
-- T-193: Add due_date to payments.sell_payments for overdue tracking
-- =============================================================================
ALTER TABLE payments.sell_payments
  ADD COLUMN IF NOT EXISTS due_date DATE;

COMMENT ON COLUMN payments.sell_payments.due_date IS
  'Due date for DUE-mode payments. Used for overdue tracking and reminders.';

-- Index for overdue payment queries
CREATE INDEX IF NOT EXISTS idx_sell_payments_due_date
  ON payments.sell_payments (due_date)
  WHERE status = 'pending' AND due_date IS NOT NULL;

-- =============================================================================
-- T-153: Add paid_amount_minor to payments.sell_payments for BNPL partial pay
-- =============================================================================
ALTER TABLE payments.sell_payments
  ADD COLUMN IF NOT EXISTS paid_amount_minor BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN payments.sell_payments.paid_amount_minor IS
  'Amount paid so far against this payment (in paise). For DUE/BNPL partial payment tracking.';

-- =============================================================================
-- T-147: Price continuity columns on catalog.supplier_products
-- When a supplier changes price, the old price continues until the store accepts
-- =============================================================================
ALTER TABLE catalog.supplier_products
  ADD COLUMN IF NOT EXISTS price_change_pending BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE catalog.supplier_products
  ADD COLUMN IF NOT EXISTS pending_purchase_price BIGINT;

COMMENT ON COLUMN catalog.supplier_products.price_change_pending IS
  'True when supplier has submitted a new price that has not yet been accepted by stores. Old purchase_price stays active until accepted.';
COMMENT ON COLUMN catalog.supplier_products.pending_purchase_price IS
  'New purchase price (in paise) awaiting store acceptance. NULL when no change pending.';

-- Index for pending price changes (admin review queue)
CREATE INDEX IF NOT EXISTS idx_supplier_products_price_pending
  ON catalog.supplier_products (supplier_id)
  WHERE price_change_pending = true;

-- =============================================================================
-- T-185: max_devices on platform.stores
-- Already added in migration 044_iter2_production_hardening.sql (DEFAULT 10)
-- This is a no-op safety net — ADD COLUMN IF NOT EXISTS handles idempotency
-- =============================================================================
ALTER TABLE platform.stores
  ADD COLUMN IF NOT EXISTS max_devices INTEGER NOT NULL DEFAULT 5;

-- =============================================================================
-- T-158: BNPL interest rate on supplier-store links
-- =============================================================================
ALTER TABLE supplier.supplier_store_links
  ADD COLUMN IF NOT EXISTS bnpl_interest_rate NUMERIC(5,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN supplier.supplier_store_links.bnpl_interest_rate IS
  'Annual interest rate (%) for BNPL credit offered by this supplier to this store. 0 = interest-free.';

-- =============================================================================
-- T-156: Receipt settings on stores (custom receipt config)
-- =============================================================================
ALTER TABLE platform.stores
  ADD COLUMN IF NOT EXISTS receipt_settings JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN platform.stores.receipt_settings IS
  'Custom receipt configuration per store. JSONB with keys like: header_text, footer_text, show_logo, logo_url, show_gstin, paper_size, etc.';

COMMIT;
