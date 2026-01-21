# RCAT Code Review Summary

## Files Changed

### New Files
| File | Lines | Purpose |
|------|-------|---------|
| `backend/services/platform-service/src/services/barcodeSheetService.ts` | 568 | PDF generation with Code128 barcodes |
| `backend/migrations/030_retailer_catalog_mode.sql` | ~20 | Adds `product_mode` column |
| `docs/RCAT-DEPLOYMENT-CHECKLIST.md` | ~180 | Deployment checklist |
| `docs/RCAT-GOLIVE-PROOF.md` | ~250 | Go-live proof document |

### Modified Files
| File | Changes |
|------|---------|
| `retailerPortal.ts` | +509 lines - categories endpoint, product create contract, SKU PDF |
| `ledgerService.ts` | +7 lines - `opening_stock` case |
| `queries.ts` | +1 line - `opening_stock` type |
| `ProductsPage.tsx` | Updated form for mode selector |
| `platform-service/package.json` | Added pdfkit dependency |

---

## Key Code Sections for Review

### 1. SKU PDF - Barcode from store_product_barcodes (PROVEN)

**File:** `retailerPortal.ts:955-964`

```typescript
const productResult = await query<{...}>(
  `SELECT sp.product_id, p.name,
          COALESCE(spb.barcode, p.primary_barcode) AS barcode,  -- ✅ Fetches from store_product_barcodes first
          sp.product_mode,
          s.name AS store_name
   FROM catalog.store_products sp
   JOIN catalog.products p ON sp.product_id = p.id
   JOIN platform.stores s ON s.id = sp.store_id
   LEFT JOIN catalog.store_product_barcodes spb
     ON spb.store_product_id = sp.id AND spb.store_id = sp.store_id  -- ✅ Store-scoped join
   WHERE sp.store_id = $1 AND sp.product_id = $2 AND sp.is_active = true`,  -- ✅ storeId validation
  [storeId, productId]  // storeId from getRetailerContext() → JWT token
);
```

### 2. SKU PDF Returns application/pdf (FIXED)

**File:** `retailerPortal.ts:991-994`

```typescript
// Return actual PDF
res.setHeader('Content-Type', 'application/pdf');  // ✅ Not text/html
res.setHeader('Content-Disposition', `inline; filename="sku-${product.barcode}.pdf"`);
res.setHeader('Content-Length', pdfBuffer.length);
res.send(pdfBuffer);
```

### 3. PDF Generation with PDFKit

**File:** `barcodeSheetService.ts:459-467`

```typescript
const doc = new PDFDocument({
  size: 'A4',
  margin: 0,
  info: {
    Title: `SKU Labels${storeName ? ` - ${storeName}` : ''}`,
    Author: 'SuperMandi',
    Subject: 'Barcode Label Sheet',
  },
});
```

### 4. Opening Stock Ledger Entry

**File:** `retailerPortal.ts:729-752`

```typescript
if (openingStockQty > 0) {
  // Create ledger entry with opening_stock type
  const ledgerResult = await query<{ id: string }>(
    `INSERT INTO inventory.inventory_ledger
     (store_id, product_id, delta_qty, transaction_type, stock_before, stock_after, unit_cost, source, notes)
     VALUES ($1, $2, $3, 'opening_stock', 0, $3, $4, 'RETAILER_PORTAL', $5)
     RETURNING id`,
    [storeId, productId, openingStockQty, purchasePrice, notes || 'Opening stock from retailer dashboard']
  );
  ledgerEntryId = ledgerResult[0]?.id || null;

  // Update stock_balances
  await query(
    `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty)
     VALUES ($1, $2, $3)
     ON CONFLICT (store_id, product_id) DO UPDATE SET current_qty = $3, updated_at = NOW()`,
    [storeId, productId, openingStockQty]
  );
}
```

### 5. LOOSE_BULK Barcode Generation

**File:** `retailerPortal.ts:618-629`

```typescript
} else if (mode === 'LOOSE_BULK') {
  // LOOSE_BULK: barcode must NOT be accepted from client
  if (rawBarcode) {
    throw ApiError.badRequest(
      'Barcode must not be provided for LOOSE_BULK products. Server will generate a store-scoped barcode.',
      'barcode'
    );
  }
  // Generate store-scoped barcode (SM + 12 hex chars)
  generatedBarcode = `SM${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
  barcode = generatedBarcode;
}
```

### 6. Store-Scoped Barcode Mapping

**File:** `retailerPortal.ts:696-721`

```typescript
if (barcode) {
  const barcodeSource = mode === 'LOOSE_BULK' ? 'supermandi_generated' : 'manual';

  // Retry loop for LOOSE_BULK barcode collision (rare but possible)
  let insertAttempts = 0;
  const maxAttempts = mode === 'LOOSE_BULK' ? 3 : 1;

  while (insertAttempts < maxAttempts) {
    try {
      await query(
        `INSERT INTO catalog.store_product_barcodes (store_id, store_product_id, barcode, source)
         VALUES ($1, $2, $3, $4)`,
        [storeId, storeProductId, barcode, barcodeSource]
      );
      break;  // Success
    } catch (err: unknown) {
      insertAttempts++;
      if (mode === 'LOOSE_BULK' && insertAttempts < maxAttempts) {
        // Regenerate barcode and retry
        generatedBarcode = `SM${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
        barcode = generatedBarcode;
      } else {
        throw err;
      }
    }
  }
}
```

---

## Removed Endpoint (Not in Spec)

**Removed:** `GET /retailer-admin/categories/:taxonomyId/products`

This endpoint was NOT in the API-RCAT spec and risked divergence from POS behavior.

---

## Shared Module Reuse

### ✅ Reused
- `@supermandi/common` - ApiError, query functions
- `catalog.store_product_barcodes` - Store-scoped barcode mapping (same as POS)
- `catalog.fmcg_taxonomy` - Categories (same source as POS)
- `inventory.inventory_ledger` - Ledger schema
- `inventory.stock_balances` - Stock balance schema

### ⚠️ Future Improvement
The opening stock ledger write could call `recordStockMovement()` from `ledgerService.ts` instead of direct INSERT. Current approach writes to same table with same schema - semantically identical, just not using shared function.

---

## Compliance Summary

| Requirement | Status | Evidence |
|-------------|--------|----------|
| SKU PDF returns application/pdf | ✅ | `retailerPortal.ts:991` |
| Barcode from store_product_barcodes | ✅ | `retailerPortal.ts:956,962` |
| storeId validation | ✅ | `WHERE sp.store_id = $1` |
| PACKAGED mode | ✅ | Accepts barcode from client |
| LOOSE_BULK mode | ✅ | Generates SM* barcode |
| Opening stock ledger | ✅ | `transaction_type = 'opening_stock'` |
| Categories from FMCG taxonomy | ✅ | `retailerPortal.ts:282-318` |
| No extra endpoints | ✅ | Removed /categories/:id/products |
