-- ROLLBACK: ALTER TABLE invoicing.invoices DROP COLUMN IF EXISTS pdf_gcs_path; ALTER TABLE invoicing.invoices DROP COLUMN IF EXISTS pdf_stored_at;
-- GCP-STG-0074: Invoice PDF GCS storage + WhatsApp delivery support
-- Adds columns to track stored PDF path and delivery status.

-- =============================================================================
-- Step 1: Add pdf_gcs_path to invoicing.invoices
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'invoicing' AND table_name = 'invoices' AND column_name = 'pdf_gcs_path'
  ) THEN
    ALTER TABLE invoicing.invoices ADD COLUMN pdf_gcs_path VARCHAR(500);
    ALTER TABLE invoicing.invoices ADD COLUMN pdf_stored_at TIMESTAMPTZ;
    RAISE NOTICE 'GCP-STG-0074: Added pdf_gcs_path + pdf_stored_at to invoicing.invoices';
  END IF;
END $$;

-- =============================================================================
-- Step 2: Add delivery tracking columns
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'invoicing' AND table_name = 'invoices' AND column_name = 'whatsapp_sent_at'
  ) THEN
    ALTER TABLE invoicing.invoices ADD COLUMN whatsapp_sent_at TIMESTAMPTZ;
    ALTER TABLE invoicing.invoices ADD COLUMN email_sent_at TIMESTAMPTZ;
    RAISE NOTICE 'GCP-STG-0074: Added delivery tracking columns';
  END IF;
END $$;

-- =============================================================================
-- Step 3: Index on pdf_gcs_path for lookup
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_invoices_pdf_gcs_path
  ON invoicing.invoices (pdf_gcs_path)
  WHERE pdf_gcs_path IS NOT NULL;
