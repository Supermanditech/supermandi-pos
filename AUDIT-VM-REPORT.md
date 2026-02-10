# SuperMandi POS - VM Go-Live Audit Report

**Audit ID:** AUDIT-VM
**Date:** 2026-01-25
**Commit:** 8a3ba2a (now at a04bc0d with fixes)
**VM:** http://34.14.220.171:3000 (API Gateway v3.0.9) | Backend v3.0.10
**Status:** IMPLEMENTATION IN PROGRESS
**Auditor:** Claude Code (Opus 4.6)

---

## AUD-999 PDF Ticket Resolution Status

| Ticket | Severity | Issue | Code Fix | VM Status |
|--------|----------|-------|----------|-----------|
| AUD-025-A | CRITICAL | Sync writes to legacy schema | 9a8278d, 52b5432 | Backend deployed |
| AUD-025-B | CRITICAL | No LWW protection | 7a39769, 50bbcac, eda416e | Backend deployed |
| AUD-041-A | CRITICAL | opening_stock CHECK missing | Migration 035 | VERIFIED PASS |
| AUD-000-A | HIGH | Port 3009 unreachable | N/A (obsolete) | VERIFIED PASS |
| AUD-003-A | HIGH | ADMIN_TOKEN not set | N/A (config) | VERIFIED PASS |
| AUD-022-A | HIGH | POS can't edit brand/mode | 548a0bb, 7a0ccde | Backend deployed |
| AUD-VM-042 | CRITICAL | Sales can't use catalog products | d41087c | Code ready, needs deploy |
| AUD-024-A | HIGH | Stock drift | 7b47c91 | Backend deployed |
| AUD-042-A | HIGH | Gateway routes to dead ports | a04bc0d | NEEDS GW DEPLOY |
| AUD-012-A | MEDIUM | /pos/store returns 404 | N/A (by design) | VERIFIED PASS |
| AUD-021-A | MEDIUM | Scan disambiguation | d207575 | Backend deployed |
| AUD-030-A | MEDIUM | SuperAdmin 403 | =AUD-003-A | VERIFIED PASS |
| AUD-040-A | MEDIUM | Microservice routes 404 | =AUD-042-A | NEEDS GW DEPLOY |
| AUD-013-A | LOW | Bulk import no stock_balances | 29dc992 (MT-7) | VERIFIED PASS |
| AUD-031-A | LOW | Admin no JWT cross-check | N/A (by design) | VERIFIED PASS |

---

## Original Audit Report (Below)

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Total Tickets** | 13 |
| **PASS** | 4 |
| **CONDITIONAL PASS** | 1 |
| **FAIL** | 8 |
| **Overall Verdict** | **NOT READY FOR GO-LIVE** |

### Verdict Matrix

| Ticket | Title | Verdict | Severity |
|--------|-------|---------|----------|
| AUDIT-VM-000 | VM Reality Baseline | **PASS** | - |
| AUDIT-VM-001 | Port 3009 Truth Check | **PASS** | - |
| AUDIT-VM-010 | Retailer Dashboard Wiring | **PASS** | - |
| AUDIT-VM-011 | Retailer Login Ownership | **PASS** | - |
| AUDIT-VM-020 | Admin APIs 403 + Token | **CONDITIONAL PASS** | HIGH |
| AUDIT-VM-030 | POS Sync Dual-Schema | **FAIL** | CRITICAL |
| AUDIT-VM-031 | Metadata Sync LWW | **FAIL** | CRITICAL |
| AUDIT-VM-040 | Sync Concurrency + Dedup | **FAIL** | CRITICAL |
| AUDIT-VM-050 | DB Schema Drift | **FAIL** | CRITICAL |
| AUDIT-VM-060 | Sales Data Ownership | **FAIL** | HIGH |
| AUDIT-VM-070 | CSV/Bulk Import Integrity | **FAIL** | HIGH |
| AUDIT-VM-080 | Dead Code / Unused Routes | **FAIL** | MEDIUM |
| AUDIT-VM-090 | Inventory Split-Brain | **FAIL** | CRITICAL |

---

## AUDIT-VM-000: VM Reality Baseline

**Goal:** Reconcile which services are actually running on the VM (Iter-1 vs Iter-3 discrepancy)

### Findings

All 8 microservices are **running and healthy** on the VM:

| Service | Port | Health | Status |
|---------|------|--------|--------|
| API Gateway | 3000 | 200 OK | v3.0.9 |
| Auth Service | 3001 (proxied) | 200 OK | Active |
| Platform Service | 3002 (proxied) | 200 OK | Active |
| Catalog Service | 3003 (proxied) | 200 OK | Redis connected |
| Main Backend | 3010 (internal) | 200 OK | Active |
| Voice Service | (proxied) | 200 OK | Mock mode |
| Retailer Admin | (proxied) | 200 OK | v3.0.10 |
| Enrollment | (proxied) | 200 OK | Rate limited |

### Authoritative Route Table

- **POS Traffic**: Gateway :3000 -> `/api/v1/pos/*` -> Main Backend :3010 (stripPrefix: false)
- **Retailer Auth**: Gateway :3000 -> `/api/v1/retailer-admin/auth` -> Auth Service :3001 (stripPrefix: true)
- **Retailer APIs**: Gateway :3000 -> `/api/v1/retailer-admin/*` -> Main Backend :3010 (stripPrefix: false)
- **Admin APIs**: Gateway :3000 -> `/api/v1/admin/*` -> Main Backend :3010 (stripPrefix: false)
- **Enrollment**: Gateway :3000 -> `/api/v1/pos/enroll` -> Main Backend :3010

### Evidence

- Iteration 1's claim of "services not running" was **INCORRECT**
- All services respond with health check data including database and Redis connections
- Firebase login endpoint EXISTS (returns 400 validation, not 404)

### Verdict: **PASS**

---

## AUDIT-VM-001: POS Service Port 3009 Truth Check

**Goal:** Determine if port 3009 is stale or required

### Findings

- Port 3009: **CONNECTION REFUSED** on VM
- POS app uses only gateway port 3000 (`app.json` -> `API_URL: "http://34.14.220.171:3000"`)
- `src/config/api.ts` resolves to `EXPO_PUBLIC_API_URL || extra.API_URL` = port 3000
- 26 files reference port 3009 but ALL are dead code (docs, scripts, temp files, `app.json.POS_API_URL` which is never read)

### Evidence

- `app.json:21-24`: `POS_API_URL: "http://34.14.220.171:3009"` (STALE, never imported)
- `app.json:19`: `API_URL: "http://34.14.220.171:3000"` (ACTIVE, used by POS app)
- Gateway config proxies POS to `ADMIN_SERVICE_URL` which resolves to `http://supermandi-main-backend:3010`

### Verdict: **PASS**

Port 3009 is confirmed STALE. All active POS traffic routes through gateway :3000.

---

## AUDIT-VM-010: Retailer Dashboard Route-Backend Wiring

**Goal:** Verify all dashboard frontend API calls reach working backend endpoints

### Findings

Complete wiring verification of 24+ endpoints:

| Category | Endpoints | All Wired | Status |
|----------|-----------|-----------|--------|
| Inventory | 2 (overview, ledger) | Yes | OK |
| Categories | 4 (list, products, rename, hide) | Yes | OK |
| Products | 7 (CRUD, SKU PDF, bulk) | Yes | OK |
| Suppliers | 4 (CRUD) | Yes | OK |
| CSV Import | 4 (template, upload, validate, commit) | Yes | OK |
| Search | 1 (global search) | Yes | OK |

### Key Observations

- Gateway routing correctly strips prefix for Auth Service, forwards full path for all others
- JWT authentication properly flows: Firebase -> Auth Service -> Gateway verification -> downstream
- `x-actor-id` header set by gateway after JWT verification provides store scoping
- All data contracts (request/response formats) match between frontend and backend
- Price conversion (rupees <-> paise) handled correctly at frontend

### Verdict: **PASS**

All retailer dashboard frontend routes correctly wire to functional backend endpoints.

---

## AUDIT-VM-011: Retailer Login Ownership (Firebase/Auth)

**Goal:** Determine which service owns retailer authentication

### Findings

**Primary Owner: Auth Service** (port 3001)

Login flow:
1. Frontend: Firebase Phone OTP (client SDK)
2. User enters OTP -> Firebase verifies -> Returns ID Token
3. Frontend: POST `/api/v1/retailer-admin/auth/firebase-login` with `{idToken, storeCode}`
4. Gateway strips prefix, routes to Auth Service
5. Auth Service: `verifyFirebaseIdToken()` via Firebase Admin SDK
6. Auth Service: Validates store exists + portal enabled + phone matches
7. Auth Service: Creates/retrieves user in `auth.users` + `auth.store_users`
8. Auth Service: Issues JWT pair (access: 15min, refresh: 7 days)
9. Gateway: Verifies JWT on subsequent requests, sets `x-user-id`, `x-actor-id` headers

### Security Assessment

- Firebase Admin SDK properly initialized (conditional on `FIREBASE_ENABLED`)
- Token verification includes signature + expiry checks
- Store phone validation prevents unauthorized access
- `stripClientAuthHeaders()` prevents header spoofing
- 30-minute idle timeout on frontend
- All admin/retailer routes behind JWT verification

### Verdict: **PASS**

Login ownership is clear and properly implemented.

---

## AUDIT-VM-020: Admin APIs 403 + Token Contract

**Goal:** Verify admin API authentication mechanism

### Findings

**Token Contract:**
- Header: `x-admin-token` (case-insensitive)
- Format: Raw string (no Bearer prefix, no JWT)
- Source: `ADMIN_TOKEN` environment variable

**Middleware behavior:**
- Token NOT SET -> 503 "Admin APIs are not configured"
- Header missing -> 401 "Missing x-admin-token header"
- Header wrong -> 403 "Invalid admin token. Access denied."
- Header correct -> Request forwarded

**Critical Finding:** `ADMIN_TOKEN` is **NOT SET** on current VM, causing all admin APIs to return 503.

**Security Issue:** Default fallback token `0d57d3b70e8cab31e2cc50faf363a5c0` hardcoded in `docker-compose.prod.yml` (exposed in git).

### Protected Routes (9 routers)

analytics, stores, ai, devices, device-enrollments, barcode-sheets, global-products, suppliers, pos-events

### Verdict: **CONDITIONAL PASS**

Token contract is well-documented and secure, but `ADMIN_TOKEN` must be set on VM before admin dashboard is functional.

---

## AUDIT-VM-030: POS Offline Sync Dual-Schema Reality

**Goal:** Verify which schema POS sync writes to vs. what Dashboard reads

### Findings

**POS Sync writes to LEGACY tables:**
- `public.products` (name, unit, brand)
- `public.variants` (sell_price, buy_price)
- `public.barcodes` (barcode -> variant mapping)
- `public.retailer_variants` (retailer-specific pricing)
- `public.sales`, `public.sale_items` (sale records)

**Dashboard reads from CATALOG schema:**
- `catalog.products` (name, brand, unit)
- `catalog.store_products` (sell_price, current_stock)
- `catalog.store_product_barcodes` (barcode mapping)
- `inventory.inventory_ledger` (stock movements)

**Result:** POS and Dashboard operate on **COMPLETELY SEPARATE data sets**. Products created via POS sync are invisible to Dashboard. Products created via Dashboard are invisible to POS.

### Evidence

- `sync.ts:118-135` (PRODUCT_UPSERT): Writes to `products`, `variants`, `barcodes`
- `retailer-admin/products.ts:433-450` (PATCH): Writes to `catalog.store_products`
- No cross-schema synchronization exists

### Verdict: **FAIL** (CRITICAL)

Complete schema split between POS and Dashboard data paths.

---

## AUDIT-VM-031: Two-Way Product Metadata Sync LWW

**Goal:** Verify Last-Write-Wins timestamp comparison for metadata conflicts

### Findings

**NO LWW IMPLEMENTED ANYWHERE.**

- POS `PATCH /store-products/:id/metadata`: Sets `metadata_updated_at = NOW()` unconditionally (storeProducts.ts:808-810)
- Dashboard `PATCH /products/:id`: Sets `metadata_updated_at = NOW()` only if `display_name` changes (products.ts:433-450)
- Sync `PRODUCT_PRICE_SET`: Sets `price_updated_at = NOW()` unconditionally

**Neither path compares timestamps.** Whichever write executes last wins, regardless of when the change was actually made. Offline POS edits made hours ago will overwrite fresh Dashboard edits on next sync.

### Evidence

- No `WHERE metadata_updated_at < $new_timestamp` clause anywhere in codebase
- No `IF metadata_updated_at > existing THEN update` logic
- Both paths use `NOW()` server time (not client timestamp)

### Verdict: **FAIL** (CRITICAL)

No conflict resolution mechanism. Last HTTP request wins regardless of edit chronology.

---

## AUDIT-VM-040: Sync Concurrency + Dedup Catastrophes

**Goal:** Identify race conditions and duplicate processing in sync

### Findings

**Dedup Mechanism:** `processed_events` table with PRIMARY KEY on `event_id`
```sql
INSERT INTO processed_events (event_id, ...) ON CONFLICT (event_id) DO NOTHING
```

**Critical Race Condition (TOCTOU):**
1. Request A and B arrive concurrently with same `eventId`
2. Both begin separate transactions with SERIALIZABLE isolation
3. Both INSERT to `processed_events` - one gets PK conflict
4. But between check and conflict detection (~200ms), event may be partially processed

**Per-Event Transactions (Not Batch):**
- Each event in a sync request gets its own `BEGIN/COMMIT` (sync.ts:202-204)
- Two concurrent requests can interleave event processing
- No device-level lock prevents parallel sync from same device

**Vulnerable Scenarios:**
- Double sale charge (same sale processed twice with different bill_refs)
- Inventory underflow (two sales for same item, both pass availability check)
- Payment without sale (out-of-order event processing)

**Missing Protections:**
- No `pg_advisory_lock` per device
- No Redis-based distributed lock
- No request-level serialization
- Client-generated eventId (if lost, retry creates new ID)

### Verdict: **FAIL** (CRITICAL)

Race condition window enables double-processing of sales and inventory movements.

---

## AUDIT-VM-050: DB Schema Drift vs Runtime Queries

**Goal:** Verify schema definitions match runtime SQL queries

### Critical Drift Issues

| # | Query References | Schema Defines | Impact |
|---|-----------------|----------------|--------|
| 1 | `stock_on_hand` (stockIn.ts:140) | `current_stock` (migration 004) | **Column not found error** |
| 2 | `catalog.inventory_ledger` (stockIn.ts:52) | `inventory.inventory_ledger` (migration 005) | **Wrong schema namespace** |
| 3 | `catalog.store_products` (stockIn.ts:141) | `public.store_products` (ensureSchema) | **Table not found** |
| 4 | `global_product_id` (ensureSchema:164) | `product_id` (migration 005) | **Column name conflict** |
| 5 | `movement_type` (ensureSchema:165) | `transaction_type` (migration 005) | **Column name conflict** |
| 6 | `quantity` (ensureSchema:166) | `delta_qty` (migration 005) | **Column name conflict** |
| 7 | `store_display_name` (ensureSchema:141) | `display_name` (migration 004) | **Column name conflict** |

### Root Cause

Two incompatible schema definition systems co-exist:
- `ensureSchema.ts`: Legacy monolithic definitions in `public` schema
- `migrations/004-005`: Proper namespaced definitions in `catalog.*` / `inventory.*`

Runtime queries reference the migration schema (`catalog.*`, `inventory.*`) but if only `ensureSchema.ts` has run, those tables don't exist.

### Verdict: **FAIL** (CRITICAL)

Severe schema drift. Stock-in endpoint will fail at runtime with "column not found" errors.

---

## AUDIT-VM-060: Sales Data Ownership + Zero-Value Risk

**Goal:** Verify sales data path and zero-value sale risk

### Findings

**Sales use ENTIRELY LEGACY tables:**
- `public.sales` (sale header)
- `public.sale_items` (line items)
- `public.variants` / `public.barcodes` (product lookup)
- Stock deduction via `applyBulkDeductions()` on `public.bulk_inventory` / `public.store_inventory`

**Zero-Value Risk:**
- `sale_items.quantity` defaults to 0 if not provided
- `sale_items.price` can be 0 (free items exist in FMCG)
- No validation prevents zero-quantity or zero-price sales from being recorded
- `recordSaleInventoryMovements()` writes ledger entries for zero-qty movements

**Schema Ownership Split:**
- POS sales: Write to `public.sales` + `public.sale_items`
- Dashboard inventory: Read from `catalog.store_products.current_stock`
- Inventory ledger: Split between `public.inventory_ledger` and `inventory.inventory_ledger`

### Verdict: **FAIL** (HIGH)

Sales operate on completely separate tables from Dashboard view. Zero-value sales can corrupt inventory.

---

## AUDIT-VM-070: CSV/Bulk Import Integrity

**Goal:** Verify CSV import atomicity, validation, and error handling

### Critical Issues

1. **Non-Atomic Imports**: Nested `try-catch` catches row-level errors but continues transaction. 50/100 rows can succeed while 50 silently fail, creating partial imports.

2. **Silent Barcode Failures**: `INSERT ... ON CONFLICT DO NOTHING` for barcodes means duplicate barcodes are silently ignored. Product is created but unscanned (no barcode linked).

3. **No File Size Limits**: Express default body limit only protection. No streaming. Entire CSV loaded into memory multiple times.

4. **Missing Schema**: `platform.csv_imports` table referenced but not defined in `ensureSchema.ts` or visible migrations.

5. **No Product Deduplication**: Same product uploaded twice creates duplicates. File SHA-256 computed but never checked for re-uploads.

6. **Custom CSV Parser**: Simplistic implementation missing RFC 4180 features (escaped quotes, embedded newlines, BOM handling).

### Transaction Architecture (Broken)

```
BEGIN
  for each row:
    try:
      INSERT product    -- succeeds
      INSERT barcode    -- ON CONFLICT DO NOTHING (silent skip)
      INSERT inventory  -- succeeds but orphaned
    catch:
      skip (NO ROLLBACK of previously inserted rows!)
COMMIT  -- Partial data committed
```

### Verdict: **FAIL** (HIGH)

Non-atomic imports can create orphaned products without barcodes. Silent failures make debugging impossible.

---

## AUDIT-VM-080: Dead Code / Unused Routes

**Goal:** Identify dead code and unused routes

### Findings

**Critical Issue:** Empty route file with active import
- File: `backend/src/routes/admin/posEvents.ts` (0 bytes)
- Imported in `backend/src/routes/v1/index.ts:17`
- Mounted at `v1Router.use("/admin", adminPosEventsRouter)`
- Will cause runtime error (export doesn't exist)

**Stale Files (safe but cluttered):**
- 9 `.prisma_disabled.ts` files (properly excluded via naming)
- `temp-gateway-config.js` with port 3009 references
- 5 `scripts/enroll-service*.js` files (legacy)
- 3 `temp-enroll-service*.js` files (temporary)

**Active Code:** All 13 services and 29 route handlers are properly imported and mounted.

### Verdict: **FAIL** (MEDIUM)

Empty route file with active import will cause runtime errors. Stale configuration files add confusion.

---

## AUDIT-VM-090: Inventory System Split-Brain

**Goal:** Verify inventory consistency across stock storage tables

### Stock Written to 4+ Tables

| Operation | Table | Column | Schema |
|-----------|-------|--------|--------|
| POS Sale | `bulk_inventory` | quantity | public |
| POS Sale | `store_inventory` | available_qty | public |
| Stock-In | `catalog.store_products` | stock_on_hand* | catalog |
| Stock-In | `catalog.inventory_ledger` | delta_qty | catalog** |
| Digitisation | `catalog.store_products` | current_stock | catalog |
| Digitisation | `inventory.stock_balances` | current_qty | inventory |
| Digitisation | `inventory.inventory_ledger` | delta_qty | inventory |
| Dashboard Read | `catalog.store_products` | current_stock | catalog |

*Column doesn't exist (see AUDIT-VM-050)
**Wrong schema namespace (see AUDIT-VM-050)

### Two Ledger Systems

1. `public.inventory_ledger` (ensureSchema): `global_product_id`, `movement_type`, `quantity`
2. `inventory.inventory_ledger` (migration 005): `product_id`, `delta_qty`, `transaction_type`

### Impact

- POS sale deducts from `public.bulk_inventory` / `public.store_inventory`
- Dashboard reads from `catalog.store_products.current_stock`
- These tables are NEVER synchronized
- Stock shown on Dashboard has NO RELATION to actual POS sales

### Verdict: **FAIL** (CRITICAL)

Severe split-brain. Four independent stock counters with no reconciliation.

---

## Risk Heat Map

```
                    IMPACT
           Low    Medium    High    Critical
         ┌────────┬─────────┬────────┬──────────┐
Critical │        │         │VM-040  │VM-030    │
         │        │         │VM-050  │VM-031    │
         │        │         │        │VM-090    │
         ├────────┼─────────┼────────┼──────────┤
High     │        │         │VM-060  │          │
         │        │         │VM-070  │          │
         ├────────┼─────────┼────────┼──────────┤
Medium   │        │VM-080   │VM-020  │          │
         ├────────┼─────────┼────────┼──────────┤
Low      │        │         │        │          │
         └────────┴─────────┴────────┴──────────┘
                    LIKELIHOOD
```

---

## Recommended Priority Order for Fixes

### P0 - Block Go-Live (CRITICAL)

1. **AUDIT-VM-090 + VM-030**: Unify inventory to single schema. Pick catalog.* or public.* and migrate all paths.
2. **AUDIT-VM-050**: Fix column name mismatches (stock_on_hand -> current_stock, namespace corrections).
3. **AUDIT-VM-040**: Add `pg_advisory_lock(device_id)` at sync entry point. Process all events in single transaction.
4. **AUDIT-VM-031**: Implement LWW with `WHERE metadata_updated_at < $client_timestamp` guards.

### P1 - Fix Before Scale (HIGH)

5. **AUDIT-VM-060**: Validate `quantity > 0` and `price >= 0` in sale creation. Add FK constraints.
6. **AUDIT-VM-070**: Make CSV import fully atomic (remove nested try-catch, rollback on ANY row failure). Add barcode uniqueness validation pre-commit.
7. **AUDIT-VM-020**: Set `ADMIN_TOKEN` env var on VM. Remove hardcoded default from docker-compose.

### P2 - Clean Up (MEDIUM)

8. **AUDIT-VM-080**: Delete empty `routes/admin/posEvents.ts`. Clean up `.prisma_disabled.ts` files and temp scripts.

---

## Appendix: File References

| File | Lines | Relevance |
|------|-------|-----------|
| backend/services/api-gateway/src/config.ts | 39-43, 169-174 | Gateway routing |
| backend/src/routes/v1/pos/sync.ts | 118-135, 202-217, 285-301 | Sync dual-schema + dedup |
| backend/src/routes/v1/pos/stockIn.ts | 140-153, 164-169, 172-187 | Wrong column names |
| backend/src/routes/v1/pos/storeProducts.ts | 808-810, 943-945 | No LWW |
| backend/src/routes/v1/pos/sales.ts | Full file | Legacy schema sales |
| backend/src/routes/v1/retailer-admin/products.ts | 433-450 | Catalog schema writes |
| backend/src/routes/v1/retailer-admin/csvImport.ts | 314-384, 507-564 | Non-atomic imports |
| backend/src/services/storeProductDigitisationService.ts | 302-502 | Triple stock write |
| backend/src/services/inventoryService.ts | 293-348 | Legacy stock deduction |
| backend/src/db/ensureSchema.ts | 138-174, 363-369 | Legacy schema defs |
| backend/src/routes/admin/posEvents.ts | (empty) | Dead code |
| app.json | 19-24 | Port 3009 stale ref |

---

**Report Generated:** 2026-01-25
**Total Issues Found:** 8 FAIL, 1 CONDITIONAL PASS, 4 PASS
**Go-Live Recommendation:** **HOLD** until P0 items resolved
