-- GL-CRIT-0009: Normalize status values to lowercase
-- Migration 067
-- Converts all uppercase status values to lowercase and updates constraints

BEGIN;

-- ============================================================================
-- STEP 1: Normalize existing data to lowercase
-- ============================================================================

-- Normalize sales status
UPDATE public.sales SET status = LOWER(status) WHERE status <> LOWER(status);

-- Normalize payments status if exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'payments' AND table_name = 'sell_payments' AND column_name = 'status') THEN
        UPDATE payments.sell_payments SET status = LOWER(status) WHERE status <> LOWER(status);
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'payments' AND table_name = 'buy_payments' AND column_name = 'status') THEN
        UPDATE payments.buy_payments SET status = LOWER(status) WHERE status <> LOWER(status);
    END IF;
END $$;

-- ============================================================================
-- STEP 2: Update sales status constraint to only allow lowercase
-- ============================================================================
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS chk_sale_status;

ALTER TABLE public.sales ADD CONSTRAINT chk_sale_status CHECK (
  status IN (
    'pending',                           -- Draft sale
    'completed', 'paid_cash', 'paid_upi',-- Completed sale (lowercase only)
    'due',                               -- Due payment (lowercase only)
    'cancelled', 'voided'                -- Cancelled/voided
  )
);

-- ============================================================================
-- STEP 3: Update payments status constraints (if they exist with mixed case)
-- ============================================================================
DO $$
BEGIN
    -- sell_payments status constraint
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints
               WHERE table_schema = 'payments' AND table_name = 'sell_payments' AND constraint_name = 'chk_sell_payment_status') THEN
        ALTER TABLE payments.sell_payments DROP CONSTRAINT chk_sell_payment_status;
        ALTER TABLE payments.sell_payments ADD CONSTRAINT chk_sell_payment_status CHECK (
            status IN ('pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled')
        );
    END IF;

    -- buy_payments status constraint
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints
               WHERE table_schema = 'payments' AND table_name = 'buy_payments' AND constraint_name = 'chk_buy_payment_status') THEN
        ALTER TABLE payments.buy_payments DROP CONSTRAINT chk_buy_payment_status;
        ALTER TABLE payments.buy_payments ADD CONSTRAINT chk_buy_payment_status CHECK (
            status IN ('pending', 'processing', 'completed', 'failed', 'settled', 'cancelled')
        );
    END IF;
END $$;

-- ============================================================================
-- Add comment
-- ============================================================================
COMMENT ON CONSTRAINT chk_sale_status ON public.sales IS
'GL-CRIT-0009: Status values normalized to lowercase only. Mixed case no longer allowed.';

COMMIT;
