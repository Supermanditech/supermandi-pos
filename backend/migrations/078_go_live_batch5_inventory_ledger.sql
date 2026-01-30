-- GO-LIVE Batch 5: Inventory, Stock & Ledger improvements
-- Migration 078

BEGIN;

-- Create accounting schema if not exists
CREATE SCHEMA IF NOT EXISTS accounting;

-- =============================================================================
-- GO-LIVE-060: sales.payment_status index (ALREADY EXISTS from 076)
-- Verified: idx_sales_payment_status exists
-- =============================================================================

-- =============================================================================
-- GO-LIVE-061: Add stock_balances.current_qty index for inventory queries
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_stock_balances_current_qty
  ON inventory.stock_balances(store_id, current_qty DESC)
  WHERE current_qty > 0;

COMMENT ON INDEX inventory.idx_stock_balances_current_qty IS
'GO-LIVE-061: Index for stock queries filtering/sorting by quantity';

-- Also add composite index for low stock alerts
CREATE INDEX IF NOT EXISTS idx_stock_balances_low_stock
  ON inventory.stock_balances(store_id, product_id)
  WHERE current_qty <= 10 AND current_qty > 0;

COMMENT ON INDEX inventory.idx_stock_balances_low_stock IS
'GO-LIVE-061: Index for low stock alert queries';

-- =============================================================================
-- GO-LIVE-065: Ensure sale_id reference is properly indexed in ledger
-- (reference_id already indexed, just add comment for clarity)
-- =============================================================================

-- Add index for sale lookups in ledger (reverse lookup)
CREATE INDEX IF NOT EXISTS idx_ledger_sale_reference
  ON inventory.inventory_ledger(reference_id, store_id)
  WHERE reference_type = 'sale';

COMMENT ON INDEX inventory.idx_ledger_sale_reference IS
'GO-LIVE-065: Index for looking up ledger entries by sale_id';

-- =============================================================================
-- GO-LIVE-066/067: Add reversal tracking columns for cancelled sales
-- =============================================================================

-- Add columns to track reversals
ALTER TABLE inventory.inventory_ledger
  ADD COLUMN IF NOT EXISTS reversed_by_id UUID,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversal_of_id UUID;

-- Index for finding original entries that were reversed
CREATE INDEX IF NOT EXISTS idx_ledger_reversal_tracking
  ON inventory.inventory_ledger(reversal_of_id)
  WHERE reversal_of_id IS NOT NULL;

COMMENT ON COLUMN inventory.inventory_ledger.reversed_by_id IS
'GO-LIVE-066: ID of the ledger entry that reversed this entry (if any)';

COMMENT ON COLUMN inventory.inventory_ledger.reversed_at IS
'GO-LIVE-066: Timestamp when this entry was reversed';

COMMENT ON COLUMN inventory.inventory_ledger.reversal_of_id IS
'GO-LIVE-066: ID of the original ledger entry this entry reverses';

-- =============================================================================
-- GO-LIVE-071: Physical count support - add count session tracking
-- =============================================================================

CREATE TABLE IF NOT EXISTS inventory.physical_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES platform.stores(id),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  started_by_user_id UUID,
  completed_by_user_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_physical_counts_store_status
  ON inventory.physical_counts(store_id, status, started_at DESC);

COMMENT ON TABLE inventory.physical_counts IS
'GO-LIVE-071: Tracks physical inventory count sessions';

-- Physical count line items
CREATE TABLE IF NOT EXISTS inventory.physical_count_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id UUID NOT NULL REFERENCES inventory.physical_counts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES catalog.products(id),
  expected_qty INTEGER NOT NULL DEFAULT 0,
  counted_qty INTEGER,
  variance INTEGER GENERATED ALWAYS AS (COALESCE(counted_qty, 0) - expected_qty) STORED,
  counted_at TIMESTAMPTZ,
  counted_by_user_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_count_items_count_id
  ON inventory.physical_count_items(count_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_count_items_product_unique
  ON inventory.physical_count_items(count_id, product_id);

COMMENT ON TABLE inventory.physical_count_items IS
'GO-LIVE-071: Individual product counts within a count session';

-- =============================================================================
-- GO-LIVE-022: Manual stock adjustment tracking
-- =============================================================================

-- Add adjustment_reason column for manual adjustments
ALTER TABLE inventory.inventory_ledger
  ADD COLUMN IF NOT EXISTS adjustment_reason TEXT;

-- Update transaction_type constraint to ensure 'adjustment' is valid
-- (Already exists in schema, just documenting)

COMMENT ON COLUMN inventory.inventory_ledger.adjustment_reason IS
'GO-LIVE-022: Reason for manual stock adjustment (damage, theft, expired, etc.)';

-- =============================================================================
-- GO-LIVE-068: General Ledger accounts stub (minimal for Phase 1)
-- =============================================================================

CREATE TABLE IF NOT EXISTS accounting.chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  account_type VARCHAR(30) NOT NULL CHECK (account_type IN (
    'asset', 'liability', 'equity', 'revenue', 'expense'
  )),
  parent_id UUID REFERENCES accounting.chart_of_accounts(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE accounting.chart_of_accounts IS
'GO-LIVE-068: Chart of accounts for future GL integration (stub)';

-- Insert minimal default accounts
INSERT INTO accounting.chart_of_accounts (code, name, account_type)
VALUES
  ('1000', 'Assets', 'asset'),
  ('1100', 'Cash', 'asset'),
  ('1200', 'Inventory', 'asset'),
  ('1300', 'Accounts Receivable', 'asset'),
  ('2000', 'Liabilities', 'liability'),
  ('2100', 'Accounts Payable', 'liability'),
  ('3000', 'Equity', 'equity'),
  ('4000', 'Revenue', 'revenue'),
  ('4100', 'Sales Revenue', 'revenue'),
  ('5000', 'Expenses', 'expense'),
  ('5100', 'Cost of Goods Sold', 'expense')
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- GO-LIVE-095: Inventory valuation method stub
-- =============================================================================

-- Add valuation method to store settings
ALTER TABLE platform.stores
  ADD COLUMN IF NOT EXISTS inventory_valuation_method VARCHAR(10) DEFAULT 'FIFO'
    CHECK (inventory_valuation_method IN ('FIFO', 'LIFO', 'AVG'));

COMMENT ON COLUMN platform.stores.inventory_valuation_method IS
'GO-LIVE-095: Inventory costing method - FIFO (default), LIFO, or weighted AVG';

-- Add unit_cost tracking to stock_balances for valuation
ALTER TABLE inventory.stock_balances
  ADD COLUMN IF NOT EXISTS avg_unit_cost_minor BIGINT DEFAULT 0;

COMMENT ON COLUMN inventory.stock_balances.avg_unit_cost_minor IS
'GO-LIVE-095: Weighted average unit cost for inventory valuation';

-- =============================================================================
-- GO-LIVE-066: Update sales status constraint to allow REFUNDED
-- =============================================================================
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS chk_sale_status;

ALTER TABLE public.sales ADD CONSTRAINT chk_sale_status CHECK (
  status IN (
    'pending', 'PENDING',
    'completed', 'PAID_CASH', 'PAID_UPI',
    'DUE', 'EXPIRED',
    'cancelled', 'CANCELLED', 'voided',
    'REFUNDED'
  )
);

COMMENT ON CONSTRAINT chk_sale_status ON public.sales IS
'GO-LIVE-066: Updated to allow REFUNDED status for returned sales';

COMMIT;
