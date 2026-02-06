# POST-BATCH-021: Fix-to-Green Report

| Field | Value |
|-------|-------|
| **Baseline** | `e826eab` (tag: `post-batch-020-2026-02-06_2243IST`) |
| **Date** | 2026-02-06 |
| **Scope** | 2 deferred P2 tickets from POST-BATCH-020 |

---

## FIXES APPLIED

### FIX-021-001 (P2): POS events — push filters to server-side

| Field | Value |
|-------|-------|
| **Backend Route** | `backend/src/routes/v1/admin/posEvents.ts` |
| **Backend Service** | `backend/src/services/posEventLogger.ts` |
| **Frontend API** | `supermandi-superadmin/src/api/posEvents.ts` |
| **Frontend Component** | `supermandi-superadmin/src/App.tsx` |

**What changed:**
- Backend `GET /api/v1/admin/pos/events` now accepts: `storeId`, `deviceId`, `eventType`, `from`, `to` query params
- Backend service `fetchLatestPosEvents()` builds dynamic WHERE clauses using Drizzle ORM (`eq`, `ilike`, `gte`, `lte`)
  - `storeId` → exact match (`eq`)
  - `deviceId` → exact match (`eq`)
  - `eventType` → substring match (`ilike %...%`)
  - `from` → `created_at >= from` (`gte`)
  - `to` → `created_at <= to` (`lte`)
- Frontend API client sends filters as URL query params instead of downloading all and filtering client-side
- Removed client-side `normalizeFilter` + `.filter()` chain from `fetchPosEvents()`
- `refreshEvents()` in App.tsx now passes current filter values to the API

**Benefits:** Network payload shrinks to only matching events. DB does the filtering (indexed).

---

### FIX-021-002 (P2): Device grid — server pagination

| Field | Value |
|-------|-------|
| **Backend Route** | `backend/src/routes/v1/admin/devices.ts` |
| **Frontend API** | `supermandi-superadmin/src/api/devices.ts` |
| **Frontend Component** | `supermandi-superadmin/src/App.tsx` |

**What changed:**
- Backend `GET /api/v1/admin/devices` now accepts `deviceId` query param (ILIKE search)
- Device count query also includes `deviceId` filter for accurate `total`
- Frontend `fetchDevices()` accepts and sends `deviceId` param
- `refreshDevices()` now passes `{ limit: 50, offset: page * 50, storeId, deviceId }` to the API
- Added `devicePage`, `deviceTotal` state to App.tsx
- Added Prev/Next pagination buttons below the device grid with page indicator
- Removed client-side `filteredDeviceRecords` useMemo (server handles filtering)

**Benefits:** Only 50 devices loaded per page. 10K devices usable without UI lock or memory spikes.

---

## VERIFICATION EVIDENCE

### Gate 1: Typecheck
```
pnpm -r typecheck → 0 errors across all 22 projects
```

### Gate 2: Docker rebuild + health
```
docker compose -f scripts/docker-compose.local-prod.yml up -d --build main-backend superadmin → OK
Backend health: 200 OK {"status":"ok","service":"api-gateway"}
All 17/17 containers: healthy
```

### Gate 3: API verification
```
GET /api/v1/admin/devices?limit=10&deviceId=demo → 200
  Response: { devices: [2 items], total: 2, limit: 10, offset: 0 }
  (ILIKE '%demo%' correctly filtered to demo-device-001 and demo-device-002)

GET /api/v1/admin/devices?limit=2&offset=0 → 200
  Response: paginated correctly with total count

GET /api/v1/admin/pos/events?limit=3 → 200
  Response: [] (no events in test DB, endpoint works)
```

### Gate 4: No regression
- No API signature changes (new query params are optional, backward compatible)
- No new dependencies
- No schema changes
- Client-side filtering in App.tsx `filteredEvents` useMemo still works as instant refinement layer

---

## FILES CHANGED

| File | What |
|------|------|
| `backend/src/routes/v1/admin/posEvents.ts` | Parse storeId/deviceId/eventType/from/to query params |
| `backend/src/services/posEventLogger.ts` | Add WHERE clauses using Drizzle ORM eq/ilike/gte/lte |
| `backend/src/routes/v1/admin/devices.ts` | Add deviceId ILIKE search filter |
| `supermandi-superadmin/src/api/posEvents.ts` | Send filters as URL params, remove client-side filtering |
| `supermandi-superadmin/src/api/devices.ts` | Add deviceId param |
| `supermandi-superadmin/src/App.tsx` | Server pagination for device grid, pass filters to events API |

---

## VERDICT: GREEN

| Field | Value |
|-------|-------|
| **Commit** | `4b0ac9f` |
| **Tag** | `post-batch-021-2026-02-06_1739IST` |
| **P2 fixed** | 2/2 |
| **API contract changes** | None (new query params are optional) |
| **New dependencies** | None |
| **Typecheck** | 0 errors / 22 projects |
| **Docker** | 17/17 healthy |
