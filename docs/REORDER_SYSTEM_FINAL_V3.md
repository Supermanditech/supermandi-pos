# SuperMandi REORDER System - Final Implementation Plan V3.0
## Consolidated & Hardened for MVP Execution

**Version**: 3.0.9 (Critical Fixes + Build Order)
**Date**: 2026-01-12
**Status**: Implementation Ready
**MVP Goal**: POS gets BUY + REORDER + GRN working first

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Decisions](#2-architecture-decisions)
3. [Database Schemas](#3-database-schemas)
4. [Events & Queues](#4-events--queues)
5. [RBAC & Permissions](#5-rbac--permissions)
6. [API Specifications](#6-api-specifications)
7. [Implementation Rules](#7-implementation-rules)
8. [Sprint Plan](#8-sprint-plan)
9. [Ticket List](#9-ticket-list)
10. [Final Checklist](#10-final-checklist)
11. [UI Screens & Flows (MVP)](#11-ui-screens--flows-mvp)
12. [Post-MVP UI Surfaces](#12-post-mvp-ui-surfaces)
13. [Build Order & Executable Architecture (V3.0.9)](#13-build-order--executable-architecture-v309)

---

## 1. Executive Summary

### 1.1 MVP Scope (Ship First)

```
┌─────────────────────────────────────────────────────────────────┐
│                    MVP v0 - POS FIRST                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  IN SCOPE (Must Ship)                                           │
│  ────────────────────                                           │
│  ✓ auth-service (login, RBAC, refresh)                          │
│  ✓ catalog-service (unified + mapping gate)                     │
│  ✓ inventory-service (ledger + transactions)                    │
│  ✓ order-service (PO + GRN)                                     │
│  ✓ reorder-service (policies + drafts)                          │
│  ✓ POS: BUY tab + REORDER tab                                   │
│  ✓ SELL → Inventory integration                                 │
│                                                                  │
│  DEFERRED (Post-MVP)                                            │
│  ──────────────────                                             │
│  ○ Supplier App (thin admin screen later)                       │
│  ○ Supplier Web Dashboard                                       │
│  ○ Superadmin Portal (supplier verify/merge)                    │
│  ○ Push Notifications (pull-based first)                        │
│  ○ Real-time stock sync (WebSocket)                             │
│  ○ Returns & Stock Take                                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Services for MVP

| Service | Port | MVP Priority | Owns |
|---------|------|--------------|------|
| api-gateway | 3000 | P0 | Routing, CORS, Rate-limit |
| auth-service | 3001 | P0 | auth.* schema |
| **platform-service** | **3008** | **P0** | **platform.* schema (stores, flags)** |
| supplier-service | 3002 | P1 (thin) | supplier.* schema |
| catalog-service | 3003 | P0 | catalog.* schema |
| inventory-service | 3004 | P0 | inventory.* schema |
| order-service | 3005 | P0 | orders.* schema |
| reorder-service | 3006 | P0 | reorder.* schema |
| notification-service | 3007 | P2 (defer) | Push notifications |

**V3.0.9**: platform-service ADDED - owns platform.stores and platform.feature_flags tables.

---

## 2. Architecture Decisions

### 2.1 Final Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **store_id type** | `UUID` everywhere | Consistency, proper FK support |
| **Cross-schema FK** | **NO** - UUID columns only | Prevents migration coupling |
| **Event delivery** | **Bull queues only** (no pub/sub) | Durable, survives consumer downtime |
| **Auth trust** | JWT verified in each service | No blind trust of gateway headers |
| **Stock truth** | inventory_ledger only | Cart is optimistic, ledger is truth |
| **Buyability gate** | supplier_product_map | Only mapped products purchasable |
| **Event versioning** | `.v1` suffix on all events | Future compatibility |
| **GRN ownership** | inventory-service writes ledger | order-service calls inventory-service sync |

### 2.2 Cross-Schema Reference Rule

```
┌─────────────────────────────────────────────────────────────────┐
│              CROSS-SCHEMA REFERENCE RULE (FINAL)                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ALLOWED: FK within same schema                                 │
│  ───────────────────────────────                                │
│  orders.purchase_order_items → orders.purchase_orders ✓         │
│  auth.user_roles → auth.users ✓                                 │
│  auth.user_roles → auth.roles ✓                                 │
│                                                                  │
│  NOT ALLOWED: FK across schemas                                 │
│  ─────────────────────────────                                  │
│  orders.purchase_orders → supplier.suppliers ✗                  │
│  inventory.inventory_ledger → catalog.products ✗                │
│  supplier.suppliers → auth.users ✗                              │
│                                                                  │
│  INSTEAD: Store UUID, validate via API                          │
│  ──────────────────────────────────────                         │
│  orders.purchase_orders.supplier_id UUID (no FK)                │
│  inventory.inventory_ledger.product_id UUID (no FK)             │
│  supplier.suppliers.verified_by_user_id UUID (no FK)            │
│                                                                  │
│  Services validate references when writing                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Event Delivery Architecture (V3.0.9: Fanout Fix)

```
┌─────────────────────────────────────────────────────────────────┐
│        BULL QUEUES WITH FANOUT (Multiple Consumer Queues)        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  V3.0.9 CRITICAL: Bull queues are WORK QUEUES, not pub/sub!     │
│  If 2 services consume the same queue, jobs are LOAD-BALANCED,  │
│  not BROADCAST. Fix: each consumer gets its own queue.          │
│                                                                  │
│  SERVICE                  OUTBOX WORKER                          │
│  ┌──────────────┐        ┌─────────────────────────────────────┐│
│  │ inventory-   │        │  Poll outbox every 1s               ││
│  │ service      │        │                                     ││
│  │              │        │  For each event, ENQUEUE TO N QUEUES││
│  │  Business    │        │  (fanout to all subscribers)        ││
│  │  Logic       │        │                                     ││
│  │      │       │        │  inventory.stock.changed.v1 →       ││
│  │      ▼       │        │    ├→ inventory-events.catalog      ││
│  │  Write to:   │        │    └→ inventory-events.reorder      ││
│  │  - ledger    │        │                                     ││
│  │  - outbox    │        │  orders.po.received.v1 →            ││
│  │  (same txn)  │        │    └→ orders-events.notification    ││
│  └──────────────┘        └─────────────────────────────────────┘│
│                                       │                          │
│                          ┌────────────┼────────────┐            │
│                          ▼            ▼            ▼            │
│                  ┌──────────────┐ ┌──────────────┐              │
│                  │ catalog-     │ │ reorder-     │              │
│                  │ service      │ │ service      │              │
│                  │              │ │              │              │
│                  │ Bull Worker: │ │ Bull Worker: │              │
│                  │ inventory-   │ │ inventory-   │              │
│                  │ events.      │ │ events.      │              │
│                  │ catalog      │ │ reorder      │              │
│                  │              │ │              │              │
│                  │ event_inbox  │ │ event_inbox  │              │
│                  │ dedupe       │ │ dedupe       │              │
│                  └──────────────┘ └──────────────┘              │
│                                                                  │
│  SUBSCRIBER REGISTRY (hardcoded for MVP):                       │
│  ─────────────────────────────────────────                      │
│  inventory-service publishes:                                   │
│    inventory.stock.changed.v1 → [catalog, reorder]             │
│                                                                  │
│  order-service publishes:                                       │
│    orders.po.created.v1     → [notification*]                  │
│    orders.po.received.v1    → [notification*, analytics*]      │
│    (* = post-MVP consumers)                                     │
│                                                                  │
│  reorder-service publishes:                                     │
│    reorder.draft.created.v1 → [notification*]                  │
│                                                                  │
│  supplier-service publishes:                                    │
│    supplier.linked.v1       → [catalog]                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Database Schemas

### 3.1 Schema Organization

```sql
-- Create schemas
CREATE SCHEMA platform;   -- stores, feature_flags
CREATE SCHEMA auth;       -- users, roles, tokens
CREATE SCHEMA supplier;   -- suppliers, links, requests
CREATE SCHEMA catalog;    -- products, mapping
CREATE SCHEMA inventory;  -- ledger, snapshots
CREATE SCHEMA orders;     -- purchase_orders, items, events
CREATE SCHEMA reorder;    -- policies, pending
```

### 3.2 Platform Schema

```sql
-- platform.stores (TENANCY PRIMITIVE)
CREATE TABLE platform.stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE,              -- Used for order numbers: PO-{code}-{YY}-{seq}
    phone VARCHAR(15),
    email VARCHAR(255),
    address_line1 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(10),
    timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
    status VARCHAR(20) DEFAULT 'active',
    -- NOTE: features_enabled removed - use platform.feature_flags as canonical source
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- platform.feature_flags
CREATE TABLE platform.feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_key VARCHAR(100) NOT NULL,
    scope_type VARCHAR(20) NOT NULL,  -- 'global', 'store', 'supplier'
    scope_id UUID,
    enabled BOOLEAN DEFAULT FALSE,
    payload_json JSONB,
    updated_by_user_id UUID,  -- NO FK
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- FIXED: NULL-safe uniqueness (Postgres allows duplicate NULLs in UNIQUE)
    CONSTRAINT chk_flags_scope CHECK (
        (scope_type = 'global' AND scope_id IS NULL) OR
        (scope_type IN ('store', 'supplier') AND scope_id IS NOT NULL)
    )
);

-- Global flags: one per flag_key
CREATE UNIQUE INDEX ux_flags_global
ON platform.feature_flags(flag_key) WHERE scope_type = 'global';

-- Scoped flags: unique per (flag_key, scope_type, scope_id)
CREATE UNIQUE INDEX ux_flags_scoped
ON platform.feature_flags(flag_key, scope_type, scope_id)
WHERE scope_type IN ('store', 'supplier') AND scope_id IS NOT NULL;
```

### 3.3 Auth Schema (FIXED: Added Missing Tables)

```sql
-- auth.users
CREATE TABLE auth.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(15) UNIQUE,
    password_hash VARCHAR(255),
    actor_type VARCHAR(20) NOT NULL,
    actor_id UUID,  -- store_id or supplier_id (NO FK)
    name VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- V3.0.4: Prevent inconsistent actor_type + actor_id
    CONSTRAINT chk_users_actor CHECK (
        (actor_type = 'platform' AND actor_id IS NULL) OR
        (actor_type IN ('store', 'supplier') AND actor_id IS NOT NULL)
    ),
    -- V3.0.6: At least one identifier must be present
    CONSTRAINT chk_users_identifier CHECK (
        email IS NOT NULL OR phone IS NOT NULL
    )
);

-- auth.roles
CREATE TABLE auth.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- auth.user_roles (FK within schema OK)
CREATE TABLE auth.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    role_id UUID REFERENCES auth.roles(id),
    scope_type VARCHAR(20) NOT NULL,  -- FIXED: NOT NULL required for uniqueness
    scope_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- FIXED: NULL-safe uniqueness
    CONSTRAINT chk_user_roles_scope CHECK (
        (scope_type = 'global' AND scope_id IS NULL) OR
        (scope_type IN ('store', 'supplier') AND scope_id IS NOT NULL)
    )
);

-- Global roles: unique per (user_id, role_id)
CREATE UNIQUE INDEX ux_user_roles_global
ON auth.user_roles(user_id, role_id) WHERE scope_type = 'global';

-- Scoped roles: unique per (user_id, role_id, scope_type, scope_id)
CREATE UNIQUE INDEX ux_user_roles_scoped
ON auth.user_roles(user_id, role_id, scope_type, scope_id)
WHERE scope_type IN ('store', 'supplier') AND scope_id IS NOT NULL;

-- auth.device_tokens
CREATE TABLE auth.device_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    token VARCHAR(500) NOT NULL,
    platform VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

-- auth.refresh_tokens (ADDED - was missing!)
CREATE TABLE auth.refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    token_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT refresh_token_unique UNIQUE(token_hash)
);

CREATE INDEX idx_refresh_tokens_user ON auth.refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires ON auth.refresh_tokens(expires_at);

-- auth.password_reset_tokens (ADDED - was missing!)
CREATE TABLE auth.password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    token_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT reset_token_unique UNIQUE(token_hash)
);

CREATE INDEX idx_password_reset_user ON auth.password_reset_tokens(user_id);
```

### 3.4 Supplier Schema

```sql
-- supplier.suppliers
CREATE TABLE supplier.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gstin VARCHAR(15) UNIQUE NOT NULL,
    pan VARCHAR(10),
    business_name VARCHAR(255) NOT NULL,
    trade_name VARCHAR(255),
    business_type VARCHAR(50),
    primary_contact_name VARCHAR(255),
    primary_phone VARCHAR(15),
    primary_email VARCHAR(255),
    address_line1 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(10),
    verification_status VARCHAR(20) DEFAULT 'pending',
    verified_by_user_id UUID,  -- NO FK (cross-schema)
    verified_at TIMESTAMPTZ,
    rating DECIMAL(2,1) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- supplier.supplier_store_links
CREATE TABLE supplier.supplier_store_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES supplier.suppliers(id),  -- Same schema OK
    store_id UUID NOT NULL,  -- NO FK (cross-schema)
    status VARCHAR(20) DEFAULT 'active',
    credit_days INTEGER DEFAULT 0,
    min_order_value DECIMAL(10,2) DEFAULT 0,
    expected_delivery_days INTEGER DEFAULT 2,
    priority INTEGER DEFAULT 1,
    is_preferred BOOLEAN DEFAULT FALSE,
    linked_by_user_id UUID,  -- NO FK
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(supplier_id, store_id),
    -- V3.0.6: Bounds constraints
    CONSTRAINT chk_store_link_bounds CHECK (
        credit_days >= 0 AND
        min_order_value >= 0 AND
        expected_delivery_days >= 0 AND
        priority >= 1
    )
);

-- supplier.supplier_requests (ADDED - pending supplier requests)
CREATE TABLE supplier.supplier_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL,               -- NO FK
    requested_gstin VARCHAR(15),
    requested_name VARCHAR(255),
    requested_phone VARCHAR(15),
    requested_email VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending', -- 'pending'|'approved'|'rejected'
    created_by_user_id UUID,              -- NO FK
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_by_user_id UUID,             -- NO FK
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT
);

CREATE INDEX idx_supplier_requests_store ON supplier.supplier_requests(store_id, created_at);

-- supplier.event_outbox (ADDED - publishes supplier.linked.v1)
CREATE TABLE supplier.event_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    aggregate_type VARCHAR(50) NOT NULL,
    aggregate_id VARCHAR(100) NOT NULL,  -- V3.0.6: Widened for compound IDs
    payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    correlation_id VARCHAR(50)
);

CREATE INDEX idx_supplier_outbox_status ON supplier.event_outbox(status, created_at);
```

### 3.5 Catalog Schema

```sql
-- ┌─────────────────────────────────────────────────────────────────┐
-- │  V3.0.9 BARCODE MODELING CLARIFICATION                          │
-- ├─────────────────────────────────────────────────────────────────┤
-- │                                                                  │
-- │  CANONICAL SOURCE: catalog.product_barcodes table               │
-- │  • Globally unique barcodes (ux_product_barcodes_barcode)       │
-- │  • Supports multiple barcodes per product                       │
-- │  • Tracks barcode_type and source                               │
-- │                                                                  │
-- │  LEGACY/CACHE: catalog.products.primary_barcode                 │
-- │  • OPTIONAL - may be NULL                                       │
-- │  • catalog-service must sync from product_barcodes              │
-- │  • Kept for backwards compatibility with existing queries       │
-- │                                                                  │
-- │  RULE: All barcode writes go through product_barcodes.          │
-- │  products.primary_barcode is updated by trigger or service.     │
-- │                                                                  │
-- │  DEPRECATED: alternate_barcodes JSONB - do not use              │
-- │                                                                  │
-- └─────────────────────────────────────────────────────────────────┘

-- catalog.products (Unified Master)
CREATE TABLE catalog.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    brand VARCHAR(100),
    category VARCHAR(100),
    unit VARCHAR(50),
    pack_size DECIMAL(10,3),
    -- V3.0.9: CACHE ONLY - canonical source is product_barcodes
    primary_barcode VARCHAR(50),
    -- DEPRECATED: use product_barcodes table instead
    alternate_barcodes JSONB DEFAULT '[]',
    hsn_code VARCHAR(20),
    default_gst_rate DECIMAL(5,2),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_barcode ON catalog.products(primary_barcode);

-- V3.0.5: Prevent duplicate barcodes (breaks auto-mapping if two products share barcode)
-- V3.0.9: This is a SAFETY NET - product_barcodes.ux_product_barcodes_barcode is the primary enforcement
CREATE UNIQUE INDEX ux_products_primary_barcode
ON catalog.products(primary_barcode)
WHERE primary_barcode IS NOT NULL AND primary_barcode <> '';

-- V3.0.5: Trigram indexes for fast product search
CREATE INDEX idx_products_name_trgm
ON catalog.products USING gin (lower(name) gin_trgm_ops);

CREATE INDEX idx_products_brand_trgm
ON catalog.products USING gin (lower(brand) gin_trgm_ops);

-- V3.0.9 CANONICAL BARCODE TABLE
-- V3.0.6: Normalized barcodes table - replaces alternate_barcodes JSONB
-- Eliminates ambiguity: "owned" by REORDER vs. POS scan-only vs. supplier-provided
CREATE TABLE catalog.product_barcodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES catalog.products(id) ON DELETE CASCADE,
    barcode VARCHAR(50) NOT NULL,
    barcode_type VARCHAR(20) DEFAULT 'ean13',  -- 'ean13', 'upc', 'internal', 'supplier'
    is_primary BOOLEAN DEFAULT FALSE,
    source VARCHAR(20) DEFAULT 'manual',  -- 'manual', 'supplier_sync', 'grn_scan'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- V3.0.6: Globally unique barcodes across all products
CREATE UNIQUE INDEX ux_product_barcodes_barcode
ON catalog.product_barcodes(barcode);

-- V3.0.6: Fast lookup by product
CREATE INDEX idx_product_barcodes_product
ON catalog.product_barcodes(product_id);

-- V3.0.6: Ensure only one primary per product
CREATE UNIQUE INDEX ux_product_barcodes_primary
ON catalog.product_barcodes(product_id)
WHERE is_primary = TRUE;

-- catalog.store_products
CREATE TABLE catalog.store_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL,  -- NO FK
    product_id UUID REFERENCES catalog.products(id),  -- Same schema OK
    sell_price DECIMAL(10,2),  -- NULLABLE for buy-first/GRN-first scenarios
    mrp DECIMAL(10,2),
    display_name VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    -- READ-MODEL: Updated via INVENTORY_CHANGED events only
    current_stock INTEGER DEFAULT 0,
    -- V3.0.3: last-write-wins protection for event ordering
    stock_last_event_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(store_id, product_id)
);
-- NOTE: SELL flow must check: if sell_price IS NULL, prompt "Enter sell price" before allowing sale

-- catalog.supplier_products
CREATE TABLE catalog.supplier_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID NOT NULL,  -- NO FK (cross-schema)
    supplier_sku VARCHAR(100),
    barcode VARCHAR(50),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    brand VARCHAR(100),
    unit VARCHAR(50),
    pack_size DECIMAL(10,3),
    mrp DECIMAL(10,2),
    purchase_price DECIMAL(10,2) NOT NULL,  -- RENAMED from selling_price
    stock_quantity INTEGER DEFAULT 0,
    stock_status VARCHAR(20) DEFAULT 'available',
    moq INTEGER DEFAULT 1,
    max_qty INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(supplier_id, supplier_sku)
);

-- V3.0.6: Index for barcode lookups (auto-mapping uses this)
CREATE INDEX idx_supplier_products_barcode
ON catalog.supplier_products(barcode)
WHERE barcode IS NOT NULL AND barcode <> '';

-- catalog.supplier_product_map (BUYABILITY GATE)
CREATE TABLE catalog.supplier_product_map (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_product_id UUID REFERENCES catalog.supplier_products(id),
    product_id UUID REFERENCES catalog.products(id),
    mapping_type VARCHAR(20) DEFAULT 'auto',
    confidence DECIMAL(3,2),
    mapped_by_user_id UUID,  -- NO FK
    mapped_at TIMESTAMPTZ DEFAULT NOW(),
    is_verified BOOLEAN DEFAULT FALSE,

    -- FIXED: One supplier product maps to exactly one product
    UNIQUE(supplier_product_id)
);

CREATE INDEX idx_supplier_product_map_product ON catalog.supplier_product_map(product_id);

-- catalog.catalog_mapping_log (ADDED - was missing!)
CREATE TABLE catalog.catalog_mapping_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL,               -- NO FK
    supplier_id UUID NOT NULL,            -- NO FK
    supplier_product_id UUID NOT NULL,    -- NO FK
    product_id UUID NOT NULL,             -- NO FK
    action VARCHAR(20) NOT NULL,          -- 'auto_map' | 'manual_map' | 'unmap'
    confidence DECIMAL(3,2),
    actor_user_id UUID,                   -- NO FK
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mapping_log_store ON catalog.catalog_mapping_log(store_id, created_at);

-- catalog.event_inbox (ADDED - consumes inventory.stock.changed.v1)
CREATE TABLE catalog.event_inbox (
    event_id UUID PRIMARY KEY,
    received_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'pending',
    error_message TEXT,
    retry_count INTEGER DEFAULT 0
);
```

### 3.6 Inventory Schema

```sql
-- inventory.inventory_ledger (SOURCE OF TRUTH)
CREATE TABLE inventory.inventory_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL,  -- NO FK
    product_id UUID NOT NULL,  -- NO FK

    delta_qty INTEGER NOT NULL,
    transaction_type VARCHAR(30) NOT NULL,
    reference_type VARCHAR(30),
    reference_id VARCHAR(50),
    reference_sub_id VARCHAR(50),  -- V3.0.4: receiveId for partial GRN traceability
    stock_before INTEGER,
    stock_after INTEGER,
    unit_cost DECIMAL(10,2),
    created_by_user_id UUID,  -- NO FK
    created_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT
);

CREATE INDEX idx_inventory_ledger_store_product ON inventory.inventory_ledger(store_id, product_id);
CREATE INDEX idx_inventory_ledger_created ON inventory.inventory_ledger(created_at);

-- inventory.stock_balances (V3.0.3 - concurrency-safe row locking)
-- Use FOR UPDATE when reading to prevent concurrent overwrites
CREATE TABLE inventory.stock_balances (
    store_id UUID NOT NULL,
    product_id UUID NOT NULL,
    current_qty INTEGER NOT NULL DEFAULT 0,
    last_ledger_id UUID,  -- Points to last inventory_ledger entry
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (store_id, product_id)
);
-- USAGE: SELECT * FROM stock_balances WHERE store_id=? AND product_id=? FOR UPDATE;
-- Then INSERT ledger + UPDATE stock_balances in same transaction

-- V3.0.5: Same-schema FK is safe (unlike cross-schema)
ALTER TABLE inventory.stock_balances
ADD CONSTRAINT fk_stock_balances_last_ledger
FOREIGN KEY (last_ledger_id) REFERENCES inventory.inventory_ledger(id);

-- inventory.idempotency_keys
CREATE TABLE inventory.idempotency_keys (
    key VARCHAR(100) PRIMARY KEY,
    user_id UUID NOT NULL,
    route VARCHAR(200) NOT NULL,
    request_hash VARCHAR(64),
    -- V3.0.6: Status for processing state (prevents duplicate concurrent requests)
    status VARCHAR(20) DEFAULT 'processing',  -- 'processing', 'completed', 'failed'
    response_status INTEGER,
    response_json JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
    CONSTRAINT chk_idempotency_status CHECK (status IN ('processing', 'completed', 'failed'))
);

-- inventory.event_inbox (consumer dedup)
CREATE TABLE inventory.event_inbox (
    event_id UUID PRIMARY KEY,
    received_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'pending',
    error_message TEXT,
    retry_count INTEGER DEFAULT 0
);

-- inventory.event_outbox (ADDED - publishes inventory.stock.changed.v1)
CREATE TABLE inventory.event_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    aggregate_type VARCHAR(50) NOT NULL,
    aggregate_id VARCHAR(100) NOT NULL,  -- V3.0.6: Widened for compound IDs
    payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    correlation_id VARCHAR(50)
);

CREATE INDEX idx_inventory_outbox_status ON inventory.event_outbox(status, created_at);
```

### 3.7 Orders Schema

```sql
-- orders.purchase_orders
CREATE TABLE orders.purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    store_id UUID NOT NULL,  -- NO FK
    supplier_id UUID NOT NULL,  -- NO FK
    order_type VARCHAR(20) NOT NULL,
    source_reorder_ids JSONB,
    status VARCHAR(30) DEFAULT 'draft',
    subtotal DECIMAL(12,2) NOT NULL,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    delivery_charges DECIMAL(10,2) DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(12,2) NOT NULL,
    expected_delivery_date DATE,
    actual_delivery_date DATE,
    delivery_address TEXT,
    payment_status VARCHAR(20) DEFAULT 'pending',
    store_notes TEXT,
    supplier_notes TEXT,
    created_by_user_id UUID,  -- NO FK
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- orders.order_sequences (V3.0.3 - atomic PO number generation)
-- Use FOR UPDATE to prevent race conditions on sequence increment
CREATE TABLE orders.order_sequences (
    store_id UUID PRIMARY KEY,
    store_code VARCHAR(20) NOT NULL,  -- V3.0.6: Denormalized for PO number generation
    current_year SMALLINT NOT NULL,
    current_seq INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- USAGE:
-- 1. SELECT * FROM order_sequences WHERE store_id=? FOR UPDATE;
-- 2. If year changed: reset seq=1, else seq++
-- 3. UPDATE + INSERT PO in same transaction
-- Format: PO-{store_code}-{YY}-{seq} (e.g., PO-MUM01-26-00001)
-- V3.0.6: store_code SOURCE:
-- Option A (MVP): Denormalize - store code in order_sequences table
-- Option B: API call to platform-service on PO creation (cache result)
-- DECISION: Use Option A - denormalize store_code into order_sequences
-- (platform.stores table has the source of truth, copy on store creation)

-- orders.purchase_order_items
CREATE TABLE orders.purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders.purchase_orders(id) ON DELETE CASCADE,
    supplier_product_id UUID NOT NULL,  -- NO FK
    product_id UUID NOT NULL,  -- NO FK
    product_name VARCHAR(255) NOT NULL,
    supplier_sku VARCHAR(100),
    barcode VARCHAR(50),
    ordered_quantity INTEGER NOT NULL,
    received_quantity INTEGER DEFAULT 0,
    unit_price DECIMAL(10,2) NOT NULL,
    mrp DECIMAL(10,2),
    tax_rate DECIMAL(5,2) DEFAULT 0,
    discount_percent DECIMAL(5,2) DEFAULT 0,
    line_total DECIMAL(12,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- V3.0.9: Bounds constraints (FIXED operator precedence - added parentheses)
    CONSTRAINT chk_order_item_bounds CHECK (
        ordered_quantity > 0 AND
        received_quantity >= 0 AND
        unit_price >= 0 AND
        (mrp IS NULL OR mrp >= 0) AND
        tax_rate >= 0 AND
        (discount_percent >= 0 AND discount_percent <= 100)
    )
);

-- orders.order_events
CREATE TABLE orders.order_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders.purchase_orders(id),
    event_type VARCHAR(50) NOT NULL,
    from_status VARCHAR(30),
    to_status VARCHAR(30),
    actor_type VARCHAR(20),
    actor_id UUID,
    actor_name VARCHAR(255),
    details JSONB,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- orders.idempotency_keys
CREATE TABLE orders.idempotency_keys (
    key VARCHAR(100) PRIMARY KEY,
    user_id UUID NOT NULL,
    route VARCHAR(200) NOT NULL,
    request_hash VARCHAR(64),
    -- V3.0.6: Status for processing state (prevents duplicate concurrent requests)
    status VARCHAR(20) DEFAULT 'processing',  -- 'processing', 'completed', 'failed'
    response_status INTEGER,
    response_json JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
    CONSTRAINT chk_idempotency_status CHECK (status IN ('processing', 'completed', 'failed'))
);

-- orders.event_outbox
CREATE TABLE orders.event_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    aggregate_type VARCHAR(50) NOT NULL,
    aggregate_id VARCHAR(100) NOT NULL,  -- V3.0.6: Widened for compound IDs
    payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    correlation_id VARCHAR(50)
);
```

### 3.8 Reorder Schema

```sql
-- reorder.reorder_policies
CREATE TABLE reorder.reorder_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL,  -- NO FK
    product_id UUID NOT NULL,  -- NO FK
    min_stock INTEGER NOT NULL,
    target_stock INTEGER NOT NULL,
    preferred_supplier_id UUID,  -- NO FK
    is_enabled BOOLEAN DEFAULT TRUE,
    created_by_user_id UUID,  -- NO FK
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(store_id, product_id),
    -- V3.0.6: Bounds constraints - target must be >= min
    CONSTRAINT chk_reorder_policy_bounds CHECK (
        min_stock >= 0 AND
        target_stock >= min_stock
    )
);

-- reorder.store_reorder_settings
CREATE TABLE reorder.store_reorder_settings (
    store_id UUID PRIMARY KEY,  -- NO FK
    reorder_enabled BOOLEAN DEFAULT TRUE,
    require_approval BOOLEAN DEFAULT TRUE,
    notify_on_low_stock BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- reorder.pending_reorders
CREATE TABLE reorder.pending_reorders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL,  -- NO FK
    product_id UUID NOT NULL,  -- NO FK
    product_name VARCHAR(255) NOT NULL,
    barcode VARCHAR(50),
    current_stock INTEGER NOT NULL,
    min_threshold INTEGER NOT NULL,
    target_stock INTEGER NOT NULL,
    suggested_quantity INTEGER NOT NULL,
    suggested_supplier_id UUID,  -- NO FK
    suggested_supplier_name VARCHAR(255),
    suggested_unit_price DECIMAL(10,2),
    supplier_product_id UUID,  -- NO FK
    status VARCHAR(20) DEFAULT 'pending',
    dismissed_reason TEXT,
    purchase_order_id UUID,  -- NO FK
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')  -- V3.0.5: 7-day default expiry
);

-- V3.0.4: Prevent duplicate pending reorders (race condition between cron + event)
CREATE UNIQUE INDEX ux_pending_reorders_active
ON reorder.pending_reorders(store_id, product_id)
WHERE status = 'pending';

-- reorder.event_inbox
CREATE TABLE reorder.event_inbox (
    event_id UUID PRIMARY KEY,
    received_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'pending',
    error_message TEXT,
    retry_count INTEGER DEFAULT 0
);

-- reorder.idempotency_keys
CREATE TABLE reorder.idempotency_keys (
    key VARCHAR(100) PRIMARY KEY,
    user_id UUID NOT NULL,
    route VARCHAR(200) NOT NULL,
    request_hash VARCHAR(64),
    -- V3.0.6: Status for processing state (prevents duplicate concurrent requests)
    status VARCHAR(20) DEFAULT 'processing',  -- 'processing', 'completed', 'failed'
    response_status INTEGER,
    response_json JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
    CONSTRAINT chk_idempotency_status CHECK (status IN ('processing', 'completed', 'failed'))
);

-- reorder.event_outbox (ADDED - publishes reorder.draft.created.v1)
CREATE TABLE reorder.event_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    aggregate_type VARCHAR(50) NOT NULL,
    aggregate_id VARCHAR(100) NOT NULL,  -- V3.0.6: Widened for compound IDs
    payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    correlation_id VARCHAR(50)
);

CREATE INDEX idx_reorder_outbox_status ON reorder.event_outbox(status, created_at);

-- reorder.reorder_runs (ADDED - logs cron job executions)
CREATE TABLE reorder.reorder_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL,               -- NO FK
    run_type VARCHAR(20) NOT NULL,        -- 'cron' | 'event'
    started_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    evaluated_products INTEGER DEFAULT 0,
    created_pending INTEGER DEFAULT 0,
    skipped_existing INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'success', -- 'success' | 'failed'
    error_message TEXT
);

CREATE INDEX idx_reorder_runs_store ON reorder.reorder_runs(store_id, started_at);
```

### 3.9 MVP Performance Indexes (V3.0.4)

```sql
-- V3.0.4: Critical indexes for MVP performance

-- supplier: query linked suppliers by store
CREATE INDEX idx_supplier_store_links_store
ON supplier.supplier_store_links(store_id, status);

-- orders: list POs by store + time
CREATE INDEX idx_purchase_orders_store_created
ON orders.purchase_orders(store_id, created_at DESC);

-- orders: GRN loads items by order_id
CREATE INDEX idx_purchase_order_items_order
ON orders.purchase_order_items(order_id);

-- catalog: list store_products per store
CREATE INDEX idx_store_products_store
ON catalog.store_products(store_id, is_active);

-- inventory: latest ledger entries for product
CREATE INDEX idx_inventory_ledger_store_product_time
ON inventory.inventory_ledger(store_id, product_id, created_at DESC);

-- reorder: list pending by store quickly
CREATE INDEX idx_pending_reorders_store_status
ON reorder.pending_reorders(store_id, status, created_at DESC);
```

### 3.10 Required PostgreSQL Extensions (V3.0.4)

```sql
-- Must be added in schema bootstrap BEFORE tables
CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- Full-text search (catalog)
```

### 3.11 Status Enum CHECK Constraints (V3.0.5)

```sql
-- V3.0.5: Prevent typos in status fields → silent data corruption

-- orders.purchase_orders status
ALTER TABLE orders.purchase_orders
ADD CONSTRAINT chk_po_status CHECK (
    status IN ('draft','submitted','confirmed','shipped','partial_received','delivered','cancelled')
);

-- reorder.pending_reorders status
ALTER TABLE reorder.pending_reorders
ADD CONSTRAINT chk_pending_reorders_status CHECK (
    status IN ('pending','approved','dismissed','expired')
);

-- inventory.inventory_ledger transaction_type
ALTER TABLE inventory.inventory_ledger
ADD CONSTRAINT chk_inventory_txn_type CHECK (
    transaction_type IN ('sale','sale_return','purchase_received','adjustment')
);

-- Cleanup cron for expired pending reorders (run hourly or in stock monitor)
-- UPDATE reorder.pending_reorders
-- SET status = 'expired', updated_at = NOW()
-- WHERE status = 'pending' AND expires_at < NOW();
```

---

## 4. Events & Queues

### 4.1 Event Types (Versioned)

```typescript
// Standard event naming: {service}.{aggregate}.{action}.v1
const EventTypes = {
  // Order Service publishes
  'orders.po.created.v1': 'PO created',
  'orders.po.status_changed.v1': 'PO status changed',
  'orders.po.received.v1': 'GRN completed',

  // Inventory Service publishes
  'inventory.stock.changed.v1': 'Stock level changed',

  // Reorder Service publishes
  'reorder.draft.created.v1': 'Pending reorder created',

  // Supplier Service publishes
  'supplier.linked.v1': 'Supplier linked to store',
  'supplier.catalog_updated.v1': 'Supplier updated catalog',
};

// V3.0.5: Canonical Event Envelope (all services must use)
type DomainEvent<TPayload> = {
  eventId: string;          // UUID - unique per event
  eventType: string;        // "inventory.stock.changed.v1"
  occurredAt: string;       // ISO 8601 timestamp
  correlationId?: string;   // Trace ID for distributed tracing
  producer: string;         // "inventory-service"
  payload: TPayload;
};

// inventory.stock.changed.v1 payload
type InventoryStockChangedV1 = {
  storeId: string;
  productId: string;
  deltaQty: number;         // Signed: -5 for sale, +10 for GRN
  newQty: number;           // Current stock after change
  ledgerId: string;         // Reference to inventory_ledger row
  // V3.0.6: Ledger timestamp for reliable ordering (prefer over occurredAt)
  ledgerCreatedAt: string;  // ISO 8601 - from inventory_ledger.created_at
  transactionType: 'sale' | 'sale_return' | 'purchase_received' | 'adjustment';
  referenceType?: string;   // 'po' | 'sale' | 'manual'
  referenceId?: string;
  referenceSubId?: string;  // receiveId for partial GRN
};

// V3.0.6: CONSUMER RULE for ordering:
// catalog-service updates store_products.current_stock
// only if ledgerCreatedAt > stock_last_event_at (prefer ledger time over event time)
// Reason: ledgerCreatedAt is set during the atomic DB transaction, while
// occurredAt might be set later during event publish - safer for ordering
```

### 4.2 Bull Queue Configuration (V3.0.9: Subscriber-Specific Queues)

```typescript
// queue-config.ts
// V3.0.9 CRITICAL: Each subscriber gets its own queue to prevent load-balancing issues

export const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: 100,
  removeOnFail: false,  // Keep for DLQ inspection
};

// PRODUCER QUEUES: publisher → subscriber-specific queues
export const subscriberQueues = {
  // inventory-service publishes to these:
  'inventory-events.catalog': defaultJobOptions,   // catalog-service consumes
  'inventory-events.reorder': defaultJobOptions,   // reorder-service consumes

  // order-service publishes to these:
  'orders-events.notification': defaultJobOptions, // notification-service consumes (post-MVP)
  'orders-events.analytics': defaultJobOptions,    // analytics-service consumes (post-MVP)

  // reorder-service publishes to these:
  'reorder-events.notification': defaultJobOptions,// notification-service consumes (post-MVP)

  // supplier-service publishes to these:
  'supplier-events.catalog': defaultJobOptions,    // catalog-service consumes
};

// SUBSCRIBER REGISTRY: event → queues mapping (hardcoded for MVP)
export const eventSubscribers: Record<string, string[]> = {
  'inventory.stock.changed.v1': [
    'inventory-events.catalog',
    'inventory-events.reorder',
  ],
  'orders.po.created.v1': [
    'orders-events.notification',
  ],
  'orders.po.received.v1': [
    'orders-events.notification',
    'orders-events.analytics',
  ],
  'reorder.draft.created.v1': [
    'reorder-events.notification',
  ],
  'supplier.linked.v1': [
    'supplier-events.catalog',
  ],
};

// OUTBOX WORKER: enqueue to ALL subscribers (fanout)
async function publishEvent(event: DomainEvent<any>) {
  const queues = eventSubscribers[event.eventType] || [];
  for (const queueName of queues) {
    await bullQueues[queueName].add(event.eventType, event);
  }
}
```

### 4.3 Event Flow Matrix (V3.0.9: Updated Queue Names)

| Event | Publisher | Subscriber Queues | Consumers |
|-------|-----------|-------------------|-----------|
| orders.po.created.v1 | order-service | orders-events.notification | (notification post-MVP) |
| orders.po.status_changed.v1 | order-service | orders-events.notification | (notification post-MVP) |
| orders.po.received.v1 | order-service | orders-events.notification, orders-events.analytics | (notification, analytics post-MVP) |
| inventory.stock.changed.v1 | inventory-service | **inventory-events.catalog**, **inventory-events.reorder** | catalog-service, reorder-service |
| reorder.draft.created.v1 | reorder-service | reorder-events.notification | (notification post-MVP) |
| supplier.linked.v1 | supplier-service | supplier-events.catalog | catalog-service |

**V3.0.4 CRITICAL**: `orders.po.received.v1` does NOT go to inventory-service!
GRN updates inventory synchronously (order-service calls inventory-service directly).
The event is for notification/analytics only.

**V3.0.9 CRITICAL**: Each consumer has its own queue (e.g., `inventory-events.catalog`).
Outbox worker publishes same event to BOTH queues. This ensures both catalog and reorder
receive the stock change event (fanout), instead of random load-balancing.

### 4.4 Redis Durability Requirements (V3.0.3)

```
┌─────────────────────────────────────────────────────────────────┐
│              REDIS DURABILITY (CRITICAL)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Bull queues store jobs in Redis. By default Redis can LOSE     │
│  data on restart. For production, MUST enable AOF persistence.  │
│                                                                  │
│  redis.conf requirements:                                        │
│  ─────────────────────────                                      │
│  appendonly yes                # Enable AOF persistence         │
│  appendfsync everysec          # Fsync every second (balanced)  │
│                                # OR appendfsync always (safest) │
│                                                                  │
│  WHY THIS MATTERS:                                               │
│  • Without AOF: Redis restart = lost jobs = missing events      │
│  • V3.0.5: Ledger remains CORRECT because GRN + SALE are sync   │
│  • If jobs lost: catalog read-model + reorder suggestions stale │
│  • Order event lost = supplier never notified                   │
│                                                                  │
│  DOCKER COMPOSE EXAMPLE:                                         │
│  ─────────────────────────                                      │
│  redis:                                                          │
│    image: redis:7-alpine                                        │
│    command: redis-server --appendonly yes --appendfsync everysec│
│    volumes:                                                      │
│      - redis-data:/data                                         │
│                                                                  │
│  ALTERNATIVE: Use managed Redis (AWS ElastiCache, etc.)         │
│  with persistence enabled.                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. RBAC & Permissions

### 5.1 Final Permission Set (MVP)

```typescript
const permissions = {
  // Inventory (SPLIT for safety)
  'store.inventory.read': 'View stock levels',
  'store.inventory.transaction.write': 'Record sales, GRN (normal ops)',
  'store.inventory.adjust.write': 'Manual adjustments (admin only)',

  // Orders
  'store.orders.read': 'View purchase orders',
  'store.orders.write': 'Create, submit, receive orders',

  // Reorder
  'store.reorder.read': 'View reorder suggestions',
  'store.reorder.write': 'Approve, dismiss, set policies',

  // Catalog
  'store.catalog.read': 'Browse unified catalog',
  'store.catalog.write': 'Manage mappings',

  // Suppliers
  'store.suppliers.read': 'View linked suppliers',
  'store.suppliers.write': 'Link/unlink suppliers',

  // Feature Flags (V3.0.3 - was missing!)
  'store.flags.read': 'Read feature flags for this store',
};
```

### 5.2 Role Definitions (Seed Data)

```sql
-- V3.0.4: Explicit ::jsonb cast to avoid migration failures
INSERT INTO auth.roles (name, description, permissions) VALUES

('STORE_STAFF', 'POS operator', '[
  "store.catalog.read",
  "store.orders.read",
  "store.orders.write",
  "store.inventory.read",
  "store.inventory.transaction.write",
  "store.reorder.read",
  "store.suppliers.read",
  "store.flags.read"
]'::jsonb),

('STORE_ADMIN', 'Store administrator', '[
  "store.catalog.read",
  "store.catalog.write",
  "store.orders.read",
  "store.orders.write",
  "store.inventory.read",
  "store.inventory.transaction.write",
  "store.inventory.adjust.write",
  "store.reorder.read",
  "store.reorder.write",
  "store.suppliers.read",
  "store.suppliers.write",
  "store.flags.read"
]'::jsonb),

-- ADDED: Supplier roles (for post-MVP supplier portal)
('SUPPLIER_STAFF', 'Supplier operator', '[
  "supplier.orders.read",
  "supplier.orders.write",
  "supplier.catalog.read"
]'::jsonb),

('SUPPLIER_ADMIN', 'Supplier administrator', '[
  "supplier.orders.read",
  "supplier.orders.write",
  "supplier.catalog.read",
  "supplier.catalog.write",
  "supplier.staff.read",
  "supplier.staff.write"
]'::jsonb),

('SUPERADMIN', 'Platform administrator', '[
  "platform.stores.read",
  "platform.stores.write",
  "platform.suppliers.read",
  "platform.suppliers.write",
  "platform.flags.read",
  "platform.flags.write"
]'::jsonb);
```

### 5.3 Endpoint → Permission Mapping

| Endpoint | Permission |
|----------|------------|
| POST /inventory/transactions (type=sale) | store.inventory.transaction.write |
| POST /inventory/transactions (type=purchase_received) | store.inventory.transaction.write |
| POST /inventory/adjust | store.inventory.adjust.write |
| POST /purchase-orders | store.orders.write |
| POST /purchase-orders/{id}/receive | store.orders.write |
| POST /reorder/pending/approve | store.reorder.write |
| PUT /reorder/policies | store.reorder.write |

---

## 6. API Specifications

### 6.1 Key Endpoints (MVP)

```yaml
# ===== AUTH SERVICE =====

POST /api/v1/auth/login
Response:
  accessToken: string (15min)
  refreshToken: string (7 days)
  user: { id, name, actorType, actorId, role }

POST /api/v1/auth/refresh
Request: { refreshToken }
Response: { accessToken, refreshToken }

GET /api/v1/auth/me
Response: { user, permissions[] }

# ===== INVENTORY SERVICE =====

POST /api/v1/stores/{storeId}/inventory/transactions
Permission: store.inventory.transaction.write
Header: X-Idempotency-Key (required)
Request:
  type: "sale" | "sale_return" | "purchase_received"
  referenceId: string
  referenceSubId?: string  # V3.0.5: receiveId for partial GRN traceability
  items:
    - productId: uuid
      quantity: integer  # V3.0.5: INTEGER (no decimals), ALWAYS POSITIVE
      unitCost?: number
  notes?: string
Response:
  transactionId: uuid
  ledgerEntries: [...]
  stockAfter: { productId: integer }

# QUANTITY SIGN RULE:
# Client always sends POSITIVE quantity
# Service applies delta based on type:
#   sale => -quantity (stock decreases)
#   sale_return => +quantity (stock increases)
#   purchase_received => +quantity (stock increases)

POST /api/v1/stores/{storeId}/inventory/adjust
Permission: store.inventory.adjust.write
Header: X-Idempotency-Key (required)
Request:
  productId: uuid
  adjustmentQty: integer  # V3.0.5: INTEGER, can be negative for decrease
  reason: string
  notes?: string

# ===== ORDER SERVICE =====

# V3.0.9: GET with multi-status filter for GRN screen
GET /api/v1/stores/{storeId}/purchase-orders
Permission: store.orders.read
Query:
  status?: string[]  # "confirmed,shipped,partial_received" (comma-separated)
  supplierId?: uuid
  fromDate?: date
  toDate?: date
  page?: integer
  limit?: integer
  sort?: "created_at:desc" | "created_at:asc"
Response:
  orders: [...PurchaseOrder]
  pagination: { page, limit, total }

POST /api/v1/stores/{storeId}/purchase-orders
Permission: store.orders.write
Header: X-Idempotency-Key (required)
Request:
  supplierId: uuid
  items:
    - supplierProductId: uuid
      quantity: integer  # V3.0.6: INTEGER for countable units
  notes?: string
  status?: "draft" | "submitted"  # V3.0.9: Option to create as submitted
Response:
  orderId: uuid
  orderNumber: string
  status: "draft" | "submitted"

# V3.0.9: Explicit submit step (clean audit trail)
POST /api/v1/stores/{storeId}/purchase-orders/{orderId}/submit
Permission: store.orders.write
Header: X-Idempotency-Key (required)
Request: {}  # Empty body
Response:
  orderId: uuid
  orderNumber: string
  status: "submitted"
  submittedAt: timestamp
  # Triggers: orders.po.status_changed.v1 event

POST /api/v1/stores/{storeId}/purchase-orders/{orderId}/receive
Permission: store.orders.write
Header: X-Idempotency-Key (required)
Request:
  items:
    - itemId: uuid
      receivedQuantity: integer  # V3.0.6: INTEGER for countable units
      status: "received" | "partial" | "rejected"
Response:
  status: "delivered" | "partial_received"
  # Triggers: orders.po.received.v1 event

# ===== REORDER SERVICE =====

POST /api/v1/stores/{storeId}/reorder/pending/approve
Permission: store.reorder.write
Header: X-Idempotency-Key (required)
Request:
  reorderIds: uuid[]
  modifications?:
    - reorderId: uuid
      quantity?: integer  # V3.0.6: INTEGER for countable units
      supplierId?: uuid
Response:
  draftOrders:
    - orderId: uuid
      orderNumber: string
      supplierName: string
      status: "draft"

# ===== CATALOG SERVICE =====

GET /api/v1/stores/{storeId}/catalog
Permission: store.catalog.read
Query: search?, category?, page?, limit?
Response:
  products:
    - id: uuid
      name: string
      bestPrice: number
      stockStatus: string
      supplierCount: number
  # CRITICAL FILTERS (both must apply):
  # 1. Only products in supplier_product_map (buyability gate)
  # 2. Only suppliers linked in supplier_store_links for THIS store
  # Implementation: filter by supplier_id IN (SELECT supplier_id FROM supplier_store_links WHERE store_id = ?)
```

---

## 7. Implementation Rules

### 7.1 Source of Truth Rules

```
┌─────────────────────────────────────────────────────────────────┐
│              SOURCE OF TRUTH (ENFORCED)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CONCEPT              TRUTH SOURCE            OTHERS             │
│  ────────             ────────────            ──────             │
│  Stock levels         inventory_ledger        stock_balances =   │
│                       (audit trail,           concurrency-safe   │
│                       append-only)            current_qty        │
│                                               (must equal SUM)   │
│                                               store_products.    │
│                                               current_stock =    │
│                                               READ-MODEL only    │
│                                                                  │
│  Buyability           supplier_product_map    No map = can't buy │
│                                                                  │
│  Feature gating       platform.feature_flags  POS checks on      │
│                                               startup            │
│                                                                  │
│  Order status         orders.purchase_orders  Events published   │
│                                               on change          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Idempotency Rules

```typescript
// EVERY mutation endpoint must accept X-Idempotency-Key

// POS checkout
const saleId = generateUUID();
await api.post('/inventory/transactions', {
  type: 'sale',
  referenceId: saleId,
  items: cartItems,
}, {
  headers: { 'X-Idempotency-Key': saleId }
});

// GRN receive - use unique receiveId for partial receives
const receiveId = generateUUID();
await api.post(`/purchase-orders/${orderId}/receive`, {
  items: receivedItems,
}, {
  headers: { 'X-Idempotency-Key': receiveId }
});

// Approve reorder
const approvalId = generateUUID();
await api.post('/reorder/pending/approve', {
  reorderIds: selectedIds,
}, {
  headers: { 'X-Idempotency-Key': approvalId }
});
```

**V3.0.9 Idempotency Conflict Behavior (409 + PROCESSING state)**

```typescript
// Server-side idempotency handling with PROCESSING state
async function handleIdempotency(key: string, requestHash: string) {
  const existing = await db.idempotencyKeys.findOne({ key });

  if (!existing) {
    // First request - insert as PROCESSING and proceed
    await db.idempotencyKeys.insert({
      key,
      request_hash: requestHash,
      status: 'processing',  // V3.0.9: New status column
      // response filled after completion
    });
    return { proceed: true };
  }

  // V3.0.9: Handle PROCESSING state - request still in flight
  if (existing.status === 'processing') {
    throw new ConflictError({
      status: 409,
      code: 'IDEMPOTENCY_IN_PROGRESS',
      message: 'Request with this idempotency key is still being processed. Retry after a short delay.',
      retryAfter: 1,  // seconds
    });
  }

  // V3.0.9: Handle FAILED state - can retry with same key
  if (existing.status === 'failed') {
    // Update to processing and allow retry
    await db.idempotencyKeys.update({
      key,
      status: 'processing',
    });
    return { proceed: true };
  }

  // COMPLETED: check if same request
  if (existing.request_hash === requestHash) {
    // SAME request body - return cached response (200)
    return { proceed: false, cachedResponse: existing.response_json };
  }

  // DIFFERENT request body with SAME key - CONFLICT
  // Client is trying to reuse a key with different payload
  throw new ConflictError({
    status: 409,
    code: 'IDEMPOTENCY_KEY_REUSED',
    message: 'Idempotency key already used with different request body',
  });
}

// After request completes successfully:
await db.idempotencyKeys.update({
  key,
  status: 'completed',
  response_status: res.statusCode,
  response_json: responseBody,
});

// After request fails (non-retryable):
await db.idempotencyKeys.update({
  key,
  status: 'failed',
});

// RULES:
// 409 IDEMPOTENCY_KEY_REUSED = key reused with different body (client bug)
// 409 IDEMPOTENCY_IN_PROGRESS = concurrent duplicate (client should wait + retry)
// 200 = exact same request replayed (safe retry from cache)
```

### 7.3 Event Consumer Rules

```typescript
// EVERY event consumer must:
// 1. Check event_inbox for duplicate
// 2. Process idempotently
// 3. Update event_inbox status

async function handleEvent(event: DomainEvent) {
  // 1. Dedupe check
  const existing = await db.eventInbox.findOne({ event_id: event.eventId });
  if (existing?.status === 'processed') {
    return; // Already processed
  }

  // 2. Insert/update inbox
  await db.eventInbox.upsert({
    event_id: event.eventId,
    status: 'processing',
  });

  try {
    // 3. Process (must be idempotent!)
    await processEventIdempotently(event);

    // 4. Mark processed
    await db.eventInbox.update({
      event_id: event.eventId,
      status: 'processed',
      processed_at: new Date(),
    });
  } catch (err) {
    await db.eventInbox.update({
      event_id: event.eventId,
      status: 'failed',
      error_message: err.message,
      retry_count: (existing?.retry_count || 0) + 1,
    });
    throw err; // Bull will retry
  }
}
```

### 7.4 Cart vs Ledger Rules

```
┌─────────────────────────────────────────────────────────────────┐
│              CART vs LEDGER (CRITICAL)                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  POS CART                              INVENTORY LEDGER          │
│  ────────                              ────────────────          │
│                                                                  │
│  • Can be optimistic                   • Is the truth            │
│  • Can show "low stock" warning        • Changes ONLY via API    │
│  • Can suggest quantities              • API writes are final    │
│  • UI-level validation only            • No undo without adjust  │
│                                                                  │
│  FLOW:                                                           │
│                                                                  │
│  User adds to cart → Cart state (optimistic)                    │
│       │                                                          │
│       ▼                                                          │
│  User checks out → POST /inventory/transactions                  │
│       │                                                          │
│       ▼                                                          │
│  API succeeds → Ledger updated → INVENTORY_CHANGED event        │
│       │                                                          │
│       ▼                                                          │
│  Receipt generated                                               │
│                                                                  │
│  RULE: Cart NEVER directly mutates stock.                       │
│        Only successful API calls do.                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 7.5 GRN (Goods Receipt) Flow (CRITICAL)

```
┌─────────────────────────────────────────────────────────────────┐
│              GRN FLOW - INVENTORY OWNERSHIP                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  DECISION: order-service calls inventory-service SYNCHRONOUSLY  │
│                                                                  │
│  WHY NOT direct write to inventory_ledger?                      │
│  ──────────────────────────────────────────                     │
│  • inventory-service owns the ledger (single source of truth)   │
│  • Avoids "PO received but stock not updated" race condition    │
│  • inventory-service can enforce stock validation rules         │
│                                                                  │
│  FLOW:                                                           │
│                                                                  │
│  Store receives goods                                            │
│       │                                                          │
│       ▼                                                          │
│  POST /purchase-orders/{id}/receive                             │
│  (order-service)                                                 │
│       │                                                          │
│       ▼                                                          │
│  order-service calls:                                            │
│  POST /inventory/transactions (internal)                        │
│  {                                                               │
│    type: "purchase_received",                                    │
│    referenceId: orderId,                                         │
│    referenceSubId: receiveId,  // V3.0.4: for partial GRN trace │
│    items: [{ productId, quantity, unitCost }]                   │
│  }                                                               │
│       │                                                          │
│       ▼                                                          │
│  inventory-service:                                              │
│  1. Writes ledger entries (same txn)                            │
│  2. Writes event_outbox (same txn)                              │
│  3. Returns success + stock_after                                │
│       │                                                          │
│       ▼                                                          │
│  order-service (on success):                                     │
│  1. Updates PO status to delivered/partial                       │
│  2. Writes orders.po.received.v1 to outbox                      │
│                                                                  │
│  order-service (on failure):                                     │
│  1. Returns 500 to client                                        │
│  2. PO remains in previous state                                 │
│                                                                  │
│  RULE: order-service NEVER writes to inventory_ledger directly. │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**V3.0.3 GRN Partial Receipts**

```
┌─────────────────────────────────────────────────────────────────┐
│              PARTIAL GRN WITH receiveId                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SCENARIO: PO has 100 units ordered, supplier delivers in parts │
│                                                                  │
│  Day 1: Receive 60 units                                         │
│  ──────────────────────                                         │
│  POST /purchase-orders/{orderId}/receive                        │
│  X-Idempotency-Key: "receive-001" (unique per receive action)   │
│  Body: { items: [{ itemId, receivedQuantity: 60,                │
│                    status: "partial" }] }                       │
│                                                                  │
│  → PO status: partial_received                                   │
│  → received_quantity = 60 (total received so far)                │
│  → inventory_ledger gets +60                                     │
│                                                                  │
│  Day 3: Receive remaining 40 units                               │
│  ─────────────────────────────────                              │
│  POST /purchase-orders/{orderId}/receive                        │
│  X-Idempotency-Key: "receive-002" (NEW key for new action!)     │
│  Body: { items: [{ itemId, receivedQuantity: 40,                │
│                    status: "received" }] }                      │
│                                                                  │
│  → PO status: delivered (all items now received or rejected)    │
│  → received_quantity = 100 (total = 60 + 40)                     │
│  → inventory_ledger gets another +40                             │
│                                                                  │
│  CRITICAL: Each partial receive MUST use NEW idempotency key!   │
│  Reusing key = 409 Conflict (treated as duplicate request)      │
│                                                                  │
│  IMPLEMENTATION:                                                 │
│  1. order_items.received_quantity is CUMULATIVE (add to it)     │
│  2. Each receive call adds to received_quantity, not replaces   │
│  3. If received_quantity >= ordered_quantity → status=received  │
│  4. If any items pending → PO status=partial_received           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 7.6 Service-to-Service Authentication (V3.0.6)

```
┌─────────────────────────────────────────────────────────────────┐
│        SERVICE-TO-SERVICE AUTH FOR INTERNAL CALLS               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PROBLEM: order-service calls inventory-service for GRN.        │
│  How does inventory-service know it's a legitimate call?        │
│                                                                  │
│  APPROACH: Forward User JWT + Service Header                     │
│  ────────────────────────────────────────────                   │
│                                                                  │
│  POS Client → order-service → inventory-service                 │
│      │                │                │                         │
│      │  Authorization: Bearer <user-jwt>                        │
│      │                │                │                         │
│      │                └─ Forwards JWT + adds:                   │
│      │                   X-Service-Name: order-service          │
│      │                                │                         │
│      │                                └─ inventory-service:     │
│      │                                   1. Validates user JWT  │
│      │                                   2. Checks X-Service-Name│
│      │                                   3. Verifies permission │
│      │                                                          │
│  RULES:                                                         │
│  1. User JWT MUST be present (no anonymous service calls)       │
│  2. X-Service-Name identifies calling service (for audit)       │
│  3. Permission check uses user's permissions (not service's)    │
│  4. Internal calls go through internal network (not gateway)    │
│                                                                  │
│  ALTERNATIVE (M2M Token) - NOT MVP:                             │
│  - Service acquires its own token from auth-service             │
│  - More complex, needed for background jobs without user        │
│  - Defer until batch processing requirements                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 7.7 Deadlock Prevention - Ordered Locking (V3.0.6)

```
┌─────────────────────────────────────────────────────────────────┐
│              ORDERED LOCKING TO PREVENT DEADLOCKS               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PROBLEM: Two concurrent transactions locking products in       │
│  different order can deadlock.                                  │
│                                                                  │
│  Transaction A: Lock product 1, then product 2                  │
│  Transaction B: Lock product 2, then product 1                  │
│  → DEADLOCK!                                                    │
│                                                                  │
│  SOLUTION: Always lock products in sorted order by product_id   │
│  ──────────────────────────────────────────────────────────────│
│                                                                  │
│  ```typescript                                                  │
│  async function processInventoryTransaction(items: Item[]) {   │
│    // V3.0.6: Sort by product_id to prevent deadlocks          │
│    const sortedItems = [...items].sort(                        │
│      (a, b) => a.productId.localeCompare(b.productId)          │
│    );                                                           │
│                                                                  │
│    await db.transaction(async (tx) => {                        │
│      for (const item of sortedItems) {                         │
│        // Lock row in deterministic order                       │
│        const balance = await tx.query(                         │
│          `SELECT * FROM stock_balances                          │
│           WHERE product_id = $1 FOR UPDATE`,                   │
│          [item.productId]                                       │
│        );                                                       │
│        // Process item...                                       │
│      }                                                          │
│    });                                                          │
│  }                                                              │
│  ```                                                            │
│                                                                  │
│  RULE: ANY multi-row inventory operation MUST sort by           │
│        product_id before acquiring FOR UPDATE locks.            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 7.8 Catalog Stock Backfill/Reconciliation (V3.0.6)

```
┌─────────────────────────────────────────────────────────────────┐
│              CATALOG STOCK READ-MODEL BOOTSTRAP                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PROBLEM: catalog.store_products.current_stock is a read-model │
│  updated via INVENTORY_CHANGED events. What if:                 │
│  - Events were lost/missed?                                     │
│  - New store onboarded with existing inventory?                 │
│  - Read-model diverged from ledger truth?                       │
│                                                                  │
│  SOLUTION: Reconciliation endpoint + startup check              │
│  ──────────────────────────────────────────────────────────────│
│                                                                  │
│  ENDPOINT: POST /internal/catalog/reconcile-stock              │
│  (Admin-only, triggered manually or via cron)                   │
│                                                                  │
│  ```sql                                                         │
│  -- Reconcile store_products.current_stock with ledger truth   │
│  UPDATE catalog.store_products sp                               │
│  SET current_stock = COALESCE(ledger.total, 0),                │
│      stock_last_event_at = NOW()                                │
│  FROM (                                                         │
│    SELECT store_id, product_id, SUM(delta_qty) as total        │
│    FROM inventory.inventory_ledger                              │
│    WHERE store_id = $1                                          │
│    GROUP BY store_id, product_id                                │
│  ) ledger                                                       │
│  WHERE sp.store_id = ledger.store_id                           │
│    AND sp.product_id = ledger.product_id                       │
│    AND sp.store_id = $1;                                        │
│  ```                                                            │
│                                                                  │
│  BOOTSTRAP PATH (new store):                                    │
│  1. Admin creates store                                         │
│  2. Admin imports initial inventory (bulk adjust)               │
│  3. Events populate store_products read-model                   │
│  4. If needed: run reconcile to catch any missed events        │
│                                                                  │
│  MONITORING: Alert if current_stock != SUM(delta_qty)          │
│  for any product (indicates event processing failure)           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 7.9 Standard Error Envelope (V3.0.6)

```typescript
// V3.0.6: ALL API error responses MUST use this envelope
// Enables consistent client-side error handling

interface ApiError {
  error: {
    code: string;        // Machine-readable: "VALIDATION_ERROR", "NOT_FOUND", etc.
    message: string;     // Human-readable message
    details?: Record<string, unknown>;  // Additional context
    field?: string;      // For validation errors - which field failed
  };
  requestId: string;     // Correlation ID for debugging
}

// Common error codes
const ERROR_CODES = {
  // 400
  VALIDATION_ERROR: 'Request validation failed',
  INVALID_QUANTITY: 'Quantity must be a positive integer',

  // 401
  UNAUTHORIZED: 'Authentication required',
  TOKEN_EXPIRED: 'Access token expired',

  // 403
  FORBIDDEN: 'Insufficient permissions',

  // 404
  NOT_FOUND: 'Resource not found',
  PRODUCT_NOT_FOUND: 'Product does not exist',
  ORDER_NOT_FOUND: 'Purchase order does not exist',

  // 409
  CONFLICT: 'Resource conflict',
  IDEMPOTENCY_KEY_REUSED: 'Idempotency key already used with different body',
  INSUFFICIENT_STOCK: 'Not enough stock to complete transaction',

  // 422
  UNPROCESSABLE: 'Business rule violation',
  PRODUCT_NOT_MAPPED: 'Product not mapped to any supplier',

  // 500
  INTERNAL_ERROR: 'Internal server error',
} as const;

// Example error response
// HTTP 409
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Not enough stock to complete transaction",
    "details": {
      "productId": "123e4567-e89b-12d3-a456-426614174000",
      "requested": 10,
      "available": 5
    }
  },
  "requestId": "req-abc123"
}
```

---

## 8. Sprint Plan

### 8.1 Sprint Overview (10 weeks MVP)

| Sprint | Focus | Duration |
|--------|-------|----------|
| 1 | Foundation | 2 weeks |
| 2 | Core Services | 2 weeks |
| 3 | Catalog + Mapping | 2 weeks |
| 4 | Reorder + Events | 2 weeks |
| 5 | POS UI | 2 weeks |

### 8.2 Detailed Sprint Plan

```
SPRINT 1: FOUNDATION (Week 1-2)
────────────────────────────────
TICKET-028  Stores Table + Service
TICKET-001  Database Schema (all schemas, UUID everywhere)
TICKET-020  Auth Service + RBAC (include refresh/reset tokens)
TICKET-032  Feature Flags APIs

Deliverable: Auth working, stores exist, flags queryable

SPRINT 2: CORE SERVICES (Week 3-4)
──────────────────────────────────
TICKET-021  Inventory Ledger Service
TICKET-031  SELL → Inventory Integration
TICKET-010  Purchase Order Service (PO + GRN)
TICKET-029  Idempotency Keys

Deliverable: Can record sales, create POs, receive GRN

SPRINT 3: CATALOG + MAPPING (Week 5-6)
──────────────────────────────────────
TICKET-002  Supplier Service (thin MVP)
TICKET-003  Catalog Service Core
TICKET-022  Supplier Product Mapping

Deliverable: Unified catalog, mapping gate working

SPRINT 4: REORDER + EVENTS (Week 7-8)
─────────────────────────────────────
TICKET-023  Reorder Policies + Draft Flow
TICKET-030  Event Inbox + Consumer Dedup
TICKET-025  Outbox + Event Bus (Bull)
TICKET-014  Stock Monitor Job

Deliverable: Auto reorder suggestions, events flowing

SPRINT 5: POS UI (Week 9-10)
────────────────────────────
TICKET-004  Purchase Cart Store
TICKET-006  BUY Screen
TICKET-005  REORDER Screen
TICKET-034  Cart Validation (MOQ, min order)

Deliverable: MVP COMPLETE - POS can BUY, REORDER, GRN
```

---

## 9. Ticket List

### 9.1 MVP Tickets (P0 - Must Ship)

| ID | Title | Sprint | Days |
|----|-------|--------|------|
| TICKET-028 | Stores Table + Service | 1 | 3 |
| TICKET-001 | Database Schema Setup | 1 | 4 |
| TICKET-020 | Auth Service + RBAC | 1 | 5 |
| TICKET-032 | Feature Flags APIs | 1 | 2 |
| TICKET-021 | Inventory Ledger Service | 2 | 5 |
| TICKET-031 | SELL → Inventory Integration | 2 | 4 |
| TICKET-010 | Purchase Order Service | 2 | 5 |
| TICKET-029 | Idempotency Keys | 2 | 3 |
| TICKET-002 | Supplier Service (thin) | 3 | 4 |
| TICKET-003 | Catalog Service Core | 3 | 5 |
| TICKET-022 | Product Mapping | 3 | 5 |
| TICKET-023 | Reorder Policies + Drafts | 4 | 5 |
| TICKET-030 | Event Inbox + Dedup | 4 | 3 |
| TICKET-025 | Outbox + Bull Queues | 4 | 4 |
| TICKET-014 | Stock Monitor Job | 4 | 3 |
| TICKET-004 | Purchase Cart Store | 5 | 3 |
| TICKET-006 | BUY Screen | 5 | 5 |
| TICKET-005 | REORDER Screen | 5 | 5 |
| TICKET-034 | Cart Validation | 5 | 3 |

**Total MVP**: 19 tickets, ~76 days, 10 weeks

### 9.2 Post-MVP Tickets (P1/P2)

| ID | Title | Priority |
|----|-------|----------|
| TICKET-024 | Superadmin Portal | P1 |
| TICKET-026 | Supplier Web Dashboard | P1 |
| TICKET-017 | Supplier App - Orders | P1 |
| TICKET-016 | Push Notifications | P1 |
| TICKET-033 | CSV Upload Pipeline | P1 |
| TICKET-035 | Returns (Purchase + Sale) | P2 |
| TICKET-036 | Stock Take | P2 |
| TICKET-037 | Observability Upgrade | P2 |
| TICKET-019 | Real-time Stock (WebSocket) | P2 |

---

## 10. Final Checklist

Before starting development:

**Schema Integrity**
- [ ] All store_id columns are UUID
- [ ] Cross-schema FKs removed (UUID columns only)
- [ ] auth.refresh_tokens table exists
- [ ] auth.password_reset_tokens table exists
- [ ] idempotency_keys in orders, inventory, reorder schemas
- [ ] event_inbox in inventory, reorder, catalog schemas
- [ ] event_outbox in orders, inventory, reorder, supplier schemas

**NULL Uniqueness Fixes (V3.0.2)**
- [ ] platform.feature_flags uses partial indexes (ux_flags_global, ux_flags_scoped)
- [ ] auth.user_roles uses partial indexes (ux_user_roles_global, ux_user_roles_scoped)
- [ ] Both tables have CHECK constraints for scope_type/scope_id consistency

**Additional Tables**
- [ ] catalog.catalog_mapping_log table exists
- [ ] reorder.reorder_runs table exists
- [ ] supplier.supplier_requests table exists
- [ ] supplier_product_map has UNIQUE(supplier_product_id)

**Business Rules (V3.0.2)**
- [ ] stores.features_enabled removed (use feature_flags only)
- [ ] store_products.sell_price is NULLABLE (for buy-first scenarios)
- [ ] Catalog filters by linked suppliers (supplier_store_links for THIS store)
- [ ] Inventory API: quantity always positive, service applies sign based on type
- [ ] All 5 roles seeded (STORE_STAFF, STORE_ADMIN, SUPPLIER_STAFF, SUPPLIER_ADMIN, SUPERADMIN)
- [ ] Roles seeded with split inventory permissions

**Infrastructure**
- [ ] Bull queues configured: orders-events, inventory-events, reorder-events, supplier-events
- [ ] All events have .v1 suffix
- [ ] GRN flow: order-service calls inventory-service (no direct ledger write)

**Concurrency & Data Integrity (V3.0.3)**
- [ ] All TIMESTAMP columns are TIMESTAMPTZ
- [ ] inventory.stock_balances table exists (for row locking)
- [ ] orders.order_sequences table exists (for atomic PO numbering)
- [ ] store_products.stock_last_event_at column exists (last-write-wins)
- [ ] Idempotency returns 409 on key reuse with different body
- [ ] Redis has AOF persistence enabled (appendonly yes)
- [ ] store.flags.read permission added to STORE_STAFF and STORE_ADMIN roles

**Final QA Fixes (V3.0.4)**
- [ ] Event matrix corrected: orders.po.received.v1 does NOT go to inventory-service
- [ ] inventory_ledger.reference_sub_id column exists (for partial GRN traceability)
- [ ] ux_pending_reorders_active partial unique index exists
- [ ] MVP performance indexes created (see section 3.9)
- [ ] auth.users has chk_users_actor CHECK constraint
- [ ] Role seeds use explicit ::jsonb cast
- [ ] pgcrypto and pg_trgm extensions created

**Data Integrity Hardening (V3.0.5)**
- [ ] Redis durability statement corrected (ledger safe because GRN/SALE are sync)
- [ ] ux_products_primary_barcode partial unique index exists (prevents barcode duplicates)
- [ ] idx_products_name_trgm + idx_products_brand_trgm GIN indexes exist
- [ ] chk_po_status CHECK constraint on orders.purchase_orders
- [ ] chk_pending_reorders_status CHECK constraint on reorder.pending_reorders
- [ ] chk_inventory_txn_type CHECK constraint on inventory.inventory_ledger
- [ ] pending_reorders.expires_at has DEFAULT (NOW() + INTERVAL '7 days')
- [ ] fk_stock_balances_last_ledger FK added (same-schema)
- [ ] Inventory API uses INTEGER types (not number/float)
- [ ] Inventory transactions spec includes referenceSubId
- [ ] Canonical event envelope type (DomainEvent<TPayload>) documented
- [ ] InventoryStockChangedV1 payload type documented

**MVP Ship Blockers (V3.0.6)**
- [ ] All quantity API fields use INTEGER (purchase-orders, receive, reorder approve)
- [ ] Bounds CHECK constraints: chk_store_link_bounds, chk_order_item_bounds, chk_reorder_policy_bounds
- [ ] catalog.product_barcodes table exists (normalized barcodes)
- [ ] ux_product_barcodes_barcode unique index exists (globally unique barcodes)
- [ ] ux_product_barcodes_primary partial index exists (one primary per product)
- [ ] Service-to-service auth documented (section 7.6)
- [ ] Ordered locking for deadlock prevention documented (section 7.7)
- [ ] Catalog stock backfill/reconciliation documented (section 7.8)
- [ ] Standard error envelope documented (section 7.9)
- [ ] Idempotency keys have status column (processing/completed/failed)
- [ ] InventoryStockChangedV1 has ledgerCreatedAt field
- [ ] orders.order_sequences has store_code column (denormalized)
- [ ] auth.users has chk_users_identifier CHECK (email OR phone required)
- [ ] idx_supplier_products_barcode index exists
- [ ] event_outbox.aggregate_id widened to VARCHAR(100)

---

## 11. UI Screens & Flows (MVP)

### 11.1 Critical Concept: Catalog ≠ Stock

```
┌─────────────────────────────────────────────────────────────────┐
│              CATALOG ≠ STOCK (CRITICAL CONCEPT)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  BUY CATALOG                         SELL STOCK                  │
│  ───────────                         ──────────                  │
│  "What CAN be purchased"             "What IS in store"          │
│                                                                  │
│  Source: supplier_product_map        Source: inventory_ledger    │
│  (products linked to suppliers)      (SUM of delta_qty)          │
│                                                                  │
│  Shows in: BUY tab                   Shows in: SELL tab          │
│  Purpose: Browse & order             Purpose: Sell to customers  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                              ││
│  │  CATALOG ITEM         ══════════════▶         STOCK ITEM    ││
│  │  (supplier_product)     ONLY after:          (ledger entry) ││
│  │                        1. PO submitted                       ││
│  │                        2. Goods delivered                    ││
│  │                        3. GRN completed                      ││
│  │                                                              ││
│  │  Rice (Supplier A)     GRN +100 units    Rice: 100 in stock ││
│  │  ₹45/kg                ───────────▶      Can now SELL       ││
│  │                                                              ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  RULE: Adding to BUY catalog does NOT create stock.             │
│        Only completed GRN creates stock in ledger.              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 11.2 POS App Tab Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                    POS APP NAVIGATION (MVP)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │  SELL   │ │   BUY   │ │ REORDER │ │  MORE   │ │ PROFILE │   │
│  │  (POS)  │ │ (Order) │ │ (Smart) │ │         │ │         │   │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘   │
│       │          │          │           │           │          │
│       ▼          ▼          ▼           ▼           ▼          │
│   Existing   Catalog     Reorder    Settings    User Info      │
│   POS Flow   Browse      Suggest.   Reports     Logout         │
│              + Cart      + Approve  GRN List                   │
│              + Checkout  + Dismiss                             │
│                                                                  │
│  MVP SCREENS:                                                   │
│  ─────────────                                                  │
│  1. SELL Tab - existing POS (no changes for MVP)               │
│  2. BUY Tab - new catalog browse + purchase cart               │
│  3. REORDER Tab - new suggestions + approval flow              │
│  4. GRN Screen - receive goods against PO                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 11.3 SELL Tab (Existing POS)

```
┌─────────────────────────────────────────────────────────────────┐
│                        SELL TAB (POS)                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 🔍 Scan barcode or search...                        [SCAN]  ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  PRODUCTS (in stock)                                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Rice Basmati 5kg         Stock: 45    ₹250    [+]        │  │
│  │ Toor Dal 1kg             Stock: 23    ₹120    [+]        │  │
│  │ Sugar 1kg                Stock: 0     ₹45     [OUT]      │  │
│  │ Cooking Oil 1L           Stock: 12    ₹180    [+]        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  CART                                              Total: ₹630  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Rice Basmati 5kg    x2    ₹500                           │  │
│  │ Toor Dal 1kg        x1    ₹120                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  [CHECKOUT - ₹630]                                              │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  DATA SOURCE:                                                   │
│  • Products: store_products WHERE current_stock > 0             │
│  • Stock: inventory_ledger SUM(delta_qty) or stock_balances    │
│                                                                  │
│  ON CHECKOUT:                                                   │
│  POST /inventory/transactions { type: "sale", items: [...] }   │
│  → Creates ledger entries (negative delta_qty)                 │
│  → Publishes INVENTORY_CHANGED event                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 11.4 BUY Tab (Catalog + Purchase Cart)

```
┌─────────────────────────────────────────────────────────────────┐
│                        BUY TAB                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ [Supplier ▼] All Suppliers    🔍 Search catalog...       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ [All] [Groceries] [Beverages] [Dairy] [Snacks]           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  SUPPLIER CATALOG (what you CAN buy)                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Rice Basmati 5kg                                          │  │
│  │ Supplier: ABC Traders    MOQ: 10    ₹220/unit             │  │
│  │ Your Stock: 45           Min Order: ₹5000                 │  │
│  │                                              [ADD TO CART]│  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ Toor Dal 1kg                                              │  │
│  │ Supplier: XYZ Wholesale  MOQ: 5     ₹100/unit             │  │
│  │ Your Stock: 23           Min Order: ₹2000                 │  │
│  │                                              [ADD TO CART]│  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 🛒 CART (2 items)                           [VIEW CART]  │  │
│  │ ABC Traders: 3 items, ₹6,600                             │  │
│  │ XYZ Wholesale: 2 items, ₹2,500                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  DATA SOURCE:                                                   │
│  • Catalog: supplier_products JOIN supplier_product_map         │
│             WHERE supplier_id IN (linked_suppliers_for_store)   │
│  • Stock shown: store_products.current_stock (read-model)       │
│                                                                  │
│  BUYABILITY GATE:                                               │
│  Only products in supplier_product_map appear in this list.    │
│  No mapping = not visible in BUY tab.                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    PURCHASE CART MODAL                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CART BY SUPPLIER                                               │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ ABC Traders                              Subtotal: ₹6,600 │  │
│  │ Min Order: ₹5000 ✓                       Status: Ready    │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ Rice Basmati 5kg      [-] 20 [+]    ₹220    ₹4,400       │  │
│  │ Sugar 1kg             [-] 50 [+]    ₹44     ₹2,200       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ XYZ Wholesale                            Subtotal: ₹2,500 │  │
│  │ Min Order: ₹2000 ✓                       Status: Ready    │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ Toor Dal 1kg          [-] 25 [+]    ₹100   ₹2,500        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  TOTAL: ₹9,100                                                  │
│                                                                  │
│  [SUBMIT ORDERS]                                                │
│  → Creates 2 POs (one per supplier)                            │
│  → Status: draft → submitted                                    │
│  → Awaits supplier confirmation                                 │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  VALIDATION RULES:                                              │
│  • MOQ: Each item must meet minimum order quantity              │
│  • Min Order Value: Supplier subtotal must meet threshold       │
│  • Max Qty: Cannot exceed supplier's max_qty if set            │
│                                                                  │
│  ON SUBMIT:                                                     │
│  POST /purchase-orders { supplierId, items: [...] }            │
│  → Creates draft PO                                            │
│  POST /purchase-orders/{id}/submit                             │
│  → Publishes orders.po.created.v1 event                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 11.5 REORDER Tab (Smart Suggestions)

```
┌─────────────────────────────────────────────────────────────────┐
│                      REORDER TAB                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Reorder Suggestions                              [⚙️]    │  │
│  │ 5 items need restocking                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  LOW STOCK ALERTS (below min_threshold)                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ [☑] Sugar 1kg                                             │  │
│  │     Current: 0  │  Min: 20  │  Target: 50                 │  │
│  │     Suggested: 50 units @ ₹44 from ABC Traders           │  │
│  │     Total: ₹2,200                        [EDIT] [DISMISS] │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ [☑] Cooking Oil 1L                                        │  │
│  │     Current: 5   │  Min: 15  │  Target: 30                │  │
│  │     Suggested: 25 units @ ₹160 from XYZ Wholesale        │  │
│  │     Total: ₹4,000                        [EDIT] [DISMISS] │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ [☐] Toor Dal 1kg                                          │  │
│  │     Current: 8   │  Min: 10  │  Target: 25                │  │
│  │     Suggested: 17 units @ ₹100 from XYZ Wholesale        │  │
│  │     Total: ₹1,700                        [EDIT] [DISMISS] │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Selected: 2 items │ Est. Total: ₹6,200                        │
│                                                                  │
│  [APPROVE SELECTED → CREATE DRAFT POs]                          │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  DATA SOURCE:                                                   │
│  • Suggestions: pending_reorders WHERE status = 'pending'       │
│  • Thresholds: reorder_policies (min_stock, target_stock)      │
│  • Auto-generated by: stock monitor job OR INVENTORY_CHANGED   │
│                                                                  │
│  LOGIC:                                                         │
│  suggested_quantity = target_stock - current_stock              │
│  Trigger: current_stock < min_stock                             │
│                                                                  │
│  ON APPROVE:                                                    │
│  POST /reorder/pending/approve { reorderIds: [...] }           │
│  → Creates draft POs grouped by supplier                       │
│  → User redirected to BUY tab to review & submit               │
│                                                                  │
│  ON DISMISS:                                                    │
│  POST /reorder/pending/{id}/dismiss { reason: "..." }          │
│  → Removes from pending list                                   │
│  → Will re-suggest if stock still low (next check cycle)       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                  REORDER SETTINGS (⚙️ icon)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Store Reorder Settings                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Auto-generate suggestions     [ON]                        │  │
│  │ Require approval before PO    [ON]                        │  │
│  │ Notify on low stock           [ON]                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Product-Level Policies                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Product          Min Stock    Target    Preferred Supplier│  │
│  │ ────────────     ─────────    ──────    ─────────────────│  │
│  │ Rice Basmati     20           50        ABC Traders       │  │
│  │ Toor Dal         10           25        XYZ Wholesale     │  │
│  │ Sugar            20           50        ABC Traders       │  │
│  │ Cooking Oil      15           30        [Any]             │  │
│  │ ...                                                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  [SAVE SETTINGS]                                                │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  API:                                                           │
│  GET  /reorder/settings - store-level settings                 │
│  PUT  /reorder/settings - update store settings                │
│  GET  /reorder/policies - all product policies                 │
│  PUT  /reorder/policies/{productId} - update single policy     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 11.6 GRN Screen (Goods Receipt)

```
┌─────────────────────────────────────────────────────────────────┐
│                      GRN SCREEN                                  │
│               (Goods Receipt Note)                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PENDING DELIVERIES                                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ PO-MUM01-26-00015                                         │  │
│  │ Supplier: ABC Traders                                     │  │
│  │ Ordered: 12 Jan 2026    Expected: 14 Jan 2026            │  │
│  │ Items: 3    Total: ₹8,800    Status: SHIPPED             │  │
│  │                                          [RECEIVE GOODS] │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ PO-MUM01-26-00014                                         │  │
│  │ Supplier: XYZ Wholesale                                   │  │
│  │ Ordered: 11 Jan 2026    Expected: 13 Jan 2026            │  │
│  │ Items: 2    Total: ₹4,500    Status: CONFIRMED           │  │
│  │                                          [RECEIVE GOODS] │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  ACCESS: MORE tab → GRN / Pending Orders                       │
│  OR: Direct link from BUY tab after submitting order           │
│                                                                  │
│  DATA SOURCE:                                                   │
│  GET /purchase-orders?status=confirmed,shipped,partial_received│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              GRN RECEIVE MODAL                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Receiving: PO-MUM01-26-00015                                   │
│  Supplier: ABC Traders                                          │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Item               Ordered    Received    This Batch     │  │
│  │ ────               ───────    ────────    ──────────     │  │
│  │ Rice Basmati 5kg   20         0           [    20   ]    │  │
│  │                                           [✓] [✗] [½]    │  │
│  │ Sugar 1kg          50         0           [    50   ]    │  │
│  │                                           [✓] [✗] [½]    │  │
│  │ Cooking Oil 1L     10         0           [    10   ]    │  │
│  │                                           [✓] [✗] [½]    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Legend: [✓] Full  [✗] Reject  [½] Partial                     │
│                                                                  │
│  SCAN MODE: [🔍 Scan barcode to auto-fill]                      │
│                                                                  │
│  [CONFIRM RECEIPT]                                              │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  ON CONFIRM:                                                    │
│  POST /purchase-orders/{id}/receive                            │
│  {                                                              │
│    items: [                                                     │
│      { itemId, receivedQuantity: 20, status: "received" },     │
│      { itemId, receivedQuantity: 50, status: "received" },     │
│      { itemId, receivedQuantity: 5, status: "partial" }        │
│    ]                                                            │
│  }                                                              │
│                                                                  │
│  BACKEND FLOW:                                                  │
│  1. order-service validates items                               │
│  2. order-service calls inventory-service (sync)               │
│  3. inventory-service writes ledger (+qty per item)            │
│  4. inventory-service publishes INVENTORY_CHANGED              │
│  5. order-service updates PO status (delivered/partial)        │
│  6. order-service publishes orders.po.received.v1              │
│                                                                  │
│  STOCK CREATION:                                                │
│  ─────────────────────────────────────────────────────────────  │
│  ONLY at step 3 (ledger write) does stock actually appear.     │
│  Rice: 0 → 20, Sugar: 0 → 50, Oil: 0 → 5                       │
│  These items NOW appear in SELL tab with stock > 0.            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 11.7 Store Onboarding Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              NEW STORE ONBOARDING FLOW                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  DAY 1: Store Setup                                             │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  1. Admin creates store in platform                             │
│     → platform.stores row created                               │
│     → User account created with STORE_ADMIN role                │
│                                                                  │
│  2. Store logs into POS app                                     │
│     → SELL tab: Empty (no products yet)                         │
│     → BUY tab: Empty (no suppliers linked yet)                  │
│     → REORDER tab: Empty (no policies yet)                      │
│                                                                  │
│  3. Link suppliers (BUY tab → Settings)                         │
│     → Search suppliers by GSTIN/name                            │
│     → Link existing supplier OR request new supplier            │
│     → supplier_store_links created                              │
│                                                                  │
│  4. Once supplier linked:                                       │
│     → BUY tab shows supplier's catalog (supplier_product_map)   │
│     → Can browse products that CAN be purchased                 │
│     → SELL tab still empty (no stock yet)                       │
│                                                                  │
│  DAY 2: First Purchase                                          │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  5. Browse catalog in BUY tab                                   │
│     → Add products to purchase cart                             │
│     → Submit PO to supplier                                     │
│                                                                  │
│  6. Wait for delivery (PO status: submitted → confirmed → shipped)│
│                                                                  │
│  DAY 3+: Receive Goods                                          │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  7. Goods arrive at store                                       │
│     → Open GRN screen                                           │
│     → Select PO and receive items                               │
│     → GRN completed                                             │
│                                                                  │
│  8. STOCK IS NOW CREATED!                                       │
│     → inventory_ledger entries created (+qty)                   │
│     → store_products.current_stock updated via event            │
│     → SELL tab now shows products with stock > 0                │
│     → Can now sell to customers                                 │
│                                                                  │
│  9. Set up reorder policies (REORDER tab → Settings)            │
│     → Define min_stock, target_stock per product                │
│     → System auto-suggests reorders when stock low              │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                     TIMELINE                                 ││
│  │                                                              ││
│  │  [Link Supplier] → [Browse Catalog] → [Submit PO]           ││
│  │         │                  │                │                ││
│  │         ▼                  ▼                ▼                ││
│  │  BUY tab shows      Can add to cart   Awaits delivery       ││
│  │  supplier products                                           ││
│  │                                                              ││
│  │  [Receive GRN] → [Stock Created] → [Can Sell]               ││
│  │         │               │                │                   ││
│  │         ▼               ▼                ▼                   ││
│  │  Ledger entries   SELL tab shows   Revenue flows            ││
│  │  created          products                                   ││
│  │                                                              ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 11.8 Inventory Ledger Transaction Types

```
┌─────────────────────────────────────────────────────────────────┐
│              LEDGER TRANSACTION TYPES                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TYPE                  DELTA    TRIGGER             REFERENCE   │
│  ────                  ─────    ───────             ─────────   │
│  sale                  -qty     SELL checkout       sale_id     │
│  sale_return           +qty     Customer return     return_id   │
│  purchase_received     +qty     GRN completion      po_id       │
│  adjustment            ±qty     Manual correction   reason      │
│                                                                  │
│  EXAMPLES:                                                      │
│  ─────────                                                      │
│                                                                  │
│  Rice sold to customer (2 units):                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ store_id: store-123                                       │  │
│  │ product_id: rice-456                                      │  │
│  │ delta_qty: -2                                             │  │
│  │ transaction_type: sale                                    │  │
│  │ reference_type: sale                                      │  │
│  │ reference_id: sale-789                                    │  │
│  │ stock_before: 45                                          │  │
│  │ stock_after: 43                                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  GRN received (20 units of rice):                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ store_id: store-123                                       │  │
│  │ product_id: rice-456                                      │  │
│  │ delta_qty: +20                                            │  │
│  │ transaction_type: purchase_received                       │  │
│  │ reference_type: po                                        │  │
│  │ reference_id: po-abc                                      │  │
│  │ reference_sub_id: receive-def (for partial GRN trace)    │  │
│  │ stock_before: 43                                          │  │
│  │ stock_after: 63                                           │  │
│  │ unit_cost: 220.00                                         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  STOCK CALCULATION:                                             │
│  ─────────────────────────────────────────────────────────────  │
│  Current Stock = SUM(delta_qty) for store_id + product_id      │
│                                                                  │
│  Rice: -2 + 20 + ... = 63 units                                 │
│                                                                  │
│  RULE: inventory_ledger is append-only audit trail.            │
│        Never UPDATE or DELETE existing entries.                 │
│        To fix mistakes, add new adjustment entry.               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 12. Post-MVP UI Surfaces

### 12.1 Architecture: Separate Frontends, Common Backend

```
┌─────────────────────────────────────────────────────────────────┐
│         ARCHITECTURE: SEPARATE FRONTENDS, COMMON BACKEND         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  KEY PRINCIPLE:                                                 │
│  ───────────────                                                │
│  • Each frontend is a SEPARATE codebase/repo                    │
│  • ALL frontends connect to the SAME backend services           │
│  • Backend APIs are shared - same endpoints serve all clients   │
│  • RBAC determines what each user can access                    │
│                                                                  │
│  FRONTEND CODEBASES (5 separate projects)                       │
│  ─────────────────────────────────────────                      │
│                                                                  │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
│  │ supermandi-pos│  │ supplier-app  │  │ supplier-web  │       │
│  │ (React Native)│  │ (React Native)│  │ (Next.js)     │       │
│  │               │  │               │  │               │       │
│  │ • SELL tab    │  │ • Orders list │  │ • Dashboard   │       │
│  │ • BUY tab     │  │ • Order detail│  │ • Catalog mgmt│       │
│  │ • REORDER tab │  │ • Status update│ │ • Staff mgmt  │       │
│  │ • GRN screen  │  │ • Notifications│ │ • Analytics   │       │
│  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘       │
│          │                  │                  │                │
│  ┌───────────────┐  ┌───────────────┐          │                │
│  │ retailer-web  │  │ admin-portal  │          │                │
│  │ (Next.js)     │  │ (Next.js)     │          │                │
│  │               │  │               │          │                │
│  │ • Reports     │  │ • Stores mgmt │          │                │
│  │ • Inventory   │  │ • Supplier    │          │                │
│  │ • Staff mgmt  │  │   verify/merge│          │                │
│  │ • PO history  │  │ • Feature flags│         │                │
│  └───────┬───────┘  └───────┬───────┘          │                │
│          │                  │                  │                │
│          └──────────────────┴──────────────────┘                │
│                             │                                   │
│                             ▼                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    COMMON BACKEND                            ││
│  │                    (Microservices)                           ││
│  │                                                              ││
│  │  ┌──────────────────────────────────────────────────────┐   ││
│  │  │                   API GATEWAY (:3000)                 │   ││
│  │  │           (Routes, Auth validation, Rate limiting)    │   ││
│  │  └──────────────────────────┬───────────────────────────┘   ││
│  │                             │                                ││
│  │  ┌──────────┬──────────┬────┴────┬──────────┬──────────┐   ││
│  │  │   auth   │ supplier │ catalog │inventory │  order   │   ││
│  │  │  :3001   │  :3002   │  :3003  │  :3004   │  :3005   │   ││
│  │  └──────────┴──────────┴─────────┴──────────┴──────────┘   ││
│  │                    ┌──────────┐                              ││
│  │                    │ reorder  │                              ││
│  │                    │  :3006   │                              ││
│  │                    └──────────┘                              ││
│  │                                                              ││
│  │  ┌──────────────────────────────────────────────────────┐   ││
│  │  │          PostgreSQL + Redis (Bull queues)            │   ││
│  │  └──────────────────────────────────────────────────────┘   ││
│  │                                                              ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 12.2 Frontend Projects & Repository Structure

```
┌─────────────────────────────────────────────────────────────────┐
│              FRONTEND PROJECTS (SEPARATE CODEBASES)              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PROJECT           TECH STACK       USERS           PRIORITY    │
│  ───────           ──────────       ─────           ────────    │
│                                                                  │
│  supermandi-pos    React Native     Store Staff     P0 (MVP)    │
│                    Expo             Store Admin                  │
│                                                                  │
│  supplier-app      React Native     Supplier Staff  P1          │
│                    Expo             Supplier Admin               │
│                                                                  │
│  supplier-web      Next.js          Supplier Admin  P1          │
│                    React                                        │
│                                                                  │
│  retailer-web      Next.js          Store Admin     P1          │
│                    React            (multi-store)               │
│                                                                  │
│  admin-portal      Next.js          SUPERADMIN      P1          │
│                    React                                        │
│                                                                  │
│  REPOSITORY STRUCTURE:                                          │
│  ─────────────────────                                          │
│  /supermandi-pos/        # POS App (existing repo)              │
│  /supplier-app/          # Supplier mobile app (new repo)       │
│  /supplier-web/          # Supplier dashboard (new repo)        │
│  /retailer-web/          # Retailer dashboard (new repo)        │
│  /admin-portal/          # SuperMandi admin (new repo)          │
│  /backend/               # Shared microservices (new repo)      │
│      ├── services/                                              │
│      │   ├── api-gateway/                                       │
│      │   ├── auth-service/                                      │
│      │   ├── catalog-service/                                   │
│      │   ├── inventory-service/                                 │
│      │   ├── order-service/                                     │
│      │   ├── reorder-service/                                   │
│      │   └── supplier-service/                                  │
│      └── migrations/                                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 12.3 API Access Matrix by Frontend

```
┌─────────────────────────────────────────────────────────────────┐
│              API ACCESS MATRIX BY FRONTEND                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  API ENDPOINT                    POS  SUP  SUP  RET  ADMIN      │
│                                  APP  APP  WEB  WEB  PORTAL     │
│  ─────────────                   ───  ───  ───  ───  ──────     │
│                                                                  │
│  AUTH SERVICE                                                   │
│  POST /auth/login                 ✓    ✓    ✓    ✓    ✓        │
│  POST /auth/refresh               ✓    ✓    ✓    ✓    ✓        │
│  GET  /auth/me                    ✓    ✓    ✓    ✓    ✓        │
│                                                                  │
│  INVENTORY SERVICE                                              │
│  GET  /stores/{id}/inventory      ✓              ✓              │
│  POST /stores/{id}/inventory/*    ✓              ✓              │
│                                                                  │
│  ORDER SERVICE                                                  │
│  GET  /stores/{id}/purchase-orders ✓             ✓              │
│  POST /stores/{id}/purchase-orders ✓             ✓              │
│  GET  /suppliers/{id}/orders           ✓    ✓                   │
│  POST /suppliers/{id}/orders/*         ✓    ✓                   │
│                                                                  │
│  CATALOG SERVICE                                                │
│  GET  /stores/{id}/catalog        ✓              ✓              │
│  GET  /suppliers/{id}/catalog          ✓    ✓                   │
│  POST /suppliers/{id}/catalog/*             ✓                   │
│                                                                  │
│  REORDER SERVICE                                                │
│  GET  /stores/{id}/reorder/*      ✓              ✓              │
│  POST /stores/{id}/reorder/*      ✓              ✓              │
│                                                                  │
│  SUPPLIER SERVICE                                               │
│  GET  /stores/{id}/suppliers      ✓              ✓              │
│  GET  /suppliers/{id}/stores           ✓    ✓                   │
│  GET  /admin/suppliers/*                              ✓         │
│  POST /admin/suppliers/*                              ✓         │
│                                                                  │
│  ADMIN (Platform)                                               │
│  GET  /admin/stores                                   ✓         │
│  POST /admin/stores                                   ✓         │
│  GET  /admin/flags                                    ✓         │
│  POST /admin/flags                                    ✓         │
│                                                                  │
│  RBAC ENFORCES ACCESS:                                          │
│  • STORE_STAFF/STORE_ADMIN → /stores/{storeId}/* endpoints     │
│  • SUPPLIER_STAFF/SUPPLIER_ADMIN → /suppliers/{supplierId}/*   │
│  • SUPERADMIN → /admin/* endpoints                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 12.4 Supplier Mobile App

```
┌─────────────────────────────────────────────────────────────────┐
│              SUPPLIER MOBILE APP                                 │
│              (React Native / Expo)                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TARGET USERS: Supplier field staff, delivery personnel         │
│  PRIMARY USE: View orders, update status on-the-go              │
│                                                                  │
│  SCREENS:                                                       │
│  ─────────                                                      │
│                                                                  │
│  1. LOGIN                                                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  SuperMandi Supplier                                      │  │
│  │  ───────────────────                                      │  │
│  │  Phone: [_______________]                                 │  │
│  │  OTP:   [_______________]                                 │  │
│  │                                                           │  │
│  │  [LOGIN]                                                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  2. ORDERS LIST (Home)                                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Today's Orders                              [Refresh]    │  │
│  │                                                           │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ PO-MUM01-26-00015          NEW                     │  │  │
│  │  │ Sharma Kirana Store                                │  │  │
│  │  │ 3 items • ₹8,800          [VIEW]                   │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ PO-MUM01-26-00014          CONFIRMED               │  │  │
│  │  │ Patel General Store                                │  │  │
│  │  │ 5 items • ₹12,500         [VIEW]                   │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                                                           │  │
│  │  [Pending] [Confirmed] [Shipped] [Completed]             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  3. ORDER DETAIL                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  PO-MUM01-26-00015                                        │  │
│  │  Sharma Kirana Store                                      │  │
│  │  📍 123 Main Road, Mumbai                                 │  │
│  │  📞 9876543210                                            │  │
│  │                                                           │  │
│  │  ITEMS                                                    │  │
│  │  ─────                                                    │  │
│  │  Rice Basmati 5kg    x20    ₹4,400                       │  │
│  │  Sugar 1kg           x50    ₹2,200                       │  │
│  │  Cooking Oil 1L      x10    ₹2,200                       │  │
│  │                             ──────────                    │  │
│  │  Total:                     ₹8,800                       │  │
│  │                                                           │  │
│  │  [CONFIRM ORDER]                                         │  │
│  │  [MARK SHIPPED]                                          │  │
│  │  [REJECT ORDER]                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  4. QUICK ACTIONS                                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  • Confirm order → Status: confirmed                      │  │
│  │  • Mark shipped → Status: shipped                         │  │
│  │  • Add notes for store                                    │  │
│  │  • Call store directly                                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  APIS USED:                                                     │
│  • POST /auth/login (supplier login)                           │
│  • GET /suppliers/{id}/orders                                  │
│  • POST /suppliers/{id}/orders/{orderId}/confirm               │
│  • POST /suppliers/{id}/orders/{orderId}/ship                  │
│  • POST /suppliers/{id}/orders/{orderId}/reject                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 12.5 Supplier Web Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│              SUPPLIER WEB DASHBOARD                              │
│              (React / Next.js)                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TARGET USERS: Supplier admins, back-office staff               │
│  PRIMARY USE: Catalog management, analytics, staff management   │
│                                                                  │
│  NAVIGATION:                                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  [Dashboard] [Orders] [Catalog] [Stores] [Staff] [Settings]│ │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  1. DASHBOARD                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Today's Summary                                          │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │  │
│  │  │ 12      │ │ 8       │ │ 3       │ │ ₹45,000 │        │  │
│  │  │ New     │ │ Pending │ │ Shipped │ │ Today's │        │  │
│  │  │ Orders  │ │ Confirm │ │ Today   │ │ Revenue │        │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘        │  │
│  │                                                           │  │
│  │  Recent Orders                              [View All]    │  │
│  │  ────────────────────────────────────────────────────────│  │
│  │  PO-MUM01-26-00015  Sharma Kirana   ₹8,800   NEW         │  │
│  │  PO-DEL02-26-00089  Gupta Store     ₹5,500   CONFIRMED   │  │
│  │  ...                                                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  2. CATALOG MANAGEMENT                                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  My Products                    [+ Add Product] [Upload CSV]│ │
│  │                                                           │  │
│  │  🔍 Search products...          [Category ▼] [Status ▼]   │  │
│  │                                                           │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ SKU       Name            Price    Stock   Status  │  │  │
│  │  │ ───       ────            ─────    ─────   ──────  │  │  │
│  │  │ RB-5KG    Rice Basmati    ₹220     500     Active  │  │  │
│  │  │ TD-1KG    Toor Dal        ₹100     200     Active  │  │  │
│  │  │ SG-1KG    Sugar           ₹44      0       Out     │  │  │
│  │  │ CO-1L     Cooking Oil     ₹160     150     Active  │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                                                           │  │
│  │  Bulk Actions: [Update Prices] [Update Stock] [Export]    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  3. LINKED STORES                                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Stores buying from you                                   │  │
│  │                                                           │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ Store              City      Orders  Revenue       │  │  │
│  │  │ ─────              ────      ──────  ───────       │  │  │
│  │  │ Sharma Kirana      Mumbai    45      ₹1,25,000     │  │  │
│  │  │ Patel General      Mumbai    32      ₹89,000       │  │  │
│  │  │ Gupta Store        Delhi     28      ₹76,000       │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                                                           │  │
│  │  Pending Link Requests: 3                    [View]       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  4. STAFF MANAGEMENT (SUPPLIER_ADMIN only)                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Team Members                               [+ Add Staff] │  │
│  │                                                           │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ Name          Role              Status   Actions   │  │  │
│  │  │ ────          ────              ──────   ───────   │  │  │
│  │  │ Rahul Kumar   SUPPLIER_ADMIN    Active   [Edit]    │  │  │
│  │  │ Priya Singh   SUPPLIER_STAFF    Active   [Edit]    │  │  │
│  │  │ Amit Verma    SUPPLIER_STAFF    Active   [Edit]    │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  APIS USED:                                                     │
│  • GET /suppliers/{id}/dashboard/stats                         │
│  • GET /suppliers/{id}/orders                                  │
│  • GET /suppliers/{id}/catalog                                 │
│  • POST /suppliers/{id}/catalog/products                       │
│  • POST /suppliers/{id}/catalog/bulk-upload                    │
│  • GET /suppliers/{id}/stores                                  │
│  • GET /suppliers/{id}/staff                                   │
│  • POST /suppliers/{id}/staff                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 12.6 Retailer Admin Web Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│              RETAILER ADMIN WEB DASHBOARD                        │
│              (React / Next.js)                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TARGET USERS: Store owners, multi-store admins                 │
│  PRIMARY USE: Analytics, inventory reports, staff management    │
│                                                                  │
│  NAVIGATION:                                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  [Dashboard] [Inventory] [Orders] [Suppliers] [Reports] [Staff]│
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  1. DASHBOARD                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Store Performance                                        │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │  │
│  │  │₹1.2L    │ │ 156     │ │ 12      │ │ 5       │        │  │
│  │  │Today's  │ │ Items   │ │ Low     │ │ Pending │        │  │
│  │  │Sales    │ │ in Stock│ │ Stock   │ │ Orders  │        │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘        │  │
│  │                                                           │  │
│  │  Sales Trend (7 days)                                     │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  ▁▂▅▇█▆▄                                            │  │  │
│  │  │  M T W T F S S                                      │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  2. INVENTORY MANAGEMENT                                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Stock Overview                           [Export] [Print]│  │
│  │                                                           │  │
│  │  🔍 Search...   [All] [Low Stock] [Out of Stock]         │  │
│  │                                                           │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ Product         Stock   Min   Target  Value        │  │  │
│  │  │ ───────         ─────   ───   ──────  ─────        │  │  │
│  │  │ Rice Basmati    45      20    50      ₹9,900       │  │  │
│  │  │ Toor Dal        8 ⚠️    10    25      ₹800         │  │  │
│  │  │ Sugar           0 ❌    20    50      ₹0           │  │  │
│  │  │ Cooking Oil     12      15    30      ₹1,920       │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                                                           │  │
│  │  Actions: [Adjust Stock] [Edit Policies] [Stock Take]     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  3. PURCHASE HISTORY                                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Purchase Orders                         [Create Manual PO]│  │
│  │                                                           │  │
│  │  Date Range: [Last 30 days ▼]   Status: [All ▼]          │  │
│  │                                                           │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ PO Number       Supplier      Date      Amount  Status│ │  │
│  │  │ ─────────       ────────      ────      ──────  ──────│ │  │
│  │  │ PO-MUM01-26-15  ABC Traders   12 Jan    ₹8,800  Delivered│ │
│  │  │ PO-MUM01-26-14  XYZ Wholesale 11 Jan    ₹4,500  Shipped │ │  │
│  │  │ PO-MUM01-26-13  ABC Traders   10 Jan    ₹12,000 Delivered│ │
│  │  └────────────────────────────────────────────────────────┘  │
│  │                                                           │  │
│  │  Monthly Spend: ₹45,000   Avg Order: ₹6,500               │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  4. REPORTS                                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Available Reports                                        │  │
│  │                                                           │  │
│  │  • Inventory Valuation Report                             │  │
│  │  • Sales Summary Report                                   │  │
│  │  • Purchase Summary Report                                │  │
│  │  • Stock Movement Report                                  │  │
│  │  • Low Stock Alert Report                                 │  │
│  │  • Supplier Performance Report                            │  │
│  │                                                           │  │
│  │  [Generate Report]                                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  5. STAFF MANAGEMENT (STORE_ADMIN only)                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Store Staff                                [+ Add Staff] │  │
│  │                                                           │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ Name          Role          Status    Last Login   │  │  │
│  │  │ ────          ────          ──────    ──────────   │  │  │
│  │  │ Owner         STORE_ADMIN   Active    Today 9:30   │  │  │
│  │  │ Raju (POS)    STORE_STAFF   Active    Today 8:00   │  │  │
│  │  │ Sita (POS)    STORE_STAFF   Active    Yesterday    │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  APIS USED:                                                     │
│  • GET /stores/{id}/dashboard/stats                            │
│  • GET /stores/{id}/inventory                                  │
│  • POST /stores/{id}/inventory/adjust                          │
│  • GET /stores/{id}/purchase-orders                            │
│  • GET /stores/{id}/reports/{reportType}                       │
│  • GET /stores/{id}/staff                                      │
│  • POST /stores/{id}/staff                                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 12.7 SuperMandi Admin Portal

```
┌─────────────────────────────────────────────────────────────────┐
│              SUPERMANDI ADMIN PORTAL                             │
│              (React / Next.js)                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TARGET USERS: Platform administrators (SUPERADMIN role)        │
│  PRIMARY USE: Platform ops, supplier verification, feature flags│
│                                                                  │
│  NAVIGATION:                                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  [Dashboard] [Stores] [Suppliers] [Feature Flags] [Users] │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  1. PLATFORM DASHBOARD                                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Platform Overview                                        │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │  │
│  │  │ 156     │ │ 42      │ │ 12      │ │ ₹4.5L   │        │  │
│  │  │ Active  │ │ Active  │ │ Pending │ │ Today's │        │  │
│  │  │ Stores  │ │ Suppliers│ │ Verify  │ │ GMV     │        │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘        │  │
│  │                                                           │  │
│  │  Alerts                                                   │  │
│  │  • 3 suppliers pending verification                       │  │
│  │  • 2 duplicate GSTIN merge requests                       │  │
│  │  • 1 store reporting sync issues                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  2. STORES MANAGEMENT                                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  All Stores                              [+ Create Store] │  │
│  │                                                           │  │
│  │  🔍 Search stores...        [City ▼] [Status ▼]          │  │
│  │                                                           │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ Code     Name              City     Status  Actions │  │  │
│  │  │ ────     ────              ────     ──────  ─────── │  │  │
│  │  │ MUM01    Sharma Kirana     Mumbai   Active  [View]  │  │  │
│  │  │ MUM02    Patel General     Mumbai   Active  [View]  │  │  │
│  │  │ DEL01    Gupta Store       Delhi    Active  [View]  │  │  │
│  │  │ DEL02    Singh Mart        Delhi    Inactive[View]  │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                                                           │  │
│  │  Store Detail → View inventory, orders, linked suppliers  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  3. SUPPLIER VERIFICATION (CRITICAL)                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Pending Verification                                     │  │
│  │                                                           │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ GSTIN           Business Name       Requested  Action│  │  │
│  │  │ ─────           ─────────────       ─────────  ──────│  │  │
│  │  │ 27AABCU9603R1ZM Raj Enterprises     12 Jan     [Review]│ │
│  │  │ 29AADCB2230M1ZV Best Wholesale      11 Jan     [Review]│ │
│  │  │ 06AABCT1234M1ZK Global Traders      10 Jan     [Review]│ │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                                                           │  │
│  │  Verification Actions:                                    │  │
│  │  • [Verify] - Mark supplier as verified                  │  │
│  │  • [Reject] - Reject with reason                         │  │
│  │  • [Merge] - Merge with existing supplier (same GSTIN)   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  4. SUPPLIER MERGE (Deduplication)                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Duplicate Detection                                      │  │
│  │                                                           │  │
│  │  GSTIN: 27AABCU9603R1ZM                                   │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ Existing (Verified)        New (Pending)            │  │  │
│  │  │ ────────────────────       ─────────────            │  │  │
│  │  │ Raj Enterprises            Raj Ent. Pvt Ltd         │  │  │
│  │  │ Mumbai, MH                 Mumbai, Maharashtra      │  │  │
│  │  │ 12 linked stores           0 linked stores          │  │  │
│  │  │ 45 orders                  0 orders                 │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                                                           │  │
│  │  [MERGE → Keep Existing] [MERGE → Keep New] [Keep Both]  │  │
│  │                                                           │  │
│  │  RULE: Same GSTIN = Same legal entity = Must merge       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  5. FEATURE FLAGS                                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Feature Management                        [+ New Flag]   │  │
│  │                                                           │  │
│  │  Global Flags                                             │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ Flag                  Status    Actions             │  │  │
│  │  │ ────                  ──────    ───────             │  │  │
│  │  │ reorder_enabled       ON        [Toggle] [Delete]   │  │  │
│  │  │ buy_tab_enabled       ON        [Toggle] [Delete]   │  │  │
│  │  │ grn_enabled           ON        [Toggle] [Delete]   │  │  │
│  │  │ push_notifications    OFF       [Toggle] [Delete]   │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                                                           │  │
│  │  Store-Specific Overrides                                 │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ Store         Flag               Override          │  │  │
│  │  │ ─────         ────               ────────          │  │  │
│  │  │ Sharma Kirana reorder_enabled    OFF (beta issue)  │  │  │
│  │  │ Patel General buy_tab_enabled    ON (early access) │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  APIS USED:                                                     │
│  • GET /admin/platform/stats                                   │
│  • GET /admin/stores                                           │
│  • POST /admin/stores                                          │
│  • GET /admin/suppliers/pending                                │
│  • POST /admin/suppliers/{id}/verify                           │
│  • POST /admin/suppliers/merge                                 │
│  • GET /admin/flags                                            │
│  • POST /admin/flags                                           │
│  • PUT /admin/flags/{id}                                       │
│                                                                  │
│  PERMISSION: All endpoints require SUPERADMIN role              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 12.8 UI Surface Summary

```
┌─────────────────────────────────────────────────────────────────┐
│              UI SURFACES - PRIORITY ORDER                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PRIORITY  SURFACE              USERS           TECH STACK      │
│  ────────  ───────              ─────           ──────────      │
│                                                                  │
│  P0 (MVP)  POS App              Store Staff     React Native    │
│            - SELL Tab           Store Admin     Expo            │
│            - BUY Tab                                            │
│            - REORDER Tab                                        │
│            - GRN Screen                                         │
│                                                                  │
│  P1        Supplier Mobile      Supplier Staff  React Native    │
│            - Orders view        Supplier Admin  Expo            │
│            - Status updates                                     │
│                                                                  │
│  P1        Supplier Web         Supplier Admin  React/Next.js   │
│            - Catalog mgmt                                       │
│            - Analytics                                          │
│            - Staff mgmt                                         │
│                                                                  │
│  P1        Retailer Web         Store Admin     React/Next.js   │
│            - Reports                                            │
│            - Staff mgmt                                         │
│            - Bulk operations                                    │
│                                                                  │
│  P1        SuperMandi Admin     SUPERADMIN      React/Next.js   │
│            - Supplier verify                                    │
│            - Feature flags                                      │
│            - Platform ops                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 13. Build Order & Executable Architecture (V3.0.9)

### 13.1 Repository Layout (MVP-Friendly Monorepo)

```
/backend
├── /services
│   ├── /api-gateway           # Port 3000 - Routing, CORS, Rate-limit
│   ├── /auth-service          # Port 3001 - auth.* schema
│   ├── /platform-service      # Port 3008 - platform.* schema (NEW)
│   ├── /supplier-service      # Port 3002 - supplier.* schema
│   ├── /catalog-service       # Port 3003 - catalog.* schema
│   ├── /inventory-service     # Port 3004 - inventory.* schema
│   ├── /order-service         # Port 3005 - orders.* schema
│   └── /reorder-service       # Port 3006 - reorder.* schema
│
├── /migrations                # Single migration runner, ordered files
│   ├── 000_extensions.sql     # pgcrypto, pg_trgm
│   ├── 001_platform.sql
│   ├── 002_auth.sql
│   ├── 003_supplier.sql
│   ├── 004_catalog.sql
│   ├── 005_inventory.sql
│   ├── 006_orders.sql
│   ├── 007_reorder.sql
│   └── 008_seed_roles.sql
│
├── /packages
│   └── /common                # Shared code (CRITICAL)
│       ├── /errors            # ApiError, error envelope
│       ├── /events            # DomainEvent, outbox worker, event inbox
│       ├── /auth              # JWT verify, RBAC middleware
│       ├── /idempotency       # Idempotency middleware
│       ├── /types             # All TypeScript types/DTOs
│       └── /db                # Pool, transaction, migrate helpers
│
├── docker-compose.yml         # Dev: Postgres + Redis
├── docker-compose.prod.yml    # Production config
├── pnpm-workspace.yaml        # Monorepo workspace config
└── package.json               # Root scripts

/supermandi-pos                # POS Mobile App (React Native / Expo)
/supplier-app                  # Supplier Mobile App (post-MVP)
/supplier-web                  # Supplier Dashboard (post-MVP)
/retailer-web                  # Retailer Admin (post-MVP)
/admin-portal                  # SuperMandi Admin (post-MVP)
```

### 13.2 Docker Compose (MVP)

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: supermandi
      POSTGRES_PASSWORD: supermandi
      POSTGRES_DB: supermandi
    volumes:
      - postgres-data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U supermandi"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    # CRITICAL: AOF persistence for Bull queue durability
    command: redis-server --appendonly yes --appendfsync everysec
    volumes:
      - redis-data:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres-data:
  redis-data:
```

### 13.3 Migration Strategy

```bash
# Single migration runner (recommended)
# Applies schemas in order, all in one database

cd backend
pnpm run migrate:up

# Migration runner script:
# 1. Connect to PostgreSQL
# 2. Create migrations table if not exists
# 3. For each .sql file in /migrations (sorted):
#    - Check if already applied
#    - If not, run within transaction
#    - Record in migrations table
# 4. Seed roles (008_seed_roles.sql)
```

### 13.4 Error Envelope Contract (Enforced Everywhere)

```typescript
// packages/common/errors/ApiError.ts
// ALL services MUST use this - no custom error shapes

interface ApiError {
  code: string;           // "VALIDATION_ERROR", "NOT_FOUND", etc.
  message: string;        // Human-readable message
  details?: string[];     // Array of detail messages
  field?: string;         // Field name for validation errors
  requestId: string;      // Correlation ID for tracing
}

// Example responses:
// 400 Bad Request
{
  "code": "VALIDATION_ERROR",
  "message": "Invalid request body",
  "details": ["quantity must be a positive integer"],
  "field": "quantity",
  "requestId": "req-abc123"
}

// 404 Not Found
{
  "code": "NOT_FOUND",
  "message": "Purchase order not found",
  "requestId": "req-abc123"
}

// 409 Conflict
{
  "code": "IDEMPOTENCY_IN_PROGRESS",
  "message": "Request with this idempotency key is still being processed",
  "requestId": "req-abc123"
}
```

### 13.5 Golden Path Test (Automate Before UI)

```typescript
// backend/tests/golden-path.test.ts
// This test validates the COMPLETE MVP flow end-to-end
// RUN THIS BEFORE BUILDING ANY UI

describe('MVP Golden Path', () => {
  it('should complete full purchase cycle', async () => {
    // 1. CREATE STORE + SUPPLIER + LINK
    const store = await createStore({ code: 'TEST01', name: 'Test Store' });
    const supplier = await createSupplier({ gstin: '27AABCU9603R1ZM', name: 'Test Supplier' });
    await linkSupplierToStore(store.id, supplier.id);

    // Verify: supplier.linked.v1 event published
    // Verify: catalog-service received event (check event_inbox)

    // 2. CREATE PRODUCT + SUPPLIER_PRODUCT + MAPPING
    const product = await createProduct({ name: 'Rice 5kg', primary_barcode: '8901234567890' });
    const supplierProduct = await createSupplierProduct(supplier.id, {
      barcode: '8901234567890',
      name: 'Basmati Rice 5kg',
      purchase_price: 220,
    });
    // Auto-mapping should trigger on barcode match
    const mapping = await getMapping(supplierProduct.id);
    expect(mapping.product_id).toBe(product.id);

    // 3. CREATE PURCHASE ORDER (draft)
    const po = await createPurchaseOrder(store.id, {
      supplierId: supplier.id,
      items: [{ supplierProductId: supplierProduct.id, quantity: 10 }],
    });
    expect(po.status).toBe('draft');

    // 4. SUBMIT PO
    const submitted = await submitPurchaseOrder(store.id, po.id);
    expect(submitted.status).toBe('submitted');
    // Verify: orders.po.status_changed.v1 event

    // 5. RECEIVE GRN (full)
    const grn = await receiveGRN(store.id, po.id, {
      items: [{ itemId: po.items[0].id, receivedQuantity: 10 }],
    });
    expect(grn.status).toBe('delivered');

    // 6. VERIFY: Inventory ledger has +qty entry
    const ledger = await getInventoryLedger(store.id, product.id);
    expect(ledger[0].delta_qty).toBe(10);
    expect(ledger[0].transaction_type).toBe('purchase_received');
    expect(ledger[0].reference_sub_id).toBeDefined(); // receiveId

    // 7. VERIFY: inventory.stock.changed.v1 published
    // Check: inventory-events.catalog queue received job
    // Check: inventory-events.reorder queue received job

    // 8. VERIFY: catalog read-model updated
    const storeProduct = await getStoreProduct(store.id, product.id);
    expect(storeProduct.current_stock).toBe(10);

    // 9. CREATE SALE TRANSACTION
    const sale = await createSaleTransaction(store.id, {
      type: 'sale',
      referenceId: 'sale-001',
      items: [{ productId: product.id, quantity: 3 }],
    });

    // 10. VERIFY: Ledger has -qty entry
    const ledger2 = await getInventoryLedger(store.id, product.id);
    expect(ledger2.find(l => l.transaction_type === 'sale').delta_qty).toBe(-3);

    // 11. VERIFY: Catalog stock reduced
    const storeProduct2 = await getStoreProduct(store.id, product.id);
    expect(storeProduct2.current_stock).toBe(7);

    // 12. SET REORDER POLICY (min=5, target=15)
    await setReorderPolicy(store.id, product.id, { min_stock: 5, target_stock: 15 });

    // 13. CREATE SALE TO TRIGGER REORDER
    await createSaleTransaction(store.id, {
      type: 'sale',
      referenceId: 'sale-002',
      items: [{ productId: product.id, quantity: 3 }], // Now at 4, below min=5
    });

    // 14. VERIFY: reorder-service creates pending reorder
    // (either via event or cron - check reorder_runs table)
    const pending = await getPendingReorders(store.id);
    const reorder = pending.find(r => r.product_id === product.id);
    expect(reorder).toBeDefined();
    expect(reorder.suggested_quantity).toBe(11); // target(15) - current(4)

    console.log('✅ GOLDEN PATH COMPLETE - MVP is REAL');
  });
});
```

### 13.6 Build Order (No Chaos)

```
PHASE 1: Foundation (Week 1-2)
├── DEV-001: Backend Monorepo Setup
├── DEV-002: Shared Library - Types & DTOs
├── DEV-003: Shared Library - Database Utilities
├── DEV-004: Platform Schema Migration
├── DEV-005: Auth Schema Migration
├── DEV-006: Supplier Schema Migration
├── DEV-007: Catalog Schema Migration
└── DEV-008: Inventory, Orders, Reorder Schema

PHASE 2: Core Services (Week 3-4)
├── DEV-009: API Gateway
├── DEV-010-012: Auth Service (CRUD, Login, RBAC)
├── DEV-013: Feature Flags (platform-service)
├── DEV-014-015: Inventory Service (Ledger, Transactions)
└── DEV-016: SELL → Inventory Integration

PHASE 3: Orders + Catalog (Week 5-6)
├── DEV-017: Idempotency Middleware
├── DEV-018-021: Order Service (Create, Status, GRN)
├── DEV-022-023: Supplier Service (Core, Links)
└── DEV-024-026: Catalog Service (Core, Catalog, Mapping)

PHASE 4: Reorder + Events (Week 7-8)
├── DEV-027-028: Event Outbox + Inbox
├── DEV-029: Catalog Stock Consumer
├── DEV-030-032: Reorder Service (Core, Pending, Consumer)
├── DEV-033: Stock Monitor Cron
└── DEV-034: Internal APIs

>>> RUN GOLDEN PATH TEST HERE <<<

PHASE 5: POS Frontend (Week 9-10)
├── DEV-035-039: BUY Screen (Cart, Grid, Modal)
├── DEV-040-042: REORDER Screen (Main, Edit, Settings)
└── DEV-043-044: Order History + GRN Screen

PHASE 6: Polish (Week 11-12)
├── DEV-045: Cart Validation
├── DEV-046: Navigation Update
├── DEV-047: Error Handling
├── DEV-048-049: Tests
└── DEV-050-052: Docker, Observability, Launch
```

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-12 | Initial V1 |
| 2.0 | 2026-01-12 | Microservices + RBAC |
| 2.1 | 2026-01-12 | Addendum: tenancy, idempotency |
| 3.0 | 2026-01-12 | **FINAL**: Merged + hardened for MVP |
| 3.0.1 | 2026-01-12 | Added missing tables, clarified GRN flow, removed features_enabled |
| 3.0.2 | 2026-01-12 | NULL uniqueness fixes, quantity sign rule, sell_price nullable, linked suppliers filter, all 5 roles |
| 3.0.3 | 2026-01-12 | **Ship Blockers**: TIMESTAMPTZ everywhere, stock_balances table, order_sequences table, stock_last_event_at, idempotency 409 conflict, Redis AOF persistence, GRN partial receipts, store.flags.read permission |
| 3.0.4 | 2026-01-12 | **Final QA**: Fixed event matrix (GRN sync), reference_sub_id for partial GRN, ux_pending_reorders_active, MVP indexes, chk_users_actor, ::jsonb casts, pgcrypto/pg_trgm extensions |
| 3.0.5 | 2026-01-12 | **Data Integrity**: Barcode uniqueness, trigram indexes, status CHECK constraints, expires_at default, stock_balances FK, integer API types, event envelope type, corrected Redis durability statement |
| 3.0.6 | 2026-01-12 | **Ship Blockers**: INTEGER quantities end-to-end, bounds CHECK constraints, normalized product_barcodes table, service-to-service auth, deadlock prevention (ordered locking), catalog stock backfill, idempotency status column, ledgerCreatedAt for event ordering, standard error envelope, store_code denormalized, chk_users_identifier, supplier_products barcode index, widened aggregate_id |
| 3.0.7 | 2026-01-12 | **UI Screens & Flows**: Added Section 11 (MVP POS screens: SELL, BUY, REORDER, GRN with wireframes), Catalog ≠ Stock concept, Store onboarding flow, Ledger transaction types. Added Section 12 (Post-MVP UI Surfaces: Supplier Mobile App, Supplier Web Dashboard, Retailer Admin Dashboard, SuperMandi Admin Portal with screen layouts and API mappings) |
| 3.0.8 | 2026-01-12 | **Architecture Clarification**: Section 12 updated to clarify SEPARATE FRONTENDS + COMMON BACKEND architecture. Added repository structure, API access matrix by frontend. 5 frontend codebases (supermandi-pos, supplier-app, supplier-web, retailer-web, admin-portal) all connect to shared backend microservices |
| 3.0.9 | 2026-01-12 | **Critical Fixes + Build Order**: (A) Bull fanout fix - each consumer gets own queue (inventory-events.catalog, inventory-events.reorder), (B) platform-service added to service list (port 3008), (C) Barcode canonical source clarified (product_barcodes is truth, products.primary_barcode is cache), (D) SQL operator precedence bug fixed in chk_order_item_bounds, (E) Missing endpoints added (POST /purchase-orders/{id}/submit, GET /purchase-orders with multi-status filter), (F) Idempotency PROCESSING state + 409 IDEMPOTENCY_IN_PROGRESS response, (G) Section 13 added: Build Order, Repo Layout, Docker Compose, Error Envelope Contract, Golden Path Test |

---

## Related Documents

| Document | Purpose |
|----------|---------|
| [REORDER_DEVELOPMENT_TICKETS_V3.json](REORDER_DEVELOPMENT_TICKETS_V3.json) | **CANONICAL** - 19 MVP tickets |
| [REORDER_QUICK_REFERENCE_V2.md](REORDER_QUICK_REFERENCE_V2.md) | Quick lookup for architecture & APIs |
| [REORDER_DEVELOPMENT_TICKETS_V2_ARCHIVED.json](REORDER_DEVELOPMENT_TICKETS_V2_ARCHIVED.json) | Archived V2 tickets |
