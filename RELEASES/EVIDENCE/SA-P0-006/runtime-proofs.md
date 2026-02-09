# SA-P0-006: Runtime Proofs — Constraint Gaps Blocking Refund Flow

> Date: 2026-02-10
> Branch: feat/sa-p0-006-constraint-gaps
> Stack: docker-compose.local-prod.yml (backend at localhost:3010)
> Migration: 125_sa_p0_006_constraint_gaps.sql
> Test script: scripts/test-refund-e2e.ps1

---

## Root Cause

Two PostgreSQL CHECK constraints were too restrictive:

1. **`chk_sale_payment_status`** on `public.sales` — allowed only `(pending, paid, failed)`.
   The return endpoint sets `payment_status = 'refunded'` and the DUE flow sets `payment_status = 'due'` — both violated the constraint, causing 500 errors.

2. **`chk_ledger_reference_type`** on `inventory.inventory_ledger` — allowed only `(sale, po, return, manual)`.
   The POS digitisation service writes `reference_type = 'digitisation'`, causing 503 on the store-products endpoint.

---

## Fix

Migration 125 expands both constraints:

```sql
-- chk_sale_payment_status: added 'refunded' and 'due'
CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded', 'due'))

-- chk_ledger_reference_type: added 'digitisation'
CHECK (reference_type IS NULL OR reference_type IN ('sale', 'po', 'return', 'manual', 'digitisation'))
```

---

## Back-to-Back Stability: Run 1 (17/17 PASS)

```
=== SA-P0-006 Refund E2E Test (RUN_ID=015200, BARCODE=89010301520099) ===

=== STEP 1: Create store ===
  STORE_ID = a8edb2e7-3d50-4ce7-880a-24ca504a8396  |  Code = RE260210-009

=== STEP 2: Activate store via SQL ===
  Store status = ACTIVE UPDATE 1

=== STEP 3: Generate enrollment code ===
  ENROLLMENT CODE = SM-Y2HPU9

=== STEP 4: Enroll POS device ===
  DEVICE TOKEN = 97e4b46495ad2627...
  STORE = Refund E2E 015200  |  Active = True

=== STEP 5: Seed product ===
  Created via POS API: SP=b6db5598-8a08-4dbc-b2f4-9db79aa344f5  PROD=07847235-49d5-4f4d-bf7b-7f3d82d1cbba

=== STEP 6: Verify seed stock ===
  PASS: stock_before_sale = 100

=== STEP 7: Create sale ===
  SALE_ID = 816944c1-d85c-4ad9-b1d5-440cbf51eb46
  Bill Ref = 6852201213XRY  |  Total = 9000 paise

=== STEP 8: Confirm payment ===
  PASS: payment_status is present (PAID_CASH)
  PAID_CASH | Payment confirmed and stock deducted

=== STEP 9: Stock after sale ===
  PASS: stock_after_sale = 98

=== STEP 10: Return the sale ===
  RAW: {"saleId":"816944c1-d85c-4ad9-b1d5-440cbf51eb46","returnId":"7ad4ba74-38b2-456f-b71f-27b821329b5b","status":"REFUNDED","message":"Sale returned successfully. Stock has been restored.","itemsReturned":1}
  PASS: return.saleId is present (816944c1-d85c-4ad9-b1d5-440cbf51eb46)
  PASS: return.returnId is present (7ad4ba74-38b2-456f-b71f-27b821329b5b)
  PASS: return.status = REFUNDED
  PASS: return.message is present (Sale returned successfully. Stock has been restored.)
  PASS: return.itemsReturned is present (1)

=== STEP 11: Stock after return ===
  PASS: stock_after_return = 100

=== STEP 12: Ledger proof (API) ===
  Sale return entries: 1
    [sale_return] Test Tomato 015200: delta=2 | 98 -> 100

=== STEP 13: Double return blocked ===
  PASS: double_return_blocked = cannot_return

=== STEP 14: DB proof - sale row ===
  PASS: db_sale_status = REFUNDED
  PASS: db_payment_status = refunded
  PASS: db_total_minor = 9000

=== STEP 15: DB proof - ledger entries ===
  Ledger return entries for store: 1
  PASS: ledger_return_entries >= 1
  PASS: db_stock_balances = 100
  PASS: db_store_inventory = 100
  PASS: db_catalog_current_stock = 100

=====================================
  SA-P0-006 Refund E2E Results
=====================================
  PASS:     17
  FAIL:     0
=====================================
OVERALL: PASS (17/17)
```

---

## Back-to-Back Stability: Run 2 (17/17 PASS)

```
=== SA-P0-006 Refund E2E Test (RUN_ID=015209, BARCODE=89010301520999) ===

=== STEP 1: Create store ===
  STORE_ID = b44b1ff8-2d5c-4dbc-afe4-b5797782d3a6  |  Code = RE260210-010

=== STEP 2: Activate store via SQL ===
  Store status = ACTIVE UPDATE 1

=== STEP 3: Generate enrollment code ===
  ENROLLMENT CODE = SM-N8GTNY

=== STEP 4: Enroll POS device ===
  DEVICE TOKEN = c7572fdca395d046...
  STORE = Refund E2E 015209  |  Active = True

=== STEP 5: Seed product ===
  Created via POS API: SP=5d4310cb-ea4e-418f-b099-5eaf664e3be5  PROD=68b51ab9-027f-48d6-a4af-762aed4f6317

=== STEP 6: Verify seed stock ===
  PASS: stock_before_sale = 100

=== STEP 7: Create sale ===
  SALE_ID = d446f0c6-1a42-4bc0-977a-9f4073440441
  Bill Ref = 685302752XDOW  |  Total = 9000 paise

=== STEP 8: Confirm payment ===
  PASS: payment_status is present (PAID_CASH)
  PAID_CASH | Payment confirmed and stock deducted

=== STEP 9: Stock after sale ===
  PASS: stock_after_sale = 98

=== STEP 10: Return the sale ===
  RAW: {"saleId":"d446f0c6-1a42-4bc0-977a-9f4073440441","returnId":"b108c297-f3f2-4b93-b4e0-2f47fb5ce8c9","status":"REFUNDED","message":"Sale returned successfully. Stock has been restored.","itemsReturned":1}
  PASS: return.saleId is present (d446f0c6-1a42-4bc0-977a-9f4073440441)
  PASS: return.returnId is present (b108c297-f3f2-4b93-b4e0-2f47fb5ce8c9)
  PASS: return.status = REFUNDED
  PASS: return.message is present (Sale returned successfully. Stock has been restored.)
  PASS: return.itemsReturned is present (1)

=== STEP 11: Stock after return ===
  PASS: stock_after_return = 100

=== STEP 12: Ledger proof (API) ===
  Sale return entries: 1
    [sale_return] Test Tomato 015209: delta=2 | 98 -> 100

=== STEP 13: Double return blocked ===
  PASS: double_return_blocked = cannot_return

=== STEP 14: DB proof - sale row ===
  PASS: db_sale_status = REFUNDED
  PASS: db_payment_status = refunded
  PASS: db_total_minor = 9000

=== STEP 15: DB proof - ledger entries ===
  Ledger return entries for store: 1
  PASS: ledger_return_entries >= 1
  PASS: db_stock_balances = 100
  PASS: db_store_inventory = 100
  PASS: db_catalog_current_stock = 100

=====================================
  SA-P0-006 Refund E2E Results
=====================================
  PASS:     17
  FAIL:     0
=====================================
OVERALL: PASS (17/17)
```

---

## Expected vs Actual Summary

| Metric | Expected | Actual | Status |
|--------|----------|--------|--------|
| Stock before sale | 100 | 100 | PASS |
| Stock after sale (2 units) | 98 | 98 | PASS |
| Stock after return | 100 | 100 | PASS |
| Refund response: saleId | present | present | PASS |
| Refund response: returnId | UUID | UUID | PASS |
| Refund response: status | REFUNDED | REFUNDED | PASS |
| Refund response: message | present | present | PASS |
| Refund response: itemsReturned | 1 | 1 | PASS |
| Ledger entry: delta | +2 | +2 | PASS |
| Ledger entry: transition | 98 -> 100 | 98 -> 100 | PASS |
| Double return blocked | cannot_return | cannot_return | PASS |
| DB sale status | REFUNDED | REFUNDED | PASS |
| DB payment_status | refunded | refunded | PASS |
| DB total_minor | 9000 | 9000 | PASS |
| DB ledger entries >= 1 | true | true | PASS |
| DB stock_balances | 100 | 100 | PASS |
| DB store_inventory | 100 | 100 | PASS |
| DB catalog current_stock | 100 | 100 | PASS |
| Back-to-back stability | 2/2 PASS | 2/2 PASS | PASS |

---

## Typecheck Gate

```
pnpm -r typecheck: 22/22 projects PASS (0 errors)
```

---

## Operator Checklist

- [ ] Migration 125 applied to local-prod Postgres
- [ ] Run 1: 17/17 PASS
- [ ] Run 2: 17/17 PASS (back-to-back)
- [ ] Stock lifecycle: 100 -> 98 (sale) -> 100 (return)
- [ ] Refund JSON: all 5 fields stable
- [ ] Double return: blocked with `cannot_return`
- [ ] DB proof: sale status REFUNDED, payment_status refunded, total 9000
- [ ] DB proof: ledger, stock_balances, store_inventory, catalog all restored
- [ ] Typecheck: 22/22 PASS
