-- T-263: Credit Provider Abstraction Layer
-- Foundation for multi-provider B2B finance (14+ providers)
-- T-275: Repayment tracking (repayment_schedules table)
-- T-276: KYC routing (kyc_documents table)
-- T-278: Settlement reconciliation (credit_settlements table)

-- Provider configuration table
CREATE TABLE IF NOT EXISTS payments.credit_provider_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id VARCHAR(50) NOT NULL UNIQUE,        -- e.g. 'rupifi', 'kredx', 'supermandi_internal'
  provider_name VARCHAR(100) NOT NULL,
  mode VARCHAR(30) NOT NULL CHECK (mode IN ('trade_credit','credit_line','invoice_discounting','laas')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  priority INTEGER NOT NULL DEFAULT 100,           -- lower = higher priority in offer list
  config JSONB NOT NULL DEFAULT '{}',              -- provider-specific config (API URLs, feature flags)
  supported_regions TEXT[] DEFAULT ARRAY['IN'],     -- ISO country codes
  min_amount_minor INTEGER DEFAULT 100000,         -- minimum loan: Rs 1,000
  max_amount_minor INTEGER DEFAULT 50000000,       -- maximum loan: Rs 5,00,000
  interest_rate_min DECIMAL(5,2) DEFAULT 0,
  interest_rate_max DECIMAL(5,2) DEFAULT 36,
  max_tenure_days INTEGER DEFAULT 365,
  requires_kyc BOOLEAN DEFAULT true,
  kyc_fields TEXT[] DEFAULT ARRAY['pan'],          -- required KYC: 'pan','aadhaar','gstin','bank_statement'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- T-275: Add provider tracking to existing drawdowns
ALTER TABLE payments.bnpl_drawdowns ADD COLUMN IF NOT EXISTS provider_id VARCHAR(50) DEFAULT 'supermandi_internal';
ALTER TABLE payments.bnpl_drawdowns ADD COLUMN IF NOT EXISTS external_loan_id VARCHAR(100);
ALTER TABLE payments.bnpl_drawdowns ADD COLUMN IF NOT EXISTS external_status VARCHAR(50);

-- T-275: Repayment schedule tracking (for EMI-based products)
CREATE TABLE IF NOT EXISTS payments.repayment_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drawdown_id UUID NOT NULL REFERENCES payments.bnpl_drawdowns(id),
  store_id UUID NOT NULL,
  provider_id VARCHAR(50) NOT NULL DEFAULT 'supermandi_internal',
  installment_number INTEGER NOT NULL,
  due_date DATE NOT NULL,
  principal_minor INTEGER NOT NULL,
  interest_minor INTEGER NOT NULL DEFAULT 0,
  total_minor INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','overdue','waived')),
  paid_at TIMESTAMPTZ,
  paid_amount_minor INTEGER DEFAULT 0,
  external_ref VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repayment_schedules_store ON payments.repayment_schedules(store_id);
CREATE INDEX IF NOT EXISTS idx_repayment_schedules_drawdown ON payments.repayment_schedules(drawdown_id);
CREATE INDEX IF NOT EXISTS idx_repayment_schedules_due ON payments.repayment_schedules(due_date, status);

-- T-276: KYC document storage (shared across providers)
CREATE TABLE IF NOT EXISTS payments.kyc_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  document_type VARCHAR(30) NOT NULL CHECK (document_type IN ('pan','aadhaar','gstin','bank_statement','gst_returns','itr','business_proof')),
  document_number VARCHAR(50),                     -- PAN number, GSTIN, etc.
  document_data JSONB DEFAULT '{}',                -- additional parsed data
  verification_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','submitted','verified','rejected','expired')),
  verified_by_provider VARCHAR(50),                -- which provider verified it
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(store_id, document_type)
);

CREATE INDEX IF NOT EXISTS idx_kyc_documents_store ON payments.kyc_documents(store_id);

-- T-276: Track which providers have received which KYC docs
CREATE TABLE IF NOT EXISTS payments.kyc_provider_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kyc_document_id UUID NOT NULL REFERENCES payments.kyc_documents(id),
  provider_id VARCHAR(50) NOT NULL,
  submission_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (submission_status IN ('pending','submitted','verified','rejected')),
  provider_ref VARCHAR(100),
  submitted_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kyc_submissions_doc ON payments.kyc_provider_submissions(kyc_document_id);

-- T-278: Settlement reconciliation
CREATE TABLE IF NOT EXISTS payments.credit_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  provider_id VARCHAR(50) NOT NULL,
  drawdown_id UUID REFERENCES payments.bnpl_drawdowns(id),
  purchase_order_id UUID,
  settlement_type VARCHAR(20) NOT NULL CHECK (settlement_type IN ('disbursement','repayment','refund','adjustment')),
  amount_minor INTEGER NOT NULL,
  external_ref VARCHAR(100),
  bank_ref VARCHAR(100),
  settled_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','settled','failed','reversed')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_settlements_store ON payments.credit_settlements(store_id);
CREATE INDEX IF NOT EXISTS idx_credit_settlements_provider ON payments.credit_settlements(provider_id);
CREATE INDEX IF NOT EXISTS idx_credit_settlements_drawdown ON payments.credit_settlements(drawdown_id);

-- Seed internal provider
INSERT INTO payments.credit_provider_configs (provider_id, provider_name, mode, is_active, priority, requires_kyc, kyc_fields, config)
VALUES ('supermandi_internal', 'SuperMandi BNPL', 'trade_credit', true, 1, false, ARRAY['pan'], '{"type":"internal","description":"Built-in BNPL for supplier purchases"}')
ON CONFLICT (provider_id) DO NOTHING;
