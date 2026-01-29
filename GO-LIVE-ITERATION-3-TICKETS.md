# GO-LIVE ITERATION 3 - COMPREHENSIVE TICKETS

**Generated:** 2026-01-29
**Total Issues Found:** 125+
**Status:** Pre-implementation

---

## PRIORITY MATRIX

| Priority | Count | Action |
|----------|-------|--------|
| P0 Critical | 13 | MUST fix before go-live |
| P1 High | 25 | SHOULD fix before go-live |
| P2 Medium | 40+ | Fix within 1 week post-launch |
| P3 Low | 40+ | Backlog |

---

## P0 CRITICAL TICKETS (MUST FIX)

### ITER3-P0-001: CORS Configuration Overly Permissive
- **File**: `backend/src/app.ts:27`
- **Issue**: `app.use(cors())` enables CORS for all origins
- **Risk**: Credential theft, unauthorized API access
- **Fix**:
```typescript
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://supermandi.in'],
  credentials: true
}));
```

### ITER3-P0-002: Hardcoded JWT Secret Fallback
- **Files**:
  - `backend/src/routes/v1/retailer-admin/auth.ts:14`
  - `backend/src/routes/v1/supplier/auth.ts:14`
- **Issue**: Falls back to hardcoded secret if env var missing
- **Risk**: Complete auth bypass
- **Fix**: Remove fallback, fail fast if JWT_SECRET not set

### ITER3-P0-003: Missing Firebase Server-Side Verification
- **File**: `backend/src/routes/v1/retailer-admin/auth.ts:87-88`
- **Issue**: Client-side Firebase token trusted without server verification
- **Risk**: Identity spoofing, unauthorized retailer access
- **Fix**: Use Firebase Admin SDK to verify tokens

### ITER3-P0-004: Missing Input Validation - Credit Score
- **File**: `backend/src/routes/v1/pos/credit.ts:73-77`
- **Issue**: parseInt without NaN check
- **Risk**: Incorrect credit calculations
- **Fix**: Add isNaN() checks

### ITER3-P0-005: Missing Null Safety in Sales Route
- **File**: `backend/src/routes/v1/pos/sales.ts:539-540`
- **Issue**: `.rows[0]` accessed without existence check
- **Risk**: Runtime crash
- **Fix**: Add null check before using row properties

### ITER3-P0-006: Empty Catch Block in Auth
- **File**: `backend/src/routes/v1/retailer-admin/auth.ts:126`
- **Issue**: Silent failure in JWT parsing
- **Risk**: Security bypass
- **Fix**: Log error and return 400

### ITER3-P0-007: Missing DELETE Endpoints for Stores
- **File**: `backend/src/routes/v1/admin/stores.ts`
- **Issue**: No DELETE endpoint for stores
- **Risk**: Cannot remove stores from system
- **Fix**: Implement DELETE with soft delete

### ITER3-P0-008: Missing DELETE Endpoints for Users
- **File**: `backend/src/routes/v1/admin/users.ts`
- **Issue**: No DELETE endpoint for users
- **Risk**: Cannot remove users
- **Fix**: Implement DELETE with proper cascading

### ITER3-P0-009: Device Deactivation Not Implemented
- **File**: `backend/src/routes/v1/admin/devices.ts`
- **Issue**: Frontend references deactivate/reset but backend missing
- **Risk**: Cannot manage compromised devices
- **Fix**: Add deactivation endpoints

### ITER3-P0-010: GSTIN Validation Mismatch Frontend/Backend
- **Files**:
  - `supplier-portal/src/app/(auth)/register/page.tsx:74`
  - `backend/src/routes/v1/supplier/auth.ts:140`
- **Issue**: Regex patterns differ between frontend and backend
- **Risk**: Users blocked at frontend or bypass at backend
- **Fix**: Align validation regex

### ITER3-P0-011: CSV File Size Limit Mismatch
- **Files**:
  - `supplier-portal/src/lib/api.ts:365` (10MB)
  - `backend/src/routes/v1/supplier/products.ts:34` (5MB)
- **Issue**: Frontend allows 10MB but backend rejects >5MB
- **Risk**: Confusing errors for users
- **Fix**: Align to 5MB both sides

### ITER3-P0-012: Missing Payouts Route Verification
- **File**: Backend supplier routes
- **Issue**: Frontend calls payouts API but route may not exist
- **Risk**: Earnings page broken
- **Fix**: Verify/implement payouts endpoints

### ITER3-P0-013: Missing Store Selector in Device Enrollment
- **File**: `supermandi-superadmin/src/App.tsx`
- **Issue**: Device enrollment requires manual storeId entry
- **Risk**: Admin errors, wrong store assignments
- **Fix**: Add store dropdown selector

---

## P1 HIGH TICKETS (SHOULD FIX)

### ITER3-P1-001: Sensitive OTP Values Logged
- **File**: `backend/src/routes/v1/admin/adminOtp.ts:95`
- **Issue**: OTP codes logged to console
- **Fix**: Remove OTP value from logs

### ITER3-P1-002: SELECT * in Database Queries
- **Files**: 5+ files with SELECT *
- **Issue**: Fetches all columns including sensitive ones
- **Fix**: Specify columns explicitly

### ITER3-P1-003: CSV Raw Content Stored in DB
- **File**: `backend/src/routes/v1/retailer-admin/csvImport.ts:105-106`
- **Issue**: PII stored unencrypted
- **Fix**: Store only hash and metadata

### ITER3-P1-004: Weak Password Requirements
- **File**: `backend/src/routes/v1/supplier/auth.ts:132-137`
- **Issue**: Only 8 char minimum, no complexity
- **Fix**: Add uppercase, digit, special char requirements

### ITER3-P1-005: Missing Payment Amount Max Validation
- **File**: `backend/src/routes/v1/pos/payments.ts:91-93`
- **Issue**: No upper bound on payment amounts
- **Fix**: Add max validation (e.g., 10 crore)

### ITER3-P1-006: Voice Product Search Not Implemented
- **File**: `backend/src/routes/v1/pos/voice.ts:71`
- **Issue**: TODO - returns empty array
- **Fix**: Implement product search integration

### ITER3-P1-007: Missing Loading State in Supplier Orders
- **File**: `supplier-portal/src/app/(dashboard)/orders/page.tsx:375`
- **Issue**: No loading indicator during API calls
- **Fix**: Add loading state to quantity input

### ITER3-P1-008: Missing Bank Validation in Supplier Profile
- **File**: `supplier-portal/src/app/(dashboard)/profile/page.tsx:259`
- **Issue**: No IFSC/account validation
- **Fix**: Add validation patterns

### ITER3-P1-009: Pagination Not Reset on Filter Change
- **File**: `supplier-portal/src/app/(dashboard)/products/page.tsx:55`
- **Issue**: Page not reset when filter changes
- **Fix**: Reset currentPage to 1 on filter change

### ITER3-P1-010: Missing Admin Rate Limiting
- **File**: `backend/src/routes/v1/admin/*`
- **Issue**: Only AI endpoint has rate limiting
- **Fix**: Apply rate limiting to all mutation endpoints

### ITER3-P1-011: Error Info Disclosure in Analytics
- **File**: `backend/src/routes/v1/admin/analytics.ts`
- **Issue**: DB errors returned to client
- **Fix**: Return generic error message

### ITER3-P1-012: Missing Email Notification Service
- **File**: `backend/src/routes/v1/supplier/auth.ts:489`
- **Issue**: TODO - email not implemented
- **Fix**: Integrate SendGrid or AWS SES

### ITER3-P1-013: Inconsistent Supplier Rejection Notes
- **File**: `backend/src/routes/v1/admin/suppliers.ts:200`
- **Issue**: `notes` vs `reason` parameter mismatch
- **Fix**: Standardize to `notes`

### ITER3-P1-014: Missing Contact Info UI for Stores
- **File**: `supermandi-superadmin/src/App.tsx:173`
- **Issue**: State defined but no UI to edit
- **Fix**: Add contact editing UI

### ITER3-P1-015: Missing Product Approval UI
- **File**: `supermandi-superadmin/src/App.tsx:235`
- **Issue**: States defined but UI not rendered
- **Fix**: Add product approval section

### ITER3-P1-016: Session Timeout Warning Issue
- **File**: `retailer-admin/src/lib/AuthContext.tsx:176`
- **Issue**: Check interval may miss warning window
- **Fix**: Adjust WARNING_BEFORE_MS calculation

### ITER3-P1-017: Admin Token Plain Text Comparison
- **File**: `backend/src/middleware/adminToken.ts:13`
- **Issue**: No timing attack protection
- **Fix**: Use crypto.timingSafeEqual

### ITER3-P1-018: Orphaned Payments Possible
- **File**: Migration 073
- **Issue**: payments.store_id can be NULL if sale deleted
- **Fix**: Enforce NOT NULL constraint

### ITER3-P1-019: Weak Barcode Generation
- **File**: `backend/src/routes/v1/retailer-admin/csvImport.ts:22`
- **Issue**: Only ~100k unique values per store
- **Fix**: Use crypto.randomBytes for more entropy

### ITER3-P1-020: Missing react-hot-toast Import
- **File**: `supplier-portal/src/app/(dashboard)/upload/page.tsx`
- **Issue**: Uses toast but missing import
- **Fix**: Add import statement

### ITER3-P1-021: Password Reset Expiry Not Shown
- **File**: `supplier-portal/src/app/(auth)/forgot-password/page.tsx`
- **Issue**: User doesn't know code expires in 1 hour
- **Fix**: Add expiry message

### ITER3-P1-022: Missing Null Check Bank Details
- **File**: `supplier-portal/src/app/(dashboard)/profile/page.tsx:34`
- **Issue**: Undefined error possible
- **Fix**: Add optional chaining

### ITER3-P1-023: Device Token Reset Not Returning New Token
- **File**: `backend/src/routes/v1/admin/devices.ts`
- **Issue**: Response doesn't include new token
- **Fix**: Return new device token

### ITER3-P1-024: Demo Enrollment Codes Not Revocable
- **File**: `backend/src/routes/v1/admin/deviceEnrollments.ts:130`
- **Issue**: Unlimited codes can't be invalidated
- **Fix**: Add revocation endpoint

### ITER3-P1-025: Health Check Auth Inconsistency
- **File**: `backend/src/routes/v1/admin/health.ts:37`
- **Issue**: Uses Bearer token instead of x-admin-token
- **Fix**: Use requireAdminToken middleware

---

## P2 MEDIUM TICKETS (1 WEEK POST-LAUNCH)

### ITER3-P2-001: Missing X-Frame-Options Header
### ITER3-P2-002: No CSRF Protection
### ITER3-P2-003: Inconsistent Date Formatting
### ITER3-P2-004: Missing Confirmation for Destructive Actions
### ITER3-P2-005: Race Condition in Device Enrollment
### ITER3-P2-006: Inconsistent Error Response Format
### ITER3-P2-007: Floating Point Precision in Price Conversion
### ITER3-P2-008: Missing Form Error State Reset
### ITER3-P2-009: Hardcoded CSV Template Headers
### ITER3-P2-010: Missing Accessibility Attributes
### ITER3-P2-011: Phone Validation Format Differs
### ITER3-P2-012: Audit Log Action Names Inconsistent
### ITER3-P2-013: Deprecated Analytics Endpoints Still Active
### ITER3-P2-014: Missing Pagination Limit Validation
### ITER3-P2-015: No Transaction Rollback on Partial Failures
### ITER3-P2-016: Razorpay Credentials in Memory
### ITER3-P2-017: Unencrypted File Uploads to /tmp
### ITER3-P2-018: X-Forwarded-For Spoofable
### ITER3-P2-019: Missing Store Code Sanitization
### ITER3-P2-020: Rate Limit Window Edge Case

---

## P3 LOW TICKETS (BACKLOG)

### ITER3-P3-001: Console.warn in Production Code
### ITER3-P3-002: Unused Variable Assignments
### ITER3-P3-003: TypeScript `any` Usage
### ITER3-P3-004: Missing Demo Mode Indicator in Logs
### ITER3-P3-005: Empty Exception Handlers
### ITER3-P3-006: Missing Keyboard Navigation in Modals
### ITER3-P3-007: Unused Imports
### ITER3-P3-008: Missing File Size Validation on Import
### ITER3-P3-009: Missing Request ID in Audit Logs
### ITER3-P3-010: UPI VPA Pattern Too Permissive

---

## IMPLEMENTATION PRIORITY ORDER

### Phase 1: Critical Security (MUST DO)
1. ITER3-P0-001: Fix CORS configuration
2. ITER3-P0-002: Remove JWT secret fallback
3. ITER3-P0-003: Add Firebase verification
4. ITER3-P1-001: Remove OTP from logs
5. ITER3-P1-017: Fix admin token comparison

### Phase 2: Critical Functionality (MUST DO)
1. ITER3-P0-004: Credit score validation
2. ITER3-P0-005: Sales null safety
3. ITER3-P0-006: Auth catch block
4. ITER3-P0-010: GSTIN validation alignment
5. ITER3-P0-011: CSV file size alignment

### Phase 3: Admin Portal (SHOULD DO)
1. ITER3-P0-007: Store DELETE endpoint
2. ITER3-P0-008: User DELETE endpoint
3. ITER3-P0-009: Device deactivation
4. ITER3-P0-013: Store selector
5. ITER3-P1-010: Admin rate limiting

### Phase 4: Supplier Portal (SHOULD DO)
1. ITER3-P0-012: Payouts verification
2. ITER3-P1-007: Loading states
3. ITER3-P1-008: Bank validation
4. ITER3-P1-020: Toast import
5. ITER3-P1-022: Null checks

### Phase 5: Data Integrity (SHOULD DO)
1. ITER3-P1-002: Replace SELECT *
2. ITER3-P1-003: Remove CSV storage
3. ITER3-P1-018: Enforce payments.store_id NOT NULL
4. ITER3-P1-019: Better barcode generation

---

## ESTIMATED EFFORT

| Phase | Tickets | Est. Time |
|-------|---------|-----------|
| Phase 1 | 5 | 2 hours |
| Phase 2 | 5 | 2 hours |
| Phase 3 | 5 | 3 hours |
| Phase 4 | 5 | 2 hours |
| Phase 5 | 4 | 2 hours |
| **Total P0/P1** | **24** | **11 hours** |

---

## DEPLOYMENT CHECKLIST

Before deploying:
- [ ] All P0 tickets fixed
- [ ] All P1 tickets fixed (or documented exceptions)
- [ ] Environment variables verified (no fallbacks)
- [ ] CORS origins configured for production
- [ ] Firebase Admin SDK credentials configured
- [ ] Database migrations run
- [ ] E2E tests pass

Post deployment:
- [ ] Monitor error rates
- [ ] Check authentication flows
- [ ] Verify payment flows
- [ ] Test device enrollment
- [ ] Test supplier registration
