-- GCP-STG-0389: Add BOX to valid procurement units CHECK constraint
-- Supplier form offers BOX but backend CHECK constraint rejects it.

-- ROLLBACK:
-- ALTER TABLE catalog.supplier_products DROP CONSTRAINT IF EXISTS chk_sp_procurement_unit;
-- ALTER TABLE catalog.supplier_products ADD CONSTRAINT chk_sp_procurement_unit
--   CHECK (procurement_unit IS NULL OR procurement_unit IN (
--     'KG','GM','PCS','DOZEN','LTR','ML',
--     'CARTON','CASE','BAG','TIN','DRUM','TRAY','BOTTLE','PIECE','PACK'
--   ));
-- ALTER TABLE catalog.store_products DROP CONSTRAINT IF EXISTS chk_storeprod_procurement_unit;
-- ALTER TABLE catalog.store_products ADD CONSTRAINT chk_storeprod_procurement_unit
--   CHECK (procurement_unit IS NULL OR procurement_unit IN (
--     'KG','GM','PCS','DOZEN','LTR','ML',
--     'CARTON','CASE','BAG','TIN','DRUM','TRAY','BOTTLE','PIECE','PACK'
--   ));

-- 1. Update supplier_products CHECK constraint
ALTER TABLE catalog.supplier_products
  DROP CONSTRAINT IF EXISTS chk_sp_procurement_unit;
ALTER TABLE catalog.supplier_products
  ADD CONSTRAINT chk_sp_procurement_unit
  CHECK (procurement_unit IS NULL OR procurement_unit IN (
    'KG','GM','PCS','DOZEN','LTR','ML',
    'CARTON','CASE','BAG','TIN','DRUM','TRAY','BOTTLE','PIECE','PACK','BOX'
  ));

-- 2. Update store_products CHECK constraint
ALTER TABLE catalog.store_products
  DROP CONSTRAINT IF EXISTS chk_storeprod_procurement_unit;
ALTER TABLE catalog.store_products
  ADD CONSTRAINT chk_storeprod_procurement_unit
  CHECK (procurement_unit IS NULL OR procurement_unit IN (
    'KG','GM','PCS','DOZEN','LTR','ML',
    'CARTON','CASE','BAG','TIN','DRUM','TRAY','BOTTLE','PIECE','PACK','BOX'
  ));
