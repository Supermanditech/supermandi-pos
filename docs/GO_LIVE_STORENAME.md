# Go-Live: Store Name Display Implementation

> Generated: 2026-01-15
> Objective: POS displays Store Name from SuperAdmin provisioning, read-only, persisted for offline

---

## Overview

POS must display Store Name (and optional Store Code) that comes only from SuperAdmin provisioning in platform DB. Retailer cannot edit it. POS should update automatically via ui-status poll and persist for offline display.

---

## A) Backend Changes

### A.1 Schema Status

**Current State:**
- `platform.stores` has `name` (NOT NULL) and `code` columns
- `public.stores` is a VIEW exposing platform.stores
- Backend routes expect `store_code` but column is named `code`

**Fix Required:**
- Add `store_code` column to stores (or alias in VIEW)
- Update VIEW to expose `store_code`

### A.2 Migration: 014_stores_add_store_code.sql

```sql
-- Migration: 014_stores_add_store_code
-- Adds store_code column to platform.stores and updates VIEW
-- Safe: Idempotent, additive-only

BEGIN;

-- Add store_code column if not exists (nullable initially for backfill)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'platform'
      AND table_name = 'stores'
      AND column_name = 'store_code'
  ) THEN
    ALTER TABLE platform.stores ADD COLUMN store_code VARCHAR(20);
    CREATE UNIQUE INDEX IF NOT EXISTS stores_store_code_unique
      ON platform.stores (store_code) WHERE store_code IS NOT NULL;
  END IF;
END $$;

-- Backfill store_code from existing code column where NULL
UPDATE platform.stores
SET store_code = code
WHERE store_code IS NULL AND code IS NOT NULL;

-- Update the public.stores VIEW to include store_code
CREATE OR REPLACE VIEW public.stores AS
  SELECT
    id::TEXT as id,
    name,
    code,
    store_code,
    phone,
    email,
    address_line1,
    address_line2,
    city,
    state,
    pincode,
    timezone,
    currency,
    status,
    -- Map status to active boolean for backward compat
    (status = 'active') as active,
    created_at,
    updated_at
  FROM platform.stores;

COMMIT;
```

### A.3 Enrollment Response Enhancement

**File:** `backend/src/routes/v1/pos/enroll.ts`

Add `storeName` and `storeCode` to enrollment response:

```typescript
// After line 134, fetch store name:
const storeRes = await client.query(
  `SELECT id, name, store_code, active, is_demo FROM stores WHERE id = $1`,
  [enrollment.store_id]
);
const store = storeRes.rows[0];

// In response (lines 184, 330):
return res.json({
  deviceId,
  storeId: store.id,
  storeName: store.name,        // NEW
  storeCode: store.store_code,  // NEW
  deviceToken,
  storeActive: Boolean(store.active),
  reEnrolled: Boolean(existingDevice)
});
```

### A.4 ui-status Already Returns storeName/storeCode ✓

File `backend/src/routes/v1/pos/uiStatus.ts` already returns:
- `storeName`
- `storeCode`

---

## B) Frontend Changes

### B.1 settingsStore - Add storeName/storeCode

**File:** `src/stores/settingsStore.ts`

```typescript
type SettingsState = {
  buyEnabled: boolean;
  reorderEnabled: boolean;
  language: SupportedLanguage;
  storeName: string | null;      // NEW
  storeCode: string | null;      // NEW
  setBuyEnabled: (enabled: boolean) => void;
  setReorderEnabled: (enabled: boolean) => void;
  setLanguage: (lang: SupportedLanguage) => void;
  setStoreName: (name: string | null) => void;    // NEW
  setStoreCode: (code: string | null) => void;    // NEW
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      buyEnabled: true,
      reorderEnabled: false,
      language: 'en',
      storeName: null,     // NEW
      storeCode: null,     // NEW
      setBuyEnabled: (enabled) => set({ buyEnabled: Boolean(enabled) }),
      setReorderEnabled: (enabled) => set({ reorderEnabled: Boolean(enabled) }),
      setLanguage: (lang) => {
        set({ language: lang });
        void setI18nLanguage(lang);
      },
      setStoreName: (name) => set({ storeName: name }),  // NEW
      setStoreCode: (code) => set({ storeCode: code }),  // NEW
    }),
    {
      name: 'supermandi.settings.v2',  // Bump version for migration
      storage: createJSONStorage(() => AsyncStorage)
    }
  )
);
```

### B.2 enrollApi - Update Response Type

**File:** `src/services/api/enrollApi.ts`

```typescript
export type DeviceEnrollResponse = {
  deviceId: string;
  storeId: string;
  storeName?: string;   // NEW
  storeCode?: string;   // NEW
  deviceToken: string;
  storeActive: boolean;
  reEnrolled?: boolean;
};
```

### B.3 EnrollDeviceScreen - Save storeName After Enroll

**File:** `src/screens/EnrollDeviceScreen.tsx`

After successful enrollment (around line 244):

```typescript
import { useSettingsStore } from "../stores/settingsStore";

// Inside handleEnroll, after saveDeviceSession:
const res = await enrollDevice({ enrollmentCode, deviceMeta });

// Save store name to settings (persisted)
const { setStoreName, setStoreCode } = useSettingsStore.getState();
if (res.storeName) {
  setStoreName(res.storeName);
}
if (res.storeCode) {
  setStoreCode(res.storeCode);
}

await saveDeviceSession({...});
```

### B.4 PosRootLayout - Update settingsStore on Poll

**File:** `src/screens/PosRootLayout.tsx`

In the ui-status poll effect (around line 357):

```typescript
// After fetching ui-status
if (status.storeName) {
  setStoreName((prev) => status.storeName ?? prev);

  // Also persist to settingsStore for offline
  const { setStoreName: persistStoreName, setStoreCode: persistStoreCode } = useSettingsStore.getState();
  persistStoreName(status.storeName);
  if (status.storeCode) {
    persistStoreCode(status.storeCode);
  }
}
```

### B.5 Use Persisted storeName for Display

Components should read from settingsStore for display:

```typescript
const storeName = useSettingsStore((s) => s.storeName);
const storeCode = useSettingsStore((s) => s.storeCode);
```

---

## C) VM Deployment Checklist

### C.1 Pre-Deployment

```bash
# SSH into VM
ssh user@supermandi-vm

# Check current state
docker ps
docker logs backend-api --tail 50
```

### C.2 Apply Migration

```bash
# Option A: Via docker exec
docker exec -i postgres-container psql -U postgres -d supermandi < migration.sql

# Option B: Via migration script
cd /opt/supermandi
docker-compose exec backend npm run migrate:up
```

### C.3 Verify Migration

```bash
# Check column exists
docker exec -i postgres-container psql -U postgres -d supermandi -c "
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'stores'
    AND column_name IN ('name', 'store_code');
"

# Check VIEW updated
docker exec -i postgres-container psql -U postgres -d supermandi -c "
  SELECT id, name, store_code FROM stores LIMIT 3;
"
```

### C.4 Deploy Backend

```bash
# Pull latest image
docker pull ghcr.io/supermandi/backend:latest

# Restart services
docker-compose up -d backend-api

# Verify health
curl -s http://localhost:3000/health | jq .
```

### C.5 Rollback Plan

```bash
# If issues, revert to previous image
docker-compose down backend-api
docker pull ghcr.io/supermandi/backend:v3.0.9
docker-compose up -d backend-api

# Migration is additive-only, no rollback needed for schema
```

---

## D) Smoke Tests

### D.1 Admin API - Create Store

```bash
curl -X POST http://localhost:3000/api/v1/admin/stores \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"storeName": "Test Store Alpha"}' | jq .

# Expected:
# {
#   "store": {
#     "id": "...",
#     "name": "Test Store Alpha",
#     "storeCode": "TE260115-001",
#     ...
#   }
# }
```

### D.2 Admin API - List Stores

```bash
curl http://localhost:3000/api/v1/admin/stores \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.stores[] | {id, name, storeCode}'

# Expected: Each store has id, name, storeCode
```

### D.3 Create Enrollment Code

```bash
curl -X POST http://localhost:3000/api/v1/admin/enrollments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"storeId": "STORE_ID", "label": "Test Device"}' | jq .

# Expected:
# {
#   "code": "SM-XXXXXX",
#   "expiresAt": "..."
# }
```

### D.4 Enroll Device

```bash
curl -X POST http://localhost:3000/api/v1/pos/enroll \
  -H "Content-Type: application/json" \
  -d '{
    "code": "SM-XXXXXX",
    "deviceMeta": {
      "label": "Counter-1",
      "deviceType": "RETAILER_PHONE"
    }
  }' | jq .

# Expected:
# {
#   "deviceId": "...",
#   "storeId": "...",
#   "storeName": "Test Store Alpha",  <-- NEW
#   "storeCode": "TE260115-001",       <-- NEW
#   "deviceToken": "...",
#   "storeActive": true
# }
```

### D.5 UI Status

```bash
curl http://localhost:3000/api/v1/pos/ui-status \
  -H "X-Device-Token: $DEVICE_TOKEN" | jq '{storeId, storeName, storeCode, storeActive}'

# Expected:
# {
#   "storeId": "...",
#   "storeName": "Test Store Alpha",
#   "storeCode": "TE260115-001",
#   "storeActive": true
# }
```

### D.6 Rename Store → Verify Poll Update

```bash
# 1. Rename store in admin
curl -X PATCH http://localhost:3000/api/v1/admin/stores/STORE_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"storeName": "Test Store Beta"}' | jq .

# 2. Wait 15s (poll interval)

# 3. Check ui-status returns new name
curl http://localhost:3000/api/v1/pos/ui-status \
  -H "X-Device-Token: $DEVICE_TOKEN" | jq '.storeName'

# Expected: "Test Store Beta"
```

---

## E) Changed Files Summary

### Backend
| File | Change |
|------|--------|
| `migrations/014_stores_add_store_code.sql` | NEW - Add store_code column |
| `routes/v1/pos/enroll.ts` | Add storeName, storeCode to response |

### Frontend
| File | Change |
|------|--------|
| `stores/settingsStore.ts` | Add storeName, storeCode with setters |
| `services/api/enrollApi.ts` | Add storeName, storeCode to response type |
| `screens/EnrollDeviceScreen.tsx` | Save storeName after enroll |
| `screens/PosRootLayout.tsx` | Persist storeName on poll |

---

## F) Safety Notes

1. **Frontend Safe Behavior:**
   - If backend `storeName` is null/empty, keep cached value
   - Never clear `storeName` on fetch error

2. **Backend Explicit Errors:**
   - If store row missing, return error (not silent null)
   - Log warnings for missing name scenarios

3. **Migration Safety:**
   - Additive-only (no destructive changes)
   - Idempotent (safe to run multiple times)
   - Backward compatible VIEW

4. **Rollback:**
   - Revert backend image to previous version
   - Migration forward-compatible, no schema rollback needed

---

## G) Multi-Use Enrollment Verification (DEV-071)

### G.1 Verify Demo Store Multi-Use Works

```bash
# 1. Get a demo store ID (store with is_demo=TRUE or demo-pattern store_code)
DEMO_STORE_ID=$(curl -s http://localhost:3000/api/v1/admin/stores \
  -H "Authorization: Bearer $ADMIN_TOKEN" | \
  jq -r '.stores[] | select(.storeCode | test("demo|qa-|test"; "i")) | .id' | head -1)

echo "Demo store ID: $DEMO_STORE_ID"

# 2. Create enrollment code for demo store
ENROLL_RESP=$(curl -s -X POST "http://localhost:3000/api/v1/admin/stores/$DEMO_STORE_ID/device-enrollments" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

DEMO_CODE=$(echo $ENROLL_RESP | jq -r '.code')
MAX_USES=$(echo $ENROLL_RESP | jq -r '.maxUses')
IS_DEMO=$(echo $ENROLL_RESP | jq -r '.isDemo')

echo "Demo code: $DEMO_CODE"
echo "Max uses: $MAX_USES (expect 9999)"
echo "Is demo: $IS_DEMO (expect true)"

# 3. First device enrollment
curl -s -X POST http://localhost:3000/api/v1/pos/enroll \
  -H "Content-Type: application/json" \
  -d "{
    \"code\": \"$DEMO_CODE\",
    \"deviceMeta\": {
      \"label\": \"Demo-Device-1\",
      \"deviceType\": \"RETAILER_PHONE\",
      \"deviceFingerprint\": \"fp_demo_test_001\"
    }
  }" | jq '{deviceId, storeName, reEnrolled}'

# Expected: { "deviceId": "...", "storeName": "...", "reEnrolled": false }

# 4. Second device enrollment (MUST succeed for demo)
curl -s -X POST http://localhost:3000/api/v1/pos/enroll \
  -H "Content-Type: application/json" \
  -d "{
    \"code\": \"$DEMO_CODE\",
    \"deviceMeta\": {
      \"label\": \"Demo-Device-2\",
      \"deviceType\": \"RETAILER_PHONE\",
      \"deviceFingerprint\": \"fp_demo_test_002\"
    }
  }" | jq '{deviceId, storeName, reEnrolled}'

# Expected: { "deviceId": "...", "storeName": "...", "reEnrolled": false }
# NOT an error - demo stores allow unlimited enrollments
```

### G.2 Verify Production Store Single-Use

```bash
# 1. Get a production store ID (non-demo)
PROD_STORE_ID=$(curl -s http://localhost:3000/api/v1/admin/stores \
  -H "Authorization: Bearer $ADMIN_TOKEN" | \
  jq -r '.stores[] | select(.storeCode | test("demo|qa-|test"; "i") | not) | .id' | head -1)

echo "Production store ID: $PROD_STORE_ID"

# 2. Create enrollment code for production store
PROD_RESP=$(curl -s -X POST "http://localhost:3000/api/v1/admin/stores/$PROD_STORE_ID/device-enrollments" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

PROD_CODE=$(echo $PROD_RESP | jq -r '.code')
MAX_USES=$(echo $PROD_RESP | jq -r '.maxUses')
IS_DEMO=$(echo $PROD_RESP | jq -r '.isDemo')

echo "Prod code: $PROD_CODE"
echo "Max uses: $MAX_USES (expect 1)"
echo "Is demo: $IS_DEMO (expect false)"

# 3. First device enrollment (should succeed)
curl -s -X POST http://localhost:3000/api/v1/pos/enroll \
  -H "Content-Type: application/json" \
  -d "{
    \"code\": \"$PROD_CODE\",
    \"deviceMeta\": {
      \"label\": \"Prod-Device-1\",
      \"deviceType\": \"RETAILER_PHONE\",
      \"deviceFingerprint\": \"fp_prod_test_001\"
    }
  }" | jq '{deviceId, storeName, reEnrolled}'

# Expected: { "deviceId": "...", "storeName": "...", "reEnrolled": false }

# 4. Second device enrollment (MUST fail for production)
curl -s -X POST http://localhost:3000/api/v1/pos/enroll \
  -H "Content-Type: application/json" \
  -d "{
    \"code\": \"$PROD_CODE\",
    \"deviceMeta\": {
      \"label\": \"Prod-Device-2\",
      \"deviceType\": \"RETAILER_PHONE\",
      \"deviceFingerprint\": \"fp_prod_test_002\"
    }
  }" | jq '.'

# Expected: 409 error with code "ENROLLMENT_CODE_USED"
# { "error": { "code": "ENROLLMENT_CODE_USED", "message": "..." } }
```

### G.3 Verify Existing SM-DEMO02 Code

```bash
# Test the legacy SM-DEMO02 code (after migration 015)
# This should work for multiple devices now

# Check if SM-DEMO02 exists in DB
docker exec -i postgres-container psql -U postgres -d supermandi -c "
  SELECT e.code, e.max_uses, e.uses_count, s.store_code, s.is_demo
  FROM pos_device_enrollments e
  JOIN stores s ON e.store_id = s.id
  WHERE e.code LIKE 'SM-DEMO%'
  LIMIT 5;
"

# Expected: max_uses = 9999 for all SM-DEMO* codes

# Enroll a new device with SM-DEMO02 (if exists)
curl -s -X POST http://localhost:3000/api/v1/pos/enroll \
  -H "Content-Type: application/json" \
  -d '{
    "code": "SM-DEMO02",
    "deviceMeta": {
      "label": "Demo-Recovery-Test",
      "deviceType": "RETAILER_PHONE",
      "deviceFingerprint": "fp_demo_recovery_001"
    }
  }' | jq '.'

# Expected: Success (not 400 "code already used")
```

### G.4 Verify Idempotent Re-Enrollment

```bash
# Same device (same fingerprint) re-enrolling should return existing credentials

# First enrollment
curl -s -X POST http://localhost:3000/api/v1/pos/enroll \
  -H "Content-Type: application/json" \
  -d "{
    \"code\": \"$DEMO_CODE\",
    \"deviceMeta\": {
      \"label\": \"Idempotent-Test\",
      \"deviceType\": \"RETAILER_PHONE\",
      \"deviceFingerprint\": \"fp_idempotent_999\"
    }
  }" | jq '{deviceId, reEnrolled}'

# Second enrollment with SAME fingerprint
curl -s -X POST http://localhost:3000/api/v1/pos/enroll \
  -H "Content-Type: application/json" \
  -d "{
    \"code\": \"$DEMO_CODE\",
    \"deviceMeta\": {
      \"label\": \"Idempotent-Test\",
      \"deviceType\": \"RETAILER_PHONE\",
      \"deviceFingerprint\": \"fp_idempotent_999\"
    }
  }" | jq '{deviceId, reEnrolled}'

# Expected: Same deviceId, reEnrolled: true
```

### G.5 Quick Database Verification

```bash
# Check enrollment counts by store type
docker exec -i postgres-container psql -U postgres -d supermandi -c "
  SELECT
    CASE WHEN s.is_demo OR LOWER(COALESCE(s.store_code, '')) LIKE '%demo%' THEN 'DEMO' ELSE 'PROD' END as store_type,
    COUNT(*) as enrollment_count,
    SUM(CASE WHEN e.max_uses >= 9999 THEN 1 ELSE 0 END) as multi_use_count,
    SUM(CASE WHEN e.max_uses = 1 THEN 1 ELSE 0 END) as single_use_count
  FROM pos_device_enrollments e
  JOIN stores s ON e.store_id = s.id
  GROUP BY 1;
"

# Expected:
# DEMO | X | X (all multi-use) | 0
# PROD | Y | 0 | Y (all single-use)
```
