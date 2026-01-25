-- Migration: 040_payments_and_sales_status
-- GAP-003: Create payments table
-- GAP-004: Fix sales status constraint to allow PAID_CASH, PAID_UPI, PENDING, DUE
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- GAP-003: TABLE: public.payments
-- UPI payment tracking for sales transactions
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  sale_id VARCHAR(100) NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,

  -- Payment details
  mode VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  provider_ref VARCHAR(255),  -- UPI transaction reference

  -- Timestamps
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_payment_mode CHECK (
    mode IN ('CASH', 'UPI', 'DUE')
  ),
  CONSTRAINT chk_payment_status CHECK (
    status IN ('PENDING', 'PAID', 'FAILED')
  )
);

-- Index for sale lookup
CREATE INDEX IF NOT EXISTS payments_sale_idx
  ON public.payments (sale_id);

-- Index for status queries
CREATE INDEX IF NOT EXISTS payments_status_idx
  ON public.payments (status)
  WHERE status = 'PENDING';

-- =============================================================================
-- GAP-004: Fix sales status constraint
-- Allow PAID_CASH, PAID_UPI, PENDING (uppercase), DUE in addition to existing
-- =============================================================================
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS chk_sale_status;

ALTER TABLE public.sales ADD CONSTRAINT chk_sale_status CHECK (
  status IN (
    'pending', 'PENDING',           -- Draft sale
    'completed', 'PAID_CASH', 'PAID_UPI',  -- Completed sale
    'DUE',                          -- Due payment
    'cancelled', 'voided'           -- Cancelled/voided
  )
);

COMMIT;
