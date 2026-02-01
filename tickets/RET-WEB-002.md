# RET-WEB-002 — POS Device Activation via Code

**Category:** RETAILER DASHBOARD FLOW (SECONDARY)

**Scope:** Retailer Web + Backend

---

## Implement

- Retailer enters activation code shown on POS device
- Backend validates:
  - code exists
  - not expired
  - unused
- Bind device to store
- Update store status → **ENROLLED**

---

## Acceptance

- [ ] Without valid code, activation blocked
- [ ] Code usable only once

---

## A) Existing Code Audit (before implementation)

### rg searches ran:

```bash
rg "activation.*code|code.*activation" --type ts -l
rg "device.*bind|bind.*device" --type ts -l
rg "ENROLLED|enrolled" --type ts -l
```

### Current flow summary:

**Current flow is REVERSED:**
- SuperAdmin generates enrollment code
- User enters code on POS device
- Device binds to store

**Plan requires:**
- POS generates activation code
- User enters code on Retailer Dashboard
- Device binds to store

**Relevant existing code:**
- `backend/src/routes/v1/pos/enroll.ts` — Current enrollment logic
- `retailer-admin/` — No device activation page

### Gaps vs plan:

- [ ] **Flow reversal**: Need new flow (POS generates, Web enters)
- [ ] **No activation page in Dashboard**: Must create DeviceActivationPage
- [ ] **No code validation endpoint**: Need new API for web-side validation
- [ ] **Status transition**: Need DRAFT → ENROLLED transition on bind

### Retailer Dashboard already covers part of this ticket?

**NO** — Retailer Dashboard has no device management currently. This is entirely new functionality for web.

---

## B) Implementation Subtickets (UI→API→DB)

### B.1) UI Subtickets

#### B.1.1) Retailer Dashboard Screens
- [ ] **RET-WEB-002-UI-1**: Device Activation Page
  - File: `retailer-admin/src/pages/DeviceActivationPage.tsx` (NEW)
  - Route: `/devices/activate`
  - Input: "Enter activation code from your POS device"
  - Format hint: "Code format: SM-XXXX-XX"
  - Validation: Check format before submit
  - Error states: Invalid, expired, already used

- [ ] **RET-WEB-002-UI-2**: Device Management Page
  - File: `retailer-admin/src/pages/DevicesPage.tsx` (NEW)
  - Route: `/devices`
  - List bound devices
  - "Add Device" button → DeviceActivationPage
  - Show device status, last seen

- [ ] **RET-WEB-002-UI-3**: Sidebar navigation
  - File: `retailer-admin/src/components/Sidebar.tsx` (MODIFY)
  - Add "Devices" menu item (visible for DRAFT stores)

### B.2) API Subtickets

#### B.2.1) Activate Device Endpoint
- [ ] **RET-WEB-002-API-ACTIVATE**: `POST /api/v1/retailer-admin/activate-device`
  - File: `backend/src/routes/v1/retailer-admin/devices.ts` (NEW)
  - Request: `{ activation_code: string }`
  - Auth: Requires retailer JWT (gets store_id from token)
  - Validation:
    - Code exists in `pos.device_activation_codes`
    - Code not expired (expires_at > NOW)
    - Code not used (used_at IS NULL)
  - On success:
    - Mark code as used (used_at = NOW)
    - Create device in `pos.pos_devices`
    - Link device to store (bound_store_id)
    - Advance store status: DRAFT → ENROLLED
    - Set device_bound = true on store
  - Response: `{ device_id: string, store: { id, status, device_bound } }`

#### B.2.2) List Devices Endpoint
- [ ] **RET-WEB-002-API-LIST**: `GET /api/v1/retailer-admin/devices`
  - File: `backend/src/routes/v1/retailer-admin/devices.ts`
  - Returns all devices bound to current store
  - Response: `[{ id, fingerprint, last_seen, created_at }]`

### B.3) DB/Migration Subtickets

#### B.3.1) Reuse from POS-DEV-001
- `070_device_activation_codes.sql` — Already creates the table

No additional migrations needed.

---

## C) Deployment Subtickets (VM)

### Services to rebuild:

| Service | Rebuild Required | Reason |
|---------|------------------|--------|
| `main-backend` | YES | New device endpoints |
| `api-gateway` | YES | New routes |
| `retailer-admin` | YES | Device activation page |
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
# Prerequisite: POS has generated code SM-A7K2-91

# Activate device
curl -X POST https://supermandi.tech/api/v1/retailer-admin/activate-device \
  -H "Authorization: Bearer RETAILER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"activation_code": "SM-A7K2-91"}'
# Expected: 200 {
#   "device_id": "uuid",
#   "store": { "id": "uuid", "status": "ENROLLED", "device_bound": true }
# }

# Try same code again (should fail)
curl -X POST https://supermandi.tech/api/v1/retailer-admin/activate-device \
  -H "Authorization: Bearer RETAILER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"activation_code": "SM-A7K2-91"}'
# Expected: 400 { "error": "Code already used" }

# Try invalid code
curl -X POST https://supermandi.tech/api/v1/retailer-admin/activate-device \
  -H "Authorization: Bearer RETAILER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"activation_code": "SM-XXXX-XX"}'
# Expected: 404 { "error": "Code not found" }

# Try expired code
# Expected: 400 { "error": "Code expired" }

# List devices
curl -X GET https://supermandi.tech/api/v1/retailer-admin/devices \
  -H "Authorization: Bearer RETAILER_TOKEN"
# Expected: 200 [{ "id": "uuid", "fingerprint": "...", "last_seen": "..." }]
```

### D.2) Real-user Proof

1. **POS generates code:**
   - Fresh POS shows activation code: SM-A7K2-91
   - Timer counting down

2. **Retailer goes to Dashboard:**
   - Login to `https://supermandi.tech/retailer/`
   - Navigate to Devices → Add Device

3. **Enter activation code:**
   - Type code: SM-A7K2-91
   - Click Activate
   - See success: "Device activated!"

4. **Store status updated:**
   - Store status now ENROLLED
   - device_bound = true

5. **POS detects binding:**
   - POS polling sees code was used
   - POS transitions to authenticated state
   - Shows store name

6. **Code cannot be reused:**
   - Try same code again
   - Error: "Code already used"

### D.3) Evidence Required
- [ ] Screenshot: Device activation page
- [ ] Screenshot: Code entry form
- [ ] Screenshot: Success message
- [ ] Screenshot: Device list with new device
- [ ] Screenshot: Store status = ENROLLED
- [ ] Curl output logs

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Code validation | Invalid format rejected on frontend |
| Code activation | Valid code binds device |
| Status transition | Store advances DRAFT → ENROLLED |
| Single use | Second attempt fails |
| Expired rejection | Expired codes rejected |
| Device listed | Device appears in devices list |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: YES**

### Files touched in retailer-admin:
- `retailer-admin/src/pages/DeviceActivationPage.tsx` — NEW
- `retailer-admin/src/pages/DevicesPage.tsx` — NEW
- `retailer-admin/src/App.tsx` — Add routes
- `retailer-admin/src/components/Sidebar.tsx` — Add menu item
- `retailer-admin/src/lib/api.ts` — Add API calls

### Routes touched:
- `/devices` — NEW route
- `/devices/activate` — NEW route

### API calls added:
- `POST /api/v1/retailer-admin/activate-device`
- `GET /api/v1/retailer-admin/devices`
