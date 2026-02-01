# AUTH-001 — OTP-First Authentication (Retailer + Supplier)

**Category:** AUTH & IDENTITY (FOUNDATION)

**Scope:** Backend + POS + Retailer Web + Supplier Portal

---

## Execution Rule for Claude

- Implement exactly as written.
- No redesign, no shortcuts, no skipping states.
- POS, Web, Backend, SuperAdmin must behave identically.

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

#### B.1.4) SuperAdmin Screens
- N/A (SuperAdmin uses email OTP — already implemented)

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

#### B.2.3) Auth Guard Rules
| Endpoint Pattern | Required Status |
|------------------|-----------------|
| `/api/v1/pos/*` (except enroll) | Store: ACTIVE |
| `/api/v1/retailer-admin/*` (except auth) | Store: ACTIVE |
| `/api/v1/supplier/*` (except auth) | Supplier: ACTIVE (verified) |

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

# 3. Rebuild portals (if separate containers)
# Or rebuild static assets and copy to nginx
cd /opt/supermandi/retailer-admin && npm run build
cp -r dist/* /var/www/retailer-admin/

cd /opt/supermandi/supplier-portal && npm run build
cp -r .next/* /var/www/supplier-portal/
```

### Static asset steps:
- Retailer Admin: Build Vite app → copy to `/var/www/retailer-admin/`
- Supplier Portal: Build Next.js → copy to `/var/www/supplier-portal/`

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
