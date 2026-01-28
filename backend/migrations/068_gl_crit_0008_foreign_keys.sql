-- GL-CRIT-0008: Add missing foreign key constraints across tables
-- This migration adds FK constraints that were identified as missing during the go-live audit
-- Defensive: checks if tables/columns exist before adding constraints

-- ============================================================================
-- HELPER: Check if we can add FK (both tables and columns exist)
-- ============================================================================

-- public.sales -> public.stores (if both exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sales'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stores'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'store_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_sales_store'
  ) THEN
    ALTER TABLE public.sales
    ADD CONSTRAINT fk_sales_store
    FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
    RAISE NOTICE 'Added FK: public.sales -> public.stores';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipped FK public.sales -> public.stores: %', SQLERRM;
END $$;

-- public.sales -> public.products (if both exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sale_items'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'products'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sale_items' AND column_name = 'product_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_sale_items_product'
  ) THEN
    ALTER TABLE public.sale_items
    ADD CONSTRAINT fk_sale_items_product
    FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;
    RAISE NOTICE 'Added FK: public.sale_items -> public.products';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipped FK public.sale_items -> public.products: %', SQLERRM;
END $$;

-- inventory.inventory_ledger -> platform.stores
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'inventory' AND table_name = 'inventory_ledger'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'platform' AND table_name = 'stores'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema = 'inventory' AND table_name = 'inventory_ledger' AND column_name = 'store_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_inv_ledger_store'
  ) THEN
    ALTER TABLE inventory.inventory_ledger
    ADD CONSTRAINT fk_inv_ledger_store
    FOREIGN KEY (store_id) REFERENCES platform.stores(id) ON DELETE RESTRICT;
    RAISE NOTICE 'Added FK: inventory.inventory_ledger -> platform.stores';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipped FK inventory.inventory_ledger -> platform.stores: %', SQLERRM;
END $$;

-- inventory.inventory_ledger -> catalog.products
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'inventory' AND table_name = 'inventory_ledger'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'catalog' AND table_name = 'products'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema = 'inventory' AND table_name = 'inventory_ledger' AND column_name = 'product_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_inv_ledger_product'
  ) THEN
    ALTER TABLE inventory.inventory_ledger
    ADD CONSTRAINT fk_inv_ledger_product
    FOREIGN KEY (product_id) REFERENCES catalog.products(id) ON DELETE RESTRICT;
    RAISE NOTICE 'Added FK: inventory.inventory_ledger -> catalog.products';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipped FK inventory.inventory_ledger -> catalog.products: %', SQLERRM;
END $$;

-- orders.purchase_orders -> platform.stores
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'orders' AND table_name = 'purchase_orders'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'platform' AND table_name = 'stores'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_po_store'
  ) THEN
    ALTER TABLE orders.purchase_orders
    ADD CONSTRAINT fk_po_store
    FOREIGN KEY (store_id) REFERENCES platform.stores(id) ON DELETE RESTRICT;
    RAISE NOTICE 'Added FK: orders.purchase_orders -> platform.stores';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipped FK orders.purchase_orders -> platform.stores: %', SQLERRM;
END $$;

-- orders.purchase_orders -> supplier.suppliers
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'orders' AND table_name = 'purchase_orders'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'supplier' AND table_name = 'suppliers'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_po_supplier'
  ) THEN
    ALTER TABLE orders.purchase_orders
    ADD CONSTRAINT fk_po_supplier
    FOREIGN KEY (supplier_id) REFERENCES supplier.suppliers(id) ON DELETE RESTRICT;
    RAISE NOTICE 'Added FK: orders.purchase_orders -> supplier.suppliers';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipped FK orders.purchase_orders -> supplier.suppliers: %', SQLERRM;
END $$;

-- orders.purchase_order_items -> catalog.products
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'orders' AND table_name = 'purchase_order_items'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'catalog' AND table_name = 'products'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_poi_product'
  ) THEN
    ALTER TABLE orders.purchase_order_items
    ADD CONSTRAINT fk_poi_product
    FOREIGN KEY (product_id) REFERENCES catalog.products(id) ON DELETE RESTRICT;
    RAISE NOTICE 'Added FK: orders.purchase_order_items -> catalog.products';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipped FK orders.purchase_order_items -> catalog.products: %', SQLERRM;
END $$;

-- payments.payments -> public.sales (or platform.stores)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'payments' AND table_name = 'payments'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema = 'payments' AND table_name = 'payments' AND column_name = 'store_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'platform' AND table_name = 'stores'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_payments_store'
  ) THEN
    ALTER TABLE payments.payments
    ADD CONSTRAINT fk_payments_store
    FOREIGN KEY (store_id) REFERENCES platform.stores(id) ON DELETE RESTRICT;
    RAISE NOTICE 'Added FK: payments.payments -> platform.stores';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipped FK payments.payments -> platform.stores: %', SQLERRM;
END $$;

-- auth.users -> platform.stores (if applicable)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'store_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'platform' AND table_name = 'stores'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_users_store'
  ) THEN
    ALTER TABLE auth.users
    ADD CONSTRAINT fk_users_store
    FOREIGN KEY (store_id) REFERENCES platform.stores(id) ON DELETE RESTRICT;
    RAISE NOTICE 'Added FK: auth.users -> platform.stores';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipped FK auth.users -> platform.stores: %', SQLERRM;
END $$;

-- platform.pos_devices -> platform.stores
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'platform' AND table_name = 'pos_devices'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'platform' AND table_name = 'stores'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_devices_store'
  ) THEN
    ALTER TABLE platform.pos_devices
    ADD CONSTRAINT fk_devices_store
    FOREIGN KEY (store_id) REFERENCES platform.stores(id) ON DELETE RESTRICT;
    RAISE NOTICE 'Added FK: platform.pos_devices -> platform.stores';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipped FK platform.pos_devices -> platform.stores: %', SQLERRM;
END $$;

-- supplier.store_links -> platform.stores
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'supplier' AND table_name = 'store_links'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'platform' AND table_name = 'stores'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_store_links_store'
  ) THEN
    ALTER TABLE supplier.store_links
    ADD CONSTRAINT fk_store_links_store
    FOREIGN KEY (store_id) REFERENCES platform.stores(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: supplier.store_links -> platform.stores';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipped FK supplier.store_links -> platform.stores: %', SQLERRM;
END $$;

-- supplier.store_links -> supplier.suppliers
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'supplier' AND table_name = 'store_links'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'supplier' AND table_name = 'suppliers'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_store_links_supplier'
  ) THEN
    ALTER TABLE supplier.store_links
    ADD CONSTRAINT fk_store_links_supplier
    FOREIGN KEY (supplier_id) REFERENCES supplier.suppliers(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: supplier.store_links -> supplier.suppliers';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipped FK supplier.store_links -> supplier.suppliers: %', SQLERRM;
END $$;

-- Log completion
DO $$ BEGIN RAISE NOTICE 'GL-CRIT-0008: Foreign key migration complete'; END $$;
