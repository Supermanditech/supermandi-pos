# ADMIN-002 — Supplier Review & Activation

**Category:** SUPERADMIN DASHBOARD

**Scope:** SuperAdmin UI

---

## Implement

- View supplier KYC
- Approve / Reject / Suspend

---

## Acceptance

- [ ] Supplier portal unlocked only after ACTIVE

---

## A) Existing Code Audit (before implementation)

### rg searches ran:

```bash
rg "supplier.*verify|verify.*supplier" --type ts -l
rg "supplier.*approve|approve.*supplier" --type ts -l
rg "verification_status" --type ts -l
```

### Current flow summary:

**SuperAdmin (`supermandi-superadmin/src/App.tsx`):**
- Suppliers tab exists
- Can view supplier list
- Can verify/reject suppliers
- Product approval exists
- Basic KYC viewing (partial)

**Backend (`backend/src/routes/v1/admin/suppliers.ts`):**
- Large file (42KB+) with extensive supplier management
- Verification status updates exist
- Product approval/rejection exists
- Some KYC fields accessible

**Current Capabilities:**
- List pending suppliers
- View supplier details
- Update verification_status
- Approve/reject products

### Gaps vs plan:

- [ ] **No unified KYC view**: Documents spread across different views
- [ ] **No rejection reason modal**: Can reject but no structured reason
- [ ] **No status audit trail**: Changes not logged
- [ ] **Inconsistent status values**: Uses `verified`/`pending`/`rejected` not `ACTIVE`/`KYC_SUBMITTED`/`NEEDS_FIX`

### Retailer Dashboard already covers part of this ticket?

**NO** — This is SuperAdmin functionality.

---

## B) Implementation Subtickets (UI→API→DB)

### B.1) UI Subtickets

#### B.1.1) SuperAdmin Screens
- [ ] **ADMIN-002-UI-1**: Supplier KYC Review Page
  - File: `supermandi-superadmin/src/components/SupplierKYCReview.tsx` (NEW)
  - Sections:
    - **Business Details**: Name, GSTIN, address, contact
    - **Documents**: GST cert, PAN, bank statement, etc.
    - **Bank Details**: Account, IFSC, UPI VPA
    - **Status History**: Audit trail

- [ ] **ADMIN-002-UI-2**: Action buttons
  - "Verify" button → ACTIVE
  - "Reject" button → NEEDS_FIX with reason modal
  - "Suspend" button → SUSPENDED

- [ ] **ADMIN-002-UI-3**: Pending suppliers queue
  - File: `supermandi-superadmin/src/components/PendingSuppliersQueue.tsx` (NEW)
  - List suppliers in KYC_SUBMITTED status
  - Quick review access

### B.2) API Subtickets

#### B.2.1) Enhanced Status Update
- [ ] **ADMIN-002-API-STATUS**: `PATCH /api/v1/admin/suppliers/:id/verification-status`
  - File: `backend/src/routes/v1/admin/suppliers.ts` (MODIFY)
  - Request: `{ verification_status: string, reason?: string }`
  - Validates via state machine (CORE-002)
  - Logs to audit table
  - Response: `{ supplier: {...}, status_history: [...] }`

#### B.2.2) KYC Application Endpoint
- [ ] **ADMIN-002-API-KYC**: `GET /api/v1/admin/suppliers/:id/kyc`
  - File: `backend/src/routes/v1/admin/suppliers.ts` (MODIFY)
  - Returns:
    ```json
    {
      "supplier": { "id", "name", "email", "phone", "gstin", "verification_status" },
      "documents": [{ "type", "file_url", "verified" }],
      "bank_details": { "account_masked", "ifsc", "bank_name", "upi_vpa" },
      "status_history": [...]
    }
    ```

### B.3) DB/Migration Subtickets

#### B.3.1) Reuse from CORE-002
- `069_supplier_status_audit.sql` — Audit log table

No additional migrations needed.

---

## C) Deployment Subtickets (VM)

### Services to rebuild:

| Service | Rebuild Required | Reason |
|---------|------------------|--------|
| `main-backend` | YES | Enhanced supplier endpoints |
| `supermandi-superadmin` | YES | KYC review UI |
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
# Get pending suppliers
curl -X GET "https://supermandi.tech/api/v1/admin/suppliers?verification_status=KYC_SUBMITTED" \
  -H "Authorization: Bearer ADMIN_TOKEN"
# Expected: 200 [{ "id": "...", "name": "...", "verification_status": "KYC_SUBMITTED" }]

# Get supplier KYC
curl -X GET https://supermandi.tech/api/v1/admin/suppliers/SUPPLIER_ID/kyc \
  -H "Authorization: Bearer ADMIN_TOKEN"
# Expected: 200 { "supplier": {...}, "documents": [...], "bank_details": {...} }

# Verify supplier
curl -X PATCH https://supermandi.tech/api/v1/admin/suppliers/SUPPLIER_ID/verification-status \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"verification_status": "ACTIVE"}'
# Expected: 200 { "supplier": { "verification_status": "ACTIVE" } }

# Reject supplier
curl -X PATCH https://supermandi.tech/api/v1/admin/suppliers/SUPPLIER_ID/verification-status \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"verification_status": "NEEDS_FIX", "reason": "Bank statement older than 3 months"}'
# Expected: 200 { "supplier": { "verification_status": "NEEDS_FIX", "status_reason": "..." } }
```

### D.2) Real-user Proof

1. **View pending suppliers:**
   - Login to SuperAdmin
   - Go to Suppliers tab
   - See pending queue

2. **Review KYC:**
   - Click on supplier
   - See all business details
   - View uploaded documents
   - See bank details

3. **Verify supplier:**
   - Click "Verify"
   - Status → ACTIVE
   - Supplier receives notification (if implemented)

4. **Test portal access:**
   - Login to Supplier Portal as verified supplier
   - All features now accessible
   - Dashboard loads normally

5. **Reject supplier:**
   - Click "Reject"
   - Enter reason
   - Supplier sees reason on their portal

### D.3) Evidence Required
- [ ] Screenshot: Pending suppliers list
- [ ] Screenshot: KYC review page
- [ ] Screenshot: Verify button click → ACTIVE
- [ ] Screenshot: Rejection modal with reason
- [ ] Screenshot: Supplier portal unlocked after verification
- [ ] Curl output logs

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Pending queue | Lists KYC_SUBMITTED suppliers |
| KYC view | Shows all supplier details and docs |
| Verify action | Status → ACTIVE |
| Reject action | Requires reason, stored correctly |
| Portal gating | Non-ACTIVE suppliers blocked |
| Portal unlock | ACTIVE suppliers have full access |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: NO**

This ticket is SuperAdmin + Supplier Portal functionality. Retailer Dashboard is not affected.
