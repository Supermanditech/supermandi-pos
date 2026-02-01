# ADMIN-001 — Retailer Application Review

**Category:** SUPERADMIN DASHBOARD

**Scope:** SuperAdmin UI + Backend

---

## Implement

- View full store application:
  - details
  - documents
  - payments
  - device info
- Actions:
  - Approve → set **ACTIVE**
  - Reject → **NEEDS_FIX** (with reason)
  - Suspend

---

## Acceptance

- [ ] One-click activation
- [ ] Status instantly reflects in POS + Web

---

## A) Existing Code Audit (before implementation)

### rg searches ran:

```bash
rg "store.*review|review.*store" --type ts -l
rg "approve.*store|store.*approve" --type ts -l
rg "ACTIVE|NEEDS_FIX" --type ts -l
rg "supermandi-superadmin" --type ts -l
```

### Current flow summary:

**SuperAdmin (`supermandi-superadmin/src/App.tsx`):**
- Stores tab exists
- Basic store CRUD
- Can update store status
- NO comprehensive application review view

**Current Store Management:**
- List all stores
- Create/edit store
- Can set status (but no state machine)
- No document viewer
- No payment details view
- No device info view

**Backend (`backend/src/routes/v1/admin/stores.ts`):**
- CRUD endpoints exist
- Status update endpoint exists (no validation)
- No rejection reason storage

### Gaps vs plan:

- [ ] **No application view**: Need unified view with all details
- [ ] **No document viewer**: Cannot see uploaded docs
- [ ] **No payment details**: Cannot see UPI/bank
- [ ] **No device info**: Cannot see bound devices
- [ ] **No rejection reason**: Status change doesn't store reason
- [ ] **No state machine**: Can set any status directly

### Retailer Dashboard already covers part of this ticket?

**NO** — This is SuperAdmin functionality. Retailer Dashboard does not have admin capabilities.

---

## B) Implementation Subtickets (UI→API→DB)

### B.1) UI Subtickets

#### B.1.1) SuperAdmin Screens
- [ ] **ADMIN-001-UI-1**: Store Application Review Page
  - File: `supermandi-superadmin/src/components/StoreApplicationReview.tsx` (NEW)
  - Comprehensive view with tabs/sections:
    - **Details**: Store name, address, type, GSTIN, owner info
    - **Documents**: All uploaded docs with thumbnails, click to expand
    - **Payments**: UPI address, bank details
    - **Devices**: Bound devices list with status
    - **Status History**: Audit trail of status changes

- [ ] **ADMIN-001-UI-2**: Action buttons panel
  - File: Part of StoreApplicationReview.tsx
  - "Approve" button (green) → ACTIVE
  - "Reject" button (red) → NEEDS_FIX with modal for reason
  - "Suspend" button (orange) → SUSPENDED
  - Current status badge prominently displayed

- [ ] **ADMIN-001-UI-3**: Pending applications queue
  - File: `supermandi-superadmin/src/components/PendingStoresQueue.tsx` (NEW)
  - List stores in PAYMENTS_SUBMITTED status
  - Quick stats: Total pending, oldest application
  - Click to open review

- [ ] **ADMIN-001-UI-4**: Rejection reason modal
  - File: `supermandi-superadmin/src/components/RejectionModal.tsx` (NEW)
  - Required text field for reason
  - Pre-defined reasons dropdown (optional)
  - Confirm button

### B.2) API Subtickets

#### B.2.1) Application Review Endpoint
- [ ] **ADMIN-001-API-GET**: `GET /api/v1/admin/stores/:id/application`
  - File: `backend/src/routes/v1/admin/stores.ts` (MODIFY)
  - Returns complete application data:
    ```json
    {
      "store": { "id", "name", "address", "type", "gstin", "owner_name", "phone", "email", "status" },
      "documents": [{ "id", "type", "file_url", "verified" }],
      "payments": { "upi_address", "bank_account_masked", "bank_ifsc", "bank_name" },
      "devices": [{ "id", "fingerprint", "last_seen" }],
      "status_history": [{ "old_status", "new_status", "reason", "changed_at", "changed_by" }]
    }
    ```

#### B.2.2) Status Update with Reason
- [ ] **ADMIN-001-API-STATUS**: `PATCH /api/v1/admin/stores/:id/status`
  - File: `backend/src/routes/v1/admin/stores.ts` (MODIFY)
  - Request: `{ status: string, reason?: string }`
  - Validates transition via state machine (CORE-001)
  - Stores reason in audit log
  - If NEEDS_FIX, stores reason on store record too
  - Response: `{ store: {...}, status_history: [...] }`

#### B.2.3) Pending Queue Endpoint
- [ ] **ADMIN-001-API-QUEUE**: `GET /api/v1/admin/stores/pending`
  - File: `backend/src/routes/v1/admin/stores.ts`
  - Returns stores where status = PAYMENTS_SUBMITTED
  - Ordered by created_at (oldest first)
  - Response: `{ count: number, stores: [...] }`

### B.3) DB/Migration Subtickets

#### B.3.1) Already defined in CORE-001
- `066_store_status_audit.sql` — Audit log table
- Status reason stored on store record

No additional migrations needed.

---

## C) Deployment Subtickets (VM)

### Services to rebuild:

| Service | Rebuild Required | Reason |
|---------|------------------|--------|
| `main-backend` | YES | Enhanced status endpoint |
| `api-gateway` | NO | Existing routes |
| `supermandi-superadmin` | YES | New review UI |
| `nginx` | NO | No changes |

### Deploy commands:

```bash
# On VM (34.14.220.171)
cd /opt/supermandi

# 1. Rebuild backend
docker compose -f docker-compose.prod.yml up -d --build main-backend

# 2. Rebuild SuperAdmin
cd /opt/supermandi/supermandi-superadmin && npm run build
cp -r dist/* /var/www/supermandi-superadmin/
```

---

## D) Verification Proof (must be attached per ticket)

### D.1) Curl Proof

```bash
# Get pending stores queue
curl -X GET https://supermandi.tech/api/v1/admin/stores/pending \
  -H "Authorization: Bearer ADMIN_TOKEN"
# Expected: 200 { "count": 5, "stores": [...] }

# Get full application
curl -X GET https://supermandi.tech/api/v1/admin/stores/STORE_ID/application \
  -H "Authorization: Bearer ADMIN_TOKEN"
# Expected: 200 { "store": {...}, "documents": [...], "payments": {...}, "devices": [...], "status_history": [...] }

# Approve store
curl -X PATCH https://supermandi.tech/api/v1/admin/stores/STORE_ID/status \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "ACTIVE"}'
# Expected: 200 { "store": { "status": "ACTIVE" }, "status_history": [...] }

# Reject store with reason
curl -X PATCH https://supermandi.tech/api/v1/admin/stores/STORE_ID/status \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "NEEDS_FIX", "reason": "GST certificate is expired"}'
# Expected: 200 { "store": { "status": "NEEDS_FIX", "status_reason": "GST certificate is expired" } }

# Suspend store
curl -X PATCH https://supermandi.tech/api/v1/admin/stores/STORE_ID/status \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "SUSPENDED", "reason": "Fraudulent activity"}'
# Expected: 200 { "store": { "status": "SUSPENDED" } }
```

### D.2) Real-user Proof

1. **View pending queue:**
   - Login to SuperAdmin
   - See "Pending Applications" widget
   - Count matches stores in PAYMENTS_SUBMITTED

2. **Open application review:**
   - Click on store in queue
   - See comprehensive view with all sections
   - View documents (full size on click)
   - See payment details
   - See device info

3. **Approve store:**
   - Click "Approve" button
   - Status changes to ACTIVE
   - Store removed from pending queue

4. **Verify instant reflection:**
   - Check POS app (should unlock features)
   - Check Retailer Dashboard (should show ACTIVE)

5. **Reject store:**
   - Click "Reject" button
   - Enter reason in modal
   - Confirm
   - Status = NEEDS_FIX
   - Reason visible to retailer

### D.3) Evidence Required
- [ ] Screenshot: Pending applications queue
- [ ] Screenshot: Full application review page
- [ ] Screenshot: Document viewer expanded
- [ ] Screenshot: Approve button click → ACTIVE
- [ ] Screenshot: Rejection modal with reason
- [ ] Screenshot: POS showing features unlocked after approval
- [ ] Curl output logs

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Pending queue | Shows correct count and list |
| Application view | All sections populated |
| Document viewer | Can view all uploaded docs |
| One-click approve | Single click activates store |
| Rejection with reason | Must enter reason, stored correctly |
| Instant reflection | POS/Web sees status change immediately |
| Audit trail | Status history shows all changes |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: NO**

This ticket is SuperAdmin functionality. However, the status changes made here will be visible in Retailer Dashboard (via existing status display).
