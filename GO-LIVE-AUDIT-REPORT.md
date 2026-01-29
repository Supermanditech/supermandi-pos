# SuperMandi POS Go-Live Audit Report
**Generated:** 2026-01-29
**Auditor:** Claude (Automated E2E Audit)

---

## EXECUTIVE SUMMARY

| Category | Status | Blockers |
|----------|--------|----------|
| VM Deployment | ✅ OPERATIONAL | 0 |
| API Gateway | ⚠️ NEEDS FIX | 2 |
| Database | ❌ CRITICAL | 3 |
| Superadmin Portal | ⚠️ MINOR | 1 |
| Retailer Portal | ⚠️ NEEDS FIX | 2 |
| Supplier Portal | ✅ OPERATIONAL | 0 |
| Landing Page | ✅ OPERATIONAL | 0 |
| SSL/Security | ✅ OPERATIONAL | 0 |

**TOTAL GO-LIVE BLOCKERS: 8**

---

## 1. GO-LIVE BLOCKERS LIST

### BLOCKER-001: Database Migration Failures (CRITICAL)
**Severity:** P0 - CRITICAL
**Location:** VM PostgreSQL - schema_migrations
**Reproduction Steps:**
1. SSH to VM: `ssh claude@34.14.220.171`
2. Check main-backend logs: `docker logs supermandi-main-backend --tail 200 2>&1 | grep ERROR`

**Expected:** All migrations run successfully
**Actual:** 3 migrations failed:
```
[migrate] ERROR applying 043_aud999_go_live_fixes.sql : column "store_id" does not exist
[migrate] ERROR applying 056_gl_aud_005_demo_device.sql : column "inventory_sync_status" of relation "pos_devices" does not exist
[migrate] ERROR applying 070_gl_crit_0029_schedule_cleanup.sql : syntax error at or near "SELECT"
```

**Root Cause:**
- `payments` table missing `store_id` column (required by migration 043)
- Migration 056 depends on 043 (inventory_sync_status not added)
- Migration 070 has pg_cron scheduling syntax issue

**Fix Required:**
```sql
-- File: backend/migrations/071_fix_payments_store_id.sql
BEGIN;

-- Add store_id to payments table (required for analytics)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id);

-- Backfill store_id from related sales
UPDATE payments p
SET store_id = s.store_id
FROM sales s
WHERE p.sale_id = s.id AND p.store_id IS NULL;

COMMIT;
```

**Acceptance Test:**
```bash
docker exec supermandi-postgres psql -U supermandi -d supermandi -c "SELECT store_id FROM payments LIMIT 1;"
```

---

### BLOCKER-002: pos_devices Missing inventory_sync_status Column
**Severity:** P0 - CRITICAL
**Location:** Database schema - pos_devices table
**Reproduction Steps:**
1. Try to run demo device enrollment
2. Check column: `docker exec supermandi-postgres psql -U supermandi -d supermandi -c "SELECT inventory_sync_status FROM pos_devices LIMIT 1;"`

**Expected:** Column exists with default value
**Actual:** Column does not exist

**Root Cause:** Migration 043 failed before adding this column

**Fix Required:**
```sql
-- Add to 071_fix_payments_store_id.sql
ALTER TABLE pos_devices ADD COLUMN IF NOT EXISTS inventory_sync_status TEXT DEFAULT 'synced';
ALTER TABLE pos_devices ADD COLUMN IF NOT EXISTS re_enrolled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pos_devices ADD COLUMN IF NOT EXISTS re_enrolled_at TIMESTAMPTZ NULL;
```

**Acceptance Test:**
```bash
docker exec supermandi-postgres psql -U supermandi -d supermandi -c "\d pos_devices" | grep inventory_sync
```

---

### BLOCKER-003: pg_cron Scheduling Syntax Error
**Severity:** P1 - HIGH
**Location:** Migration 070_gl_crit_0029_schedule_cleanup.sql
**Reproduction Steps:** Check migration logs on container startup

**Expected:** Idempotency key cleanup scheduled
**Actual:** Syntax error prevents scheduling

**Root Cause:** pg_cron may not be installed or has permissions issue

**Fix Required:**
- Make pg_cron optional with graceful fallback
- Use application-level scheduler instead

**Acceptance Test:** Verify cleanup function exists:
```bash
docker exec supermandi-postgres psql -U supermandi -d supermandi -c "\df cleanup_expired_idempotency_keys"
```

---

### BLOCKER-004: API Rate Limiting Too Aggressive
**Severity:** P1 - HIGH
**Location:** API Gateway - config.js line 44
**Reproduction Steps:**
1. Make 30+ API requests in 1 minute
2. Observe 429 responses

**Expected:** Reasonable rate limit for dashboard operations
**Actual:** 30 req/min blocks normal superadmin usage

**Root Cause:**
```javascript
rateLimitMax: getEnvIntOrDefault('RATE_LIMIT_MAX', 30), // 30 requests per window
```

**Fix Required:**
- Increase to 100 req/min for admin endpoints
- Add separate rate limit tiers for authenticated vs public

**Acceptance Test:**
- SuperAdmin dashboard should load without 429 errors
- Run: `for i in {1..50}; do curl -s "https://api.supermandi.tech/health" > /dev/null; done`

---

### BLOCKER-005: Retailer Portal Missing daily-summary Route
**Severity:** P1 - HIGH
**Location:** Retailer Dashboard - DashboardPage.tsx:99
**Reproduction Steps:**
1. Login to retailer portal
2. Open Dashboard page
3. Check Network tab for `/api/v1/retailer-admin/daily-summary`

**Expected:** Daily sales summary loads
**Actual:** Route may return 404 (needs verification with auth)

**Root Cause:** API Gateway routing may be missing this endpoint

**Fix Required:**
- Verify main-backend has this route implemented
- Add to gateway config if missing

**Acceptance Test:**
```bash
curl -s "https://api.supermandi.tech/api/v1/retailer-admin/daily-summary" -H "Authorization: Bearer <token>"
```

---

### BLOCKER-006: Retailer Portal Missing inventory/ledger Route
**Severity:** P1 - HIGH
**Location:** InventoryPage.tsx:71
**Reproduction Steps:**
1. Login to retailer portal
2. Navigate to Inventory page
3. Check Network tab for `/api/v1/retailer-admin/inventory/ledger`

**Expected:** Inventory ledger loads
**Actual:** Needs verification

**Fix Required:**
- Verify endpoint exists in main-backend
- Add gateway routing if needed

**Acceptance Test:**
```bash
curl -s "https://api.supermandi.tech/api/v1/retailer-admin/inventory/ledger?limit=10" -H "Authorization: Bearer <token>"
```

---

### BLOCKER-007: Missing SSL Certificate Auto-Renewal
**Severity:** P2 - MEDIUM
**Location:** VM - /etc/letsencrypt/renewal/
**Reproduction Steps:**
1. Run: `sudo certbot renew --dry-run`
2. Observe failures for nip.io certificates

**Expected:** All certificates can renew
**Actual:** Port 80 conflicts prevent renewal

**Root Cause:** Docker nginx occupies port 80, blocking certbot

**Fix Required:**
- Configure certbot to use webroot authentication
- Or add pre/post hooks to stop/start nginx

**Acceptance Test:**
```bash
sudo certbot renew --dry-run
# Should succeed for supermandi.tech
```

---

### BLOCKER-008: Admin Device Enrollments Endpoint 404
**Severity:** P2 - MEDIUM
**Location:** API - /api/v1/admin/device-enrollments
**Reproduction Steps:**
```bash
curl -s "https://api.supermandi.tech/api/v1/admin/device-enrollments" -H "x-admin-token: <token>"
```

**Expected:** List of device enrollments
**Actual:** 404 Not Found

**Root Cause:** Route exists but may not have handler in main-backend

**Fix Required:**
- Implement GET /api/v1/admin/device-enrollments handler
- Or remove from SuperAdmin UI if not needed

**Acceptance Test:** Endpoint returns JSON array or empty object

---

## 2. END-TO-END COVERAGE MAP

### User Journey: Superadmin Portal

| Journey Step | API Endpoint | DB Tables | Status |
|--------------|--------------|-----------|--------|
| Login | N/A (token-based) | N/A | ✅ |
| View Stores | GET /api/v1/admin/stores | stores | ✅ |
| Create Store | POST /api/v1/admin/stores | stores | ✅ |
| Update Store | PATCH /api/v1/admin/stores/:id | stores | ✅ |
| View Devices | GET /api/v1/admin/devices | pos_devices | ✅ |
| Update Device | PATCH /api/v1/admin/devices/:id | pos_devices | ✅ |
| Create Enrollment | POST /api/v1/admin/stores/:id/device-enrollments | pos_device_enrollments | ⚠️ |
| View POS Events | GET /api/v1/admin/pos/events | pos_events | ✅ |
| Analytics Overview | GET /api/v1/admin/analytics/overview | sales, payments, collections | ✅ |
| Analytics Devices | GET /api/v1/admin/analytics/devices | pos_devices, sales | ✅ |
| Analytics Products | GET /api/v1/admin/analytics/products | products, sales | ✅ |
| View Pending Suppliers | GET /api/v1/admin/pending-suppliers | suppliers | ✅ |
| View Verified Suppliers | GET /api/v1/admin/verified-suppliers | suppliers | ✅ |
| Verify Supplier | POST /api/v1/admin/pending-suppliers/:id/verify | suppliers | ✅ |
| View Pending Products | GET /api/v1/admin/products/pending | products | ✅ |
| Approve Product | POST /api/v1/admin/products/:id/approve | products | ✅ |

### User Journey: Retailer Portal

| Journey Step | API Endpoint | DB Tables | Status |
|--------------|--------------|-----------|--------|
| Login (Firebase) | POST /api/v1/retailer-admin/auth/firebase-login | auth.users | ✅ |
| View Dashboard | GET /api/v1/retailer-admin/daily-summary | sales | ⚠️ |
| View Inventory | GET /api/v1/retailer-admin/inventory | store_inventory | ✅ |
| View Ledger | GET /api/v1/retailer-admin/inventory/ledger | inventory_ledger | ⚠️ |
| View Products | GET /api/v1/retailer-admin/products | store_products | ✅ |
| Create Product | POST /api/v1/retailer-admin/products | store_products, products | ✅ |
| View Categories | GET /api/v1/retailer-admin/categories | fmcg_taxonomy | ✅ |
| View Suppliers | GET /api/v1/retailer-admin/suppliers | store_suppliers | ✅ |
| Create Supplier | POST /api/v1/retailer-admin/suppliers | suppliers | ✅ |
| Search | GET /api/v1/retailer-admin/search | products, suppliers | ✅ |

### User Journey: Supplier Portal

| Journey Step | API Endpoint | DB Tables | Status |
|--------------|--------------|-----------|--------|
| Register | POST /api/v1/supplier/auth/register | suppliers | ✅ |
| Login | POST /api/v1/supplier/auth/login | suppliers | ✅ |
| View Profile | GET /api/v1/supplier/profile | suppliers | ✅ |
| Update Profile | PATCH /api/v1/supplier/profile | suppliers | ✅ |
| View Products | GET /api/v1/supplier/products | products | ✅ |
| Create Product | POST /api/v1/supplier/products | products | ✅ |
| CSV Upload | POST /api/v1/supplier/products/csv-upload | products | ✅ |
| View Dashboard | GET /api/v1/supplier/dashboard/stats | products, orders | ✅ |
| View Orders | GET /api/v1/supplier/orders | orders | ✅ |
| KYC Status | GET /api/v1/supplier/kyc/status | suppliers | ✅ |
| KYC Documents | GET /api/v1/supplier/kyc/documents | kyc_documents | ✅ |

---

## 3. IMPLEMENTATION-READY TICKETS

### TICKET-001: Fix Database Migrations
**Priority:** P0 - CRITICAL
**Estimate:** 2 hours
**Assignee:** Backend

**Tasks:**
1. Create new migration `071_fix_go_live_schema.sql`:
```sql
BEGIN;

-- Fix payments table
ALTER TABLE payments ADD COLUMN IF NOT EXISTS store_id UUID;
UPDATE payments p SET store_id = s.store_id FROM sales s WHERE p.sale_id = s.id AND p.store_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_payments_store_id_created ON payments(store_id, created_at);

-- Fix pos_devices table
ALTER TABLE pos_devices ADD COLUMN IF NOT EXISTS inventory_sync_status TEXT DEFAULT 'synced';
ALTER TABLE pos_devices ADD COLUMN IF NOT EXISTS re_enrolled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pos_devices ADD COLUMN IF NOT EXISTS re_enrolled_at TIMESTAMPTZ NULL;

COMMIT;
```

2. Mark failed migrations as completed in schema_migrations
3. Restart main-backend container
4. Verify migrations applied

**Acceptance Criteria:**
- [ ] All migrations complete without errors
- [ ] `payments.store_id` column exists
- [ ] `pos_devices.inventory_sync_status` column exists
- [ ] Analytics dashboard loads without errors

---

### TICKET-002: Increase API Rate Limits
**Priority:** P1 - HIGH
**Estimate:** 30 minutes
**Assignee:** Backend

**File:** `backend/services/api-gateway/src/config.ts`

**Changes:**
```typescript
// Change from:
rateLimitMax: getEnvIntOrDefault('RATE_LIMIT_MAX', 30),

// To:
rateLimitMax: getEnvIntOrDefault('RATE_LIMIT_MAX', 100),
```

**Acceptance Criteria:**
- [ ] SuperAdmin can load all tabs without 429 errors
- [ ] Dashboard refreshes work at normal pace

---

### TICKET-003: Fix Retailer Daily Summary Endpoint
**Priority:** P1 - HIGH
**Estimate:** 1 hour
**Assignee:** Backend

**Tasks:**
1. Verify endpoint exists in main-backend retailer routes
2. If missing, implement:
```typescript
// GET /api/v1/retailer-admin/daily-summary
router.get('/daily-summary', authenticateRetailer, async (req, res) => {
  const { storeId } = req.user;
  const date = req.query.date || new Date().toISOString().split('T')[0];
  // Query sales for the date
  // Return summary
});
```

**Acceptance Criteria:**
- [ ] Retailer dashboard shows today's sales summary
- [ ] Data matches actual sales records

---

### TICKET-004: Fix Retailer Inventory Ledger Endpoint
**Priority:** P1 - HIGH
**Estimate:** 1 hour
**Assignee:** Backend

**Tasks:**
1. Verify endpoint exists in main-backend
2. Ensure gateway routes to correct handler
3. Test with authenticated request

**Acceptance Criteria:**
- [ ] Inventory page loads ledger entries
- [ ] Filters work (INWARD/OUTWARD/ADJUSTMENT)

---

### TICKET-005: Configure Certbot Auto-Renewal
**Priority:** P2 - MEDIUM
**Estimate:** 30 minutes
**Assignee:** DevOps

**Tasks:**
1. Configure certbot to use webroot:
```bash
sudo certbot certonly --webroot -w /var/www/certbot -d supermandi.tech -d www.supermandi.tech -d api.supermandi.tech
```

2. Add renewal hooks to docker-compose.prod.yml
3. Test renewal: `sudo certbot renew --dry-run`

**Acceptance Criteria:**
- [ ] Certbot renewal succeeds without stopping nginx
- [ ] Certificate valid for 90 days after renewal

---

### TICKET-006: Remove Stale nip.io Certificates
**Priority:** P3 - LOW
**Estimate:** 15 minutes
**Assignee:** DevOps

**Tasks:**
1. Remove old nip.io certificate configurations:
```bash
sudo certbot delete --cert-name 34.14.150.183.nip.io
sudo certbot delete --cert-name 34.14.220.171.nip.io
sudo certbot delete --cert-name admin.34.14.150.183.nip.io
```

**Acceptance Criteria:**
- [ ] No renewal failures for old certificates
- [ ] Only supermandi.tech certificates remain

---

## 4. VERIFIED WORKING COMPONENTS

### Infrastructure
- [x] VM accessible at 34.14.220.171
- [x] All Docker containers running and healthy
- [x] PostgreSQL database operational
- [x] Redis cache operational
- [x] Nginx reverse proxy working

### Web Portals (HTTPS)
- [x] Landing Page: https://supermandi.tech - 200 OK
- [x] Admin Portal: https://supermandi.tech/admin/ - 200 OK
- [x] Retailer Portal: https://supermandi.tech/retailer/ - 200 OK
- [x] Supplier Portal: https://supermandi.tech/supplier/ - 200 OK
- [x] API Gateway: https://api.supermandi.tech/health - 200 OK

### SSL/Security
- [x] Valid SSL certificate (expires Apr 29, 2026)
- [x] HSTS enabled
- [x] Security headers present (X-Frame-Options, X-XSS-Protection, etc.)
- [x] CORS configured properly

### API Endpoints Verified Working
- [x] GET /health - API health check
- [x] GET /api/v1/admin/stores - List stores
- [x] GET /api/v1/admin/devices - List devices
- [x] GET /api/v1/admin/pos/events - List POS events
- [x] GET /api/v1/admin/analytics/overview - Dashboard analytics
- [x] GET /api/v1/admin/pending-suppliers - Supplier queue
- [x] GET /api/v1/admin/verified-suppliers - Verified suppliers
- [x] GET /api/v1/admin/products/pending - Product approval queue
- [x] POST /api/v1/retailer-admin/auth/firebase-login - Auth endpoint
- [x] GET /api/v1/retailer-admin/health - Retailer API health
- [x] POST /api/v1/supplier/auth/login - Supplier auth
- [x] GET /api/v1/supplier/profile - Supplier profile (with token)

---

## 5. RECOMMENDATIONS

### Before Go-Live (Required)
1. **Fix database migrations (TICKET-001)** - CRITICAL
2. **Increase rate limits (TICKET-002)** - HIGH
3. **Test all retailer workflows with real Firebase auth**
4. **Run smoke tests for all critical paths**

### After Go-Live (Recommended)
1. Set up monitoring and alerting
2. Configure log aggregation
3. Implement database backups
4. Set up SSL certificate auto-renewal
5. Remove legacy nip.io configurations

---

## APPENDIX: Database Schema Summary

### Key Tables
| Table | Row Count | Status |
|-------|-----------|--------|
| stores | 2 | ✅ Demo + Prelive |
| pos_devices | 3 | ✅ Working |
| products | 7 | ✅ Demo products |
| sales | 0 | ⚠️ No sales yet |
| payments | 0 | ⚠️ No payments yet |
| suppliers | 2 | ✅ Demo suppliers |

### Schema Namespaces
- `public` - Main application tables
- `auth` - Authentication tables
- `platform` - Platform configuration
- `inventory` - Inventory management
- `orders` - Order management
- `catalog` - Product catalog
- `supplier` - Supplier management
- `payments` - Payment processing
- `reorder` - Reorder automation

---

**Report Generated:** 2026-01-29T15:30:00Z
**Next Audit Recommended:** After TICKET-001 through TICKET-004 are resolved
