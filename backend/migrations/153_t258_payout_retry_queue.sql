-- T-258: Payout retry queue for failed supplier payouts
-- Exponential backoff: retry after 1min, 5min, 30min (3 attempts max)

CREATE TABLE IF NOT EXISTS payments.payout_retries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID NOT NULL REFERENCES payments.supplier_payouts(id),
  attempt_number INTEGER NOT NULL DEFAULT 1,
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  attempted_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Constraint: max 3 retry attempts per payout, status must be valid
ALTER TABLE payments.payout_retries
  ADD CONSTRAINT chk_payout_retries_status
  CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'exhausted'));

ALTER TABLE payments.payout_retries
  ADD CONSTRAINT chk_payout_retries_attempt
  CHECK (attempt_number BETWEEN 1 AND 3);

-- Index for cron job: find pending retries that are due
CREATE INDEX IF NOT EXISTS idx_payout_retries_pending
  ON payments.payout_retries(scheduled_for)
  WHERE status = 'pending';

-- Index for looking up retries by payout
CREATE INDEX IF NOT EXISTS idx_payout_retries_payout
  ON payments.payout_retries(payout_id);

-- Add retry_count to supplier_payouts for quick lookup
ALTER TABLE payments.supplier_payouts
  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMP WITH TIME ZONE;
