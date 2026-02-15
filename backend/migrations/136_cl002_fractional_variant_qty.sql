-- Migration: 136_cl002_fractional_variant_qty
-- CL-002: Change INTEGER columns to NUMERIC(12,3) to support fractional variant quantities
-- When selling retail variants (e.g., 500GM of a KG product), the stock delta is 0.5
-- INTEGER columns truncate this to 1 via Math.round(), causing incorrect stock deduction

BEGIN;

-- Inventory ledger: delta, stock_before, stock_after
ALTER TABLE inventory.inventory_ledger ALTER COLUMN delta_qty TYPE NUMERIC(12,3);
ALTER TABLE inventory.inventory_ledger ALTER COLUMN stock_before TYPE NUMERIC(12,3);
ALTER TABLE inventory.inventory_ledger ALTER COLUMN stock_after TYPE NUMERIC(12,3);

-- Stock balances: current_qty
ALTER TABLE inventory.stock_balances ALTER COLUMN current_qty TYPE NUMERIC(12,3);

-- Store products: current_stock
ALTER TABLE catalog.store_products ALTER COLUMN current_stock TYPE NUMERIC(12,3);

-- Reorder: current_stock threshold column
ALTER TABLE reorder.pending_reorders ALTER COLUMN current_stock TYPE NUMERIC(12,3);

-- The existing CHECK constraint (stock_before + delta_qty = stock_after) works with NUMERIC.
-- No constraint changes needed.

COMMIT;
