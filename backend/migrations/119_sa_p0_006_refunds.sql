-- SA-P0-006: Refund & Sale Reversal Capability
-- Creates refunds table for tracking refund requests with SA approval gate

CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_sale_id TEXT NOT NULL REFERENCES sales(id),
  store_id TEXT NOT NULL,
  refund_type TEXT NOT NULL CHECK (refund_type IN ('FULL', 'PARTIAL')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  requested_by_device_id TEXT NULL,
  approved_by TEXT NULL,           -- admin email or ID
  approved_at TIMESTAMPTZ NULL,
  rejection_reason TEXT NULL,
  items JSONB NULL,                -- For PARTIAL: array of {variantId, quantity, priceMinor}
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS refunds_store_id_idx ON refunds (store_id);
CREATE INDEX IF NOT EXISTS refunds_status_idx ON refunds (status) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS refunds_original_sale_id_idx ON refunds (original_sale_id);
CREATE INDEX IF NOT EXISTS refunds_created_at_idx ON refunds (created_at DESC);
