-- GO-LIVE Batch 7: Retailer Web Dashboard improvements
-- Migration 080

BEGIN;

-- =============================================================================
-- GO-LIVE-016: Add receipt footer and store settings columns
-- =============================================================================

-- Add receipt_footer column for customizable receipt messages
ALTER TABLE platform.stores
  ADD COLUMN IF NOT EXISTS receipt_footer TEXT DEFAULT '';

-- Add address column for store address
ALTER TABLE platform.stores
  ADD COLUMN IF NOT EXISTS address TEXT;

-- Add phone column for store phone (10 digits)
ALTER TABLE platform.stores
  ADD COLUMN IF NOT EXISTS phone VARCHAR(15);

-- Add gst_number column for GSTIN
ALTER TABLE platform.stores
  ADD COLUMN IF NOT EXISTS gst_number VARCHAR(20);

-- Add tax_rate column for default GST rate
ALTER TABLE platform.stores
  ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5,2) DEFAULT 18.00;

-- Add operating_hours column for store hours
ALTER TABLE platform.stores
  ADD COLUMN IF NOT EXISTS operating_hours JSONB DEFAULT '{"open": "09:00", "close": "21:00"}';

-- Add check constraint for receipt footer max length
ALTER TABLE platform.stores DROP CONSTRAINT IF EXISTS chk_receipt_footer_length;
ALTER TABLE platform.stores ADD CONSTRAINT chk_receipt_footer_length CHECK (
  receipt_footer IS NULL OR LENGTH(receipt_footer) <= 200
);

COMMENT ON COLUMN platform.stores.receipt_footer IS
'GO-LIVE-016: Customizable message at bottom of receipts (max 200 chars)';

COMMENT ON COLUMN platform.stores.gst_number IS
'GO-LIVE-013: Store GSTIN for tax compliance';

COMMENT ON COLUMN platform.stores.tax_rate IS
'Default GST rate for store products';

COMMENT ON COLUMN platform.stores.operating_hours IS
'Store operating hours as JSON {open, close}';

-- =============================================================================
-- GO-LIVE-015: Add check constraint for non-negative stock in stock_balances
-- =============================================================================

-- Ensure current_qty is never negative
ALTER TABLE inventory.stock_balances DROP CONSTRAINT IF EXISTS chk_stock_non_negative;
ALTER TABLE inventory.stock_balances ADD CONSTRAINT chk_stock_non_negative CHECK (
  current_qty >= 0
);

COMMENT ON CONSTRAINT chk_stock_non_negative ON inventory.stock_balances IS
'GO-LIVE-015: Ensures stock quantities are never negative';

COMMIT;
