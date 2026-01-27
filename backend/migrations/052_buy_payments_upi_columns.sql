-- SM-017: Add UPI columns to buy_payments table

-- Add UPI-specific columns for tracking payment details
ALTER TABLE payments.buy_payments
  ADD COLUMN IF NOT EXISTS upi_txn_ref VARCHAR(100),
  ADD COLUMN IF NOT EXISTS upi_deep_link TEXT,
  ADD COLUMN IF NOT EXISTS upi_vpa VARCHAR(100),
  ADD COLUMN IF NOT EXISTS upi_payer_ref VARCHAR(100);

-- Update status constraint to include 'initiated' and 'approved'
ALTER TABLE payments.buy_payments
  DROP CONSTRAINT IF EXISTS chk_buy_payments_status;

ALTER TABLE payments.buy_payments
  ADD CONSTRAINT chk_buy_payments_status
  CHECK (status IN ('pending', 'initiated', 'processing', 'completed', 'approved', 'failed'));

-- Add payment_status column to purchase_orders if not exists
ALTER TABLE orders.purchase_orders
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT NULL;

-- Create supplier_payouts table for SM-018
CREATE TABLE IF NOT EXISTS payments.supplier_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL,
  purchase_order_id UUID,
  payment_id UUID,
  amount_minor INTEGER NOT NULL,
  payout_method VARCHAR(20) DEFAULT 'UPI',
  payout_utr VARCHAR(100),
  payout_account_id VARCHAR(100),
  status VARCHAR(20) DEFAULT 'scheduled',
  scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  failure_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_payouts_supplier
  ON payments.supplier_payouts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payouts_status
  ON payments.supplier_payouts(status) WHERE status = 'scheduled';
