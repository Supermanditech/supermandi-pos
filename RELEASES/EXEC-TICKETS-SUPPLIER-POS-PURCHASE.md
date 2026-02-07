# EXECUTION TICKETS: Supplier → POS Buy/Purchase (B2B Wholesale)

**Date:** 2026-02-07
**Source Audit:** AUDIT-SUPPLIER-POS-PURCHASE.md
**Anchor:** 68767e6 (main)
**Total Tickets:** 14 (12 original + 2 new from recheck)
**Batches:** 7 micro-batches

**Rule:** NO IMPLEMENTATION UNTIL OPERATOR UNLOCK.

---

## TICKET SUMMARY TABLE

| # | Ticket | Priority | Type | Batch | Status |
|---|--------|----------|------|-------|--------|
| 1 | SUP-POS-001 | P0 | Backend | BATCH-1 | PENDING |
| 2 | SUP-POS-013 | P0 | Backend | BATCH-1 | PENDING |
| 3 | SUP-POS-002 | P0 | Frontend | BATCH-2 | PENDING |
| 4 | SUP-POS-003 | P0 | Backend | BATCH-2 | PENDING |
| 5 | SUP-POS-005 | P1 | Backend | BATCH-3 | PENDING |
| 6 | SUP-POS-006 | P0 | Frontend | BATCH-3 | PENDING |
| 7 | SUP-POS-004 | P1 | Backend | BATCH-4 | PENDING |
| 8 | SUP-POS-011 | P1 | Full-stack | BATCH-4 | PENDING |
| 9 | SUP-POS-007 | P1 | Backend+Frontend | BATCH-5 | PENDING |
| 10 | SUP-POS-008 | P1 | Backend+Frontend | BATCH-5 | PENDING |
| 11 | SUP-POS-009 | P2 | Full-stack | BATCH-6 | PENDING |
| 12 | SUP-POS-010 | P2 | Backend | BATCH-6 | PENDING |
| 13 | SUP-POS-012 | P2 | Full-stack | BATCH-7 | PENDING |
| 14 | SUP-POS-E01 | P1 | E2E Tests | BATCH-7 | PENDING |

---

## WHAT ALREADY WORKS (8 PASS items — verified via code audit)

These items are production-ready in backend. They become fully exercisable once the 5 FAIL items (P0 tickets) are fixed:

| # | Flow | Backend | Frontend | Gap Fixed By |
|---|------|---------|----------|-------------|
| 1 | Supplier creates product (POST /supplier/products) | PASS | PASS | — |
| 2 | Supplier CSV bulk upload (POST /supplier/products/csv-upload) | PASS | PASS | — |
| 3 | Product appears in admin pending (GET /admin/products/pending) | PASS | PASS | — |
| 4 | Admin adds margin (PUT /admin/products/:id/edit) | PASS | PASS | SUP-POS-013 (margin_percent formula) |
| 5 | Admin approves (POST /admin/products/:id/approve) | PASS | PASS | SUP-POS-005 (auto-mapping) |
| 6 | Buy catalog API returns approved products | PASS | FAIL | SUP-POS-002 (wrong endpoint), SUP-POS-003 (flat rows) |
| 7 | Supplier views incoming orders (GET /supplier/orders) | PASS | PASS | SUP-POS-001 (need order creation), SUP-POS-008 (detail enhancement) |
| 8 | Supplier confirms/ships/tracks (PATCH /supplier/orders/:id/status+shipment) | PASS | PASS | SUP-POS-001 (need orders to exist) |

**Key insight:** The 8 PASS items are individually verified but cannot be exercised end-to-end because of 3 P0 blockers (no create-order route, BuyScreen calls wrong endpoint, no product grouping). BATCH-1 and BATCH-2 unblock the entire pipeline. SUP-POS-E01 verifies everything end-to-end.

---

# ============================================================================
# BATCH-1: Backend Foundation (P0 — Unblocks entire pipeline)
# ============================================================================

## SUP-POS-001 — Backend: Create Purchase Order endpoint (POST)

**Priority:** P0 — BLOCKS ALL ORDER FLOWS
**Problem:** Frontend `orderApi.createOrder()` (line 285, `src/services/api/orderApi.ts`) calls `POST /api/v1/orders/stores/:storeId/orders` but this route DOES NOT EXIST in backend `orders.ts`. The backend `ordersRouter` has 11 endpoints (GET list, GET detail, GET events, POST cancel, DELETE, GET payment-options, POST pay, POST pay/confirm, POST receive, GET receives, GET receive/:id) but NO POST for creation. POS cannot place purchase orders.

**Evidence:**
- `backend/src/routes/v1/orders.ts` — grep for `ordersRouter.post(` shows only `/cancel`, `/pay`, `/pay/confirm`, `/receive`
- `src/services/api/orderApi.ts:285-292` — `createOrder()` calls `POST ${ORDER_BASE}/stores/${storeId}/orders`
- `src/components/buy/PurchaseCartModal.tsx:241,381,442` — 3 call sites to `orderApi.createOrder()`

**Exact Scope:**
1. Add `ordersRouter.post("/stores/:storeId/orders", requireDeviceToken, ...)` to `backend/src/routes/v1/orders.ts`
2. Accept body matching `CreateOrderParams`:
   ```typescript
   {
     supplierId: string,          // Required: UUID
     orderType: "manual"|"reorder", // Required
     items: [{                     // Required: 1+ items
       supplierProductId: string,  // UUID from catalog.supplier_products
       quantity: number,           // > 0, >= MOQ
       unitPrice: number           // paise (minor units)
     }],
     storeNotes?: string,
     deliveryAddress?: string,
     expectedDeliveryDate?: string // ISO 8601
   }
   ```
3. Validations (all within transaction):
   - `storeId` from device token (enforceStoreBinding)
   - `supplierId` exists in `supplier.suppliers` WHERE `status = 'verified'`
   - Supplier linked to store via `supplier.supplier_store_links` WHERE `status = 'active'`
   - Each `supplierProductId` exists in `catalog.supplier_products` WHERE `supplier_id = supplierId` AND `approval_status = 'approved'`
   - Each `quantity >= sp.moq` (MOQ enforcement)
   - Each `unitPrice > 0`
   - At least 1 item
4. Generate `order_number` via `INSERT INTO orders.order_sequences (store_id) VALUES ($1) RETURNING seq_number` → format `PO-{storeId_short}-{seq_number}`
5. Insert into `orders.purchase_orders` (id=gen_random_uuid(), order_number, store_id, supplier_id, order_type, status='draft', total_amount, item_count, store_notes, delivery_address, expected_delivery_date, created_by_user_id=null)
6. Insert each item into `orders.purchase_order_items` (id=gen_random_uuid(), order_id, supplier_product_id, product_id=null, ordered_quantity, received_quantity=0, unit_price, total_price=qty*price, line_total=qty*price, status='pending')
7. Log `orders.order_events` (event_type='created', from_status=null, to_status='draft', actor_type='system')
8. Return 201 with full order + items (match `CreateOrderResponse` type from `orderApi.ts:138-141`)

**Acceptance Criteria:**
1. `POST /api/v1/orders/stores/:storeId/orders` returns 201 with `{ success: true, data: { id, orderNumber, items: [...] } }`
2. Order appears in `GET /api/v1/orders/stores/:storeId/orders` (existing endpoint at line 29)
3. Order appears in `GET /api/v1/supplier/orders` (supplier portal, `supplier/orders.ts:22`)
4. PurchaseCartModal `handleSelectPayment` (line 241) works end-to-end
5. `handlePlaceAllOrders` (line 442) creates sequential orders
6. Invalid supplier → 400 `{ error: "invalid_supplier" }`
7. Item below MOQ → 400 `{ error: "below_moq", details: { supplierProductId, moq, requested } }`
8. Unlinked supplier → 400 `{ error: "supplier_not_linked" }`

**Files to Modify:**
- `backend/src/routes/v1/orders.ts` — Add POST handler (insert between line 19 and line 20, before GET list)

**Files to Read (context):**
- `src/services/api/orderApi.ts:124-141` — `CreateOrderParams` + `CreateOrderResponse` type contract
- `src/components/buy/PurchaseCartModal.tsx:240-250` — How frontend calls createOrder
- `backend/src/routes/v1/supplier/orders.ts:22-122` — Supplier order list (must see new orders)

**Typecheck:** `pnpm -r typecheck` must remain 0 errors
**Zero Regression:** Existing GET/cancel/delete/pay/receive endpoints MUST NOT change

---

## SUP-POS-013 — Backend: Fix margin_percent formula in buy-catalog price (NEW)

**Priority:** P0 — Prices will be WRONG for percentage-margin products
**Problem:** Buy catalog at `catalog.ts:378` computes:
```sql
sp.purchase_price + COALESCE(sp.supermandi_margin_minor, 0) AS "retailerPrice"
```
This ONLY applies the fixed margin (`supermandi_margin_minor`). When SuperAdmin sets `margin_percent` instead (via PUT `/admin/products/:id/edit`, which enforces mutual exclusivity), the buy-catalog ignores it — `retailerPrice = purchase_price + 0`. The admin edit UI at `supermandi-superadmin/src/App.tsx:3178-3293` has a "Fixed INR / Percentage" toggle, so percentage margins ARE being created in production.

**Evidence:**
- `catalog.ts:378` — Only uses `supermandi_margin_minor`, not `margin_percent`
- `catalog.ts:380` — `marginPercent` IS returned in response but NOT used in price calculation
- `admin/suppliers.ts:837` — Edit handler stores `margin_percent` as `DECIMAL(5,2)`
- Schema: `supermandi_margin_minor INTEGER` (fixed paise) and `margin_percent DECIMAL(5,2)` (percentage) are mutually exclusive

**Exact Scope:**
1. In `backend/src/routes/v1/catalog.ts`, line 378, change the retailerPrice calculation from:
   ```sql
   sp.purchase_price + COALESCE(sp.supermandi_margin_minor, 0) AS "retailerPrice"
   ```
   to:
   ```sql
   sp.purchase_price + CASE
     WHEN sp.supermandi_margin_minor IS NOT NULL AND sp.supermandi_margin_minor > 0
       THEN sp.supermandi_margin_minor
     WHEN sp.margin_percent IS NOT NULL AND sp.margin_percent > 0
       THEN ROUND(sp.purchase_price * sp.margin_percent / 100)
     ELSE 0
   END AS "retailerPrice"
   ```
2. Similarly update line 379 (margin field):
   ```sql
   CASE
     WHEN sp.supermandi_margin_minor IS NOT NULL AND sp.supermandi_margin_minor > 0
       THEN sp.supermandi_margin_minor
     WHEN sp.margin_percent IS NOT NULL AND sp.margin_percent > 0
       THEN ROUND(sp.purchase_price * sp.margin_percent / 100)
     ELSE 0
   END AS margin
   ```

**Acceptance Criteria:**
1. Product with `supermandi_margin_minor=500, margin_percent=NULL` → `retailerPrice = purchase_price + 500`
2. Product with `supermandi_margin_minor=NULL, margin_percent=10.00` → `retailerPrice = purchase_price + ROUND(purchase_price * 10/100)`
3. Product with both NULL → `retailerPrice = purchase_price`
4. Existing SELL catalog (`/catalog` endpoint) is NOT affected (different query)

**Files to Modify:**
- `backend/src/routes/v1/catalog.ts` — Lines 378-379 only (buy-catalog query)

**Typecheck:** `pnpm -r typecheck` must remain 0 errors
**Zero Regression:** SELL catalog at line 30 (`/stores/:storeId/catalog`) MUST NOT change

---

# ============================================================================
# BATCH-2: Buy Catalog Pipeline (P0 — Makes products visible in POS)
# ============================================================================

## SUP-POS-002 — POS BuyScreen: Wire to buy-catalog endpoint

**Priority:** P0 — BuyScreen shows ZERO supplier products currently
**Problem:** `BuyScreen.tsx:168` calls `catalogApi.getCatalog(storeId, ...)` which hits `/api/v1/catalog/stores/{storeId}/catalog` (SELL catalog). This returns `store_products` from the SELL flow with `suppliers: []` (empty). The correct BUY endpoint is `/api/v1/catalog/stores/{storeId}/buy-catalog` (SM-003, `catalog.ts:309`).

**Evidence:**
- `src/screens/BuyScreen.tsx:168` — `await catalogApi.getCatalog(storeId, { ... })`
- `src/services/api/catalogApi.ts:167` — `getCatalog()` calls `/stores/${storeId}/catalog`
- `backend/src/routes/v1/catalog.ts:30` — SELL catalog returns `store_products`
- `backend/src/routes/v1/catalog.ts:309` — BUY catalog returns `supplier_products` with margin

**Exact Scope:**
1. In `src/services/api/catalogApi.ts`, add new types and function:
   ```typescript
   // Buy catalog types (flat response from backend)
   export interface BuyCatalogItem {
     id: string;              // supplier_product_id
     name: string;
     category: string | null;
     brand: string | null;
     barcode: string | null;
     supplierSku: string | null;
     supplierPrice: number;   // purchase_price (paise)
     retailerPrice: number;   // purchase_price + margin (paise)
     margin: number;          // margin amount (paise)
     marginPercent: number;
     supplierName: string;
     supplierId: string;
     bnplEligible: boolean;
     bnplMaxDays: number;
     stockQty: number;
     stockStatus: string;
     moq: number;
     unit: string;
     mrp: number | null;
   }

   export interface GetBuyCatalogResponse {
     success: boolean;
     data: BuyCatalogItem[];
     pagination: CatalogPagination;
     filters: { search: string | null; category: string | null; supplierId: string | null };
     context: "BUY";
   }

   export async function getBuyCatalog(
     storeId: string,
     params?: GetCatalogParams
   ): Promise<GetBuyCatalogResponse> { ... }
   ```
2. Add `transformBuyCatalogToProducts(items: BuyCatalogItem[]): CatalogProduct[]` helper that groups flat items by `name+category+unit` (temporary grouping until SUP-POS-003 adds server-side grouping):
   - Group by `name.toLowerCase() + '|' + (category || '') + '|' + (unit || '')`
   - First item in group becomes the base `CatalogProduct`
   - Each item becomes a `CatalogSupplier` in the `suppliers[]` array
   - `bestPrice = MIN(retailerPrice)`, `supplierCount = suppliers.length`
   - `stockStatus = 'in_stock'` if ANY supplier is in_stock
3. In `src/screens/BuyScreen.tsx:168`, replace:
   ```typescript
   const response = await catalogApi.getCatalog(storeId, { ... });
   ```
   with:
   ```typescript
   const buyResponse = await catalogApi.getBuyCatalog(storeId, { ... });
   const groupedProducts = catalogApi.transformBuyCatalogToProducts(buyResponse.data);
   // Use same response shape
   ```
4. Update categories loading (`BuyScreen.tsx:137`) to use buy-catalog categories (add `?distinct=category` or extract from results)

**Acceptance Criteria:**
1. BuyScreen loads products from `/buy-catalog` endpoint (network tab shows correct URL)
2. Products displayed are from `catalog.supplier_products` (approved, verified)
3. Prices shown are `retailerPrice` (base + margin), NOT raw `supplierPrice`
4. Search works (debounced, hits buy-catalog `?q=` param)
5. Category filter works
6. Pagination loads more pages correctly
7. SELL catalog (`/catalog`) still used by SellScreen (no regression)

**Files to Modify:**
- `src/services/api/catalogApi.ts` — Add `getBuyCatalog()`, `BuyCatalogItem`, `transformBuyCatalogToProducts()`
- `src/screens/BuyScreen.tsx` — Switch `getCatalog()` → `getBuyCatalog()` + transform

**Typecheck:** `pnpm -r typecheck` must remain 0 errors
**Zero Regression:** SellScreen, SELL catalog, store_products flow MUST NOT change

---

## SUP-POS-003 — Backend: Buy catalog product grouping (multi-supplier)

**Priority:** P0 — Same product from N suppliers = N duplicate rows
**Problem:** Buy catalog at `catalog.ts:309-456` returns one flat row per supplier-product. When 5 suppliers sell "Tata Salt 1kg", POS gets 5 rows. Frontend `CatalogProduct` type expects grouped products with `suppliers: CatalogSupplier[]`. The `catalog.supplier_product_map` table exists with columns (supplier_product_id, product_id, mapping_type, confidence, is_verified) but is UNUSED in the buy-catalog query.

**Evidence:**
- `catalog.ts:369-397` — SELECT returns flat rows, no GROUP BY
- `catalog.ts:399-419` — Maps to flat objects, no nesting
- `src/services/api/catalogApi.ts:26-45` — `CatalogProduct` expects `suppliers: CatalogSupplier[]`
- `catalog.supplier_product_map` table exists (from migration 013)

**Exact Scope:**
1. Rewrite the buy-catalog query in `catalog.ts:369-397` to:
   - LEFT JOIN `catalog.supplier_product_map spm ON spm.supplier_product_id = sp.id`
   - LEFT JOIN `catalog.products mp ON mp.id = spm.product_id` (master product)
   - GROUP BY `COALESCE(spm.product_id, sp.id)` (use master product ID if mapped, else supplier_product_id as fallback)
   - Use `json_agg()` to nest supplier offers into a `suppliers` array
   - Compute `bestPrice = MIN(retailerPrice)`, `supplierCount = COUNT(*)`, `stockStatus = MAX(stock_status)` (best status)
2. Response format per product:
   ```json
   {
     "id": "master_product_id_or_supplier_product_id",
     "name": "Tata Salt 1kg",
     "category": "Grocery",
     "brand": "Tata",
     "barcode": "8901234567890",
     "bestPrice": 2500,
     "supplierCount": 3,
     "stockStatus": "in_stock",
     "suppliers": [
       {
         "supplierId": "uuid",
         "supplierName": "ABC Distributors",
         "supplierProductId": "uuid",
         "purchasePrice": 2300,
         "retailerPrice": 2500,
         "moq": 10,
         "stockQuantity": 500,
         "stockStatus": "in_stock",
         "bnplEligible": true,
         "bnplMaxDays": 7,
         "isPreferred": false
       }
     ]
   }
   ```
3. Pagination counts GROUPED products (not flat rows)
4. Search/category filters apply BEFORE grouping
5. Fallback: If no `supplier_product_map` entries exist, each supplier_product is its own group (1 product, 1 supplier) — backward compatible

**Acceptance Criteria:**
1. Same product from N suppliers → 1 grouped result with N entries in `suppliers[]`
2. `bestPrice` = lowest `retailerPrice` across all suppliers
3. `supplierCount` accurately reflects number of supplier offers
4. Pagination total counts grouped products, not flat rows
5. Search/category filters still work
6. Products with no mapping → each is its own group (1:1 backward compat)
7. Response matches `CatalogProduct` + `CatalogSupplier[]` type contract

**Files to Modify:**
- `backend/src/routes/v1/catalog.ts` — Lines 369-419 (buy-catalog query + response mapping)

**Typecheck:** `pnpm -r typecheck` must remain 0 errors
**Zero Regression:** SELL catalog, count query, pagination math MUST NOT change

---

# ============================================================================
# BATCH-3: Auto-Mapping + Detail Modal (P0/P1 — Makes multi-supplier usable)
# ============================================================================

## SUP-POS-005 — Backend: Supplier-product-map auto-population on approval

**Priority:** P1 — Required for SUP-POS-003 grouping to work with real data
**Problem:** `catalog.supplier_product_map` table exists but has ZERO rows. Without mappings, the grouping in SUP-POS-003 falls back to 1:1 (no grouping). When SuperAdmin approves a product, it should auto-create a mapping to a master catalog product.

**Evidence:**
- `catalog.supplier_product_map` table: `supplier_product_id UUID, product_id UUID, mapping_type, confidence, is_verified`
- `admin/suppliers.ts:643-738` — Approve handler updates `approval_status='approved'` but does NOT create mapping
- `catalog.products` — Master product table exists
- `catalog.product_barcodes` — Barcode lookup table exists

**Exact Scope:**
1. In `backend/src/routes/v1/admin/suppliers.ts`, after the approval UPDATE (line ~700), add auto-mapping logic:
   ```
   Step 1: Get approved product's barcode, name, unit
   Step 2: Try barcode match: SELECT product_id FROM catalog.product_barcodes WHERE barcode = $1
   Step 3: If match → INSERT INTO catalog.supplier_product_map (supplier_product_id, product_id, mapping_type='auto', confidence=1.0, is_verified=false)
   Step 4: If no barcode match → Try name match: SELECT id, similarity(name, $1) as sim FROM catalog.products WHERE similarity(name, $1) > 0.6 ORDER BY sim DESC LIMIT 1
   Step 5: If name match → INSERT mapping with confidence = similarity_score
   Step 6: If no match at all → INSERT INTO catalog.products (name, category, brand, unit, primary_barcode) from supplier product data → INSERT mapping with confidence=1.0
   ```
2. All mapping inserts wrapped in the approval transaction
3. Handle edge case: mapping already exists (ON CONFLICT DO NOTHING)
4. Log to `catalog.catalog_mapping_log` if table exists (non-blocking)

**Acceptance Criteria:**
1. Approve product with matching barcode → mapping created with `confidence=1.0`
2. Approve product with similar name (>60% trigram) → mapping with `confidence=similarity_score`
3. Approve novel product → new master `catalog.products` row created + mapping
4. Re-approve (idempotent) → no duplicate mapping (ON CONFLICT)
5. After mapping, buy-catalog groups this product with others mapped to same master

**Files to Modify:**
- `backend/src/routes/v1/admin/suppliers.ts` — Add auto-mapping after approval UPDATE (~line 700)

**Typecheck:** `pnpm -r typecheck` must remain 0 errors
**Zero Regression:** Approval endpoint behavior (status change, audit log) MUST NOT change

---

## SUP-POS-006 — POS: ProductDetailModal supplier data flow

**Priority:** P0 (depends on SUP-POS-002 + SUP-POS-003 being done first)
**Problem:** `ProductDetailModal` expects a `CatalogProduct` with `suppliers: CatalogSupplier[]` but BuyScreen currently passes products with `suppliers: []` (empty). After SUP-POS-002/003, the data will flow correctly, but we must verify the modal renders supplier offers and the "Add to Cart" creates correct `PurchaseCartItem`.

**Evidence:**
- `src/components/buy/ProductDetailModal.tsx` — Renders supplier list from `product.suppliers`
- `src/stores/purchaseCartStore.ts:12-24` — `PurchaseCartItem` requires `supplierProductId`, `supplierId`, `supplierName`, `unitPrice`, `moq`
- `src/components/buy/PurchaseCartModal.tsx:241-250` — `createOrder` uses `item.supplierProductId` and `item.unitPrice`

**Exact Scope:**
1. Verify `ProductDetailModal` renders each supplier from `product.suppliers[]`:
   - `supplierName` display
   - `retailerPrice` display (NOT raw `supplierPrice` — this is the price the retailer pays)
   - `moq` display and enforcement in quantity picker
   - `stockStatus` indicator (green/amber/red)
   - `bnplEligible` badge if true
2. Verify "Add to Cart" button creates `PurchaseCartItem` with:
   - `supplierProductId` = `supplier.supplierProductId` (the specific offer)
   - `productId` = `product.id` (the grouped product)
   - `supplierId` = `supplier.supplierId`
   - `supplierName` = `supplier.supplierName`
   - `unitPrice` = `supplier.retailerPrice` (NOT `purchasePrice`)
   - `moq` = `supplier.moq`
3. If `product.suppliers` is empty (fallback), show "No suppliers available" message
4. Ensure `isPreferred` supplier gets a "Preferred" badge

**Acceptance Criteria:**
1. Tapping product in BuyScreen opens modal with ALL linked suppliers listed
2. Each supplier shows `retailerPrice` (not raw `supplierPrice`)
3. "Add to Cart" creates cart item bound to specific `supplierProductId`
4. MOQ enforced — cannot add less than `moq` quantity
5. BNPL badge shows for eligible products
6. Empty suppliers → user-friendly message (not blank/crash)

**Files to Modify:**
- `src/components/buy/ProductDetailModal.tsx` — Verify/fix data binding
- May need minor adjustments if field names don't match after SUP-POS-002 transform

**Typecheck:** `pnpm -r typecheck` must remain 0 errors
**Zero Regression:** PurchaseCartModal + purchaseCartStore MUST NOT change

---

# ============================================================================
# BATCH-4: Barcode + Order Lifecycle (P1 — Completes BUY flow)
# ============================================================================

## SUP-POS-004 — Backend: Cross-supplier barcode lookup for BUY

**Priority:** P1
**Problem:** POS barcode scan in PurchaseScreen uses `GET /api/v1/pos/suppliers/:supplierId/products` (single-supplier only, `pos/suppliers.ts`). No cross-supplier barcode lookup for the BUY flow. Scanning "8901234567890" should return ALL supplier offers for that barcode.

**Evidence:**
- `backend/src/routes/v1/pos/suppliers.ts` — Returns products for ONE specific supplier
- `src/screens/PurchaseScreen.tsx` — Barcode scanner calls supplier-specific endpoint
- `catalog.ts:309` — Buy-catalog supports `?q=` text search but no dedicated barcode endpoint

**Exact Scope:**
1. Add `GET /api/v1/catalog/stores/:storeId/buy-catalog/barcode/:barcode` to `catalog.ts`
2. Query: Same visibility rules as buy-catalog (verified supplier, approved product, active store link), filtered by `sp.barcode = $2`
3. Return same grouped format as SUP-POS-003 (product with `suppliers[]`)
4. If single product match → return `{ data: CatalogProduct }`
5. If no match → 404 `{ error: "barcode_not_found" }`
6. Wire PurchaseScreen barcode scanner to call this endpoint

**Acceptance Criteria:**
1. Barcode scan with 3 suppliers → returns grouped product with 3 offers
2. Unknown barcode → 404
3. Barcode from non-linked supplier → not visible
4. Result format matches `CatalogProduct` type (same as buy-catalog)

**Files to Modify:**
- `backend/src/routes/v1/catalog.ts` — Add barcode lookup endpoint (after buy-catalog, ~line 455)
- `src/screens/PurchaseScreen.tsx` — Wire barcode scanner to new endpoint

**Typecheck:** `pnpm -r typecheck` must remain 0 errors

---

## SUP-POS-011 — POS: Order status transitions + GRN verification

**Priority:** P1 (depends on SUP-POS-001)
**Problem:** Backend has complete order lifecycle (cancel, receive, pay) and POS has `GRNScreen.tsx` + `OrderDetailScreen.tsx` + `OrderHistoryScreen.tsx`. Need to verify the full chain works once SUP-POS-001 enables order creation. The existing UI code exists but may have data flow gaps.

**Evidence:**
- `backend/src/routes/v1/orders.ts:1105` — POST `/receive` endpoint exists
- `src/screens/GRNScreen.tsx` — GRN UI exists with `GRNItemRow` + `ReceiveQuantityInput`
- `src/screens/OrderDetailScreen.tsx:46` — Has `onNavigateToGRN` prop
- `src/screens/OrderHistoryScreen.tsx` — List view with filters
- `src/services/api/orderApi.ts:143-196` — GRN types fully defined

**Exact Scope:**
1. Verify `OrderHistoryScreen` → `OrderDetailScreen` → `GRNScreen` navigation chain works
2. Verify `OrderDetailScreen` shows: order items with names/prices, status timeline (via `StatusTimeline` component), cancel button (for draft/submitted), "Receive Goods" button (for shipped/delivered)
3. Verify `GRNScreen` sends `POST /receive` with correct `ReceiveGoodsParams`
4. Verify after receive: order status transitions to `partially_received` or `received`
5. Fix any data flow gaps between screens (prop drilling, navigation params)
6. Ensure `canReceive()` helper from `orderApi.ts` correctly gates the "Receive" button

**Acceptance Criteria:**
1. Order list shows all orders with correct status badges
2. Order detail shows items, timeline, tracking info
3. GRN: per-item received quantity input with validation
4. Partial receipt → status = `partially_received`
5. Full receipt → status = `received`
6. Order events timeline shows receive event

**Files to Modify:**
- `src/screens/OrderDetailScreen.tsx` — Verify data flow, fix if needed
- `src/screens/GRNScreen.tsx` — Verify receives work end-to-end
- `src/screens/OrderHistoryScreen.tsx` — Verify list loads, filters work

**Typecheck:** `pnpm -r typecheck` must remain 0 errors

---

# ============================================================================
# BATCH-5: Supplier Portal Enhancements (P1 — Supplier visibility)
# ============================================================================

## SUP-POS-007 — Supplier Portal: New order notification badge

**Priority:** P1
**Problem:** Supplier portal orders page is passive. Supplier must manually navigate to check for new orders. No notification mechanism when a retailer places an order. For 10K suppliers, this means missed orders and delayed fulfillment.

**Evidence:**
- `supplier-portal/src/app/(dashboard)/orders/page.tsx` — Passive page, fetches on mount only
- `backend/src/routes/v1/supplier/orders.ts` — No unread count in response
- No notification trigger in order creation flow

**Exact Scope:**
1. Add `unread_orders_count` to supplier dashboard stats:
   - In `backend/src/routes/v1/supplier/dashboard.ts`, add query: `SELECT COUNT(*) FROM orders.purchase_orders po JOIN orders.purchase_order_items poi ON poi.order_id = po.id JOIN catalog.supplier_products sp ON sp.id = poi.supplier_product_id WHERE sp.supplier_id = $1 AND po.status IN ('draft', 'submitted') AND po.created_at > COALESCE((SELECT last_viewed_at FROM supplier.supplier_order_views WHERE supplier_id = $1), '1970-01-01')`
   - Return `unreadOrdersCount` in stats response
2. Add `supplier.supplier_order_views` table tracking (if not exists, create migration):
   - `supplier_id UUID PK, last_viewed_at TIMESTAMPTZ`
   - UPSERT when supplier views orders list
3. Add `POST /api/v1/supplier/orders/mark-read` endpoint to update `last_viewed_at`
4. Frontend: Show badge on Orders nav item when `unreadOrdersCount > 0`
5. When supplier visits orders page, call `mark-read` to clear badge

**Acceptance Criteria:**
1. Dashboard stats include `unreadOrdersCount`
2. New order from POS → badge shows on supplier portal navigation
3. Supplier views orders → badge clears
4. Badge count is accurate (only unread)

**Files to Modify:**
- `backend/src/routes/v1/supplier/dashboard.ts` — Add unread count to stats
- `backend/src/routes/v1/supplier/orders.ts` — Add `POST /orders/mark-read`
- `supplier-portal/src/app/(dashboard)/orders/page.tsx` — Call mark-read on mount
- `supplier-portal/src/app/(dashboard)/layout.tsx` or nav component — Show badge

**Migration:** May need `supplier.supplier_order_views` table
**Typecheck:** `pnpm -r typecheck` must remain 0 errors

---

## SUP-POS-008 — Supplier Portal: Enhanced order detail + product sold view

**Priority:** P1
**Problem:** When a retailer buys products under POS PURCHASE tab, the supplier needs to see full order details for warehouse operations: product barcodes/SKUs for picking, store contact for delivery, order timeline for tracking, and payment status. The current order list (GET /supplier/orders) returns basic item data (name, qty, price, status) but lacks barcode, SKU, store contact, and timeline.

**Evidence:**
- `supplier/orders.ts:66-96` — Order list query joins `purchase_order_items` + `supplier_products` but only returns: productName, quantity, receivedQuantity, unitPrice, total, status
- Missing from response: barcode, supplier_sku, unit, pack_size, store phone, store city, expected_delivery_date, payment info
- No `GET /supplier/orders/:id` single-order detail endpoint (list shows all in `json_agg`)
- No `GET /supplier/orders/:id/events` timeline endpoint

**Exact Scope:**
1. Add `GET /api/v1/supplier/orders/:id` endpoint to `supplier/orders.ts`:
   - Order-level: id, orderNumber, status, totalAmount, storeName, storeCity, storePhone, expectedDeliveryDate, trackingNumber, carrier, paymentStatus, createdAt, updatedAt
   - Per-item: productName, barcode, supplierSku, unit, orderedQuantity, receivedQuantity, unitPrice, lineTotal, status
   - JOIN `platform.stores` for store contact (city, phone)
   - JOIN `catalog.supplier_products` for barcode, supplier_sku, unit
2. Add `GET /api/v1/supplier/orders/:id/events` endpoint:
   - Return `orders.order_events` for this order, ordered by `created_at ASC`
   - Each event: eventType, fromStatus, toStatus, actorType, metadata, createdAt
3. Enhance supplier portal order detail modal:
   - Show barcode + SKU per item (for warehouse picking)
   - Show store contact info (city, phone) for delivery coordination
   - Show order timeline with status history
   - Add "Print Order" button (print-friendly CSS layout)

**Acceptance Criteria:**
1. `GET /supplier/orders/:id` returns full detail with barcode, SKU, store contact
2. `GET /supplier/orders/:id/events` returns timeline
3. Supplier portal detail modal shows barcode + SKU per item
4. Store city + phone visible
5. Order timeline renders with status history
6. Print button opens print-friendly view

**Files to Modify:**
- `backend/src/routes/v1/supplier/orders.ts` — Add GET /:id detail + GET /:id/events
- `supplier-portal/src/app/(dashboard)/orders/page.tsx` — Enhance detail modal UI

**Typecheck:** `pnpm -r typecheck` must remain 0 errors

---

# ============================================================================
# BATCH-6: Retailer Links + Ranking (P2 — Scale & Management)
# ============================================================================

## SUP-POS-009 — Retailer Portal: Supplier-store link management

**Priority:** P2
**Problem:** `supplier.supplier_store_links` table exists and buy-catalog requires `ssl.store_id = $1 AND ssl.status = 'active'`, but there is no retailer-facing API to link/unlink suppliers. Only SuperAdmin can manage links. Retailers need to choose which suppliers they buy from.

**Evidence:**
- `supplier.supplier_store_links` table: store_id, supplier_id, status, is_preferred, credit_days, min_order_value
- `catalog.ts:326-327` — Buy catalog requires active store link
- No `retailer-admin/suppliers.ts` file exists

**Exact Scope:**
1. Create `backend/src/routes/v1/retailer-admin/suppliers.ts`:
   - `GET /api/v1/retailer-admin/suppliers` — List linked suppliers (paginated, with commercial terms)
   - `GET /api/v1/retailer-admin/suppliers/available` — List verified suppliers NOT yet linked
   - `POST /api/v1/retailer-admin/suppliers/link` — Link supplier to store (body: `{ supplierId, isPreferred?, creditDays?, minOrderValue? }`)
   - `PATCH /api/v1/retailer-admin/suppliers/:supplierId` — Update link settings (preferred, terms)
   - `DELETE /api/v1/retailer-admin/suppliers/:supplierId/unlink` — Deactivate link (`status='inactive'`)
2. Validation: Supplier must have `verification_status='verified'`
3. Register route in retailer-admin router
4. Add Suppliers page to retailer-admin frontend (list + search + link/unlink)

**Acceptance Criteria:**
1. Retailer can search verified suppliers and link them
2. Linked supplier's products appear in POS buy-catalog
3. Unlinked supplier's products disappear from buy-catalog
4. Retailer can set preferred supplier flag
5. Commercial terms (credit days, min order) stored per link

**Files to Create:**
- `backend/src/routes/v1/retailer-admin/suppliers.ts` — New route file
- `retailer-admin/src/pages/SuppliersPage.tsx` — New page

**Files to Modify:**
- `backend/src/routes/v1/retailer-admin/index.ts` — Register new route
- `retailer-admin/src/App.tsx` — Add nav item + route

**Typecheck:** `pnpm -r typecheck` must remain 0 errors

---

## SUP-POS-010 — Backend: Buy catalog ranking (preferred/cheapest/in-stock)

**Priority:** P2 (depends on SUP-POS-003)
**Problem:** Buy catalog returns products sorted alphabetically by name. No ranking by preferred supplier, price, or stock. For 10K suppliers, ranking is critical for usability.

**Evidence:**
- `catalog.ts:394` — `ORDER BY COALESCE(sp.edited_name, sp.name) ASC`
- No `sort` query parameter support
- Frontend `getPreferredOrBestSupplier()` in `catalogApi.ts:329` checks `isPreferred` but backend doesn't populate it

**Exact Scope:**
1. Add `sort` query parameter to buy-catalog: `name` (default), `cheapest`, `recent`
2. Within grouped products (SUP-POS-003), sort `suppliers[]` array by:
   - `isPreferred` DESC (preferred first)
   - `stockStatus` priority (`in_stock` > `low_stock` > `out_of_stock`)
   - `retailerPrice` ASC (cheapest)
3. Populate `isPreferred` from `supplier.supplier_store_links.is_preferred`
4. `bestPrice` = first supplier's retailerPrice (after ranking)
5. Outer sort: `name` = alphabetical, `cheapest` = by bestPrice ASC, `recent` = by newest product

**Acceptance Criteria:**
1. Default: products by name, suppliers by preferred→cheapest→in-stock
2. `?sort=cheapest` sorts products by bestPrice ASC
3. Preferred supplier appears first in suppliers array
4. Out-of-stock suppliers appear last within each group

**Files to Modify:**
- `backend/src/routes/v1/catalog.ts` — Add sort logic to buy-catalog query

**Typecheck:** `pnpm -r typecheck` must remain 0 errors

---

# ============================================================================
# BATCH-7: Real-time + E2E Verification (P2/P1 — Locks everything)
# ============================================================================

## SUP-POS-012 — Supplier Portal: Real-time order updates (SSE)

**Priority:** P2
**Problem:** Supplier portal uses page-level data fetch only. No real-time updates when order status changes or new orders arrive. Stale data for active suppliers.

**Exact Scope:**
1. Add SSE endpoint: `GET /api/v1/supplier/orders/stream` in `supplier/orders.ts`
2. Events: `order.created`, `order.status_changed`, `order.payment_received`
3. Poll `orders.order_events` table for new events since last sent (simple polling-based SSE)
4. Frontend: `EventSource` connection on supplier Orders page
5. Fallback: Keep page-level fetch on mount, SSE adds incremental updates

**Acceptance Criteria:**
1. New order appears in supplier portal within 5s without page refresh
2. Status changes reflected in real-time
3. SSE reconnects on disconnect
4. Graceful fallback to page refresh

**Files to Modify:**
- `backend/src/routes/v1/supplier/orders.ts` — Add SSE endpoint
- `supplier-portal/src/app/(dashboard)/orders/page.tsx` — EventSource integration

**Typecheck:** `pnpm -r typecheck` must remain 0 errors

---

## SUP-POS-E01 — E2E Test Suite: Full Supplier → POS Purchase Pipeline

**Priority:** P1 — Verifies ALL 8 PASS items + 5 FAIL fixes end-to-end
**Problem:** No E2E test coverage for the supplier → POS purchase pipeline. The 8 PASS items were verified via code audit only. Need automated end-to-end tests proving the entire flow works in production.

**Exact Scope:**
Create `e2e-tests/tests/supplier-purchase/` test suite with tag `@supplier_purchase`:

1. **Test: Supplier product creation + approval pipeline**
   - Supplier creates product via `POST /supplier/products`
   - Verify product appears in `GET /admin/products/pending`
   - Admin edits margin (fixed + percentage) via `PUT /admin/products/:id/edit`
   - Admin approves via `POST /admin/products/:id/approve`
   - Verify product visible in `GET /catalog/stores/:id/buy-catalog`
   - Verify `retailerPrice` includes margin (both fixed and percentage)

2. **Test: POS purchase order creation**
   - POS creates order via `POST /orders/stores/:id/orders`
   - Verify order in `GET /orders/stores/:id/orders`
   - Verify order visible to supplier in `GET /supplier/orders`
   - Verify items match (supplierProductId, quantity, unitPrice)

3. **Test: Supplier order lifecycle**
   - Supplier confirms: `PATCH /supplier/orders/:id/status` → `confirmed`
   - Supplier ships: `PATCH /supplier/orders/:id/shipment` with tracking
   - POS receives: `POST /orders/stores/:id/orders/:id/receive`
   - Verify status transitions and order events

4. **Test: Store isolation**
   - Create 2 stores with different supplier links
   - Store A's buy-catalog shows only Store A's linked suppliers
   - Store B cannot see Store A's supplier products

5. **Test: Validation edge cases**
   - Order with invalid supplier → 400
   - Order with item below MOQ → 400
   - Order with unlinked supplier → 400
   - Barcode lookup with non-linked supplier → not visible

**Files to Create:**
- `e2e-tests/tests/supplier-purchase/helpers.ts` — Test setup helpers
- `e2e-tests/tests/supplier-purchase/product-approval.spec.ts`
- `e2e-tests/tests/supplier-purchase/purchase-order.spec.ts`
- `e2e-tests/tests/supplier-purchase/order-lifecycle.spec.ts`
- `e2e-tests/tests/supplier-purchase/store-isolation.spec.ts`

**Run command:** `cd e2e-tests && npx playwright test --grep "@supplier_purchase"`

---

# ============================================================================
# DEPENDENCY GRAPH
# ============================================================================

```
BATCH-1 (Foundation):
  SUP-POS-001 (Create Order)     ← BLOCKS all order flows
  SUP-POS-013 (Margin Fix)       ← BLOCKS correct pricing
       ↓
BATCH-2 (Buy Catalog Pipeline):
  SUP-POS-002 (Wire BuyScreen)   ← BLOCKS product display
  SUP-POS-003 (Grouping)         ← BLOCKS multi-supplier UX
       ↓
BATCH-3 (Mapping + Modal):
  SUP-POS-005 (Auto-Map)         ← REQUIRED for grouping data
  SUP-POS-006 (Detail Modal)     ← BLOCKS add-to-cart
       ↓
BATCH-4 (Barcode + GRN):
  SUP-POS-004 (Barcode Lookup)   ← Independent after BATCH-2
  SUP-POS-011 (GRN Verify)       ← Needs orders to exist (BATCH-1)
       ↓
BATCH-5 (Supplier Portal):
  SUP-POS-007 (Notification)     ← Needs orders to exist (BATCH-1)
  SUP-POS-008 (Detail View)      ← Needs orders to exist (BATCH-1)
       ↓
BATCH-6 (Scale & Management):
  SUP-POS-009 (Supplier Links)   ← Independent
  SUP-POS-010 (Ranking)          ← Needs grouping (BATCH-2)
       ↓
BATCH-7 (Final):
  SUP-POS-012 (Real-time SSE)    ← Independent
  SUP-POS-E01 (E2E Tests)        ← Needs ALL above done
```

---

# ============================================================================
# EXECUTION RULES
# ============================================================================

1. **Each batch is a commit boundary** — typecheck clean after each batch
2. **Each ticket is atomic** — can be implemented independently within its batch
3. **No ticket modifies files outside its scope** — zero side effects
4. **Every ticket has acceptance criteria** — testable, not aspirational
5. **Batch order is strict** — BATCH-1 before BATCH-2 before BATCH-3 etc.
6. **Within a batch, tickets can be parallel** — no inter-ticket dependencies in same batch
7. **Gate after each batch:** `pnpm -r typecheck` = 0 errors

---

# ============================================================================
# CONSTRAINTS
# ============================================================================

- No breaking existing SELL flows (store_products, sales, inventory)
- Schema changes require migration file + rollback SQL
- All prices in minor units (paise) — no floating point
- All timestamps in UTC ISO 8601
- Buy-catalog must handle 10K suppliers without N+1 queries
- Every new endpoint uses existing auth middleware (requireDeviceToken or requireSupplierAuth)
- Every INSERT uses transactions where multiple tables involved
- Every endpoint returns consistent `{ success, data, error }` shape

---

## FINAL LINE

**14 tickets total in 7 batches. Awaiting operator approval to begin execution.**

**STOP — NO IMPLEMENTATION UNTIL OPERATOR UNLOCK.**
