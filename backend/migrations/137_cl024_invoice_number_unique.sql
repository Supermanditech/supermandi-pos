-- Migration: 137_cl024_invoice_number_unique
-- CL-024: Add UNIQUE constraint on invoice_number to prevent duplicates
-- Also fix the invoice_series unique constraint for NULL entity_id

BEGIN;

-- Add UNIQUE index on invoice_number (was previously a regular index)
DROP INDEX IF EXISTS invoicing.idx_invoices_number;
CREATE UNIQUE INDEX IF NOT EXISTS ux_invoices_number
  ON invoicing.invoices (invoice_number);

-- Fix invoice_series: migrate NULL entity_id to sentinel UUID
-- This prevents PostgreSQL's NULL != NULL uniqueness issue
UPDATE invoicing.invoice_series
  SET entity_id = '00000000-0000-0000-0000-000000000000'
  WHERE entity_id IS NULL;

-- Add NOT NULL constraint now that all NULLs are replaced
ALTER TABLE invoicing.invoice_series ALTER COLUMN entity_id SET NOT NULL;

COMMIT;
