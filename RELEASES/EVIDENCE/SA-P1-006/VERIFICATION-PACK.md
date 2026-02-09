# SA-P1-006: Operator Verification Pack

## Prerequisites
- Docker Desktop running
- On branch `feat/sa-p1-006-payment-method-control`
- Clean working tree

---

## STEP 0: Rebuild Backend + SuperAdmin (picks up new code + migration)

```powershell
# Rebuild main-backend (includes migration 100) and superadmin (includes checkboxes)
docker compose -f c:/supermandi-pos/scripts/docker-compose.local-prod.yml up -d --build main-backend superadmin
```

Wait ~30-60s for containers to rebuild and start. The main-backend entrypoint
automatically runs `migrate-prod.js up` which applies migration 100.

---

## STEP 1: Verify services are healthy

```powershell
# Health checks
curl.exe -s http://localhost:3010/health
curl.exe -s http://localhost:3010/version
```

Both should return 200 with `"status":"ok"`.

---

## STEP 2: Verify migration applied — column exists

```powershell
# Check column exists on platform.stores
docker compose -f c:/supermandi-pos/scripts/docker-compose.local-prod.yml exec postgres psql -U postgres -d supermandi -c "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_schema='platform' AND table_name='stores' AND column_name='allowed_payment_methods';"
```

**Expected**: Row showing `allowed_payment_methods | ARRAY | '{CASH,UPI,DUE}'::text[]`

```powershell
# Verify column visible through public.stores VIEW
docker compose -f c:/supermandi-pos/scripts/docker-compose.local-prod.yml exec postgres psql -U postgres -d supermandi -c "SELECT id, name, allowed_payment_methods FROM stores LIMIT 5;"
```

**Expected**: Rows with `{CASH,UPI,DUE}` for all stores (no error)

```powershell
# Verify migration recorded
docker compose -f c:/supermandi-pos/scripts/docker-compose.local-prod.yml exec postgres psql -U postgres -d supermandi -c "SELECT name, applied_at FROM _migrations WHERE name LIKE '%sa_p1_006%';"
```

**Expected**: `100_sa_p1_006_allowed_payment_methods.sql` with timestamp

---

## STEP 3: Ensure demo device token is valid

```powershell
# Ensure demo token has valid expiry (migration 056 doesn't set token_expires_at)
docker compose -f c:/supermandi-pos/scripts/docker-compose.local-prod.yml exec postgres psql -U postgres -d supermandi -c "UPDATE pos_devices SET token_expires_at = NOW() + INTERVAL '90 days', updated_at = NOW() WHERE id = 'demo-device-001' AND (token_expires_at IS NULL OR token_expires_at < NOW());"
```

```powershell
# Verify token works
curl.exe -s "http://localhost:3010/api/v1/pos/ui-status" -H "X-Device-Token: demo-smoke-test-token-001"
```

**Expected**: JSON with `storeId`, `storeName`, `allowedPaymentMethods: ["CASH","UPI","DUE"]`

---

## STEP 4: Admin GET — stores include allowed_payment_methods

```powershell
# List stores (via direct backend)
curl.exe -s "http://localhost:3010/api/v1/admin/stores" -H "x-admin-token: local-test-token"
```

**Expected**: Each store object includes `"allowed_payment_methods":["CASH","UPI","DUE"]` and `"allowedPaymentMethods":["CASH","UPI","DUE"]`

```powershell
# Single store
curl.exe -s "http://localhost:3010/api/v1/admin/stores/a0000000-0000-0000-0000-000000000001" -H "x-admin-token: local-test-token"
```

**Expected**: `store` object with `allowedPaymentMethods: ["CASH","UPI","DUE"]`

---

## STEP 5: Admin PATCH — disable DUE

```powershell
# Disable DUE for Demo store (keep CASH + UPI only)
curl.exe -s -X PATCH "http://localhost:3010/api/v1/admin/stores/a0000000-0000-0000-0000-000000000001" -H "Content-Type: application/json" -H "x-admin-token: local-test-token" -d "{\"allowedPaymentMethods\":[\"CASH\",\"UPI\"]}"
```

**Expected**: 200 with `allowedPaymentMethods: ["CASH","UPI"]`

```powershell
# Verify in DB
docker compose -f c:/supermandi-pos/scripts/docker-compose.local-prod.yml exec postgres psql -U postgres -d supermandi -c "SELECT id::text, name, allowed_payment_methods FROM platform.stores WHERE id = 'a0000000-0000-0000-0000-000000000001';"
```

**Expected**: `{CASH,UPI}` (DUE removed)

---

## STEP 6: Validation — invalid inputs rejected

```powershell
# Invalid method rejected
curl.exe -s -X PATCH "http://localhost:3010/api/v1/admin/stores/a0000000-0000-0000-0000-000000000001" -H "Content-Type: application/json" -H "x-admin-token: local-test-token" -d "{\"allowedPaymentMethods\":[\"CASH\",\"BITCOIN\"]}"
```

**Expected**: 400 `"allowedPaymentMethods: only CASH, UPI, DUE allowed"`

```powershell
# Empty array rejected
curl.exe -s -X PATCH "http://localhost:3010/api/v1/admin/stores/a0000000-0000-0000-0000-000000000001" -H "Content-Type: application/json" -H "x-admin-token: local-test-token" -d "{\"allowedPaymentMethods\":[]}"
```

**Expected**: 400 `"allowedPaymentMethods must be a non-empty array"`

---

## STEP 7: ui-status reflects restricted methods

```powershell
# Should now return only CASH + UPI (DUE was disabled in Step 5)
curl.exe -s "http://localhost:3010/api/v1/pos/ui-status" -H "X-Device-Token: demo-smoke-test-token-001"
```

**Expected**: `"allowedPaymentMethods":["CASH","UPI"]` (no DUE)

---

## STEP 8: Sale confirm returns 403 for disallowed method

The SA-P1-006 check fires BEFORE sale lookup (line 1198 in sales.ts),
so we can use any saleId — the 403 happens before the sale is fetched.

```powershell
# Try to confirm with DUE (DISALLOWED) → expect 403
curl.exe -s -X POST "http://localhost:3010/api/v1/pos/sales/test-sale-for-403/confirm" -H "Content-Type: application/json" -H "X-Device-Token: demo-smoke-test-token-001" -d "{\"paymentMode\":\"DUE\"}"
```

**Expected**: 403 `{"error":"payment_method_not_allowed","message":"DUE is not enabled for this store","allowedMethods":["CASH","UPI"]}`

```powershell
# Try to confirm with CASH (ALLOWED) → passes payment gate, fails at sale lookup
curl.exe -s -X POST "http://localhost:3010/api/v1/pos/sales/test-sale-for-403/confirm" -H "Content-Type: application/json" -H "X-Device-Token: demo-smoke-test-token-001" -d "{\"paymentMode\":\"CASH\"}"
```

**Expected**: 404 `sale_not_found` (proves CASH passes the payment method gate)

---

## STEP 9: Restore defaults

```powershell
# Restore all methods for Demo store
curl.exe -s -X PATCH "http://localhost:3010/api/v1/admin/stores/a0000000-0000-0000-0000-000000000001" -H "Content-Type: application/json" -H "x-admin-token: local-test-token" -d "{\"allowedPaymentMethods\":[\"CASH\",\"UPI\",\"DUE\"]}"
```

**Expected**: 200 with `allowedPaymentMethods: ["CASH","UPI","DUE"]`

```powershell
# Verify ui-status restored
curl.exe -s "http://localhost:3010/api/v1/pos/ui-status" -H "X-Device-Token: demo-smoke-test-token-001"
```

**Expected**: `"allowedPaymentMethods":["CASH","UPI","DUE"]`

```powershell
# Verify DB restored
docker compose -f c:/supermandi-pos/scripts/docker-compose.local-prod.yml exec postgres psql -U postgres -d supermandi -c "SELECT id::text, name, allowed_payment_methods FROM platform.stores WHERE id = 'a0000000-0000-0000-0000-000000000001';"
```

**Expected**: `{CASH,UPI,DUE}`

---

## STEP 10: SuperAdmin UI verification (browser)

1. Open http://localhost:8083/admin/ in Chrome Incognito
2. Navigate to Stores section
3. Expand Demo Store row
4. Verify CASH/UPI/DUE checkboxes are visible and all checked
5. Uncheck DUE → Save → Verify save succeeds
6. Refresh page → Verify DUE is still unchecked
7. Re-check DUE → Save → Verify all three checked again

**Screenshot each state** per screenshots/TEMPLATE.md

---

## Pass Criteria

| Check | Expected | Status |
|-------|----------|--------|
| Migration applied | Column exists, view updated | |
| Admin GET list | includes allowed_payment_methods + allowedPaymentMethods | |
| Admin GET single | includes allowedPaymentMethods | |
| Admin PATCH | Accepts and persists new methods | |
| Admin validation | Rejects invalid/empty arrays | |
| ui-status | Returns store's allowed methods | |
| Sale confirm 403 | Returns payment_method_not_allowed for disabled method | |
| Sale confirm pass | Allowed method passes gate (404 sale_not_found) | |
| Defaults restored | All stores back to CASH/UPI/DUE | |
| SuperAdmin UI | Checkboxes work, persist, survive refresh | |
