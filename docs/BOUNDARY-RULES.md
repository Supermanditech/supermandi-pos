# Data Boundary Rules: SELL vs BUY Separation

## Overview

This document describes the strict data separation between SELL and BUY contexts in SuperMandi POS. This separation is critical for:
1. Preventing accidental data leakage
2. Ensuring inventory accuracy
3. Maintaining clear product lifecycle flows

---

## BOUNDARY-001: Strict Separation

### Rule

- **SELL** must only show products from the **store catalog** (`catalog.store_products`)
- **BUY** must only show products from the **supplier catalog** (`supplier_product_map` + `supplier_products`)
- **BUY search/browse must NEVER create store products** - products only appear in SELL after stock is received

### Data Flow

```
Supplier Catalog (BUY)                    Store Catalog (SELL)
=======================                   ====================
supplier_products                         store_products
      |                                          ^
      |                                          |
      v                                          |
supplier_product_map                             |
      |                                          |
      v                                          |
 [Purchase Order] --> [GRN Receive] ------------>+
                                                 |
          [Sell-First Onboarding] -------------->+
```

### When a Product Appears in SELL

A product appears in the SELL search only after ONE of these events:
1. **GRN Receive** - Purchase order delivered and received
2. **Manual Inward** - Stock received via manual entry
3. **Sell-First Onboarding** - Retailer explicitly onboards a new product

---

## SEARCH-SELL-001: SELL Search API

### Endpoint
```
GET /api/v1/catalog/stores/:storeId/store-products/search
```

### Data Source
```sql
FROM catalog.store_products sp
JOIN catalog.products p ON p.id = sp.product_id
WHERE sp.store_id = :storeId  -- TENANT-001: Always first filter
  AND sp.is_active = true
```

### Returns
Grouped results for 2-step add UX:
```typescript
interface StoreSearchGroup {
  groupId: string;       // Normalized name+brand
  displayName: string;
  brand?: string;
  matches: Array<{
    productId: string;
    storeProductId: string;
    barcode?: string;
    sellPrice?: number;
    currentStock: number;
  }>;
}
```

---

## SEARCH-BUY-001: BUY Search API

### Endpoint
```
GET /api/v1/catalog/stores/:storeId/catalog
```

### Data Source
```sql
FROM catalog.products p
JOIN catalog.supplier_product_map spm ON spm.product_id = p.id
JOIN catalog.supplier_products sp ON sp.id = spm.supplier_product_id
JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = sp.supplier_id
WHERE ssl.store_id = :storeId  -- TENANT-001: Always first filter
  AND ssl.status = 'active'
```

### Critical
- **READ-ONLY** - Does NOT write to any tables
- Does NOT create `store_products` rows
- Does NOT create `inventory_ledger` entries

---

## SEARCH-SELL-UX-001: Two-Step Add (SELL)

### Rule
First tap must NOT add to cart.

### Flow
1. **Tap #1** on search result → Opens SKU Picker modal
2. **Tap #2** on specific SKU → Adds to cart

### Exception
Direct barcode scan may add directly (barcode is unambiguous)

---

## SEARCH-BUY-UX-001: Explicit Add (BUY)

### Rule
Product press does NOT add to cart.

### Flow
1. Tap product card → Opens supplier detail view
2. Select supplier + quantity → Tap "Add to Cart" button

---

## TENANT-001: Multi-Store Isolation

### Cache Keys
All cache keys MUST include storeId:
```
catalog:store:{storeId}:{query}:{category}:{page}
```

### SQL Queries
All store-scoped queries MUST have `store_id` as the FIRST filter:
```sql
WHERE store_id = $1  -- Always first
  AND other_conditions...
```

### Testing
- Store A results must NEVER show in Store B
- Add integration test: query store A, verify store B results are empty

---

## Implementation Checklist

### Backend
- [x] SELL search endpoint (`/store-products/search`) queries only `store_products`
- [x] BUY search endpoint (`/catalog`) queries only supplier mappings
- [x] No write operations in catalog service search
- [x] All cache keys include storeId
- [x] All SQL queries have store_id as first filter

### Frontend
- [x] SELL search uses new `/store-products/search` endpoint
- [x] BUY search uses `/catalog` endpoint
- [x] SKU Picker modal for 2-step add
- [x] BUY requires explicit "Add" button tap
- [ ] Update SellScanScreen to use grouped results

---

## Version

- Document Version: 1.0
- Last Updated: 2026-01-14
