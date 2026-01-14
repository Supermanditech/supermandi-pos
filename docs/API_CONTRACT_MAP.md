# SuperMandi API Contract Map
## GO-LIVE-001 Audit Report
**Date:** 2026-01-14
**Version:** V3.0.10

---

## 1. API Configuration

### Base URLs
| Environment | URL | Port |
|-------------|-----|------|
| Production (GCP VM) | `http://34.14.220.171` | 3000 |
| Enrollment Service | `http://34.14.220.171` | 3009 |
| Dev/LAN | `http://192.168.31.66` | 3001 |

### Authentication Flow
```
1. Device Enrollment: POST /api/v1/pos/enroll
   → Returns: { deviceId, storeId, deviceToken }

2. All subsequent requests include header:
   x-device-token: {deviceToken}
```

---

## 2. Database Schema Overview

| Schema | Tables | Purpose |
|--------|--------|---------|
| **auth** | users, roles, user_roles, device_tokens, refresh_tokens | User authentication |
| **catalog** | products, store_products, supplier_products, supplier_product_map, product_barcodes | Product catalog |
| **inventory** | stock_balances, inventory_ledger | Stock tracking |
| **orders** | purchase_orders, purchase_order_items, order_events | Purchase orders |
| **reorder** | pending_reorders, reorder_policies, store_reorder_settings, reorder_runs | Auto-reorder |
| **supplier** | suppliers, supplier_store_links, supplier_requests | Supplier management |
| **platform** | stores, feature_flags | Store configuration |
| **public** | pos_devices, pos_device_enrollments | Device management |

---

## 3. API Endpoints by Domain

### 3.1 Device & Store Status

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/v1/pos/enroll` | POST | Device enrollment | ✅ Working |
| `/api/v1/pos/ui-status` | GET | Feature flags + status | ✅ Working |
| `/api/v1/pos/devices/me` | GET | Device info | ✅ Working |
| `/api/v1/pos/stores/{storeId}/status` | GET | Store status | ✅ Working |

**Sample Request/Response:**
```typescript
// POST /api/v1/pos/enroll
Request: { code: "ABC123", deviceMeta: { manufacturer, model, appVersion } }
Response: { deviceId, storeId, deviceToken, storeActive }

// GET /api/v1/pos/ui-status
Response: {
  features: { reorderEnabled, inventoryEnabled, suppliersEnabled, ordersEnabled },
  version: "3.0.9"
}
```

### 3.2 Sales & Billing

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/v1/pos/sales` | POST | Create sale | ⚠️ Needs testing |
| `/api/v1/pos/sales/{saleId}/cancel` | POST | Cancel sale | ⚠️ Needs testing |
| `/api/v1/pos/bills` | GET | List bills | ⚠️ Needs testing |
| `/api/v1/pos/bills/{saleId}` | GET | Bill details | ⚠️ Needs testing |

**DB Tables Used:**
- No dedicated `sales` table found - may use inventory_ledger for transactions

### 3.3 Payments & Collections

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/v1/pos/payments/cash` | POST | Cash payment | ⚠️ Needs testing |
| `/api/v1/pos/payments/upi/init` | POST | Init UPI | ⚠️ Needs testing |
| `/api/v1/pos/payments/upi/confirm-manual` | POST | Confirm UPI | ⚠️ Needs testing |
| `/api/v1/pos/collections/*` | POST | Due collections | ⚠️ Needs testing |

### 3.4 Products & Catalog

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/v1/pos/scan/resolve` | POST | Barcode lookup | ✅ Working |
| `/api/v2/products` | GET | List products | ✅ Working |
| `/api/v2/products/lookup` | GET | Product lookup | ✅ Working |
| `/api/v1/catalog/stores/{storeId}/catalog` | GET | Store catalog | ✅ Working |
| `/api/v1/catalog/stores/{storeId}/catalog/{productId}` | GET | Product detail | ✅ Working |

**DB Tables:**
- `catalog.products` - Master product list
- `catalog.store_products` - Per-store product config (price, stock)
- `catalog.supplier_products` - Supplier product offerings
- `catalog.product_barcodes` - Multiple barcodes per product

### 3.5 Inventory

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/v1/pos/inventory/stock/{productId}` | GET | Get stock | ✅ Working |
| `/api/v1/pos/inventory/stock/batch` | POST | Batch stock | ✅ Working |
| `/api/v1/pos/inventory/transactions` | POST | Record transaction | ✅ Working |

**DB Tables:**
- `inventory.stock_balances` - Current stock per store/product
- `inventory.inventory_ledger` - Transaction history (in/out)

**Sample Ledger Entry:**
```sql
-- inventory.inventory_ledger columns:
id, store_id, product_id, global_product_id, transaction_type,
delta_qty, reference_type, reference_id, reference_sub_id,
supplier_id, unit_price, notes, created_at, created_by
```

### 3.6 Purchase Orders

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/v1/orders/stores/{storeId}/orders` | GET | List POs | ✅ Working |
| `/api/v1/orders/stores/{storeId}/orders` | POST | Create PO | ✅ Working |
| `/api/v1/orders/stores/{storeId}/orders/{orderId}` | GET | PO detail | ✅ Working |
| `/api/v1/orders/stores/{storeId}/orders/{orderId}/submit` | POST | Submit draft | ✅ Working |
| `/api/v1/orders/stores/{storeId}/orders/{orderId}/receive` | POST | GRN | ✅ Working |

**DB Tables:**
- `orders.purchase_orders` - PO header
- `orders.purchase_order_items` - PO line items
- `orders.order_events` - PO timeline

### 3.7 Reorder System

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/v1/reorder/stores/{storeId}/reorder/pending` | GET | Pending reorders | ✅ Working |
| `/api/v1/reorder/stores/{storeId}/reorder/pending/approve` | POST | Approve | ✅ Working |
| `/api/v1/reorder/stores/{storeId}/reorder/settings` | GET/PATCH | Settings | ✅ Working |
| `/api/v1/reorder/stores/{storeId}/reorder/policies` | GET | List policies | ✅ Working |
| `/api/v1/reorder/stores/{storeId}/reorder/policies/{productId}` | GET/PATCH | Policy | ✅ Working |

**DB Tables:**
- `reorder.pending_reorders` - Items needing reorder
- `reorder.reorder_policies` - Min/max stock per product
- `reorder.store_reorder_settings` - Global reorder settings

---

## 4. GAPS IDENTIFIED

### 4.1 Missing Tables
| Missing | Expected Location | Used By |
|---------|------------------|---------|
| `sales` table | public or sales schema | Sales/billing endpoints |
| `sale_items` table | public or sales schema | Bill line items |
| `payments` table | public or payments schema | Payment records |

**Impact:** Sales and billing endpoints may not persist data correctly.

### 4.2 Missing Endpoints for New Features
| Feature | Missing Endpoint | Priority |
|---------|-----------------|----------|
| **Sales Statement** | `/api/v1/reports/sales-statement` | P0 |
| **Stock Statement** | `/api/v1/reports/stock-statement` | P0 |
| **Purchase History** | `/api/v1/reports/purchase-history` | P0 |
| **Inward/Stock-in** | Uses existing GRN flow | OK |

### 4.3 Feature Flags Not Synced
| Issue | Location | Fix |
|-------|----------|-----|
| `reorderEnabled` from API not updating settingsStore | PosRootLayout.tsx | Add sync in loadStatus() |
| `buyEnabled` hardcoded to true | settingsStore.ts | Sync from API |

### 4.4 Missing API Fields
| Endpoint | Missing Field | Purpose |
|----------|--------------|---------|
| `/api/v1/pos/ui-status` | `buyEnabled` | Control BUY tab |
| `/api/v1/pos/ui-status` | `storeActive` | Store status |

---

## 5. VERIFIED WORKING ENDPOINTS

Tested on VM (34.14.220.171):

```bash
# UI Status
curl http://34.14.220.171:3009/api/v1/pos/ui-status
# Returns: {"features":{"reorderEnabled":true,...},"version":"3.0.9"}

# Health Check
curl http://34.14.220.171:3009/healthz
# Returns: {"status":"ok"}
```

---

## 6. RECOMMENDATIONS

### Immediate (P0)
1. **Add sales/payments tables** - or confirm they exist in another schema
2. **Sync feature flags** - Update settingsStore from ui-status response
3. **Create reports endpoints** - Or build reports from existing ledger data

### Short-term (P1)
1. Add `buyEnabled` to ui-status response
2. Add reconciliation endpoint for stock verification
3. Add batch operations for seed data

---

## 7. APPENDIX: Full Table Schemas

### catalog.products
```sql
id, name, description, brand, category, unit, pack_size,
primary_barcode, hsn_code, default_gst_rate, is_active,
created_at, updated_at
```

### catalog.store_products
```sql
id, store_id, product_id, sell_price, mrp, cost_price,
current_stock, min_stock, max_stock, is_active,
created_at, updated_at
```

### inventory.inventory_ledger
```sql
id, store_id, product_id, global_product_id,
transaction_type, delta_qty, balance_after,
reference_type, reference_id, reference_sub_id,
supplier_id, unit_price, notes,
created_at, created_by
```

### orders.purchase_orders
```sql
id, store_id, supplier_id, supplier_name,
status, total_amount, item_count,
notes, created_at, updated_at, submitted_at,
confirmed_at, shipped_at, received_at, cancelled_at
```

### reorder.pending_reorders
```sql
id, store_id, product_id, supplier_product_id,
supplier_id, suggested_quantity, current_stock,
min_stock, max_stock, status, priority,
created_at, reviewed_at, approved_at, dismissed_at
```

---

*End of API Contract Map*
