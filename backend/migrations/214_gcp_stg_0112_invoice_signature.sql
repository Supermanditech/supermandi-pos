-- GCP-STG-0112: Invoice digital signature + structured JSON immutability
-- ROLLBACK: ALTER TABLE invoicing.invoices DROP COLUMN IF EXISTS pdf_signature; ALTER TABLE invoicing.invoices DROP COLUMN IF EXISTS json_gcs_path;

ALTER TABLE invoicing.invoices
  ADD COLUMN IF NOT EXISTS pdf_signature TEXT,
  ADD COLUMN IF NOT EXISTS json_gcs_path TEXT;

COMMENT ON COLUMN invoicing.invoices.pdf_signature IS 'GCP-STG-0112: HMAC-SHA256 signature of PDF buffer for integrity verification';
COMMENT ON COLUMN invoicing.invoices.json_gcs_path IS 'GCP-STG-0112: GCS path to structured JSON alongside PDF';
