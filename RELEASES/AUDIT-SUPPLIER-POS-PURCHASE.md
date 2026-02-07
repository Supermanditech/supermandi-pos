# AUDIT: Supplier → POS Buy/Purchase (B2B Wholesale, 10,000 Suppliers)

**Date:** 2026-02-07
**Anchor:** 68767e6 (main)
**Scope:** Supplier Portal → SuperAdmin → POS BUY/PURCHASE end-to-end

---

## PART 1 — DATA FLOW AUDIT

### Step 1: Supplier Creates/Lists Product in Supplier Portal

| Detail | Value |
|--------|-------|
| **Route** | `POST /api/v1/supplier/products` |
| **File** | `backend/src/routes/v1/supplier/products.ts` |
| **Table Written** | `catalog.supplier_products` |
| **Primary Key** | `id` (UUID) |
| **Foreign Keys** | `supplier_id` → `supplier.suppliers(id)` |
| **Status Fields** | `approval_status` = `'pending'` (auto), `is_active` = `true` |
| **Who Can Write** | Supplier (own products only, via `requireSupplierAuth` + `requireActiveSupplier`) |
| **Who Can Read** | Supplier (own), SuperAdmin (all pending), POS (approved only via buy-catalog) |
| **Key Fields** | name, category, brand, barcode, supplier_sku, purchase_price, mrp, moq, unit |
| **Validation** | MRP >= purchase_price (GL-WF-017), barcode GTIN (GL-WF-056), category FMCG taxonomy (GL-WF-057), MOQ 1-10000 |
| **Bulk Upload** | `POST /api/v1/supplier/products/csv-upload` (CSV with flexible headers) |

**Frontend:** `supplier-portal/src/app/(dashboard)/products/page.tsx` — Full CRUD + CSV upload + resubmit for rejected

### Step 2: Where Stored (Tables/Columns)

**Primary Table:** `catalog.supplier_products`
```
id UUID PK
supplier_id UUID FK → supplier.suppliers
name VARCHAR(500) NOT NULL
category VARCHAR(255)
brand VARCHAR(255)
barcode VARCHAR(100)
supplier_sku VARCHAR(100)
purchase_price INTEGER NOT NULL (paise)
mrp INTEGER (paise)
moq INTEGER DEFAULT 1
unit VARCHAR(50)
stock_quantity INTEGER DEFAULT 0
stock_status VARCHAR(20) DEFAULT 'available'
approval_status VARCHAR(20) DEFAULT 'pending' → pending|approved|rejected
rejection_reason TEXT
edited_name VARCHAR(200) — SuperAdmin override
edited_category VARCHAR(100) — SuperAdmin override
supermandi_margin_minor INTEGER DEFAULT 0 — Fixed margin (paise)
margin_percent DECIMAL(5,2) — Percentage margin (mutually exclusive)
bnpl_eligible BOOLEAN DEFAULT FALSE
bnpl_max_days INTEGER DEFAULT 7
approved_at TIMESTAMPTZ
approved_by UUID
is_active BOOLEAN DEFAULT true
created_at, updated_at TIMESTAMPTZ
```

**Indexes:** `idx_sp_visibility` (supplier_id WHERE approval_status='approved'), `idx_sp_approval_status`, trigram on name

### Step 3: How It Appears in SuperAdmin

| Detail | Value |
|--------|-------|
| **Route** | `GET /api/v1/admin/products/pending` |
| **File** | `backend/src/routes/v1/admin/suppliers.ts` (line 598) |
| **Permission** | `products:read` (GO-LIVE-128) |
| **Table Read** | `catalog.supplier_products` WHERE `approval_status='pending'` |
| **Joins** | `supplier.suppliers` (for supplier name) |
| **Returns** | id, productName, skuCode, barcode, purchasePrice, mrp, moq, supplierId, supplierName |

**Frontend:** `supermandi-superadmin/src/App.tsx` (lines 3103-3176) — Grid of pending products with approve/reject/edit buttons

### Step 4: How SuperAdmin Edits + Applies SuperMandi Profit

| Detail | Value |
|--------|-------|
| **Route** | `PUT /api/v1/admin/products/:productId/edit` (SA-1.3-003) |
| **File** | `backend/src/routes/v1/admin/suppliers.ts` (line 837) |
| **Permission** | `products:update` |
| **Editable Fields** | `editedName`, `editedCategory`, `superMandiMarginMinor`, `marginPercent`, `bnplEligible`, `bnplMaxDays` |
| **Margin Rule** | Fixed (paise) and Percent are **mutually exclusive** — setting one clears the other |
| **BNPL Range** | 1-90 days (GO-LIVE-165) |
| **Supplier Gate** | Product must have supplier_id, supplier must be verified (GO-LIVE-131) |
| **Audit Trail** | `supplier.approval_logs` with changes JSONB |
| **Price Formula** | `retailerPrice = purchase_price + COALESCE(supermandi_margin_minor, 0)` |

**Frontend:** `supermandi-superadmin/src/App.tsx` (lines 3178-3293) — Modal with margin type toggle (Fixed INR / Percentage), real-time retailerPrice preview, BNPL checkbox + max days

### Step 5: How Approved Product Becomes Visible in POS BUY/PURCHASE

| Detail | Value |
|--------|-------|
| **Approve Route** | `POST /api/v1/admin/products/:productId/approve` |
| **Status Transition** | `approval_status: 'pending' → 'approved'`, sets `approved_at`, `approved_by` |
| **POS BUY Catalog Route** | `GET /api/v1/catalog/stores/:storeId/buy-catalog` (SM-003) |
| **File** | `backend/src/routes/v1/catalog.ts` (line 309) |
| **Visibility Query** | `supplier.suppliers.status='verified' AND supplier_products.approval_status='approved' AND supplier_store_links.store_id=$1 AND supplier_store_links.status='active'` |
| **Price in Response** | `retailerPrice = purchase_price + COALESCE(supermandi_margin_minor, 0)` |
| **Returns** | id, name, category, brand, barcode, supplierPrice, retailerPrice, margin, marginPercent, supplierName, supplierId, bnplEligible, bnplMaxDays, stockQty, stockStatus, moq, unit, mrp |

### Step 6: Store Isolation Enforcement

| Mechanism | Table | Rule |
|-----------|-------|------|
| **Supplier-Store Link** | `supplier.supplier_store_links` | N:M mapping with `store_id` + `supplier_id` + `status='active'` |
| **Buy Catalog Query** | `catalog.ts` line 327 | `ssl.store_id = $1 AND ssl.status = 'active'` JOIN on supplier_store_links |
| **POS Device Token** | `middleware/deviceToken.ts` | `requireDeviceToken` extracts `storeId` from device, enforces `enforceStoreBinding` |
| **Supplier Products** | `catalog.supplier_products` | Scoped by `supplier_id` (suppliers are linked to specific stores) |
| **Orders** | `orders.purchase_orders` | `store_id` FK — POS can only see own store's orders |
| **Supplier Sees** | `supplier/orders.ts` | Filters by `sp.supplier_id = $1` — supplier only sees orders containing their products |

**BLOCKER CHECK:** No step requires manual DB actions — all flows have API + UI coverage.

---

## PART 2 — POS SCALE UX AUDIT (10,000 Suppliers)

### Current POS Display Model: HYBRID (Model B + partial Model C)

**BuyScreen** (`src/screens/BuyScreen.tsx`):
- 2-column product grid with infinite scroll
- Search (400ms debounce) + category filter + stock status filter
- ProductDetailModal shows all suppliers per product (Model C drilldown)
- Supplier count badge on each product card
- Performance: `maxToRenderPerBatch=10`, `windowSize=5`, `removeClippedSubviews=true`

**PurchaseScreen** (`src/screens/PurchaseScreen.tsx`):
- Segmented: Quick Purchase (scanner) + Live Suppliers (Model B: supplier-first)
- Live Suppliers: 3-column grid from `GET /pos/suppliers/:id/products`
- Barcode scanner for Quick Purchase mode

### CRITICAL GAP: Frontend ↔ Backend Mismatch

| Issue | Severity | Detail |
|-------|----------|--------|
| **BuyScreen calls SELL catalog** | **P0** | `catalogApi.getCatalog()` calls `/api/v1/catalog/stores/{storeId}/catalog` which returns `store_products` (SELL), not `supplier_products` (BUY). Returns `suppliers: []` (empty array). |
| **Buy catalog returns flat rows** | **P0** | `/buy-catalog` (SM-003) returns one row per supplier-product. Frontend `CatalogProduct` expects grouped product with nested `suppliers: CatalogSupplier[]` array. Format mismatch. |
| **No product grouping** | **P1** | `catalog.supplier_product_map` table exists but is NOT used in buy-catalog query. Same product from 5 suppliers = 5 separate rows instead of 1 grouped product. |
| **No order creation endpoint** | **P0** | Frontend `orderApi.createOrder()` calls `POST /api/v1/orders/stores/{storeId}/orders` — this route **DOES NOT EXIST** in backend `orders.ts`. Only list, get, cancel, delete, pay, receive exist. |

### Audit Checklist (10K Scale)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| **1. Grouping Key** | PARTIAL | `catalog.supplier_product_map` table exists (links supplier_product → master product). NOT used in buy-catalog query. |
| **2. Offer Object** | EXISTS | Buy catalog returns: supplierName, supplierPrice, retailerPrice (with margin), moq, unit, bnplEligible, stockStatus per row. |
| **3. Search** | EXISTS | Buy catalog supports `q` (ILIKE on name/barcode/sku), `category`, `supplierId` filters. Paginated. |
| **4. Ranking** | PARTIAL | Frontend `getBestSupplier()` sorts by lowest price (in-stock first). `getPreferredOrBestSupplier()` checks `isPreferred` flag. Backend does NOT rank — returns alphabetical. |
| **5. Cart Correctness** | EXISTS | Cart binds to `supplierProductId` (unique per supplier+product). Cart groups by supplier. MOQ enforced. |
| **6. Performance** | EXISTS | Paginated API (max 200/page), FlatList optimizations, debounced search. |
| **7. Conflict Cases** | GAP | Same barcode across suppliers — buy-catalog does NOT return multiple offers for barcode lookup. Only text search. Barcode scan in PurchaseScreen hits supplier-specific endpoint, not cross-supplier. |

---

## PART 3 — SUPERADMIN WHOLESALE CONTROL AUDIT

| Capability | Status | Route/Evidence |
|-----------|--------|----------------|
| **1. See supplier products (pending/approved)** | PASS | `GET /api/v1/admin/products/pending` → `catalog.supplier_products WHERE approval_status='pending'`. Frontend grid shows all pending with supplier name. |
| **2. Edit/correct supplier-listed data** | PASS | `PUT /api/v1/admin/products/:id/edit` → Updates `edited_name`, `edited_category`. Frontend modal with name override input. |
| **3. Apply SuperMandi profit per supplier-SKU** | PASS | Same `/edit` route → `superMandiMarginMinor` (fixed paise) OR `marginPercent` (%). Mutually exclusive. Frontend shows real-time retailerPrice preview. |
| **4. Approve/Reject** | PASS | `POST /api/v1/admin/products/:id/approve` + `POST /:id/reject`. Supplier verification gate (GO-LIVE-131). Audit trail in `supplier.approval_logs`. |
| **5. POS sees final_buy_price (base + margin)** | PASS (API) | Buy catalog query: `purchase_price + COALESCE(supermandi_margin_minor, 0) AS retailerPrice`. **BUT** BuyScreen doesn't call buy-catalog (see P0 gap). |
| **6. Override duplicates / canonicalize** | PARTIAL | `catalog.supplier_product_map` table exists with `mapping_type` (auto/manual), `confidence`, `is_verified`. No SuperAdmin UI for mapping management. |

---

## PART 4 — BLACKBOX VERIFICATION MATRIX

| # | Step | Action | Expected | Actual (Code Audit) | PASS/FAIL |
|---|------|--------|----------|---------------------|-----------|
| 1 | Supplier creates product | `POST /supplier/products` with name, price, barcode | Product stored in `catalog.supplier_products` with `approval_status='pending'` | Route exists, validation implemented, status set correctly | **PASS** (code verified) |
| 2 | Product appears in admin pending | `GET /admin/products/pending` | Returns pending products with supplier info | Route exists, query correct, permission checked | **PASS** (code verified) |
| 3 | Admin adds margin | `PUT /admin/products/:id/edit` with `superMandiMarginMinor=500` | Margin stored, retailerPrice = purchase_price + 500 | Route exists, mutual exclusivity enforced, audit logged | **PASS** (code verified) |
| 4 | Admin approves | `POST /admin/products/:id/approve` | `approval_status='approved'`, `approved_at` set | Route exists, supplier verification gate present | **PASS** (code verified) |
| 5 | Product visible in POS BUY | `GET /catalog/stores/:id/buy-catalog` | Returns approved products with retailerPrice | Route exists, visibility query correct, margin applied | **PASS** (API exists) |
| 6 | **BuyScreen shows products** | POS app BuyScreen loads | Shows grouped products from buy-catalog | **BuyScreen calls `/catalog` (SELL) not `/buy-catalog` (BUY). Returns `suppliers: []`** | **FAIL — P0** |
| 7 | POS search "Rice" | Search in BuyScreen | Grouped results, not 100K flat list | Buy-catalog supports search, but **no grouping** — same product from N suppliers = N rows | **FAIL — P1** |
| 8 | POS select offer | Tap product → see supplier offers | ProductDetailModal shows suppliers with prices | Frontend exists but **never receives supplier data** (calls wrong endpoint) | **FAIL — P0** |
| 9 | Barcode scan | Scan barcode in POS | Returns offer(s) with disambiguation | PurchaseScreen scanner hits supplier-specific endpoint. **No cross-supplier barcode lookup.** | **FAIL — P1** |
| 10 | POS create order | Select offer → add to cart → place order | `POST /orders/stores/:id/orders` creates PO | **Route DOES NOT EXIST in backend.** Frontend calls it but 404. | **FAIL — P0** |
| 11 | Order visible to supplier | Supplier portal → Orders page | Order with items, store name, status | Backend `GET /supplier/orders` exists with item-level details. Frontend orders page exists. | **PASS** (code verified) |
| 12 | Supplier confirms/ships | Status transition on order | Status updates with audit trail | PATCH routes exist for status, shipment, item-level status. Frontend supports it. | **PASS** (code verified) |
| 13 | Supplier sees product sold details | Order detail on supplier portal | Product name, qty, price, store name, status per item | Supplier orders page shows per-item details. | **PASS** (code verified) |

**Summary: 8 PASS, 5 FAIL (3 P0, 2 P1)**

---

## PART 5 — See EXEC-TICKETS-SUPPLIER-POS-PURCHASE.md
