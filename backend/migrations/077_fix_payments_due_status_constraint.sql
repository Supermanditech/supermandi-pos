-- GO-LIVE Batch 4 Fix: Allow DUE status in payments and sales tables
-- Migration 077
-- 1. payments.status constraint only allowed PENDING, PAID, FAILED
--    but DUE payments need to use 'DUE' as the status value
-- 2. sales.payment_status constraint only allowed pending, paid, failed
--    but DUE payments need to use 'due' as the payment_status value

BEGIN;

-- =============================================================================
-- FIX 1: payments.status constraint
-- =============================================================================
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS chk_payment_status;

ALTER TABLE public.payments ADD CONSTRAINT chk_payment_status CHECK (
  status IN ('PENDING', 'PAID', 'FAILED', 'DUE')
);

COMMENT ON CONSTRAINT chk_payment_status ON public.payments IS
'GO-LIVE Batch 4: Updated to allow DUE status for credit/khata payments';

-- =============================================================================
-- FIX 2: sales.payment_status constraint
-- =============================================================================
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS chk_payment_status;

ALTER TABLE public.sales ADD CONSTRAINT chk_payment_status CHECK (
  payment_status IN ('pending', 'paid', 'partial', 'due', 'failed', 'refunded')
);

COMMENT ON CONSTRAINT chk_payment_status ON public.sales IS
'GO-LIVE Batch 4: Updated to allow due status for credit/khata payments';

COMMIT;
