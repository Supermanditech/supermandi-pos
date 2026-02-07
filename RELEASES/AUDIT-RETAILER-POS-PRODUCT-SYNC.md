# AUDIT: Retailer Dashboard → POS Product Sync

**Mode:** AUDIT ONLY (read-only). No code changes.
**Anchor/HEAD:** `d20da5e`
**Date:** 2026-02-07
**Auditor:** Claude (code audit)

---

## C1 — System Map (Hard Evidence)

### Use Case 1: CSV Upload

```
UI Page:  retailer-admin/src/pages/ImportPage.tsx
          Route: /s/{storeCode}/import
          Drag-and-drop .csv upload, 3-step flow (upload → validate → commit)

API Endpoints:
  GET  /api/v1/retailer-admin/products/import/template   → Download CSV template
  POST /api/v1/retailer-admin/products/import/upload      → Store CSV, get jobId
  POST /api/v1/retailer-admin/products/import/validate    → Parse + validate rows
  POST /api/v1/retailer-admin/products/import/commit      → Insert products into DB

Backend Route File:
  backend/src/routes/v1/retailer-admin/csvImport.ts (878 lines)

Functions:
  upload   → parse CSV, INSERT into platform.csv_imports (job tracking)
  validate → parseCSVLine(), mapHeadersToRow(), row validation, UPDATE csv_imports
  commit   → BEGIN txn, per-row INSERT loop, COMMIT

DB Tables Written (in order per row):
  1. catalog.products           (id, name, brand, unit, primary_barcode, hsn_code, gst_rate)
  2. catalog.store_products     (store_id, product_id, sell_price, mrp, purchase_price, product_mode, current_stock)
  3. catalog.store_product_barcodes (store_id, store_product_id, barcode, source)
  4. inventory.inventory_ledger  (store_id, product_id, delta_qty, transaction_type='opening_stock', source='CSV_IMPORT')
  5. inventory.stock_balances    (store_id, product_id, current_qty — ON CONFLICT DO UPDATE)
  Job tracking: platform.csv_imports (status, validation_errors JSONB)

POS Endpoints That Read These Tables:
  POST /api/v1/pos/scan/resolve     → fetchStoreProductByBarcode() in posScanStore.ts
  GET  /api/v1/pos/products/lookup   → lookupProductByBarcode() in posScanStore.ts
  GET  /api/v1/catalog/stores/:id/catalog → paginated catalog query

Background Jobs/Queues/Caches:
  NONE — all synchronous, direct DB writes, no queue, no cache
```

### Use Case 2: Web UI Digitise Products

```
UI Page:  retailer-admin/src/pages/ProductsPage.tsx
          Route: /s/{storeCode}/products
          Product form with PACKAGED/LOOSE_BULK modes

API Endpoints:
  GET    /api/v1/retailer-admin/products              → List store products
  POST   /api/v1/retailer-admin/products              → Create product (RCAT-PROD-001)
  PATCH  /api/v1/retailer-admin/products/:id          → Update product (RCAT-PROD-003)
  DELETE /api/v1/retailer-admin/products/:id           → Soft-delete (is_active=false)
  POST   /api/v1/retailer-admin/products/loose         → Create LOOSE_BULK product
  POST   /api/v1/retailer-admin/products/bulk          → Bulk paste (up to 500 products)
  GET    /api/v1/retailer-admin/products/:id/sku.pdf   → SKU barcode label PDF

Backend Route File:
  backend/src/routes/v1/retailer-admin/products.ts

Functions:
  POST   → INSERT catalog.products → INSERT catalog.store_products → INSERT barcode → ledger → stock_balances
  PATCH  → UPDATE catalog.products + store_products + stock adjustment via ledger
  DELETE → UPDATE catalog.store_products SET is_active=false (soft-delete)

DB Tables Written (SAME as CSV — unified write path):
  1. catalog.products
  2. catalog.store_products
  3. catalog.store_product_barcodes
  4. inventory.inventory_ledger  (source='RETAILER_DASHBOARD')
  5. inventory.stock_balances

POS Read Path: IDENTICAL to CSV (same tables, same queries)

Background Jobs/Queues/Caches: NONE
```

### POS Read Path (B3)

```
POS App: React Native / Expo (root of repo)
  Scanner:    src/services/scan/scanService.ts  → handleScan()
  API Client: src/api/scanApi.ts                → resolveScan(), lookupProductByBarcode()
  Products:   src/api/productsApi.ts            → lookupStoreProductByScan()

POS Backend Endpoints:
  POST /api/v1/pos/scan/resolve          → posScanStore.ts:resolveScan() / resolveScanForDigitisation()
  GET  /api/v1/pos/products/lookup       → posScanStore.ts:lookupProductByBarcode()
  GET  /api/v1/catalog/stores/:id/catalog → catalog.ts (paginated product list)
  POST /api/v1/pos/store-products        → storeProductDigitisationService.ts (create from POS)

Barcode Resolution Order (posScanStore.ts:fetchStoreProductByBarcode):
  1. catalog.store_product_barcodes (store-scoped, barcode match)
  2. catalog.products.primary_barcode (global match)
  3. catalog.product_barcodes (global barcode table)
  4. FALLBACK: legacy schema (barcodes → variants → retailer_variants)

Query (core):
  FROM catalog.store_products sp
  JOIN catalog.products p ON p.id = sp.product_id
  LEFT JOIN inventory.stock_balances sb ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
  LEFT JOIN catalog.store_product_barcodes spb ON spb.store_product_id = sp.id AND spb.store_id = sp.store_id
  WHERE sp.store_id = $storeId AND sp.is_active = true AND p.is_active = true

Auth: requireDeviceToken middleware (device JWT with storeId binding)
Rate Limit: 120 scans/minute per device (GO-LIVE-040)
```

### Sync Semantics (B4)

```
Architecture: DIRECT (same PostgreSQL tables)
  Retailer writes → catalog.store_products / store_product_barcodes / stock_balances
  POS reads       → catalog.store_products / store_product_barcodes / stock_balances

Sync Method:     Same DB, no queue, no worker, no cache
Consistency:     IMMEDIATE (within same transaction)
Cache:           NONE (POS queries DB directly on each scan/search)
POS Refresh:     On-demand per scan/search (no polling, no background sync)
CSV Upload:      Does NOT trigger any POS push/notification
Invalidation:    Not needed (no cache to invalidate)

Conclusion: Retailer product writes are visible to POS immediately upon COMMIT.
No consistency window. No cache staleness risk.
```

---

## C2 — Runtime Verification Pack

All commands target the local-prod docker stack (`http://localhost:3010`).
Auth tokens must be obtained first.

### Prerequisites

```bash
# Get retailer auth token (replace with real store credentials)
STORE_ID="<your-store-id>"
AUTH_TOKEN="<jwt-from-login>"

# For POS endpoints (device token)
DEVICE_TOKEN="<pos-device-jwt>"

API="http://localhost:3010/api/v1"
```

### Tests for CSV Upload

```bash
# 1. Download CSV template
curl -s "$API/retailer-admin/products/import/template" \
  -H "x-actor-id: $STORE_ID" \
  -o template.csv
# PASS: File downloaded, contains header row with: name,barcode,brand,unit,sell_price,...

# 2. Upload CSV
curl -s -X POST "$API/retailer-admin/products/import/upload" \
  -H "Content-Type: application/json" \
  -H "x-actor-id: $STORE_ID" \
  -d "{\"csvContent\":\"name,barcode,brand,unit,sell_price,purchase_price,mrp,stock,mode\\nAudit Test Salt,8900000000001,Tata,PCS,28.00,25.00,28.00,100,PACKAGED\",\"fileName\":\"audit-test.csv\"}"
# PASS: 200 OK, response has { jobId, totalRows: 1 }
# SAVE: JOB_ID from response

# 3. Validate
curl -s -X POST "$API/retailer-admin/products/import/validate?jobId=$JOB_ID" \
  -H "x-actor-id: $STORE_ID"
# PASS: { validCount: 1, invalidCount: 0 }

# 4. Commit
curl -s -X POST "$API/retailer-admin/products/import/commit?jobId=$JOB_ID" \
  -H "x-actor-id: $STORE_ID"
# PASS: { created: 1, skipped: 0 }

# 5. DB Proof — verify product in catalog.store_products
psql $DATABASE_URL -c "
  SELECT sp.id, p.name, p.primary_barcode, sp.sell_price, sp.product_mode
  FROM catalog.store_products sp
  JOIN catalog.products p ON p.id = sp.product_id
  WHERE sp.store_id = '$STORE_ID' AND p.name ILIKE '%Audit Test Salt%'
  LIMIT 1;
"
# PASS: Row returned with name='Audit Test Salt', sell_price=2800, product_mode='PACKAGED'

# 6. DB Proof — verify barcode in store_product_barcodes
psql $DATABASE_URL -c "
  SELECT barcode, source FROM catalog.store_product_barcodes
  WHERE store_id = '$STORE_ID' AND barcode = '8900000000001';
"
# PASS: Row with source='retailer_digitisation'

# 7. DB Proof — verify stock in stock_balances
psql $DATABASE_URL -c "
  SELECT current_qty FROM inventory.stock_balances
  WHERE store_id = '$STORE_ID'
  AND product_id = (SELECT product_id FROM catalog.store_products sp
    JOIN catalog.products p ON p.id = sp.product_id
    WHERE sp.store_id = '$STORE_ID' AND p.name ILIKE '%Audit Test Salt%' LIMIT 1);
"
# PASS: current_qty = 100

# 8. POS can find by barcode scan
curl -s "$API/pos/products/lookup?barcode=8900000000001" \
  -H "Authorization: Bearer $DEVICE_TOKEN"
# PASS: 200 OK, product.name = 'Audit Test Salt', product.priceMinor = 2800
```

### Tests for Web UI Digitise

```bash
# 1. Create product via API (same as Web UI)
curl -s -X POST "$API/retailer-admin/products" \
  -H "Content-Type: application/json" \
  -H "x-actor-id: $STORE_ID" \
  -d '{
    "mode": "PACKAGED",
    "name": "Audit WebUI Product",
    "barcode": "8900000000002",
    "brand": "TestBrand",
    "sellPrice": 5000,
    "purchasePrice": 4000,
    "mrp": 5000,
    "openingStockQty": 50,
    "unit": "PCS"
  }'
# PASS: 201 Created, response has productId

# 2. POS can find it
curl -s "$API/pos/products/lookup?barcode=8900000000002" \
  -H "Authorization: Bearer $DEVICE_TOKEN"
# PASS: 200 OK, product found

# 3. Edit product (price change)
curl -s -X PATCH "$API/retailer-admin/products/$PRODUCT_ID" \
  -H "Content-Type: application/json" \
  -H "x-actor-id: $STORE_ID" \
  -d '{"sellPrice": 6000}'
# PASS: 200 OK

# 4. POS sees updated price
curl -s "$API/pos/products/lookup?barcode=8900000000002" \
  -H "Authorization: Bearer $DEVICE_TOKEN"
# PASS: product.priceMinor = 6000

# 5. Soft-delete product
curl -s -X DELETE "$API/retailer-admin/products/$PRODUCT_ID" \
  -H "x-actor-id: $STORE_ID"
# PASS: 200 OK

# 6. POS no longer finds it
curl -s "$API/pos/products/lookup?barcode=8900000000002" \
  -H "Authorization: Bearer $DEVICE_TOKEN"
# PASS: 404 product_not_found (is_active=false filtered out)
```

### Multi-Store Isolation

```bash
# 1. Create product in Store A
curl -s -X POST "$API/retailer-admin/products" \
  -H "Content-Type: application/json" \
  -H "x-actor-id: $STORE_A_ID" \
  -d '{"mode":"PACKAGED","name":"StoreA Only","barcode":"8900000000003","sellPrice":1000,"purchasePrice":800,"unit":"PCS"}'
# PASS: 201 Created

# 2. POS lookup in Store B does NOT return it
curl -s "$API/pos/products/lookup?barcode=8900000000003" \
  -H "Authorization: Bearer $DEVICE_TOKEN_STORE_B"
# PASS: 404 product_not_found

# 3. DB Proof — barcode scoped to Store A only
psql $DATABASE_URL -c "
  SELECT store_id, barcode FROM catalog.store_product_barcodes
  WHERE barcode = '8900000000003';
"
# PASS: Only one row with store_id = Store A
```

### Idempotency

```bash
# 1. CSV: Re-commit same jobId
curl -s -X POST "$API/retailer-admin/products/import/commit?jobId=$JOB_ID" \
  -H "x-actor-id: $STORE_ID"
# PASS: Returns cached result (already committed), no duplicate products created

# 2. Web UI: Create with duplicate barcode
curl -s -X POST "$API/retailer-admin/products" \
  -H "Content-Type: application/json" \
  -H "x-actor-id: $STORE_ID" \
  -d '{"mode":"PACKAGED","name":"Duplicate Test","barcode":"8900000000001","sellPrice":2800,"purchasePrice":2500,"unit":"PCS"}'
# PASS: 409 CONFLICT (BARCODE_ALREADY_MAPPED) — no duplicate created

# 3. DB Proof — count products with that barcode
psql $DATABASE_URL -c "
  SELECT COUNT(*) FROM catalog.store_product_barcodes
  WHERE store_id = '$STORE_ID' AND barcode = '8900000000001';
"
# PASS: count = 1 (not 2)
```

---

## C3 — Verdict Matrix

| # | Check | Verdict | Evidence |
|---|-------|---------|----------|
| 1 | CSV upload → POS visibility | **PASS** | CSV writes to catalog.store_products + store_product_barcodes; POS reads from same tables via fetchStoreProductByBarcode(). Immediate consistency (same DB, no cache). |
| 2 | Web UI digitise → POS visibility | **PASS** | Web UI POST writes to identical tables as CSV. POS barcode lookup resolves immediately. |
| 3 | Barcode mapping correctness | **PASS** | Store-scoped uniqueness via `ux_store_product_barcodes_store_barcode`. PACKAGED: user barcode stored with source='retailer_digitisation'. LOOSE_BULK: generated barcode with source='supermandi_generated'. POS resolves via store_product_barcodes → primary_barcode → product_barcodes fallback chain. |
| 4 | Search correctness | **PASS** | POS catalog search uses ILIKE on display_name, name, primary_barcode. Retailer product list uses same pattern. Both store-scoped. |
| 5 | Store isolation correctness | **PASS** | All queries enforce WHERE store_id = $storeId. Barcode uniqueness is (store_id, barcode). Device token binds storeId. Retailer middleware extracts x-actor-id. |
| 6 | Idempotency correctness | **FAIL** | **CSV re-upload (new jobId, same data):** Creates duplicate products in catalog.products. Barcode insert uses ON CONFLICT DO NOTHING — new products are created WITHOUT barcode links (orphans). **Web UI re-create:** Returns 409 CONFLICT (correct). **CSV same jobId re-commit:** Returns cached result (correct). See **RET-POS-SYNC-001**. |
| 7 | Caching/refresh correctness | **PASS** | No caching layer exists. POS queries PostgreSQL directly on every scan/search. Consistency is immediate upon COMMIT. No TTL, no invalidation needed. |
| 8 | Error handling + retry | **CONDITIONAL PASS** | CSV: Row-level errors caught and categorized (duplicate_barcode, db_constraint, etc.). Partial commit: valid rows succeed, invalid rows skipped. **BUT**: No downloadable error CSV — user must parse JSON response manually. See **RET-POS-SYNC-002**. Web UI: Clear error responses (400, 409, 422). |
| 9 | Observability/logging adequacy | **PASS** | inventory.inventory_ledger tracks source='CSV_IMPORT' / 'RETAILER_DASHBOARD' / 'BULK_PASTE'. platform.csv_imports tracks job lifecycle. Console logs for errors. Stock drift detection (ITER3-003) warns on stock_balances vs store_products mismatch. |
| 10 | One-click deployment readiness | **PASS** | Migrations present (004, 005, 023, 026-039). DATABASE_URL in docker-compose + config-status check. Tests tagged @config and @onboarding. pnpm -r typecheck passes. test:onboarding script exists. |

---

## C4 — Atomic Tickets

### RET-POS-SYNC-001: CSV re-upload creates orphaned products (no upsert/dedup)

**Problem:** When a retailer re-uploads the same CSV (new jobId), the commit flow creates NEW rows in `catalog.products` for every row. The barcode insert uses `ON CONFLICT (store_id, barcode) DO NOTHING`, so the new products are created without barcode links — they become orphaned catalog entries visible in product lists but unsearchable by barcode.

**Root Cause:** csvImport.ts commit loop always INSERTs new `catalog.products` rows (fresh UUIDs). There is no dedup key to detect "this product already exists in this store."

**Exact Files:**
- `backend/src/routes/v1/retailer-admin/csvImport.ts` lines 444-524 (commit loop)

**Acceptance Criteria:**
- Re-uploading CSV with existing barcodes does NOT create duplicate products
- Existing products are updated (price, stock, name) instead of duplicated
- No orphaned catalog.products rows without barcode links
- DB proof: `SELECT COUNT(*) FROM catalog.store_product_barcodes WHERE store_id = X AND barcode = Y` = 1 after re-upload

**Required Migrations:** Possibly none (could be handled in application logic via lookup-before-insert)

**Required Tests:** `@retailer-sync` — CSV re-upload idempotency test

**Done When:** Upload same CSV twice → second upload updates existing products, count of products does not increase, all barcodes still linked.

---

### RET-POS-SYNC-002: No downloadable error CSV for failed CSV import rows

**Problem:** When CSV commit has row-level failures, the error details are returned as JSON in the API response body (`failureSummary.details[]`). The retailer frontend displays the first 20 errors. There is no way to download a CSV of all failed rows with error reasons for offline correction.

**Root Cause:** No endpoint exists to export error details as CSV. The `platform.csv_imports.validation_errors` JSONB field stores errors but has no CSV export route.

**Exact Files:**
- `backend/src/routes/v1/retailer-admin/csvImport.ts` — missing export endpoint
- `retailer-admin/src/pages/ImportPage.tsx` — truncates error display to 20 rows

**Acceptance Criteria:**
- New endpoint: `GET /api/v1/retailer-admin/products/import/errors?jobId=X` returns CSV
- CSV contains: row_number, name, barcode, error_category, error_message
- Frontend shows "Download error CSV" button when failures > 0

**Required Migrations:** None

**Required Tests:** `@retailer-sync` — error CSV download test

**Done When:** Import 100 rows with 10 failures → download error CSV → CSV has exactly 10 rows with correct error reasons.

---

### RET-POS-SYNC-003: CSV commit is synchronous — timeout risk at scale

**Problem:** The CSV commit endpoint processes all rows synchronously in a single HTTP request. At 10,000 rows × 5 DB inserts per row = 50,000 DB operations. With network latency and constraint checks, this can exceed HTTP timeout (30s default).

**Root Cause:** `csvImport.ts` commit flow uses a synchronous `for` loop inside a single BEGIN/COMMIT transaction block (lines 437-534). No chunking, no async job processing.

**Exact Files:**
- `backend/src/routes/v1/retailer-admin/csvImport.ts` lines 391-592 (commit endpoint)

**Acceptance Criteria:**
- Commit endpoint returns 202 Accepted with job tracking
- Backend processes rows asynchronously (Bull queue or similar)
- Frontend polls for completion status
- 10,000 rows complete within 5 minutes without HTTP timeout

**Required Migrations:** None (platform.csv_imports already tracks status)

**Required Tests:** `@retailer-sync` — large CSV commit (1000+ rows) completes

**Done When:** Upload + commit 5,000 rows → no timeout → all products created → POS can scan them.

**Priority:** P2 (works for typical imports <1000 rows, risk at scale)

---

### RET-POS-SYNC-004: No per-store rate limit on CSV upload endpoint

**Problem:** The CSV upload endpoint has file size limits (5MB) and row limits (10,000) but no per-store rate limiting. A retailer could spam imports, creating excessive DB load.

**Root Cause:** `csvImport.ts` does not apply rate limiting middleware. The general admin rate limiter (200 req/15min per IP) applies at the `/admin` level, not at `/retailer-admin`.

**Exact Files:**
- `backend/src/routes/v1/retailer-admin/csvImport.ts` — no rate limiter
- `backend/src/routes/v1/index.ts` — retailer-admin routes have no rate limiter

**Acceptance Criteria:**
- Per-store rate limit: max 10 CSV imports per hour
- Returns 429 Too Many Requests with retry-after header when exceeded

**Required Migrations:** None

**Required Tests:** `@retailer-sync` — rate limit enforcement test

**Done When:** 11th import within 1 hour returns 429.

**Priority:** P2 (low probability, high impact if abused)

---

## Appendix: Key File Paths

### Frontend
| File | Purpose |
|------|---------|
| `retailer-admin/src/pages/ImportPage.tsx` | CSV upload UI (drag-drop, 3-step flow) |
| `retailer-admin/src/pages/ProductsPage.tsx` | Product CRUD UI (create, edit, delete, bulk paste) |
| `retailer-admin/src/lib/api.ts` | Authenticated fetch wrapper (credentials: 'include') |

### Backend Routes
| File | Purpose |
|------|---------|
| `backend/src/routes/v1/retailer-admin/csvImport.ts` | CSV upload/validate/commit (878 lines) |
| `backend/src/routes/v1/retailer-admin/products.ts` | Product CRUD endpoints |
| `backend/src/routes/v1/pos/scan.ts` | POS barcode scan/resolve |
| `backend/src/routes/v1/pos/storeProducts.ts` | POS product creation (digitisation) |
| `backend/src/routes/v1/catalog.ts` | POS catalog list/search |
| `backend/src/routes/v1/index.ts` | Route registration |

### Services
| File | Purpose |
|------|---------|
| `backend/src/services/posScanStore.ts` | Barcode → product resolution (new + legacy schema) |
| `backend/src/services/storeProductDigitisationService.ts` | POS product creation service |

### Middleware
| File | Purpose |
|------|---------|
| `backend/src/middleware/retailerStoreContext.ts` | Store context from x-actor-id header |
| `backend/src/middleware/deviceToken.ts` | POS device JWT auth + store binding |

### Migrations (Product-Related)
| File | Purpose |
|------|---------|
| `backend/migrations/004_catalog_schema.sql` | catalog.products, store_products, supplier_products |
| `backend/migrations/005_inventory_schema.sql` | inventory_ledger, stock_balances |
| `backend/migrations/023_store_product_barcodes.sql` | store_product_barcodes (store-scoped) |
| `backend/migrations/026_fmcg_taxonomy.sql` | FMCG categories (15 categories) |
| `backend/migrations/030_retailer_catalog_mode.sql` | product_mode (PACKAGED/LOOSE_BULK) |

### POS App
| File | Purpose |
|------|---------|
| `src/services/scan/scanService.ts` | Scan orchestration (duplicate guard, storm detection, cart) |
| `src/api/scanApi.ts` | POS scan API client |
| `src/api/productsApi.ts` | POS product lookup API client |

---

## Appendix: CSV Template Columns

```
name, barcode, brand, unit, sell_price, purchase_price, mrp, stock, mode,
sold_by, rate_unit, pack_size, pack_unit, low_stock_alert, gst_percent,
hsn, notes
```

- `mode`: PACKAGED (with barcode) or LOOSE_BULK (barcode generated)
- Prices in rupees (converted to paise × 100 internally)
- `stock`: Opening stock quantity

---

## Appendix: Database Schema Summary

```
catalog.products              → Master product record (global)
catalog.store_products        → Store-specific pricing/stock/mode (store_id scoped)
catalog.store_product_barcodes → Store-scoped barcode → product mapping
catalog.product_barcodes      → Global barcode table (legacy, used as fallback)
inventory.inventory_ledger    → Append-only stock movement history
inventory.stock_balances      → Current stock level (materialized, PK: store_id + product_id)
platform.csv_imports          → CSV import job tracking

Key Constraints:
  UNIQUE (store_id, barcode) on catalog.store_product_barcodes
  UNIQUE (store_id, product_id) on catalog.store_products
  PRIMARY KEY (store_id, product_id) on inventory.stock_balances
  CHECK (stock_before + delta_qty = stock_after) on inventory.inventory_ledger
```

---

**AUDIT COMPLETE. STOP. Awaiting operator unlock for implementation of tickets RET-POS-SYNC-001..004.**
