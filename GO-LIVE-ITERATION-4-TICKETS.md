# GO-LIVE ITERATION 4 - Comprehensive Audit Tickets

**Date:** 2026-01-29
**Scope:** Full codebase audit - POS, Retailer, Supplier, Admin, Backend Services
**Total Issues Found:** 100+ issues across all components

---

## EXECUTIVE SUMMARY

This iteration identified critical security vulnerabilities that MUST be fixed before go-live:

| Priority | Count | Description |
|----------|-------|-------------|
| **P0 - Critical** | 18 | Security vulnerabilities, auth bypasses, data exposure |
| **P1 - High** | 22 | Rate limiting gaps, validation issues, audit trail problems |
| **P2 - Medium** | 35 | UX issues, code quality, minor security concerns |
| **P3 - Low** | 25+ | Documentation, cleanup, future improvements |

---

## P0 - CRITICAL ISSUES (Must Fix Before Go-Live)

### ITER4-P0-001: Firebase Token Not Server-Side Verified
- **File:** `backend/src/routes/v1/retailer-admin/auth.ts:132-143`
- **Type:** SECURITY
- **Description:** Firebase ID token is client-side decoded without server verification. Phone number extracted from JWT payload without validating signature.
- **Risk:** Attacker can forge fake idToken with any phone number to gain access.
- **Fix:** Implement Firebase Admin SDK verification: `admin.auth().verifyIdToken(idToken)`

### ITER4-P0-002: Password/OTP Reset Token Uses Math.random()
- **File:** `backend/src/routes/v1/supplier/auth.ts:486,628`
- **Type:** SECURITY
- **Description:** Reset tokens and email verification codes use `Math.random()` which is predictable and cryptographically weak. Only 6 digits = ~1M possibilities.
- **Risk:** Token brute-force attacks, account takeover.
- **Fix:** Use `crypto.randomBytes(32).toString('hex')` for tokens.

### ITER4-P0-003: OTP Comparison Vulnerable to Timing Attack
- **File:** `backend/src/routes/v1/admin/adminOtp.ts:120`
- **Type:** SECURITY
- **Description:** OTP verification uses `stored.otp !== otp` which leaks timing information.
- **Risk:** Attacker can determine correct digits via timing analysis.
- **Fix:** Use `crypto.timingSafeEqual()` for OTP comparison.

### ITER4-P0-004: OTP Email Never Actually Sent
- **File:** `backend/src/routes/v1/admin/adminOtp.ts:73-78`
- **Type:** BUG/SECURITY
- **Description:** OTP is generated but email is TODO/commented out. Admin 2FA is non-functional.
- **Risk:** 2FA mechanism completely bypassed.
- **Fix:** Implement email service integration (SES/SendGrid).

### ITER4-P0-005: OTP Stored In-Memory (Lost on Restart)
- **File:** `backend/src/routes/v1/admin/adminOtp.ts:12,18`
- **Type:** RELIABILITY
- **Description:** OTPs stored in JavaScript Map, lost on process restart. Multiple instances can't share OTPs.
- **Risk:** OTPs don't work across server instances or restarts.
- **Fix:** Move OTP storage to Redis with TTL.

### ITER4-P0-006: Webhook Signature Verification Optional
- **File:** `backend/src/routes/v1/webhooks.ts:144-156`
- **Type:** SECURITY
- **Description:** Razorpay webhook processes requests even WITHOUT signature (`if (signature && ...)`).
- **Risk:** Attacker can craft fake payment webhooks to manipulate payouts.
- **Fix:** REQUIRE signature verification; reject unsigned webhooks.

### ITER4-P0-007: Webhook Idempotency Not Implemented
- **File:** `backend/src/routes/v1/webhooks.ts:35-135`
- **Type:** BUG
- **Description:** No idempotency mechanism. Duplicate webhook deliveries process twice.
- **Risk:** Duplicate payments, ledger corruption, financial discrepancies.
- **Fix:** Implement idempotency keys using Razorpay event ID.

### ITER4-P0-008: Hardcoded Fallback Admin ID
- **File:** `backend/src/routes/v1/admin/suppliers.ts:302,372,483,553,644`
- **Type:** SECURITY/AUDIT
- **Description:** Uses fallback `'00000000-0000-0000-0000-000000000001'` when adminId missing.
- **Risk:** All admin actions attributed to fake ID; breaks audit trail.
- **Fix:** Reject requests without valid adminId; don't use fallback.

### ITER4-P0-009: Admin Token Exposed in Docker Environment
- **File:** `backend/docker-compose.prod.yml:142-143`
- **Type:** SECURITY
- **Description:** ADMIN_TOKEN visible in `docker inspect` output, container env listings.
- **Risk:** Anyone with Docker access can read admin token.
- **Fix:** Use Docker secrets (like OpenAI key).

### ITER4-P0-010: Bank Account Numbers Not Masked in API
- **File:** `backend/src/routes/v1/supplier/payouts.ts:66-68`
- **Type:** DATA EXPOSURE
- **Description:** Full bank account numbers returned in payout API response.
- **Risk:** PII exposure, identity theft, fraud.
- **Fix:** Mask account numbers: `****${accountNumber.slice(-4)}`.

### ITER4-P0-011: Missing Store Access Check in Retailer Products
- **File:** `backend/src/routes/v1/retailer-admin/products.ts:19-21`
- **Type:** AUTHORIZATION
- **Description:** Store ID from header not validated against user's authorized stores.
- **Risk:** Cross-store data leakage by manipulating actor-id header.
- **Fix:** Verify user has store_user record for requested store.

### ITER4-P0-012: CSV Upload File Type Bypass Risk
- **File:** `backend/src/routes/v1/supplier/products.ts:35-41`
- **Type:** SECURITY
- **Description:** Only checks MIME type (client-controlled) and file extension.
- **Risk:** Malicious file upload disguised as CSV.
- **Fix:** Validate file content/magic bytes; parse CSV before accepting.

### ITER4-P0-013: Password Reset Token Logged to Console
- **File:** `backend/src/routes/v1/supplier/auth.ts:642`
- **Type:** SECURITY
- **Description:** Reset token logged with console.log in production path.
- **Risk:** Token exposure in production logs.
- **Fix:** Remove token from log; only log that reset was requested.

### ITER4-P0-014: Enrollment Multi-Use Race Condition
- **File:** `backend/src/routes/v1/pos/enroll.ts:456-469`
- **Type:** BUG
- **Description:** Check for exhausted codes and increment not atomic.
- **Risk:** Codes can be used more times than max_uses allows.
- **Fix:** Use atomic database increment with constraint.

### ITER4-P0-015: Savepoint Names Not Fully Sanitized
- **File:** `backend/src/routes/v1/pos/sync.ts:591,640,1178`
- **Type:** SECURITY
- **Description:** Savepoint names created from eventId could contain problematic patterns.
- **Risk:** SQL syntax errors, potential injection.
- **Fix:** Use positional format: `SAVEPOINT sp_${index}`.

### ITER4-P0-016: Offline Receipt Ref Not Unique Validated
- **File:** `backend/src/routes/v1/pos/sync.ts:686`
- **Type:** DATA INTEGRITY
- **Description:** No uniqueness check for offline_receipt_ref within store.
- **Risk:** Duplicate sales, inventory errors.
- **Fix:** Add unique constraint on (store_id, offline_receipt_ref).

### ITER4-P0-017: Admin Device List No Authorization
- **File:** `backend/src/routes/v1/admin/devices.ts:18-78`
- **Type:** AUTHORIZATION
- **Description:** GET /admin/devices returns ALL devices across ALL stores.
- **Risk:** Admin can access device info for unauthorized stores.
- **Fix:** Filter by admin's authorized stores.

### ITER4-P0-018: Phone Numbers Exposed in Auth Response
- **File:** `backend/src/routes/v1/retailer-admin/auth.ts:234`
- **Type:** PII EXPOSURE
- **Description:** Full phone numbers returned in auth response.
- **Risk:** PII in logs, analytics, error responses.
- **Fix:** Return masked version `+91****5678` or omit.

---

## P1 - HIGH PRIORITY ISSUES (Should Fix Before Go-Live)

### ITER4-P1-001: No Rate Limiting on Login Endpoints
- **Files:** `supplier/auth.ts:300`, `retailer-admin/auth.ts`
- **Type:** SECURITY
- **Description:** Unlimited login attempts allowed.
- **Fix:** Add rate limiter (3-5 attempts per 15 minutes per email/IP).

### ITER4-P1-002: No Rate Limiting on Password Reset
- **File:** `backend/src/routes/v1/supplier/auth.ts:454`
- **Type:** SECURITY
- **Description:** Unlimited password reset requests.
- **Fix:** Rate limit to 3 requests per 15 minutes per email.

### ITER4-P1-003: No Rate Limiting on OTP Verify
- **File:** `backend/src/routes/v1/admin/adminOtp.ts`
- **Type:** SECURITY
- **Description:** OTP verification has no rate limiting - allows brute force.
- **Fix:** Add rate limit (1 attempt per second, lock after 5 failures).

### ITER4-P1-004: No Global Rate Limiting for Admin API
- **File:** `backend/src/routes/v1/admin/` (all files)
- **Type:** SECURITY
- **Description:** No request rate limiting on admin endpoints.
- **Fix:** Add 100 requests/minute per admin token.

### ITER4-P1-005: Voice Service Rate Limiting In-Memory Only
- **File:** `backend/src/services/ai/openaiProvider.ts:123-195`
- **Type:** PERFORMANCE
- **Description:** Rate limits per-instance, not cluster-wide.
- **Fix:** Move rate limiting to Redis.

### ITER4-P1-006: Database Connection Pool Unbounded
- **File:** `backend/src/db/client.ts:17`
- **Type:** PERFORMANCE
- **Description:** No min/max connection limits configured.
- **Fix:** Set `min: 2, max: 20, idleTimeoutMillis: 30000`.

### ITER4-P1-007: Error Handler Leaks Stack Traces
- **File:** `backend/src/middleware/errorHandler.ts:18-19`
- **Type:** SECURITY
- **Description:** Error messages (with stack traces) returned to client.
- **Fix:** Return generic message in production.

### ITER4-P1-008: Audit Log Write Failures Ignored
- **File:** `backend/src/middleware/adminAudit.ts`
- **Type:** COMPLIANCE
- **Description:** If audit logging fails, admin operation still succeeds.
- **Fix:** Fail request if audit logging fails in production.

### ITER4-P1-009: Device Enrollment Code Low Entropy
- **File:** `backend/src/routes/v1/admin/deviceEnrollments.ts:18-26`
- **Type:** SECURITY
- **Description:** Only 6 bytes of entropy (32^6 possibilities).
- **Fix:** Use 10+ bytes of entropy.

### ITER4-P1-010: Redis Password in Docker Environment
- **File:** `backend/docker-compose.prod.yml:60,67`
- **Type:** SECURITY
- **Description:** Redis password visible in docker inspect.
- **Fix:** Use Docker secrets.

### ITER4-P1-011: OpenAI Audit Logs In-Memory Only
- **File:** `backend/src/services/ai/openaiProvider.ts:235-247`
- **Type:** COMPLIANCE
- **Description:** AI audit logs lost on restart (max 1000 entries).
- **Fix:** Persist to database.

### ITER4-P1-012: No Request Body Size Limit
- **File:** `backend/src/app.ts`
- **Type:** SECURITY
- **Description:** No `express.json({ limit: ... })` configured.
- **Fix:** Set limit: `app.use(express.json({ limit: '1mb' }))`.

### ITER4-P1-013: CSV File Size Inconsistency
- **Files:** `backend/.../products.ts:34`, `supplier-portal/.../upload/page.tsx:45-46`
- **Type:** VALIDATION
- **Description:** Backend 5MB, frontend says 10MB in some places.
- **Fix:** Align all to 5MB with consistent error messages.

### ITER4-P1-014: No Input Sanitization on Profile Update
- **File:** `backend/src/routes/v1/supplier/profile.ts:97-227`
- **Type:** SECURITY
- **Description:** User input inserted without XSS sanitization.
- **Fix:** Sanitize inputs: `input.trim().replace(/[<>]/g, '')`.

### ITER4-P1-015: No CSRF Protection
- **File:** `supplier-portal/src/lib/api.ts`
- **Type:** SECURITY
- **Description:** No CSRF tokens for POST/PATCH/DELETE requests.
- **Fix:** Implement CSRF token validation.

### ITER4-P1-016: Weak Password Requirements
- **File:** `backend/src/routes/v1/supplier/auth.ts:144-149`
- **Type:** SECURITY
- **Description:** Only 8 character minimum, no complexity rules.
- **Fix:** Require 12+ chars, uppercase, number, special char.

### ITER4-P1-017: Device Token Reset No Audit
- **File:** `backend/src/routes/v1/admin/devices.ts:95,152-154`
- **Type:** AUDIT
- **Description:** Token reset has no verification or audit entry.
- **Fix:** Require confirmation header; log to audit.

### ITER4-P1-018: Missing UUID Validation on Global Products
- **File:** `backend/src/routes/v1/admin/globalProducts.ts:19-51`
- **Type:** VALIDATION
- **Description:** Product ID passed to SQL without UUID format validation.
- **Fix:** Validate UUID format before query.

### ITER4-P1-019: Store UPI VPA Update Auto-Deactivates
- **File:** `backend/src/routes/v1/admin/stores.ts:278-289`
- **Type:** UX
- **Description:** Clearing UPI VPA silently deactivates store.
- **Fix:** Require explicit confirmation.

### ITER4-P1-020: N+1 Query in Supplier Orders
- **File:** `backend/src/routes/v1/supplier/orders.ts:45-77`
- **Type:** PERFORMANCE
- **Description:** Potential N+1 query if indexes missing.
- **Fix:** Ensure index on `supplier_products(id, supplier_id)`.

### ITER4-P1-021: localStorage Used for Auth Tokens
- **File:** `supplier-portal/src/lib/api.ts:21-34`
- **Type:** SECURITY
- **Description:** Tokens in localStorage vulnerable to XSS.
- **Fix:** Use httpOnly cookies or memory + refresh token.

### ITER4-P1-022: Date Range Validation Missing
- **File:** `backend/src/routes/v1/pos/inventory.ts:56-66`
- **Type:** VALIDATION
- **Description:** startDate/endDate parsed without format validation.
- **Fix:** Validate with regex `/^\d{4}-\d{2}-\d{2}$/`.

---

## P2 - MEDIUM PRIORITY (Fix in Next Sprint)

### ITER4-P2-001: Audit Log Doesn't Track Field-Level Changes
### ITER4-P2-002: Pagination Limits Inconsistent Across Endpoints
### ITER4-P2-003: Store Deletion Doesn't Check Dependent Devices
### ITER4-P2-004: User Deletion Email Predictable Pattern
### ITER4-P2-005: Missing Error Context for Analytics
### ITER4-P2-006: Supplier Margin No Upper Bound Validation
### ITER4-P2-007: Numeric Type Coercion Issues
### ITER4-P2-008: Stale Timestamp LWW Comparison
### ITER4-P2-009: Store Code Format Not Validated
### ITER4-P2-010: Sale Status Enum Null Check Missing
### ITER4-P2-011: Discount > Total Edge Case
### ITER4-P2-012: Bearer Token Parsing Not Strict
### ITER4-P2-013: MRP Zero/Negative Validation
### ITER4-P2-014: KYC Document Deletion Without Warning
### ITER4-P2-015: Email Verification Code Reuse
### ITER4-P2-016: CSV Duplicate SKU Not Checked
### ITER4-P2-017: Barcode Uniqueness Not Enforced
### ITER4-P2-018: No HTTPS Enforcement at Frontend
### ITER4-P2-019: No Password Change Notification
### ITER4-P2-020: Device Token Auto-Refresh Race
### ITER4-P2-021: OTP Stored in Plaintext
### ITER4-P2-022: Connection Release Error Handling
### ITER4-P2-023: CORS/CSRF Not Explicitly Configured
### ITER4-P2-024: Missing UPI VPA Validation
### ITER4-P2-025: NULL Check on Store Active Status

---

## IMPLEMENTATION PRIORITY ORDER

### Phase 1 - IMMEDIATE (Before Go-Live)
1. **ITER4-P0-006** - Webhook signature REQUIRED
2. **ITER4-P0-007** - Webhook idempotency
3. **ITER4-P0-001** - Firebase token verification
4. **ITER4-P0-002** - Crypto-secure reset tokens
5. **ITER4-P0-003** - Timing-safe OTP comparison
6. **ITER4-P0-008** - Remove fallback admin ID
7. **ITER4-P0-009** - Admin token to Docker secrets
8. **ITER4-P0-010** - Mask bank account numbers
9. **ITER4-P1-001** - Rate limit login endpoints
10. **ITER4-P1-002** - Rate limit password reset
11. **ITER4-P1-003** - Rate limit OTP verify
12. **ITER4-P1-012** - Request body size limit

### Phase 2 - Within 1 Week
13. **ITER4-P0-004** - Implement OTP email service
14. **ITER4-P0-005** - Move OTP to Redis
15. **ITER4-P0-011** - Store access check
16. **ITER4-P0-012** - CSV file validation
17. **ITER4-P0-013** - Remove token logging
18. **ITER4-P1-006** - Database connection pool
19. **ITER4-P1-007** - Error handler fixes
20. **ITER4-P1-008** - Audit log enforcement

### Phase 3 - Within 2 Weeks
21-40. All remaining P1 and P2 issues

---

## ESTIMATED EFFORT

| Priority | Count | Effort Each | Total |
|----------|-------|-------------|-------|
| P0 | 18 | 30-60 min | ~12 hours |
| P1 | 22 | 20-45 min | ~10 hours |
| P2 | 25 | 15-30 min | ~8 hours |
| **Total** | **65** | - | **~30 hours** |

---

## TESTING REQUIREMENTS

After implementing fixes:
1. **Security Testing**
   - Attempt brute force on rate-limited endpoints
   - Test webhook signature rejection
   - Verify timing-safe comparisons
   - Test authorization boundaries

2. **Integration Testing**
   - Full enrollment flow
   - Payment webhook flow
   - OTP email delivery
   - Cross-store access denied

3. **Load Testing**
   - Rate limit enforcement
   - Connection pool under load
   - Redis rate limiting distribution

---

*Generated by GO-LIVE Iteration 4 Audit*
