-- GCP-STG-0362: Drop dead schema — invoice_dispatch_logs table never used by application code
-- Created by migration 196_principal_procurement_support.sql but zero INSERT/SELECT/UPDATE in backend/src/
-- WhatsApp dispatch tracking uses whatsapp.message_logs instead
--
-- ROLLBACK:
-- CREATE TABLE IF NOT EXISTS public.invoice_dispatch_logs (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   invoice_id UUID NOT NULL,
--   invoice_type VARCHAR(30) NOT NULL,
--   recipient_phone VARCHAR(20),
--   recipient_role VARCHAR(20) NOT NULL,
--   dispatched_at TIMESTAMPTZ DEFAULT NOW(),
--   status VARCHAR(20) NOT NULL DEFAULT 'pending_retry',
--   retry_count INT DEFAULT 0,
--   last_error TEXT,
--   created_at TIMESTAMPTZ DEFAULT NOW()
-- );
-- ALTER TABLE public.invoice_dispatch_logs ADD CONSTRAINT chk_invoice_dispatch_type CHECK (invoice_type IN ('SUPPLIER_TO_SUPERMANDI', 'SUPERMANDI_TO_RETAILER'));
-- ALTER TABLE public.invoice_dispatch_logs ADD CONSTRAINT chk_dispatch_status CHECK (status IN ('sent', 'failed', 'pending_retry'));
-- CREATE INDEX IF NOT EXISTS idx_invoice_dispatch_invoice_id ON public.invoice_dispatch_logs (invoice_id);
-- CREATE INDEX IF NOT EXISTS idx_invoice_dispatch_status ON public.invoice_dispatch_logs (status) WHERE status != 'sent';

-- Drop indexes first (CASCADE will handle constraints)
DROP INDEX IF EXISTS idx_invoice_dispatch_invoice_id;
DROP INDEX IF EXISTS idx_invoice_dispatch_status;

-- Drop the table (CASCADE drops CHECK constraints automatically)
DROP TABLE IF EXISTS public.invoice_dispatch_logs CASCADE;
