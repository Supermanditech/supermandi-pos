-- ROLLBACK: DROP TABLE IF EXISTS invoicing.settlement_records;
-- GCP-STG-0106: Settlement System (SuperMandi → Supplier Payout)
-- Tracks net settlement amounts owed to suppliers after deducting margin/commission

CREATE TABLE IF NOT EXISTS invoicing.settlement_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Parties
  supplier_id UUID NOT NULL,
  store_id UUID NOT NULL,
  -- Order/invoice references
  order_id UUID,
  purchase_invoice_id UUID REFERENCES invoicing.invoices(id),
  sale_invoice_id UUID REFERENCES invoicing.invoices(id),
  platform_fee_id UUID,
  -- Billing context
  billing_model VARCHAR(30) NOT NULL DEFAULT 'SUPERMANDI_PRINCIPAL'
    CHECK (billing_model IN ('SUPERMANDI_PRINCIPAL', 'DIRECT_SUPPLIER')),
  -- Amounts (all in paise/minor units)
  gross_amount_minor BIGINT NOT NULL DEFAULT 0,
  commission_minor BIGINT NOT NULL DEFAULT 0,
  commission_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  gst_on_commission_minor BIGINT NOT NULL DEFAULT 0,
  tds_minor BIGINT NOT NULL DEFAULT 0,
  tds_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  net_payout_minor BIGINT NOT NULL DEFAULT 0,
  -- Status lifecycle: pending → approved → scheduled → paid → reconciled
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'scheduled', 'paid', 'reconciled', 'disputed', 'cancelled')),
  -- Settlement cycle
  settlement_cycle VARCHAR(20) DEFAULT 'weekly'
    CHECK (settlement_cycle IN ('daily', 'weekly', 'biweekly', 'monthly', 'on_demand')),
  settlement_date DATE,
  -- Payout tracking
  payout_reference VARCHAR(100),
  payout_utr VARCHAR(50),
  payout_method VARCHAR(20),
  paid_at TIMESTAMPTZ,
  -- Approval
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  -- Notes
  notes TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_settlement_supplier ON invoicing.settlement_records (supplier_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_settlement_store ON invoicing.settlement_records (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_settlement_order ON invoicing.settlement_records (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_settlement_status ON invoicing.settlement_records (status, settlement_date);
CREATE INDEX IF NOT EXISTS idx_settlement_date ON invoicing.settlement_records (settlement_date) WHERE settlement_date IS NOT NULL;
