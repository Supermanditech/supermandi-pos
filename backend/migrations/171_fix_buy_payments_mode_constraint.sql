-- STG-187: Add 'CASH' to buy_payments mode CHECK constraint
-- BNPL cash repayment inserts mode='CASH' but constraint only allows UPI/BANK/BNPL/CREDIT

ALTER TABLE payments.buy_payments
  DROP CONSTRAINT IF EXISTS chk_buy_payments_mode;

ALTER TABLE payments.buy_payments
  ADD CONSTRAINT chk_buy_payments_mode CHECK (
    mode IN ('UPI', 'BANK', 'BNPL', 'CREDIT', 'CASH')
  );
