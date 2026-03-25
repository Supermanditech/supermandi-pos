-- GCP-STG-0732: Customer credit ledger for Udhar tracking
-- ROLLBACK: DROP TABLE IF EXISTS orders.customer_ledger;
CREATE TABLE IF NOT EXISTS orders.customer_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  sale_id UUID,
  type TEXT NOT NULL CHECK (type IN ('CREDIT', 'PAYMENT', 'ADJUSTMENT')),
  amount_minor BIGINT NOT NULL,
  balance_after_minor BIGINT NOT NULL DEFAULT 0,
  note TEXT,
  payment_method TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_store ON orders.customer_ledger(store_id);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_customer ON orders.customer_ledger(store_id, customer_id);
