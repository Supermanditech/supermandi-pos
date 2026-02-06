# POST-BATCH-019: Fix-to-Green Report (SESSION-2)

| Field | Value |
|-------|-------|
| **Baseline** | `dd6020e` |
| **Audit** | `RELEASES/post-batch-019-hyper-atomic-audit.md` |
| **Date** | 2026-02-06 |
| **Scope** | 5 fixes in 2 files (all same root cause) |

---

## FIXES APPLIED

### FIX-019-005 (P1): Store PATCH upi_vpa → 500

| Field | Value |
|-------|-------|
| **File** | `backend/src/routes/v1/admin/stores.ts:362` |
| **Before** | `addUpdate("status", normalized ? "active" : "inactive")` |
| **After** | `addUpdate("status", normalized ? "ACTIVE" : "DRAFT")` |

**Verification:**
```
PATCH /stores/:id {"upi_vpa":"store@upi"} → 200, status: "ACTIVE", active: true
PATCH /stores/:id {"upi_vpa":""}           → 200, status: "DRAFT",  active: false
```

Previously returned 500 (CHECK constraint violation).

---

### FIX-019-006 (P2): Store PATCH response `active` field always false

| Field | Value |
|-------|-------|
| **File** | `backend/src/routes/v1/admin/stores.ts:416` |
| **Before** | `active: store.status === "active"` |
| **After** | `active: store.status === "ACTIVE"` |

**Verification:** PATCH response now returns `active: true` for ACTIVE stores.

---

### FIX-019-007 (P2): Store GET /stores fallback `active` field always false

| Field | Value |
|-------|-------|
| **File** | `backend/src/routes/v1/admin/stores.ts:230` |
| **Before** | `active: row.status === "active"` |
| **After** | `active: row.status === "ACTIVE"` |

**Verification:** Fallback path now correctly computes `active` flag.

---

### FIX-019-008 (P2): Store GET /stores/:id fallback `active` field always false

| Field | Value |
|-------|-------|
| **File** | `backend/src/routes/v1/admin/stores.ts:299` |
| **Before** | `active: store.status === "active"` |
| **After** | `active: store.status === "ACTIVE"` |

**Verification:** GET /stores/:id returns `active: true` for ACTIVE stores.

---

### FIX-019-009 (P2 latent): storeOwnership `requireActiveStore` lowercase check

| Field | Value |
|-------|-------|
| **File** | `backend/src/middleware/storeOwnership.ts:443` |
| **Before** | `if (storeInfo.status !== 'active')` |
| **After** | `if (storeInfo.status !== 'ACTIVE')` |

**Context:** This function queries `platform.stores` (UPPERCASE statuses) but compared against lowercase `'active'`. Currently unreachable (all routes import from `storeStatusGate.ts` instead), but fixed preemptively to prevent future breakage.

---

## VERIFICATION EVIDENCE

### Gate 1: Typecheck
```
pnpm -r typecheck → 0 errors across all 22 projects
```

### Gate 2: Docker rebuild + API tests
```
docker compose -f scripts/docker-compose.local-prod.yml up -d --build main-backend → OK
Backend health: 200 OK

Test 1: PATCH store with upi_vpa="store@upi"
  Before: 500 Internal Server Error
  After:  200 {"status":"ACTIVE","active":true}

Test 2: PATCH store with upi_vpa="" (clear VPA)
  Before: 500 Internal Server Error
  After:  200 {"status":"DRAFT","active":false}

Test 3: GET /stores/:id (after ACTIVE)
  Before: active: false (incorrect)
  After:  active: true (correct)
```

### Gate 3: No regression
- Only 5 string literals changed in 2 files
- No API signature changes
- No new dependencies
- No schema changes

---

## FILES CHANGED

| File | Lines Changed | What |
|------|--------------|------|
| `backend/src/routes/v1/admin/stores.ts` | 230, 299, 362, 416 | 4 lowercase→UPPERCASE status comparisons |
| `backend/src/middleware/storeOwnership.ts` | 443 | 1 lowercase→UPPERCASE status comparison (latent) |

---

## ROOT CAUSE

Migration 094 (`094_core_001_store_status_enum.sql`) changed the `stores_status_check` constraint from lowercase (`'active', 'inactive', 'suspended'`) to UPPERCASE state machine values (`'DRAFT', 'ENROLLED', 'KYC_SUBMITTED', 'PAYMENTS_SUBMITTED', 'ACTIVE', 'NEEDS_FIX', 'SUSPENDED', 'deleted'`).

The CREATE handler was fixed in FIX-019-001 (commit `dd6020e`), but the PATCH handler, GET fallback paths, and storeOwnership middleware were missed.

## COMPLETENESS CHECK

A full `grep` for lowercase `"active"` / `'active'` across `backend/src/` confirmed:
- **`platform.stores` table references:** All 5 occurrences now fixed (stores.ts × 4, storeOwnership.ts × 1)
- **`storeStatusGate.ts`:** Uses `StoreStatus.ACTIVE = "ACTIVE"` (correct)
- **`limitedMode.ts`:** Uses `.toLowerCase()` comparison (handles both cases correctly)
- **Other `'active'` references:** All belong to different tables (`auth.users`, `store_supplier_links`, `suppliers`, `admin.admins`, `bnpl_drawdowns`, `devices`) which use lowercase by design — NOT affected by migration 094

---

**Ready for commit.**
