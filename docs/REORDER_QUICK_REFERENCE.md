# REORDER System - Quick Reference

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    REORDER SYSTEM FLOW                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   RETAILER POS                        SUPPLIER APP               │
│   ┌─────────────────┐                ┌─────────────────┐        │
│   │                 │                │                 │        │
│   │  1. Stock Low   │                │  6. Receive     │        │
│   │     ↓           │                │     Order       │        │
│   │  2. Pending     │   ──────────>  │     ↓           │        │
│   │     Reorder     │   Order Sent   │  7. Confirm     │        │
│   │     ↓           │                │     ↓           │        │
│   │  3. Approve     │   <──────────  │  8. Ship        │        │
│   │     ↓           │   Status       │     ↓           │        │
│   │  4. Order       │   Updates      │  9. Deliver     │        │
│   │     Created     │                │                 │        │
│   │     ↓           │                └─────────────────┘        │
│   │  5. Receive     │                                           │
│   │     (GRN)       │                                           │
│   │     ↓           │                                           │
│   │  Stock Updated  │                                           │
│   │                 │                                           │
│   └─────────────────┘                                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Entities

| Entity | Description | Unique Key |
|--------|-------------|------------|
| Supplier | Wholesaler/manufacturer | GSTIN |
| SupplierStoreLink | Relationship between supplier and store | supplier_id + store_id |
| SupplierProduct | Products in supplier catalog | supplier_id + supplier_sku |
| PendingReorder | Auto-generated restock suggestion | id |
| PurchaseOrder | Order placed with supplier | order_number |

---

## API Endpoints Summary

### Suppliers
```
GET    /api/v1/stores/{storeId}/suppliers          # List linked suppliers
POST   /api/v1/stores/{storeId}/suppliers/link     # Link new supplier
PUT    /api/v1/stores/{storeId}/suppliers/{id}     # Update settings
DELETE /api/v1/stores/{storeId}/suppliers/{id}/unlink  # Unlink
```

### Catalog
```
GET    /api/v1/stores/{storeId}/catalog            # Browse products
GET    /api/v1/stores/{storeId}/catalog/{id}/suppliers  # Suppliers for product
POST   /api/v1/stores/{storeId}/catalog/sync       # Sync catalog
```

### Reorders
```
GET    /api/v1/stores/{storeId}/reorders/pending   # Get pending reorders
POST   /api/v1/stores/{storeId}/reorders/approve   # Approve & create orders
POST   /api/v1/stores/{storeId}/reorders/{id}/dismiss  # Dismiss reorder
PUT    /api/v1/stores/{storeId}/reorder-rules      # Set reorder rules
```

### Purchase Orders
```
POST   /api/v1/stores/{storeId}/purchase-orders    # Create order
GET    /api/v1/stores/{storeId}/purchase-orders    # List orders
GET    /api/v1/stores/{storeId}/purchase-orders/{id}   # Order detail
PUT    /api/v1/stores/{storeId}/purchase-orders/{id}/status  # Update status
POST   /api/v1/stores/{storeId}/purchase-orders/{id}/receive # GRN
```

---

## Order Status Flow

```
draft → pending_approval → approved → sent_to_supplier → confirmed → shipped → delivered
                                                                           ↘
                                                                        cancelled
```

---

## Sprint Timeline

| Sprint | Weeks | Focus | Key Deliverables |
|--------|-------|-------|------------------|
| 1-2 | Week 1-2 | Foundation | Database, Core APIs, Cart Store |
| 3-4 | Week 3-4 | REORDER UI | Main screen, Components, Cart Modal |
| 5-6 | Week 5-6 | Orders | Order creation, History, Details |
| 7-8 | Week 7-8 | Automation | Stock monitor, Auto-order, Notifications |
| 9-10 | Week 9-10 | Supplier | Supplier app, Real-time sync |

---

## Critical Tickets (P0)

| ID | Title | Days |
|----|-------|------|
| TICKET-001 | Database Schema Setup | 3 |
| TICKET-002 | Supplier Service APIs | 5 |
| TICKET-003 | Catalog Service APIs | 5 |
| TICKET-004 | Purchase Cart Store | 3 |
| TICKET-005 | REORDER Screen UI | 5 |
| TICKET-010 | Purchase Order Service | 5 |

---

## Files to Create

### Frontend (POS App)
```
src/
├── screens/
│   ├── ReorderScreen.tsx           # Main REORDER tab
│   ├── ReorderSettingsScreen.tsx   # Settings/rules
│   ├── OrderConfirmationScreen.tsx # Order summary
│   ├── OrderHistoryScreen.tsx      # Past orders
│   └── OrderDetailScreen.tsx       # Single order
├── components/
│   ├── PendingReorderCard.tsx      # Reorder suggestion card
│   ├── CatalogProductCard.tsx      # Product grid item
│   └── PurchaseCartModal.tsx       # Cart by supplier
├── stores/
│   └── purchaseCartStore.ts        # Zustand store
└── services/
    ├── supplierService.ts          # Supplier APIs
    ├── catalogService.ts           # Catalog APIs
    ├── reorderService.ts           # Reorder APIs
    └── purchaseOrderService.ts     # Order APIs
```

### Backend
```
backend/
├── migrations/
│   ├── 001_suppliers.sql
│   ├── 002_supplier_products.sql
│   ├── 003_purchase_orders.sql
│   └── 004_reorder_rules.sql
├── services/
│   ├── supplierService.js
│   ├── catalogService.js
│   ├── reorderService.js
│   └── purchaseOrderService.js
├── routes/
│   ├── suppliers.js
│   ├── catalog.js
│   ├── reorders.js
│   └── purchaseOrders.js
└── jobs/
    ├── stockMonitor.js
    └── autoOrder.js
```

---

## GSTIN Validation

```typescript
// 27AABCT1234A1Z5
// [State][PAN][Entity][Check]

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

function validateGSTIN(gstin: string): boolean {
  if (!GSTIN_REGEX.test(gstin)) return false;
  // Additional checksum validation if needed
  return true;
}
```

---

## Deduplication Logic

```
When linking a supplier:

1. Extract GSTIN from input
2. Query: SELECT * FROM suppliers WHERE gstin = ?
3. IF exists:
   - Create supplier_store_link only
   - Return existing supplier
4. IF not exists:
   - Create new supplier
   - Create supplier_store_link
   - Return new supplier
```

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Supplier dedup key | GSTIN | Unique business identifier in India |
| Catalog view | Unified (hide supplier) | Simpler UX, system optimizes |
| Reorder default | Require approval | Safety first, auto-order opt-in |
| Cart separation | Separate from sell cart | Different flows, avoid confusion |
| Stock sync | Polling first, WS later | Simpler initial implementation |

---

## Quick Commands

```bash
# Run migrations
npm run migrate:up

# Seed test data
npm run seed:suppliers

# Run stock monitor manually
npm run job:stock-monitor

# Check pending reorders
curl localhost:3000/api/v1/stores/store-1/reorders/pending
```

---

## Contact

For questions about this system:
- Technical: [Developer Name]
- Product: [PM Name]
- Design: [Designer Name]
