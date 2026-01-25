# SuperMandi Service Architecture

## Overview

SuperMandi uses a **monolith-first** deployment pattern. While individual microservices exist in the codebase, all production traffic is routed through a single main-backend service.

## Current Deployment (Go-Live Phase 1)

```
┌─────────────────────────────────────────────────────────────────┐
│                      API Gateway (:3000)                        │
│  - Rate limiting (100 req/min)                                  │
│  - Correlation ID injection                                      │
│  - All routes → main-backend                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Main Backend (:3010)                          │
│  - POS endpoints (/api/v1/pos/*)                                │
│  - Admin endpoints (/api/v1/admin/*)                            │
│  - Retailer Admin (/api/v1/retailer-admin/*)                    │
│  - Auth, Platform, Catalog, Inventory, Orders, Reorder          │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
     ┌─────────────────┐             ┌─────────────────┐
     │   PostgreSQL    │             │      Redis      │
     │    (:5432)      │             │     (:6379)     │
     └─────────────────┘             └─────────────────┘
```

## Service Ownership Matrix

| Domain | Schema | Owner Service | Route Prefix | Notes |
|--------|--------|---------------|--------------|-------|
| **POS** | public.sales, sale_items, payments | main-backend | /api/v1/pos/* | Offline sync, billing |
| **Catalog** | catalog.products, store_products | main-backend | /api/v1/pos/store-products | Product digitisation |
| **Inventory** | inventory.inventory_ledger, stock_balances | main-backend | /api/v1/pos/inventory/* | Stock movements |
| **Platform** | platform.stores, pos_devices | main-backend | /api/v1/admin/stores | Store management |
| **Auth** | auth.users, device_tokens | main-backend | /api/v1/auth/* | Device enrollment |
| **Supplier** | supplier.suppliers, supplier_store_links | main-backend | /api/v1/admin/suppliers | Supplier management |
| **Orders** | orders.purchase_orders | main-backend | /api/v1/orders/* | Purchase orders |
| **Reorder** | orders.reorder_policies | main-backend | /api/v1/reorder/* | Auto-reorder |

## Microservices (Future Phase 2)

The following microservices exist but are **not actively routed** in production:

| Service | Port | Status | Purpose |
|---------|------|--------|---------|
| auth-service | 3001 | Running (unused) | User authentication |
| platform-service | 3002 | Running (unused) | Store/device management |
| catalog-service | 3003 | Running (unused) | Product catalog |
| inventory-service | 3004 | Running (unused) | Stock management |
| order-service | 3005 | Running (unused) | Purchase orders |
| supplier-service | 3006 | Running (unused) | Supplier management |
| reorder-service | 3007 | Running (unused) | Auto-reorder engine |
| voice-service | 3008 | Running (unused) | Voice commands |

## Key Routing Rules

1. **All /api/v1/* routes** → main-backend (:3010)
2. **Gateway strips nothing** - full path forwarded to backend
3. **POS routes require X-Device-Token** header
4. **Admin routes require Bearer token** (JWT)
5. **Retailer Admin routes require X-Auth-Token** header

## Database Schema Split

```sql
-- Platform domain
platform.stores, platform.devices, platform.settings

-- Auth domain
auth.users, auth.device_tokens, auth.sessions

-- Catalog domain
catalog.products, catalog.store_products, catalog.store_product_barcodes

-- Inventory domain
inventory.inventory_ledger, inventory.stock_balances

-- Orders domain
orders.purchase_orders, orders.purchase_order_items

-- Supplier domain
supplier.suppliers, supplier.supplier_store_links

-- Public (legacy POS)
public.sales, public.sale_items, public.payments, public.collections
public.products, public.variants, public.store_inventory (deprecated)
```

## Store Isolation

All queries MUST include `store_id` filter:
- POS endpoints: derived from `X-Device-Token` → `posDevice.storeId`
- Admin endpoints: explicit `storeId` parameter or from JWT claims
- Retailer Admin: from authenticated retailer's store

## Migration Path (Phase 2)

To enable microservice routing:
1. Update `api-gateway/src/config.ts` service URLs
2. Point specific pathPrefix to individual service containers
3. Ensure inter-service auth (internal JWT)
4. Monitor with correlation IDs

---
*Last Updated: 2026-01-25*
*AUD-083-A: Microservices data split documentation*
