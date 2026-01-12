# SuperMandi REORDER System - Master Development Tickets

**Version**: 1.1.0 (V3.0.9 Critical Fixes Applied)
**Date**: 2026-01-12
**Total Tickets**: 53 (MVP: 39, Post-MVP: 14)
**Estimated Duration**: 12 weeks (6 sprints)

---

## V3.0.9 Critical Fixes Applied

| Fix | Description | Affected Tickets |
|-----|-------------|------------------|
| **Bull Fanout** | Each consumer gets own queue (inventory-events.catalog, inventory-events.reorder) | DEV-027, DEV-029 |
| **platform-service** | Added as separate service (port 3008) for stores + flags | DEV-013 |
| **Barcode Canonical** | product_barcodes is truth, products.primary_barcode is cache | DEV-007, DEV-026 |
| **SQL Bug Fix** | Operator precedence in chk_order_item_bounds | DEV-008 |
| **Submit Endpoint** | POST /purchase-orders/{id}/submit added | DEV-020 |
| **GRN Filters** | GET /purchase-orders with multi-status filter | DEV-019 |
| **Idempotency Processing** | 409 IDEMPOTENCY_IN_PROGRESS for concurrent requests | DEV-017 |
| **Golden Path Test** | Automated end-to-end test before UI | DEV-048 |

---

## How to Use This Document

1. Find the ticket you want to implement by number (e.g., `DEV-001`)
2. Tell Claude: "Execute DEV-001"
3. Claude will implement the complete ticket scope

---

## Sprint Overview

| Sprint | Focus | Tickets | Duration |
|--------|-------|---------|----------|
| 1 | Infrastructure + Foundation | DEV-001 to DEV-008 | 2 weeks |
| 2 | Auth + Inventory + SELL | DEV-009 to DEV-016 | 2 weeks |
| 3 | Orders + Suppliers + Catalog | DEV-017 to DEV-026 | 2 weeks |
| 4 | Reorder + Events + Cron | DEV-027 to DEV-034 | 2 weeks |
| 5 | POS Frontend (BUY + REORDER) | DEV-035 to DEV-042 | 2 weeks |
| 6 | GRN + Polish + Testing | DEV-043 to DEV-052 | 2 weeks |

---

## SPRINT 1: Infrastructure + Foundation

### DEV-001: Backend Monorepo Setup
**Type**: Infrastructure
**Priority**: P0-Critical
**Estimate**: 4 hours
**Depends On**: None

**Scope**:
- Create `backend/` folder structure with workspaces
- Setup pnpm workspaces for monorepo
- Create base `package.json` with shared dependencies
- Setup TypeScript configuration (base + per-service)
- Setup ESLint + Prettier configuration
- Create `docker-compose.yml` for PostgreSQL + Redis
- Create `.env.example` with all environment variables
- Setup `nodemon` for development

**Files to Create**:
```
backend/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .eslintrc.js
├── .prettierrc
├── docker-compose.yml
├── .env.example
└── services/
    └── .gitkeep
```

**Acceptance Criteria**:
- [ ] `pnpm install` works from root
- [ ] `docker-compose up -d` starts PostgreSQL + Redis
- [ ] TypeScript compiles without errors
- [ ] ESLint passes

---

### DEV-002: Shared Library - Types & DTOs
**Type**: Backend Library
**Priority**: P0-Critical
**Estimate**: 3 hours
**Depends On**: DEV-001

**Scope**:
- Create `backend/shared/` package
- Define all TypeScript interfaces/types
- Define all DTOs with Zod validation
- Define API error envelope type
- Define domain event envelope type
- Export everything from index.ts

**Files to Create**:
```
backend/shared/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── types/
│   │   ├── auth.types.ts
│   │   ├── store.types.ts
│   │   ├── supplier.types.ts
│   │   ├── catalog.types.ts
│   │   ├── inventory.types.ts
│   │   ├── order.types.ts
│   │   └── reorder.types.ts
│   ├── dto/
│   │   ├── auth.dto.ts
│   │   ├── inventory.dto.ts
│   │   ├── order.dto.ts
│   │   └── reorder.dto.ts
│   ├── errors/
│   │   └── ApiError.ts
│   └── events/
│       └── DomainEvent.ts
```

**Key Types**:
- `ApiError { code, message, details?, field?, requestId }`
- `DomainEvent<T> { eventId, eventType, occurredAt, correlationId, producer, payload }`
- All entity interfaces (User, Store, Supplier, Product, etc.)

**Acceptance Criteria**:
- [ ] All types compile without errors
- [ ] Zod schemas validate correctly
- [ ] Package exports work from other services

---

### DEV-003: Shared Library - Database Utilities
**Type**: Backend Library
**Priority**: P0-Critical
**Estimate**: 3 hours
**Depends On**: DEV-001

**Scope**:
- Create database connection pool utility (pg)
- Create transaction wrapper with rollback
- Create migration runner utility
- Create UUID generation helper (uses pgcrypto)
- Create timestamp helper (always TIMESTAMPTZ)

**Files to Create**:
```
backend/shared/src/
├── db/
│   ├── index.ts
│   ├── pool.ts
│   ├── transaction.ts
│   └── migrate.ts
└── utils/
    ├── uuid.ts
    └── timestamp.ts
```

**Acceptance Criteria**:
- [ ] Can connect to PostgreSQL
- [ ] Transactions commit/rollback correctly
- [ ] Migrations run up/down

---

### DEV-004: Platform Schema Migration
**Type**: Database
**Priority**: P0-Critical
**Estimate**: 2 hours
**Depends On**: DEV-003

**Scope**:
- Create `platform` schema
- Create `platform.stores` table
- Create `platform.feature_flags` table with partial indexes
- Add CHECK constraints for scope consistency
- Seed sample store for development

**Files to Create**:
```
backend/migrations/
├── 000_extensions.sql      -- pgcrypto, pg_trgm
└── 001_platform_schema.sql
```

**Table: platform.stores**:
- id UUID PRIMARY KEY
- name, code (UNIQUE), phone, email
- address fields (line1, city, state, pincode)
- timezone DEFAULT 'Asia/Kolkata'
- status DEFAULT 'active'
- created_at, updated_at TIMESTAMPTZ

**Table: platform.feature_flags**:
- id UUID PRIMARY KEY
- flag_key, scope_type, scope_id
- enabled BOOLEAN, payload_json JSONB
- Partial indexes: ux_flags_global, ux_flags_scoped
- CHECK constraint: chk_flags_scope

**Acceptance Criteria**:
- [ ] Schema created successfully
- [ ] Partial indexes work correctly
- [ ] Sample store seeded

---

### DEV-005: Auth Schema Migration
**Type**: Database
**Priority**: P0-Critical
**Estimate**: 3 hours
**Depends On**: DEV-004

**Scope**:
- Create `auth` schema
- Create `auth.users` table with CHECK constraints
- Create `auth.roles` table
- Create `auth.user_roles` table with partial indexes
- Create `auth.device_tokens` table
- Create `auth.refresh_tokens` table
- Create `auth.password_reset_tokens` table
- Seed 5 default roles with permissions

**Files to Create**:
```
backend/migrations/
└── 002_auth_schema.sql
```

**Constraints**:
- chk_users_actor (actor_type/actor_id consistency)
- chk_users_identifier (email OR phone required)
- Partial indexes for NULL-safe uniqueness

**Default Roles to Seed**:
1. STORE_STAFF
2. STORE_ADMIN
3. SUPPLIER_STAFF
4. SUPPLIER_ADMIN
5. SUPERADMIN

**Acceptance Criteria**:
- [ ] All tables created
- [ ] CHECK constraints work
- [ ] 5 roles seeded with correct permissions (::jsonb cast)

---

### DEV-006: Supplier Schema Migration
**Type**: Database
**Priority**: P0-Critical
**Estimate**: 2 hours
**Depends On**: DEV-004

**Scope**:
- Create `supplier` schema
- Create `supplier.suppliers` table
- Create `supplier.supplier_store_links` table with bounds constraints
- Create `supplier.supplier_requests` table
- Create `supplier.event_outbox` table
- Add all required indexes

**Files to Create**:
```
backend/migrations/
└── 003_supplier_schema.sql
```

**Constraints**:
- chk_store_link_bounds (credit_days >= 0, min_order_value >= 0, etc.)
- UNIQUE(supplier_id, store_id) on links

**Acceptance Criteria**:
- [ ] All tables created
- [ ] GSTIN unique constraint works
- [ ] Bounds constraints prevent invalid data

---

### DEV-007: Catalog Schema Migration
**Type**: Database
**Priority**: P0-Critical
**Estimate**: 3 hours
**Depends On**: DEV-004

**Scope**:
- Create `catalog` schema
- Create `catalog.products` table with barcode indexes
- Create `catalog.product_barcodes` normalized table
- Create `catalog.store_products` table (sell_price NULLABLE)
- Create `catalog.supplier_products` table
- Create `catalog.supplier_product_map` table (BUYABILITY GATE)
- Create `catalog.catalog_mapping_log` table
- Create `catalog.event_inbox` table
- Add trigram indexes for search

**Files to Create**:
```
backend/migrations/
└── 004_catalog_schema.sql
```

**Key Indexes**:
- ux_products_primary_barcode (partial unique)
- idx_products_name_trgm, idx_products_brand_trgm (trigram)
- idx_supplier_products_barcode
- ux_product_barcodes_barcode (global unique)

**Acceptance Criteria**:
- [ ] All tables created
- [ ] Trigram search works
- [ ] Barcode uniqueness enforced

---

### DEV-008: Inventory, Orders, Reorder Schema Migration
**Type**: Database
**Priority**: P0-Critical
**Estimate**: 4 hours
**Depends On**: DEV-004

**Scope**:
- Create `inventory` schema with ledger tables
- Create `orders` schema with PO tables
- Create `reorder` schema with policy tables
- Add all CHECK constraints for status fields
- Add all idempotency_keys tables
- Add all event_inbox/outbox tables

**Files to Create**:
```
backend/migrations/
├── 005_inventory_schema.sql
├── 006_orders_schema.sql
└── 007_reorder_schema.sql
```

**inventory schema**:
- inventory_ledger (APPEND-ONLY, reference_sub_id for partial GRN)
- stock_balances (FOR UPDATE locking)
- idempotency_keys, event_inbox, event_outbox

**orders schema**:
- purchase_orders, purchase_order_items
- order_events, order_sequences
- idempotency_keys, event_outbox
- chk_po_status, chk_order_item_bounds

**reorder schema**:
- reorder_policies, store_reorder_settings
- pending_reorders (ux_pending_reorders_active partial unique)
- reorder_runs
- idempotency_keys, event_inbox, event_outbox
- chk_pending_reorders_status, chk_reorder_policy_bounds

**Acceptance Criteria**:
- [ ] All schemas/tables created
- [ ] All CHECK constraints work
- [ ] Partial unique index on pending_reorders works

---

## SPRINT 2: Auth + Inventory + SELL

### DEV-009: API Gateway Service Setup
**Type**: Backend Service
**Priority**: P0-Critical
**Estimate**: 4 hours
**Depends On**: DEV-001, DEV-002

**Scope**:
- Create `backend/services/api-gateway/` service
- Setup Express.js with middleware
- Implement request logging
- Implement correlation-ID generation
- Implement rate limiting
- Setup health check endpoint
- Configure proxy routes to all services

**Files to Create**:
```
backend/services/api-gateway/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── config.ts
│   ├── middleware/
│   │   ├── correlationId.ts
│   │   ├── requestLogger.ts
│   │   └── rateLimiter.ts
│   └── routes/
│       └── proxy.ts
```

**Endpoints**:
- GET /healthz
- Proxy all /api/v1/* to respective services

**Acceptance Criteria**:
- [ ] Gateway starts on port 3000
- [ ] Correlation-ID added to all requests
- [ ] Health check returns 200

---

### DEV-010: Auth Service - User & Role CRUD
**Type**: Backend Service
**Priority**: P0-Critical
**Estimate**: 5 hours
**Depends On**: DEV-005, DEV-002, DEV-003

**Scope**:
- Create `backend/services/auth-service/` service
- Implement user CRUD (internal only)
- Implement role management
- Implement password hashing (bcrypt)
- Implement user-role assignment
- Setup database connection

**Files to Create**:
```
backend/services/auth-service/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── config.ts
│   ├── db/
│   │   └── queries.ts
│   ├── services/
│   │   ├── userService.ts
│   │   └── roleService.ts
│   └── routes/
│       └── internal.ts
```

**Acceptance Criteria**:
- [ ] Can create users with hashed password
- [ ] Can assign roles to users
- [ ] Password hashing uses bcrypt

---

### DEV-011: Auth Service - Login & JWT
**Type**: Backend Service
**Priority**: P0-Critical
**Estimate**: 4 hours
**Depends On**: DEV-010

**Scope**:
- Implement POST /auth/login (email/phone + password)
- Implement JWT generation with claims
- JWT payload: userId, actorType, actorId, permissions[]
- Access token expiry: 15 minutes
- Store refresh token hash in database

**Files to Create**:
```
backend/services/auth-service/src/
├── services/
│   └── jwtService.ts
└── routes/
    └── auth.ts
```

**JWT Claims**:
```typescript
{
  sub: userId,
  actorType: 'store' | 'supplier' | 'platform',
  actorId: UUID | null,
  permissions: string[],
  iat, exp
}
```

**Acceptance Criteria**:
- [ ] Login returns access + refresh tokens
- [ ] JWT contains correct claims
- [ ] Refresh token stored as hash

---

### DEV-012: Auth Service - Refresh & RBAC Middleware
**Type**: Backend Service
**Priority**: P0-Critical
**Estimate**: 4 hours
**Depends On**: DEV-011

**Scope**:
- Implement POST /auth/refresh
- Implement GET /auth/me
- Create RBAC middleware: `requirePermission(permission)`
- Create JWT verification middleware
- Implement token revocation

**Files to Create**:
```
backend/services/auth-service/src/
├── middleware/
│   ├── authenticate.ts
│   └── authorize.ts
└── routes/
    └── auth.ts (add refresh, me)
```

**Export for Other Services**:
- `verifyJwt()` - validates JWT signature
- `requirePermission()` - checks permission in JWT

**Acceptance Criteria**:
- [ ] Refresh returns new access token
- [ ] /me returns user with permissions
- [ ] Middleware blocks unauthorized requests

---

### DEV-013: Platform Service + Feature Flags API
**Type**: Backend Service
**Priority**: P0-Critical
**Estimate**: 5 hours
**Depends On**: DEV-004, DEV-012

**V3.0.9**: platform-service is a SEPARATE SERVICE (port 3008), not part of api-gateway.
It owns the platform.* schema (stores, feature_flags).

**Scope**:
- Create `backend/services/platform-service/` service (PORT 3008)
- Implement CRUD for platform.stores
- Implement feature flags routes
- GET /stores/{storeId}/flags - returns enabled flags
- GET /stores/{storeId} - store details
- POST /stores - create store (SUPERADMIN)
- PUT /admin/flags - set flag (SUPERADMIN only)
- Implement scope resolution (global → store → supplier)

**Files to Create**:
```
backend/services/platform-service/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── config.ts               # PORT 3008
│   ├── db/
│   │   └── queries.ts
│   ├── routes/
│   │   ├── stores.ts           # Store CRUD
│   │   ├── flags.ts            # Feature flags
│   │   └── internal.ts         # Internal APIs (store code lookup)
│   └── services/
│       ├── storeService.ts
│       └── flagService.ts
```

**Endpoints**:
- GET /stores/{storeId} - Store details (for order-service to get store code)
- GET /stores/{storeId}/flags - Enabled flags for store
- POST /admin/stores - Create store (SUPERADMIN)
- PUT /admin/flags - Set flag (SUPERADMIN)

**Acceptance Criteria**:
- [ ] Platform-service runs on port 3008
- [ ] Store can fetch its enabled flags
- [ ] Store details accessible for PO number generation
- [ ] Superadmin can set global/scoped flags
- [ ] Scope resolution works correctly (global → store → supplier)

---

### DEV-014: Inventory Service - Ledger Core
**Type**: Backend Service
**Priority**: P0-Critical
**Estimate**: 6 hours
**Depends On**: DEV-008, DEV-012

**Scope**:
- Create `backend/services/inventory-service/` service
- Implement inventory_ledger append-only writes
- Implement stock_balances maintenance (FOR UPDATE)
- Implement get_current_stock() function
- Implement stock lookup endpoints

**Files to Create**:
```
backend/services/inventory-service/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── config.ts
│   ├── db/
│   │   └── queries.ts
│   ├── services/
│   │   └── ledgerService.ts
│   └── routes/
│       └── inventory.ts
```

**Endpoints**:
- GET /stores/{storeId}/inventory
- GET /stores/{storeId}/inventory/{productId}

**Acceptance Criteria**:
- [ ] Stock = SUM(delta_qty) from ledger
- [ ] stock_balances updated atomically
- [ ] FOR UPDATE prevents race conditions

---

### DEV-015: Inventory Service - Transactions API
**Type**: Backend Service
**Priority**: P0-Critical
**Estimate**: 5 hours
**Depends On**: DEV-014

**Scope**:
- Implement POST /stores/{storeId}/inventory/transactions
- Implement POST /stores/{storeId}/inventory/adjust
- Quantity sign rule: client positive, service applies sign
- Write to event_outbox in same transaction
- INTEGER quantities only (no decimals)

**Files to Create**:
```
backend/services/inventory-service/src/
├── services/
│   └── transactionService.ts
└── routes/
    └── transactions.ts
```

**Transaction Types**:
- `sale` → -quantity (decrease)
- `sale_return` → +quantity (increase)
- `purchase_received` → +quantity (increase)
- `adjustment` → ±quantity (as specified)

**Acceptance Criteria**:
- [ ] Sale decrements stock correctly
- [ ] GRN increments stock correctly
- [ ] Event written to outbox
- [ ] Rejects non-integer quantities

---

### DEV-016: SELL → Inventory Integration (POS)
**Type**: Frontend + Backend
**Priority**: P0-Critical
**Estimate**: 5 hours
**Depends On**: DEV-015

**Scope**:
- Update POS checkout flow to call inventory API
- Send POST /inventory/transactions with type='sale'
- Use receipt ID as idempotency key
- Update sellCartStore to use real stock
- Handle API errors gracefully

**Files to Modify**:
```
supermandi-pos/src/
├── services/
│   └── checkoutService.ts
├── stores/
│   └── sellCartStore.ts
└── screens/
    └── SellScreen.tsx (update)
```

**Acceptance Criteria**:
- [ ] Checkout calls inventory API
- [ ] Stock deducted on successful sale
- [ ] Cart shows real-time stock
- [ ] Error toast on API failure

---

## SPRINT 3: Orders + Suppliers + Catalog

### DEV-017: Idempotency Keys Middleware
**Type**: Backend Library
**Priority**: P0-Critical
**Estimate**: 4 hours
**Depends On**: DEV-002, DEV-003
**V3.0.9 Fix**: Added IDEMPOTENCY_IN_PROGRESS error code for concurrent requests

**Scope**:
- Create idempotency middleware for all mutation endpoints
- Check X-Idempotency-Key header
- Store request_hash (SHA256 of body)
- Return cached response on duplicate key + same hash
- Return 409 IDEMPOTENCY_CONFLICT on duplicate key + different hash
- Return 409 IDEMPOTENCY_IN_PROGRESS on duplicate key + processing state
- Add status column (processing/completed/failed)

**Files to Create**:
```
backend/packages/common/src/
└── middleware/
    └── idempotency.ts
```

**Logic**:
1. Before handler: check if key exists in `idempotency_keys` table
2. If exists + same hash + completed → return cached response
3. If exists + different hash → return 409 IDEMPOTENCY_CONFLICT
4. If exists + processing → return 409 IDEMPOTENCY_IN_PROGRESS with retryAfter: 1
5. If not exists → INSERT with status='processing', execute handler
6. After handler success: UPDATE status='completed', cache response
7. After handler failure: UPDATE status='failed'

**Error Codes**:
```typescript
// Different body with same key
{
  status: 409,
  code: 'IDEMPOTENCY_CONFLICT',
  message: 'Request body differs from original request with this key.'
}

// Concurrent request still processing
{
  status: 409,
  code: 'IDEMPOTENCY_IN_PROGRESS',
  message: 'Request with this idempotency key is still being processed.',
  retryAfter: 1  // seconds
}
```

**Implementation**:
```typescript
export async function idempotencyMiddleware(req: Request, res: Response, next: NextFunction) {
  const idempotencyKey = req.headers['x-idempotency-key'];
  if (!idempotencyKey) return next();

  const requestHash = sha256(JSON.stringify(req.body));

  const existing = await db.idempotencyKeys.findByKey(idempotencyKey);

  if (existing) {
    if (existing.request_hash !== requestHash) {
      return res.status(409).json({
        status: 409,
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'Request body differs from original request with this key.'
      });
    }
    if (existing.status === 'processing') {
      return res.status(409).json({
        status: 409,
        code: 'IDEMPOTENCY_IN_PROGRESS',
        message: 'Request with this idempotency key is still being processed.',
        retryAfter: 1
      });
    }
    if (existing.status === 'completed') {
      return res.status(existing.response_status).json(existing.response_body);
    }
  }

  // Insert with processing status
  await db.idempotencyKeys.create({
    idempotency_key: idempotencyKey,
    request_hash: requestHash,
    status: 'processing',
    created_at: new Date()
  });

  // Wrap response to capture result
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    db.idempotencyKeys.markCompleted(idempotencyKey, res.statusCode, body);
    return originalJson(body);
  };

  next();
}
```

**Acceptance Criteria**:
- [ ] Duplicate requests return cached response
- [ ] Different body returns 409 IDEMPOTENCY_CONFLICT
- [ ] Concurrent requests return 409 IDEMPOTENCY_IN_PROGRESS with retryAfter
- [ ] Processing status prevents race conditions
- [ ] Failed requests allow retry with same key

---

### DEV-018: Order Service - Core Setup
**Type**: Backend Service
**Priority**: P0-Critical
**Estimate**: 4 hours
**Depends On**: DEV-008, DEV-012

**Scope**:
- Create `backend/services/order-service/` service
- Setup database connection
- Implement order number generation (PO-{storeCode}-{YY}-{seq})
- Use order_sequences with FOR UPDATE for atomic increment

**Files to Create**:
```
backend/services/order-service/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── config.ts
│   ├── db/
│   │   └── queries.ts
│   └── services/
│       └── orderNumberService.ts
```

**Order Number Format**:
`PO-MUM01-26-000001` where:
- MUM01 = store code
- 26 = year (2026)
- 000001 = sequence per store per year

**Acceptance Criteria**:
- [ ] Order numbers generated atomically
- [ ] No duplicate order numbers
- [ ] Sequence resets per year

---

### DEV-019: Order Service - Create & List POs
**Type**: Backend Service
**Priority**: P0-Critical
**Estimate**: 5 hours
**Depends On**: DEV-018
**V3.0.9 Fix**: Added multi-status filter support for GET endpoint

**Scope**:
- Implement POST /stores/{storeId}/purchase-orders
- Implement POST /stores/{storeId}/purchase-orders/from-reorders
- Implement GET /stores/{storeId}/purchase-orders (with multi-status filter)
- Implement GET /stores/{storeId}/purchase-orders/{id}
- Write to event_outbox on create

**Files to Create**:
```
backend/services/order-service/src/
├── services/
│   └── purchaseOrderService.ts
└── routes/
    └── purchaseOrders.ts
```

**Multi-Status Filter**:
```
GET /stores/{storeId}/purchase-orders?status=submitted,confirmed,shipped
```

Query parameters:
- `status` (optional): Comma-separated list of statuses to include
- `supplierId` (optional): Filter by supplier UUID
- `from` (optional): ISO date for created_at >=
- `to` (optional): ISO date for created_at <=
- `page` (default: 1): Page number
- `limit` (default: 20, max: 100): Items per page

**Implementation**:
```typescript
// routes/purchaseOrders.ts
router.get('/stores/:storeId/purchase-orders', async (req, res) => {
  const { storeId } = req.params;
  const { status, supplierId, from, to, page = '1', limit = '20' } = req.query;

  // Parse multi-status filter
  const statuses = status ? (status as string).split(',').map(s => s.trim()) : null;

  const orders = await purchaseOrderService.list({
    storeId,
    statuses,           // Array of statuses or null for all
    supplierId,
    dateRange: { from, to },
    pagination: { page: parseInt(page), limit: Math.min(parseInt(limit), 100) }
  });

  res.json({
    data: orders.items,
    pagination: {
      page: orders.page,
      limit: orders.limit,
      total: orders.total,
      hasMore: orders.page * orders.limit < orders.total
    }
  });
});

// services/purchaseOrderService.ts
async list(filters: ListFilters) {
  let query = db.purchaseOrders.where({ store_id: filters.storeId });

  if (filters.statuses?.length) {
    query = query.whereIn('status', filters.statuses);
  }
  if (filters.supplierId) {
    query = query.where({ supplier_id: filters.supplierId });
  }
  if (filters.dateRange?.from) {
    query = query.where('created_at', '>=', filters.dateRange.from);
  }
  if (filters.dateRange?.to) {
    query = query.where('created_at', '<=', filters.dateRange.to);
  }

  const total = await query.clone().count();
  const items = await query
    .orderBy('created_at', 'desc')
    .offset((filters.pagination.page - 1) * filters.pagination.limit)
    .limit(filters.pagination.limit);

  return { items, total, ...filters.pagination };
}
```

**Acceptance Criteria**:
- [ ] Can create PO from cart items
- [ ] Can create PO from approved reorders
- [ ] Multi-status filter works (e.g., `?status=submitted,confirmed`)
- [ ] All filter combinations work together
- [ ] Pagination returns correct totals
- [ ] Event written to outbox

---

### DEV-020: Order Service - Status Transitions
**Type**: Backend Service
**Priority**: P0-Critical
**Estimate**: 4 hours
**Depends On**: DEV-019
**V3.0.9 Fix**: Submit endpoint documented with validation rules

**Scope**:
- Implement status state machine
- Implement POST /purchase-orders/{id}/submit (draft → submitted)
- Implement POST /purchase-orders/{id}/cancel (draft → cancelled)
- Log all transitions to order_events table
- Validate transitions (can't go backwards)
- Publish events to outbox on transition

**Status Flow**:
```
draft → submitted → confirmed → shipped → delivered
                                       → partial_received
       ↓
       cancelled
```

**Files to Create**:
```
backend/services/order-service/src/
├── services/
│   └── statusService.ts
└── utils/
    └── stateMachine.ts
```

**Submit Endpoint Details**:
```typescript
// POST /stores/{storeId}/purchase-orders/{id}/submit
router.post('/stores/:storeId/purchase-orders/:id/submit', async (req, res) => {
  const { storeId, id } = req.params;

  // Validate order exists and belongs to store
  const order = await purchaseOrderService.getById(id);
  if (!order || order.store_id !== storeId) {
    return res.status(404).json({ code: 'ORDER_NOT_FOUND' });
  }

  // Validate current status allows submission
  if (order.status !== 'draft') {
    return res.status(400).json({
      code: 'INVALID_STATUS_TRANSITION',
      message: `Cannot submit order in '${order.status}' status. Only draft orders can be submitted.`
    });
  }

  // Validate order has items
  const items = await purchaseOrderService.getItems(id);
  if (items.length === 0) {
    return res.status(400).json({
      code: 'EMPTY_ORDER',
      message: 'Cannot submit order with no items.'
    });
  }

  // Transition to submitted
  const updated = await statusService.transition(id, 'submitted', {
    actor_id: req.user.id,
    actor_type: req.user.role
  });

  res.json({ data: updated });
});
```

**State Machine Implementation**:
```typescript
// utils/stateMachine.ts
const validTransitions: Record<string, string[]> = {
  'draft': ['submitted', 'cancelled'],
  'submitted': ['confirmed', 'cancelled'],
  'confirmed': ['shipped', 'cancelled'],
  'shipped': ['delivered', 'partial_received'],
  'partial_received': ['delivered', 'partial_received'],
  'delivered': [],
  'cancelled': []
};

export function canTransition(from: string, to: string): boolean {
  return validTransitions[from]?.includes(to) ?? false;
}

export function validateTransition(from: string, to: string): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}
```

**Acceptance Criteria**:
- [ ] POST /submit transitions draft → submitted
- [ ] POST /cancel transitions draft → cancelled
- [ ] Invalid transitions return 400 with INVALID_STATUS_TRANSITION
- [ ] Empty orders cannot be submitted
- [ ] All transitions logged to order_events
- [ ] Event published to outbox on status change

---

### DEV-021: Order Service - GRN Receive
**Type**: Backend Service
**Priority**: P0-Critical
**Estimate**: 6 hours
**Depends On**: DEV-020, DEV-015

**Scope**:
- Implement POST /purchase-orders/{id}/receive (GRN)
- Call inventory-service synchronously (NOT via events)
- Include referenceSubId=receiveId for audit trail
- Support partial receiving (cumulative received_quantity)
- Each partial receive needs NEW idempotency key
- Forward user JWT + X-Service-Name header

**Files to Create**:
```
backend/services/order-service/src/
├── services/
│   └── grnService.ts
└── routes/
    └── receive.ts
```

**Critical Rules**:
1. order-service NEVER writes to inventory_ledger
2. GRN only updates PO status AFTER inventory-service returns 200
3. If inventory-service fails, GRN fails (rollback)

**Acceptance Criteria**:
- [ ] GRN creates inventory ledger entries
- [ ] Partial GRN tracks cumulative qty
- [ ] reference_sub_id links to receiveId
- [ ] Rollback on inventory failure

---

### DEV-022: Supplier Service - Core APIs
**Type**: Backend Service
**Priority**: P0-Critical
**Estimate**: 5 hours
**Depends On**: DEV-006, DEV-012

**Scope**:
- Create `backend/services/supplier-service/` service
- Implement GET /suppliers/search (by GSTIN/name)
- Implement GET /stores/{storeId}/suppliers (linked)
- Implement POST /stores/{storeId}/suppliers/link
- Implement POST /stores/{storeId}/suppliers/request
- GSTIN validation (regex + checksum)

**Files to Create**:
```
backend/services/supplier-service/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── config.ts
│   ├── db/
│   │   └── queries.ts
│   ├── services/
│   │   └── supplierService.ts
│   ├── utils/
│   │   └── gstin.ts
│   └── routes/
│       └── suppliers.ts
```

**Acceptance Criteria**:
- [ ] GSTIN validation works
- [ ] Can search suppliers globally
- [ ] Can link existing supplier to store
- [ ] Can request new supplier creation

---

### DEV-023: Supplier Service - Link Management
**Type**: Backend Service
**Priority**: P0-Critical
**Estimate**: 3 hours
**Depends On**: DEV-022

**Scope**:
- Implement PUT /stores/{storeId}/suppliers/{id} (update link)
- Implement DELETE /stores/{storeId}/suppliers/{id}/unlink
- Write to event_outbox on link/unlink
- Publish supplier.linked.v1 event

**Endpoints**:
- Update: priority, is_preferred, credit_days, min_order_value
- Unlink: soft delete (status='inactive')

**Acceptance Criteria**:
- [ ] Can update link settings
- [ ] Can unlink supplier
- [ ] Event published on link

---

### DEV-024: Catalog Service - Core Setup
**Type**: Backend Service
**Priority**: P0-Critical
**Estimate**: 4 hours
**Depends On**: DEV-007, DEV-012

**Scope**:
- Create `backend/services/catalog-service/` service
- Setup database connection
- Setup Redis caching (5min TTL)
- Implement trigram search using pg_trgm

**Files to Create**:
```
backend/services/catalog-service/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── config.ts
│   ├── db/
│   │   └── queries.ts
│   ├── cache/
│   │   └── redis.ts
│   └── services/
│       └── searchService.ts
```

**Acceptance Criteria**:
- [ ] Service starts and connects to DB
- [ ] Redis caching works
- [ ] Trigram search returns results

---

### DEV-025: Catalog Service - Unified Catalog API
**Type**: Backend Service
**Priority**: P0-Critical
**Estimate**: 5 hours
**Depends On**: DEV-024

**Scope**:
- Implement GET /stores/{storeId}/catalog
- CRITICAL: Only return products from supplier_product_map
- CRITICAL: Only from LINKED suppliers (supplier_store_links)
- Include best price, stock status, supplier count
- Pagination + search support
- Response time < 500ms for 1000 products

**Files to Create**:
```
backend/services/catalog-service/src/
├── services/
│   └── catalogService.ts
└── routes/
    └── catalog.ts
```

**Query Logic**:
```sql
SELECT p.*, sp.purchase_price, ...
FROM catalog.products p
JOIN catalog.supplier_product_map spm ON spm.product_id = p.id
JOIN catalog.supplier_products sp ON sp.id = spm.supplier_product_id
JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = sp.supplier_id
WHERE ssl.store_id = $storeId AND ssl.status = 'active'
```

**Acceptance Criteria**:
- [ ] Only mapped products returned
- [ ] Only linked suppliers included
- [ ] Pagination works
- [ ] < 500ms response time

---

### DEV-026: Catalog Service - Product Mapping
**Type**: Backend Service
**Priority**: P0-Critical
**Estimate**: 5 hours
**Depends On**: DEV-025

**Scope**:
- Implement GET /stores/{storeId}/catalog/unmatched
- Implement POST /stores/{storeId}/catalog/map (manual)
- Implement DELETE /stores/{storeId}/catalog/map/{mapId}
- Implement auto-map on barcode match
- Log all mappings to catalog_mapping_log

**Files to Create**:
```
backend/services/catalog-service/src/
├── services/
│   └── mappingService.ts
└── routes/
    └── mapping.ts
```

**Auto-Map Logic**:
1. On supplier_product insert
2. If barcode matches products.primary_barcode
3. Create mapping with confidence=1.0
4. Log to catalog_mapping_log

**Acceptance Criteria**:
- [ ] Unmatched queue shows unmapped products
- [ ] Manual mapping works
- [ ] Auto-map creates mapping on barcode match
- [ ] All actions logged

---

## SPRINT 4: Reorder + Events + Cron

### DEV-027: Event Outbox Worker (V3.0.9: Fanout Pattern)
**Type**: Backend Library
**Priority**: P0-Critical
**Estimate**: 5 hours
**Depends On**: DEV-002, DEV-003

**V3.0.9 CRITICAL**: Bull queues are WORK QUEUES (load-balanced), NOT pub/sub!
If 2 services consume the same queue, jobs are distributed randomly between them.
FIX: Each consumer gets its own queue. Outbox worker FANS OUT to all subscriber queues.

**Scope**:
- Create outbox worker that polls pending events
- **FANOUT**: Publish each event to ALL subscriber queues (not one shared queue)
- Implement subscriber registry (hardcoded map for MVP)
- Mark events as 'published' with timestamp
- Retry logic: 3 retries with exponential backoff
- Dead letter queue for failed events
- Correlation-ID propagation

**Files to Create**:
```
backend/shared/src/
└── events/
    ├── outboxWorker.ts
    ├── bullQueue.ts
    ├── subscriberRegistry.ts   # V3.0.9: Event → queues mapping
    └── deadLetter.ts
```

**Subscriber-Specific Queue Names (V3.0.9)**:
```typescript
// Each consumer gets its own queue
const subscriberQueues = {
  // inventory-service publishes to:
  'inventory-events.catalog': { consumer: 'catalog-service' },
  'inventory-events.reorder': { consumer: 'reorder-service' },

  // order-service publishes to:
  'orders-events.notification': { consumer: 'notification-service' },
  'orders-events.analytics': { consumer: 'analytics-service' },

  // supplier-service publishes to:
  'supplier-events.catalog': { consumer: 'catalog-service' },

  // reorder-service publishes to:
  'reorder-events.notification': { consumer: 'notification-service' },
};

// Event → subscriber queues mapping
const eventSubscribers = {
  'inventory.stock.changed.v1': ['inventory-events.catalog', 'inventory-events.reorder'],
  'orders.po.created.v1': ['orders-events.notification'],
  'orders.po.received.v1': ['orders-events.notification', 'orders-events.analytics'],
  'supplier.linked.v1': ['supplier-events.catalog'],
  'reorder.draft.created.v1': ['reorder-events.notification'],
};
```

**Fanout Logic**:
```typescript
async function publishEvent(event: DomainEvent) {
  const queues = eventSubscribers[event.eventType] || [];
  for (const queueName of queues) {
    await bullQueues[queueName].add(event.eventType, event);
  }
}
```

**Acceptance Criteria**:
- [ ] Polls outbox every 1s using FOR UPDATE SKIP LOCKED
- [ ] Events FANNED OUT to all subscriber queues
- [ ] inventory.stock.changed.v1 goes to BOTH catalog AND reorder queues
- [ ] Retries on failure
- [ ] Dead letter for permanent failures
- [ ] Correlation-ID propagated

---

### DEV-028: Event Inbox Consumer
**Type**: Backend Library
**Priority**: P0-Critical
**Estimate**: 3 hours
**Depends On**: DEV-027

**Scope**:
- Create event inbox pattern for consumer deduplication
- Check if event_id exists before processing
- If exists + processed → skip
- If exists + failed → retry (max 3)
- Mark as 'processed' after success
- handleEvent() wrapper for all consumers

**Files to Create**:
```
backend/shared/src/
└── events/
    ├── eventInbox.ts
    └── handleEvent.ts
```

**Acceptance Criteria**:
- [ ] Duplicate events skipped
- [ ] Failed events retried
- [ ] Max 3 retries before dead-letter

---

### DEV-029: Catalog Stock Event Consumer (V3.0.9: Own Queue)
**Type**: Backend Service
**Priority**: P0-Critical
**Estimate**: 3 hours
**Depends On**: DEV-028, DEV-024

**V3.0.9**: Catalog-service listens on its OWN queue `inventory-events.catalog`,
NOT the shared `inventory-events` queue. This ensures it receives ALL stock change events.

**Scope**:
- Register Bull worker for queue: `inventory-events.catalog`
- Consume inventory.stock.changed.v1 events
- Update store_products.current_stock (READ-MODEL)
- Use stock_last_event_at for ordering (last-write-wins)
- Use event_inbox for deduplication
- Use ledgerCreatedAt (not occurredAt) for ordering

**Files to Create**:
```
backend/services/catalog-service/src/
└── consumers/
    └── inventoryConsumer.ts
```

**Bull Worker Setup**:
```typescript
// catalog-service listens on its OWN queue
const worker = new Worker('inventory-events.catalog', async (job) => {
  await handleStockChangedEvent(job.data);
}, { connection: redisConnection });
```

**Ordering Rule (V3.0.9)**:
```typescript
// Only update if event is NEWER than last processed
if (event.payload.ledgerCreatedAt > storeProduct.stock_last_event_at) {
  await updateStoreProduct(storeId, productId, {
    current_stock: event.payload.newQty,
    stock_last_event_at: event.payload.ledgerCreatedAt,
  });
}
// Otherwise skip - out of order event
```

**Acceptance Criteria**:
- [ ] Listens on `inventory-events.catalog` queue (NOT shared queue)
- [ ] stock updates on event
- [ ] Out-of-order events ignored (ledgerCreatedAt comparison)
- [ ] Duplicates deduplicated via event_inbox

---

### DEV-030: Reorder Service - Core Setup
**Type**: Backend Service
**Priority**: P0-Critical
**Estimate**: 4 hours
**Depends On**: DEV-008, DEV-012

**Scope**:
- Create `backend/services/reorder-service/` service
- Setup database connection
- Implement settings CRUD
- Implement policies CRUD

**Files to Create**:
```
backend/services/reorder-service/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── config.ts
│   ├── db/
│   │   └── queries.ts
│   ├── services/
│   │   ├── settingsService.ts
│   │   └── policyService.ts
│   └── routes/
│       ├── settings.ts
│       └── policies.ts
```

**Acceptance Criteria**:
- [ ] Can get/set store reorder settings
- [ ] Can create/update reorder policies
- [ ] Bounds constraints enforced

---

### DEV-031: Reorder Service - Pending Reorders API
**Type**: Backend Service
**Priority**: P0-Critical
**Estimate**: 5 hours
**Depends On**: DEV-030

**Scope**:
- Implement GET /stores/{storeId}/reorder/pending
- Implement POST /stores/{storeId}/reorder/pending/approve
- Implement POST /stores/{storeId}/reorder/pending/{id}/dismiss
- Approve creates draft POs grouped by supplier
- Write to event_outbox on approve/dismiss

**Files to Create**:
```
backend/services/reorder-service/src/
├── services/
│   └── pendingReorderService.ts
└── routes/
    └── pending.ts
```

**Approve Flow**:
1. Get selected pending_reorders
2. Group by supplier_id
3. Create draft PO per supplier (call order-service)
4. Mark pending_reorders as 'approved'
5. Publish reorder.draft.approved.v1

**Acceptance Criteria**:
- [ ] Can list pending reorders
- [ ] Approve creates draft POs
- [ ] Dismiss with reason works
- [ ] Events published

---

### DEV-032: Reorder Service - Event Consumer (V3.0.9: Own Queue)
**Type**: Backend Service
**Priority**: P0-Critical
**Estimate**: 3 hours
**Depends On**: DEV-028, DEV-030

**V3.0.9**: Reorder-service listens on its OWN queue `inventory-events.reorder`,
NOT the shared `inventory-events` queue. This ensures it receives ALL stock change events.

**Scope**:
- Register Bull worker for queue: `inventory-events.reorder`
- Consume inventory.stock.changed.v1 events
- Check if stock <= min_threshold
- Skip if pending reorder already exists
- Find best supplier (priority, price, stock)
- Create pending_reorder
- Use ux_pending_reorders_active to prevent duplicates

**Files to Create**:
```
backend/services/reorder-service/src/
└── consumers/
    └── inventoryConsumer.ts
```

**Bull Worker Setup**:
```typescript
// reorder-service listens on its OWN queue
const worker = new Worker('inventory-events.reorder', async (job) => {
  await handleStockChangedEvent(job.data);
}, { connection: redisConnection });
```

**Acceptance Criteria**:
- [ ] Listens on `inventory-events.reorder` queue (NOT shared queue)
- [ ] Creates pending reorder when stock low
- [ ] Skips if pending exists (partial index)
- [ ] Selects best supplier correctly

---

### DEV-033: Stock Monitor Cron Job
**Type**: Backend Job
**Priority**: P0-Critical
**Estimate**: 4 hours
**Depends On**: DEV-032

**Scope**:
- Run every hour (cron: 0 * * * *)
- Get all stores with reorder_enabled=true
- For each store: check all products vs policies
- Create pending_reorders for low stock items
- Log run stats to reorder_runs table
- Handle errors gracefully

**Files to Create**:
```
backend/services/reorder-service/src/
└── jobs/
    └── stockMonitor.ts
```

**Run Stats**:
- evaluated_products: count
- created_pending: count
- skipped_existing: count
- error_message: string | null

**Acceptance Criteria**:
- [ ] Runs hourly
- [ ] Creates pending reorders correctly
- [ ] Logs to reorder_runs
- [ ] Handles errors without crashing

---

### DEV-034: Internal APIs (Service-to-Service)
**Type**: Backend
**Priority**: P0-Critical
**Estimate**: 3 hours
**Depends On**: DEV-021, DEV-024

**Scope**:
- POST /internal/catalog/reconcile-stock (backfill from ledger)
- GET /internal/stores/{storeId} (for order-service to get store code)
- Implement X-Service-Name header validation
- Forward user JWT for auth

**Files to Create**:
```
backend/services/catalog-service/src/routes/internal.ts
backend/services/platform-service/src/routes/internal.ts
```

**Acceptance Criteria**:
- [ ] Internal endpoints require X-Service-Name header
- [ ] Stock reconciliation works from ledger
- [ ] Store lookup returns store code

---

## SPRINT 5: POS Frontend (BUY + REORDER)

### DEV-035: Purchase Cart Store (Zustand)
**Type**: Frontend
**Priority**: P0-Critical
**Estimate**: 4 hours
**Depends On**: None

**Scope**:
- Create purchaseCartStore.ts using Zustand
- Add/remove/update items
- Group items by supplier
- Calculate totals per supplier + grand total
- Persist to AsyncStorage
- Load draft POs from reorder approval

**Files to Create**:
```
supermandi-pos/src/stores/purchaseCartStore.ts
```

**Interface**:
```typescript
interface PurchaseCartItem {
  supplierProductId: string;
  productId: string;
  supplierId: string;
  supplierName: string;
  productName: string;
  barcode?: string;
  quantity: number;
  unitPrice: number;
  mrp?: number;
  moq: number;
}
```

**Acceptance Criteria**:
- [ ] Add/remove items works
- [ ] Grouped by supplier
- [ ] Persisted to AsyncStorage
- [ ] Can load draft POs

---

### DEV-036: Catalog API Service (Frontend)
**Type**: Frontend
**Priority**: P0-Critical
**Estimate**: 3 hours
**Depends On**: DEV-025

**Scope**:
- Create catalogService.ts for API calls
- getCatalog(storeId, params): paginated catalog
- getProductSuppliers(storeId, productId): all suppliers
- searchCatalog(storeId, query): search
- Handle errors and loading states

**Files to Create**:
```
supermandi-pos/src/services/catalogService.ts
```

**Acceptance Criteria**:
- [ ] All catalog APIs integrated
- [ ] Error handling works
- [ ] TypeScript types correct

---

### DEV-037: BUY Screen - Product Grid
**Type**: Frontend
**Priority**: P0-Critical
**Estimate**: 5 hours
**Depends On**: DEV-036, DEV-035

**Scope**:
- Create BuyScreen.tsx with product grid (2 columns)
- Search bar with barcode scan button
- Category filter chips (horizontal scroll)
- Each card shows: name, best price, stock, supplier count
- Infinite scroll pagination
- Pull to refresh

**Files to Create**:
```
supermandi-pos/src/screens/BuyScreen.tsx
supermandi-pos/src/components/buy/CatalogProductCard.tsx
supermandi-pos/src/components/buy/CategoryFilter.tsx
```

**Acceptance Criteria**:
- [ ] Grid displays products
- [ ] Search works
- [ ] Category filter works
- [ ] Pagination loads more

---

### DEV-038: BUY Screen - Product Detail Modal
**Type**: Frontend
**Priority**: P0-Critical
**Estimate**: 4 hours
**Depends On**: DEV-037

**Scope**:
- Create ProductDetailModal.tsx
- Show all suppliers for product
- Each supplier: price, MOQ, stock, delivery days
- Quantity picker (respects MOQ)
- Add to cart button
- Shows current cart quantity if already added

**Files to Create**:
```
supermandi-pos/src/components/buy/ProductDetailModal.tsx
supermandi-pos/src/components/buy/SupplierRow.tsx
supermandi-pos/src/components/buy/QuantityPicker.tsx
```

**Acceptance Criteria**:
- [ ] Shows all suppliers
- [ ] MOQ enforced in picker
- [ ] Add to cart works
- [ ] Shows existing cart qty

---

### DEV-039: BUY Screen - Purchase Cart Modal
**Type**: Frontend
**Priority**: P0-Critical
**Estimate**: 5 hours
**Depends On**: DEV-038

**Scope**:
- Create PurchaseCartModal.tsx
- Items grouped by supplier
- Edit quantity / remove item
- Show subtotal per supplier
- Show warnings if min_order_value not met
- Place Order per supplier
- Place All Orders button

**Files to Create**:
```
supermandi-pos/src/components/buy/PurchaseCartModal.tsx
supermandi-pos/src/components/buy/SupplierCartSection.tsx
supermandi-pos/src/components/buy/CartItem.tsx
```

**Acceptance Criteria**:
- [ ] Grouped by supplier
- [ ] Can edit/remove items
- [ ] MOQ validation
- [ ] Min order warning
- [ ] Place order works

---

### DEV-040: REORDER Screen - Main UI
**Type**: Frontend
**Priority**: P0-Critical
**Estimate**: 5 hours
**Depends On**: DEV-031

**Scope**:
- Create ReorderScreen.tsx
- Show pending reorders with checkboxes
- Each card: product, stock, threshold, suggested qty, supplier, price
- Select all / deselect all
- Approve Selected button
- Dismiss with reason modal
- Navigate to BUY tab after approval

**Files to Create**:
```
supermandi-pos/src/screens/ReorderScreen.tsx
supermandi-pos/src/components/reorder/PendingReorderCard.tsx
supermandi-pos/src/components/reorder/DismissReasonModal.tsx
```

**Acceptance Criteria**:
- [ ] Lists pending reorders
- [ ] Selection works
- [ ] Approve creates drafts
- [ ] Dismiss with reason works
- [ ] Navigates to BUY tab

---

### DEV-041: REORDER Screen - Edit Modal
**Type**: Frontend
**Priority**: P0-Critical
**Estimate**: 3 hours
**Depends On**: DEV-040

**Scope**:
- Create EditReorderModal.tsx
- Change suggested quantity
- Change supplier (dropdown of available)
- Show price impact
- Save changes

**Files to Create**:
```
supermandi-pos/src/components/reorder/EditReorderModal.tsx
```

**Acceptance Criteria**:
- [ ] Can edit quantity
- [ ] Can change supplier
- [ ] Price recalculates
- [ ] Save updates pending reorder

---

### DEV-042: REORDER Settings Screen
**Type**: Frontend
**Priority**: P0-Critical
**Estimate**: 4 hours
**Depends On**: DEV-030

**Scope**:
- Create ReorderSettingsScreen.tsx
- Toggle reorder_enabled
- Toggle require_approval
- Link to policies screen
- Create ReorderPoliciesScreen.tsx
- List all policies with edit

**Files to Create**:
```
supermandi-pos/src/screens/ReorderSettingsScreen.tsx
supermandi-pos/src/screens/ReorderPoliciesScreen.tsx
supermandi-pos/src/components/reorder/PolicyRow.tsx
supermandi-pos/src/components/reorder/EditPolicyModal.tsx
```

**Acceptance Criteria**:
- [ ] Can toggle settings
- [ ] Can view all policies
- [ ] Can edit policy (min, target, preferred supplier)

---

## SPRINT 6: GRN + Polish + Testing

### DEV-043: Order History Screen
**Type**: Frontend
**Priority**: P0-Critical
**Estimate**: 4 hours
**Depends On**: DEV-019

**Scope**:
- Create OrderHistoryScreen.tsx
- List purchase orders with filters (status, date)
- Order detail view
- Status timeline
- Navigate to GRN for receivable orders

**Files to Create**:
```
supermandi-pos/src/screens/OrderHistoryScreen.tsx
supermandi-pos/src/screens/OrderDetailScreen.tsx
supermandi-pos/src/components/orders/OrderCard.tsx
supermandi-pos/src/components/orders/StatusTimeline.tsx
```

**Acceptance Criteria**:
- [ ] Lists all orders
- [ ] Filters work
- [ ] Detail shows items + timeline
- [ ] Can navigate to GRN

---

### DEV-044: GRN Screen - Receiving Flow
**Type**: Frontend
**Priority**: P0-Critical
**Estimate**: 6 hours
**Depends On**: DEV-021, DEV-043

**Scope**:
- Create GRNScreen.tsx
- Show PO items with expected vs received
- Enter received quantity per item
- Support partial receiving
- Barcode scan to find item
- Submit GRN button
- Show success/error feedback

**Files to Create**:
```
supermandi-pos/src/screens/GRNScreen.tsx
supermandi-pos/src/components/grn/GRNItemRow.tsx
supermandi-pos/src/components/grn/ReceiveQuantityInput.tsx
```

**Flow**:
1. Select order from history
2. Enter received quantities
3. Submit → calls POST /purchase-orders/{id}/receive
4. On success → stock updated via inventory-service
5. Navigate back to order detail

**Acceptance Criteria**:
- [ ] Shows expected quantities
- [ ] Can enter received quantities
- [ ] Barcode scan finds item
- [ ] Submit calls GRN API
- [ ] Stock updates on success

---

### DEV-045: Cart Validation (MOQ + Min Order)
**Type**: Frontend + Backend
**Priority**: P0-Critical
**Estimate**: 4 hours
**Depends On**: DEV-039

**Scope**:
- Frontend: enforce MOQ in quantity input
- Frontend: show warning if supplier min_order_value not met
- Frontend: disable Place Order if validation fails
- Backend: validate in POST /purchase-orders (return 400)

**Files to Modify**:
```
supermandi-pos/src/stores/purchaseCartStore.ts
supermandi-pos/src/components/buy/QuantityPicker.tsx
supermandi-pos/src/components/buy/PurchaseCartModal.tsx
backend/services/order-service/src/routes/purchaseOrders.ts
```

**Acceptance Criteria**:
- [ ] MOQ enforced in UI
- [ ] Min order warning shown
- [ ] Button disabled if invalid
- [ ] Backend returns 400 with details

---

### DEV-046: Navigation + Tab Bar Update
**Type**: Frontend
**Priority**: P0-Critical
**Estimate**: 3 hours
**Depends On**: DEV-037, DEV-040

**Scope**:
- Update bottom tab bar with 3 tabs: SELL, BUY, REORDER
- Feature flag check: hide tabs if not enabled
- Draft badge on BUY tab (count of draft POs)
- Pending badge on REORDER tab

**Files to Modify**:
```
supermandi-pos/src/navigation/MainTabNavigator.tsx
supermandi-pos/src/components/TabBadge.tsx
```

**Acceptance Criteria**:
- [ ] 3 tabs visible
- [ ] Tabs hidden if feature flag off
- [ ] Badges show counts

---

### DEV-047: Error Handling + API Error Display
**Type**: Frontend
**Priority**: P0-Critical
**Estimate**: 3 hours
**Depends On**: DEV-002

**Scope**:
- Create ApiError handler utility
- Parse standard error envelope
- Show toast with error.message
- Show field-specific errors in forms
- Handle network errors
- Handle 401 → redirect to login

**Files to Create**:
```
supermandi-pos/src/utils/errorHandler.ts
supermandi-pos/src/components/ErrorToast.tsx
supermandi-pos/src/hooks/useApiError.ts
```

**Acceptance Criteria**:
- [ ] API errors show toast
- [ ] Field errors shown in forms
- [ ] 401 redirects to login
- [ ] Network errors handled

---

### DEV-048: Backend Integration Tests + Golden Path
**Type**: Testing
**Priority**: P0-Critical
**Estimate**: 8 hours
**Depends On**: All backend tickets
**V3.0.9 Fix**: Added Golden Path test as primary integration test

**Scope**:
- Create integration test suite using Jest + Supertest
- **Implement Golden Path test FIRST** (validates entire purchase cycle)
- Test all API endpoints
- Test event flow (outbox → queue → consumer)
- Test idempotency behavior (including PROCESSING state)
- Test RBAC permissions

**Files to Create**:
```
backend/tests/
├── setup.ts
├── goldenPath.test.ts    # PRIMARY - run before UI work
├── auth.test.ts
├── inventory.test.ts
├── orders.test.ts
├── catalog.test.ts
├── reorder.test.ts
└── events.test.ts
```

**Golden Path Test Specification**:
```typescript
// tests/goldenPath.test.ts
/**
 * GOLDEN PATH TEST
 * Must pass before any UI work begins.
 * Validates the complete purchase cycle end-to-end.
 */
describe('Golden Path - Complete Purchase Cycle', () => {
  let authToken: string;
  let storeId: string;
  let supplierId: string;
  let productId: string;
  let purchaseOrderId: string;
  let receiveId: string;

  beforeAll(async () => {
    // Seed test data
    await seedTestDatabase();
  });

  // Step 1: Authentication
  test('1. Staff can login and receive token', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ phone: '+919999999999', pin: '1234' });

    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeDefined();
    authToken = res.body.data.token;
    storeId = res.body.data.user.store_id;
  });

  // Step 2: Browse Catalog
  test('2. Can browse supplier catalog', async () => {
    const res = await request(app)
      .get(`/stores/${storeId}/catalog`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    productId = res.body.data[0].id;
    supplierId = res.body.data[0].suppliers[0].id;
  });

  // Step 3: Create Draft PO
  test('3. Can create draft purchase order', async () => {
    const res = await request(app)
      .post(`/stores/${storeId}/purchase-orders`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('X-Idempotency-Key', 'golden-path-create-po')
      .send({
        supplier_id: supplierId,
        items: [{
          product_id: productId,
          ordered_quantity: 10,
          unit_price: 100
        }]
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('draft');
    purchaseOrderId = res.body.data.id;
  });

  // Step 4: Submit PO
  test('4. Can submit purchase order', async () => {
    const res = await request(app)
      .post(`/stores/${storeId}/purchase-orders/${purchaseOrderId}/submit`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('submitted');
  });

  // Step 5: Verify Event Published
  test('5. Event was published to outbox', async () => {
    const events = await db.eventOutbox
      .where({ aggregate_id: purchaseOrderId })
      .orderBy('created_at', 'desc');

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].event_type).toBe('orders.po.submitted.v1');
  });

  // Step 6: Simulate Supplier Confirmation
  test('6. Supplier can confirm order', async () => {
    // Get supplier token
    const supplierLogin = await request(app)
      .post('/auth/login')
      .send({ phone: '+919888888888', pin: '5678' });

    const supplierToken = supplierLogin.body.data.token;

    const res = await request(app)
      .post(`/suppliers/${supplierId}/purchase-orders/${purchaseOrderId}/confirm`)
      .set('Authorization', `Bearer ${supplierToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('confirmed');
  });

  // Step 7: GRN Receive
  test('7. Can receive goods (GRN)', async () => {
    const res = await request(app)
      .post(`/stores/${storeId}/purchase-orders/${purchaseOrderId}/receive`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('X-Idempotency-Key', 'golden-path-receive')
      .send({
        items: [{
          product_id: productId,
          received_quantity: 10
        }]
      });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('delivered');
    receiveId = res.body.data.receive_id;
  });

  // Step 8: Verify Inventory Updated
  test('8. Inventory ledger updated correctly', async () => {
    const res = await request(app)
      .get(`/stores/${storeId}/inventory/${productId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    // Should have inventory from GRN
    expect(res.body.data.quantity).toBeGreaterThanOrEqual(10);

    // Verify ledger entry exists with correct reference
    const ledgerEntries = await db.inventoryLedger
      .where({ product_id: productId, reference_type: 'grn' });

    const grnEntry = ledgerEntries.find(e =>
      e.reference_id === purchaseOrderId && e.reference_sub_id === receiveId
    );
    expect(grnEntry).toBeDefined();
    expect(grnEntry.delta_qty).toBe(10);
  });

  // Step 9: Verify Idempotency
  test('9. Duplicate receive request returns cached response', async () => {
    const res = await request(app)
      .post(`/stores/${storeId}/purchase-orders/${purchaseOrderId}/receive`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('X-Idempotency-Key', 'golden-path-receive')
      .send({
        items: [{
          product_id: productId,
          received_quantity: 10
        }]
      });

    // Should return cached response, not create duplicate
    expect(res.status).toBe(200);

    // Verify inventory didn't double
    const inventory = await request(app)
      .get(`/stores/${storeId}/inventory/${productId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(inventory.body.data.quantity).toBe(10); // Not 20
  });

  // Step 10: Full Cycle Complete
  test('10. Complete purchase cycle verified', async () => {
    // Final state checks
    const order = await request(app)
      .get(`/stores/${storeId}/purchase-orders/${purchaseOrderId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(order.body.data.status).toBe('delivered');
    expect(order.body.data.items[0].received_quantity).toBe(10);

    console.log('✅ GOLDEN PATH COMPLETE - All backend services working correctly');
  });
});
```

**Test Database Seeding**:
```typescript
// tests/setup.ts
export async function seedTestDatabase() {
  // Create test store
  await db.stores.create({
    id: 'test-store-001',
    name: 'Test Store',
    code: 'TST01'
  });

  // Create test users
  await db.users.create({
    id: 'test-staff-001',
    phone: '+919999999999',
    pin_hash: hash('1234'),
    store_id: 'test-store-001',
    role: 'STORE_STAFF'
  });

  // Create test supplier
  await db.suppliers.create({
    id: 'test-supplier-001',
    name: 'Test Supplier',
    gstin: 'TEST12345678901'
  });

  // Create test product & catalog entry
  await db.products.create({
    id: 'test-product-001',
    name: 'Test Product',
    primary_barcode: '8901234567890'
  });

  await db.supplierProducts.create({
    supplier_id: 'test-supplier-001',
    product_id: 'test-product-001',
    purchase_price: 100
  });

  await db.supplierProductMap.create({
    store_id: 'test-store-001',
    product_id: 'test-product-001',
    supplier_id: 'test-supplier-001'
  });
}
```

**Run Command**:
```bash
# Run Golden Path test specifically
npm test -- --testPathPattern=goldenPath

# Run all integration tests
npm test

# Run with coverage
npm test -- --coverage
```

**Acceptance Criteria**:
- [ ] **Golden Path test passes** (BLOCKING for UI work)
- [ ] All 10 Golden Path steps pass
- [ ] Event flow validated (outbox → queue → consumer)
- [ ] Idempotency validated (no duplicate inventory)
- [ ] RBAC tested (store staff vs supplier permissions)
- [ ] 80% code coverage

---

### DEV-049: Frontend E2E Tests
**Type**: Testing
**Priority**: P1-High
**Estimate**: 5 hours
**Depends On**: All frontend tickets

**Scope**:
- Create E2E test suite using Detox
- Test SELL flow
- Test BUY flow (browse → cart → order)
- Test REORDER flow (view → approve → cart)
- Test GRN flow

**Files to Create**:
```
supermandi-pos/e2e/
├── sellFlow.test.ts
├── buyFlow.test.ts
├── reorderFlow.test.ts
└── grnFlow.test.ts
```

**Acceptance Criteria**:
- [ ] SELL flow passes
- [ ] BUY flow passes
- [ ] REORDER flow passes
- [ ] GRN flow passes

---

### DEV-050: Docker Production Setup
**Type**: Infrastructure
**Priority**: P0-Critical
**Estimate**: 4 hours
**Depends On**: All backend tickets

**Scope**:
- Create Dockerfile for each service
- Create docker-compose.prod.yml
- Setup health checks
- Setup Redis with AOF persistence
- Setup PostgreSQL with proper volumes
- Create deployment scripts

**Files to Create**:
```
backend/services/*/Dockerfile
backend/docker-compose.prod.yml
backend/scripts/deploy.sh
backend/scripts/healthcheck.sh
```

**Acceptance Criteria**:
- [ ] All services containerized
- [ ] Health checks pass
- [ ] Redis has AOF persistence
- [ ] PostgreSQL data persisted

---

### DEV-051: Observability Setup
**Type**: Infrastructure
**Priority**: P1-High
**Estimate**: 4 hours
**Depends On**: DEV-050

**Scope**:
- Setup structured logging (pino)
- Add correlation-ID to all logs
- Setup error tracking (Sentry)
- Create basic health dashboard
- Log all API requests with timing

**Files to Create**:
```
backend/shared/src/logging/
├── logger.ts
└── requestLogger.ts
```

**Acceptance Criteria**:
- [ ] Structured JSON logs
- [ ] Correlation-ID in all logs
- [ ] Errors sent to Sentry
- [ ] Request timing logged

---

### DEV-052: Launch Checklist Verification
**Type**: QA
**Priority**: P0-Critical
**Estimate**: 4 hours
**Depends On**: All tickets

**Scope**:
- Verify all acceptance criteria for every ticket
- Run full test suite
- Perform manual testing of all flows
- Check all database constraints work
- Verify event flow end-to-end
- Document any remaining issues

**Checklist**:
- [ ] All migrations run successfully
- [ ] Auth flow works (login, refresh, RBAC)
- [ ] SELL → Inventory integration works
- [ ] BUY flow complete (browse, cart, order)
- [ ] REORDER flow complete (pending, approve, draft)
- [ ] GRN flow complete (receive, stock update)
- [ ] Events flow correctly
- [ ] No duplicate processing
- [ ] All error cases handled

---

## POST-MVP TICKETS

### DEV-P01: Supplier Mobile App - Login + Orders
**Type**: Frontend (New App)
**Priority**: P1-High
**Depends On**: MVP Complete

**Scope**:
- Create supplier-app React Native project
- Login with phone/OTP
- Orders list screen
- Order detail screen
- Status update (confirm, ship, reject)

---

### DEV-P02: Supplier Web Dashboard
**Type**: Frontend (New Web)
**Priority**: P1-High
**Depends On**: MVP Complete

**Scope**:
- Create supplier-web Next.js project
- Dashboard with stats
- Catalog management
- Staff management
- Order management

---

### DEV-P03: Retailer Admin Web Dashboard
**Type**: Frontend (New Web)
**Priority**: P1-High
**Depends On**: MVP Complete

**Scope**:
- Create retailer-web Next.js project
- Dashboard with stats
- Inventory reports
- Purchase history
- Staff management

---

### DEV-P04: SuperMandi Admin Portal
**Type**: Frontend (New Web)
**Priority**: P1-High
**Depends On**: MVP Complete

**Scope**:
- Create admin-portal Next.js project
- Platform dashboard
- Stores management
- Supplier verification/merge
- Feature flags management

---

### DEV-P05: Push Notifications
**Type**: Backend + Frontend
**Priority**: P1-High
**Depends On**: MVP Complete

**Scope**:
- Create notification-service
- FCM/APNs integration
- Notification preferences
- Push on: new order, low stock, order status

---

### DEV-P06: CSV Upload Pipeline
**Type**: Backend
**Priority**: P1-High
**Depends On**: MVP Complete

**Scope**:
- CSV upload endpoint
- Async processing with progress
- Validation and error reporting
- Support: products, supplier catalog, prices

---

### DEV-P07: Returns (Purchase + Sale)
**Type**: Backend + Frontend
**Priority**: P2-Medium
**Depends On**: MVP Complete

**Scope**:
- Purchase return flow
- Sale return flow
- Inventory ledger entries (+ qty)
- Credit note generation

---

### DEV-P08: Stock Take / Physical Count
**Type**: Backend + Frontend
**Priority**: P2-Medium
**Depends On**: MVP Complete

**Scope**:
- Stock count session
- Enter physical counts
- Variance report
- Adjustment entries

---

### DEV-P09: Reports Module
**Type**: Backend + Frontend
**Priority**: P2-Medium
**Depends On**: MVP Complete

**Scope**:
- Inventory valuation report
- Sales summary report
- Purchase summary report
- Stock movement report

---

### DEV-P10: Supplier Order Endpoints
**Type**: Backend
**Priority**: P1-High
**Depends On**: DEV-P01

**Scope**:
- GET /suppliers/{id}/orders
- POST /suppliers/{id}/orders/{orderId}/confirm
- POST /suppliers/{id}/orders/{orderId}/ship
- POST /suppliers/{id}/orders/{orderId}/reject

---

### DEV-P11: Supplier Catalog Endpoints
**Type**: Backend
**Priority**: P1-High
**Depends On**: DEV-P02

**Scope**:
- GET /suppliers/{id}/catalog
- POST /suppliers/{id}/catalog/products
- PUT /suppliers/{id}/catalog/products/{id}
- POST /suppliers/{id}/catalog/bulk-upload

---

### DEV-P12: Supplier Verification Endpoints
**Type**: Backend
**Priority**: P1-High
**Depends On**: DEV-P04

**Scope**:
- GET /admin/suppliers/pending
- POST /admin/suppliers/{id}/verify
- POST /admin/suppliers/{id}/reject
- POST /admin/suppliers/merge

---

### DEV-P13: Platform Stats Endpoints
**Type**: Backend
**Priority**: P1-High
**Depends On**: DEV-P04

**Scope**:
- GET /admin/platform/stats
- GET /admin/stores
- GET /stores/{id}/dashboard/stats
- GET /suppliers/{id}/dashboard/stats

---

### DEV-P14: Real-time Stock Sync (WebSocket)
**Type**: Backend
**Priority**: P2-Medium
**Depends On**: MVP Complete

**Scope**:
- WebSocket server
- Subscribe to stock updates per store
- Broadcast on inventory.stock.changed.v1
- Handle reconnection

---

## Ticket Quick Reference

| ID | Title | Sprint | Type | Priority |
|----|-------|--------|------|----------|
| DEV-001 | Backend Monorepo Setup | 1 | Infra | P0 |
| DEV-002 | Shared Library - Types & DTOs | 1 | Backend | P0 |
| DEV-003 | Shared Library - Database Utilities | 1 | Backend | P0 |
| DEV-004 | Platform Schema Migration | 1 | Database | P0 |
| DEV-005 | Auth Schema Migration | 1 | Database | P0 |
| DEV-006 | Supplier Schema Migration | 1 | Database | P0 |
| DEV-007 | Catalog Schema Migration | 1 | Database | P0 |
| DEV-008 | Inventory, Orders, Reorder Schema | 1 | Database | P0 |
| DEV-009 | API Gateway Service Setup | 2 | Backend | P0 |
| DEV-010 | Auth Service - User & Role CRUD | 2 | Backend | P0 |
| DEV-011 | Auth Service - Login & JWT | 2 | Backend | P0 |
| DEV-012 | Auth Service - Refresh & RBAC | 2 | Backend | P0 |
| DEV-013 | Feature Flags API | 2 | Backend | P0 |
| DEV-014 | Inventory Service - Ledger Core | 2 | Backend | P0 |
| DEV-015 | Inventory Service - Transactions | 2 | Backend | P0 |
| DEV-016 | SELL → Inventory Integration | 2 | Full | P0 |
| DEV-017 | Idempotency Keys Middleware | 3 | Backend | P0 |
| DEV-018 | Order Service - Core Setup | 3 | Backend | P0 |
| DEV-019 | Order Service - Create & List POs | 3 | Backend | P0 |
| DEV-020 | Order Service - Status Transitions | 3 | Backend | P0 |
| DEV-021 | Order Service - GRN Receive | 3 | Backend | P0 |
| DEV-022 | Supplier Service - Core APIs | 3 | Backend | P0 |
| DEV-023 | Supplier Service - Link Management | 3 | Backend | P0 |
| DEV-024 | Catalog Service - Core Setup | 3 | Backend | P0 |
| DEV-025 | Catalog Service - Unified Catalog | 3 | Backend | P0 |
| DEV-026 | Catalog Service - Product Mapping | 3 | Backend | P0 |
| DEV-027 | Event Outbox Worker | 4 | Backend | P0 |
| DEV-028 | Event Inbox Consumer | 4 | Backend | P0 |
| DEV-029 | Catalog Stock Event Consumer | 4 | Backend | P0 |
| DEV-030 | Reorder Service - Core Setup | 4 | Backend | P0 |
| DEV-031 | Reorder Service - Pending API | 4 | Backend | P0 |
| DEV-032 | Reorder Service - Event Consumer | 4 | Backend | P0 |
| DEV-033 | Stock Monitor Cron Job | 4 | Backend | P0 |
| DEV-034 | Internal APIs (Service-to-Service) | 4 | Backend | P0 |
| DEV-035 | Purchase Cart Store (Zustand) | 5 | Frontend | P0 |
| DEV-036 | Catalog API Service (Frontend) | 5 | Frontend | P0 |
| DEV-037 | BUY Screen - Product Grid | 5 | Frontend | P0 |
| DEV-038 | BUY Screen - Product Detail Modal | 5 | Frontend | P0 |
| DEV-039 | BUY Screen - Purchase Cart Modal | 5 | Frontend | P0 |
| DEV-040 | REORDER Screen - Main UI | 5 | Frontend | P0 |
| DEV-041 | REORDER Screen - Edit Modal | 5 | Frontend | P0 |
| DEV-042 | REORDER Settings Screen | 5 | Frontend | P0 |
| DEV-043 | Order History Screen | 6 | Frontend | P0 |
| DEV-044 | GRN Screen - Receiving Flow | 6 | Frontend | P0 |
| DEV-045 | Cart Validation (MOQ + Min Order) | 6 | Full | P0 |
| DEV-046 | Navigation + Tab Bar Update | 6 | Frontend | P0 |
| DEV-047 | Error Handling + API Error Display | 6 | Frontend | P0 |
| DEV-048 | Backend Integration Tests | 6 | Testing | P0 |
| DEV-049 | Frontend E2E Tests | 6 | Testing | P1 |
| DEV-050 | Docker Production Setup | 6 | Infra | P0 |
| DEV-051 | Observability Setup | 6 | Infra | P1 |
| DEV-052 | Launch Checklist Verification | 6 | QA | P0 |

---

## How to Execute a Ticket

Simply tell Claude: **"Execute DEV-XXX"**

Claude will:
1. Read the ticket details from this document
2. Create all required files
3. Implement the acceptance criteria
4. Run any relevant tests
5. Report completion status

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-12 | Initial version with 53 tickets |
| 1.1.0 | 2026-01-12 | V3.0.9 Critical Fixes Applied: Bull fanout (DEV-027, DEV-029, DEV-032), platform-service (DEV-013), idempotency PROCESSING state (DEV-017), multi-status filter (DEV-019), submit endpoint (DEV-020), Golden Path test (DEV-048) |

---

**Document Version**: 1.1.0
**Last Updated**: 2026-01-12
