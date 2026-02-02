# REG-AUTH-102 — Document Storage Backend

**Category:** AUTH & IDENTITY (KYC)

**Scope:** Backend (API + Database)

**Depends On:** REG-AUTH-101 (Database Foundation)

---

## Execution Rule for Claude

- Implement exactly as written.
- No redesign, no shortcuts, no skipping states.
- Documents must be uploadable during registration (before approval).

---

## Implement

1. **Extend `platform.documents` table** — Add 'application' as valid entity_type
2. **Update document upload API** — Accept 'application' entity type
3. **Create document completeness check** — Helper functions for KYC validation
4. **Create document migration function** — Move docs from application to store/supplier on approval

---

## Database Changes

### Migration: 094_reg_auth_document_storage.sql

| Change | Description |
|--------|-------------|
| Constraint update | Allow 'application' in entity_type CHECK |
| New function | `platform.get_required_documents(entity_type)` |
| New function | `auth.check_application_documents(application_id)` |
| New function | `auth.migrate_application_documents(app_id, target_type, target_id)` |
| New view | `auth.application_kyc_status` |

### Required Documents by Entity Type

**Retailers:**
| Document | Required | Description |
|----------|----------|-------------|
| pan | ✅ | PAN Card of Owner |
| gstin_certificate | ✅ | GSTIN Registration Certificate |
| address_proof | ✅ | Address Proof (Bill/Agreement) |
| owner_photo | ⚪ | Owner Photo |
| store_photo | ⚪ | Store Front Photo |
| cancelled_cheque | ⚪ | Cancelled Cheque |

**Suppliers:**
| Document | Required | Description |
|----------|----------|-------------|
| pan_card | ✅ | PAN Card of Business/Owner |
| gstin_certificate | ✅ | GSTIN Registration Certificate |
| address_proof | ✅ | Business Address Proof |
| cancelled_cheque | ✅ | Cancelled Cheque |
| business_license | ⚪ | Business License |

---

## API Changes

### Updated: POST /api/v1/documents/upload

Now accepts `entity_type: 'application'`:

```bash
curl -X POST https://supermandi.tech/api/v1/documents/upload \
  -H "Content-Type: multipart/form-data" \
  -F "file=@pan_card.jpg" \
  -F "entity_type=application" \
  -F "entity_id=<application-uuid>" \
  -F "document_type=pan"
```

### Updated: GET /api/v1/documents/entity/:entityType/:entityId

Now accepts `entityType: 'application'`:

```bash
curl https://supermandi.tech/api/v1/documents/entity/application/<application-uuid>
```

---

## Helper Functions

### 1. Check Required Documents

```sql
SELECT * FROM platform.get_required_documents('retailer');
-- Returns: document_type, is_required, description
```

### 2. Check Application Document Status

```sql
SELECT * FROM auth.check_application_documents('<application-uuid>');
-- Returns: document_type, is_required, status, is_complete
```

### 3. KYC Status View

```sql
SELECT * FROM auth.application_kyc_status WHERE application_id = '<uuid>';
-- Returns: uploaded_count, required_count, missing_count, missing_documents, kyc_complete
```

### 4. Migrate Documents on Approval

```sql
SELECT auth.migrate_application_documents(
  '<application-uuid>',
  'store',
  '<new-store-uuid>'
);
-- Returns: count of migrated documents
```

---

## Code Changes

### File: backend/src/routes/v1/documents.ts

| Change | Description |
|--------|-------------|
| Line 44-62 | Added `VALID_APPLICATION_DOC_TYPES` array |
| Line 137-141 | Updated `getValidDocTypes()` to include 'application' |
| Line 187-194 | Updated entity_type validation to include 'application' |
| Line 220-235 | Added application existence check |
| Line 540-546 | Updated GET /entity endpoint for 'application' |

---

## Verification Proof

### Curl Proof (After Deploy)

```bash
# 1. Upload document for application
curl -X POST https://supermandi.tech/api/v1/documents/upload \
  -H "Content-Type: multipart/form-data" \
  -F "file=@test_pan.jpg" \
  -F "entity_type=application" \
  -F "entity_id=TEST_APP_UUID" \
  -F "document_type=pan"
# Expected: 201 { document_id: "...", status: "pending" }

# 2. Get application documents
curl https://supermandi.tech/api/v1/documents/entity/application/TEST_APP_UUID
# Expected: 200 { documents: [...] }

# 3. Check document completeness (via psql)
SELECT * FROM auth.check_application_documents('TEST_APP_UUID');
# Expected: List of documents with is_complete status
```

### Database Proof

```sql
-- Verify constraint updated
\d platform.documents
-- Expected: entity_type CHECK includes 'application'

-- Verify functions exist
\df auth.check_application_documents
\df auth.migrate_application_documents
-- Expected: Functions listed

-- Verify view
SELECT * FROM auth.application_kyc_status LIMIT 1;
```

---

## Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Migration runs | No errors |
| Upload with entity_type=application | 201 Created |
| Get application documents | 200 with documents list |
| Required documents function | Returns correct list |
| Document completeness check | Returns correct status |
| KYC status view | Returns aggregated status |

---

## Deployment Commands

```bash
# On VM (34.14.220.171)
cd /opt/supermandi
git pull origin main

# Run migrations
docker compose -f docker-compose.prod.yml exec -T main-backend node scripts/migrate-prod.js

# Rebuild backend
docker compose -f docker-compose.prod.yml up -d --build main-backend

# Test upload
curl -X POST http://localhost:8085/api/v1/documents/upload \
  -F "entity_type=application" -F "entity_id=test" -F "document_type=pan" -F "file=@test.jpg"
```

---

## Change Log

| Date | Version | Change |
|------|---------|--------|
| 2026-02-02 | 1.0.0 | Initial implementation |

---

**IMPLEMENTED BY:** Claude Code (REG-AUTH-102)
