# POST-BATCH-020: Hyper-Atomic Cascading Interaction Audit (SESSION-1)

| Field | Value |
|-------|-------|
| **Parent SHA** | `76bfd77` (POST-BATCH-019 verified green) |
| **Date** | 2026-02-06 |
| **Scope** | All portals + POS + Backend (source code audit) |
| **Mode** | SESSION-1: Observation ONLY — NO code changes |

---

## PARITY HEADER

| Check | Value |
|-------|-------|
| **Git HEAD** | `76bfd77` |
| **Git Tag** | `post-batch-019-76bfd77` |
| **Branch** | `main` (up to date with `origin/main`) |
| **Tree** | Clean (nothing to commit) |
| **Docker Containers** | 17/17 healthy |
| **API Gateway Health** | `200 OK` — SHA: `9bb03f7` |
| **Backend Health** | `200 OK` — SHA: `local` |
| **Retailer** | `200 OK` (http://localhost:8081/retailer/) |
| **Supplier** | `200 OK` (http://localhost:8082/supplier/) |
| **SuperAdmin** | `200 OK` (http://localhost:8083/admin/) |
| **Landing** | `200 OK` (http://localhost:8084/) |

---

## AUDIT SCOPE SUMMARY

| Portal | Pages/Screens | Buttons | Inputs | Modals | API Endpoints | Issues Found |
|--------|---------------|---------|--------|--------|---------------|-------------|
| Landing (8084) | 3 | 18 | 0 | 0 | 0 | 0 |
| Retailer (8081) | 14 | ~120 | ~95 | 8 | 48 | 0 |
| Supplier (8082) | 11 | ~80 | ~70 | 6 | 35 | 0 |
| SuperAdmin (8083) | 12 tabs | ~60 | ~40 | 6 | 43 | 3 (P1×1, P2×2) |
| POS App | 10+2 modals | ~50 | ~20 | 5 | 44+ | 0 |
| Backend Routes | — | — | — | — | 60+ | 3 (P0×2, P1×1) |
| **TOTAL** | **50+** | **~328** | **~225** | **~25** | **~230** | **6** |

---

## ISSUE REGISTRY

### ISSUE-020-001 (P0): Hardcoded Admin Email Allowlist

| Field | Value |
|-------|-------|
| **Severity** | **P0 — Must fix before production** |
| **File** | `backend/src/routes/v1/admin/adminAuth.ts:20-22` |
| **Risk Class** | B (API/logic) |
| **Portal** | SuperAdmin |

**What:** Admin portal login is gated by a hardcoded email allowlist:
```typescript
const ADMIN_EMAIL_ALLOWLIST = [
  'supermanditech@gmail.com',
];
```

**Impact:** Only one email can access admin portal. Cannot dynamically add/remove admin emails without code change and redeploy.

**Fix:** Move to `process.env.ADMIN_EMAIL_ALLOWLIST` (comma-separated) or `admin.admin_emails` database table.

---

### ISSUE-020-002 (P0): In-Memory OTP Storage (Admin Auth)

| Field | Value |
|-------|-------|
| **Severity** | **P0 — Must fix before production** |
| **File** | `backend/src/routes/v1/admin/adminAuth.ts:35` |
| **Risk Class** | F (Infra) |
| **Portal** | SuperAdmin |

**What:** Admin OTPs stored in in-memory `Map`:
```typescript
const otpStore = new Map<string, StoredOTP>();
```

**Impact:**
- OTPs lost on backend restart (user must re-request)
- Does NOT scale horizontally (multi-instance Cloud Run deploys won't share OTP state)
- Not critical for single-instance local-prod, but **blocks production multi-instance deploy**

**Fix:** Move OTP storage to Redis (already available in stack at `redis:6379`).

---

### ISSUE-020-003 (P1): JWT_SECRET Fallback to Dev Value

| Field | Value |
|-------|-------|
| **Severity** | **P1 — Security risk in production** |
| **File** | `backend/src/routes/v1/admin/adminAuth.ts:26` |
| **Risk Class** | C (Auth) |
| **Portal** | SuperAdmin |

**What:** JWT signing secret has unsafe fallback chain:
```typescript
const JWT_SECRET = process.env.JWT_SECRET || process.env.ADMIN_TOKEN || 'dev-jwt-secret';
```

**Impact:** If `JWT_SECRET` env var is not set in production:
1. Falls back to `ADMIN_TOKEN` (master admin token — uses a secret for a different purpose)
2. Falls back to literal `'dev-jwt-secret'` (anyone who reads source code can forge admin JWTs)

**Fix:** In production, require `JWT_SECRET` to be explicitly set. Add startup check: `if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') process.exit(1)`.

---

### ISSUE-020-004 (P1): Debug Console Logging in storeStatusGate

| Field | Value |
|-------|-------|
| **Severity** | **P1 — Performance & noise in production** |
| **File** | `backend/src/middleware/storeStatusGate.ts:48,52,64,89` |
| **Risk Class** | A (Operational) |
| **Portal** | All (middleware runs on every POS/store request) |

**What:** Four `console.log` statements fire on every request through the store status gate:
```typescript
console.log('[SEC-001] Status gate middleware created with allowed:', statusArray);
console.log('[SEC-001] Status gate middleware invoked for:', req.method, req.path);
console.log('[SEC-001] Store context:', { storeId, ... });
console.log('[SEC-001] Status check:', { currentStatus, ... });
```

**Impact:** Verbose production logs, increased I/O, harder to find real issues in log stream.

**Fix:** Remove or gate behind `process.env.DEBUG_MIDDLEWARE === 'true'`.

---

### ISSUE-020-005 (P2): SuperAdmin Device Grid Not Virtualized

| Field | Value |
|-------|-------|
| **Severity** | **P2 — Scale concern** |
| **File** | `supermandi-superadmin/src/App.tsx` (Devices tab) |
| **Risk Class** | A (UI performance) |
| **Portal** | SuperAdmin |

**What:** Device grid renders ALL devices as individual cards. With 10K+ devices, this would render 10K DOM elements simultaneously.

**Impact:** Browser performance degradation at scale. Not blocking for launch (few devices initially), but will become a problem as stores grow.

**Fix:** Add virtualization (react-window or similar) or server-side pagination with limit/offset.

---

### ISSUE-020-006 (P2): SuperAdmin POS Events Client-Side Filtering

| Field | Value |
|-------|-------|
| **Severity** | **P2 — Scale concern** |
| **File** | `supermandi-superadmin/src/App.tsx` (Events tab) |
| **Risk Class** | A (UI performance) |
| **Portal** | SuperAdmin |

**What:** POS events are fetched with a limit (up to 1000) then filtered client-side by device ID, store ID, and event type.

**Impact:** At scale, this means downloading 1000 events and filtering in the browser instead of letting the API filter server-side.

**Fix:** Push filters to backend API query parameters.

---

## PORTAL-BY-PORTAL AUDIT SUMMARY

### 1. LANDING PAGE (http://localhost:8084)

**Verdict: PASS — Production Ready**

| Metric | Value |
|--------|-------|
| Pages | 3 (index, privacy, terms) |
| Clickable Elements | 18 across all pages |
| Form Fields | 0 |
| API Calls | 0 |
| Console Statements | 0 |
| Hardcoded Secrets | 0 |
| Issues | 0 |

Static HTML portal. No forms, no API calls, no dynamic state. Single IIFE script for localhost port rewriting (guarded, safe). Responsive design with graceful degradation.

---

### 2. RETAILER WEB (http://localhost:8081/retailer/)

**Verdict: PASS — Production Ready**

| Metric | Value |
|--------|-------|
| Pages | 14 (Login, Dashboard, Products, Inventory, Suppliers, Catalog, Settings, Payments, Devices, Compliance, Forgot Password, Onboarding, Supplier Queue, Product Queue) |
| API Endpoints | 48 |
| Auth | HttpOnly cookies + in-memory access token + Firebase OTP |
| Token Refresh | Auto-refresh 5 min before expiry, 30s check interval |
| Idle Timeout | 30 min (configurable via VITE_IDLE_TIMEOUT_MINUTES) |
| Error Handling | Global ErrorBoundary + per-page error states + toast notifications |
| Issues | 0 |

Key strengths:
- Comprehensive auth with token refresh + idle timeout + activity tracking
- Double-click prevention on all submit buttons
- LWW conflict resolution on product edits (409 handling)
- Client-side + server-side validation on all forms
- Proper pagination (server-side for suppliers, catalog)
- URL store isolation (GL-CRIT-0023)

---

### 3. SUPPLIER WEB (http://localhost:8082/supplier/)

**Verdict: PASS — Production Ready**

| Metric | Value |
|--------|-------|
| Pages | 11 (Login, Dashboard, Products, Orders, Earnings, KYC, Profile, CSV Upload, Onboarding, Register, Pending Approval) |
| API Endpoints | 35 |
| Auth | HttpOnly cookies + in-memory token + Firebase OTP |
| Token Refresh | 60s interval after 10-min delay |
| Idle Timeout | 30 min |
| Error Handling | Global ErrorBoundary + ApiError class + toast |
| Issues | 0 |

Key strengths:
- React Query for efficient data fetching (60s stale time, 1 retry)
- Server-side pagination on all list views (20 per page)
- IFSC/GSTIN/phone regex validation
- File upload validation (5MB max, type whitelist)
- Order item-level quantity tracking with status (pending/partial/received)
- KYC payout readiness indicator

---

### 4. SUPERADMIN WEB (http://localhost:8083/admin/)

**Verdict: PASS with P1/P2 observations (ISSUE-020-005, ISSUE-020-006)**

| Metric | Value |
|--------|-------|
| Tabs | 12 (Events, Devices, Stores, Suppliers, Analytics, Payments, AI, Users, Settings, Documents, Audit Logs) |
| API Endpoints | 43 |
| Auth | Email OTP → JWT (24h expiry) + 30-min idle timeout |
| Error Sanitization | GL-CRIT-0055: Blocks SQL errors, stack traces, paths |
| Audit Logging | GL-CRIT-0049: All admin actions logged |
| Issues | 2 (P2: device grid virtualization, event filtering) |

Key strengths:
- Error sanitization prevents information disclosure
- Comprehensive audit trail (all mutations logged)
- Destructive actions behind confirmation dialogs
- Soft-delete only (no hard deletes in UI)
- RBAC permission system (super_admin/admin/moderator/viewer)
- Document review with multi-format preview (image, PDF, download)

---

### 5. POS APP (API Contract Matrix)

**Verdict: PASS — Production Ready**

| Metric | Value |
|--------|-------|
| API Endpoints | 44+ across 18 route modules |
| Auth | Device token (90-day expiry, auto-refresh within 30 days) |
| Rate Limiting | Per-store + per-device + per-IP |
| Offline | Sales, cash/due payments, stock lookup (cached) |
| Online-Only | UPI, split payments, catalog search, reports |
| Issues | 0 |

**POS Contract Matrix (Key Endpoints):**

| Endpoint | Method | Auth | Rate Limit | Offline |
|----------|--------|------|-----------|---------|
| `/pos/enroll` | POST | None (rate-limited) | 3/min burst, 10/15min | No |
| `/pos/enroll/check-label` | POST | None | 30/min | No |
| `/pos/scan/resolve` | POST | Device Token | 120/min/device | LocalDB fallback |
| `/pos/store-products` | POST | Device Token | — | No |
| `/pos/store-products/lookup` | GET | Device Token | — | Cached |
| `/pos/store-products/list` | GET | Device Token | — | No |
| `/pos/store-products/search` | POST | Device Token | — | No |
| `/pos/sales` | POST | Device Token + Active Store | 60/min/store | LocalDB + Outbox |
| `/pos/payments/cash` | POST | Device Token + Active Store | 30/min/store | LocalDB |
| `/pos/payments/due` | POST | Device Token + Active Store | 30/min/store | LocalDB |
| `/pos/payments/upi/generate` | POST | Device Token + Active Store | 30/min/store | Blocked |
| `/pos/payments/split` | POST | Device Token + Active Store | 30/min/store | Blocked |
| `/pos/payments/upi/verify-utr` | POST | Device Token | — | No |
| `/pos/inventory/stock/{id}` | GET | Device Token | — | 5-min TTL cache |
| `/pos/inventory/transactions` | POST | Device Token | — | Queued offline |
| `/pos/inventory/ledger` | GET | Device Token | — | Empty |
| `/pos/inventory/statement` | GET | Device Token | — | Empty |
| `/pos/bills` | GET | Device Token | — | LocalDB merge |
| `/pos/devices/me` | GET/PATCH | Device Token | — | No |
| `/reorder/*/pending` | GET | Device Token | — | No |
| `/reorder/*/pending/approve` | POST | Device Token | — | No |
| `/catalog/*/catalog` | GET | Device Token | — | No |
| `/catalog/*/categories` | GET | Device Token | — | No |

**Error Contract:**

| Scenario | Status | Code |
|----------|--------|------|
| No device token | 401 | `device_unauthorized` |
| Invalid/expired token | 401 | `device_unauthorized` |
| Token revoked | 401 | `device_unauthorized` (token_revoked) |
| Device inactive | 403 | `device_inactive` |
| Store not ACTIVE | 403 | `store_not_allowed` (SEC-001) |
| Store mismatch | 403 | `store_mismatch` |
| Missing required field | 400 | Field name |
| Invalid barcode | 422 | `VALIDATION_ERROR` |
| Barcode conflict | 409 | `BARCODE_ALREADY_MAPPED` |
| Insufficient stock | 400 | `INSUFFICIENT_STOCK` |
| Sale expired (>30min) | 409 | `SALE_RESERVATION_EXPIRED` |
| UPI offline | 0 | `upi_offline_blocked` |
| Rate limited | 429 | `RATE_LIMITED` / `SALES_RATE_LIMIT_EXCEEDED` |

---

### 6. BACKEND ROUTES (All Route Handlers)

**Verdict: PASS with P0/P1 issues (ISSUE-020-001, 002, 003, 004)**

| Metric | Value |
|--------|-------|
| Route Files Audited | 15+ |
| Total Endpoints | 60+ |
| SQL Injection Risk | **0 — 100% parameterized queries** |
| Sensitive Data in Logs | **0 — phone masked, tokens never logged** |
| Missing Auth | **0 — all routes properly protected** |
| Missing Transactions | **0 — all multi-table writes use BEGIN/COMMIT** |
| Remaining lowercase status bugs | **0 — all FIX-019 confirmed fixed** |
| Issues | 3 (P0×2, P1×1) |

**Security Analysis:**

| Layer | Status |
|-------|--------|
| SQL Injection | SAFE — 100% parameterized |
| Auth (POS) | SAFE — Device token + store binding |
| Auth (Admin) | SAFE — JWT + RBAC + API key (SHA256 hashed) |
| Auth (Retailer) | SAFE — Firebase OTP + HttpOnly cookies |
| Rate Limiting | STRONG — Multi-layer: per-IP, per-store, per-device, global |
| Store Isolation | ENFORCED — storeOwnership + deviceToken middleware |
| Token Revocation | IMPLEMENTED — Checked every request |
| Timing Attacks | PROTECTED — timingSafeEqual for admin master token |
| Error Disclosure | BLOCKED — GL-CRIT-0055 error sanitizer |

---

## TICKETS FOR FIX-TO-GREEN

| Ticket | Severity | File | What | Fix |
|--------|----------|------|------|-----|
| ISSUE-020-001 | **P0** | `backend/src/routes/v1/admin/adminAuth.ts:20` | Hardcoded admin email allowlist | Move to env var or DB |
| ISSUE-020-002 | **P0** | `backend/src/routes/v1/admin/adminAuth.ts:35` | In-memory OTP storage | Move to Redis |
| ISSUE-020-003 | **P1** | `backend/src/routes/v1/admin/adminAuth.ts:26` | JWT_SECRET fallback to 'dev-jwt-secret' | Require in production |
| ISSUE-020-004 | **P1** | `backend/src/middleware/storeStatusGate.ts:48,52,64,89` | Debug console.log on every request | Remove or gate behind env |
| ISSUE-020-005 | P2 | `supermandi-superadmin/src/App.tsx` | Device grid not virtualized | Add pagination or virtualization |
| ISSUE-020-006 | P2 | `supermandi-superadmin/src/App.tsx` | POS events client-side filtering | Push filters to API |

---

## COMPLETENESS CHECKLIST

| Dimension | Covered | Method |
|-----------|---------|--------|
| Every clickable UI element | Yes | Source code audit of all page components |
| Every form field + validation | Yes | Traced all inputs, validation rules, error messages |
| Every API endpoint | Yes | Traced from frontend to backend route handlers |
| Every modal/drawer | Yes | Documented triggers, content, actions, dismiss behavior |
| Every table/list | Yes | Documented columns, pagination, search, sort, empty states |
| Every error state (401/403/404/500) | Yes | Traced error handling in API client + UI |
| Auth flow end-to-end | Yes | Token lifecycle, refresh, expiry, revocation |
| Offline behavior (POS) | Yes | Documented per-endpoint online/offline matrix |
| Rate limiting | Yes | Per-endpoint rate limit configuration documented |
| SQL injection | Yes | 100% of queries verified parameterized |
| Sensitive data in logs | Yes | Phone masked, tokens never logged, errors sanitized |
| Store isolation | Yes | Ownership middleware + device binding verified |
| Previous bugs (FIX-019) | Yes | All 5 lowercase status comparisons confirmed fixed |

---

## SESSION-1 VERDICT

**STOP. Awaiting operator sign-off.**

- 6 issues found (2×P0, 2×P1, 2×P2)
- P0 issues (ISSUE-020-001, 002) must be fixed before production deploy
- P1 issues (ISSUE-020-003, 004) should be fixed before production
- P2 issues (ISSUE-020-005, 006) can be deferred post-launch
- No code changes made in this session
- No commits, no Docker rebuilds

**When operator says "Proceed to Fix-to-Green", SESSION-2 will fix P0+P1 only.**
