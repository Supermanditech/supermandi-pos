# RET-WEB-003 — Payments Setup on Web

**Category:** RETAILER DASHBOARD FLOW (SECONDARY)

**Scope:** Retailer Web + Backend

---

## Implement

- Collect UPI + bank details
- Update store status → `PAYMENTS_SUBMITTED`

---

## Acceptance

- [ ] Store status updated to PAYMENTS_SUBMITTED after payment details submission

---

## A) Existing Code Audit (before implementation)

### rg searches ran:

```bash
rg "upi|UPI" --type ts -l
rg "bank.*details|payment.*setup" --type ts -l
rg "PAYMENTS_SUBMITTED" --type ts -l
```

### Current flow summary:

**Retailer Dashboard:**
- No dedicated payments setup page
- Settings page may have some payment fields
- No UPI address collection currently

**Backend:**
- `platform.stores` has no upi_address column currently
- No payment setup endpoint

**Existing Related:**
- Supplier portal has KYC/bank details (`supplier-portal/src/app/(dashboard)/kyc/`)
- Can reference for UI patterns

### Gaps vs plan:

- [ ] **No UPI field**: Not in stores table or UI
- [ ] **No bank fields**: account, IFSC, bank name missing
- [ ] **No status transition**: PAYMENTS_SUBMITTED status logic not implemented
- [ ] **No validation**: UPI format validation not implemented

### Retailer Dashboard already covers part of this ticket?

**NO** — No payment setup functionality exists in Retailer Dashboard currently.

---

## B) Implementation Subtickets (UI→API→DB)

### B.1) UI Subtickets

#### B.1.1) Retailer Dashboard Screens
- [ ] **RET-WEB-003-UI-1**: Payments Setup Page
  - File: `retailer-admin/src/pages/PaymentsPage.tsx` (NEW)
  - Route: `/payments` or `/settings/payments`
  - Fields:
    - UPI Address (mandatory) with format validation
    - Bank Account Number (optional)
    - Bank IFSC Code (optional)
    - Bank Name (auto-fill from IFSC if possible)
  - Save button
  - Show current saved details

- [ ] **RET-WEB-003-UI-2**: UPI Validation Component
  - File: `retailer-admin/src/components/UpiInput.tsx` (NEW)
  - Real-time format validation
  - Format: `name@bank` or VPA format
  - Show valid/invalid indicator

- [ ] **RET-WEB-003-UI-3**: Onboarding prompt
  - If store status is KYC_SUBMITTED, show prompt to complete payments
  - In dashboard or as banner

### B.2) API Subtickets

#### B.2.1) Payment Setup Endpoint
- [ ] **RET-WEB-003-API-SAVE**: `POST /api/v1/retailer-admin/stores/:id/payments`
  - File: `backend/src/routes/v1/retailer-admin/payments.ts` (NEW)
  - Request:
    ```json
    {
      "upi_address": "storename@upi",
      "bank_account_number": "1234567890",
      "bank_ifsc": "SBIN0001234",
      "bank_name": "State Bank of India"
    }
    ```
  - Validation:
    - UPI format: `^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$`
    - IFSC format: `^[A-Z]{4}0[A-Z0-9]{6}$`
  - Updates store record
  - If status was KYC_SUBMITTED → advance to PAYMENTS_SUBMITTED
  - Response: `{ store: { id, status, upi_address, ... } }`

#### B.2.2) Get Payment Details
- [ ] **RET-WEB-003-API-GET**: `GET /api/v1/retailer-admin/stores/:id/payments`
  - File: `backend/src/routes/v1/retailer-admin/payments.ts`
  - Returns current payment details
  - Mask bank account number (show last 4 digits)

### B.3) DB/Migration Subtickets

#### B.3.1) Reuse from RET-POS-001
- `073_store_payment_details.sql` — Already adds upi_address, bank fields

No additional migrations needed.

---

## C) Deployment Subtickets (VM)

### Services to rebuild:

| Service | Rebuild Required | Reason |
|---------|------------------|--------|
| `main-backend` | YES | New payment endpoints |
| `api-gateway` | YES | New routes |
| `retailer-admin` | YES | Payments page |
| `nginx` | NO | No changes |

### Deploy commands:

```bash
# On VM (34.14.220.171)
cd /opt/supermandi

# 1. Rebuild backend
docker compose -f docker-compose.prod.yml up -d --build main-backend api-gateway

# 2. Rebuild Retailer Admin
cd /opt/supermandi/retailer-admin && npm run build
cp -r dist/* /var/www/retailer-admin/
```

---

## D) Verification Proof (must be attached per ticket)

### D.1) Curl Proof

```bash
# Save payment details
curl -X POST https://supermandi.tech/api/v1/retailer-admin/stores/STORE_ID/payments \
  -H "Authorization: Bearer RETAILER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "upi_address": "mystore@upi",
    "bank_account_number": "1234567890",
    "bank_ifsc": "SBIN0001234",
    "bank_name": "State Bank of India"
  }'
# Expected: 200 { "store": { "id": "...", "status": "PAYMENTS_SUBMITTED", "upi_address": "mystore@upi" } }

# Get payment details
curl -X GET https://supermandi.tech/api/v1/retailer-admin/stores/STORE_ID/payments \
  -H "Authorization: Bearer RETAILER_TOKEN"
# Expected: 200 {
#   "upi_address": "mystore@upi",
#   "bank_account_number": "******7890",
#   "bank_ifsc": "SBIN0001234",
#   "bank_name": "State Bank of India"
# }

# Try invalid UPI format
curl -X POST https://supermandi.tech/api/v1/retailer-admin/stores/STORE_ID/payments \
  -H "Authorization: Bearer RETAILER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"upi_address": "invalid upi"}'
# Expected: 400 { "error": "Invalid UPI address format" }

# Verify status transition
curl -X GET https://supermandi.tech/api/v1/retailer-admin/stores/STORE_ID \
  -H "Authorization: Bearer RETAILER_TOKEN"
# Expected: 200 { "id": "...", "status": "PAYMENTS_SUBMITTED", "upi_complete": true }
```

### D.2) Real-user Proof

1. **Navigate to payments page:**
   - Login to Retailer Dashboard
   - Go to Settings → Payments (or /payments)
   - See empty form

2. **Enter UPI address:**
   - Type: mystore@upi
   - See valid indicator (green checkmark)

3. **Enter bank details (optional):**
   - Account number: 1234567890
   - IFSC: SBIN0001234
   - Bank name auto-fills (if implemented)

4. **Save:**
   - Click Save
   - See success message
   - Status bar shows PAYMENTS_SUBMITTED

5. **View saved details:**
   - Refresh page
   - See UPI: mystore@upi
   - See masked bank account: ******7890

6. **Invalid UPI rejected:**
   - Try: "invalid upi"
   - See error: "Invalid UPI format"

### D.3) Evidence Required
- [ ] Screenshot: Payments setup page
- [ ] Screenshot: UPI validation (valid state)
- [ ] Screenshot: UPI validation (invalid state)
- [ ] Screenshot: Success message after save
- [ ] Screenshot: Saved details displayed
- [ ] Screenshot: Store status = PAYMENTS_SUBMITTED
- [ ] Curl output logs

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| UPI validation | Invalid formats rejected |
| IFSC validation | Invalid IFSC rejected |
| Save success | Details saved to DB |
| Status transition | KYC_SUBMITTED → PAYMENTS_SUBMITTED |
| Get details | Returns saved data (masked bank account) |
| Update existing | Can update payment details |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: YES**

### Files touched in retailer-admin:
- `retailer-admin/src/pages/PaymentsPage.tsx` — NEW
- `retailer-admin/src/components/UpiInput.tsx` — NEW
- `retailer-admin/src/App.tsx` — Add route
- `retailer-admin/src/components/Sidebar.tsx` — Add menu item
- `retailer-admin/src/lib/api.ts` — Add API calls

### Routes touched:
- `/payments` — NEW route (or `/settings/payments`)

### API calls added:
- `POST /api/v1/retailer-admin/stores/:id/payments`
- `GET /api/v1/retailer-admin/stores/:id/payments`
