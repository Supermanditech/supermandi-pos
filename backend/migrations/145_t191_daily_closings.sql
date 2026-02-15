-- Migration: 145_t191_daily_closings
-- T-191: Daily closings (end-of-day reconciliation) table
-- Tracks opening/closing cash, sales totals, and payment mode breakdowns
-- One closing per store per date (UNIQUE constraint)
-- Placed in orders schema since it aggregates sales/payment data
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- TABLE: orders.daily_closings
-- End-of-day cash reconciliation records
-- =============================================================================
CREATE TABLE IF NOT EXISTS orders.daily_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Store isolation
  store_id UUID NOT NULL REFERENCES platform.stores(id),

  -- Closing date (one per store per date)
  closing_date DATE NOT NULL,

  -- Cash drawer tracking (in paise)
  opening_cash_minor BIGINT NOT NULL DEFAULT 0,
  expected_cash_minor BIGINT NOT NULL DEFAULT 0,   -- Calculated from sales
  actual_cash_minor BIGINT,                         -- Counted by staff
  difference_minor BIGINT NOT NULL DEFAULT 0,       -- actual - expected (negative = short)

  -- Sales summary (in paise)
  total_sales_minor BIGINT NOT NULL DEFAULT 0,
  total_upi_minor BIGINT NOT NULL DEFAULT 0,
  total_cash_minor BIGINT NOT NULL DEFAULT 0,
  total_due_minor BIGINT NOT NULL DEFAULT 0,

  -- Transaction count
  sales_count INTEGER NOT NULL DEFAULT 0,

  -- Who closed the day
  closed_by UUID,
  closed_at TIMESTAMPTZ,

  -- Notes (discrepancy explanations, etc.)
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One closing per store per date
  CONSTRAINT ux_daily_closings_store_date UNIQUE (store_id, closing_date),

  -- Sanity checks
  CONSTRAINT chk_daily_closings_amounts CHECK (
    total_sales_minor >= 0 AND
    total_upi_minor >= 0 AND
    total_cash_minor >= 0 AND
    total_due_minor >= 0 AND
    sales_count >= 0
  )
);

-- Store closings history
CREATE INDEX IF NOT EXISTS idx_daily_closings_store
  ON orders.daily_closings (store_id, closing_date DESC);

-- Unclosed days (actual_cash_minor IS NULL = not yet reconciled)
CREATE INDEX IF NOT EXISTS idx_daily_closings_open
  ON orders.daily_closings (store_id)
  WHERE closed_at IS NULL;

COMMENT ON TABLE orders.daily_closings IS
  'End-of-day cash reconciliation. One record per store per date. Tracks opening/closing cash, sales totals by payment mode.';

COMMIT;
