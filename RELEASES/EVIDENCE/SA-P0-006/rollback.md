# SA-P0-006: Rollback Procedure

## Git Rollback

```bash
# Option A: Revert the merge commit
git revert <merge-commit-sha> --no-edit
git push origin main

# Option B: Revert the PR commit range (if squash-merged)
git revert <squash-commit-sha> --no-edit
git push origin main
```

## SQL Rollback (Migration 125)

Migration 125 only modifies CHECK constraints. Rollback restores the original
restrictive constraints:

```sql
BEGIN;

-- 1. Restore original chk_sale_payment_status (without 'refunded' and 'due')
ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS chk_sale_payment_status;
ALTER TABLE public.sales
  ADD CONSTRAINT chk_sale_payment_status
  CHECK (payment_status IN ('pending', 'paid', 'failed'));

-- 2. Restore original chk_ledger_reference_type (without 'digitisation')
ALTER TABLE inventory.inventory_ledger
  DROP CONSTRAINT IF EXISTS chk_ledger_reference_type;
ALTER TABLE inventory.inventory_ledger
  ADD CONSTRAINT chk_ledger_reference_type
  CHECK (reference_type IS NULL OR reference_type IN ('sale', 'po', 'return', 'manual'));

COMMIT;
```

**WARNING**: Rolling back the constraints will cause:
- POST /pos/sales/:saleId/return to fail with 500 (cannot set payment_status='refunded')
- POST /pos/sales/:saleId/confirm with DUE payment mode to fail (cannot set payment_status='due')
- POS store-products digitisation to fail with 503 (cannot write reference_type='digitisation')

If any rows already have 'refunded', 'due', or 'digitisation' values, the rollback
ALTER TABLE will fail. In that case, update or delete those rows first:

```sql
-- Check for affected rows before rollback:
SELECT COUNT(*) FROM public.sales WHERE payment_status IN ('refunded', 'due');
SELECT COUNT(*) FROM inventory.inventory_ledger WHERE reference_type = 'digitisation';
```

## Safe Fallback Behavior

If migration 125 is NOT applied:
- The return endpoint returns HTTP 500 (constraint violation caught, transaction rolled back)
- No data corruption occurs — the SERIALIZABLE transaction ensures atomicity
- POS digitisation returns HTTP 503 — the store-products endpoint catches and returns service unavailable
- All other POS flows (sale, payment, stock) are unaffected
