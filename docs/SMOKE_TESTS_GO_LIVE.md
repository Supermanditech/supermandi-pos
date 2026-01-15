# Go-Live Smoke Tests

> Generated: 2026-01-15
> QA-001: End-to-end smoke tests (API + App) before APK build

---

## Prerequisites

```bash
# Set environment
export API_URL="http://localhost:3000"
export ADMIN_TOKEN="your-admin-token"

# Verify connectivity
curl -s "$API_URL/health" | jq .
```

---

## API Smoke Tests

### 1. Create Store

```bash
STORE_RESP=$(curl -s -X POST "$API_URL/api/v1/admin/stores" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "storeName": "Smoke Test Store",
    "phone": "+919876543210",
    "city": "Mumbai",
    "state": "Maharashtra"
  }')

echo "$STORE_RESP" | jq '.'

# Expected keys:
# - store.id (UUID)
# - store.name ("Smoke Test Store")
# - store.storeCode (e.g., "TE260115-001")

STORE_ID=$(echo "$STORE_RESP" | jq -r '.store.id // .id')
STORE_CODE=$(echo "$STORE_RESP" | jq -r '.store.storeCode // .storeCode')
echo "Store ID: $STORE_ID"
echo "Store Code: $STORE_CODE"
```

### 2. Create Store User

```bash
USER_RESP=$(curl -s -X POST "$API_URL/api/v1/admin/stores/$STORE_ID/users" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "smoketest@example.com",
    "name": "Smoke Test User",
    "role": "store_admin"
  }')

echo "$USER_RESP" | jq '.'

# Expected keys:
# - user.id
# - user.email
# - user.role
```

### 3. Create Enrollment Code

```bash
ENROLL_RESP=$(curl -s -X POST "$API_URL/api/v1/admin/stores/$STORE_ID/device-enrollments" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json")

echo "$ENROLL_RESP" | jq '.'

# Expected keys:
# - code (e.g., "SM-ABC123")
# - expiresAt (ISO timestamp)
# - maxUses (1 for production, 9999 for demo)
# - isDemo (boolean)
# - qrPayload (deep link URL)

ENROLL_CODE=$(echo "$ENROLL_RESP" | jq -r '.code')
echo "Enrollment Code: $ENROLL_CODE"
```

### 4. Enroll Device

```bash
DEVICE_RESP=$(curl -s -X POST "$API_URL/api/v1/pos/enroll" \
  -H "Content-Type: application/json" \
  -d "{
    \"code\": \"$ENROLL_CODE\",
    \"deviceMeta\": {
      \"label\": \"Smoke-Test-Device\",
      \"deviceType\": \"RETAILER_PHONE\",
      \"manufacturer\": \"Samsung\",
      \"model\": \"Galaxy A52\",
      \"androidVersion\": \"12\",
      \"appVersion\": \"3.0.11\",
      \"printingMode\": \"NONE\",
      \"deviceFingerprint\": \"fp_smoke_test_$(date +%s)\"
    }
  }")

echo "$DEVICE_RESP" | jq '.'

# Expected keys:
# - deviceId (UUID)
# - storeId (UUID, matches $STORE_ID)
# - storeName ("Smoke Test Store") ← GO-LIVE KEY
# - storeCode (e.g., "TE260115-001") ← GO-LIVE KEY
# - deviceToken (64-char hex)
# - storeActive (boolean)
# - reEnrolled (boolean, false for new)

DEVICE_ID=$(echo "$DEVICE_RESP" | jq -r '.deviceId')
DEVICE_TOKEN=$(echo "$DEVICE_RESP" | jq -r '.deviceToken')
STORE_NAME=$(echo "$DEVICE_RESP" | jq -r '.storeName')

echo "---"
echo "Device ID: $DEVICE_ID"
echo "Device Token: ${DEVICE_TOKEN:0:16}..."
echo "Store Name: $STORE_NAME"
```

### 5. Verify ui-status

```bash
UI_STATUS=$(curl -s "$API_URL/api/v1/pos/ui-status" \
  -H "X-Device-Token: $DEVICE_TOKEN")

echo "$UI_STATUS" | jq '.'

# Expected keys:
# - storeId (UUID)
# - storeName ← GO-LIVE KEY
# - storeCode ← GO-LIVE KEY
# - storeActive (boolean)
# - deviceActive (boolean)
# - pendingOutboxCount (number)
# - features.buyEnabled (boolean)
# - features.reorderEnabled (boolean)

echo "---"
echo "Store Name from ui-status: $(echo "$UI_STATUS" | jq -r '.storeName')"
echo "Store Code from ui-status: $(echo "$UI_STATUS" | jq -r '.storeCode')"
```

### 6. Demo Multi-Use Test

```bash
# Get or create demo store
DEMO_STORE_ID=$(curl -s "$API_URL/api/v1/admin/stores" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | \
  jq -r '.stores[] | select(.is_demo == true or (.storeCode | test("demo|qa"; "i"))) | .id' | head -1)

if [ -z "$DEMO_STORE_ID" ]; then
  echo "Creating demo store..."
  DEMO_CREATE=$(curl -s -X POST "$API_URL/api/v1/admin/stores" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"storeName": "Demo Store QA", "is_demo": true}')
  DEMO_STORE_ID=$(echo "$DEMO_CREATE" | jq -r '.store.id // .id')
fi

echo "Demo Store ID: $DEMO_STORE_ID"

# Create demo enrollment
DEMO_CODE_RESP=$(curl -s -X POST "$API_URL/api/v1/admin/stores/$DEMO_STORE_ID/device-enrollments" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
DEMO_CODE=$(echo "$DEMO_CODE_RESP" | jq -r '.code')
DEMO_MAX=$(echo "$DEMO_CODE_RESP" | jq -r '.maxUses')

echo "Demo Code: $DEMO_CODE"
echo "Max Uses: $DEMO_MAX (expect 9999)"

# First enrollment
curl -s -X POST "$API_URL/api/v1/pos/enroll" \
  -H "Content-Type: application/json" \
  -d "{
    \"code\": \"$DEMO_CODE\",
    \"deviceMeta\": {
      \"label\": \"Demo-Multi-1\",
      \"deviceType\": \"RETAILER_PHONE\",
      \"deviceFingerprint\": \"fp_demo_multi_1_$(date +%s)\"
    }
  }" | jq '{status: "first_enroll", deviceId, storeName}'

# Second enrollment (MUST succeed for demo)
curl -s -X POST "$API_URL/api/v1/pos/enroll" \
  -H "Content-Type: application/json" \
  -d "{
    \"code\": \"$DEMO_CODE\",
    \"deviceMeta\": {
      \"label\": \"Demo-Multi-2\",
      \"deviceType\": \"RETAILER_PHONE\",
      \"deviceFingerprint\": \"fp_demo_multi_2_$(date +%s)\"
    }
  }" | jq '{status: "second_enroll", deviceId, storeName}'

# Expected: Both succeed with different deviceIds
```

### 7. Production Single-Use Test

```bash
# Use the production store from test 1
PROD_CODE_RESP=$(curl -s -X POST "$API_URL/api/v1/admin/stores/$STORE_ID/device-enrollments" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
PROD_CODE=$(echo "$PROD_CODE_RESP" | jq -r '.code')
PROD_MAX=$(echo "$PROD_CODE_RESP" | jq -r '.maxUses')

echo "Prod Code: $PROD_CODE"
echo "Max Uses: $PROD_MAX (expect 1)"

# First enrollment (should succeed)
echo "First enrollment:"
curl -s -X POST "$API_URL/api/v1/pos/enroll" \
  -H "Content-Type: application/json" \
  -d "{
    \"code\": \"$PROD_CODE\",
    \"deviceMeta\": {
      \"label\": \"Prod-Single-1\",
      \"deviceType\": \"RETAILER_PHONE\",
      \"deviceFingerprint\": \"fp_prod_single_1_$(date +%s)\"
    }
  }" | jq '{deviceId, storeName, error}'

# Second enrollment (MUST fail for production)
echo "Second enrollment (expect 409):"
curl -s -w "\nHTTP: %{http_code}" -X POST "$API_URL/api/v1/pos/enroll" \
  -H "Content-Type: application/json" \
  -d "{
    \"code\": \"$PROD_CODE\",
    \"deviceMeta\": {
      \"label\": \"Prod-Single-2\",
      \"deviceType\": \"RETAILER_PHONE\",
      \"deviceFingerprint\": \"fp_prod_single_2_$(date +%s)\"
    }
  }" | head -1 | jq '{error}'

# Expected: First succeeds, second returns 409 ENROLLMENT_CODE_USED
```

---

## App Manual Tests

### Test A: Enter SM-DEMO02

1. Install fresh POS APK
2. On enrollment screen, enter: `SM-DEMO02`
3. Fill device label: `Demo-Phone-1`
4. Select device type: `RETAILER_PHONE`
5. Tap "Enroll"

**Expected:**
- Enrollment succeeds
- App navigates to main POS screen
- No "code already used" error (even if SM-DEMO02 was used before)

### Test B: Verify Store Name Display

1. After enrollment, tap Menu icon
2. Look at header area

**Expected:**
- Store name displayed (e.g., "Demo Store QA")
- Store code displayed (e.g., "DM260115-001")

### Test C: Block Device Test

1. In SuperAdmin, block the device
2. Wait 15 seconds (ui-status poll)
3. Observe app behavior

**Expected:**
- App shows "Device blocked" message or redirects to blocked screen
- Cannot access POS functionality

### Test D: Offline Store Name

1. Complete enrollment
2. Note store name
3. Enable airplane mode
4. Force close and reopen app

**Expected:**
- Store name still displays (persisted in AsyncStorage)

---

## Expected JSON Keys Reference

### Enrollment Response
```json
{
  "deviceId": "uuid",
  "storeId": "uuid",
  "storeName": "string",     // ← GO-LIVE
  "storeCode": "string",     // ← GO-LIVE
  "deviceToken": "hex64",
  "storeActive": true,
  "reEnrolled": false
}
```

### ui-status Response
```json
{
  "storeId": "uuid",
  "storeName": "string",     // ← GO-LIVE
  "storeCode": "string",     // ← GO-LIVE
  "storeActive": true,
  "deviceActive": true,
  "pendingOutboxCount": 0,
  "printerOk": null,
  "features": {
    "buyEnabled": true,
    "reorderEnabled": false,
    "scan_lookup_v2": true
  }
}
```

### Admin Enrollment Response
```json
{
  "code": "SM-XXXXXX",
  "expiresAt": "2026-01-15T12:30:00.000Z",
  "maxUses": 9999,           // 9999 for demo, 1 for production
  "isDemo": true,            // true if demo store detected
  "qrPayload": "supermandi://enroll?code=SM-XXXXXX"
}
```

---

## Quick Pass/Fail Checklist

| Test | Pass Criteria |
|------|---------------|
| Create store | Returns `storeCode` |
| Create enrollment | Returns `code`, `maxUses`, `isDemo` |
| Enroll device | Returns `storeName`, `storeCode` |
| ui-status | Returns `storeName`, `storeCode` |
| Demo multi-use | Second enroll succeeds (200) |
| Production single-use | Second enroll fails (409) |
| App enrollment | Shows store name after enroll |
| App menu | Displays store name/code |
| App offline | Store name persists |

---

## Troubleshooting

### "Enrollment code not found"
- Check code exists in DB: `SELECT * FROM pos_device_enrollments WHERE code = 'SM-XXX'`
- Check code is not revoked: `revoked_at IS NULL`

### "Enrollment code already used" (for demo)
- Check store.is_demo: `SELECT is_demo FROM stores WHERE id = '...'`
- Check isDemoStoreCode detection: store_code should match demo patterns
- Run migration 015 to fix existing demo enrollments

### "Store name not showing"
- Check enroll response includes `storeName`
- Check ui-status response includes `storeName`
- Check settingsStore persistence (version v2)

### Second device enrolls on production (shouldn't)
- Check enrollment `max_uses = 1`
- Check store `is_demo = FALSE`
- Check store_code doesn't match demo patterns
