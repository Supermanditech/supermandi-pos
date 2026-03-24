-- GCP-STG-0662: Credit/debit note table for GST goods return compliance
-- ROLLBACK: DROP TABLE IF EXISTS invoicing.credit_notes;

CREATE TABLE IF NOT EXISTS invoicing.credit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('DEBIT_NOTE', 'CREDIT_NOTE')),
  reference_invoice_id UUID,
  store_id UUID NOT NULL,
  supplier_id UUID,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_amount_minor BIGINT NOT NULL DEFAULT 0,
  gst_amount_minor BIGINT NOT NULL DEFAULT 0,
  reason TEXT,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ISSUED', 'ACKNOWLEDGED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_credit_notes_store ON invoicing.credit_notes(store_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_supplier ON invoicing.credit_notes(supplier_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_type ON invoicing.credit_notes(type, store_id);
