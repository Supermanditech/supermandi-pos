-- SA-P0-006: Fix constraint gaps blocking refund flow and POS digitisation
--
-- Bug 1: chk_sale_payment_status on public.sales allows only (pending, paid, failed).
--         The return endpoint sets payment_status = 'refunded' and the DUE flow sets
--         payment_status = 'due' — both violate the constraint.
--
-- Bug 2: chk_ledger_reference_type on inventory.inventory_ledger allows only
--         (sale, po, return, manual). The POS digitisation service writes
--         reference_type = 'digitisation' — violates the constraint and causes
--         the store-products endpoint to return 503.
--
-- Both constraints were created in earlier migrations but never updated when
-- new code paths were added.

BEGIN;

-- 1. Expand sales.payment_status to include 'refunded' and 'due'
ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS chk_sale_payment_status;

ALTER TABLE public.sales
  ADD CONSTRAINT chk_sale_payment_status
  CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded', 'due'));

-- 2. Expand inventory.inventory_ledger.reference_type to include 'digitisation'
ALTER TABLE inventory.inventory_ledger
  DROP CONSTRAINT IF EXISTS chk_ledger_reference_type;

ALTER TABLE inventory.inventory_ledger
  ADD CONSTRAINT chk_ledger_reference_type
  CHECK (reference_type IS NULL OR reference_type IN ('sale', 'po', 'return', 'manual', 'digitisation'));

COMMIT;
