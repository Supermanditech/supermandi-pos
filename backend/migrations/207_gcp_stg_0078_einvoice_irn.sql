-- ROLLBACK: ALTER TABLE invoicing.invoices DROP COLUMN IF EXISTS irn, DROP COLUMN IF EXISTS irn_status, DROP COLUMN IF EXISTS irn_generated_at, DROP COLUMN IF EXISTS signed_qr_string, DROP COLUMN IF EXISTS signed_invoice_gcs_path, DROP COLUMN IF EXISTS ack_number, DROP COLUMN IF EXISTS ack_date, DROP COLUMN IF EXISTS irn_cancel_reason, DROP COLUMN IF EXISTS irn_cancelled_at;
-- GCP-STG-0078: E-invoice IRN/QR code generation columns
-- Adds GST IRP (Invoice Registration Portal) fields for e-invoicing compliance

-- IRN (Invoice Reference Number) — 64-char hash from IRP
ALTER TABLE invoicing.invoices ADD COLUMN IF NOT EXISTS irn VARCHAR(64);

-- IRN lifecycle status
ALTER TABLE invoicing.invoices ADD COLUMN IF NOT EXISTS irn_status VARCHAR(20) DEFAULT 'na'
  CHECK (irn_status IN ('na', 'pending', 'generated', 'cancelled', 'failed'));

-- Timestamps
ALTER TABLE invoicing.invoices ADD COLUMN IF NOT EXISTS irn_generated_at TIMESTAMPTZ;

-- Signed QR string from IRP response — contains IRN + invoice hash for verification
ALTER TABLE invoicing.invoices ADD COLUMN IF NOT EXISTS signed_qr_string TEXT;

-- GCS path for the signed JSON payload returned by IRP
ALTER TABLE invoicing.invoices ADD COLUMN IF NOT EXISTS signed_invoice_gcs_path VARCHAR(500);

-- IRP acknowledgement
ALTER TABLE invoicing.invoices ADD COLUMN IF NOT EXISTS ack_number VARCHAR(30);
ALTER TABLE invoicing.invoices ADD COLUMN IF NOT EXISTS ack_date TIMESTAMPTZ;

-- Cancellation tracking (IRN can be cancelled within 24 hours per GST rules)
ALTER TABLE invoicing.invoices ADD COLUMN IF NOT EXISTS irn_cancel_reason TEXT;
ALTER TABLE invoicing.invoices ADD COLUMN IF NOT EXISTS irn_cancelled_at TIMESTAMPTZ;

-- Index for IRN lookup (unique when not null)
CREATE UNIQUE INDEX IF NOT EXISTS ux_invoices_irn ON invoicing.invoices (irn) WHERE irn IS NOT NULL;

-- Index for finding invoices pending e-invoice generation
CREATE INDEX IF NOT EXISTS idx_invoices_irn_status ON invoicing.invoices (irn_status) WHERE irn_status IN ('pending', 'failed');
