-- GL-CRIT-0008: Add missing foreign key constraints across tables
-- This migration adds FK constraints that were identified as missing during the go-live audit
-- Run with care on production - may fail if orphaned records exist

-- ============================================================================
-- INVENTORY TABLES
-- ============================================================================

-- inventory.inventory_ledger -> platform.stores
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_inventory_ledger_store'
  ) THEN
    ALTER TABLE inventory.inventory_ledger
    ADD CONSTRAINT fk_inventory_ledger_store
    FOREIGN KEY (store_id) REFERENCES platform.stores(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- inventory.inventory_ledger -> catalog.products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_inventory_ledger_product'
  ) THEN
    ALTER TABLE inventory.inventory_ledger
    ADD CONSTRAINT fk_inventory_ledger_product
    FOREIGN KEY (product_id) REFERENCES catalog.products(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ============================================================================
-- ORDERS TABLES
-- ============================================================================

-- orders.purchase_orders -> platform.stores
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_purchase_orders_store'
  ) THEN
    ALTER TABLE orders.purchase_orders
    ADD CONSTRAINT fk_purchase_orders_store
    FOREIGN KEY (store_id) REFERENCES platform.stores(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- orders.purchase_order_items -> orders.purchase_orders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_po_items_order'
  ) THEN
    ALTER TABLE orders.purchase_order_items
    ADD CONSTRAINT fk_po_items_order
    FOREIGN KEY (order_id) REFERENCES orders.purchase_orders(id) ON DELETE CASCADE;
  END IF;
END $$;

-- orders.purchase_order_items -> catalog.products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_po_items_product'
  ) THEN
    ALTER TABLE orders.purchase_order_items
    ADD CONSTRAINT fk_po_items_product
    FOREIGN KEY (product_id) REFERENCES catalog.products(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ============================================================================
-- SALES TABLES
-- ============================================================================

-- sales.sales -> platform.stores
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_sales_store'
  ) THEN
    ALTER TABLE sales.sales
    ADD CONSTRAINT fk_sales_store
    FOREIGN KEY (store_id) REFERENCES platform.stores(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- sales.sale_items -> sales.sales
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_sale_items_sale'
  ) THEN
    ALTER TABLE sales.sale_items
    ADD CONSTRAINT fk_sale_items_sale
    FOREIGN KEY (sale_id) REFERENCES sales.sales(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================================
-- REORDER TABLES
-- ============================================================================

-- reorder.pending_orders -> platform.stores
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_pending_orders_store'
  ) THEN
    ALTER TABLE reorder.pending_orders
    ADD CONSTRAINT fk_pending_orders_store
    FOREIGN KEY (store_id) REFERENCES platform.stores(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ============================================================================
-- CATALOG TABLES
-- ============================================================================

-- catalog.store_products -> platform.stores
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_store_products_store'
  ) THEN
    ALTER TABLE catalog.store_products
    ADD CONSTRAINT fk_store_products_store
    FOREIGN KEY (store_id) REFERENCES platform.stores(id) ON DELETE CASCADE;
  END IF;
END $$;

-- catalog.store_products -> catalog.products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_store_products_product'
  ) THEN
    ALTER TABLE catalog.store_products
    ADD CONSTRAINT fk_store_products_product
    FOREIGN KEY (product_id) REFERENCES catalog.products(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================================
-- SUPPLIER TABLES
-- ============================================================================

-- supplier.supplier_products -> supplier.suppliers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_supplier_products_supplier'
  ) THEN
    ALTER TABLE supplier.supplier_products
    ADD CONSTRAINT fk_supplier_products_supplier
    FOREIGN KEY (supplier_id) REFERENCES supplier.suppliers(id) ON DELETE CASCADE;
  END IF;
END $$;

-- supplier.supplier_products -> catalog.products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_supplier_products_product'
  ) THEN
    ALTER TABLE supplier.supplier_products
    ADD CONSTRAINT fk_supplier_products_product
    FOREIGN KEY (product_id) REFERENCES catalog.products(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================================
-- PAYMENTS TABLES
-- ============================================================================

-- payments.payments -> sales.sales
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_payments_sale'
  ) THEN
    ALTER TABLE payments.payments
    ADD CONSTRAINT fk_payments_sale
    FOREIGN KEY (sale_id) REFERENCES sales.sales(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- payments.payments -> platform.stores
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_payments_store'
  ) THEN
    ALTER TABLE payments.payments
    ADD CONSTRAINT fk_payments_store
    FOREIGN KEY (store_id) REFERENCES platform.stores(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ============================================================================
-- MIGRATION METADATA
-- ============================================================================
INSERT INTO platform.migrations (name, description)
VALUES (
  '068_gl_crit_0008_foreign_keys',
  'GL-CRIT-0008: Add missing foreign key constraints to ensure referential integrity'
)
ON CONFLICT (name) DO NOTHING;
