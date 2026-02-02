# REG-AUTH-101 — Database Foundation

**Category:** AUTH & IDENTITY (DATABASE)

**Scope:** Backend (PostgreSQL Migrations)

**Depends On:** REG-AUTH-000 (Spec Lock)

---

## Execution Rule for Claude

- Implement exactly as written.
- No redesign, no shortcuts, no skipping states.
- All platforms must use the same database schema.

---

## Implement

1. **Create `auth.applications` table** — Registration applications with status workflow
2. **Add missing columns to `platform.stores`** — gstin, owner_name, document_urls, upi_vpa
3. **Add missing columns to `supplier.suppliers`** — document_urls, bank details
4. **Create status change audit log** — `auth.application_status_log`
5. **Create helper functions** — GSTIN uniqueness check, status update, auto-expire

---

## Database Schema

### A) auth.applications Table

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| id | UUID | PK | Primary key |
| entity_type | VARCHAR(20) | ✅ | 'retailer' or 'supplier' |
| phone | VARCHAR(20) | ✅ | Verified via Firebase OTP |
| firebase_uid | VARCHAR(128) | - | Firebase UID after OTP |
| email | VARCHAR(255) | Supplier only | Required for suppliers |
| business_name | VARCHAR(255) | ✅ | Store/business name |
| owner_name | VARCHAR(255) | ✅ | Owner full name |
| gstin | VARCHAR(15) | ✅ | GST Identification Number |
| address_* | VARCHAR | - | Address fields |
| document_urls | JSONB | ✅ | KYC document URLs |
| upi_vpa | VARCHAR(100) | - | UPI VPA for retailers |
| bank_* | VARCHAR | - | Bank details for suppliers |
| status | VARCHAR(30) | ✅ | Application status |
| admin_notes | TEXT | - | Internal admin notes |
| rejection_reason | TEXT | - | Reason if NEEDS_FIX |
| approved_store_id | UUID | - | Linked store after approval |
| approved_supplier_id | UUID | - | Linked supplier after approval |
| created_at | TIMESTAMPTZ | ✅ | When created |
| updated_at | TIMESTAMPTZ | ✅ | Last update |
| submitted_at | TIMESTAMPTZ | - | When KYC submitted |
| needs_fix_at | TIMESTAMPTZ | - | When moved to NEEDS_FIX |
| expires_at | TIMESTAMPTZ | - | 30 days after NEEDS_FIX |

### B) Status Values

```
DRAFT → KYC_SUBMITTED → PAYMENTS_SUBMITTED → ACTIVE
              ↓
          NEEDS_FIX → EXPIRED (30 days)
```

### C) Indexes (Critical)

| Index | Purpose |
|-------|---------|
| `ux_applications_gstin_active` | GSTIN uniqueness (non-expired) |
| `ux_applications_phone_entity_active` | Phone uniqueness per entity type |
| `ux_applications_firebase_uid` | Firebase UID uniqueness |
| `idx_applications_pending_queue` | Admin review queue |
| `idx_applications_expiring` | Auto-expire job |

---

## Migration File

**File:** `backend/migrations/093_reg_auth_database_foundation.sql`

### Key DDL

```sql
-- Applications table with status workflow
CREATE TABLE IF NOT EXISTS auth.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(20) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  gstin VARCHAR(15) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  -- ... (see migration file for full schema)

  CONSTRAINT chk_applications_status CHECK (
    status IN ('DRAFT', 'KYC_SUBMITTED', 'PAYMENTS_SUBMITTED', 'ACTIVE', 'NEEDS_FIX', 'EXPIRED')
  )
);

-- GSTIN uniqueness (non-expired applications)
CREATE UNIQUE INDEX ux_applications_gstin_active
  ON auth.applications (gstin)
  WHERE status != 'EXPIRED';
```

---

## Helper Functions

### 1. `auth.check_gstin_uniqueness(gstin, entity_type)`

Returns existing entity if GSTIN already registered:

```sql
SELECT * FROM auth.check_gstin_uniqueness('29AABCU9603R1ZM', 'retailer');
-- Returns: exists_in='application', entity_id=..., entity_status='DRAFT', can_resume=true
```

### 2. `auth.update_application_status(app_id, new_status, user_id, reason)`

Updates status with audit logging:

```sql
SELECT auth.update_application_status(
  'app-uuid',
  'KYC_SUBMITTED',
  'admin-uuid',
  'Documents uploaded'
);
```

### 3. `auth.expire_stale_applications()`

Auto-expires NEEDS_FIX applications after 30 days:

```sql
-- Call from cron job daily
SELECT auth.expire_stale_applications();
-- Returns: number of expired applications
```

---

## Verification Proof

### Curl Proof (After Deploy)

```bash
# SSH into VM
ssh claude@34.14.220.171

# Run migration
cd /opt/supermandi
docker compose -f docker-compose.prod.yml exec -T main-backend node scripts/migrate-prod.js

# Verify table exists
docker compose -f docker-compose.prod.yml exec -T main-backend psql -c "
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'auth' AND table_name = 'applications';
"

# Verify columns on stores
docker compose -f docker-compose.prod.yml exec -T main-backend psql -c "
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'platform' AND table_name = 'stores'
AND column_name IN ('gstin', 'owner_name', 'document_urls', 'upi_vpa');
"

# Test GSTIN uniqueness function
docker compose -f docker-compose.prod.yml exec -T main-backend psql -c "
SELECT * FROM auth.check_gstin_uniqueness('29AABCU9603R1ZM', 'supplier');
"
```

### Database Proof

```sql
-- Expected: applications table exists
\d auth.applications

-- Expected: GSTIN unique index exists
\di ux_applications_gstin_active

-- Expected: status check constraint
SELECT conname FROM pg_constraint WHERE conname = 'chk_applications_status';
```

---

## Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Migration runs | No errors, all objects created |
| auth.applications exists | Table with all columns |
| GSTIN uniqueness | Duplicate GSTIN insert fails |
| Status constraint | Invalid status insert fails |
| Status function works | auth.update_application_status() logs change |
| GSTIN check function | auth.check_gstin_uniqueness() returns correct results |
| Stores columns added | gstin, owner_name, document_urls, upi_vpa exist |
| Suppliers columns added | document_urls, bank_* columns exist |

---

## Deployment Commands

```bash
# On VM (34.14.220.171)
cd /opt/supermandi
git pull origin main

# Run migration
docker compose -f docker-compose.prod.yml exec -T main-backend node scripts/migrate-prod.js

# Verify
docker compose -f docker-compose.prod.yml exec -T main-backend psql -c "\dt auth.*"
```

---

## Change Log

| Date | Version | Change |
|------|---------|--------|
| 2026-02-02 | 1.0.0 | Initial implementation |

---

**IMPLEMENTED BY:** Claude Code (REG-AUTH-101)
