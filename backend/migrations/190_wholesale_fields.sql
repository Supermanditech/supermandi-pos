-- V3-017: Add wholesale B2B fields to supplier_products
-- ROLLBACK: ALTER TABLE catalog.supplier_products DROP COLUMN IF EXISTS ptr_minor, DROP COLUMN IF EXISTS pts_minor, DROP COLUMN IF EXISTS trade_discount_pct, DROP COLUMN IF EXISTS scheme, DROP COLUMN IF EXISTS credit_days, DROP COLUMN IF EXISTS delivery_days, DROP COLUMN IF EXISTS bnpl_available;

ALTER TABLE catalog.supplier_products ADD COLUMN IF NOT EXISTS ptr_minor INTEGER;           -- Price to Retailer (paise)
ALTER TABLE catalog.supplier_products ADD COLUMN IF NOT EXISTS pts_minor INTEGER;           -- Price to Stockist (paise)
ALTER TABLE catalog.supplier_products ADD COLUMN IF NOT EXISTS trade_discount_pct NUMERIC(5,2); -- Trade discount percentage
ALTER TABLE catalog.supplier_products ADD COLUMN IF NOT EXISTS scheme VARCHAR(100);         -- e.g. "10+1 Free"
ALTER TABLE catalog.supplier_products ADD COLUMN IF NOT EXISTS credit_days INTEGER;         -- Payment credit period
ALTER TABLE catalog.supplier_products ADD COLUMN IF NOT EXISTS delivery_days INTEGER DEFAULT 2; -- Estimated delivery days
ALTER TABLE catalog.supplier_products ADD COLUMN IF NOT EXISTS bnpl_available BOOLEAN DEFAULT false; -- BNPL eligible

-- All columns nullable, no existing data affected. Additive only.
