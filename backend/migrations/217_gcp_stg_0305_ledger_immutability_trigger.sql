-- GCP-STG-0305: DB trigger to prevent UPDATE/DELETE on inventory ledger financial fields
-- Allows metadata updates (reversed_by_id, reversed_at, is_reversed, updated_at)
-- but blocks changes to financial columns (delta_qty, stock_before, stock_after, unit_cost)

BEGIN;

CREATE OR REPLACE FUNCTION inventory.prevent_ledger_financial_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.delta_qty IS DISTINCT FROM NEW.delta_qty
     OR OLD.stock_before IS DISTINCT FROM NEW.stock_before
     OR OLD.stock_after IS DISTINCT FROM NEW.stock_after
     OR OLD.unit_cost IS DISTINCT FROM NEW.unit_cost THEN
    RAISE EXCEPTION 'Cannot modify financial fields on inventory ledger entries (delta_qty, stock_before, stock_after, unit_cost)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_immutable ON inventory.inventory_ledger;
CREATE TRIGGER trg_ledger_immutable
  BEFORE UPDATE ON inventory.inventory_ledger
  FOR EACH ROW
  EXECUTE FUNCTION inventory.prevent_ledger_financial_mutation();

COMMENT ON TRIGGER trg_ledger_immutable ON inventory.inventory_ledger
  IS 'GCP-STG-0305: Prevents modification of financial fields (delta_qty, stock_before, stock_after, unit_cost). Allows metadata updates (reversal tracking).';

COMMIT;

-- ROLLBACK: DROP TRIGGER IF EXISTS trg_ledger_immutable ON inventory.inventory_ledger; DROP FUNCTION IF EXISTS inventory.prevent_ledger_financial_mutation();
