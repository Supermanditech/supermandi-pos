# REG-AUTH-204 — Limited Mode + Status Gates

**Category:** AUTH & IDENTITY (ACCESS CONTROL)

**Scope:** Backend (Middleware)

**Depends On:** REG-AUTH-203

---

## Execution Rule for Claude

- Implement exactly as written.
- No redesign, no shortcuts, no skipping states.
- Non-ACTIVE users MUST be blocked from protected features.

---

## What is Limited Mode?

```
LIMITED MODE = Application exists but status ≠ ACTIVE

Users in LIMITED MODE can:
✅ View dashboard
✅ Edit profile
✅ Upload documents
✅ View products

Users in LIMITED MODE cannot:
❌ SELL (create sales)
❌ Create invoices
❌ Accept payments
❌ BUY/Reorder
❌ Access financial reports
```

---

## Access Matrix

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

---

## Implementation

### 1. Middleware: `requireActiveStatus`

```typescript
// backend/src/middleware/limitedMode.ts

export function requireActiveStatus(req, res, next) {
  // Get application/store status from JWT or request context
  const status = req.applicationStatus || req.storeStatus;

  if (!status) {
    return res.status(403).json({
      error: {
        code: 'REGISTRATION_REQUIRED',
        message: 'Registration required before login.',
        errorCode: 'REG_AUTH_001'
      }
    });
  }

  if (status !== 'ACTIVE') {
    return res.status(403).json({
      error: {
        code: 'LIMITED_MODE',
        message: 'Your account is pending approval. Limited access only.',
        status: status,
        errorCode: 'REG_AUTH_002'
      }
    });
  }

  next();
}
```

### 2. Apply to Protected Routes

**POS Routes** (SELL, payments):
- `/api/v1/pos/sales/*` — Requires ACTIVE
- `/api/v1/pos/payments/*` — Requires ACTIVE
- `/api/v1/pos/purchases/*` — Requires ACTIVE

**Retailer Admin Routes**:
- `/api/v1/retailer-admin/compliance/*` — Requires ACTIVE (invoices/GST)
- `/api/v1/reorder/*` — Requires ACTIVE

### 3. Allowed in Limited Mode

**POS Routes** (READ-only):
- `/api/v1/pos/store` — Profile viewing
- `/api/v1/pos/inventory` — View inventory
- `/api/v1/pos/storeProducts` — View products
- `/api/v1/pos/sync` — Sync data

**Documents**:
- `/api/v1/documents/upload` — Upload KYC docs
- `/api/v1/documents/entity/*` — View docs

---

## Error Response Format

```json
{
  "error": {
    "code": "LIMITED_MODE",
    "message": "Your account is pending approval. Limited access only.",
    "status": "KYC_SUBMITTED",
    "errorCode": "REG_AUTH_002",
    "allowedActions": [
      "VIEW_DASHBOARD",
      "EDIT_PROFILE",
      "UPLOAD_DOCUMENTS",
      "VIEW_PRODUCTS"
    ],
    "blockedActions": [
      "SELL",
      "CREATE_INVOICE",
      "ACCEPT_PAYMENT",
      "REORDER"
    ]
  }
}
```

---

## Code Files

### Created:
- `backend/src/middleware/limitedMode.ts` — Status-based access control middleware

### Modified:
- `backend/src/routes/v1/pos/sales.ts` — Apply requireActiveStatus
- `backend/src/routes/v1/pos/payments.ts` — Apply requireActiveStatus
- `backend/src/routes/v1/pos/purchases.ts` — Apply requireActiveStatus
- `backend/src/routes/v1/reorder.ts` — Apply requireActiveStatus

---

## Verification Proof

### Curl Proof

```bash
# 1. Try SELL as non-ACTIVE user (MUST FAIL)
curl -X POST https://supermandi.tech/api/v1/pos/sales/create \
  -H "Authorization: Bearer <limited-mode-token>" \
  -H "Content-Type: application/json" \
  -d '{"items": [...]}'
# Expected: 403 { error: { code: "LIMITED_MODE" } }

# 2. Try view products as non-ACTIVE user (SHOULD WORK)
curl https://supermandi.tech/api/v1/pos/store-products \
  -H "Authorization: Bearer <limited-mode-token>"
# Expected: 200 with products list

# 3. Try SELL as ACTIVE user (SHOULD WORK)
curl -X POST https://supermandi.tech/api/v1/pos/sales/create \
  -H "Authorization: Bearer <active-token>" \
  -H "Content-Type: application/json" \
  -d '{"items": [...]}'
# Expected: 200/201 with sale created
```

---

## Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| SELL as LIMITED user | Returns 403 LIMITED_MODE |
| Payment as LIMITED user | Returns 403 LIMITED_MODE |
| Reorder as LIMITED user | Returns 403 LIMITED_MODE |
| View products as LIMITED user | Returns 200 with data |
| Upload document as LIMITED user | Returns 200/201 success |
| SELL as ACTIVE user | Returns 200/201 success |

---

## Frontend Requirements

### POS App
- Show "LIMITED MODE" banner when status ≠ ACTIVE
- Disable SELL button with message "Pending approval"
- Allow navigation to profile, documents, products

### Retailer Web
- Show status badge (DRAFT, KYC_SUBMITTED, etc.)
- Disable "New Sale" and "Reorder" buttons
- Show "Complete your registration" CTA

---

## Change Log

| Date | Version | Change |
|------|---------|--------|
| 2026-02-02 | 1.0.0 | Initial implementation |

---

**IMPLEMENTED BY:** Claude Code (REG-AUTH-204)
