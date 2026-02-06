# MICRO-BATCH-01 — FIX-TO-GREEN

| Field | Value |
|-------|-------|
| **Parent SHA** | `4b0ac9f` (tag: `post-batch-021-2026-02-06_1739IST`) |
| **Batch** | MICRO-BATCH-01: Backend Critical Security + Stability |
| **Issues Covered** | ISSUE-MICRO-001, 002, 008, 010, 012, 043, 042, 040 |
| **Severity** | P0: 3, P1: 2, P2: 3 |

---

## Files Changed

| File | What |
|------|------|
| `backend/src/middleware/deviceToken.ts` | Parameterized SQL interval (001), logged silent catches (012), WHERE guard on refresh (042) |
| `backend/src/db/ensureSchema.ts` | PostgreSQL advisory lock around schema migration (002) |
| `backend/services/auth-service/src/index.ts` | Added SIGTERM/SIGINT handler with graceful shutdown (008) |
| `backend/src/server.ts` | Added uncaughtException/unhandledRejection handlers (010), try/catch on scheduler startup (043) |
| `backend/src/routes/v1/pos/inventory.ts` | Capped offset at 100,000 (040) |

---

## Per-Issue Fix Summary

### ISSUE-MICRO-001 (P0): SQL injection in deviceToken.ts
- **Axis:** B (API Contract)
- **Root Cause:** `TOKEN_EXPIRY_DAYS` interpolated into SQL via `INTERVAL '${TOKEN_EXPIRY_DAYS} days'` template string at line 168. Although hardcoded to 90, if sourced from env/input, arbitrary SQL injection is possible.
- **Exact vulnerable input:** Any non-numeric value like `1'; DROP TABLE pos_devices; --` assigned to `TOKEN_EXPIRY_DAYS`.
- **File:Line:** `backend/src/middleware/deviceToken.ts:168`
- **Fix Applied:** Replaced `INTERVAL '${TOKEN_EXPIRY_DAYS} days'` with `INTERVAL '1 day' * $2` using parameterized query binding. PostgreSQL parameter binding makes injection impossible regardless of the value's source.
- **Before:** Template string interpolation: `NOW() + INTERVAL '${TOKEN_EXPIRY_DAYS} days'`
- **After:** Parameterized: `NOW() + INTERVAL '1 day' * $2` with `[deviceId, TOKEN_EXPIRY_DAYS]`
- **Why exploit is now impossible:** The value is passed as a bound parameter (`$2`), never concatenated into the SQL string. PostgreSQL treats it as a numeric literal, not as SQL syntax.
- **Why This Is Safe:** Single-line change inside an existing UPDATE. No API contract change. The query result is identical (90 * 1 day = 90 days).

### ISSUE-MICRO-002 (P0): Race condition in ensureSchema
- **Axis:** D (State Machine)
- **Root Cause:** Boolean `ensured` flag checked at line 6, set at line 606. 600+ lines of async SQL execute between check and set with no mutex. Two concurrent cold-start requests both enter migration block.
- **File:Line:** `backend/src/db/ensureSchema.ts:3-6, 606`
- **Fix Applied:** Added PostgreSQL advisory lock (`pg_advisory_lock(839201)`) before the migration block. All `pool.query` calls replaced with `client.query` on the locked connection. Double-check pattern: after acquiring lock, re-check `ensured` flag. Finally block releases advisory lock and connection.
- **Why This Is Safe:** Advisory locks are session-scoped and automatically released on disconnect. The lock key `839201` is unique and won't collide with application locks. Migration SQL is all idempotent (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`), so even if the lock fails, no data corruption occurs.

### ISSUE-MICRO-008 (P0): Auth-service missing SIGTERM handler
- **Axis:** F (Observability)
- **Root Cause:** `app.listen()` at line 138 didn't capture server ref. No SIGTERM/SIGINT handler. Cloud Run sends SIGTERM; connections dropped immediately; in-flight auth requests fail; DB connections not closed.
- **File:Line:** `backend/services/auth-service/src/index.ts:138-146`
- **Fix Applied:** Captured `const server = app.listen(...)`. Added `process.on('SIGTERM')` and `process.on('SIGINT')` handlers that call `server.close()` for graceful drain, with 10s forced exit timeout.
- **Why This Is Safe:** Mirrors the exact pattern already working in `backend/src/server.ts` (lines 36-50). No behavioral change during normal operation; only affects shutdown sequence.

### ISSUE-MICRO-010 (P1): Missing uncaught exception handler
- **Axis:** F (Observability)
- **Root Cause:** `server.ts` had SIGTERM/SIGINT handlers but no `uncaughtException` or `unhandledRejection` handlers. An uncaught error kills the process silently without logging.
- **File:Line:** `backend/src/server.ts` (after line 50)
- **Fix Applied:** Added `process.on('uncaughtException')` that logs and triggers graceful shutdown. Added `process.on('unhandledRejection')` that logs but does NOT exit (consistent with Node 16+ default).
- **Why This Is Safe:** Only adds logging + shutdown. Does not change any request handling. The uncaughtException handler calls the existing `shutdown()` function. The unhandledRejection handler only logs.

### ISSUE-MICRO-012 (P1): Device token auto-refresh silent failure
- **Axis:** B (API Contract)
- **Root Cause:** `autoRefreshTokenIfNeeded` called with `.catch(() => {})` at line 254 — all errors swallowed silently. Inner catch at line 188 had empty body. Failed refreshes invisible to operators.
- **File:Line:** `backend/src/middleware/deviceToken.ts:186-188, 254`
- **Fix Applied:** (1) Added `console.warn` to the empty catch at line 188 for `last_active_at` update failures. (2) Changed `.catch(() => {})` to `.catch((err) => { console.warn(...) })` to log background errors.
- **Why This Is Safe:** Only adds logging. The auto-refresh is already fire-and-forget (non-blocking). The catch still prevents the error from propagating to the request handler.

### ISSUE-MICRO-043 (P2): Scheduler promise rejection unhandled
- **Axis:** F (Observability)
- **Root Cause:** `startSyncCleanupScheduler()` called inside listen callback without error handling. If it throws synchronously, the error is unhandled.
- **File:Line:** `backend/src/server.ts:32`
- **Fix Applied:** Wrapped `startSyncCleanupScheduler()` in try/catch with `logger.error()`. Server continues running even if scheduler fails to start.
- **Why This Is Safe:** The scheduler is optional (cleanup of stale sync locks). Server should not crash if it fails. The try/catch only catches the initial call; the scheduler's internal setInterval errors are separate.

### ISSUE-MICRO-042 (P2): Token refresh UPDATE without transaction
- **Axis:** D (State Machine)
- **Root Cause:** Token refresh UPDATE at line 167-172 has no guard against concurrent execution. Two concurrent requests for the same device both decide to refresh, causing two identical UPDATEs.
- **File:Line:** `backend/src/middleware/deviceToken.ts:167-174`
- **Fix Applied:** Added `AND token_expires_at < NOW() + INTERVAL '30 days'` WHERE clause. Only the first concurrent request that finds the token near-expiry will update. Subsequent requests (after the first update) see `token_expires_at > NOW() + 30 days` and skip the UPDATE.
- **Why This Is Safe:** The WHERE clause is purely additive — it can only reduce the number of writes, never increase them. The business logic (refresh when < 30 days from expiry) is preserved.

### ISSUE-MICRO-040 (P2): Missing offset upper bound on inventory pagination
- **Axis:** E (Scale/Performance)
- **Root Cause:** `offsetNum = parseInt(offset, 10) || 0` at line 143 has no upper bound. A client requesting `?offset=999999999` forces PostgreSQL to scan and skip that many rows.
- **File:Line:** `backend/src/routes/v1/pos/inventory.ts:142-143`
- **Fix Applied:** Capped offset at `100,000` via `Math.min(...)`. At 200 rows per page, this covers 500 pages — far beyond any real inventory catalog.
- **Why This Is Safe:** Legitimate inventory will never exceed 100K entries for a single store. The cap silently clamps the value without returning an error, maintaining backwards compatibility.

---

## Gates Run

| Gate | Result |
|------|--------|
| `pnpm -r typecheck` | **0 errors across all 22 projects** |
| API contract changes | **None** — all changes are internal middleware/startup logic |
| New dependencies | **None** |
| Schema changes | **None** |

---

## Blackbox Tests (Operator-Run)

### Test 1: SQL injection (ISSUE-MICRO-001)
- **Step:** Inspect `deviceToken.ts` line 168 — confirm `$2` parameter, no template interpolation
- **Expected:** `INTERVAL '1 day' * $2` with parameterized binding
- **PASS/FAIL:** ___

### Test 2: Cold start concurrency (ISSUE-MICRO-002)
- **Step:** Restart backend container. Send 10 simultaneous `curl /health` requests.
- **Expected:** All return 200 after startup. No "relation does not exist" errors.
- **PASS/FAIL:** ___

### Test 3: SIGTERM handling — auth-service (ISSUE-MICRO-008)
- **Step:** `docker stop auth-service` during active request
- **Expected:** Request completes or gets graceful error. Console shows "SIGTERM received, shutting down gracefully"
- **PASS/FAIL:** ___

### Test 4: Uncaught exception (ISSUE-MICRO-010)
- **Step:** Send malformed JSON to `POST /api/v1/pos/sync`: `curl -X POST -d 'invalid' -H "Content-Type: application/json"`
- **Expected:** 400 error returned, process stays alive (`docker ps` shows container running)
- **PASS/FAIL:** ___

### Test 5: Token refresh error logging (ISSUE-MICRO-012)
- **Step:** Stop DB, make device request, check backend logs
- **Expected:** Warning logged: `[DeviceToken] Auto-refresh background error:` (not silently swallowed)
- **PASS/FAIL:** ___

### Test 6: Offset abuse (ISSUE-MICRO-040)
- **Step:** `curl /api/v1/pos/inventory/ledger?offset=999999999 -H "X-Device-Token: ..."`
- **Expected:** Fast response (offset capped at 100,000)
- **PASS/FAIL:** ___

---

## VERDICT: PENDING OPERATOR SIGN-OFF
