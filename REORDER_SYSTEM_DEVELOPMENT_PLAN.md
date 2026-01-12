# SuperMandi POS - REORDER & Purchase System
## Comprehensive Development Plan

**Version**: 1.0.0
**Created**: 2026-01-12
**Status**: Planning Phase

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Data Models](#3-data-models)
4. [API Specifications](#4-api-specifications)
5. [Development Tickets](#5-development-tickets)
6. [UI/UX Specifications](#6-uiux-specifications)
7. [Backend Infrastructure](#7-backend-infrastructure)
8. [Testing Plan](#8-testing-plan)
9. [Rollout Plan](#9-rollout-plan)

---

## 1. Executive Summary

### 1.1 Project Goal

Build a unified REORDER system for SuperMandi POS that enables:
- **Auto-Reorder**: Automatic stock replenishment when inventory falls below threshold
- **Manual Purchase**: Browse supplier catalogs and place orders manually
- **Supplier Management**: Deduplicated supplier system with GSTIN as unique key

### 1.2 Key Stakeholders

| Role | Responsibility |
|------|----------------|
| Retailer (POS App) | Place orders, approve auto-reorders, manage stock |
| Supplier (Supplier App) | Manage catalog, fulfill orders, update stock |
| SuperMandi Admin | Onboard suppliers, verify GSTIN, manage platform |
| Store Admin (Web Dashboard) | Link suppliers to store, set reorder rules |

### 1.3 Success Metrics

- Reduce stockouts by 80%
- Reduce manual ordering time by 70%
- 95% order accuracy
- < 2 second API response time

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SUPERMANDI ECOSYSTEM                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐               │
│  │  Retailer    │    │  Supplier    │    │  SuperMandi  │               │
│  │  POS App     │    │  App         │    │  Admin Web   │               │
│  │  (React      │    │  (Separate   │    │  (Internal)  │               │
│  │   Native)    │    │   App)       │    │              │               │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘               │
│         │                   │                   │                        │
│         └───────────────────┼───────────────────┘                        │
│                             │                                            │
│                             ▼                                            │
│                    ┌──────────────────┐                                  │
│                    │   API Gateway    │                                  │
│                    │   (REST + WS)    │                                  │
│                    └────────┬─────────┘                                  │
│                             │                                            │
│         ┌───────────────────┼───────────────────┐                        │
│         │                   │                   │                        │
│         ▼                   ▼                   ▼                        │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                  │
│  │  Order      │    │  Catalog    │    │  Inventory  │                  │
│  │  Service    │    │  Service    │    │  Service    │                  │
│  └─────────────┘    └─────────────┘    └─────────────┘                  │
│         │                   │                   │                        │
│         └───────────────────┼───────────────────┘                        │
│                             │                                            │
│                             ▼                                            │
│                    ┌──────────────────┐                                  │
│                    │   PostgreSQL     │                                  │
│                    │   (Google VM)    │                                  │
│                    └──────────────────┘                                  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Component Responsibilities

| Component | Technology | Responsibility |
|-----------|------------|----------------|
| POS App | React Native + Expo | Retailer ordering interface |
| Supplier App | React Native + Expo | Supplier catalog & order management |
| API Gateway | Node.js / Express | Request routing, auth, rate limiting |
| Order Service | Node.js | Order creation, status management |
| Catalog Service | Node.js | Product catalog, pricing |
| Inventory Service | Node.js | Stock tracking, threshold alerts |
| Database | PostgreSQL | Primary data store |
| Cache | Redis | Session, catalog cache |
| Queue | Bull/Redis | Async order processing |

---

## 3. Data Models

### 3.1 Supplier (Global Entity)

```sql
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

    -- Verification
    verified_by_supermandi BOOLEAN DEFAULT FALSE,
    verification_date TIMESTAMP,
    verification_notes TEXT,

    -- Rating
    rating DECIMAL(2,1) DEFAULT 0,
    total_orders INTEGER DEFAULT 0,

    -- Status
    status VARCHAR(20) DEFAULT 'active',  -- 'active', 'inactive', 'suspended'

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_suppliers_gstin ON suppliers(gstin);
CREATE INDEX idx_suppliers_status ON suppliers(status);
```

### 3.2 Supplier Onboarding Source

```sql
CREATE TABLE supplier_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES suppliers(id),

    source_type VARCHAR(20) NOT NULL,  -- 'store', 'supermandi'
    source_id VARCHAR(50),             -- store_id or admin_id

    added_by_name VARCHAR(255),
    added_at TIMESTAMP DEFAULT NOW(),

    notes TEXT,

    UNIQUE(supplier_id, source_type, source_id)
);
```

### 3.3 Supplier-Store Link

```sql
CREATE TABLE supplier_store_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES suppliers(id),
    store_id VARCHAR(50) NOT NULL,

    -- Relationship
    status VARCHAR(20) DEFAULT 'active',  -- 'active', 'inactive', 'pending'

    -- Pricing
    price_list_id UUID,  -- Custom pricing for this store

    -- Auto-Reorder Settings
    auto_reorder_enabled BOOLEAN DEFAULT FALSE,
    priority INTEGER DEFAULT 1,  -- 1 = primary, 2 = backup

    -- Preferences
    is_preferred BOOLEAN DEFAULT FALSE,
    min_order_value DECIMAL(10,2) DEFAULT 0,
    credit_days INTEGER DEFAULT 0,

    -- Delivery
    expected_delivery_days INTEGER DEFAULT 2,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(supplier_id, store_id)
);

CREATE INDEX idx_supplier_store_links_store ON supplier_store_links(store_id);
CREATE INDEX idx_supplier_store_links_supplier ON supplier_store_links(supplier_id);
```

### 3.4 Supplier Catalog (Products)

```sql
CREATE TABLE supplier_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES suppliers(id),

    -- Product Identity
    global_sku_id UUID,              -- Links to master SKU (if exists)
    supplier_sku VARCHAR(100),       -- Supplier's own SKU
    barcode VARCHAR(50),

    -- Product Info
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    brand VARCHAR(100),

    -- Variants
    unit VARCHAR(50),                -- 'kg', 'piece', 'packet'
    pack_size DECIMAL(10,3),         -- 1, 0.5, 10

    -- Pricing
    mrp DECIMAL(10,2),
    selling_price DECIMAL(10,2) NOT NULL,

    -- Stock
    stock_quantity INTEGER DEFAULT 0,
    stock_status VARCHAR(20) DEFAULT 'available',  -- 'available', 'low', 'out_of_stock'

    -- Ordering
    moq INTEGER DEFAULT 1,           -- Minimum Order Quantity
    max_qty INTEGER,                 -- Maximum per order

    -- Status
    is_active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(supplier_id, supplier_sku)
);

CREATE INDEX idx_supplier_products_supplier ON supplier_products(supplier_id);
CREATE INDEX idx_supplier_products_barcode ON supplier_products(barcode);
CREATE INDEX idx_supplier_products_global_sku ON supplier_products(global_sku_id);
```

### 3.5 Store Reorder Rules

```sql
CREATE TABLE store_reorder_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id VARCHAR(50) NOT NULL,

    -- Product Reference
    product_id UUID,                 -- Store's product ID
    barcode VARCHAR(50),
    global_sku_id UUID,

    -- Thresholds
    min_stock_threshold INTEGER NOT NULL,
    reorder_quantity INTEGER NOT NULL,
    max_stock_level INTEGER,

    -- Supplier Preference
    preferred_supplier_id UUID REFERENCES suppliers(id),

    -- Auto-order settings
    auto_order_enabled BOOLEAN DEFAULT FALSE,
    require_approval BOOLEAN DEFAULT TRUE,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(store_id, product_id)
);

CREATE INDEX idx_store_reorder_rules_store ON store_reorder_rules(store_id);
```

### 3.6 Purchase Orders

```sql
CREATE TABLE purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(50) UNIQUE NOT NULL,

    -- Parties
    store_id VARCHAR(50) NOT NULL,
    supplier_id UUID REFERENCES suppliers(id),

    -- Order Type
    order_type VARCHAR(20) NOT NULL,  -- 'manual', 'auto_reorder'

    -- Status
    status VARCHAR(30) DEFAULT 'draft',
    -- 'draft', 'pending_approval', 'approved', 'sent_to_supplier',
    -- 'confirmed', 'shipped', 'delivered', 'cancelled'

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
    payment_status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'partial', 'paid'
    payment_terms VARCHAR(50),

    -- Notes
    store_notes TEXT,
    supplier_notes TEXT,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    approved_at TIMESTAMP,
    sent_at TIMESTAMP,
    confirmed_at TIMESTAMP,
    shipped_at TIMESTAMP,
    delivered_at TIMESTAMP
);

CREATE INDEX idx_purchase_orders_store ON purchase_orders(store_id);
CREATE INDEX idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX idx_purchase_orders_created ON purchase_orders(created_at);
```

### 3.7 Purchase Order Items

```sql
CREATE TABLE purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,

    -- Product
    supplier_product_id UUID REFERENCES supplier_products(id),
    product_name VARCHAR(255) NOT NULL,
    supplier_sku VARCHAR(100),
    barcode VARCHAR(50),

    -- Quantity
    ordered_quantity INTEGER NOT NULL,
    received_quantity INTEGER DEFAULT 0,

    -- Pricing
    unit_price DECIMAL(10,2) NOT NULL,
    mrp DECIMAL(10,2),
    tax_rate DECIMAL(5,2) DEFAULT 0,
    discount_percent DECIMAL(5,2) DEFAULT 0,
    line_total DECIMAL(12,2) NOT NULL,

    -- Status
    status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'partial', 'received', 'rejected'

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_purchase_order_items_order ON purchase_order_items(order_id);
```

### 3.8 Pending Reorders (Auto-generated)

```sql
CREATE TABLE pending_reorders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id VARCHAR(50) NOT NULL,

    -- Product
    product_id UUID NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    barcode VARCHAR(50),

    -- Stock Info
    current_stock INTEGER NOT NULL,
    threshold INTEGER NOT NULL,
    suggested_quantity INTEGER NOT NULL,

    -- Supplier
    suggested_supplier_id UUID REFERENCES suppliers(id),
    suggested_price DECIMAL(10,2),

    -- Status
    status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'approved', 'ordered', 'dismissed'

    -- Actions
    dismissed_reason TEXT,
    purchase_order_id UUID REFERENCES purchase_orders(id),

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP  -- Auto-dismiss after X days
);

CREATE INDEX idx_pending_reorders_store ON pending_reorders(store_id);
CREATE INDEX idx_pending_reorders_status ON pending_reorders(status);
```

---

## 4. API Specifications

### 4.1 Supplier APIs

#### 4.1.1 Get Linked Suppliers

```
GET /api/v1/stores/{storeId}/suppliers

Response:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "businessName": "ABC Traders",
      "gstin": "27AABCT1234A1Z5",
      "verified": true,
      "rating": 4.5,
      "isPreferred": true,
      "autoReorderEnabled": true,
      "priority": 1,
      "expectedDeliveryDays": 2,
      "minOrderValue": 500
    }
  ]
}
```

#### 4.1.2 Link Supplier to Store

```
POST /api/v1/stores/{storeId}/suppliers/link

Request:
{
  "gstin": "27AABCT1234A1Z5",
  "supplierName": "ABC Traders",  // Used if new supplier
  "contactPhone": "9876543210",
  "priority": 1,
  "autoReorderEnabled": false
}

Response:
{
  "success": true,
  "data": {
    "supplierId": "uuid",
    "isNewSupplier": false,  // Was existing, just linked
    "linkId": "uuid"
  }
}
```

### 4.2 Catalog APIs

#### 4.2.1 Get Unified Catalog (For BUY Section)

```
GET /api/v1/stores/{storeId}/catalog

Query Parameters:
- search: string (product name, barcode)
- category: string
- supplierId: uuid (optional filter)
- page: number
- limit: number

Response:
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "uuid",
        "name": "Bajra Flour 1kg",
        "barcode": "8901234567890",
        "category": "Flour",
        "brand": "Local",
        "unit": "kg",
        "packSize": 1,

        "bestPrice": 65.00,
        "mrp": 70.00,
        "stockStatus": "available",

        "suppliers": [
          {
            "supplierId": "uuid",
            "supplierName": "ABC Traders",
            "price": 65.00,
            "stock": 100,
            "moq": 5
          },
          {
            "supplierId": "uuid",
            "supplierName": "XYZ Wholesale",
            "price": 68.00,
            "stock": 50,
            "moq": 10
          }
        ]
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "hasMore": true
    }
  }
}
```

#### 4.2.2 Sync Catalog (Background Job)

```
POST /api/v1/stores/{storeId}/catalog/sync

Response:
{
  "success": true,
  "data": {
    "syncId": "uuid",
    "status": "started",
    "suppliersToSync": 3
  }
}
```

### 4.3 Reorder APIs

#### 4.3.1 Get Pending Reorders

```
GET /api/v1/stores/{storeId}/reorders/pending

Response:
{
  "success": true,
  "data": {
    "pendingCount": 5,
    "totalValue": 2500.00,
    "items": [
      {
        "id": "uuid",
        "productName": "Atta 10kg",
        "barcode": "8901234567890",
        "currentStock": 2,
        "threshold": 10,
        "suggestedQuantity": 20,
        "suggestedSupplier": {
          "id": "uuid",
          "name": "ABC Traders"
        },
        "suggestedPrice": 450.00,
        "lineTotal": 9000.00,
        "createdAt": "2026-01-12T10:00:00Z"
      }
    ]
  }
}
```

#### 4.3.2 Approve Reorders (Bulk)

```
POST /api/v1/stores/{storeId}/reorders/approve

Request:
{
  "reorderIds": ["uuid1", "uuid2"],
  "modifications": [
    {
      "reorderId": "uuid1",
      "quantity": 25,  // Modified from suggested 20
      "supplierId": "uuid"  // Override supplier
    }
  ]
}

Response:
{
  "success": true,
  "data": {
    "purchaseOrders": [
      {
        "orderId": "uuid",
        "orderNumber": "PO-2026-0001",
        "supplierId": "uuid",
        "supplierName": "ABC Traders",
        "itemCount": 3,
        "totalAmount": 15000.00
      }
    ]
  }
}
```

#### 4.3.3 Dismiss Reorder

```
POST /api/v1/stores/{storeId}/reorders/{reorderId}/dismiss

Request:
{
  "reason": "Already ordered from local supplier"
}
```

#### 4.3.4 Set Reorder Rules

```
PUT /api/v1/stores/{storeId}/reorder-rules

Request:
{
  "rules": [
    {
      "productId": "uuid",
      "barcode": "8901234567890",
      "minStockThreshold": 10,
      "reorderQuantity": 50,
      "maxStockLevel": 100,
      "preferredSupplierId": "uuid",
      "autoOrderEnabled": true,
      "requireApproval": false
    }
  ]
}
```

### 4.4 Purchase Order APIs

#### 4.4.1 Create Purchase Order (Manual)

```
POST /api/v1/stores/{storeId}/purchase-orders

Request:
{
  "supplierId": "uuid",
  "items": [
    {
      "supplierProductId": "uuid",
      "quantity": 10
    }
  ],
  "notes": "Urgent - need by tomorrow",
  "deliveryAddress": "Store address"
}

Response:
{
  "success": true,
  "data": {
    "orderId": "uuid",
    "orderNumber": "PO-2026-0002",
    "status": "draft",
    "totalAmount": 5000.00
  }
}
```

#### 4.4.2 Get Purchase Orders

```
GET /api/v1/stores/{storeId}/purchase-orders

Query Parameters:
- status: string
- supplierId: uuid
- fromDate: date
- toDate: date
- page: number
- limit: number

Response:
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "uuid",
        "orderNumber": "PO-2026-0001",
        "supplier": {
          "id": "uuid",
          "name": "ABC Traders"
        },
        "status": "confirmed",
        "itemCount": 5,
        "totalAmount": 15000.00,
        "expectedDelivery": "2026-01-14",
        "createdAt": "2026-01-12T10:00:00Z"
      }
    ],
    "pagination": {...}
  }
}
```

#### 4.4.3 Update Order Status

```
PUT /api/v1/stores/{storeId}/purchase-orders/{orderId}/status

Request:
{
  "status": "sent_to_supplier"
}
```

#### 4.4.4 Receive Order (GRN - Goods Receipt Note)

```
POST /api/v1/stores/{storeId}/purchase-orders/{orderId}/receive

Request:
{
  "items": [
    {
      "itemId": "uuid",
      "receivedQuantity": 10,
      "status": "received"  // or 'partial', 'rejected'
    }
  ],
  "notes": "2 items damaged"
}
```

### 4.5 Inventory Sync APIs

#### 4.5.1 Report Low Stock (Triggered by POS)

```
POST /api/v1/stores/{storeId}/inventory/low-stock-alert

Request:
{
  "items": [
    {
      "productId": "uuid",
      "barcode": "8901234567890",
      "currentStock": 5,
      "productName": "Atta 10kg"
    }
  ]
}
```

---

## 5. Development Tickets

### 5.1 Phase 1: Foundation (Sprint 1-2)

#### TICKET-001: Database Schema Setup
**Type**: Backend
**Priority**: P0 (Critical)
**Estimate**: 3 days

**Description**:
Create all database tables for supplier, catalog, and order management.

**Acceptance Criteria**:
- [ ] All tables created as per schema in Section 3
- [ ] Indexes created for performance
- [ ] Foreign key constraints working
- [ ] Migration scripts ready
- [ ] Seed data for testing

**Files to Create/Modify**:
- `backend/migrations/001_suppliers.sql`
- `backend/migrations/002_supplier_products.sql`
- `backend/migrations/003_purchase_orders.sql`
- `backend/migrations/004_reorder_rules.sql`

---

#### TICKET-002: Supplier Service - Core APIs
**Type**: Backend
**Priority**: P0 (Critical)
**Estimate**: 5 days
**Depends On**: TICKET-001

**Description**:
Implement supplier management APIs including GSTIN-based deduplication.

**Acceptance Criteria**:
- [ ] GET /suppliers - List linked suppliers
- [ ] POST /suppliers/link - Link supplier (with dedup)
- [ ] PUT /suppliers/{id} - Update supplier settings
- [ ] DELETE /suppliers/{id}/unlink - Unlink from store
- [ ] GSTIN validation and dedup working
- [ ] Unit tests with 80% coverage

**API Details**:
```
Endpoint: POST /api/v1/stores/{storeId}/suppliers/link
Logic:
1. Validate GSTIN format
2. Check if supplier exists (by GSTIN)
3. If exists: Create link only
4. If new: Create supplier + link
5. Return supplier details
```

---

#### TICKET-003: Catalog Service - Core APIs
**Type**: Backend
**Priority**: P0 (Critical)
**Estimate**: 5 days
**Depends On**: TICKET-001

**Description**:
Implement catalog APIs for browsing supplier products.

**Acceptance Criteria**:
- [ ] GET /catalog - Unified catalog with best prices
- [ ] GET /catalog/{productId}/suppliers - All suppliers for a product
- [ ] POST /catalog/sync - Trigger catalog sync
- [ ] Search by name, barcode working
- [ ] Pagination working
- [ ] Response time < 500ms

---

#### TICKET-004: Purchase Cart Store (Frontend)
**Type**: Frontend
**Priority**: P0 (Critical)
**Estimate**: 3 days

**Description**:
Create Zustand store for purchase cart (separate from sell cart).

**Acceptance Criteria**:
- [ ] Add/remove items
- [ ] Update quantities
- [ ] Group by supplier
- [ ] Calculate totals per supplier
- [ ] Persist to AsyncStorage
- [ ] Clear cart on order submit

**File**: `src/stores/purchaseCartStore.ts`

```typescript
interface PurchaseCartItem {
  supplierProductId: string;
  supplierId: string;
  supplierName: string;
  productName: string;
  barcode?: string;
  quantity: number;
  unitPrice: number;
  mrp?: number;
}

interface PurchaseCartState {
  items: PurchaseCartItem[];

  // Actions
  addItem: (item: Omit<PurchaseCartItem, 'quantity'>, qty?: number) => void;
  removeItem: (supplierProductId: string) => void;
  updateQuantity: (supplierProductId: string, qty: number) => void;
  clearCart: () => void;
  clearSupplierItems: (supplierId: string) => void;

  // Computed
  getItemsBySupplier: () => Map<string, PurchaseCartItem[]>;
  getTotalBySupplier: (supplierId: string) => number;
  getGrandTotal: () => number;
  getItemCount: () => number;
}
```

---

### 5.2 Phase 2: POS App - REORDER Screen (Sprint 3-4)

#### TICKET-005: REORDER Screen - Main UI
**Type**: Frontend
**Priority**: P0 (Critical)
**Estimate**: 5 days
**Depends On**: TICKET-004

**Description**:
Build the main REORDER screen with pending reorders and catalog browse sections.

**Acceptance Criteria**:
- [ ] Pending reorders section at top
- [ ] Browse catalog section below
- [ ] Pull-to-refresh working
- [ ] Loading states
- [ ] Empty states
- [ ] Error handling

**File**: `src/screens/ReorderScreen.tsx`

**UI Layout**:
```
┌─────────────────────────────────────────┐
│ REORDER                          [⚙️]   │
├─────────────────────────────────────────┤
│                                          │
│ 🔔 PENDING REORDERS (3)                 │
│ ┌─────────────────────────────────────┐ │
│ │ Atta 10kg          Stock: 2 / 10    │ │
│ │ Suggested: 20 × ₹450 = ₹9,000      │ │
│ │ ABC Traders        [Edit] [✓]       │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ Sugar 1kg          Stock: 5 / 20    │ │
│ │ Suggested: 50 × ₹45 = ₹2,250       │ │
│ │ XYZ Wholesale      [Edit] [✓]       │ │
│ └─────────────────────────────────────┘ │
│                                          │
│ [Approve All Selected] [Dismiss All]    │
│                                          │
├─────────────────────────────────────────┤
│ 🛒 BROWSE CATALOG                       │
│ ┌─────────────────────────────────────┐ │
│ │ 🔍 Search products...               │ │
│ └─────────────────────────────────────┘ │
│                                          │
│ [All] [Flour] [Rice] [Oil] [Spices]     │
│                                          │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐    │
│ │ Product │ │ Product │ │ Product │    │
│ │ ₹65.00  │ │ ₹120.00 │ │ ₹85.00  │    │
│ │ [+Add]  │ │ [+Add]  │ │ [+Add]  │    │
│ └─────────┘ └─────────┘ └─────────┘    │
│                                          │
└─────────────────────────────────────────┘
│ 🛒 Purchase Cart: 5 items | ₹12,500    │
│ [View Cart]                              │
└─────────────────────────────────────────┘
```

---

#### TICKET-006: Pending Reorder Card Component
**Type**: Frontend
**Priority**: P1 (High)
**Estimate**: 2 days
**Depends On**: TICKET-005

**Description**:
Create reusable card component for pending reorder items.

**File**: `src/components/PendingReorderCard.tsx`

**Props**:
```typescript
interface PendingReorderCardProps {
  reorder: {
    id: string;
    productName: string;
    barcode?: string;
    currentStock: number;
    threshold: number;
    suggestedQuantity: number;
    suggestedPrice: number;
    supplier: {
      id: string;
      name: string;
    };
  };
  isSelected: boolean;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onDismiss: (id: string) => void;
}
```

---

#### TICKET-007: Catalog Product Card Component
**Type**: Frontend
**Priority**: P1 (High)
**Estimate**: 2 days
**Depends On**: TICKET-005

**Description**:
Create product card for catalog browse with add-to-cart functionality.

**File**: `src/components/CatalogProductCard.tsx`

**Features**:
- Product image placeholder
- Name, price, stock status
- Quick add button (+)
- Tap to see supplier details
- MOQ indicator

---

#### TICKET-008: Purchase Cart Modal
**Type**: Frontend
**Priority**: P1 (High)
**Estimate**: 3 days
**Depends On**: TICKET-004

**Description**:
Create purchase cart modal showing items grouped by supplier.

**File**: `src/components/PurchaseCartModal.tsx`

**UI Layout**:
```
┌─────────────────────────────────────────┐
│ Purchase Cart                      [X]  │
├─────────────────────────────────────────┤
│                                          │
│ 📦 ABC Traders (3 items)                │
│ ┌─────────────────────────────────────┐ │
│ │ Atta 10kg        20 × ₹450  ₹9,000 │ │
│ │ Sugar 1kg        50 × ₹45   ₹2,250 │ │
│ │ Rice 25kg         5 × ₹800  ₹4,000 │ │
│ ├─────────────────────────────────────┤ │
│ │ Subtotal               ₹15,250      │ │
│ │ [Place Order with ABC Traders]      │ │
│ └─────────────────────────────────────┘ │
│                                          │
│ 📦 XYZ Wholesale (2 items)              │
│ ┌─────────────────────────────────────┐ │
│ │ Oil 5L           10 × ₹500  ₹5,000 │ │
│ │ Dal 1kg          20 × ₹120  ₹2,400 │ │
│ ├─────────────────────────────────────┤ │
│ │ Subtotal                ₹7,400      │ │
│ │ [Place Order with XYZ Wholesale]    │ │
│ └─────────────────────────────────────┘ │
│                                          │
├─────────────────────────────────────────┤
│ Grand Total: ₹22,650                    │
│ [Place All Orders]                       │
└─────────────────────────────────────────┘
```

---

#### TICKET-009: Reorder Settings Screen
**Type**: Frontend
**Priority**: P2 (Medium)
**Estimate**: 3 days

**Description**:
Screen to configure auto-reorder rules per product.

**File**: `src/screens/ReorderSettingsScreen.tsx`

**Features**:
- List all products with stock
- Set threshold per product
- Set reorder quantity
- Set preferred supplier
- Enable/disable auto-order
- Require approval toggle

---

### 5.3 Phase 3: Order Management (Sprint 5-6)

#### TICKET-010: Purchase Order Service
**Type**: Backend
**Priority**: P0 (Critical)
**Estimate**: 5 days
**Depends On**: TICKET-001

**Description**:
Implement purchase order creation, status management, and GRN.

**Acceptance Criteria**:
- [ ] Create order from cart
- [ ] Create order from reorder approvals
- [ ] Update order status
- [ ] GRN (Goods Receipt)
- [ ] Order history
- [ ] Order notifications to supplier

---

#### TICKET-011: Order Confirmation Screen
**Type**: Frontend
**Priority**: P1 (High)
**Estimate**: 2 days
**Depends On**: TICKET-008

**Description**:
Order summary and confirmation before placing order.

---

#### TICKET-012: Order History Screen
**Type**: Frontend
**Priority**: P2 (Medium)
**Estimate**: 3 days

**Description**:
View past orders with status tracking.

---

#### TICKET-013: Order Detail Screen
**Type**: Frontend
**Priority**: P2 (Medium)
**Estimate**: 2 days
**Depends On**: TICKET-012

**Description**:
Detailed view of a single order with items and status timeline.

---

### 5.4 Phase 4: Auto-Reorder Engine (Sprint 7-8)

#### TICKET-014: Stock Monitor Service
**Type**: Backend
**Priority**: P1 (High)
**Estimate**: 5 days

**Description**:
Background service that monitors stock levels and creates pending reorders.

**Logic**:
```
Every hour (or on stock change):
1. Get all stores with auto-reorder enabled
2. For each store:
   a. Get products with stock < threshold
   b. For each low-stock product:
      - Check if pending reorder exists
      - If not, create pending reorder
      - Find best supplier (by priority, price, stock)
3. Send notification to store if new pending reorders
```

---

#### TICKET-015: Auto-Order Cron Job
**Type**: Backend
**Priority**: P2 (Medium)
**Estimate**: 3 days
**Depends On**: TICKET-014

**Description**:
For stores with auto-order enabled (no approval required), automatically convert pending reorders to orders.

---

#### TICKET-016: Push Notifications
**Type**: Backend + Frontend
**Priority**: P2 (Medium)
**Estimate**: 4 days

**Description**:
Send push notifications for:
- New pending reorders
- Order status changes
- Low stock alerts

---

### 5.5 Phase 5: Supplier Integration (Sprint 9-10)

#### TICKET-017: Supplier App - Order Inbox
**Type**: Supplier App (Separate)
**Priority**: P1 (High)
**Estimate**: 5 days

**Description**:
Supplier app screen to view and manage incoming orders.

---

#### TICKET-018: Supplier App - Catalog Management
**Type**: Supplier App (Separate)
**Priority**: P1 (High)
**Estimate**: 5 days

**Description**:
Supplier app screens to manage product catalog and stock.

---

#### TICKET-019: Real-time Stock Sync
**Type**: Backend
**Priority**: P2 (Medium)
**Estimate**: 5 days

**Description**:
WebSocket-based real-time stock updates from supplier to retailer.

---

### 5.6 Summary: Sprint Plan

| Sprint | Focus | Tickets | Duration |
|--------|-------|---------|----------|
| Sprint 1-2 | Foundation | TICKET-001 to 004 | 2 weeks |
| Sprint 3-4 | REORDER UI | TICKET-005 to 009 | 2 weeks |
| Sprint 5-6 | Order Management | TICKET-010 to 013 | 2 weeks |
| Sprint 7-8 | Auto-Reorder | TICKET-014 to 016 | 2 weeks |
| Sprint 9-10 | Supplier Integration | TICKET-017 to 019 | 2 weeks |

**Total Estimated Duration**: 10 weeks

---

## 6. UI/UX Specifications

### 6.1 REORDER Tab - Main Screen

```
┌─────────────────────────────────────────────────────────────────┐
│ ≡ SuperMandi Pilot Store                    [🔔 3]  [⚙️]       │
│ ID: store-1 | Ready for billing                                 │
├─────────────────────────────────────────────────────────────────┤
│ [MENU] [SELL] [BUY] [REORDER •]                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 🔔 NEEDS RESTOCK (3 items)                    [Select All]│  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ [☑️] Atta 10kg                                             │  │
│  │     Current: 2 | Threshold: 10 | Order: 20                │  │
│  │     ₹450/unit → ₹9,000                                    │  │
│  │     📦 ABC Traders (Primary)           [Edit] [Dismiss]   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ [☑️] Sugar 1kg                                             │  │
│  │     Current: 5 | Threshold: 20 | Order: 50                │  │
│  │     ₹45/unit → ₹2,250                                     │  │
│  │     📦 XYZ Wholesale (Backup)          [Edit] [Dismiss]   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Selected: 2 items | Total: ₹11,250                       │    │
│  │ [Approve & Create Orders]                                │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 🛒 BROWSE CATALOG                           [View Cart]   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 🔍 Search products, brands, or barcodes...               │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  [All] [Flour] [Rice] [Oil] [Pulses] [Spices] [→]              │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ ▓▓▓▓▓▓▓▓▓▓ │  │ ▓▓▓▓▓▓▓▓▓▓ │  │ ▓▓▓▓▓▓▓▓▓▓ │             │
│  │ Bajra 1kg  │  │ Maida 1kg  │  │ Besan 500g │             │
│  │ ₹65.00     │  │ ₹40.00     │  │ ₹55.00     │             │
│  │ ✓ In Stock │  │ ✓ In Stock │  │ ⚠️ Low     │             │
│  │   [+ Add]  │  │   [+ Add]  │  │   [+ Add]  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ ▓▓▓▓▓▓▓▓▓▓ │  │ ▓▓▓▓▓▓▓▓▓▓ │  │ ▓▓▓▓▓▓▓▓▓▓ │             │
│  │ Rice 5kg   │  │ Sugar 1kg  │  │ Salt 1kg   │             │
│  │ ₹280.00    │  │ ₹45.00     │  │ ₹20.00     │             │
│  │ ✓ In Stock │  │ ✓ In Stock │  │ ✓ In Stock │             │
│  │   [+ Add]  │  │   [+ Add]  │  │   [+ Add]  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
│ 🛒 Cart: 2 items from 1 supplier | ₹1,200         [View →]     │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Product Detail Modal (When Tapped)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                           [X]   │
│                                                                  │
│                    ┌─────────────────┐                          │
│                    │   ▓▓▓▓▓▓▓▓▓▓▓  │                          │
│                    │   Product Img   │                          │
│                    └─────────────────┘                          │
│                                                                  │
│  Bajra Flour 1kg                                                │
│  Brand: SuperMandi | Category: Flour                            │
│  Barcode: 8901234567890                                         │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  AVAILABLE FROM                                                  │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 📦 ABC Traders ⭐ 4.5                        [Preferred]  │  │
│  │    ₹65.00 / unit | Stock: 100 | MOQ: 5                   │  │
│  │    Delivery: 2 days                                       │  │
│  │                                         [-] [10] [+]      │  │
│  │                                         [Add to Cart]     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 📦 XYZ Wholesale ⭐ 4.2                                    │  │
│  │    ₹68.00 / unit | Stock: 50 | MOQ: 10                   │  │
│  │    Delivery: 3 days                                       │  │
│  │                                         [-] [10] [+]      │  │
│  │                                         [Add to Cart]     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.3 Purchase Cart Modal

```
┌─────────────────────────────────────────────────────────────────┐
│ Purchase Cart                                             [X]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  📦 ABC TRADERS                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Bajra 1kg           [-] 10 [+]    ₹65 × 10 = ₹650    [🗑] │  │
│  │ Atta 10kg           [-] 20 [+]    ₹450 × 20 = ₹9,000 [🗑] │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │ Subtotal                                        ₹9,650    │  │
│  │ Min Order: ₹500 ✓                                         │  │
│  │ ┌─────────────────────────────────────────────────────┐   │  │
│  │ │          [Place Order - ABC Traders]                │   │  │
│  │ └─────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  📦 XYZ WHOLESALE                                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Sugar 1kg           [-] 50 [+]    ₹45 × 50 = ₹2,250  [🗑] │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │ Subtotal                                        ₹2,250    │  │
│  │ Min Order: ₹1,000 ⚠️ Add ₹750 more                        │  │
│  │ ┌─────────────────────────────────────────────────────┐   │  │
│  │ │          [Browse XYZ Products]                      │   │  │
│  │ └─────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  Grand Total: ₹11,900                                           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              [Place All Orders]                          │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 6.4 Reorder Settings Screen

```
┌─────────────────────────────────────────────────────────────────┐
│ ← Reorder Settings                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  GLOBAL SETTINGS                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Auto-Reorder Mode                              [ON/OFF]   │  │
│  │ Generate reorder suggestions when stock is low            │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Require Approval                               [ON/OFF]   │  │
│  │ Review orders before sending to supplier                  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  PRODUCT RULES (45 products)                                    │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 🔍 Search products...                                     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Atta 10kg                                      [Enabled]  │  │
│  │ Current Stock: 15                                         │  │
│  │ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │  │
│  │ │ Threshold   │ │ Order Qty   │ │ Max Stock   │          │  │
│  │ │ [   10   ]  │ │ [   50   ]  │ │ [  100   ]  │          │  │
│  │ └─────────────┘ └─────────────┘ └─────────────┘          │  │
│  │ Preferred Supplier: [ABC Traders        ▼]                │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Sugar 1kg                                      [Enabled]  │  │
│  │ Current Stock: 8                                          │  │
│  │ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │  │
│  │ │ Threshold   │ │ Order Qty   │ │ Max Stock   │          │  │
│  │ │ [   20   ]  │ │ [  100   ]  │ │ [  200   ]  │          │  │
│  │ └─────────────┘ └─────────────┘ └─────────────┘          │  │
│  │ Preferred Supplier: [XYZ Wholesale      ▼]                │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  [+ Add Product Rule]                                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.5 Color Palette & Design Tokens

```typescript
// Design tokens for REORDER section
const reorderTheme = {
  colors: {
    // Status colors
    pending: '#FFA726',      // Orange - needs attention
    approved: '#66BB6A',     // Green - approved
    dismissed: '#BDBDBD',    // Gray - dismissed

    // Stock status
    inStock: '#4CAF50',      // Green
    lowStock: '#FF9800',     // Orange
    outOfStock: '#F44336',   // Red

    // Supplier
    preferred: '#2196F3',    // Blue badge
    verified: '#4CAF50',     // Green checkmark

    // Actions
    approve: '#4CAF50',
    dismiss: '#9E9E9E',
    edit: '#2196F3',
  },

  spacing: {
    cardGap: 12,
    sectionGap: 24,
    contentPadding: 16,
  }
};
```

---

## 7. Backend Infrastructure

### 7.1 Google VM Setup

```
Current Infrastructure:
├── VM Instance: supermandi-backend
├── OS: Ubuntu 22.04 LTS
├── CPU: 2 vCPU
├── RAM: 4 GB
├── Disk: 50 GB SSD
└── Region: asia-south1 (Mumbai)

Required Additions:
├── Redis: For caching and job queues
├── PostgreSQL: Already exists, add new tables
└── Node.js Services: Add new microservices
```

### 7.2 Service Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    GOOGLE VM (supermandi-backend)                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    NGINX (Reverse Proxy)                 │    │
│  │                    Port: 80, 443                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│         ┌────────────────────┼────────────────────┐             │
│         │                    │                    │             │
│         ▼                    ▼                    ▼             │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐     │
│  │ API Gateway │      │ Order       │      │ Catalog     │     │
│  │ Port: 3000  │      │ Service     │      │ Service     │     │
│  │             │      │ Port: 3001  │      │ Port: 3002  │     │
│  └─────────────┘      └─────────────┘      └─────────────┘     │
│         │                    │                    │             │
│         └────────────────────┼────────────────────┘             │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    PostgreSQL                            │    │
│  │                    Port: 5432                            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Redis                                 │    │
│  │                    Port: 6379                            │    │
│  │                    (Cache + Job Queue)                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 7.3 Database Migration Plan

```sql
-- Migration: 001_add_supplier_tables.sql
-- Run in order:

-- 1. Suppliers table
-- 2. Supplier sources table
-- 3. Supplier-store links table
-- 4. Supplier products table
-- 5. Store reorder rules table
-- 6. Purchase orders table
-- 7. Purchase order items table
-- 8. Pending reorders table

-- Rollback script also required
```

### 7.4 Cron Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| Stock Monitor | Every hour | Check stock levels, create pending reorders |
| Catalog Sync | Every 6 hours | Sync supplier catalogs |
| Auto-Order | Every 2 hours | Process auto-orders (no approval required) |
| Cleanup | Daily midnight | Archive old pending reorders |

### 7.5 API Rate Limits

| Endpoint | Rate Limit | Notes |
|----------|------------|-------|
| GET /catalog | 100/min | Cached for 5 min |
| POST /orders | 20/min | Prevent spam |
| GET /reorders | 60/min | Frequently polled |

---

## 8. Testing Plan

### 8.1 Unit Tests

| Component | Coverage Target | Framework |
|-----------|-----------------|-----------|
| API Services | 80% | Jest |
| Zustand Stores | 90% | Jest + RTL |
| UI Components | 70% | React Testing Library |
| Database Queries | 80% | Jest + pg-mock |

### 8.2 Integration Tests

| Flow | Test Cases |
|------|------------|
| Supplier Linking | Link new, link existing (dedup), unlink |
| Catalog Browse | Search, filter, pagination |
| Add to Cart | Add, update qty, remove, supplier grouping |
| Place Order | Single supplier, multiple suppliers |
| Reorder Approval | Approve single, approve bulk, dismiss |
| Auto-Reorder | Threshold trigger, order creation |

### 8.3 E2E Tests (Detox)

```typescript
// test/e2e/reorder.test.ts

describe('Reorder Flow', () => {
  it('should show pending reorders when stock is low', async () => {
    // Setup: Create product with low stock
    // Navigate to REORDER tab
    // Assert: Pending reorder card visible
  });

  it('should approve reorder and create purchase order', async () => {
    // Select pending reorder
    // Tap approve
    // Assert: Order created, reorder removed
  });

  it('should add catalog product to cart', async () => {
    // Search for product
    // Tap Add
    // Assert: Cart count increased
  });

  it('should place order with multiple suppliers', async () => {
    // Add products from 2 suppliers
    // Open cart
    // Place all orders
    // Assert: 2 orders created
  });
});
```

### 8.4 Performance Tests

| Metric | Target | Tool |
|--------|--------|------|
| Catalog load time | < 500ms | k6 |
| Order creation | < 1s | k6 |
| Search response | < 300ms | k6 |
| Concurrent users | 100 | k6 |

---

## 9. Rollout Plan

### 9.1 Phase-wise Rollout

```
Week 1-2: Internal Testing
├── Deploy to staging
├── QA testing
├── Fix critical bugs
└── Performance optimization

Week 3: Beta Testing
├── 5 pilot stores
├── Daily feedback collection
├── Bug fixes
└── UX improvements

Week 4: Soft Launch
├── 20 stores
├── Monitor error rates
├── Support standby
└── Feature flag for quick disable

Week 5+: General Availability
├── All stores
├── Marketing announcement
├── Support documentation
└── Training videos
```

### 9.2 Feature Flags

```typescript
// Feature flags for gradual rollout
const features = {
  REORDER_TAB_ENABLED: true,           // Show REORDER tab
  AUTO_REORDER_ENABLED: false,         // Auto-order without approval
  CATALOG_BROWSE_ENABLED: true,        // Browse supplier catalog
  MULTI_SUPPLIER_ORDER: false,         // Order from multiple suppliers at once
  REAL_TIME_STOCK: false,              // WebSocket stock updates
};
```

### 9.3 Rollback Plan

```
If critical issues found:
1. Disable REORDER tab via feature flag (instant)
2. Keep existing orders processing
3. Investigate and fix
4. Re-enable after fix deployed
```

### 9.4 Success Metrics (Post-Launch)

| Metric | Week 1 Target | Month 1 Target |
|--------|---------------|----------------|
| Orders placed | 100 | 1,000 |
| Stores using reorder | 10 | 50 |
| Stockout reduction | 20% | 50% |
| Manual order time saved | 30% | 60% |
| Error rate | < 1% | < 0.5% |

---

## 10. Appendix

### 10.1 GSTIN Validation Regex

```typescript
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

function validateGSTIN(gstin: string): boolean {
  return GSTIN_REGEX.test(gstin);
}
```

### 10.2 Order Number Generation

```typescript
function generateOrderNumber(storeId: string): string {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `PO-${storeId}-${year}-${random}`;
}
```

### 10.3 Stock Status Logic

```typescript
function getStockStatus(current: number, threshold: number): StockStatus {
  if (current === 0) return 'out_of_stock';
  if (current <= threshold) return 'low';
  return 'available';
}
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-01-12 | Claude | Initial document |

---

**Next Steps**:
1. Review and approve this document
2. Set up project board with tickets
3. Assign tickets to team members
4. Begin Sprint 1 development
