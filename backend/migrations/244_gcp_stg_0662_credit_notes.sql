-- GCP-STG-0662: Credit/debit note table for GST goods return compliance
-- ROLLBACK: ALTER TABLE invoicing.credit_notes DROP COLUMN IF EXISTS type, DROP COLUMN IF EXISTS store_id, DROP COLUMN IF EXISTS supplier_id, DROP COLUMN IF EXISTS items, DROP COLUMN IF EXISTS total_amount_minor, DROP COLUMN IF EXISTS gst_amount_minor, DROP COLUMN IF EXISTS issue_date;

-- Table may already exist from earlier migration with fewer columns.
-- Use ADD COLUMN IF NOT EXISTS to safely extend the schema.
CREATE TABLE IF NOT EXISTS invoicing.credit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

-- Add columns that may be missing from the original schema
ALTER TABLE invoicing.credit_notes ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'CREDIT_NOTE';
ALTER TABLE invoicing.credit_notes ADD COLUMN IF NOT EXISTS reference_invoice_id UUID;
ALTER TABLE invoicing.credit_notes ADD COLUMN IF NOT EXISTS store_id UUID;
ALTER TABLE invoicing.credit_notes ADD COLUMN IF NOT EXISTS supplier_id UUID;
ALTER TABLE invoicing.credit_notes ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE invoicing.credit_notes ADD COLUMN IF NOT EXISTS total_amount_minor BIGINT NOT NULL DEFAULT 0;
ALTER TABLE invoicing.credit_notes ADD COLUMN IF NOT EXISTS gst_amount_minor BIGINT NOT NULL DEFAULT 0;
ALTER TABLE invoicing.credit_notes ADD COLUMN IF NOT EXISTS issue_date DATE DEFAULT CURRENT_DATE;

-- Indexes (only on columns that now exist)
CREATE INDEX IF NOT EXISTS idx_credit_notes_store ON invoicing.credit_notes(store_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_supplier ON invoicing.credit_notes(supplier_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_type ON invoicing.credit_notes(type, store_id);
