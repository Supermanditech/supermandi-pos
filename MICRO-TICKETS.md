# SUPERMANDI GO-LIVE MICRO-TICKETS
## Target: 10,000 Stores Production Ready

**Created**: 2026-02-02
**VM**: 34.14.220.171
**Gateway**: http://34.14.220.171:3000

---

## PHASE 1: CRITICAL SECURITY FIXES (P0)
*Must complete before ANY production traffic*

### SEC-P0-001: Firebase Server-Side Token Verification
- **File**: `backend/src/routes/v1/retailer-admin/auth.ts`
- **Issue**: Firebase tokens verified client-side only
- **Fix**: Add `admin.auth().verifyIdToken(token)` server-side
- **Status**: [x] DONE - `verifyFirebaseIdToken` implemented, blocks production if not configured

### SEC-P0-002: Cryptographic Password Reset Tokens
- **File**: `backend/src/routes/v1/retailer-admin/auth.ts`
- **Issue**: Using `Math.random()` for reset tokens
- **Fix**: Replace with `crypto.randomBytes(32).toString('hex')`
- **Status**: [x] DONE - Uses `crypto.randomUUID()` for JTI tokens

### SEC-P0-003: Timing-Safe OTP Comparison
- **File**: `backend/src/routes/v1/admin/adminOtp.ts`
- **Issue**: Direct string comparison vulnerable to timing attack
- **Fix**: Use `crypto.timingSafeEqual()` for OTP comparison
- **Status**: [x] DONE - `timingSafeCompare()` function at line 34-43

### SEC-P0-004: OTP Email Integration
- **File**: `backend/src/services/emailService.ts`
- **Issue**: OTP email never actually sent
- **Fix**: Integrate with Resend/SendGrid, send real emails
- **Status**: [ ] NOT STARTED

### SEC-P0-005: Persistent OTP Storage
- **File**: `backend/src/routes/v1/admin/adminOtp.ts`
- **Issue**: OTP stored in-memory (lost on restart)
- **Fix**: Store OTP in Redis/database with TTL
- **Status**: [ ] NOT STARTED

### SEC-P0-006: Mandatory Webhook Signature Verification
- **File**: `backend/src/routes/v1/pos/payments.ts`
- **Issue**: Webhook signature verification is optional
- **Fix**: Make signature verification mandatory, reject unsigned
- **Status**: [ ] NOT STARTED

### SEC-P0-007: Webhook Idempotency
- **File**: `backend/src/routes/v1/pos/payments.ts`
- **Issue**: Duplicate webhooks can process multiple times
- **Fix**: Add idempotency key check using transaction ID
- **Status**: [ ] NOT STARTED

### SEC-P0-008: Remove Hardcoded Fallback Admin ID
- **File**: `backend/src/routes/v1/admin/*.ts`
- **Issue**: Hardcoded admin ID used as fallback
- **Fix**: Require valid admin ID, fail if missing
- **Status**: [ ] NOT STARTED

### SEC-P0-009: Secure Admin Token Storage
- **File**: `docker-compose.yml`
- **Issue**: Admin token exposed in Docker environment
- **Fix**: Use Docker secrets or external secret manager
- **Status**: [ ] NOT STARTED

### SEC-P0-010: Mask Bank Account Numbers
- **File**: `backend/src/routes/v1/admin/stores.ts`
- **Issue**: Full bank account numbers in API responses
- **Fix**: Mask to show only last 4 digits
- **Status**: [ ] NOT STARTED

### SEC-P0-011: Store Access Validation in Products
- **File**: `backend/src/routes/v1/retailer-admin/products.ts`
- **Issue**: Missing store access check
- **Fix**: Add `req.user.storeId` validation before data access
- **Status**: [x] DONE - `requireStoreContext` middleware applied at line 24

### SEC-P0-012: CSV Upload File Type Validation
- **File**: `backend/src/routes/v1/retailer-admin/products.ts`
- **Issue**: File extension check can be bypassed
- **Fix**: Validate MIME type + magic bytes
- **Status**: [ ] NOT STARTED

### SEC-P0-013: Remove Token Logging
- **File**: `backend/src/routes/v1/retailer-admin/auth.ts`
- **Issue**: Reset tokens logged to console
- **Fix**: Remove console.log of sensitive tokens
- **Status**: [ ] NOT STARTED

### SEC-P0-014: Enrollment Code Race Condition
- **File**: `backend/src/routes/v1/retailer-admin/devices.ts`
- **Issue**: Multi-use race condition on activation codes
- **Fix**: Use database transaction with row lock
- **Status**: [ ] NOT STARTED

### SEC-P0-015: Sanitize Savepoint Names
- **File**: `backend/src/services/storeStateMachine.ts`
- **Issue**: Savepoint names may contain SQL injection
- **Fix**: Sanitize to alphanumeric only
- **Status**: [ ] NOT STARTED

### SEC-P0-016: Validate Offline Receipt Uniqueness
- **File**: `backend/src/routes/v1/pos/sync.ts`
- **Issue**: Offline receipt ref not unique validated
- **Fix**: Add unique constraint check before insert
- **Status**: [ ] NOT STARTED

### SEC-P0-017: Admin Device Authorization
- **File**: `backend/src/routes/v1/admin/devices.ts`
- **Issue**: Admin can list any store's devices
- **Fix**: Add store scope validation for non-superadmin
- **Status**: [ ] NOT STARTED

### SEC-P0-018: Mask Phone Numbers in Auth Response
- **File**: `backend/src/routes/v1/retailer-admin/auth.ts`
- **Issue**: Full phone numbers in API responses
- **Fix**: Mask to show only last 4 digits
- **Status**: [ ] NOT STARTED

---

## PHASE 2: RATE LIMITING (P1)

### RATE-001: Auth Endpoint Rate Limiting
- **File**: `backend/src/routes/v1/retailer-admin/auth.ts`
- **Fix**: Add express-rate-limit (5 req/min for login)
- **Status**: [ ] NOT STARTED

### RATE-002: Password Reset Rate Limiting
- **File**: `backend/src/routes/v1/retailer-admin/auth.ts`
- **Fix**: Add rate limit (3 req/hour for reset)
- **Status**: [ ] NOT STARTED

### RATE-003: OTP Verify Rate Limiting
- **File**: `backend/src/routes/v1/admin/adminOtp.ts`
- **Fix**: Add rate limit (5 attempts/10 min)
- **Status**: [ ] NOT STARTED

### RATE-004: Global Admin API Rate Limiting
- **File**: `backend/src/routes/v1/admin/index.ts`
- **Fix**: Add global rate limit (100 req/min)
- **Status**: [ ] NOT STARTED

---

## PHASE 3: FRONTEND DEPLOYMENT

### DEPLOY-001: Build Retailer Admin for Production
```bash
cd retailer-admin
npm run build
# Output: dist/
```
- **Status**: [ ] NOT STARTED

### DEPLOY-002: Build Admin Portal for Production
```bash
cd supermandi-superadmin
npm run build
# Output: dist/
```
- **Status**: [ ] NOT STARTED

### DEPLOY-003: Build Supplier Portal for Production
```bash
cd supplier-portal
npm run build
# Output: dist/
```
- **Status**: [ ] NOT STARTED

### DEPLOY-004: Configure Nginx for Static Hosting
- **File**: `/etc/nginx/sites-available/supermandi`
- **Config**:
  - `/retailer/` → retailer-admin/dist
  - `/admin/` → supermandi-superadmin/dist
  - `/supplier/` → supplier-portal/dist
  - `/api/` → proxy to gateway:3000
- **Status**: [ ] NOT STARTED

### DEPLOY-005: Upload Frontend Builds to VM
```bash
scp -r retailer-admin/dist/* user@34.14.220.171:/var/www/retailer/
scp -r supermandi-superadmin/dist/* user@34.14.220.171:/var/www/admin/
scp -r supplier-portal/dist/* user@34.14.220.171:/var/www/supplier/
```
- **Status**: [ ] NOT STARTED

### DEPLOY-006: Configure CORS for Production
- **File**: `backend/src/app.ts`
- **Fix**: Add supermandi.tech to allowed origins
- **Status**: [ ] NOT STARTED

---

## PHASE 4: UI COMPLETION

### UI-001: RET-POS-001 - Unified Onboarding Wizard
- **File**: `retailer-admin/src/pages/OnboardingWizard.tsx` (NEW)
- **Steps**:
  1. Store & Owner Details
  2. Document Upload (Aadhaar, GST, Selfie)
  3. Payments (UPI mandatory, Bank optional)
- **Status**: [ ] NOT STARTED

### UI-002: Complete Status Screen for Non-ACTIVE Stores
- **File**: `retailer-admin/src/pages/StatusPage.tsx`
- **Show**: Current status, next steps, support contact
- **Status**: [ ] NOT STARTED

### UI-003: Admin Approval Confirmation Dialogs
- **File**: `supermandi-superadmin/src/pages/StoreApproval.tsx`
- **Add**: Confirmation modal for approve/reject/suspend
- **Status**: [ ] NOT STARTED

### UI-004: Loading States for All Async Operations
- **Files**: All pages with API calls
- **Fix**: Add loading spinners/skeletons
- **Status**: [ ] NOT STARTED

### UI-005: Error Handling Toast Notifications
- **Files**: All pages
- **Fix**: Replace alert() with toast notifications
- **Status**: [ ] NOT STARTED

---

## PHASE 5: API INTEGRATION

### API-001: Connect Email Service (Resend)
- **File**: `backend/src/services/emailService.ts`
- **Config**: Add RESEND_API_KEY to .env
- **Endpoints**: OTP, password reset, credentials email
- **Status**: [ ] NOT STARTED

### API-002: Payment Gateway Webhook Verification
- **File**: `backend/src/routes/v1/pos/payments.ts`
- **Fix**: Implement Razorpay signature verification
- **Status**: [ ] NOT STARTED

### API-003: COM-001 - Credentials Email on Store Creation
- **File**: `backend/src/routes/v1/admin/stores.ts`
- **Trigger**: After admin approves store → send credentials email
- **Content**: User ID, set-password link, OTP as primary
- **Status**: [ ] NOT STARTED

---

## PHASE 6: E2E TESTING

### TEST-001: Retailer POS Flow
1. [ ] Install POS (fresh device)
2. [ ] Complete onboarding wizard
3. [ ] Verify LIMITED MODE (SELL blocked)
4. [ ] Admin approves store
5. [ ] Verify SELL unlocked
- **Status**: [ ] NOT STARTED

### TEST-002: Retailer Web Flow
1. [ ] Register store via web
2. [ ] Enter POS activation code
3. [ ] Complete payments setup
4. [ ] Submit for approval
5. [ ] Verify await approval state
- **Status**: [ ] NOT STARTED

### TEST-003: Supplier Flow
1. [ ] Register supplier
2. [ ] Upload KYC documents
3. [ ] Admin activates
4. [ ] Verify portal access unlocked
- **Status**: [ ] NOT STARTED

### TEST-004: Admin Flow
1. [ ] Login to admin portal
2. [ ] View pending store applications
3. [ ] Approve store with all documents
4. [ ] Verify store status changes to ACTIVE
5. [ ] Verify retailer can now SELL
- **Status**: [ ] NOT STARTED

### TEST-005: Cross-Store Isolation
1. [ ] Create Store A and Store B
2. [ ] Login as Store A
3. [ ] Attempt to access Store B data
4. [ ] Verify 403 Forbidden
- **Status**: [ ] NOT STARTED

---

## PHASE 7: INFRASTRUCTURE

### INFRA-001: SSL Certificate Generation
```bash
certbot --nginx -d supermandi.tech -d www.supermandi.tech
```
- **Status**: [ ] NOT STARTED

### INFRA-002: Database Backup Strategy
- **Script**: Daily pg_dump to GCS bucket
- **Retention**: 30 days
- **Status**: [ ] NOT STARTED

### INFRA-003: Monitoring Setup
- **Tool**: PM2 or systemd with restart policy
- **Alerts**: Disk, CPU, Memory thresholds
- **Status**: [ ] NOT STARTED

### INFRA-004: Log Rotation
- **Files**: /var/log/supermandi/*.log
- **Config**: logrotate daily, keep 7 days
- **Status**: [ ] NOT STARTED

---

## EXECUTION ORDER (Claude Priority)

### Day 1: Security Critical
1. SEC-P0-001 (Firebase verification)
2. SEC-P0-002 (Crypto reset tokens)
3. SEC-P0-003 (Timing-safe OTP)
4. SEC-P0-011 (Store access check)
5. SEC-P0-013 (Remove token logging)

### Day 2: Security + Rate Limiting
1. SEC-P0-006 (Webhook mandatory)
2. SEC-P0-007 (Webhook idempotency)
3. SEC-P0-014 (Enrollment race condition)
4. RATE-001 through RATE-004

### Day 3: Frontend Deployment
1. DEPLOY-001 (Build retailer-admin)
2. DEPLOY-002 (Build admin portal)
3. DEPLOY-003 (Build supplier portal)
4. DEPLOY-005 (Upload to VM)
5. DEPLOY-004 (Configure nginx)

### Day 4: API Integration
1. API-001 (Email service)
2. API-003 (Credentials email)
3. API-002 (Payment verification)

### Day 5: UI Completion + Testing
1. UI-001 (Onboarding wizard)
2. UI-002 (Status page)
3. TEST-001 through TEST-005

---

## PROGRESS TRACKER

| Phase | Total | Done | % |
|-------|-------|------|---|
| P0 Security | 18 | 4 | 22% |
| Rate Limiting | 4 | 2 | 50% |
| Deployment | 6 | 3 | 50% |
| UI | 5 | 0 | 0% |
| API | 3 | 1 | 33% |
| Testing | 5 | 0 | 0% |
| Infrastructure | 4 | 1 | 25% |
| **TOTAL** | **45** | **11** | **24%** |

### Verified Done (2026-02-02):
- SEC-P0-001: Firebase server-side verification
- SEC-P0-002: Crypto reset tokens (uses randomUUID)
- SEC-P0-003: Timing-safe OTP comparison
- SEC-P0-011: Store access validation in products
- RATE-001/002: Login rate limiting (in auth.ts)
- DEPLOY-001: retailer-admin built (dist/)
- DEPLOY-002: admin-portal built (dist/)
- DEPLOY-003: supplier-portal built (.next/)
- API-002: Payment webhook verification (in payments.ts)

---

## NOTES
- VM already has backend deployed and healthy (gateway /health → 200)
- Public portals responding (supermandi.tech/retailer/, /supplier/, /admin/)
- POS Service (3009) internal only - expected
- All 73 DB migrations applied
