# REG-AUTH-000 — Spec Lock & Contract Update (Registration-First Authentication)

**Category:** AUTH & IDENTITY (FOUNDATION)

**Scope:** Backend + POS + Retailer Web + Supplier Portal

**Status:** SPEC LOCKED

**Supersedes:** AUTH-001 (OTP-First Authentication)

---

## CRITICAL CONTRACT RULE

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  OTP VERIFY PERMITTED ONLY WITH EXISTING REGISTRATION/APPLICATION_ID       │
│                                                                             │
│  OTHERWISE → 403 FORBIDDEN: "Registration required before login."          │
└─────────────────────────────────────────────────────────────────────────────┘
```

**This is NON-NEGOTIABLE. No exceptions. No workarounds.**

---

## Execution Rule for Claude

- Implement exactly as written.
- No redesign, no shortcuts, no skipping states.
- POS, Web, Backend, SuperAdmin must behave identically.
- **REGISTRATION MUST PRECEDE LOGIN — ALWAYS.**

---

## 1. The Registration-First Principle

### 1.1 Core Rule

```
NEW USER FLOW (MANDATORY ORDER):
1. REGISTER → Creates application (status: DRAFT)
2. SUBMIT DOCUMENTS → Updates to KYC_SUBMITTED
3. ADMIN APPROVAL → Updates to ACTIVE
4. ONLY THEN → OTP login allowed

VIOLATION (FORBIDDEN):
1. OTP login without registration → 403 FORBIDDEN
```

### 1.2 Why Registration-First?

| OTP-First (WRONG) | Registration-First (CORRECT) |
|-------------------|------------------------------|
| Anyone can OTP → phantom users | Only registered users can OTP |
| No business validation | Business validated before access |
| No GSTIN uniqueness check | GSTIN checked during registration |
| Creates orphan Firebase UIDs | Firebase UID linked to application |
| No document trail | Documents uploaded before approval |

---

## 2. Application Workflow (State Machine)

```
DRAFT → KYC_SUBMITTED → PAYMENTS_SUBMITTED → ACTIVE
                    ↓
               NEEDS_FIX → (user fixes) → KYC_SUBMITTED
                    ↓
                  EXPIRED (after 30 days no action)
```

### 2.1 State Definitions

| State | Description | Allowed Actions |
|-------|-------------|-----------------|
| `DRAFT` | Registration started, phone verified | Edit profile, upload docs |
| `KYC_SUBMITTED` | Documents uploaded, awaiting review | View status only |
| `PAYMENTS_SUBMITTED` | UPI/payment details submitted | View status only |
| `ACTIVE` | Admin approved, full access | SELL, BUY, all features |
| `NEEDS_FIX` | Admin requested corrections | Edit profile, re-upload docs |
| `EXPIRED` | No action for 30 days from NEEDS_FIX | Contact support |

### 2.2 Transition Rules

```sql
-- Valid transitions only
DRAFT            → KYC_SUBMITTED     -- User submits documents
KYC_SUBMITTED    → PAYMENTS_SUBMITTED -- Auto after payment setup
KYC_SUBMITTED    → NEEDS_FIX          -- Admin rejects with reason
KYC_SUBMITTED    → ACTIVE             -- Admin approves
PAYMENTS_SUBMITTED → ACTIVE           -- Admin approves
NEEDS_FIX        → KYC_SUBMITTED      -- User resubmits
NEEDS_FIX        → EXPIRED            -- 30 days timeout
```

---

## 3. GSTIN Uniqueness Contract

### 3.1 Rule
```
IF gstin EXISTS in applications OR stores:
  THEN RESUME existing application
  DO NOT create duplicate
```

### 3.2 Lookup Priority

1. Check `applications.gstin` (pending applications)
2. Check `stores.gstin` (approved stores)
3. Check `supplier.suppliers.gstin` (approved suppliers)

### 3.3 Resume Flow

```typescript
// Pseudo-code
async function handleGSTIN(gstin: string, phone: string): Promise<Response> {
  const existing = await findByGSTIN(gstin);

  if (existing) {
    // Resume existing application
    await sendOTP(phone);
    return {
      action: 'RESUME',
      application_id: existing.id,
      status: existing.status
    };
  }

  // Create new application
  return createNewApplication(gstin, phone);
}
```

---

## 4. LIMITED MODE Contract

### 4.1 Definition

LIMITED MODE = Application exists but status ≠ ACTIVE

### 4.2 Access Matrix

| Feature | ACTIVE | LIMITED (non-ACTIVE) |
|---------|--------|----------------------|
| Dashboard view | ✅ | ✅ |
| Profile edit | ✅ | ✅ |
| Document upload | ✅ | ✅ |
| View products | ✅ | ✅ |
| **SELL** | ✅ | ❌ 403 |
| **Create invoices** | ✅ | ❌ 403 |
| **Accept payments** | ✅ | ❌ 403 |
| **BUY/Reorder** | ✅ | ❌ 403 |
| **Financial reports** | ✅ | ❌ 403 |

### 4.3 API Guard Implementation

```typescript
// Middleware: requireActiveStatus.ts
export function requireActiveStatus(req: Request, res: Response, next: NextFunction) {
  const user = req.user;

  if (!user.application_id) {
    return res.status(403).json({
      error: 'REGISTRATION_REQUIRED',
      message: 'Registration required before login.',
      code: 'REG_AUTH_001'
    });
  }

  if (user.application_status !== 'ACTIVE') {
    return res.status(403).json({
      error: 'LIMITED_MODE',
      message: 'Your account is pending approval. Limited access only.',
      status: user.application_status,
      code: 'REG_AUTH_002'
    });
  }

  next();
}
```

---

## 5. OTP Guardrail Contract

### 5.1 OTP Verify Endpoint Rules

```
POST /api/v1/auth/verify-otp

REQUIRED PARAMETERS:
- idToken: string (Firebase ID token)
- application_id: string (UUID) ← MANDATORY FOR LOGIN

IF application_id missing:
  → 403 { error: "REGISTRATION_REQUIRED", message: "Registration required before login." }

IF application not found:
  → 404 { error: "APPLICATION_NOT_FOUND" }

IF phone mismatch:
  → 403 { error: "PHONE_MISMATCH" }

IF application.status === 'EXPIRED':
  → 403 { error: "APPLICATION_EXPIRED", message: "Your application has expired. Please contact support." }

SUCCESS:
  → 200 { token, refreshToken, user: { id, application_id, status, ... } }
```

### 5.2 Allowed Endpoints WITHOUT application_id

| Endpoint | Purpose |
|----------|---------|
| `POST /api/v1/auth/register` | Create new application |
| `POST /api/v1/auth/check-gstin` | Check GSTIN uniqueness |
| `POST /api/v1/auth/send-otp` | Send OTP during registration |
| `GET /api/v1/public/*` | Public catalog, etc. |

### 5.3 Protected Endpoints (require application_id)

| Endpoint | Additional Requirement |
|----------|------------------------|
| `POST /api/v1/auth/verify-otp` | application_id required |
| `POST /api/v1/auth/login` | application_id required |
| `*` (everything else) | Valid token with application_id |

---

## 6. Data Collection Requirements

### 6.1 Retailer Registration (stores)

| Field | Required | Stage |
|-------|----------|-------|
| phone | ✅ | Registration |
| store_name | ✅ | Registration |
| address | ✅ | Registration |
| gstin | ✅ | Registration |
| owner_name | ✅ | Registration |
| email | ⚪ Optional | Registration |
| pan_url | ✅ | KYC |
| gstin_url | ✅ | KYC |
| address_proof_url | ✅ | KYC |
| upi_vpa | ✅ | Payments |

### 6.2 Supplier Registration

| Field | Required | Stage |
|-------|----------|-------|
| phone | ✅ | Registration |
| business_name | ✅ | Registration |
| gstin | ✅ | Registration |
| email | ✅ | Registration |
| pan_url | ✅ | KYC |
| gstin_url | ✅ | KYC |
| bank_details | ✅ | Payments |

---

## 7. Error Codes (Standardized)

| Code | HTTP | Message | When |
|------|------|---------|------|
| `REG_AUTH_001` | 403 | Registration required before login. | OTP verify without application_id |
| `REG_AUTH_002` | 403 | Your account is pending approval. | Non-ACTIVE status trying protected action |
| `REG_AUTH_003` | 409 | GSTIN already registered. | Duplicate GSTIN (redirect to resume) |
| `REG_AUTH_004` | 400 | Invalid GSTIN format. | GSTIN validation failed |
| `REG_AUTH_005` | 403 | Application expired. | Status is EXPIRED |
| `REG_AUTH_006` | 400 | Missing required documents. | Incomplete KYC submission |
| `REG_AUTH_007` | 403 | Phone mismatch. | OTP phone ≠ application phone |

---

## 8. Ticket Dependency Graph

```
REG-AUTH-000 (this spec - LOCKED)
     │
     ├── REG-AUTH-101: Database Foundation
     │        │
     │        ├── REG-AUTH-102: Document Storage
     │        │
     │        ├── REG-AUTH-201: Retailer Registration API
     │        │
     │        └── REG-AUTH-202: Supplier Registration API
     │                 │
     │                 └── REG-AUTH-203: OTP Guardrail
     │                          │
     │                          └── REG-AUTH-204: Limited Mode
     │
     ├── REG-AUTH-301: Retailer Web UI
     │
     ├── REG-AUTH-302: Supplier Portal UI
     │
     ├── REG-AUTH-401: POS App Rewrite
     │
     └── REG-AUTH-501: VM Deployment + Go-Live Test
```

---

## 9. Implementation Checklist

### 9.1 Backend Guards (MUST implement)

- [ ] `requireApplicationId` middleware — blocks OTP verify without application_id
- [ ] `requireActiveStatus` middleware — blocks SELL/BUY for non-ACTIVE
- [ ] GSTIN uniqueness check in registration endpoint
- [ ] Application status in JWT claims
- [ ] 403 response with `code: 'REG_AUTH_001'` for registration-required errors

### 9.2 Frontend Guards (MUST implement)

- [ ] Registration screen BEFORE login screen in flow
- [ ] Store `application_id` in local storage after registration
- [ ] Pass `application_id` to OTP verify endpoint
- [ ] Show LIMITED MODE UI banner for non-ACTIVE status
- [ ] Disable SELL/payment buttons in LIMITED MODE

### 9.3 Database Requirements

- [ ] `applications` table with status workflow
- [ ] `stores.gstin` column (required, unique)
- [ ] `stores.owner_name` column (required)
- [ ] `stores.document_urls` JSONB (PAN, GSTIN, address proof)
- [ ] `stores.upi_vpa` column

---

## 10. Verification Proof Requirements

Each subsequent ticket (REG-AUTH-101 through REG-AUTH-501) MUST include:

1. **Curl Proof** — API responses showing correct behavior
2. **Screenshot Proof** — UI showing registration-first flow
3. **Database Proof** — Query showing application states
4. **403 Proof** — Attempted OTP without application_id returns 403

---

## Supersession Notice

This specification **SUPERSEDES** the following:

- AUTH-001 (OTP-First Authentication) — **DEPRECATED**
- Any existing login-without-registration flows

All code implementing OTP-first login without registration check MUST be refactored to comply with this specification.

---

## Change Log

| Date | Version | Change |
|------|---------|--------|
| 2026-02-02 | 1.0.0 | Initial spec lock |

---

**SPEC LOCKED BY:** Claude Code (REG-AUTH-000)

**COMMIT SHA:** 610a358
