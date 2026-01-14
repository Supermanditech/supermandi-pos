# PROV-007: New Store Golden Path Test

## Overview
This checklist validates the complete "zero-seed functional store" provisioning flow from store creation to first sale.

---

## Prerequisites

1. **Backend Services Running**:
   - api-gateway (port 3000)
   - auth-service (port 3001)
   - platform-service (port 3002)
   - inventory-service (port 3003)
   - order-service (port 3004)
   - supplier-service (port 3005)
   - catalog-service (port 3006)
   - reorder-service (port 3007)

2. **Database Migrated**:
   - PROV-001 migration applied (`prov-001-enhance-devices.sql`)

3. **SUPERADMIN Token**:
   - Obtain a valid SUPERADMIN JWT token for API calls

---

## Test Flow

### Step 1: Create New Store

```bash
# Replace {SUPERADMIN_TOKEN} with actual token
curl -X POST http://localhost:3000/platform/admin/stores \
  -H "Authorization: Bearer {SUPERADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Kirana Store",
    "code": "TKS-001",
    "phone": "9876543210",
    "timezone": "Asia/Kolkata",
    "currency": "INR"
  }'
```

**Expected**:
- [ ] Response status 201
- [ ] Response contains `id`, `name`, `code`, `status: "active"`

**Save**: Store ID as `{STORE_ID}`

---

### Step 2: Create Store User (STORE_ADMIN)

```bash
curl -X POST http://localhost:3000/auth/admin/stores/{STORE_ID}/users \
  -H "Authorization: Bearer {SUPERADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Store Owner",
    "phone": "9876543210",
    "pin": "1234",
    "role": "STORE_ADMIN"
  }'
```

**Expected**:
- [ ] Response status 201
- [ ] Response contains `id`, `name`, `phone`, `role`, `storeId`

---

### Step 3: Generate Device Enrollment Code

```bash
curl -X POST http://localhost:3000/platform/admin/stores/{STORE_ID}/device-enrollments \
  -H "Authorization: Bearer {SUPERADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "expiresInMinutes": 30,
    "label": "Counter-1"
  }'
```

**Expected**:
- [ ] Response status 201
- [ ] Response contains `id`, `code` (format: SM-XXXXXX), `expiresAt`, `qrPayload`

**Save**: Enrollment code as `{ENROLLMENT_CODE}`

---

### Step 4: Enroll Device (POS App)

**On POS App**:
1. Launch app
2. Navigate to EnrollDeviceScreen
3. Enter or scan `{ENROLLMENT_CODE}`
4. Fill device label: "Counter-1"
5. Select device type: "RETAILER_PHONE"
6. Tap "Enroll"

**Expected**:
- [ ] Enrollment succeeds
- [ ] App navigates to main POS screen
- [ ] Store name shows in status bar

**API Verification**:
```bash
curl http://localhost:3000/platform/admin/stores/{STORE_ID}/devices \
  -H "Authorization: Bearer {SUPERADMIN_TOKEN}"
```

- [ ] Device appears in list with `status: "active"`

---

### Step 5: Verify Empty State Screens

Navigate through each tab and verify empty states:

**SELL Tab**:
- [ ] Shows scanner interface
- [ ] Scanning unknown barcode triggers "Product not found" flow
- [ ] No crashes with zero products

**BUY Tab**:
- [ ] Shows "No products available" empty state
- [ ] Displays action CTAs (Add product, etc.)

**REORDER Tab** (if enabled):
- [ ] Shows "All caught up!" empty state
- [ ] "No pending reorders at this time" message

**MENU Tab**:
- [ ] Settings accessible
- [ ] Store info displayed correctly

---

### Step 6: Verify Feature Flags

```bash
curl http://localhost:3000/platform/stores/{STORE_ID}/flags \
  -H "Authorization: Bearer {SUPERADMIN_TOKEN}"
```

**Expected**:
- [ ] `buyEnabled: true` (default)
- [ ] `reorderEnabled: false` (default for new stores)

**In App**:
- [ ] BUY tab visible
- [ ] REORDER tab shows "OFF" indicator

---

### Step 7: Test Store User Login (Optional - if using staff login)

```bash
curl -X POST http://localhost:3000/auth/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "9876543210",
    "password": "1234"
  }'
```

**Expected**:
- [ ] Response contains `accessToken`, `refreshToken`
- [ ] `user.actorType` is "store"
- [ ] `user.actorId` matches `{STORE_ID}`

---

### Step 8: Reports Screen (Empty State)

Navigate to Reports:
- [ ] Stock Statement shows "No products"
- [ ] Sales Statement shows "No sales data"
- [ ] No crashes

---

### Step 9: Block/Unblock Device

```bash
# Block device
curl -X POST http://localhost:3000/platform/admin/devices/{DEVICE_ID}/block \
  -H "Authorization: Bearer {SUPERADMIN_TOKEN}"
```

**In App**:
- [ ] App detects blocked status within 15 seconds
- [ ] App navigates to DeviceBlockedScreen
- [ ] Scanner and POS functions disabled

```bash
# Unblock device
curl -X POST http://localhost:3000/platform/admin/devices/{DEVICE_ID}/unblock \
  -H "Authorization: Bearer {SUPERADMIN_TOKEN}"
```

**In App**:
- [ ] Re-launch app
- [ ] App loads normally after unblock

---

### Step 10: Clean Up (Optional)

```bash
# Delete test store
curl -X DELETE http://localhost:3000/platform/admin/stores/{STORE_ID} \
  -H "Authorization: Bearer {SUPERADMIN_TOKEN}"
```

---

## Test Results

| Step | Status | Notes |
|------|--------|-------|
| 1. Create Store | [ ] Pass / [ ] Fail | |
| 2. Create User | [ ] Pass / [ ] Fail | |
| 3. Generate Enrollment | [ ] Pass / [ ] Fail | |
| 4. Enroll Device | [ ] Pass / [ ] Fail | |
| 5. Empty States | [ ] Pass / [ ] Fail | |
| 6. Feature Flags | [ ] Pass / [ ] Fail | |
| 7. Store Login | [ ] Pass / [ ] Fail | |
| 8. Reports Empty | [ ] Pass / [ ] Fail | |
| 9. Block/Unblock | [ ] Pass / [ ] Fail | |
| 10. Clean Up | [ ] Pass / [ ] Fail | |

---

## Troubleshooting

### Enrollment Code Invalid
- Check code format (SM-XXXXXX)
- Verify code hasn't expired (default 10 min)
- Verify code hasn't been used

### Device Not Appearing
- Check enrollment was successful
- Verify store_id matches
- Check pos_devices table directly

### Feature Flags Not Syncing
- Verify platform-service is running
- Check /api/v1/pos/ui-status endpoint
- Clear app storage and re-enroll

### App Stuck on Loading
- Check network connectivity
- Verify all backend services are running
- Check device token is valid

---

## Version

- Document Version: 1.0
- Compatible with: SuperMandi POS v3.0.10+
- Last Updated: 2026-01-14
