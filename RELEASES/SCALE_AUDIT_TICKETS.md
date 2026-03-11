# SCALE Audit Tickets — B2B Wholesale Scale Readiness

> **Created**: 2026-03-11 | **Status**: APPROVED_PENDING_IMPLEMENTATION
> **Source**: E2E System Audit across POS, Retailer, Supplier, Superadmin
> **Approved Tile Designs**: Operator-approved with corrections (no margin on POS, margin only on retailer web)

---

## Capacity Verdict (No Tickets Needed)

| Requirement | Status | Evidence |
|---|---|---|
| 5,000 SKUs per store | SUPPORTED | Composite index `(store_id, is_active)`, trigram GIN, pagination ceiling 200/page |
| 10,000 barcode scans/day | SUPPORTED | 3-tier barcode index O(1), rate limit 120/min/device = 86,400/day |
| 1,500 SKUs per supplier | SUPPORTED | Indexed `(supplier_id, is_active)`, CSV 10K rows |
| 10,000 total users | SUPPORTED with tuning | JWT stateless, Redis sessions, pool needs SCALE-D2 |

---

## Approved Tile Designs

### Tile A: POS Sell Tile (Staff View — Unified Store Products)

Both digitised products and supplier-ordered products look identical once in store.

```
┌──────────────────────────────────────────────┐
│ [IMG]  Tata Salt Iodized                     │
│  40×40  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━     │
│         Tata              PACKAGED    1 kg   │
│──────────────────────────────────────────────│
│  ₹28.00            MRP ₹30.00               │
│──────────────────────────────────────────────│
│  Stock: 145 pcs              GST 18%        │
│  ⚠ Exp: 15-Aug-26 (157d)    8901234567890   │
└──────────────────────────────────────────────┘
```

**Shown**: image, name, brand, mode, pack_size, sell_price, MRP, stock, GST%, expiry_warning, barcode
**Hidden**: purchase_price, margin, supplier_name (staff must not see profit info)

### Tile A (Loose Variant):

```
┌──────────────────────────────────────────────┐
│ [IMG]  Toor Dal (Arhar)                      │
│  40×40  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━     │
│         Local               LOOSE    per KG  │
│──────────────────────────────────────────────│
│  ₹145.00/kg          MRP —                   │
│──────────────────────────────────────────────│
│  Stock: 48.5 kg              GST 5%         │
│                              SM-DAL-0042     │
└──────────────────────────────────────────────┘
```

### Tile B: Supplier Catalog Tile (Retailer Buy Screen)

Product NOT in store yet — retailer browsing to place orders.

```
┌──────────────────────────────────────────────┐
│ [IMG]  Maggi 2-Min Noodles Masala            │
│  48×48  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│         Nestlé               70g × 12 Pack   │
│──────────────────────────────────────────────│
│  Cost ₹120/pack             MRP ₹168         │
│──────────────────────────────────────────────│
│  MOQ: 5 packs    │  ● In Stock               │
│  Sharma Distributors (Pune)                  │
│  BNPL ✓     GST 18%     HSN 19023010        │
│──────────────────────────────────────────────│
│              [ + Order ]                     │
└──────────────────────────────────────────────┘
```

**Shown**: image, name, brand, pack_config, cost, MRP, MOQ, stock_status, supplier+city, BNPL, GST%, HSN
**Hidden**: margin (sell price not set yet — retailer is the buyer)

### Table C: Retailer Web Product Table (Owner View)

Owner-only — margin visible here.

```
| Image | Barcode | Name | Brand | Pack | Purchase | Sell | MRP | Margin | GST% | Stock | Supplier |
```

---

## Execution Order (Dependency-Aware, Bottom-Up)

```
Layer 1 — Schema (no dependencies):
  SCALE-A1 → SCALE-A2 → SCALE-A3 → SCALE-D2

Layer 2 — Backend APIs & Caching (after schema):
  SCALE-D1 → SCALE-D4 → SCALE-D3

Layer 3 — UI Wiring (after APIs):
  SCALE-B1 → SCALE-B2 → SCALE-B3 → SCALE-B4 → SCALE-B5 → SCALE-E2

Layer 4 — E2E Features (after UI):
  SCALE-C1 → SCALE-E1 → SCALE-C2 → SCALE-C3
```

---

## Ticket Specifications

### Category A: Schema Enhancement

#### SCALE-A1: Product compliance fields (manufacturer, origin, shelf_life)
- **Risk**: A | **Platform**: Backend
- **Migration**:
  ```sql
  ALTER TABLE catalog.products
    ADD COLUMN IF NOT EXISTS manufacturer_name VARCHAR(200),
    ADD COLUMN IF NOT EXISTS country_of_origin VARCHAR(100),
    ADD COLUMN IF NOT EXISTS shelf_life_days INTEGER;

  COMMENT ON COLUMN catalog.products.manufacturer_name IS 'Product manufacturer name (Legal Metrology Act)';
  COMMENT ON COLUMN catalog.products.country_of_origin IS 'Country of origin for imported goods (Consumer Protection Act)';
  COMMENT ON COLUMN catalog.products.shelf_life_days IS 'Shelf life in days from manufacturing. Used for auto-calculating expiry on stock-in.';
  ```
- **API**: Include in catalog-service product detail, retailer-admin product responses, supplier product responses
- **Retailer UI**: New fields in product form Step 6 (Tax & Compliance)
- **Supplier UI**: New fields in supplier product creation form
- **POS**: Not displayed on tiles (detail/form only)
- **Dependencies**: None

#### SCALE-A2: Net content fields (value + unit)
- **Risk**: A | **Platform**: Backend
- **Migration**:
  ```sql
  ALTER TABLE catalog.products
    ADD COLUMN IF NOT EXISTS net_content_value NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS net_content_unit VARCHAR(10);

  COMMENT ON COLUMN catalog.products.net_content_value IS 'Net content per unit (e.g. 500 for 500g). Legal Metrology Act compliance.';
  COMMENT ON COLUMN catalog.products.net_content_unit IS 'Unit for net content: g, kg, ml, l, pcs';
  ```
- **Rationale**: Distinct from pack_size. pack_size = "12 items per case". net_content = "each item weighs 500g".
- **Tile Display**: Badge showing "500g" or "1L" on both sell and buy tiles
- **Dependencies**: None

#### SCALE-A3: Batch number on store_products
- **Risk**: B | **Platform**: Backend
- **Migration**:
  ```sql
  ALTER TABLE catalog.store_products
    ADD COLUMN IF NOT EXISTS batch_number VARCHAR(100);

  CREATE INDEX IF NOT EXISTS idx_store_products_batch
    ON catalog.store_products(store_id, batch_number)
    WHERE batch_number IS NOT NULL;

  COMMENT ON COLUMN catalog.store_products.batch_number IS 'Active batch number for FEFO tracking. Updated on stock-in.';
  ```
- **Rationale**: batch_number currently only on purchase_order_items. Store-level needed for FEFO.
- **Dependencies**: None

---

### Category B: UI Tile Enhancement

#### SCALE-B1: POS sell tile enhancement
- **Risk**: A | **Platform**: POS App
- **Current**: name, price, stock (4 fields, no image)
- **Required**: image (40x40), name, brand, mode badge (PACKAGED/LOOSE), pack_size, sell_price, MRP, stock (color-coded), GST%, expiry_warning (orange <90d, red <30d), barcode
- **NOT shown**: purchase_price, margin, supplier_name
- **API changes**: Add pack_size, gst_rate, net_content to sell product search response (mrp, image_url already returned)
- **Files**: `src/screens/SellScanScreen.tsx`, product tile component
- **Dependencies**: None

#### SCALE-B2: POS buy tile (supplier catalog) enhancement
- **Risk**: A | **Platform**: POS App
- **Current**: image, name, brand, price, stock, supplier_count, MOQ
- **Required**: image (48x48), name, brand, pack_config (net_content × pack_size), cost_price, MRP, MOQ, stock_status, supplier_name+city, BNPL badge, GST%, HSN code, [+Order]
- **NOT shown**: margin
- **API changes**: Add gst_rate, hsn_code, net_content to buy-catalog response
- **Files**: `src/components/buy/CatalogProductCard.tsx`, `src/components/buy/ProductDetailModal.tsx`
- **Dependencies**: SCALE-A2

#### SCALE-B3: Retailer web product table — MRP, margin, GST, pack columns
- **Risk**: A | **Platform**: Retailer Web
- **Current columns**: barcode, name, brand, mode, price (sell), stock, supplier, actions
- **Required columns**: image (40x40), barcode, name, brand, pack/unit, purchase_price, sell_price, MRP, margin% (computed client-side: (sell-purchase)/purchase×100), GST%, stock, supplier, actions
- **Margin display**: Green badge if positive, red if negative. Owner-only view.
- **API changes**: All fields already returned — margin computed client-side
- **Files**: `retailer-admin/src/pages/ProductsPage.tsx`
- **Dependencies**: None

#### SCALE-B4: Retailer web product table — image thumbnail
- **Risk**: A | **Platform**: Retailer Web
- **Current**: No product image in table
- **Required**: 40x40px thumbnail as first column, fallback placeholder icon
- **API changes**: image_url already on store_products schema and API
- **Files**: `retailer-admin/src/pages/ProductsPage.tsx`
- **Dependencies**: None

#### SCALE-B5: Supplier form — manufacturer, origin, net content fields
- **Risk**: A | **Platform**: Supplier Web
- **Current form**: name, description, category, barcode, supplier_sku, purchase_price, MRP, MOQ, unit, image
- **Required additions**: manufacturer_name, country_of_origin, net_content_value + net_content_unit, shelf_life_days
- **Backend**: Accept new fields in supplier product create/update endpoints
- **Files**: `supplier-portal/src/app/(dashboard)/products/page.tsx`
- **Dependencies**: SCALE-A1, SCALE-A2

---

### Category C: Expiry & Batch Management

#### SCALE-C1: POS stock-in — capture batch + expiry
- **Risk**: B | **Platform**: POS App + Backend
- **POS UI**: Add optional batch_number and expiry_date fields to InwardScreen
- **Backend**: Accept batch_number + expiry_date in stock-in endpoint → save to store_products
- **Offline DB**: Add batch_number TEXT, expiry_date TEXT to offline_products (schema v5)
- **Sync**: Include batch/expiry in sync payload
- **Files**: `src/screens/InwardScreen.tsx`, `src/services/offline/localDb.ts`, `backend/src/routes/v1/pos/stockIn.ts`
- **Dependencies**: SCALE-A3

#### SCALE-C2: Expiry alerts system
- **Risk**: B | **Platform**: Full stack
- **Backend POS**: `GET /api/v1/pos/inventory/expiring?daysAhead=30`
- **Backend Retailer**: `GET /api/v1/retailer-admin/inventory/expiring`
- **Retailer UI**: Expiry alerts section on InventoryPage (table: product, batch, expiry, stock, days_remaining)
- **POS UI**: Orange badge on sell tile when <90d, red when <30d
- **Files**: `retailer-admin/src/pages/InventoryPage.tsx`, `src/screens/SellScanScreen.tsx`, new backend route
- **Dependencies**: SCALE-C1

#### SCALE-C3: FEFO stock rotation indicator
- **Risk**: A | **Platform**: POS + Retailer
- **Backend**: Query earliest expiry_date per product when multiple batches exist
- **POS**: Sort sell suggestions by expiry_date ASC, "Sell oldest first" indicator
- **Retailer**: Expiry-based sort option in inventory view
- **Dependencies**: SCALE-C1, SCALE-C2

---

### Category D: Performance & Caching

#### SCALE-D1: Redis barcode lookup cache
- **Risk**: A | **Platform**: Backend
- **Pattern**: `cacheGetOrSet(`barcode:${storeId}:${barcode}`, fetchFromDB, 300)`
- **TTL**: 5 minutes per entry
- **Invalidation**: On product create/update/delete for that store
- **Impact**: ~80% DB load reduction for repeat scans
- **Files**: `backend/src/routes/v1/pos/storeProducts.ts`, `backend/src/routes/v1/pos/scan.ts`
- **Dependencies**: None

#### SCALE-D2: Connection pool tuning
- **Risk**: A | **Platform**: Backend (config)
- **Current**: DB_POOL_MAX=20, DB_POOL_MIN=2
- **Required**: DB_POOL_MAX=25, DB_POOL_MIN=5
- **File**: `backend/src/db/client.ts`
- **Dependencies**: None

#### SCALE-D3: Async CSV import (Bull.js)
- **Risk**: B | **Platform**: Backend
- **Flow**: Upload CSV → validate → queue job → return jobId → process in batches (100/batch) → client polls status
- **New dependency**: bullmq package
- **Files**: `backend/src/routes/v1/retailer-admin/csvImport.ts`, new queue file
- **Dependencies**: None (Redis already available)

#### SCALE-D4: Catalog listing Redis cache
- **Risk**: A | **Platform**: Backend
- **Cache**: Page 1 of store product listing per store (TTL 5 min)
- **Invalidation**: On product CRUD for that store
- **Files**: `backend/src/routes/v1/catalog.ts`, catalog-service
- **Dependencies**: None

---

### Category E: Product Image Pipeline

#### SCALE-E1: Retailer product image upload
- **Risk**: B | **Platform**: Retailer Web + Backend
- **UI**: Drag-drop image upload in product create/edit form (2MB limit)
- **Backend**: `POST /api/v1/retailer-admin/products/:id/image` → GCS → store_products.image_url
- **Files**: `retailer-admin/src/pages/ProductsPage.tsx`, new backend route
- **Dependencies**: None

#### SCALE-E2: POS sell tile product images
- **Risk**: A | **Platform**: POS App
- **Current**: Buy catalog shows images. Sell tile does NOT.
- **Required**: 40x40 thumbnail with fallback icon
- **API**: image_url already returned — no API change
- **Files**: `src/screens/SellScanScreen.tsx`
- **Dependencies**: None

---

## Product Lifecycle Reference

```
Path 1: Digitised at Onboarding
  Retailer scans physical stock → enters name + sell price
  → Store Product (Tile A) — no supplier link initially

Path 2: Ordered from Supplier Catalog
  Supplier lists SKU → Superadmin approves → appears in retailer's Live Supplier Catalog (Tile B)
  → Retailer orders → delivered to store → becomes Store Product (Tile A)

After delivery, both paths produce identical Store Products (Tile A).
Retailer Web (owner) shows Tile C with full margin visibility.
```
