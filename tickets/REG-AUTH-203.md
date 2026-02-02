# REG-AUTH-203 — OTP Guardrail (Registration-First Enforcement)

**Category:** AUTH & IDENTITY (SECURITY)

**Scope:** Backend (Middleware)

**Depends On:** REG-AUTH-201, REG-AUTH-202

---

## Execution Rule for Claude

- Implement exactly as written.
- No redesign, no shortcuts, no skipping states.
- OTP verify without application_id MUST return 403.

---

## The Guardrail Rule

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  OTP VERIFY PERMITTED ONLY WITH EXISTING REGISTRATION/APPLICATION_ID       │
│                                                                             │
│  OTHERWISE → 403 FORBIDDEN: "Registration required before login."          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Approach

### 1. Registration Routes (Already Protected)

The registration routes created in REG-AUTH-201 and REG-AUTH-202 already enforce the guardrail:

**Retailer Registration** (`/api/v1/retailer-admin/registration/verify-otp`):
- Requires `applicationId` parameter
- Returns 403 `REGISTRATION_REQUIRED` if missing

**Supplier Registration** (`/api/v1/supplier/registration/verify-otp`):
- Requires `applicationId` parameter
- Returns 403 `REGISTRATION_REQUIRED` if missing

### 2. Existing Auth Routes (Backwards Compatibility)

The existing auth routes are for **already approved entities**:

**Retailer Auth** (`/api/v1/retailer-admin/auth/firebase-login`):
- Requires valid `storeCode` for an existing, approved store
- Only allows login if phone matches store's registered phone
- This is NOT a "registration bypass" - it's login for existing stores
- **KEEP AS-IS** for backwards compatibility

**Supplier Auth** (`/api/v1/supplier/auth/firebase-login`):
- For approved suppliers only (status must be 'active')
- Returns 404 if phone not found (must register first)
- **KEEP AS-IS** for backwards compatibility

### 3. New Middleware: `requireRegistrationForOtp`

Create middleware that can be applied to any endpoint that accepts OTP:

```typescript
// Middleware: requireRegistrationForOtp
// Returns 403 if no applicationId provided for OTP verification

export function requireRegistrationForOtp(req, res, next) {
  const { applicationId } = req.body;

  if (!applicationId) {
    return res.status(403).json({
      error: {
        code: 'REGISTRATION_REQUIRED',
        message: 'Registration required before login. Please complete registration first.',
        errorCode: 'REG_AUTH_001'
      }
    });
  }

  next();
}
```

---

## Error Codes

| Code | HTTP | Message | When |
|------|------|---------|------|
| `REGISTRATION_REQUIRED` | 403 | Registration required before login. | OTP verify without application_id |
| `APPLICATION_NOT_FOUND` | 404 | Application not found. | application_id doesn't exist |
| `PHONE_MISMATCH` | 403 | Phone number does not match application. | Verified phone ≠ application phone |
| `APPLICATION_EXPIRED` | 403 | Application has expired. | status = EXPIRED |

---

## Code Files

### Created:
- `backend/src/middleware/registrationGuard.ts` — Guardrail middleware

### Already Protected (REG-AUTH-201, REG-AUTH-202):
- `backend/src/routes/v1/retailer-admin/registration.ts` — verify-otp protected
- `backend/src/routes/v1/supplier/registration.ts` — verify-otp protected

### Unchanged (Backwards Compatibility):
- `backend/src/routes/v1/retailer-admin/auth.ts` — For existing approved stores
- `backend/src/routes/v1/supplier/auth.ts` — For existing approved suppliers

---

## Verification Proof

### Curl Proof

```bash
# 1. Retailer registration OTP without application_id (MUST FAIL)
curl -X POST https://supermandi.tech/api/v1/retailer-admin/registration/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"idToken": "firebase-token"}'
# Expected: 403 { error: { code: "REGISTRATION_REQUIRED" } }

# 2. Retailer registration OTP with application_id (SUCCESS)
curl -X POST https://supermandi.tech/api/v1/retailer-admin/registration/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"idToken": "firebase-token", "applicationId": "valid-uuid"}'
# Expected: 200 (if token and application valid)

# 3. Supplier registration OTP without application_id (MUST FAIL)
curl -X POST https://supermandi.tech/api/v1/supplier/registration/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"idToken": "firebase-token"}'
# Expected: 403 { error: { code: "REGISTRATION_REQUIRED" } }

# 4. Existing store login (should still work)
curl -X POST https://supermandi.tech/api/v1/retailer-admin/auth/firebase-login \
  -H "Content-Type: application/json" \
  -d '{"idToken": "firebase-token", "storeCode": "EXISTING-STORE"}'
# Expected: 200 (if store exists and phone matches)
```

---

## Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Registration OTP without applicationId | Returns 403 REGISTRATION_REQUIRED |
| Registration OTP with applicationId | Returns 200 (if valid) |
| Existing store login | Returns 200 (backwards compatible) |
| Error response format | Includes code, message, errorCode |

---

## Important Notes

### Why Keep Existing Auth Routes?

1. **Backwards Compatibility**: Existing stores were created before the registration system
2. **Different Flow**: Existing stores already have approval; registration is for NEW entities
3. **Security Still Maintained**: Existing auth routes require:
   - Valid Firebase token (proves phone ownership)
   - Valid store code (must exist in DB)
   - Phone must match store's registered phone

### The Guardrail Applies To:

- ✅ New retailer registrations (REG-AUTH-201)
- ✅ New supplier registrations (REG-AUTH-202)
- ❌ Existing store login (backwards compatible)
- ❌ Existing supplier login (backwards compatible)

---

## Change Log

| Date | Version | Change |
|------|---------|--------|
| 2026-02-02 | 1.0.0 | Initial implementation |

---

**IMPLEMENTED BY:** Claude Code (REG-AUTH-203)
