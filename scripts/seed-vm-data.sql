-- SuperMandi VM Seed Data Script (v2)
-- GO-LIVE-003: Creates test data for all screens
-- Updated to match actual production schema
-- Run with: docker exec -i supermandi-postgres psql -U supermandi -d supermandi < seed-vm-data.sql

-- =============================================================================
-- SCHEMA NOTES (from actual production DB):
-- - All IDs are UUIDs, not VARCHAR
-- - platform.stores: id, name, code, phone, email, address_*, city, state, pincode, timezone, currency, status
-- - supplier.suppliers: id, gstin, pan, business_name, trade_name, primary_contact_*, address_*, verification_status, status
-- - catalog.products: id, name, description, brand, category, unit, pack_size, primary_barcode, hsn_code, default_gst_rate, is_active
-- - catalog.store_products: id, store_id, product_id, sell_price, mrp, display_name, is_active, current_stock
-- - catalog.supplier_products: id, supplier_id, supplier_sku, barcode, name, category, brand, unit, pack_size, mrp, purchase_price, stock_quantity, stock_status, moq, max_qty, is_active
-- - inventory.stock_balances: store_id, product_id, current_qty, last_ledger_id, updated_at (NO id column)
-- - inventory.inventory_ledger: id, store_id, product_id, delta_qty, transaction_type, reference_type, reference_id, stock_before, stock_after, unit_cost, notes
--   - transaction_type: 'sale', 'sale_return', 'purchase_received', 'adjustment'
--   - reference_type: NULL, 'sale', 'po', 'return', 'manual'
--   - CHECK: stock_before + delta_qty = stock_after
-- - orders.purchase_orders: id, order_number, store_id, supplier_id, order_type, status, subtotal, tax_amount, total_amount, etc
-- - orders.purchase_order_items: id, order_id, supplier_product_id, product_id, product_name, supplier_sku, barcode, ordered_quantity, received_quantity, unit_price, mrp, line_total, status
-- - reorder.pending_reorders: id, store_id, product_id, product_name, barcode, current_stock, min_threshold, target_stock, suggested_quantity, suggested_supplier_*, supplier_product_id, status
-- - reorder.reorder_policies: id, store_id, product_id, min_stock, target_stock, preferred_supplier_id, is_enabled
-- - reorder.store_reorder_settings: store_id, reorder_enabled, require_approval, notify_on_low_stock
-- =============================================================================

-- =============================================================================
-- INVENTORY LEDGER SEED DATA (for Purchase History, Sales Statement, Stock Statement)
-- =============================================================================

-- Note: Run this only if inventory_ledger is empty
-- The database may already have stores, products, suppliers from the API seeding process

INSERT INTO inventory.inventory_ledger (
  id, store_id, product_id, delta_qty, transaction_type,
  reference_type, reference_id, stock_before, stock_after,
  unit_cost, notes, created_at
)
SELECT * FROM (VALUES
  -- Opening stock entries (7 days ago) - adjustment with manual reference
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001'::uuid, 'c0000000-0000-0000-0000-000000000001'::uuid, 100, 'adjustment', 'manual', 'OPEN-001', 0, 100, 2200, 'Opening stock - Tata Salt', NOW() - INTERVAL '7 days'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001'::uuid, 'c0000000-0000-0000-0000-000000000002'::uuid, 50, 'adjustment', 'manual', 'OPEN-001', 0, 50, 28000, 'Opening stock - Aashirvaad Atta', NOW() - INTERVAL '7 days'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001'::uuid, 'c0000000-0000-0000-0000-000000000003'::uuid, 40, 'adjustment', 'manual', 'OPEN-001', 0, 40, 14500, 'Opening stock - Fortune Oil', NOW() - INTERVAL '7 days'),

  -- Purchase received (5 days ago) - purchase_received with po reference
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001'::uuid, 'c0000000-0000-0000-0000-000000000001'::uuid, 50, 'purchase_received', 'po', 'GRN-001', 100, 150, 2100, 'GRN from Fresh Farms', NOW() - INTERVAL '5 days'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001'::uuid, 'c0000000-0000-0000-0000-000000000002'::uuid, 30, 'purchase_received', 'po', 'GRN-001', 50, 80, 27500, 'GRN from Fresh Farms', NOW() - INTERVAL '5 days'),

  -- Sales (4 days ago) - sale with sale reference
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001'::uuid, 'c0000000-0000-0000-0000-000000000001'::uuid, -15, 'sale', 'sale', 'SALE-001', 150, 135, 2500, 'Sale', NOW() - INTERVAL '4 days'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001'::uuid, 'c0000000-0000-0000-0000-000000000002'::uuid, -5, 'sale', 'sale', 'SALE-001', 80, 75, 32000, 'Sale', NOW() - INTERVAL '4 days'),

  -- More sales (3 days ago)
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001'::uuid, 'c0000000-0000-0000-0000-000000000001'::uuid, -20, 'sale', 'sale', 'SALE-002', 135, 115, 2500, 'Sale', NOW() - INTERVAL '3 days'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001'::uuid, 'c0000000-0000-0000-0000-000000000003'::uuid, -8, 'sale', 'sale', 'SALE-002', 40, 32, 16000, 'Sale', NOW() - INTERVAL '3 days'),

  -- Purchase (2 days ago)
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001'::uuid, 'c0000000-0000-0000-0000-000000000003'::uuid, 25, 'purchase_received', 'po', 'GRN-002', 32, 57, 14200, 'GRN from Organic Valley', NOW() - INTERVAL '2 days'),

  -- Sales (yesterday)
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001'::uuid, 'c0000000-0000-0000-0000-000000000001'::uuid, -10, 'sale', 'sale', 'SALE-003', 115, 105, 2500, 'Sale', NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001'::uuid, 'c0000000-0000-0000-0000-000000000002'::uuid, -3, 'sale', 'sale', 'SALE-003', 75, 72, 32000, 'Sale', NOW() - INTERVAL '1 day'),

  -- Today's transactions
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001'::uuid, 'c0000000-0000-0000-0000-000000000001'::uuid, -5, 'sale', 'sale', 'SALE-004', 105, 100, 2500, 'Today sale', NOW() - INTERVAL '2 hours'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001'::uuid, 'c0000000-0000-0000-0000-000000000003'::uuid, -4, 'sale', 'sale', 'SALE-004', 57, 53, 16000, 'Today sale', NOW() - INTERVAL '2 hours'),

  -- More product transactions for variety
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid, 25, 'adjustment', 'manual', 'OPEN-002', 0, 25, 55000, 'Opening stock - Rice', NOW() - INTERVAL '6 days'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid, -3, 'sale', 'sale', 'SALE-005', 25, 22, 65000, 'Rice sale', NOW() - INTERVAL '2 days'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001'::uuid, 'b0000000-0000-0000-0000-000000000002'::uuid, 20, 'adjustment', 'manual', 'OPEN-002', 0, 20, 42000, 'Opening stock - Wheat', NOW() - INTERVAL '6 days'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001'::uuid, 'b0000000-0000-0000-0000-000000000002'::uuid, 15, 'purchase_received', 'po', 'GRN-003', 20, 35, 41000, 'GRN from Metro', NOW() - INTERVAL '3 days'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001'::uuid, 'b0000000-0000-0000-0000-000000000002'::uuid, -8, 'sale', 'sale', 'SALE-006', 35, 27, 48000, 'Wheat sale', NOW() - INTERVAL '1 day')
) AS t(id, store_id, product_id, delta_qty, transaction_type, reference_type, reference_id, stock_before, stock_after, unit_cost, notes, created_at)
WHERE NOT EXISTS (SELECT 1 FROM inventory.inventory_ledger LIMIT 1);

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

SELECT 'platform.stores' as table_name, COUNT(*) as count FROM platform.stores
UNION ALL SELECT 'catalog.products', COUNT(*) FROM catalog.products
UNION ALL SELECT 'catalog.store_products', COUNT(*) FROM catalog.store_products
UNION ALL SELECT 'catalog.supplier_products', COUNT(*) FROM catalog.supplier_products
UNION ALL SELECT 'supplier.suppliers', COUNT(*) FROM supplier.suppliers
UNION ALL SELECT 'inventory.stock_balances', COUNT(*) FROM inventory.stock_balances
UNION ALL SELECT 'inventory.inventory_ledger', COUNT(*) FROM inventory.inventory_ledger
UNION ALL SELECT 'orders.purchase_orders', COUNT(*) FROM orders.purchase_orders
UNION ALL SELECT 'orders.purchase_order_items', COUNT(*) FROM orders.purchase_order_items
UNION ALL SELECT 'reorder.pending_reorders', COUNT(*) FROM reorder.pending_reorders
UNION ALL SELECT 'reorder.reorder_policies', COUNT(*) FROM reorder.reorder_policies
UNION ALL SELECT 'reorder.store_reorder_settings', COUNT(*) FROM reorder.store_reorder_settings
ORDER BY table_name;

-- Expected counts (minimum for non-empty screens):
-- stores: >= 1
-- products: >= 10
-- store_products: >= 10
-- supplier_products: >= 10
-- suppliers: >= 1
-- stock_balances: >= 10
-- inventory_ledger: >= 10
-- purchase_orders: >= 5
-- purchase_order_items: >= 10
-- pending_reorders: >= 3
-- reorder_policies: >= 5
-- store_reorder_settings: >= 1

SELECT 'Seed verification complete!' as status;
