# REG-AUTH-202 — Supplier Registration API

**Category:** AUTH & IDENTITY (API)

**Scope:** Backend (REST API)

**Depends On:** REG-AUTH-101, REG-AUTH-102

---

## Execution Rule for Claude

- Implement exactly as written.
- No redesign, no shortcuts, no skipping states.
- Registration MUST create application before OTP is allowed.

---

## Implement

1. **POST /check-gstin** — Check GSTIN uniqueness, return action (CREATE/RESUME/LOGIN)
2. **POST /create** — Create new application (status: DRAFT)
3. **POST /verify-otp** — Verify phone with Firebase OTP (REQUIRES application_id)
4. **POST /submit-kyc** — Submit application for review (DRAFT → KYC_SUBMITTED)
5. **GET /status/:applicationId** — Get application status and documents
6. **GET /resume/:gstin** — Resume existing application by GSTIN

---

## API Endpoints

### Base Path: `/api/v1/supplier/registration`

### 1. POST /check-gstin

Check if GSTIN is available for registration.

**Request:**
```json
{ "gstin": "29AABCU9603R1ZM" }
```

**Response (Available):**
```json
{
  "exists": false,
  "action": "CREATE",
  "message": "GSTIN is available for registration"
}
```

**Response (Resume):**
```json
{
  "exists": true,
  "action": "RESUME",
  "applicationId": "uuid",
  "applicationStatus": "DRAFT"
}
```

**Response (Login):**
```json
{
  "exists": true,
  "action": "LOGIN",
  "supplierId": "uuid"
}
```

### 2. POST /create

Create new supplier registration application.

**Request:**
```json
{
  "phone": "+919876543210",
  "businessName": "Wholesale Traders Pvt Ltd",
  "ownerName": "John Doe",
  "gstin": "29AABCU9603R1ZM",
  "email": "supplier@example.com",
  "addressLine1": "123 Industrial Area",
  "city": "Bengaluru",
  "state": "Karnataka",
  "pincode": "560001",
  "bankAccountNumber": "1234567890123456",
  "bankIfsc": "SBIN0001234",
  "bankAccountName": "Wholesale Traders Pvt Ltd",
  "upiVpa": "supplier@paytm"
}
```

**Response:**
```json
{
  "success": true,
  "application": {
    "id": "uuid",
    "status": "DRAFT",
    "createdAt": "2026-02-02T10:00:00Z"
  },
  "nextStep": "VERIFY_PHONE",
  "message": "Application created. Please verify your phone number with OTP."
}
```

### 3. POST /verify-otp

**CRITICAL: Requires application_id — cannot verify without existing application**

**Request:**
```json
{
  "idToken": "firebase-id-token",
  "applicationId": "uuid"
}
```

**Response (Success):**
```json
{
  "success": true,
  "application": {
    "id": "uuid",
    "status": "DRAFT",
    "phoneVerified": true
  },
  "nextStep": "UPLOAD_DOCUMENTS"
}
```

**Response (No application_id — REG-AUTH-203 Guardrail):**
```json
{
  "error": {
    "code": "REGISTRATION_REQUIRED",
    "message": "Registration required before login. Please complete registration first."
  }
}
```
HTTP 403 Forbidden

### 4. POST /submit-kyc

Submit application for admin review.

**Request:**
```json
{ "applicationId": "uuid" }
```

**Response:**
```json
{
  "success": true,
  "application": {
    "id": "uuid",
    "status": "KYC_SUBMITTED"
  },
  "nextStep": "AWAIT_APPROVAL"
}
```

### 5. GET /status/:applicationId

Get application status and document checklist.

**Response:**
```json
{
  "application": {
    "id": "uuid",
    "status": "KYC_SUBMITTED",
    "businessName": "Wholesale Traders Pvt Ltd",
    "phoneVerified": true,
    "submittedAt": "2026-02-02T10:30:00Z"
  },
  "documents": [
    { "documentType": "pan_card", "isRequired": true, "status": "approved", "isComplete": true },
    { "documentType": "gstin_certificate", "isRequired": true, "status": "pending", "isComplete": true }
  ],
  "statusHistory": [...]
}
```

### 6. GET /resume/:gstin

Find and resume existing application by GSTIN.

**Response:**
```json
{
  "application": {
    "id": "uuid",
    "status": "DRAFT",
    "businessName": "Wholesale Traders Pvt Ltd",
    "maskedPhone": "****5678"
  },
  "nextStep": "VERIFY_PHONE"
}
```

---

## Supplier-Specific Fields

| Field | Required | Stage | Notes |
|-------|----------|-------|-------|
| phone | ✅ | Registration | E.164 format |
| businessName | ✅ | Registration | Legal business name |
| ownerName | ✅ | Registration | Owner/director name |
| gstin | ✅ | Registration | 15-char GSTIN |
| email | ✅ | Registration | Required for suppliers |
| bankAccountNumber | ⚪ | Payments | 9-18 digits |
| bankIfsc | ⚪ | Payments | Required if bank account provided |
| bankAccountName | ⚪ | Payments | Account holder name |
| upiVpa | ⚪ | Payments | For payout receiving |

---

## Registration Flow

```
1. User enters GSTIN
   └─ POST /check-gstin
      ├─ Available → Continue to step 2
      ├─ Exists (resumable) → Resume flow
      └─ Exists (approved) → Redirect to login

2. User fills registration form
   └─ POST /create
      └─ Creates application (status: DRAFT)

3. User receives OTP, enters code
   └─ POST /verify-otp (WITH application_id)
      └─ Updates application with firebase_uid

4. User uploads documents
   └─ POST /api/v1/documents/upload (entity_type: 'application')

5. User submits for review
   └─ POST /submit-kyc
      └─ Status: DRAFT → KYC_SUBMITTED

6. Admin reviews
   └─ (Admin API) → Status: ACTIVE
   └─ Creates supplier from application

7. User can now login
   └─ Uses normal OTP login with supplier
```

---

## Error Codes

| Code | HTTP | Message |
|------|------|---------|
| `REGISTRATION_REQUIRED` | 403 | Registration required before login |
| `APPLICATION_NOT_FOUND` | 404 | Application not found |
| `APPLICATION_EXPIRED` | 403 | Application has expired |
| `GSTIN_EXISTS` | 409 | GSTIN already registered |
| `APPLICATION_EXISTS` | 409 | Application with this GSTIN exists |
| `PHONE_MISMATCH` | 403 | Verified phone doesn't match application |
| `INVALID_GSTIN` | 400 | Invalid GSTIN format |
| `MISSING_DOCUMENTS` | 400 | Required documents not uploaded |
| `INVALID_BANK_ACCOUNT` | 400 | Invalid bank account number |
| `INVALID_IFSC` | 400 | Invalid IFSC code |
| `EMAIL_REQUIRED` | 400 | Email is required for supplier registration |

---

## Code Files

### Created:
- `backend/src/routes/v1/supplier/registration.ts` — Supplier Registration API routes

### Modified:
- `backend/src/routes/v1/supplier/index.ts` — Added registration router (before auth middleware)

---

## Verification Proof

### Curl Proof

```bash
# 1. Check GSTIN
curl -X POST https://supermandi.tech/api/v1/supplier/registration/check-gstin \
  -H "Content-Type: application/json" \
  -d '{"gstin": "29AABCU9603R1ZM"}'
# Expected: { exists: false, action: "CREATE" }

# 2. Create application
curl -X POST https://supermandi.tech/api/v1/supplier/registration/create \
  -H "Content-Type: application/json" \
  -d '{"phone": "+919876543210", "businessName": "Test Supplier", "ownerName": "John", "gstin": "29AABCU9603R1ZM", "email": "test@supplier.com"}'
# Expected: { success: true, application: { id: "uuid", status: "DRAFT" } }

# 3. Try OTP without application_id (MUST FAIL)
curl -X POST https://supermandi.tech/api/v1/supplier/registration/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"idToken": "token"}'
# Expected: 403 { error: { code: "REGISTRATION_REQUIRED" } }

# 4. Verify OTP with application_id
curl -X POST https://supermandi.tech/api/v1/supplier/registration/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"idToken": "firebase-token", "applicationId": "uuid"}'
# Expected: { success: true, phoneVerified: true }
```

---

## Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Check GSTIN (new) | Returns action: CREATE |
| Check GSTIN (existing app) | Returns action: RESUME with applicationId |
| Check GSTIN (existing supplier) | Returns action: LOGIN |
| Create application | Returns application_id, status: DRAFT |
| OTP without application_id | Returns 403 REGISTRATION_REQUIRED |
| OTP with application_id | Returns phoneVerified: true |
| Submit KYC | Status changes to KYC_SUBMITTED |
| Get status | Returns application details and documents |

---

## Deployment Commands

```bash
# On VM (34.14.220.171)
cd /opt/supermandi
git pull origin main

# Rebuild backend
docker compose -f docker-compose.prod.yml up -d --build main-backend

# Test endpoint
curl https://supermandi.tech/api/v1/supplier/registration/check-gstin \
  -H "Content-Type: application/json" \
  -d '{"gstin": "29AABCU9603R1ZM"}'
```

---

## Change Log

| Date | Version | Change |
|------|---------|--------|
| 2026-02-02 | 1.0.0 | Initial implementation |

---

**IMPLEMENTED BY:** Claude Code (REG-AUTH-202)
