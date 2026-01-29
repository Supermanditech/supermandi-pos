# GO-LIVE Gaps - Second Iteration Audit Report

**Generated:** 2026-01-29
**Auditor:** Claude Code
**Status:** Comprehensive review of all portals, APIs, and database schemas

---

## CRITICAL GAPS (P0 - Must Fix Before Go-Live)

### GAP-CRIT-001: Supplier Portal Token Mismatch
**Severity:** P0 CRITICAL
**Component:** Authentication / API Gateway
**Description:** Tokens issued by `supplier-service` are rejected by `main-backend` with "Invalid token" error.

**Root Cause:**
- `supplier-service` issues JWT tokens with its own secret/issuer
- API Gateway routes `/api/v1/supplier/*` to `main-backend`
- `main-backend` validates tokens with different secret/issuer
- Token validation fails, returning 401

**Impact:** Supplier portal users cannot access:
- Profile page
- Dashboard stats
- KYC status
- Orders management
- Payouts

**Fix Required:**
1. Ensure both services use same JWT_SECRET environment variable
2. OR: Route all supplier auth to supplier-service, keep data routes to main-backend
3. OR: Have supplier-service handle ALL supplier routes (currently missing several)

---

### GAP-CRIT-002: Supplier-Service Missing Routes
**Severity:** P0 CRITICAL
**Component:** supplier-service microservice
**Description:** The supplier-service only implements 3 route modules but frontend expects more.

**Currently Implemented:**
- `/auth/*` - Login, register, logout
- `/supplier/*` - Basic supplier operations
- `/products/*` - Product management

**Missing (exist in main-backend but not supplier-service):**
- `GET /profile` - Supplier profile data
- `GET /dashboard/stats` - Dashboard statistics
- `GET /kyc/status` - KYC verification status
- `GET /orders` - Order management
- `GET /payouts` - Payout history

**Impact:** All supplier portal pages except login/register fail after authentication.

---

### GAP-CRIT-003: Missing store_id NOT NULL Constraint on payments
**Severity:** P0 CRITICAL
**Component:** Database Schema
**Description:** `public.payments.store_id` was added but lacks NOT NULL constraint.

**Current State:**
```sql
ALTER TABLE public.payments ADD COLUMN store_id UUID;
-- Note: No NOT NULL constraint
```

**Risk:** New payments could be inserted without store_id, breaking store-level reporting.

**Fix Required:**
```sql
ALTER TABLE public.payments ALTER COLUMN store_id SET NOT NULL;
```

---

## HIGH PRIORITY GAPS (P1 - Should Fix Before Go-Live)

### GAP-HIGH-001: No Foreign Key on payments.store_id
**Severity:** P1 HIGH
**Component:** Database Schema
**Description:** `public.payments.store_id` has no FK reference to `platform.stores`.

**Risk:** Orphaned payment records possible if store is deleted.

**Fix Required:**
```sql
ALTER TABLE public.payments
ADD CONSTRAINT fk_payments_store
FOREIGN KEY (store_id) REFERENCES platform.stores(id);
```

---

### GAP-HIGH-002: Duplicate Payment Tables
**Severity:** P1 HIGH
**Component:** Database Schema
**Description:** Two separate payment tracking systems exist:
1. `public.payments` - Simple payment tracking (from migration 040)
2. `payments.sell_payments` - Comprehensive payment tracking (from migration 049)

**Confusion Points:**
- `public.payments` uses status: 'PENDING', 'PAID', 'FAILED'
- `payments.sell_payments` uses status: 'pending', 'initiated', 'completed', 'failed', 'refunded'
- Different column structures

**Recommendation:** Deprecate `public.payments` in favor of `payments.sell_payments` or document clear usage boundaries.

---

### GAP-HIGH-003: Inconsistent Status Case Convention
**Severity:** P1 HIGH
**Component:** Database Schema / API
**Description:** Status values use inconsistent casing across tables.

**Examples:**
- `public.sales.status`: 'pending', 'PENDING', 'PAID_CASH', 'PAID_UPI', 'DUE'
- `public.payments.status`: 'PENDING', 'PAID', 'FAILED' (uppercase)
- `payments.sell_payments.status`: 'pending', 'initiated', 'completed' (lowercase)
- `public.collections.status`: 'pending', 'paid', 'failed' (lowercase)

**Risk:** Frontend/backend bugs from case mismatches, inconsistent API responses.

**Recommendation:** Standardize on lowercase for all status values.

---

### GAP-HIGH-004: Missing Indexes for Common Queries
**Severity:** P1 HIGH
**Component:** Database Performance
**Description:** Several common query patterns lack indexes.

**Missing Indexes:**
```sql
-- Customer phone lookup for dues (partial index exists but full might help)
CREATE INDEX idx_sales_customer_phone ON public.sales(customer_phone) WHERE customer_phone IS NOT NULL;

-- Device enrollment code lookup (for validation)
CREATE INDEX idx_device_enrollments_code ON pos_device_enrollments(code);

-- Supplier products by store
CREATE INDEX idx_supplier_products_store ON supplier.supplier_products(store_id);
```

---

### GAP-HIGH-005: No Soft Delete for Critical Tables
**Severity:** P1 HIGH
**Component:** Database Schema
**Description:** Critical business tables use hard delete with no audit trail.

**Affected Tables:**
- `public.sales` - Voided sales can be deleted
- `pos_devices` - Devices can be removed without history
- `pos_device_enrollments` - Enrollment codes deleted after use

**Recommendation:** Add `deleted_at` column for soft delete on critical tables.

---

## MEDIUM PRIORITY GAPS (P2 - Fix Soon After Go-Live)

### GAP-MED-001: Enrollment Code Entropy
**Severity:** P2 MEDIUM
**Component:** Device Enrollment
**Description:** Code generation uses 6 bytes from crypto.randomBytes but modulo operation reduces entropy.

**Current Code:**
```typescript
const idx = bytes[i] % CODE_ALPHABET.length; // CODE_ALPHABET.length = 32
```

**Issue:** Modulo 32 introduces slight bias (256 % 32 = 0, so no bias here, but pattern should be documented).

**Note:** This is actually fine since 256/32 = 8 exactly. No action needed.

---

### GAP-MED-002: Missing Rate Limiting on Auth Endpoints
**Severity:** P2 MEDIUM
**Component:** Security
**Description:** Auth endpoints (login, register, OTP) should have stricter rate limits than general API.

**Current:** Global 100 req/min for all endpoints
**Recommended:**
- Login: 5 attempts/minute per IP
- OTP request: 3 attempts/minute per phone
- Registration: 10 attempts/hour per IP

---

### GAP-MED-003: No Request Correlation IDs
**Severity:** P2 MEDIUM
**Component:** Observability
**Description:** No correlation ID passed through request chain for debugging.

**Impact:** Difficult to trace requests across services in production logs.

**Fix:** Add X-Request-ID header generation in API Gateway, pass through to all services.

---

### GAP-MED-004: Missing Health Check Dependencies
**Severity:** P2 MEDIUM
**Component:** Infrastructure
**Description:** Health checks don't verify all critical dependencies.

**Current:** Basic `/health` returns OK
**Should Check:**
- Database connectivity
- Redis connectivity
- External API availability (Firebase, Razorpay if used)

---

### GAP-MED-005: No Database Connection Pooling Limits
**Severity:** P2 MEDIUM
**Component:** Database
**Description:** Connection pool limits not explicitly configured.

**Risk:** Under load, too many connections could exhaust database resources.

**Recommendation:** Configure explicit pool limits based on expected load.

---

## LOW PRIORITY GAPS (P3 - Nice to Have)

### GAP-LOW-001: Inconsistent API Response Format
**Description:** Some endpoints return `{ error: "message" }`, others return `{ error: "CODE", message: "text" }`.

### GAP-LOW-002: Missing OpenAPI/Swagger Documentation
**Description:** No auto-generated API documentation from code.

### GAP-LOW-003: No Database Migration Rollback Scripts
**Description:** Migrations are forward-only, no rollback capability.

### GAP-LOW-004: Hardcoded Demo Store Detection
**Description:** Demo store detection uses hardcoded "DEMO" prefix check.
```typescript
const isDemo = isDemoStoreCode(storeCode); // Checks for "DEMO" prefix
```

---

## SUPERADMIN PORTAL GAPS

### SA-GAP-001: Device Enrollments Pagination Bug
**Severity:** P2 MEDIUM
**Description:** Total count returns `rowCount` of current page, not total records.

**Current Code:**
```typescript
return res.json({
  enrollments: result.rows,
  pagination: {
    limit,
    offset,
    total: result.rowCount  // BUG: This is page count, not total
  }
});
```

**Fix Required:** Add separate COUNT(*) query for total.

---

### SA-GAP-002: Missing Audit Logging
**Severity:** P2 MEDIUM
**Description:** Admin actions (create enrollment, manage stores) not logged.

---

## RETAILER PORTAL GAPS

### RP-GAP-001: No Offline Mode Indicator
**Severity:** P2 MEDIUM
**Description:** POS app doesn't clearly indicate when operating offline.

### RP-GAP-002: Missing Sale Receipt Generation
**Severity:** P1 HIGH
**Description:** No thermal printer receipt generation implemented.

### RP-GAP-003: No Inventory Alerts
**Severity:** P2 MEDIUM
**Description:** Low stock alerts not implemented despite schema support.

---

## SUPPLIER PORTAL GAPS

### SP-GAP-001: Authentication Flow Completely Broken
**Severity:** P0 CRITICAL
**Description:** See GAP-CRIT-001 - tokens not accepted by backend.

### SP-GAP-002: Missing Order Management UI
**Severity:** P1 HIGH
**Description:** Order list and details pages not implemented.

### SP-GAP-003: No Payout History
**Severity:** P1 HIGH
**Description:** Payout tracking UI not implemented.

---

## DATABASE SCHEMA GAPS

### DB-GAP-001: Missing FK Constraints
**Tables missing foreign key enforcement:**
- `public.sales.store_id` -> `platform.stores.id`
- `public.sales.device_id` -> `pos_devices.id`
- `public.payments.sale_id` -> `public.sales.id` (partial - exists but verify)
- `public.payments.store_id` -> `platform.stores.id`

### DB-GAP-002: VARCHAR ID Fields
**Description:** Some tables use VARCHAR for IDs instead of UUID:
- `public.sales.id` - VARCHAR(100)
- `public.collections.id` - VARCHAR(100)
- `pos_devices.id` - VARCHAR(100)

**Note:** This is intentional for migration compatibility but creates join complexity.

### DB-GAP-003: Missing Updated Triggers
**Description:** `updated_at` columns exist but no triggers to auto-update them.

**Tables Affected:**
- `public.sales`
- `payments.customer_dues`
- `payments.bnpl_settings`

---

## SUMMARY

| Priority | Count | Status |
|----------|-------|--------|
| P0 Critical | 3 | Must fix before go-live |
| P1 High | 5 | Should fix before go-live |
| P2 Medium | 8 | Fix soon after go-live |
| P3 Low | 4 | Nice to have |

### Immediate Actions Required:
1. **Fix GAP-CRIT-001**: Resolve supplier token validation between services
2. **Fix GAP-CRIT-002**: Either add missing routes to supplier-service OR route all to main-backend
3. **Fix GAP-CRIT-003**: Add NOT NULL constraint to payments.store_id
4. **Fix SA-GAP-001**: Fix pagination total count bug

### Recommended Pre-Go-Live:
1. Standardize status case convention
2. Add missing FK constraints
3. Implement receipt generation for retailer portal
4. Add stricter auth rate limiting
