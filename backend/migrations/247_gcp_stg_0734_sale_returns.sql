-- GCP-STG-0734: Sale returns table for item-level return tracking
-- ROLLBACK: DROP TABLE IF EXISTS orders.sale_returns;

CREATE TABLE IF NOT EXISTS orders.sale_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  sale_id UUID NOT NULL,
  return_ref VARCHAR(20) NOT NULL,
  items JSONB NOT NULL DEFAULT '[]',
  refund_type VARCHAR(20) NOT NULL DEFAULT 'CASH',
  total_refund_minor BIGINT NOT NULL DEFAULT 0,
  reason TEXT,
  returned_by VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_refund_type CHECK (refund_type IN ('CASH', 'STORE_CREDIT'))
);

CREATE INDEX IF NOT EXISTS idx_sale_returns_store_sale
  ON orders.sale_returns (store_id, sale_id);

CREATE INDEX IF NOT EXISTS idx_sale_returns_created
  ON orders.sale_returns (store_id, created_at DESC);
