# SUPERMANDI GO-LIVE MICRO-BLOCKER AUDIT

**Audit Target:** Branch `main`, Commit `1bb3f26`
**Full SHA:** `1bb3f26e68ebe527e9a95f81ceb7eaf0aff763d4`
**Production VM:** `34.14.220.171`
**Audit Date:** 2026-01-28
**Total Issues:** 105 CRITICAL

---

# DEPLOYMENT RULES (MANDATORY FOR CLAUDE)

1. **Complete each batch fully before moving to next batch**
2. **Run batch tests after deploying each batch**
3. **Run end-to-end go-live verification after each batch**
4. **Document test results before proceeding**
5. **No skipping batches — sequential execution required**

---

# VM ACCESS CREDENTIALS

```bash
# Production VM — Direct SSH
ssh claude@34.14.220.171

# Production VM — GCloud SSH (Alternative)
gcloud compute ssh \
  --zone "asia-south1-a" \
  "supermandi-backend-vm" \
  --project "supermandi-backend"

# Default paths
BACKEND_PATH=/opt/supermandi/backend
RETAILER_ADMIN_PATH=/opt/supermandi/retailer-admin
SUPPLIER_PORTAL_PATH=/opt/supermandi/supplier-portal
SUPERADMIN_PATH=/opt/supermandi/supermandi-superadmin
POS_APK_PATH=/opt/supermandi/releases

# Docker commands
cd $BACKEND_PATH
docker-compose -f docker-compose.prod.yml ps
docker-compose -f docker-compose.prod.yml logs -f --tail=100
```

---

# BATCH REFERENCE

| Batch | Priority | Tickets | Area |
|-------|----------|---------|------|
| 1 | BLOCKER | 0001-0007 | API Authentication |
| 2 | BLOCKER | 0017-0020, 0025-0027, 0050-0051 | VM & Infrastructure |
| 3 | HIGH | 0008-0010, 0028-0030 | Database Integrity |
| 4 | HIGH | 0021-0022, 0049, 0052-0055 | SuperAdmin Security |
| 5 | HIGH | 0011-0016, 0041, 0046-0047, 0100 | POS Cart & Payment |
| 6 | MEDIUM | 0024, 0042-0045, 0083-0095 | POS Scanning & UI |
| 7 | MEDIUM | 0023, 0035-0040, 0066-0078, 0101-0105 | Retailer Dashboard |
| 8 | MEDIUM | 0031-0034, 0056-0065, 0096-0099 | Supplier Portal |
| 9 | LOW | 0048, 0079-0082 | Deployment Scripts & Health |

---

# ══════════════════════════════════════════════════════════════════
# BATCH 1: CRITICAL SECURITY — API AUTHENTICATION
# Priority: BLOCKER — Must complete first
# Tickets: GL-CRIT-0001 to GL-CRIT-0007
# ══════════════════════════════════════════════════════════════════

## GL-CRIT-0001 — Order Service API endpoints have NO authentication
**🏷️ BATCH 1 — API Authentication**

**Area:** API

**User impact (10,000 stores):**
Any attacker can create, view, cancel, or ship orders for ANY store without authentication. Complete order data exposure and manipulation possible.

**Exact reproduction steps:**
1. Open terminal without any auth token
2. Run `curl -X POST http://34.14.220.171:3000/stores/ANY_STORE_ID/orders -d '{"supplierId":"x","orderType":"manual","items":[]}'`
3. Order is created without authentication

**Expected vs Actual:**
- Expected: 401 Unauthorized response
- Actual: 201 Created - order is created

**Root cause:**
- File: `backend/services/order-service/src/routes/purchaseOrders.ts`
- No `authenticate` middleware on routes

**Exact fix required:**
Add `authenticate` and `requireStoreAccess` middleware to all order-service routes

**VM deployment steps:**
```bash
ssh claude@34.14.220.171
cd /opt/supermandi/backend
docker-compose -f docker-compose.prod.yml up -d --build order-service
```

**Verification:**
- Call order endpoints without token → 401
- Call with valid token → 200/201

**Regression checks:**
- POS app order creation flow
- Retailer dashboard order list
- Supplier portal order view

**Logging / metrics required:**
- `storeId`, `userId`, `orderId`, `requestId` on all order mutations

---

## GL-CRIT-0002 — Supplier Service API endpoints have NO authentication
**🏷️ BATCH 1 — API Authentication**

**Area:** API

**User impact (10,000 stores):**
Anyone can link/unlink suppliers to any store, search all suppliers, validate GST numbers. Supplier relationships can be manipulated.

**Exact reproduction steps:**
1. Run `curl http://34.14.220.171:3000/suppliers/search?q=test`
2. Returns all matching suppliers without auth
3. Run `curl -X POST http://34.14.220.171:3000/stores/ANY_ID/suppliers/link -d '{"supplierId":"x"}'`
4. Supplier linked without authentication

**Expected vs Actual:**
- Expected: 401 Unauthorized
- Actual: 200 OK with data

**Root cause:**
- File: `backend/services/supplier-service/src/routes/suppliers.ts`
- No authentication middleware on any routes

**Exact fix required:**
Add `authenticate` middleware to all supplier-service routes except public GSTIN validation

**VM deployment steps:**
```bash
ssh claude@34.14.220.171
docker-compose -f docker-compose.prod.yml up -d --build supplier-service
```

**Verification:**
- Unauthenticated requests return 401
- Authenticated requests with proper storeId work

**Regression checks:**
- Retailer dashboard supplier management
- POS app supplier selection in buy flow

**Logging / metrics required:**
- `storeId`, `supplierId`, `userId`, `action` on all mutations

---

## GL-CRIT-0003 — Reorder Service API endpoints have NO authentication
**🏷️ BATCH 1 — API Authentication**

**Area:** API

**User impact (10,000 stores):**
Anyone can approve or dismiss pending reorders for any store. Automated purchasing can be manipulated by attackers.

**Exact reproduction steps:**
1. Run `curl http://34.14.220.171:3000/stores/ANY_ID/reorder/pending`
2. Returns all pending reorders without auth
3. Run `curl -X POST http://34.14.220.171:3000/stores/ANY_ID/reorder/pending/approve -d '{"ids":["x"]}'`
4. Reorders approved without authentication

**Expected vs Actual:**
- Expected: 401 Unauthorized
- Actual: 200 OK

**Root cause:**
- File: `backend/services/reorder-service/src/routes/pending.ts`
- No authentication middleware

**Exact fix required:**
Add `authenticate` and `requireStoreAccess` middleware

**VM deployment steps:**
```bash
ssh claude@34.14.220.171
docker-compose -f docker-compose.prod.yml up -d --build reorder-service
```

**Verification:**
- All reorder endpoints return 401 without valid token

**Regression checks:**
- POS reorder flow
- Auto-reorder background jobs

**Logging / metrics required:**
- `storeId`, `userId`, `reorderId`, `action`

---

## GL-CRIT-0004 — Catalog Service mapping endpoints have NO authentication
**🏷️ BATCH 1 — API Authentication**

**Area:** API

**User impact (10,000 stores):**
Anyone can map/unmap supplier products to store products, corrupt product catalog relationships across all stores.

**Exact reproduction steps:**
1. Run `curl -X POST http://34.14.220.171:3000/stores/ANY_ID/catalog/map -d '{"supplierProductId":"x","productId":"y"}'`
2. Mapping created without auth

**Expected vs Actual:**
- Expected: 401 Unauthorized
- Actual: 201 Created

**Root cause:**
- File: `backend/services/catalog-service/src/routes/mapping.ts`
- No authentication middleware

**Exact fix required:**
Add `authenticate` and `requireStoreAccess` middleware

**VM deployment steps:**
```bash
ssh claude@34.14.220.171
docker-compose -f docker-compose.prod.yml up -d --build catalog-service
```

**Verification:**
- Mapping endpoints return 401 without valid token

**Regression checks:**
- Product mapping in retailer dashboard
- Auto-mapping flows

**Logging / metrics required:**
- `storeId`, `userId`, `mapId`, `supplierProductId`, `productId`

---

## GL-CRIT-0005 — Inventory read endpoints publicly expose business data
**🏷️ BATCH 1 — API Authentication**

**Area:** API

**User impact (10,000 stores):**
Competitors can view any store's inventory levels, low-stock items, and stock history. Sensitive business intelligence exposed.

**Exact reproduction steps:**
1. Run `curl http://34.14.220.171:3000/stores/ANY_ID/inventory`
2. Returns all inventory data without auth
3. Run `curl http://34.14.220.171:3000/stores/ANY_ID/inventory/low-stock`
4. Returns low-stock items without auth

**Expected vs Actual:**
- Expected: 401 Unauthorized
- Actual: 200 OK with sensitive inventory data

**Root cause:**
- File: `backend/services/inventory-service/src/routes/inventory.ts`
- No authentication on GET routes

**Exact fix required:**
Add `authenticate` and `requireStoreAccess` middleware to all inventory routes

**VM deployment steps:**
```bash
ssh claude@34.14.220.171
docker-compose -f docker-compose.prod.yml up -d --build inventory-service
```

**Verification:**
- Inventory GET endpoints return 401 without valid token

**Regression checks:**
- POS stock display
- Retailer dashboard inventory page

**Logging / metrics required:**
- `storeId`, `userId`, `productId` on all reads

---

## GL-CRIT-0006 — Hardcoded ADMIN_TOKEN in docker-compose.prod.yml
**🏷️ BATCH 1 — API Authentication**

**Area:** VM

**User impact (10,000 stores):**
Default admin token `0d57d3b70e8cab31e2cc50faf363a5c0` is publicly visible in codebase. Anyone can access SuperAdmin APIs.

**Exact reproduction steps:**
1. View `backend/docker-compose.prod.yml:96`
2. See hardcoded token: `${ADMIN_TOKEN:-0d57d3b70e8cab31e2cc50faf363a5c0}`
3. Use this token to access admin endpoints

**Expected vs Actual:**
- Expected: No default token, startup fails if ADMIN_TOKEN not set
- Actual: Fallback to publicly known token

**Root cause:**
- File: `backend/docker-compose.prod.yml:96`
- Fallback value in docker-compose

**Exact fix required:**
Remove fallback value, require ADMIN_TOKEN to be explicitly set

**VM deployment steps:**
```bash
ssh claude@34.14.220.171
# Edit docker-compose.prod.yml to remove fallback
# Set unique ADMIN_TOKEN in .env
docker-compose -f docker-compose.prod.yml up -d
```

**Verification:**
- Container fails to start without ADMIN_TOKEN env var
- Admin endpoints reject old token

**Regression checks:**
- SuperAdmin panel functionality
- All admin API calls

**Logging / metrics required:**
- Log failed admin auth attempts with IP

---

## GL-CRIT-0007 — Internal service auth uses spoofable X-Service-Name header
**🏷️ BATCH 1 — API Authentication**

**Area:** API

**User impact (10,000 stores):**
Internal APIs protected only by header check. Attackers can spoof header to access internal endpoints and manipulate inventory.

**Exact reproduction steps:**
1. Run `curl -H "X-Service-Name: order-service" http://34.14.220.171:3000/internal/catalog/reconcile-stock -d '{}'`
2. Internal endpoint accepts request with spoofed header

**Expected vs Actual:**
- Expected: mTLS or JWT verification for internal calls
- Actual: Simple header string check

**Root cause:**
- File: `backend/services/catalog-service/src/routes/internal.ts`
- `validateInternalService` only checks header value

**Exact fix required:**
Implement service-to-service JWT or mTLS authentication

**VM deployment steps:**
```bash
ssh claude@34.14.220.171
docker-compose -f docker-compose.prod.yml up -d --build
```

**Verification:**
- Internal endpoints reject requests without valid service JWT
- Service-to-service calls work with proper auth

**Regression checks:**
- Order → Inventory reconciliation
- All cross-service calls

**Logging / metrics required:**
- `sourceService`, `targetService`, `endpoint`, `requestId`

---

# ═══════════════════════════════════════════════════════════════════════════════
# BATCH 1 TEST CHECKLIST — Run after deploying GL-CRIT-0001 to GL-CRIT-0007
# ═══════════════════════════════════════════════════════════════════════════════

```bash
# Test 1: Order endpoints require auth
curl -X POST http://34.14.220.171:3000/stores/test/orders -d '{}'
# Expected: 401 Unauthorized

# Test 2: Supplier endpoints require auth
curl http://34.14.220.171:3000/suppliers/search?q=test
# Expected: 401 Unauthorized

# Test 3: Reorder endpoints require auth
curl http://34.14.220.171:3000/stores/test/reorder/pending
# Expected: 401 Unauthorized

# Test 4: Catalog mapping requires auth
curl -X POST http://34.14.220.171:3000/stores/test/catalog/map -d '{}'
# Expected: 401 Unauthorized

# Test 5: Inventory requires auth
curl http://34.14.220.171:3000/stores/test/inventory
# Expected: 401 Unauthorized

# Test 6: Admin token fallback removed
grep -r "0d57d3b70e8cab31e2cc50faf363a5c0" docker-compose.prod.yml
# Expected: No matches

# Test 7: Internal endpoints reject spoofed headers
curl -H "X-Service-Name: fake-service" http://34.14.220.171:3000/internal/catalog/reconcile-stock
# Expected: 401 or 403
```

## BATCH 1 GO-LIVE VERIFICATION

| Test | Command | Expected | Pass/Fail |
|------|---------|----------|-----------|
| POS Login | Open POS app, login | Success | [ ] |
| POS Create Sale | Create and complete sale | Success | [ ] |
| POS View Orders | View order history | Success | [ ] |
| Retailer Dashboard Login | Login to dashboard | Success | [ ] |
| Retailer View Products | Load products page | Success | [ ] |
| Retailer View Suppliers | Load suppliers page | Success | [ ] |
| Supplier Portal Login | Login as supplier | Success | [ ] |
| Supplier View Orders | Load orders page | Success | [ ] |

**BATCH 1 Sign-off:** _____________ Date: _____________

---

# ══════════════════════════════════════════════════════════════════
# BATCH 3: DATABASE INTEGRITY
# Priority: HIGH
# Tickets: GL-CRIT-0008 to GL-CRIT-0010, GL-CRIT-0028 to GL-CRIT-0030
# ══════════════════════════════════════════════════════════════════

## GL-CRIT-0008 — Missing foreign key constraints across 20+ tables
**🏷️ BATCH 3 — Database Integrity**

**Area:** DB

**User impact (10,000 stores):**
Data integrity not enforced at database level. Orphaned records possible if application-level enforcement fails. Cascading data corruption risk.

**Exact reproduction steps:**
1. Directly INSERT into `orders.purchase_orders` with non-existent `store_id`
2. Row is created with invalid reference
3. Queries joining to `platform.stores` return incomplete data

**Expected vs Actual:**
- Expected: Foreign key constraint prevents invalid insert
- Actual: Invalid data accepted

**Root cause:**
- Files: `backend/migrations/003_supplier_schema.sql:95`, `006_orders_schema.sql:33`, and 18+ other migrations
- Comment "enforced at app level for cross-schema" but no FK constraints

**Exact fix required:**
DB migration to add explicit foreign key constraints with proper CASCADE rules

**VM deployment steps:**
```bash
ssh claude@34.14.220.171
cd /opt/supermandi/backend
node scripts/migrate-prod.js
```

**Verification:**
- Attempt invalid INSERT → FK constraint error
- Valid INSERTs still work

**Regression checks:**
- All CRUD operations
- Cascade deletes

**Logging / metrics required:**
- Migration execution logs

---

## GL-CRIT-0009 — Mixed-case status values in sales table constraint
**🏷️ BATCH 3 — Database Integrity**

**Area:** DB

**User impact (10,000 stores):**
Same status represented as both 'pending' and 'PENDING'. Queries may miss records, reports show inconsistent data.

**Exact reproduction steps:**
1. Create sale with status 'pending'
2. Create sale with status 'PENDING'
3. Query `SELECT * FROM sales WHERE status = 'pending'` misses uppercase records

**Expected vs Actual:**
- Expected: Single consistent case for status values
- Actual: Both 'pending' and 'PENDING' valid per constraint

**Root cause:**
- File: `backend/migrations/040_payments_and_sales_status.sql:52-59`
- CHECK constraint allows both cases

**Exact fix required:**
Migration to normalize all status values to lowercase and update constraint

**VM deployment steps:**
```bash
ssh claude@34.14.220.171
cd /opt/supermandi/backend
node scripts/migrate-prod.js
```

**Verification:**
- All sales records have lowercase status
- Insert with 'PENDING' fails

**Regression checks:**
- All sales queries
- POS payment flow
- Analytics reports

**Logging / metrics required:**
- Migration row count updated

---

## GL-CRIT-0010 — No soft delete - all deletions are permanent
**🏷️ BATCH 3 — Database Integrity**

**Area:** DB

**User impact (10,000 stores):**
Accidental deletions unrecoverable. No audit trail for deleted records. Cascading deletes can wipe entire data chains.

**Exact reproduction steps:**
1. DELETE a product from `catalog.products`
2. All `product_barcodes`, `store_products` cascade deleted
3. No way to recover deleted data

**Expected vs Actual:**
- Expected: Soft delete with `deleted_at` column and recovery window
- Actual: Hard DELETE with CASCADE

**Root cause:**
- Files: `backend/migrations/002_auth_schema.sql`, `004_catalog_schema.sql`, `006_orders_schema.sql`
- ON DELETE CASCADE without soft delete columns

**Exact fix required:**
Add `deleted_at` columns to critical tables, update application to use soft delete

**VM deployment steps:**
```bash
ssh claude@34.14.220.171
cd /opt/supermandi/backend
node scripts/migrate-prod.js
docker-compose -f docker-compose.prod.yml up -d --build
```

**Verification:**
- DELETE sets `deleted_at` instead of removing row
- Queries filter out deleted records

**Regression checks:**
- All delete operations
- List/search queries

**Logging / metrics required:**
- `deletedBy`, `deletedAt`, `deletionReason`

---

# ══════════════════════════════════════════════════════════════════
# BATCH 5: POS APP — CART & PAYMENT FLOW
# Priority: HIGH
# Tickets: GL-CRIT-0011 to GL-CRIT-0016, GL-CRIT-0041, GL-CRIT-0046-0047, GL-CRIT-0100
# ══════════════════════════════════════════════════════════════════

## GL-CRIT-0011 — Cart can remain locked indefinitely after payment failure
**🏷️ BATCH 5 — POS Cart & Payment**

**Area:** POS

**User impact (10,000 stores):**
If payment fails, cart stays locked. Store cannot process new sales until app restart. Revenue loss during locked period.

**Exact reproduction steps:**
1. Start a sale on POS
2. Go to payment screen
3. Payment fails (network error, UPI timeout)
4. Cart remains locked
5. Cannot add new items or start new sale

**Expected vs Actual:**
- Expected: Cart auto-unlocks after payment failure or timeout
- Actual: Cart stays locked until manual clear

**Root cause:**
- File: `src/stores/cartStore.ts:634-640`
- Cart locked during payment, no unlock on error path

**Exact fix required:**
Add timeout-based auto-unlock and unlock on payment error

**VM deployment steps:**
```bash
# POS app code fix, build new APK
npx expo build:android
# Deploy APK to devices
```

**Verification:**
- Fail a payment → cart unlocks within 30 seconds
- Can start new sale after failure

**Regression checks:**
- All payment flows
- Cart persistence

**Logging / metrics required:**
- `lockTime`, `unlockTime`, `unlockReason`, `deviceId`

---

## GL-CRIT-0012 — Corrupted offline sales silently fail with no recovery
**🏷️ BATCH 5 — POS Cart & Payment**

**Area:** POS / Sync

**User impact (10,000 stores):**
Corrupted offline sales marked with error flag but never retried or reported. Sales data permanently lost without store owner knowledge.

**Exact reproduction steps:**
1. Create sale offline
2. Corrupt the local SQLite data
3. Sync runs, marks event as corrupted
4. No notification to user
5. Sale never syncs, money collected but not recorded

**Expected vs Actual:**
- Expected: Alert user of corrupted sales, provide recovery mechanism
- Actual: Silent failure, corrupted events ignored

**Root cause:**
- File: `src/services/offline/outbox.ts:52-73`
- Corrupted events pushed to `corruptedEventIds` with no user notification

**Exact fix required:**
Add user notification for corrupted sales, implement repair/resubmit mechanism

**VM deployment steps:**
```bash
# POS app code fix, build and deploy new APK
```

**Verification:**
- Corrupt a sale → alert shown to user
- Option to manually enter sale data

**Regression checks:**
- Offline sale creation
- Sync flow
- Corruption detection

**Logging / metrics required:**
- `corruptedEventId`, `errorType`, `deviceId`, `storeId`, `timestamp`

---

## GL-CRIT-0013 — Stock cache never expires - shows sold-out items as available
**🏷️ BATCH 5 — POS Cart & Payment**

**Area:** POS / Sync

**User impact (10,000 stores):**
POS shows stale stock levels. Sold-out items display as available. Sales fail at checkout when stock actually depleted.

**Exact reproduction steps:**
1. Open POS, stock shows 10 units
2. Another device sells all 10 units
3. First device still shows 10 units (cached)
4. Attempt to sell → fails at checkout

**Expected vs Actual:**
- Expected: Stock cache expires after 5 minutes, auto-refreshes
- Actual: Stock cache never expires, stays until manual refresh

**Root cause:**
- File: `src/services/stockService.ts:56-76`
- No TTL on stock cache entries

**Exact fix required:**
Add TTL (5 minutes) to stock cache, auto-refresh stale entries

**VM deployment steps:**
```bash
# POS app code fix, build and deploy new APK
```

**Verification:**
- Wait 5 minutes → stock auto-refreshes
- Stale indicator shown for old data

**Regression checks:**
- Stock display accuracy
- Multi-device scenarios

**Logging / metrics required:**
- `cacheAge`, `refreshTrigger`, `stockDelta`

---

## GL-CRIT-0014 — Cart items silently removed when stock insufficient
**🏷️ BATCH 5 — POS Cart & Payment**

**Area:** POS

**User impact (10,000 stores):**
Items disappear from cart without user notification when stock becomes unavailable. Confusing UX, potential customer disputes.

**Exact reproduction steps:**
1. Add item to cart (quantity: 5)
2. Stock becomes 2 (sold elsewhere)
3. App normalizes cart to stock
4. Item quantity silently changes to 2, or removed if qty ≤ 0
5. User doesn't notice until checkout

**Expected vs Actual:**
- Expected: Alert user that item quantity was adjusted due to stock
- Actual: Silent normalization with only internal event logging

**Root cause:**
- File: `src/stores/cartStore.ts:190-215`
- `normalizeItemsForStock` silently modifies cart

**Exact fix required:**
Show toast/alert when cart items adjusted: "2 items removed due to stock changes"

**VM deployment steps:**
```bash
# POS app code fix, build and deploy new APK
```

**Verification:**
- Stock decreases → user sees notification
- Cart change is explicit

**Regression checks:**
- Stock sync
- Cart persistence
- Multi-device scenarios

**Logging / metrics required:**
- `itemsRemoved`, `itemsAdjusted`, `reason`, `deviceId`

---

## GL-CRIT-0015 — Double-click on create sale returns same sale twice
**🏷️ BATCH 5 — POS Cart & Payment**

**Area:** POS / API

**User impact (10,000 stores):**
Clicking "Create Sale" twice quickly can process the same sale with different UI behavior. Potential double-charging customers.

**Exact reproduction steps:**
1. Go to payment screen
2. Rapidly click "Pay" twice
3. First call creates sale
4. Second call returns same sale (idempotent by saleId)
5. UI may show success twice or charge twice

**Expected vs Actual:**
- Expected: Button disabled during API call, single request
- Actual: Multiple requests possible, second returns existing sale

**Root cause:**
- File: `src/services/offline/sales.ts:64-88`
- Returns existing sale if saleId matches, no UI debounce

**Exact fix required:**
Disable payment button during API call, add request deduplication

**VM deployment steps:**
```bash
# POS app code fix, build and deploy new APK
```

**Verification:**
- Rapid clicks → only one API call
- Button shows loading state

**Regression checks:**
- All payment flows
- Offline payment creation

**Logging / metrics required:**
- `duplicateRequestCount`, `saleId`, `deviceId`

---

## GL-CRIT-0016 — Payment succeeds but inventory deduction can fail silently
**🏷️ BATCH 5 — POS Cart & Payment**

**Area:** POS / Sync

**User impact (10,000 stores):**
Customer charged but inventory not updated. Stock levels become inaccurate. Manual reconciliation required.

**Exact reproduction steps:**
1. Process payment (success)
2. Inventory API call fails
3. Error logged but checkout completes
4. Stock not deducted
5. Inventory reports wrong

**Expected vs Actual:**
- Expected: Transaction rollback if inventory fails, or guaranteed eventual consistency
- Actual: Warning logged, checkout completes with inconsistent state

**Root cause:**
- File: `src/services/checkoutService.ts:92-98`
- `console.warn` but no recovery mechanism

**Exact fix required:**
Add retry queue for failed inventory deductions, alert user if persistent failure

**VM deployment steps:**
```bash
# POS app code fix + backend retry queue
```

**Verification:**
- Failed inventory deduction → retried automatically
- Eventually consistent within 5 minutes

**Regression checks:**
- Full checkout flow
- Network failure scenarios

**Logging / metrics required:**
- `inventoryFailureCount`, `retryAttempts`, `saleId`, `reconciliationStatus`

---

# ══════════════════════════════════════════════════════════════════
# BATCH 2: CRITICAL SECURITY — VM & INFRASTRUCTURE
# Priority: BLOCKER
# Tickets: GL-CRIT-0017 to GL-CRIT-0020, GL-CRIT-0025 to GL-CRIT-0027, GL-CRIT-0050-0051
# ══════════════════════════════════════════════════════════════════

## GL-CRIT-0017 — PostgreSQL port 5432 exposed to public internet
**🏷️ BATCH 2 — VM & Infrastructure**

**Area:** VM

**User impact (10,000 stores):**
Database directly accessible from internet. SQL injection attacks, data exfiltration, complete system compromise possible.

**Exact reproduction steps:**
1. Check `docker-compose.prod.yml:25`
2. See port binding: `${POSTGRES_PORT:-5432}:5432`
3. Run `psql -h 34.14.220.171 -p 5432 -U supermandi`

**Expected vs Actual:**
- Expected: Database only accessible within Docker network
- Actual: Port exposed to all interfaces (0.0.0.0)

**Root cause:**
- File: `backend/docker-compose.prod.yml:25`
- Port mapping to host

**Exact fix required:**
Remove port mapping, or bind to 127.0.0.1 only

**VM deployment steps:**
```bash
ssh claude@34.14.220.171
# Edit docker-compose.prod.yml: change "5432:5432" to "127.0.0.1:5432:5432"
docker-compose -f docker-compose.prod.yml up -d
```

**Verification:**
- External connection to 5432 fails
- Internal services still connect

**Regression checks:**
- All database operations
- Migrations

**Logging / metrics required:**
- Database connection attempts from external IPs

---

## GL-CRIT-0018 — Redis port 6379 exposed to public internet
**🏷️ BATCH 2 — VM & Infrastructure**

**Area:** VM

**User impact (10,000 stores):**
Cache directly accessible. Session hijacking, rate limit bypass, data corruption possible.

**Exact reproduction steps:**
1. Check `docker-compose.prod.yml:58`
2. See port binding: `${REDIS_PORT:-6379}:6379`
3. Run `redis-cli -h 34.14.220.171`

**Expected vs Actual:**
- Expected: Redis only accessible within Docker network
- Actual: Port exposed to all interfaces

**Root cause:**
- File: `backend/docker-compose.prod.yml:58`

**Exact fix required:**
Remove port mapping, or bind to 127.0.0.1 only

**VM deployment steps:**
```bash
ssh claude@34.14.220.171
# Edit docker-compose.prod.yml: change "6379:6379" to "127.0.0.1:6379:6379"
docker-compose -f docker-compose.prod.yml up -d
```

**Verification:**
- External connection to 6379 fails
- Internal services still connect

**Regression checks:**
- Session management
- Rate limiting
- Cache operations

**Logging / metrics required:**
- Redis connection attempts from external IPs

---

## GL-CRIT-0019 — Firebase API key exposed in production .env files
**🏷️ BATCH 2 — VM & Infrastructure**

**Area:** Retailer Web

**User impact (10,000 stores):**
Firebase API key publicly visible in version control. Key abuse possible leading to quota exhaustion or unauthorized access.

**Exact reproduction steps:**
1. View `retailer-admin/.env.production:4-9`
2. See Firebase config: `AIzaSyAF67YOn6DJC0UdHGMOYYeKLUem1EB68LM`
3. Use key for unauthorized Firebase access

**Expected vs Actual:**
- Expected: Firebase key not in version control, loaded from secure vault
- Actual: Key hardcoded in committed .env.production file

**Root cause:**
- File: `retailer-admin/.env.production:4-9`

**Exact fix required:**
Remove from version control, use environment injection at deploy time

**VM deployment steps:**
```bash
# Add to .gitignore: retailer-admin/.env.production
# Use CI/CD to inject secrets at build time
```

**Verification:**
- .env.production not in git
- Build still works with injected secrets

**Regression checks:**
- Firebase authentication
- All auth flows

**Logging / metrics required:**
- Firebase API usage monitoring

---

## GL-CRIT-0020 — Admin token stored in plaintext localStorage
**🏷️ BATCH 2 — VM & Infrastructure**

**Area:** SuperAdmin

**User impact (10,000 stores):**
Admin token persists in localStorage, accessible via XSS. Browser DevTools can read token. Complete admin access compromise.

**Exact reproduction steps:**
1. Login to SuperAdmin
2. Open DevTools → Application → Local Storage
3. See `supermandi_admin_token` in plaintext
4. Token visible to any script on page (XSS risk)

**Expected vs Actual:**
- Expected: Token in sessionStorage with expiration, or httpOnly cookie
- Actual: Persistent plaintext in localStorage

**Root cause:**
- File: `supermandi-superadmin/src/App.tsx:1256`
- `localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, v)`

**Exact fix required:**
Use sessionStorage instead, add token expiration (1 hour)

**VM deployment steps:**
```bash
cd supermandi-superadmin
npm run build
# Deploy to VM static hosting
```

**Verification:**
- Token in sessionStorage, not localStorage
- Token expires after 1 hour

**Regression checks:**
- SuperAdmin login flow
- Session persistence

**Logging / metrics required:**
- Token usage, expiration events

---

# ══════════════════════════════════════════════════════════════════
# BATCH 4: SUPERADMIN SECURITY
# Priority: HIGH
# Tickets: GL-CRIT-0021-0022, GL-CRIT-0049, GL-CRIT-0052 to GL-CRIT-0055
# ══════════════════════════════════════════════════════════════════

## GL-CRIT-0021 — No confirmation dialog before user suspension
**🏷️ BATCH 4 — SuperAdmin Security**

**Area:** SuperAdmin

**User impact (10,000 stores):**
Accidental user suspension locks out store staff. No undo mechanism. Store operations disrupted.

**Exact reproduction steps:**
1. Open SuperAdmin → Users tab
2. Click status dropdown for any user
3. Select "Suspended"
4. User immediately suspended - no confirmation

**Expected vs Actual:**
- Expected: Confirmation dialog: "Suspend user? They will be locked out immediately."
- Actual: Immediate suspension on dropdown change

**Root cause:**
- File: `supermandi-superadmin/src/App.tsx:3220-3230`
- `onChange` directly calls `handleUserStatusChange`

**Exact fix required:**
Add `window.confirm()` before status change to suspended/inactive

**VM deployment steps:**
```bash
cd supermandi-superadmin
npm run build
# Deploy
```

**Verification:**
- Suspending user shows confirmation dialog
- Cancel returns to previous state

**Regression checks:**
- User status management
- Store staff access

**Logging / metrics required:**
- `adminId`, `targetUserId`, `previousStatus`, `newStatus`, `confirmationShown`

---

## GL-CRIT-0022 — No confirmation dialog before device deactivation
**🏷️ BATCH 4 — SuperAdmin Security**

**Area:** SuperAdmin

**User impact (10,000 stores):**
Accidental device deactivation stops all POS operations at store. Immediate revenue loss.

**Exact reproduction steps:**
1. Open SuperAdmin → Devices tab
2. Toggle "Active" checkbox off
3. Device immediately deactivated
4. Store POS stops working

**Expected vs Actual:**
- Expected: Confirmation: "Deactivate device? Store billing will stop."
- Actual: Immediate deactivation on toggle

**Root cause:**
- File: `supermandi-superadmin/src/App.tsx:1697-1704`

**Exact fix required:**
Add confirmation dialog before deactivating devices

**VM deployment steps:**
```bash
cd supermandi-superadmin
npm run build
# Deploy
```

**Verification:**
- Deactivating device shows confirmation
- Cancel preserves active state

**Regression checks:**
- Device management
- POS app behavior when device deactivated

**Logging / metrics required:**
- `adminId`, `deviceId`, `storeId`, `action`

---

# ══════════════════════════════════════════════════════════════════
# BATCH 7: RETAILER DASHBOARD
# Priority: MEDIUM
# Tickets: GL-CRIT-0023, GL-CRIT-0035-0040, GL-CRIT-0066-0078, GL-CRIT-0101-0105
# ══════════════════════════════════════════════════════════════════

## GL-CRIT-0023 — StoreCode not validated against authenticated user
**🏷️ BATCH 7 — Retailer Dashboard**

**Area:** Retailer Web

**User impact (10,000 stores):**
Users can manually change URL to access other stores' dashboards. Frontend loads before API rejects.

**Exact reproduction steps:**
1. Login as STORE_A user
2. Navigate to `/s/STORE_A/products`
3. Manually change URL to `/s/STORE_B/products`
4. Frontend attempts to load STORE_B data
5. API eventually rejects but UI partially renders

**Expected vs Actual:**
- Expected: Frontend validates storeCode matches authenticated user's store
- Actual: Frontend loads any storeCode from URL

**Root cause:**
- File: `retailer-admin/src/App.tsx:48-50`
- StoreCode extracted from URL without validation

**Exact fix required:**
Validate storeCode against `user.store.code` on every route

**VM deployment steps:**
```bash
cd retailer-admin
npm run build
# Deploy
```

**Verification:**
- Accessing wrong storeCode redirects to user's store
- No partial data exposure

**Regression checks:**
- All retailer dashboard pages
- Deep links

**Logging / metrics required:**
- `attemptedStoreCode`, `userStoreCode`, `mismatchDetected`

---

# ══════════════════════════════════════════════════════════════════
# BATCH 6: POS APP — SCANNING & UI
# Priority: MEDIUM
# Tickets: GL-CRIT-0024, GL-CRIT-0042-0045, GL-CRIT-0083-0095
# ══════════════════════════════════════════════════════════════════

## GL-CRIT-0024 — Scan storm detection blocks legitimate rapid scanning
**🏷️ BATCH 6 — POS Scanning & UI**

**Area:** POS

**User impact (10,000 stores):**
Scanning 8+ different items within 3 seconds triggers "storm" cooldown. Fast checkout scenarios blocked.

**Exact reproduction steps:**
1. Scan 8 different products rapidly (under 3 seconds)
2. Scan blocked for 2 seconds (cooldown)
3. User perceives app as frozen

**Expected vs Actual:**
- Expected: Per-product rate limiting, not global
- Actual: Global 8 scans/3 seconds triggers 2-second cooldown

**Root cause:**
- File: `src/services/scan/handleScan.ts:115-134`
- Global storm detection with hardcoded thresholds

**Exact fix required:**
Make storm detection per-barcode, increase threshold, or make configurable

**VM deployment steps:**
```bash
# POS app code fix, build and deploy new APK
```

**Verification:**
- Rapid scanning of different items works
- Repeated same-barcode scanning is throttled

**Regression checks:**
- All scanning scenarios
- Fast checkout

**Logging / metrics required:**
- `scanRate`, `stormTriggered`, `deviceId`

---

## GL-CRIT-0025 — No CPU limits on Docker containers
**🏷️ BATCH 2 — VM & Infrastructure**

**Area:** VM

**User impact (10,000 stores):**
Runaway process can consume all VM CPU. Other services starved. Complete platform outage.

**Exact reproduction steps:**
1. Review `docker-compose.prod.yml`
2. All services have memory limits but no CPU limits
3. Single service can use 100% CPU

**Expected vs Actual:**
- Expected: CPU limits (e.g., `cpus: 0.5`) on all services
- Actual: Only memory limits defined

**Root cause:**
- File: `backend/docker-compose.prod.yml`
- Missing `cpus` in deploy.resources

**Exact fix required:**
Add CPU limits to all services in docker-compose.prod.yml

**VM deployment steps:**
```bash
ssh claude@34.14.220.171
# Add cpus: 0.25-1.0 to each service
docker-compose -f docker-compose.prod.yml up -d
```

**Verification:**
- `docker stats` shows CPU limits enforced
- High-load service doesn't starve others

**Regression checks:**
- All services under load
- Concurrent operations

**Logging / metrics required:**
- CPU usage per container

---

## GL-CRIT-0026 — HTTP used instead of HTTPS for production API
**🏷️ BATCH 2 — VM & Infrastructure**

**Area:** VM / POS

**User impact (10,000 stores):**
All API traffic unencrypted. Credentials, transactions, customer data exposed to network sniffing.

**Exact reproduction steps:**
1. Check `.env:2`
2. See `EXPO_PUBLIC_API_URL=http://34.14.220.171:3000`
3. Traffic to API is unencrypted

**Expected vs Actual:**
- Expected: HTTPS with valid TLS certificate
- Actual: Plain HTTP

**Root cause:**
- File: `.env:2`
- HTTP URL configured

**Exact fix required:**
Configure TLS certificate, update all URLs to HTTPS

**VM deployment steps:**
```bash
ssh claude@34.14.220.171
# Install nginx with Let's Encrypt cert
# Configure reverse proxy with TLS
# Update all .env files to https://
```

**Verification:**
- API responds on HTTPS
- HTTP redirects to HTTPS
- Certificate valid

**Regression checks:**
- All API calls from all clients
- WebSocket connections

**Logging / metrics required:**
- TLS handshake failures

---

## GL-CRIT-0027 — Rate limit 100 req/min too permissive for public APIs
**🏷️ BATCH 2 — VM & Infrastructure**

**Area:** API

**User impact (10,000 stores):**
Attackers can send 100 requests/minute per IP. DDoS and brute force attacks possible.

**Exact reproduction steps:**
1. Check `backend/.env:72-73`
2. See `RATE_LIMIT_MAX_REQUESTS=100` per minute
3. Send 99 requests in 1 minute - all succeed

**Expected vs Actual:**
- Expected: 30-50 requests/minute for public APIs, tighter for auth
- Actual: 100 requests/minute globally

**Root cause:**
- File: `backend/.env:72-73`
- Lenient rate limit

**Exact fix required:**
Reduce to 30/min for public APIs, 5/min for auth endpoints

**VM deployment steps:**
```bash
ssh claude@34.14.220.171
# Update .env
docker-compose -f docker-compose.prod.yml restart api-gateway
```

**Verification:**
- 31st request in minute returns 429
- Auth endpoints limited to 5/min

**Regression checks:**
- Normal usage patterns
- Bulk operations

**Logging / metrics required:**
- Rate limit hits per IP, per endpoint

---

## GL-CRIT-0028 — Payments schema has no event outbox for eventual consistency
**🏷️ BATCH 3 — Database Integrity**

**Area:** DB / Sync

**User impact (10,000 stores):**
Payment events not reliably published to subscribers. Failed publishes lost. Other services don't learn of payment status.

**Exact reproduction steps:**
1. Check `backend/migrations/049_payments_schema.sql`
2. No `event_outbox` table like other schemas have
3. Payment status changes may not propagate

**Expected vs Actual:**
- Expected: `payments.event_outbox` table for reliable event publishing
- Actual: No outbox table in payments schema

**Root cause:**
- File: `backend/migrations/049_payments_schema.sql`
- Missing event infrastructure

**Exact fix required:**
Add migration to create `payments.event_outbox` table

**VM deployment steps:**
```bash
ssh claude@34.14.220.171
cd /opt/supermandi/backend
node scripts/migrate-prod.js
```

**Verification:**
- Payment events written to outbox
- Events published to subscribers

**Regression checks:**
- All payment flows
- Event subscribers

**Logging / metrics required:**
- `eventId`, `eventType`, `publishedAt`, `subscriberId`

---

## GL-CRIT-0029 — Idempotency keys never auto-deleted (unbounded growth)
**🏷️ BATCH 3 — Database Integrity**

**Area:** DB

**User impact (10,000 stores):**
Idempotency tables grow forever. Database bloat, slower queries, eventual disk full.

**Exact reproduction steps:**
1. Check idempotency tables in inventory, orders, reorder schemas
2. All have `expires_at` column but no auto-delete
3. Table size grows indefinitely

**Expected vs Actual:**
- Expected: Background job deletes expired keys
- Actual: Keys accumulate forever

**Root cause:**
- Files: `backend/migrations/005_inventory_schema.sql`, `006_orders_schema.sql`, `007_reorder_schema.sql`
- `expires_at` defined but no cleanup mechanism

**Exact fix required:**
Add scheduled job to DELETE WHERE expires_at < NOW()

**VM deployment steps:**
```bash
ssh claude@34.14.220.171
# Add cron job or background worker
```

**Verification:**
- Expired keys deleted within 24 hours
- Table size stable

**Regression checks:**
- Idempotent operations still work
- No premature key deletion

**Logging / metrics required:**
- `keysDeleted`, `tableSizeBefore`, `tableSizeAfter`

---

## GL-CRIT-0030 — Missing updated_at on 10+ transactional tables
**🏷️ BATCH 3 — Database Integrity**

**Area:** DB

**User impact (10,000 stores):**
Cannot track when records were last modified. Debugging difficult. Audit compliance issues.

**Exact reproduction steps:**
1. Check `payments.sell_payments`, `payments.buy_payments`, `sale_items` tables
2. Only `created_at` exists, no `updated_at`
3. Cannot determine when payment status changed

**Expected vs Actual:**
- Expected: `updated_at` column with auto-update trigger
- Actual: Only `created_at`

**Root cause:**
- Files: `backend/migrations/049_payments_schema.sql`, `018_sales_schema.sql`

**Exact fix required:**
Migration to add `updated_at` columns and triggers

**VM deployment steps:**
```bash
ssh claude@34.14.220.171
cd /opt/supermandi/backend
node scripts/migrate-prod.js
```

**Verification:**
- UPDATE sets `updated_at` automatically
- Audit queries work

**Regression checks:**
- All update operations
- Reporting

**Logging / metrics required:**
- Migration execution

---

# ══════════════════════════════════════════════════════════════════
# BATCH 8: SUPPLIER PORTAL
# Priority: MEDIUM
# Tickets: GL-CRIT-0031-0034, GL-CRIT-0056-0065, GL-CRIT-0096-0099
# ══════════════════════════════════════════════════════════════════

## GL-CRIT-0031 — GSTIN validation regex incorrect in Supplier Portal
**🏷️ BATCH 8 — Supplier Portal**

**Area:** Supplier Web

**User impact (10,000 stores):**
Valid GSTIN numbers rejected during supplier registration. Legitimate suppliers cannot onboard.

**Exact reproduction steps:**
1. Try to register with valid GSTIN
2. Validation regex rejects some valid formats
3. Supplier cannot complete registration

**Expected vs Actual:**
- Expected: Correct GSTIN regex accepting all valid formats
- Actual: Regex hardcodes 'Z' at position 13, rejects valid GSTINs

**Root cause:**
- File: `supplier-portal/src/app/(auth)/register/page.tsx:72`
- Regex: `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`

**Exact fix required:**
Update regex to `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[A-Z0-9]{1}[0-9A-Z]{1}$`

**VM deployment steps:**
```bash
cd supplier-portal
npm run build
# Deploy
```

**Verification:**
- All valid GSTIN formats accepted
- Invalid formats rejected

**Regression checks:**
- Supplier registration flow
- GSTIN validation API

**Logging / metrics required:**
- `validationFailures`, `gstinPattern`

---

## GL-CRIT-0032 — Received quantity validation missing bounds check

**Area:** Supplier Web

**User impact (10,000 stores):**
Suppliers can enter received quantity > ordered quantity. Data integrity issue, potential fraud.

**Exact reproduction steps:**
1. Open order with 10 items ordered
2. Enter received quantity as 1000
3. Value accepted without validation

**Expected vs Actual:**
- Expected: `qty <= item.quantity` enforced
- Actual: Any number accepted

**Root cause:**
- File: `supplier-portal/src/app/(dashboard)/orders/page.tsx:368-388`

**Exact fix required:**
Add validation: `Math.min(parseInt(...), item.quantity)`

**VM deployment steps:**
```bash
cd supplier-portal
npm run build
# Deploy
```

**Verification:**
- Cannot enter qty > ordered
- Max is capped at ordered quantity

**Regression checks:**
- Order receiving flow
- Partial delivery

**Logging / metrics required:**
- `attemptedQty`, `maxQty`, `validationResult`

---

## GL-CRIT-0033 — Price decimal precision loss in calculations

**Area:** Supplier Web

**User impact (10,000 stores):**
`450.99 * 100 = 45098.99...` rounds incorrectly. Pricing errors, accounting discrepancies.

**Exact reproduction steps:**
1. Enter product price as 450.99
2. Code does `Math.round(parseFloat(value) * 100)`
3. Floating point precision causes incorrect paisa value

**Expected vs Actual:**
- Expected: Proper decimal handling
- Actual: Float multiplication causes precision loss

**Root cause:**
- File: `supplier-portal/src/app/(dashboard)/products/page.tsx:250-251`

**Exact fix required:**
Use `Math.round(parseFloat(value) * 100 + 0.001)` or decimal library

**VM deployment steps:**
```bash
cd supplier-portal
npm run build
# Deploy
```

**Verification:**
- 450.99 correctly becomes 45099 paisa
- All edge cases tested

**Regression checks:**
- All price calculations
- Invoice amounts

**Logging / metrics required:**
- `inputPrice`, `calculatedPaisa`, `expectedPaisa`

---

## GL-CRIT-0034 — No error handling for API failures in products page

**Area:** Supplier Web

**User impact (10,000 stores):**
API failures show "No products found" instead of error. Users think they have no products.

**Exact reproduction steps:**
1. Products API fails (network error)
2. Page shows "No products found"
3. User doesn't know there's an error

**Expected vs Actual:**
- Expected: Error message with retry button
- Actual: Generic empty state

**Root cause:**
- File: `supplier-portal/src/app/(dashboard)/products/page.tsx:77-80`
- No error state handling

**Exact fix required:**
Add explicit error state UI differentiated from empty state

**VM deployment steps:**
```bash
cd supplier-portal
npm run build
# Deploy
```

**Verification:**
- Network error shows "Failed to load products. Retry"
- Empty catalog shows "No products yet. Add your first product."

**Regression checks:**
- Products list
- Error scenarios

**Logging / metrics required:**
- `errorType`, `retryCount`

---

## GL-CRIT-0035 — Barcode validation missing in retailer dashboard

**Area:** Retailer Web

**User impact (10,000 stores):**
Invalid barcode formats accepted. Scanning won't work for malformed barcodes.

**Exact reproduction steps:**
1. Add product in retailer dashboard
2. Enter barcode "abc123!@#"
3. Accepted without validation
4. POS cannot scan this barcode

**Expected vs Actual:**
- Expected: Barcode format validation (EAN-13, UPC, etc.)
- Actual: Any string accepted

**Root cause:**
- File: `retailer-admin/src/pages/ProductsPage.tsx:859-873`
- No barcode pattern validation

**Exact fix required:**
Add barcode format regex validation

**VM deployment steps:**
```bash
cd retailer-admin
npm run build
# Deploy
```

**Verification:**
- Invalid barcode formats rejected
- Valid EAN-13, UPC accepted

**Regression checks:**
- Product creation
- Product editing
- Barcode scanning

**Logging / metrics required:**
- `barcodeFormat`, `validationResult`

---

## GL-CRIT-0036 — Phone validation missing in supplier form

**Area:** Retailer Web

**User impact (10,000 stores):**
Invalid phone numbers accepted. Cannot contact suppliers.

**Exact reproduction steps:**
1. Add supplier in retailer dashboard
2. Enter phone "abc"
3. Accepted without validation

**Expected vs Actual:**
- Expected: Phone format validation (10 digits for India)
- Actual: Any string accepted

**Root cause:**
- File: `retailer-admin/src/pages/SuppliersPage.tsx:657-664`

**Exact fix required:**
Add phone number regex validation

**VM deployment steps:**
```bash
cd retailer-admin
npm run build
# Deploy
```

**Verification:**
- Invalid phone formats rejected
- Valid 10-digit numbers accepted

**Regression checks:**
- Supplier creation
- Contact functionality

**Logging / metrics required:**
- `phoneFormat`, `validationResult`

---

## GL-CRIT-0037 — Supplier catalog pagination replaces instead of appends

**Area:** Retailer Web

**User impact (10,000 stores):**
Clicking "Load More" resets product list instead of adding more. Infinite scroll broken.

**Exact reproduction steps:**
1. View supplier catalog with 50+ products
2. Click "Load More"
3. First 20 products disappear, replaced with next 20

**Expected vs Actual:**
- Expected: Products append to list
- Actual: Products replace entire list

**Root cause:**
- File: `retailer-admin/src/pages/SupplierCatalogPage.tsx:64-65`
- `setProducts(data.data || [])` should append

**Exact fix required:**
Change to append: `setProducts(prev => [...prev, ...(data.data || [])])`

**VM deployment steps:**
```bash
cd retailer-admin
npm run build
# Deploy
```

**Verification:**
- Load More appends products
- Can scroll through entire catalog

**Regression checks:**
- Catalog browsing
- Search + pagination

**Logging / metrics required:**
- `pageLoaded`, `totalProductsDisplayed`

---

## GL-CRIT-0038 — Search debounce doesn't cancel in-flight requests

**Area:** Retailer Web

**User impact (10,000 stores):**
Rapid typing causes race condition. Old search results can overwrite newer ones.

**Exact reproduction steps:**
1. Type "app" quickly then "appl"
2. Both requests fire
3. "app" results may arrive after "appl" results
4. Wrong results displayed

**Expected vs Actual:**
- Expected: AbortController cancels previous requests
- Actual: Only timeout cleared, not in-flight fetch

**Root cause:**
- File: `retailer-admin/src/pages/DashboardPage.tsx:159-187`

**Exact fix required:**
Add AbortController to cancel pending fetches on new search

**VM deployment steps:**
```bash
cd retailer-admin
npm run build
# Deploy
```

**Verification:**
- Rapid typing shows only final search results
- No race conditions

**Regression checks:**
- All search functionality
- Type-ahead

**Logging / metrics required:**
- `requestsCancelled`, `searchLatency`

---

## GL-CRIT-0039 — Category rename has no rollback on API failure

**Area:** Retailer Web

**User impact (10,000 stores):**
Optimistic update persists even if API fails. UI shows renamed category but backend has old name.

**Exact reproduction steps:**
1. Rename category "Snacks" to "Snax"
2. UI updates immediately
3. API fails (network error)
4. UI shows "Snax" but backend has "Snacks"

**Expected vs Actual:**
- Expected: Rollback on failure
- Actual: UI state inconsistent with backend

**Root cause:**
- File: `retailer-admin/src/pages/DashboardPage.tsx:42-69`
- No rollback in catch block

**Exact fix required:**
Store previous state, restore on failure

**VM deployment steps:**
```bash
cd retailer-admin
npm run build
# Deploy
```

**Verification:**
- Failed rename reverts UI to original
- Error message shown

**Regression checks:**
- Category management
- Network failure scenarios

**Logging / metrics required:**
- `rollbackTriggered`, `failureReason`

---

## GL-CRIT-0040 — Opening stock editable in product edit mode

**Area:** Retailer Web

**User impact (10,000 stores):**
Users can arbitrarily change opening stock on existing products. Inventory ledger bypassed. Audit trail broken.

**Exact reproduction steps:**
1. Edit existing product
2. Change "Opening Stock" from 100 to 500
3. Save - stock magically appears without purchase

**Expected vs Actual:**
- Expected: Opening stock read-only in edit mode
- Actual: Opening stock fully editable

**Root cause:**
- File: `retailer-admin/src/pages/ProductsPage.tsx:1066-1078`
- Input not disabled in edit mode

**Exact fix required:**
Disable `openingStockQty` input when editing existing product

**VM deployment steps:**
```bash
cd retailer-admin
npm run build
# Deploy
```

**Verification:**
- Edit mode shows read-only stock
- Only ledger adjustments change stock

**Regression checks:**
- Product editing
- Inventory accuracy

**Logging / metrics required:**
- `editAttempted`, `fieldBlocked`

---

## GL-CRIT-0041 — UPI payment blocked offline without clear error

**Area:** POS

**User impact (10,000 stores):**
UPI selected offline throws generic error. User doesn't understand why UPI doesn't work.

**Exact reproduction steps:**
1. Go offline
2. Start sale
3. Select UPI payment
4. Generic error: "Payment failed"

**Expected vs Actual:**
- Expected: Clear message "UPI requires internet connection. Use Cash or Credit."
- Actual: Generic "upi_offline_blocked" error

**Root cause:**
- File: `src/services/api/posApi.ts:79-81`
- Throws error without user-friendly message

**Exact fix required:**
Show clear offline-specific UPI error with alternatives

**VM deployment steps:**
```bash
# POS app code fix, build and deploy new APK
```

**Verification:**
- Offline UPI shows clear guidance
- Cash/Credit alternatives highlighted

**Regression checks:**
- All offline payment scenarios
- Payment mode selection

**Logging / metrics required:**
- `paymentAttemptOffline`, `paymentMode`, `deviceId`

---

## GL-CRIT-0042 — Network error detection uses fragile string matching

**Area:** POS

**User impact (10,000 stores):**
Network errors may not be detected correctly. Different platforms report differently.

**Exact reproduction steps:**
1. Review `src/utils/errorHandler.ts:58-84`
2. Detection: `error.message.includes("Network")`
3. Some network errors don't include "Network" string

**Expected vs Actual:**
- Expected: Robust network error detection
- Actual: String matching on error message

**Root cause:**
- File: `src/utils/errorHandler.ts:58-84`

**Exact fix required:**
Check `TypeError` + `fetch` failure patterns, use AbortError detection

**VM deployment steps:**
```bash
# POS app code fix, build and deploy new APK
```

**Verification:**
- All network failure types correctly detected

**Regression checks:**
- Various network failure modes
- Different devices/platforms

**Logging / metrics required:**
- `errorType`, `errorMessage`, `detectionMethod`

---

## GL-CRIT-0043 — No timeout on API calls - requests can hang indefinitely

**Area:** POS

**User impact (10,000 stores):**
Slow network causes POS to hang. No timeout means user waits forever.

**Exact reproduction steps:**
1. Start API call
2. Network becomes very slow (not disconnected)
3. Request hangs indefinitely

**Expected vs Actual:**
- Expected: 30-second timeout with error
- Actual: No timeout configured

**Root cause:**
- File: `src/services/api/apiClient.ts`
- No AbortController with timeout

**Exact fix required:**
Add 30-second timeout to all API calls using AbortController

**VM deployment steps:**
```bash
# POS app code fix, build and deploy new APK
```

**Verification:**
- Slow request times out after 30 seconds
- Error message shown

**Regression checks:**
- All API calls
- Slow network scenarios

**Logging / metrics required:**
- `requestDuration`, `timeoutTriggered`

---

## GL-CRIT-0044 — Undo impossible after app restart (mutation history not persisted)

**Area:** POS

**User impact (10,000 stores):**
Accidentally added items cannot be undone after app restart.

**Exact reproduction steps:**
1. Add items to cart
2. Force-close app
3. Reopen app
4. Cart items restored but undo button doesn't work

**Expected vs Actual:**
- Expected: Mutation history persisted with cart
- Actual: Only items, discount, locked state persisted

**Root cause:**
- File: `src/stores/cartStore.ts:679-707`
- `mutationHistory` not in partialize

**Exact fix required:**
Add `mutationHistory` to persisted state or disable undo after restart

**VM deployment steps:**
```bash
# POS app code fix, build and deploy new APK
```

**Verification:**
- Undo works after restart OR undo button hidden

**Regression checks:**
- Cart persistence
- Undo/redo functionality

**Logging / metrics required:**
- `undoAvailable`, `mutationCount`

---

## GL-CRIT-0045 — Duplicate scan windows conflict (1200ms vs 500ms)

**Area:** POS

**User impact (10,000 stores):**
Two different duplicate detection windows with unpredictable interaction.

**Exact reproduction steps:**
1. Scan barcode A
2. Wait 600ms
3. Scan barcode A again
4. Confusing blocking behavior

**Expected vs Actual:**
- Expected: Single, clear duplicate window
- Actual: Two overlapping windows

**Root cause:**
- File: `src/services/scan/handleScan.ts:53-66`
- `DUPLICATE_WINDOW_MS = 1200` and `DEFAULT_DUPLICATE_GUARD_MS = 500`

**Exact fix required:**
Consolidate to single duplicate window with clear semantics

**VM deployment steps:**
```bash
# POS app code fix, build and deploy new APK
```

**Verification:**
- Single clear behavior for duplicate detection

**Regression checks:**
- All scanning scenarios

**Logging / metrics required:**
- `duplicateBlocked`, `windowType`, `timeSinceLastScan`

---

## GL-CRIT-0046 — Items with $0 price added silently

**Area:** POS

**User impact (10,000 stores):**
Invalid price defaults to 0 without warning. Free items given away accidentally.

**Exact reproduction steps:**
1. Scan item with missing/invalid price data
2. Item added with priceMinor = 0
3. Item sold for free

**Expected vs Actual:**
- Expected: Block item with invalid price
- Actual: Silent default to 0

**Root cause:**
- File: `src/services/scan/handleScan.ts:178-179`

**Exact fix required:**
Block item addition if price invalid, show "Price not set" error

**VM deployment steps:**
```bash
# POS app code fix, build and deploy new APK
```

**Verification:**
- Invalid price item blocked
- Error message shown

**Regression checks:**
- Product scanning
- Missing price scenarios

**Logging / metrics required:**
- `itemBlocked`, `reason`, `productId`

---

## GL-CRIT-0047 — No partial sale confirmation prompt

**Area:** POS

**User impact (10,000 stores):**
Partial payment completes without confirming user intent.

**Exact reproduction steps:**
1. Cart has 5 items
2. Pay for only 3 (partial sale)
3. No confirmation shown
4. User confused by remaining items

**Expected vs Actual:**
- Expected: Confirmation dialog for partial sales
- Actual: Proceeds silently

**Root cause:**
- File: `src/screens/PaymentScreen.tsx:105-111`

**Exact fix required:**
Add confirmation: "2 items will remain in cart. Continue?"

**VM deployment steps:**
```bash
# POS app code fix, build and deploy new APK
```

**Verification:**
- Partial sale shows confirmation

**Regression checks:**
- Partial payment flows

**Logging / metrics required:**
- `partialSale`, `itemsRemaining`, `userConfirmed`

---

## GL-CRIT-0048 — Health endpoints unauthenticated (reconnaissance risk)

**Area:** API

**User impact (10,000 stores):**
`/health` endpoints expose service status without authentication.

**Exact reproduction steps:**
1. Run `curl http://34.14.220.171:3000/health`
2. Returns service health without auth
3. Attacker learns infrastructure details

**Expected vs Actual:**
- Expected: Detailed health behind auth
- Actual: All health info public

**Root cause:**
- All services expose `/health` without auth

**Exact fix required:**
Split into `/health` (basic) and `/admin/health` (detailed, authenticated)

**VM deployment steps:**
```bash
ssh claude@34.14.220.171
docker-compose -f docker-compose.prod.yml up -d --build
```

**Verification:**
- `/health` returns minimal `{"status": "ok"}`
- `/admin/health` requires auth

**Regression checks:**
- Health checks in docker-compose
- Monitoring systems

**Logging / metrics required:**
- Health endpoint access patterns

---

## GL-CRIT-0049 — No audit logging in SuperAdmin frontend

**Area:** SuperAdmin

**User impact (10,000 stores):**
Admin actions not logged. Cannot trace who did what.

**Exact reproduction steps:**
1. Perform any admin action
2. No audit record created

**Expected vs Actual:**
- Expected: All admin actions logged
- Actual: No frontend audit logging

**Root cause:**
- File: `supermandi-superadmin/src/App.tsx`
- No audit calls in action handlers

**Exact fix required:**
Add audit API call on every admin mutation

**VM deployment steps:**
```bash
cd supermandi-superadmin
npm run build
# Deploy
```

**Verification:**
- Admin actions create audit records

**Regression checks:**
- All admin operations

**Logging / metrics required:**
- `adminId`, `action`, `targetId`, `beforeValue`, `afterValue`, `timestamp`

---

## GL-CRIT-0050 — Missing network policy between Docker containers

**Area:** VM

**User impact (10,000 stores):**
All containers on same bridge network. Compromised service can access any other service.

**Exact reproduction steps:**
1. Compromise one service container
2. Access any other service on internal network

**Expected vs Actual:**
- Expected: Network policies restricting inter-service communication
- Actual: All services on same network with full access

**Root cause:**
- File: `backend/docker-compose.prod.yml`
- Single `supermandi-network` for all services

**Exact fix required:**
Create separate networks for different service tiers

**VM deployment steps:**
```bash
ssh claude@34.14.220.171
# Create network tiers in docker-compose
docker-compose -f docker-compose.prod.yml up -d
```

**Verification:**
- Services can only reach required dependencies

**Regression checks:**
- All inter-service communication

**Logging / metrics required:**
- Network connection attempts

---

## GL-CRIT-0051 — Voice service OPENAI_API_KEY exposed in environment

**Area:** VM

**User impact (10,000 stores):**
OpenAI API key in docker-compose environment. Key exposed in container inspect.

**Exact reproduction steps:**
1. Run `docker inspect voice-service`
2. See OPENAI_API_KEY in environment

**Expected vs Actual:**
- Expected: Docker secrets
- Actual: Environment variable

**Root cause:**
- File: `backend/docker-compose.prod.yml:450-455`

**Exact fix required:**
Use Docker secrets instead of environment variables

**VM deployment steps:**
```bash
ssh claude@34.14.220.171
# Create Docker secret
# Update compose to use secret
```

**Verification:**
- Key not visible in container inspect

**Regression checks:**
- Voice service functionality

**Logging / metrics required:**
- API key usage monitoring

---

## GL-CRIT-0052 — Device token reset has no confirmation dialog

**Area:** SuperAdmin

**User impact (10,000 stores):**
Resetting device token immediately invalidates POS.

**Exact reproduction steps:**
1. Click "Reset Token" button
2. Token reset immediately
3. Device needs re-enrollment

**Expected vs Actual:**
- Expected: Confirmation dialog
- Actual: Immediate action

**Root cause:**
- File: `supermandi-superadmin/src/App.tsx:1100-1111`

**Exact fix required:**
Add confirmation: "Reset token? Device will need re-enrollment."

**VM deployment steps:**
```bash
cd supermandi-superadmin
npm run build
# Deploy
```

**Verification:**
- Reset shows confirmation

**Regression checks:**
- Device management

**Logging / metrics required:**
- `adminId`, `deviceId`, `action`

---

## GL-CRIT-0053 — Admin user creation allows "admin" role without verification

**Area:** SuperAdmin

**User impact (10,000 stores):**
Any admin can create new admin users without additional verification.

**Exact reproduction steps:**
1. Open user creation form
2. Select "admin" role
3. User created without extra verification

**Expected vs Actual:**
- Expected: 2FA or secondary approval for admin role
- Actual: No extra verification

**Root cause:**
- File: `supermandi-superadmin/src/App.tsx:3145`

**Exact fix required:**
Require 2FA or secondary approval for admin role creation

**VM deployment steps:**
```bash
cd supermandi-superadmin
npm run build
# Deploy
```

**Verification:**
- Admin role requires extra verification

**Regression checks:**
- User provisioning

**Logging / metrics required:**
- `roleRequested`, `verificationMethod`

---

## GL-CRIT-0054 — Device label validation missing length/character limits

**Area:** SuperAdmin

**User impact (10,000 stores):**
Device labels can be arbitrarily long, contain any Unicode.

**Exact reproduction steps:**
1. Enter 1000-character device label
2. Accepted without validation

**Expected vs Actual:**
- Expected: 1-50 chars, alphanumeric only
- Actual: Any input accepted

**Root cause:**
- File: `supermandi-superadmin/src/App.tsx:1068-1070`

**Exact fix required:**
Add validation: 1-50 chars, alphanumeric + spaces/hyphens

**VM deployment steps:**
```bash
cd supermandi-superadmin
npm run build
# Deploy
```

**Verification:**
- Long labels rejected

**Regression checks:**
- Device editing

**Logging / metrics required:**
- `validationFailure`

---

## GL-CRIT-0055 — Error messages expose implementation details

**Area:** SuperAdmin / API

**User impact (10,000 stores):**
Error messages reveal internal structure: "set VITE_ADMIN_TOKEN to match backend ADMIN_TOKEN"

**Exact reproduction steps:**
1. Trigger auth error
2. See detailed implementation error

**Expected vs Actual:**
- Expected: Generic "Authentication failed"
- Actual: Implementation details exposed

**Root cause:**
- File: `supermandi-superadmin/src/api/devices.ts:25-30`

**Exact fix required:**
Sanitize error messages, hide implementation details

**VM deployment steps:**
```bash
cd supermandi-superadmin
npm run build
# Deploy
```

**Verification:**
- Generic error messages shown

**Regression checks:**
- All error scenarios

**Logging / metrics required:**
- Original error logged server-side

---

## GL-CRIT-0056 — Account number match validation lacks real-time feedback

**Area:** Supplier Web

**User impact (10,000 stores):**
Suppliers enter mismatched account numbers without immediate feedback.

**Exact reproduction steps:**
1. Enter account number
2. Enter different confirm number
3. No error until form submit

**Expected vs Actual:**
- Expected: Instant mismatch indicator
- Actual: Error on submit only

**Root cause:**
- File: `supplier-portal/src/app/(dashboard)/kyc/page.tsx:152-154`

**Exact fix required:**
Add onChange comparison with instant feedback

**VM deployment steps:**
```bash
cd supplier-portal
npm run build
# Deploy
```

**Verification:**
- Mismatch shown immediately

**Regression checks:**
- Bank account form

**Logging / metrics required:**
- `mismatchDetected`

---

## GL-CRIT-0057 — window.location.href causes page flash on redirect

**Area:** Supplier Web

**User impact (10,000 stores):**
Password reset success uses direct location change, causing flash.

**Exact reproduction steps:**
1. Complete password reset
2. See page flash before redirect

**Expected vs Actual:**
- Expected: Smooth router navigation
- Actual: Hard page reload

**Root cause:**
- File: `supplier-portal/src/app/(auth)/forgot-password/page.tsx:68-71`

**Exact fix required:**
Use router.push() for navigation

**VM deployment steps:**
```bash
cd supplier-portal
npm run build
# Deploy
```

**Verification:**
- Smooth redirect

**Regression checks:**
- All redirects

**Logging / metrics required:**
- N/A

---

## GL-CRIT-0058 — Unsaved changes navigation guard missing

**Area:** Supplier Web

**User impact (10,000 stores):**
Navigating away via sidebar loses unsaved product edits without warning.

**Exact reproduction steps:**
1. Start editing product
2. Click sidebar link
3. Changes lost without warning

**Expected vs Actual:**
- Expected: "Unsaved changes" warning
- Actual: Silent navigation

**Root cause:**
- File: `supplier-portal/src/app/(dashboard)/products/page.tsx:177-186`

**Exact fix required:**
Add beforeunload and router navigation guards

**VM deployment steps:**
```bash
cd supplier-portal
npm run build
# Deploy
```

**Verification:**
- Warning shown before navigation

**Regression checks:**
- All form pages

**Logging / metrics required:**
- `unsavedChangesWarningShown`

---

## GL-CRIT-0059 — IFSC validation rejects some valid codes

**Area:** Supplier Web

**User impact (10,000 stores):**
IFSC regex requires 4-letter bank code, but some have 3 letters.

**Exact reproduction steps:**
1. Enter valid 3-letter bank IFSC
2. Validation fails

**Expected vs Actual:**
- Expected: Accept all valid IFSC formats
- Actual: Some rejected

**Root cause:**
- File: `supplier-portal/src/app/(dashboard)/kyc/page.tsx:133-136`

**Exact fix required:**
Update regex to allow 3-4 letter bank codes

**VM deployment steps:**
```bash
cd supplier-portal
npm run build
# Deploy
```

**Verification:**
- All valid IFSC codes accepted

**Regression checks:**
- Bank verification flow

**Logging / metrics required:**
- `ifscValidationFailure`

---

## GL-CRIT-0060 — Order status filter counts based on current page only

**Area:** Supplier Web

**User impact (10,000 stores):**
Filter badges show incomplete counts for paginated data.

**Exact reproduction steps:**
1. Have 50 orders (25 pending, 25 completed)
2. First page shows 20
3. Filter counts only show first-page counts

**Expected vs Actual:**
- Expected: Total counts from API
- Actual: Page-only counts

**Root cause:**
- File: `supplier-portal/src/app/(dashboard)/orders/page.tsx:152-181`

**Exact fix required:**
Fetch total counts from API, not page data

**VM deployment steps:**
```bash
cd supplier-portal
npm run build
# Deploy
```

**Verification:**
- Filter badges show total counts

**Regression checks:**
- Order filtering

**Logging / metrics required:**
- N/A

---

## GL-CRIT-0061 — Missing error state in earnings page

**Area:** Supplier Web | **Root cause:** `supplier-portal/src/app/(dashboard)/earnings/page.tsx:143-149` | **Fix:** Add explicit error state UI

---

## GL-CRIT-0062 — Ship button visible for 'confirmed' status only

**Area:** Supplier Web | **Root cause:** `supplier-portal/src/app/(dashboard)/orders/page.tsx:508-516` | **Fix:** Allow shipment entry for pending status

---

## GL-CRIT-0063 — No validation before marking order shipped with pending items

**Area:** Supplier Web | **Root cause:** `supplier-portal/src/app/(dashboard)/orders/page.tsx:500` | **Fix:** Warn if any items still pending

---

## GL-CRIT-0064 — handle401Response uses synchronous redirect

**Area:** Supplier Web | **Root cause:** `supplier-portal/src/lib/auth.tsx:37-42` | **Fix:** Use router.push() with proper cleanup

---

## GL-CRIT-0065 — Loading state returns null after delay

**Area:** Supplier Web | **Root cause:** `supplier-portal/src/lib/auth.tsx:89-98` | **Fix:** Show redirect message instead of null

---

## GL-CRIT-0066 — Hardcoded category icon map

**Area:** Retailer Web | **Root cause:** `retailer-admin/src/pages/DashboardPage.tsx:197-217` | **Fix:** Load icons from API/config

---

## GL-CRIT-0067 — Hardcoded supplier types

**Area:** Retailer Web | **Root cause:** `retailer-admin/src/pages/SuppliersPage.tsx:59-67` | **Fix:** Load from backend configuration

---

## GL-CRIT-0068 — Hardcoded document types for compliance

**Area:** Retailer Web | **Root cause:** `retailer-admin/src/pages/CompliancePage.tsx:16-23` | **Fix:** Fetch document types from backend

---

## GL-CRIT-0069 — CSV import template hardcoded in UI

**Area:** Retailer Web | **Root cause:** `retailer-admin/src/pages/ImportPage.tsx:262-268` | **Fix:** Generate template from backend schema

---

## GL-CRIT-0070 — Generic error in compliance upload

**Area:** Retailer Web | **Root cause:** `retailer-admin/src/pages/CompliancePage.tsx:116-117` | **Fix:** Show file name, specific error, retry button

---

## GL-CRIT-0071 — Delete supplier mentions "undo by adding again"

**Area:** Retailer Web | **Root cause:** `retailer-admin/src/pages/SuppliersPage.tsx:1154-1156` | **Fix:** Implement soft delete with 30-day recovery window

---

## GL-CRIT-0072 — Admin margin can be negative

**Area:** Retailer Web | **Root cause:** `retailer-admin/src/pages/admin/ProductQueuePage.tsx:133-142` | **Fix:** Add min: 0 validation for margin

---

## GL-CRIT-0073 — Inventory filter empty state too generic

**Area:** Retailer Web | **Root cause:** `retailer-admin/src/pages/InventoryPage.tsx:154-177` | **Fix:** Show contextual empty state based on filter state

---

## GL-CRIT-0074 — Search result navigation loses context

**Area:** Retailer Web | **Root cause:** `retailer-admin/src/pages/DashboardPage.tsx:348` | **Fix:** Preserve search state in URL params

---

## GL-CRIT-0075 — Edit vs create mode not visually distinct

**Area:** Retailer Web | **Root cause:** `retailer-admin/src/pages/ProductsPage.tsx:261-296` | **Fix:** Clear header indicating mode

---

## GL-CRIT-0076 — Idle timeout hardcoded to 30 minutes

**Area:** Retailer Web | **Root cause:** `retailer-admin/src/lib/AuthContext.tsx:38-40` | **Fix:** Make configurable via environment variable

---

## GL-CRIT-0077 — Missing aria-labels on form inputs

**Area:** Retailer Web / Supplier Web | **Root cause:** Multiple form pages | **Fix:** Add aria-labels to all inputs

---

## GL-CRIT-0078 — Modal can't be closed with Escape key

**Area:** Retailer Web | **Root cause:** `retailer-admin/src/pages/DashboardPage.tsx:1060-1126` | **Fix:** Add keyboard listener for Escape key

---

## GL-CRIT-0079 — Deployment script has no input validation

**Area:** VM | **Root cause:** `DEPLOY_NOW.sh:1-158` | **Fix:** Validate all user inputs before executing commands

---

## GL-CRIT-0080 — Missing `set -u` in deployment scripts

**Area:** VM | **Root cause:** `vm-deploy-script.sh:5` | **Fix:** Add `set -u` after `set -e`

---

## GL-CRIT-0081 — dev dependencies installed in production

**Area:** VM | **Root cause:** `scripts/deploy_backend.sh:24` | **Fix:** Use `npm ci --omit=dev` for production

---

## GL-CRIT-0082 — No directory validation before operations

**Area:** VM | **Root cause:** `vm-deploy-script.sh:15-20` | **Fix:** Add directory existence checks

---

## GL-CRIT-0083 — Multiple loading states not coordinated

**Area:** POS | **Root cause:** `src/screens/SellScanScreen.tsx:2418-2682` | **Fix:** Coordinate loading states with single top-level indicator

---

## GL-CRIT-0084 — 4 separate loading flags in BuyScreen

**Area:** POS | **Root cause:** `src/screens/BuyScreen.tsx:56-87` | **Fix:** Consolidate to single loading state machine

---

## GL-CRIT-0085 — No loading skeleton in SalesHistory

**Area:** POS | **Root cause:** `src/screens/SalesHistoryScreen.tsx:20-44` | **Fix:** Add skeleton loader for smooth transition

---

## GL-CRIT-0086 — Payment screen loading states flash too fast

**Area:** POS | **Root cause:** `src/screens/PaymentScreen.tsx:127-135` | **Fix:** Add minimum display time for loading messages

---

## GL-CRIT-0087 — No retry UX for network errors

**Area:** POS | **Root cause:** `src/utils/errorHandler.ts:150-179` | **Fix:** Add "Tap to retry" button in error toast

---

## GL-CRIT-0088 — Stock refresh can hang indefinitely

**Area:** POS | **Root cause:** `src/services/stockService.ts:80-98` | **Fix:** Add 30-second timeout to refresh promise

---

## GL-CRIT-0089 — Hardcoded page sizes inconsistent

**Area:** POS | **Root cause:** Multiple screens with different PAGE_SIZE | **Fix:** Centralize page size constant

---

## GL-CRIT-0090 — 30-second category auto-collapse unexplained

**Area:** POS | **Root cause:** `src/screens/SellScanScreen.tsx:215` | **Fix:** Remove auto-collapse or add clear UX indicator

---

## GL-CRIT-0091 — 1-minute HID scanner timeout too long

**Area:** POS | **Root cause:** `src/screens/PosRootLayout.tsx:85` | **Fix:** Reduce to 10-15 seconds

---

## GL-CRIT-0092 — 5-second camera idle timeout too short

**Area:** POS | **Root cause:** `src/screens/PosRootLayout.tsx:86` | **Fix:** Increase to 30-60 seconds or user gesture based

---

## GL-CRIT-0093 — Storage keys hardcoded in multiple files

**Area:** POS | **Root cause:** Multiple files with storage key strings | **Fix:** Centralize all storage keys in one constants file

---

## GL-CRIT-0094 — Cart unlock before navigation completes

**Area:** POS | **Root cause:** `src/screens/SuccessPrintScreenV2.tsx:105-111` | **Fix:** Unlock after navigation completes

---

## GL-CRIT-0095 — Some i18n strings hardcoded

**Area:** POS / Web | **Root cause:** Multiple files with English strings | **Fix:** Move all strings to i18n files

---

## GL-CRIT-0096 — CSV upload server template endpoint missing

**Area:** Supplier Web | **Root cause:** `supplier-portal/src/app/(dashboard)/upload/page.tsx:137-146` | **Fix:** Create server endpoint or remove reference

---

## GL-CRIT-0097 — Bank verification shows form even when verified

**Area:** Supplier Web | **Root cause:** `supplier-portal/src/app/(dashboard)/kyc/page.tsx:348-356` | **Fix:** Show read-only state after verification

---

## GL-CRIT-0098 — Dead code in IFSC mutation

**Area:** Supplier Web | **Root cause:** `supplier-portal/src/app/(dashboard)/kyc/page.tsx:89` | **Fix:** Remove or fix to populate from IFSC data

---

## GL-CRIT-0099 — Dashboard stats calculation mixes client/server

**Area:** Supplier Web | **Root cause:** `supplier-portal/src/app/(dashboard)/dashboard/page.tsx:76-84` | **Fix:** Use server-provided total counts

---

## GL-CRIT-0100 — Stock error message doesn't auto-update cart

**Area:** POS | **Root cause:** `src/screens/PaymentScreen.tsx:553-569` | **Fix:** Auto-update cart quantities when stock error received

---

## GL-CRIT-0101 — All API error handling lumps 4xx/5xx together

**Area:** Retailer Web | **Root cause:** `retailer-admin/src/pages/ProductsPage.tsx:446-447` | **Fix:** Differentiate error handling by status code

---

## GL-CRIT-0102 — Import page validation errors generic

**Area:** Retailer Web | **Root cause:** `retailer-admin/src/pages/ImportPage.tsx:113-115` | **Fix:** Show specific error type and row number

---

## GL-CRIT-0103 — Product queue BNPL days accepts any input via DevTools

**Area:** Retailer Web | **Root cause:** `retailer-admin/src/pages/admin/ProductQueuePage.tsx:600-612` | **Fix:** Server-side validation of allowed values

---

## GL-CRIT-0104 — Delivery charges field accepts garbage

**Area:** Retailer Web | **Root cause:** `retailer-admin/src/pages/SuppliersPage.tsx:845-855` | **Fix:** Structured input: numeric with "free above" option

---

## GL-CRIT-0105 — MOV can be negative

**Area:** Retailer Web | **Root cause:** `retailer-admin/src/pages/SuppliersPage.tsx:833-844` | **Fix:** Add max and step validation

---

# END OF TICKETS

---

# ══════════════════════════════════════════════════════════════════
# FINAL GO-LIVE VERIFICATION
# ══════════════════════════════════════════════════════════════════

## Complete End-to-End Test Suite

After all batches are complete, run this full verification:

```bash
ssh claude@34.14.220.171

# 1. Verify commit SHA
cd /opt/supermandi/backend
git rev-parse HEAD
# Expected: 1bb3f26e68ebe527e9a95f81ceb7eaf0aff763d4

# 2. All containers running
docker-compose -f docker-compose.prod.yml ps
# Expected: All services healthy

# 3. Database migrations complete
docker exec supermandi-postgres psql -U supermandi -c "\dt *.*"
# Expected: All tables present

# 4. HTTPS working
curl -I https://api.supermandi.com/health
# Expected: 200 OK
```

## Final Sign-off Checklist

| Component | Status | Signed By | Date |
|-----------|--------|-----------|------|
| API Security (Batch 1) | [ ] | | |
| VM Infrastructure (Batch 2) | [ ] | | |
| Database Integrity (Batch 3) | [ ] | | |
| SuperAdmin Security (Batch 4) | [ ] | | |
| POS Cart/Payment (Batch 5) | [ ] | | |
| POS Scanning/UI (Batch 6) | [ ] | | |
| Retailer Dashboard (Batch 7) | [ ] | | |
| Supplier Portal (Batch 8) | [ ] | | |
| Deployment Scripts (Batch 9) | [ ] | | |
| **FINAL GO-LIVE** | [ ] | | |

---

# ROLLBACK PROCEDURES

In case of critical failure after any batch:

```bash
ssh claude@34.14.220.171

# Database rollback
cd /opt/supermandi/backend
docker exec supermandi-postgres psql -U supermandi < backup_YYYYMMDD_HHMMSS.sql

# Service rollback
docker-compose -f docker-compose.prod.yml down
git checkout <previous_commit>
docker-compose -f docker-compose.prod.yml up -d --build

# APK rollback
# Distribute previous APK version to devices
```

---

**Total Critical Issues: 105**

**Summary by Area:**
| Area | Count |
|------|-------|
| API Security | 7 |
| Database | 10 |
| POS App | 25 |
| Retailer Dashboard | 18 |
| Supplier Portal | 15 |
| SuperAdmin | 12 |
| VM/Deployment | 18 |

**Summary by Batch:**
| Batch | Tickets | Priority |
|-------|---------|----------|
| 1 | 0001-0007 | BLOCKER |
| 2 | 0017-0020, 0025-0027, 0050-0051 | BLOCKER |
| 3 | 0008-0010, 0028-0030 | HIGH |
| 4 | 0021-0022, 0049, 0052-0055 | HIGH |
| 5 | 0011-0016, 0041, 0046-0047, 0100 | HIGH |
| 6 | 0024, 0042-0045, 0083-0095 | MEDIUM |
| 7 | 0023, 0035-0040, 0066-0078, 0101-0105 | MEDIUM |
| 8 | 0031-0034, 0056-0065, 0096-0099 | MEDIUM |
| 9 | 0048, 0079-0082 | LOW |

---

**Document Version:** 1.0
**Created:** 2026-01-28
**Total Tickets:** 105
**Total Batches:** 9

All issues require resolution before Go-Live with 10,000 stores.
