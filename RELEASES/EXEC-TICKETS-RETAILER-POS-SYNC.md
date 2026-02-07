# EXECUTION TICKETS: Retailer Dashboard ↔ POS Product Sync

**Source Audit:** `RELEASES/AUDIT-RETAILER-POS-PRODUCT-SYNC.md`
**Anchor:** `d20da5e`
**Date:** 2026-02-07
**Status:** AWAITING OPERATOR UNLOCK

---

## Pre-Implementation Findings

### Bidirectional Sync Status (Verified via Code Audit)

| Direction | Status | Mechanism |
|-----------|--------|-----------|
| Retailer CSV → POS | **WORKS** | Same tables (catalog.store_products + store_product_barcodes) |
| Retailer Web UI → POS | **WORKS** | Same tables, POS reads display_name + sell_price on scan |
| POS first-scan digitise → Retailer Dashboard | **WORKS** | POS writes to same catalog.store_products, Dashboard query has NO source filter |
| POS price edit → Retailer Dashboard | **WORKS** | POS PATCH updates sell_price in store_products, Dashboard reads same column |
| POS metadata edit → Retailer Dashboard | **WORKS** | POS PATCH updates display_name/brand, Dashboard reads same columns |
| Dashboard edit → POS | **WORKS** | Dashboard PATCH updates store_products, POS reads on next scan/search |
| Stock sync (both directions) | **WORKS** | Shared inventory.stock_balances + inventory_ledger (ledger-first) |
| Conflict resolution | **WORKS** | Last-Write-Wins via metadata_updated_at + metadata_updated_by |

### Architecture: Same DB, No Cache, Immediate Consistency

```
Retailer Dashboard ──writes──→ catalog.store_products ←──reads── POS App
                   ──writes──→ inventory.stock_balances ←──reads──
                   ──writes──→ store_product_barcodes   ←──reads──

POS App            ──writes──→ catalog.store_products ←──reads── Retailer Dashboard
                   ──writes──→ inventory.stock_balances ←──reads──
                   ──writes──→ store_product_barcodes   ←──reads──
```

**Key Code Refs:**
- POS create: `backend/src/routes/v1/pos/storeProducts.ts:100-246`
- POS edit (price): `backend/src/routes/v1/pos/storeProducts.ts:682-787`
- POS edit (metadata): `backend/src/routes/v1/pos/storeProducts.ts:906-1127`
- POS edit (stock): `backend/src/routes/v1/pos/storeProducts.ts:795-898`
- Dashboard list (shows POS products): `backend/src/routes/v1/retailer-admin/products.ts:51-174`
- Dashboard edit: `backend/src/routes/v1/retailer-admin/products.ts:436-649`
- LWW guard: Both use `metadata_updated_at IS NULL OR metadata_updated_at < $incoming`
- Freshness check: `backend/src/routes/v1/pos/storeProducts.ts:633-675`

---

## TICKET 1: RET-POS-SYNC-001 — CSV Re-Upload Dedup (P1)

### Problem
CSV re-upload (new jobId, same data) creates duplicate rows in `catalog.products`. The barcode insert uses `ON CONFLICT (store_id, barcode) DO NOTHING`, so new products are created WITHOUT barcode links — orphaned catalog entries visible in product lists but unsearchable by barcode.

### Root Cause
`csvImport.ts` commit loop always INSERTs new `catalog.products` rows with fresh UUIDs. No dedup key to detect "this product already exists in this store."

### Files to Modify
| File | Change |
|------|--------|
| `backend/src/routes/v1/retailer-admin/csvImport.ts` | Add barcode-based dedup lookup before INSERT |

### Implementation Steps

```
Step 1: In the commit loop (line ~444), BEFORE inserting catalog.products:
  - For PACKAGED products (have barcode):
    Query: SELECT sp.id, sp.product_id FROM catalog.store_product_barcodes spb
           JOIN catalog.store_products sp ON sp.id = spb.store_product_id
           WHERE spb.store_id = $storeId AND spb.barcode = $barcode AND sp.is_active = true
    If found → UPDATE existing store_products (price, stock, name) instead of INSERT

  - For LOOSE_BULK (no barcode):
    Query by name+mode: SELECT sp.id, sp.product_id FROM catalog.store_products sp
           JOIN catalog.products p ON p.id = sp.product_id
           WHERE sp.store_id = $storeId AND sp.is_active = true
             AND LOWER(TRIM(p.name)) = LOWER(TRIM($name))
             AND sp.product_mode = 'LOOSE_BULK'
    If found → UPDATE instead of INSERT

Step 2: Track created vs updated counts in response:
  - Change response from { created, skipped } to { created, updated, skipped }

Step 3: Update validation_errors JSONB to track which rows were updates vs creates

Step 4: Update platform.csv_imports to track products_updated count alongside products_created
```

### Acceptance Criteria
- [ ] Upload CSV with barcode `890100300000` → product created, count=1
- [ ] Re-upload same CSV → product UPDATED (price/stock), no new product row, `created=0, updated=1`
- [ ] DB: `SELECT COUNT(*) FROM catalog.store_product_barcodes WHERE barcode='890100300000' AND store_id=$X` = 1
- [ ] DB: No orphaned catalog.products rows without barcode links
- [ ] Existing tests still pass (`pnpm -r typecheck`)

### Test Tag
`@retailer-sync`

### Migration Required
None (application logic change only)

---

## TICKET 2: RET-POS-SYNC-002 — Error CSV Download (P2)

### Problem
When CSV import has row failures, errors are only returned as JSON. No downloadable error CSV for offline correction.

### Root Cause
No export endpoint exists. `platform.csv_imports.validation_errors` JSONB stores errors but has no CSV export route.

### Files to Modify
| File | Change |
|------|--------|
| `backend/src/routes/v1/retailer-admin/csvImport.ts` | Add GET endpoint for error CSV |
| `retailer-admin/src/pages/ImportPage.tsx` | Add "Download error CSV" button |

### Implementation Steps

```
Step 1: Add backend endpoint:
  GET /api/v1/retailer-admin/products/import/errors?jobId={jobId}

  Logic:
    1. Fetch platform.csv_imports WHERE id = $jobId AND store_id = $storeId
    2. Extract validation_errors.errors[] array
    3. Build CSV: row_number, name, barcode, error_category, error_message, original_data
    4. Return Content-Type: text/csv, Content-Disposition: attachment

Step 2: Add frontend button in ImportPage.tsx:
  - Show "Download Error Report (CSV)" button when failureSummary.total > 0
  - Trigger download via window.open() or fetch+blob
  - Place next to the existing error summary section (~line 389)

Step 3: Include both validation phase and commit phase errors:
  - Validation errors: from validate step (invalidCount > 0)
  - Commit errors: from commit step (failureSummary.details[])
```

### Acceptance Criteria
- [ ] Import CSV with 3 invalid rows → "Download Error Report" button appears
- [ ] Click button → CSV downloaded with 3 rows, each having: row_number, field, error message
- [ ] CSV parseable by Excel/Google Sheets
- [ ] Typecheck passes

### Test Tag
`@retailer-sync`

### Migration Required
None

---

## TICKET 3: RET-POS-SYNC-003 — Async CSV Commit for Scale (P2)

### Problem
CSV commit is synchronous. 10K rows × 5 inserts = 50K DB ops in one HTTP request. Risk of timeout.

### Root Cause
`csvImport.ts` commit uses synchronous for-loop in single transaction.

### Files to Modify
| File | Change |
|------|--------|
| `backend/src/routes/v1/retailer-admin/csvImport.ts` | Chunk commits, polling-based status |
| `retailer-admin/src/pages/ImportPage.tsx` | Poll for commit completion |

### Implementation Steps

```
Step 1: Change commit endpoint to return 202 Accepted immediately:
  - Set platform.csv_imports.status = 'committing'
  - Return { jobId, status: 'committing' }
  - Process rows in background (setImmediate or Bull queue)

Step 2: Add status polling endpoint:
  GET /api/v1/retailer-admin/products/import/status?jobId={jobId}
  Returns: { status: 'committing' | 'committed' | 'failed', progress: { created, skipped, total } }

Step 3: Process in chunks of 100 rows:
  - Each chunk in its own BEGIN/COMMIT
  - Update csv_imports.products_created after each chunk
  - If chunk fails, log and continue with next chunk

Step 4: Frontend polls /status every 2 seconds:
  - Show progress bar: "Creating products... 450/1000"
  - On status='committed' → show final results
```

### Acceptance Criteria
- [ ] Upload 1000-row CSV → commit returns 202 immediately (< 1 second)
- [ ] Poll shows progress incrementing
- [ ] All 1000 products created within 5 minutes
- [ ] No HTTP timeout errors
- [ ] Partial chunk failure does not block remaining chunks

### Test Tag
`@retailer-sync`

### Migration Required
None (platform.csv_imports already has status field)

**Priority:** P2 — works for typical imports < 1000 rows

---

## TICKET 4: RET-POS-SYNC-004 — Per-Store CSV Rate Limit (P2)

### Problem
No per-store rate limit on CSV upload. Could create excessive DB load.

### Files to Modify
| File | Change |
|------|--------|
| `backend/src/routes/v1/retailer-admin/csvImport.ts` | Add rate limit middleware |

### Implementation Steps

```
Step 1: Add rate limiter at top of csvImport.ts:
  import rateLimit from "express-rate-limit";

  const csvImportRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,  // 1 hour
    max: 10,                    // 10 imports per hour per store
    keyGenerator: (req) => getStoreId(req) || req.ip || 'unknown',
    message: { error: { code: 'RATE_LIMITED', message: 'Max 10 CSV imports per hour. Try again later.' } }
  });

Step 2: Apply to upload endpoint:
  retailerAdminCsvImportRouter.post("/products/import/upload", csvImportRateLimiter, async (req, res) => {

Step 3: Return Retry-After header when rate limited
```

### Acceptance Criteria
- [ ] 10 uploads in 1 hour → succeed
- [ ] 11th upload → 429 Too Many Requests with Retry-After header
- [ ] Different stores have independent rate limits

### Test Tag
`@retailer-sync`

### Migration Required
None

---

## TICKET 5: RET-POS-SYNC-005 — POS First-Scan → Retailer Dashboard Visibility E2E Test (P1)

### Problem
While code audit confirms POS-created products DO appear in Retailer Dashboard (same tables, no source filter), there is NO automated E2E test proving this. A future code change could silently break this.

### Current State (VERIFIED)
- POS creates via `POST /api/v1/pos/store-products` → writes `catalog.store_products`
- Dashboard reads via `GET /api/v1/retailer-admin/products` → reads same `catalog.store_products`
- Dashboard query has NO source filter (shows ALL store products)
- **This works today but has ZERO test coverage**

### Files to Create/Modify
| File | Change |
|------|--------|
| `e2e-tests/tests/retailer-pos-sync/pos-to-dashboard.spec.ts` | NEW: E2E test |
| `e2e-tests/package.json` | Add `test:sync` script |

### Implementation Steps

```
Step 1: Create e2e-tests/tests/retailer-pos-sync/pos-to-dashboard.spec.ts

  test.describe("@retailer-sync POS → Dashboard Sync", () => {

    test("POS first-scan digitised product appears in Dashboard product list", async ({ request }) => {
      // 1. Create product via POS endpoint (simulates first-time barcode scan)
      const createRes = await request.post(`${API}/pos/store-products`, {
        headers: { Authorization: `Bearer ${POS_DEVICE_TOKEN}` },
        data: {
          barcode: "8900000099001",
          name: "POS Scan Test Product",
          sellPrice: 2500,
          initialStockQty: 10,
          unit: "PCS"
        }
      });
      expect(createRes.status()).toBe(201);
      const { storeProduct } = await createRes.json();

      // 2. Fetch retailer dashboard product list
      const listRes = await request.get(`${API}/retailer-admin/products`, {
        headers: { "x-actor-id": STORE_ID }
      });
      expect(listRes.status()).toBe(200);
      const { data: products } = await listRes.json();

      // 3. Assert POS-created product IS in dashboard list
      const found = products.find(p => p.name === "POS Scan Test Product" ||
                                       p.barcode === "8900000099001");
      expect(found, "POS-created product must appear in Retailer Dashboard").toBeTruthy();
      expect(found.sellPrice).toBe(2500);
    });

    test("POS-created product is searchable by barcode in Dashboard", async ({ request }) => {
      const listRes = await request.get(
        `${API}/retailer-admin/products?search=8900000099001`,
        { headers: { "x-actor-id": STORE_ID } }
      );
      expect(listRes.status()).toBe(200);
      const { data: products } = await listRes.json();
      expect(products.length).toBeGreaterThan(0);
    });
  });

Step 2: Add script in e2e-tests/package.json:
  "test:sync": "playwright test --grep \"@retailer-sync\""
```

### Acceptance Criteria
- [ ] Test creates product via POS endpoint
- [ ] Test verifies product appears in Dashboard GET /retailer-admin/products
- [ ] Test verifies product is searchable by barcode in Dashboard
- [ ] Test runs with `pnpm --filter e2e-tests test:sync`
- [ ] Typecheck passes

### Test Tag
`@retailer-sync`

### Migration Required
None

---

## TICKET 6: RET-POS-SYNC-006 — POS Edit → Retailer Dashboard Sync E2E Test (P1)

### Problem
POS can edit product metadata (display_name, brand, sell_price, purchase_price, stock) via PATCH endpoints. While this writes to the same tables Dashboard reads, there is NO automated test proving edits propagate.

### Current State (VERIFIED)
- POS PATCH `/pos/store-products/metadata` → updates `catalog.store_products.display_name, brand, sell_price`
- POS PATCH `/pos/store-products/price` → updates `catalog.store_products.sell_price`
- POS PATCH `/pos/store-products/stock` → updates `inventory.stock_balances + catalog.store_products.current_stock`
- Dashboard reads all these columns from same tables
- LWW: `metadata_updated_by='POS_APP'` tracked

### Files to Create/Modify
| File | Change |
|------|--------|
| `e2e-tests/tests/retailer-pos-sync/edit-sync.spec.ts` | NEW: bidirectional edit tests |

### Implementation Steps

```
Step 1: Create e2e-tests/tests/retailer-pos-sync/edit-sync.spec.ts

  test.describe("@retailer-sync Bidirectional Edit Sync", () => {

    test("POS price edit reflects in Dashboard", async ({ request }) => {
      // 1. Create product via Dashboard
      const createRes = await request.post(`${API}/retailer-admin/products`, {
        headers: { "Content-Type": "application/json", "x-actor-id": STORE_ID },
        data: { mode: "PACKAGED", name: "Edit Sync Test", barcode: "8900000099010",
                sellPrice: 3000, purchasePrice: 2500, unit: "PCS" }
      });
      const { data } = await createRes.json();
      const productId = data.productId;

      // 2. POS edits the price
      await request.patch(`${API}/pos/store-products/price`, {
        headers: { Authorization: `Bearer ${POS_DEVICE_TOKEN}` },
        data: { barcode: "8900000099010", sellPrice: 5000 }
      });

      // 3. Dashboard sees updated price
      const listRes = await request.get(`${API}/retailer-admin/products`, {
        headers: { "x-actor-id": STORE_ID }
      });
      const products = (await listRes.json()).data;
      const product = products.find(p => p.barcode === "8900000099010");
      expect(product.sellPrice, "Dashboard must see POS price edit").toBe(5000);
    });

    test("POS metadata edit (name/brand) reflects in Dashboard", async ({ request }) => {
      // 1. POS updates display_name and brand
      await request.patch(`${API}/pos/store-products/metadata`, {
        headers: { Authorization: `Bearer ${POS_DEVICE_TOKEN}` },
        data: { barcode: "8900000099010", displayName: "New POS Name", brand: "POS Brand" }
      });

      // 2. Dashboard sees updated name and brand
      const listRes = await request.get(`${API}/retailer-admin/products`, {
        headers: { "x-actor-id": STORE_ID }
      });
      const products = (await listRes.json()).data;
      const product = products.find(p => p.barcode === "8900000099010");
      expect(product.name).toBe("New POS Name");
      expect(product.brand).toBe("POS Brand");
    });

    test("Dashboard edit reflects in POS scan", async ({ request }) => {
      // 1. Dashboard updates price and name
      await request.patch(`${API}/retailer-admin/products/${PRODUCT_ID}`, {
        headers: { "Content-Type": "application/json", "x-actor-id": STORE_ID },
        data: { sellPrice: 7000, name: "Dashboard Updated Name" }
      });

      // 2. POS barcode lookup sees new price and name
      const scanRes = await request.get(
        `${API}/pos/products/lookup?barcode=8900000099010`,
        { headers: { Authorization: `Bearer ${POS_DEVICE_TOKEN}` } }
      );
      const product = (await scanRes.json()).product;
      expect(product.priceMinor, "POS must see Dashboard price edit").toBe(7000);
      expect(product.name).toBe("Dashboard Updated Name");
    });

    test("Dashboard stock edit reflects in POS", async ({ request }) => {
      // 1. Dashboard sets stock to 200
      await request.patch(`${API}/retailer-admin/products/${PRODUCT_ID}`, {
        headers: { "Content-Type": "application/json", "x-actor-id": STORE_ID },
        data: { openingStockQty: 200 }
      });

      // 2. POS catalog shows updated stock
      const catalogRes = await request.get(
        `${API}/catalog/stores/${STORE_ID}/catalog?q=8900000099010`,
        { headers: { Authorization: `Bearer ${POS_DEVICE_TOKEN}` } }
      );
      const products = (await catalogRes.json()).data;
      expect(products[0].currentStock).toBe(200);
    });

    test("LWW: Dashboard edit wins over stale POS edit", async ({ request }) => {
      // 1. Dashboard edits at T1 (now)
      await request.patch(`${API}/retailer-admin/products/${PRODUCT_ID}`, {
        headers: { "Content-Type": "application/json", "x-actor-id": STORE_ID },
        data: { name: "Dashboard Wins", metadataUpdatedAt: new Date().toISOString() }
      });

      // 2. POS tries stale edit at T0 (1 hour ago)
      const staleTime = new Date(Date.now() - 3600000).toISOString();
      const posRes = await request.patch(`${API}/pos/store-products/:id/metadata`, {
        headers: { Authorization: `Bearer ${POS_DEVICE_TOKEN}` },
        data: { displayName: "POS Stale", metadataUpdatedAt: staleTime }
      });

      // 3. Stale edit rejected (409) OR Dashboard name preserved
      // Verify Dashboard name is still "Dashboard Wins"
      const listRes = await request.get(`${API}/retailer-admin/products`, {
        headers: { "x-actor-id": STORE_ID }
      });
      const product = (await listRes.json()).data.find(p => p.barcode === "8900000099010");
      expect(product.name).toBe("Dashboard Wins");
    });
  });
```

### Acceptance Criteria
- [ ] POS price edit → Dashboard shows new price
- [ ] POS name/brand edit → Dashboard shows new name/brand
- [ ] Dashboard price edit → POS scan returns new price
- [ ] Dashboard stock edit → POS catalog shows new stock
- [ ] LWW: stale edit rejected, newer edit preserved
- [ ] Typecheck passes

### Test Tag
`@retailer-sync`

### Migration Required
None

---

## TICKET 7: RET-POS-SYNC-007 — Dashboard Soft-Delete → POS Behavior E2E Test (P1)

### Problem
When Retailer Dashboard deletes (soft-deletes) a product, POS should NOT find it. When POS creates a product and Dashboard later disables it, both sides must agree. No test coverage.

### Current State
- DELETE `/retailer-admin/products/:id` → sets `is_active=false`
- POS scan query filters: `WHERE sp.is_active = true AND p.is_active = true`
- Should work, needs test proof

### Files to Create/Modify
| File | Change |
|------|--------|
| `e2e-tests/tests/retailer-pos-sync/delete-sync.spec.ts` | NEW: delete sync tests |

### Implementation Steps

```
test("Dashboard soft-delete hides product from POS", async ({ request }) => {
  // 1. Create product
  // 2. POS can scan it (200 OK)
  // 3. Dashboard deletes it (DELETE /retailer-admin/products/:id)
  // 4. POS scan returns 404
});

test("POS-created product can be deleted from Dashboard", async ({ request }) => {
  // 1. POS creates product via /pos/store-products
  // 2. Dashboard lists it (GET /retailer-admin/products)
  // 3. Dashboard deletes it
  // 4. POS scan returns 404
  // 5. Dashboard list no longer includes it
});
```

### Acceptance Criteria
- [ ] Dashboard delete → POS scan returns 404
- [ ] POS-created product deletable from Dashboard
- [ ] Deleted product absent from both Dashboard list and POS scan

### Test Tag
`@retailer-sync`

---

## TICKET 8: RET-POS-SYNC-008 — Store Isolation E2E Test (P1)

### Problem
Products from Store A must never appear in Store B POS or Dashboard. No automated test for cross-store contamination.

### Files to Create/Modify
| File | Change |
|------|--------|
| `e2e-tests/tests/retailer-pos-sync/store-isolation.spec.ts` | NEW: isolation tests |

### Implementation Steps

```
test("CSV product in Store A invisible in Store B POS", async ({ request }) => {
  // 1. Upload CSV to Store A (barcode "8900000099020")
  // 2. POS scan in Store B → 404
  // 3. Dashboard list in Store B → not found
});

test("POS product in Store A invisible in Store B Dashboard", async ({ request }) => {
  // 1. POS creates product in Store A
  // 2. Dashboard list in Store B → not found
});

test("Same barcode in two stores are independent products", async ({ request }) => {
  // 1. Create product with barcode X in Store A (price 1000)
  // 2. Create product with barcode X in Store B (price 2000)
  // 3. POS scan in Store A → price 1000
  // 4. POS scan in Store B → price 2000
});
```

### Acceptance Criteria
- [ ] Store A products invisible in Store B (both POS and Dashboard)
- [ ] Same barcode in two stores → independent products with independent prices

### Test Tag
`@retailer-sync`

---

## TICKET 9: RET-POS-SYNC-009 — POS Edit Product UI/Modal Audit & Fix (P1)

### Problem
The operator asked to verify whether POS edit screens/modals for products correctly sync metadata changes back to the backend (and thus to Dashboard). Need to audit the POS app screens for product editing and verify they call the correct PATCH endpoints with LWW timestamps.

### Current State (VERIFIED via code audit)
POS has these edit paths:
- **Sell-first onboarding modal**: Sets sell_price during first scan → `POST /pos/store-products`
- **Price update**: Via scan flow → `POST /pos/products/price` (posScanStore.ts)
- **Metadata PATCH**: `PATCH /pos/store-products/metadata` — updates display_name, brand, sell_price, purchase_price
- **Stock PATCH**: `PATCH /pos/store-products/stock` — updates stock level via ledger

### Files to Audit/Modify
| File | Purpose |
|------|---------|
| `src/services/scan/scanService.ts` | POS scan → cart/digitise orchestration |
| `src/api/productsApi.ts` | POS product API calls |
| `src/api/scanApi.ts` | POS scan API calls |
| `src/screens/` or `src/components/` | Product edit modals (search for edit/price/product modals) |
| `backend/src/routes/v1/pos/storeProducts.ts` | Backend PATCH endpoints |

### Implementation Steps

```
Step 1: Audit POS app for all product edit touchpoints:
  - Search for: Modal, BottomSheet, edit, price, product form components
  - Verify each calls the correct PATCH endpoint
  - Verify LWW timestamp (metadataUpdatedAt) is sent with each edit

Step 2: If any edit path is MISSING metadataUpdatedAt:
  - Add metadataUpdatedAt: new Date().toISOString() to the request body
  - This prevents stale edits from overwriting newer Dashboard changes

Step 3: If any edit path writes to local state ONLY (not backend):
  - Add backend PATCH call before updating local state
  - Handle 409 Conflict response (show "Product was updated elsewhere" message)

Step 4: Verify POS edit response includes updated values:
  - After PATCH, POS should read back the server's canonical values
  - Not just trust the local optimistic update
```

### Acceptance Criteria
- [ ] Every POS product edit screen/modal calls correct PATCH endpoint
- [ ] Every PATCH includes metadataUpdatedAt for LWW
- [ ] 409 Conflict handled gracefully (show message, refresh product)
- [ ] Edited values visible in Retailer Dashboard immediately
- [ ] Typecheck passes, POS builds

### Test Tag
`@retailer-sync`

---

## TICKET 10: RET-POS-SYNC-010 — Retailer Dashboard Edit → POS Freshness Signal (P2)

### Problem
When Dashboard edits a product, POS has no push notification. POS relies on next scan/search to see updated values. If POS has cached product data in local state (React state, Zustand store), it may show stale data until next API call.

### Current State
- POS has `GET /pos/store-products/freshness` → returns `MAX(updated_at, metadata_updated_at)`
- POS scan service makes fresh DB query each time (no HTTP cache)
- But POS product list screens may hold stale data in React state

### Files to Audit/Modify
| File | Purpose |
|------|---------|
| `src/stores/` | Zustand stores holding product data |
| `src/screens/` | Screens displaying product lists/details |
| `backend/src/routes/v1/pos/storeProducts.ts:633-675` | Freshness endpoint |

### Implementation Steps

```
Step 1: Audit POS app for product data caching:
  - Search Zustand stores for product-related state
  - Identify screens that display cached product data
  - Check if any screen fails to re-fetch after returning from edit

Step 2: Add freshness check on POS product list screen:
  - On screen focus/mount, call GET /pos/store-products/freshness
  - Compare with last-known timestamp
  - If newer → re-fetch product list

Step 3: After POS edit, invalidate local product cache:
  - After PATCH response, update Zustand store with response values
  - Or trigger full re-fetch
```

### Acceptance Criteria
- [ ] Dashboard edits a product price
- [ ] POS navigates to product list → sees updated price (not stale)
- [ ] POS scans product → sees updated price immediately
- [ ] No HTTP caching interferes (Cache-Control: no-store)

### Test Tag
`@retailer-sync`

---

## Execution Order & Dependencies

```
Phase 1 — Critical (P1, no dependencies):
  TICKET 1:  RET-POS-SYNC-001 (CSV dedup)         ← Prevents data corruption
  TICKET 5:  RET-POS-SYNC-005 (POS→Dashboard test) ← Proves sync works
  TICKET 6:  RET-POS-SYNC-006 (Edit sync test)     ← Proves edits propagate
  TICKET 7:  RET-POS-SYNC-007 (Delete sync test)   ← Proves delete works
  TICKET 8:  RET-POS-SYNC-008 (Store isolation)    ← Proves multi-tenancy
  TICKET 9:  RET-POS-SYNC-009 (POS edit UI audit)  ← Verifies POS sends correct PATCH

Phase 2 — Important (P2, after Phase 1):
  TICKET 2:  RET-POS-SYNC-002 (Error CSV download)
  TICKET 4:  RET-POS-SYNC-004 (Per-store rate limit)
  TICKET 10: RET-POS-SYNC-010 (POS freshness signal)

Phase 3 — Scale (P2, after Phase 2):
  TICKET 3:  RET-POS-SYNC-003 (Async CSV commit)
```

### Gate After All Tickets

```
pnpm -r typecheck                          # Must pass
pnpm --filter e2e-tests test:sync          # All @retailer-sync tests pass
pnpm --filter e2e-tests test:onboarding    # No regression
```

---

**STOP. Awaiting operator unlock to begin implementation.**
