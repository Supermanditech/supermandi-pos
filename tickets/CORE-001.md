# CORE-001 — Canonical Store State Machine

**Category:** DATA MODEL & STATE MACHINE

**Scope:** Backend (DB + services)

---

## Execution Rule for Claude

- Implement exactly as written.
- No redesign, no shortcuts, no skipping states.
- POS, Web, Backend, SuperAdmin must behave identically.

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

**Current Status Values:**
| Current Value | Used For |
|---------------|----------|
| `active` | Store can operate |
| `inactive` | Store disabled |
| `suspended` | Admin suspended |

**State Transitions (current):**
- No state machine logic
- Status can be set directly to any value
- No server-side transition validation

### Gaps vs plan:

- [ ] **Missing states**: DRAFT, ENROLLED, KYC_SUBMITTED, PAYMENTS_SUBMITTED, NEEDS_FIX not in DB
- [ ] **No enum constraint**: Status is VARCHAR, not constrained enum
- [ ] **No transition rules**: Any status can be set directly
- [ ] **No flags tracking**: device_bound, kyc_complete, upi_complete, admin_approved not tracked
- [ ] **Case mismatch**: Current uses lowercase (`active`), plan uses uppercase (`ACTIVE`)

### Retailer Dashboard already covers part of this ticket?

**NO** — Retailer Dashboard does not manage store status transitions. Status management is in SuperAdmin only.

---

## B) Implementation Subtickets (UI→API→DB)

### B.1) UI Subtickets

#### B.1.1) POS Screens
- [ ] **POS-CORE-001-UI**: Display current store status on settings/profile screen
  - File: `src/screens/SettingsScreen.tsx`
  - Show status badge with human-readable label
  - If not ACTIVE, show what's missing (KYC, UPI, etc.)

#### B.1.2) Retailer Dashboard Screens
- [ ] **RET-CORE-001-UI**: Show store status on dashboard header
  - File: `retailer-admin/src/components/Header.tsx`
  - Display status badge
  - Link to onboarding steps if incomplete

#### B.1.3) SuperAdmin Screens
- [ ] **ADMIN-CORE-001-UI**: Store status management panel
  - File: `supermandi-superadmin/src/components/StoreDetails.tsx`
  - Show current status with history
  - Actions: Approve (→ACTIVE), Reject (→NEEDS_FIX), Suspend
  - Require reason for rejection

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
  - Enforce: Cannot skip states
  - Log all transitions to audit table

#### B.2.2) Status Update Endpoints
- [ ] **CORE-001-API-ADMIN**: `PATCH /api/v1/admin/stores/:id/status`
  - File: `backend/src/routes/v1/admin/stores.ts`
  - Request: `{ status: string, reason?: string }`
  - Validates transition is allowed
  - Returns updated store with new status

- [ ] **CORE-001-API-INTERNAL**: Internal status update helpers
  - File: `backend/src/services/storeService.ts`
  - `advanceToEnrolled(storeId)` — called after device bind
  - `advanceToKycSubmitted(storeId)` — called after doc upload
  - `advanceToPaymentsSubmitted(storeId)` — called after UPI setup

#### B.2.3) Status Flags
- [ ] **CORE-001-API-FLAGS**: Add status check helper
  - File: `backend/src/services/storeService.ts`
  - `getStoreReadiness(storeId)` returns:
    ```json
    {
      "device_bound": true/false,
      "kyc_complete": true/false,
      "upi_complete": true/false,
      "admin_approved": true/false,
      "can_activate": true/false
    }
    ```

### B.3) DB/Migration Subtickets

#### B.3.1) Schema Changes
- [ ] **CORE-001-DB-ENUM**: Create store_status enum type
  - Migration: `064_store_status_enum.sql`
  ```sql
  -- Create enum type
  CREATE TYPE platform.store_status AS ENUM (
    'DRAFT',
    'ENROLLED',
    'KYC_SUBMITTED',
    'PAYMENTS_SUBMITTED',
    'ACTIVE',
    'NEEDS_FIX',
    'SUSPENDED'
  );

  -- Migrate existing data
  UPDATE platform.stores SET status = 'ACTIVE' WHERE status = 'active';
  UPDATE platform.stores SET status = 'SUSPENDED' WHERE status = 'suspended';
  UPDATE platform.stores SET status = 'DRAFT' WHERE status = 'inactive' OR status IS NULL;

  -- Alter column type
  ALTER TABLE platform.stores
  ALTER COLUMN status TYPE platform.store_status
  USING status::platform.store_status;

  -- Set default
  ALTER TABLE platform.stores
  ALTER COLUMN status SET DEFAULT 'DRAFT';
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
  CREATE INDEX idx_store_status_audit_store ON platform.store_status_audit(store_id);
  ```

---

## C) Deployment Subtickets (VM)

### Services to rebuild:

| Service | Rebuild Required | Reason |
|---------|------------------|--------|
| `main-backend` | YES | New state machine service, migrations |
| `api-gateway` | NO | No routing changes |
| `retailer-admin` | YES | Status display UI |
| `supermandi-superadmin` | YES | Status management UI |
| `nginx` | NO | No changes |

### Deploy commands:

```bash
# On VM (34.14.220.171)
cd /opt/supermandi

# 1. BACKUP DATABASE FIRST
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U supermandi supermandi > backup_$(date +%Y%m%d).sql

# 2. Run migrations (CAREFUL - status enum migration)
docker compose -f docker-compose.prod.yml exec main-backend node scripts/migrate-prod.js

# 3. Rebuild main-backend
docker compose -f docker-compose.prod.yml up -d --build main-backend

# 4. Rebuild SuperAdmin portal
cd /opt/supermandi/supermandi-superadmin && npm run build
cp -r dist/* /var/www/supermandi-superadmin/

# 5. Rebuild Retailer Admin
cd /opt/supermandi/retailer-admin && npm run build
cp -r dist/* /var/www/retailer-admin/
```

### Static asset steps:
- SuperAdmin: Rebuild and copy to `/var/www/supermandi-superadmin/`
- Retailer Admin: Rebuild and copy to `/var/www/retailer-admin/`

---

## D) Verification Proof (must be attached per ticket)

### D.1) Curl Proof

```bash
# Get store with status
curl -X GET https://supermandi.tech/api/v1/admin/stores/STORE_ID \
  -H "Authorization: Bearer ADMIN_TOKEN"
# Expected: 200 { "id": "...", "status": "DRAFT|ENROLLED|...", "device_bound": true/false, ... }

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
# Expected: 200 { "id": "...", "status": "ACTIVE", ... }

# Check audit log
curl -X GET https://supermandi.tech/api/v1/admin/stores/STORE_ID/status-history \
  -H "Authorization: Bearer ADMIN_TOKEN"
# Expected: 200 [{ "old_status": "PAYMENTS_SUBMITTED", "new_status": "ACTIVE", "changed_at": "..." }]
```

### D.2) Real-user Proof

1. **Create new store (DRAFT):**
   - Register via POS or Web
   - Check DB: status = DRAFT

2. **Bind device (DRAFT → ENROLLED):**
   - Enter enrollment code on POS
   - Check DB: status = ENROLLED, device_bound = true

3. **Upload KYC (ENROLLED → KYC_SUBMITTED):**
   - Upload Aadhaar, GST via POS/Web
   - Check DB: status = KYC_SUBMITTED, kyc_complete = true

4. **Add UPI (KYC_SUBMITTED → PAYMENTS_SUBMITTED):**
   - Enter UPI address
   - Check DB: status = PAYMENTS_SUBMITTED, upi_complete = true

5. **Admin approve (PAYMENTS_SUBMITTED → ACTIVE):**
   - SuperAdmin clicks Approve
   - Check DB: status = ACTIVE, admin_approved = true

6. **Attempt skip (should fail):**
   - Try DRAFT → ACTIVE in SuperAdmin
   - See error: "Invalid transition"

### D.3) Evidence Required
- [ ] Screenshot: DB query showing new enum values
- [ ] Screenshot: SuperAdmin status management UI
- [ ] Screenshot: Retailer Dashboard status badge
- [ ] Screenshot: Invalid transition error
- [ ] Curl output logs for all transitions

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Enum migration | All existing stores migrated to new status |
| State machine | Invalid transitions rejected with error |
| Flags tracking | device_bound, kyc_complete, upi_complete updated correctly |
| Audit log | All transitions logged with timestamp |
| UI display | Status shown correctly on all portals |
| ACTIVE requirements | Cannot reach ACTIVE without all flags true |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: YES**

### Files touched in retailer-admin:
- `retailer-admin/src/components/Header.tsx` — Add status badge
- `retailer-admin/src/components/StatusBadge.tsx` — NEW component
- `retailer-admin/src/hooks/useStoreStatus.ts` — NEW hook for status fetching

### Routes touched:
- None (display only, no new routes)
