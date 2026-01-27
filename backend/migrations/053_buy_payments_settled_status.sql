-- SM-018: Add 'settled' status for completed supplier payouts

-- Update buy_payments status constraint to include 'settled'
ALTER TABLE payments.buy_payments
  DROP CONSTRAINT IF EXISTS chk_buy_payments_status;

ALTER TABLE payments.buy_payments
  ADD CONSTRAINT chk_buy_payments_status
  CHECK (status IN ('pending', 'initiated', 'processing', 'completed', 'approved', 'failed', 'settled'));

-- Add completed_at column if not exists
ALTER TABLE payments.buy_payments
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

-- Add index for settled payouts (for reconciliation queries)
CREATE INDEX IF NOT EXISTS idx_buy_payments_settled
  ON payments.buy_payments(status, completed_at)
  WHERE status = 'settled';

-- Update supplier_payouts status constraint
ALTER TABLE payments.supplier_payouts
  DROP CONSTRAINT IF EXISTS chk_supplier_payouts_status;

ALTER TABLE payments.supplier_payouts
  ADD CONSTRAINT chk_supplier_payouts_status
  CHECK (status IN ('scheduled', 'processing', 'completed', 'failed'));

-- Add index for processing payouts (for monitoring)
CREATE INDEX IF NOT EXISTS idx_supplier_payouts_processing
  ON payments.supplier_payouts(status, processed_at)
  WHERE status = 'processing';

-- Update purchase_orders payment_status constraint to include 'settled'
ALTER TABLE orders.purchase_orders
  DROP CONSTRAINT IF EXISTS chk_po_payment_status;

ALTER TABLE orders.purchase_orders
  ADD CONSTRAINT chk_po_payment_status
  CHECK (payment_status IN ('pending', 'partial', 'paid', 'settled', 'bnpl_pending', 'credit_used'));
