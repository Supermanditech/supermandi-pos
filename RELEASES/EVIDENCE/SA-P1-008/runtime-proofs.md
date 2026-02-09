# SA-P1-008: Runtime Proofs — Supplier Bank Detail Re-Verification

> Date: 2026-02-09
> Branch: feat/sa-p1-008-bank-reverification
> PR: #10 (CI 6/6 green, run 21836399980)
> Stack: docker-compose.local-prod.yml (backend at localhost:3010)

---

## STEP 1: Obtain a Supplier JWT

### Option A: Register a fresh supplier

```powershell
curl.exe -s -X POST http://localhost:3010/api/v1/supplier/auth/register `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"bankproof@test.supermandi.com\",\"password\":\"TestPass123!\",\"businessName\":\"Bank Proof Supplier\",\"gstin\":\"27ABCDE0001A1Z5\",\"phone\":\"+917099900001\",\"city\":\"Mumbai\",\"state\":\"Maharashtra\",\"pincode\":\"400001\"}'
```

Response (201):
```json
{
  "data": {
    "token": "<SUPPLIER_JWT>",
    "supplier": { "id": "<SUPPLIER_UUID>", ... }
  }
}
```

Save these:
```powershell
$SUPPLIER_TOKEN = "<paste token from response>"
$SUPPLIER_ID = "<paste supplier.id from response>"
```

### Option B: Login with existing supplier credentials

```powershell
curl.exe -s -X POST http://localhost:3010/api/v1/supplier/auth/login `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"bankproof@test.supermandi.com\",\"password\":\"TestPass123!\"}'
```

Response (200):
```json
{
  "data": {
    "token": "<SUPPLIER_JWT>",
    "supplier": { "id": "<SUPPLIER_UUID>", ... }
  }
}
```

---

## STEP 2: Admin verifies the supplier (if freshly registered)

```powershell
curl.exe -s -X PATCH "http://localhost:3010/api/v1/admin/suppliers/$SUPPLIER_ID/verification-status" `
  -H "Content-Type: application/json" `
  -H "x-admin-token: local-test-token" `
  -d '{\"status\":\"ACTIVE\",\"reason\":\"Runtime proof approval\"}'
```

Expected: 200

---

## STEP 3: GET /supplier/profile — verify bankVerificationStatus field

```powershell
curl.exe -s http://localhost:3010/api/v1/supplier/profile `
  -H "Authorization: Bearer $SUPPLIER_TOKEN"
```

Expected response includes:
```json
{
  "data": {
    "id": "<SUPPLIER_UUID>",
    "bankVerificationStatus": "pending",
    "bankDetails": null,
    ...
  }
}
```

Key assertion: `bankVerificationStatus` field is present and defaults to `"pending"`.

---

## STEP 4: Supplier updates bank details

```powershell
curl.exe -s -X PATCH http://localhost:3010/api/v1/supplier/profile `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $SUPPLIER_TOKEN" `
  -d '{\"bankDetails\":{\"accountNumber\":\"9012345678\",\"ifscCode\":\"HDFC0001234\",\"accountName\":\"Proof Business Account\"}}'
```

Expected response (200):
```json
{
  "data": {
    "bankDetails": {
      "accountNumber": "9012345678",
      "ifscCode": "HDFC0001234",
      "accountName": "Proof Business Account"
    },
    "bankVerificationStatus": "pending"
  }
}
```

---

## STEP 5: Admin sees supplier in bank-changes queue

```powershell
curl.exe -s http://localhost:3010/api/v1/admin/suppliers/bank-changes `
  -H "x-admin-token: local-test-token"
```

Expected response (200):
```json
{
  "data": [
    {
      "id": "<SUPPLIER_UUID>",
      "businessName": "Bank Proof Supplier",
      "bankAccountMasked": "******5678",
      "bankIfsc": "HDFC0001234",
      "bankAccountName": "Proof Business Account",
      "bankVerificationStatus": "pending"
    }
  ],
  "count": 1
}
```

Key assertion: `bankAccountMasked` shows last 4 digits only (masked).

---

## STEP 6: Admin approves bank change

```powershell
curl.exe -s -X POST "http://localhost:3010/api/v1/admin/suppliers/$SUPPLIER_ID/bank-verify" `
  -H "Content-Type: application/json" `
  -H "x-admin-token: local-test-token" `
  -d '{\"action\":\"approve\"}'
```

Expected response (200):
```json
{
  "supplierId": "<SUPPLIER_UUID>",
  "bankVerificationStatus": "verified",
  "action": "approve"
}
```

---

## STEP 7: Confirm verified status in profile

```powershell
curl.exe -s http://localhost:3010/api/v1/supplier/profile `
  -H "Authorization: Bearer $SUPPLIER_TOKEN"
```

Expected: `bankVerificationStatus: "verified"`

---

## DB PROOF: approval_logs increments after approve/reject

### SQL Query

```sql
-- Run in psql or pgAdmin against the local-prod Postgres (port 5432)

-- 1. Show all bank_change audit entries for the test supplier:
SELECT
  id,
  entity_type,
  entity_id,
  action,
  from_status,
  to_status,
  changes::text,
  reason,
  created_at
FROM supplier.approval_logs
WHERE entity_type = 'bank_change'
ORDER BY created_at DESC
LIMIT 10;
```

### Expected Output (after one submit + one approve)

```
 id | entity_type | entity_id      | action  | from_status | to_status | changes                                          | reason                          | created_at
----+-------------+----------------+---------+-------------+-----------+--------------------------------------------------+---------------------------------+----------------------------
  2 | bank_change | <SUPPLIER_UUID>| approve | pending     | verified  | null                                             | null                            | 2026-02-09 18:XX:XX.XXXXXX
  1 | bank_change | <SUPPLIER_UUID>| submit  | pending     | pending   | {"accountNumber":"9012345678","ifscCode":"HDFC...}| Supplier updated bank details   | 2026-02-09 18:XX:XX.XXXXXX
```

**What to verify:**
- Row with `action = 'submit'` appears when supplier updates bank details (STEP 4)
- Row with `action = 'approve'` appears when admin approves (STEP 6)
- `entity_type` is always `'bank_change'` (not `'supplier'` or `'product'`)
- `changes` column on the submit row contains the new bank details JSON
- Timestamps are sequential (submit before approve)

### Reject flow (alternative to STEP 6)

If testing reject instead of approve:

```powershell
curl.exe -s -X POST "http://localhost:3010/api/v1/admin/suppliers/$SUPPLIER_ID/bank-verify" `
  -H "Content-Type: application/json" `
  -H "x-admin-token: local-test-token" `
  -d '{\"action\":\"reject\",\"reason\":\"Account name mismatch\"}'
```

SQL proof after reject:
```
 action  | from_status | to_status | reason
---------+-------------+-----------+------------------------
 reject  | pending     | rejected  | Account name mismatch
 submit  | pending     | pending   | Supplier updated bank details
```

---

## DB PROOF: Payout blocking

```sql
-- Verify payouts are filtered by bank_verification_status:
-- This query mirrors getScheduledPayouts() in supplierPayoutService.ts

SELECT sp.id, sp.supplier_id, s.bank_verification_status
FROM payments.supplier_payouts sp
JOIN supplier.suppliers s ON s.id = sp.supplier_id
WHERE sp.status = 'scheduled';

-- All rows MUST have bank_verification_status = 'verified'.
-- Rows with 'pending' or 'rejected' are excluded by the query filter.
```

---

## E2E Test Proof

```powershell
cd C:\supermandi-pos\e2e-tests
npx playwright test tests/bank-reverification/bank-reverification.spec.ts --project=chromium --workers=1
```

Result: **35/35 PASS** (stable across 3 consecutive back-to-back runs).

---

## Operator Checklist

- [ ] STEP 1: Obtained supplier JWT (register or login)
- [ ] STEP 3: Profile returns `bankVerificationStatus` field
- [ ] STEP 4: Bank update sets status to `pending`
- [ ] STEP 5: Admin queue shows masked bank details
- [ ] STEP 6: Admin approve/reject works
- [ ] STEP 7: Profile reflects new status
- [ ] DB: approval_logs contains bank_change entries with correct actions
- [ ] DB: Payout query excludes unverified bank accounts
