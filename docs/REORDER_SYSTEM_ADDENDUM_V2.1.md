# SuperMandi REORDER System - Addendum V2.1
## Critical Additions & Refinements

**Version**: 2.1.0
**Date**: 2026-01-12
**Status**: Approved refinements to V2 plan

This document contains critical additions to the V2 plan. These should be merged into the main plan before development begins.

---

## 1. Core Entities: Stores Table

### Problem
`store_id` is used as a free string everywhere with no canonical store record.

### Solution
Add `stores` table as the tenancy primitive.

```sql
-- stores table (owned by: platform/config-service or auth-service)
CREATE TABLE stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE,  -- Human-readable code like "store-1"

    -- Contact
    phone VARCHAR(15),
    email VARCHAR(255),

    -- Address
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(10),

    -- Operational
    timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
    currency VARCHAR(3) DEFAULT 'INR',

    -- Status
    status VARCHAR(20) DEFAULT 'active',  -- 'pending', 'active', 'suspended', 'closed'

    -- Feature flags (denormalized for fast POS access)
    features_enabled JSONB DEFAULT '{}',

    -- Audit
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

CREATE INDEX idx_stores_code ON stores(code);
CREATE INDEX idx_stores_status ON stores(status);
```

### Decision: Store ID Type
**DECISION**: Use `UUID` everywhere for `store_id`.

**Migration**: If existing data uses VARCHAR, migrate to UUID with mapping table.

```sql
-- All foreign keys become:
store_id UUID REFERENCES stores(id)

-- NOT:
store_id VARCHAR(50)
```

---

## 2. Feature Flags Data Model

### Problem
Feature flags mentioned but no storage/API defined.

### Solution
Add feature flags to auth-service (simplest) or new config-service.

```sql
-- Feature flags table
CREATE TABLE feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Flag identity
    flag_key VARCHAR(100) NOT NULL,  -- e.g., 'reorder_enabled', 'buy_tab_enabled'

    -- Scope (who does this apply to?)
    scope_type VARCHAR(20) NOT NULL,  -- 'global', 'store', 'supplier'
    scope_id UUID,                     -- NULL for global, store_id or supplier_id

    -- Value
    enabled BOOLEAN DEFAULT FALSE,
    payload_json JSONB,  -- Optional config payload

    -- Audit
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(flag_key, scope_type, scope_id)
);

CREATE INDEX idx_feature_flags_scope ON feature_flags(scope_type, scope_id);
```

### API Endpoints

```yaml
# Get flags for current actor (POS calls on startup)
GET /api/v1/config/flags
Query: storeId=uuid (for store apps)
Response:
  flags:
    reorder_enabled: true
    buy_tab_enabled: true
    auto_reorder_enabled: false

# Superadmin: Set flag
PUT /api/v1/admin/flags
Permission: platform.flags.write
Request:
  flagKey: "reorder_enabled"
  scopeType: "store"
  scopeId: "uuid"
  enabled: true
```

### Flag Resolution Order
```
1. Check store-specific flag
2. If not found, check global flag
3. If not found, use default (false)
```

---

## 3. Internal Auth Strategy (Service Trust Boundary)

### Problem
Services must not blindly trust gateway headers.

### Solution
All services verify JWT signature independently.

```
┌─────────────────────────────────────────────────────────────────┐
│                  INTERNAL AUTH STRATEGY                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  OPTION CHOSEN: JWT Verification in All Services                │
│                                                                  │
│  How it works:                                                   │
│  1. API Gateway validates JWT, extracts claims                  │
│  2. Gateway forwards request WITH original JWT in header        │
│  3. Each service ALSO validates JWT signature using shared      │
│     secret (JWT_SECRET env var)                                 │
│  4. Service extracts claims from JWT, ignores gateway headers   │
│                                                                  │
│  Headers from Gateway (for convenience, NOT trusted):           │
│  - X-Correlation-Id (trusted - just tracing)                    │
│  - X-Actor-Type (NOT trusted - extracted from JWT)              │
│  - X-Actor-Id (NOT trusted - extracted from JWT)                │
│                                                                  │
│  Trusted source: JWT claims after signature verification        │
│                                                                  │
│  Implementation:                                                 │
│  - Shared JWT_SECRET across all services                        │
│  - authMiddleware in each service verifies JWT                  │
│  - If signature invalid, reject with 401                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Middleware Code Pattern

```typescript
// shared/middleware/auth.ts (copied to each service)
import jwt from 'jsonwebtoken';

export const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    // VERIFY signature - do not just decode!
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      id: payload.sub,
      actorType: payload.actorType,
      actorId: payload.actorId,
      permissions: payload.permissions,
    };

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
```

---

## 4. Idempotency & Deduplication

### Problem
Network retries can cause duplicate orders, ledger entries, etc.

### Solution A: Idempotency Keys (for write endpoints)

```sql
-- Idempotency keys table (in each service that needs it)
CREATE TABLE idempotency_keys (
    key VARCHAR(100) PRIMARY KEY,  -- Client-provided key

    -- Context
    user_id UUID NOT NULL,
    route VARCHAR(200) NOT NULL,
    request_hash VARCHAR(64),  -- SHA256 of request body

    -- Response
    response_status INTEGER,
    response_json JSONB,

    -- Timing
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX idx_idempotency_keys_expires ON idempotency_keys(expires_at);
```

### Endpoints Requiring Idempotency

| Service | Endpoint | Header |
|---------|----------|--------|
| order-service | POST /purchase-orders | X-Idempotency-Key |
| order-service | POST /purchase-orders/{id}/receive | X-Idempotency-Key |
| inventory-service | POST /inventory/adjust | X-Idempotency-Key |
| inventory-service | POST /inventory/transactions/sale | X-Idempotency-Key |
| reorder-service | POST /reorder/pending/approve | X-Idempotency-Key |

### Idempotency Middleware

```typescript
export const idempotencyMiddleware = async (req, res, next) => {
  const key = req.headers['x-idempotency-key'];
  if (!key) return next();  // Optional for some endpoints

  const existing = await db.idempotencyKeys.findOne({ key, user_id: req.user.id });

  if (existing) {
    // Return cached response
    return res.status(existing.response_status).json(existing.response_json);
  }

  // Capture response
  const originalJson = res.json.bind(res);
  res.json = async (data) => {
    await db.idempotencyKeys.insert({
      key,
      user_id: req.user.id,
      route: req.path,
      request_hash: hash(req.body),
      response_status: res.statusCode,
      response_json: data,
    });
    return originalJson(data);
  };

  next();
};
```

### Solution B: Event Inbox (Consumer Dedup)

```sql
-- Event inbox table (in each consumer service)
CREATE TABLE event_inbox (
    event_id UUID PRIMARY KEY,  -- From event payload

    -- Processing
    received_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'processed', 'failed'

    -- Error tracking
    error_message TEXT,
    retry_count INTEGER DEFAULT 0
);

CREATE INDEX idx_event_inbox_status ON event_inbox(status);
```

### Consumer Pattern

```typescript
async function processEvent(event: DomainEvent) {
  // Check if already processed
  const existing = await db.eventInbox.findOne({ event_id: event.eventId });

  if (existing?.status === 'processed') {
    console.log(`Event ${event.eventId} already processed, skipping`);
    return;
  }

  // Insert or update inbox entry
  await db.eventInbox.upsert({
    event_id: event.eventId,
    status: 'pending',
  });

  try {
    await handleEvent(event);

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
      retry_count: existing?.retry_count + 1 || 1,
    });
    throw err;  // Let Bull retry
  }
}
```

---

## 5. SELL → Inventory Ledger Integration

### Problem
Inventory ledger references `sale_id` but no publisher defined.

### Solution
POS calls inventory-service on checkout.

```
┌─────────────────────────────────────────────────────────────────┐
│               SELL → INVENTORY INTEGRATION                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  POS App (Checkout)                                             │
│       │                                                          │
│       │ POST /api/v1/stores/{storeId}/inventory/transactions    │
│       │                                                          │
│       │ Request:                                                 │
│       │ {                                                        │
│       │   "type": "sale",                                       │
│       │   "referenceId": "sale-uuid-123",                       │
│       │   "items": [                                            │
│       │     { "productId": "uuid", "quantity": -2, "unitCost": 45 }│
│       │   ]                                                      │
│       │ }                                                        │
│       ▼                                                          │
│  inventory-service                                               │
│       │                                                          │
│       │ 1. Write ledger rows (delta_qty = -2)                   │
│       │ 2. Publish INVENTORY_CHANGED event                      │
│       │                                                          │
│       ▼                                                          │
│  reorder-service (via event)                                    │
│       │                                                          │
│       └─▶ Check if stock < threshold → create pending reorder   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### API Endpoint

```yaml
POST /api/v1/stores/{storeId}/inventory/transactions
Permission: store.inventory.transaction.write
Headers:
  X-Idempotency-Key: {sale-id}  # Prevents duplicate ledger writes

Request:
  type: "sale" | "sale_return" | "purchase_received" | "purchase_return" | "adjustment"
  referenceId: string  # sale_id, order_id, adjustment_id
  referenceType: "sale" | "purchase_order" | "adjustment"
  items:
    - productId: uuid
      quantity: number  # Negative for sale, positive for purchase
      unitCost: number  # Optional, for valuation
  notes?: string

Response:
  transactionId: uuid
  ledgerEntries: [...]
  stockAfter: { productId: qty, ... }
```

### POS Integration Code

```typescript
// src/services/checkout.ts
async function completeCheckout(saleId: string, items: CartItem[]) {
  // 1. Record sale in local/remote sale system
  const sale = await createSale(saleId, items);

  // 2. Update inventory
  await api.post(`/stores/${storeId}/inventory/transactions`, {
    type: 'sale',
    referenceId: saleId,
    referenceType: 'sale',
    items: items.map(item => ({
      productId: item.productId,
      quantity: -item.quantity,  // Negative for sale
      unitCost: item.sellPrice,
    })),
  }, {
    headers: {
      'X-Idempotency-Key': saleId,  // Idempotency!
    },
  });

  // 3. Generate receipt...
}
```

---

## 6. Returns & Corrections Flows

### Transaction Types

| Type | delta_qty | When |
|------|-----------|------|
| `sale` | Negative | Customer purchase |
| `sale_return` | Positive | Customer returns item |
| `purchase_received` | Positive | GRN from supplier |
| `purchase_return` | Negative | Return to supplier |
| `adjustment_add` | Positive | Stock correction (found) |
| `adjustment_remove` | Negative | Stock correction (damage/theft) |
| `opening_stock` | Positive | Initial inventory |
| `stock_take` | +/- | Cycle count adjustment |

### Purchase Return Flow

```
Store discovers damaged goods
    │
    ▼
POST /stores/{id}/purchase-orders/{orderId}/return
    │
    ├─▶ Create purchase_return record
    ├─▶ Write ledger entries (negative)
    ├─▶ Publish PURCHASE_RETURN_CREATED
    │
    ▼
Supplier receives notification
    │
    ▼
Supplier confirms/processes return
```

### Stock Take (Cycle Count) Flow

```
Store Admin initiates stock take
    │
    ▼
POST /stores/{id}/inventory/stock-take/start
    │
    ├─▶ Create stock_take record (pending)
    │
    ▼
Staff counts physical stock (via POS or Admin)
    │
    ▼
POST /stores/{id}/inventory/stock-take/{id}/submit
    │
    ├─▶ Calculate variance (physical - system)
    ├─▶ Write adjustment ledger entries
    ├─▶ Mark stock_take as completed
    ├─▶ Publish STOCK_TAKE_COMPLETED
    │
    ▼
Admin reviews adjustments in audit log
```

---

## 7. Enforcement Rules

### BUY Cart Validation Rules

```typescript
interface CartValidationResult {
  valid: boolean;
  errors: CartError[];
}

interface CartError {
  type: 'moq' | 'max_qty' | 'min_order_value' | 'unmapped' | 'out_of_stock';
  supplierId?: string;
  productId?: string;
  message: string;
}

function validateCart(cart: PurchaseCart): CartValidationResult {
  const errors: CartError[] = [];

  const bySupplier = groupBySupplier(cart.items);

  for (const [supplierId, items] of bySupplier) {
    const supplierLink = await getSupplierLink(supplierId);

    // 1. Enforce MOQ per item
    for (const item of items) {
      if (item.quantity < item.moq) {
        errors.push({
          type: 'moq',
          supplierId,
          productId: item.productId,
          message: `Minimum order quantity is ${item.moq}`,
        });
      }

      // 2. Enforce max quantity
      if (item.maxQty && item.quantity > item.maxQty) {
        errors.push({
          type: 'max_qty',
          supplierId,
          productId: item.productId,
          message: `Maximum order quantity is ${item.maxQty}`,
        });
      }

      // 3. Check if mapped
      if (!item.isMapped) {
        errors.push({
          type: 'unmapped',
          supplierId,
          productId: item.productId,
          message: `Product not available from this supplier`,
        });
      }
    }

    // 4. Enforce min order value per supplier
    const supplierTotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
    if (supplierTotal < supplierLink.minOrderValue) {
      errors.push({
        type: 'min_order_value',
        supplierId,
        message: `Minimum order value is ₹${supplierLink.minOrderValue}. Add ₹${supplierLink.minOrderValue - supplierTotal} more.`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
```

### Validation Trigger Points

| Action | Validation |
|--------|------------|
| Add to cart | Check MOQ, max_qty, mapping |
| Update quantity | Check MOQ, max_qty |
| Before submit | Full validation (all rules) |
| Place order API | Server-side re-validation |

---

## 8. Data Ownership: Schema per Service

### Strategy: Single Postgres, Multiple Schemas

```sql
-- Create schemas for each service
CREATE SCHEMA auth;
CREATE SCHEMA supplier;
CREATE SCHEMA catalog;
CREATE SCHEMA inventory;
CREATE SCHEMA orders;
CREATE SCHEMA reorder;
CREATE SCHEMA platform;  -- For stores, feature_flags

-- Example table locations
auth.users
auth.roles
auth.user_roles
auth.device_tokens

supplier.suppliers
supplier.supplier_sources
supplier.supplier_store_links

catalog.products
catalog.store_products
catalog.supplier_products
catalog.supplier_product_map

inventory.inventory_ledger
inventory.inventory_snapshots

orders.purchase_orders
orders.purchase_order_items
orders.order_events

reorder.reorder_policies
reorder.store_reorder_settings
reorder.pending_reorders

platform.stores
platform.feature_flags
```

### Ownership Rules

```
┌─────────────────────────────────────────────────────────────────┐
│                  DATA OWNERSHIP RULES                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Services only WRITE to their own schema                     │
│                                                                  │
│  2. Cross-service reads:                                        │
│     Option A: API call (preferred for isolation)                │
│     Option B: Read replica/view (performance critical)          │
│                                                                  │
│  3. Read-model/denormalized data:                               │
│     - Explicitly marked as "read-model"                         │
│     - Updated via events ONLY                                   │
│     - Example: store_products.current_stock                     │
│                                                                  │
│  4. Migrations:                                                  │
│     - Run per schema per service                                │
│     - Service owns its migration files                          │
│     - Migration runs BEFORE service start                       │
│                                                                  │
│  5. Cross-service foreign keys:                                 │
│     - AVOID direct FK to other schemas                          │
│     - Store ID as UUID, enforce via application                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Example: Migrations Directory Structure

```
backend/
├── services/
│   ├── auth-service/
│   │   └── migrations/
│   │       ├── 001_create_users.sql
│   │       ├── 002_create_roles.sql
│   │       └── 003_create_device_tokens.sql
│   ├── catalog-service/
│   │   └── migrations/
│   │       ├── 001_create_products.sql
│   │       ├── 002_create_supplier_products.sql
│   │       └── 003_create_mapping.sql
│   └── ...
```

---

## 9. Data Model Fixes

### Fix A: Remove `price_list_id` (No Table Defined)

```sql
-- Remove from supplier_store_links for now
-- Re-add when price_lists feature is built

ALTER TABLE supplier_store_links DROP COLUMN price_list_id;

-- OR define the table if needed:
CREATE TABLE supplier_price_lists (
    id UUID PRIMARY KEY,
    supplier_id UUID REFERENCES suppliers(id),
    name VARCHAR(100),
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE supplier_price_list_items (
    id UUID PRIMARY KEY,
    price_list_id UUID REFERENCES supplier_price_lists(id),
    supplier_product_id UUID REFERENCES supplier_products(id),
    price DECIMAL(10,2) NOT NULL,
    UNIQUE(price_list_id, supplier_product_id)
);
```

**Decision**: Remove for MVP, add later.

### Fix B: Mark `store_products.current_stock` as Read-Model

```sql
-- Add comment to clarify this is a read-model
COMMENT ON COLUMN store_products.current_stock IS
  'READ-MODEL: Updated via INVENTORY_CHANGED events.
   Source of truth is inventory_ledger.
   Do not write directly.';
```

Update code to:
1. Never write `current_stock` directly
2. Update only via event handler
3. Always query inventory-service for accurate stock

### Fix C: Fix `supplier_product_map` Uniqueness

```sql
-- Current (allows same supplier_product to map to multiple products):
-- UNIQUE(supplier_product_id, product_id)

-- Fixed (one supplier product = one unified product):
ALTER TABLE supplier_product_map
  DROP CONSTRAINT supplier_product_map_supplier_product_id_product_id_key;

ALTER TABLE supplier_product_map
  ADD CONSTRAINT supplier_product_map_supplier_product_unique
  UNIQUE(supplier_product_id);

-- Add index for reverse lookup (product → supplier products)
CREATE INDEX idx_supplier_product_map_product
  ON supplier_product_map(product_id);
```

---

## 10. Operational Details

### Database Migration Strategy

```bash
# Migration runs BEFORE service start

# docker-compose.yml
services:
  auth-service:
    command: >
      sh -c "npm run migrate:up && npm start"
    depends_on:
      postgres:
        condition: service_healthy

# Or use init container in Kubernetes
```

### Backup & Restore

```bash
# Daily backup (cron job on VM)
0 2 * * * /opt/scripts/backup-db.sh

# backup-db.sh
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/backups/postgres
BACKUP_FILE=$BACKUP_DIR/supermandi_$TIMESTAMP.sql.gz

pg_dump -h localhost -U postgres supermandi | gzip > $BACKUP_FILE

# Keep last 7 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete

# Upload to GCS (optional)
gsutil cp $BACKUP_FILE gs://supermandi-backups/postgres/

# Restore command
gunzip -c $BACKUP_FILE | psql -h localhost -U postgres supermandi
```

### Log Retention

```yaml
# docker-compose.yml logging config
services:
  auth-service:
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "5"

# Retention policy:
# - Container logs: 5 files × 100MB = 500MB per service
# - Application logs: 7 days
# - Audit logs: 90 days (regulatory)
```

### Dead Letter Queue (DLQ) Monitoring

```typescript
// DLQ setup in Bull
const orderQueue = new Bull('order-events', {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: false,  // Keep for inspection
  },
});

// DLQ processor - move to dedicated DLQ
orderQueue.on('failed', async (job, err) => {
  if (job.attemptsMade >= job.opts.attempts) {
    // Move to DLQ
    await dlqQueue.add('dead-letter', {
      originalQueue: 'order-events',
      jobId: job.id,
      data: job.data,
      error: err.message,
      failedAt: new Date(),
    });

    // Alert
    await sendAlert(`DLQ: Job ${job.id} failed after ${job.attemptsMade} attempts`);
  }
});

// DLQ reprocessing endpoint (Superadmin)
// POST /api/v1/admin/dlq/{jobId}/reprocess
```

---

## 11. New Tickets

### P0 (Critical)

#### TICKET-028: Stores Table + Service
**Type**: Backend | **Priority**: P0 | **Estimate**: 3 days | **Sprint**: 1

```
Acceptance Criteria:
- [ ] Create stores table in platform schema
- [ ] CRUD endpoints for stores (superadmin)
- [ ] Store status management (active, suspended)
- [ ] Migrate all store_id to UUID type
- [ ] Add store_id FK constraints where needed
```

---

#### TICKET-029: Idempotency Keys
**Type**: Backend | **Priority**: P0 | **Estimate**: 3 days | **Sprint**: 5

```
Acceptance Criteria:
- [ ] Create idempotency_keys table
- [ ] Idempotency middleware for write endpoints
- [ ] Add to: POST /purchase-orders
- [ ] Add to: POST /purchase-orders/{id}/receive
- [ ] Add to: POST /inventory/adjust
- [ ] Add to: POST /inventory/transactions
- [ ] Add to: POST /reorder/pending/approve
- [ ] TTL cleanup job (24 hours)
- [ ] Client SDK sends X-Idempotency-Key header
```

---

#### TICKET-030: Event Inbox + Consumer Dedup
**Type**: Backend | **Priority**: P0 | **Estimate**: 3 days | **Sprint**: 6

```
Acceptance Criteria:
- [ ] Create event_inbox table in each consumer service
- [ ] Dedup check before processing
- [ ] Retry tracking (count, last error)
- [ ] Status: pending, processed, failed
- [ ] Prevent reprocessing of completed events
- [ ] Add to: inventory-service (SALE_COMPLETED, PO_RECEIVED)
- [ ] Add to: reorder-service (INVENTORY_CHANGED)
- [ ] Add to: catalog-service (SUPPLIER_LINKED)
```

---

#### TICKET-031: SELL → Inventory Integration
**Type**: Backend + Frontend | **Priority**: P0 | **Estimate**: 4 days | **Sprint**: 3

```
Acceptance Criteria:
- [ ] POST /inventory/transactions endpoint
- [ ] Support type: sale, sale_return, purchase_received, adjustment
- [ ] Idempotency via sale_id
- [ ] Write ledger rows with correct delta_qty
- [ ] Publish INVENTORY_CHANGED event
- [ ] Update POS checkout to call endpoint
- [ ] Handle offline: queue transactions, sync on reconnect
```

---

### P1 (High Priority)

#### TICKET-032: Feature Flags Storage + APIs
**Type**: Backend | **Priority**: P1 | **Estimate**: 3 days | **Sprint**: 11

```
Acceptance Criteria:
- [ ] Create feature_flags table
- [ ] GET /config/flags (for POS/apps)
- [ ] PUT /admin/flags (superadmin)
- [ ] Scope resolution: store > global
- [ ] Cache flags in Redis (5 min TTL)
- [ ] Wire to Superadmin Portal UI
```

---

#### TICKET-033: CSV Upload Pipeline
**Type**: Backend | **Priority**: P1 | **Estimate**: 4 days | **Sprint**: 10

```
Acceptance Criteria:
- [ ] File upload endpoint (multipart)
- [ ] Store file in local storage or S3
- [ ] Background job for processing
- [ ] Validation with detailed error report
- [ ] Import results: success count, failed rows
- [ ] Support: supplier catalog CSV
- [ ] Error report downloadable
```

---

#### TICKET-034: Cart Validation (MOQ, Min Order Value)
**Type**: Frontend + Backend | **Priority**: P1 | **Estimate**: 3 days | **Sprint**: 8

```
Acceptance Criteria:
- [ ] Frontend: Validate MOQ on add/update
- [ ] Frontend: Validate max_qty on add/update
- [ ] Frontend: Show min order value warning per supplier
- [ ] Frontend: Block submit if validation fails
- [ ] Backend: Re-validate on POST /purchase-orders
- [ ] Backend: Return detailed validation errors
- [ ] Clear error messages in UI
```

---

### P2 (Medium Priority)

#### TICKET-035: Returns (Purchase + Sale)
**Type**: Backend + Frontend | **Priority**: P2 | **Estimate**: 5 days | **Sprint**: 11

```
Acceptance Criteria:
- [ ] POST /purchase-orders/{id}/return
- [ ] Purchase return creates negative ledger entries
- [ ] Supplier notification of return
- [ ] Sale return via inventory transaction
- [ ] Return reason tracking
- [ ] Return history in order detail
```

---

#### TICKET-036: Stock Take (Cycle Count)
**Type**: Backend + Frontend | **Priority**: P2 | **Estimate**: 5 days | **Sprint**: 12

```
Acceptance Criteria:
- [ ] POST /inventory/stock-take/start
- [ ] Record physical counts per product
- [ ] POST /inventory/stock-take/{id}/submit
- [ ] Calculate variance, create adjustment entries
- [ ] Audit log of all adjustments
- [ ] Stock take history
- [ ] Store Admin UI for stock take
```

---

#### TICKET-037: Observability Upgrade
**Type**: DevOps | **Priority**: P2 | **Estimate**: 4 days | **Sprint**: 12

```
Acceptance Criteria:
- [ ] Prometheus metrics endpoint per service
- [ ] Grafana dashboard setup
- [ ] Key metrics: request rate, error rate, latency
- [ ] Alert rules: high error rate, DLQ growth
- [ ] DLQ dashboard in Superadmin Portal
- [ ] Correlation-ID visible in logs
- [ ] Log aggregation (basic ELK or Loki)
```

---

## 12. RBAC Permission Split

### Problem
`store.inventory.write` is too broad - staff could adjust stock silently.

### Solution
Split inventory permissions:

```typescript
// Old (too broad)
"store.inventory.write"

// New (split)
"store.inventory.transaction.write"  // Sale, GRN (normal operations)
"store.inventory.adjust.write"       // Manual adjustments (admin only)
```

### Updated Role Permissions

```typescript
const roles = {
  STORE_STAFF: [
    "store.catalog.read",
    "store.orders.read",
    "store.orders.write",
    "store.inventory.read",
    "store.inventory.transaction.write",  // Can record sales, GRN
    // NOT: store.inventory.adjust.write   // Cannot adjust stock
    "store.reorder.read",
    "store.suppliers.read",
  ],

  STORE_ADMIN: [
    // All STORE_STAFF permissions, plus:
    "store.catalog.write",
    "store.inventory.adjust.write",       // Can adjust stock
    "store.reorder.write",
    "store.suppliers.write",
  ],
};
```

### Endpoint Permission Mapping

| Endpoint | Permission |
|----------|------------|
| POST /inventory/transactions (sale) | store.inventory.transaction.write |
| POST /inventory/transactions (GRN) | store.inventory.transaction.write |
| POST /inventory/adjust | store.inventory.adjust.write |
| POST /inventory/stock-take | store.inventory.adjust.write |

---

## Summary: All New Tickets

| ID | Title | Priority | Sprint | Days |
|----|-------|----------|--------|------|
| TICKET-028 | Stores Table + Service | P0 | 1 | 3 |
| TICKET-029 | Idempotency Keys | P0 | 5 | 3 |
| TICKET-030 | Event Inbox + Consumer Dedup | P0 | 6 | 3 |
| TICKET-031 | SELL → Inventory Integration | P0 | 3 | 4 |
| TICKET-032 | Feature Flags Storage + APIs | P1 | 11 | 3 |
| TICKET-033 | CSV Upload Pipeline | P1 | 10 | 4 |
| TICKET-034 | Cart Validation (MOQ, Min) | P1 | 8 | 3 |
| TICKET-035 | Returns (Purchase + Sale) | P2 | 11 | 5 |
| TICKET-036 | Stock Take (Cycle Count) | P2 | 12 | 5 |
| TICKET-037 | Observability Upgrade | P2 | 12 | 4 |

**Total New Tickets**: 10
**Total All Tickets**: 37 (27 + 10)
**Revised Duration**: 14 weeks (12 + 2 buffer)

---

## Checklist: Apply These Changes

- [ ] Add `stores` table to TICKET-001
- [ ] Change all `store_id VARCHAR` to `store_id UUID`
- [ ] Add `feature_flags` table to platform schema
- [ ] Add internal auth strategy section to main doc
- [ ] Add `idempotency_keys` table to services
- [ ] Add `event_inbox` table to consumer services
- [ ] Add SELL integration endpoint to inventory-service
- [ ] Split inventory permissions in roles
- [ ] Fix `supplier_product_map` uniqueness constraint
- [ ] Remove or define `price_list_id`
- [ ] Mark `current_stock` as read-model
- [ ] Add operational details (backup, logs, DLQ)
- [ ] Add new tickets 028-037

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 2.0.0 | 2026-01-12 | Microservices, RBAC, events |
| 2.1.0 | 2026-01-12 | Tenancy, idempotency, SELL integration, returns, validations, operational details |
