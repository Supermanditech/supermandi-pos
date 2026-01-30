-- GO-LIVE Batch 10: Infrastructure improvements
-- Migration 082

BEGIN;

-- =============================================================================
-- GO-LIVE-097: GST Input Credit Tracking
-- =============================================================================

-- Table to track GST input credits from purchase invoices
CREATE TABLE IF NOT EXISTS accounting.gst_input_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,

  -- Invoice details
  invoice_number VARCHAR(100) NOT NULL,
  invoice_date DATE NOT NULL,
  supplier_gstin VARCHAR(15),
  supplier_name VARCHAR(200),

  -- GST amounts in paise (minor currency units)
  taxable_amount_paise BIGINT NOT NULL DEFAULT 0,
  cgst_paise BIGINT NOT NULL DEFAULT 0,  -- Central GST
  sgst_paise BIGINT NOT NULL DEFAULT 0,  -- State GST
  igst_paise BIGINT NOT NULL DEFAULT 0,  -- Integrated GST
  cess_paise BIGINT NOT NULL DEFAULT 0,  -- Additional cess if any
  total_gst_paise BIGINT NOT NULL DEFAULT 0,  -- Sum of all GST

  -- GST rates (percentage * 100 for precision, e.g., 18% = 1800)
  cgst_rate_bps INTEGER,  -- Basis points
  sgst_rate_bps INTEGER,
  igst_rate_bps INTEGER,

  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'claimed', 'rejected', 'expired')),
  claimed_in_return VARCHAR(20),  -- GSTR-3B return period (e.g., '2026-01')
  claimed_at TIMESTAMPTZ,

  -- Filing details
  filing_period VARCHAR(20),  -- Month in which this can be claimed (YYYY-MM)
  due_date DATE,  -- Due date for claiming

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,

  -- Link to purchase if exists
  purchase_id UUID,
  purchase_order_id UUID
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_gst_credits_store_status
  ON accounting.gst_input_credits(store_id, status);

CREATE INDEX IF NOT EXISTS idx_gst_credits_filing_period
  ON accounting.gst_input_credits(store_id, filing_period);

CREATE INDEX IF NOT EXISTS idx_gst_credits_invoice
  ON accounting.gst_input_credits(store_id, invoice_number, invoice_date);

COMMENT ON TABLE accounting.gst_input_credits IS
'GO-LIVE-097: Tracks GST input tax credits from purchase invoices for ITC claiming';

-- =============================================================================
-- GO-LIVE-091: Database backup tracking table
-- =============================================================================

CREATE TABLE IF NOT EXISTS admin.backup_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_type VARCHAR(20) NOT NULL CHECK (backup_type IN ('full', 'incremental', 'wal')),
  backup_method VARCHAR(50) NOT NULL,  -- 'pg_dump', 'pg_basebackup', 'wal-g', etc.

  -- Backup details
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  size_bytes BIGINT,
  location VARCHAR(500),  -- Storage path/URL

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'verified')),
  error_message TEXT,

  -- Retention
  retention_days INTEGER NOT NULL DEFAULT 30,
  expires_at TIMESTAMPTZ,

  -- Verification
  verified_at TIMESTAMPTZ,
  verification_result JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backup_history_status
  ON admin.backup_history(status, completed_at DESC);

COMMENT ON TABLE admin.backup_history IS
'GO-LIVE-091: Tracks database backup operations for disaster recovery';

-- =============================================================================
-- GO-LIVE-098: API Response Caching metadata
-- =============================================================================

CREATE TABLE IF NOT EXISTS admin.cache_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key VARCHAR(200) NOT NULL UNIQUE,
  ttl_seconds INTEGER NOT NULL DEFAULT 300,
  enabled BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default cache configurations
INSERT INTO admin.cache_config (cache_key, ttl_seconds, description) VALUES
  ('catalog:products', 300, 'Product catalog cache'),
  ('analytics:overview', 60, 'Analytics overview - short TTL for freshness'),
  ('store:settings', 600, 'Store settings - longer TTL'),
  ('supplier:catalog', 300, 'Supplier product catalog')
ON CONFLICT (cache_key) DO NOTHING;

COMMENT ON TABLE admin.cache_config IS
'GO-LIVE-098: Configurable cache TTLs for API response caching';

COMMIT;
