-- GCP-STG-0392: Batch-level stock tracking — multiple batches per product with separate expiry
-- ROLLBACK: DROP TABLE IF EXISTS inventory.stock_batches;

CREATE TABLE IF NOT EXISTS inventory.stock_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  product_id UUID NOT NULL,
  batch_number VARCHAR(100),
  expiry_date DATE,
  current_qty NUMERIC(12,3) NOT NULL DEFAULT 0,
  grn_receive_id UUID,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_batch_qty CHECK (current_qty >= 0)
);

CREATE INDEX IF NOT EXISTS idx_stock_batches_store_product
  ON inventory.stock_batches (store_id, product_id);

CREATE INDEX IF NOT EXISTS idx_stock_batches_expiry
  ON inventory.stock_batches (store_id, expiry_date)
  WHERE current_qty > 0;
