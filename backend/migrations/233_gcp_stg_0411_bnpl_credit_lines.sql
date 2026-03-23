-- GCP-STG-0411: BNPL — SuperMandi as Credit Provider
-- Creates bnpl_credit_lines (per-store credit limits managed by SuperMandi)
-- and bnpl_applications (stores apply for credit, admin approves/rejects)
-- ROLLBACK: DROP TABLE IF EXISTS payments.bnpl_applications; DROP TABLE IF EXISTS payments.bnpl_credit_lines;

CREATE TABLE IF NOT EXISTS payments.bnpl_credit_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL UNIQUE,
  approved_limit_minor BIGINT NOT NULL DEFAULT 0,
  used_minor BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','suspended','closed')),
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments.bnpl_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  business_name VARCHAR(500) NOT NULL,
  gstin VARCHAR(20),
  requested_amount_minor BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for admin listing pending applications
CREATE INDEX IF NOT EXISTS idx_bnpl_applications_status ON payments.bnpl_applications (status, created_at);

-- Index for store lookup of credit line
CREATE INDEX IF NOT EXISTS idx_bnpl_credit_lines_store ON payments.bnpl_credit_lines (store_id);
