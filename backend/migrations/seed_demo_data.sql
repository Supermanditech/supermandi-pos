-- =============================================================================
-- COMPREHENSIVE SEED DATA FOR DEMO STORE
-- Production-ready: Safe to run multiple times (idempotent)
-- Matches actual schema from migrations
-- =============================================================================

-- Use savepoints for partial success instead of full transaction
-- =============================================================================
-- 1. DEMO SUPPLIER (using actual schema)
-- =============================================================================
INSERT INTO supplier.suppliers (id, gstin, business_name, trade_name, primary_phone, primary_email, status, created_at)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  '29AABCT1234D1Z5',
  'SuperMandi Wholesale Pvt Ltd',
  'SuperMandi Wholesale',
  '+91-9876543211',
  'wholesale@supermandi.in',
  'active',
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Link supplier to demo store
INSERT INTO supplier.supplier_store_links (store_id, supplier_id, is_primary, status, created_at)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  true,
  'active',
  NOW()
) ON CONFLICT (store_id, supplier_id) DO NOTHING;

-- =============================================================================
-- 2. SAMPLE PRODUCTS (30+ products for testing)
-- =============================================================================
INSERT INTO catalog.products (id, name, primary_barcode, category, unit, created_at) VALUES
-- Grocery staples
('c0000000-0000-0000-0000-000000000001', 'Tata Salt 1kg', '8901725115159', 'Grocery', 'kg', NOW()),
('c0000000-0000-0000-0000-000000000002', 'Fortune Sunflower Oil 1L', '8901396312017', 'Grocery', 'L', NOW()),
('c0000000-0000-0000-0000-000000000003', 'Aashirvaad Atta 5kg', '8901725181086', 'Grocery', 'kg', NOW()),
('c0000000-0000-0000-0000-000000000004', 'India Gate Basmati Rice 5kg', '8901501102456', 'Grocery', 'kg', NOW()),
('c0000000-0000-0000-0000-000000000005', 'Toor Dal 1kg', '8901058853193', 'Grocery', 'kg', NOW()),

-- Beverages
('c0000000-0000-0000-0000-000000000006', 'Coca Cola 750ml', '5449000000996', 'Beverages', 'bottle', NOW()),
('c0000000-0000-0000-0000-000000000007', 'Pepsi 750ml', '8901063010013', 'Beverages', 'bottle', NOW()),
('c0000000-0000-0000-0000-000000000008', 'Thums Up 750ml', '8901425101005', 'Beverages', 'bottle', NOW()),
('c0000000-0000-0000-0000-000000000009', 'Sprite 750ml', '5449000000439', 'Beverages', 'bottle', NOW()),
('c0000000-0000-0000-0000-000000000010', 'Maaza 600ml', '8901063020234', 'Beverages', 'bottle', NOW()),

-- Snacks
('c0000000-0000-0000-0000-000000000011', 'Lays Classic Salted 52g', '8901491101615', 'Snacks', 'packet', NOW()),
('c0000000-0000-0000-0000-000000000012', 'Kurkure Masala Munch 95g', '8901491100908', 'Snacks', 'packet', NOW()),
('c0000000-0000-0000-0000-000000000013', 'Haldiram Aloo Bhujia 200g', '8901042504247', 'Snacks', 'packet', NOW()),
('c0000000-0000-0000-0000-000000000014', 'Parle-G Biscuits 800g', '8901030000829', 'Snacks', 'packet', NOW()),
('c0000000-0000-0000-0000-000000000015', 'Britannia Good Day 250g', '8901063010167', 'Snacks', 'packet', NOW()),

-- Dairy
('c0000000-0000-0000-0000-000000000016', 'Amul Butter 500g', '8901030601415', 'Dairy', 'packet', NOW()),
('c0000000-0000-0000-0000-000000000017', 'Mother Dairy Milk 1L', '8906011660015', 'Dairy', 'packet', NOW()),
('c0000000-0000-0000-0000-000000000018', 'Amul Cheese Slices 200g', '8901030402357', 'Dairy', 'packet', NOW()),
('c0000000-0000-0000-0000-000000000019', 'Nestle Dahi 400g', '8901058855241', 'Dairy', 'cup', NOW()),
('c0000000-0000-0000-0000-000000000020', 'Amul Paneer 200g', '8901030401473', 'Dairy', 'packet', NOW()),

-- Personal Care
('c0000000-0000-0000-0000-000000000021', 'Colgate MaxFresh 150g', '8901314200150', 'Personal Care', 'tube', NOW()),
('c0000000-0000-0000-0000-000000000022', 'Dettol Soap 125g', '8901396309536', 'Personal Care', 'bar', NOW()),
('c0000000-0000-0000-0000-000000000023', 'Head & Shoulders 180ml', '4902430628365', 'Personal Care', 'bottle', NOW()),
('c0000000-0000-0000-0000-000000000024', 'Dove Shampoo 340ml', '8901030643972', 'Personal Care', 'bottle', NOW()),
('c0000000-0000-0000-0000-000000000025', 'Nivea Body Lotion 200ml', '4005808570768', 'Personal Care', 'bottle', NOW()),

-- Household
('c0000000-0000-0000-0000-000000000026', 'Vim Dishwash Bar 500g', '8901030631009', 'Household', 'bar', NOW()),
('c0000000-0000-0000-0000-000000000027', 'Surf Excel 1kg', '8901030525094', 'Household', 'packet', NOW()),
('c0000000-0000-0000-0000-000000000028', 'Harpic 500ml', '8901396301554', 'Household', 'bottle', NOW()),
('c0000000-0000-0000-0000-000000000029', 'Colin Glass Cleaner 500ml', '8901396303879', 'Household', 'bottle', NOW()),
('c0000000-0000-0000-0000-000000000030', 'Good Knight Liquid 45ml', '8901023010040', 'Household', 'bottle', NOW()),

-- Test barcode from user scan
('c0000000-0000-0000-0000-000000000031', 'Test Product 5004', '5004#001000', 'Test', 'piece', NOW())

ON CONFLICT (primary_barcode) DO NOTHING;

-- =============================================================================
-- 3. PRODUCT BARCODES (add to barcode lookup table)
-- =============================================================================
INSERT INTO catalog.product_barcodes (product_id, barcode, barcode_type, is_primary, source, created_at)
SELECT id, primary_barcode, 'ean13', true, 'manual', NOW()
FROM catalog.products
WHERE id::text LIKE 'c0000000%' AND primary_barcode IS NOT NULL
ON CONFLICT (barcode) DO NOTHING;

-- =============================================================================
-- 4. STORE PRODUCTS (link products to demo store with pricing)
-- =============================================================================
INSERT INTO catalog.store_products (id, store_id, product_id, sell_price, mrp, current_stock, is_active, created_at)
SELECT
  gen_random_uuid(),
  'a0000000-0000-0000-0000-000000000001',
  id,
  CASE category
    WHEN 'Grocery' THEN 2500 + (RANDOM() * 5000)::INTEGER
    WHEN 'Beverages' THEN 3500 + (RANDOM() * 1000)::INTEGER
    WHEN 'Snacks' THEN 2000 + (RANDOM() * 3000)::INTEGER
    WHEN 'Dairy' THEN 5000 + (RANDOM() * 10000)::INTEGER
    WHEN 'Personal Care' THEN 8000 + (RANDOM() * 15000)::INTEGER
    WHEN 'Household' THEN 5000 + (RANDOM() * 10000)::INTEGER
    ELSE 9900
  END,
  CASE category
    WHEN 'Grocery' THEN 3000 + (RANDOM() * 6000)::INTEGER
    WHEN 'Beverages' THEN 4000 + (RANDOM() * 1500)::INTEGER
    WHEN 'Snacks' THEN 2500 + (RANDOM() * 4000)::INTEGER
    WHEN 'Dairy' THEN 6000 + (RANDOM() * 12000)::INTEGER
    WHEN 'Personal Care' THEN 10000 + (RANDOM() * 20000)::INTEGER
    WHEN 'Household' THEN 6000 + (RANDOM() * 12000)::INTEGER
    ELSE 12000
  END,
  50 + (RANDOM() * 100)::INTEGER,
  true,
  NOW()
FROM catalog.products
WHERE id::text LIKE 'c0000000%'
ON CONFLICT (store_id, product_id) DO UPDATE SET
  current_stock = EXCLUDED.current_stock,
  updated_at = NOW();

-- =============================================================================
-- 5. SUPPLIER PRODUCT MAP (link products to supplier)
-- =============================================================================
INSERT INTO catalog.supplier_product_map (id, supplier_id, product_id, supplier_sku, supplier_product_name, cost_price, is_active, created_at)
SELECT
  gen_random_uuid(),
  'b0000000-0000-0000-0000-000000000001',
  id,
  'SKU-' || SUBSTRING(id::text, 1, 8),
  name,
  (CASE category
    WHEN 'Grocery' THEN 2000 + (RANDOM() * 4000)::INTEGER
    WHEN 'Beverages' THEN 2800 + (RANDOM() * 800)::INTEGER
    WHEN 'Snacks' THEN 1500 + (RANDOM() * 2500)::INTEGER
    WHEN 'Dairy' THEN 4000 + (RANDOM() * 8000)::INTEGER
    WHEN 'Personal Care' THEN 6000 + (RANDOM() * 12000)::INTEGER
    WHEN 'Household' THEN 4000 + (RANDOM() * 8000)::INTEGER
    ELSE 7000
  END),
  true,
  NOW()
FROM catalog.products
WHERE id::text LIKE 'c0000000%'
ON CONFLICT (supplier_id, product_id) DO NOTHING;

-- Show summary
SELECT 'Products:' as label, COUNT(*) as count FROM catalog.products;
SELECT 'Barcodes:' as label, COUNT(*) as count FROM catalog.product_barcodes;
SELECT 'Store Products:' as label, COUNT(*) as count FROM catalog.store_products;
SELECT 'Supplier Products:' as label, COUNT(*) as count FROM catalog.supplier_product_map;
