# SUPERMANDI — FINAL EXECUTION TICKETS (GO-LIVE GRADE)

## Execution Rule for Claude

- Implement exactly as written.
- No redesign, no shortcuts, no skipping states.
- POS, Web, Backend, SuperAdmin must behave identically.

---

## VM Access Details (DO NOT ASK FOR THESE)

**Claude MUST use these pre-authorized credentials for all VM operations. NEVER ask the user for SSH details, passwords, or access information.**

### Production VM Access

| Property | Value |
|----------|-------|
| **Host/IP** | `34.14.220.171` |
| **SSH User** | `claude` |
| **Project** | `supermandi-backend` |
| **Zone** | `asia-south1-a` |
| **VM Name** | `supermandi-backend-vm` |

### SSH Commands (Use These Directly)

```bash
# Primary SSH (direct)
ssh claude@34.14.220.171

# Alternative: GCloud SSH
gcloud compute ssh --zone "asia-south1-a" "supermandi-backend-vm" --project "supermandi-backend"
```

### Alternative Access (Legacy VM)

```bash
# Legacy VM access
ssh supermanditech@34.14.150.183
# Password: Supermandi@123
```

### SSH Keys (Already Configured)

```bash
# Claude's authorized key (already on VM)
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIE/FDEkZbVV3m3uR2F9WmfKNEpCEhrPTax3gl8KGACFR claude-code-vm-access

# SuperMandi GitHub key
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKyLta6LMjELpJ5gToJhw3Cd5U5YWx+G7bDP3fK/ypGH supermandi@github
```

### Get VM External IP (From Inside VM)

```bash
curl -s -H "Metadata-Flavor: Google" \
  http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip
```

### Standard Deployment Commands

```bash
# After SSH into VM:
cd /opt/supermandi
git pull origin main

# Run migrations
docker compose -f docker-compose.prod.yml exec -T main-backend node scripts/migrate-prod.js

# Rebuild backend services
docker compose -f docker-compose.prod.yml up -d --build main-backend api-gateway

# Rebuild retailer-admin
cd /opt/supermandi/retailer-admin
npm ci && npm run build
cp -r dist/* /var/www/retailer-admin/

# Rebuild supplier-portal
cd /opt/supermandi/supplier-portal
npm ci && npm run build

# Check service status
docker compose -f docker-compose.prod.yml ps
```

---

## Claude Testing Rule (MANDATORY)

**Every ticket MUST be tested as a real user before marking complete.**

### Testing Protocol Per Ticket

1. **Implement** → Write code per ticket spec
2. **Deploy to VM** → SSH and rebuild affected services
3. **Test as Real User** → Open browser/POS and verify:
   - UI renders correctly
   - Forms submit without errors
   - API returns expected responses
   - Database state is correct
   - Status transitions work
4. **Capture Proof** → Run curl commands from Section D.1
5. **Verify Acceptance** → Check ALL boxes in "Acceptance" section
6. **Mark Complete** → Only after ALL tests pass

### What "Test as Real User" Means

| Portal | How to Test |
|--------|-------------|
| **Retailer Dashboard** | Open `https://supermandi.tech/retailer/` in browser, login with test phone, perform actions |
| **Supplier Portal** | Open `https://supermandi.tech/supplier/` in browser, login, verify features |
| **SuperAdmin** | Open `https://supermandi.tech/admin/` in browser, login as admin, verify actions |
| **POS App** | Use Expo Go or test build on real device/emulator |
| **Backend API** | Run curl commands per ticket's D.1 section, verify responses |

### Testing Checklist (Per Ticket)

```markdown
## Ticket [TICKET-ID] Testing Proof

### 1. Deployment Verification
- [ ] SSH into VM: `gcloud compute ssh --zone "asia-south1-a" "supermandi-backend-vm" --project "supermandi-backend"`
- [ ] Services rebuilt: `docker compose -f docker-compose.prod.yml up -d --build [services]`
- [ ] No build errors in logs

### 2. API Testing (curl)
- [ ] All curl commands from D.1 executed
- [ ] Expected status codes received
- [ ] Response body matches expected

### 3. UI Testing (Real User)
- [ ] Page loads without errors
- [ ] Forms submit successfully
- [ ] Correct data displayed
- [ ] Error states handled gracefully
- [ ] Mobile responsive (if applicable)

### 4. Database Verification
- [ ] Records created/updated correctly
- [ ] Status transitions logged in audit table
- [ ] No orphan or duplicate records

### 5. Cross-Portal Verification
- [ ] Changes reflect in all affected portals
- [ ] No stale data shown
```

### DO NOT Mark Ticket Complete If:

- ❌ Only tested with curl (no UI testing)
- ❌ Only tested locally (not deployed to VM)
- ❌ Acceptance criteria have unchecked items
- ❌ Any console errors in browser
- ❌ Any 500/404 errors from API
- ❌ Status transitions skip states
- ❌ Cross-portal data mismatch

### Example: Testing AUTH-001

```bash
# 1. Deploy
gcloud compute ssh --zone "asia-south1-a" "supermandi-backend-vm" --project "supermandi-backend"
cd /opt/supermandi
docker compose -f docker-compose.prod.yml up -d --build main-backend
cd /opt/supermandi/retailer-admin && npm run build && cp -r dist/* /var/www/retailer-admin/

# 2. API Test
curl -X POST https://supermandi.tech/api/v1/supplier/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+919876543210"}'
# Verify: 200 { "success": true }

# 3. UI Test (in browser)
# - Go to https://supermandi.tech/retailer/
# - Enter phone number
# - Receive OTP (check phone/console)
# - Submit OTP
# - Verify: If not ACTIVE → see status page, not dashboard

# 4. Database Verification
docker compose -f docker-compose.prod.yml exec postgres psql -U supermandi supermandi -c \
  "SELECT id, phone, actor_type FROM auth.users WHERE phone = '+919876543210';"
```

### Post-Batch Verification

After completing each batch, run the full verification:

```bash
# 1. Run smoke test
./scripts/go_live_smoke.sh

# 2. Check all health endpoints
curl -s https://supermandi.tech/api/health | jq
curl -s https://supermandi.tech/retailer/ -o /dev/null -w "%{http_code}"
curl -s https://supermandi.tech/supplier/ -o /dev/null -w "%{http_code}"
curl -s https://supermandi.tech/admin/ -o /dev/null -w "%{http_code}"

# 3. Verify services running
docker compose -f docker-compose.prod.yml ps
```

---

## Quick Navigation

| # | Ticket | Title | Category |
|---|--------|-------|----------|
| 1 | [AUTH-001](#auth-001--otp-first-authentication-retailer--supplier) | OTP-First Authentication | AUTH & IDENTITY |
| 2 | [CORE-001](#core-001--canonical-store-state-machine) | Canonical Store State Machine | DATA MODEL |
| 3 | [CORE-002](#core-002--supplier-state-machine) | Supplier State Machine | DATA MODEL |
| 4 | [POS-DEV-001](#pos-dev-001--device-generated-activation-code) | Device-Generated Activation Code | POS DEVICE |
| 5 | [POS-DEV-002](#pos-dev-002--device-fingerprint-specification--rotation-rules) | Device Fingerprint Specification | POS DEVICE |
| 6 | [RET-POS-001](#ret-pos-001--replace-enrollment-only-screen-with-retailer-onboarding) | POS Onboarding Wizard | RETAILER POS |
| 7 | [RET-POS-002](#ret-pos-002--pos-limited-mode-enforcement) | POS Limited Mode Enforcement | RETAILER POS |
| 8 | [RET-WEB-001](#ret-web-001--retailer-web-store-registration) | Retailer Web Registration | RETAILER WEB |
| 9 | [RET-WEB-002](#ret-web-002--pos-device-activation-via-code) | Device Activation via Code | RETAILER WEB |
| 10 | [RET-WEB-003](#ret-web-003--payments-setup-on-web) | Payments Setup | RETAILER WEB |
| 11 | [KYC-001](#kyc-001--unified-document-upload--validation) | Document Upload & Validation | KYC |
| 12 | [KYC-002](#kyc-002--needs_fix-resubmission-workflow) | NEEDS_FIX Resubmission Workflow | KYC |
| 13 | [DOCS-001](#docs-001--document-storage-backend) | Document Storage Backend | KYC |
| 14 | [ADMIN-001](#admin-001--retailer-application-review) | Retailer Application Review | SUPERADMIN |
| 15 | [ADMIN-002](#admin-002--supplier-review--activation) | Supplier Review & Activation | SUPERADMIN |
| 16 | [SUP-001](#sup-001--supplier-registration--kyc) | Supplier Registration + KYC | SUPPLIER |
| 17 | [SEC-001](#sec-001--state-based-feature-gating) | State-Based Feature Gating | ACCESS CONTROL |
| 18 | [SEC-002](#sec-002--token-to-store-binding-enforcement) | Token-to-Store Binding Enforcement | ACCESS CONTROL |
| 19 | [COM-001](#com-001--retailer-credentials-email) | Retailer Credentials Email | COMMUNICATION |
| 20 | [DEDUP-001](#dedup-001--duplicate-prevention-rules) | Duplicate Prevention Rules | DATA INTEGRITY |
| 21 | [FLOW-001](#flow-001--retailer-web-entry-requires-pos-activation-code-hard-gate) | Web Requires POS Activation | FLOW CONTROL |
| 22 | [PAY-001](#pay-001--payments-data-validation) | Payments Data Validation | PAYMENTS |
| 23 | [AUDIT-001](#audit-001--status-audit-logs--admin-history-ui) | Status Audit Logs + Admin History | AUDIT |
| 24 | [OPS-001](#ops-001--vm-deployment-contract--correct-build-targets) | VM Deployment Contract | OPERATIONS |
| 25 | [ENV-001](#env-001--build-time-env-injection-for-portals) | Build-time ENV Injection | OPERATIONS |
| 26 | [GW-001](#gw-001--api-gateway-route-coverage-audit) | API Gateway Route Coverage | OPERATIONS |
| 27 | [OBS-001](#obs-001--production-monitoring--alert-baseline) | Production Monitoring & Alerts | OPERATIONS |
| 28 | [QA-001](#qa-001--smoke-test-script) | Smoke Test Script | QA |
| 29 | [GL-001](#gl-001--end-to-end-real-user-test) | End-to-End Real User Test | GO-LIVE |

---

## FINAL RULE

**If any behavior deviates from this ticket pack, it is a BUG, not a design choice.**

---
---

# AUTH-001 — OTP-First Authentication (Retailer + Supplier)

**Category:** AUTH & IDENTITY (FOUNDATION)

**Scope:** Backend + POS + Retailer Web + Supplier Portal

---

## Implement

- OTP (phone) is the **primary login** method
- Password is **optional** (secondary / recovery only)
- OTP login allowed at all states, but **access gated by status**

---

## Acceptance

- [ ] Retailer & Supplier can login via OTP
- [ ] If not ACTIVE → redirected to status screen
- [ ] No feature access without ACTIVE state

---

## A) Existing Code Audit (before implementation)

### rg searches ran:

```bash
rg "firebase" --type ts -l
rg "OTP|otp" --type ts -l
rg "phone.*auth|phoneAuth" --type ts -l
rg "verification_status|verificationStatus" --type ts -l
rg "actor_type" --type ts -l
```

### Current flow summary:

| Portal | Current Auth Method | Files |
|--------|---------------------|-------|
| **Retailer Dashboard** | Firebase Phone OTP → JWT | `backend/services/auth-service/src/routes/retailerAuth.ts`, `retailer-admin/src/pages/LoginPage.tsx` |
| **Supplier Portal** | Email/Password (bcrypt) + Firebase fallback | `backend/src/routes/v1/supplier/auth.ts`, `supplier-portal/src/app/(auth)/login/page.tsx` |
| **SuperAdmin** | Email OTP (hardcoded allowlist) | `backend/src/routes/v1/admin/adminAuth.ts` |
| **POS Mobile** | Enrollment code → device token | `backend/src/routes/v1/pos/enroll.ts` |

**Retailer Auth (GO-LIVE-RET-AUTH-001 COMPLETED):**
- Phone OTP via Firebase implemented
- `/auth/firebase-login` accepts idToken + storeCode
- Creates `auth.users` with `actor_type='store'`
- Linked to store via `auth.store_users`

**Supplier Auth:**
- Currently email/password based (NOT OTP-first)
- Password reset flow exists
- Account lockout after 5 failed attempts
- Firebase phone auth exists as fallback but NOT primary

### Gaps vs plan:

- [ ] **Supplier Portal**: OTP is NOT primary — currently password-first
- [ ] **Status gating**: No redirect to status screen if not ACTIVE
- [ ] **POS**: No OTP login — uses enrollment code only
- [ ] **Unified status check**: Each portal checks differently (inconsistent)

### Retailer Dashboard already covers part of this ticket?

**YES** — Retailer OTP login is implemented via Firebase. However:
- Status gating (redirect if not ACTIVE) is NOT implemented
- Need to add status check after successful OTP login

---

## B) Implementation Subtickets (UI→API→DB)

### B.1) UI Subtickets

#### B.1.1) POS Screens
- [ ] **POS-AUTH-001-UI**: Add OTP login option on POS enrollment screen
  - File: `src/screens/EnrollmentScreen.tsx` (or equivalent)
  - Add "Login with Phone OTP" button alongside enrollment code
  - After OTP success, check store status → show status screen if not ACTIVE

#### B.1.2) Retailer Dashboard Screens
- [ ] **RET-AUTH-001-UI**: Add status gate after login
  - File: `retailer-admin/src/pages/LoginPage.tsx`
  - After Firebase OTP success, fetch store status
  - If status ≠ ACTIVE → redirect to `/status` page
- [ ] **RET-AUTH-002-UI**: Create StatusPage component
  - File: `retailer-admin/src/pages/StatusPage.tsx` (NEW)
  - Show current store status with messaging
  - Provide contact/support info

#### B.1.3) Supplier Portal Screens
- [ ] **SUP-AUTH-001-UI**: Make OTP primary login method
  - File: `supplier-portal/src/app/(auth)/login/page.tsx`
  - Add Phone OTP tab/option as PRIMARY
  - Move email/password to secondary "Use Password" link
- [ ] **SUP-AUTH-002-UI**: Add status gate after login
  - File: `supplier-portal/src/lib/auth.tsx`
  - After login success, check supplier status
  - If status ≠ ACTIVE → redirect to `/pending-approval`

### B.2) API Subtickets

#### B.2.1) Supplier OTP Endpoints
- [ ] **SUP-AUTH-001-API**: Add `/api/v1/supplier/auth/send-otp`
  - File: `backend/src/routes/v1/supplier/auth.ts`
  - Request: `{ phone: string }`
  - Response: `{ success: true, message: "OTP sent" }`
  - Use Firebase Auth for phone OTP

- [ ] **SUP-AUTH-002-API**: Add `/api/v1/supplier/auth/verify-otp`
  - File: `backend/src/routes/v1/supplier/auth.ts`
  - Request: `{ phone: string, idToken: string }` (Firebase ID token)
  - Response: `{ token: string, supplier: object, status: string }`
  - Return supplier status in response for frontend gating

#### B.2.2) Status Check Middleware
- [ ] **AUTH-001-API-MW**: Create status-gate middleware
  - File: `backend/src/middleware/statusGate.ts` (NEW)
  - Check `store.status` or `supplier.verification_status`
  - Return `403 { error: "INACTIVE", status: "..." }` if not ACTIVE
  - Apply to all sensitive endpoints

### B.3) DB/Migration Subtickets

#### B.3.1) Schema Changes
- [ ] **AUTH-001-DB**: Add `phone` column to `supplier.suppliers` (if not exists)
  - Migration: `064_supplier_phone_column.sql`
  - ```sql
    ALTER TABLE supplier.suppliers
    ADD COLUMN IF NOT EXISTS phone VARCHAR(20) UNIQUE;
    CREATE INDEX IF NOT EXISTS idx_suppliers_phone ON supplier.suppliers(phone);
    ```

- [ ] **AUTH-002-DB**: Add `firebase_uid` to `supplier.suppliers`
  - Migration: `065_supplier_firebase_uid.sql`
  - ```sql
    ALTER TABLE supplier.suppliers
    ADD COLUMN IF NOT EXISTS firebase_uid VARCHAR(128) UNIQUE;
    ```

---

## C) Deployment Subtickets (VM)

### Services to rebuild:

| Service | Rebuild Required | Reason |
|---------|------------------|--------|
| `main-backend` | YES | New supplier OTP routes, status middleware |
| `auth-service` | NO | Already handles Firebase OTP |
| `api-gateway` | NO | Routes already configured |
| `retailer-admin` | YES | Add StatusPage, status gate |
| `supplier-portal` | YES | OTP-first UI, status gate |
| `nginx` | NO | No routing changes |

### Deploy commands:

```bash
# On VM (34.14.220.171)
cd /opt/supermandi

# 1. Run migrations
docker compose -f docker-compose.prod.yml exec main-backend node scripts/migrate-prod.js

# 2. Rebuild affected services
docker compose -f docker-compose.prod.yml up -d --build main-backend

# 3. Rebuild portals
cd /opt/supermandi/retailer-admin && npm run build
cp -r dist/* /var/www/retailer-admin/

cd /opt/supermandi/supplier-portal && npm run build
cp -r .next/* /var/www/supplier-portal/
```

---

## D) Verification Proof (must be attached per ticket)

### D.1) Curl Proof

```bash
# Supplier OTP Send
curl -X POST https://supermandi.tech/api/v1/supplier/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+919876543210"}'
# Expected: 200 { "success": true }

# Supplier OTP Verify (after Firebase)
curl -X POST https://supermandi.tech/api/v1/supplier/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+919876543210", "idToken": "FIREBASE_ID_TOKEN"}'
# Expected: 200 { "token": "...", "supplier": {...}, "status": "pending|verified" }

# Status-gated endpoint (without ACTIVE status)
curl -X GET https://supermandi.tech/api/v1/supplier/products \
  -H "Authorization: Bearer TOKEN_OF_PENDING_SUPPLIER"
# Expected: 403 { "error": "INACTIVE", "status": "pending" }
```

### D.2) Real-user Proof

1. **Retailer OTP Login:**
   - Go to `https://supermandi.tech/retailer/`
   - Enter phone number → receive OTP
   - Enter OTP → login successful
   - If store not ACTIVE → see status page (not dashboard)

2. **Supplier OTP Login:**
   - Go to `https://supermandi.tech/supplier/`
   - Click "Login with Phone"
   - Enter phone → receive OTP
   - Enter OTP → if not verified → see pending-approval page

### D.3) Evidence Required
- [ ] Screenshot: Retailer OTP login screen
- [ ] Screenshot: Retailer status page (if not ACTIVE)
- [ ] Screenshot: Supplier OTP login option
- [ ] Screenshot: Supplier pending-approval redirect
- [ ] Curl output logs

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Retailer OTP login | User can login with phone OTP only |
| Retailer status gate | Non-ACTIVE store sees status page |
| Supplier OTP login | User can login with phone OTP as primary |
| Supplier status gate | Non-verified supplier sees pending page |
| Password optional | Login works WITHOUT password set |
| API status gate | 403 returned for non-ACTIVE users on protected endpoints |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: YES**

### Files touched in retailer-admin:
- `retailer-admin/src/pages/LoginPage.tsx` — Add status check after login
- `retailer-admin/src/pages/StatusPage.tsx` — NEW file for status display
- `retailer-admin/src/App.tsx` — Add route for `/status`
- `retailer-admin/src/lib/auth.tsx` — Update auth context with status

### Routes touched:
- `/login` — Modified (add status check)
- `/status` — NEW route

---
---

# CORE-001 — Canonical Store State Machine

**Category:** DATA MODEL & STATE MACHINE

**Scope:** Backend (DB + services)

---

## Implement

### Store status enum:

```
DRAFT
ENROLLED
KYC_SUBMITTED
PAYMENTS_SUBMITTED
ACTIVE
NEEDS_FIX
SUSPENDED
```

---

## Rules

- All entry points update the SAME store record
- Status transitions enforced server-side
- No UI-only checks allowed

---

## Acceptance

- [ ] Store cannot jump states
- [ ] ACTIVE requires: device bound + KYC + UPI + admin approval

---

## A) Existing Code Audit (before implementation)

### rg searches ran:

```bash
rg "store.*status|status.*store" --type ts -l
rg "DRAFT|ENROLLED|KYC_SUBMITTED|PAYMENTS_SUBMITTED" --type ts -l
rg "platform.stores" --type sql -l
rg "status.*enum|enum.*status" --type sql -l
```

### Current flow summary:

**Database Schema (`backend/migrations/001_platform_schema.sql`):**
- `platform.stores` table exists
- Current status column: `status VARCHAR` with values: `active`, `inactive`, `suspended`
- NO enum constraint — just string values
- Missing states: `DRAFT`, `ENROLLED`, `KYC_SUBMITTED`, `PAYMENTS_SUBMITTED`, `NEEDS_FIX`

### Gaps vs plan:

- [ ] **Missing states**: DRAFT, ENROLLED, KYC_SUBMITTED, PAYMENTS_SUBMITTED, NEEDS_FIX not in DB
- [ ] **No enum constraint**: Status is VARCHAR, not constrained enum
- [ ] **No transition rules**: Any status can be set directly
- [ ] **No flags tracking**: device_bound, kyc_complete, upi_complete, admin_approved not tracked
- [ ] **Case mismatch**: Current uses lowercase (`active`), plan uses uppercase (`ACTIVE`)

---

## B) Implementation Subtickets (UI→API→DB)

### B.1) UI Subtickets

#### B.1.1) SuperAdmin Screens
- [ ] **ADMIN-CORE-001-UI**: Store status management panel
  - File: `supermandi-superadmin/src/components/StoreDetails.tsx`
  - Show current status with history
  - Actions: Approve (→ACTIVE), Reject (→NEEDS_FIX), Suspend

### B.2) API Subtickets

#### B.2.1) Status Transition Service
- [ ] **CORE-001-API-SVC**: Create StoreStateMachine service
  - File: `backend/src/services/storeStateMachine.ts` (NEW)
  - Define valid transitions:
    ```
    DRAFT → ENROLLED (device bound)
    ENROLLED → KYC_SUBMITTED (docs uploaded)
    KYC_SUBMITTED → PAYMENTS_SUBMITTED (UPI added)
    PAYMENTS_SUBMITTED → ACTIVE (admin approved)
    PAYMENTS_SUBMITTED → NEEDS_FIX (admin rejected)
    NEEDS_FIX → PAYMENTS_SUBMITTED (resubmitted)
    ACTIVE → SUSPENDED (admin action)
    SUSPENDED → ACTIVE (admin action)
    ```

#### B.2.2) Status Update Endpoints
- [ ] **CORE-001-API-ADMIN**: `PATCH /api/v1/admin/stores/:id/status`
  - File: `backend/src/routes/v1/admin/stores.ts`
  - Request: `{ status: string, reason?: string }`
  - Validates transition is allowed
  - Returns updated store with new status

### B.3) DB/Migration Subtickets

#### B.3.1) Schema Changes
- [ ] **CORE-001-DB-ENUM**: Create store_status enum type
  - Migration: `064_store_status_enum.sql`
  ```sql
  CREATE TYPE platform.store_status AS ENUM (
    'DRAFT', 'ENROLLED', 'KYC_SUBMITTED', 'PAYMENTS_SUBMITTED',
    'ACTIVE', 'NEEDS_FIX', 'SUSPENDED'
  );

  UPDATE platform.stores SET status = 'ACTIVE' WHERE status = 'active';
  UPDATE platform.stores SET status = 'SUSPENDED' WHERE status = 'suspended';
  UPDATE platform.stores SET status = 'DRAFT' WHERE status = 'inactive' OR status IS NULL;

  ALTER TABLE platform.stores
  ALTER COLUMN status TYPE platform.store_status
  USING status::platform.store_status;
  ```

- [ ] **CORE-001-DB-FLAGS**: Add readiness flag columns
  - Migration: `065_store_readiness_flags.sql`
  ```sql
  ALTER TABLE platform.stores
  ADD COLUMN IF NOT EXISTS device_bound BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS kyc_complete BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS upi_complete BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS admin_approved BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS status_reason TEXT,
  ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ DEFAULT NOW();
  ```

- [ ] **CORE-001-DB-AUDIT**: Create status audit log table
  - Migration: `066_store_status_audit.sql`
  ```sql
  CREATE TABLE IF NOT EXISTS platform.store_status_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES platform.stores(id),
    old_status platform.store_status,
    new_status platform.store_status NOT NULL,
    reason TEXT,
    changed_by UUID,
    changed_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```

---

## C) Deployment Subtickets (VM)

### Deploy commands:

```bash
# On VM (34.14.220.171)
cd /opt/supermandi

# 1. BACKUP DATABASE FIRST
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U supermandi supermandi > backup_$(date +%Y%m%d).sql

# 2. Run migrations
docker compose -f docker-compose.prod.yml exec main-backend node scripts/migrate-prod.js

# 3. Rebuild main-backend
docker compose -f docker-compose.prod.yml up -d --build main-backend
```

---

## D) Verification Proof

### D.1) Curl Proof

```bash
# Attempt invalid transition (DRAFT → ACTIVE)
curl -X PATCH https://supermandi.tech/api/v1/admin/stores/STORE_ID/status \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "ACTIVE"}'
# Expected: 400 { "error": "Invalid transition from DRAFT to ACTIVE" }

# Valid transition (PAYMENTS_SUBMITTED → ACTIVE)
curl -X PATCH https://supermandi.tech/api/v1/admin/stores/STORE_ID/status \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "ACTIVE"}'
# Expected: 200 { "id": "...", "status": "ACTIVE" }
```

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Enum migration | All existing stores migrated to new status |
| State machine | Invalid transitions rejected with error |
| Flags tracking | device_bound, kyc_complete, upi_complete updated correctly |
| ACTIVE requirements | Cannot reach ACTIVE without all flags true |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: YES**

### Files touched in retailer-admin:
- `retailer-admin/src/components/Header.tsx` — Add status badge
- `retailer-admin/src/components/StatusBadge.tsx` — NEW component

---
---

# CORE-002 — Supplier State Machine

**Category:** DATA MODEL & STATE MACHINE

**Scope:** Backend

---

## Implement

### Supplier status enum:

```
KYC_SUBMITTED
ACTIVE
NEEDS_FIX
SUSPENDED
```

---

## Acceptance

- [ ] Supplier portal features unlocked ONLY when ACTIVE

---

## A) Existing Code Audit (before implementation)

### Current flow summary:

**Database Schema:**
| Column | Type | Current Values |
|--------|------|----------------|
| `status` | VARCHAR | `active`, `inactive`, `suspended` |
| `verification_status` | VARCHAR | `pending`, `verified`, `rejected`, `unverified`, `suspended` |

### Gaps vs plan:

- [ ] **Enum mismatch**: Plan says `KYC_SUBMITTED`, current uses `pending`
- [ ] **Missing NEEDS_FIX**: Current uses `rejected`, plan wants `NEEDS_FIX`
- [ ] **No state machine**: Direct status updates allowed

---

## B) Implementation Subtickets (UI→API→DB)

### B.2) API Subtickets

#### B.2.1) Status Transition Service
- [ ] **CORE-002-API-SVC**: Create SupplierStateMachine service
  - File: `backend/src/services/supplierStateMachine.ts` (NEW)
  - Valid transitions:
    ```
    KYC_SUBMITTED → ACTIVE (admin approved)
    KYC_SUBMITTED → NEEDS_FIX (admin rejected)
    NEEDS_FIX → KYC_SUBMITTED (resubmitted)
    ACTIVE → SUSPENDED (admin action)
    SUSPENDED → ACTIVE (admin action)
    ```

### B.3) DB/Migration Subtickets

- [ ] **CORE-002-DB-ENUM**: Standardize verification_status enum
  - Migration: `067_supplier_status_enum.sql`
  ```sql
  CREATE TYPE supplier.supplier_verification_status AS ENUM (
    'KYC_SUBMITTED', 'ACTIVE', 'NEEDS_FIX', 'SUSPENDED'
  );

  UPDATE supplier.suppliers SET verification_status = 'KYC_SUBMITTED'
    WHERE verification_status IN ('pending', 'unverified');
  UPDATE supplier.suppliers SET verification_status = 'ACTIVE'
    WHERE verification_status = 'verified';
  UPDATE supplier.suppliers SET verification_status = 'NEEDS_FIX'
    WHERE verification_status = 'rejected';
  ```

- [ ] **CORE-002-DB-AUDIT**: Create supplier status audit table
  - Migration: `069_supplier_status_audit.sql`

---

## D) Verification Proof

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Enum migration | All existing suppliers mapped to new enum |
| State machine | Invalid transitions rejected |
| Feature gating | KYC_SUBMITTED/NEEDS_FIX suppliers blocked from features |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: NO**

---
---

# POS-DEV-001 — Device-Generated Activation Code

**Category:** POS DEVICE ACTIVATION

**Scope:** POS App + Backend

---

## Implement

- When POS app is unbound:
  - Generate short activation code (e.g. `SM-A7K2-91`)
  - Code is: single-use, time-limited (10–15 min)

- Store activation codes in DB with:
  - device fingerprint
  - expiry
  - used_at
  - bound store_id

---

## Acceptance

- [ ] Code cannot be reused
- [ ] Code cannot bind multiple stores
- [ ] Code auto-invalidates after binding

---

## A) Existing Code Audit (before implementation)

### Gaps vs plan:

- [ ] **Device-generated**: Currently codes are admin-generated, NOT device-generated
- [ ] **Code format**: Current is `ABC12345`, plan is `SM-A7K2-91`
- [ ] **Time expiry**: No expiry currently — codes last forever
- [ ] **Flow reversal**: Plan requires device to generate code, web to enter it (opposite of current)

---

## B) Implementation Subtickets (UI→API→DB)

### B.1) UI Subtickets

- [ ] **POS-DEV-001-UI-1**: Unbound device screen
  - File: `src/screens/UnboundScreen.tsx` (NEW)
  - Display: "Your activation code: SM-A7K2-91"
  - Show countdown timer (10 min)
  - Polling to check if code was used

- [ ] **RET-DEV-001-UI**: Device activation page
  - File: `retailer-admin/src/pages/DeviceActivationPage.tsx` (NEW)
  - Input field: "Enter activation code from POS device"

### B.2) API Subtickets

- [ ] **POS-DEV-001-API-GEN**: `POST /api/v1/pos/generate-activation-code`
  - Request: `{ device_fingerprint: string }`
  - Response: `{ code: "SM-A7K2-91", expires_at: "ISO timestamp" }`

- [ ] **POS-DEV-001-API-BIND**: `POST /api/v1/retailer-admin/activate-device`
  - Request: `{ activation_code: string }`
  - Validates: Code exists, not expired, not already used
  - On success: Mark code as used, create device record, bind to store

### B.3) DB/Migration Subtickets

- [ ] **POS-DEV-001-DB**: Create device_activation_codes table
  - Migration: `070_device_activation_codes.sql`
  ```sql
  CREATE TABLE IF NOT EXISTS pos.device_activation_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(12) UNIQUE NOT NULL,
    device_fingerprint VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    bound_store_id UUID REFERENCES platform.stores(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```

---

## D) Verification Proof

### D.1) Curl Proof

```bash
# Generate activation code (from POS)
curl -X POST https://supermandi.tech/api/v1/pos/generate-activation-code \
  -H "Content-Type: application/json" \
  -d '{"device_fingerprint": "abc123xyz"}'
# Expected: 200 { "code": "SM-A7K2-91", "expires_at": "..." }

# Activate device (from Retailer Dashboard)
curl -X POST https://supermandi.tech/api/v1/retailer-admin/activate-device \
  -H "Authorization: Bearer RETAILER_TOKEN" \
  -d '{"activation_code": "SM-A7K2-91"}'
# Expected: 200 { "device_id": "...", "store_id": "..." }

# Try to reuse code (should fail)
# Expected: 400 { "error": "Code already used" }
```

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Code generation | Format matches SM-XXXX-XX |
| Single-use | Second use attempt fails |
| Time-limited | Expired code rejected (15 min) |
| Device binding | Device correctly bound to store |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: YES**

### Files touched in retailer-admin:
- `retailer-admin/src/pages/DeviceActivationPage.tsx` — NEW page
- `retailer-admin/src/App.tsx` — Add route `/devices/activate`

---
---

# RET-POS-001 — Replace Enrollment-Only Screen with Retailer Onboarding

**Category:** RETAILER ONBOARDING — POS FLOW (PRIMARY)

**Scope:** POS App

---

## Implement

On fresh POS install show **Retailer Sign-In / Register wizard**:

### Step 1 — Store & Owner Details
- Store name, Location + full address
- Store type: Grocery, Kirana, Supermarket, Other → **required "Specify other store type"**
- GSTIN, Authorized person name, Phone (OTP), Email

### Step 2 — Document Upload
- Aadhaar, GST certificate, Owner selfie

### Step 3 — Payments
- UPI address (mandatory), Bank details (optional initially)

---

## System Action

- Auto-create store
- Auto-bind device
- Set status → `ENROLLED` + `KYC_SUBMITTED` + `PAYMENTS_SUBMITTED`

---

## Acceptance

- [ ] No manual enrollment code required
- [ ] POS opens in LIMITED MODE after submit

---

## B) Implementation Subtickets (UI→API→DB)

### B.1) UI Subtickets

- [ ] **RET-POS-001-UI-1**: Onboarding wizard container
  - File: `src/screens/OnboardingWizard.tsx` (NEW)

- [ ] **RET-POS-001-UI-2**: Step 1 - Store & Owner Details
  - File: `src/screens/onboarding/StoreDetailsStep.tsx` (NEW)

- [ ] **RET-POS-001-UI-3**: Step 2 - Document Upload
  - File: `src/screens/onboarding/DocumentsStep.tsx` (NEW)

- [ ] **RET-POS-001-UI-4**: Step 3 - Payments
  - File: `src/screens/onboarding/PaymentsStep.tsx` (NEW)

### B.2) API Subtickets

- [ ] **RET-POS-001-API-REG**: `POST /api/v1/pos/register-store`
- [ ] **RET-POS-001-API-DOCS**: `POST /api/v1/pos/upload-documents`
- [ ] **RET-POS-001-API-PAY**: `POST /api/v1/pos/setup-payments`

### B.3) DB/Migration Subtickets

- [ ] **RET-POS-001-DB-STORE**: Migration: `071_store_registration_fields.sql`
- [ ] **RET-POS-001-DB-DOCS**: Migration: `072_store_documents.sql`
- [ ] **RET-POS-001-DB-PAY**: Migration: `073_store_payment_details.sql`

---

## D) Verification Proof

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Wizard flow | All 3 steps completable |
| Phone OTP | OTP verification works |
| Document upload | All 3 docs uploaded successfully |
| Store creation | Store created with correct status |
| LIMITED MODE | SELL features blocked after submit |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: YES**

---
---

# RET-POS-002 — POS Limited Mode Enforcement

**Category:** RETAILER ONBOARDING — POS FLOW (PRIMARY)

**Scope:** POS App + Backend

---

## Implement

In **LIMITED MODE**:

### Allowed:
- App navigation
- Product creation

### Blocked:
- SELL
- UPI QR
- Payments
- Invoice finalization

---

## Acceptance

- [ ] SELL APIs blocked server-side if status ≠ ACTIVE

---

## B) Implementation Subtickets (UI→API→DB)

### B.1) UI Subtickets

- [ ] **RET-POS-002-UI-1**: Limited Mode indicator
  - File: `src/components/LimitedModeBar.tsx` (NEW)
  - Persistent banner: "Your store is pending approval. Some features are limited."

- [ ] **RET-POS-002-UI-2**: Feature gating in Sell screen
  - File: `src/screens/SellScreen.tsx`
  - If LIMITED MODE: Show overlay "Feature locked until store approved"

### B.2) API Subtickets

- [ ] **RET-POS-002-API-MW**: Create POS status middleware
  - File: `backend/src/middleware/posStatusGate.ts` (NEW)
  - Returns `403 { error: "STORE_NOT_ACTIVE", status: "..." }` if not ACTIVE

- [ ] **RET-POS-002-API-SELL**: Gate sales endpoints
  - Apply middleware to: `POST /api/v1/pos/sales`, `POST /api/v1/pos/payments`, `GET /api/v1/pos/qr`

---

## D) Verification Proof

### D.1) Curl Proof

```bash
# Try to create sale (BLOCKED)
curl -X POST https://supermandi.tech/api/v1/pos/sales \
  -H "Authorization: Bearer NON_ACTIVE_STORE_TOKEN" \
  -d '{"items": [...]}'
# Expected: 403 { "error": "STORE_NOT_ACTIVE", "status": "PAYMENTS_SUBMITTED" }

# Create product (ALLOWED)
curl -X POST https://supermandi.tech/api/v1/pos/products \
  -H "Authorization: Bearer NON_ACTIVE_STORE_TOKEN" \
  -d '{"name": "Test Product", "price": 100}'
# Expected: 201 { "id": "...", "name": "Test Product" }
```

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| SELL blocked | 403 from API, UI shows locked |
| Payments blocked | 403 from API, UI shows locked |
| Products allowed | 201 from API, UI works normally |
| Unlock on ACTIVE | All features work after approval |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: NO**

---
---

# RET-WEB-001 — Retailer Web Store Registration

**Category:** RETAILER DASHBOARD FLOW (SECONDARY)

**Scope:** Retailer Web + Backend

---

## Implement

- Same fields + documents as POS onboarding
- Creates store in **DRAFT**
- No POS access yet

---

## Acceptance

- [ ] Store exists but inactive
- [ ] No SELL / POS access

---

## B) Implementation Subtickets (UI→API→DB)

### B.1) UI Subtickets

- [ ] **RET-WEB-001-UI-1**: Registration wizard container
  - File: `retailer-admin/src/pages/RegisterPage.tsx` (MODIFY)
  - Convert to multi-step wizard: Details → Documents → Payments → Review

- [ ] **RET-WEB-001-UI-2**: Step 1 - Store & Owner Details
  - File: `retailer-admin/src/components/registration/StoreDetailsStep.tsx` (NEW)

- [ ] **RET-WEB-001-UI-3**: Step 2 - Document Upload
  - File: `retailer-admin/src/components/registration/DocumentsStep.tsx` (NEW)

### B.2) API Subtickets

- [ ] **RET-WEB-001-API-REG**: `POST /api/v1/retailer-admin/register-store`
  - Creates store in DRAFT status (not active)

- [ ] **RET-WEB-001-API-DOCS**: `POST /api/v1/retailer-admin/stores/:id/documents`

---

## D) Verification Proof

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Wizard flow | All steps completable |
| DRAFT status | Store created in DRAFT (not active) |
| No POS access | Cannot use SELL features |
| Field parity | Same fields as POS onboarding |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: YES**

### Files touched in retailer-admin:
- `retailer-admin/src/pages/RegisterPage.tsx` — Major rewrite (wizard)
- `retailer-admin/src/components/registration/` — NEW directory

---
---

# RET-WEB-002 — POS Device Activation via Code

**Category:** RETAILER DASHBOARD FLOW (SECONDARY)

**Scope:** Retailer Web + Backend

---

## Implement

- Retailer enters activation code shown on POS device
- Backend validates: code exists, not expired, unused
- Bind device to store
- Update store status → **ENROLLED**

---

## Acceptance

- [ ] Without valid code, activation blocked
- [ ] Code usable only once

---

## B) Implementation Subtickets (UI→API→DB)

### B.1) UI Subtickets

- [ ] **RET-WEB-002-UI-1**: Device Activation Page
  - File: `retailer-admin/src/pages/DeviceActivationPage.tsx` (NEW)
  - Route: `/devices/activate`

- [ ] **RET-WEB-002-UI-2**: Device Management Page
  - File: `retailer-admin/src/pages/DevicesPage.tsx` (NEW)
  - Route: `/devices`

### B.2) API Subtickets

- [ ] **RET-WEB-002-API-ACTIVATE**: `POST /api/v1/retailer-admin/activate-device`
- [ ] **RET-WEB-002-API-LIST**: `GET /api/v1/retailer-admin/devices`

---

## D) Verification Proof

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Code activation | Valid code binds device |
| Status transition | Store advances DRAFT → ENROLLED |
| Single use | Second attempt fails |
| Expired rejection | Expired codes rejected |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: YES**

### Files touched in retailer-admin:
- `retailer-admin/src/pages/DeviceActivationPage.tsx` — NEW
- `retailer-admin/src/pages/DevicesPage.tsx` — NEW

---
---

# RET-WEB-003 — Payments Setup on Web

**Category:** RETAILER DASHBOARD FLOW (SECONDARY)

**Scope:** Retailer Web + Backend

---

## Implement

- Collect UPI + bank details
- Update store status → `PAYMENTS_SUBMITTED`

---

## Acceptance

- [ ] Store status updated to PAYMENTS_SUBMITTED after payment details submission

---

## B) Implementation Subtickets (UI→API→DB)

### B.1) UI Subtickets

- [ ] **RET-WEB-003-UI-1**: Payments Setup Page
  - File: `retailer-admin/src/pages/PaymentsPage.tsx` (NEW)
  - Fields: UPI Address (mandatory), Bank Account Number, Bank IFSC Code

- [ ] **RET-WEB-003-UI-2**: UPI Validation Component
  - File: `retailer-admin/src/components/UpiInput.tsx` (NEW)

### B.2) API Subtickets

- [ ] **RET-WEB-003-API-SAVE**: `POST /api/v1/retailer-admin/stores/:id/payments`
- [ ] **RET-WEB-003-API-GET**: `GET /api/v1/retailer-admin/stores/:id/payments`

---

## D) Verification Proof

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| UPI validation | Invalid formats rejected |
| Status transition | KYC_SUBMITTED → PAYMENTS_SUBMITTED |
| Get details | Returns saved data (masked bank account) |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: YES**

### Files touched in retailer-admin:
- `retailer-admin/src/pages/PaymentsPage.tsx` — NEW
- `retailer-admin/src/components/UpiInput.tsx` — NEW

---
---

# KYC-001 — Unified Document Upload & Validation

**Category:** KYC & DOCUMENT HANDLING

**Scope:** POS + Retailer Web + Supplier Portal + Backend

---

## Implement

- Accept: camera capture, gallery upload
- Required docs enforced by entity type
- Store verification flags per document

---

## Acceptance

- [ ] Missing required docs blocks ACTIVE transition
- [ ] Admin can request re-upload

---

## B) Implementation Subtickets (UI→API→DB)

### B.1) UI Subtickets

- [ ] **KYC-001-POS-UI**: Document upload step in onboarding (POS)
- [ ] **KYC-001-RET-UI**: Document upload component (Retailer Dashboard)
- [ ] **KYC-001-ADMIN-UI**: Document review panel (SuperAdmin)

### B.2) API Subtickets

- [ ] **KYC-001-API-UPLOAD-STORE**: `POST /api/v1/stores/:id/documents`
- [ ] **KYC-001-API-VERIFY**: `PATCH /api/v1/admin/documents/:id/verify`

### B.3) DB/Migration Subtickets

- [ ] **KYC-001-DB-STORE**: `platform.store_documents` table (Migration: `072_store_documents.sql`)
- [ ] **KYC-001-DB-SUPPLIER**: `supplier.supplier_documents` table (Migration: `074_supplier_documents.sql`)

---

## D) Verification Proof

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Camera capture | POS can take photo |
| Admin verify | Can verify individual docs |
| Admin reject | Can reject with reason |
| ACTIVE gate | Cannot activate without all docs verified |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: YES**

### Files touched in retailer-admin:
- `retailer-admin/src/pages/DocumentsPage.tsx` — NEW
- `retailer-admin/src/components/DocumentUpload.tsx` — NEW

---
---

# ADMIN-001 — Retailer Application Review

**Category:** SUPERADMIN DASHBOARD

**Scope:** SuperAdmin UI + Backend

---

## Implement

- View full store application: details, documents, payments, device info
- Actions:
  - Approve → set **ACTIVE**
  - Reject → **NEEDS_FIX** (with reason)
  - Suspend

---

## Acceptance

- [ ] One-click activation
- [ ] Status instantly reflects in POS + Web

---

## B) Implementation Subtickets (UI→API→DB)

### B.1) UI Subtickets

- [ ] **ADMIN-001-UI-1**: Store Application Review Page
  - File: `supermandi-superadmin/src/components/StoreApplicationReview.tsx` (NEW)
  - Tabs: Details, Documents, Payments, Devices, Status History

- [ ] **ADMIN-001-UI-2**: Action buttons panel
  - "Approve" button → ACTIVE
  - "Reject" button → NEEDS_FIX with modal for reason

- [ ] **ADMIN-001-UI-3**: Pending applications queue
  - File: `supermandi-superadmin/src/components/PendingStoresQueue.tsx` (NEW)

### B.2) API Subtickets

- [ ] **ADMIN-001-API-GET**: `GET /api/v1/admin/stores/:id/application`
- [ ] **ADMIN-001-API-STATUS**: `PATCH /api/v1/admin/stores/:id/status`
- [ ] **ADMIN-001-API-QUEUE**: `GET /api/v1/admin/stores/pending`

---

## D) Verification Proof

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Pending queue | Shows correct count and list |
| One-click approve | Single click activates store |
| Rejection with reason | Must enter reason, stored correctly |
| Instant reflection | POS/Web sees status change immediately |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: NO**

---
---

# ADMIN-002 — Supplier Review & Activation

**Category:** SUPERADMIN DASHBOARD

**Scope:** SuperAdmin UI

---

## Implement

- View supplier KYC
- Approve / Reject / Suspend

---

## Acceptance

- [ ] Supplier portal unlocked only after ACTIVE

---

## B) Implementation Subtickets (UI→API→DB)

### B.1) UI Subtickets

- [ ] **ADMIN-002-UI-1**: Supplier KYC Review Page
  - File: `supermandi-superadmin/src/components/SupplierKYCReview.tsx` (NEW)
  - Sections: Business Details, Documents, Bank Details, Status History

- [ ] **ADMIN-002-UI-2**: Action buttons
  - "Verify" button → ACTIVE
  - "Reject" button → NEEDS_FIX with reason modal

### B.2) API Subtickets

- [ ] **ADMIN-002-API-STATUS**: `PATCH /api/v1/admin/suppliers/:id/verification-status`
- [ ] **ADMIN-002-API-KYC**: `GET /api/v1/admin/suppliers/:id/kyc`

---

## D) Verification Proof

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Pending queue | Lists KYC_SUBMITTED suppliers |
| Verify action | Status → ACTIVE |
| Reject action | Requires reason, stored correctly |
| Portal gating | Non-ACTIVE suppliers blocked |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: NO**

---
---

# SUP-001 — Supplier Registration + KYC

**Category:** SUPPLIER ONBOARDING

**Scope:** Supplier Portal + Backend

---

## Implement

- OTP login
- Supplier details + documents
- Status → `KYC_SUBMITTED`

---

## Acceptance

- [ ] Supplier sees "Pending verification"
- [ ] No portal features until ACTIVE

---

## B) Implementation Subtickets (UI→API→DB)

### B.1) UI Subtickets

- [ ] **SUP-001-UI-1**: OTP-first login page
  - File: `supplier-portal/src/app/(auth)/login/page.tsx` (MODIFY)

- [ ] **SUP-001-UI-2**: Registration with phone
  - File: `supplier-portal/src/app/(auth)/register/page.tsx` (MODIFY)
  - Steps: Phone OTP → Business details → Contact details

- [ ] **SUP-001-UI-3**: Enhanced pending-approval page
- [ ] **SUP-001-UI-4**: Feature gating in dashboard

### B.2) API Subtickets

- [ ] **SUP-001-API-OTP-REG**: `POST /api/v1/supplier/auth/register-otp`
- [ ] **SUP-001-API-OTP-LOGIN**: `POST /api/v1/supplier/auth/login-otp`

---

## D) Verification Proof

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| OTP registration | Can register with phone OTP |
| OTP login | Can login with phone OTP |
| Feature gating | Non-ACTIVE redirected to pending |
| Dashboard access | ACTIVE suppliers can access all features |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: NO**

---
---

# SEC-001 — State-Based Feature Gating

**Category:** ACCESS CONTROL (MANDATORY)

**Scope:** Backend (ALL APIs)

---

## Implement

- Every sensitive endpoint checks: store/supplier status
- POS/Web cannot bypass backend gating

---

## Acceptance

- [ ] Changing frontend alone cannot unlock features

---

## B) Implementation Subtickets (UI→API→DB)

### B.2) API Subtickets

#### B.2.1) Store Status Middleware
- [ ] **SEC-001-API-STORE-MW**: Create store status middleware
  - File: `backend/src/middleware/storeStatusGate.ts` (NEW)
  - Extracts store_id from JWT
  - If status ≠ ACTIVE: Returns 403

```typescript
// Example usage
router.post('/sales', storeStatusGate('ACTIVE'), salesController.create);
router.get('/products', storeStatusGate(['ACTIVE', 'PAYMENTS_SUBMITTED']), productController.list);
```

#### B.2.2) Supplier Status Middleware
- [ ] **SEC-001-API-SUPPLIER-MW**: Create supplier status middleware
  - File: `backend/src/middleware/supplierStatusGate.ts` (NEW)

#### B.2.3) Apply to POS Routes
- [ ] **SEC-001-API-POS**: BLOCKED (require ACTIVE): `POST /sales`, `POST /payments`, `GET /qr`
- [ ] ALLOWED: `GET /products`, `POST /products`, `GET /store`

#### B.2.6) Error Response Standard
```json
{
  "error": "STATUS_NOT_ALLOWED",
  "message": "Your store is not active. Current status: PAYMENTS_SUBMITTED",
  "status": "PAYMENTS_SUBMITTED",
  "required_status": "ACTIVE"
}
```

---

## D) Verification Proof

### D.1) Curl Proof

```bash
# POS - Non-ACTIVE store tries to create sale
curl -X POST https://supermandi.tech/api/v1/pos/sales \
  -H "Authorization: Bearer NON_ACTIVE_TOKEN" \
  -d '{"items": []}'
# Expected: 403 { "error": "STATUS_NOT_ALLOWED", "status": "PAYMENTS_SUBMITTED" }

# POS - Non-ACTIVE store CAN list products
curl -X GET https://supermandi.tech/api/v1/pos/products \
  -H "Authorization: Bearer NON_ACTIVE_TOKEN"
# Expected: 200 [...]
```

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| POS blocked | Non-ACTIVE store gets 403 on sales/payments |
| POS allowed | Non-ACTIVE store can manage products |
| Frontend bypass | Cannot bypass by modifying frontend |
| ACTIVE succeeds | All features work for ACTIVE entities |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: NO**

---
---

# COM-001 — Retailer Credentials Email

**Category:** COMMUNICATION

**Scope:** Backend

---

## Implement

- On store creation:
  - send email with user ID
  - temp password or set-password link
- Mention OTP as primary login

---

## Acceptance

- [ ] Email sent on store creation with credentials
- [ ] OTP mentioned as primary login method

---

## B) Implementation Subtickets (UI→API→DB)

### B.1) UI Subtickets

- [ ] **COM-001-RET-UI**: Set password page
  - File: `retailer-admin/src/pages/SetPasswordPage.tsx` (NEW)
  - Route: `/set-password?token=...`

### B.2) API Subtickets

- [ ] **COM-001-API-SVC**: Email service enhancement
  - File: `backend/src/services/email.ts`
  - Add `sendWelcomeEmail(store, user)` function

- [ ] **COM-001-API-TOKEN**: `POST /api/v1/retailer-admin/auth/set-password`
  - Request: `{ token: string, password: string }`

- [ ] **COM-001-API-TRIGGER**: Send email on store creation

### B.3) DB/Migration Subtickets

- [ ] **COM-001-DB**: Password set tokens table
  - Migration: `075_password_set_tokens.sql`
  ```sql
  CREATE TABLE IF NOT EXISTS auth.password_set_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```

---

## D) Verification Proof

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Email sent | Welcome email arrives within 1 minute |
| Email content | Contains store name, user ID, set-password link |
| OTP mentioned | Email says "Use phone for OTP login" |
| Token single-use | Same token cannot be reused |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: YES**

### Files touched in retailer-admin:
- `retailer-admin/src/pages/SetPasswordPage.tsx` — NEW

---
---

# POS-DEV-002 — Device Fingerprint Specification + Rotation Rules

**Category:** POS DEVICE ACTIVATION

**Scope:** POS App + Backend

---

## Why This Ticket

Activation codes depend on device identity; weak fingerprinting causes hijack or duplicates.

---

## Implement

- Define canonical `device_fingerprint` composition:
  - platform + hardware id + install id (stable but not easily spoofed)
- Rules:
  - reinstall/clear data should rotate install id but keep hardware id mapping
  - allow admin to revoke a device binding
- Add endpoint: "device status / binding"

---

## Acceptance

- [ ] Devices bind reliably
- [ ] Admin can revoke/replace device bindings

---

## B) Implementation Subtickets (UI→API→DB)

### B.1) UI Subtickets

- [ ] **POS-DEV-002-UI-1**: Device info display
  - File: `src/screens/SettingsScreen.tsx`
  - Show: Device ID, hardware ID, binding status
  - "Request Unbind" option for admin contact

### B.2) API Subtickets

- [ ] **POS-DEV-002-API-STATUS**: `GET /api/v1/pos/device-status`
  - Returns: device binding status, store info, last seen

- [ ] **POS-DEV-002-API-REVOKE**: `DELETE /api/v1/admin/devices/:id`
  - Admin endpoint to revoke device binding
  - Invalidates device token
  - Logs revocation reason

### B.3) DB/Migration Subtickets

- [ ] **POS-DEV-002-DB**: Device tracking enhancements
  - Migration: `076_device_tracking.sql`
  ```sql
  ALTER TABLE pos.pos_devices
  ADD COLUMN IF NOT EXISTS hardware_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS install_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS platform VARCHAR(50),
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_by UUID,
  ADD COLUMN IF NOT EXISTS revoke_reason TEXT;

  CREATE INDEX idx_pos_devices_hardware ON pos.pos_devices(hardware_id);
  ```

---

## D) Verification Proof

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Fingerprint stable | Same device gets same hardware_id across reinstalls |
| Install rotation | Reinstall changes install_id, keeps hardware_id |
| Admin revoke | Admin can unbind device, device sees "unbound" |
| Re-binding | Revoked device can re-bind with new code |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: NO**

---
---

# KYC-002 — "NEEDS_FIX" Resubmission Workflow

**Category:** KYC & DOCUMENT HANDLING

**Scope:** POS + Retailer Web + Supplier Portal + Backend

---

## Why This Ticket

If admin rejects, retailer/supplier must resubmit without creating duplicates.

---

## Implement

- Status transitions:
  - `NEEDS_FIX → KYC_SUBMITTED` (on resubmit)
- UI:
  - Show rejection reasons
  - Allow re-upload only for rejected docs

---

## Acceptance

- [ ] Rejected application can be fixed and approved end-to-end
- [ ] No duplicate stores/suppliers created on resubmission

---

## B) Implementation Subtickets (UI→API→DB)

### B.1) UI Subtickets

- [ ] **KYC-002-RET-UI**: Resubmission page (Retailer Dashboard)
  - File: `retailer-admin/src/pages/ResubmitPage.tsx` (NEW)
  - Show: rejection reasons per document
  - Only allow re-upload of rejected docs
  - "Resubmit" button advances to KYC_SUBMITTED

- [ ] **KYC-002-SUP-UI**: Resubmission page (Supplier Portal)
  - File: `supplier-portal/src/app/(dashboard)/resubmit/page.tsx` (NEW)
  - Same pattern as retailer

- [ ] **KYC-002-POS-UI**: Resubmission screen (POS)
  - File: `src/screens/ResubmitScreen.tsx` (NEW)
  - Show rejection reasons, allow re-upload

### B.2) API Subtickets

- [ ] **KYC-002-API-RESUBMIT-STORE**: `POST /api/v1/stores/:id/resubmit`
  - Validates: status = NEEDS_FIX
  - Accepts: updated documents
  - Transitions: NEEDS_FIX → KYC_SUBMITTED

- [ ] **KYC-002-API-RESUBMIT-SUPPLIER**: `POST /api/v1/supplier/resubmit`
  - Same pattern for suppliers

---

## D) Verification Proof

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Show reasons | User sees why each doc was rejected |
| Selective re-upload | Only rejected docs can be replaced |
| Status transition | NEEDS_FIX → KYC_SUBMITTED on resubmit |
| No duplicates | Same store/supplier record updated, not new |
| End-to-end | Rejected → Resubmit → Approved works |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: YES**

### Files touched in retailer-admin:
- `retailer-admin/src/pages/ResubmitPage.tsx` — NEW
- `retailer-admin/src/App.tsx` — Add route

---
---

# DOCS-001 — Document Storage Backend

**Category:** KYC & DOCUMENT HANDLING

**Scope:** Backend + All Portals

**CRITICAL PRIORITY** — Required for go-live

---

## Why This Ticket

KYC needs actual file persistence and retrieval for admin review. Cannot use "fake upload".

---

## Implement

- Choose storage: VM disk (short-term) or object storage (GCS/S3 preferred)
- Implement:
  - Upload API (multipart)
  - File scanning/size limits
  - Download/view API for SuperAdmin
  - Delete/replace documents
- Enforce max file size + content-type

---

## Acceptance

- [ ] Admin can open documents reliably from UI
- [ ] Files persist across container restarts
- [ ] Invalid file types rejected

---

## B) Implementation Subtickets (UI→API→DB)

### B.1) UI Subtickets

- [ ] **DOCS-001-ADMIN-UI**: Document viewer in SuperAdmin
  - File: `supermandi-superadmin/src/components/DocumentViewer.tsx` (NEW)
  - Click to open full-size
  - Download button
  - Zoom/pan support

### B.2) API Subtickets

- [ ] **DOCS-001-API-UPLOAD**: `POST /api/v1/documents/upload`
  - File: `backend/src/routes/v1/documents.ts` (NEW)
  - Multipart form-data
  - Validates: file size (max 10MB), content-type (image/*, application/pdf)
  - Stores to: `/var/supermandi/documents/{entity_type}/{entity_id}/{doc_type}_{timestamp}.{ext}`
  - Response: `{ document_id, file_url }`

- [ ] **DOCS-001-API-DOWNLOAD**: `GET /api/v1/documents/:id`
  - Auth required (owner or admin)
  - Streams file from storage
  - Sets proper content-type header

- [ ] **DOCS-001-API-DELETE**: `DELETE /api/v1/documents/:id`
  - Admin only
  - Soft delete (mark as deleted, don't remove file)

### B.3) DB/Migration Subtickets

- [ ] **DOCS-001-DB**: Documents metadata table
  - Migration: `077_documents_metadata.sql`
  ```sql
  CREATE TABLE IF NOT EXISTS platform.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(20) NOT NULL, -- 'store' or 'supplier'
    entity_id UUID NOT NULL,
    document_type VARCHAR(50) NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    original_filename VARCHAR(255),
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    uploaded_by UUID,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID
  );

  CREATE INDEX idx_documents_entity ON platform.documents(entity_type, entity_id);
  ```

---

## C) Deployment Subtickets (VM)

### Storage Setup:

```bash
# On VM (34.14.220.171)
sudo mkdir -p /var/supermandi/documents
sudo chown -R 1000:1000 /var/supermandi/documents
```

### Docker Volume:

```yaml
# docker-compose.prod.yml
services:
  main-backend:
    volumes:
      - /var/supermandi/documents:/app/documents
```

---

## D) Verification Proof

### D.1) Curl Proof

```bash
# Upload document
curl -X POST https://supermandi.tech/api/v1/documents/upload \
  -H "Authorization: Bearer TOKEN" \
  -F "entity_type=store" \
  -F "entity_id=STORE_ID" \
  -F "document_type=aadhaar" \
  -F "file=@/path/to/aadhaar.jpg"
# Expected: 201 { "document_id": "...", "file_url": "..." }

# Download document
curl -X GET https://supermandi.tech/api/v1/documents/DOC_ID \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -o downloaded.jpg
# Expected: File downloaded successfully
```

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Upload | File stored, metadata saved |
| Size limit | Files > 10MB rejected |
| Type validation | Non-image/PDF rejected |
| Download | Admin can retrieve file |
| Persistence | Files survive container restart |
| UI viewer | Admin can view docs in SuperAdmin |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: NO**

---
---

# SEC-002 — Token-to-Store Binding Enforcement

**Category:** ACCESS CONTROL (MANDATORY)

**Scope:** Backend (ALL APIs)

---

## Why This Ticket

"Store selection" + multi-store scenarios can leak data cross-store if not enforced.

---

## Implement

- JWT must include `store_id` and every query must filter by it
- No request should accept `store_id` from client body for protected operations
- Add integration tests for store isolation

---

## Acceptance

- [ ] Cannot access another store's data even with modified client

---

## B) Implementation Subtickets (UI→API→DB)

### B.2) API Subtickets

- [ ] **SEC-002-API-MW**: Store isolation middleware
  - File: `backend/src/middleware/storeIsolation.ts` (NEW)
  - Extracts store_id from JWT
  - Injects into request context
  - All DB queries MUST use this store_id

- [ ] **SEC-002-API-AUDIT**: Update all POS/Retailer endpoints
  - Remove any `store_id` from request body acceptance
  - Always use `req.storeId` from middleware

### B.3) Test Subtickets

- [ ] **SEC-002-TEST**: Store isolation integration tests
  - File: `backend/tests/integration/storeIsolation.test.ts` (NEW)
  - Test: Store A token cannot read Store B products
  - Test: Store A token cannot create sale in Store B
  - Test: Modified client with different store_id rejected

---

## D) Verification Proof

### D.1) Curl Proof

```bash
# Get Store A products with Store A token
curl -X GET https://supermandi.tech/api/v1/pos/products \
  -H "Authorization: Bearer STORE_A_TOKEN"
# Expected: 200 [Store A products only]

# Attempt to access Store B products with Store A token
curl -X POST https://supermandi.tech/api/v1/pos/products \
  -H "Authorization: Bearer STORE_A_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"store_id": "STORE_B_ID", "name": "Hack Product"}'
# Expected: store_id from body ignored, created in Store A
```

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Token binding | store_id always from JWT, never body |
| Query filtering | All queries scoped to token's store |
| Cross-store blocked | Cannot read/write other store data |
| Tests pass | Integration tests verify isolation |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: NO**

---
---

# DEDUP-001 — Duplicate Prevention Rules (Phone/GSTIN/UPI)

**Category:** DATA INTEGRITY

**Scope:** Backend

**CRITICAL PRIORITY** — Required for go-live

---

## Why This Ticket

Without dedupe you'll get duplicate stores/suppliers at scale.

---

## Implement

- Server-side uniqueness + soft checks:
  - Phone already linked → don't create new store, show "existing store found"
  - GSTIN duplicate → flag for admin review
  - UPI duplicate → flag
- Add "Potential duplicates" queue to SuperAdmin

---

## Acceptance

- [ ] Same phone cannot spawn multiple stores accidentally
- [ ] Duplicate GSTIN/UPI flagged for review

---

## B) Implementation Subtickets (UI→API→DB)

### B.1) UI Subtickets

- [ ] **DEDUP-001-ADMIN-UI**: Potential duplicates queue
  - File: `supermandi-superadmin/src/components/DuplicatesQueue.tsx` (NEW)
  - Show: flagged entries with reason
  - Actions: Merge, Mark as different, Reject

### B.2) API Subtickets

- [ ] **DEDUP-001-API-CHECK**: Pre-registration duplicate check
  - File: `backend/src/services/deduplication.ts` (NEW)
  - Check phone: if exists → return existing store
  - Check GSTIN: if exists → flag but allow (different owners possible)
  - Check UPI: if exists → flag for review

- [ ] **DEDUP-001-API-QUEUE**: `GET /api/v1/admin/duplicates`
  - Returns flagged potential duplicates
  - Filter by type (phone/gstin/upi)

### B.3) DB/Migration Subtickets

- [ ] **DEDUP-001-DB**: Duplicate flags table
  - Migration: `078_duplicate_flags.sql`
  ```sql
  CREATE TABLE IF NOT EXISTS platform.duplicate_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(20) NOT NULL,
    entity_id UUID NOT NULL,
    duplicate_type VARCHAR(20) NOT NULL, -- phone, gstin, upi
    duplicate_value VARCHAR(255) NOT NULL,
    matching_entity_id UUID,
    status VARCHAR(20) DEFAULT 'pending', -- pending, resolved, merged
    resolved_at TIMESTAMPTZ,
    resolved_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Unique constraints
  ALTER TABLE platform.stores ADD CONSTRAINT uk_stores_phone UNIQUE (owner_phone);
  ALTER TABLE supplier.suppliers ADD CONSTRAINT uk_suppliers_phone UNIQUE (phone);
  ```

---

## D) Verification Proof

### D.1) Curl Proof

```bash
# Register store with phone
curl -X POST https://supermandi.tech/api/v1/pos/register-store \
  -d '{"phone": "+919876543210", ...}'
# Expected: 201 { store_id: "..." }

# Try to register again with same phone
curl -X POST https://supermandi.tech/api/v1/pos/register-store \
  -d '{"phone": "+919876543210", ...}'
# Expected: 409 { "error": "PHONE_EXISTS", "existing_store_id": "..." }
```

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Phone unique | Same phone cannot create 2 stores |
| GSTIN flagged | Duplicate GSTIN creates flag |
| UPI flagged | Duplicate UPI creates flag |
| Admin queue | SuperAdmin sees flagged entries |
| Resolution | Admin can resolve duplicates |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: NO**

---
---

# FLOW-001 — Retailer Web Entry: "Requires POS Activation Code" Hard Gate

**Category:** FLOW CONTROL

**Scope:** Retailer Web + Backend

---

## Why This Ticket

Web onboarding is secondary; must not create ghost stores. Store remains unusable until device code entered.

---

## Implement

- In web: store remains unusable until device code entered
- Add UX: "You need POS device code to activate"

---

## Acceptance

- [ ] Web cannot reach ACTIVE without a device bound

---

## B) Implementation Subtickets (UI→API→DB)

### B.1) UI Subtickets

- [ ] **FLOW-001-RET-UI**: Device required banner
  - File: `retailer-admin/src/components/DeviceRequiredBanner.tsx` (NEW)
  - Show on dashboard if store status = DRAFT
  - Message: "Your store is incomplete. Please activate a POS device to continue."
  - Link to device activation page

- [ ] **FLOW-001-RET-UI-2**: Block access without device
  - File: `retailer-admin/src/lib/auth.tsx`
  - If status = DRAFT and device_bound = false:
    - Redirect to device activation page
    - Cannot access dashboard features

### B.2) API Subtickets

- [ ] **FLOW-001-API-GATE**: Enforce device_bound for progression
  - File: `backend/src/services/storeStateMachine.ts`
  - Cannot advance past DRAFT without device_bound = true
  - Return clear error: "Device binding required"

---

## D) Verification Proof

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| DRAFT blocked | Web user sees device required message |
| No bypass | Cannot skip to KYC without device |
| With device | After device bound, can proceed |
| Clear UX | User understands what's needed |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: YES**

### Files touched in retailer-admin:
- `retailer-admin/src/components/DeviceRequiredBanner.tsx` — NEW
- `retailer-admin/src/lib/auth.tsx` — Add device check

---
---

# PAY-001 — Payments Data Validation (UPI format, bank masking, edit rules)

**Category:** PAYMENTS

**Scope:** Backend + All Portals

---

## Why This Ticket

UPI is required for activation; must be validated properly.

---

## Implement

- UPI validation (basic format + length)
- Bank details masking on reads
- Edit history for UPI changes (audit)

---

## Acceptance

- [ ] Invalid UPI rejected
- [ ] Admin sees UPI history

---

## B) Implementation Subtickets (UI→API→DB)

### B.2) API Subtickets

- [ ] **PAY-001-API-VALIDATE**: UPI validation service
  - File: `backend/src/services/paymentValidation.ts` (NEW)
  - UPI format: `^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$`
  - Length: 5-50 characters
  - Common VPA suffixes: @upi, @paytm, @gpay, @ybl, etc.

- [ ] **PAY-001-API-MASK**: Bank masking helper
  - File: `backend/src/utils/masking.ts` (NEW)
  - Account: Show last 4 digits only (******7890)
  - IFSC: Show full (public info)

- [ ] **PAY-001-API-HISTORY**: `GET /api/v1/admin/stores/:id/upi-history`
  - Returns all UPI changes with timestamps
  - Who changed, old value, new value

### B.3) DB/Migration Subtickets

- [ ] **PAY-001-DB**: UPI change history
  - Migration: `079_upi_change_history.sql`
  ```sql
  CREATE TABLE IF NOT EXISTS platform.upi_change_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES platform.stores(id),
    old_upi VARCHAR(100),
    new_upi VARCHAR(100) NOT NULL,
    changed_by UUID,
    changed_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```

---

## D) Verification Proof

### D.1) Curl Proof

```bash
# Valid UPI
curl -X POST .../payments -d '{"upi_address": "store@upi"}'
# Expected: 200

# Invalid UPI
curl -X POST .../payments -d '{"upi_address": "invalid upi"}'
# Expected: 400 { "error": "Invalid UPI format" }

# Get masked bank details
curl -X GET .../payments
# Expected: { "bank_account": "******7890", ... }
```

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| UPI validation | Invalid formats rejected |
| Bank masking | Account number masked in responses |
| Edit history | Changes logged with timestamp |
| Admin view | Admin can see full UPI history |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: NO**

---
---

# AUDIT-001 — Status Audit Logs + Admin History UI

**Category:** AUDIT

**Scope:** Backend + SuperAdmin

---

## Why This Ticket

At scale you need "who changed what, when, why".

---

## Implement

- Audit tables for:
  - Store status changes
  - Supplier status changes
  - Document verify/reject events
  - Device bind/unbind events
- SuperAdmin UI tab "History"

---

## Acceptance

- [ ] Every critical action recorded + visible

---

## B) Implementation Subtickets (UI→API→DB)

### B.1) UI Subtickets

- [ ] **AUDIT-001-ADMIN-UI**: History tab in SuperAdmin
  - File: `supermandi-superadmin/src/components/AuditHistory.tsx` (NEW)
  - Filters: entity type, action type, date range, admin
  - Columns: timestamp, entity, action, old_value, new_value, admin, reason

### B.2) API Subtickets

- [ ] **AUDIT-001-API-LOG**: Audit logging service
  - File: `backend/src/services/auditLog.ts` (NEW)
  - `logAudit(entity_type, entity_id, action, old_value, new_value, actor_id, reason)`
  - Called from all status change, document, device endpoints

- [ ] **AUDIT-001-API-QUERY**: `GET /api/v1/admin/audit`
  - Paginated audit log query
  - Filters: entity_type, action, date_from, date_to

### B.3) DB/Migration Subtickets

- [ ] **AUDIT-001-DB**: Unified audit log table
  - Migration: `080_audit_log.sql`
  ```sql
  CREATE TABLE IF NOT EXISTS platform.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    old_value JSONB,
    new_value JSONB,
    actor_id UUID,
    actor_type VARCHAR(20), -- admin, system, user
    reason TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX idx_audit_log_entity ON platform.audit_log(entity_type, entity_id);
  CREATE INDEX idx_audit_log_created ON platform.audit_log(created_at);
  ```

---

## D) Verification Proof

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Status logged | Store/supplier status changes recorded |
| Documents logged | Verify/reject events recorded |
| Devices logged | Bind/unbind events recorded |
| UI visible | SuperAdmin can view history |
| Queryable | Can filter by entity, date, action |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: NO**

---
---

# OPS-001 — VM Deployment Contract & Correct Build Targets

**Category:** OPERATIONS

**Scope:** All Services

**CRITICAL PRIORITY** — Prevents deployment mistakes

---

## Why This Ticket

Claude previously deployed wrong parts (missed retailer dashboard). Need strict "what gets rebuilt" matrix per change + version proof.

---

## Implement

- For each ticket: list affected services (`nginx`, `api-gateway`, `main-backend`, `retailer-admin`, `supplier-portal`, `pos app`) and **only rebuild those**
- Add "Proof of deployment" section:
  - `docker images | grep supermandi`
  - `docker ps`
  - `/health` showing git SHA/version for each service

---

## Acceptance

- [ ] Every deploy includes SHA proof + service list

---

## B) Implementation Subtickets

### B.1) Service Version Endpoints

- [ ] **OPS-001-API-VERSION**: Add version to all health endpoints
  - All services return: `{ version, git_sha, build_time }`
  - Inject at build time via env vars

### B.2) Deployment Matrix

| Ticket | nginx | api-gateway | main-backend | retailer-admin | supplier-portal | pos-app |
|--------|-------|-------------|--------------|----------------|-----------------|---------|
| AUTH-001 | NO | NO | YES | YES | YES | NO |
| CORE-001 | NO | NO | YES | YES | NO | NO |
| CORE-002 | NO | NO | YES | NO | YES | NO |
| POS-DEV-001 | NO | YES | YES | YES | NO | YES |
| RET-POS-001 | NO | YES | YES | NO | NO | YES |
| RET-POS-002 | NO | NO | YES | NO | NO | YES |
| RET-WEB-001 | NO | NO | YES | YES | NO | NO |
| RET-WEB-002 | NO | YES | YES | YES | NO | NO |
| RET-WEB-003 | NO | YES | YES | YES | NO | NO |
| KYC-001 | NO | YES | YES | YES | YES | YES |
| ADMIN-001 | NO | NO | YES | NO | NO | NO |
| ADMIN-002 | NO | NO | YES | NO | NO | NO |
| SUP-001 | NO | YES | YES | NO | YES | NO |
| SEC-001 | NO | NO | YES | NO | NO | NO |
| COM-001 | NO | NO | YES | YES | NO | NO |

### B.3) Deployment Proof Template

```bash
# After every deployment, run:
echo "=== DEPLOYMENT PROOF ==="
date
git rev-parse HEAD
docker images | grep supermandi
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
curl -s https://supermandi.tech/api/health | jq
curl -s https://supermandi.tech/retailer/health | jq
curl -s https://supermandi.tech/supplier/health | jq
```

---

## D) Verification Proof

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Version in health | All services return git SHA |
| Deployment logged | Each deploy includes proof |
| Matrix followed | Only affected services rebuilt |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: YES**

### Files touched in retailer-admin:
- Add `/health` endpoint or page showing version

---
---

# ENV-001 — Build-time ENV Injection for Portals (No runtime surprises)

**Category:** OPERATIONS

**Scope:** retailer-admin + supplier-portal

---

## Why This Ticket

Next.js/React builds break if env not injected at build time.

---

## Implement

- Standardize `NEXT_PUBLIC_API_BASE_URL` / `VITE_API_BASE_URL` injection per portal
- Add a UI "Config Health" page or banner: shows API base URL + auth provider configured

---

## Acceptance

- [ ] Portals never show "API_BASE_URL not configured"

---

## B) Implementation Subtickets

### B.1) UI Subtickets

- [ ] **ENV-001-RET-UI**: Config health indicator
  - File: `retailer-admin/src/components/ConfigHealth.tsx` (NEW)
  - Shows: API URL, Firebase configured, version
  - In dev: shows banner if misconfigured

- [ ] **ENV-001-SUP-UI**: Same for supplier portal

### B.2) Build Configuration

```bash
# retailer-admin (Vite)
VITE_API_BASE_URL=https://supermandi.tech/api npm run build

# supplier-portal (Next.js)
NEXT_PUBLIC_API_BASE_URL=https://supermandi.tech/api npm run build
```

### B.3) Docker Build Args

```dockerfile
# retailer-admin Dockerfile
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build
```

---

## D) Verification Proof

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Build injects URL | Built portal has correct API URL |
| No runtime error | Portal loads without "not configured" |
| Health visible | Config health shows correct values |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: YES**

### Files touched in retailer-admin:
- `retailer-admin/src/components/ConfigHealth.tsx` — NEW
- `retailer-admin/Dockerfile` — Add build args

---
---

# GW-001 — API Gateway Route Coverage Audit

**Category:** OPERATIONS

**Scope:** api-gateway

**CRITICAL PRIORITY** — Prevents 404/timeout issues

---

## Why This Ticket

Multiple times `/api/v1/...` returned 404/timeout because gateway didn't proxy/whitelist.

---

## Implement

- A script/test that enumerates required routes and checks gateway proxy rules
- Add all auth routes to public whitelist intentionally (not accidentally blocked)

---

## Acceptance

- [ ] All required endpoints return correct status (400/401) not 404/timeout

---

## B) Implementation Subtickets

### B.1) Route Audit Script

- [ ] **GW-001-SCRIPT**: Gateway route checker
  - File: `scripts/check_gateway_routes.sh` (NEW)
  ```bash
  #!/bin/bash
  ROUTES=(
    "POST /api/v1/retailer-admin/auth/firebase-login"
    "POST /api/v1/supplier/auth/login"
    "POST /api/v1/supplier/auth/register"
    "GET /api/v1/pos/products"
    "POST /api/v1/pos/sales"
    # ... all routes
  )

  for route in "${ROUTES[@]}"; do
    METHOD=$(echo $route | cut -d' ' -f1)
    PATH=$(echo $route | cut -d' ' -f2)
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X $METHOD https://supermandi.tech$PATH)
    if [ "$STATUS" = "404" ] || [ "$STATUS" = "502" ]; then
      echo "FAIL: $route returned $STATUS"
    else
      echo "PASS: $route returned $STATUS"
    fi
  done
  ```

### B.2) Public Routes Whitelist

Required public routes (no auth):
- `POST /api/v1/retailer-admin/auth/firebase-login`
- `POST /api/v1/supplier/auth/login`
- `POST /api/v1/supplier/auth/register`
- `POST /api/v1/pos/generate-activation-code`
- `GET /api/health`

---

## D) Verification Proof

### D.1) Curl Proof

```bash
# Auth endpoint should return 400 (bad request) not 404
curl -X POST https://supermandi.tech/api/v1/retailer-admin/auth/firebase-login \
  -H "Content-Type: application/json" \
  -d '{}'
# Expected: 400 (missing fields) NOT 404/502

# Protected endpoint should return 401 not 404
curl -X GET https://supermandi.tech/api/v1/pos/products
# Expected: 401 (unauthorized) NOT 404/502
```

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Public routes | Return 400/401, not 404 |
| Protected routes | Return 401, not 404 |
| Script passes | All routes return expected status |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: NO**

---
---

# OBS-001 — Production Monitoring & Alert Baseline

**Category:** OPERATIONS

**Scope:** All Services

---

## Why This Ticket

Timeouts/401/404 will happen; you need quick detection.

---

## Implement

- Health endpoints for each service with version + dependencies
- Log correlation id
- Basic alert rules (timeouts, 5xx spikes)

---

## Acceptance

- [ ] Issues detectable without manual guessing

---

## B) Implementation Subtickets

### B.1) Health Endpoints

- [ ] **OBS-001-API-HEALTH**: Enhanced health endpoints
  - All services: `GET /health`
  - Returns:
    ```json
    {
      "status": "healthy|degraded|unhealthy",
      "version": "1.0.0",
      "git_sha": "abc123",
      "dependencies": {
        "database": "healthy",
        "redis": "healthy",
        "firebase": "healthy"
      },
      "uptime": 123456
    }
    ```

### B.2) Log Correlation

- [ ] **OBS-001-LOG-CORRELATION**: Request ID middleware
  - File: `backend/src/middleware/requestId.ts` (NEW)
  - Generate UUID for each request
  - Include in all logs
  - Return in response header: `X-Request-ID`

### B.3) Monitoring Script

- [ ] **OBS-001-MONITOR**: Basic monitoring script
  - File: `scripts/monitor.sh`
  - Check all health endpoints every minute
  - Alert on: unhealthy, 5xx response, timeout > 5s

---

## D) Verification Proof

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Health endpoints | All services respond |
| Dependencies shown | Health shows DB/Redis status |
| Correlation ID | Requests have X-Request-ID |
| Alerts work | Failures trigger notification |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: NO**

---
---

# QA-001 — Smoke Test Script (One command)

**Category:** QA

**Scope:** All Services

---

## Why This Ticket

Human-only testing misses regressions.

---

## Implement

- `scripts/go_live_smoke.sh` that runs:
  - Portal GET checks
  - Key auth endpoints return 400 not 404/timeout
  - Gateway proxy checks
  - Status gate checks

---

## Acceptance

- [ ] One command outputs PASS/FAIL

---

## B) Implementation Subtickets

### B.1) Smoke Test Script

- [ ] **QA-001-SCRIPT**: Smoke test script
  - File: `scripts/go_live_smoke.sh` (NEW)
  ```bash
  #!/bin/bash
  set -e

  BASE_URL=${1:-"https://supermandi.tech"}
  PASS=0
  FAIL=0

  check() {
    local name=$1
    local method=$2
    local url=$3
    local expected=$4

    status=$(curl -s -o /dev/null -w "%{http_code}" -X $method "$BASE_URL$url")
    if [[ "$status" =~ $expected ]]; then
      echo "✓ PASS: $name ($status)"
      ((PASS++))
    else
      echo "✗ FAIL: $name - expected $expected, got $status"
      ((FAIL++))
    fi
  }

  echo "=== SUPERMANDI SMOKE TEST ==="
  echo "Target: $BASE_URL"
  echo ""

  # Portal checks
  check "Retailer portal" GET "/retailer/" "200"
  check "Supplier portal" GET "/supplier/" "200"
  check "Admin portal" GET "/admin/" "200"

  # API health
  check "API health" GET "/api/health" "200"

  # Auth endpoints (should return 400, not 404)
  check "Retailer auth" POST "/api/v1/retailer-admin/auth/firebase-login" "400"
  check "Supplier auth" POST "/api/v1/supplier/auth/login" "400"

  # Protected endpoints (should return 401, not 404)
  check "POS products (unauth)" GET "/api/v1/pos/products" "401"

  echo ""
  echo "=== RESULTS ==="
  echo "PASS: $PASS"
  echo "FAIL: $FAIL"

  if [ $FAIL -gt 0 ]; then
    exit 1
  fi
  ```

---

## D) Verification Proof

### D.1) Run Smoke Test

```bash
./scripts/go_live_smoke.sh
# Expected: All checks PASS

./scripts/go_live_smoke.sh https://staging.supermandi.tech
# Can test different environments
```

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Script runs | No errors |
| Portals accessible | 200 response |
| Auth endpoints | 400 (not 404) |
| Protected routes | 401 (not 404) |
| Exit code | 0 if all pass, 1 if any fail |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: NO**

---
---

# GL-001 — End-to-End Real User Test

**Category:** GO-LIVE VALIDATION

**Claude must perform & record**

---

## Retailer POS

1. Install POS
2. Complete onboarding
3. Verify LIMITED MODE
4. Admin approves
5. SELL unlocked

---

## Retailer Web

1. Register store
2. Enter POS activation code
3. Complete payments
4. Await approval

---

## Supplier

1. Register
2. Upload docs
3. Admin activates
4. Portal usable

---

## Acceptance

- [ ] All flows work exactly as per plan
- [ ] No dead ends
- [ ] No duplicate stores

---

## Prerequisites

All other tickets must be completed:

**Core Tickets:**
- AUTH-001 ✓ OTP-First Authentication
- CORE-001 ✓ Store State Machine
- CORE-002 ✓ Supplier State Machine
- POS-DEV-001 ✓ Device Activation Code
- POS-DEV-002 ✓ Device Fingerprint Spec
- RET-POS-001 ✓ POS Onboarding
- RET-POS-002 ✓ LIMITED MODE
- RET-WEB-001 ✓ Web Registration
- RET-WEB-002 ✓ Device Activation
- RET-WEB-003 ✓ Payments Setup
- KYC-001 ✓ Document Upload
- KYC-002 ✓ Resubmission Workflow
- DOCS-001 ✓ Document Storage
- ADMIN-001 ✓ Retailer Review
- ADMIN-002 ✓ Supplier Review
- SUP-001 ✓ Supplier Registration
- SEC-001 ✓ Feature Gating
- SEC-002 ✓ Token Binding
- COM-001 ✓ Credentials Email

**Data Integrity:**
- DEDUP-001 ✓ Duplicate Prevention
- FLOW-001 ✓ Web Hard Gate
- PAY-001 ✓ Payments Validation
- AUDIT-001 ✓ Audit Logs

**Operations:**
- OPS-001 ✓ Deployment Contract
- ENV-001 ✓ ENV Injection
- GW-001 ✓ Gateway Coverage
- OBS-001 ✓ Monitoring
- QA-001 ✓ Smoke Tests

---

## B) Test Scenarios

### B.1) Retailer POS Flow Test

1. **Install POS on fresh device** - See onboarding wizard
2. **Complete Step 1** - Store Details, OTP
3. **Complete Step 2** - Documents
4. **Complete Step 3** - Payments
5. **Verify LIMITED MODE** - SELL locked, Products works
6. **Admin Approval** - SuperAdmin approves
7. **SELL Unlocked** - All features work

### B.2) Retailer Web Flow Test

1. **Register store on web** - Store in DRAFT
2. **Generate activation code on POS** - SM-XXXX-XX format
3. **Enter code on web** - Device bound, store → ENROLLED
4. **Complete KYC on web** - Status → KYC_SUBMITTED
5. **Complete payments on web** - Status → PAYMENTS_SUBMITTED
6. **Admin approval** - Status → ACTIVE
7. **POS now functional**

### B.3) Supplier Flow Test

1. **Register with OTP** - Phone OTP
2. **See pending status** - Pending-approval page
3. **Upload documents**
4. **Admin reviews** - Clicks Verify
5. **Portal unlocked** - Dashboard accessible

---

## C) Deployment Verification

```bash
# 1. Verify all services running
docker compose -f docker-compose.prod.yml ps

# 2. Verify portal accessibility
curl -s https://supermandi.tech/retailer/ | head -5
curl -s https://supermandi.tech/supplier/ | head -5
curl -s https://supermandi.tech/admin/ | head -5

# 3. Verify API health
curl -s https://supermandi.tech/api/health
```

---

## D) Database Verification

```sql
-- Verify store state
SELECT id, name, status, device_bound, kyc_complete, upi_complete, admin_approved
FROM platform.stores WHERE name = 'Test Store';

-- Verify supplier state
SELECT id, business_name, verification_status
FROM supplier.suppliers WHERE business_name = 'Test Supplier';

-- Verify no duplicate stores
SELECT phone, COUNT(*) FROM platform.stores GROUP BY phone HAVING COUNT(*) > 1;
-- Expected: 0 rows
```

---

## D.5) Pass/Fail Criteria

| Flow | Pass Criteria |
|------|---------------|
| **Retailer POS** | |
| Onboarding | All 3 steps complete without error |
| LIMITED MODE | SELL blocked, Products allowed |
| Approval | One-click activates store |
| **Retailer Web** | |
| Registration | Store created in DRAFT |
| Device binding | Activation code works |
| **Supplier** | |
| OTP registration | Phone OTP works |
| Feature gating | Dashboard blocked until ACTIVE |
| **General** | |
| No dead ends | Every flow reaches completion |
| No duplicates | Same phone cannot create multiple stores |
| Instant reflection | Status changes visible immediately |

---

## Critical Priority Tickets (MUST COMPLETE FIRST)

The following tickets are **most likely to destroy go-live** if not completed:

1. **DOCS-001** — Real document storage (KYC cannot work without it)
2. **DEDUP-001** — Duplicate prevention (will create data mess at scale)
3. **GW-001 + OPS-001** — Deployment correctness + gateway coverage (prevents 404/timeout disasters)

---

## VM Deployment Batches (29 Tickets → 9 Batches)

Deploy tickets in order. Each batch should be deployed fully before starting the next. Run migrations once per batch, rebuild only affected services.

### VM Access Details (Use before each batch)

**GCloud SSH (Recommended):**
```bash
gcloud compute ssh \
  --zone "asia-south1-a" \
  "supermandi-backend-vm" \
  --project "supermandi-backend"
```

**Direct SSH:**
```bash
ssh claude@34.14.220.171
```

**Alternative VM (if needed):**
```bash
ssh supermanditech@34.14.150.183
# Password: Supermandi@123
```

**Get Current External IP:**
```bash
curl -s -H "Metadata-Flavor: Google" \
  http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip
```

---

### Deployment Matrix Summary

| Service | Rebuild Command |
|---------|-----------------|
| **main-backend** | `docker compose -f docker-compose.prod.yml up -d --build main-backend` |
| **api-gateway** | `docker compose -f docker-compose.prod.yml up -d --build api-gateway` |
| **retailer-admin** | `cd /opt/supermandi/retailer-admin && npm run build && cp -r dist/* /var/www/retailer-admin/` |
| **supplier-portal** | `cd /opt/supermandi/supplier-portal && npm run build` |
| **supermandi-superadmin** | `cd /opt/supermandi/supermandi-superadmin && npm run build && cp -r dist/* /var/www/supermandi-superadmin/` |
| **pos-app** | Expo build + app store submission (separate process) |

---

### BATCH 0: Infrastructure & Foundation
**Deploy First — Everything depends on this**

| Ticket | Title | Services to Rebuild |
|--------|-------|---------------------|
| CORE-001 | Store State Machine | main-backend |
| CORE-002 | Supplier State Machine | main-backend |
| OPS-001 | VM Deployment Contract | main-backend, retailer-admin, supplier-portal |
| ENV-001 | Build-time ENV Injection | retailer-admin, supplier-portal |
| GW-001 | API Gateway Route Coverage | api-gateway |

**Migrations:** `064_store_status_enum.sql`, `065_store_readiness_flags.sql`, `066_store_status_audit.sql`, `067_supplier_status_enum.sql`

**🔐 SSH into VM first:**
```bash
gcloud compute ssh --zone "asia-south1-a" "supermandi-backend-vm" --project "supermandi-backend"
# OR: ssh claude@34.14.220.171
```

**Deploy Commands:**
```bash
cd /opt/supermandi

# 1. BACKUP DATABASE
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U supermandi supermandi > backup_batch0_$(date +%Y%m%d).sql

# 2. Run all Batch 0 migrations
docker compose -f docker-compose.prod.yml exec main-backend node scripts/migrate-prod.js

# 3. Rebuild services
docker compose -f docker-compose.prod.yml up -d --build main-backend api-gateway

# 4. Rebuild portals with ENV injection
cd /opt/supermandi/retailer-admin
VITE_API_BASE_URL=https://supermandi.tech/api npm run build
cp -r dist/* /var/www/retailer-admin/

cd /opt/supermandi/supplier-portal
NEXT_PUBLIC_API_BASE_URL=https://supermandi.tech/api npm run build
```

---

### BATCH 1: Authentication & Security
**Core auth + security gating**

| Ticket | Title | Services to Rebuild |
|--------|-------|---------------------|
| AUTH-001 | OTP-First Authentication | main-backend, retailer-admin, supplier-portal |
| SEC-001 | State-Based Feature Gating | main-backend |
| SEC-002 | Token-to-Store Binding | main-backend |

**Migrations:** `064_supplier_phone_column.sql`, `065_supplier_firebase_uid.sql`

**🔐 SSH into VM first:**
```bash
gcloud compute ssh --zone "asia-south1-a" "supermandi-backend-vm" --project "supermandi-backend"
# OR: ssh claude@34.14.220.171
```

**Deploy Commands:**
```bash
cd /opt/supermandi

# 1. Run migrations
docker compose -f docker-compose.prod.yml exec main-backend node scripts/migrate-prod.js

# 2. Rebuild backend
docker compose -f docker-compose.prod.yml up -d --build main-backend

# 3. Rebuild portals
cd /opt/supermandi/retailer-admin && npm run build && cp -r dist/* /var/www/retailer-admin/
cd /opt/supermandi/supplier-portal && npm run build
```

---

### BATCH 2: Document Storage (CRITICAL)
**Must deploy before KYC — KYC cannot work without document storage**

| Ticket | Title | Services to Rebuild |
|--------|-------|---------------------|
| DOCS-001 | Document Storage Backend | main-backend, api-gateway |

**Pre-requisites:**
- GCS bucket or S3 bucket configured
- IAM permissions set
- CORS configured for direct uploads

**🔐 SSH into VM first:**
```bash
gcloud compute ssh --zone "asia-south1-a" "supermandi-backend-vm" --project "supermandi-backend"
# OR: ssh claude@34.14.220.171
```

**Deploy Commands:**
```bash
cd /opt/supermandi

# 1. Rebuild with storage config
docker compose -f docker-compose.prod.yml up -d --build main-backend api-gateway
```

---

### BATCH 3: POS Device Layer
**Device activation + onboarding — requires POS app update**

| Ticket | Title | Services to Rebuild |
|--------|-------|---------------------|
| POS-DEV-001 | Device Activation Code | main-backend, api-gateway, retailer-admin, **pos-app** |
| POS-DEV-002 | Device Fingerprint Spec | main-backend, **pos-app** |
| RET-POS-001 | POS Onboarding Wizard | main-backend, api-gateway, **pos-app** |
| RET-POS-002 | LIMITED MODE Enforcement | main-backend, **pos-app** |

**Migrations:** `068_activation_codes.sql`, `069_device_fingerprints.sql`, `072_store_documents.sql`, `073_store_payment_details.sql`

**🔐 SSH into VM first:**
```bash
gcloud compute ssh --zone "asia-south1-a" "supermandi-backend-vm" --project "supermandi-backend"
# OR: ssh claude@34.14.220.171
```

**Deploy Commands:**
```bash
cd /opt/supermandi

# 1. Run migrations
docker compose -f docker-compose.prod.yml exec main-backend node scripts/migrate-prod.js

# 2. Rebuild backend + gateway
docker compose -f docker-compose.prod.yml up -d --build main-backend api-gateway

# 3. Rebuild retailer-admin
cd /opt/supermandi/retailer-admin && npm run build && cp -r dist/* /var/www/retailer-admin/

# 4. POS App (separate process)
# Build Expo app and submit to app stores
```

---

### BATCH 4: KYC & Documents
**Document upload + verification flow**

| Ticket | Title | Services to Rebuild |
|--------|-------|---------------------|
| KYC-001 | Document Upload & Validation | main-backend, api-gateway, retailer-admin, supplier-portal, **pos-app** |
| KYC-002 | NEEDS_FIX Resubmission | main-backend, retailer-admin, supplier-portal |

**Migrations:** `074_supplier_documents.sql`

**🔐 SSH into VM first:**
```bash
gcloud compute ssh --zone "asia-south1-a" "supermandi-backend-vm" --project "supermandi-backend"
# OR: ssh claude@34.14.220.171
```

**Deploy Commands:**
```bash
cd /opt/supermandi

# 1. Run migrations
docker compose -f docker-compose.prod.yml exec main-backend node scripts/migrate-prod.js

# 2. Rebuild all
docker compose -f docker-compose.prod.yml up -d --build main-backend api-gateway

# 3. Rebuild all portals
cd /opt/supermandi/retailer-admin && npm run build && cp -r dist/* /var/www/retailer-admin/
cd /opt/supermandi/supplier-portal && npm run build
```

---

### BATCH 5: Retailer Web Flow
**Web registration + device binding + payments**

| Ticket | Title | Services to Rebuild |
|--------|-------|---------------------|
| RET-WEB-001 | Web Store Registration | main-backend, retailer-admin |
| RET-WEB-002 | Device Activation via Code | main-backend, api-gateway, retailer-admin |
| RET-WEB-003 | Payments Setup | main-backend, api-gateway, retailer-admin |
| FLOW-001 | Web Requires POS Activation | main-backend, retailer-admin |
| PAY-001 | Payments Data Validation | main-backend |
| DEDUP-001 | Duplicate Prevention | main-backend |

**🔐 SSH into VM first:**
```bash
gcloud compute ssh --zone "asia-south1-a" "supermandi-backend-vm" --project "supermandi-backend"
# OR: ssh claude@34.14.220.171
```

**Deploy Commands:**
```bash
cd /opt/supermandi

# 1. Rebuild backend + gateway
docker compose -f docker-compose.prod.yml up -d --build main-backend api-gateway

# 2. Rebuild retailer-admin
cd /opt/supermandi/retailer-admin && npm run build && cp -r dist/* /var/www/retailer-admin/
```

---

### BATCH 6: Supplier Flow
**Supplier registration + KYC**

| Ticket | Title | Services to Rebuild |
|--------|-------|---------------------|
| SUP-001 | Supplier Registration + KYC | main-backend, api-gateway, supplier-portal |

**🔐 SSH into VM first:**
```bash
gcloud compute ssh --zone "asia-south1-a" "supermandi-backend-vm" --project "supermandi-backend"
# OR: ssh claude@34.14.220.171
```

**Deploy Commands:**
```bash
cd /opt/supermandi

# 1. Rebuild backend + gateway
docker compose -f docker-compose.prod.yml up -d --build main-backend api-gateway

# 2. Rebuild supplier portal
cd /opt/supermandi/supplier-portal && npm run build
```

---

### BATCH 7: SuperAdmin + Audit
**Admin review + audit logging**

| Ticket | Title | Services to Rebuild |
|--------|-------|---------------------|
| ADMIN-001 | Retailer Application Review | main-backend, supermandi-superadmin |
| ADMIN-002 | Supplier Review & Activation | main-backend, supermandi-superadmin |
| AUDIT-001 | Status Audit Logs + Admin UI | main-backend, supermandi-superadmin |
| COM-001 | Retailer Credentials Email | main-backend, retailer-admin |

**🔐 SSH into VM first:**
```bash
gcloud compute ssh --zone "asia-south1-a" "supermandi-backend-vm" --project "supermandi-backend"
# OR: ssh claude@34.14.220.171
```

**Deploy Commands:**
```bash
cd /opt/supermandi

# 1. Rebuild backend
docker compose -f docker-compose.prod.yml up -d --build main-backend

# 2. Rebuild SuperAdmin
cd /opt/supermandi/supermandi-superadmin && npm run build && cp -r dist/* /var/www/supermandi-superadmin/

# 3. Rebuild retailer-admin (for COM-001)
cd /opt/supermandi/retailer-admin && npm run build && cp -r dist/* /var/www/retailer-admin/
```

---

### BATCH 8: Monitoring & QA
**Production monitoring + smoke tests**

| Ticket | Title | Services to Rebuild |
|--------|-------|---------------------|
| OBS-001 | Production Monitoring & Alerts | main-backend |
| QA-001 | Smoke Test Script | None (scripts only) |

**🔐 SSH into VM first:**
```bash
gcloud compute ssh --zone "asia-south1-a" "supermandi-backend-vm" --project "supermandi-backend"
# OR: ssh claude@34.14.220.171
```

**Deploy Commands:**
```bash
cd /opt/supermandi

# 1. Rebuild backend with health endpoints
docker compose -f docker-compose.prod.yml up -d --build main-backend

# 2. Run smoke tests
./scripts/smoke-test.sh
```

---

### BATCH 9: GO-LIVE Validation (FINAL)
**End-to-end testing — deploy only after all other batches**

| Ticket | Title | Services to Rebuild |
|--------|-------|---------------------|
| GL-001 | End-to-End Real User Test | None (testing only) |

**Pre-requisites:** ALL Batches 0-8 deployed and verified

**🔐 SSH into VM first:**
```bash
gcloud compute ssh --zone "asia-south1-a" "supermandi-backend-vm" --project "supermandi-backend"
# OR: ssh claude@34.14.220.171
```

**Validation Steps:**
```bash
# 1. Run full smoke test suite
./scripts/smoke-test.sh

# 2. Perform manual E2E tests per GL-001 scenarios

# 3. Verify all health endpoints
curl -s https://supermandi.tech/api/health | jq
curl -s https://supermandi.tech/retailer/health | jq
curl -s https://supermandi.tech/supplier/health | jq
```

---

### Batch Dependency Diagram

```
BATCH 0 (Foundation)
    ├── CORE-001, CORE-002, OPS-001, ENV-001, GW-001
    │
    ▼
BATCH 1 (Auth)              BATCH 2 (Storage)
    │                           │
    ├── AUTH-001, SEC-001       ├── DOCS-001 [CRITICAL]
    │   SEC-002                 │
    │                           │
    └───────────┬───────────────┘
                │
                ▼
BATCH 3 (POS Device)
    │
    ├── POS-DEV-001, POS-DEV-002, RET-POS-001, RET-POS-002
    │
    ▼
BATCH 4 (KYC)
    │
    ├── KYC-001, KYC-002
    │
    ▼
BATCH 5 (Retailer Web)           BATCH 6 (Supplier)
    │                               │
    ├── RET-WEB-*, FLOW-001,        ├── SUP-001
    │   PAY-001, DEDUP-001          │
    │                               │
    └───────────┬───────────────────┘
                │
                ▼
BATCH 7 (Admin + Audit)
    │
    ├── ADMIN-001, ADMIN-002, AUDIT-001, COM-001
    │
    ▼
BATCH 8 (Monitoring)
    │
    ├── OBS-001, QA-001
    │
    ▼
BATCH 9 (GO-LIVE)
    │
    └── GL-001 (Final Validation)
```

---

### Service Rebuild Count by Batch

| Batch | main-backend | api-gateway | retailer-admin | supplier-portal | superadmin | pos-app |
|-------|--------------|-------------|----------------|-----------------|------------|---------|
| 0     | ✓            | ✓           | ✓              | ✓               |            |         |
| 1     | ✓            |             | ✓              | ✓               |            |         |
| 2     | ✓            | ✓           |                |                 |            |         |
| 3     | ✓            | ✓           | ✓              |                 |            | ✓       |
| 4     | ✓            | ✓           | ✓              | ✓               |            | ✓       |
| 5     | ✓            | ✓           | ✓              |                 |            |         |
| 6     | ✓            | ✓           |                | ✓               |            |         |
| 7     | ✓            |             | ✓              |                 | ✓          |         |
| 8     | ✓            |             |                |                 |            |         |
| **Total** | **9**    | **6**       | **6**          | **4**           | **1**      | **2**   |

---

### Rollback Plan (per batch)

If a batch fails, rollback with:

**🔐 SSH into VM first:**
```bash
gcloud compute ssh --zone "asia-south1-a" "supermandi-backend-vm" --project "supermandi-backend"
# OR: ssh claude@34.14.220.171
```

**Rollback Commands:**
```bash
cd /opt/supermandi

# 1. Restore database backup
docker compose -f docker-compose.prod.yml exec postgres psql -U supermandi supermandi < backup_batchX_YYYYMMDD.sql

# 2. Rebuild previous images
docker compose -f docker-compose.prod.yml up -d --build main-backend api-gateway

# 3. Restore previous portal builds (if backed up)
cp -r /var/www/retailer-admin.bak/* /var/www/retailer-admin/
```

**IMPORTANT:** Always backup before each batch:
```bash
# Database
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U supermandi supermandi > backup_batchX_$(date +%Y%m%d).sql

# Portals
cp -r /var/www/retailer-admin /var/www/retailer-admin.bak
cp -r /var/www/supermandi-superadmin /var/www/supermandi-superadmin.bak
```

---

## FINAL RULE

**If any behavior deviates from this ticket pack, it is a BUG, not a design choice.**
