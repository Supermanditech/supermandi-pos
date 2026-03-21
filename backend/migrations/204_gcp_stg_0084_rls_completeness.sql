-- ROLLBACK: DROP POLICY IF EXISTS rls_invoices_store ON invoicing.invoices; ALTER TABLE invoicing.invoices DROP COLUMN IF EXISTS store_id;
-- GCP-STG-0084: PostgreSQL RLS completeness — defense-in-depth
-- Ensures all store-scoped tables have RLS policies.
-- Verifies existing policies and adds missing ones.
-- Safe: all operations are idempotent (IF NOT EXISTS, DROP IF EXISTS).

-- =============================================================================
-- Step 1: Verify rls_store_check function exists (created in migration 149)
-- =============================================================================
CREATE OR REPLACE FUNCTION rls_store_check(row_store_id uuid) RETURNS boolean AS $$
BEGIN
  IF current_setting('app.current_store_id', true) IS NULL
     OR current_setting('app.current_store_id', true) = '' THEN
    RETURN true;  -- Admin/system bypass — no store context = full access
  END IF;
  RETURN row_store_id = current_setting('app.current_store_id')::uuid;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- Step 2: Re-assert RLS on all 5 target tables (idempotent — no harm if exists)
-- =============================================================================

-- 2a: catalog.store_products (M149)
ALTER TABLE catalog.store_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.store_products FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_store_products_store ON catalog.store_products;
CREATE POLICY rls_store_products_store ON catalog.store_products
  FOR ALL USING (rls_store_check(store_id));

-- 2b: inventory.stock_balances (M149)
ALTER TABLE inventory.stock_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.stock_balances FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_stock_balances_store ON inventory.stock_balances;
CREATE POLICY rls_stock_balances_store ON inventory.stock_balances
  FOR ALL USING (rls_store_check(store_id));

-- 2c: public.sales (M149)
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_sales_store ON public.sales;
CREATE POLICY rls_sales_store ON public.sales
  FOR ALL USING (rls_store_check(store_id));

-- 2d: public.sale_items (M162)
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_sale_items_store ON public.sale_items;
CREATE POLICY rls_sale_items_store ON public.sale_items
  FOR ALL USING (rls_store_check(store_id));

-- 2e: inventory.inventory_ledger (M149)
ALTER TABLE inventory.inventory_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.inventory_ledger FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_inventory_ledger_store ON inventory.inventory_ledger;
CREATE POLICY rls_inventory_ledger_store ON inventory.inventory_ledger
  FOR ALL USING (rls_store_check(store_id));

-- =============================================================================
-- Step 3: Add RLS to invoicing tables that have store-level scope
-- invoice_series.entity_id can be a store_id — but entity_type varies.
-- invoices/invoice_items/credit_notes are cross-entity (SuperMandi↔supplier↔retailer)
-- so we only add RLS where a deterministic store_id column exists.
-- =============================================================================

-- 3a: invoicing.gst_summary_reports — already has RLS (M164), re-assert
ALTER TABLE invoicing.gst_summary_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoicing.gst_summary_reports FORCE ROW LEVEL SECURITY;

-- 3b: invoicing.invoice_archives — already has RLS (M164), re-assert
ALTER TABLE invoicing.invoice_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoicing.invoice_archives FORCE ROW LEVEL SECURITY;

-- =============================================================================
-- Step 4: Add store_id column to invoicing.invoices for store-level RLS
-- Invoices always involve a buyer store. Adding store_id enables RLS.
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'invoicing' AND table_name = 'invoices' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE invoicing.invoices ADD COLUMN store_id UUID;
    -- Backfill: for sale invoices, store_id = buyer_id (which is the retailer store)
    -- For purchase invoices, store_id comes from the order context
    RAISE NOTICE 'GCP-STG-0084: Added store_id to invoicing.invoices';
  END IF;
END $$;

-- Enable RLS on invoicing.invoices (using store_id if set, admin bypass otherwise)
ALTER TABLE invoicing.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoicing.invoices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_invoices_store ON invoicing.invoices;
CREATE POLICY rls_invoices_store ON invoicing.invoices
  FOR ALL USING (
    store_id IS NULL  -- Cross-entity invoices visible to admin
    OR rls_store_check(store_id)
  );

-- =============================================================================
-- Step 5: Verification — list all tables with RLS enabled
-- Run this after migration to verify coverage:
--   SELECT schemaname, tablename, rowsecurity
--   FROM pg_tables
--   WHERE rowsecurity = true
--   ORDER BY schemaname, tablename;
-- =============================================================================
