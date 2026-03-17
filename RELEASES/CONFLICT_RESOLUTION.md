# SuperMandi POS — Conflict Resolution Strategy

> AUDIT-014 | Version 1.0 | 2026-03-17

## Overview

SuperMandi POS operates in an offline-first architecture where multiple data sources
(POS app, Retailer Web, Supplier Portal) can modify data concurrently. This document
defines how conflicts are detected and resolved.

## Architecture

```
POS App (offline-first) ──→ Outbox Queue ──→ Sync Service ──→ Backend API ──→ PostgreSQL
Retailer Web ──────────────────────────────→ Backend API ──→ PostgreSQL
Supplier Portal ───────────────────────────→ Backend API ──→ PostgreSQL
SuperAdmin ────────────────────────────────→ Backend API ──→ PostgreSQL
```

## Conflict Types and Resolution

### 1. Stock Quantity Conflicts
**Scenario**: POS sells product offline while Retailer Web adjusts stock simultaneously.

**Resolution**: **Append-only ledger** (no overwrite)
- Every stock change is an INSERT into `inventory.inventory_ledger`
- `stock_balances` is a materialized aggregate: `SUM(quantity) GROUP BY product_id`
- Two concurrent changes both get recorded — final stock = sum of all entries
- **No data loss** — both transactions are preserved
- Idempotency via `inventory.idempotency_keys` prevents duplicate entries

### 2. Product Metadata Conflicts
**Scenario**: Retailer edits product name on Web while POS sends a name update from offline queue.

**Resolution**: **Last-write-wins with timestamp**
- `catalog.store_products.updated_at` determines winner
- POS offline changes carry their `created_at` timestamp
- If POS change is older than Web change, POS change is discarded
- If POS change is newer, it overwrites

### 3. Price Conflicts
**Scenario**: SuperAdmin sets margin on supplier product while retailer sets sell price.

**Resolution**: **Role-based precedence**
- SuperAdmin margin (`admin_retail_price_minor`) is the wholesale purchase price floor
- Retailer sell_price is independent — retailer can set any sell price above cost
- No conflict — different fields for different roles

### 4. Cart Conflicts
**Scenario**: Same product added to cart on two POS devices simultaneously.

**Resolution**: **Per-device isolation**
- Each POS device has its own cart (Zustand store, device-specific AsyncStorage)
- Carts never merge across devices
- Stock deduction happens at sale creation (not cart add)
- Stock validation at checkout prevents overselling (GO-LIVE-233)

### 5. Offline Sale Conflicts
**Scenario**: POS creates sale offline, stock goes negative when synced.

**Resolution**: **Allow negative stock with alert**
- Offline sales are always accepted (business continuity priority)
- When synced, if stock goes negative, system logs a stock alert
- Store manager reviews and adjusts via physical count
- `inventory.physical_counts` table supports manual reconciliation

### 6. OTP/Auth Conflicts
**Scenario**: Two devices authenticate with same phone simultaneously.

**Resolution**: **Latest token wins**
- Each OTP verify creates a new device token
- Previous tokens remain valid (multiple devices per store supported)
- Device deactivation is explicit (SuperAdmin action)

## Sync Protocol

### POS → Backend (Outbox Queue)
1. Sale/inward/khata entry saved to local outbox (AsyncStorage)
2. `syncService.syncOutbox()` runs on:
   - App foreground (AppState change)
   - Pull-to-refresh
   - Every 60 seconds when online
3. Each outbox item has idempotency key
4. Backend returns success/conflict/error per item
5. Successful items removed from outbox, conflicts logged

### Backend → POS (Pull + SSE)
1. `productsStore.loadProducts()` on app foreground (full refresh)
2. SSE endpoint (`/api/v1/pos/sync/events`) for real-time push notifications
3. POS EventSource receives `sync_required` event → triggers loadProducts()

## Guarantees

| Guarantee | Mechanism |
|-----------|-----------|
| No data loss | Append-only inventory ledger |
| No duplicate entries | Idempotency keys per transaction |
| Offline continuity | Outbox queue + auto-sync |
| Stock accuracy | Ledger sum = truth, not cached value |
| Audit trail | Every change has timestamp + actor |
