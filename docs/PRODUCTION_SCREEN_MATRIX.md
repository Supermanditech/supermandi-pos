# Production Screen Matrix

> Generated: 2026-01-15
> E2E Contracts for Production Readiness (10,000 Stores)

---

## Core Principle

**A screen is "production ready" only when:**
1. API endpoint works via gateway (port 3000)
2. Data is created by real user actions (not seed)
3. Empty state shows CTA to create data
4. Feature flags are enforced
5. Store isolation is maintained (all queries use store_id)

---

## Screen Matrix

### 1. SellScanScreen (SELL Tab)

| Aspect | Details |
|--------|---------|
| **Route** | Tab: SELL |
| **Feature Gate** | None (core flow) |
| **API Calls** | `GET /api/v1/catalog/stores/{storeId}/catalog?q=...` |
| **DB Tables** | `catalog.products`, `catalog.store_products`, `catalog.product_barcodes` |
| **Data Source (Production)** | Products added via: (a) SuperAdmin catalog import, (b) Manual product add |
| **Data Requirement** | At least 1 store_product with stock > 0 |
| **Empty State** | "No products found. Add products to your catalog." |
| **Empty CTA** | → SuperAdmin portal OR → Future: In-app catalog add |
| **E2E Test Path** | Launch → SELL tab → Search "test" → Tap product → Add to cart |
| **Gateway Verified** | ⬜ Pending |

**Production Flow:**
```
SuperAdmin: Create product in catalog.products
SuperAdmin: Link to store in catalog.store_products with pricing
POS App: Search returns product → Add to cart → Checkout
```

---

### 2. PaymentScreen

| Aspect | Details |
|--------|---------|
| **Route** | Stack: `Payment` |
| **Feature Gate** | None (core flow) |
| **API Calls** | `POST /api/v1/pos/sales` (create sale), `POST /api/v1/pos/upi/init` (UPI) |
| **DB Tables** | `public.sales`, `public.sale_items`, `inventory.stock_ledger` |
| **Data Source (Production)** | Cart items from SellScanScreen |
| **Data Requirement** | Cart with ≥1 item |
| **Empty State** | N/A (redirects if cart empty) |
| **E2E Test Path** | SELL → Add item → Cart → Checkout → Payment → Complete |
| **Gateway Verified** | ⬜ Pending |

**Production Flow:**
```
Cart has items → Navigate to Payment
Select payment mode (CASH/UPI/DUE)
POST /api/v1/pos/sales → Creates sale record
→ Decrements inventory
→ Returns sale_id
Navigate to SuccessPrint
```

**DB Effects:**
- INSERT into `public.sales`
- INSERT into `public.sale_items` (per item)
- UPDATE `catalog.store_products.current_stock` -= quantity
- INSERT into `inventory.stock_ledger` (SALE transaction)

---

### 3. SalesHistoryScreen

| Aspect | Details |
|--------|---------|
| **Route** | Stack: `SalesHistory` |
| **Feature Gate** | None |
| **API Calls** | `GET /api/v1/pos/bills` (store from device token) |
| **DB Tables** | `public.sales`, `public.sale_items` |
| **Data Source (Production)** | Created by completing checkout (PaymentScreen) |
| **Data Requirement** | At least 1 completed sale |
| **Empty State** | "No bills yet. Make your first sale!" |
| **Empty CTA** | → Navigate to SELL tab |
| **E2E Test Path** | Menu → Bills/Sales History → See list → Tap bill |
| **Gateway Verified** | ⬜ Pending |

**Production Flow:**
```
User completes sale → PaymentScreen creates sale record
SalesHistory fetches from /api/v1/pos/bills
Returns BillSummary[] with saleId, billRef, total, paymentMode
```

---

### 4. BillDetailScreen

| Aspect | Details |
|--------|---------|
| **Route** | Stack: `BillDetail` (params: saleId) |
| **Feature Gate** | None |
| **API Calls** | `GET /api/v1/pos/bills/:saleId` |
| **DB Tables** | `public.sales`, `public.sale_items` |
| **Data Source (Production)** | Sale created by checkout |
| **Data Requirement** | Valid saleId from SalesHistory |
| **Empty State** | "Bill not found" error |
| **E2E Test Path** | SalesHistory → Tap bill → See details → Print/Share |
| **Gateway Verified** | ⬜ Pending |

---

### 5. BuyScreen (BUY Tab)

| Aspect | Details |
|--------|---------|
| **Route** | Tab: BUY |
| **Feature Gate** | `buyEnabled` (from ui-status features) |
| **API Calls** | `GET /api/v1/catalog/categories?storeId=...`, `GET /api/v1/catalog?storeId=...&q=...` |
| **DB Tables** | `catalog.products`, `catalog.store_products`, `catalog.supplier_product_map` |
| **Data Source (Production)** | Supplier products linked to store |
| **Data Requirement** | ≥1 supplier with linked products |
| **Empty State** | "No suppliers available. Contact SuperAdmin to link suppliers." |
| **Empty CTA** | → Info message (SuperAdmin manages suppliers) |
| **E2E Test Path** | BUY tab → Browse → Select supplier → Add to cart |
| **Gateway Verified** | ⬜ Pending |

**Production Flow:**
```
SuperAdmin: Create supplier in supplier.suppliers
SuperAdmin: Link products via catalog.supplier_product_map
POS App: BUY tab shows available suppliers/products
User: Add to purchase cart → Create PO
```

---

### 6. OrderHistoryScreen

| Aspect | Details |
|--------|---------|
| **Route** | Stack: `OrderHistory` |
| **Feature Gate** | `buyEnabled` |
| **API Calls** | `GET /api/v1/orders/stores/{storeId}/orders?status=...&page=...` |
| **DB Tables** | `orders.purchase_orders`, `orders.purchase_order_items` |
| **Data Source (Production)** | Created by submitting purchase cart (BuyScreen) |
| **Data Requirement** | At least 1 purchase order |
| **Empty State** | "No orders found. Create your first purchase order!" |
| **Empty CTA** | → Navigate to BUY tab |
| **E2E Test Path** | Menu → Purchase Orders → See list → Tap order |
| **Gateway Verified** | ⬜ Pending |

**Production Flow:**
```
User adds items to purchase cart (BuyScreen)
Submit cart → POST /api/v1/orders
Creates purchase_order + purchase_order_items
OrderHistory fetches list
```

---

### 7. OrderDetailScreen

| Aspect | Details |
|--------|---------|
| **Route** | Stack: `OrderDetail` (params: orderId) |
| **Feature Gate** | `buyEnabled` |
| **API Calls** | `GET /api/v1/orders/stores/{storeId}/orders/{orderId}`, `GET /api/v1/orders/stores/{storeId}/orders/{orderId}/events` |
| **DB Tables** | `orders.purchase_orders`, `orders.purchase_order_items`, `orders.order_events` |
| **Data Source (Production)** | PO created from BuyScreen |
| **Data Requirement** | Valid orderId |
| **Empty State** | "Order not found" error |
| **E2E Test Path** | OrderHistory → Tap order → See details → Receive Stock |
| **Gateway Verified** | ⬜ Pending |

---

### 8. GRNScreen (Goods Receipt Note)

| Aspect | Details |
|--------|---------|
| **Route** | Stack: `GRN` (params: orderId) |
| **Feature Gate** | `buyEnabled` |
| **API Calls** | `GET /api/v1/orders/stores/{storeId}/orders/{orderId}`, `POST /api/v1/orders/stores/{storeId}/orders/{orderId}/receive` |
| **DB Tables** | `orders.purchase_orders`, `inventory.grn_headers`, `inventory.grn_items`, `inventory.stock_ledger` |
| **Data Source (Production)** | PO in receivable status (confirmed/shipped) |
| **Data Requirement** | Order with status allowing receipt |
| **Empty State** | N/A (only accessible from order detail) |
| **E2E Test Path** | OrderDetail → Receive Stock → Enter quantities → Submit |
| **Gateway Verified** | ⬜ Pending |

**Production Flow:**
```
Order status = confirmed/shipped
Navigate to GRN from OrderDetail
Enter received quantities per item
POST /api/v1/orders/:orderId/receive
→ Creates grn_header + grn_items
→ Updates order status
→ Updates store_products.current_stock
→ Inserts inventory.stock_ledger (GRN transaction)
```

**DB Effects:**
- INSERT `inventory.grn_headers`
- INSERT `inventory.grn_items` (per item)
- UPDATE `orders.purchase_orders.status`
- UPDATE `catalog.store_products.current_stock` += received_qty
- INSERT `inventory.stock_ledger` (GRN transaction type)

---

### 9. InwardScreen (Manual Stock Receipt)

| Aspect | Details |
|--------|---------|
| **Route** | Stack: `Inward` |
| **Feature Gate** | None (essential operation) |
| **API Calls** | `GET /api/v1/catalog?storeId=...&q=...`, `POST /api/v1/inventory/inward` |
| **DB Tables** | `inventory.inward_entries`, `inventory.stock_ledger`, `catalog.store_products` |
| **Data Source (Production)** | Manual entry by user |
| **Data Requirement** | Products in catalog to search |
| **Empty State** | Search shows "No products found" if catalog empty |
| **Empty CTA** | → "Add products to catalog first" |
| **E2E Test Path** | Menu → Stock Inward → Search product → Add qty → Submit |
| **Gateway Verified** | ⬜ Pending |

**Production Flow:**
```
User searches for existing product
Enters quantity + purchase price
POST /api/v1/inventory/inward
→ Creates inward_entry
→ Updates store_products.current_stock
→ Inserts stock_ledger
```

---

### 10. PurchaseHistoryScreen

| Aspect | Details |
|--------|---------|
| **Route** | Stack: `PurchaseHistory` |
| **Feature Gate** | None |
| **API Calls** | `GET /api/v1/inventory/purchase-history?storeId=...` |
| **DB Tables** | `inventory.stock_ledger` (filtered by GRN/INWARD types) |
| **Data Source (Production)** | Created by GRN or Inward submissions |
| **Data Requirement** | At least 1 inward/GRN entry |
| **Empty State** | "No purchase history. Receive stock via Inward or GRN." |
| **Empty CTA** | → Navigate to Inward screen |
| **E2E Test Path** | Menu → Purchase History → See grouped entries |
| **Gateway Verified** | ⬜ Pending |

---

### 11. StockStatementScreen

| Aspect | Details |
|--------|---------|
| **Route** | Stack: `StockStatement` |
| **Feature Gate** | None |
| **API Calls** | `GET /api/v1/catalog?storeId=...&limit=100` |
| **DB Tables** | `catalog.store_products` |
| **Data Source (Production)** | Stock updated by Sales/GRN/Inward |
| **Data Requirement** | Store products exist |
| **Empty State** | "No products in your store. Add products first." |
| **Empty CTA** | → SuperAdmin portal |
| **E2E Test Path** | Menu → Stock Statement → See all products with stock |
| **Gateway Verified** | ⬜ Pending |

---

### 12. SalesStatementScreen

| Aspect | Details |
|--------|---------|
| **Route** | Stack: `SalesStatement` |
| **Feature Gate** | None |
| **API Calls** | `GET /api/v1/pos/sales-statement?storeId=...` |
| **DB Tables** | `public.sales`, `public.sale_items` |
| **Data Source (Production)** | Sales created by checkout |
| **Data Requirement** | At least 1 completed sale |
| **Empty State** | "No sales recorded. Make your first sale!" |
| **Empty CTA** | → Navigate to SELL tab |
| **E2E Test Path** | Menu → Sales Statement → See daily/weekly summary |
| **Gateway Verified** | ⬜ Pending |

---

### 13. ReorderScreen (REORDER Tab)

| Aspect | Details |
|--------|---------|
| **Route** | Tab: REORDER |
| **Feature Gate** | `reorderEnabled` |
| **API Calls** | `GET /api/v1/reorder/stores/{storeId}/reorder/pending`, `POST .../approve`, `POST .../dismiss` |
| **DB Tables** | `reorder.reorder_suggestions`, `reorder.reorder_policies` |
| **Data Source (Production)** | Auto-generated from low stock + policies |
| **Data Requirement** | Policies configured + stock below threshold |
| **Empty State** | "All stock levels are healthy. No reorders needed." |
| **Empty CTA** | → "Configure reorder policies" → ReorderPolicies |
| **E2E Test Path** | REORDER tab → See suggestions → Approve/Dismiss |
| **Gateway Verified** | ⬜ Pending |

**Production Flow:**
```
Prerequisite: Reorder policies configured per product
Background job detects stock < min_threshold
Creates reorder_suggestion
App fetches pending suggestions
User approves → Creates draft PO
```

---

### 14. ReorderSettingsScreen

| Aspect | Details |
|--------|---------|
| **Route** | Stack: `ReorderSettings` |
| **Feature Gate** | `reorderEnabled` |
| **API Calls** | `GET /api/v1/reorder/stores/{storeId}/reorder/settings`, `PATCH .../settings` |
| **DB Tables** | `reorder.store_reorder_settings` |
| **Data Source (Production)** | User configuration |
| **Data Requirement** | None (defaults if not set) |
| **Empty State** | Shows defaults |
| **E2E Test Path** | Menu → Reorder Settings → Toggle options → Save |
| **Gateway Verified** | ⬜ Pending |

---

### 15. ReorderPoliciesScreen

| Aspect | Details |
|--------|---------|
| **Route** | Stack: `ReorderPolicies` |
| **Feature Gate** | `reorderEnabled` |
| **API Calls** | `GET /api/v1/reorder/stores/{storeId}/reorder/policies`, `PATCH .../policies/{productId}` |
| **DB Tables** | `reorder.reorder_policies` |
| **Data Source (Production)** | User creates policies per product |
| **Data Requirement** | Products in store catalog |
| **Empty State** | "No reorder policies. Configure policies for your products." |
| **Empty CTA** | → Tap product → Set min stock threshold |
| **E2E Test Path** | Menu → Reorder Policies → Search product → Set policy |
| **Gateway Verified** | ⬜ Pending |

---

### 16. BarcodeSheetScreen

| Aspect | Details |
|--------|---------|
| **Route** | Stack: `BarcodeSheet` |
| **Feature Gate** | None |
| **API Calls** | `GET /api/v1/pos/barcode-sheets?storeId=...&tier=...` |
| **DB Tables** | `catalog.products`, `catalog.product_barcodes` |
| **Data Source (Production)** | Products with barcodes |
| **Data Requirement** | Products with primary_barcode set |
| **Empty State** | "No products with barcodes found." |
| **Empty CTA** | → "Ensure products have barcodes in catalog" |
| **E2E Test Path** | Menu → Barcode Sheets → Select tier → Download/Share PDF |
| **Gateway Verified** | ⬜ Pending |

---

## Data Creation Flows (How Production Data Gets Created)

### Flow 1: Product Catalog
```
Source: SuperAdmin Portal
Tables: catalog.products → catalog.store_products
Required for: SELL, BUY, Stock Statement, Barcode Sheets
```

### Flow 2: Suppliers
```
Source: SuperAdmin Portal
Tables: supplier.suppliers → catalog.supplier_product_map
Required for: BUY tab, Purchase Orders
```

### Flow 3: Sales
```
Source: POS App checkout flow
Tables: public.sales → public.sale_items → inventory.stock_ledger
Required for: Sales History, Sales Statement
Creates: -stock via ledger
```

### Flow 4: Purchase Orders
```
Source: BUY tab → Submit cart
Tables: orders.purchase_orders → orders.purchase_order_items
Required for: Order History, Order Detail, GRN
```

### Flow 5: Stock Inward
```
Source A: GRN from PO (orders.purchase_orders → inventory.grn_*)
Source B: Manual Inward (Inward screen → inventory.inward_entries)
Tables: inventory.stock_ledger, catalog.store_products
Required for: Purchase History, Stock Statement
Creates: +stock via ledger
```

### Flow 6: Reorder Policies
```
Source: User configuration in ReorderPolicies screen
Tables: reorder.reorder_policies
Required for: Auto-generation of reorder suggestions
```

---

## Production Readiness Checklist

| Screen | API Works | Data Created By Flow | Empty State | Feature Gate | Store Isolated |
|--------|-----------|---------------------|-------------|--------------|----------------|
| SellScan | ✅ catalog | SuperAdmin catalog | ⬜ | ✅ None | ✅ storeId |
| Payment | ⬜ | Cart checkout | N/A | ✅ None | ⬜ |
| SalesHistory | ⬜ | Checkout | ✅ exists | ✅ None | ⬜ |
| BillDetail | ⬜ | Checkout | ✅ exists | ✅ None | ⬜ |
| BuyScreen | ✅ catalog | SuperAdmin suppliers | ⬜ | ✅ buyEnabled | ✅ storeId |
| OrderHistory | ✅ orders | BUY submit | ✅ exists | ✅ buyEnabled | ✅ storeId |
| OrderDetail | ⬜ | BUY submit | ⬜ | ✅ buyEnabled | ✅ storeId |
| GRNScreen | ⬜ | Order receive | N/A | ✅ buyEnabled | ✅ storeId |
| InwardScreen | ⬜ | Manual entry | ⬜ | ✅ None | ⬜ |
| PurchaseHistory | ⬜ | GRN/Inward | ⬜ | ✅ None | ⬜ |
| StockStatement | ✅ catalog | Sales/GRN/Inward | ⬜ | ✅ None | ✅ storeId |
| SalesStatement | ⬜ | Checkout | ⬜ | ✅ None | ⬜ |
| ReorderScreen | ⬜ | Policies + low stock | ⬜ | ✅ reorderEnabled | ⬜ |
| ReorderSettings | ⬜ | User config | ✅ defaults | ✅ reorderEnabled | ⬜ |
| ReorderPolicies | ⬜ | User config | ⬜ | ✅ reorderEnabled | ⬜ |
| BarcodeSheet | ✅ catalog | SuperAdmin catalog | ⬜ | ✅ None | ✅ storeId |

---

## Critical Backend Requirements

### 1. All APIs Must Be Reachable via Gateway (port 3000)
```
Gateway routes: /api/v1/pos/*, /api/v1/catalog/*, /api/v1/orders/*, etc.
Each service must be registered in gateway routing
```

### 2. Store Isolation (Non-Negotiable for 10k Stores)
```
Every query MUST include WHERE store_id = $storeId
No global caching without store_id in key
Device token validation returns store_id
```

### 3. Idempotent Migrations
```
All schema changes via numbered migrations
ON CONFLICT handling for upserts
No manual SQL patches in production
```

---

## Gateway Verification Results (2026-01-15)

### Verified Working ✅

| Endpoint | Path | Result |
|----------|------|--------|
| UI Status | `GET /api/v1/pos/ui-status` | ✅ Returns features, store info |
| Catalog List | `GET /api/v1/catalog/stores/{storeId}/catalog` | ✅ Returns products (23 items) |
| Categories | `GET /api/v1/catalog/stores/{storeId}/catalog/categories` | ✅ Returns categories (10 items) |
| Orders List | `GET /api/v1/orders/stores/{storeId}/orders` | ✅ Returns orders (22 items) |

### Needs Verification ⬜

| Endpoint | Expected Path | Status |
|----------|---------------|--------|
| Bills List | `GET /api/v1/pos/bills` | ⬜ Pending |
| Bill Detail | `GET /api/v1/pos/bills/{saleId}` | ⬜ Pending |
| Create Sale | `POST /api/v1/pos/sales` | ⬜ Pending |
| Order Detail | `GET /api/v1/orders/stores/{storeId}/orders/{orderId}` | ⬜ Pending |
| Reorder Pending | `GET /api/v1/reorder/stores/{storeId}/reorder/pending` | ⬜ Pending |
| Reorder Settings | `GET /api/v1/reorder/stores/{storeId}/reorder/settings` | ⬜ Pending |
| Reorder Policies | `GET /api/v1/reorder/stores/{storeId}/reorder/policies` | ⬜ Pending |
| Inward | `POST /api/v1/inventory/inward` | ⬜ Pending |
| Purchase History | `GET /api/v1/inventory/purchase-history` | ⬜ Pending |

---

## Exact API Paths Reference

### Billing Service (`/api/v1/pos/...`)
```
GET  /api/v1/pos/bills                    → List bills for device's store
GET  /api/v1/pos/bills/:saleId            → Get bill detail
POST /api/v1/pos/sales                    → Create sale
GET  /api/v1/pos/ui-status                → Get UI config + features
```

### Catalog Service (`/api/v1/catalog/...`)
```
GET  /api/v1/catalog/stores/:storeId/catalog              → List products
GET  /api/v1/catalog/stores/:storeId/catalog/:productId   → Get product
GET  /api/v1/catalog/stores/:storeId/catalog/categories   → List categories
```

### Orders Service (`/api/v1/orders/...`)
```
GET  /api/v1/orders/stores/:storeId/orders                      → List orders
POST /api/v1/orders/stores/:storeId/orders                      → Create order
GET  /api/v1/orders/stores/:storeId/orders/:orderId             → Get order
GET  /api/v1/orders/stores/:storeId/orders/:orderId/events      → Order events
POST /api/v1/orders/stores/:storeId/orders/:orderId/submit      → Submit order
POST /api/v1/orders/stores/:storeId/orders/:orderId/cancel      → Cancel order
POST /api/v1/orders/stores/:storeId/orders/:orderId/receive     → GRN receive
GET  /api/v1/orders/stores/:storeId/orders/:orderId/receives    → List receives
```

### Reorder Service (`/api/v1/reorder/...`)
```
GET   /api/v1/reorder/stores/:storeId/reorder/pending                   → List pending
GET   /api/v1/reorder/stores/:storeId/reorder/pending/:pendingId        → Get pending
POST  /api/v1/reorder/stores/:storeId/reorder/pending/approve           → Approve
POST  /api/v1/reorder/stores/:storeId/reorder/pending/:pendingId/dismiss → Dismiss
GET   /api/v1/reorder/stores/:storeId/reorder/settings                  → Get settings
PATCH /api/v1/reorder/stores/:storeId/reorder/settings                  → Update settings
GET   /api/v1/reorder/stores/:storeId/reorder/policies                  → List policies
PATCH /api/v1/reorder/stores/:storeId/reorder/policies/:productId       → Update policy
```

---

## Next Steps

1. **Verify remaining APIs via gateway** - curl tests with real device token
2. **Test each data creation flow** - no seed, real actions only
3. **Implement missing empty states** - CTAs to creation flows
4. **Document schema migrations** - ensure DB matches API expectations
