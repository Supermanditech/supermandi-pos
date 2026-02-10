# ITERATION 3: Missing Gaps Backlog

**Date**: 2026-01-25
**Auditor**: Claude Opus 4.6
**Method**: Fresh gap-hunt audit after Iter-1/2 fixes

---

## PRIORITY MATRIX

| Priority | Count | Criteria |
|----------|-------|----------|
| P0-CRITICAL | 4 | Runtime crash, data loss, auth bypass |
| P1-HIGH | 5 | Functional failure, security leak |
| P2-MEDIUM | 4 | API contract issues, inconsistency |
| P3-LOW | 2 | Code quality, minor UX |

---

## P0-CRITICAL GAPS (Must fix before go-live)

### GAP-001: Missing inventory stock endpoints
**Category**: API Contract Mismatch
**Severity**: CRITICAL

**Repro Steps**:
1. POS app calls `GET /api/v1/pos/inventory/stock/{productId}`
2. Backend returns 404

**Expected**: Returns `{ data: { productId, currentQty, ... } }`
**Actual**: 404 Not Found

**Files**:
- Frontend: `src/services/api/inventoryApi.ts:78` - calls endpoint
- Backend: `backend/src/routes/v1/pos/inventory.ts` - NO handler

**Acceptance Criteria**:
- [ ] Implement `GET /api/v1/pos/inventory/stock/:productId`
- [ ] Implement `POST /api/v1/pos/inventory/stock/batch`
- [ ] Return stock from `inventory.stock_balances`
- [ ] curl proof: 200 with stock data

---

### GAP-002: Retailer-admin routes missing JWT validation
**Category**: Auth Store-Isolation Leak
**Severity**: CRITICAL

**Repro Steps**:
1. Call `GET /api/v1/retailer-admin/suppliers` with forged `x-actor-id: victim-store`
2. No JWT validation occurs
3. Attacker gets victim store's supplier list

**Expected**: Validate JWT matches x-actor-id
**Actual**: x-actor-id header trusted without verification

**Files**:
- `backend/src/routes/v1/retailer-admin/suppliers.ts:14-17` - getStoreId()
- `backend/src/routes/v1/retailer-admin/products.ts:48` - same pattern

**Acceptance Criteria**:
- [ ] Add middleware to validate JWT subject matches x-actor-id
- [ ] Return 403 if mismatch
- [ ] curl proof: 403 with forged header

---

### GAP-003: Missing `payments` table in DB schema
**Category**: DB Schema Drift
**Severity**: CRITICAL

**Repro Steps**:
1. Complete a sale and call `/api/v1/pos/sales/:id/confirm`
2. Backend tries `INSERT INTO payments`
3. PostgreSQL error: relation "payments" does not exist

**Expected**: Payments table exists with status, confirmed_at columns
**Actual**: Table not created by any migration

**Files**:
- `backend/src/routes/v1/pos/sales.ts:1343-1349` - INSERT INTO payments
- `backend/migrations/` - NO payments table migration

**Acceptance Criteria**:
- [ ] Create migration: `CREATE TABLE public.payments`
- [ ] Include: id, sale_id, status, mode, amount_minor, confirmed_at
- [ ] curl proof: Payment confirmation succeeds

---

### GAP-004: Sales status CHECK constraint mismatch
**Category**: DB Schema Drift
**Severity**: CRITICAL

**Repro Steps**:
1. Complete a cash payment
2. Backend updates `sales.status = 'PAID_CASH'`
3. PostgreSQL error: violates check constraint

**Expected**: Constraint allows 'PAID_CASH', 'PAID_UPI'
**Actual**: Constraint only allows 'pending', 'completed', 'cancelled', 'voided'

**Files**:
- `backend/src/routes/v1/pos/sales.ts:1477-1478` - uses 'PAID_CASH'
- `backend/migrations/018_sales_schema.sql:52-53` - wrong constraint

**Acceptance Criteria**:
- [ ] Migration to alter CHECK constraint
- [ ] Allow: 'pending', 'PAID_CASH', 'PAID_UPI', 'DUE', 'cancelled', 'voided'
- [ ] curl proof: Payment status update succeeds

---

## P1-HIGH GAPS

### GAP-005: Translations router not mounted
**Category**: VM Proxy/Route Gap
**Severity**: HIGH

**Repro Steps**:
1. Call `GET /api/v1/pos/product/:productId` (translation)
2. Returns 404

**Expected**: Returns localized product
**Actual**: 404 - route not mounted

**Files**:
- `backend/src/routes/v1/pos/translations.ts` - exists but not imported
- `backend/src/routes/v1/index.ts` - missing import

**Acceptance Criteria**:
- [ ] Import and mount `posTranslationsRouter` in v1/index.ts
- [ ] curl proof: Translation endpoint returns 200

---

### GAP-006: Missing `source` column in inventory_ledger
**Category**: DB Schema Drift
**Severity**: HIGH

**Repro Steps**:
1. Call `POST /api/v1/pos/inventory/transactions`
2. INSERT includes `source` column
3. PostgreSQL error: column "source" does not exist

**Expected**: Column exists for audit trail
**Actual**: Column not in migration

**Files**:
- `backend/src/routes/v1/pos/inventory.ts:233` - inserts 'POS_INVENTORY'
- `backend/migrations/005_inventory_schema.sql` - no source column

**Acceptance Criteria**:
- [ ] Migration: `ALTER TABLE inventory.inventory_ledger ADD COLUMN source VARCHAR(50)`
- [ ] curl proof: Inventory transaction succeeds

---

### GAP-007: Missing columns in orders.purchase_orders
**Category**: DB Schema Drift
**Severity**: HIGH

**Repro Steps**:
1. Call `GET /api/v1/orders/stores/:storeId/orders`
2. Query selects `item_count`, `tracking_number`, `carrier`
3. PostgreSQL error: column does not exist

**Files**:
- `backend/src/routes/v1/orders.ts:108-109` - selects missing columns
- `backend/migrations/006_orders_schema.sql` - columns not defined

**Acceptance Criteria**:
- [ ] Migration: Add item_count, tracking_number, carrier columns
- [ ] curl proof: Orders list returns 200

---

### GAP-008: Store binding bypass if storeId omitted
**Category**: Auth Store-Isolation Leak
**Severity**: HIGH

**Repro Steps**:
1. Device bound to Store-A
2. Send POS request WITHOUT storeId field
3. Store binding check passes (returns true on line 66)

**Expected**: Require explicit storeId
**Actual**: Missing storeId bypasses check

**Files**:
- `backend/src/middleware/deviceToken.ts:66` - `if (candidates.length === 0) return true`

**Acceptance Criteria**:
- [ ] Return 400 if storeId not provided in required endpoints
- [ ] Log warning for missing storeId
- [ ] curl proof: 400 if storeId omitted

---

### GAP-009: sale_items column name mismatch
**Category**: DB Schema Drift
**Severity**: HIGH

**Repro Steps**:
1. Create a sale
2. INSERT uses `item_name` column
3. PostgreSQL error: column doesn't exist (schema has `name`)

**Files**:
- `backend/src/routes/v1/pos/sales.ts:1039` - uses `item_name`
- `backend/migrations/018_sales_schema.sql:99` - defines `name`

**Acceptance Criteria**:
- [ ] Migration: Rename column OR update all code
- [ ] curl proof: Sale creation succeeds

---

## P2-MEDIUM GAPS

### GAP-010: CORS too permissive (allows *)
**Category**: Security
**Severity**: MEDIUM

**Files**:
- `backend/services/api-gateway/src/index.ts:24` - `Allow-Origin: *`

**Acceptance Criteria**:
- [ ] Restrict to known domains
- [ ] Use env var for allowed origins

---

### GAP-011: Error response format inconsistency
**Category**: API Contract
**Severity**: MEDIUM

**Files**:
- `backend/src/routes/v1/pos/storeProducts.ts` - various formats

**Acceptance Criteria**:
- [ ] Standardize: `{ error: { code, message } }` OR `{ error, message }`
- [ ] Update all error responses

---

### GAP-012: Create endpoint missing success wrapper
**Category**: API Contract
**Severity**: MEDIUM

**Files**:
- `backend/src/routes/v1/pos/storeProducts.ts:216` - returns `{ storeProduct }`

**Acceptance Criteria**:
- [ ] Add `success: true` wrapper for consistency
- [ ] Or document as intentional exception

---

### GAP-013: Admin devices returns all stores without filter
**Category**: Auth
**Severity**: MEDIUM

**Files**:
- `backend/src/routes/v1/admin/devices.ts:27` - optional storeId

**Acceptance Criteria**:
- [ ] Require explicit permission for all-stores query
- [ ] Add audit logging

---

## P3-LOW GAPS

### GAP-014: Type safety issues in navigation
**Category**: Code Quality
**Severity**: LOW

**Files**:
- `src/screens/BillDetailScreen.tsx:97` - uses `as any`

**Acceptance Criteria**:
- [ ] Remove `as any` cast
- [ ] Use proper typed navigation

---

### GAP-015: Inconsistent back handler pattern
**Category**: Code Quality
**Severity**: LOW

**Files**:
- `src/screens/SalesHistoryScreen.tsx` - uses hook directly
- Others use `onBack` prop

**Acceptance Criteria**:
- [ ] Standardize on callback pattern

---

## IMPLEMENTATION ORDER

1. **GAP-003**: Create payments table migration
2. **GAP-004**: Fix sales status constraint
3. **GAP-006**: Add source column to ledger
4. **GAP-007**: Add orders columns
5. **GAP-009**: Fix sale_items column name
6. **GAP-001**: Implement inventory stock endpoints
7. **GAP-005**: Mount translations router
8. **GAP-002**: Add JWT validation middleware
9. **GAP-008**: Require storeId in binding check

---

## ROLLBACK PLAN

```bash
# If any migration fails
psql -U supermandi -d supermandi -c "
  -- Rollback commands will be in each migration's DOWN section
"

# If code changes break:
git checkout HEAD~1 -- backend/src/routes/
docker-compose restart main-backend
```

---

*Generated by Claude Code Iteration-3 Gap Hunt Audit*
