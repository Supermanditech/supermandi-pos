# MICRO-BATCH-02 — FIX-TO-GREEN

| Field | Value |
|-------|-------|
| **Parent SHA** | `8fa59b7` (MICRO-BATCH-01) |
| **Batch** | MICRO-BATCH-02: Backend Scale + Auth Hardening |
| **Issues Covered** | ISSUE-MICRO-011, 082, 083, 041, 090, 091, 088 |
| **Severity** | P1: 1, P2: 4, P3: 2 |

---

## Files Changed

| File | What |
|------|------|
| `backend/src/middleware/storeStatusGate.ts` | TTL cache for store status queries (011) |
| `backend/src/routes/v1/index.ts` | Admin route rate limiter (082) |
| `backend/src/middleware/authProtection.ts` | Memory bounds: 10K cap, globalAttempts cap, periodic cleanup (041) |
| `backend/src/routes/v1/pos/enroll.ts` | Per-store daily enrollment limit (091), standardized error format (090) |
| `backend/src/lib/apiErrors.ts` | **NEW** — Centralized error response helper (088) |
| `backend/src/db/client.ts` | **NO CHANGE** — already has statement_timeout (083) |

---

## Per-Issue Fix Summary

### ISSUE-MICRO-011 (P1): Store status N+1 queries — no caching
- **Axis:** E (Scale)
- **Root Cause:** `storeStatusGate.ts` runs `SELECT status FROM platform.stores WHERE id = $1` on every POS request. For high-traffic stores, this creates an N+1 query per device request.
- **File:Line:** `backend/src/middleware/storeStatusGate.ts:66-71`
- **Fix Applied:** Added in-memory TTL cache with 30-second expiry. `getCachedStatus()` returns cached value if within TTL; `setCachedStatus()` stores result after DB query. Cache is bounded to 5,000 entries with FIFO eviction.
- **Why This Is Safe:** Cache TTL of 30s means status changes propagate within half a minute. Status changes are infrequent (admin action). Cache is read-only fallback — stale value just delays gate enforcement by ≤30s. No API contract change.

### ISSUE-MICRO-082 (P2): No rate limiting on admin API endpoints
- **Axis:** E (Scale)
- **Root Cause:** Admin routes in `index.ts` have no general rate limiter. Individual routes (analytics, AI) have their own, but most admin endpoints (devices, stores, users, events) are unprotected.
- **File:Line:** `backend/src/routes/v1/index.ts:86-89`
- **Fix Applied:** Added `express-rate-limit` middleware at the admin route mount point: 200 requests per 15 minutes per IP. Placed after health+auth (which should not be rate limited) but before audit middleware and route handlers.
- **Why This Is Safe:** 200/15min is ~13 req/sec sustained — generous for admin panel usage. Uses the same `express-rate-limit` library already in the dependency tree. Individual route limiters (analytics, AI) still apply as additional constraints.

### ISSUE-MICRO-083 (P2): No request timeout on long-running DB queries
- **Axis:** E (Scale)
- **Root Cause:** Audit flagged missing `statement_timeout` on PostgreSQL pool.
- **File:Line:** `backend/src/db/client.ts:21, 44`
- **Fix Applied:** **ALREADY FIXED** by GO-LIVE-076. The pool is configured with `statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000', 10)` at line 21, passed to the Pool constructor at line 44. Default is 30 seconds.
- **Why This Is Safe:** Pre-existing fix. No changes needed.

### ISSUE-MICRO-041 (P2): Auth protection memory exhaustion (50K map entries)
- **Axis:** E (Scale)
- **Root Cause:** `authProtection.ts` has `MAX_ENTRIES = 50000` for both `storeCodeAttempts` and `ipFailures` Maps. At ~100 bytes/entry plus timestamps arrays, this could use ~10MB+ per map. The `globalAttempts` array has no size cap. Cleanup only runs on-request, so stale entries persist if traffic stops.
- **File:Line:** `backend/src/middleware/authProtection.ts:33, 46-103`
- **Fix Applied:** (1) Reduced `MAX_ENTRIES` from 50,000 to 10,000 (~1MB per map). (2) Added `MAX_GLOBAL_ATTEMPTS = 1000` cap — array is sliced when exceeded. (3) Added `setInterval` periodic cleanup (every 5 min, `.unref()` so it doesn't block process exit).
- **Why This Is Safe:** 10K entries covers 10K unique IPs or store codes — far beyond realistic auth traffic. The periodic cleanup ensures memory is reclaimed even without incoming requests. The `globalAttempts` cap only affects stale entries since active entries are filtered to 1-minute window. No behavioral change to rate limiting logic.

### ISSUE-MICRO-088 (P2): No centralized error response format standard
- **Axis:** F (Observability)
- **Root Cause:** Backend routes use two inconsistent error formats: (1) `{ error: "flat_string" }` in older routes, (2) `{ error: { code: "CODE", message: "..." } }` in newer routes. No shared utility enforces the standard.
- **File:Line:** Multiple backend routes
- **Fix Applied:** Created `backend/src/lib/apiErrors.ts` with `errorJson(code, message)` helper that returns the standard `{ error: { code, message } }` format. New code can import and use this helper.
- **Why This Is Safe:** New file, no existing code changes. The helper is opt-in — existing code continues to work. No API contract change.

### ISSUE-MICRO-090 (P3): Auth error response format inconsistency
- **Axis:** B (API)
- **Root Cause:** The `check-label` endpoint in `enroll.ts` uses flat string errors (`{ error: "Code is required" }`) while the main `enroll` endpoint uses nested format (`{ error: { code: "CODE_REQUIRED", message: "..." } }`). Inconsistent format makes client-side error handling fragile.
- **File:Line:** `backend/src/routes/v1/pos/enroll.ts:527, 530, 535, 617`
- **Fix Applied:** Changed 4 flat-string error responses in the `check-label` endpoint to use the standard nested format: `{ error: { code: "CODE_REQUIRED", message: "Code is required" } }`.
- **Why This Is Safe:** The `check-label` endpoint's success response (`{ isDuplicate: true/false }`) is unchanged. Error responses are only hit on validation failures, which the POS app handles as generic errors. The change makes the endpoint consistent with the main enrollment endpoint.

### ISSUE-MICRO-091 (P3): Device enrollment — no per-store daily limit
- **Axis:** G (Misuse)
- **Root Cause:** Enrollment rate limiters are per-IP only (3/min burst, 10/15min sustained). A distributed attack from multiple IPs could attempt unlimited enrollments targeting a single store.
- **File:Line:** `backend/src/routes/v1/pos/enroll.ts` (after device count check)
- **Fix Applied:** Added daily enrollment count check per store. Queries `device_enrollment_events` table for enrollments in last 24 hours. Limit: 20 per store per day. Skipped for re-enrollment (device recovery) and demo stores. Returns 429 with `DAILY_ENROLLMENT_LIMIT` code.
- **Why This Is Safe:** 20 enrollments/day far exceeds legitimate use (max 10 devices per store). The check uses the existing `device_enrollment_events` table (no schema change). Demo stores are exempt. Re-enrollment (device recovery) is exempt.

---

## Gates Run

| Gate | Result |
|------|--------|
| `pnpm -r typecheck` | **0 errors across all 22 projects** |
| API contract changes | **Minimal** — check-label error format standardized (error path only) |
| New dependencies | **None** (express-rate-limit already in dependency tree) |
| Schema changes | **None** |
| New files | `backend/src/lib/apiErrors.ts` (13 lines) |

---

## Blackbox Tests (Operator-Run)

### Test 1: Store status cache (ISSUE-MICRO-011)
- **Step:** Send 100 rapid requests to same store via POS device token. Check backend DB logs.
- **Expected:** ≤4 `SELECT status FROM platform.stores` queries (100 requests / 30s TTL ≈ 2-4 DB hits)
- **PASS/FAIL:** ___

### Test 2: Admin rate limit (ISSUE-MICRO-082)
- **Step:** Send 210 rapid requests to `/api/v1/admin/devices` with valid admin token
- **Expected:** First 200 succeed (200 OK), remaining return 429 with `ADMIN_RATE_LIMITED`
- **PASS/FAIL:** ___

### Test 3: Auth protection memory cap (ISSUE-MICRO-041)
- **Step:** Inspect code: `MAX_ENTRIES = 10000` and `MAX_GLOBAL_ATTEMPTS = 1000` and periodic setInterval
- **Expected:** Constants present, setInterval cleanup at bottom of state section
- **PASS/FAIL:** ___

### Test 4: Per-store daily enrollment limit (ISSUE-MICRO-091)
- **Step:** Attempt 21 enrollments for same store from different IPs (or bypass IP rate limiter)
- **Expected:** First 20 succeed, 21st returns 429 with `DAILY_ENROLLMENT_LIMIT`
- **PASS/FAIL:** ___

### Test 5: Error format consistency (ISSUE-MICRO-090)
- **Step:** `curl -X POST /api/v1/pos/enroll/check-label -d '{}' -H "Content-Type: application/json"`
- **Expected:** `{ "error": { "code": "CODE_REQUIRED", "message": "Code is required" } }` (nested format)
- **PASS/FAIL:** ___

---

## VERDICT: PENDING OPERATOR SIGN-OFF
