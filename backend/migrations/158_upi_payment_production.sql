-- Migration: 158_upi_payment_production
-- UPI-PAY-E2E: Upgrade public.payments table for production-grade UPI QR flow
-- Adds: expiry tracking, UPI VPA audit, Razorpay order tracking, idempotency, device audit
-- All new columns are nullable — fully backward compatible

BEGIN;

-- 1. Expiry tracking for QR code countdown
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- 2. UPI VPA at the time of payment creation (audit trail)
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS upi_vpa VARCHAR(100);

-- 3. Razorpay order ID for gateway tracking (optional, when Razorpay configured)
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS razorpay_order_id VARCHAR(100);

-- 4. Idempotency key to prevent duplicate payment records
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(150);

-- 5. Device ID for audit trail
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS device_id VARCHAR(100);

-- 6. Expand status constraint to include EXPIRED
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS chk_payment_status;
ALTER TABLE public.payments ADD CONSTRAINT chk_payment_status CHECK (
  status IN ('PENDING', 'PAID', 'FAILED', 'DUE', 'EXPIRED')
);

-- 7. Unique index on idempotency_key (partial — only non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency
  ON public.payments(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 8. Index for finding pending UPI payments per sale (idempotency lookup)
CREATE INDEX IF NOT EXISTS idx_payments_sale_upi_pending
  ON public.payments(sale_id, mode, status)
  WHERE mode = 'UPI' AND status = 'PENDING';

-- 9. Index for Razorpay order lookups (webhook bridge)
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_order
  ON public.payments(razorpay_order_id)
  WHERE razorpay_order_id IS NOT NULL;

-- 10. Expand sales status constraint to include EXPIRED
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS chk_sale_status;
ALTER TABLE public.sales ADD CONSTRAINT chk_sale_status CHECK (
  status IN (
    'pending', 'PENDING',
    'completed', 'PAID_CASH', 'PAID_UPI',
    'DUE',
    'cancelled', 'voided',
    'EXPIRED'
  )
);

COMMIT;
