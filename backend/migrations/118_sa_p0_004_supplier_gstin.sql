-- SA-P0-004: Stock-In Supplier Info — Add supplier_gstin column
-- Adds optional GSTIN tracking on stock-in ledger entries and purchases

-- Step 1: Add supplier_gstin to inventory.inventory_ledger
ALTER TABLE inventory.inventory_ledger ADD COLUMN IF NOT EXISTS supplier_gstin VARCHAR(15);

-- Step 2: Add supplier_gstin to public.purchases
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS supplier_gstin VARCHAR(15);

-- Step 3: Index for GSTIN-based analytics queries
CREATE INDEX IF NOT EXISTS inventory_ledger_supplier_gstin_idx
  ON inventory.inventory_ledger (supplier_gstin)
  WHERE supplier_gstin IS NOT NULL;
