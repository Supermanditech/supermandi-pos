# SuperMandi POS - Launch Checklist V3.0.9

## Pre-Launch Verification Status

**Generated**: 2026-01-13
**Version**: 3.0.9

---

## 1. Infrastructure Verification

### 1.1 Backend Services
| Service | Port | Status | Notes |
|---------|------|--------|-------|
| api-gateway | 3000 | ✅ | Entry point for all API requests |
| auth-service | 3001 | ✅ | Authentication and JWT management |
| platform-service | 3002 | ✅ | Platform/store configuration |
| supplier-service | 3003 | ✅ | Supplier management |
| catalog-service | 3004 | ✅ | Product catalog |
| inventory-service | 3005 | ✅ | Stock management |
| order-service | 3006 | ✅ | Purchase orders |
| reorder-service | 3007 | ✅ | Automatic reordering |

### 1.2 Infrastructure Components
| Component | Status | Notes |
|-----------|--------|-------|
| PostgreSQL 15 | ✅ | Primary database (docker-compose configured) |
| Redis 7 (AOF enabled) | ✅ | Queue + cache (AOF persistence enabled) |
| Docker Compose | ✅ | Container orchestration (prod config ready) |

---

## 2. Database Verification

### 2.1 Migrations
| Migration | Status | Description |
|-----------|--------|-------------|
| 000_extensions.sql | ✅ | PostgreSQL extensions |
| 001_platform_schema.sql | ✅ | Platform tables |
| 002_auth_schema.sql | ✅ | Auth tables |
| 003_supplier_schema.sql | ✅ | Supplier tables |
| 004_catalog_schema.sql | ✅ | Product catalog |
| 005_inventory_schema.sql | ✅ | Inventory + ledger |
| 006_order_schema.sql | ✅ | Purchase orders |
| 007_reorder_schema.sql | ✅ | Reorder policies |
| 008_outbox_schema.sql | ✅ | Event outbox |
| +3 more | ✅ | Additional schemas |

### 2.2 Database Constraints
- [ ] Foreign key constraints enforced
- [ ] Unique constraints on (store_id, product_id) for inventory
- [ ] Check constraints on quantities (>= 0)
- [ ] Indexes on frequently queried columns

---

## 3. Authentication Flow

### 3.1 Device Enrollment
- [ ] Device fingerprint generation works
- [ ] Enrollment request sent to backend
- [ ] Device stored in database
- [ ] Enrollment status returned

### 3.2 Staff Login
- [ ] Phone number validation
- [ ] PIN verification (bcrypt)
- [ ] JWT token generation
- [ ] Refresh token storage
- [ ] Token expiration handling

### 3.3 Authorization
- [ ] JWT verification middleware
- [ ] Role-based access control
- [ ] Store-scoped access

---

## 4. SELL Flow Verification

### 4.1 Product Search
- [ ] Search by name (fuzzy)
- [ ] Search by barcode (exact)
- [ ] Category filtering
- [ ] Pagination works

### 4.2 Cart Operations
- [ ] Add to cart
- [ ] Update quantity
- [ ] Remove from cart
- [ ] Cart persistence

### 4.3 Checkout
- [ ] Total calculation
- [ ] Discount application
- [ ] Payment recording
- [ ] Receipt generation

### 4.4 Inventory Update
- [ ] Stock decremented on sale
- [ ] Ledger entry created
- [ ] Event published

---

## 5. BUY Flow Verification

### 5.1 Catalog Browse
- [ ] Supplier list loads
- [ ] Supplier catalog loads
- [ ] Product search works
- [ ] MOQ displayed

### 5.2 Purchase Cart
- [ ] Add to purchase cart
- [ ] Quantity validation (MOQ)
- [ ] Supplier grouping
- [ ] Min order value check

### 5.3 Order Creation
- [ ] Draft order created
- [ ] Idempotency key works
- [ ] Order items stored
- [ ] Total calculated

### 5.4 Order Submission
- [ ] Status changes to 'submitted'
- [ ] PO_SUBMITTED event published
- [ ] Outbox entry created

---

## 6. REORDER Flow Verification

### 6.1 Reorder Settings
- [ ] Settings load correctly
- [ ] Enable/disable toggle
- [ ] Threshold configuration
- [ ] Auto-approve threshold

### 6.2 Reorder Policies
- [ ] Per-product policies
- [ ] Min threshold setting
- [ ] Target stock setting
- [ ] Preferred supplier

### 6.3 Pending Reorders
- [ ] Low stock detection
- [ ] Pending list generation
- [ ] Suggested quantities
- [ ] Approval workflow

### 6.4 Approval to Cart
- [ ] Select pending items
- [ ] Create draft orders
- [ ] Group by supplier
- [ ] Dismiss with reason

---

## 7. GRN Flow Verification

### 7.1 Order Selection
- [ ] Confirmed orders listed
- [ ] Order details load
- [ ] Items displayed

### 7.2 Receive Goods
- [ ] Quantity entry
- [ ] Barcode search
- [ ] Partial receive
- [ ] Over-receive warning

### 7.3 GRN Submission
- [ ] GRN created
- [ ] Inventory updated
- [ ] Ledger entries created
- [ ] Order status updated

### 7.4 Events
- [ ] GRN_COMPLETED published
- [ ] INVENTORY_UPDATED published

---

## 8. Event System Verification

### 8.1 Outbox Pattern
- [ ] Events written to outbox table
- [ ] Outbox worker polls correctly
- [ ] Events published to Redis
- [ ] Processed_at updated

### 8.2 Event Fanout
- [ ] Bull queue receives events
- [ ] Subscriber registry works
- [ ] Multiple handlers invoked
- [ ] Error handling (dead letter)

### 8.3 Idempotency
- [ ] Duplicate detection works
- [ ] PROCESSING state prevents races
- [ ] Cached response returned
- [ ] TTL expiration

---

## 9. Error Handling Verification

### 9.1 API Errors
- [ ] 400 Bad Request (validation)
- [ ] 401 Unauthorized (auth)
- [ ] 403 Forbidden (RBAC)
- [ ] 404 Not Found
- [ ] 409 Conflict (idempotency)
- [ ] 500 Internal Error

### 9.2 Frontend Error Display
- [ ] Error toast component
- [ ] API error parsing
- [ ] User-friendly messages
- [ ] Auto-redirect on 401

---

## 10. Test Suite Status

### 10.1 Backend Tests
```bash
cd backend && pnpm test
```
| Suite | Tests | Status | Notes |
|-------|-------|--------|-------|
| Golden Path | 10 | ✅ Created | Requires running DB |
| Auth | 8 | ✅ Created | Requires running DB |
| Inventory | 12 | ✅ Created | Requires running DB |
| Orders | 15 | ✅ Created | Requires running DB |
| Catalog | 10 | ✅ Created | Requires running DB |
| Reorder | 14 | ✅ Created | Requires running DB |
| Events | 10 | ✅ Created | Requires running DB |

### 10.2 Frontend Tests
```bash
npm run test:e2e
```
| Flow | Status | Notes |
|------|--------|-------|
| SELL | ✅ Created | Jest + Maestro |
| BUY | ✅ Created | Jest + Maestro |
| REORDER | ✅ Created | Jest + Maestro |
| GRN | ✅ Created | Jest + Maestro |

---

## 11. TypeScript Compilation

### 11.1 Frontend
```bash
npm run typecheck
```
- [x] No errors ✅
- [x] No warnings ✅

### 11.2 Backend
```bash
cd backend && pnpm run typecheck
```
- [x] All services compile ✅
- [x] Common package compiles ✅

---

## 12. Docker Production Build

### 12.1 Image Build
```bash
cd backend && docker-compose -f docker-compose.prod.yml build
```
- [ ] All images build successfully
- [ ] No build errors

### 12.2 Container Startup
```bash
cd backend && ./scripts/deploy.sh deploy
```
- [ ] All containers start
- [ ] Health checks pass

---

## 13. Security Checklist

- [ ] JWT secret is strong (32+ characters)
- [ ] Passwords hashed with bcrypt
- [ ] PINs hashed with bcrypt
- [ ] SQL injection prevented (parameterized queries)
- [ ] XSS prevented (input sanitization)
- [ ] CORS configured correctly
- [ ] Rate limiting enabled
- [ ] Sensitive data redacted in logs
- [ ] HTTPS configured (production)

---

## 14. Performance Checklist

- [ ] Database indexes created
- [ ] Redis caching configured
- [ ] Connection pooling enabled
- [ ] Pagination on list endpoints
- [ ] Lazy loading on frontend

---

## 15. Monitoring & Observability

- [x] Structured logging (pino) ✅
- [x] Correlation IDs in logs ✅
- [x] Request timing logged ✅
- [x] Health endpoints available ✅
- [x] Sentry configured (optional) ✅

---

## Verification Commands

### Quick Health Check
```bash
# Backend health
curl http://localhost:3000/health

# All services
./backend/scripts/healthcheck.sh -v
```

### Run All Tests
```bash
# Backend
cd backend && pnpm test

# Frontend E2E (requires device)
npm run e2e
```

### TypeScript Check
```bash
# Frontend
npm run typecheck

# Backend
cd backend && pnpm -r run typecheck
```

### Build Check
```bash
# Frontend APK readiness
npm run apk:check

# Backend Docker
cd backend && docker-compose -f docker-compose.prod.yml build
```

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Developer | | | |
| QA | | | |
| Product Owner | | | |

---

**Document Version**: 1.0.0
**Last Updated**: 2026-01-13
