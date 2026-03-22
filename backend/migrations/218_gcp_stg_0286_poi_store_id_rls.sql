-- GCP-STG-0286: Add store_id to purchase_order_items + RLS policy
-- Needed for store isolation: direct queries on order items must be scoped
-- ROLLBACK: DROP POLICY IF EXISTS rls_purchase_order_items_store ON orders.purchase_order_items; ALTER TABLE orders.purchase_order_items DISABLE ROW LEVEL SECURITY; DROP INDEX IF EXISTS idx_purchase_order_items_store_id; ALTER TABLE orders.purchase_order_items DROP COLUMN IF EXISTS store_id;

-- Step 1: Add store_id column (nullable initially for backfill)
ALTER TABLE orders.purchase_order_items
  ADD COLUMN IF NOT EXISTS store_id UUID;

-- Step 2: Backfill from parent purchase_orders
UPDATE orders.purchase_order_items poi
SET store_id = po.store_id
FROM orders.purchase_orders po
WHERE poi.order_id = po.id
  AND poi.store_id IS NULL;

-- Step 3: Make NOT NULL after backfill
ALTER TABLE orders.purchase_order_items
  ALTER COLUMN store_id SET NOT NULL;

-- Step 4: Index for store-scoped queries
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_store_id
  ON orders.purchase_order_items (store_id);

-- Step 5: Enable RLS and create policy (matches purchase_orders pattern)
ALTER TABLE orders.purchase_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_purchase_order_items_store ON orders.purchase_order_items;
CREATE POLICY rls_purchase_order_items_store
  ON orders.purchase_order_items FOR ALL
  USING (rls_store_check(store_id));
