# Master Risk Registry — Pre-Production Audit

> **Generated**: 2026-02-17 from 7-domain comprehensive audit
> **Baseline commit**: `792e5d7` (9 regression fixes) on `main`
> **Scope**: All findings from Migration, CI/CD, Docker, Env/Secrets, API Gateway, Frontend Build, Backend Services audits

---

## Tier 0: FIXED (Commit 792e5d7) — 9 Fixes

These were deployment-blocking issues. All resolved and pushed.

| # | Fix | Domain | Risk Prevented |
|---|-----|--------|---------------|
| F-001 | deploy.yml: nginx portals get `--port=80`, supplier-portal separate | CI/CD | Complete portal outage (502s on Cloud Run) |
| F-002 | Migration 149: `DROP POLICY IF EXISTS` before 22 `CREATE POLICY` | DB | Stuck backend on migration re-run |
| F-003 | Migration 153: `DO $ IF NOT EXISTS` on 2 `ADD CONSTRAINT` | DB | Stuck backend on migration re-run |
| F-004 | Migration 156: `IF NOT EXISTS` on 6 `CREATE TABLE` + 7 `CREATE INDEX` | DB | Stuck backend on migration re-run |
| F-005 | Landing Dockerfile: `COPY favicon.svg` + `COPY brand/` | Docker | Missing brand assets (broken logo) |
| F-006 | Supplier Dockerfile: `COPY --from=builder /app/public ./public` | Docker | Missing logos/favicon in supplier portal |
| F-007 | Supplier notifications: `NEXT_PUBLIC_API_URL` → `NEXT_PUBLIC_API_BASE_URL` | Code | Broken notifications API calls |
| F-008 | Superadmin nginx: Added HSTS + CSP to `/admin/` location block | Security | Security header gap (nginx inheritance) |
| F-009 | POS package.json: Added `expo-constants` + `expo-speech` direct deps | Build | pnpm strict mode build failure |

---

## Tier 1: MUST FIX BEFORE PRODUCTION — 15 Issues

These are safe for staging but MUST be resolved before production traffic.

### T1-001: In-Memory Admin Sessions (RISK-HIGH)
- **Domain**: Backend / Cloud Run
- **File**: `backend/services/api-gateway/src/services/adminSessionService.ts:76`
- **Issue**: Admin sessions stored in JavaScript `Map`. Lost on instance restart, cold start, or scale-out. Admin gets logged out randomly.
- **Fix**: Migrate session storage to Redis (Memorystore). Pattern exists in `backend/src/db/redis.ts`.
- **Impact**: SuperAdmin portal unusable with >1 instance

### T1-002: In-Memory OTP Store (RISK-HIGH)
- **Domain**: Backend / Cloud Run
- **File**: `backend/src/routes/v1/admin/adminOtp.ts:12-29`
- **Issue**: 5 Maps (otpStore, requestRateLimits, verifyFailures, verifiedTokens, ipRateLimits) stored in-memory. OTP verification fails if Cloud Run routes verify request to different instance than send request.
- **Fix**: Move OTP storage to Redis with TTL keys.
- **Impact**: Admin login OTP flow breaks under horizontal scaling

### T1-003: Missing SIGTERM Handlers in 4 Services (RISK-HIGH)
- **Domain**: Backend / Cloud Run
- **File**: `backend/services/inventory-service/src/index.ts`, `backend/services/order-service/src/index.ts`, `backend/services/platform-service/src/index.ts`, `backend/services/supplier-service/src/index.ts`
- **Issue**: No `SIGTERM`/`SIGINT` handlers. Cloud Run sends SIGTERM before kill. In-flight requests (including financial transactions) dropped abruptly.
- **Fix**: Add graceful shutdown pattern from `auth-service/src/index.ts` (server.close + 10s forced timeout).
- **Note**: Currently these run inside monolith (main-backend), so only affects microservice deployment mode. Safe for staging with monolith architecture.

### T1-004: Dual Database Connection Pools (RISK-HIGH)
- **Domain**: Backend / Database
- **File**: `backend/src/db/client.ts` (Drizzle max=50), `backend/packages/common/src/db/pool.ts` (Common max=10)
- **Issue**: Main-backend creates TWO pools: Drizzle (max=50) + Common (max=10) = 60 connections per instance. With all services, total could reach 150. Cloud SQL basic tier allows 100.
- **Fix**: Either (a) reduce Drizzle pool max to 20, (b) share one pool, or (c) upgrade Cloud SQL tier. Minimum: set `DB_POOL_MAX` env var in deploy.yml to cap total.
- **Impact**: Connection exhaustion under load → 500 errors

### T1-005: Local Filesystem Image Fallback (RISK-HIGH)
- **Domain**: Backend / Cloud Run
- **File**: `backend/src/routes/v1/uploads/images.ts:103`, `backend/src/routes/v1/pos/compliance.ts:190`
- **Issue**: If GCS upload fails, images fall back to local filesystem. Cloud Run filesystem is ephemeral — files LOST on restart.
- **Fix**: Remove local fallback. Return 503 error when GCS is unavailable instead of silently losing data.
- **Impact**: Uploaded images/compliance docs permanently lost

### T1-006: ANTHROPIC_API_KEY Missing from deploy.yml (RISK-HIGH)
- **Domain**: Env/Secrets
- **File**: `.github/workflows/deploy.yml`, `backend/services/voice-service/src/config.ts`
- **Issue**: Voice service calls `process.exit(1)` if `ANTHROPIC_API_KEY` missing in production. Not in deploy.yml `--set-secrets`.
- **Fix**: Add to GCP Secret Manager + deploy.yml, OR disable voice-service crash-on-missing (graceful degradation).
- **Impact**: Voice service container crash loop

### T1-007: PAYOUT_PROCESS_API_KEY Never Defined (RISK-MEDIUM)
- **Domain**: Env/Secrets
- **File**: `backend/src/routes/v1/webhooks.ts:418,461,505`
- **Issue**: Payment webhook authentication key referenced but never configured anywhere (.env, docker-compose, deploy.yml).
- **Fix**: Create secret in GCP Secret Manager + add to deploy.yml when payment feature launches.
- **Impact**: Payout webhooks accept unauthenticated requests (security gap)

### T1-008: RAZORPAY_WEBHOOK_SECRET Never Defined (RISK-MEDIUM)
- **Domain**: Env/Secrets
- **File**: `backend/src/routes/v1/webhooks/refundWebhook.ts:35`
- **Issue**: Razorpay webhook signature verification key missing from all config files.
- **Fix**: Same as T1-007 — create secret when Razorpay integration goes live.
- **Impact**: Refund webhooks can't verify authenticity

### T1-009: Drizzle Pool Missing SSL Config (RISK-MEDIUM)
- **Domain**: Backend / Database
- **File**: `backend/src/db/client.ts`
- **Issue**: Drizzle pool does not configure SSL. Common pool handles SSL via URL param or `DB_SSL=true`. If connecting directly to Cloud SQL (no Auth Proxy), Drizzle connections would be unencrypted.
- **Fix**: Add `ssl: { rejectUnauthorized: false }` to Drizzle pool config if `sslmode=require` in DATABASE_URL.
- **Note**: Safe with Cloud SQL Auth Proxy (handles SSL at proxy level).

### T1-010: Missing Gateway Routes for 4 Backend Namespaces (RISK-MEDIUM)
- **Domain**: API Gateway
- **File**: `backend/services/api-gateway/src/config.ts`
- **Issue**: Backend registers routes for `/api/v1/chat/*`, `/api/v1/credit/*`, `/api/v1/uploads/*`, `/api/v1/retailer/*` but gateway has no proxy entries. Requests return 404.
- **Fix**: Add proxy entries to gateway config, or confirm these are intentionally unreachable (document why).
- **Impact**: Chat, credit, image upload, and retailer registration features unreachable

### T1-011: authRateLimiter Exported But Never Applied (RISK-MEDIUM)
- **Domain**: API Gateway / Security
- **File**: `backend/services/api-gateway/src/middleware/rateLimiter.ts:46`
- **Issue**: Stricter 5/min auth rate limiter is defined and exported but never mounted. Auth endpoints fall under general 30/min limit — too permissive for brute force protection.
- **Fix**: Apply `authRateLimiter` to auth route paths in `index.ts`.
- **Impact**: Login endpoints vulnerable to brute force (30 attempts/min)

### T1-012: SUPPLIER_PORTAL_URL Not in deploy.yml (RISK-MEDIUM)
- **Domain**: Env/Secrets
- **File**: `.github/workflows/deploy.yml`
- **Issue**: Supplier email notification links use wrong URL because `SUPPLIER_PORTAL_URL` env var not configured.
- **Fix**: Add `SUPPLIER_PORTAL_URL=https://staging.supermandi.tech/supplier` to deploy.yml env vars.
- **Impact**: Supplier email links point to wrong domain

### T1-013: Retailer-Admin `/s/:storeCode` Routes Bypass `/retailer/` Prefix (RISK-MEDIUM)
- **Domain**: Frontend / Routing
- **File**: `retailer-admin/src/App.tsx:289`
- **Issue**: Protected routes like `/s/STORE001/products` are NOT under `/retailer/`. If gateway only routes `/retailer/*` to retailer-admin, these paths 404 at gateway. Nginx only handles `/retailer/*` too.
- **Fix**: Verify GCP URL map has `/s/*` → retailer-admin rule, OR refactor routes to use `/retailer/s/:storeCode`.
- **Impact**: Deep-linked store URLs return 404

### T1-014: RATE_LIMIT_MULTIPLIER=100 in Staging (RISK-MEDIUM)
- **Domain**: Env/Secrets
- **File**: `.github/workflows/deploy.yml`
- **Issue**: `RATE_LIMIT_MULTIPLIER=100` effectively disables rate limiting in staging. Must be `1` for production.
- **Fix**: Set `RATE_LIMIT_MULTIPLIER=1` in production deploy config.
- **Impact**: No rate limiting in production if not changed

### T1-015: POS Test Failures (4/890) (RISK-LOW)
- **Domain**: Testing
- **File**: `src/__tests__/stores/cartStore.stockCap.test.ts`
- **Issue**: "marks unknown stock when stock is null" test fails. Pre-existing, not caused by our changes. Stock cap edge case.
- **Fix**: Fix test assertion or stock cap logic for null stock case.
- **Impact**: CI test suite not 100% green

---

## Tier 2: SHOULD FIX FOR PRODUCTION HARDENING — 18 Issues

These improve reliability, performance, and maintainability but are not blocking.

### T2-001: In-Memory Rate Limiters (RISK-MEDIUM)
- **File**: `backend/src/middleware/posRateLimiter.ts`, `rateLimit.ts`, `authProtection.ts`, `registrationRateLimiter.ts`
- **Issue**: All rate limiting uses per-instance Maps. With N instances, effective rate limit is N× configured limit.
- **Fix**: Move to Redis-based rate limiting (ioredis already available).

### T2-002: SSE State Per-Instance (RISK-MEDIUM)
- **File**: `backend/src/services/sseService.ts:12`
- **Issue**: SSE connections tracked in-memory Map. Scale-out means devices miss events from other instances.
- **Fix**: Redis pub/sub for cross-instance SSE event fanout.

### T2-003: Voice Service Two-Step Flow (RISK-MEDIUM)
- **File**: `backend/services/voice-service/src/routes/voice.ts:57`
- **Issue**: Voice interpret stores request in Map, execute reads it. Different instance = execute fails.
- **Fix**: Store voice request state in Redis with short TTL.

### T2-004: Webhook Dedup Fallback In-Memory (RISK-MEDIUM)
- **File**: `backend/src/routes/v1/webhooks.ts`
- **Issue**: Processed webhook events stored in Map as fallback dedup. Cross-instance, webhooks may be processed twice.
- **Fix**: Redis SET with TTL for idempotency keys.

### T2-005: Redis KEYS Command in Catalog Service (RISK-MEDIUM)
- **File**: `backend/services/catalog-service/src/cache/redis.ts:144`
- **Issue**: `redis.keys()` is O(N) and blocks Redis. Under high key count, stalls all Redis operations.
- **Fix**: Replace with `SCAN` cursor-based iteration.

### T2-006: Frontend Dockerfiles Use npm install (Not Reproducible) (RISK-MEDIUM)
- **File**: `retailer-admin/Dockerfile:24`, `supplier-portal/Dockerfile:19`, `supermandi-superadmin/Dockerfile:20`
- **Issue**: `npm install` without lockfile. Builds not reproducible — different deps possible between builds.
- **Fix**: Add `package-lock.json` to each portal and use `npm ci`.

### T2-007: Supplier Portal Missing output: 'standalone' (RISK-MEDIUM)
- **File**: `supplier-portal/next.config.js`
- **Issue**: Docker image is ~500MB instead of ~100MB. Wastes Cloud Run resources, slows cold starts.
- **Fix**: Add `output: 'standalone'` and update Dockerfile to use standalone directory.

### T2-008: Supplier Portal Missing .env.production (RISK-MEDIUM)
- **File**: `supplier-portal/` (no .env files)
- **Issue**: Firebase config must be injected via build args or CI. If not configured, phone auth fails silently.
- **Fix**: Create `.env.production.example` with placeholder values, ensure CI passes Firebase vars.

### T2-009: Superadmin Missing .env Files (RISK-MEDIUM)
- **File**: `supermandi-superadmin/` (no .env files)
- **Issue**: `VITE_API_BASE_URL` must come from Docker build args. No example file documents required vars.
- **Fix**: Create `.env.example` documenting required build-time variables.

### T2-010: No uncaughtException/unhandledRejection Handlers (RISK-MEDIUM)
- **File**: All `backend/services/*/src/index.ts` except main-backend
- **Issue**: Unhandled rejections leave services in bad state without logging.
- **Fix**: Add handlers following `backend/src/server.ts:82-89` pattern.

### T2-011: Unstructured Logging in Microservices (RISK-MEDIUM)
- **File**: All `backend/services/*/src/index.ts` except main-backend and api-gateway
- **Issue**: Console.log output not JSON-structured. Hard to search/filter in Cloud Logging.
- **Fix**: Use `createLogger` from `@supermandi/common`.

### T2-012: No server.close() in Shutdown (RISK-MEDIUM)
- **File**: `backend/services/catalog-service`, `reorder-service`, `payment-service`, `voice-service`
- **Issue**: Some services close resources (Redis, consumers) but don't stop HTTP server. In-flight requests dropped.
- **Fix**: Add `server.close()` before resource cleanup in SIGTERM handler.

### T2-013: Main-Backend Missing Dockerfile HEALTHCHECK (RISK-MEDIUM)
- **File**: `backend/Dockerfile.main`
- **Issue**: Unlike all other Dockerfiles, no `HEALTHCHECK` instruction. Not a Cloud Run issue (Cloud Run ignores it) but affects standalone Docker.
- **Fix**: Add `HEALTHCHECK --interval=30s --timeout=10s --start-period=30s CMD wget --spider http://localhost:3010/health || exit 1`.

### T2-014: Voice Service Port Default Mismatch (RISK-LOW)
- **File**: `backend/services/voice-service/src/config.ts:32`
- **Issue**: Dockerfile sets `ENV VOICE_SERVICE_PORT=3008`, config.ts defaults to 3009. Works because ENV wins.
- **Fix**: Change config.ts default from 3009 to 3008.

### T2-015: Retailer-Admin Dual API_BASE Pattern (RISK-LOW)
- **File**: `retailer-admin/src/api/store.ts:5` vs `retailer-admin/src/lib/api.ts:10`
- **Issue**: Two different approaches to construct API base URL. Could diverge on refactor.
- **Fix**: Consolidate to use `authFetch` from `lib/api.ts` consistently.

### T2-016: Superadmin No URL-Based Routing (RISK-LOW)
- **File**: `supermandi-superadmin/src/App.tsx`
- **Issue**: Tab navigation via React state, no react-router. Refresh always returns to default tab. No deep-linkable URLs.
- **Fix**: Add react-router-dom for tab-based URL routing (`/admin/stores`, `/admin/suppliers`, etc.).

### T2-017: Superadmin Missing _version.json Plugin (RISK-LOW)
- **File**: `supermandi-superadmin/vite.config.ts`
- **Issue**: Retailer-admin has version plugin writing `_version.json`. Superadmin does not.
- **Fix**: Add same Vite plugin for deployment verification.

### T2-018: Superadmin .dockerignore Over-Broad .env* (RISK-LOW)
- **File**: `supermandi-superadmin/.dockerignore:5`
- **Issue**: Pattern `.env*` excludes ALL .env files. Currently not breaking but will cause silent failures if .env.production needed later.
- **Fix**: Change to `.env`, `.env.local`, `.env.*.local`.

---

## Tier 3: KNOWN ARCHITECTURAL DEBT — 12 Issues

Pre-existing design decisions. Fix when relevant feature launches or during next architecture review.

### T3-001: Duplicate Migration Numbers (100, 101, 108)
- 7 files share 3 migration numbers. Lexicographic sort produces deterministic order and files are independent, but fragile.
- **Fix**: Renumber to unique sequential numbers in a cleanup migration batch.

### T3-002: Missing Migration Numbers (115-117, 158)
- Gaps in numbering from deleted/skipped migrations. Not documented.
- **Fix**: Add README note explaining gaps, or create placeholder files.

### T3-003: RLS Coverage Gaps
- Migration 149 covers 22 tables but 15+ store-scoped tables created before/after lack RLS (refunds, purchase_cart_drafts, khata_entries, all tables from migrations 152-159).
- **Fix**: New migration (160+) adding RLS policies for missing tables.

### T3-004: Missing FK Constraints in Migration 152
- `store_id` columns in payment_reminders, refund_requests, gst_summary_reports, invoice_archives lack `REFERENCES platform.stores(id)`.
- **Fix**: Add FK constraints in new migration.

### T3-005: GCS_CHAT_BUCKET Not Configured
- Chat file upload bucket not provisioned in GCP or configured in deploy.yml.
- **Fix**: Create bucket when chat feature launches.

### T3-006: EXPO_PUBLIC_FIREBASE_* Missing from POS .env Templates
- 6 Firebase env vars referenced in `src/config/firebase.ts` but no `.env.example` documents them.
- **Fix**: Create `.env.example` with placeholder values.

### T3-007: bcrypt Native Module in Auth Service
- Auth service uses native `bcrypt` (requires build tools). Root backend uses `bcryptjs` (pure JS).
- **Fix**: Standardize on `bcryptjs` across all services.

### T3-008: BullMQ in Root Backend package.json
- `bullmq` listed in root but only used by reorder/catalog services. Increases main-backend image size.
- **Fix**: Remove from root, keep only in service-specific package.json.

### T3-009: OpenAI Package Unused
- `openai` listed in root but voice has migrated to Anthropic SDK.
- **Fix**: Remove unused dependency.

### T3-010: Redis Without Password in Memorystore
- Memorystore configured without AUTH. VPC-internal so acceptable, but fragile.
- **Fix**: Enable AUTH when Memorystore supports it or if VPC exposure changes.

### T3-011: max_devices Default Inconsistency
- Migration 044 sets DEFAULT 10, migration 146 attempts DEFAULT 5. Column exists from 044 so 146 is no-op.
- **Fix**: Clarify intended default in documentation.

### T3-012: migrate-prod.js Self-Committed Migration Tracking
- When migration has own BEGIN/COMMIT, tracking INSERT happens outside transaction. If INSERT fails, migration ran but not tracked → re-run on next deploy.
- **Fix**: Add retry logic for tracking INSERT, or wrap tracking in separate transaction.

---

## Tier 4: ALREADY SECURE / VERIFIED SAFE — 35+ Areas

These areas were audited and confirmed safe. No action needed.

### API Gateway (10 safe areas)
- CORS: No wildcard in production defaults, fail-closed
- JWT auth: Proper verification, claim validation, header stripping, demo token rejection
- Admin auth: Session JWT with expiry, timing-safe comparison, rate limiting
- Actor type enforcement: Cross-portal access blocked at gateway
- CSRF protection: Custom header requirement on state-changing methods
- Health endpoints: Multiple paths, upstream checks, Dockerfile healthcheck
- Body size limits: Per-endpoint limits (2KB–10MB)
- Timeouts: 30s across request and proxy layers
- Error handling: 503 for upstream failures, structured logging, graceful shutdown
- ROUTING_SPEC.json: Service names match Cloud Run, paths match LB config

### Database (5 safe areas)
- All migrations 141-148, 150-152, 154-155, 157, 159: Fully idempotent
- Migration runner: Lexicographic sort correct for 3-digit padded filenames
- Advisory lock: `pg_advisory_lock(839271)` prevents concurrent runs
- Docker entrypoint: Waits for PostgreSQL (30 retries × 2s), runs migrations, then starts server
- Connection retry: Circuit breaker (5 failures/60s, 30s reset) in common pool

### CI/CD (3 safe areas)
- All 6 Docker images built with SHA tags (no :latest)
- deploy.yml validates image digests before deploying
- ZRP-D-003 gate validates all 9 secrets exist pre-deploy

### Docker (6 safe areas)
- All Dockerfiles use node:20-alpine (pinned major)
- All backend Dockerfiles use `pnpm install --frozen-lockfile`
- All containers run as non-root (nodejs:1001 or nginx)
- All Dockerfiles have HEALTHCHECK (except main-backend — T2-013)
- docker-compose.prod.yml has resource limits, log rotation, SHA-tagged images
- 127.0.0.1 used in healthchecks (Windows Docker IPv6 fix — HL-004)

### Frontend Builds (5 safe areas)
- All base paths match gateway routing (/retailer/, /supplier, /admin/)
- All portals use empty string API base URL (relative paths) in production
- All portals have build-time guards against undefined API URLs
- TypeScript strict mode enabled across all portals
- Console/debugger stripped in production builds

### Backend Services (6 safe areas)
- All services respect PORT env var (Cloud Run requirement)
- Production fail-fast for missing critical env vars
- Trust proxy correctly configured for Cloud Run
- Helmet security headers on all services
- Graceful Firebase/Razorpay degradation
- Request timeout 30s, DB statement timeout 30s

### Secrets (3 safe areas)
- All 9 GCP Secret Manager secrets properly mapped
- No hardcoded real secrets in source code
- Pre-deploy gate validates secret existence

---

## Execution Priority Matrix

| Priority | Count | When to Fix | Ticket Pattern |
|----------|-------|-------------|----------------|
| **Tier 0** (FIXED) | 9 | Done (792e5d7) | — |
| **Tier 1** (Must fix) | 15 | Before production traffic | PROD-001 to PROD-015 |
| **Tier 2** (Should fix) | 18 | During production hardening sprint | HARD-001 to HARD-018 |
| **Tier 3** (Debt) | 12 | Next architecture review | DEBT-001 to DEBT-012 |
| **Tier 4** (Safe) | 35+ | No action | — |
| **TOTAL** | ~90 | — | — |

---

## Quick Decision Guide

```
Is it blocking deployment to staging?
  → All FIXED in Tier 0

Is it blocking production traffic?
  → Check Tier 1 (15 items)

Could it cause data loss or security breach?
  → T1-001, T1-002, T1-005, T1-007, T1-008, T1-011

Could it cause outage under load?
  → T1-004, T2-001, T2-002

Is it a silent failure (no error, wrong behavior)?
  → T1-007, T1-012, T1-013, T2-008, T2-009
```
