BEGIN;

CREATE TABLE IF NOT EXISTS inventory_ledger (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  global_product_id TEXT NOT NULL REFERENCES global_products(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_cost_minor INTEGER NULL,
  unit_sell_minor INTEGER NULL,
  reason TEXT NULL,
  reference_type TEXT NULL,
  reference_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inventory_ledger_store_id_idx
  ON inventory_ledger (store_id);

CREATE INDEX IF NOT EXISTS inventory_ledger_product_id_idx
  ON inventory_ledger (global_product_id);

CREATE INDEX IF NOT EXISTS inventory_ledger_store_product_idx
  ON inventory_ledger (store_id, global_product_id);

CREATE INDEX IF NOT EXISTS inventory_ledger_reference_idx
  ON inventory_ledger (reference_type, reference_id);

COMMIT;
