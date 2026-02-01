# RET-WEB-001 — Retailer Web Store Registration

**Category:** RETAILER DASHBOARD FLOW (SECONDARY)

**Scope:** Retailer Web + Backend

---

## Implement

- Same fields + documents as POS onboarding
- Creates store in **DRAFT**
- No POS access yet

---

## Acceptance

- [ ] Store exists but inactive
- [ ] No SELL / POS access

---

## A) Existing Code Audit (before implementation)

### rg searches ran:

```bash
rg "RegisterPage|register" --type tsx -l
rg "createStore|store.*register" --type ts -l
rg "DRAFT|draft" --type ts -l
```

### Current flow summary:

**Retailer Dashboard (`retailer-admin/src/pages/RegisterPage.tsx`):**
- Registration page exists
- Collects: store name, address, location
- Missing: store_type, GSTIN, owner details, documents, UPI

**Current Backend (`backend/src/routes/v1/retailer-admin/auth.ts`):**
- Store creation endpoint exists
- Creates store in `active` status (not DRAFT)
- No document upload
- No KYC fields

**Current Fields Collected:**
| Field | Collected? |
|-------|------------|
| Store name | YES |
| Address | YES |
| Location (GPS) | YES |
| Store type | NO |
| GSTIN | NO |
| Owner name | NO |
| Owner phone | YES (for OTP) |
| Owner email | NO |
| Aadhaar | NO |
| GST certificate | NO |
| Owner selfie | NO |
| UPI address | NO |

### Gaps vs plan:

- [ ] **Missing fields**: store_type, GSTIN, owner_name, email
- [ ] **No documents**: Aadhaar, GST cert, selfie not collected
- [ ] **No UPI**: Payment details not collected
- [ ] **Wrong initial status**: Creates as `active`, should be `DRAFT`
- [ ] **No step-by-step**: Current is single form, plan wants wizard

### Retailer Dashboard already covers part of this ticket?

**YES** — `RegisterPage.tsx` exists but needs significant enhancement:
- Add missing fields
- Add document upload
- Add multi-step wizard
- Change initial status to DRAFT

---

## B) Implementation Subtickets (UI→API→DB)

### B.1) UI Subtickets

#### B.1.1) Retailer Dashboard Screens
- [ ] **RET-WEB-001-UI-1**: Registration wizard container
  - File: `retailer-admin/src/pages/RegisterPage.tsx` (MODIFY)
  - Convert to multi-step wizard
  - Steps: Details → Documents → Payments → Review

- [ ] **RET-WEB-001-UI-2**: Step 1 - Store & Owner Details
  - File: `retailer-admin/src/components/registration/StoreDetailsStep.tsx` (NEW)
  - Fields: store_name, full_address, location (map picker), store_type, gstin
  - Owner: name, phone (with OTP), email
  - Store type dropdown with "Other" option

- [ ] **RET-WEB-001-UI-3**: Step 2 - Document Upload
  - File: `retailer-admin/src/components/registration/DocumentsStep.tsx` (NEW)
  - Aadhaar upload (drag-drop or file select)
  - GST certificate upload
  - Owner selfie (webcam capture or upload)

- [ ] **RET-WEB-001-UI-4**: Step 3 - Payments (can be later)
  - File: `retailer-admin/src/components/registration/PaymentsStep.tsx` (NEW)
  - UPI address (mandatory)
  - Bank details (optional)
  - Note: This step optional in DRAFT flow, can complete after device binding

- [ ] **RET-WEB-001-UI-5**: Review & Submit
  - File: `retailer-admin/src/components/registration/ReviewStep.tsx` (NEW)
  - Summary of all entered data
  - Terms acceptance
  - Submit creates store in DRAFT

### B.2) API Subtickets

#### B.2.1) Store Registration Endpoint
- [ ] **RET-WEB-001-API-REG**: `POST /api/v1/retailer-admin/register-store`
  - File: `backend/src/routes/v1/retailer-admin/auth.ts` (MODIFY)
  - Request: Same as RET-POS-001 (store details + owner)
  - Creates store in DRAFT status (not active)
  - Returns store_id

#### B.2.2) Document Upload
- [ ] **RET-WEB-001-API-DOCS**: `POST /api/v1/retailer-admin/stores/:id/documents`
  - File: `backend/src/routes/v1/retailer-admin/documents.ts` (NEW)
  - Multipart upload for Aadhaar, GST, selfie
  - Updates kyc_complete flag when all uploaded
  - Advances status to KYC_SUBMITTED if was DRAFT

#### B.2.3) Payment Setup
- [ ] **RET-WEB-001-API-PAY**: Reuse RET-WEB-003 endpoint
  - Same as `POST /api/v1/retailer-admin/stores/:id/payments`

### B.3) DB/Migration Subtickets

#### B.3.1) Reuse migrations from RET-POS-001
- `071_store_registration_fields.sql`
- `072_store_documents.sql`
- `073_store_payment_details.sql`

No additional migrations needed — same DB schema as POS.

---

## C) Deployment Subtickets (VM)

### Services to rebuild:

| Service | Rebuild Required | Reason |
|---------|------------------|--------|
| `main-backend` | YES | Modified registration endpoint |
| `api-gateway` | NO | Existing routes |
| `retailer-admin` | YES | New registration wizard |
| `nginx` | NO | No changes |

### Deploy commands:

```bash
# On VM (34.14.220.171)
cd /opt/supermandi

# 1. Rebuild backend
docker compose -f docker-compose.prod.yml up -d --build main-backend

# 2. Rebuild Retailer Admin
cd /opt/supermandi/retailer-admin && npm run build
cp -r dist/* /var/www/retailer-admin/
```

---

## D) Verification Proof (must be attached per ticket)

### D.1) Curl Proof

```bash
# Register store via web
curl -X POST https://supermandi.tech/api/v1/retailer-admin/register-store \
  -H "Content-Type: application/json" \
  -d '{
    "store_name": "Web Kirana Store",
    "address": "456 Market Road, Delhi",
    "location": { "lat": 28.6139, "lng": 77.2090 },
    "store_type": "Grocery",
    "gstin": "07AABCU9603R1ZX",
    "owner_name": "Amit Sharma",
    "phone": "+919876543211",
    "email": "amit@test.com"
  }'
# Expected: 201 { "store_id": "uuid", "status": "DRAFT" }

# Upload documents
curl -X POST https://supermandi.tech/api/v1/retailer-admin/stores/STORE_ID/documents \
  -H "Authorization: Bearer USER_TOKEN" \
  -F "aadhaar=@/path/to/aadhaar.jpg" \
  -F "gst_certificate=@/path/to/gst.pdf" \
  -F "owner_selfie=@/path/to/selfie.jpg"
# Expected: 200 { "status": "KYC_SUBMITTED" }

# Verify store is in DRAFT/KYC_SUBMITTED (not ACTIVE)
curl -X GET https://supermandi.tech/api/v1/retailer-admin/stores/STORE_ID \
  -H "Authorization: Bearer USER_TOKEN"
# Expected: 200 { "id": "...", "status": "DRAFT|KYC_SUBMITTED", ... }
```

### D.2) Real-user Proof

1. **Go to registration page:**
   - Navigate to `https://supermandi.tech/retailer/register`
   - See multi-step wizard

2. **Complete Step 1:**
   - Fill all store details
   - Select store type
   - Enter GSTIN
   - Verify phone via OTP

3. **Complete Step 2:**
   - Upload Aadhaar image
   - Upload GST certificate
   - Take/upload selfie

4. **Complete Step 3 (optional):**
   - Enter UPI address
   - Skip bank details

5. **Submit:**
   - Review all data
   - Accept terms
   - Submit
   - See "Registration submitted" message
   - Redirected to status page showing DRAFT

6. **No POS access:**
   - Cannot generate enrollment codes
   - Must bind device first

### D.3) Evidence Required
- [ ] Screenshot: Registration wizard Step 1
- [ ] Screenshot: Registration wizard Step 2 (documents)
- [ ] Screenshot: Registration wizard Step 3 (payments)
- [ ] Screenshot: Successful registration message
- [ ] Screenshot: Status page showing DRAFT
- [ ] DB query: Store in DRAFT status
- [ ] Curl output logs

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Wizard flow | All steps completable |
| Phone OTP | Firebase OTP works |
| Document upload | Files upload to storage |
| DRAFT status | Store created in DRAFT (not active) |
| No POS access | Cannot use SELL features |
| Field parity | Same fields as POS onboarding |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: YES**

### Files touched in retailer-admin:
- `retailer-admin/src/pages/RegisterPage.tsx` — Major rewrite (wizard)
- `retailer-admin/src/components/registration/` — NEW directory with step components
- `retailer-admin/src/App.tsx` — Route already exists
- `retailer-admin/src/lib/api.ts` — Add document upload API calls

### Routes touched:
- `/register` — Modified (now wizard)

### API calls added:
- `POST /api/v1/retailer-admin/register-store` — Modified
- `POST /api/v1/retailer-admin/stores/:id/documents` — NEW
