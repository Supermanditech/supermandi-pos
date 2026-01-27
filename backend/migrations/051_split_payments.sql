-- SM-013: Add split payment support
-- Adds is_split flag to sell_payments table

-- Add is_split column to track split payment records
ALTER TABLE payments.sell_payments
  ADD COLUMN IF NOT EXISTS is_split BOOLEAN DEFAULT false;

-- Add SPLIT to sales.payment_mode constraint
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS chk_payment_mode;
ALTER TABLE public.sales ADD CONSTRAINT chk_payment_mode
  CHECK (payment_mode IS NULL OR payment_mode IN ('CASH', 'UPI', 'DUE', 'SPLIT'));

-- Index for finding split payments by sale
CREATE INDEX IF NOT EXISTS idx_sell_payments_split
  ON payments.sell_payments(sale_id, is_split)
  WHERE is_split = true;

-- Add 'awaiting_cash' status for split payments where UPI completed but cash pending
-- Update the check constraint to allow new statuses
ALTER TABLE payments.sell_payments
  DROP CONSTRAINT IF EXISTS chk_sell_payments_status;

ALTER TABLE payments.sell_payments
  ADD CONSTRAINT chk_sell_payments_status
  CHECK (status IN ('pending', 'initiated', 'completed', 'failed', 'awaiting_cash'));
