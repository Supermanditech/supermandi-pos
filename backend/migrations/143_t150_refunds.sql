-- Migration: 143_t150_refunds
-- T-150: Refunds table for sale returns and adjustments
-- Tracks refund requests, approval workflow, and processing
-- Links to public.sales (sale_id is VARCHAR(100) to match sales.id)
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- TABLE: orders.refunds
-- Refund records linked to sales
-- =============================================================================
CREATE TABLE IF NOT EXISTS orders.refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Store isolation
  store_id UUID NOT NULL REFERENCES platform.stores(id),

  -- Link to original sale (VARCHAR(100) to match public.sales.id)
  sale_id VARCHAR(100) NOT NULL REFERENCES public.sales(id),

  -- Link to original payment (optional, UUID references payments.sell_payments.id)
  original_payment_id UUID,

  -- Refund amount in paise
  refund_amount_minor BIGINT NOT NULL,

  -- Status workflow: pending -> approved -> processed | rejected
  status VARCHAR(20) NOT NULL DEFAULT 'pending',

  -- How the refund is issued
  refund_method VARCHAR(20),

  -- Reason for refund
  reason TEXT,

  -- Which items were returned (JSONB array of {product_id, quantity, amount_minor})
  items JSONB,

  -- Staff who processed the refund
  processed_by UUID,
  processed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_refund_status CHECK (
    status IN ('pending', 'approved', 'processed', 'rejected')
  ),
  CONSTRAINT chk_refund_method CHECK (
    refund_method IS NULL OR refund_method IN ('cash', 'upi', 'khata', 'adjustment')
  ),
  CONSTRAINT chk_refund_amount CHECK (refund_amount_minor > 0)
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_refunds_updated_at ON orders.refunds;
CREATE TRIGGER update_refunds_updated_at
  BEFORE UPDATE ON orders.refunds
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- Primary lookup: refunds for a sale at a store
CREATE INDEX IF NOT EXISTS idx_refunds_store_sale
  ON orders.refunds (store_id, sale_id);

-- Store-level listing
CREATE INDEX IF NOT EXISTS idx_refunds_store_status
  ON orders.refunds (store_id, status, created_at DESC);

-- Pending refunds (for approval queue)
CREATE INDEX IF NOT EXISTS idx_refunds_pending
  ON orders.refunds (store_id, created_at DESC)
  WHERE status = 'pending';

COMMENT ON TABLE orders.refunds IS
  'Refund records linked to sales. Tracks approval workflow (pending->approved->processed) and items returned.';

COMMIT;
