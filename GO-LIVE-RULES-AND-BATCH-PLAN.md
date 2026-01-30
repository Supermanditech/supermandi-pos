# SuperMandi GO-LIVE Execution Plan V2.0
## 10,000 Stores Production Readiness - Comprehensive Real-User Audit

**Owner:** Claude
**Environment:** Google VM (prod-like)
**Rule:** Demo store = Live store (NO exceptions)
**Audit Date:** 2026-01-30

---

## 0) SSH / VM Access (KEEP HANDY - USE AT EVERY DEPLOYMENT)

### Primary VM (Production)
```bash
# SSH Access
ssh claude@34.14.220.171

# GCloud SSH (alternative)
gcloud compute ssh --zone "asia-south1-a" "supermandi-backend-vm" --project "supermandi-backend"

# Get External IP (from inside VM)
curl -s -H "Metadata-Flavor: Google" \
  http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip
```

### Secondary VM (If needed)
```bash
# SSH Access
ssh supermanditech@34.14.150.183
# Password: Supermandi@123

# Sudo commands require password: Supermandi@123
sudo systemctl restart pm2-supermanditech
```

### SSH Keys (Already Authorized)
```bash
# Claude's key
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKyLta6LMjELpJ5gToJhw3Cd5U5YWx+G7bDP3fK/ypGH supermandi@github" >> ~/.ssh/authorized_keys

# Claude-code VM access key
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIE/FDEkZbVV3m3uR2F9WmfKNEpCEhrPTax3gl8KGACFR claude-code-vm-access" >> ~/.ssh/authorized_keys
```

### VS Code Remote SSH
1. Install "Remote - SSH" extension
2. Press F1 → "Remote-SSH: Connect to Host"
3. Enter: `supermanditech@34.14.150.183`
4. Password: `Supermandi@123`

---

## 1) Non-Negotiable GO-LIVE Rules

### Execution Rules
- NO "minor", NO "later", NO "future phase"
- EVERY issue is CRITICAL for go-live
- Assume 10,000 concurrent stores
- Assume zero manual ops steps
- Assume failures = business loss

### Ticket-by-Ticket Execution (MANDATORY)
- **ONE TICKET AT A TIME** - Do not batch multiple tickets
- Each ticket must be: Code → Test Local → Deploy VM → Real User Test → PASS
- Do NOT move to next ticket until current ticket is VERIFIED on VM
- Do NOT skip VM deployment - every ticket gets deployed immediately
- Do NOT skip real user testing - become the actual user and test the flow

### Deployment After Each Ticket
```bash
# 1. SSH into VM
ssh claude@34.14.220.171

# 2. Pull latest code
cd /home/claude/supermandi-pos && git pull origin main

# 3. Rebuild and restart containers
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

# 4. Run migrations if needed
docker exec supermandi-backend npm run migrate

# 5. Verify health
curl -s http://localhost:3000/health | jq
curl -s http://localhost:3010/health | jq

# 6. Check logs for errors
docker logs --tail 50 supermandi-backend 2>&1 | grep -i error
```

### Real User Testing After Each Ticket (MANDATORY)
After EVERY deployment, test as the ACTUAL user would:
1. **SuperAdmin:** https://supermandi.tech/admin/ - Login, navigate, verify fix
2. **Retailer:** https://supermandi.tech/retailer/ - Login with OTP, test affected flow
3. **Supplier:** https://supermandi.tech/supplier/ - Login, test affected flow
4. **POS App:** Scan, sell, verify ledger if affected

### Ticket Completion Criteria
A ticket is DONE only when:
- [ ] Code implemented locally
- [ ] Committed to git with ticket ID in message
- [ ] Deployed to VM (ssh claude@34.14.220.171)
- [ ] Health checks pass on VM
- [ ] Real user test performed on production URL
- [ ] PASS/FAIL documented with evidence

---

## 2) Ticket Format (MANDATORY)

Each ticket must include:
1. **Ticket ID:** GO-LIVE-###
2. **Issue summary** (1 line)
3. **Where it occurs:** App / Screen / Route / API / DB / VM service
4. **Why this blocks go-live** (1-3 bullets)
5. **Root cause** (what is missing/broken)
6. **Exact fix required:** UI / API / DB / Ledger / Deployment
7. **Acceptance criteria** (PASS/FAIL only)
8. **VM verification steps** (commands + expected output)
9. **Real user test steps** (role-based flows)

---

## 3) AUDIT SUMMARY

### Total Issues Identified: 241 Tickets → 16 Batches (0-15)

**Deduplication Note:** 5 duplicate tickets were identified and removed:
- GO-LIVE-102 merged into GO-LIVE-101 (both about .env secrets)
- GO-LIVE-136 duplicate of GO-LIVE-109 (token refresh)
- GO-LIVE-281 duplicate of GO-LIVE-143 (store creation logging)
- GO-LIVE-282 duplicate of GO-LIVE-141 (supplier verification logging)
- GO-LIVE-283 duplicate of GO-LIVE-142 (product approval logging)

| Component | Critical | High | Medium | Low | Total |
|-----------|----------|------|--------|-----|-------|
| POS Mobile Screens | 14 | 28 | 31 | 19 | 92 |
| POS Mobile Services | 5 | 12 | 18 | 11 | 46 |
| Retailer Admin Portal | 17 | 40 | 0 | 0 | 57 |
| Supplier Portal | 30 | 0 | 20 | 0 | 50 |
| SuperAdmin Portal | 5 | 6 | 7 | 5 | 23 |
| Backend API Routes | 21 | 7 | 5 | 0 | 33 |
| Database Schema | 8 | 10 | 8 | 4 | 30 |
| Backend Services | 5 | 11 | 19 | 11 | 46 |
| Deployment & Infrastructure | 15 | 20 | 12 | 3 | 50 |
| **RAW TOTAL** | **120** | **134** | **120** | **53** | **427** |

**Note:** Raw issues (427) were deduplicated and consolidated into **246 unique tickets** organized across 16 batches. Many issues overlap (e.g., validation gaps appear in both frontend and backend audits).

---

## 4) Batch Mapping (246 Tickets → 16 Batches)

### Batch 0: CRITICAL Security & Secrets (11 tickets)
**Theme:** Immediate security fixes - secrets exposure, authentication bypass
**Priority:** BLOCK ALL OTHER WORK

#### Batch 0 Deployment Rules
```bash
# BEFORE starting Batch 0:
ssh claude@34.14.220.171
cd /home/claude/supermandi-pos
git status  # Capture current state
docker ps   # Capture running containers

# AFTER each ticket in Batch 0:
git add . && git commit -m "GO-LIVE-1XX: [description]"
git push origin main
# Then SSH to VM and deploy (see Section 1)

# REAL USER TEST after each ticket:
# - Try to access exposed secrets (should fail)
# - Verify auth flows still work
# - Check browser console for token exposure
```

| Ticket | Summary | Severity | Status |
|--------|---------|----------|--------|
| GO-LIVE-101 | Secrets in source control (.env files committed) - includes Firebase key fix | CRITICAL | ✅ DONE |
| GO-LIVE-103 | ADMIN_TOKEN exposed in docker-compose.prod.yml | CRITICAL | PENDING |
| GO-LIVE-104 | Firebase token fallback allows JWT forgery without server verification | CRITICAL | PENDING |
| GO-LIVE-105 | Device token stored in AsyncStorage (not SecureStore) | CRITICAL | PENDING |
| GO-LIVE-106 | SQLite database on mobile not encrypted | CRITICAL | PENDING |
| GO-LIVE-107 | OpenAI API key stored as plaintext in memory | CRITICAL | PENDING |
| GO-LIVE-108 | Missing CSRF protection across all portals | CRITICAL | PENDING |
| GO-LIVE-109 | No token refresh mechanism in retailer-admin portal | CRITICAL | PENDING |
| GO-LIVE-110 | Supplier JWT tokens stored in localStorage (XSS vulnerable) | CRITICAL | PENDING |
| GO-LIVE-111 | No session timeout in supplier portal | CRITICAL | PENDING |
| GO-LIVE-112 | ALLOW_BYPASS_FOR_TESTING can be enabled in production | CRITICAL | PENDING |

**Note:** GO-LIVE-102 merged into GO-LIVE-101 (both addressed same .env.production file)

---

### Batch 1: Payment & Financial Integrity (15 tickets)
**Theme:** Payment double-submit, race conditions, financial data integrity

#### Batch 1 Deployment Rules
```bash
# BEFORE starting Batch 1:
# Verify Batch 0 is 100% complete and all tickets PASSED

# AFTER each ticket:
ssh claude@34.14.220.171
cd /home/claude/supermandi-pos && git pull origin main
docker compose -f docker-compose.prod.yml up -d --build
docker exec supermandi-backend npm run migrate  # If DB changes

# REAL USER TEST after each payment ticket:
# 1. Open POS app, create a sale
# 2. Test double-click on payment button (should be blocked)
# 3. Verify inventory deducted correctly
# 4. Check ledger for correct entries
# 5. Test offline/online sync if touched
```

| Ticket | Summary | Severity |
|--------|---------|----------|
| GO-LIVE-113 | PaymentScreen double-submit race condition (payment fraud risk) | CRITICAL |
| GO-LIVE-114 | Inventory deduction marked non-critical, never reconciled | CRITICAL |
| GO-LIVE-115 | Discount can exceed subtotal (negative bill totals) | CRITICAL |
| GO-LIVE-116 | Order total integer overflow with MAX_PRICE × MAX_QTY | CRITICAL |
| GO-LIVE-117 | No inventory stock lock during PENDING sale (overselling) | CRITICAL |
| GO-LIVE-118 | Payout reconciliation: sum of orders not verified against amount | CRITICAL |
| GO-LIVE-119 | Mock Razorpay returns success in production if not configured | CRITICAL |
| GO-LIVE-120 | Supplier payout transaction not rolled back on error | CRITICAL |
| GO-LIVE-121 | Inventory ledger dual-write corruption (delta applied twice) | CRITICAL |
| GO-LIVE-122 | No idempotency keys for financial operations | HIGH |
| GO-LIVE-123 | UPI VPA validation too permissive (accepts "a@b") | HIGH |
| GO-LIVE-124 | Payment status not synced after network drop | HIGH |
| GO-LIVE-125 | Split payment lacks exponential backoff | HIGH |
| GO-LIVE-126 | DUE payment creates no AR tracking | HIGH |
| GO-LIVE-127 | BNPL UTR validation accepts any text format | HIGH |

---

### Batch 2: Authentication & Authorization (17 tickets)
**Theme:** Auth bypass, role checks, store ownership

#### Batch 2 Deployment Rules
```bash
# AFTER each auth ticket:
ssh claude@34.14.220.171
cd /home/claude/supermandi-pos && git pull origin main
docker compose -f docker-compose.prod.yml up -d --build

# REAL USER TEST after each auth ticket:
# 1. Try accessing admin endpoints without token (should fail)
# 2. Try accessing store A data with store B token (should fail)
# 3. Test login/logout flows on all portals
# 4. Verify audit logs capture auth events
```

| Ticket | Summary | Severity |
|--------|---------|----------|
| GO-LIVE-128 | Admin endpoints have no role-based access control | CRITICAL |
| GO-LIVE-129 | Incomplete store ownership verification in middleware | CRITICAL |
| GO-LIVE-130 | No authorization on supplier verification/rejection | CRITICAL |
| GO-LIVE-131 | Product edit doesn't verify supplier-product relationship | CRITICAL |
| GO-LIVE-132 | Retailer-admin API doesn't include store ID in requests | HIGH |
| GO-LIVE-133 | localStorage keys not namespaced per store | HIGH |
| GO-LIVE-134 | No account lockout after failed login attempts | HIGH |
| GO-LIVE-135 | OTP rate limiting allows 600 attempts in 10 minutes | HIGH |
| GO-LIVE-137 | Logout doesn't invalidate server-side session | HIGH |
| GO-LIVE-138 | No IP-based blocking after auth failures | HIGH |
| GO-LIVE-139 | Demo mode generates real JWT tokens | HIGH |
| GO-LIVE-140 | SuperAdmin missing audit logs for 10+ operations | HIGH |
| GO-LIVE-141 | Supplier verification audit trail incomplete | HIGH |
| GO-LIVE-142 | Product approval/rejection not logged | HIGH |
| GO-LIVE-143 | Store creation not logged to audit | HIGH |
| GO-LIVE-144 | Login success not logged to audit | HIGH |
| GO-LIVE-145 | No password reset flow in admin portal | HIGH |

**Note:** GO-LIVE-136 removed (duplicate of GO-LIVE-109 in Batch 0)

---

### Batch 3: Input Validation & Sanitization (20 tickets)
**Theme:** Missing validation, SQL injection, XSS prevention

#### Batch 3 Deployment Rules
```bash
# AFTER each validation ticket:
ssh claude@34.14.220.171
cd /home/claude/supermandi-pos && git pull origin main
docker compose -f docker-compose.prod.yml up -d --build

# REAL USER TEST after each validation ticket:
# 1. Try submitting invalid data (SQL injection strings, XSS payloads)
# 2. Verify proper error messages returned
# 3. Check database for any injected content
# 4. Test edge cases (empty, too long, special chars)
```

| Ticket | Summary | Severity |
|--------|---------|----------|
| GO-LIVE-146 | SQL injection in analytics groupBy parameter | CRITICAL |
| GO-LIVE-147 | No XSS sanitization in product names/descriptions | CRITICAL |
| GO-LIVE-148 | Barcode length not validated (DoS via 1MB barcode) | HIGH |
| GO-LIVE-149 | Device fingerprint accepts arbitrary binary data | HIGH |
| GO-LIVE-150 | Store name validation allows XSS characters | HIGH |
| GO-LIVE-151 | Price validation missing lower bound (0.01 paise allowed) | HIGH |
| GO-LIVE-152 | GSTIN validation regex too permissive | HIGH |
| GO-LIVE-153 | Email validation only checks for "@" character | HIGH |
| GO-LIVE-154 | Phone format not validated in store contact | HIGH |
| GO-LIVE-155 | PIN code accepts non-numeric characters | HIGH |
| GO-LIVE-156 | PAN validation allows spaces around input | HIGH |
| GO-LIVE-157 | No max length on textarea fields (notes, footer) | MEDIUM |
| GO-LIVE-158 | Search query not length-limited (regex DoS) | MEDIUM |
| GO-LIVE-159 | CSV file size validation says 5MB but checks 10MB | MEDIUM |
| GO-LIVE-160 | Price decimal precision loss with floating point | MEDIUM |
| GO-LIVE-161 | Audio buffer size not limited (OOM crash) | HIGH |
| GO-LIVE-162 | Product category edit accepts invalid category | MEDIUM |
| GO-LIVE-163 | MOQ validation missing min/max bounds | MEDIUM |
| GO-LIVE-164 | Margin validation missing (negative, >100%) | HIGH |
| GO-LIVE-165 | BNPL max days accepts 0 or negative | MEDIUM |

---

### Batch 4: API Error Handling & Resilience (18 tickets)
**Theme:** Silent failures, missing error recovery, no retry logic

#### Batch 4 Deployment Rules
```bash
# AFTER each error handling ticket:
ssh claude@34.14.220.171
cd /home/claude/supermandi-pos && git pull origin main
docker compose -f docker-compose.prod.yml up -d --build

# REAL USER TEST after each ticket:
# 1. Simulate network failures (disconnect WiFi)
# 2. Verify proper error messages shown to user
# 3. Test retry mechanisms work correctly
# 4. Check logs for proper error capture
docker logs --tail 100 supermandi-backend 2>&1 | grep -i error
```

| Ticket | Summary | Severity |
|--------|---------|----------|
| GO-LIVE-166 | Email service fails silently with no fallback | CRITICAL |
| GO-LIVE-167 | Sync failures return 0 with no retry mechanism | CRITICAL |
| GO-LIVE-168 | Outbox JSON parse errors silently discard events | CRITICAL |
| GO-LIVE-169 | API responses not validated for structure | HIGH |
| GO-LIVE-170 | Pagination loops with no timeout (infinite loop) | HIGH |
| GO-LIVE-171 | 401 responses handled silently in portals | HIGH |
| GO-LIVE-172 | No error boundary in React apps | HIGH |
| GO-LIVE-173 | Generic error messages hide root cause | HIGH |
| GO-LIVE-174 | JWT verification doesn't handle all error types | HIGH |
| GO-LIVE-175 | Unhandled async errors in token refresh | HIGH |
| GO-LIVE-176 | No request timeout on API calls | HIGH |
| GO-LIVE-177 | Network errors not distinguished from server errors | MEDIUM |
| GO-LIVE-178 | Bulk upload partial failures not explained | MEDIUM |
| GO-LIVE-179 | Translation retry doesn't re-throw timeout errors | MEDIUM |
| GO-LIVE-180 | GCP credentials not validated at startup | MEDIUM |
| GO-LIVE-181 | Database schema errors return empty array | MEDIUM |
| GO-LIVE-182 | Weak error messages prevent diagnosis | MEDIUM |
| GO-LIVE-183 | No circuit breaker for database failures | MEDIUM |

---

### Batch 5: Rate Limiting & DoS Protection (12 tickets)
**Theme:** Missing rate limits, brute force prevention

#### Batch 5 Deployment Rules
```bash
# AFTER each rate limiting ticket:
ssh claude@34.14.220.171
cd /home/claude/supermandi-pos && git pull origin main
docker compose -f docker-compose.prod.yml up -d --build

# REAL USER TEST after each ticket:
# 1. Rapid-fire the endpoint (10+ requests in 1 second)
# 2. Verify 429 Too Many Requests returned
# 3. Wait for rate limit window to reset
# 4. Verify normal operation resumes
```

| Ticket | Summary | Severity |
|--------|---------|----------|
| GO-LIVE-184 | POST /sales has no rate limiting | CRITICAL |
| GO-LIVE-185 | Supplier approval has no rate limiting | CRITICAL |
| GO-LIVE-186 | Store update has no rate limiting | CRITICAL |
| GO-LIVE-187 | Device enrollment has no rate limiting | HIGH |
| GO-LIVE-188 | Token revocation endpoint vulnerable to DoS | HIGH |
| GO-LIVE-189 | Store enumeration via brute force | HIGH |
| GO-LIVE-190 | Barcode lookup cache grows unbounded (memory leak) | HIGH |
| GO-LIVE-191 | Rate limit map never cleans on errors (memory leak) | MEDIUM |
| GO-LIVE-192 | Polling timer never cleared on rejection | MEDIUM |
| GO-LIVE-193 | Client-side rate limiting missing | MEDIUM |
| GO-LIVE-194 | Request body size limits not per-endpoint | MEDIUM |
| GO-LIVE-195 | Auth rate limit 5/min too permissive for 10K stores | HIGH |

---

### Batch 6: Database Schema Integrity (20 tickets)
**Theme:** Missing FKs, indexes, constraints, partitioning

#### Batch 6 Deployment Rules
```bash
# CRITICAL: Database migrations require extra care!
# AFTER each DB schema ticket:
ssh claude@34.14.220.171
cd /home/claude/supermandi-pos && git pull origin main

# Backup database BEFORE migration
docker exec supermandi-postgres pg_dump -U supermandi supermandi > /tmp/backup_$(date +%Y%m%d_%H%M%S).sql

# Run migration
docker exec supermandi-backend npm run migrate

# Verify migration success
docker exec supermandi-postgres psql -U supermandi -c "\dt"

# REAL USER TEST after each DB ticket:
# 1. Create new records in affected tables
# 2. Verify FK constraints prevent orphaned records
# 3. Test query performance on indexed columns
# 4. Verify no data corruption occurred
```

| Ticket | Summary | Severity |
|--------|---------|----------|
| GO-LIVE-196 | catalog.store_products missing FK to platform.stores | CRITICAL |
| GO-LIVE-197 | inventory.stock_balances missing FK to store/product | CRITICAL |
| GO-LIVE-198 | reorder.pending_reorders missing FKs | CRITICAL |
| GO-LIVE-199 | payments.sell_payments missing FK to sales | CRITICAL |
| GO-LIVE-200 | Missing composite index on (store_id, status, created_at) | CRITICAL |
| GO-LIVE-201 | Missing index on inventory_ledger (store_id, product_id) | CRITICAL |
| GO-LIVE-202 | pending_reorders partial unique constraint wrong | HIGH |
| GO-LIVE-203 | purchase_order_items missing unique (order_id, product_id) | HIGH |
| GO-LIVE-204 | No table partitioning for sales (10M rows/month) | CRITICAL |
| GO-LIVE-205 | No table partitioning for inventory_ledger | CRITICAL |
| GO-LIVE-206 | Missing CHECK on amount_minor > 0 for payments | HIGH |
| GO-LIVE-207 | Missing CHECK on sell_price <= mrp | HIGH |
| GO-LIVE-208 | sales.id VARCHAR should be UUID | HIGH |
| GO-LIVE-209 | No NOT NULL on created_by_user_id for orders | HIGH |
| GO-LIVE-210 | supplier_store_links missing FK audit | HIGH |
| GO-LIVE-211 | Duplicate tables: reorder_policies vs product_policies | MEDIUM |
| GO-LIVE-212 | Cross-schema FK enforcement gaps | MEDIUM |
| GO-LIVE-213 | Missing index on admin.audit_log (created_at DESC) | MEDIUM |
| GO-LIVE-214 | No cascading deletes causing orphaned records | MEDIUM |
| GO-LIVE-215 | source_reorder_ids default null vs empty array | LOW |

---

### Batch 7: Offline & Sync Reliability (15 tickets)
**Theme:** Offline queue, sync failures, data persistence

#### Batch 7 Deployment Rules
```bash
# AFTER each offline/sync ticket:
ssh claude@34.14.220.171
cd /home/claude/supermandi-pos && git pull origin main
docker compose -f docker-compose.prod.yml up -d --build

# REAL USER TEST after each ticket:
# 1. Put device in airplane mode
# 2. Create sales/purchases offline
# 3. Re-enable network
# 4. Verify data syncs correctly
# 5. Check for duplicate records
# 6. Verify outbox queue clears
```

| Ticket | Summary | Severity |
|--------|---------|----------|
| GO-LIVE-216 | Race condition in concurrent sync operations | CRITICAL |
| GO-LIVE-217 | Inventory sync queued but never guaranteed | CRITICAL |
| GO-LIVE-218 | Offline queue in AsyncStorage (OS can clear) | HIGH |
| GO-LIVE-219 | No dead letter queue for failed sync events | HIGH |
| GO-LIVE-220 | Outbox sync batch has no transaction boundary | HIGH |
| GO-LIVE-221 | Sale idempotency check has race window | HIGH |
| GO-LIVE-222 | Product search has no offline fallback | HIGH |
| GO-LIVE-223 | Purchase orders not cached for offline viewing | HIGH |
| GO-LIVE-224 | No "offline sync pending" indicator in UI | MEDIUM |
| GO-LIVE-225 | Bills cached locally but conflicts not detected | MEDIUM |
| GO-LIVE-226 | Pending outbox count never updates after sync | MEDIUM |
| GO-LIVE-227 | GRN has no offline support | MEDIUM |
| GO-LIVE-228 | Quick items lost on app crash | MEDIUM |
| GO-LIVE-229 | Device session cache race condition | MEDIUM |
| GO-LIVE-230 | Bill number collision across devices | MEDIUM |

---

### Batch 8: POS App UX & Business Logic (20 tickets)
**Theme:** Missing validations, confusing flows, edge cases

#### Batch 8 Deployment Rules
```bash
# AFTER each POS UX ticket:
ssh claude@34.14.220.171
cd /home/claude/supermandi-pos && git pull origin main
docker compose -f docker-compose.prod.yml up -d --build

# REAL USER TEST after each ticket (USE ACTUAL POS APP):
# 1. Open POS app on test device
# 2. Test the specific flow that was fixed
# 3. Verify UI feedback is clear
# 4. Test edge cases (empty cart, max items, etc.)
# 5. Verify data persists correctly
```

| Ticket | Summary | Severity |
|--------|---------|----------|
| GO-LIVE-231 | Enrollment token not validated after save | CRITICAL |
| GO-LIVE-232 | GRN allows receiving more than ordered | HIGH |
| GO-LIVE-233 | No stock validation before creating sale | HIGH |
| GO-LIVE-234 | Partial sale confirmation not persisted | HIGH |
| GO-LIVE-235 | No inventory check before purchase submission | HIGH |
| GO-LIVE-236 | Daily summary doesn't update on refresh | HIGH |
| GO-LIVE-237 | Menu screen has no sync button | MEDIUM |
| GO-LIVE-238 | Credit application status never auto-refreshes | MEDIUM |
| GO-LIVE-239 | Order status timeline doesn't auto-update | MEDIUM |
| GO-LIVE-240 | No dispute resolution flow for BNPL | MEDIUM |
| GO-LIVE-241 | Inward price not compared to market rate | MEDIUM |
| GO-LIVE-242 | Tracking number can't be updated | MEDIUM |
| GO-LIVE-243 | Barcode sheet tier not remembered | LOW |
| GO-LIVE-244 | No offline indicator on menu screen | MEDIUM |
| GO-LIVE-245 | No credit utilization warning at 90% | MEDIUM |
| GO-LIVE-246 | Reprint button has no confirmation | MEDIUM |
| GO-LIVE-247 | Split payment UX not intuitive | MEDIUM |
| GO-LIVE-248 | No bulk action for order receiving | LOW |
| GO-LIVE-249 | Clear all items has no undo | MEDIUM |
| GO-LIVE-250 | Daily summary doesn't show trend vs yesterday | LOW |

---

### Batch 9: Retailer Portal Completeness (15 tickets)
**Theme:** Form validation, error handling, multi-tenant

#### Batch 9 Deployment Rules
```bash
# AFTER each retailer portal ticket:
ssh claude@34.14.220.171
cd /home/claude/supermandi-pos && git pull origin main
docker compose -f docker-compose.prod.yml up -d --build

# REAL USER TEST after each ticket:
# 1. Go to https://supermandi.tech/retailer/
# 2. Login with test phone (OTP)
# 3. Navigate to affected page
# 4. Test the specific fix
# 5. Verify forms validate correctly
# 6. Check multi-tenant isolation
```

| Ticket | Summary | Severity |
|--------|---------|----------|
| GO-LIVE-251 | Server-side validation errors not field-mapped | HIGH |
| GO-LIVE-252 | Numeric inputs accept paste of large numbers | HIGH |
| GO-LIVE-253 | Credit days validated UI-only, not on submit | HIGH |
| GO-LIVE-254 | Search results not deduplicated | MEDIUM |
| GO-LIVE-255 | No loading state for long operations | MEDIUM |
| GO-LIVE-256 | Form changes not saved as draft | MEDIUM |
| GO-LIVE-257 | 409 CONFLICT doesn't reload product data | MEDIUM |
| GO-LIVE-258 | No undo for destructive actions | MEDIUM |
| GO-LIVE-259 | Settings page no validation summary | MEDIUM |
| GO-LIVE-260 | Ledger entries not paginated (only 100) | MEDIUM |
| GO-LIVE-261 | No data freshness indicator | LOW |
| GO-LIVE-262 | Categories filtered client-side (1000+ slow) | MEDIUM |
| GO-LIVE-263 | No privacy/terms acceptance tracking | MEDIUM |
| GO-LIVE-264 | No data export feature (GDPR) | MEDIUM |
| GO-LIVE-265 | Supplier verification status not explained | LOW |

---

### Batch 10: Supplier Portal Completeness (15 tickets)
**Theme:** Order management, payout tracking, KYC

#### Batch 10 Deployment Rules
```bash
# AFTER each supplier portal ticket:
ssh claude@34.14.220.171
cd /home/claude/supermandi-pos && git pull origin main
docker compose -f docker-compose.prod.yml up -d --build

# REAL USER TEST after each ticket:
# 1. Go to https://supermandi.tech/supplier/
# 2. Login with test supplier credentials
# 3. Navigate to affected page (orders, payouts, KYC)
# 4. Test the specific fix
# 5. Verify order status transitions
# 6. Check payout calculations
```

| Ticket | Summary | Severity |
|--------|---------|----------|
| GO-LIVE-266 | Order status transitions not validated | HIGH |
| GO-LIVE-267 | Received qty can exceed ordered qty | HIGH |
| GO-LIVE-268 | Shipment date can be in the future | MEDIUM |
| GO-LIVE-269 | No optimistic UI updates on status change | MEDIUM |
| GO-LIVE-270 | Order filter counts inaccurate with pagination | MEDIUM |
| GO-LIVE-271 | Payout failure reason not actionable | HIGH |
| GO-LIVE-272 | UTR not validated against bank | HIGH |
| GO-LIVE-273 | Bank account number not masked in display | MEDIUM |
| GO-LIVE-274 | KYC rejection reason not visible to supplier | HIGH |
| GO-LIVE-275 | IFSC lookup not verified against user input | MEDIUM |
| GO-LIVE-276 | Bank details can't be updated after verification | HIGH |
| GO-LIVE-277 | Document upload type validation weak | MEDIUM |
| GO-LIVE-278 | No PAN verification against NSDL | MEDIUM |
| GO-LIVE-279 | No document expiry handling | MEDIUM |
| GO-LIVE-280 | No upload progress indicator | LOW |

---

### Batch 11: SuperAdmin Portal Completeness (9 tickets)
**Theme:** Audit logging, input validation, missing features

#### Batch 11 Deployment Rules
```bash
# AFTER each superadmin portal ticket:
ssh claude@34.14.220.171
cd /home/claude/supermandi-pos && git pull origin main
docker compose -f docker-compose.prod.yml up -d --build

# REAL USER TEST after each ticket:
# 1. Go to https://supermandi.tech/admin/
# 2. Login with admin token
# 3. Perform the action (create store, approve supplier, etc.)
# 4. Go to Audit Logs tab
# 5. Verify action was logged with correct details
# 6. Test input validation on forms
```

| Ticket | Summary | Severity |
|--------|---------|----------|
| GO-LIVE-284 | Device enrollment not logged | MEDIUM |
| GO-LIVE-285 | Barcode sheet download not logged | MEDIUM |
| GO-LIVE-286 | Audit log creation is fire-and-forget | MEDIUM |
| GO-LIVE-287 | No admin IP tracking in audit logs | MEDIUM |
| GO-LIVE-288 | Audit log export not implemented | MEDIUM |
| GO-LIVE-289 | Device blocking not implemented | HIGH |
| GO-LIVE-290 | Supplier link removal not implemented | HIGH |
| GO-LIVE-291 | No device deprovisioning workflow | HIGH |
| GO-LIVE-292 | Date range validation missing (from > to) | MEDIUM |

**Note:** GO-LIVE-281/282/283 removed (duplicates of GO-LIVE-143/141/142 in Batch 2)

---

### Batch 12: Infrastructure - High Availability (15 tickets)
**Theme:** Single points of failure, replication, failover

#### Batch 12 Deployment Rules
```bash
# INFRASTRUCTURE CHANGES - EXTRA CAUTION!
# AFTER each HA ticket:
ssh claude@34.14.220.171
cd /home/claude/supermandi-pos && git pull origin main

# Backup current docker-compose config
cp docker-compose.prod.yml docker-compose.prod.yml.backup

# Apply changes carefully
docker compose -f docker-compose.prod.yml up -d --build

# REAL USER TEST after each ticket:
# 1. Verify all services healthy: docker ps
# 2. Test failover scenario if applicable
# 3. Verify no service interruption
# 4. Check all endpoints respond
curl -s http://localhost:3000/health
curl -s http://localhost:3010/health
```

| Ticket | Summary | Severity |
|--------|---------|----------|
| GO-LIVE-293 | Single NGINX instance (no failover) | CRITICAL |
| GO-LIVE-294 | Single PostgreSQL instance (no replication) | CRITICAL |
| GO-LIVE-295 | Single Redis instance (no HA) | CRITICAL |
| GO-LIVE-296 | Single instance per service (no replicas) | CRITICAL |
| GO-LIVE-297 | No load balancing between services | CRITICAL |
| GO-LIVE-298 | API Gateway exposed on 0.0.0.0 directly | HIGH |
| GO-LIVE-299 | Main backend port 3010 exposed (bypasses gateway) | HIGH |
| GO-LIVE-300 | No rolling update strategy (downtime deployments) | HIGH |
| GO-LIVE-301 | Health checks don't verify database connectivity | HIGH |
| GO-LIVE-302 | No upstream health checking in NGINX | HIGH |
| GO-LIVE-303 | Container restart policy missing for main-backend | HIGH |
| GO-LIVE-304 | NGINX depends on single healthy API Gateway | HIGH |
| GO-LIVE-305 | No automatic certificate renewal | HIGH |
| GO-LIVE-306 | Certificate validity not monitored | MEDIUM |
| GO-LIVE-307 | nip.io domain not production-grade | HIGH |

---

### Batch 13: Infrastructure - Scaling & Performance (15 tickets)
**Theme:** Resource limits, connection pooling, caching

#### Batch 13 Deployment Rules
```bash
# PERFORMANCE CHANGES - Monitor closely!
# AFTER each scaling ticket:
ssh claude@34.14.220.171
cd /home/claude/supermandi-pos && git pull origin main
docker compose -f docker-compose.prod.yml up -d --build

# Monitor resource usage
docker stats --no-stream

# Check database connections
docker exec supermandi-postgres psql -U supermandi -c "SELECT count(*) FROM pg_stat_activity;"

# REAL USER TEST after each ticket:
# 1. Verify system remains responsive
# 2. Test under simulated load if possible
# 3. Check memory/CPU usage: docker stats
# 4. Verify no timeouts on API calls
```

| Ticket | Summary | Severity |
|--------|---------|----------|
| GO-LIVE-308 | Database pool max=10 (need 100+ for 10K stores) | CRITICAL |
| GO-LIVE-309 | Redis max memory 256MB (need 1GB) | CRITICAL |
| GO-LIVE-310 | Service memory limits 256MB (need 1GB+) | CRITICAL |
| GO-LIVE-311 | No connection pooler (PgBouncer) for 5000+ connections | HIGH |
| GO-LIVE-312 | Keepalive connections only 32 (need 256) | HIGH |
| GO-LIVE-313 | No API response caching configured | HIGH |
| GO-LIVE-314 | No disk space monitoring | HIGH |
| GO-LIVE-315 | Request timeouts too long (60s) | MEDIUM |
| GO-LIVE-316 | No request size limits per endpoint | MEDIUM |
| GO-LIVE-317 | No performance baselines established | MEDIUM |
| GO-LIVE-318 | Translation glossary never reloaded | MEDIUM |
| GO-LIVE-319 | POS event logger checks schema on every event | MEDIUM |
| GO-LIVE-320 | Product search has no timeout | MEDIUM |
| GO-LIVE-321 | PDF generation not streaming (OOM on large sheets) | HIGH |
| GO-LIVE-322 | Stock lock order causes deadlocks | HIGH |

---

### Batch 14: Backup & Disaster Recovery (12 tickets)
**Theme:** Backup frequency, encryption, recovery testing

#### Batch 14 Deployment Rules
```bash
# BACKUP CHANGES - Test recovery after each change!
# AFTER each backup ticket:
ssh claude@34.14.220.171
cd /home/claude/supermandi-pos && git pull origin main
docker compose -f docker-compose.prod.yml up -d --build

# REAL USER TEST after each ticket:
# 1. Trigger a manual backup
docker exec supermandi-postgres pg_dump -U supermandi supermandi > /tmp/test_backup.sql

# 2. Verify backup file is valid
head -100 /tmp/test_backup.sql

# 3. Test backup encryption if applicable
# 4. Verify backup uploaded to GCS
# 5. Test restore to verify backup works (on test DB only!)
```

| Ticket | Summary | Severity |
|--------|---------|----------|
| GO-LIVE-323 | Backup frequency once daily (need hourly) | CRITICAL |
| GO-LIVE-324 | No disaster recovery plan documented | CRITICAL |
| GO-LIVE-325 | Backup not encrypted | CRITICAL |
| GO-LIVE-326 | No backup integrity testing (test restore) | HIGH |
| GO-LIVE-327 | No RTO/RPO defined | HIGH |
| GO-LIVE-328 | Backups stored local to VM only | HIGH |
| GO-LIVE-329 | No incremental backups (WAL archiving) | HIGH |
| GO-LIVE-330 | Restore script missing | HIGH |
| GO-LIVE-331 | No production failover environment | HIGH |
| GO-LIVE-332 | Backup credentials in plain text | MEDIUM |
| GO-LIVE-333 | No backup access control | MEDIUM |
| GO-LIVE-334 | GCS backup retention not configured | MEDIUM |

---

### Batch 15: Monitoring & Logging (12 tickets)
**Theme:** Centralized logging, APM, alerting

#### Batch 15 Deployment Rules
```bash
# MONITORING CHANGES - Verify observability works!
# AFTER each monitoring ticket:
ssh claude@34.14.220.171
cd /home/claude/supermandi-pos && git pull origin main
docker compose -f docker-compose.prod.yml up -d --build

# REAL USER TEST after each ticket:
# 1. Generate some traffic (make API calls)
# 2. Verify logs are captured
docker logs --tail 50 supermandi-backend

# 3. Check if centralized logging receives logs
# 4. Verify alerts fire on test conditions
# 5. Check request IDs are tracked end-to-end
```

| Ticket | Summary | Severity |
|--------|---------|----------|
| GO-LIVE-335 | No centralized logging (Docker logs only) | CRITICAL |
| GO-LIVE-336 | No APM/monitoring system | CRITICAL |
| GO-LIVE-337 | No alerting configured | CRITICAL |
| GO-LIVE-338 | No request/response body logging | HIGH |
| GO-LIVE-339 | No audit logging for data access | HIGH |
| GO-LIVE-340 | No log rotation configured | HIGH |
| GO-LIVE-341 | Debug logs in production (too verbose) | MEDIUM |
| GO-LIVE-342 | No request ID/correlation ID tracking | HIGH |
| GO-LIVE-343 | No API versioning/deprecation headers | MEDIUM |
| GO-LIVE-344 | No Sentry integration | MEDIUM |
| GO-LIVE-345 | PII not sanitized in logs | MEDIUM |
| GO-LIVE-346 | No inventory movement audit trail | HIGH |

---

## 5) Definition of DONE (Per Ticket)

A ticket is **DONE** only when ALL of the following are true:
- [ ] Code implemented locally and tested
- [ ] Committed with message: `GO-LIVE-XXX: description`
- [ ] Pushed to origin/main
- [ ] Deployed to VM via: `ssh claude@34.14.220.171`
- [ ] DB migrations applied (if applicable)
- [ ] Health checks pass on VM
- [ ] Real user test performed on production URL
- [ ] PASS documented with evidence (screenshot/log)

A ticket is **NOT DONE** if:
- ❌ Only tested locally
- ❌ Deployed but not user-tested
- ❌ User test failed but moved on anyway
- ❌ Health checks failing on VM

---

## 6) Deployment Playbook (USE AFTER EVERY TICKET)

### Step 1: SSH to VM
```bash
# Primary method
ssh claude@34.14.220.171

# Alternative (GCloud)
gcloud compute ssh --zone "asia-south1-a" "supermandi-backend-vm" --project "supermandi-backend"
```

### Step 2: Pre-deploy Checklist
```bash
cd /home/claude/supermandi-pos

# Check current state
docker ps
docker logs --tail 20 supermandi-backend 2>&1 | grep -i error

# Verify health BEFORE changes
curl -s http://localhost:3000/health | jq
curl -s http://localhost:3010/health | jq
```

### Step 3: Pull & Deploy
```bash
# Pull latest code
git pull origin main

# Build and restart containers
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

# Run migrations if ticket requires DB changes
docker exec supermandi-backend npm run migrate
```

### Step 4: Post-deploy Verification
```bash
# Wait for containers to start
sleep 10

# Health checks MUST pass
curl -s http://localhost:3000/health | jq
curl -s http://localhost:3010/health | jq

# Check for errors
docker logs --tail 50 supermandi-backend 2>&1 | grep -i error
docker logs --tail 50 supermandi-api-gateway 2>&1 | grep -i error

# Verify key routes respond
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/v1/health
curl -s -o /dev/null -w "%{http_code}" https://supermandi.tech/admin/

# Record deployment
echo "Deployed: $(git rev-parse HEAD) at $(date)"
```

### Step 5: Real User Test (MANDATORY)
```
DO NOT SKIP THIS STEP!

After EVERY deployment:
1. Open the affected portal in browser
2. Login as real user would
3. Perform the exact flow that was fixed
4. Verify fix works correctly
5. Check for regressions in related features
6. Document PASS or FAIL with evidence
```

### Rollback Procedure (If Needed)
```bash
# If deployment fails:
git log --oneline -5  # Find previous good commit
git checkout <previous_commit>
docker compose -f docker-compose.prod.yml up -d --build
curl -s http://localhost:3000/health | jq  # Verify rollback worked
```

---

## 7) Real User Test Matrix

### After EACH Batch, test as real user:

#### SuperAdmin Web (https://supermandi.tech/admin/)
- [ ] Login with admin token
- [ ] Navigate all tabs
- [ ] Create/modify store (if batch touches it)
- [ ] Verify changes propagate to POS

#### Retailer Web (https://supermandi.tech/retailer/)
- [ ] Login with phone OTP
- [ ] View dashboard
- [ ] Test affected flows (inventory, products, settings)

#### Supplier Web (https://supermandi.tech/supplier/)
- [ ] Login with credentials
- [ ] Test product management
- [ ] Test order flows if touched

#### POS App
- [ ] Enroll device (if applicable)
- [ ] Scan barcode → resolve → add to cart
- [ ] Complete sell flow
- [ ] Verify ledger/stock correctness
- [ ] Test offline scenarios if touched

---

## 8) Batch Report Format

```markdown
## Batch [X] Report: [Theme]

### Tickets Completed
- GO-LIVE-XXX: [Summary] - PASS/FAIL
- GO-LIVE-XXX: [Summary] - PASS/FAIL

### Deployment Evidence
- Commit SHA: [hash]
- Deploy time: [timestamp]
- Migrations: [list or "none"]
- Containers restarted: [list]

### VM Verification
```
[paste command outputs]
```

### Real User Test Results
| App | Test | Result |
|-----|------|--------|
| SuperAdmin | Login | PASS/FAIL |
| Retailer | Dashboard | PASS/FAIL |
| Supplier | Products | PASS/FAIL |
| POS | Sell flow | PASS/FAIL |

### Regressions Found
- [None or list new tickets]

### Batch Status: PASS/FAIL
```

---

## 9) Execution Status

| Batch | Theme | Tickets | Done | Status |
|-------|-------|---------|------|--------|
| 0 | CRITICAL Security & Secrets | 11 | 1 | IN PROGRESS |
| 1 | Payment & Financial Integrity | 15 | 0 | PENDING |
| 2 | Authentication & Authorization | 17 | 0 | PENDING |
| 3 | Input Validation & Sanitization | 20 | 0 | PENDING |
| 4 | API Error Handling & Resilience | 18 | 0 | PENDING |
| 5 | Rate Limiting & DoS Protection | 12 | 0 | PENDING |
| 6 | Database Schema Integrity | 20 | 0 | PENDING |
| 7 | Offline & Sync Reliability | 15 | 0 | PENDING |
| 8 | POS App UX & Business Logic | 20 | 0 | PENDING |
| 9 | Retailer Portal Completeness | 15 | 0 | PENDING |
| 10 | Supplier Portal Completeness | 15 | 0 | PENDING |
| 11 | SuperAdmin Portal Completeness | 9 | 0 | PENDING |
| 12 | Infrastructure - High Availability | 15 | 0 | PENDING |
| 13 | Infrastructure - Scaling & Performance | 15 | 0 | PENDING |
| 14 | Backup & Disaster Recovery | 12 | 0 | PENDING |
| 15 | Monitoring & Logging | 12 | 0 | PENDING |
| **TOTAL** | | **241** | **1** | |

---

## 10) Priority Order

### Phase 1: Security Blockers (Batches 0-2)
**Tickets:** 43 (11 + 15 + 17)
- Batch 0: Secrets & Critical Security (11)
- Batch 1: Payment Integrity (15)
- Batch 2: Auth & Authorization (17)

### Phase 2: Data Integrity (Batches 3-7)
**Tickets:** 85 (20 + 18 + 12 + 20 + 15)
- Batch 3: Input Validation (20)
- Batch 4: Error Handling (18)
- Batch 5: Rate Limiting (12)
- Batch 6: Database Schema (20)
- Batch 7: Offline & Sync (15)

### Phase 3: User Experience (Batches 8-11)
**Tickets:** 59 (20 + 15 + 15 + 9)
- Batch 8: POS App UX (20)
- Batch 9: Retailer Portal (15)
- Batch 10: Supplier Portal (15)
- Batch 11: SuperAdmin Portal (9)

### Phase 4: Infrastructure (Batches 12-15)
**Tickets:** 54 (15 + 15 + 12 + 12)
- Batch 12: High Availability (15)
- Batch 13: Scaling & Performance (15)
- Batch 14: Backup & DR (12)
- Batch 15: Monitoring & Logging (12)

**GRAND TOTAL: 241 tickets** (5 duplicates removed)

---

## 11) Current Focus

**NOW:** Batch 0, Ticket GO-LIVE-103 (GO-LIVE-101 completed)

### Session Reference - RESUME POINT
```
Commit: c4ba2a9
Full SHA: c4ba2a9268b443d54894a9e8488c6d1da2cf2ed3
Branch: main
Previous Commit: 52b8891
Working Tree: Clean (0 changes)

API Gateway: http://34.14.220.171:3000
Production URL: https://supermandi.tech

Save Time (IST): 2026-01-30 19:35 IST
Backend VM Status: deployed OK
Remote Origin: https://github.com/Supermanditech/supermandi-pos.git
Pushed: ✅ Yes (origin/main up to date)

PROGRESS:
- Total Tickets: 241
- Completed: 1 (GO-LIVE-101)
- Remaining: 240

COMPLETED:
- GO-LIVE-101 ✅ (Secrets in source control) - Commit 2cc7d0e

NEXT TICKET:
- GO-LIVE-103: ADMIN_TOKEN exposed in docker-compose.prod.yml
```

### Execution Mode: ONE TICKET AT A TIME
```
For each ticket:
1. Implement fix locally
2. git commit -m "GO-LIVE-XXX: description"
3. git push origin main
4. SSH to VM: ssh claude@34.14.220.171
5. Deploy: git pull && docker compose up -d --build
6. Real user test on production URLs
7. Document PASS/FAIL
8. Only then move to next ticket
```

### Current Ticket Queue (Batch 0) - 11 tickets
- [x] GO-LIVE-101: Secrets in source control (includes GO-LIVE-102) ✅ DONE - Commit 2cc7d0e
- [ ] GO-LIVE-103: ADMIN_TOKEN exposed
- [ ] GO-LIVE-104: Firebase token forgery
- [ ] GO-LIVE-105: Device token in AsyncStorage
- [ ] GO-LIVE-106: SQLite not encrypted
- [ ] GO-LIVE-107: OpenAI key in memory
- [ ] GO-LIVE-108: Missing CSRF protection
- [ ] GO-LIVE-109: No token refresh in retailer-admin
- [ ] GO-LIVE-110: Supplier tokens in localStorage
- [ ] GO-LIVE-111: No session timeout in supplier
- [ ] GO-LIVE-112: ALLOW_BYPASS can be enabled

**NEXT:** GO-LIVE-103 (ADMIN_TOKEN exposed in docker-compose.prod.yml)

---

## 12) Architecture Recommendations

### Current State (NOT PRODUCTION READY)
```
Client → NGINX (single) → API Gateway (single) → Services (single each)
                            ↓
                        PostgreSQL (single)
                        Redis (single)
```

### Target State (10,000 STORES)
```
                    GCP Load Balancer (with health checks)
                         ↓
    NGINX ←→ NGINX ←→ NGINX (replicas: 3)
         ↓
    API Gateway (replicas: 3) ↔ Services (replicas: 2-3 each)
         ↓
    PostgreSQL Primary ←→ PostgreSQL Standby (streaming replication)
    Redis Primary ←→ Redis Sentinel (high availability)

    Backups → GCS (encrypted, hourly, 7-day retention)
    Logs → GCP Cloud Logging
    Monitoring → Prometheus + Grafana + PagerDuty
```

### Capacity Requirements
- **CPU:** 32+ cores (across replicas)
- **Memory:** 32GB+ (across services)
- **Database connections:** 5,000+
- **Concurrent users per store:** 3-5
- **Transactions per second:** ~100-500
- **Storage:** 100GB+ (with backups)

### Availability Targets
- **Uptime:** 99.9% (< 8 hours downtime/year)
- **RTO:** 1 hour (recovery time objective)
- **RPO:** 1 hour (recovery point objective)
- **P95 Latency:** < 1 second
- **Error Rate:** < 0.1%

---

*Document generated by comprehensive real-user audit on 2026-01-30*
