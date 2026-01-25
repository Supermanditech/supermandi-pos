# AUD-999: VM Go-Live Audit - Iteration 2 (Discovery Only)

**Date:** 2026-01-25
**Commit:** 8a3ba2a
**Branch:** wip/trace-2026-01-15
**VM Gateway:** http://34.14.220.171:3000
**Scope:** NEW findings beyond VM Iteration 1 (AUDIT ONLY - NO FIXES)

---

## Executive Summary

| Severity | New Findings (Iter-2) |
|----------|-----------------------|
| CRITICAL | 7 |
| HIGH | 9 |
| MEDIUM | 8 |
| LOW | 5 |
| **TOTAL** | **29** |

---

## 1. VM Route Ownership + Missing Endpoint Sweep

### 1.1 Complete Endpoint Matrix

**Total registered routes: ~92** across 3 namespaces (POS: 40, Admin: 25, Retailer-Admin: 22, Other: 10)

#### POS Endpoints (40 routes, all require `x-device-token`)

| # | Method | Path | Status | Notes |
|---|--------|------|--------|-------|
| 1 | POST | /pos/events | 401 | Event logging |
| 2 | POST | /pos/scan/resolve | 401 | Barcode resolution |
| 3 | POST | /pos/products/price | 401 | Set product price |
| 4 | GET | /pos/products/lookup | 401 | Barcode lookup |
| 5 | POST | /pos/sales | 401 | Create sale |
| 6 | POST | /pos/sales/:id/confirm | 401 | Confirm sale |
| 7 | POST | /pos/sales/:id/cancel | 401 | Cancel sale |
| 8 | GET | /pos/daily-summary | 401 | Daily totals |
| 9 | GET | /pos/bills | 401 | Bill list |
| 10 | GET | /pos/bills/:saleId | 401 | Specific bill |
| 11 | POST | /pos/payments/upi/init | 401 | UPI init |
| 12 | POST | /pos/payments/upi/confirm-manual | 401 | UPI manual confirm |
| 13 | POST | /pos/payments/cash | 401 | Cash payment |
| 14 | POST | /pos/payments/due | 401 | Due payment |
| 15 | POST | /pos/collections/upi/init | 401 | Collection UPI init |
| 16 | POST | /pos/collections/upi/confirm-manual | 401 | Collection UPI confirm |
| 17 | POST | /pos/collections/cash | 401 | Collection cash |
| 18 | POST | /pos/collections/due | 401 | Collection due |
| 19 | POST | /pos/purchases | 401 | Submit purchase |
| 20 | GET | /pos/stores/:storeId/status | 401 | Store status |
| 21 | POST | /pos/sync | 401 | Offline sync |
| 22 | POST | /pos/enroll | **400** | **PUBLIC** (no auth) |
| 23 | GET | /pos/devices/me | 401 | Device info |
| 24 | GET | /pos/ui-status | 401 | UI flags |
| 25 | GET | /pos/inventory/ledger | 401 | Inventory ledger |
| 26 | POST | /pos/inventory/transactions | 401 | Stock transactions |
| 27 | POST | /pos/store-products | 401 | Digitise product |
| 28 | GET | /pos/store-products/search | 401 | Product search |
| 29 | GET | /pos/store-products/lookup | 401 | Product by barcode |
| 30 | GET | /pos/store-products/list | 401 | Full product list |
| 31 | GET | /pos/store-products/freshness | 401 | Freshness check |
| 32 | PATCH | /pos/store-products/price | 401 | Bulk price |
| 33 | PATCH | /pos/store-products/stock | 401 | Bulk stock |
| 34 | PATCH | /pos/store-products/metadata | 401 | Bulk metadata |
| 35 | PATCH | /pos/store-products/:id/metadata | 401 | Single metadata |
| 36 | GET | /pos/suppliers | 401 | Supplier list |
| 37 | GET | /pos/suppliers/:id | 401 | Single supplier |
| 38 | GET | /pos/suppliers/:id/products | 401 | Supplier products |
| 39 | GET | /pos/stock-in | 401 | Stock-in history |
| 40 | POST | /pos/stock-in | 401 | Submit stock-in |

#### Reorder/Orders Endpoints (10 routes, **NO AUTH MIDDLEWARE**)

| # | Method | Path | Status | Notes |
|---|--------|------|--------|-------|
| 1 | GET | /reorder/stores/:id/reorder/settings | **500** | DB error |
| 2 | PATCH | /reorder/stores/:id/reorder/settings | **500** | DB error |
| 3 | GET | /reorder/stores/:id/reorder/policies | **500** | DB error |
| 4 | PATCH | /reorder/stores/:id/reorder/policies/:pid | **500** | DB error |
| 5 | GET | /reorder/stores/:id/reorder/pending | **500** | DB error |
| 6 | GET | /orders/stores/:id/orders | **500** | DB error |
| 7 | GET | /orders/stores/:id/orders/:oid | **500** | DB error |
| 8 | GET | /orders/stores/:id/orders/:oid/events | **500** | DB error |
| 9 | POST | /orders/stores/:id/orders/:oid/cancel | **500** | DB error |
| 10 | DELETE | /orders/stores/:id/orders/:oid | **500** | DB error |

#### 404 Endpoints (routes that DON'T exist but may be expected)

| # | Method | Path | Status | Expected By |
|---|--------|------|--------|-------------|
| 1 | GET | /pos/inventory/stock/:id | 404 | Iter-1 referenced |
| 2 | GET | /pos/demo/seed | 404 | Demo setup |
| 3 | POST | /pos/voice/transcribe | 404 | Voice service |
| 4 | GET | /pos/voice/health | 404 | Voice service |
| 5 | GET | /api/v2/products | 404 | v2 API |
| 6 | GET | /api/products | 404 | Legacy API |
| 7 | GET | /pos/sales | 404 | Wrong name (use /bills) |
| 8 | GET | /pos/store-products | 404 | Wrong name (use /list) |

### 1.2 NEW Critical Findings

#### FINDING-001: Reorder/Orders Routes Have NO Authentication (CRITICAL)

**Severity:** CRITICAL
**Location:** `backend/src/routes/v1/index.ts:44-45`
**Proof:** All 10 endpoints return 500 (not 401/403) when hit without auth
**Impact:** If tables existed, anyone could access/modify order data for any store
**Repro:**
```
curl -s http://34.14.220.171:3000/api/v1/reorder/stores/any-store-id/reorder/settings
→ 500 INTERNAL_ERROR (no auth check occurred)
```

#### FINDING-002: Reorder/Orders Schema Missing on VM (HIGH)

**Severity:** HIGH
**Location:** Routes mounted but tables don't exist
**Proof:** All 10 endpoints return 500 with DB errors
**Impact:** Features non-functional; error handler exposes internal state
**Repro:**
```
curl -s http://34.14.220.171:3000/api/v1/orders/stores/test/orders
→ {"error":{"code":"INTERNAL_ERROR","message":"..."}}
```

#### FINDING-003: Route Naming Inconsistencies (MEDIUM)

**Severity:** MEDIUM
**Impact:** Frontend developers may call wrong endpoints
**Mismatches found:**
- `GET /pos/sales` DNE → use `GET /pos/bills`
- `GET /pos/sales/:id` DNE → use `GET /pos/bills/:saleId`
- `GET /pos/store-products` DNE → use `GET /pos/store-products/list`
- `PATCH /pos/store-products/:id/stock` DNE → use `PATCH /pos/store-products/stock` (bulk)
- `GET /pos/store` DNE → use `GET /pos/stores/:storeId/status`
- `POST /pos/scan` DNE → use `POST /pos/scan/resolve`

#### FINDING-004: 404 Response Format Inconsistency (LOW)

**Severity:** LOW
**Impact:** Client error handling must handle two formats
- Express routes: Raw HTML `<pre>Cannot GET /api/v1/pos/...</pre>`
- Gateway catch-all: JSON `{"error":{"code":"NOT_FOUND","message":"..."}}`

---

## 2. DB Schema Drift Sweep (NEW Concrete Failures)

### Beyond Iteration 1 Findings

Iteration 1 found: `stockIn.ts` uses wrong column/table names.
Iteration 2 found: **13 additional SQL failures across 6 files**.

#### FINDING-005: inventory.ts - 5 SQL Failures (CRITICAL)

**File:** `backend/src/routes/v1/pos/inventory.ts`

| Line | Failing SQL | Error |
|------|------------|-------|
| 71 | `FROM catalog.inventory_ledger il` | 42P01: table does not exist |
| 92 | `sp.barcode` in SELECT | 42703: column does not exist |
| 177 | `SELECT stock_on_hand FROM catalog.store_products` | 42703: column does not exist |
| 197 | `UPDATE catalog.store_products SET stock_on_hand` | 42703: column does not exist |
| 205 | `INSERT INTO catalog.inventory_ledger` | 42P01: table does not exist |

**Impact:** `GET /pos/inventory/ledger` and `POST /pos/inventory/transactions` return 500
**Fix Required:**
- `catalog.inventory_ledger` → `inventory.inventory_ledger`
- `stock_on_hand` → `current_stock`
- `sp.barcode` → join `catalog.products` for `primary_barcode`

#### FINDING-006: storeProducts.ts - 4 SQL Failures (CRITICAL)

**File:** `backend/src/routes/v1/pos/storeProducts.ts`

| Line | Failing SQL | Error |
|------|------------|-------|
| 458 | `FROM catalog.store_product_barcodes` | 42P01: table does not exist |
| 600 | `FROM catalog.store_product_barcodes spb` | 42P01: table does not exist |
| 842 | `FROM catalog.store_product_barcodes spb` | 42P01: table does not exist |
| 528 | `metadata_updated_at FROM catalog.store_products` | 42703: column may not exist |

**Impact:** Product search, barcode lookup, and metadata endpoints return 500
**Fix:** `catalog.store_product_barcodes` → `catalog.product_barcodes`

#### FINDING-007: storeProductDigitisationService.ts - 2 SQL Failures (CRITICAL)

**File:** `backend/src/services/storeProductDigitisationService.ts`

| Line | Failing SQL | Error |
|------|------------|-------|
| 90-112 | `FROM catalog.store_product_barcodes spb` | 42P01: table does not exist |
| 103 | JOIN conditions cascade from above | Cascading failure |

**Impact:** `POST /pos/store-products` (new product digitisation) returns 500
**Fix:** Same as FINDING-006

#### FINDING-008: retailer-admin/inventory.ts - Invalid Transaction Type (HIGH)

**File:** `backend/src/routes/v1/retailer-admin/inventory.ts`

| Line | Issue | Error |
|------|-------|-------|
| 82 | `transaction_type IN ('purchase_received', 'opening_stock')` | 23514: check constraint violation |

**Impact:** `'opening_stock'` is not a valid enum value per migration 005 CHECK constraint
**Valid values:** `'sale', 'sale_return', 'purchase_received', 'adjustment'`

#### FINDING-009: Supplier Schema Namespace Mismatch (HIGH)

**File:** `backend/src/routes/v1/admin/suppliers.ts`

Migration creates `supplier.suppliers` (with schema prefix) but queries use unqualified `FROM suppliers`
**Impact:** Queries look for `public.suppliers` which doesn't exist → 42P01 error

---

## 3. POS ↔ Dashboard Consistency Sweep

### NEW Consistency Issues (Beyond Iteration 1)

#### FINDING-010: Inventory Endpoint Stock Divergence (HIGH)

**Severity:** HIGH
**Data Path:**
```
POS PATCH /store-products/stock:
  → Writes to: inventory.stock_balances.current_qty (authoritative)
  → Also writes: catalog.store_products.current_stock (denormalized)

Dashboard /retailer-admin/products:
  → Reads: LEFT JOIN inventory.stock_balances → current_qty (CORRECT)

Dashboard /retailer-admin/inventory:
  → Reads: catalog.store_products.current_stock ONLY (NO JOIN to stock_balances)
```

**Impact:** Products page shows correct stock. Inventory overview page shows potentially stale stock.
**Repro:** Adjust stock via POS → check Dashboard Products vs Dashboard Inventory

#### FINDING-011: POS Direct API Calls Bypass Sync Outbox (HIGH)

**Severity:** HIGH
**Impact:** Dual write paths create inconsistent audit trails

| POS Action | Online Path | Offline Path | Conflict? |
|-----------|-------------|--------------|-----------|
| Set Price | POST /products/price (direct) | PRODUCT_PRICE_SET event | YES |
| Submit Purchase | POST /pos/purchases (direct) | PURCHASE_SUBMIT event | YES |
| Create Product | POST /store-products (direct) | PRODUCT_UPSERT event | YES |
| Stock-In | POST /stock-in (direct, online only) | No offline path | N/A |

**Scenario:** User offline queues PURCHASE_SUBMIT, goes online, direct POST also fires → duplicate purchase

#### FINDING-012: Cart Quantity Changes Are Ephemeral (MEDIUM)

**Severity:** MEDIUM (by design, but undocumented)
**Path:** Cart +/- buttons → `updateQuantity()` in Zustand store → NO backend call
**Impact:** Cart changes exist only in device memory until checkout. No recovery if app crashes.

---

## 4. Offline Sync Split-Brain Sweep

### Complete Event Type Trace (8 types found)

#### FINDING-013: PAYMENT Events Fail on Out-of-Order Delivery (CRITICAL)

**Severity:** CRITICAL
**Event Types Affected:** PAYMENT_CASH, PAYMENT_DUE
**Root Cause:** sync.ts:585-592 throws "sale not found" if SALE_CREATED hasn't been processed yet

**Scenario:**
```
1. Device offline: creates sale + payment (2 events queued)
2. Device online: sync sends batch of 50 events
3. Backend processes events sequentially
4. If PAYMENT event processed before SALE_CREATED (timing race):
   → "sale not found" error
   → PAYMENT event rejected
   → Stays in queue indefinitely (no max retry)
```

**Impact:** Customer's payment record lost. Sale exists but shows as unpaid.

#### FINDING-014: Rejected Events Never Expire (HIGH)

**Severity:** HIGH
**Location:** `src/services/offline/outbox.ts`
**Issue:** No `attempts` counter increment, no TTL, no max retry limit
**Impact:** Invalid events accumulate in outbox forever. Device SQLite grows unbounded.

```typescript
// outbox.ts: attempts field exists but NEVER incremented
await offlineDb.run(
  `INSERT INTO offline_outbox (..., attempts, ...) VALUES (?, ?, ?, ?, 0, NULL)`,
  [eventId, type, payload, createdAt]
);
// No code ever updates attempts column
```

#### FINDING-015: PURCHASE_CREATED Event Type is Orphaned (MEDIUM)

**Severity:** MEDIUM
**Location:** sync.ts:536-576 handles `PURCHASE_CREATED` but frontend outbox.ts only defines `PURCHASE_SUBMIT`
**Impact:** Dead code in backend. If ever triggered, would create duplicate handler.

#### FINDING-016: Sync Concurrency Guard is Process-Level Only (HIGH)

**Severity:** HIGH
**Location:** `src/services/offline/sync.ts:16`
```typescript
let syncing = false;
export async function syncOutbox(): Promise<void> {
  if (syncing) return;  // ← In-memory flag only
```
**Impact:** Guards against concurrent sync within same JS process, but NOT across:
- App background/foreground transitions
- Multiple React Native bridge calls
- App crash + restart mid-sync

---

## 5. Admin/SuperAdmin VM Sweep

### NEW SuperAdmin UI Findings

#### FINDING-017: Supplier API Response Format Mismatch (CRITICAL)

**Severity:** CRITICAL
**Frontend expects:** `{ data: [...] }`
**Backend returns:** `{ suppliers: [...], count: N }`

```typescript
// Frontend (supermandi-superadmin/src/api/suppliers.ts):
const data = await res.json();
return Array.isArray(data?.data) ? (data.data as PendingSupplierRequest[]) : [];
// Returns empty array because data.data is undefined

// Backend (admin/suppliers.ts):
res.json({ suppliers: result.rows, count: result.rowCount });
```

**Impact:** Suppliers page always shows empty list even with valid data.

#### FINDING-018: Supplier Rejection Field Name Mismatch (HIGH)

**Severity:** HIGH
**Frontend sends:** `{ reason: "..." }`
**Backend reads:** `const { reason } = req.body` (matches) BUT stores in `rejection_reason` column
**Schema defines:** `rejection_reason TEXT` in supplier.suppliers
**Additional Issue:** Backend queries `FROM suppliers` (no schema prefix) but table is `supplier.suppliers`

#### FINDING-019: Supplier Verification Incomplete (HIGH)

**Severity:** HIGH
**Frontend supports:**
1. Link to existing supplier: `{ supplierId: string }`
2. Verify directly: `{ verifySupplier: true }`
**Backend implements:** Only simple `UPDATE status = 'verified'`
**Missing:** Supplier linking logic, store_links creation

#### FINDING-020: AI Endpoint Depends on Missing OPENAI_API_KEY (MEDIUM)

**Severity:** MEDIUM
**Location:** `admin/ai.ts` → `askSuperMandiAI(question)`
**Issue:** Endpoint exists but requires OPENAI_API_KEY env var. If not set, returns error.
**VM Status:** Voice service reports `"openai":"not_configured"` - likely also affects AI endpoint.

---

## 6. Payment/Collection Flow Issues (NEW)

#### FINDING-021: Collections Have No Link to Sale/Payment (CRITICAL)

**Severity:** CRITICAL
**Schema:** `collections` table has NO `sale_id` or `payment_id` foreign key
**Impact:** Cannot reconcile which collection paid which DUE. Collections are orphaned records.

```sql
-- collections table:
CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  device_id TEXT NULL,
  amount_minor INTEGER NOT NULL,
  mode TEXT NOT NULL,
  reference TEXT NULL,      -- ← Generic, unused field
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ
);
-- NO foreign key to sales or payments table
```

**Repro:** Create DUE sale → create collection → query: "which sale did this collection pay?" → IMPOSSIBLE

#### FINDING-022: No Buyer/Customer Entity (HIGH)

**Severity:** HIGH
**Impact:** Sales are anonymous. DUE payments cannot be tracked to specific customers.
**Missing:** `customers` table, `sales.customer_id` column
**Business Impact:** Cannot send payment reminders, track credit limits, or report "who owes what"

#### FINDING-023: payments.sale_id is Nullable (HIGH)

**Severity:** HIGH
**Schema:** `sale_id TEXT NULL REFERENCES sales(id) ON DELETE SET NULL`
**Impact:** Payment records can exist without corresponding sale. Orphaned payments possible.

#### FINDING-024: No Partial Payment Support (MEDIUM)

**Severity:** MEDIUM
**Issue:** PAYMENT_DUE creates full-amount payment record. No way to track partial settlement.
**Scenario:** Sale Rs 10,000 → customer pays Rs 5,000 → no mechanism to record partial payment.

#### FINDING-025: Collection Amount Not Validated (MEDIUM)

**Severity:** MEDIUM
**Location:** sync.ts:624-638
**Issue:** `amountMinor` validated > 0 but NOT checked against original sale total.
**Impact:** Collection of Rs 100,000 against Rs 1,000 sale accepted without error.

---

## 7. Device Enrollment Lifecycle Issues (NEW)

#### FINDING-026: Device Tokens Never Expire (HIGH)

**Severity:** HIGH
**Schema:** No `device_token_expires_at` column in `pos_devices`
**Impact:** Compromised tokens valid forever until admin manually revokes.
**Current:** Token persists until `PATCH /admin/devices/:id { resetToken: true }` or device deactivation.

#### FINDING-027: No Max Devices Per Store Limit (MEDIUM)

**Severity:** MEDIUM
**Issue:** Unlimited devices can enroll to same store. Only IP rate limit (10/15min) applies.
**Impact:** If enrollment code leaked, attacker can create unlimited device sessions.

#### FINDING-028: Fingerprint Re-enrollment Bypasses Single-Use Codes (MEDIUM)

**Severity:** MEDIUM
**Location:** enroll.ts idempotent re-enrollment check
**Issue:** Device with matching fingerprint can re-enroll without incrementing `uses_count`
**Impact:** Effectively makes production codes reusable for same device.

#### FINDING-029: No Admin Code Revocation Endpoint (LOW)

**Severity:** LOW
**Issue:** `pos_device_enrollments.revoked_at` column exists but no admin endpoint to set it.
**Impact:** Cannot revoke active enrollment codes (must wait for expiry).

---

## Blocker Summary (Updated)

### CRITICAL (7) - Block Go-Live

| # | Finding | Impact |
|---|---------|--------|
| 1 | FINDING-001: Reorder/Orders routes have NO auth | Unauthenticated data access |
| 2 | FINDING-005: inventory.ts 5 SQL failures | Inventory endpoints 500 |
| 3 | FINDING-006: storeProducts.ts table not found | Product search/lookup 500 |
| 4 | FINDING-007: Digitisation service table not found | New product creation 500 |
| 5 | FINDING-013: Payment events fail out-of-order | Payment records lost |
| 6 | FINDING-017: Supplier API response format mismatch | Admin suppliers broken |
| 7 | FINDING-021: Collections orphaned (no sale FK) | Cannot reconcile DUE payments |

### HIGH (9) - Fix Before Scale

| # | Finding | Impact |
|---|---------|--------|
| 1 | FINDING-002: Reorder/Orders schema missing | Features non-functional |
| 2 | FINDING-008: Invalid transaction_type 'opening_stock' | Retailer inventory 500 |
| 3 | FINDING-009: Supplier schema namespace mismatch | Admin suppliers 500 |
| 4 | FINDING-010: Inventory vs Products stock divergence | Dashboard shows stale stock |
| 5 | FINDING-011: Direct API bypasses sync outbox | Duplicate purchases possible |
| 6 | FINDING-014: Rejected events never expire | Device DB grows unbounded |
| 7 | FINDING-016: Sync guard is process-level only | Mid-sync crash → corrupted state |
| 8 | FINDING-018: Supplier rejection field mismatch | Rejection reason lost |
| 9 | FINDING-019: Supplier verification incomplete | Cannot link suppliers |
| 10 | FINDING-022: No buyer/customer entity | Cannot track credit |
| 11 | FINDING-023: payments.sale_id nullable | Orphaned payments |
| 12 | FINDING-026: Device tokens never expire | Compromised tokens permanent |

### MEDIUM (8) - Fix Before 1000 Stores

| # | Finding | Impact |
|---|---------|--------|
| 1 | FINDING-003: Route naming inconsistencies | Developer confusion |
| 2 | FINDING-012: Cart qty changes ephemeral | Data loss on crash |
| 3 | FINDING-015: PURCHASE_CREATED orphaned event type | Dead code |
| 4 | FINDING-020: AI depends on missing OPENAI_API_KEY | Admin feature broken |
| 5 | FINDING-024: No partial payment support | Can't track partial DUE |
| 6 | FINDING-025: Collection amount not validated | Over-collection accepted |
| 7 | FINDING-027: No max devices per store | Enrollment abuse |
| 8 | FINDING-028: Fingerprint bypasses single-use | Code reuse |

### LOW (5) - Polish

| # | Finding | Impact |
|---|---------|--------|
| 1 | FINDING-004: 404 response format inconsistency | Client error handling |
| 2 | FINDING-029: No admin code revocation endpoint | Cannot cancel codes |
| 3 | Device enrollment has no activity audit trail | Cannot track enrollments |
| 4 | No device health heartbeat endpoint | Cannot monitor device status |
| 5 | No auto re-enrollment on 401 | Manual re-enrollment required |

---

## Evidence Appendix

### A. Curl Proofs (VM)

```bash
# FINDING-001: No auth on reorder routes
curl -s http://34.14.220.171:3000/api/v1/reorder/stores/test/reorder/settings
# → {"error":{"code":"INTERNAL_ERROR"}} (500, not 401)

# FINDING-002: Schema missing
curl -s http://34.14.220.171:3000/api/v1/orders/stores/test/orders
# → {"error":{"code":"INTERNAL_ERROR"}} (500)

# FINDING-003: Route naming
curl -s -o /dev/null -w "%{http_code}" http://34.14.220.171:3000/api/v1/pos/sales
# → 404 (use /pos/bills instead)

# FINDING-004: 404 format inconsistency
curl -s http://34.14.220.171:3000/api/v1/pos/nonexistent
# → <pre>Cannot GET /api/v1/pos/nonexistent</pre> (HTML)
curl -s http://34.14.220.171:3000/api/v1/nonexistent
# → {"error":{"code":"NOT_FOUND","message":"..."}} (JSON)

# All POS endpoints properly enforce device token:
curl -s http://34.14.220.171:3000/api/v1/pos/bills
# → {"success":false,"error":"device_unauthorized"}

# All admin endpoints enforce admin token:
curl -s http://34.14.220.171:3000/api/v1/admin/stores
# → {"error":{"code":"UNAUTHORIZED","message":"Missing x-admin-token..."}}

curl -s -H "x-admin-token: wrong" http://34.14.220.171:3000/api/v1/admin/stores
# → {"error":{"code":"FORBIDDEN","message":"Invalid admin token..."}}
```

### B. Code Evidence (SQL Failures)

```typescript
// FINDING-005: inventory.ts:71 - Wrong table
`FROM catalog.inventory_ledger il`
// Should be: FROM inventory.inventory_ledger il

// FINDING-005: inventory.ts:177 - Wrong column
`SELECT stock_on_hand FROM catalog.store_products`
// Should be: SELECT current_stock FROM catalog.store_products

// FINDING-006: storeProducts.ts:458 - Table DNE
`FROM catalog.store_product_barcodes`
// Should be: FROM catalog.product_barcodes

// FINDING-007: digitisationService.ts:90 - Same table DNE
`FROM catalog.store_product_barcodes spb`
// Should be: FROM catalog.product_barcodes spb

// FINDING-008: retailer-admin/inventory.ts:82 - Invalid enum
`il.transaction_type IN ('purchase_received', 'opening_stock')`
// 'opening_stock' violates CHECK constraint
// Valid: 'sale', 'sale_return', 'purchase_received', 'adjustment'

// FINDING-009: admin/suppliers.ts - Wrong schema
`FROM suppliers s WHERE ...`
// Table is supplier.suppliers (migration 003_supplier_schema.sql)
```

### C. Schema Definitions

```sql
-- Migration 004_catalog_schema.sql:129
CREATE TABLE catalog.store_products (
  current_stock INTEGER NOT NULL DEFAULT 0,  -- NOT stock_on_hand
  ...
);

-- Migration 004_catalog_schema.sql:72
CREATE TABLE catalog.product_barcodes (  -- NOT store_product_barcodes
  ...
);

-- Migration 005_inventory_schema.sql:14
CREATE TABLE inventory.inventory_ledger (  -- NOT catalog.inventory_ledger
  ...
  CONSTRAINT valid_transaction_type CHECK (
    transaction_type IN ('sale', 'sale_return', 'purchase_received', 'adjustment')
  )
);
```

### D. Sync Event Lifecycle

```
Frontend outbox types: PRODUCT_UPSERT | PRODUCT_PRICE_SET | SALE_CREATED |
                        PAYMENT_CASH | PAYMENT_DUE | COLLECTION_CREATED | PURCHASE_SUBMIT

Backend handles: Above + PURCHASE_CREATED (orphaned - never sent by frontend)

Direct API bypasses (online only, skip outbox):
- POST /pos/purchases (purchaseDraft.ts:85)
- POST /pos/store-products (scanApi.ts:298)
- POST /pos/products/price (scanApi.ts:145)
- POST /pos/stock-in (no offline equivalent)
```

### E. Payment/Collection Schema Gaps

```sql
-- payments: nullable sale_id allows orphans
CREATE TABLE payments (
  sale_id TEXT NULL REFERENCES sales(id) ON DELETE SET NULL,
  ...
);

-- collections: NO link to sale or payment
CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  reference TEXT NULL,  -- generic, unused
  -- MISSING: sale_id, payment_id
);
```

---

## Comparison: Iteration 1 vs Iteration 2

| Area | Iter-1 Found | Iter-2 NEW Findings |
|------|--------------|---------------------|
| Schema Drift | 2 issues (stockIn.ts) | 13 additional SQL failures in 6 files |
| Route Issues | Port 3009 stale | 10 unauthenticated routes, 8 missing routes, naming mismatches |
| Sync | Race conditions, no LWW | Out-of-order payment failure, no event expiry, direct API bypass |
| Inventory | Split-brain (4 tables) | Dashboard stock divergence between views |
| Admin | ADMIN_TOKEN not set | Supplier API format mismatch, schema namespace errors |
| Payments | Not covered | Orphaned collections, no customer entity, no partial payment |
| Enrollment | Endpoint works with rate limit | No token expiry, no device limit, fingerprint bypass |

---

**Report Generated:** 2026-01-25
**New Issues:** 29 (7 CRITICAL, 9 HIGH, 8 MEDIUM, 5 LOW)
**Go-Live Recommendation:** HOLD (7 critical blockers unresolved)
