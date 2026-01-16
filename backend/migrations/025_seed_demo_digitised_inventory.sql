-- =============================================================================
-- Migration: 025_seed_demo_digitised_inventory
-- SD-DEMO-SEED-003: Seed store digitised inventory for DEMO001 only
-- Creates 30 products with barcodes, stock, and pricing for testing SELL flow
-- Safe to run multiple times (idempotent)
-- =============================================================================

BEGIN;

-- Only run for DEMO001 store (store_id = a0000000-0000-0000-0000-000000000001)
DO $$
DECLARE
  demo_store_id UUID := 'a0000000-0000-0000-0000-000000000001';
  v_product_id UUID;
  v_store_product_id UUID;
  v_ledger_id UUID;
  barcode_val TEXT;
  product_name TEXT;
  brand_val TEXT;
  unit_val TEXT;
  sell_price INTEGER;
  mrp_val INTEGER;
  stock_qty INTEGER;
  i INTEGER;
BEGIN
  -- Check if store exists
  IF NOT EXISTS (SELECT 1 FROM platform.stores WHERE id = demo_store_id) THEN
    RAISE NOTICE 'DEMO001 store not found, skipping seed';
    RETURN;
  END IF;

  -- Array of 30 demo products with realistic Indian FMCG data
  FOR i IN 1..30 LOOP
    -- Generate unique barcode (EAN-13 format simulation)
    barcode_val := '890100300' || LPAD(i::TEXT, 4, '0');

    -- Generate product data based on index
    CASE (i % 10)
      WHEN 1 THEN
        product_name := 'Parle-G Biscuits ' || (100 + i * 10) || 'g';
        brand_val := 'Parle';
        unit_val := 'pcs';
        sell_price := 1000 + (i * 50);
        mrp_val := 1000 + (i * 50);
        stock_qty := 48 + i;
      WHEN 2 THEN
        product_name := 'Tata Salt ' || (500 + i * 100) || 'g';
        brand_val := 'Tata';
        unit_val := 'pcs';
        sell_price := 2500 + (i * 100);
        mrp_val := 2700 + (i * 100);
        stock_qty := 24 + i;
      WHEN 3 THEN
        product_name := 'Aashirvaad Atta ' || i || 'kg';
        brand_val := 'Aashirvaad';
        unit_val := 'kg';
        sell_price := 30000 + (i * 500);
        mrp_val := 32000 + (i * 500);
        stock_qty := 12 + i;
      WHEN 4 THEN
        product_name := 'Fortune Oil ' || i || 'L';
        brand_val := 'Fortune';
        unit_val := 'litre';
        sell_price := 15000 + (i * 300);
        mrp_val := 16500 + (i * 300);
        stock_qty := 18 + i;
      WHEN 5 THEN
        product_name := 'Maggi Noodles ' || (i * 4) || ' Pack';
        brand_val := 'Maggi';
        unit_val := 'pack';
        sell_price := 4800 + (i * 100);
        mrp_val := 5200 + (i * 100);
        stock_qty := 36 + i;
      WHEN 6 THEN
        product_name := 'Amul Butter ' || (100 + i * 50) || 'g';
        brand_val := 'Amul';
        unit_val := 'pcs';
        sell_price := 5500 + (i * 100);
        mrp_val := 5700 + (i * 100);
        stock_qty := 15 + i;
      WHEN 7 THEN
        product_name := 'Britannia Milk Bikis ' || (i * 50) || 'g';
        brand_val := 'Britannia';
        unit_val := 'pcs';
        sell_price := 2000 + (i * 50);
        mrp_val := 2000 + (i * 50);
        stock_qty := 60 + i;
      WHEN 8 THEN
        product_name := 'Red Label Tea ' || (100 + i * 50) || 'g';
        brand_val := 'Brooke Bond';
        unit_val := 'pcs';
        sell_price := 8500 + (i * 200);
        mrp_val := 9000 + (i * 200);
        stock_qty := 20 + i;
      WHEN 9 THEN
        product_name := 'Surf Excel ' || (500 + i * 100) || 'g';
        brand_val := 'Surf';
        unit_val := 'pcs';
        sell_price := 4500 + (i * 100);
        mrp_val := 4900 + (i * 100);
        stock_qty := 30 + i;
      ELSE
        product_name := 'Dettol Soap ' || (75 + i * 10) || 'g';
        brand_val := 'Dettol';
        unit_val := 'pcs';
        sell_price := 4200 + (i * 50);
        mrp_val := 4500 + (i * 50);
        stock_qty := 45 + i;
    END CASE;

    -- Check if barcode already exists in product_barcodes
    SELECT pb.product_id INTO v_product_id
    FROM catalog.product_barcodes pb
    WHERE pb.barcode = barcode_val
    LIMIT 1;

    IF v_product_id IS NULL THEN
      -- Check if primary_barcode exists in products
      SELECT p.id INTO v_product_id
      FROM catalog.products p
      WHERE p.primary_barcode = barcode_val
      LIMIT 1;
    END IF;

    IF v_product_id IS NULL THEN
      -- Create new catalog product
      v_product_id := gen_random_uuid();
      INSERT INTO catalog.products (id, name, brand, unit, primary_barcode, is_active)
      VALUES (v_product_id, product_name, brand_val, unit_val, barcode_val, true)
      ON CONFLICT DO NOTHING;

      -- Create product_barcodes entry
      INSERT INTO catalog.product_barcodes (product_id, barcode, barcode_type, is_primary, source, created_by_store_id)
      VALUES (v_product_id, barcode_val, 'ean13', true, 'retailer_digitisation', demo_store_id)
      ON CONFLICT (barcode) DO NOTHING;
    END IF;

    -- Check if store_product already exists
    SELECT sp.id INTO v_store_product_id
    FROM catalog.store_products sp
    WHERE sp.store_id = demo_store_id AND sp.product_id = v_product_id
    LIMIT 1;

    IF v_store_product_id IS NULL THEN
      -- Create store_product
      v_store_product_id := gen_random_uuid();
      INSERT INTO catalog.store_products (
        id, store_id, product_id, sell_price, mrp, display_name,
        is_active, current_stock, digitisation_mode
      )
      VALUES (
        v_store_product_id, demo_store_id, v_product_id, sell_price, mrp_val,
        product_name, true, stock_qty, 'FAST_SELL'
      )
      ON CONFLICT (store_id, product_id) DO UPDATE SET
        sell_price = EXCLUDED.sell_price,
        mrp = EXCLUDED.mrp,
        current_stock = EXCLUDED.current_stock,
        is_active = true,
        updated_at = NOW();

      -- Get the actual store_product_id after insert
      SELECT sp.id INTO v_store_product_id
      FROM catalog.store_products sp
      WHERE sp.store_id = demo_store_id AND sp.product_id = v_product_id;
    END IF;

    -- Create store_product_barcode mapping
    INSERT INTO catalog.store_product_barcodes (store_id, store_product_id, barcode, source)
    VALUES (demo_store_id, v_store_product_id, barcode_val, 'retailer_digitisation')
    ON CONFLICT (store_id, barcode) DO NOTHING;

    -- Create stock balance
    INSERT INTO inventory.stock_balances (store_id, product_id, current_qty)
    VALUES (demo_store_id, v_product_id, stock_qty)
    ON CONFLICT (store_id, product_id) DO UPDATE SET
      current_qty = EXCLUDED.current_qty,
      updated_at = NOW();

    -- Create inventory ledger entry for initial stock
    v_ledger_id := gen_random_uuid();
    INSERT INTO inventory.inventory_ledger (
      id, store_id, product_id, delta_qty, transaction_type,
      reference_type, reference_id, stock_before, stock_after, notes
    )
    SELECT v_ledger_id, demo_store_id, v_product_id, stock_qty, 'adjustment',
           'manual', 'demo_seed:' || i::TEXT, 0, stock_qty, 'Demo seed initial stock'
    WHERE NOT EXISTS (
      SELECT 1 FROM inventory.inventory_ledger il
      WHERE il.store_id = demo_store_id
      AND il.product_id = v_product_id
      AND il.notes LIKE 'Demo seed%'
    );

    RAISE NOTICE 'Seeded product %: % (barcode: %)', i, product_name, barcode_val;
  END LOOP;

  RAISE NOTICE 'Demo seed complete: 30 products created for DEMO001';
END $$;

COMMIT;
