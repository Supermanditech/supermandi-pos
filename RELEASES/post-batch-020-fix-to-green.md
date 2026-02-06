# POST-BATCH-020: Fix-to-Green Report (SESSION-2)

| Field | Value |
|-------|-------|
| **Baseline** | `76bfd77` (tag: `post-batch-019-76bfd77`) |
| **Audit** | `RELEASES/post-batch-020-hyper-atomic-audit.md` |
| **Date** | 2026-02-06 |
| **Scope** | 4 fixes in 2 files (P0+P1 only; P2 deferred) |

---

## FIXES APPLIED

### FIX-020-001 (P0): Hardcoded admin email allowlist → env var

| Field | Value |
|-------|-------|
| **File** | `backend/src/routes/v1/admin/adminAuth.ts:19-23` |
| **Before** | `const ADMIN_EMAIL_ALLOWLIST = ['supermanditech@gmail.com']` |
| **After** | `const ADMIN_EMAIL_ALLOWLIST = (process.env.ADMIN_EMAIL_ALLOWLIST \|\| '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)` |

**What changed:** Admin email allowlist moved from hardcoded array to `ADMIN_EMAIL_ALLOWLIST` environment variable (comma-separated). No more secrets in source code.

**Env var format:** `ADMIN_EMAIL_ALLOWLIST=admin1@example.com,admin2@example.com`

---

### FIX-020-002 (P0): In-memory OTP storage → Redis

| Field | Value |
|-------|-------|
| **File** | `backend/src/routes/v1/admin/adminAuth.ts:45-107` |
| **Before** | `const otpStore = new Map<string, StoredOTP>()` + `const verifyLockouts = new Map<string, number>()` + `setInterval` cleanup |
| **After** | Redis-backed `setOtp/getOtp/deleteOtp` + `setLockout/getLockout/deleteLockout` helpers with in-memory fallback |

**What changed:**
- OTP data stored in Redis with key prefix `admin:otp:` and automatic TTL expiry
- Lockout data stored in Redis with key prefix `admin:lockout:` and automatic TTL expiry
- Removed `setInterval` cleanup (Redis TTL handles expiry)
- In-memory `Map` fallback preserved for when Redis is unavailable (dev mode)
- All 9 call sites in route handlers updated to use async Redis helpers

**Redis keys:**
- `admin:otp:{email}` — TTL: remaining OTP expiry time (up to 600s)
- `admin:lockout:{email}` — TTL: remaining lockout time (up to 1800s)

**Benefits:** Survives server restarts, works across horizontal scaling (multiple backend instances).

---

### FIX-020-003 (P1): JWT_SECRET production guard

| Field | Value |
|-------|-------|
| **File** | `backend/src/routes/v1/admin/adminAuth.ts:28-31` |
| **Before** | `const JWT_SECRET = process.env.JWT_SECRET \|\| process.env.ADMIN_TOKEN \|\| 'dev-jwt-secret'` (silent fallback in production) |
| **After** | Same fallback chain + `process.exit(1)` if `JWT_SECRET` not set in `NODE_ENV=production` |

**What changed:** Added fatal exit guard — if `process.env.JWT_SECRET` is not set AND `NODE_ENV === 'production'`, the server exits immediately with an error message. Prevents production from running with the insecure `'dev-jwt-secret'` fallback.

---

### FIX-020-004 (P1): Remove debug console.log from storeStatusGate

| Field | Value |
|-------|-------|
| **File** | `backend/src/middleware/storeStatusGate.ts` |
| **Lines removed** | 4 debug `console.log` statements (was lines 48, 52, 64, 89-93) |
| **Preserved** | `console.warn` at line 92 (security: blocked requests) + `console.error` at line 106 (actual errors) |

**What changed:** Removed 4 `[SEC-001]` debug log statements that logged on every middleware creation and every request. These would spam production logs at volume. Kept the `console.warn` (for blocked access attempts) and `console.error` (for actual failures) which are legitimate security/error signals.

---

## DEFERRED (P2 — not blocking go-live)

| Issue | What | Why deferred |
|-------|------|-------------|
| ISSUE-020-005 | SuperAdmin device grid not virtualized | Only affects SuperAdmin UX with 1000+ devices |
| ISSUE-020-006 | SuperAdmin POS events client-side filtering | Only affects SuperAdmin UX with 1000+ events |

---

## VERIFICATION EVIDENCE

### Gate 1: Typecheck
```
pnpm -r typecheck → 0 errors across all 22 projects
```

### Gate 2: Docker rebuild + health
```
docker compose -f scripts/docker-compose.local-prod.yml up -d --build main-backend → OK
Backend health: 200 OK {"status":"ok","service":"api-gateway"}
All 17/17 containers: healthy
```

### Gate 3: No regression
- Only 2 files changed: `adminAuth.ts` (new Redis helpers, env var config) + `storeStatusGate.ts` (removed 4 debug logs)
- No API signature changes
- No new dependencies (uses existing `ioredis` via `getRedis()`)
- No schema changes
- Fallback to in-memory preserved for dev environments without Redis

---

## FILES CHANGED

| File | What |
|------|------|
| `backend/src/routes/v1/admin/adminAuth.ts` | Env var allowlist, Redis OTP/lockout storage, JWT production guard |
| `backend/src/middleware/storeStatusGate.ts` | Removed 4 debug console.log statements |

---

## ROOT CAUSE

1. **Allowlist + OTP:** Original implementation used hardcoded values and in-memory storage as a quick prototype. Now production-hardened with env vars and Redis.
2. **JWT_SECRET:** Fallback chain included `'dev-jwt-secret'` for local development, but no guard prevented it from being used in production.
3. **Debug logs:** Left over from SEC-001 development/debugging phase, never removed before commit.

---

## ENV VARS TO SET (before production deployment)

| Variable | Required | Example |
|----------|----------|---------|
| `ADMIN_EMAIL_ALLOWLIST` | Yes (production) | `admin@supermandi.tech` |
| `JWT_SECRET` | Yes (production) | Random 256-bit secret |
| `REDIS_HOST` | Yes (production) | Redis host for OTP storage |

---

## VERDICT: GREEN

| Field | Value |
|-------|-------|
| **Commit** | `6494074` |
| **Tag** | `post-batch-020-2026-02-06_2243IST` |
| **P0/P1 fixed** | 4/4 |
| **P2 deferred** | 2 |
| **API contract changes** | None |
| **New dependencies** | None |
| **Typecheck** | 0 errors / 22 projects |
| **Docker** | 17/17 healthy |
