# SuperMandi POS - REORDER & Purchase System
## Comprehensive Development Plan V2.0

**Version**: 2.0.0
**Created**: 2026-01-12
**Status**: Planning Phase
**Revision**: Major revision with microservices, RBAC, event-driven architecture

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Data Models](#3-data-models)
4. [Events & Communication](#4-events--communication)
5. [API Specifications](#5-api-specifications)
6. [Development Tickets](#6-development-tickets)
7. [UI/UX Specifications](#7-uiux-specifications)
8. [Onboarding Workflows](#8-onboarding-workflows)
9. [Infrastructure](#9-infrastructure)
10. [Testing & Rollout](#10-testing--rollout)

---

## 1. Executive Summary

### 1.1 Project Goal

Build a unified REORDER system for SuperMandi ecosystem that enables:
- **Auto-Reorder**: Automatic stock replenishment suggestions (drafts)
- **Manual Purchase**: Browse supplier catalogs and execute orders
- **Supplier Management**: Deduplicated supplier system with GSTIN
- **Multi-surface**: POS, Store Admin Web, Supplier App, Superadmin Portal

### 1.2 Key Stakeholders

| Role | Surface | Responsibility |
|------|---------|----------------|
| Store Staff | POS App | Sell, receive GRN, review reorders |
| Store Admin | Web Dashboard | Link suppliers, set policies, manage catalog |
| Supplier Staff | Supplier App | View orders, dispatch |
| Supplier Admin | Supplier Web | Manage catalog, pricing, staff |
| Superadmin | Admin Portal | Verify suppliers, merge duplicates, feature flags |

### 1.3 Success Metrics

- Reduce stockouts by 80%
- Reduce manual ordering time by 70%
- 95% order accuracy
- < 500ms API response time
- 99.9% event delivery reliability

### 1.4 Surfaces & Authority Model (RBAC + Ownership)

#### 1.4.1 Surfaces (Applications)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SUPERMANDI SURFACES                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STORE SIDE                           SUPPLIER SIDE                          │
│  ───────────                          ─────────────                          │
│                                                                              │
│  ┌─────────────────────┐              ┌─────────────────────┐               │
│  │  Store POS App      │              │  Supplier App       │               │
│  │  (Mobile/Handheld)  │              │  (Mobile)           │               │
│  ├─────────────────────┤              ├─────────────────────┤               │
│  │ • SELL              │              │ • Order Inbox       │               │
│  │ • BUY (browse+cart) │              │ • Dispatch/Ship     │               │
│  │ • REORDER (review)  │              │ • Basic Catalog     │               │
│  │ • GRN Receiving     │              │ • Stock Updates     │               │
│  └─────────────────────┘              └─────────────────────┘               │
│                                                                              │
│  ┌─────────────────────┐              ┌─────────────────────┐               │
│  │  Store Admin Web    │              │  Supplier Web       │               │
│  │  (Dashboard)        │              │  (Dashboard)        │               │
│  ├─────────────────────┤              ├─────────────────────┤               │
│  │ • Supplier Linking  │              │ • Bulk Catalog CSV  │               │
│  │ • Reorder Policies  │              │ • Pricing Mgmt      │               │
│  │ • Mapping Queue     │              │ • Analytics         │               │
│  │ • Store Catalog     │              │ • Staff Accounts    │               │
│  │ • Order History     │              │ • Store Requests    │               │
│  └─────────────────────┘              └─────────────────────┘               │
│                                                                              │
│                         PLATFORM                                             │
│                         ────────                                             │
│                                                                              │
│                    ┌─────────────────────┐                                  │
│                    │  Superadmin Portal  │                                  │
│                    ├─────────────────────┤                                  │
│                    │ • Supplier Verify   │                                  │
│                    │ • Supplier Merge    │                                  │
│                    │ • Feature Flags     │                                  │
│                    │ • Audit Logs        │                                  │
│                    │ • Abuse Control     │                                  │
│                    └─────────────────────┘                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 1.4.2 Roles (RBAC)

| Role | Actor Type | Scope | Description |
|------|------------|-------|-------------|
| `STORE_STAFF` | store | Single store | POS operations, GRN |
| `STORE_ADMIN` | store | Single store | Full store management |
| `SUPPLIER_STAFF` | supplier | Single supplier | Order handling |
| `SUPPLIER_ADMIN` | supplier | Single supplier | Full supplier management |
| `SUPERADMIN` | platform | Global | Platform administration |

#### 1.4.3 Permission Groups

**Store Permissions**
```
store.catalog.read       - View store catalog
store.catalog.write      - Manage store catalog, mapping
store.orders.read        - View purchase orders
store.orders.write       - Create, receive orders
store.inventory.read     - View stock levels
store.inventory.write    - Adjust stock
store.reorder.read       - View reorder suggestions
store.reorder.write      - Approve/dismiss, set policies
store.suppliers.read     - View linked suppliers
store.suppliers.write    - Link/unlink suppliers
```

**Supplier Permissions**
```
supplier.catalog.read    - View own catalog
supplier.catalog.write   - Manage catalog, prices
supplier.orders.read     - View incoming orders
supplier.orders.write    - Confirm, ship orders
supplier.stores.read     - View linked stores
supplier.staff.write     - Manage staff accounts
```

**Platform Permissions**
```
platform.suppliers.read  - View all suppliers
platform.suppliers.write - Verify, merge suppliers
platform.flags.read      - View feature flags
platform.flags.write     - Toggle feature flags
platform.audit.read      - View audit logs
```

#### 1.4.4 Role-Permission Matrix

| Permission | STORE_STAFF | STORE_ADMIN | SUPPLIER_STAFF | SUPPLIER_ADMIN | SUPERADMIN |
|------------|:-----------:|:-----------:|:--------------:|:--------------:|:----------:|
| store.catalog.read | ✓ | ✓ | | | ✓ |
| store.catalog.write | | ✓ | | | ✓ |
| store.orders.read | ✓ | ✓ | | | ✓ |
| store.orders.write | ✓ | ✓ | | | |
| store.inventory.read | ✓ | ✓ | | | ✓ |
| store.inventory.write | ✓ | ✓ | | | |
| store.reorder.read | ✓ | ✓ | | | |
| store.reorder.write | | ✓ | | | |
| store.suppliers.read | ✓ | ✓ | | | |
| store.suppliers.write | | ✓ | | | |
| supplier.catalog.read | | | ✓ | ✓ | ✓ |
| supplier.catalog.write | | | | ✓ | |
| supplier.orders.read | | | ✓ | ✓ | |
| supplier.orders.write | | | ✓ | ✓ | |
| supplier.stores.read | | | ✓ | ✓ | |
| supplier.staff.write | | | | ✓ | |
| platform.suppliers.* | | | | | ✓ |
| platform.flags.* | | | | | ✓ |
| platform.audit.* | | | | | ✓ |

**Critical Rule**: Only SUPERADMIN can verify/merge suppliers globally.

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SUPERMANDI ECOSYSTEM                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CLIENTS                                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │ Store    │ │ Store    │ │ Supplier │ │ Supplier │ │ Super    │          │
│  │ POS App  │ │ Admin    │ │ App      │ │ Web      │ │ Admin    │          │
│  │          │ │ Web      │ │          │ │          │ │ Portal   │          │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘          │
│       │            │            │            │            │                 │
│       └────────────┴────────────┴────────────┴────────────┘                 │
│                                 │                                            │
│                                 ▼                                            │
│                    ┌────────────────────────┐                               │
│                    │     API GATEWAY        │                               │
│                    │ • Routing              │                               │
│                    │ • Auth Verification    │                               │
│                    │ • Rate Limiting        │                               │
│                    │ • Correlation-ID       │                               │
│                    └───────────┬────────────┘                               │
│                                │                                            │
│  ┌─────────────────────────────┼─────────────────────────────┐             │
│  │                             │                              │             │
│  ▼                             ▼                              ▼             │
│                                                                              │
│  MICROSERVICES                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │ auth-service │  │ supplier-    │  │ catalog-     │               │   │
│  │  │              │  │ service      │  │ service      │               │   │
│  │  │ • Users      │  │ • Registry   │  │ • Unified    │               │   │
│  │  │ • Roles/JWT  │  │ • GSTIN      │  │   Products   │               │   │
│  │  │ • Device     │  │   Dedupe     │  │ • Mapping    │               │   │
│  │  │   Tokens     │  │ • Linking    │  │ • Search     │               │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │   │
│  │                                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │ inventory-   │  │ order-       │  │ reorder-     │               │   │
│  │  │ service      │  │ service      │  │ service      │               │   │
│  │  │              │  │              │  │              │               │   │
│  │  │ • Ledger     │  │ • PO CRUD    │  │ • Policies   │               │   │
│  │  │ • Snapshots  │  │ • GRN        │  │ • Drafts     │               │   │
│  │  │ • Stock Calc │  │ • Events     │  │ • Runs       │               │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │   │
│  │                                                                      │   │
│  │  ┌──────────────┐                                                   │   │
│  │  │ notification-│   (Optional - can be external service)            │   │
│  │  │ service      │                                                   │   │
│  │  │ • Push/Email │                                                   │   │
│  │  │ • WhatsApp   │                                                   │   │
│  │  └──────────────┘                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                │                                            │
│                                ▼                                            │
│  DATA LAYER                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  ┌──────────────────────┐    ┌──────────────────────┐               │   │
│  │  │     PostgreSQL       │    │       Redis          │               │   │
│  │  │                      │    │                      │               │   │
│  │  │ • All domain tables  │    │ • Session cache      │               │   │
│  │  │ • Outbox tables      │    │ • Catalog cache      │               │   │
│  │  │ • Audit logs         │    │ • Bull job queues    │               │   │
│  │  └──────────────────────┘    │ • Event bus (pub/sub)│               │   │
│  │                              └──────────────────────┘               │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Microservices Overview

| Service | Port | Responsibility | Key Tables |
|---------|------|----------------|------------|
| `api-gateway` | 3000 | Routing, auth check, rate limits, correlation-id | - |
| `auth-service` | 3001 | Users, roles, JWT, device tokens | users, roles, user_roles, device_tokens |
| `supplier-service` | 3002 | Supplier registry, GSTIN dedupe, store linking | suppliers, supplier_sources, supplier_store_links |
| `catalog-service` | 3003 | Unified products, supplier catalogs, mapping, search | products, supplier_products, supplier_product_map, store_products |
| `inventory-service` | 3004 | Ledger-based stock, snapshots, adjustments | inventory_ledger, inventory_snapshots |
| `order-service` | 3005 | Purchase orders, GRN, order events | purchase_orders, purchase_order_items, order_events |
| `reorder-service` | 3006 | Policies, pending reorders/drafts, reorder runs | reorder_policies, pending_reorders, reorder_runs |
| `notification-service` | 3007 | Push/email/WhatsApp templates & delivery | notification_templates, notification_log |

### 2.3 Communication Patterns

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMMUNICATION PATTERNS                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SYNCHRONOUS (HTTP REST)                                                    │
│  ───────────────────────                                                    │
│  • Client → API Gateway → Service                                           │
│  • Service → Service (when response needed immediately)                     │
│  • Example: catalog-service → inventory-service for stock check             │
│                                                                              │
│  ASYNCHRONOUS (Redis + Bull)                                                │
│  ──────────────────────────                                                 │
│  • Domain events between services                                           │
│  • Background jobs (reorder runs, sync)                                     │
│  • Notifications                                                            │
│                                                                              │
│  EVENT FLOW EXAMPLE: Order Created                                          │
│  ┌──────────────┐                                                           │
│  │ order-service│                                                           │
│  │              │──┬──▶ PO_CREATED event                                    │
│  │ Creates PO   │  │                                                        │
│  │ Writes outbox│  │    ┌───────────────────┐                               │
│  └──────────────┘  ├───▶│ supplier-service  │ (notify supplier)             │
│                    │    └───────────────────┘                               │
│                    │    ┌───────────────────┐                               │
│                    └───▶│notification-service│ (push to store)              │
│                         └───────────────────┘                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| API Gateway | Node.js + Express | Routing, middleware |
| Services | Node.js + Express | Business logic |
| Database | PostgreSQL 15 | Primary data store |
| Cache/Queue | Redis 7 | Caching, Bull queues, pub/sub |
| Job Queue | Bull | Background jobs, event processing |
| Auth | JWT + bcrypt | Token-based authentication |
| Validation | Joi / Zod | Request validation |
| ORM | Prisma / Knex | Database access |

---

## 3. Data Models

### 3.1 Core Entity Relationships

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ENTITY RELATIONSHIP DIAGRAM                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐        │
│  │   PRODUCTS   │◄────────│ SUPPLIER     │────────▶│  SUPPLIERS   │        │
│  │  (Unified)   │         │ PRODUCT_MAP  │         │  (Registry)  │        │
│  └──────┬───────┘         └──────────────┘         └──────┬───────┘        │
│         │                                                  │                │
│         │                                                  │                │
│         ▼                                                  ▼                │
│  ┌──────────────┐                                  ┌──────────────┐        │
│  │ STORE        │         ┌──────────────┐         │ SUPPLIER     │        │
│  │ PRODUCTS     │         │ SUPPLIER     │────────▶│ PRODUCTS     │        │
│  │ (Per store)  │         │ STORE_LINKS  │         │ (Catalog)    │        │
│  └──────┬───────┘         └──────────────┘         └──────────────┘        │
│         │                        │                                          │
│         │                        │                                          │
│         ▼                        ▼                                          │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐        │
│  │ INVENTORY    │         │ REORDER      │────────▶│ PENDING      │        │
│  │ LEDGER       │         │ POLICIES     │         │ REORDERS     │        │
│  │ (Stock)      │         │              │         │ (Drafts)     │        │
│  └──────────────┘         └──────────────┘         └──────┬───────┘        │
│                                                           │                │
│                                                           │ approve        │
│                                                           ▼                │
│                                                    ┌──────────────┐        │
│                                                    │ PURCHASE     │        │
│                                                    │ ORDERS       │        │
│                                                    └──────────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Auth Service Tables

```sql
-- Users table (all actors)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(15) UNIQUE,
    password_hash VARCHAR(255),

    -- Actor type determines which entity they belong to
    actor_type VARCHAR(20) NOT NULL,  -- 'store', 'supplier', 'platform'
    actor_id VARCHAR(50),             -- store_id, supplier_id, or NULL for platform

    name VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'active',  -- 'active', 'inactive', 'suspended'

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Roles table
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,  -- 'STORE_STAFF', 'STORE_ADMIN', etc.
    description TEXT,
    permissions JSONB NOT NULL,  -- Array of permission strings
    created_at TIMESTAMP DEFAULT NOW()
);

-- User-Role mapping
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    role_id UUID REFERENCES roles(id),

    -- Scope for the role assignment
    scope_type VARCHAR(20),  -- 'store', 'supplier', 'platform'
    scope_id VARCHAR(50),    -- specific store_id or supplier_id

    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, role_id, scope_id)
);

-- Device tokens for push notifications
CREATE TABLE device_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    token VARCHAR(500) NOT NULL,
    platform VARCHAR(20),  -- 'ios', 'android', 'web'
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    last_used_at TIMESTAMP
);

-- Seed default roles
INSERT INTO roles (name, description, permissions) VALUES
('STORE_STAFF', 'Store POS operator', '["store.catalog.read", "store.orders.read", "store.orders.write", "store.inventory.read", "store.inventory.write", "store.reorder.read", "store.suppliers.read"]'),
('STORE_ADMIN', 'Store administrator', '["store.catalog.read", "store.catalog.write", "store.orders.read", "store.orders.write", "store.inventory.read", "store.inventory.write", "store.reorder.read", "store.reorder.write", "store.suppliers.read", "store.suppliers.write"]'),
('SUPPLIER_STAFF', 'Supplier operations', '["supplier.catalog.read", "supplier.orders.read", "supplier.orders.write", "supplier.stores.read"]'),
('SUPPLIER_ADMIN', 'Supplier administrator', '["supplier.catalog.read", "supplier.catalog.write", "supplier.orders.read", "supplier.orders.write", "supplier.stores.read", "supplier.staff.write"]'),
('SUPERADMIN', 'Platform administrator', '["platform.suppliers.read", "platform.suppliers.write", "platform.flags.read", "platform.flags.write", "platform.audit.read"]');
```

### 3.3 Supplier Service Tables

```sql
-- Suppliers (Global Registry - deduplicated by GSTIN)
CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gstin VARCHAR(15) UNIQUE NOT NULL,  -- Primary dedup key
    pan VARCHAR(10),

    -- Business Info
    business_name VARCHAR(255) NOT NULL,
    trade_name VARCHAR(255),
    business_type VARCHAR(50),  -- 'wholesaler', 'manufacturer', 'distributor'

    -- Contact
    primary_contact_name VARCHAR(255),
    primary_phone VARCHAR(15),
    primary_email VARCHAR(255),

    -- Address
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(10),

    -- Verification (SUPERADMIN only)
    verification_status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'verified', 'rejected'
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMP,
    verification_notes TEXT,

    -- Rating
    rating DECIMAL(2,1) DEFAULT 0,
    total_orders INTEGER DEFAULT 0,

    -- Status
    status VARCHAR(20) DEFAULT 'active',

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_suppliers_gstin ON suppliers(gstin);
CREATE INDEX idx_suppliers_status ON suppliers(status);
CREATE INDEX idx_suppliers_verification ON suppliers(verification_status);

-- Supplier Sources (tracks who added the supplier)
CREATE TABLE supplier_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES suppliers(id),

    source_type VARCHAR(20) NOT NULL,  -- 'store_request', 'superadmin', 'self_register'
    source_id VARCHAR(50),             -- store_id or admin_id

    added_by_user_id UUID REFERENCES users(id),
    added_at TIMESTAMP DEFAULT NOW(),

    notes TEXT,

    UNIQUE(supplier_id, source_type, source_id)
);

-- Supplier-Store Links (business relationship)
CREATE TABLE supplier_store_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES suppliers(id),
    store_id VARCHAR(50) NOT NULL,

    -- Relationship status
    status VARCHAR(20) DEFAULT 'active',  -- 'pending', 'active', 'inactive'

    -- Pricing & Terms
    price_list_id UUID,
    credit_days INTEGER DEFAULT 0,
    min_order_value DECIMAL(10,2) DEFAULT 0,

    -- Delivery
    expected_delivery_days INTEGER DEFAULT 2,

    -- Priority for reorder (lower = higher priority)
    priority INTEGER DEFAULT 1,
    is_preferred BOOLEAN DEFAULT FALSE,

    -- Audit
    linked_by_user_id UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(supplier_id, store_id)
);

CREATE INDEX idx_supplier_store_links_store ON supplier_store_links(store_id);
CREATE INDEX idx_supplier_store_links_supplier ON supplier_store_links(supplier_id);

-- Supplier Requests (store requests new supplier)
CREATE TABLE supplier_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id VARCHAR(50) NOT NULL,

    -- Requested supplier info
    gstin VARCHAR(15) NOT NULL,
    business_name VARCHAR(255) NOT NULL,
    contact_phone VARCHAR(15),
    contact_email VARCHAR(255),
    notes TEXT,

    -- Status
    status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'approved', 'rejected'

    -- Resolution
    resolved_by UUID REFERENCES users(id),  -- superadmin
    resolved_at TIMESTAMP,
    resolution_notes TEXT,
    created_supplier_id UUID REFERENCES suppliers(id),

    requested_by_user_id UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Supplier Merge Log (audit trail for superadmin merges)
CREATE TABLE supplier_merge_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Which suppliers were merged
    source_supplier_id UUID NOT NULL,  -- The one being merged away
    target_supplier_id UUID REFERENCES suppliers(id),  -- The survivor

    -- Audit
    merged_by UUID REFERENCES users(id),
    merged_at TIMESTAMP DEFAULT NOW(),
    reason TEXT,

    -- Snapshot of source before merge (for audit)
    source_snapshot JSONB
);
```

### 3.4 Catalog Service Tables

```sql
-- Products (Unified Master Catalog)
-- This is the canonical product identity
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    name VARCHAR(255) NOT NULL,
    description TEXT,
    brand VARCHAR(100),
    category VARCHAR(100),
    subcategory VARCHAR(100),

    -- Variants
    unit VARCHAR(50),  -- 'kg', 'piece', 'packet', 'litre'
    pack_size DECIMAL(10,3),  -- 1, 0.5, 10

    -- Barcodes (can have multiple)
    primary_barcode VARCHAR(50),
    alternate_barcodes JSONB DEFAULT '[]',  -- Array of strings

    -- Images
    image_url VARCHAR(500),

    -- HSN for tax
    hsn_code VARCHAR(20),
    default_gst_rate DECIMAL(5,2),

    -- Status
    is_active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_products_barcode ON products(primary_barcode);
CREATE INDEX idx_products_name ON products USING gin(to_tsvector('english', name));
CREATE INDEX idx_products_category ON products(category);

-- Store Products (Store-specific settings)
CREATE TABLE store_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id VARCHAR(50) NOT NULL,
    product_id UUID REFERENCES products(id),

    -- Store-specific pricing
    sell_price DECIMAL(10,2) NOT NULL,
    mrp DECIMAL(10,2),

    -- Display
    display_name VARCHAR(255),  -- Override if different from master
    is_active BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,

    -- Inventory reference (for quick lookup)
    current_stock INTEGER DEFAULT 0,  -- Denormalized, updated by inventory service

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(store_id, product_id)
);

CREATE INDEX idx_store_products_store ON store_products(store_id);
CREATE INDEX idx_store_products_product ON store_products(product_id);

-- Supplier Products (Supplier's catalog with PURCHASE prices)
CREATE TABLE supplier_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES suppliers(id),

    -- Product Identity (supplier's view)
    supplier_sku VARCHAR(100),
    barcode VARCHAR(50),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    brand VARCHAR(100),

    -- Variants
    unit VARCHAR(50),
    pack_size DECIMAL(10,3),

    -- Pricing (THIS IS PURCHASE PRICE FOR STORE)
    mrp DECIMAL(10,2),
    purchase_price DECIMAL(10,2) NOT NULL,  -- RENAMED from selling_price

    -- Stock (supplier's stock)
    stock_quantity INTEGER DEFAULT 0,
    stock_status VARCHAR(20) DEFAULT 'available',

    -- Ordering constraints
    moq INTEGER DEFAULT 1,  -- Minimum Order Quantity
    max_qty INTEGER,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(supplier_id, supplier_sku)
);

CREATE INDEX idx_supplier_products_supplier ON supplier_products(supplier_id);
CREATE INDEX idx_supplier_products_barcode ON supplier_products(barcode);

-- Supplier Product Map (Links supplier products to unified products)
-- THIS IS THE BUYABILITY GATE: Only mapped products can be purchased/reordered
CREATE TABLE supplier_product_map (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    supplier_product_id UUID REFERENCES supplier_products(id),
    product_id UUID REFERENCES products(id),

    -- Mapping metadata
    mapping_type VARCHAR(20) DEFAULT 'auto',  -- 'auto' (barcode match), 'manual'
    confidence DECIMAL(3,2),  -- For auto-mapping: 0.0 to 1.0

    -- Audit
    mapped_by_user_id UUID REFERENCES users(id),  -- NULL for auto
    mapped_at TIMESTAMP DEFAULT NOW(),

    -- Status
    is_verified BOOLEAN DEFAULT FALSE,  -- Store admin verified
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMP,

    UNIQUE(supplier_product_id, product_id)
);

CREATE INDEX idx_supplier_product_map_supplier_product ON supplier_product_map(supplier_product_id);
CREATE INDEX idx_supplier_product_map_product ON supplier_product_map(product_id);

-- Catalog Mapping Log (audit trail for manual mappings)
CREATE TABLE catalog_mapping_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    supplier_product_id UUID REFERENCES supplier_products(id),
    product_id UUID REFERENCES products(id),
    store_id VARCHAR(50),

    action VARCHAR(20),  -- 'map', 'unmap', 'verify', 'reject'

    performed_by UUID REFERENCES users(id),
    performed_at TIMESTAMP DEFAULT NOW(),
    notes TEXT
);

-- Unmatched Products Queue (for store admin to map manually)
CREATE VIEW unmatched_supplier_products AS
SELECT sp.*, s.business_name as supplier_name
FROM supplier_products sp
JOIN suppliers s ON sp.supplier_id = s.id
LEFT JOIN supplier_product_map spm ON sp.id = spm.supplier_product_id
WHERE spm.id IS NULL
  AND sp.is_active = TRUE;
```

### 3.5 Inventory Service Tables

```sql
-- Inventory Ledger (Source of Truth for Stock)
-- Stock = SUM(delta_qty) for a store+product
CREATE TABLE inventory_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id VARCHAR(50) NOT NULL,
    product_id UUID NOT NULL,  -- References products table

    -- Change
    delta_qty INTEGER NOT NULL,  -- Positive for additions, negative for deductions

    -- Transaction info
    transaction_type VARCHAR(30) NOT NULL,
    -- 'sale', 'sale_return', 'purchase_received', 'purchase_return',
    -- 'adjustment_add', 'adjustment_remove', 'opening_stock', 'transfer_in', 'transfer_out'

    -- Reference to source
    reference_type VARCHAR(30),  -- 'sale_id', 'purchase_order_id', 'adjustment_id'
    reference_id VARCHAR(50),

    -- Snapshot at time of transaction (for auditing)
    stock_before INTEGER,
    stock_after INTEGER,

    -- Pricing (for valuation)
    unit_cost DECIMAL(10,2),  -- Cost at which this stock was valued

    -- Audit
    created_by UUID,
    created_at TIMESTAMP DEFAULT NOW(),
    notes TEXT
);

CREATE INDEX idx_inventory_ledger_store_product ON inventory_ledger(store_id, product_id);
CREATE INDEX idx_inventory_ledger_created ON inventory_ledger(created_at);
CREATE INDEX idx_inventory_ledger_type ON inventory_ledger(transaction_type);

-- Inventory Snapshots (periodic snapshots for faster queries)
CREATE TABLE inventory_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id VARCHAR(50) NOT NULL,
    product_id UUID NOT NULL,

    quantity INTEGER NOT NULL,

    -- Snapshot metadata
    snapshot_date DATE NOT NULL,
    snapshot_type VARCHAR(20),  -- 'daily', 'monthly', 'manual'

    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(store_id, product_id, snapshot_date)
);

CREATE INDEX idx_inventory_snapshots_store ON inventory_snapshots(store_id);

-- Helper function to get current stock
CREATE OR REPLACE FUNCTION get_current_stock(p_store_id VARCHAR, p_product_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_stock INTEGER;
BEGIN
    SELECT COALESCE(SUM(delta_qty), 0)
    INTO v_stock
    FROM inventory_ledger
    WHERE store_id = p_store_id
      AND product_id = p_product_id;

    RETURN v_stock;
END;
$$ LANGUAGE plpgsql;
```

### 3.6 Order Service Tables

```sql
-- Purchase Orders
CREATE TABLE purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(50) UNIQUE NOT NULL,

    -- Parties
    store_id VARCHAR(50) NOT NULL,
    supplier_id UUID REFERENCES suppliers(id),

    -- Origin
    order_type VARCHAR(20) NOT NULL,  -- 'manual', 'reorder_draft'
    source_reorder_ids JSONB,  -- Array of pending_reorder IDs if from reorder

    -- Status
    status VARCHAR(30) DEFAULT 'draft',
    -- 'draft', 'submitted', 'confirmed', 'shipped', 'delivered', 'cancelled', 'partial_received'

    -- Amounts
    subtotal DECIMAL(12,2) NOT NULL,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    delivery_charges DECIMAL(10,2) DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(12,2) NOT NULL,

    -- Delivery
    expected_delivery_date DATE,
    actual_delivery_date DATE,
    delivery_address TEXT,

    -- Payment
    payment_status VARCHAR(20) DEFAULT 'pending',
    payment_terms VARCHAR(50),

    -- Notes
    store_notes TEXT,
    supplier_notes TEXT,

    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_purchase_orders_store ON purchase_orders(store_id);
CREATE INDEX idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX idx_purchase_orders_created ON purchase_orders(created_at);

-- Purchase Order Items
CREATE TABLE purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,

    -- Product references
    supplier_product_id UUID REFERENCES supplier_products(id),
    product_id UUID REFERENCES products(id),  -- Unified product

    -- Display (denormalized for history)
    product_name VARCHAR(255) NOT NULL,
    supplier_sku VARCHAR(100),
    barcode VARCHAR(50),

    -- Quantity
    ordered_quantity INTEGER NOT NULL,
    received_quantity INTEGER DEFAULT 0,

    -- Pricing
    unit_price DECIMAL(10,2) NOT NULL,  -- Purchase price at order time
    mrp DECIMAL(10,2),
    tax_rate DECIMAL(5,2) DEFAULT 0,
    discount_percent DECIMAL(5,2) DEFAULT 0,
    line_total DECIMAL(12,2) NOT NULL,

    -- Status
    status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'partial', 'received', 'rejected'

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_purchase_order_items_order ON purchase_order_items(order_id);

-- Order Events (status changes, audit trail)
CREATE TABLE order_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES purchase_orders(id),

    -- Event details
    event_type VARCHAR(50) NOT NULL,  -- 'status_changed', 'item_received', 'note_added'

    -- Status change specifics
    from_status VARCHAR(30),
    to_status VARCHAR(30),

    -- Actor
    actor_type VARCHAR(20),  -- 'store_user', 'supplier_user', 'system'
    actor_id UUID,
    actor_name VARCHAR(255),

    -- Details
    details JSONB,
    notes TEXT,

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_order_events_order ON order_events(order_id);
CREATE INDEX idx_order_events_created ON order_events(created_at);
```

### 3.7 Reorder Service Tables

```sql
-- Reorder Policies (per store-product)
-- REPLACES the split auto_reorder_enabled fields
CREATE TABLE reorder_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id VARCHAR(50) NOT NULL,
    product_id UUID REFERENCES products(id),

    -- Thresholds
    min_stock INTEGER NOT NULL,      -- Trigger reorder when stock <= this
    target_stock INTEGER NOT NULL,   -- Order enough to reach this level

    -- Supplier preference
    preferred_supplier_id UUID REFERENCES suppliers(id),

    -- Auto-order settings
    is_enabled BOOLEAN DEFAULT TRUE,

    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(store_id, product_id)
);

CREATE INDEX idx_reorder_policies_store ON reorder_policies(store_id);
CREATE INDEX idx_reorder_policies_product ON reorder_policies(product_id);

-- Store Reorder Settings (global store settings)
CREATE TABLE store_reorder_settings (
    store_id VARCHAR(50) PRIMARY KEY,

    -- Master switch
    reorder_enabled BOOLEAN DEFAULT TRUE,

    -- Approval workflow
    require_approval BOOLEAN DEFAULT TRUE,  -- If false, drafts auto-submit

    -- Notification preferences
    notify_on_low_stock BOOLEAN DEFAULT TRUE,
    notify_on_draft_created BOOLEAN DEFAULT TRUE,

    updated_at TIMESTAMP DEFAULT NOW()
);

-- Pending Reorders (Auto-generated drafts)
CREATE TABLE pending_reorders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id VARCHAR(50) NOT NULL,

    -- Product
    product_id UUID REFERENCES products(id),
    product_name VARCHAR(255) NOT NULL,
    barcode VARCHAR(50),

    -- Stock Info (snapshot at creation)
    current_stock INTEGER NOT NULL,
    min_threshold INTEGER NOT NULL,
    target_stock INTEGER NOT NULL,
    suggested_quantity INTEGER NOT NULL,  -- target_stock - current_stock

    -- Suggested Supplier (from policy or best match)
    suggested_supplier_id UUID REFERENCES suppliers(id),
    suggested_supplier_name VARCHAR(255),
    suggested_unit_price DECIMAL(10,2),
    suggested_line_total DECIMAL(12,2),

    -- Linked supplier product for ordering
    supplier_product_id UUID REFERENCES supplier_products(id),

    -- Status
    status VARCHAR(20) DEFAULT 'pending',
    -- 'pending', 'approved', 'converted_to_draft', 'dismissed', 'expired'

    -- Resolution
    dismissed_reason TEXT,
    purchase_order_id UUID REFERENCES purchase_orders(id),  -- If converted to order

    -- Audit
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP  -- Auto-dismiss after X days
);

CREATE INDEX idx_pending_reorders_store ON pending_reorders(store_id);
CREATE INDEX idx_pending_reorders_status ON pending_reorders(status);
CREATE INDEX idx_pending_reorders_product ON pending_reorders(product_id);

-- Reorder Runs (audit of automatic reorder checks)
CREATE TABLE reorder_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Run metadata
    run_type VARCHAR(20),  -- 'scheduled', 'manual', 'event_triggered'
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,

    -- Stats
    stores_processed INTEGER DEFAULT 0,
    products_checked INTEGER DEFAULT 0,
    drafts_created INTEGER DEFAULT 0,
    errors INTEGER DEFAULT 0,

    -- Error details
    error_log JSONB,

    status VARCHAR(20) DEFAULT 'running'  -- 'running', 'completed', 'failed'
);
```

### 3.8 Event Outbox Table (All Services)

```sql
-- Outbox table (exists in each service's schema)
-- Used for reliable event publishing
CREATE TABLE event_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Event metadata
    event_type VARCHAR(100) NOT NULL,
    aggregate_type VARCHAR(50) NOT NULL,  -- 'purchase_order', 'inventory', etc.
    aggregate_id VARCHAR(50) NOT NULL,

    -- Payload
    payload JSONB NOT NULL,

    -- Publishing status
    status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'published', 'failed'
    retry_count INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    published_at TIMESTAMP,

    -- Correlation
    correlation_id VARCHAR(50)
);

CREATE INDEX idx_event_outbox_status ON event_outbox(status);
CREATE INDEX idx_event_outbox_created ON event_outbox(created_at);
```

---

## 4. Events & Communication

### 4.1 Domain Events

| Event | Publisher | Consumers | Description |
|-------|-----------|-----------|-------------|
| `PO_CREATED` | order-service | supplier-service, notification-service | New purchase order created |
| `PO_STATUS_CHANGED` | order-service | notification-service, (POS via push) | Order status updated |
| `PO_RECEIVED` | order-service | inventory-service | GRN completed, update stock |
| `INVENTORY_CHANGED` | inventory-service | reorder-service, catalog-service | Stock level changed |
| `SUPPLIER_CATALOG_UPDATED` | catalog-service | reorder-service | Supplier updated their catalog |
| `REORDER_DRAFT_CREATED` | reorder-service | notification-service | New reorder suggestion |
| `SUPPLIER_LINKED_TO_STORE` | supplier-service | catalog-service | New supplier linked, sync catalog |
| `SUPPLIER_VERIFIED` | supplier-service | notification-service | Superadmin verified supplier |
| `SUPPLIER_MERGED` | supplier-service | all services | Suppliers merged, update references |

### 4.2 Event Schema

```typescript
// Base event structure
interface DomainEvent {
  eventId: string;          // UUID
  eventType: string;        // e.g., 'PO_CREATED'
  aggregateType: string;    // e.g., 'purchase_order'
  aggregateId: string;      // e.g., order ID
  timestamp: string;        // ISO 8601
  correlationId: string;    // For tracing
  version: number;          // Event schema version
  payload: object;          // Event-specific data
}

// Example: PO_CREATED event
interface POCreatedEvent extends DomainEvent {
  eventType: 'PO_CREATED';
  aggregateType: 'purchase_order';
  payload: {
    orderId: string;
    orderNumber: string;
    storeId: string;
    supplierId: string;
    totalAmount: number;
    itemCount: number;
    orderType: 'manual' | 'reorder_draft';
  };
}

// Example: INVENTORY_CHANGED event
interface InventoryChangedEvent extends DomainEvent {
  eventType: 'INVENTORY_CHANGED';
  aggregateType: 'inventory';
  payload: {
    storeId: string;
    productId: string;
    previousStock: number;
    newStock: number;
    changeType: string;  // 'sale', 'purchase_received', etc.
    referenceId: string;
  };
}

// Example: PO_RECEIVED event
interface POReceivedEvent extends DomainEvent {
  eventType: 'PO_RECEIVED';
  aggregateType: 'purchase_order';
  payload: {
    orderId: string;
    storeId: string;
    items: Array<{
      productId: string;
      receivedQuantity: number;
      unitCost: number;
    }>;
  };
}
```

### 4.3 Outbox Pattern Implementation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         OUTBOX PATTERN FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SERVICE                               OUTBOX WORKER                         │
│  ┌──────────────────────┐             ┌──────────────────────┐              │
│  │                      │             │                      │              │
│  │  1. Business Logic   │             │  3. Poll outbox      │              │
│  │     (create order)   │             │     table            │              │
│  │          │           │             │          │           │              │
│  │          ▼           │             │          ▼           │              │
│  │  2. Write to DB      │             │  4. Publish to       │              │
│  │     (same txn):      │             │     Redis/Bull       │              │
│  │     - order table    │             │          │           │              │
│  │     - outbox table   │             │          ▼           │              │
│  │                      │             │  5. Mark as          │              │
│  └──────────────────────┘             │     published        │              │
│                                       │                      │              │
│                                       └──────────────────────┘              │
│                                                  │                          │
│                                                  ▼                          │
│                                       ┌──────────────────────┐              │
│                                       │     REDIS/BULL       │              │
│                                       │     Event Queue      │              │
│                                       └──────────┬───────────┘              │
│                                                  │                          │
│                    ┌─────────────────────────────┼─────────────────┐        │
│                    │                             │                 │        │
│                    ▼                             ▼                 ▼        │
│           ┌──────────────┐             ┌──────────────┐   ┌──────────────┐ │
│           │ inventory-   │             │ notification-│   │ reorder-     │ │
│           │ service      │             │ service      │   │ service      │ │
│           └──────────────┘             └──────────────┘   └──────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

BENEFITS:
✓ Atomicity: Event written in same transaction as business data
✓ Reliability: Events survive service crashes
✓ Retry: Failed publishes can be retried
✓ Ordering: Events processed in order per aggregate
```

### 4.4 Event Flow Examples

**Flow 1: Manual Purchase Order**
```
1. Store staff creates order in BUY tab
2. order-service creates PO + writes PO_CREATED to outbox
3. Outbox worker publishes PO_CREATED to Redis
4. supplier-service receives → updates supplier dashboard
5. notification-service receives → sends push to supplier
6. Supplier confirms order (PO_STATUS_CHANGED)
7. Supplier ships (PO_STATUS_CHANGED)
8. Store receives (PO_RECEIVED)
9. inventory-service receives PO_RECEIVED → creates ledger entries
10. inventory-service publishes INVENTORY_CHANGED
11. reorder-service receives → updates pending reorders if any
```

**Flow 2: Auto-Reorder**
```
1. inventory-service publishes INVENTORY_CHANGED (after sale)
2. reorder-service receives event
3. Checks if stock < min_threshold for any policy
4. If yes, creates pending_reorder (draft)
5. Publishes REORDER_DRAFT_CREATED
6. notification-service sends push to store admin
7. Store admin approves in REORDER tab
8. reorder-service creates draft PO in order-service
9. Store admin reviews in BUY tab, submits
10. (continues as Flow 1 from step 3)
```

---

## 5. API Specifications

### 5.1 API Gateway

All requests go through the gateway which:
- Validates JWT
- Adds correlation-id header
- Routes to appropriate service
- Rate limits by client

```
Request Headers (added by gateway):
X-Correlation-Id: uuid
X-Actor-Type: store | supplier | platform
X-Actor-Id: store_id | supplier_id | null
X-User-Id: uuid
X-Permissions: ["permission1", "permission2", ...]
```

### 5.2 Auth Service APIs

```yaml
# Login
POST /api/v1/auth/login
Request:
  email: string
  password: string
  deviceToken?: string  # For push notifications
Response:
  accessToken: string
  refreshToken: string
  user:
    id: string
    name: string
    actorType: string
    actorId: string
    role: string
    permissions: string[]

# Refresh Token
POST /api/v1/auth/refresh
Request:
  refreshToken: string
Response:
  accessToken: string
  refreshToken: string

# Get Current User
GET /api/v1/auth/me
Response:
  user: {...}
  permissions: string[]

# Device Token (for push)
POST /api/v1/auth/device-token
Request:
  token: string
  platform: 'ios' | 'android' | 'web'

# Role Assignment (SUPERADMIN only)
POST /api/v1/auth/users/{userId}/roles
Request:
  roleId: string
  scopeType: string
  scopeId: string
```

### 5.3 Supplier Service APIs

```yaml
# === STORE OPERATIONS ===

# List Linked Suppliers (for store)
GET /api/v1/stores/{storeId}/suppliers
Permission: store.suppliers.read
Response:
  suppliers:
    - id: string
      businessName: string
      gstin: string
      verified: boolean
      rating: number
      isPreferred: boolean
      priority: number
      expectedDeliveryDays: number
      minOrderValue: number
      status: string

# Link Existing Supplier
POST /api/v1/stores/{storeId}/suppliers/link
Permission: store.suppliers.write
Request:
  supplierId: string
  priority?: number
  isPreferred?: boolean
Response:
  linkId: string
  status: 'active'

# Request New Supplier (if not in system)
POST /api/v1/stores/{storeId}/suppliers/request
Permission: store.suppliers.write
Request:
  gstin: string
  businessName: string
  contactPhone?: string
  contactEmail?: string
  notes?: string
Response:
  requestId: string
  status: 'pending'

# Update Supplier Link Settings
PUT /api/v1/stores/{storeId}/suppliers/{supplierId}
Permission: store.suppliers.write
Request:
  priority?: number
  isPreferred?: boolean
  minOrderValue?: number

# Unlink Supplier
DELETE /api/v1/stores/{storeId}/suppliers/{supplierId}/unlink
Permission: store.suppliers.write

# === GLOBAL OPERATIONS ===

# Search Suppliers (global, for linking)
GET /api/v1/suppliers/search
Permission: store.suppliers.read
Query:
  gstin?: string
  name?: string
Response:
  suppliers:
    - id: string
      businessName: string
      gstin: string
      verified: boolean
      rating: number

# === SUPERADMIN OPERATIONS ===

# List Pending Supplier Requests
GET /api/v1/admin/supplier-requests
Permission: platform.suppliers.read
Query:
  status: 'pending' | 'approved' | 'rejected'
Response:
  requests: [...]

# Approve Supplier Request
POST /api/v1/admin/supplier-requests/{requestId}/approve
Permission: platform.suppliers.write
Request:
  notes?: string
Response:
  supplierId: string

# Verify Supplier
POST /api/v1/admin/suppliers/{supplierId}/verify
Permission: platform.suppliers.write
Request:
  notes?: string

# Merge Suppliers
POST /api/v1/admin/suppliers/merge
Permission: platform.suppliers.write
Request:
  sourceSupplierIds: string[]  # These get merged into target
  targetSupplierId: string
  reason: string
Response:
  mergedSupplierId: string
  affectedStoreLinks: number
  affectedOrders: number
```

### 5.4 Catalog Service APIs

```yaml
# === UNIFIED CATALOG (for BUY) ===

# Browse Unified Catalog
GET /api/v1/stores/{storeId}/catalog
Permission: store.catalog.read
Query:
  search?: string
  category?: string
  supplierId?: string  # Filter by supplier
  inStock?: boolean
  page?: number
  limit?: number
Response:
  products:
    - id: string  # unified product ID
      name: string
      barcode: string
      category: string
      brand: string
      unit: string
      packSize: number
      bestPrice: number  # Lowest purchase price across suppliers
      mrp: number
      stockStatus: 'available' | 'low' | 'out_of_stock'
      supplierCount: number
  pagination:
    page: number
    limit: number
    total: number

# Get Product with Suppliers
GET /api/v1/stores/{storeId}/catalog/{productId}/suppliers
Permission: store.catalog.read
Response:
  product:
    id: string
    name: string
    barcode: string
    ...
  suppliers:
    - supplierId: string
      supplierName: string
      supplierProductId: string
      purchasePrice: number
      mrp: number
      stock: number
      stockStatus: string
      moq: number
      isPreferred: boolean
      deliveryDays: number

# Sync Catalog (trigger background sync)
POST /api/v1/stores/{storeId}/catalog/sync
Permission: store.catalog.write
Response:
  syncId: string
  status: 'started'

# === MAPPING (Store Admin) ===

# Get Unmatched Products Queue
GET /api/v1/stores/{storeId}/catalog/unmatched
Permission: store.catalog.write
Query:
  supplierId?: string
Response:
  unmatchedProducts:
    - supplierProductId: string
      supplierName: string
      name: string
      barcode: string
      purchasePrice: number
      suggestedMatches:
        - productId: string
          name: string
          confidence: number

# Map Supplier Product to Unified Product
POST /api/v1/stores/{storeId}/catalog/map
Permission: store.catalog.write
Request:
  supplierProductId: string
  productId: string
  notes?: string

# Create New Product (if no match)
POST /api/v1/stores/{storeId}/catalog/products
Permission: store.catalog.write
Request:
  name: string
  barcode: string
  category: string
  brand?: string
  unit: string
  packSize: number
  supplierProductId?: string  # Auto-map if provided

# === SUPPLIER CATALOG MANAGEMENT ===

# Get Supplier's Catalog
GET /api/v1/suppliers/{supplierId}/catalog
Permission: supplier.catalog.read
Response:
  products: [...]

# Add Product to Catalog
POST /api/v1/suppliers/{supplierId}/catalog
Permission: supplier.catalog.write
Request:
  supplierSku: string
  barcode: string
  name: string
  purchasePrice: number
  mrp?: number
  stockQuantity: number
  moq?: number

# Update Product
PUT /api/v1/suppliers/{supplierId}/catalog/{productId}
Permission: supplier.catalog.write
Request:
  purchasePrice?: number
  stockQuantity?: number
  isActive?: boolean

# Bulk Upload (CSV)
POST /api/v1/suppliers/{supplierId}/catalog/bulk
Permission: supplier.catalog.write
Request:
  file: CSV file
Response:
  imported: number
  failed: number
  errors: [...]
```

### 5.5 Inventory Service APIs

```yaml
# Get Stock Levels
GET /api/v1/stores/{storeId}/inventory
Permission: store.inventory.read
Query:
  productIds?: string[]
  belowThreshold?: boolean
Response:
  inventory:
    - productId: string
      productName: string
      currentStock: number
      minThreshold?: number  # From reorder policy
      lastUpdated: string

# Get Stock for Single Product
GET /api/v1/stores/{storeId}/inventory/{productId}
Permission: store.inventory.read
Response:
  productId: string
  currentStock: number
  ledgerEntries:  # Recent entries
    - id: string
      deltaQty: number
      transactionType: string
      referenceId: string
      createdAt: string

# Manual Stock Adjustment
POST /api/v1/stores/{storeId}/inventory/adjust
Permission: store.inventory.write
Request:
  productId: string
  adjustmentQty: number  # Positive or negative
  reason: 'damage' | 'theft' | 'count_correction' | 'expiry' | 'other'
  notes?: string
Response:
  newStock: number

# Get Ledger History
GET /api/v1/stores/{storeId}/inventory/{productId}/ledger
Permission: store.inventory.read
Query:
  fromDate?: string
  toDate?: string
  page?: number
Response:
  entries: [...]
```

### 5.6 Order Service APIs

```yaml
# === PURCHASE ORDERS ===

# Create Order (from cart)
POST /api/v1/stores/{storeId}/purchase-orders
Permission: store.orders.write
Request:
  supplierId: string
  items:
    - supplierProductId: string
      quantity: number
  notes?: string
  deliveryAddress?: string
Response:
  orderId: string
  orderNumber: string
  status: 'draft'
  totalAmount: number

# Create Orders from Approved Reorders
POST /api/v1/stores/{storeId}/purchase-orders/from-reorders
Permission: store.orders.write
Request:
  pendingReorderIds: string[]
Response:
  orders:
    - orderId: string
      orderNumber: string
      supplierId: string
      supplierName: string
      itemCount: number
      totalAmount: number

# List Orders
GET /api/v1/stores/{storeId}/purchase-orders
Permission: store.orders.read
Query:
  status?: string
  supplierId?: string
  fromDate?: string
  toDate?: string
  page?: number
Response:
  orders: [...]
  pagination: {...}

# Get Order Detail
GET /api/v1/stores/{storeId}/purchase-orders/{orderId}
Permission: store.orders.read
Response:
  order:
    id: string
    orderNumber: string
    status: string
    supplier: {...}
    items: [...]
    totals: {...}
    events: [...]  # Status history

# Submit Order (send to supplier)
POST /api/v1/stores/{storeId}/purchase-orders/{orderId}/submit
Permission: store.orders.write
Response:
  status: 'submitted'

# Cancel Order
POST /api/v1/stores/{storeId}/purchase-orders/{orderId}/cancel
Permission: store.orders.write
Request:
  reason: string

# Receive Order (GRN)
POST /api/v1/stores/{storeId}/purchase-orders/{orderId}/receive
Permission: store.orders.write
Request:
  items:
    - itemId: string
      receivedQuantity: number
      status: 'received' | 'partial' | 'rejected'
      notes?: string
Response:
  status: 'delivered' | 'partial_received'
  inventoryUpdated: boolean

# === SUPPLIER ORDER OPERATIONS ===

# List Incoming Orders (for supplier)
GET /api/v1/suppliers/{supplierId}/orders
Permission: supplier.orders.read
Query:
  status?: string
Response:
  orders: [...]

# Confirm Order
POST /api/v1/suppliers/{supplierId}/orders/{orderId}/confirm
Permission: supplier.orders.write
Request:
  expectedDeliveryDate?: string
  notes?: string

# Ship Order
POST /api/v1/suppliers/{supplierId}/orders/{orderId}/ship
Permission: supplier.orders.write
Request:
  trackingNumber?: string
  notes?: string
```

### 5.7 Reorder Service APIs

```yaml
# === REORDER POLICIES ===

# Get Store Reorder Settings
GET /api/v1/stores/{storeId}/reorder/settings
Permission: store.reorder.read
Response:
  reorderEnabled: boolean
  requireApproval: boolean
  notifyOnLowStock: boolean
  notifyOnDraftCreated: boolean

# Update Store Reorder Settings
PUT /api/v1/stores/{storeId}/reorder/settings
Permission: store.reorder.write
Request:
  reorderEnabled?: boolean
  requireApproval?: boolean

# Get Reorder Policies
GET /api/v1/stores/{storeId}/reorder/policies
Permission: store.reorder.read
Response:
  policies:
    - id: string
      productId: string
      productName: string
      minStock: number
      targetStock: number
      preferredSupplierId: string
      preferredSupplierName: string
      isEnabled: boolean
      currentStock: number  # Joined from inventory

# Set Reorder Policy
PUT /api/v1/stores/{storeId}/reorder/policies/{productId}
Permission: store.reorder.write
Request:
  minStock: number
  targetStock: number
  preferredSupplierId?: string
  isEnabled?: boolean

# Bulk Set Policies
PUT /api/v1/stores/{storeId}/reorder/policies/bulk
Permission: store.reorder.write
Request:
  policies:
    - productId: string
      minStock: number
      targetStock: number
      preferredSupplierId?: string
      isEnabled?: boolean

# === PENDING REORDERS (DRAFTS) ===

# Get Pending Reorders
GET /api/v1/stores/{storeId}/reorder/pending
Permission: store.reorder.read
Response:
  pendingCount: number
  totalSuggestedValue: number
  items:
    - id: string
      productId: string
      productName: string
      barcode: string
      currentStock: number
      minThreshold: number
      targetStock: number
      suggestedQuantity: number
      suggestedSupplier:
        id: string
        name: string
      suggestedUnitPrice: number
      suggestedLineTotal: number
      createdAt: string

# Approve Pending Reorders (creates draft POs)
POST /api/v1/stores/{storeId}/reorder/pending/approve
Permission: store.reorder.write
Request:
  reorderIds: string[]
  modifications?:  # Optional overrides
    - reorderId: string
      quantity?: number
      supplierId?: string
Response:
  draftOrders:  # Grouped by supplier
    - orderId: string
      orderNumber: string
      supplierId: string
      supplierName: string
      itemCount: number
      totalAmount: number
      status: 'draft'  # Ready for review in BUY

# Dismiss Pending Reorder
POST /api/v1/stores/{storeId}/reorder/pending/{reorderId}/dismiss
Permission: store.reorder.write
Request:
  reason: string

# Dismiss All Pending Reorders
POST /api/v1/stores/{storeId}/reorder/pending/dismiss-all
Permission: store.reorder.write
Request:
  reason: string

# Manual Trigger Reorder Check
POST /api/v1/stores/{storeId}/reorder/run
Permission: store.reorder.write
Response:
  runId: string
  newDraftsCreated: number
```

---

## 6. Development Tickets

### 6.1 Sprint Overview

| Sprint | Focus | Duration | Key Deliverables |
|--------|-------|----------|------------------|
| 1-2 | Foundation + Auth | 2 weeks | DB, Auth Service, RBAC |
| 3-4 | Core Services | 2 weeks | Supplier, Catalog, Inventory services |
| 5-6 | Order + Reorder | 2 weeks | Order service, Reorder service, Events |
| 7-8 | POS App UI | 2 weeks | BUY tab, REORDER tab, Modals |
| 9-10 | Admin Surfaces | 2 weeks | Store Admin Web, Supplier App basics |
| 11-12 | Superadmin + Polish | 2 weeks | Superadmin Portal, Notifications, Testing |

### 6.2 P0 Tickets (Critical Path)

#### TICKET-001: Database Schema Setup
**Type**: Backend | **Priority**: P0 | **Estimate**: 3 days | **Sprint**: 1

**Description**: Create all database tables across services.

**Acceptance Criteria**:
- [ ] Auth tables (users, roles, user_roles, device_tokens)
- [ ] Supplier tables (suppliers, supplier_sources, supplier_store_links, supplier_requests)
- [ ] Catalog tables (products, store_products, supplier_products, supplier_product_map)
- [ ] Inventory tables (inventory_ledger, inventory_snapshots)
- [ ] Order tables (purchase_orders, purchase_order_items, order_events)
- [ ] Reorder tables (reorder_policies, store_reorder_settings, pending_reorders)
- [ ] Outbox table template
- [ ] All indexes created
- [ ] Migration scripts with up/down

---

#### TICKET-020: Auth Service + RBAC Middleware
**Type**: Backend | **Priority**: P0 | **Estimate**: 5 days | **Sprint**: 1-2

**Description**: Implement authentication service with role-based access control.

**Acceptance Criteria**:
- [ ] User registration/login endpoints
- [ ] JWT generation with claims (actorType, actorId, permissions)
- [ ] Refresh token flow
- [ ] Device token management
- [ ] RBAC middleware for permission checking
- [ ] Default roles seeded
- [ ] Password reset flow

**Technical Details**:
```typescript
// JWT payload structure
interface JWTPayload {
  sub: string;        // user_id
  actorType: 'store' | 'supplier' | 'platform';
  actorId: string;    // store_id or supplier_id
  permissions: string[];
  iat: number;
  exp: number;
}

// RBAC middleware
const requirePermission = (permission: string) => {
  return (req, res, next) => {
    if (!req.user.permissions.includes(permission)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
};
```

---

#### TICKET-002: Supplier Service - Core APIs
**Type**: Backend | **Priority**: P0 | **Estimate**: 5 days | **Sprint**: 3

**Description**: Implement supplier registry with GSTIN deduplication.

**Acceptance Criteria**:
- [ ] GSTIN validation (regex + checksum)
- [ ] Supplier search (global)
- [ ] Link supplier to store
- [ ] Request new supplier flow
- [ ] Update/unlink supplier
- [ ] GSTIN dedup on create

---

#### TICKET-003: Catalog Service - Core APIs
**Type**: Backend | **Priority**: P0 | **Estimate**: 5 days | **Sprint**: 3

**Description**: Implement unified catalog with supplier mapping.

**Acceptance Criteria**:
- [ ] Unified catalog query with best prices
- [ ] Product detail with all suppliers
- [ ] Auto-mapping by barcode
- [ ] Manual mapping endpoints
- [ ] Unmatched queue view
- [ ] Redis caching (5 min TTL)
- [ ] Full-text search

---

#### TICKET-021: Inventory Ledger Service
**Type**: Backend | **Priority**: P0 | **Estimate**: 5 days | **Sprint**: 4

**Description**: Implement ledger-based inventory with stock computation.

**Acceptance Criteria**:
- [ ] Ledger entry creation
- [ ] Stock computation (SUM of deltas)
- [ ] Manual adjustment endpoint
- [ ] Stock snapshot generation
- [ ] Integration with order service (GRN → ledger)
- [ ] Publish INVENTORY_CHANGED events

---

#### TICKET-010: Purchase Order Service
**Type**: Backend | **Priority**: P0 | **Estimate**: 5 days | **Sprint**: 5

**Description**: Implement purchase order management.

**Acceptance Criteria**:
- [ ] Create PO from cart
- [ ] Create PO from reorder drafts
- [ ] Status transitions with validation
- [ ] GRN receiving
- [ ] Order events logging
- [ ] Publish PO_CREATED, PO_STATUS_CHANGED, PO_RECEIVED events

---

#### TICKET-022: Supplier Product Mapping (Auto + Manual)
**Type**: Backend + Frontend | **Priority**: P0 | **Estimate**: 5 days | **Sprint**: 5

**Description**: Implement auto-mapping by barcode and manual mapping queue.

**Acceptance Criteria**:
- [ ] Auto-map on supplier product create (barcode match)
- [ ] Confidence scoring for auto-matches
- [ ] Unmatched queue API
- [ ] Manual map/unmap endpoints
- [ ] Store Admin UI for mapping queue
- [ ] Mapping audit log

---

#### TICKET-023: Reorder Policies + Draft PO Flow
**Type**: Backend | **Priority**: P0 | **Estimate**: 5 days | **Sprint**: 6

**Description**: Implement reorder policy management and draft generation.

**Acceptance Criteria**:
- [ ] Policy CRUD endpoints
- [ ] Store reorder settings
- [ ] Pending reorder generation (triggered by INVENTORY_CHANGED)
- [ ] Approve → create draft POs (grouped by supplier)
- [ ] "Review in BUY" deep link generation
- [ ] Dismiss with reason

---

#### TICKET-005: REORDER Screen - Main UI
**Type**: Frontend | **Priority**: P0 | **Estimate**: 5 days | **Sprint**: 7

**Description**: Build REORDER tab in POS app.

**UI Layout**:
```
┌─────────────────────────────────────────┐
│ REORDER                         [⚙️]    │
├─────────────────────────────────────────┤
│                                          │
│ ┌─────────────────────────────────────┐ │
│ │ Reorder: ON                  [Toggle]│ │
│ │ Require approval: YES               │ │
│ └─────────────────────────────────────┘ │
│                                          │
│ 🔔 NEEDS RESTOCK (3)          [Select All]│
│ ┌─────────────────────────────────────┐ │
│ │ [☑️] Atta 10kg                      │ │
│ │     Stock: 2 | Min: 10 | Order: 20  │ │
│ │     ABC Traders × ₹450 = ₹9,000     │ │
│ │                    [Edit] [Dismiss] │ │
│ └─────────────────────────────────────┘ │
│                                          │
│ ┌───────────────────────────────────────┐│
│ │ [Approve Selected → Review in BUY]   ││
│ └───────────────────────────────────────┘│
│                                          │
│ ─────────────────────────────────────── │
│ 📊 POLICIES (45 products)     [Manage →]│
└─────────────────────────────────────────┘
```

**Acceptance Criteria**:
- [ ] Display store reorder settings
- [ ] List pending reorders with selection
- [ ] Edit reorder quantity/supplier
- [ ] Approve selected → navigate to BUY with draft
- [ ] Dismiss with reason
- [ ] Link to policy management

---

#### TICKET-004: Purchase Cart Store
**Type**: Frontend | **Priority**: P0 | **Estimate**: 3 days | **Sprint**: 7

**File**: `src/stores/purchaseCartStore.ts`

**Description**: Zustand store for purchase cart (separate from sell cart).

**Acceptance Criteria**:
- [ ] Add/remove items
- [ ] Update quantities (respect MOQ)
- [ ] Group by supplier
- [ ] Calculate totals per supplier
- [ ] Load draft POs from reorder approval
- [ ] Persist to AsyncStorage
- [ ] Clear supplier items on order

---

#### TICKET-006: BUY Screen - Catalog + Cart
**Type**: Frontend | **Priority**: P0 | **Estimate**: 5 days | **Sprint**: 8

**Description**: Build BUY tab with catalog browse and cart.

**UI Flow**:
```
BUY Tab
├── Draft Orders Banner (if any from REORDER)
│   └── "You have 2 draft orders. Review now →"
├── Search Bar
├── Category Chips
├── Product Grid (2 columns)
│   └── Tap → Product Detail Modal (see suppliers)
├── Add to Cart
└── Cart Footer → Cart Modal → Order Confirmation
```

**Acceptance Criteria**:
- [ ] Draft orders banner (from reorder approval)
- [ ] Catalog browse with search
- [ ] Category filter
- [ ] Product card (best price, stock status)
- [ ] Product detail modal (all suppliers)
- [ ] Add to cart with quantity
- [ ] Cart modal (grouped by supplier)
- [ ] Place order flow
- [ ] GRN receiving screen

---

### 6.3 P1 Tickets (High Priority)

#### TICKET-024: Superadmin Portal MVP
**Type**: Frontend (Web) | **Priority**: P1 | **Estimate**: 5 days | **Sprint**: 11

**Description**: Build basic superadmin portal for supplier management.

**Features**:
- [ ] Pending supplier requests list
- [ ] Approve/reject request
- [ ] Verify supplier
- [ ] Merge duplicate suppliers
- [ ] Feature flags per store
- [ ] Basic audit log view

---

#### TICKET-025: Outbox + Event Bus Integration
**Type**: Backend | **Priority**: P1 | **Estimate**: 5 days | **Sprint**: 6

**Description**: Implement reliable event delivery using outbox pattern.

**Acceptance Criteria**:
- [ ] Outbox table in each service
- [ ] Outbox worker (polls + publishes)
- [ ] Redis pub/sub setup
- [ ] Bull queue for consumers
- [ ] Retry logic for failed publishes
- [ ] Dead letter queue

---

#### TICKET-026: Supplier Web Dashboard MVP
**Type**: Frontend (Web) | **Priority**: P1 | **Estimate**: 5 days | **Sprint**: 11

**Description**: Basic supplier web dashboard.

**Features**:
- [ ] Order inbox
- [ ] Confirm/ship orders
- [ ] Catalog management (list, edit)
- [ ] Bulk CSV upload
- [ ] Staff account management

---

#### TICKET-027: Audit Logs
**Type**: Backend | **Priority**: P1 | **Estimate**: 3 days | **Sprint**: 12

**Description**: Implement audit logging for admin actions.

**Tables**:
- order_events (already exists)
- supplier_merge_log (already exists)
- catalog_mapping_log (already exists)
- admin_actions (new - general admin actions)

---

#### TICKET-014: Stock Monitor Cron Job
**Type**: Backend | **Priority**: P1 | **Estimate**: 3 days | **Sprint**: 6

**Description**: Background job to check stock and create pending reorders.

**Schedule**: Every hour (or triggered by INVENTORY_CHANGED events)

**Logic**:
```
1. Get stores with reorder_enabled = true
2. For each store:
   a. Get products where current_stock <= min_threshold
   b. Skip if pending reorder already exists
   c. Find best supplier (priority, then price, then stock)
   d. Create pending_reorder with suggested_quantity = target - current
3. Send notification batch
```

---

#### TICKET-016: Push Notifications
**Type**: Backend + Frontend | **Priority**: P1 | **Estimate**: 4 days | **Sprint**: 12

**Description**: Push notifications for key events.

**Notifications**:
| Event | Recipient | Title | Action |
|-------|-----------|-------|--------|
| REORDER_DRAFT_CREATED | Store | "3 items need restocking" | Open REORDER |
| PO_CONFIRMED | Store | "Order confirmed by supplier" | Open order |
| PO_SHIPPED | Store | "Order shipped" | Open order |
| PO_CREATED | Supplier | "New order received" | Open orders |

---

### 6.4 P2 Tickets (Medium Priority)

| ID | Title | Type | Days | Sprint |
|----|-------|------|------|--------|
| TICKET-007 | Product Card Component | Frontend | 2 | 7 |
| TICKET-008 | Purchase Cart Modal | Frontend | 3 | 8 |
| TICKET-009 | Reorder Settings Screen | Frontend | 3 | 8 |
| TICKET-011 | Order Confirmation Screen | Frontend | 2 | 8 |
| TICKET-012 | Order History Screen | Frontend | 3 | 9 |
| TICKET-013 | Order Detail Screen | Frontend | 2 | 9 |
| TICKET-015 | Auto-Order Job (no approval) | Backend | 3 | 10 |
| TICKET-017 | Supplier App - Order Inbox | Supplier App | 5 | 10 |
| TICKET-018 | Supplier App - Catalog | Supplier App | 5 | 10 |
| TICKET-019 | Real-time Stock Sync (WS) | Backend | 5 | 12 |

---

## 7. UI/UX Specifications

### 7.1 REORDER vs BUY Separation

**Key UX Rule**: REORDER produces drafts; BUY executes.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       REORDER vs BUY UX FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  REORDER TAB                              BUY TAB                            │
│  ──────────                               ───────                            │
│                                                                              │
│  ┌─────────────────────┐                 ┌─────────────────────┐            │
│  │ • View pending      │                 │ • Browse catalog    │            │
│  │   restock alerts    │                 │ • Search products   │            │
│  │                     │                 │                     │            │
│  │ • Approve/dismiss   │   ──────────▶   │ • Review draft POs  │            │
│  │   suggestions       │   Creates       │   (from REORDER)    │            │
│  │                     │   Drafts        │                     │            │
│  │ • Set policies      │                 │ • Edit cart         │            │
│  │   (min/target)      │                 │                     │            │
│  │                     │                 │ • Place order       │            │
│  │ • No cart here      │                 │                     │            │
│  │                     │                 │ • Receive (GRN)     │            │
│  └─────────────────────┘                 └─────────────────────┘            │
│                                                                              │
│  PURPOSE: Decision making                PURPOSE: Execution                  │
│  "What do I need?"                       "I'm ordering now"                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 BUY Tab UI

```
┌─────────────────────────────────────────────────────────────────┐
│ BUY                                                   [History] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 📋 You have 2 draft orders from REORDER                     │ │
│ │    Total: ₹15,250 from 2 suppliers                          │ │
│ │                              [Review & Submit →]             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 🔍 Search products, barcodes...                   [📷 Scan] │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ [All] [Flour] [Rice] [Oil] [Pulses] [Spices] [→]               │
│                                                                  │
│ ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│ │ ▓▓▓▓▓▓▓▓▓▓ │  │ ▓▓▓▓▓▓▓▓▓▓ │  │ ▓▓▓▓▓▓▓▓▓▓ │              │
│ │ Bajra 1kg  │  │ Maida 1kg  │  │ Besan 500g │              │
│ │ ₹65.00     │  │ ₹40.00     │  │ ₹55.00     │              │
│ │ 2 suppliers│  │ 1 supplier │  │ 3 suppliers│              │
│ │ ✓ In Stock │  │ ✓ In Stock │  │ ⚠️ Low     │              │
│ │   [+ Add]  │  │   [+ Add]  │  │   [+ Add]  │              │
│ └─────────────┘  └─────────────┘  └─────────────┘              │
│                                                                  │
│ ... more products ...                                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
│ 🛒 Cart: 5 items | 2 suppliers | ₹12,500            [View →]   │
└─────────────────────────────────────────────────────────────────┘
```

### 7.3 Navigation Structure

```
POS App Navigation
├── MENU
├── SELL (existing)
├── BUY
│   ├── Catalog Browse
│   ├── Product Detail Modal
│   ├── Cart Modal
│   ├── Order Confirmation
│   ├── Order History
│   │   └── Order Detail
│   └── GRN Receive
└── REORDER
    ├── Pending Reorders
    ├── Edit Reorder Modal
    └── Reorder Settings
        └── Policy List/Edit
```

---

## 8. Onboarding Workflows

### 8.1 Supplier Onboarding (Two Sources → Single Truth)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SUPPLIER ONBOARDING WORKFLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SOURCE A: Store Admin Web                SOURCE B: Superadmin               │
│  ────────────────────────                 ──────────────────                 │
│                                                                              │
│  Store wants to link supplier             Superadmin onboards large          │
│         │                                 supplier centrally                 │
│         ▼                                        │                           │
│  ┌─────────────────┐                            │                           │
│  │ Search by GSTIN │                            │                           │
│  └────────┬────────┘                            │                           │
│           │                                      │                           │
│     ┌─────┴─────┐                               │                           │
│     │           │                               │                           │
│     ▼           ▼                               ▼                           │
│  ┌──────┐   ┌──────────┐              ┌──────────────────┐                 │
│  │Found │   │Not Found │              │ Create Supplier  │                 │
│  └──┬───┘   └────┬─────┘              │ (verified)       │                 │
│     │            │                    └────────┬─────────┘                 │
│     │            ▼                             │                           │
│     │     ┌───────────────┐                   │                           │
│     │     │ Submit Request│                   │                           │
│     │     │ (GSTIN, name) │                   │                           │
│     │     └───────┬───────┘                   │                           │
│     │             │                           │                           │
│     │             ▼                           │                           │
│     │     ┌───────────────┐                   │                           │
│     │     │ Superadmin    │◄──────────────────┘                           │
│     │     │ Reviews       │                                               │
│     │     └───────┬───────┘                                               │
│     │             │                                                        │
│     │      ┌──────┴──────┐                                                │
│     │      │             │                                                │
│     │      ▼             ▼                                                │
│     │   ┌──────┐    ┌────────┐                                           │
│     │   │Approve│    │Reject  │                                           │
│     │   └──┬───┘    └────────┘                                           │
│     │      │                                                              │
│     │      ▼                                                              │
│     │   ┌─────────────────┐                                              │
│     │   │ Create Supplier │                                              │
│     │   │ (if new GSTIN)  │                                              │
│     │   └────────┬────────┘                                              │
│     │            │                                                        │
│     └────────────┼───────────────────────────────────────────────────────│
│                  │                                                        │
│                  ▼                                                        │
│         ┌─────────────────────┐                                          │
│         │ SINGLE SUPPLIER     │                                          │
│         │ RECORD (by GSTIN)   │                                          │
│         └─────────────────────┘                                          │
│                  │                                                        │
│                  ▼                                                        │
│         ┌─────────────────────┐                                          │
│         │ Create Store-       │                                          │
│         │ Supplier Link       │                                          │
│         └─────────────────────┘                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Catalog Mapping Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CATALOG MAPPING WORKFLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Supplier uploads product                                                    │
│  (with barcode)                                                             │
│         │                                                                    │
│         ▼                                                                    │
│  ┌─────────────────────┐                                                    │
│  │ System checks       │                                                    │
│  │ barcode match       │                                                    │
│  └──────────┬──────────┘                                                    │
│             │                                                                │
│      ┌──────┴──────┐                                                        │
│      │             │                                                        │
│      ▼             ▼                                                        │
│  ┌──────────┐  ┌──────────┐                                                │
│  │ MATCH    │  │ NO MATCH │                                                │
│  │ Found    │  │          │                                                │
│  └────┬─────┘  └────┬─────┘                                                │
│       │             │                                                        │
│       ▼             ▼                                                        │
│  ┌──────────┐  ┌──────────────────┐                                        │
│  │ Auto-map │  │ Add to Unmatched │                                        │
│  │ (conf=1) │  │ Queue            │                                        │
│  └────┬─────┘  └────────┬─────────┘                                        │
│       │                 │                                                    │
│       │                 ▼                                                    │
│       │        ┌────────────────────┐                                       │
│       │        │ Store Admin sees   │                                       │
│       │        │ in mapping queue   │                                       │
│       │        └────────┬───────────┘                                       │
│       │                 │                                                    │
│       │          ┌──────┴──────┐                                            │
│       │          │             │                                            │
│       │          ▼             ▼                                            │
│       │    ┌──────────┐  ┌──────────┐                                      │
│       │    │ Map to   │  │ Create   │                                      │
│       │    │ existing │  │ new      │                                      │
│       │    │ product  │  │ product  │                                      │
│       │    └────┬─────┘  └────┬─────┘                                      │
│       │         │             │                                             │
│       └─────────┴─────────────┘                                             │
│                 │                                                            │
│                 ▼                                                            │
│        ┌─────────────────────┐                                              │
│        │ MAPPED PRODUCT      │                                              │
│        │ (buyable/reorderable)│                                              │
│        └─────────────────────┘                                              │
│                                                                              │
│  RULE: Only mapped products appear in BUY catalog and REORDER suggestions   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Infrastructure

### 9.1 Google VM Deployment

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    GOOGLE VM - DOCKER COMPOSE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         NGINX (Port 80, 443)                         │   │
│  │                         SSL Termination                              │   │
│  │                         Rate Limiting                                │   │
│  └───────────────────────────────┬─────────────────────────────────────┘   │
│                                  │                                          │
│  ┌───────────────────────────────┼─────────────────────────────────────┐   │
│  │                               │                                      │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │   │
│  │  │ api-gateway │  │ auth-       │  │ supplier-   │                  │   │
│  │  │ :3000       │  │ service     │  │ service     │                  │   │
│  │  │             │  │ :3001       │  │ :3002       │                  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                  │   │
│  │                                                                      │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │   │
│  │  │ catalog-    │  │ inventory-  │  │ order-      │                  │   │
│  │  │ service     │  │ service     │  │ service     │                  │   │
│  │  │ :3003       │  │ :3004       │  │ :3005       │                  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                  │   │
│  │                                                                      │   │
│  │  ┌─────────────┐  ┌─────────────┐                                   │   │
│  │  │ reorder-    │  │ notification│                                   │   │
│  │  │ service     │  │ -service    │                                   │   │
│  │  │ :3006       │  │ :3007       │                                   │   │
│  │  └─────────────┘  └─────────────┘                                   │   │
│  │                                                                      │   │
│  │  DOCKER NETWORK: supermandi-net                                     │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                  │                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        DATA LAYER                                    │   │
│  │                                                                      │   │
│  │  ┌─────────────────────────┐    ┌─────────────────────────┐         │   │
│  │  │      PostgreSQL         │    │         Redis           │         │   │
│  │  │      :5432              │    │         :6379           │         │   │
│  │  │                         │    │                         │         │   │
│  │  │  Volume: pgdata         │    │  • Session cache        │         │   │
│  │  │  Backup: daily          │    │  • Catalog cache        │         │   │
│  │  │                         │    │  • Bull queues          │         │   │
│  │  └─────────────────────────┘    │  • Pub/Sub              │         │   │
│  │                                 └─────────────────────────┘         │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Docker Compose Structure

```yaml
# docker-compose.yml
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./nginx/certs:/etc/nginx/certs
    depends_on:
      - api-gateway

  api-gateway:
    build: ./services/api-gateway
    environment:
      - NODE_ENV=production
      - PORT=3000
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis

  auth-service:
    build: ./services/auth-service
    environment:
      - NODE_ENV=production
      - PORT=3001
      - DATABASE_URL=postgresql://...
      - JWT_SECRET=${JWT_SECRET}
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis

  supplier-service:
    build: ./services/supplier-service
    # ... similar config

  catalog-service:
    build: ./services/catalog-service
    # ... similar config

  inventory-service:
    build: ./services/inventory-service
    # ... similar config

  order-service:
    build: ./services/order-service
    # ... similar config

  reorder-service:
    build: ./services/reorder-service
    # ... similar config

  notification-service:
    build: ./services/notification-service
    # ... similar config

  postgres:
    image: postgres:15
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_PASSWORD=${DB_PASSWORD}

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data

volumes:
  pgdata:
  redisdata:

networks:
  default:
    name: supermandi-net
```

### 9.3 Observability

| Component | Tool | Purpose |
|-----------|------|---------|
| Logs | File + Rotation | Centralized logging (later ELK) |
| Tracing | Correlation-ID | Request tracing across services |
| Metrics | Prometheus (optional) | Service health metrics |
| Alerting | Webhook/Email | Failed cron jobs, high error rates |
| Health | /healthz endpoint | Container health checks |

### 9.4 Secrets Management

```
.env files per service (NOT in repo)
├── .env.auth-service
├── .env.supplier-service
├── .env.catalog-service
├── ...

Required secrets:
- JWT_SECRET
- DATABASE_URL (per service)
- REDIS_URL
- EXPO_PUSH_TOKEN (for notifications)
- AWS_S3_* (for file uploads)
```

---

## 10. Testing & Rollout

### 10.1 Testing Strategy

| Test Type | Coverage | Tools |
|-----------|----------|-------|
| Unit Tests | 80% | Jest |
| Integration Tests | Key flows | Jest + Supertest |
| E2E Tests | Critical paths | Detox (mobile) |
| Load Tests | 100 concurrent | k6 |

### 10.2 Rollout Phases

| Phase | Duration | Scope | Criteria to Advance |
|-------|----------|-------|---------------------|
| Internal | 1 week | Dev team only | All P0 bugs fixed |
| Beta | 2 weeks | 5 pilot stores | < 1% error rate |
| Soft Launch | 2 weeks | 20 stores | No P0/P1 bugs |
| GA | Ongoing | All stores | Stable metrics |

### 10.3 Feature Flags

```typescript
const features = {
  REORDER_TAB_ENABLED: true,
  BUY_TAB_ENABLED: true,
  AUTO_REORDER_ENABLED: false,       // Enable after testing
  SUPPLIER_APP_ENABLED: false,       // Enable when ready
  SUPERADMIN_PORTAL_ENABLED: true,
  REAL_TIME_STOCK_SYNC: false,       // Enable after WS implemented
};
```

---

## Appendix A: Summary of Changes from V1

| Area | V1 | V2 (This Document) |
|------|----|--------------------|
| Architecture | Monolithic | Microservices (8 services) |
| Auth | Basic | Full RBAC with permissions |
| Surfaces | POS only | POS + Store Admin + Supplier + Superadmin |
| Events | None | Outbox pattern + Redis pub/sub |
| Inventory | Direct update | Ledger-based (source of truth) |
| Reorder | Confusing toggles | Clear policies (min/target) |
| UX | REORDER has cart | REORDER = drafts, BUY = execution |
| Mapping | Implicit | Explicit mapping gate |
| Supplier | Basic | Full lifecycle with verification |

---

## Appendix B: Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-01-12 | Claude | Initial document |
| 2.0.0 | 2026-01-12 | Claude | Major revision per user feedback: microservices, RBAC, events, ledger, mapping, UX clarification |
