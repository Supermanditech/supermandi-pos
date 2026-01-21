# Retailer-Owned Catalog Deployment Checklist (OPS-RCAT-001)

## EPIC: Retailer Dashboard → POS Retailer-Owned Catalog (10,000 Stores)

This checklist covers the deployment and verification of the Retailer-Owned Catalog feature.

---

## Pre-Deployment Checklist

### 1. Database Migrations

Run the new migration to add `product_mode` column and update ledger types:

```bash
# From backend directory
pnpm migrate:up
```

**Migration files**:
- `030_retailer_catalog_mode.sql`
- `031_retailer_catalog_extended_fields.sql`

```bash
# Run both migrations (idempotent - safe to run multiple times)
psql $DATABASE_URL < backend/migrations/030_retailer_catalog_mode.sql
psql $DATABASE_URL < backend/migrations/031_retailer_catalog_extended_fields.sql
```

**Migration 030 changes:**
- [ ] Adds `product_mode` column to `catalog.store_products` (PACKAGED/LOOSE_BULK)
- [ ] Updates `inventory.inventory_ledger.transaction_type` comment to include `opening_stock`

**Migration 031 changes:**
- [ ] Adds `pack_unit` column to `catalog.products` (for PACKAGED pack size unit)
- [ ] Adds `low_stock_alert_qty` column to `catalog.store_products`
- [ ] Adds `notes` column to `catalog.store_products`
- [ ] Adds `sold_by` column to `catalog.store_products` (WEIGHT/COUNT for LOOSE_BULK)
- [ ] Adds `rate_unit` column to `catalog.store_products` (KG/GM/PCS/etc.)

### 2. Build Services

```bash
# Build all backend services
cd backend && pnpm build

# Build retailer-admin frontend
cd retailer-admin && pnpm build
```

### 3. Deploy Services

Deploy the following services to VM:

- [ ] `platform-service` (retailer-admin API endpoints)
- [ ] `inventory-service` (opening_stock ledger type)
- [ ] `catalog-service` (categories endpoint - already exists)
- [ ] `api-gateway` (routing)
- [ ] `retailer-admin` frontend (web UI)

---

## Post-Deployment Verification

### Endpoint Reachability

Test all new/modified endpoints via gateway:

```bash
# Replace {storeCode} with actual store code, {token} with valid JWT

# 1. Categories endpoint
curl -H "Authorization: Bearer {token}" \
  https://api.supermandi.in/api/v1/retailer-admin/categories

# 2. Create PACKAGED product
curl -X POST -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"mode":"PACKAGED","name":"Test Salt","barcode":"8901030123456","unit":"PCS","purchasePrice":2500,"sellPrice":2800,"openingStockQty":10}' \
  https://api.supermandi.in/api/v1/retailer-admin/products

# 3. Create LOOSE_BULK product
curl -X POST -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"mode":"LOOSE_BULK","name":"Loose Rice","unit":"KG","purchasePrice":4000,"sellPrice":4500,"openingStockQty":25}' \
  https://api.supermandi.in/api/v1/retailer-admin/products

# 4. SKU PDF endpoint (returns application/pdf)
curl -H "Authorization: Bearer {token}" \
  -o sku-labels.pdf \
  https://api.supermandi.in/api/v1/retailer-admin/products/{productId}/sku.pdf

# 5. POS scan resolve (use generated barcode from LOOSE product)
curl -X POST -H "Authorization: Bearer {deviceToken}" \
  -H "Content-Type: application/json" \
  -d '{"barcode":"SM1234567890AB"}' \
  https://api.supermandi.in/api/v1/pos/scan/resolve

# 6. Inventory summary (includes opening_stock in purchase value - Ticket 4)
curl -H "Authorization: Bearer {token}" \
  https://api.supermandi.in/api/v1/retailer-admin/inventory-summary
```

---

## Smoke Test Proof (Required for Go-Live)

Use any real store (not demo-specific). The proof is store-specific only in values, not logic.

### Proof A: PACKAGED Product

- [ ] Create PACKAGED product with:
  - GTIN barcode (e.g., `8901030000000`)
  - purchasePrice (e.g., 2500 paise = ₹25)
  - openingStockQty > 0 (e.g., 10)
- [ ] Verify response contains:
  - `productId`
  - `barcode` matches input
  - `generatedBarcode` is null
  - `ledgerEntryId` is not null
- [ ] Verify database:
  - `catalog.store_products` has `product_mode = 'PACKAGED'`
  - `inventory.inventory_ledger` has entry with `transaction_type = 'opening_stock'`
  - `inventory.stock_balances` has `current_qty = 10`
- [ ] POS scan barcode in SELL → product appears with correct price
- [ ] INWARD scan barcode → product appears

### Proof B: LOOSE_BULK Product

- [ ] Create LOOSE_BULK product with:
  - NO barcode in request (server generates)
  - purchasePrice (e.g., 4000 paise = ₹40)
  - openingStockQty > 0 (e.g., 25)
- [ ] Verify response contains:
  - `productId`
  - `barcode` is null
  - `generatedBarcode` starts with `SM` (e.g., `SM0123456789AB`)
  - `ledgerEntryId` is not null
- [ ] Verify database:
  - `catalog.store_products` has `product_mode = 'LOOSE_BULK'`
  - `catalog.store_product_barcodes` has entry with `source = 'supermandi_generated'`
  - `inventory.inventory_ledger` has entry with `transaction_type = 'opening_stock'`
- [ ] Download SKU PDF from dashboard → contains the generated barcode
- [ ] POS scan generated barcode in SELL → product appears with correct price

### Proof C: Categories Auto-Sync

- [ ] Dashboard categories endpoint returns FMCG taxonomy
- [ ] After creating products, category counts update on next refresh
- [ ] POS and Dashboard show same categories

### Proof D: Inventory Summary (Ticket 4 - opening_stock in Purchase Value)

- [ ] Call `GET /retailer-admin/inventory-summary`
- [ ] Verify response contains:
  - `totalPurchaseValue` > 0 (includes opening_stock)
  - `openingStockValue` > 0 (breakdown shows opening_stock contribution)
  - `purchaseReceivedValue` >= 0
  - `totalStockQty` matches sum of product stocks
- [ ] Verify `totalPurchaseValue = openingStockValue + purchaseReceivedValue`

### Proof E: Cross-Store Isolation (Security Critical)

This test verifies barcode isolation between stores. **Required if you have access to two stores.**

```bash
# Using Store A credentials, create a LOOSE_BULK product
# Note the generatedBarcode (e.g., SM1234567890AB)

# Using Store B device token, attempt to scan Store A's barcode
curl -X POST "$API_BASE/pos/scan/resolve" \
  -H "Authorization: Bearer $STORE_B_DEVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"barcode": "SM1234567890AB"}'
```

- [ ] Expected: `status: "NOT_FOUND"` (Store A's barcode should NOT resolve in Store B)
- [ ] Verify: storeId comes from device token, NOT request body
- [ ] Verify: Query filters by `WHERE spb.store_id = $1`

---

## Compliance Proofs (Review Document Issues)

### "No Double Coding" Reuse Compliance (Ticket 1)

**PROVEN**: Product create flow in `retailerPortal.ts` now calls inventory-service via HTTP:
```typescript
const inventoryUrl = `${config.services.inventoryService}/stores/${storeId}/inventory/transactions`;
const inventoryResponse = await fetch(inventoryUrl, {
  method: 'POST',
  body: JSON.stringify({
    items: [{ productId, quantity: openingStockQty, unitCost: purchasePrice }],
    transactionType: 'opening_stock',
    ...
  }),
});
```

This satisfies the spec requirement to call `ledgerService.ts recordStockMovement()` indirectly via the inventory-service HTTP API, rather than duplicating SQL logic.

### Ticket 4: opening_stock Affects Purchase Value Totals

**PROVEN**: New endpoint `GET /retailer-admin/inventory-summary` calculates Total Purchase Value:
```sql
SELECT
  COALESCE(SUM(CASE WHEN il.transaction_type IN ('opening_stock', 'purchase_received')
                    THEN il.delta_qty * COALESCE(il.unit_cost, 0) ELSE 0 END), 0) AS total_purchase_value,
  COALESCE(SUM(CASE WHEN il.transaction_type = 'opening_stock'
                    THEN il.delta_qty * COALESCE(il.unit_cost, 0) ELSE 0 END), 0) AS opening_stock_value
FROM inventory.stock_balances sb
LEFT JOIN inventory.inventory_ledger il ON il.store_id = sb.store_id AND il.product_id = sb.product_id
WHERE sb.store_id = $1
```

This explicitly includes `opening_stock` in purchase value totals per Ticket 4 requirements.

### Ticket 5: opening_stock Affects Ledger Totals

**PROVEN**: The stock calculation query at `storeProductDigitisationService.ts:208` uses:
```sql
SELECT COALESCE(SUM(delta_qty), 0)::INTEGER AS total
FROM inventory.inventory_ledger
WHERE store_id = $1 AND product_id = $2
```

This query sums ALL `delta_qty` values **without filtering by transaction_type**, meaning `opening_stock` entries are automatically included in stock totals alongside `sale`, `purchase_received`, `adjustment`, etc.

### Ticket 6: Barcode Resolution Uses Token-Derived storeId

**PROVEN**: The POS scan resolution flow in `storeProductDigitisationService.ts` demonstrates:

1. **storeId from Device Token**: In `scan.ts:27`:
   ```typescript
   const { storeId, deviceId } = (req as any).posDevice;
   ```
   The storeId is extracted from the device token via `requireDeviceToken` middleware, NOT from request body.

2. **Store-Scoped Query**: In `storeProductDigitisationService.ts:102`:
   ```sql
   WHERE spb.store_id = $1 AND spb.barcode = $2 AND sp.is_active = true
   ```
   Queries explicitly filter by storeId, ensuring cross-store isolation.

3. **Resolution Order** (documented at line 228-235):
   - Store-scoped barcode mapping (`catalog.store_product_barcodes`)
   - Catalog primary barcode with store_product link
   - External provider lookup (returns NEEDS_CREATE)
   - NOT_FOUND

4. **Cross-Store Isolation**: Store A's barcode will NOT resolve to Store B's product because all queries include `store_id = $1` filter.

---

## Rollback Plan

If issues are detected:

1. **Database**: Migration is additive (new column with default), no rollback needed
2. **Services**: Redeploy previous container images
3. **Frontend**: Redeploy previous build

The `product_mode` column defaults to `'PACKAGED'`, so existing products continue to work.

---

## Files Changed

### Backend

| File | Changes |
|------|---------|
| `backend/migrations/030_retailer_catalog_mode.sql` | New migration - adds product_mode column |
| `backend/services/platform-service/package.json` | Added pdfkit dependency for PDF generation |
| `backend/services/platform-service/src/config.ts` | Added inventory-service URL for HTTP calls (reuse compliance) |
| `backend/services/platform-service/src/routes/retailerPortal.ts` | Updated POST /products (calls inventory-service), added categories, SKU PDF, inventory-summary endpoints |
| `backend/services/platform-service/src/services/barcodeSheetService.ts` | Barcode label generation - both HTML and PDF output |
| `backend/services/inventory-service/src/db/queries.ts` | Added `opening_stock` to TransactionType |
| `backend/services/inventory-service/src/services/ledgerService.ts` | Added `opening_stock` case in recordStockMovement |
| `backend/services/inventory-service/src/services/transactionService.ts` | Added `opening_stock` to createTransaction sign logic |

### Frontend

| File | Changes |
|------|---------|
| `retailer-admin/src/pages/ProductsPage.tsx` | Updated form: mode selector, removed category, SKU PDF download |

### Removed (Not in Spec)

| Endpoint | Reason |
|----------|--------|
| `GET /retailer-admin/categories/:taxonomyId/products` | Removed - not in API-RCAT spec, risks divergence |

---

## Sign-off

### Pre-Deployment
- [ ] Migration 030 ready (product_mode column)
- [ ] Migration 031 ready (extended fields)
- [ ] Code built successfully locally

### Deployment
- [ ] SSH to production VM
- [ ] Code pulled/deployed
- [ ] Migration 030 executed successfully
- [ ] Migration 031 executed successfully
- [ ] Platform-service rebuilt and restarted
- [ ] Inventory-service rebuilt and restarted
- [ ] Health checks passing

### Smoke Tests
- [ ] Smoke test Proof A passed (PACKAGED product)
- [ ] Smoke test Proof B passed (LOOSE_BULK product)
- [ ] Smoke test Proof C passed (Categories auto-sync)
- [ ] Smoke test Proof D passed (Inventory summary includes opening_stock)
- [ ] Smoke test Proof E passed (Cross-store isolation) - if applicable
- [ ] POS app verified working with both barcode types
- [ ] SKU PDF returns Content-Type: application/pdf
- [ ] Dashboard UI shows Download SKU PDF button

### Compliance
- [ ] "No Double Coding" compliance verified (HTTP call to inventory-service)
- [ ] storeId from JWT token verified (not from request body)
- [ ] storeId from device token verified (not from request body)

**Deployed by**: ________________
**Date**: ________________
**Environment**: [ ] Production / [ ] Staging
**Commit/Tag**: ________________
**Verified by**: ________________
