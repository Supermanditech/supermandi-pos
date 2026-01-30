-- GO-LIVE Batch 4: Sync event retry tracking and AR (Accounts Receivable)
-- Migration 076

BEGIN;

-- =============================================================================
-- GO-LIVE-032: Failed sync events retry tracking
-- =============================================================================

CREATE TABLE IF NOT EXISTS failed_sync_events (
  event_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  first_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, device_id)
);

-- Index for cleanup queries (old failed events)
CREATE INDEX IF NOT EXISTS idx_failed_sync_events_last_attempt
  ON failed_sync_events(last_attempt_at);

-- Index for store-level monitoring
CREATE INDEX IF NOT EXISTS idx_failed_sync_events_store
  ON failed_sync_events(store_id, last_attempt_at DESC);

COMMENT ON TABLE failed_sync_events IS
'GO-LIVE-032: Tracks sync events that have failed processing. Used to enforce max retry limits.';

-- =============================================================================
-- GO-LIVE-070: Accounts Receivable (AR) tracking for DUE payments
-- =============================================================================

CREATE TABLE IF NOT EXISTS accounts_receivable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id TEXT NOT NULL,
  sale_id TEXT NOT NULL UNIQUE,
  payment_id UUID,
  customer_reference TEXT,  -- Optional: customer name/phone for DUE tracking
  amount_minor BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'outstanding' CHECK (status IN ('outstanding', 'partial', 'settled', 'written_off')),
  amount_settled_minor BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  settled_at TIMESTAMPTZ,
  notes TEXT
);

-- Index for store-level AR queries
CREATE INDEX IF NOT EXISTS idx_ar_store_status
  ON accounts_receivable(store_id, status, created_at DESC);

-- Index for outstanding amounts
CREATE INDEX IF NOT EXISTS idx_ar_outstanding
  ON accounts_receivable(store_id, amount_minor)
  WHERE status = 'outstanding';

COMMENT ON TABLE accounts_receivable IS
'GO-LIVE-070: Tracks outstanding amounts for DUE payments. Enables store owners to track and collect receivables.';

-- =============================================================================
-- GO-LIVE-069: Add payment_status to sales table if not exists
-- =============================================================================

-- Add payment_status column to track payment state separately from sale status
ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';

-- Index for payment status queries
CREATE INDEX IF NOT EXISTS idx_sales_payment_status
  ON sales(store_id, payment_status);

COMMENT ON COLUMN sales.payment_status IS
'GO-LIVE-069: Separate payment status tracking. Values: pending, paid, partial, due, refunded';

-- =============================================================================
-- Cleanup old failed events (older than 30 days)
-- =============================================================================

-- This can be run periodically to clean up old failed events
CREATE OR REPLACE FUNCTION cleanup_old_failed_sync_events()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM failed_sync_events
  WHERE last_attempt_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMIT;
