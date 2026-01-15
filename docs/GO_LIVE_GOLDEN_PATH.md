# Production Go-Live Golden Path

> Generated: 2026-01-15
> End-to-end verification for production store functionality (no seed data)

---

## Core Principle

**Every screen must work with data created through real user actions, not seeded data.**

This document defines the exact steps to verify each flow works in production.

---

## Prerequisites

Before starting golden path verification:

1. **Device enrolled** to a real production store (not demo code)
2. **Backend services running** via gateway on port 3000
3. **Database schemas migrated** with correct constraints
4. **Store has catalog** - Products linked by SuperAdmin

---

## Phase 1: Device Enrollment (Cold Start)

| Step | Action | Expected Result | API Call |
|------|--------|-----------------|----------|
| 1.1 | Launch app on fresh device | Enrollment screen appears | - |
| 1.2 | Enter valid enrollment code | Code validation passes | `POST /api/v1/pos/enroll` |
| 1.3 | Device receives token | Token stored locally | Returns `deviceToken` |
| 1.4 | App fetches UI status | Features/store info loaded | `GET /api/v1/pos/ui-status` |
| 1.5 | Navigate to main screen | Tabs visible based on features | - |

**Verification:**
```bash
# Check enrollment created device record
curl -s http://gateway:3000/api/v1/pos/ui-status \
  -H "x-device-id: <device-id>" | jq '.storeId, .storeName'
```

---

## Phase 2: SELL Flow (Core Revenue Path)

### 2.1 Product Search

| Step | Action | Expected Result | API Call |
|------|--------|-----------------|----------|
| 2.1.1 | Tap SELL tab | Search screen appears | - |
| 2.1.2 | Type product name | API search triggered | `GET /api/v1/catalog/stores/{storeId}/catalog?q=...` |
| 2.1.3 | See results | Products from store catalog | Returns `data[]` |
| 2.1.4 | Tap product | Product detail modal | - |

**Production Data Source:** Products added by SuperAdmin via:
- `catalog.products` (master catalog)
- `catalog.store_products` (store-specific pricing/stock)

**Empty State:** "No products found. Add products via SuperAdmin portal."

### 2.2 Cart & Checkout

| Step | Action | Expected Result | API Call |
|------|--------|-----------------|----------|
| 2.2.1 | Add product to cart | Cart count increases | - (local state) |
| 2.2.2 | Tap cart icon | Cart sheet opens | - |
| 2.2.3 | Tap Checkout | Payment screen opens | - |
| 2.2.4 | Select CASH | Payment mode selected | - |
| 2.2.5 | Complete sale | Sale created | `POST /api/v1/pos/sales` |
| 2.2.6 | Success screen | Bill number shown | - |

**DB Effects:**
```sql
-- Sale record created
INSERT INTO public.sales (id, store_id, bill_ref, total_minor, status, ...)

-- Line items created
INSERT INTO public.sale_items (sale_id, product_id, quantity, price_minor, ...)

-- Stock decremented
UPDATE catalog.store_products SET current_stock = current_stock - qty
  WHERE store_id = $storeId AND product_id = $productId

-- Ledger entry created
INSERT INTO inventory.stock_ledger (store_id, product_id, delta_qty, txn_type, ...)
  VALUES ($storeId, $productId, -$qty, 'SALE', ...)
```

---

## Phase 3: Sales History

| Step | Action | Expected Result | API Call |
|------|--------|-----------------|----------|
| 3.1 | Menu > Bills | Sales history screen | `GET /api/v1/pos/bills` |
| 3.2 | See recent bills | Bills from Phase 2 visible | Returns `bills[]` |
| 3.3 | Tap a bill | Bill detail screen | `GET /api/v1/pos/bills/{saleId}` |
| 3.4 | See line items | Products, quantities, prices | - |

**Production Data Source:** Created by completing Phase 2.

**Empty State:** "No bills yet. Make your first sale!" + CTA to SELL tab

---

## Phase 4: BUY Flow (Supplier Ordering)

**Prerequisite:** `buyEnabled` feature flag = true

### 4.1 Browse Supplier Catalog

| Step | Action | Expected Result | API Call |
|------|--------|-----------------|----------|
| 4.1.1 | Tap BUY tab | Supplier catalog appears | `GET /api/v1/catalog/stores/{storeId}/catalog` |
| 4.1.2 | See suppliers | Suppliers with linked products | Returns products with `suppliers[]` |
| 4.1.3 | Filter by category | Category filtering works | `?category=...` |

**Production Data Source:** Suppliers and mappings created by SuperAdmin:
- `supplier.suppliers` (supplier master)
- `catalog.supplier_product_map` (which products each supplier sells)

### 4.2 Create Purchase Order

| Step | Action | Expected Result | API Call |
|------|--------|-----------------|----------|
| 4.2.1 | Add products to cart | Purchase cart fills | - (local state) |
| 4.2.2 | Tap cart icon | Purchase cart modal | - |
| 4.2.3 | Review grouped by supplier | Items grouped correctly | - |
| 4.2.4 | Submit order | PO created | `POST /api/v1/orders/stores/{storeId}/orders` |

**DB Effects:**
```sql
-- Order created
INSERT INTO orders.purchase_orders (id, store_id, supplier_id, status, total_amount, ...)
  VALUES ($orderId, $storeId, $supplierId, 'submitted', $total, ...)

-- Order items created
INSERT INTO orders.purchase_order_items (order_id, product_id, quantity, unit_price, ...)
```

---

## Phase 5: Order History & GRN

### 5.1 View Order History

| Step | Action | Expected Result | API Call |
|------|--------|-----------------|----------|
| 5.1.1 | Menu > Purchase Orders | Order list screen | `GET /api/v1/orders/stores/{storeId}/orders` |
| 5.1.2 | See recent orders | PO from Phase 4 visible | Returns `data[]` |
| 5.1.3 | Filter by status | Filtering works | `?status=submitted,confirmed` |
| 5.1.4 | Tap an order | Order detail screen | `GET /api/v1/orders/stores/{storeId}/orders/{orderId}` |

**Empty State:** "No orders found. Create your first order!" + CTA to BUY tab

### 5.2 Receive Goods (GRN)

**Prerequisite:** Order in `confirmed` or `shipped` status

| Step | Action | Expected Result | API Call |
|------|--------|-----------------|----------|
| 5.2.1 | Open order in `shipped` status | GRN button visible | - |
| 5.2.2 | Tap "Receive Stock" | GRN screen opens | `GET /api/v1/orders/stores/{storeId}/orders/{orderId}` |
| 5.2.3 | Enter received quantities | Quantities updated | - |
| 5.2.4 | Submit GRN | Stock received | `POST /api/v1/orders/stores/{storeId}/orders/{orderId}/receive` |

**DB Effects:**
```sql
-- Receive record created
INSERT INTO orders.receive_records (id, order_id, notes, ...)

-- Order status updated
UPDATE orders.purchase_orders SET status = 'received' WHERE id = $orderId

-- Stock incremented
UPDATE catalog.store_products SET current_stock = current_stock + received_qty
  WHERE store_id = $storeId AND product_id = $productId

-- Ledger entry created
INSERT INTO inventory.stock_ledger (store_id, product_id, delta_qty, txn_type, reference_id, ...)
  VALUES ($storeId, $productId, +$qty, 'GRN', $receiveRecordId, ...)
```

---

## Phase 6: Manual Stock Inward

| Step | Action | Expected Result | API Call |
|------|--------|-----------------|----------|
| 6.1 | Menu > Stock Inward | Inward screen opens | - |
| 6.2 | Search product | Product from catalog | `GET /api/v1/catalog/stores/{storeId}/catalog?q=...` |
| 6.3 | Enter quantity & price | Form filled | - |
| 6.4 | Submit | Stock added | `POST /api/v1/inventory/inward` |

**DB Effects:**
```sql
-- Inward entry created
INSERT INTO inventory.inward_entries (id, store_id, product_id, quantity, unit_cost, ...)

-- Stock incremented
UPDATE catalog.store_products SET current_stock = current_stock + qty

-- Ledger entry created
INSERT INTO inventory.stock_ledger (..., txn_type, ...) VALUES (..., 'INWARD', ...)
```

---

## Phase 7: Reports

### 7.1 Sales Statement

| Step | Action | Expected Result | API Call |
|------|--------|-----------------|----------|
| 7.1.1 | Menu > Sales Statement | Statement screen | `GET /api/v1/inventory/ledger?type=SALE` |
| 7.1.2 | See daily summaries | Sales from Phase 2 visible | Returns ledger entries |

**Production Data Source:** Created by completing sales (Phase 2).

**Empty State:** "No sales data. Make your first sale!" + CTA to SELL tab

### 7.2 Purchase History

| Step | Action | Expected Result | API Call |
|------|--------|-----------------|----------|
| 7.2.1 | Menu > Purchase History | History screen | `GET /api/v1/inventory/ledger?type=GRN,INWARD` |
| 7.2.2 | See inward transactions | GRN/Inward entries visible | Returns ledger entries |

**Production Data Source:** Created by GRN (Phase 5.2) or Manual Inward (Phase 6).

**Empty State:** "No purchase history. Add stock via Inward!" + CTA to Inward

### 7.3 Stock Statement

| Step | Action | Expected Result | API Call |
|------|--------|-----------------|----------|
| 7.3.1 | Menu > Stock Statement | Stock screen | `GET /api/v1/catalog/stores/{storeId}/catalog` |
| 7.3.2 | See current stock levels | Products with stock quantities | Returns products |

**Production Data Source:** Calculated from:
- Initial stock set by SuperAdmin
- Sales decrement
- GRN/Inward increment

---

## Phase 8: REORDER Flow

**Prerequisite:** `reorderEnabled` feature flag = true

### 8.1 Configure Reorder Policies

| Step | Action | Expected Result | API Call |
|------|--------|-----------------|----------|
| 8.1.1 | Menu > Reorder Policies | Policies screen | `GET /api/v1/reorder/stores/{storeId}/reorder/policies` |
| 8.1.2 | Tap a product | Edit policy modal | - |
| 8.1.3 | Set min threshold | Value saved | `PATCH /api/v1/reorder/stores/{storeId}/reorder/policies/{productId}` |

**DB Effects:**
```sql
INSERT INTO reorder.reorder_policies (store_id, product_id, min_threshold, target_stock, ...)
  ON CONFLICT (store_id, product_id) DO UPDATE ...
```

### 8.2 View Reorder Suggestions

| Step | Action | Expected Result | API Call |
|------|--------|-----------------|----------|
| 8.2.1 | Tap REORDER tab | Suggestions screen | `GET /api/v1/reorder/stores/{storeId}/reorder/pending` |
| 8.2.2 | See low stock alerts | Products below threshold | Returns `data[]` |
| 8.2.3 | Approve suggestion | Draft PO created | `POST /api/v1/reorder/stores/{storeId}/reorder/pending/approve` |

**Production Data Source:** Auto-generated when:
- Reorder policies configured (min_threshold set)
- Stock drops below threshold (via sales)
- Background job creates suggestions

---

## Production Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                    SUPERADMIN (External)                        │
│  Creates: stores, products, suppliers, supplier_product_map    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      POS APP (This App)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SELL Tab:                                                      │
│    Search products → Add to cart → Checkout                     │
│    Creates: sales, sale_items, stock_ledger (SALE)             │
│    Updates: store_products.current_stock (-qty)                 │
│                                                                 │
│  BUY Tab:                                                       │
│    Browse suppliers → Add to cart → Submit order                │
│    Creates: purchase_orders, purchase_order_items               │
│                                                                 │
│  Order History:                                                 │
│    View orders → Receive goods (GRN)                            │
│    Creates: receive_records, stock_ledger (GRN)                 │
│    Updates: purchase_orders.status, store_products (+qty)       │
│                                                                 │
│  Inward Screen:                                                 │
│    Search product → Enter qty → Submit                          │
│    Creates: inward_entries, stock_ledger (INWARD)               │
│    Updates: store_products.current_stock (+qty)                 │
│                                                                 │
│  REORDER Tab:                                                   │
│    View suggestions → Approve                                   │
│    Reads: reorder_policies, stock levels                        │
│    Creates: draft purchase_orders                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Verification Checklist

| Flow | Creates Real Data | No Seed Required | Empty State | CTA Works |
|------|-------------------|------------------|-------------|-----------|
| Enrollment | ✅ device record | ✅ | N/A | N/A |
| SELL/Checkout | ✅ sales | ✅ | ✅ | N/A |
| Sales History | ✅ via checkout | ✅ | ✅ | ✅ → SELL |
| BUY/Order | ✅ purchase_orders | ✅ | ✅ | N/A |
| Order History | ✅ via BUY | ✅ | ✅ | ✅ → BUY |
| GRN | ✅ receive_records | ✅ | N/A | N/A |
| Inward | ✅ inward_entries | ✅ | ✅ | N/A |
| Purchase History | ✅ via GRN/Inward | ✅ | ✅ | ✅ → Inward |
| Sales Statement | ✅ via checkout | ✅ | ✅ | ✅ → SELL |
| Stock Statement | ✅ via catalog | ✅ | ✅ | N/A |
| Reorder Policies | ✅ user config | ✅ | ✅ | N/A |
| Reorder Suggestions | ✅ auto-generated | ✅ | ✅ | N/A |

---

## Test Environment

| Property | Value |
|----------|-------|
| Tester | ________________ |
| Date | ________________ |
| App Version | ________________ |
| Device | ________________ |
| Gateway URL | http://gateway:3000 |
| Store ID | ________________ |

---

## Sign-Off

- [ ] All flows verified with real data
- [ ] No seed-only dependencies found
- [ ] Empty states render correctly
- [ ] CTAs navigate to correct screens
- [ ] Production ready

Approved by: ________________ Date: ________________
