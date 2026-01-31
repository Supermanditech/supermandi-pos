-- GO-LIVE-240: BNPL Dispute Functionality
-- Allows stores to dispute BNPL drawdowns for support review

-- Create BNPL disputes table
CREATE TABLE IF NOT EXISTS payments.bnpl_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drawdown_id UUID NOT NULL,
  store_id UUID NOT NULL,
  supplier_id UUID,
  reason VARCHAR(100) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'under_review', 'resolved', 'rejected')),
  resolution_notes TEXT,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add foreign key constraints if the referenced tables exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'payments' AND table_name = 'bnpl_drawdowns') THEN
    BEGIN
      ALTER TABLE payments.bnpl_disputes ADD CONSTRAINT fk_disputes_drawdown FOREIGN KEY (drawdown_id) REFERENCES payments.bnpl_drawdowns(id);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- Index for quick lookup by drawdown
CREATE INDEX IF NOT EXISTS idx_bnpl_disputes_drawdown ON payments.bnpl_disputes(drawdown_id);

-- Index for quick lookup by store
CREATE INDEX IF NOT EXISTS idx_bnpl_disputes_store ON payments.bnpl_disputes(store_id);

-- Index for filtering by status
CREATE INDEX IF NOT EXISTS idx_bnpl_disputes_status ON payments.bnpl_disputes(status);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION payments.update_bnpl_disputes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bnpl_disputes_updated_at ON payments.bnpl_disputes;
CREATE TRIGGER trg_bnpl_disputes_updated_at
  BEFORE UPDATE ON payments.bnpl_disputes
  FOR EACH ROW
  EXECUTE FUNCTION payments.update_bnpl_disputes_updated_at();

-- Log migration
DO $$
BEGIN
  RAISE NOTICE '[GO-LIVE-240] BNPL disputes table created successfully';
END $$;
