# Demo Store Data Contract

> Generated: 2026-01-15
> Minimum Viable Seed Dataset for Demo Stores

---

## Overview

This document defines the **minimum viable dataset** required for each module so that every screen in the POS app has real data to render. This contract is used by the demo seed endpoint to provision new demo stores.

### Design Principles

1. **Idempotent**: Running seed multiple times produces same result (UPSERT, not INSERT)
2. **Isolated**: Each demo store gets its own data (no cross-store pollution)
3. **Safe**: Demo seed only affects stores with `is_demo=true` or demo code patterns
4. **Complete**: Every screen in UI_VISIBILITY_MAP.md has data to render

---

## Module 1: SELL (Products + Barcodes)

### Required Tables
| Table | Schema | Purpose |
|-------|--------|---------|
| `catalog.products` | catalog | Master product catalog |
| `catalog.store_products` | catalog | Store-specific product instances |
| `catalog.product_barcodes` | catalog | EAN/UPC barcode mappings |

### Minimum Dataset
```yaml
products:
  count: 20
  categories:
    - Groceries (5 items)
    - Beverages (5 items)
    - Snacks (5 items)
    - Personal Care (5 items)

  required_fields:
    - id: UUID (generated)
    - name: String (realistic product name)
    - sku: String (unique, e.g., "DEMO-SKU-001")
    - category: String
    - unit: String (kg, pcs, ltr, etc.)
    - mrp: Decimal (realistic price)
    - selling_price: Decimal (≤ mrp)
    - tax_rate: Decimal (0, 5, 12, 18, 28)
    - hsn_code: String (optional)

store_products:
  count: 20 (1:1 with products for demo store)
  required_fields:
    - store_id: UUID (demo store ID)
    - product_id: UUID (FK to products)
    - stock_qty: Integer (10-100)
    - reorder_level: Integer (5-20)
    - active: Boolean (true)

product_barcodes:
  count: 20 (1:1 with products)
  required_fields:
    - product_id: UUID (FK to products)
    - barcode: String (13-digit EAN)
    - barcode_type: "EAN13"
```

### Sample Products
| Name | Category | MRP | SKU | Barcode |
|------|----------|-----|-----|---------|
| Tata Salt 1kg | Groceries | 28.00 | DEMO-SKU-001 | 8901030001001 |
| Amul Butter 500g | Groceries | 280.00 | DEMO-SKU-002 | 8901030001002 |
| Coca-Cola 2L | Beverages | 95.00 | DEMO-SKU-003 | 8901030001003 |
| Maggi Noodles 70g | Snacks | 14.00 | DEMO-SKU-004 | 8901030001004 |
| Colgate 100g | Personal Care | 55.00 | DEMO-SKU-005 | 8901030001005 |
| ... | ... | ... | ... | ... |

---

## Module 2: BUY (Suppliers + Catalog)

### Required Tables
| Table | Schema | Purpose |
|-------|--------|---------|
| `supplier.suppliers` | supplier | Supplier master data |
| `catalog.supplier_products` | catalog | Products available from suppliers |
| `catalog.supplier_product_map` | catalog | Store-supplier-product mapping |

### Minimum Dataset
```yaml
suppliers:
  count: 3
  required_fields:
    - id: UUID (generated)
    - name: String (supplier name)
    - code: String (unique, e.g., "SUP-DEMO-001")
    - contact_name: String
    - contact_phone: String
    - email: String
    - address: String
    - active: Boolean (true)

supplier_products:
  count: 30 (10 per supplier)
  required_fields:
    - supplier_id: UUID (FK to suppliers)
    - product_id: UUID (FK to products)
    - supplier_sku: String
    - cost_price: Decimal
    - moq: Integer (minimum order qty)
    - lead_time_days: Integer

supplier_product_map:
  count: 30 (links store to supplier products)
  required_fields:
    - store_id: UUID (demo store ID)
    - supplier_product_id: UUID
    - active: Boolean (true)
```

### Sample Suppliers
| Name | Code | Products | Lead Time |
|------|------|----------|-----------|
| Metro Wholesale | SUP-DEMO-001 | 10 | 2 days |
| Local Distributor | SUP-DEMO-002 | 10 | 1 day |
| Direct Manufacturer | SUP-DEMO-003 | 10 | 5 days |

---

## Module 3: ORDERS (Purchase Orders)

### Required Tables
| Table | Schema | Purpose |
|-------|--------|---------|
| `orders.purchase_orders` | orders | PO headers |
| `orders.purchase_order_items` | orders | PO line items |

### Minimum Dataset
```yaml
purchase_orders:
  count: 5
  statuses:
    - DRAFT: 1
    - SUBMITTED: 1
    - CONFIRMED: 1
    - PARTIALLY_RECEIVED: 1
    - COMPLETED: 1

  required_fields:
    - id: UUID (generated)
    - store_id: UUID (demo store ID)
    - supplier_id: UUID (FK to suppliers)
    - order_number: String (e.g., "PO-DEMO-001")
    - status: Enum (see above)
    - total_amount: Decimal
    - created_at: Timestamp
    - expected_date: Timestamp

purchase_order_items:
  count: 15 (3 per order)
  required_fields:
    - order_id: UUID (FK to purchase_orders)
    - product_id: UUID (FK to products)
    - quantity: Integer
    - unit_price: Decimal
    - received_qty: Integer (for partial/completed)
```

### Sample Orders
| Order # | Supplier | Status | Items | Total |
|---------|----------|--------|-------|-------|
| PO-DEMO-001 | Metro Wholesale | DRAFT | 3 | ₹2,500 |
| PO-DEMO-002 | Local Distributor | SUBMITTED | 3 | ₹1,800 |
| PO-DEMO-003 | Direct Manufacturer | CONFIRMED | 3 | ₹5,200 |
| PO-DEMO-004 | Metro Wholesale | PARTIALLY_RECEIVED | 3 | ₹3,100 |
| PO-DEMO-005 | Local Distributor | COMPLETED | 3 | ₹1,500 |

---

## Module 4: INVENTORY (Stock + Ledger)

### Required Tables
| Table | Schema | Purpose |
|-------|--------|---------|
| `inventory.stock_balances` | inventory | Current stock levels |
| `inventory.inventory_ledger` | inventory | Stock movement history |
| `inventory.grn_headers` | inventory | Goods Receipt Notes |
| `inventory.grn_items` | inventory | GRN line items |

### Minimum Dataset
```yaml
stock_balances:
  count: 20 (1:1 with store_products)
  required_fields:
    - store_id: UUID (demo store ID)
    - product_id: UUID (FK to products)
    - quantity: Integer (current stock)
    - reserved_qty: Integer (0)
    - updated_at: Timestamp

inventory_ledger:
  count: 40 (2 entries per product: initial + adjustment)
  required_fields:
    - store_id: UUID (demo store ID)
    - product_id: UUID (FK to products)
    - transaction_type: Enum (INITIAL, GRN, SALE, ADJUSTMENT)
    - quantity: Integer (+ for inward, - for outward)
    - reference_id: UUID (optional, FK to source doc)
    - created_at: Timestamp

grn_headers:
  count: 3 (completed GRNs for purchase history)
  required_fields:
    - id: UUID (generated)
    - store_id: UUID (demo store ID)
    - grn_number: String (e.g., "GRN-DEMO-001")
    - order_id: UUID (FK to purchase_orders, optional)
    - supplier_id: UUID (FK to suppliers)
    - status: "COMPLETED"
    - total_amount: Decimal
    - received_at: Timestamp

grn_items:
  count: 9 (3 per GRN)
  required_fields:
    - grn_id: UUID (FK to grn_headers)
    - product_id: UUID (FK to products)
    - quantity: Integer
    - unit_price: Decimal
```

---

## Module 5: SALES (Bills + Transactions)

### Required Tables
| Table | Schema | Purpose |
|-------|--------|---------|
| `public.bills` | public | Sale transactions |
| `public.bill_items` | public | Sale line items |

### Minimum Dataset
```yaml
bills:
  count: 10
  required_fields:
    - id: UUID (generated)
    - store_id: UUID (demo store ID)
    - bill_number: String (e.g., "BILL-DEMO-001")
    - status: "COMPLETED"
    - subtotal: Decimal
    - tax_amount: Decimal
    - total_amount: Decimal
    - payment_method: Enum (CASH, UPI, CARD)
    - created_at: Timestamp (spread over last 7 days)

bill_items:
  count: 30 (3 per bill)
  required_fields:
    - bill_id: UUID (FK to bills)
    - product_id: UUID (FK to products)
    - quantity: Integer
    - unit_price: Decimal
    - tax_rate: Decimal
    - line_total: Decimal
```

### Sample Bills
| Bill # | Date | Items | Total | Payment |
|--------|------|-------|-------|---------|
| BILL-DEMO-001 | Today | 3 | ₹245 | CASH |
| BILL-DEMO-002 | Today | 3 | ₹580 | UPI |
| BILL-DEMO-003 | Yesterday | 3 | ₹125 | CASH |
| ... | ... | ... | ... | ... |

---

## Module 6: REORDER (Policies + Suggestions)

### Required Tables
| Table | Schema | Purpose |
|-------|--------|---------|
| `reorder.reorder_policies` | reorder | Auto-reorder rules |
| `reorder.reorder_suggestions` | reorder | Generated suggestions |

### Minimum Dataset
```yaml
reorder_policies:
  count: 5
  required_fields:
    - id: UUID (generated)
    - store_id: UUID (demo store ID)
    - product_id: UUID (FK to products)
    - min_stock: Integer (trigger level)
    - reorder_qty: Integer (order quantity)
    - supplier_id: UUID (preferred supplier)
    - active: Boolean (true)

reorder_suggestions:
  count: 3 (generated based on low stock)
  required_fields:
    - id: UUID (generated)
    - store_id: UUID (demo store ID)
    - product_id: UUID (FK to products)
    - policy_id: UUID (FK to reorder_policies)
    - suggested_qty: Integer
    - reason: String (e.g., "Below reorder level")
    - status: "PENDING"
    - created_at: Timestamp
```

---

## Summary: Visibility Gap Coverage

| Gap | Module | Required Data | Count |
|-----|--------|---------------|-------|
| Gap 1: BarcodeSheet | SELL | product_barcodes | 20 |
| Gap 2: OrderHistory | ORDERS | purchase_orders | 5 |
| Gap 3: ReorderPolicies | REORDER | reorder_policies | 5 |
| Gap 4: SalesHistory | SALES | bills | 10 |
| Gap 5: StockStatement | INVENTORY | stock_balances | 20 |
| Gap 6: PurchaseHistory | INVENTORY | grn_headers | 3 |

---

## Seed Endpoint Specification

### Endpoint
```
POST /api/v1/demo/seed
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "storeId": "uuid-of-demo-store",
  "modules": ["all"] // or specific: ["sell", "buy", "orders", "inventory", "sales", "reorder"]
}
```

### Response
```json
{
  "success": true,
  "storeId": "uuid-of-demo-store",
  "seeded": {
    "products": 20,
    "store_products": 20,
    "barcodes": 20,
    "suppliers": 3,
    "supplier_products": 30,
    "purchase_orders": 5,
    "grn_headers": 3,
    "bills": 10,
    "reorder_policies": 5
  }
}
```

### Safety Checks
1. **Store must be demo**: Check `is_demo=true` OR store_code matches demo patterns
2. **Idempotent**: Use `ON CONFLICT DO UPDATE` for all inserts
3. **No production data**: Never seed stores with real transactions
4. **Audit logging**: Record all seed operations with timestamp and actor

---

## Schema References

Based on VM database inspection (2026-01-15):

```
Schemas: auth, catalog, inventory, orders, platform, public, reorder, supplier

Key Tables:
- platform.stores (id, name, code, status, is_demo)
- catalog.products (master catalog)
- catalog.store_products (store-specific)
- catalog.product_barcodes (EAN mappings)
- supplier.suppliers (supplier master)
- catalog.supplier_products (supplier catalog)
- orders.purchase_orders (PO headers)
- orders.purchase_order_items (PO lines)
- inventory.stock_balances (current stock)
- inventory.inventory_ledger (movements)
- inventory.grn_headers (goods receipts)
- inventory.grn_items (GRN lines)
- public.bills (sales)
- public.bill_items (sale lines)
- reorder.reorder_policies (auto-reorder rules)
- reorder.reorder_suggestions (generated suggestions)
```

---

## Next Steps

1. Implement seed endpoint in backend (`POST /api/v1/demo/seed`)
2. Create SQL seed scripts per module
3. Add "Seed Demo Data" button to UiShowcaseScreen (QA only)
4. Verify all screens render with seeded data
5. Document in Golden Path QA checklist
