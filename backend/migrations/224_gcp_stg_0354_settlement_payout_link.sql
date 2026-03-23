-- ROLLBACK: ALTER TABLE invoicing.settlement_records DROP COLUMN IF EXISTS payout_id;
-- GCP-STG-0354: Link settlement_records to supplier_payouts
-- Adds explicit cross-reference so settlements and payouts are integrated

ALTER TABLE invoicing.settlement_records
  ADD COLUMN IF NOT EXISTS payout_id UUID REFERENCES payments.supplier_payouts(id);

CREATE INDEX IF NOT EXISTS idx_settlement_payout
  ON invoicing.settlement_records (payout_id) WHERE payout_id IS NOT NULL;

COMMENT ON COLUMN invoicing.settlement_records.payout_id IS
  'GCP-STG-0354: FK to payments.supplier_payouts — links settlement to the payout that fulfilled it';
