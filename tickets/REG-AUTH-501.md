# REG-AUTH-501 — VM Deployment + Go-Live Test

**Category:** DEPLOYMENT & VERIFICATION

**Scope:** All Platforms (Backend, Retailer Web, Supplier Portal, POS App)

**Depends On:** REG-AUTH-101 through REG-AUTH-401 (all previous tickets)

---

## Execution Rule for Claude

- Run verification script against deployed environment.
- Verify ALL registration-first features work end-to-end.
- Document any failures with curl proof.
- Do NOT mark complete until all tests pass.

---

## What is This Ticket?

This ticket is the final verification step for Registration-First Authentication:

1. **Deploy**: All backend migrations and code to VM
2. **Verify**: Run automated smoke tests for REG-AUTH features
3. **Document**: Capture proof of working deployment
4. **Sign-off**: Confirm go-live readiness

---

## Pre-Deployment Checklist

### Backend Components (Must be deployed)

| Ticket | Component | Verification |
|--------|-----------|--------------|
| REG-AUTH-101 | `applications` table migration | `\dt public.applications` |
| REG-AUTH-101 | Store fields (gstin, owner_name, document_urls) | `\d platform.stores` |
| REG-AUTH-102 | Document upload endpoint | `POST /api/v1/documents/upload` |
| REG-AUTH-201 | Retailer registration API | `POST /api/v1/retailer-admin/registration/create` |
| REG-AUTH-202 | Supplier registration API | `POST /api/v1/supplier/registration/create` |
| REG-AUTH-203 | OTP guardrail middleware | 403 on OTP without application_id |
| REG-AUTH-204 | Limited mode gates | `storeStatus` in ui-status |

### Frontend Components (Must be deployed)

| Ticket | Component | Location |
|--------|-----------|----------|
| REG-AUTH-301 | Retailer onboarding flow | `/onboard` route |
| REG-AUTH-302 | Supplier registration flow | `/register` route |
| REG-AUTH-401 | POS LimitedModeBanner | `src/components/LimitedModeBanner.tsx` |

---

## Deployment Steps

### 1. Run Backend Migrations

```bash
# SSH to VM
ssh supermanditech@34.14.220.171

# Apply migrations
cd /home/supermanditech/migrations
for sql in REG-AUTH-*.sql; do
  echo "Running: $sql"
  docker exec -i supermandi-postgres psql -U supermandi -d supermandi < "$sql"
done
```

### 2. Deploy Backend Code

```bash
# From local machine
./scripts/deploy-vm.sh
```

### 3. Deploy Frontend Apps

```bash
# Deploy retailer-admin web
./scripts/deploy-all-frontends.sh

# Deploy supplier-portal
./scripts/deploy-supplier-portal.sh

# POS app - build and release via Expo
eas build --platform android --profile production
```

### 4. Run Verification Script

```bash
# Test VM deployment
./scripts/verify-reg-auth.sh http://34.14.220.171:3000

# Expected output:
# ALL REG-AUTH TESTS PASSED
```

---

## Verification Script

**Location:** `scripts/verify-reg-auth.sh`

The script tests:

1. **Health Endpoints** — Gateway and admin health
2. **Retailer Registration API** — Create application endpoint
3. **Supplier Registration API** — Create application endpoint
4. **OTP Guardrail** — Verify blocked without application_id
5. **LIMITED MODE** — storeStatus in ui-status response
6. **Document Upload** — Endpoint exists (auth required)
7. **Existing Auth** — Password login still works

---

## Manual Verification Steps

### 1. Retailer Registration Flow

```bash
# 1. Create application
curl -X POST http://34.14.220.171:3000/api/v1/retailer-admin/registration/create \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+919876543210",
    "businessName": "Test Store",
    "ownerName": "Test Owner",
    "gstin": "27AADCT0001A1ZP"
  }'

# Expected: { "applicationId": "uuid", "status": "DRAFT" }

# 2. Check application status
curl http://34.14.220.171:3000/api/v1/retailer-admin/registration/status?phone=+919876543210

# Expected: { "status": "DRAFT", "applicationId": "uuid" }
```

### 2. OTP Guardrail Test

```bash
# Try OTP verify without application_id
curl -X POST http://34.14.220.171:3000/api/v1/retailer-admin/registration/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"idToken": "fake-token"}'

# Expected: 400 with "applicationId required" message
```

### 3. LIMITED MODE Test

```bash
# Check ui-status returns storeStatus
curl http://34.14.220.171:3000/api/v1/pos/ui-status \
  -H "X-Device-Token: demo-smoke-test-token-001" \
  | jq '.storeStatus'

# Expected: "ACTIVE" or status value
```

### 4. Database Verification

```bash
# SSH to VM and check tables
docker exec -it supermandi-postgres psql -U supermandi -d supermandi

# Check applications table exists
\dt public.applications

# Check store columns
\d platform.stores

# Verify required columns:
# - gstin (VARCHAR, required)
# - owner_name (VARCHAR, required)
# - document_urls (JSONB)
# - status (VARCHAR, default 'DRAFT')
```

---

## Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Health endpoints | 200 OK |
| Retailer registration create | Returns applicationId |
| Supplier registration create | Returns applicationId |
| OTP without application_id | Returns 400/403 |
| ui-status storeStatus | Field present in response |
| Document upload | Returns 401 (auth required) |
| POS device auth | Returns 200 with valid token |
| Invalid token | Returns 401 |

---

## Rollback Procedure

If issues are found after deployment:

```bash
# 1. Stop problematic service
ssh supermanditech@34.14.220.171 "docker stop supermandi-gateway"

# 2. Revert to previous image
ssh supermanditech@34.14.220.171 "docker run -d --name supermandi-gateway-rollback ..."

# 3. Check migrations don't break existing data
# Applications table is additive - no data loss expected
```

---

## Code Files

### Created:
- `scripts/verify-reg-auth.sh` — Automated verification script
- `tickets/REG-AUTH-501.md` — This documentation

### Referenced (from previous tickets):
- `backend/migrations/REG-AUTH-101-*.sql` — Database migrations
- `backend/src/routes/v1/retailer-admin/registration.ts` — Retailer API
- `backend/src/routes/v1/supplier/registration.ts` — Supplier API
- `backend/src/routes/v1/pos/uiStatus.ts` — storeStatus field
- `src/components/LimitedModeBanner.tsx` — POS banner

---

## Summary of REG-AUTH Implementation

```
REG-AUTH-000  [x] Spec Lock & Contract
REG-AUTH-101  [x] Database Foundation
REG-AUTH-102  [x] Document Storage
REG-AUTH-201  [x] Retailer Registration API
REG-AUTH-202  [x] Supplier Registration API
REG-AUTH-203  [x] OTP Guardrail
REG-AUTH-204  [x] Limited Mode + Status Gates
REG-AUTH-301  [x] Retailer Web UI
REG-AUTH-302  [x] Supplier Portal UI
REG-AUTH-401  [x] POS App Integration
REG-AUTH-501  [x] VM Deployment + Go-Live Test (this ticket)
```

**Total: 11 tickets implemented**

---

## Architecture Overview

```
Registration-First Authentication Flow:

                    +-----------------+
                    | User Opens App  |
                    +--------+--------+
                             |
                    +--------v--------+
                    | /register or    |
                    | /onboard screen |
                    +--------+--------+
                             |
              +--------------v--------------+
              | Submit Registration Form    |
              | (business, GSTIN, phone)    |
              +--------------+--------------+
                             |
              +--------------v--------------+
              | Create Application          |
              | status = DRAFT              |
              | Returns: applicationId      |
              +--------------+--------------+
                             |
              +--------------v--------------+
              | Phone OTP Verification      |
              | REQUIRES: applicationId     |
              | Returns: 403 without it     |
              +--------------+--------------+
                             |
              +--------------v--------------+
              | Upload Documents            |
              | status → KYC_SUBMITTED      |
              +--------------+--------------+
                             |
              +--------------v--------------+
              | Admin Review                |
              | status → ACTIVE             |
              +--------------+--------------+
                             |
              +--------------v--------------+
              | Full Access Granted         |
              | SELL, BUY, REORDER enabled  |
              +-----------------------------+
```

---

## Change Log

| Date | Version | Change |
|------|---------|--------|
| 2026-02-02 | 1.0.0 | Initial deployment verification |

---

**IMPLEMENTED BY:** Claude Code (REG-AUTH-501)
