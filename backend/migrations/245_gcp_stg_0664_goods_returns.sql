-- GCP-STG-0664: Goods return table for supplier returns
-- ROLLBACK: DROP TABLE IF EXISTS orders.goods_returns;
CREATE TABLE IF NOT EXISTS orders.goods_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  store_id UUID NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','COMPLETED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_goods_returns_store ON orders.goods_returns(store_id);
