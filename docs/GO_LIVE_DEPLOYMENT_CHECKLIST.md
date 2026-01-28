# Go-Live Deployment Checklist

**Date:** 2026-01-28
**Status:** Ready for Deployment

## Local Testing Summary

| Test Type | Status | Notes |
|-----------|--------|-------|
| TypeScript Build (Backend) | PASS | All 9 services compile |
| TypeScript Build (Frontend) | PASS | All web apps build |
| ESLint | PASS | 54 warnings (non-blocking) |
| Unit Tests | BLOCKED | Windows UTF-8 encoding issue - requires Linux/WSL with UTF-8 |

**Note:** Full unit test suite requires a PostgreSQL database with UTF-8 encoding. Run on Linux/Mac or WSL with:
```bash
cd backend && npm test
```

## Build Verification

| Component | Build Status | Notes |
|-----------|--------------|-------|
| Backend (main + microservices) | PASS | All 9 services compile |
| retailer-admin | PASS | Vite build successful |
| supermandi-superadmin | PASS | Vite build successful |
| supplier-portal | PASS | Next.js build successful |
| POS Mobile App | - | React Native (builds on device) |

## Pending Migrations (Run in Order)

```bash
# Connect to production database and run:
psql $DATABASE_URL -f backend/migrations/057_upi_verifications_table.sql
psql $DATABASE_URL -f backend/migrations/058_device_label_unique_constraint.sql
psql $DATABASE_URL -f backend/migrations/059_supplier_password_reset.sql
psql $DATABASE_URL -f backend/migrations/060_supplier_bank_kyc.sql
psql $DATABASE_URL -f backend/migrations/061_shipment_tracking_columns.sql
psql $DATABASE_URL -f backend/migrations/062_email_verification.sql
psql $DATABASE_URL -f backend/migrations/063_token_security_hardening.sql
```

Or use the migration script:
```bash
cd backend && DATABASE_URL=<prod-url> npm run migrate:up
```

## Security Hardening Completed (GL-WF-045-A)

- [x] Token rotation (90-day TTL + auto-refresh at 30 days)
- [x] Server-side token revocation capability
- [x] Token scope verification (storeId + deviceId)
- [x] Rate limiting middleware (120 req/min general, 30 writes/min, 200 scans/min)
- [x] Audit logging for token events

## Critical Path Testing (Manual)

### 1. POS Device Enrollment
```bash
# Test enrollment endpoint
curl -X POST https://api.supermandi.com/api/v1/pos/enroll \
  -H "Content-Type: application/json" \
  -d '{"enrollmentCode": "TEST-CODE"}'

# Expected: 200 with deviceToken
```

### 2. Token Management (New GL-WF-045-A endpoints)
```bash
# Get token status
curl https://api.supermandi.com/api/v1/pos/token/status \
  -H "x-device-token: <token>"

# Refresh token
curl -X POST https://api.supermandi.com/api/v1/pos/token/refresh \
  -H "x-device-token: <token>"

# Get audit log
curl https://api.supermandi.com/api/v1/pos/token/audit \
  -H "x-device-token: <token>"
```

### 3. SELL Flow
```bash
# Create sale
curl -X POST https://api.supermandi.com/api/v1/pos/sales \
  -H "x-device-token: <token>" \
  -H "Content-Type: application/json" \
  -d '{"items": [...], "paymentMethod": "CASH"}'
```

### 4. BUY Flow
```bash
# Search suppliers
curl https://api.supermandi.com/api/v1/pos/suppliers \
  -H "x-device-token: <token>"

# Create purchase order
curl -X POST https://api.supermandi.com/api/v1/pos/purchases \
  -H "x-device-token: <token>" \
  -H "Content-Type: application/json"
```

### 5. BNPL Flow
```bash
# Get BNPL eligibility
curl https://api.supermandi.com/api/v1/pos/bnpl/eligibility \
  -H "x-device-token: <token>"

# Get outstanding dues
curl https://api.supermandi.com/api/v1/pos/bnpl/dues \
  -H "x-device-token: <token>"
```

### 6. Supplier Portal
```bash
# Supplier login
curl -X POST https://supplier.supermandi.com/api/v1/supplier/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@supplier.com", "password": "xxx"}'

# Get dashboard
curl https://supplier.supermandi.com/api/v1/supplier/dashboard \
  -H "Authorization: Bearer <token>"
```

## Environment Variables Required

### Backend
```
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=<secret>
RAZORPAY_KEY_ID=<key>
RAZORPAY_KEY_SECRET=<secret>
SENDGRID_API_KEY=<key>
```

### Frontend Apps
```
VITE_API_URL=https://api.supermandi.com
VITE_FIREBASE_*=<firebase-config>
```

## Deployment Steps

1. **Database Migration**
   ```bash
   DATABASE_URL=<prod> npm run migrate:up
   ```

2. **Deploy Backend**
   ```bash
   # Deploy main backend service
   # Deploy microservices (if separate)
   ```

3. **Deploy Web Apps**
   ```bash
   # retailer-admin -> retailer.supermandi.com
   # supermandi-superadmin -> admin.supermandi.com
   # supplier-portal -> supplier.supermandi.com
   ```

4. **Verify Health Endpoints**
   ```bash
   curl https://api.supermandi.com/api/v1/admin/health
   # Expected: {"status": "healthy"}
   ```

5. **Smoke Test Critical Flows**
   - Device enrollment
   - SELL transaction
   - BUY order placement
   - BNPL eligibility check

## Rollback Plan

If issues are found post-deployment:

1. **Backend Rollback**
   ```bash
   # Revert to previous version
   git checkout <previous-tag>
   # Redeploy
   ```

2. **Database Rollback** (if needed)
   ```bash
   # Each migration has a DOWN script
   npm run migrate:down
   ```

## Sign-off

- [ ] Database migrations applied successfully
- [ ] Backend services healthy
- [ ] Web apps deployed and accessible
- [ ] POS enrollment working
- [ ] SELL flow working
- [ ] BUY flow working
- [ ] BNPL flow working
- [ ] Supplier portal accessible

---
Generated: 2026-01-28
