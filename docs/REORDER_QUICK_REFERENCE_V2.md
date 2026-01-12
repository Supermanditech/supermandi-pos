# REORDER System V2 - Quick Reference

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    MICROSERVICES ARCHITECTURE                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CLIENTS                                                         │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐        │
│  │Store   │ │Store   │ │Supplier│ │Supplier│ │Super   │        │
│  │POS     │ │Admin   │ │App     │ │Web     │ │Admin   │        │
│  └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘        │
│      └──────────┴──────────┴──────────┴──────────┘              │
│                            │                                     │
│                      ┌─────▼─────┐                               │
│                      │API Gateway│                               │
│                      └─────┬─────┘                               │
│                            │                                     │
│  ┌─────────┬─────────┬─────┴─────┬─────────┬─────────┐         │
│  ▼         ▼         ▼           ▼         ▼         ▼         │
│ auth    supplier  catalog   inventory  order   reorder         │
│ :3001   :3002     :3003     :3004      :3005   :3006           │
│                            │                                     │
│                      ┌─────▼─────┐                               │
│                      │PostgreSQL │                               │
│                      │  + Redis  │                               │
│                      └───────────┘                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## RBAC - Roles & Permissions

| Role | Actor | Key Permissions |
|------|-------|-----------------|
| `STORE_STAFF` | store | orders.write, inventory.write, reorder.read |
| `STORE_ADMIN` | store | All store.* permissions |
| `SUPPLIER_STAFF` | supplier | orders.read/write, catalog.read |
| `SUPPLIER_ADMIN` | supplier | All supplier.* permissions |
| `SUPERADMIN` | platform | platform.suppliers.*, platform.flags.* |

**Critical Rule**: Only SUPERADMIN can verify/merge suppliers.

---

## Key UX Rule

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│   REORDER tab          →→→→→→→→→→          BUY tab              │
│   "Decision"           Creates           "Execution"            │
│                        Drafts                                    │
│   • View suggestions                     • Browse catalog        │
│   • Approve/dismiss                      • Review draft POs      │
│   • Set policies                         • Edit cart             │
│                                          • Place orders          │
│                                          • Receive (GRN)         │
│                                                                  │
│   REORDER produces DRAFTS → BUY executes                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Data Tables

| Table | Service | Purpose |
|-------|---------|---------|
| `products` | catalog | Unified master products |
| `supplier_products` | catalog | Supplier's catalog (purchase_price!) |
| `supplier_product_map` | catalog | **BUYABILITY GATE** |
| `inventory_ledger` | inventory | Source of truth: stock = SUM(delta_qty) |
| `reorder_policies` | reorder | min_stock + target_stock per product |
| `pending_reorders` | reorder | Auto-generated suggestions (drafts) |
| `purchase_orders` | order | Actual orders |

---

## Event Flow

```
INVENTORY_CHANGED (sale)
    ↓
reorder-service (checks threshold)
    ↓
REORDER_DRAFT_CREATED (if stock < min)
    ↓
notification-service (push to store)
    ↓
Store approves in REORDER tab
    ↓
Draft PO created in BUY tab
    ↓
Store submits → PO_CREATED
    ↓
supplier-service + notification-service
```

---

## API Endpoints by Service

### auth-service
```
POST /auth/login
POST /auth/refresh
GET  /auth/me
POST /auth/device-token
```

### supplier-service
```
GET  /suppliers/search
GET  /stores/{id}/suppliers
POST /stores/{id}/suppliers/link
POST /stores/{id}/suppliers/request
POST /admin/suppliers/{id}/verify      # SUPERADMIN
POST /admin/suppliers/merge            # SUPERADMIN
```

### catalog-service
```
GET  /stores/{id}/catalog              # Unified (only mapped!)
GET  /stores/{id}/catalog/{pid}/suppliers
GET  /stores/{id}/catalog/unmatched    # Mapping queue
POST /stores/{id}/catalog/map          # Manual map
```

### inventory-service
```
GET  /stores/{id}/inventory
GET  /stores/{id}/inventory/{pid}
POST /stores/{id}/inventory/adjust
```

### order-service
```
POST /stores/{id}/purchase-orders
POST /stores/{id}/purchase-orders/from-reorders
GET  /stores/{id}/purchase-orders
POST /stores/{id}/purchase-orders/{id}/submit
POST /stores/{id}/purchase-orders/{id}/receive  # GRN
```

### reorder-service
```
GET  /stores/{id}/reorder/settings
PUT  /stores/{id}/reorder/settings
GET  /stores/{id}/reorder/policies
PUT  /stores/{id}/reorder/policies/{pid}
GET  /stores/{id}/reorder/pending
POST /stores/{id}/reorder/pending/approve
POST /stores/{id}/reorder/pending/{id}/dismiss
```

---

## Critical Tickets (P0)

| ID | Title | Days |
|----|-------|------|
| TICKET-001 | Database Schema (all services) | 4 |
| TICKET-020 | Auth Service + RBAC | 5 |
| TICKET-002 | Supplier Service | 5 |
| TICKET-003 | Catalog Service | 5 |
| TICKET-021 | Inventory Ledger | 5 |
| TICKET-010 | Order Service | 5 |
| TICKET-022 | Product Mapping | 5 |
| TICKET-023 | Reorder Policies | 5 |
| TICKET-005 | REORDER Screen | 5 |
| TICKET-006 | BUY Screen | 5 |

---

## Sprint Plan (12 weeks)

| Sprint | Focus |
|--------|-------|
| 1-2 | Foundation + Auth |
| 3-4 | Supplier, Catalog, Inventory services |
| 5-6 | Order, Reorder, Event bus |
| 7-8 | POS App UI (REORDER + BUY) |
| 9-10 | Admin surfaces, Supplier app |
| 11-12 | Superadmin, Notifications, Polish |

---

## Key Rules

1. **Mapping Gate**: Only products in `supplier_product_map` appear in BUY catalog
2. **Inventory Truth**: Stock = `SUM(delta_qty)` from `inventory_ledger`
3. **Price Naming**: `supplier_products.purchase_price` (not selling_price!)
4. **Policy > Link**: Reorder rules in `reorder_policies`, not supplier link
5. **Draft Flow**: REORDER creates drafts → BUY executes
6. **GSTIN Dedup**: Single supplier per GSTIN globally

---

## Files Structure

```
backend/
├── services/
│   ├── api-gateway/
│   ├── auth-service/
│   ├── supplier-service/
│   ├── catalog-service/
│   ├── inventory-service/
│   ├── order-service/
│   ├── reorder-service/
│   └── notification-service/
└── migrations/

supermandi-pos/ (POS App)
├── src/screens/
│   ├── BuyScreen.tsx
│   ├── ReorderScreen.tsx
│   └── ReorderSettingsScreen.tsx
├── src/stores/
│   └── purchaseCartStore.ts
└── src/components/
    ├── CatalogProductCard.tsx
    ├── ProductDetailModal.tsx
    └── PurchaseCartModal.tsx

admin-portal/       # Superadmin web
supplier-web/       # Supplier dashboard
supplier-app/       # Supplier mobile
```

---

## Docker Commands

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f order-service

# Run migrations
docker-compose exec auth-service npm run migrate:up

# Health check
curl localhost:3000/healthz
```

---

## Documents

- [Full Plan V2](REORDER_SYSTEM_DEVELOPMENT_PLAN_V2.md)
- [Tickets V2](REORDER_DEVELOPMENT_TICKETS_V2.json)
- [V1 Plan (deprecated)](REORDER_SYSTEM_DEVELOPMENT_PLAN.md)
