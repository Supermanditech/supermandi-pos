-- T-216: PostgreSQL Row-Level Security (RLS) for store data isolation
-- Defense-in-depth: DB-level enforcement alongside application-level WHERE clauses
-- Uses session variable app.current_store_id set by backend before each query

-- =============================================================================
-- 1. Enable RLS on all store-scoped tables (27 tables across 7 schemas)
-- =============================================================================

-- Public schema
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_sequences ENABLE ROW LEVEL SECURITY;

-- Platform schema
ALTER TABLE platform.customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.compliance_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.staff_shifts ENABLE ROW LEVEL SECURITY;

-- Catalog schema
ALTER TABLE catalog.store_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.catalog_mapping_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.translation_overrides ENABLE ROW LEVEL SECURITY;

-- Inventory schema
ALTER TABLE inventory.inventory_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.stock_balances ENABLE ROW LEVEL SECURITY;

-- Orders schema
ALTER TABLE orders.order_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders.daily_closings ENABLE ROW LEVEL SECURITY;

-- Supplier schema
ALTER TABLE supplier.supplier_store_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier.supplier_requests ENABLE ROW LEVEL SECURITY;

-- Payments schema
ALTER TABLE payments.sell_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments.buy_payments ENABLE ROW LEVEL SECURITY;

-- Reorder schema
ALTER TABLE reorder.store_reorder_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE reorder.reorder_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE reorder.pending_reorders ENABLE ROW LEVEL SECURITY;
ALTER TABLE reorder.reorder_runs ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 2. Create RLS policies using session variable
--    When app.current_store_id is SET → filter by store_id
--    When app.current_store_id is NOT SET (empty string) → allow all (admin/system queries)
--    This ensures backward compatibility: queries without SET LOCAL still work
-- =============================================================================

-- Helper: Check if store context is set; if not, allow access (admin bypass)
-- This prevents breaking admin/system queries that don't set store context
CREATE OR REPLACE FUNCTION rls_store_check(row_store_id uuid) RETURNS boolean AS $$
BEGIN
  -- If no store context set (empty or not configured), allow access (admin/system)
  IF current_setting('app.current_store_id', true) IS NULL
     OR current_setting('app.current_store_id', true) = '' THEN
    RETURN true;
  END IF;
  -- Otherwise enforce store isolation
  RETURN row_store_id = current_setting('app.current_store_id')::uuid;
END;
$$ LANGUAGE plpgsql STABLE;

-- Public schema policies (DROP IF EXISTS for idempotency — re-run safe)
DROP POLICY IF EXISTS rls_sales_store ON public.sales;
CREATE POLICY rls_sales_store ON public.sales FOR ALL USING (rls_store_check(store_id));
DROP POLICY IF EXISTS rls_collections_store ON public.collections;
CREATE POLICY rls_collections_store ON public.collections FOR ALL USING (rls_store_check(store_id));
DROP POLICY IF EXISTS rls_bill_sequences_store ON public.bill_sequences;
CREATE POLICY rls_bill_sequences_store ON public.bill_sequences FOR ALL USING (rls_store_check(store_id));

-- Platform schema policies
DROP POLICY IF EXISTS rls_customer_profiles_store ON platform.customer_profiles;
CREATE POLICY rls_customer_profiles_store ON platform.customer_profiles FOR ALL USING (rls_store_check(store_id));
DROP POLICY IF EXISTS rls_compliance_documents_store ON platform.compliance_documents;
CREATE POLICY rls_compliance_documents_store ON platform.compliance_documents FOR ALL USING (rls_store_check(store_id));
DROP POLICY IF EXISTS rls_staff_shifts_store ON platform.staff_shifts;
CREATE POLICY rls_staff_shifts_store ON platform.staff_shifts FOR ALL USING (rls_store_check(store_id));

-- Catalog schema policies
DROP POLICY IF EXISTS rls_store_products_store ON catalog.store_products;
CREATE POLICY rls_store_products_store ON catalog.store_products FOR ALL USING (rls_store_check(store_id));
DROP POLICY IF EXISTS rls_catalog_mapping_log_store ON catalog.catalog_mapping_log;
CREATE POLICY rls_catalog_mapping_log_store ON catalog.catalog_mapping_log FOR ALL USING (rls_store_check(store_id));
DROP POLICY IF EXISTS rls_translation_overrides_store ON catalog.translation_overrides;
CREATE POLICY rls_translation_overrides_store ON catalog.translation_overrides FOR ALL USING (rls_store_check(store_id));

-- Inventory schema policies
DROP POLICY IF EXISTS rls_inventory_ledger_store ON inventory.inventory_ledger;
CREATE POLICY rls_inventory_ledger_store ON inventory.inventory_ledger FOR ALL USING (rls_store_check(store_id));
DROP POLICY IF EXISTS rls_stock_balances_store ON inventory.stock_balances;
CREATE POLICY rls_stock_balances_store ON inventory.stock_balances FOR ALL USING (rls_store_check(store_id));

-- Orders schema policies
DROP POLICY IF EXISTS rls_order_sequences_store ON orders.order_sequences;
CREATE POLICY rls_order_sequences_store ON orders.order_sequences FOR ALL USING (rls_store_check(store_id));
DROP POLICY IF EXISTS rls_purchase_orders_store ON orders.purchase_orders;
CREATE POLICY rls_purchase_orders_store ON orders.purchase_orders FOR ALL USING (rls_store_check(store_id));
DROP POLICY IF EXISTS rls_daily_closings_store ON orders.daily_closings;
CREATE POLICY rls_daily_closings_store ON orders.daily_closings FOR ALL USING (rls_store_check(store_id));

-- Supplier schema policies
DROP POLICY IF EXISTS rls_supplier_store_links_store ON supplier.supplier_store_links;
CREATE POLICY rls_supplier_store_links_store ON supplier.supplier_store_links FOR ALL USING (rls_store_check(store_id));
DROP POLICY IF EXISTS rls_supplier_requests_store ON supplier.supplier_requests;
CREATE POLICY rls_supplier_requests_store ON supplier.supplier_requests FOR ALL USING (rls_store_check(store_id));

-- Payments schema policies
DROP POLICY IF EXISTS rls_sell_payments_store ON payments.sell_payments;
CREATE POLICY rls_sell_payments_store ON payments.sell_payments FOR ALL USING (rls_store_check(store_id));
DROP POLICY IF EXISTS rls_buy_payments_store ON payments.buy_payments;
CREATE POLICY rls_buy_payments_store ON payments.buy_payments FOR ALL USING (rls_store_check(store_id));

-- Reorder schema policies
DROP POLICY IF EXISTS rls_store_reorder_settings_store ON reorder.store_reorder_settings;
CREATE POLICY rls_store_reorder_settings_store ON reorder.store_reorder_settings FOR ALL USING (rls_store_check(store_id));
DROP POLICY IF EXISTS rls_reorder_policies_store ON reorder.reorder_policies;
CREATE POLICY rls_reorder_policies_store ON reorder.reorder_policies FOR ALL USING (rls_store_check(store_id));
DROP POLICY IF EXISTS rls_pending_reorders_store ON reorder.pending_reorders;
CREATE POLICY rls_pending_reorders_store ON reorder.pending_reorders FOR ALL USING (rls_store_check(store_id));
DROP POLICY IF EXISTS rls_reorder_runs_store ON reorder.reorder_runs;
CREATE POLICY rls_reorder_runs_store ON reorder.reorder_runs FOR ALL USING (rls_store_check(store_id));

-- =============================================================================
-- 3. IMPORTANT: The table owner (supermandi user) bypasses RLS by default.
--    We must FORCE RLS on the owner to make policies apply to application queries.
-- =============================================================================

ALTER TABLE public.sales FORCE ROW LEVEL SECURITY;
ALTER TABLE public.collections FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bill_sequences FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.customer_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.compliance_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.staff_shifts FORCE ROW LEVEL SECURITY;
ALTER TABLE catalog.store_products FORCE ROW LEVEL SECURITY;
ALTER TABLE catalog.catalog_mapping_log FORCE ROW LEVEL SECURITY;
ALTER TABLE catalog.translation_overrides FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory.inventory_ledger FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory.stock_balances FORCE ROW LEVEL SECURITY;
ALTER TABLE orders.order_sequences FORCE ROW LEVEL SECURITY;
ALTER TABLE orders.purchase_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE orders.daily_closings FORCE ROW LEVEL SECURITY;
ALTER TABLE supplier.supplier_store_links FORCE ROW LEVEL SECURITY;
ALTER TABLE supplier.supplier_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE payments.sell_payments FORCE ROW LEVEL SECURITY;
ALTER TABLE payments.buy_payments FORCE ROW LEVEL SECURITY;
ALTER TABLE reorder.store_reorder_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE reorder.reorder_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE reorder.pending_reorders FORCE ROW LEVEL SECURITY;
ALTER TABLE reorder.reorder_runs FORCE ROW LEVEL SECURITY;
