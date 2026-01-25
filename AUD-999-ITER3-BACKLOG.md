# AUD-999 Iteration 3 - Prioritized Backlog

**Source:** AUD-999_GoLive_Audit_Iteration3.pdf
**Date:** 2026-01-25
**VM:** http://34.14.220.171:3000
**Total Issues:** 35 (7 CRITICAL, 11 HIGH, 12 MEDIUM, 5 LOW)

---

## CRITICAL TICKETS (Go-Live Blockers)

### CRIT-001: AUD-080-A - Per-event TX breaks batch atomicity
**Status:** PENDING
**Category:** Sync

**Problem:**
Each event in a sync batch gets its own BEGIN/COMMIT cycle. If two concurrent requests submit overlapping event ranges (Request A: events 1-5, Request B: events 3-7), events 3-5 are processed independently by both requests.

**Files:**
- `backend/src/routes/pos/sync.ts:201-216`

**Repro Steps:**
1. Device A submits sync with events [evt-1, evt-2, evt-3, evt-4, evt-5]
2. Device B (same store) submits sync with events [evt-3, evt-4, evt-5, evt-6, evt-7] within 10ms
3. Events 3-5 processed by both requests independently
4. Stale reads between events in same batch

**Acceptance Criteria:**
- [ ] Entire batch wrapped in single transaction
- [ ] Advisory lock on (store_id, device_id) at batch start
- [ ] Concurrent batches from same device serialized
- [ ] VM proof: concurrent curl requests don't cause duplicate processing

**Rollback Plan:**
Revert sync.ts to previous version, redeploy

---

### CRIT-002: AUD-080-B - Duplicate event detection no row lock
**Status:** PENDING
**Category:** Sync

**Problem:**
INSERT INTO processed_events ON CONFLICT DO NOTHING checks rowCount === 0 for dedup. No SELECT FOR UPDATE precedes the insert. Two requests submitting same eventId within 10ms can both pass the INSERT check.

**Files:**
- `backend/src/routes/pos/sync.ts:205-213`

**Repro Steps:**
1. Send same eventId in two parallel sync requests
2. Both requests INSERT before either commits
3. Both think they're first processor
4. Duplicate sale created

**Acceptance Criteria:**
- [ ] Use pg_advisory_xact_lock(hash(eventId)) before INSERT
- [ ] OR use SELECT FOR UPDATE SKIP LOCKED pattern
- [ ] Concurrent duplicate events return consistent 'duplicate_ignored'
- [ ] VM proof: parallel curl with same eventId creates exactly 1 sale

**Rollback Plan:**
Revert sync.ts, redeploy

---

### CRIT-003: AUD-080-C - Post-ROLLBACK queries outside TX
**Status:** PENDING
**Category:** Sync

**Problem:**
When duplicate eventId detected, code ROLLBACKs at line 216 but then queries sales table (line 222) outside any transaction. Another request could delete/modify the sale between ROLLBACK and query.

**Files:**
- `backend/src/routes/pos/sync.ts:219-249`

**Repro Steps:**
1. Submit sync with duplicate eventId
2. Code detects duplicate, ROLLBACKs
3. Query for existing sale mapping happens outside TX
4. Concurrent delete of that sale
5. Client receives null/stale mapping

**Acceptance Criteria:**
- [ ] Post-duplicate queries happen BEFORE ROLLBACK
- [ ] OR use SAVEPOINT instead of full ROLLBACK
- [ ] All reads are consistent within same isolation level
- [ ] VM proof: duplicate detection returns correct existing sale data

**Rollback Plan:**
Revert sync.ts, redeploy

---

### CRIT-004: AUD-080-D - Payment dedup ignores amount
**Status:** PENDING
**Category:** Sync

**Problem:**
PAYMENT_CASH dedup checks only (sale_id, mode, status) NOT amount_minor. If device retries payment with different amount (network changed response), second attempt is marked 'duplicate_ignored' even though amounts differ.

**Files:**
- `backend/src/routes/pos/sync.ts:597-614`

**Repro Steps:**
1. Device submits PAYMENT_CASH: sale_id=X, amount=10000, mode=CASH
2. Network timeout, device retries with corrected amount=12000
3. Server marks second as 'duplicate_ignored' (same sale_id, mode)
4. Only first (wrong) amount recorded

**Acceptance Criteria:**
- [ ] Payment dedup includes amount_minor in uniqueness check
- [ ] Amount mismatch logs warning and uses latest amount
- [ ] OR reject mismatched amount with clear error
- [ ] VM proof: payment retry with different amount handled correctly

**Rollback Plan:**
Revert sync.ts, redeploy

---

### CRIT-005: AUD-080-E - Inventory FOR UPDATE deadlock
**Status:** PENDING
**Category:** Sync

**Problem:**
ensureStoreInventoryAvailability() acquires FOR UPDATE locks on product rows in arbitrary order. Overlapping batches can deadlock: Event1 locks A,B; Event2 locks B,C; Event3 locks C,A.

**Files:**
- `backend/src/services/inventoryLedgerService.ts:335-336`

**Repro Steps:**
1. Batch 1: sale with products [A, B, C]
2. Batch 2 (concurrent): sale with products [C, A, B]
3. Batch 1 locks A, waits for C
4. Batch 2 locks C, waits for A
5. PostgreSQL deadlock timeout (~1s), sync fails

**Acceptance Criteria:**
- [ ] Sort product IDs before locking (canonical order)
- [ ] Use NOWAIT with retry or SKIP LOCKED pattern
- [ ] Add deadlock detection/retry logic
- [ ] VM proof: concurrent sales with overlapping products don't deadlock

**Rollback Plan:**
Revert inventoryLedgerService.ts, redeploy

---

### CRIT-006: AUD-080-F (carry-forward) - Sync no last-write-wins
**Status:** FROM ITER 1-2
**Category:** Sync

**Problem:**
Stale offline events overwrite newer server state without timestamp comparison.

**Files:**
- `backend/src/routes/pos/sync.ts`

**Acceptance Criteria:**
- [ ] Compare event timestamp with server record updated_at
- [ ] Reject stale events or merge intelligently
- [ ] Return conflict info to client

---

### CRIT-007: AUD-080-G (carry-forward) - UPI hardcoded null
**Status:** FROM ITER 1-2
**Category:** Payments

**Problem:**
UPI payment mode is hardcoded to null/disabled, making all UPI payments impossible.

**Files:**
- Payment processing code

**Acceptance Criteria:**
- [ ] UPI payment mode functional
- [ ] VM proof: UPI payment completes successfully

---

## HIGH TICKETS

### HIGH-001: AUD-073-A - variant & packSize SILENT DROP
**Status:** PENDING
**Category:** Products

**Problem:**
User enters variant and packSize in digitisation form. Values sent in API request but backend NEVER passes to createStoreProductFromDigitisation. Column exists (migration 024) but never populated.

**Files:**
- `pos-app/src/components/AddStoreProductModal.tsx:60-61`
- `pos-app/src/services/api/scanApi.ts:274-275`
- `backend/src/routes/pos/storeProducts.ts:81`
- `backend/src/services/storeProductDigitisationService.ts`

**Repro Steps:**
1. Open POS app, scan unknown barcode
2. Fill digitisation form with variant="500g" packSize="6-pack"
3. Submit product
4. Query DB: SELECT variant, pack_size FROM catalog.products WHERE ... → NULL, NULL

**Acceptance Criteria:**
- [ ] variant and packSize passed through to INSERT
- [ ] API response returns saved values
- [ ] UI displays saved values on product detail
- [ ] VM proof: curl create product with variant → query returns variant

**Rollback Plan:**
Revert storeProducts.ts and service, redeploy

---

### HIGH-002: AUD-074-A - Inward supplierId silently dropped
**Status:** PENDING
**Category:** Inventory

**Problem:**
User selects supplier from SupplierPicker modal. Supplier ID stored in state but only supplierName appended to 'notes' TEXT field. No supplier_id FK in inventory_ledger.

**Files:**
- `pos-app/src/screens/InwardScreen.tsx`
- `pos-app/src/services/api/inventoryApi.ts`
- `backend/src/routes/pos/stockIn.ts`

**Repro Steps:**
1. Open Inward screen, select supplier "Fresh Farms" (id=abc123)
2. Submit stock-in
3. Query DB: inventory_ledger has notes="Supplier: Fresh Farms" but no supplier_id column

**Acceptance Criteria:**
- [ ] Add supplier_id column to inventory.inventory_ledger (migration)
- [ ] API accepts and stores supplier_id
- [ ] Can query "all stock from supplier X" without parsing notes
- [ ] VM proof: stock-in with supplier → query returns supplier_id

**Rollback Plan:**
Migration DOWN removes column, revert API code

---

### HIGH-003: AUD-076-A - POS inventory/stock/:id 404
**Status:** PENDING
**Category:** API

**Problem:**
Frontend inventoryApi.ts calls GET /api/v1/pos/inventory/stock/{productId} but route returns 404. Only batch endpoint exists.

**Files:**
- `pos-app/src/services/api/inventoryApi.ts`
- `backend/src/routes/pos/inventory.ts` (missing route)

**Repro Steps:**
```bash
curl http://34.14.220.171:3000/api/v1/pos/inventory/stock/abc123 \
  -H "x-device-token: valid-token"
# Returns 404 Cannot GET
```

**Acceptance Criteria:**
- [ ] Add GET /inventory/stock/:productId route
- [ ] Returns single product stock balance
- [ ] Store isolation enforced
- [ ] VM proof: curl returns stock for valid product

**Rollback Plan:**
Remove new route, redeploy

---

### HIGH-004: AUD-077-A - catalog.products.variant never written
**Status:** PENDING (related to HIGH-001)
**Category:** Schema

**Problem:**
Migration 024 adds 'variant' column but INSERT query never includes it. Same root cause as HIGH-001.

**Files:**
- `backend/migrations/024_sd_onboard_002_two_speed_capture.sql`
- `backend/src/routes/pos/storeProducts.ts`

**Acceptance Criteria:**
- [ ] Fixed by HIGH-001 implementation
- [ ] Verify column populated for new products

---

### HIGH-005: AUD-077-B - inventory_ledger CHECK constraint gaps
**Status:** PENDING
**Category:** Schema

**Problem:**
CHECK constraint allows: 'sale', 'sale_return', 'purchase_received', 'adjustment'. But code uses 'stock_in', 'opening_stock'. INSERT fails with constraint violation.

**Files:**
- `backend/migrations/005*.sql:44-46`
- `backend/src/routes/pos/stockIn.ts`
- `retailer-admin/src/routes/inventory.ts`

**Repro Steps:**
1. Attempt stock-in with type='stock_in'
2. INSERT fails: CHECK constraint violation
3. OR retailer admin opening_stock fails similarly

**Acceptance Criteria:**
- [ ] Migration adds 'stock_in', 'opening_stock' to CHECK constraint
- [ ] OR update code to use existing allowed types
- [ ] VM proof: stock-in completes without constraint error

**Rollback Plan:**
Migration DOWN reverts constraint

---

### HIGH-006: AUD-081-A - Corrupted JSON blocks outbox forever
**Status:** PENDING
**Category:** Sync (Client)

**Problem:**
getPendingEvents() parses each event via JSON.parse. One corrupted event halts entire batch processing.

**Files:**
- `pos-app/src/services/outbox.ts:20-32, 45-55`

**Repro Steps:**
1. App crash mid-write corrupts one event's JSON
2. Sync attempts to parse, throws error
3. Entire sync blocked forever
4. All subsequent events never sent

**Acceptance Criteria:**
- [ ] try/catch around JSON.parse per event
- [ ] Skip corrupted events with error logging
- [ ] Mark corrupted events with error flag
- [ ] Continue processing valid events

**Rollback Plan:**
Revert outbox.ts, rebuild app

---

### HIGH-007: AUD-081-B - Heartbeat count never decrements
**Status:** PENDING
**Category:** Sync

**Problem:**
pending_outbox_count only updated to client-reported value. If device syncs successfully then goes offline, admin dashboard shows stale 'pending' count.

**Files:**
- `backend/src/routes/pos/sync.ts:144-158, 667-676`

**Repro Steps:**
1. Device reports pending_outbox_count=5
2. Device syncs 5 events successfully
3. Server still shows count=5 until next request
4. Device goes offline
5. Admin sees "5 pending" indefinitely

**Acceptance Criteria:**
- [ ] Server decrements count after successful event processing
- [ ] OR require client to send updated count in response ack
- [ ] Admin dashboard shows accurate pending count

**Rollback Plan:**
Revert sync.ts

---

### HIGH-008: AUD-081-C - No sync endpoint timeout
**Status:** PENDING
**Category:** Sync

**Problem:**
Sync endpoint processes events sequentially with no timeout. Large batches can exceed 60s, mobile app kills connection, events in partial state.

**Files:**
- `backend/src/routes/pos/sync.ts:162-679`

**Repro Steps:**
1. Submit batch of 50 events with retries
2. Processing takes >60s
3. Mobile app times out connection
4. Some events committed, some not
5. Retry sends all 50 again (duplicates)

**Acceptance Criteria:**
- [ ] Add 30s timeout per batch
- [ ] Return partial success response with processed event IDs
- [ ] Client can resume from last successful event
- [ ] VM proof: large batch handles timeout gracefully

**Rollback Plan:**
Revert sync.ts

---

### HIGH-009: AUD-081-D - Rejected events infinite loop
**Status:** PENDING
**Category:** Sync (Client)

**Problem:**
syncOutbox() loops while syncOutboxBatch() returns > 0. Permanently rejected event stays in queue forever. Loop never terminates.

**Files:**
- `pos-app/src/services/sync.ts:85-95`
- `pos-app/src/services/outbox.ts`

**Repro Steps:**
1. Event #3 has invalid barcode (permanent rejection)
2. Sync attempts, server rejects event #3
3. Event stays in outbox (synced_at = NULL)
4. Next batch fetches same events
5. Infinite loop: battery drain + network spam

**Acceptance Criteria:**
- [ ] Mark permanently rejected events with error flag
- [ ] Skip flagged events in future batches
- [ ] UI shows "X events failed sync" notification
- [ ] User can view/clear failed events

**Rollback Plan:**
Revert sync.ts and outbox.ts

---

### HIGH-010: AUD-083-A - Microservices data split ambiguity
**Status:** PENDING
**Category:** Architecture

**Problem:**
All 8 microservices running. Main monolith ALSO handles some routes. Ambiguity about which service owns which data.

**Files:**
- `backend/services/api-gateway/`
- Various microservice routes

**Acceptance Criteria:**
- [ ] Document service ownership matrix
- [ ] Gateway routes clearly defined
- [ ] No duplicate route handlers
- [ ] VM proof: each route goes to exactly one service

**Rollback Plan:**
N/A (documentation)

---

## MEDIUM TICKETS

### MED-001: AUD-071-A - Compliance page no backend
**Status:** PENDING
**Category:** Retailer

**Problem:**
CompliancePage.tsx exists with mock data. GET /retailer-admin/compliance not defined.

**Files:**
- `retailer-admin/src/pages/CompliancePage.tsx`

**Acceptance Criteria:**
- [ ] Implement GET /retailer-admin/compliance endpoint
- [ ] OR remove CompliancePage from navigation
- [ ] Page shows real data or clear "coming soon"

---

### MED-002: AUD-072-A - SuperAdmin Payments tab empty
**Status:** PENDING
**Category:** Admin

**Problem:**
Payments tab renders empty placeholder. No implementation.

**Files:**
- `supermandi-superadmin/src/App.tsx`

**Acceptance Criteria:**
- [ ] Implement Payments tab with real data
- [ ] OR hide tab until implemented
- [ ] Clear UX for unimplemented features

---

### MED-003: AUD-074-B - StockStatement shows supplier stock
**Status:** PENDING
**Category:** Inventory

**Problem:**
StockStatement reads supplier's stockQuantity, not store's actual inventory from stock_balances.

**Files:**
- `pos-app/src/screens/StockStatementScreen.tsx`
- `pos-app/src/services/api/catalogApi.ts`

**Acceptance Criteria:**
- [ ] StockStatement reads from inventory.stock_balances
- [ ] Shows actual store inventory, not supplier view

---

### MED-004: AUD-076-B - Demo seed endpoint 404
**Status:** PENDING
**Category:** API

**Problem:**
POST /api/v1/demo/seed called by frontend but returns 404.

**Files:**
- `pos-app/src/services/api/demoApi.ts:43`

**Acceptance Criteria:**
- [ ] Implement demo seed endpoint
- [ ] OR remove frontend calls

---

### MED-005: AUD-077-C - Two inventory systems
**Status:** PENDING
**Category:** Schema

**Problem:**
public.store_inventory (legacy) and inventory.inventory_ledger + stock_balances (new) co-exist. Different flows use different systems.

**Acceptance Criteria:**
- [ ] Consolidate to single inventory system
- [ ] Migration to move legacy data
- [ ] All flows use unified system

---

### MED-006: AUD-082-A - Bill ref collision creates duplicates
**Status:** PENDING
**Category:** Sync

**Problem:**
Bill ref retry generates new bill_ref for same saleId. Partial commit = two rows.

**Files:**
- `backend/src/routes/pos/sync.ts:312-355`

**Acceptance Criteria:**
- [ ] Bill ref generation deterministic from saleId
- [ ] No duplicate sale rows possible

---

### MED-007: AUD-082-B - Payment references wrong sale
**Status:** PENDING
**Category:** Sync

**Problem:**
PAYMENT_CASH can apply to OLD sale from previous sync if current batch's SALE_CREATED fails.

**Files:**
- `backend/src/routes/pos/sync.ts:577-614`

**Acceptance Criteria:**
- [ ] Payment validates sale exists in current batch
- [ ] OR transaction ensures atomicity

---

### MED-008: AUD-082-C - COLLECTION_CREATED dedup inconsistent
**Status:** PENDING
**Category:** Sync

**Problem:**
Other events use processed_events. COLLECTION checks collections table directly. Inconsistent dedup.

**Files:**
- `backend/src/routes/pos/sync.ts:615-642`

**Acceptance Criteria:**
- [ ] Unify dedup strategy for all event types
- [ ] Use processed_events consistently

---

### MED-009: AUD-082-D - Item qty defaults to 0
**Status:** PENDING
**Category:** Sync

**Problem:**
Math.round(null) = 0. Corrupted quantity creates zero-value sale.

**Files:**
- `backend/src/routes/pos/sync.ts:303-309`

**Acceptance Criteria:**
- [ ] Validate quantity > 0
- [ ] Reject events with invalid quantity

---

### MED-010: AUD-073-B - imageUrl always empty
**Status:** PENDING
**Category:** Products

**Problem:**
StoreProductResponse promises imageUrl but always returns ''.

**Acceptance Criteria:**
- [ ] Remove from type if not supported
- [ ] OR implement image upload

---

### MED-011: AUD-076-C - Admin health requires token
**Status:** PENDING
**Category:** API

**Problem:**
/admin/health returns 401. Inconsistent with /retailer-admin/health (200).

**Acceptance Criteria:**
- [ ] Health endpoints open for monitoring
- [ ] Consistent security posture

---

### MED-012: AUD-083-B - Dead backend endpoints
**Status:** PENDING
**Category:** API

**Problem:**
admin/globalProducts, analytics/dues, analytics/activity have no frontend callers.

**Acceptance Criteria:**
- [ ] Remove dead code
- [ ] OR document for future use

---

## LOW TICKETS

### LOW-001: AUD-070-A - SkuPickerModal dead code
### LOW-002: AUD-070-B - deprecated/PurchaseScreen orphaned
### LOW-003: AUD-075-A - storeId TEXT vs UUID
### LOW-004: AUD-076-D - Voice service mock mode
### LOW-005: AUD-075-B - reEnrolled flag not persisted

---

## IMPLEMENTATION ORDER

1. **CRIT-001 + CRIT-002 + CRIT-003** (batch atomicity + dedup lock + post-rollback) - all in sync.ts
2. **CRIT-004** (payment amount dedup) - sync.ts payments
3. **CRIT-005** (deadlock prevention) - inventoryLedgerService.ts
4. **HIGH-001 + HIGH-004** (variant/packSize) - related, fix together
5. **HIGH-005** (CHECK constraint) - migration
6. **HIGH-002** (supplier_id) - migration + API
7. **HIGH-003** (inventory route) - new route
8. **HIGH-006 + HIGH-009** (client outbox) - client-side
9. **HIGH-007 + HIGH-008** (heartbeat + timeout) - sync.ts
10. Continue with MEDIUM...

