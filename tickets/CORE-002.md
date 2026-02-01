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

### rg searches ran:

```bash
rg "verification_status|verificationStatus" --type ts -l
rg "supplier.*status|status.*supplier" --type ts -l
rg "supplier.suppliers" --type sql -l
rg "pending|verified|rejected" --type ts -l
```

### Current flow summary:

**Database Schema (`backend/migrations/003_supplier_schema.sql`, `048_supplier_verification_schema.sql`):**

| Column | Type | Current Values |
|--------|------|----------------|
| `status` | VARCHAR | `active`, `inactive`, `suspended` |
| `verification_status` | VARCHAR | `pending`, `verified`, `rejected`, `unverified`, `suspended` |

**Two status columns exist:**
1. `status` — operational status (active/inactive/suspended)
2. `verification_status` — KYC verification status

**Current Values:**
- `verification_status = 'pending'` → awaiting review
- `verification_status = 'verified'` → approved, can operate
- `verification_status = 'rejected'` → needs re-submission

### Gaps vs plan:

- [ ] **Enum mismatch**: Plan says `KYC_SUBMITTED`, current uses `pending`
- [ ] **Missing NEEDS_FIX**: Current uses `rejected`, plan wants `NEEDS_FIX`
- [ ] **No state machine**: Direct status updates allowed
- [ ] **Two columns confusion**: `status` vs `verification_status` overlap
- [ ] **No transition logging**: No audit trail for status changes

### Retailer Dashboard already covers part of this ticket?

**NO** — Retailer Dashboard does not manage supplier status. Supplier status is managed in:
- SuperAdmin portal (`supermandi-superadmin/src/App.tsx` - Suppliers tab)
- Supplier portal shows their own status

---

## B) Implementation Subtickets (UI→API→DB)

### B.1) UI Subtickets

#### B.1.1) Supplier Portal Screens
- [ ] **SUP-CORE-002-UI**: Status display on dashboard
  - File: `supplier-portal/src/app/(dashboard)/dashboard/page.tsx`
  - Show current verification_status with clear messaging
  - If NEEDS_FIX, show rejection reason and re-submit button

- [ ] **SUP-CORE-002-UI-2**: Pending approval page
  - File: `supplier-portal/src/app/(auth)/pending-approval/page.tsx`
  - Already exists, update messaging for new states

#### B.1.2) SuperAdmin Screens
- [ ] **ADMIN-CORE-002-UI**: Supplier verification panel
  - File: `supermandi-superadmin/src/components/SupplierDetails.tsx`
  - Show status with transition history
  - Actions: Verify (→ACTIVE), Reject (→NEEDS_FIX), Suspend
  - Require reason for rejection

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
  - Enforce: Cannot skip states
  - Log all transitions

#### B.2.2) Status Update Endpoints
- [ ] **CORE-002-API-ADMIN**: `PATCH /api/v1/admin/suppliers/:id/status`
  - File: `backend/src/routes/v1/admin/suppliers.ts`
  - Request: `{ verification_status: string, reason?: string }`
  - Validates transition
  - Already partially exists — need to add validation

- [ ] **CORE-002-API-RESUBMIT**: `POST /api/v1/supplier/resubmit-kyc`
  - File: `backend/src/routes/v1/supplier/kyc.ts`
  - Allows supplier to resubmit after NEEDS_FIX
  - Transitions: NEEDS_FIX → KYC_SUBMITTED

### B.3) DB/Migration Subtickets

#### B.3.1) Schema Changes
- [ ] **CORE-002-DB-ENUM**: Standardize verification_status enum
  - Migration: `067_supplier_status_enum.sql`
  ```sql
  -- Create enum type
  CREATE TYPE supplier.supplier_verification_status AS ENUM (
    'KYC_SUBMITTED',
    'ACTIVE',
    'NEEDS_FIX',
    'SUSPENDED'
  );

  -- Migrate existing data
  UPDATE supplier.suppliers SET verification_status = 'KYC_SUBMITTED'
    WHERE verification_status IN ('pending', 'unverified');
  UPDATE supplier.suppliers SET verification_status = 'ACTIVE'
    WHERE verification_status = 'verified';
  UPDATE supplier.suppliers SET verification_status = 'NEEDS_FIX'
    WHERE verification_status = 'rejected';
  UPDATE supplier.suppliers SET verification_status = 'SUSPENDED'
    WHERE verification_status = 'suspended';

  -- Alter column
  ALTER TABLE supplier.suppliers
  ALTER COLUMN verification_status TYPE supplier.supplier_verification_status
  USING verification_status::supplier.supplier_verification_status;

  -- Set default
  ALTER TABLE supplier.suppliers
  ALTER COLUMN verification_status SET DEFAULT 'KYC_SUBMITTED';
  ```

- [ ] **CORE-002-DB-REASON**: Add rejection reason column
  - Migration: `068_supplier_status_reason.sql`
  ```sql
  ALTER TABLE supplier.suppliers
  ADD COLUMN IF NOT EXISTS status_reason TEXT,
  ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ DEFAULT NOW();
  ```

- [ ] **CORE-002-DB-AUDIT**: Create supplier status audit table
  - Migration: `069_supplier_status_audit.sql`
  ```sql
  CREATE TABLE IF NOT EXISTS supplier.supplier_status_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID NOT NULL REFERENCES supplier.suppliers(id),
    old_status supplier.supplier_verification_status,
    new_status supplier.supplier_verification_status NOT NULL,
    reason TEXT,
    changed_by UUID,
    changed_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX idx_supplier_status_audit_supplier ON supplier.supplier_status_audit(supplier_id);
  ```

---

## C) Deployment Subtickets (VM)

### Services to rebuild:

| Service | Rebuild Required | Reason |
|---------|------------------|--------|
| `main-backend` | YES | New state machine, migrations |
| `supplier-service` | YES | If status checks exist there |
| `api-gateway` | NO | No routing changes |
| `supplier-portal` | YES | Status display updates |
| `supermandi-superadmin` | YES | Verification panel updates |
| `nginx` | NO | No changes |

### Deploy commands:

```bash
# On VM (34.14.220.171)
cd /opt/supermandi

# 1. BACKUP DATABASE FIRST
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U supermandi supermandi > backup_$(date +%Y%m%d).sql

# 2. Run migrations
docker compose -f docker-compose.prod.yml exec main-backend node scripts/migrate-prod.js

# 3. Rebuild backend services
docker compose -f docker-compose.prod.yml up -d --build main-backend supplier-service

# 4. Rebuild Supplier Portal
cd /opt/supermandi/supplier-portal && npm run build
# Deploy Next.js (depends on hosting setup)

# 5. Rebuild SuperAdmin
cd /opt/supermandi/supermandi-superadmin && npm run build
cp -r dist/* /var/www/supermandi-superadmin/
```

---

## D) Verification Proof (must be attached per ticket)

### D.1) Curl Proof

```bash
# Get supplier with status
curl -X GET https://supermandi.tech/api/v1/admin/suppliers/SUPPLIER_ID \
  -H "Authorization: Bearer ADMIN_TOKEN"
# Expected: 200 { "id": "...", "verification_status": "KYC_SUBMITTED|ACTIVE|...", ... }

# Approve supplier
curl -X PATCH https://supermandi.tech/api/v1/admin/suppliers/SUPPLIER_ID/status \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"verification_status": "ACTIVE"}'
# Expected: 200 { "id": "...", "verification_status": "ACTIVE" }

# Reject supplier
curl -X PATCH https://supermandi.tech/api/v1/admin/suppliers/SUPPLIER_ID/status \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"verification_status": "NEEDS_FIX", "reason": "GST certificate unclear"}'
# Expected: 200 { "id": "...", "verification_status": "NEEDS_FIX", "status_reason": "GST certificate unclear" }

# Supplier accesses protected endpoint while not ACTIVE
curl -X GET https://supermandi.tech/api/v1/supplier/products \
  -H "Authorization: Bearer SUPPLIER_TOKEN_NOT_ACTIVE"
# Expected: 403 { "error": "INACTIVE", "verification_status": "KYC_SUBMITTED" }
```

### D.2) Real-user Proof

1. **Supplier registers:**
   - Complete registration form
   - Check DB: verification_status = KYC_SUBMITTED

2. **Supplier sees pending status:**
   - Login to portal
   - Redirected to pending-approval page
   - Cannot access dashboard features

3. **Admin approves:**
   - SuperAdmin clicks Verify
   - Check DB: verification_status = ACTIVE

4. **Supplier now has access:**
   - Refresh portal
   - Dashboard and features now accessible

5. **Admin rejects:**
   - SuperAdmin clicks Reject with reason
   - Supplier sees NEEDS_FIX with reason displayed

### D.3) Evidence Required
- [ ] Screenshot: DB query showing migrated status values
- [ ] Screenshot: Supplier pending-approval page
- [ ] Screenshot: SuperAdmin verification panel
- [ ] Screenshot: Supplier sees rejection reason
- [ ] Curl output logs

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Enum migration | All existing suppliers mapped to new enum |
| State machine | Invalid transitions rejected |
| Feature gating | KYC_SUBMITTED/NEEDS_FIX suppliers blocked from features |
| Rejection flow | Reason stored and displayed to supplier |
| Audit log | All transitions logged |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: NO**

This ticket does not affect Retailer Dashboard. Supplier management is in SuperAdmin and Supplier Portal only.
