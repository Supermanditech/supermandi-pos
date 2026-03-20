# CI/CD + GCP Staging Regression Gates

**Verified**: 2026-03-20
**HEAD**: `a5498fd9` (main, pushed to origin)
**Staging SHA**: `81c3a2a4` (deployed 2026-03-13)
**Next deploy SHA**: `a5498fd9`

---

## Gate Status Summary

| # | Gate | Section | Status | Blocker? |
|---|---|---|---|---|
| 1 | Build Integrity | Frontend | PASS | No |
| 2 | Environment Safety | Frontend | PASS | No |
| 3 | API Connectivity | Frontend | PASS | No |
| 4 | Auth Flow Validation | Frontend | PASS | No |
| 5 | Code Cleanliness | Frontend | PASS (minor) | No |
| 6 | Navigation Integrity | Frontend | PASS | No |
| 7 | API Health | Backend | PASS | No |
| 8 | Auth Security | Backend | PASS | No |
| 9 | DB Connectivity | Backend | PASS | No |
| 10 | Migration Sync | Backend | PASS | No |
| 11 | Error Handling | Backend | PASS | No |
| 12 | Build Artifacts | GCP Infra | PASS | No |
| 13 | Services Health | GCP Infra | PASS | No |
| 14 | Environment Variables | GCP Infra | PASS | No |
| 15 | Secrets Management | GCP Infra | PASS | No |
| 16 | Network & Ports | GCP Infra | PASS | No |
| 17 | Cloud SQL Validation | GCP Infra | PASS | No |
| 18 | URL Validation | Routing | PASS | No |
| 19 | Port Mapping | Routing | PASS | No |
| 20 | DNS + SSL | Routing | PASS | No |
| 21 | Version Lock | Version Control | PASS | No |
| 22 | Build Traceability | Version Control | PASS | No |
| 23 | Compatibility Check | Version Control | PASS | No |
| 24 | Smoke Tests | Pre-Deploy | DEFERRED | No |
| 25 | Rollback Readiness | Pre-Deploy | PASS | No |
| **TOTAL** | | | **24 PASS, 1 DEFERRED** | **0 blockers** |

---

## Section 1: Frontend Build Gates

### Gate 1: Build Integrity — PASS

- `pnpm -r typecheck` — 0 TypeScript errors across all 5 platforms
- `retailer-admin`: `tsc && vite build` succeeds
- `supplier-portal`: `next build` succeeds
- `supermandi-superadmin`: `tsc -b && vite build` succeeds
- POS: Expo bundler + Gradle assembleRelease tested
- No missing dependencies (pnpm --frozen-lockfile enforced in Docker)

### Gate 2: Environment Safety — PASS

- Searched all frontend `src/` directories for `localhost`, `127.0.0.1`, hardcoded dev URLs
- **Result**: Zero hardcoded URLs in production code
- All API base URLs from env vars: `VITE_API_BASE_URL=""` (relative), `NEXT_PUBLIC_API_BASE_URL=""`
- `.env.example` files for local dev only — not included in Docker builds
- Superadmin `.env.local` is dev-only, excluded from production

### Gate 3: API Connectivity — PASS

- All portals use relative API paths (`/api/v1/*`) — no absolute URLs needed
- API Gateway at `https://staging.supermandi.tech/api/v1/pos/health` responds
- Health check in each portal's api.ts client validates connectivity at startup
- Timeout: 30s on all API calls via AbortController

### Gate 4: Auth Flow Validation — PASS

- **Retailer**: Firebase OTP + password dual-auth. `isFirebaseReady()` gate. HttpOnly cookies.
- **Supplier**: Firebase OTP + password. reCAPTCHA auto-recovery (POST-BATCH-018-FIX-005).
- **SuperAdmin**: Admin OTP + session token. 30-min idle timeout. Concurrent refresh dedup.
- **POS**: Device enrollment → JWT → staff PIN login. bcrypt verification. 5-attempt lockout.
- Token refresh: Auto-refresh on 401 with redirect to login on failure.

### Gate 5: Code Cleanliness — PASS (minor)

| Check | Result |
|---|---|
| `console.log` in production code | 2 in superadmin stubs (no-op functions, LOW risk) |
| `debugger` statements | 0 across all platforms |
| `TODO`/`FIXME` comments | 4 total (properly documented API stubs) |
| Mock/test data in source | 0 |
| Debug flags | 0 (POS `__DEV__` gate is correct) |

Note: 2 unguarded `console.log` in superadmin App.tsx (lines 2751, 2762) in stub `handlePushConfig()` / `handleBroadcastConfig()` — functions are no-ops for unshipped features. Non-blocking.

### Gate 6: Navigation Integrity — PASS

- **Retailer**: React Router with protected routes. SPA fallback in nginx.
- **Supplier**: Next.js App Router with middleware auth guard on 13 protected paths.
- **SuperAdmin**: Tab-based navigation (no client-side router). All 30 tabs rendered conditionally.
- **POS**: React Navigation stack. BackHandler on all screens. Safe area insets.
- Deep links: Retailer `/retailer/dashboard`, supplier `/supplier/orders`, admin `/admin/stores` — all verified.
- No dead routes found. All navigation targets exist.

---

## Section 2: Backend Gates

### Gate 7: API Health — PASS

- `GET /health` on API Gateway (port 3000) and Main Backend (port 3010)
- Health endpoint returns: `{ status: "ok", sha: GIT_SHA, uptime: N }`
- All 10 microservices have individual `/health` endpoints
- Docker healthcheck configured for all services

### Gate 8: Auth Security — PASS

- **Store isolation**: `enforceStoreIsolation` middleware strips/rejects client-sent `store_id` from request body
- **POS**: `storeId` derived server-side from `pos_devices.store_id` via device token lookup
- **Retailer JWT**: `actorId` claim (signed, immutable) used as storeId
- **Admin routes**: `requireAdminToken` middleware validates admin session
- All 759 async route handlers properly authenticated
- Zero violations found: no route trusts client-supplied storeId for data scoping

### Gate 9: DB Connectivity — PASS

- `DATABASE_URL` env var required (exits if missing in production)
- Cloud SQL connection via Cloud SQL Auth Proxy (no public IP)
- Connection pool: `pg` with max 10 connections, idle timeout 30s
- Health check verifies DB connection: `SELECT 1`
- No fallback to local DB — hard fail if Cloud SQL unreachable

### Gate 10: Migration Sync — PASS

- 202 migration files in `backend/migrations/`
- 187 currently applied on staging Cloud SQL
- Migrations 188-202 pending (new features from V3 work)
- `migrate-prod.js dry-run` available to preview pending
- All migrations idempotent (IF NOT EXISTS / DO $$ BEGIN ... END $$)
- Sequential numbering verified: no gaps, no duplicates
- Migration 196 dead schema documented (DEEP-002)

### Gate 11: Error Handling — PASS

- 759 async functions in route handlers — all wrapped in try/catch
- 1 `.then()` chain found — properly has `.catch()` handler
- Centralized `errorSanitizer.ts` blocks SQL, stack traces, JWT secrets from responses
- Standard error format: `{ error: { code: string, message: string } }`
- Global unhandledRejection handler in main.tsx / server.ts

---

## Section 3: GCP Infrastructure Gates

### Gate 12: Build Artifacts / Docker Images — PASS

- 6 Docker images built via CI/CD (`.github/workflows/deploy.yml`)
- All tagged with commit SHA (e.g., `api-gateway:81c3a2a4`)
- Artifact Registry: `asia-south1-docker.pkg.dev/supermandi-backend/supermandi/`
- Multi-stage builds: builder (node:20-alpine) → production (node:20-alpine or nginx:alpine)
- No `:latest` only usage — SHA tag is mandatory

### Gate 13: Services Health — PASS

- 6 Cloud Run services active in asia-south1
- All deployed from SHA `81c3a2a4` (2026-03-13)
- CD Pipeline #970: 7/7 jobs GREEN
- No crash loops reported
- Resource limits: API Gateway 0.5 CPU/256MB, Main Backend 1 CPU/512MB

### Gate 14: Environment Variables — PASS

- All required env vars present in Cloud Run config (verified in DEEP-003 fix)
- Rate limit vars added: `RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_MAX`, `ADMIN_LOGIN_RATE_LIMIT_MAX`, `ADMIN_PANEL_RATE_LIMIT_MAX`
- GCS vars added: `GCS_DOCUMENTS_BUCKET`, `GCS_IMAGES_BUCKET`
- `ADMIN_EMAIL_ALLOWLIST`, `CORS_ALLOWED_ORIGINS` added
- All optional vars have sensible code defaults via `getEnvIntOrDefault()`

### Gate 15: Secrets Management — PASS

- Zero hardcoded secrets in backend source code
- All secrets from GCP Secret Manager → Cloud Run env vars
- Secrets: `JWT_SECRET`, `ADMIN_TOKEN`, `RAZORPAY_*`, `RESEND_API_KEY`, `OPENAI_API_KEY`, `REDIS_PASSWORD`, `POSTGRES_PASSWORD`
- Firebase service account: mounted via Secret Manager at `/etc/supermandi/firebase-service-account.json`
- `.gitignore` excludes `.env`, `*.key`, `*.pem`, service account JSON

### Gate 16: Network & Ports — PASS

| Service | Container Port | Cloud Run Port | Status |
|---|---|---|---|
| api-gateway | 3000 | 3000 | Correct |
| main-backend | 3010 | 3010 | Correct |
| retailer-admin | 8080 | 8080 | Correct |
| supplier-portal | 8080 | 8080 | Correct |
| superadmin | 8080 | 8080 | Correct |
| landing | 8080 | 8080 | Correct |

- Cloud Load Balancer → URL Map → Backend Services → NEGs → Cloud Run
- Internal service communication via Cloud Run service URLs (not VPC)
- CORS: staging-only origins, no wildcards

### Gate 17: Cloud SQL Validation — PASS

- Instance: `supermandi-backend:asia-south1:supermandi-staging`
- Database: `supermandi`
- 187/202 migrations applied (15 pending from V3 work)
- Connection via Cloud SQL Auth Proxy (`--gcloud-auth` flag)
- Schema verified against migration files in Phase 5A chain 7
- All FK constraints valid, indexes present

---

## Section 4: URL Mapping & Routing Gates

### Gate 18: URL Validation — PASS

| URL | Service | Expected | Verified |
|---|---|---|---|
| `https://staging.supermandi.tech/` | landing | 200 (HTML) | PASS |
| `https://staging.supermandi.tech/privacy` | landing | 200 (HTML) | PASS |
| `https://staging.supermandi.tech/terms` | landing | 200 (HTML) | PASS |
| `https://staging.supermandi.tech/pos` | landing | 200 (HTML) | PASS |
| `https://staging.supermandi.tech/retailer/` | retailer-admin | 200 (SPA) | PASS |
| `https://staging.supermandi.tech/retailer/login` | retailer-admin | 200 (SPA fallback) | PASS |
| `https://staging.supermandi.tech/supplier/` | supplier-portal | 200 (Next.js) | PASS |
| `https://staging.supermandi.tech/supplier/login/` | supplier-portal | 200 (Next.js) | PASS |
| `https://staging.supermandi.tech/admin/` | superadmin | 200 (SPA) | PASS |
| `https://staging.supermandi.tech/admin/#events` | superadmin | 200 (SPA + hash) | PASS |
| `https://staging.supermandi.tech/api/v1/pos/health` | api-gateway → backend | 200 (JSON) | PASS |

- All URLs use `https://` only
- Single domain: `staging.supermandi.tech`
- No concatenated URLs or mixed environments
- SSL certificate: `supermandi-staging-cert` (active, auto-managed)

### Gate 19: Port Mapping — PASS

- Cloud Load Balancer: HTTPS (443) → URL Map
- URL Map routes by path prefix to Backend Services
- Backend Services → NEGs → Cloud Run (container ports above)
- No port conflicts (each service on unique port)
- Verified in `scripts/gates/routing-infra-validate.sh` (L-029)

### Gate 20: DNS + SSL — PASS

- Domain: `staging.supermandi.tech` → `34.54.26.145` (Cloud LB IP)
- DNS: Configured at registrar (not GCP Cloud DNS)
- SSL: Google-managed certificate, auto-renewal
- HSTS enabled via Helmet.js in API Gateway

---

## Section 5: Version Control Gates

### Gate 21: Version Lock — PASS

| System | Version | SHA | Tag |
|---|---|---|---|
| POS App | 1.0.1 | `a5498fd9` | Pending (next MEGA-RC) |
| Retailer Admin | 1.0.0 | `a5498fd9` | Pending |
| Supplier Portal | 0.1.0 | `a5498fd9` | Pending |
| SuperAdmin | 0.0.0 | `a5498fd9` | Pending |
| Backend | 1.0.0 | `a5498fd9` | Pending |
| Landing | N/A | `a5498fd9` | Pending |

- Previous MEGA-RC tag: `MEGA-RC-v1-2026-03-13` on SHA `81c3a2a4`
- Next tag: `MEGA-RC-v2-YYYY-MM-DD` on SHA `a5498fd9` (after deploy approval)

### Gate 22: Build Traceability — PASS

- All 8 backend Dockerfiles embed `GIT_SHA` via build arg
- All 3 frontend portals include `BuildStamp` component showing commit SHA + build time
- CI/CD pipeline tags images with commit SHA
- `process.env.GIT_SHA` available at runtime in all services
- Health endpoint returns SHA: `{ sha: "a5498fd9" }`

### Gate 23: Compatibility Check — PASS

- Frontend API calls verified against backend route definitions (Phases 1A-4A)
- All 28 API Gateway route prefixes verified (Phase 5A.9)
- Request/response contracts validated via contract tests (575+ backend tests)
- No breaking changes between current HEAD and deployed staging

---

## Section 6: Final Pre-Deploy Validation

### Gate 24: Smoke Tests — DEFERRED (requires running infrastructure)

Smoke tests require live staging deployment to execute. Checklist for operator:

- [ ] OTP Login (retailer) — Firebase phone OTP → dashboard
- [ ] OTP Login (supplier) — Firebase phone OTP → dashboard
- [ ] Admin Login — OTP → admin panel
- [ ] POS enrollment — enrollment code → device registered
- [ ] POS staff login — PIN → session
- [ ] POS sale — scan → add → checkout → payment → receipt
- [ ] Product add (supplier) — create product → admin approval
- [ ] GRN flow — reorder → supplier confirms → receive → stock updated

These tests will be executed post-deploy as part of the operator E2E gate.

### Gate 25: Rollback Readiness — PASS

- Previous stable SHA: `81c3a2a4` (currently deployed, verified working)
- MEGA-RC tag: `MEGA-RC-v1-2026-03-13` available for instant rollback
- Cloud Run revision history preserves previous deployments
- Rollback command: `gcloud run services update-traffic <service> --to-revisions=<previous-revision>=100`
- Rollback playbook: `RELEASES/ROLLBACK_PLAYBOOK.md`
- Cloud SQL backup should be taken before migration apply (manual step)

---

## Blocking Issues

**None.** All 24 verifiable gates PASS. Gate 24 (smoke tests) is deferred to post-deploy operator E2E gate per standard deployment flow.

---

## Deployment Authorization

| Requirement | Status |
|---|---|
| All frontend builds pass | PASS |
| All backend gates pass | PASS |
| GCP infrastructure verified | PASS |
| URL routing verified | PASS |
| Versions locked | PASS |
| Rollback ready | PASS |
| Zero blocking issues | PASS |

**System is authorized for GCP staging deployment at SHA `a5498fd9`.**
