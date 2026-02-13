# Screenwise Testing Backlog

> **Purpose**: Complete testing ticket backlog for Retailer Web + POS + SuperAdmin real-world screen testing.
> **Generated**: 2026-02-13
> **Source**: RWSM.md (16 screens) + CROSS_MATRICES.md (8 tri-flows)
> **Total Tickets**: 73
> **Companion**: `RELEASES/RWSM.md`, `RELEASES/CROSS_MATRICES.md`

---

## Ticket Taxonomy

| Prefix | Type | Count |
|--------|------|-------|
| `RW-SCREEN` | Retailer Web single screen test | 15 |
| `RW-FLOW` | Retailer Web end-to-end journey | 8 |
| `RW-POS` | Retailer Web ↔ POS consistency | 10 |
| `RW-SA` | Retailer Web ↔ SuperAdmin consistency | 12 |
| `RW-SA-POS` | Tri-flow consistency | 8 |
| `RW-API` | API contract / integration | 6 |
| `RW-DB` | Migrations / data integrity | 4 |
| `RW-UI` | UI/UX / responsive / a11y | 10 |
| **Total** | | **73** |

---

## Priority Order (release risk reduction)

1. Account disable / session revoke (SA → RW) — `RW-SA-001`
2. RBAC boundaries (SA → RW enforcement) — `RW-SA-002`
3. Feature flags / remote config — `RW-SA-003`
4. Pricing + taxes (SA/RW → POS → RW reports) — `RW-SA-POS-001`
5. Catalog/SKU mapping (SA → RW → POS) — `RW-SA-POS-004`
6. Inventory correctness (POS ↔ RW) — `RW-POS-001`
7. Refund/return policy enforcement — `RW-POS-008`
8. Reporting reconciliation (POS ↔ RW) — `RW-POS-005`

---

## SCREEN TICKETS (RW-SCREEN-001 to RW-SCREEN-015)

---

### RW-SCREEN-001: Login Page

**Screen:** S01 Login
**Role:** Public
**Route:** `/retailer/login`

**Preconditions:** Active store exists in DB, Firebase Auth configured

**Steps:**
1. Navigate to `/retailer/login` — page renders without errors
2. Enter valid 10-digit phone number → "Send OTP" button enables
3. Send OTP → Firebase sends SMS, loading spinner shown
4. Enter correct OTP → verify succeeds
5. Store selection list appears (if multi-store user)
6. Select store → redirect to `/s/:storeCode/`
7. **Negative:** Enter wrong OTP → error message, retry available
8. **Negative:** Enter unregistered phone → "not found" message with register link
9. **Negative:** Expired OTP → clear error, re-send available
10. **Edge:** Session timeout → redirect to login with message

**Expected:**
- Clean render (no console errors, no white flash)
- OTP flow completes in <10s
- Store selection shows correct store names
- Error messages are user-friendly (no stack traces)

**Evidence:** Screenshot of each step, console clean proof, network tab (no 500s)

**Result:** PASS / FAIL

---

### RW-SCREEN-002: Register Page

**Screen:** S02 Register
**Role:** Public
**Route:** `/retailer/register`

**Preconditions:** Firebase Auth configured, document upload endpoint available

**Steps:**
1. Navigate to `/retailer/register` — 5-step progress bar visible
2. **Phone step:** Enter phone → Send OTP → Verify OTP
3. **Business Details step:** Fill all required fields:
   - Business Name, Business Type (dropdown), GSTIN (15-char), Owner Name
   - Address Line 1, City, State (dropdown), Pincode (6-digit)
   - Terms checkbox
4. **Negative:** Invalid GSTIN format → inline validation error
5. **Negative:** Missing required field → submit blocked
6. **Document Upload step:** Upload PAN, GSTIN Certificate, Address Proof
7. **Negative:** Upload >5MB file → error message
8. **Negative:** Upload non-image/non-PDF → rejection
9. Submit application → success screen with application ID
10. **Resume flow:** Navigate back, enter same phone → resume from last step

**Expected:**
- 5-step flow completes without errors
- All validations fire client-side before API call
- Documents upload with progress indicator
- Success screen shows application ID

**Evidence:** Screenshot of each step, upload proof, success screen

**Result:** PASS / FAIL

---

### RW-SCREEN-003: Dashboard Page

**Screen:** S04 Dashboard
**Role:** Authenticated
**Route:** `/s/:storeCode/`

**Preconditions:** Active store with products + sales data

**Steps:**
1. Navigate to dashboard — shimmer skeletons shown during load
2. **Metrics cards:** Total Products, Total Stock Qty, Total Purchase Value, Total Sell Revenue — all populated
3. **Daily sales summary:** Total Sales, Total Bills, Average Bill, Items Sold, Payment Breakdown — populated
4. **Search bar:** Type product name → results appear (products, suppliers, barcodes)
5. **Categories section:** List appears, edit name works, hide/show toggles work
6. **Inventory table:** Paginated (20/page), columns correct, pagination controls work
7. **Quick actions:** "Add Products" → navigates to Products, "Export" → downloads file
8. **Empty state:** New store with no data → CTAs to add products shown
9. **Error state:** Disconnect network → graceful error message (not crash)
10. **Loading state:** Verify shimmer skeletons render correctly (no layout shift)

**Expected:**
- All 4 metric cards show accurate numbers
- Daily summary matches POS MenuScreen totals
- Search returns relevant results with <500ms debounce
- Pagination works (Next/Prev, page numbers)
- All states handled: loading, loaded, empty, error

**Evidence:** Screenshot of loaded state, empty state, error state, console clean

**Result:** PASS / FAIL

---

### RW-SCREEN-004: Products Page

**Screen:** S05 Products
**Role:** Authenticated
**Route:** `/s/:storeCode/products`

**Preconditions:** Store with 5+ products, multiple categories

**Steps:**
1. Navigate to Products — list loads with search + filters
2. **Search:** Type partial name → filtered results
3. **Category filter:** Select category → only matching products shown
4. **Supplier filter:** Select supplier → only their products shown
5. **Add product:** Open form, fill name/barcode/price/stock/category → save → appears in list
6. **Edit product:** Click product → edit price → save → updated in list
7. **Delete product:** Click delete → confirm → removed from list
8. **Negative:** Add product with duplicate barcode → error message
9. **Negative:** Price = 0 or negative → validation error
10. **Pagination:** Verify next/prev works with >20 products

**Expected:**
- CRUD operations complete without errors
- Filters combine correctly (search + category)
- Deletion is soft-delete (product hidden, not destroyed)

**Evidence:** Screenshot of list, add form, edit form, delete confirm, filter results

**Result:** PASS / FAIL

---

### RW-SCREEN-005: Inventory Page

**Screen:** S06 Inventory
**Role:** Authenticated
**Route:** `/s/:storeCode/inventory`

**Preconditions:** Store with ledger entries (INWARD + OUTWARD + ADJUSTMENT)

**Steps:**
1. Navigate to Inventory — ledger loads with entries
2. **Filter by type:** Select INWARD → only inward entries, OUTWARD → only outward
3. **Filter by date range:** Set start/end → entries within range
4. **Metrics:** SKU count, total entries, today's movements — all accurate
5. **Entry detail:** Each entry shows product, qty, type, reference, timestamp
6. **Empty state:** Clear filters that match nothing → empty state message
7. **Pagination:** Verify with >100 entries

**Expected:**
- Ledger entries match DB (no missing entries)
- Filters combine correctly
- Date range filter works with timezone (IST)

**Evidence:** Screenshot of ledger, filtered view, metrics

**Result:** PASS / FAIL

---

### RW-SCREEN-006: Suppliers Page

**Screen:** S07 Suppliers
**Role:** Authenticated
**Route:** `/s/:storeCode/suppliers`

**Preconditions:** Store with linked suppliers (verified + unverified)

**Steps:**
1. Navigate to Suppliers — list loads
2. **Search:** Type supplier name → filtered
3. **Add supplier:** Create local supplier with name/phone/GSTIN → appears in list
4. **Edit supplier:** Edit local supplier details → save → updated
5. **Delete supplier:** Remove supplier → confirm → removed
6. **Verification status:** Verified suppliers show badge, unverified don't
7. **View supplier products:** Click supplier → see their product list
8. **Negative:** Add supplier with invalid GSTIN → error

**Expected:**
- CRUD works for local suppliers
- Verified suppliers are read-only (can't edit externally verified)
- Search is responsive (<300ms)

**Evidence:** Screenshot of list, add form, verification badge

**Result:** PASS / FAIL

---

### RW-SCREEN-007: Supplier Catalog Page

**Screen:** S08 Supplier Catalog
**Role:** Authenticated
**Route:** `/s/:storeCode/supplier-catalog`

**Preconditions:** Verified suppliers with approved products exist

**Steps:**
1. Navigate to Supplier Catalog — grid loads with approved products
2. **Search:** Type product name → filtered results
3. **Add to store:** Click "Add" on product → confirm → product added to store catalog
4. **Already added:** Product shows "Already in store" badge
5. **Pagination:** Verify 50/page pagination works
6. **Empty state:** No approved suppliers → message shown

**Expected:**
- Only approved products from verified suppliers shown
- Adding product creates `store_products` entry
- No duplicates (can't add same product twice)

**Evidence:** Screenshot of grid, add action, already-added badge

**Result:** PASS / FAIL

---

### RW-SCREEN-008: Import Page (CSV)

**Screen:** S09 Import
**Role:** Authenticated
**Route:** `/s/:storeCode/import`

**Preconditions:** CSV template available, store ready for imports

**Steps:**
1. Navigate to Import — upload zone visible
2. **Download template:** Click template link → CSV downloads
3. **Upload valid CSV:** Drag-drop or file picker → validation starts
4. **Preview:** See validated rows + error rows (if any)
5. **Commit:** Click commit → async progress bar → completion
6. **Poll progress:** Progress updates in real-time
7. **Negative:** Upload >5MB → error message
8. **Negative:** Upload invalid format (e.g., .xlsx) → error
9. **Negative:** CSV with bad data (missing required fields) → validation errors shown
10. **Rate limit:** 11th upload in 1 hour → rate limit error

**Expected:**
- Full cycle: upload → validate → preview → commit → done
- Async commit with polling works
- Error rows clearly identified with reasons

**Evidence:** Screenshot of upload, preview, progress, completion

**Result:** PASS / FAIL

---

### RW-SCREEN-009: Compliance Page

**Screen:** S10 Compliance
**Role:** Authenticated
**Route:** `/s/:storeCode/compliance`

**Preconditions:** Store exists, compliance document types configured

**Steps:**
1. Navigate to Compliance — document grid loads
2. **Upload doc:** Upload GSTIN document → success
3. **View status:** Document shows "pending" status
4. **View rejection:** If rejected, reason displayed
5. **Delete doc:** Delete uploaded document → removed
6. **All types:** Verify all 6 types listed (GSTIN, FSSAI, Shop License, PAN, Trade License, Address Proof)
7. **Negative:** Upload non-image/non-PDF → error

**Expected:**
- Upload/delete cycle works
- Status reflects SA review (pending → approved/rejected)
- Rejection reasons displayed clearly

**Evidence:** Screenshot of grid, upload success, status badges

**Result:** PASS / FAIL

---

### RW-SCREEN-010: Settings Page

**Screen:** S11 Settings
**Role:** Authenticated
**Route:** `/s/:storeCode/settings`

**Preconditions:** Store with existing settings

**Steps:**
1. Navigate to Settings — form loads with current values
2. **Edit UPI VPA:** Change VPA → save → success toast
3. **Edit tax rate:** Change to 5% → save → success
4. **Edit store name:** Change → save → sidebar updates
5. **Edit operating hours:** Set new hours → save
6. **Edit receipt footer:** Set text (max 200 chars) → save
7. **Edit GST number:** Update → save
8. **Edit address/phone:** Update → save
9. **Negative:** Tax rate > 100 → validation error
10. **Negative:** Empty required fields → save blocked

**Expected:**
- All settings save and reload correctly
- Validation prevents invalid values
- Changes reflected immediately in sidebar/dashboard

**Evidence:** Screenshot of form before/after, save confirmation

**Result:** PASS / FAIL

---

### RW-SCREEN-011: Payments Page

**Screen:** S12 Payments
**Role:** Authenticated
**Route:** `/s/:storeCode/settings/payments`

**Preconditions:** Store exists

**Steps:**
1. Navigate to Payments — current UPI VPA shown (or empty)
2. **Set UPI VPA:** Enter valid VPA format → save → success
3. **Set bank account:** Enter account + IFSC → save
4. **Negative:** Invalid VPA format → validation error
5. **Remove UPI:** Delete VPA → confirm → removed

**Expected:**
- UPI VPA saves and is used by POS for payments
- Bank details save correctly

**Evidence:** Screenshot of form, save success

**Result:** PASS / FAIL

---

### RW-SCREEN-012: Device Activation Page

**Screen:** S13 Devices
**Role:** Authenticated
**Route:** `/s/:storeCode/devices`

**Preconditions:** POS app installed on device, enrollment code generated

**Steps:**
1. Navigate to Devices — device list loads (or empty)
2. **Enter code:** Input SM-XXXX-XX activation code → activate → device appears in list
3. **View device:** See fingerprint, model, app version, last seen
4. **Deactivate:** Toggle device inactive → POS blocked on next start
5. **Reactivate:** Toggle back → POS works again
6. **Negative:** Invalid code → error message
7. **Negative:** Already-used code → error message
8. **Empty state:** No devices → CTA to activate first device

**Expected:**
- Activation flow links POS device to store
- Device list shows real-time status
- Deactivation blocks POS within one heartbeat cycle

**Evidence:** Screenshot of empty state, activation, device list, deactivation

**Result:** PASS / FAIL

---

### RW-SCREEN-013: Supplier Queue Page (Admin)

**Screen:** S14 Supplier Queue
**Role:** Admin only
**Route:** `/s/:storeCode/admin/suppliers`

**Preconditions:** Pending suppliers exist, user has admin role

**Steps:**
1. Navigate to Supplier Queue — pending list loads
2. **Approve:** Click approve → supplier moves to verified
3. **Reject:** Click reject → enter reason → supplier rejected
4. **Empty state:** No pending suppliers → empty message
5. **RBAC:** Non-admin user → "Access Denied" shown
6. **Verify propagation:** Approved supplier appears in S07 Suppliers page

**Expected:**
- Queue shows only pending suppliers
- Approve/reject works with confirmation
- RBAC blocks non-admin users

**Evidence:** Screenshot of queue, approve action, RBAC block

**Result:** PASS / FAIL

---

### RW-SCREEN-014: Product Queue Page (Admin)

**Screen:** S15 Product Queue
**Role:** Admin only
**Route:** `/s/:storeCode/admin/products`

**Preconditions:** Pending products exist, user has admin role

**Steps:**
1. Navigate to Product Queue — pending list loads
2. **Edit before approve:** Change name, category, margin, BNPL eligibility → save
3. **Approve:** Click approve → product active in store catalog
4. **Reject:** Click reject → enter reason → product rejected
5. **RBAC:** Non-admin user → "Access Denied"
6. **Verify propagation:** Approved product appears in S05 Products and POS SellScan

**Expected:**
- Queue shows only pending products
- Edit-before-approve saves correctly
- Approved products immediately searchable

**Evidence:** Screenshot of queue, edit modal, approve action

**Result:** PASS / FAIL

---

### RW-SCREEN-015: Limited Mode (REG-AUTH-301)

**Screen:** All screens (limited mode state)
**Role:** User with non-ACTIVE status
**Route:** `/s/:storeCode/` (all routes)

**Preconditions:** User with pending/incomplete application

**Steps:**
1. Login as non-ACTIVE user → dashboard loads in limited mode
2. **Visible:** Dashboard, Settings, Devices only
3. **Hidden:** Products, Inventory, Suppliers, Supplier Catalog, Import, Compliance, Admin pages
4. **Banner:** Application status + pending items shown at top
5. **Direct URL:** Navigate to `/s/:storeCode/products` directly → redirected or blocked
6. **API guard:** Attempt API call to restricted endpoint → 403

**Expected:**
- Only 3 sidebar items visible
- Restricted routes blocked both client-side and server-side
- Banner clearly communicates what's needed

**Evidence:** Screenshot of limited sidebar, banner, blocked route

**Result:** PASS / FAIL

---

## FLOW TICKETS (RW-FLOW-001 to RW-FLOW-008)

---

### RW-FLOW-001: New Retailer Onboarding (End-to-End)

**Journey:** Register → SA Approve → First Login → Dashboard → Add Products → Activate Device

**Steps:**
1. Register new retailer (S02) with valid phone + business details + KYC docs
2. In SA: Applications tab → find application → approve
3. Login to RW with registered phone → OTP → store appears
4. Dashboard loads (empty state — no products yet)
5. Add first product via Products page (S05)
6. Verify product appears in dashboard inventory
7. Activate POS device via Devices page (S13)

**Expected:** Complete flow from zero to operational store in <15 minutes

**Evidence:** Screenshots at each stage, application ID, store code

**Result:** PASS / FAIL

---

### RW-FLOW-002: CSV Import → Verify in Dashboard

**Journey:** Download Template → Fill → Upload → Validate → Commit → Dashboard Updated

**Steps:**
1. Download CSV template (S09)
2. Fill with 10 products (varied categories, prices)
3. Upload → validate → preview (no errors)
4. Commit → poll progress → complete
5. Navigate to Dashboard (S04) → metrics updated (Total Products += 10)
6. Navigate to Products (S05) → all 10 products visible
7. Search for imported product → found

**Expected:** All 10 products imported, immediately visible everywhere

**Evidence:** CSV file, preview screenshot, dashboard before/after

**Result:** PASS / FAIL

---

### RW-FLOW-003: Supplier Onboarding → Catalog → Store Products

**Journey:** Add Supplier → Link → Browse Catalog → Add Product → Verify in Products

**Steps:**
1. Add local supplier (S07) with name + GSTIN
2. Browse Supplier Catalog (S08) → search for approved products
3. Add product from catalog to store
4. Navigate to Products (S05) → product appears with supplier attribution
5. Verify product is searchable via Dashboard search (S04)

**Expected:** Supplier → catalog → store product pipeline works end-to-end

**Evidence:** Screenshots at each step

**Result:** PASS / FAIL

---

### RW-FLOW-004: Settings Change → POS Impact

**Journey:** Change UPI VPA in Settings → Verify POS uses new VPA

**Steps:**
1. Note current UPI VPA in Settings (S11)
2. Change UPI VPA to new value → save
3. On POS: initiate UPI payment → verify new VPA is used
4. Change tax rate in Settings → save
5. On POS: create sale → verify tax calculated with new rate

**Expected:** Settings changes propagate to POS within one refresh cycle

**Evidence:** RW settings screenshot, POS payment screenshot showing new VPA

**Result:** PASS / FAIL

---

### RW-FLOW-005: Product Price Change → POS Checkout

**Journey:** Edit product price in RW → POS uses new price

**Steps:**
1. In Products (S05): note current price of product X
2. Edit product X price → save
3. On POS: force app resume (background → foreground)
4. Scan product X → verify new price in cart
5. Complete sale → verify receipt shows new price

**Expected:** Price change propagates after POS cache refresh

**Evidence:** RW product edit screenshot, POS cart screenshot with new price

**Result:** PASS / FAIL

---

### RW-FLOW-006: Compliance Upload → SA Review → Status Update

**Journey:** Upload Document → SA Reviews → Status Reflected in RW

**Steps:**
1. Upload GSTIN certificate in Compliance (S10) → status "pending"
2. In SA: Documents tab → find document → approve
3. Refresh RW Compliance → status "approved"
4. Repeat with rejection: upload PAN → SA rejects with reason
5. RW Compliance → status "rejected", reason shown

**Expected:** SA review status propagates immediately to RW

**Evidence:** Screenshots before/after SA action, rejection reason visible

**Result:** PASS / FAIL

---

### RW-FLOW-007: Admin Approval Queue → Catalog Impact

**Journey:** Supplier submits product → SA/RW Admin approves → Product in catalog

**Steps:**
1. (Pre-req: supplier submits product via Supplier Portal)
2. In SA: Suppliers → Pending Products → product visible
3. In RW: Product Queue (S15) → product visible
4. Edit margin/BNPL settings → approve
5. Product appears in Supplier Catalog (S08)
6. Add product to store → appears in Products (S05)
7. On POS: product scannable

**Expected:** Dual approval path works (SA or RW admin can approve)

**Evidence:** Screenshots of queue, approval, catalog appearance

**Result:** PASS / FAIL

---

### RW-FLOW-008: Store Setup → Staff → Catalog → Sell → Reports

**Journey:** Complete store lifecycle (SA setup to first sale to reports)

**Steps:**
1. SA creates store → enrollment code generated
2. RW: first login → limited mode → SA approves → full access
3. RW: add products (bulk CSV import)
4. RW: activate POS device
5. SA: create staff (CASHIER role)
6. POS: staff login → scan product → checkout (cash) → receipt
7. RW: Dashboard daily summary shows sale
8. SA: Analytics shows same sale data

**Expected:** Full lifecycle completes with data consistency across all 3 systems

**Evidence:** Screenshots at each stage across all 3 portals

**Result:** PASS / FAIL

---

## CROSS TICKETS: RW ↔ POS (RW-POS-001 to RW-POS-010)

---

### RW-POS-001: Inventory Stock Sync After POS Sale

**Domain:** Inventory
**Source of Truth:** DB `inventory.stock_qty`
**Propagation:** Real-time (immediate on sale POST)

**Steps:**
1. In RW Dashboard (S04): note stock qty for product X
2. On POS: sell 3 units of product X (cash payment)
3. In RW Dashboard: refresh → stock qty = original - 3
4. In RW Inventory (S06): new OUTWARD entry visible for product X, qty=3
5. On POS StockStatement: verify same reduced stock

**Expected:**
- RW stock = POS stock (exact match)
- Ledger OUTWARD entry with correct qty, timestamp, reference

**Evidence:** RW dashboard before/after, POS receipt, RW ledger entry

**Result:** PASS / FAIL

---

### RW-POS-002: Inventory Stock Sync After POS Manual Inward

**Domain:** Inventory
**Source of Truth:** DB `ledger_entries`
**Propagation:** Real-time

**Steps:**
1. Note stock of product Y in RW and POS
2. On POS InwardScreen: scan product Y, enter qty=10, cost=50, select supplier → submit
3. RW Dashboard: refresh → stock += 10
4. RW Inventory (S06): INWARD entry visible with qty=10, cost=50, supplier name

**Expected:**
- Stock increased by exactly 10
- Ledger entry matches POS input

**Evidence:** POS inward screenshot, RW ledger entry

**Result:** PASS / FAIL

---

### RW-POS-003: Inventory Stock Sync After POS GRN

**Domain:** Inventory + Purchase Orders
**Source of Truth:** DB `ledger_entries` + `purchase_orders`
**Propagation:** Real-time

**Steps:**
1. Create PO on POS (or via reorder)
2. On POS GRNScreen: receive all items → submit
3. RW Inventory (S06): INWARD entry from GRN visible
4. PO status in DB updated to "delivered"

**Expected:**
- GRN creates ledger entries matching received quantities
- PO status transitions correctly

**Evidence:** POS GRN screenshot, RW ledger entry, PO status

**Result:** PASS / FAIL

---

### RW-POS-004: Product Add in RW → POS Scannable

**Domain:** Catalog
**Source of Truth:** DB `store_products`
**Propagation:** POS cache refresh on app resume

**Steps:**
1. In RW Products (S05): add new product with barcode "1234567890123"
2. On POS: force app resume (background → foreground)
3. On POS SellScanScreen: scan barcode "1234567890123" → product found with correct name/price
4. Add to cart → correct price shown

**Expected:**
- New product scannable in POS after cache refresh
- Name, price, category match RW

**Evidence:** RW product add screenshot, POS scan result

**Result:** PASS / FAIL

---

### RW-POS-005: Daily Sales Reconciliation

**Domain:** Reports
**Source of Truth:** DB aggregation
**Propagation:** On page load

**Steps:**
1. On POS: complete 5 sales (mix of Cash + UPI)
2. In RW Dashboard (S04): check daily summary:
   - Total Sales amount = sum of 5 POS sale amounts
   - Total Bills = 5
   - Payment breakdown: Cash total matches, UPI total matches
3. On POS MenuScreen: daily summary → same totals

**Expected:**
- RW daily summary = POS daily summary (exact match for same date)
- Payment method breakdown consistent

**Evidence:** POS 5 receipts, RW daily summary screenshot, POS menu screenshot

**Result:** PASS / FAIL

---

### RW-POS-006: Price Change in RW → POS Checkout

**Domain:** Pricing
**Source of Truth:** DB `store_products.selling_price`
**Propagation:** POS cache refresh

**Steps:**
1. In RW Products (S05): change price of product X from ₹100 to ₹120
2. On POS: force cache refresh (app resume)
3. Scan product X → cart shows ₹120 (not ₹100)
4. Complete sale → receipt shows ₹120

**Expected:** Price change reflected in POS after refresh

**Evidence:** RW price edit, POS cart screenshot, POS receipt

**Result:** PASS / FAIL

---

### RW-POS-007: Device Activation / Deactivation

**Domain:** Devices
**Source of Truth:** DB `devices`
**Propagation:** Real-time

**Steps:**
1. In RW Devices (S13): deactivate a device
2. On POS (that device): attempt any action → blocked/error
3. In RW Devices: reactivate the device
4. On POS: restart app → operational again

**Expected:**
- Deactivation blocks POS within one heartbeat
- Reactivation restores POS after restart

**Evidence:** RW device status toggle, POS blocked/unblocked screenshots

**Result:** PASS / FAIL

---

### RW-POS-008: POS Offline Sale → RW Sync

**Domain:** Sales (offline)
**Source of Truth:** POS outbox → DB
**Propagation:** 5-10 minutes after connectivity restored

**Steps:**
1. On POS: disable network (airplane mode)
2. Complete cash sale → sale queued in outbox
3. Re-enable network → outbox syncs
4. In RW Dashboard: refresh → sale appears in daily summary
5. In RW Inventory: OUTWARD entry for sold items appears

**Expected:**
- Offline sale syncs within 10 minutes
- All data correct (amount, items, timestamp)

**Evidence:** POS offline indicator, POS outbox count, RW post-sync data

**Result:** PASS / FAIL

---

### RW-POS-009: Category Sync

**Domain:** Categories
**Source of Truth:** DB `store_categories`
**Propagation:** Shared DB table

**Steps:**
1. In RW Dashboard (S04): rename category "Snacks" → "Snacks & Chips"
2. On POS BuyScreen: category rail shows "Snacks & Chips"
3. In RW Dashboard: hide category "Beverages"
4. On POS: verify "Beverages" still visible (POS may not respect hide) OR hidden

**Expected:**
- Category rename reflected in POS
- Hide behavior documented (may differ between RW/POS)

**Evidence:** RW category edit, POS category rail screenshot

**Result:** PASS / FAIL

---

### RW-POS-010: Barcode Search Consistency

**Domain:** Product lookup
**Source of Truth:** DB `product_barcodes`

**Steps:**
1. In RW Dashboard search (S04): search barcode "1234567890123" → product found
2. On POS SellScanScreen: scan same barcode → same product found
3. Verify: name, price, category match between RW and POS results

**Expected:** Barcode → product resolution identical in both systems

**Evidence:** RW search result, POS scan result side-by-side

**Result:** PASS / FAIL

---

## CROSS TICKETS: RW ↔ SA (RW-SA-001 to RW-SA-012)

---

### RW-SA-001: Store Suspend → RW Access Blocked

**Domain:** Store lifecycle
**Source of Truth:** DB `stores.status`
**Propagation:** Immediate (JWT invalidation)

**Steps:**
1. Verify RW is accessible (dashboard loads)
2. In SA: Stores → suspend the store
3. In RW: refresh page → 401 / forced logout
4. Attempt login → fails (store suspended)
5. In SA: reactivate store
6. In RW: login succeeds → dashboard loads

**Expected:**
- Suspend = immediate RW lockout
- Reactivate = immediate RW access restored
- No stale session can bypass suspension

**Evidence:** SA status change screenshot, RW blocked screenshot, RW restored screenshot

**Result:** PASS / FAIL

---

### RW-SA-002: User Status Change → RW Login Blocked

**Domain:** User access
**Source of Truth:** DB `users.status`
**Propagation:** On next login attempt

**Steps:**
1. In SA: Users → change user status to "inactive"
2. In RW: attempt login with that user → blocked
3. In SA: change status to "suspended"
4. In RW: attempt login → blocked with different message
5. In SA: change status back to "active"
6. In RW: login succeeds

**Expected:**
- Inactive/suspended users cannot login
- Active users can login
- Error messages distinguish inactive vs suspended

**Evidence:** SA user status changes, RW login error screenshots

**Result:** PASS / FAIL

---

### RW-SA-003: Feature Flag Kill → RW Screen Gating

**Domain:** Feature flags
**Source of Truth:** DB `feature_flags`
**Propagation:** On next page load

**Steps:**
1. In SA: Settings → disable a feature flag (e.g., supplier catalog)
2. In RW: refresh → Supplier Catalog nav item hidden OR page blocked
3. In SA: re-enable flag
4. In RW: refresh → Supplier Catalog accessible again

**Expected:**
- Feature flag kill removes functionality from RW
- Re-enable restores functionality

**Evidence:** SA flag toggle, RW sidebar before/after

**Result:** PASS / FAIL

---

### RW-SA-004: Per-Store Feature Override

**Domain:** Feature flags (per-store)
**Source of Truth:** DB `store_feature_overrides`
**Propagation:** On next page load

**Steps:**
1. In SA: Stores → select store → override flag (disable one feature for this store only)
2. In RW (that store): refresh → feature hidden
3. In RW (different store): same feature still visible (not affected by per-store override)
4. In SA: remove override → store gets global setting back

**Expected:**
- Per-store overrides affect only the targeted store
- Other stores unaffected
- Override removal restores global behavior

**Evidence:** SA per-store flag, RW screenshots from 2 different stores

**Result:** PASS / FAIL

---

### RW-SA-005: Payment Method Control

**Domain:** Payment methods
**Source of Truth:** DB `stores.allowed_payment_methods`
**Propagation:** On next POS refresh

**Steps:**
1. In SA: Stores → set payment methods to [CASH, DUE] (remove UPI)
2. On POS: refresh → UPI option hidden in PaymentScreen
3. In RW Payments (S12): UPI VPA setting still visible but note about disabled method
4. In SA: re-add UPI → POS shows UPI option again

**Expected:**
- SA controls which payment methods POS offers
- Removing UPI hides it from POS checkout

**Evidence:** SA payment config, POS checkout screenshot (no UPI)

**Result:** PASS / FAIL

---

### RW-SA-006: Application Approval → RW Full Access

**Domain:** Registration / onboarding
**Source of Truth:** DB `auth.applications`
**Propagation:** Immediate

**Steps:**
1. Complete registration (S02) → application status = KYC_SUBMITTED
2. Login to RW → limited mode (Dashboard + Settings + Devices only)
3. In SA: Applications → approve
4. In RW: refresh → full mode (all sidebar items visible)

**Expected:**
- Limited mode enforced until SA approval
- Approval unlocks all features immediately

**Evidence:** RW limited mode screenshot, SA approval, RW full mode screenshot

**Result:** PASS / FAIL

---

### RW-SA-007: Document Review → RW Status

**Domain:** Compliance documents
**Source of Truth:** DB `compliance_documents`
**Propagation:** Immediate

**Steps:**
1. Upload document in RW Compliance (S10) → "pending"
2. In SA: Documents → approve → RW shows "approved"
3. Upload another → SA rejects with reason → RW shows "rejected" with reason

**Expected:** SA review reflected immediately in RW

**Evidence:** SA approval/rejection, RW status screenshots

**Result:** PASS / FAIL

---

### RW-SA-008: Supplier Verification → RW Catalog Access

**Domain:** Supplier governance
**Source of Truth:** DB `suppliers.verified`
**Propagation:** Immediate

**Steps:**
1. In SA: Suppliers → verify a pending supplier
2. In RW Suppliers (S07): supplier now shows verified badge
3. In RW Supplier Catalog (S08): supplier's products now browsable
4. In SA: suspend the supplier
5. In RW: supplier hidden from Suppliers and Catalog

**Expected:**
- Verified suppliers and their products accessible in RW
- Suspended suppliers hidden

**Evidence:** SA verification, RW supplier list, RW catalog

**Result:** PASS / FAIL

---

### RW-SA-009: Product Approval → RW Listing

**Domain:** Catalog governance
**Source of Truth:** DB `products.status`
**Propagation:** Immediate

**Steps:**
1. In SA: Suppliers → approve pending product (set margin, BNPL)
2. In RW Supplier Catalog (S08): product appears
3. Add to store → RW Products (S05) shows it
4. In SA: edit product margin
5. In RW: product margin updated

**Expected:** SA product governance propagates to RW immediately

**Evidence:** SA approval, RW catalog, RW product detail

**Result:** PASS / FAIL

---

### RW-SA-010: Staff Management → POS Impact

**Domain:** Staff / POS access
**Source of Truth:** DB `store_staff`
**Propagation:** Immediate (PIN) / On restart (active status)

**Steps:**
1. In SA: Staff → create staff (CASHIER role, PIN 1234)
2. On POS: staff login with PIN 1234 → success, sell-only permissions
3. In SA: disable staff member
4. On POS: restart → staff login with PIN 1234 → blocked
5. In SA: reset staff PIN to 5678
6. On POS: restart → login with 5678 → success

**Expected:**
- Staff creation enables POS access
- Staff disable blocks POS access
- PIN reset works (old PIN invalid, new PIN works)

**Evidence:** SA staff actions, POS login success/failure screenshots

**Result:** PASS / FAIL

---

### RW-SA-011: Device Management from SA

**Domain:** Devices
**Source of Truth:** DB `devices`
**Propagation:** On next heartbeat (config) / Immediate (reset)

**Steps:**
1. In SA: Devices → find device → edit label → save
2. In RW Devices (S13): device label updated
3. In SA: Devices → change printing mode
4. On POS: next receipt uses new printing mode
5. In SA: Devices → reset device
6. On POS: device goes offline, requires re-enrollment

**Expected:**
- SA device config changes propagate to RW and POS
- Reset wipes device, requires re-enrollment

**Evidence:** SA device config, RW device list, POS behavior

**Result:** PASS / FAIL

---

### RW-SA-012: Audit Log Verification

**Domain:** Audit trail
**Source of Truth:** DB `audit_logs`

**Steps:**
1. Perform actions in RW: edit settings, add product, upload document
2. In SA: Audit tab → filter by store → verify entries exist for each RW action
3. Verify each log entry has: timestamp, action, resource_type, actor, IP

**Expected:**
- Every RW write action produces an audit log entry
- Logs queryable by store, action, date

**Evidence:** RW actions list, SA audit log screenshots

**Result:** PASS / FAIL

---

## TRI-FLOW TICKETS (RW-SA-POS-001 to RW-SA-POS-008)

---

### RW-SA-POS-001: Pricing + Tax → POS Checkout → RW Reports → SA Analytics

**Steps:**
1. SA: verify product margin is 20%
2. RW Settings (S11): set tax rate = 5%
3. POS: sell product → receipt shows price with margin + 5% tax
4. RW Dashboard: daily summary includes correct revenue (margin + tax)
5. SA Analytics: Consumer Sales → same revenue figure

**Expected:** Price = (base + margin) + tax. Consistent across all 3 systems.

**Evidence:** SA product margin, RW tax setting, POS receipt, RW summary, SA analytics

**Result:** PASS / FAIL

---

### RW-SA-POS-002: Feature Flag Kill → POS Tab Hidden → RW Page Hidden

**Steps:**
1. SA Settings: disable "buy" feature flag
2. POS: Purchase tab hidden / blocked
3. RW: Supplier Catalog page hidden / blocked (if gated by same flag)
4. SA: re-enable "buy" flag
5. Both POS and RW: feature restored

**Expected:** Single SA kill switch affects both POS and RW simultaneously

**Evidence:** SA flag toggle, POS before/after, RW before/after

**Result:** PASS / FAIL

---

### RW-SA-POS-003: Store Suspend → POS Offline → RW Blocked

**Steps:**
1. Verify both POS and RW are operational
2. SA: suspend store
3. POS: next action → blocked (JWT fails)
4. RW: refresh → forced logout
5. SA: reactivate
6. Both POS and RW: operational again

**Expected:** Store suspend blocks both clients immediately

**Evidence:** SA suspend, POS blocked, RW blocked, both restored

**Result:** PASS / FAIL

---

### RW-SA-POS-004: Catalog Approval → RW Listing → POS Scan

**Steps:**
1. SA: approve supplier product (set margin, BNPL)
2. RW Supplier Catalog (S08): product visible → add to store
3. POS: scan product barcode → product found, correct price
4. POS: sell product → receipt correct

**Expected:** SA approve → RW catalog → POS scannable + sellable

**Evidence:** SA approval, RW catalog add, POS scan + sale

**Result:** PASS / FAIL

---

### RW-SA-POS-005: Payment Method Control → POS Checkout → RW Reports

**Steps:**
1. SA: set payment methods = [CASH, DUE] (remove UPI)
2. POS: checkout → only Cash and Due available (no UPI)
3. Complete 3 cash sales
4. RW Dashboard: payment breakdown shows CASH only, no UPI
5. SA Analytics: same breakdown

**Expected:** SA payment restriction → POS enforces → RW/SA reports reflect

**Evidence:** SA config, POS checkout, RW breakdown, SA analytics

**Result:** PASS / FAIL

---

### RW-SA-POS-006: Supplier Suspend → RW Hidden → POS Can't Buy

**Steps:**
1. SA: suspend supplier
2. RW Suppliers (S07): supplier hidden
3. RW Supplier Catalog (S08): supplier's products hidden
4. POS PurchaseScreen: supplier's products not in buy catalog
5. SA: reactivate supplier → all restored

**Expected:** Supplier governance flows through all 3 systems

**Evidence:** SA suspend, RW hidden, POS hidden, all restored

**Result:** PASS / FAIL

---

### RW-SA-POS-007: Staff Role → POS Permissions → SA Audit

**Steps:**
1. SA: create staff with CASHIER role
2. POS: staff logs in → can sell, CANNOT stock-in
3. POS: attempt stock-in → blocked
4. SA: change role to STOCK_MANAGER
5. POS: restart → stock-in now works
6. SA Audit: verify role change logged

**Expected:** SA role → POS enforces → SA audit captures

**Evidence:** SA staff role, POS permission block, POS permission grant, SA audit log

**Result:** PASS / FAIL

---

### RW-SA-POS-008: Inventory Reconciliation (All 3 Systems)

**Steps:**
1. Note stock of product X in all 3 systems
2. POS: sell 5 units
3. RW: stock reduced by 5
4. SA Analytics: units_sold += 5
5. POS: manual inward 10 units
6. RW: stock increased by 10
7. SA Analytics: purchase data updated

**Expected:**
- Final stock = original - 5 + 10 = original + 5
- All 3 systems show same stock level

**Evidence:** Before/after stock in RW, POS, SA — must all match

**Result:** PASS / FAIL

---

## API TICKETS (RW-API-001 to RW-API-006)

---

### RW-API-001: Auth Endpoints Error Handling

**Steps:**
1. `POST /auth/firebase-otp-login` with invalid Firebase token → 401
2. `POST /auth/firebase-otp-login` with expired token → 401 with TOKEN_EXPIRED
3. `POST /auth/refresh` with invalid refresh token → 401
4. `GET /auth/me` without token → 401 UNAUTHORIZED
5. Any endpoint with malformed JSON body → 400 (not 500)

**Expected:** All error responses have `{error: {code, message}}` format. No 500s for client errors.

**Evidence:** curl/API responses for each case

**Result:** PASS / FAIL

---

### RW-API-002: Store Isolation Enforcement

**Steps:**
1. Login as Store A user → get token
2. Attempt to access Store B's inventory (`GET /inventory` with Store A token) → only Store A data returned
3. Attempt to PATCH Store B's settings → 403 or filtered to own store
4. Attempt to delete Store B's product → 403 or not found
5. Inject `x-actor-id: storeB` header manually → backend ignores (uses JWT claim)

**Expected:** Store A can NEVER see/modify Store B's data, regardless of header manipulation

**Evidence:** API responses showing isolation

**Result:** PASS / FAIL

---

### RW-API-003: Rate Limiting

**Steps:**
1. `POST /products/import/upload` — 10 times → all succeed
2. 11th upload → 429 Too Many Requests
3. Auth endpoints: 30 attempts in 15 min → rate limited
4. Verify rate limit headers in response (X-RateLimit-Remaining, etc.)

**Expected:** Rate limits enforced per spec (10/hour imports, 30/15min auth)

**Evidence:** API response showing 429, rate limit headers

**Result:** PASS / FAIL

---

### RW-API-004: CSV Import Idempotency

**Steps:**
1. Upload CSV with 10 products → validate → commit
2. Re-upload same CSV → validate → commit
3. Verify no duplicate products created (idempotent by barcode)
4. Verify commit returns correct imported/skipped counts

**Expected:** Duplicate barcodes are skipped, not duplicated

**Evidence:** API response with imported/skipped counts, product list showing no duplicates

**Result:** PASS / FAIL

---

### RW-API-005: Pagination Correctness

**Steps:**
1. Create 100+ products
2. `GET /inventory?limit=20&offset=0` → 20 results + pagination metadata
3. `GET /inventory?limit=20&offset=20` → next 20 results (no overlap)
4. Page through all results → total matches count header
5. `GET /supplier-catalog?limit=50&offset=0` → 50 results

**Expected:** Pagination returns complete, non-overlapping result sets

**Evidence:** API responses showing page boundaries, total count

**Result:** PASS / FAIL

---

### RW-API-006: Input Validation Boundaries

**Steps:**
1. Product name with 201 chars → 400 (max 200)
2. Price = -1 → 400
3. Price = 10000000001 (>1B paise) → 400
4. Opening stock = 1000001 (>1M) → 400
5. Search query with 101 chars → 400 (max 100)
6. Receipt footer with 201 chars → 400 (max 200)
7. GSTIN with 14 chars → 400 (must be 15)
8. Phone with 9 digits → 400 (must be 10-13)

**Expected:** All validation boundaries enforced server-side (not just client-side)

**Evidence:** API 400 responses with clear error messages

**Result:** PASS / FAIL

---

## DB TICKETS (RW-DB-001 to RW-DB-004)

---

### RW-DB-001: Migration Clean Apply

**Steps:**
1. Drop all tables (fresh DB)
2. Run all migrations sequentially → all succeed (no errors)
3. Verify all expected tables exist
4. Verify all expected indexes exist
5. Verify seed data populated (document types, default configs)

**Expected:** Migrations apply cleanly from zero with no errors

**Evidence:** Migration output log, table list

**Result:** PASS / FAIL

---

### RW-DB-002: Store Isolation in DB

**Steps:**
1. SQL: `SELECT * FROM store_products WHERE store_id = 'storeA'` → only storeA products
2. SQL: `SELECT * FROM ledger_entries WHERE store_id = 'storeA'` → only storeA entries
3. Verify all retail tables have `store_id` column with FK or filter
4. Verify no cross-store leakage possible via direct SQL

**Expected:** Every retail data table is store-isolated

**Evidence:** SQL query results showing isolation

**Result:** PASS / FAIL

---

### RW-DB-003: Data Integrity Constraints

**Steps:**
1. Attempt INSERT product with NULL store_id → constraint violation
2. Attempt INSERT ledger with negative qty → check if constrained
3. Attempt INSERT duplicate barcode for same store → unique constraint
4. Attempt DELETE store with active products → FK or soft-delete behavior

**Expected:** DB constraints prevent data corruption

**Evidence:** SQL constraint error messages

**Result:** PASS / FAIL

---

### RW-DB-004: Compliance Document Types Seed

**Steps:**
1. SQL: `SELECT * FROM document_types` → verify all 6 types exist
2. Verify required flag correct (GSTIN=required, FSSAI=optional, etc.)
3. Verify application document types match frontend list

**Expected:** Seed data matches frontend configuration

**Evidence:** SQL output

**Result:** PASS / FAIL

---

## UI TICKETS (RW-UI-001 to RW-UI-010)

---

### RW-UI-001: Login Page — Loading/Error/Empty States

**Steps:**
1. **Loading:** OTP send → spinner visible
2. **Error:** Wrong OTP → clear, actionable error message (red text, retry available)
3. **Empty:** No stores for user → appropriate message
4. **Console:** No errors, no warnings, no React key errors
5. **Network:** No failed requests visible (except expected 4xx)

**Expected:** All 4 states handled gracefully. No white flash on mount.

**Evidence:** Screenshot of each state, console clean proof

**Result:** PASS / FAIL

---

### RW-UI-002: Dashboard — Shimmer Skeletons

**Steps:**
1. Throttle network to Slow 3G
2. Load dashboard → shimmer skeletons render during load
3. Data loads → skeletons replaced with real data (no layout shift)
4. All 4 metric cards show skeletons → then real numbers
5. Inventory table shows skeleton rows → then real rows

**Expected:** Smooth loading experience with no content jump

**Evidence:** Screenshot of shimmer state, loaded state

**Result:** PASS / FAIL

---

### RW-UI-003: Responsive Layout — Dashboard

**Steps:**
1. View dashboard at 1920px (desktop) → 4-column grid
2. View at 1024px (tablet) → grid adjusts (2-3 columns)
3. View at 768px → stacked layout
4. View at 375px (mobile) → single column, all content accessible
5. Sidebar collapses on mobile

**Expected:** Functional at all breakpoints, no horizontal scroll

**Evidence:** Screenshots at 4 breakpoints

**Result:** PASS / FAIL

---

### RW-UI-004: Form Validation UX — Register Page

**Steps:**
1. Submit with empty required fields → inline errors below each field
2. Enter invalid GSTIN → inline error appears immediately (or on blur)
3. Enter valid GSTIN → error clears
4. Tab through fields → focus states visible
5. Error messages are descriptive (not just "required")

**Expected:** Real-time validation, clear error messages, accessible

**Evidence:** Screenshot of validation errors, field focus states

**Result:** PASS / FAIL

---

### RW-UI-005: Navigation — Active State & Breadcrumb

**Steps:**
1. Click each sidebar item → active state highlighted
2. Navigate to Settings > Payments → breadcrumb or back navigation works
3. Navigate via direct URL → correct sidebar item highlighted
4. Browser back/forward → correct page loads

**Expected:** Navigation state always consistent with current route

**Evidence:** Screenshots of active states for 5+ routes

**Result:** PASS / FAIL

---

### RW-UI-006: Modal/Dialog UX — Product Edit

**Steps:**
1. Open product edit modal → form pre-filled with current values
2. Edit values → close without saving → confirm dialog ("Unsave changes?")
3. Save → modal closes, list updated
4. Escape key → modal closes
5. Click outside modal → modal closes (or stays, by design)

**Expected:** Modal behaves consistently with standard UX patterns

**Evidence:** Screenshot of modal open, close confirm

**Result:** PASS / FAIL

---

### RW-UI-007: Pagination Controls — Inventory Table

**Steps:**
1. >100 entries → pagination visible
2. Click "Next" → next page loads, smooth transition
3. Click "Previous" → previous page
4. Page indicator shows current/total
5. First page: "Previous" disabled
6. Last page: "Next" disabled
7. Change page → scroll to top of table

**Expected:** Pagination is functional and accessible

**Evidence:** Screenshots of pagination states

**Result:** PASS / FAIL

---

### RW-UI-008: Empty States — All Screens

**Steps:**
1. New store (no data) → visit each screen:
   - Dashboard: CTA to add products
   - Products: CTA to add first product
   - Inventory: "No entries" message
   - Suppliers: CTA to add supplier
   - Supplier Catalog: "No approved products" message
   - Compliance: "Upload your documents" message
   - Devices: CTA to activate first device
2. Each empty state has actionable CTA or helpful message

**Expected:** No blank screens. Every empty state guides the user.

**Evidence:** Screenshots of all 7 empty states

**Result:** PASS / FAIL

---

### RW-UI-009: Error Boundaries — Network Failure

**Steps:**
1. Load dashboard → disconnect network → refresh → error message (not white screen)
2. Reconnect → retry button works → data loads
3. Mid-form submit → network fails → error toast, form data preserved
4. Verify no data loss on network interruption

**Expected:** Graceful degradation, no crashes, no data loss

**Evidence:** Screenshots of error states, retry success

**Result:** PASS / FAIL

---

### RW-UI-010: Console Cleanliness

**Steps:**
1. Open Chrome DevTools Console
2. Navigate through all 12 protected screens
3. Check for: React warnings, key errors, unhandled rejections, 500 errors
4. Perform CRUD actions (add product, edit settings, upload doc)
5. Final console should be clean (only expected info logs)

**Expected:** Zero React warnings, zero unhandled errors, zero 500s

**Evidence:** Console screenshot after full navigation

**Result:** PASS / FAIL

---

## Execution Tracker

| Ticket | Priority | Status | Evidence | Notes |
|--------|----------|--------|----------|-------|
| **SCREEN TICKETS** | | | | |
| RW-SCREEN-001 (Login) | P1 | PENDING | — | |
| RW-SCREEN-002 (Register) | P1 | PENDING | — | |
| RW-SCREEN-003 (Dashboard) | P1 | PENDING | — | |
| RW-SCREEN-004 (Products) | P1 | PENDING | — | |
| RW-SCREEN-005 (Inventory) | P1 | PENDING | — | |
| RW-SCREEN-006 (Suppliers) | P2 | PENDING | — | |
| RW-SCREEN-007 (Supplier Catalog) | P2 | PENDING | — | |
| RW-SCREEN-008 (Import CSV) | P2 | PENDING | — | |
| RW-SCREEN-009 (Compliance) | P2 | PENDING | — | |
| RW-SCREEN-010 (Settings) | P1 | PENDING | — | |
| RW-SCREEN-011 (Payments) | P1 | PENDING | — | |
| RW-SCREEN-012 (Devices) | P1 | PENDING | — | |
| RW-SCREEN-013 (Supplier Queue) | P2 | PENDING | — | |
| RW-SCREEN-014 (Product Queue) | P2 | PENDING | — | |
| RW-SCREEN-015 (Limited Mode) | P1 | PENDING | — | |
| **FLOW TICKETS** | | | | |
| RW-FLOW-001 (New Retailer E2E) | P0 | PENDING | — | |
| RW-FLOW-002 (CSV Import E2E) | P1 | PENDING | — | |
| RW-FLOW-003 (Supplier → Catalog) | P1 | PENDING | — | |
| RW-FLOW-004 (Settings → POS) | P1 | PENDING | — | |
| RW-FLOW-005 (Price Change → POS) | P1 | PENDING | — | |
| RW-FLOW-006 (Compliance → SA) | P2 | PENDING | — | |
| RW-FLOW-007 (Admin Queue → Catalog) | P2 | PENDING | — | |
| RW-FLOW-008 (Full Lifecycle) | P0 | PENDING | — | |
| **RW↔POS CROSS TICKETS** | | | | |
| RW-POS-001 (Stock Sync Sale) | P0 | PENDING | — | |
| RW-POS-002 (Stock Sync Inward) | P0 | PENDING | — | |
| RW-POS-003 (Stock Sync GRN) | P1 | PENDING | — | |
| RW-POS-004 (Product Add → POS) | P1 | PENDING | — | |
| RW-POS-005 (Daily Reconciliation) | P0 | PENDING | — | |
| RW-POS-006 (Price Change → POS) | P1 | PENDING | — | |
| RW-POS-007 (Device Activate) | P1 | PENDING | — | |
| RW-POS-008 (Offline Sale Sync) | P1 | PENDING | — | |
| RW-POS-009 (Category Sync) | P2 | PENDING | — | |
| RW-POS-010 (Barcode Consistency) | P1 | PENDING | — | |
| **RW↔SA CROSS TICKETS** | | | | |
| RW-SA-001 (Store Suspend) | P0 | PENDING | — | |
| RW-SA-002 (User Status) | P0 | PENDING | — | |
| RW-SA-003 (Feature Flag Kill) | P0 | PENDING | — | |
| RW-SA-004 (Per-Store Override) | P1 | PENDING | — | |
| RW-SA-005 (Payment Methods) | P1 | PENDING | — | |
| RW-SA-006 (App Approval → Access) | P0 | PENDING | — | |
| RW-SA-007 (Doc Review → Status) | P2 | PENDING | — | |
| RW-SA-008 (Supplier Verify → Catalog) | P1 | PENDING | — | |
| RW-SA-009 (Product Approve → List) | P1 | PENDING | — | |
| RW-SA-010 (Staff → POS) | P1 | PENDING | — | |
| RW-SA-011 (Device Mgmt from SA) | P2 | PENDING | — | |
| RW-SA-012 (Audit Log Verify) | P2 | PENDING | — | |
| **TRI-FLOW TICKETS** | | | | |
| RW-SA-POS-001 (Pricing + Tax) | P0 | PENDING | — | |
| RW-SA-POS-002 (Feature Flag Kill) | P0 | PENDING | — | |
| RW-SA-POS-003 (Store Suspend) | P0 | PENDING | — | |
| RW-SA-POS-004 (Catalog Approval) | P1 | PENDING | — | |
| RW-SA-POS-005 (Payment Control) | P1 | PENDING | — | |
| RW-SA-POS-006 (Supplier Suspend) | P1 | PENDING | — | |
| RW-SA-POS-007 (Staff Role) | P1 | PENDING | — | |
| RW-SA-POS-008 (Inventory Recon) | P0 | PENDING | — | |
| **API TICKETS** | | | | |
| RW-API-001 (Auth Error Handling) | P1 | PENDING | — | |
| RW-API-002 (Store Isolation) | P0 | PENDING | — | |
| RW-API-003 (Rate Limiting) | P2 | PENDING | — | |
| RW-API-004 (CSV Idempotency) | P2 | PENDING | — | |
| RW-API-005 (Pagination) | P1 | PENDING | — | |
| RW-API-006 (Input Validation) | P1 | PENDING | — | |
| **DB TICKETS** | | | | |
| RW-DB-001 (Migration Clean) | P1 | PENDING | — | |
| RW-DB-002 (Store Isolation DB) | P0 | PENDING | — | |
| RW-DB-003 (Data Constraints) | P1 | PENDING | — | |
| RW-DB-004 (Seed Data) | P2 | PENDING | — | |
| **UI TICKETS** | | | | |
| RW-UI-001 (Login States) | P1 | PENDING | — | |
| RW-UI-002 (Dashboard Shimmer) | P2 | PENDING | — | |
| RW-UI-003 (Responsive Layout) | P2 | PENDING | — | |
| RW-UI-004 (Form Validation UX) | P1 | PENDING | — | |
| RW-UI-005 (Navigation States) | P1 | PENDING | — | |
| RW-UI-006 (Modal UX) | P2 | PENDING | — | |
| RW-UI-007 (Pagination Controls) | P2 | PENDING | — | |
| RW-UI-008 (Empty States) | P1 | PENDING | — | |
| RW-UI-009 (Error Boundaries) | P1 | PENDING | — | |
| RW-UI-010 (Console Clean) | P1 | PENDING | — | |

---

## Priority Summary

| Priority | Count | Description |
|----------|-------|-------------|
| **P0** | 13 | Security, data integrity, store isolation, reconciliation |
| **P1** | 37 | Core functionality, critical flows, error handling |
| **P2** | 23 | UX polish, responsive, minor features |
| **Total** | **73** | |

---

## Fix Discipline (D4)

Any FAIL found during testing:
- **1 ticket = 1 branch = 1 PR = 1 prestage tag**
- Branch: `audit/<TICKET-ID>-short-desc`
- PR title: `[<TICKET-ID>] <summary>`
- Tag: `prestage-AUDIT-<TICKET-ID>-YYYY-MM-DD_HHMMIST`
- Evidence per risk class (A-F per MEMORY.md)
- All gates must pass before merge

---

## Phase Execution

| Phase | Scope | When |
|-------|-------|------|
| **A** (this file) | Inventory + ticket creation | Now (complete) |
| **B** | Execute tickets on local/prestage | Next (operator-driven) |
| **C** | RC tag → deploy → staging re-run | After B rounds complete |
