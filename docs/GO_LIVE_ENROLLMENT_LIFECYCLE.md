# Go-Live: Device Enrollment Lifecycle

> Generated: 2026-01-15
> ENROLL-002: Production-safe re-enrollment behavior for device reset/app reinstall (10k stores)

---

## Overview

This document describes the complete device enrollment lifecycle for SuperMandi POS, covering:
- New store provisioning
- Device enrollment
- Re-enrollment after app reinstall/device reset
- Code revocation vs device blocking
- Scaling considerations for 10k+ stores

---

## 1. Store Provisioning Flow

```
SuperAdmin Portal                     Platform DB
     |                                    |
     |  POST /admin/stores                |
     |  { storeName, phone, ... }         |
     |----------------------------------->|
     |                                    |
     |  201 Created                       |
     |  { id, name, storeCode }           |
     |<-----------------------------------|
     |                                    |
```

### Key Points:
- `storeCode` is auto-generated: `<PREFIX><YYMMDD>-<SEQ>` (e.g., `TE260115-001`)
- `storeName` comes from SuperAdmin, retailer cannot edit
- Store starts `active=true` by default
- Demo stores: `is_demo=true` OR storeCode matches demo patterns (`DM*`, `QA*`, `demo*`, etc.)

---

## 2. Device Enrollment Flow

```
POS App                    Backend                       DB
   |                          |                          |
   | POST /pos/enroll         |                          |
   | { code, deviceMeta }     |                          |
   |------------------------->|                          |
   |                          |  SELECT enrollment       |
   |                          |  WHERE code = $1         |
   |                          |------------------------->|
   |                          |                          |
   |                          |  Check: expired? used?   |
   |                          |  revoked? demo?          |
   |                          |                          |
   |                          |  INSERT/UPDATE device    |
   |                          |------------------------->|
   |                          |                          |
   |                          |  UPDATE enrollment       |
   |                          |  uses_count++            |
   |                          |------------------------->|
   |                          |                          |
   | 200 OK                   |                          |
   | { deviceId, deviceToken, |                          |
   |   storeId, storeName,    |                          |
   |   storeCode, storeActive}|                          |
   |<-------------------------|                          |
   |                          |                          |
   | Save to AsyncStorage     |                          |
   | (session + settings)     |                          |
```

### Enrollment Response Fields:
| Field | Description |
|-------|-------------|
| `deviceId` | UUID for this device |
| `deviceToken` | 64-char hex token for API auth |
| `storeId` | UUID of the store |
| `storeName` | Human-readable store name (from SuperAdmin) |
| `storeCode` | Human-readable store code (e.g., `TE260115-001`) |
| `storeActive` | Whether store is active |
| `reEnrolled` | True if this was a re-enrollment |

### Device Identity Strategy:

1. **Primary Key**: `deviceFingerprint` (persistent UUID stored in AsyncStorage)
2. **Secondary Key**: `label` (device name, scoped to store)

If a device with the same `deviceFingerprint` already exists for the store:
- Update the existing device record with new token
- Return `reEnrolled: true`
- This enables idempotent re-enrollment

---

## 3. Re-Enrollment After Reinstall/Reset

### Scenario: App Deleted and Reinstalled

```
1. User deletes POS app
2. Device loses: deviceToken, deviceId (AsyncStorage cleared)
3. Device keeps: nothing (fingerprint was in AsyncStorage)
4. SuperAdmin generates NEW enrollment code
5. User enters code in fresh app install
6. System creates NEW device record (new fingerprint)
7. App receives: deviceToken, storeName, storeCode, etc.
8. App immediately works - all data is server-side
```

### Key Guarantees:

1. **No Data Loss**: Store data (orders, inventory) is server-side
2. **Immediate Sync**: `ui-status` poll starts within 15s of enrollment
3. **Feature Flags**: Settings sync from ui-status (buyEnabled, reorderEnabled)
4. **Offline Ready**: storeName/storeCode persisted locally for offline display

### What SuperAdmin Does:
```bash
# Generate new enrollment code for existing store
POST /admin/stores/{storeId}/device-enrollments
# Returns: { code: "SM-XXXXXX", expiresAt, maxUses, qrPayload }
```

---

## 4. Code Revocation vs Device Blocking

### Revoke Enrollment Code
- **Effect**: Code cannot be used for NEW enrollments
- **Existing devices**: Still work (already enrolled)
- **Use case**: Prevent leaked code from being used

```sql
UPDATE pos_device_enrollments
SET revoked_at = NOW()
WHERE code = 'SM-XXXXXX';
```

### Block Device
- **Effect**: Device's API calls rejected
- **Enrollment code**: Not affected
- **Use case**: Lost/stolen device, employee termination

```sql
UPDATE pos_devices
SET blocked_at = NOW()
WHERE id = 'device-uuid';
```

### Comparison:
| Action | New Enrollments | Existing Devices |
|--------|-----------------|------------------|
| Revoke Code | Blocked | Still work |
| Block Device | N/A | Blocked |
| Deactivate Store | N/A | All devices blocked |

---

## 5. Demo vs Production Enrollment

### Production Stores (Default)
- Enrollment codes: **Single-use** (`max_uses=1`)
- Expiry: **30 minutes** after creation
- Second device attempt: `409 ENROLLMENT_CODE_USED`
- Expired code attempt: `409 ENROLLMENT_CODE_EXPIRED`

### Demo Stores
- Detection: `store.is_demo=true` OR `isDemoStoreCode(store_code)`
- Enrollment codes: **Multi-use** (`max_uses=9999`)
- Expiry: **1 year** after creation
- Multiple devices: All succeed
- Expired codes: Still work (for testing convenience)

### Demo Detection Patterns:
```typescript
// Prefix patterns (2-char uppercase)
const DEMO_PREFIXES = ["DM", "QA", "TS", "ST"];

// Legacy patterns (case-insensitive contains)
const LEGACY_DEMO_PATTERNS = ["demo", "test", "qa-", "staging"];
```

---

## 6. ui-status: Source of Truth

After enrollment, the app polls `/api/v1/pos/ui-status` every 15 seconds.

### Response Fields:
```json
{
  "storeId": "uuid",
  "storeName": "Test Store Alpha",
  "storeCode": "TE260115-001",
  "storeActive": true,
  "deviceActive": true,
  "pendingOutboxCount": 0,
  "printerOk": true,
  "features": {
    "buyEnabled": true,
    "reorderEnabled": false,
    "scan_lookup_v2": true
  }
}
```

### Key Behaviors:
1. **Read-Only**: ui-status makes NO database writes
2. **Overwrites Local**: storeName/storeCode from server overwrites local cache
3. **Never Clears**: If server returns null, keep last known good value
4. **Feature Sync**: Settings flags synced to settingsStore

---

## 7. Scaling Notes (10k+ Stores)

### Database Indexes
```sql
-- Fast enrollment code lookup
CREATE INDEX idx_enrollments_code ON pos_device_enrollments(code);

-- Fast device fingerprint lookup (idempotent re-enrollment)
CREATE INDEX idx_devices_fingerprint ON pos_devices(device_fingerprint)
  WHERE device_fingerprint IS NOT NULL;

-- Fast device token validation
CREATE INDEX idx_devices_token ON pos_devices(device_token);
```

### Rate Limiting
```typescript
// Enrollment endpoint: 10 attempts per 15 minutes per IP
const enrollmentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10
});
```

### Connection Pooling
- Use `pg.Pool` with reasonable limits (default: 10 connections)
- ui-status uses connection pool efficiently (no long-held connections)

### Enrollment Code Generation
- 6-character codes from 32-char alphabet = 1 billion combinations
- Collision check before insert (5 retries, then fallback to crypto)

---

## 8. Error Codes Reference

| Code | HTTP | Description |
|------|------|-------------|
| `CODE_REQUIRED` | 400 | Missing enrollment code |
| `LABEL_REQUIRED` | 400 | Missing device label |
| `DEVICE_TYPE_REQUIRED` | 400 | Missing device type |
| `DEVICE_TYPE_INVALID` | 400 | Invalid device type |
| `PRINTING_MODE_INVALID` | 400 | Invalid printing mode |
| `ENROLLMENT_CODE_INVALID` | 400 | Code not found |
| `ENROLLMENT_CODE_USED` | 409 | Code already used (production) |
| `ENROLLMENT_CODE_EXPIRED` | 409 | Code expired (production) |
| `ENROLLMENT_CODE_REVOKED` | 409 | Code revoked by admin |
| `STORE_NOT_FOUND` | 404 | Store not found |
| `DATABASE_UNAVAILABLE` | 503 | Database connection failed |
| `ENROLLMENT_RATE_LIMITED` | 429 | Too many attempts |
| `ENROLLMENT_FAILED` | 500 | Internal error |

---

## 9. Sequence: Complete New Store Onboarding

```
1. SuperAdmin creates store
   POST /admin/stores → { storeId, storeCode }

2. SuperAdmin creates enrollment code
   POST /admin/stores/{id}/device-enrollments → { code: "SM-ABC123" }

3. SuperAdmin shares code with retailer (QR or manual entry)

4. Retailer installs POS app, enters code
   POST /pos/enroll → { deviceId, deviceToken, storeName, ... }

5. App saves session and starts ui-status polling

6. Retailer can immediately use POS (BUY, scan, etc.)
```

---

## 10. Sequence: Device Recovery (Reinstall)

```
1. Retailer uninstalls/reinstalls app (or factory reset)

2. Retailer contacts support: "I need to re-enroll"

3. SuperAdmin generates NEW code for same store
   POST /admin/stores/{id}/device-enrollments → { code: "SM-XYZ789" }

4. Retailer enters new code

5. System creates new device record (fresh fingerprint)

6. App works immediately - all data is server-side

7. (Optional) SuperAdmin blocks old device record if needed
```

---

## 11. Files Reference

| File | Purpose |
|------|---------|
| `backend/src/routes/v1/pos/enroll.ts` | Device enrollment endpoint |
| `backend/src/routes/v1/admin/deviceEnrollments.ts` | Admin enrollment creation |
| `backend/src/routes/v1/pos/uiStatus.ts` | UI status polling |
| `backend/src/services/storeCodeService.ts` | Demo store detection |
| `src/services/api/enrollApi.ts` | Frontend enrollment API |
| `src/stores/settingsStore.ts` | Persisted settings (storeName, etc.) |
| `src/screens/EnrollDeviceScreen.tsx` | Enrollment UI |
| `src/screens/PosRootLayout.tsx` | ui-status polling |
