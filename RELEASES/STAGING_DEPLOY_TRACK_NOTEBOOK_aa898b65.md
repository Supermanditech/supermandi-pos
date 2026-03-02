# STAGING DEPLOY TRACK NOTEBOOK — SHA aa898b65

> **Created**: 2026-03-02
> **Deploy Target**: `aa898b65` (explicit, via `workflow_dispatch` SHA input)
> **HEAD at time of audit**: `23ef8b2f` (state-only commit on top of aa898b65)
> **App code SHA**: `aa898b65` — state-only commits after this do not change built artifacts
> **Decision**: Deploy explicit SHA `aa898b65` via workflow_dispatch. Machine state already synced.

---

## SHA PARITY TABLE

| Layer | SHA | Status |
|-------|-----|--------|
| Git HEAD (origin/main) | `23ef8b2f` | Pushed |
| App code (last code change) | `aa898b65` | Fixed wrong-project defaults |
| Machine state deploy target | `aa898b65` | Synced in `23ef8b2f` |
| workflow_dispatch input | `aa898b65` | **Use this exact value** |
| CI will checkout | `aa898b65` | Matches deploy target |
| GIT_SHA env var at runtime | `aa898b65` | Set by deploy.yml |
| Post-deploy /version check | `aa898b65` | Must match |

---

# PRIMARY BUILDS — 4 USER-FACING SURFACES

These are the 4 products that end users interact with. Each is a first-class deployment surface.

---

## 1. POS APP (Mobile — Expo/React Native)

### Build Identity

| Field | Value |
|-------|-------|
| **Git source SHA** | `aa898b65` |
| **Deploy target SHA** | `aa898b65` (app.config.js computes git SHA at EAS build time) |
| **Build artifact type** | Expo EAS build → Android APK/AAB (Play Store), iOS IPA (App Store) |
| **Build stamp source in code** | [app.config.js](app.config.js) → `computeBuildInfo()` → `extra.BUILD_GIT_SHA` (line 36-37). Fallback chain: git SHA → BUILD_ID → timestamp. Never "unknown". |
| **Runtime version/build visibility** | `BUILD_INFO.gitSha` from [src/config/api.ts:55](src/config/api.ts#L55) — visible in Splash debug info, PosStatusBar, HelpScreen |
| **URL / app navigation target** | Native app. API target: `app.json` → `extra.API_URL: "https://supermandi.tech"`. Staging override: `EXPO_PUBLIC_API_URL=https://staging.supermandi.tech` at build time. |
| **Deployment target/service** | Play Store (`com.supermanditech.supermandipos`), App Store (pending listing). NOT deployed to Cloud Run. |
| **Env source** | [app.json](app.json) `extra` + [app.config.js](app.config.js) computed values. Dev overrides via `EXPO_PUBLIC_*` env vars. |

### POS-Specific Details

| Field | Value |
|-------|-------|
| **app.json version** | `1.0.1` (line 6). Android package: `com.supermanditech.supermandipos`. |
| **app.config.js build SHA source** | `gitExec("git rev-parse --short HEAD")` → fallback `BUILD_ID = B<timestamp>` (line 37, 7) |
| **EAS / build path** | `expo build` or `eas build --platform android`. No CI build — manual EAS trigger by operator. |
| **Device/session dependency** | Device token: 90-day expiry, stored in expo-secure-store. Enrollment via QR code (EnrollDeviceScreen). Session: device_enrollments table in Cloud SQL. Revocable via SuperAdmin. Device blocked → DeviceBlockedScreen. |
| **Offline SQLite schema/version** | Schema v4 ([src/services/offline/localDb.ts](src/services/offline/localDb.ts)). 6 tables: `offline_products`, `offline_prices`, `offline_sales`, `offline_sale_items`, `offline_collections`, `offline_outbox`. Self-heal on startup (21 critical columns auto-repaired). |
| **Scanner dependency** | Camera scanner via expo-camera ([src/screens/SellScanScreen.tsx](src/screens/SellScanScreen.tsx)). HID barcode scanner via [src/services/hidScannerService.ts](src/services/hidScannerService.ts). Intent-based scanner via [src/services/scan/scanIntent.ts](src/services/scan/scanIntent.ts). All three paths converge at [src/services/scan/handleScan.ts](src/services/scan/handleScan.ts). |
| **Printer dependency** | Bluetooth thermal printer via [src/services/printerService.ts](src/services/printerService.ts). ESC/POS protocol. Settings in [src/screens/PrinterSettingsScreen.tsx](src/screens/PrinterSettingsScreen.tsx). Stored in settingsStore (Zustand + AsyncStorage). Printer failure is non-blocking (sale completes without print). |

### Critical Runtime Dependencies

| Dependency | Required? | Offline Behavior |
|-----------|-----------|-----------------|
| Backend API (main-backend) | YES for sync, enrollment, product refresh | Offline mode: local SQLite for sales, products cached, outbox queues events |
| Firebase Identity Platform | NO — POS uses device token auth, not phone OTP | N/A |
| Cloud SQL (via backend) | YES for sync, product catalog | Queued in offline_outbox until connectivity restored |
| Redis (via backend) | NO — backend falls back to in-memory | Transparent to POS |
| Bluetooth printer | NO — sale completes without print | Print skipped, retry later |
| Camera/scanner | YES for barcode scanning | Manual barcode entry fallback |

### Posture Classifications

| Dimension | Classification | Detail |
|-----------|---------------|--------|
| **Scale posture** | **ASSUMED** for <1K SKUs/store. **UNPROVEN** for 10K SKUs (full product load over slow network). **BLOCKED** at 500M aggregate scans/day (starter infra). |
| **Security posture** | **PROVEN** — device token auth (90-day, revocable), expo-secure-store, no hardcoded secrets, console.log guarded by `__DEV__`, offline data scoped to enrolled store |
| **Rollback impact** | LOW — POS app is independently versioned. Backend rollback does not require POS rollback. POS min_app_version enforcement via ForceUpdateScreen if needed. |

### Post-Deploy Verification

- POS is **not** deployed to Cloud Run — no staging deploy step
- For staging testing: build with `EXPO_PUBLIC_API_URL=https://staging.supermandi.tech`
- Verify: Splash → version badge shows `aa898b65` (or current build SHA)
- Verify: EnrollDevice → scan QR → successful enrollment
- Verify: SellScan → scan barcode → add to cart → Payment → SuccessPrint
- Verify: Offline mode → airplane mode → complete sale → re-enable → sync

### Navigation Stack (44 screens)

**38 Stack.Screen routes** (App.tsx) + **6 embedded screens** inside PosRootLayout:

```
Splash → EnrollDevice → PaymentSetup
                      → DeviceBlocked
                      → ForceUpdate
                      → PosRootLayout (SellScan) ─── 5 TABS + StaffLogin ───
                          │  TAB: MENU → MenuScreen
                          │  TAB: SELL → SellScanScreen
                          │  TAB: PURCHASE → PurchaseScreen
                          │  TAB: REORDER → ReorderScreen
                          │  TAB: CREDIT → CreditScreen
                          │  EMBEDDED: StaffLoginScreen (PIN gate)
                          │
                          ├─ Payment → SuccessPrint
                          ├─ SalesHistory → BillDetail
                          ├─ BarcodeSheet
                          ├─ OrderHistory → OrderDetail → GRN → BarcodeSheet
                          ├─ ReorderSettings → ReorderPolicies
                          ├─ Inward
                          ├─ PurchaseHistory
                          ├─ SalesStatement / StockStatement
                          ├─ Buy (FeatureGate: "buy")
                          ├─ BnplDues / Khata / OverdueDues
                          ├─ CustomerList / CustomerManagement
                          ├─ DailyClosing / Shift / DailyReport
                          ├─ Return
                          ├─ PrinterSettings / OpeningStock
                          ├─ ChatList → ChatConversation
                          ├─ AIInsights / BulkPurchaseCredit
                          ├─ Help
                          └─ UiShowcase (QA only)
```

Deep link: `supermandi://enroll?code=X` → EnrollDeviceScreen

---

## 2. RETAILER WEB (Vite + React SPA)

### Build Identity

| Field | Value |
|-------|-------|
| **Git source SHA** | `aa898b65` |
| **Deploy target SHA** | `aa898b65` (Docker build-arg `VITE_GIT_SHA` → compile-time define) |
| **Build artifact type** | Docker image (nginx serving static SPA): `asia-south1-docker.pkg.dev/supermandi-backend/supermandi/retailer-admin:aa898b65` |
| **Build stamp source in code** | [retailer-admin/vite.config.ts:11](retailer-admin/vite.config.ts#L11) — `VITE_GIT_SHA` env → `VITE_BUILD_SHA` env → `git rev-parse --short HEAD`. Injected at compile time via `define: { 'import.meta.env.VITE_BUILD_SHA': ... }` (line 60). |
| **Runtime version/build visibility** | `GET /retailer/_version.json` → `{ commit, buildTime, portal: "retailer" }`. Written by versionPlugin() at build time (line 24-43). |
| **URL / base-path mapping** | `/retailer`, `/retailer/*` → GCP LB → retailer-backend NEG → Cloud Run `retailer-admin`. Vite `base: '/retailer/'` (line 57). |
| **Deployment target/service** | Cloud Run service: `retailer-admin`. 256Mi / 1 CPU, min=0 max=3, nginx on port 80. |
| **Env source** | Docker build-args: `VITE_API_BASE_URL=""` (relative paths through LB), `VITE_GIT_SHA`, `VITE_BUILD_TIME`. Firebase config from `.env.production` (baked at build time). |

### Web-Specific Details

| Field | Value |
|-------|-------|
| **Version endpoint** | `GET /retailer/_version.json` — static JSON file written to `dist/` at build time by versionPlugin() |
| **basePath / base URL mapping** | Vite `base: '/retailer/'` → all assets served under `/retailer/assets/`. LB path rule: `/retailer/*` → retailer-backend. |
| **nginx / static artifact behavior** | [retailer-admin/nginx.conf](retailer-admin/nginx.conf) — SPA fallback: `try_files $uri $uri/ /index.html`. Static assets: 1-year cache (`/assets/`). HTML: `no-cache`. |
| **Auth / Firebase dependency** | Firebase Identity Platform for phone OTP login ([retailer-admin/src/lib/firebase.ts](retailer-admin/src/lib/firebase.ts)). Used in: LoginPage, RegisterPage, ForgotPasswordPage, RetailerOnboardingPage. Firebase config from `.env.production`. |
| **Console stripping** | esbuild `drop: ['console', 'debugger']` (vite.config.ts line 73) — zero console output in production build |
| **Build-time guard** | FIX-004: Build fails if `VITE_API_BASE_URL` is undefined (line 48-53) |

### Critical Runtime Dependencies

| Dependency | Required? | Failure Behavior |
|-----------|-----------|-----------------|
| Backend API (via `/api/*` through LB) | YES | API errors shown in UI (4-state UX) |
| Firebase Identity Platform (`supermandi-pos` project) | YES for login/register (phone OTP) | Login blocked without Firebase |
| Cloud SQL (via backend) | YES | Backend returns 503, portal shows error state |
| Redis (via backend) | NO — backend falls back to in-memory | Transparent |

### Posture Classifications

| Dimension | Classification | Detail |
|-----------|---------------|--------|
| **Scale posture** | **PROVEN** for <1K SKUs. **ASSUMED** for 10K SKUs (data pagination proven, UI rendering untested). Static assets via nginx — scales horizontally. |
| **Security posture** | **PROVEN** — CORS restricted to staging domain, console stripped, build-time env guard. **PARTIALLY PROVEN** — nginx.conf missing security headers (X-Frame-Options, HSTS, CSP). Mitigated by API gateway Helmet + LB-level headers. |
| **Rollback impact** | LOW — static SPA, no server state. Cloud Run rollback: `gcloud run services update-traffic retailer-admin --to-revisions=<old>=100`. Instant. |

### Post-Deploy Verification

```bash
curl -s https://staging.supermandi.tech/retailer/_version.json | jq .commit
# Expected: "aa898b65"
curl -s -o /dev/null -w "%{http_code}" https://staging.supermandi.tech/retailer/
# Expected: 200
```

Browser: navigate to `https://staging.supermandi.tech/retailer/` → login page loads → Firebase reCAPTCHA widget visible.

---

## 3. SUPPLIER WEB (Next.js SSR)

### Build Identity

| Field | Value |
|-------|-------|
| **Git source SHA** | `aa898b65` |
| **Deploy target SHA** | `aa898b65` (Docker build-arg `NEXT_PUBLIC_GIT_SHA` → compile-time + runtime env) |
| **Build artifact type** | Docker image (Next.js server): `asia-south1-docker.pkg.dev/supermandi-backend/supermandi/supplier-portal:aa898b65` |
| **Build stamp source in code** | [supplier-portal/next.config.js:6](supplier-portal/next.config.js#L6) — `NEXT_PUBLIC_GIT_SHA` env → `git rev-parse --short HEAD`. Injected via `env: { NEXT_PUBLIC_BUILD_SHA: buildInfo.sha }` (line 103). |
| **Runtime version/build visibility** | `GET /supplier/api/version` → `{ commit, buildTime, portal: "supplier" }`. Server-side Next.js API route: [supplier-portal/src/app/api/version/route.ts](supplier-portal/src/app/api/version/route.ts). |
| **URL / base-path mapping** | `/supplier`, `/supplier/*` → GCP LB → supplier-backend NEG → Cloud Run `supplier-portal`. Next.js `basePath: '/supplier'` + `trailingSlash: true` (lines 61, 64). |
| **Deployment target/service** | Cloud Run service: `supplier-portal`. 256Mi / 1 CPU, min=0 max=3, Next.js on default port 8080. |
| **Env source** | Docker build-args: `NEXT_PUBLIC_API_BASE_URL=""` (relative paths through LB), `NEXT_PUBLIC_GIT_SHA`, `NEXT_PUBLIC_BUILD_TIME`. Firebase config from `.env.production`. |

### Web-Specific Details

| Field | Value |
|-------|-------|
| **Version endpoint** | `GET /supplier/api/version` — Next.js API route (server-side, reads `process.env.NEXT_PUBLIC_GIT_SHA` at request time) |
| **basePath / base URL mapping** | Next.js `basePath: '/supplier'`, `trailingSlash: true` (prevents 308 redirect at LB). LB path rule: `/supplier/*` → supplier-backend. Bare root redirect: `/ → /supplier` (SUP-ROOT-001). |
| **nginx / static artifact behavior** | No nginx — Next.js serves directly. Static assets under `/_next/static/` cached 1 year (immutable). `x-powered-by` suppressed (poweredByHeader: false). |
| **Auth / Firebase dependency** | Firebase Identity Platform for phone OTP login ([supplier-portal/src/lib/firebase.ts](supplier-portal/src/lib/firebase.ts)). Used in: login, register, forgot-password, onboard pages. |
| **Console stripping** | `compiler.removeConsole` — removes all except `error` and `warn` in production (next.config.js line 52-57) |
| **Build-time guard** | FIX-004: Build fails if `NEXT_PUBLIC_API_BASE_URL` is undefined (line 40-45) |
| **Security headers** | Full set via `headers()` in next.config.js: X-Frame-Options: DENY, X-Content-Type-Options: nosniff, HSTS 1 year, CSP with Firebase/reCAPTCHA allowlists, Referrer-Policy (lines 77-98) |

### Critical Runtime Dependencies

| Dependency | Required? | Failure Behavior |
|-----------|-----------|-----------------|
| Backend API (via `/api/*` through LB) | YES | API errors shown in UI |
| Firebase Identity Platform (`supermandi-pos` project) | YES for login/register (phone OTP) | Login blocked without Firebase |
| Cloud SQL (via backend) | YES | Backend returns 503, portal shows error state |
| Redis (via backend) | NO — backend falls back to in-memory | Transparent |

### Posture Classifications

| Dimension | Classification | Detail |
|-----------|---------------|--------|
| **Scale posture** | **PROVEN** for <1K SKUs. **ASSUMED** for 10K products (SSR rendering + data pagination). Next.js server — scales horizontally via Cloud Run autoscaling. |
| **Security posture** | **PROVEN** — full security headers in next.config.js, CORS restricted, console stripped, CSP with Firebase allowlists, x-powered-by suppressed |
| **Rollback impact** | LOW — server-rendered pages, no persistent server state beyond session. Cloud Run rollback instant. Note: Next.js `/_next/static/` hashes change per build — old cached JS chunks 404 after rollback until browser refresh. |

### Post-Deploy Verification

```bash
curl -s https://staging.supermandi.tech/supplier/api/version | jq .commit
# Expected: "aa898b65"
curl -s -o /dev/null -w "%{http_code}" https://staging.supermandi.tech/supplier/
# Expected: 200
```

Browser: navigate to `https://staging.supermandi.tech/supplier/` → login page loads → Firebase reCAPTCHA widget visible.

---

## 4. SUPERADMIN WEB (Vite + React SPA)

### Build Identity

| Field | Value |
|-------|-------|
| **Git source SHA** | `aa898b65` |
| **Deploy target SHA** | `aa898b65` (Docker build-arg `VITE_GIT_SHA` → compile-time define) |
| **Build artifact type** | Docker image (nginx serving static SPA): `asia-south1-docker.pkg.dev/supermandi-backend/supermandi/superadmin:aa898b65` |
| **Build stamp source in code** | [supermandi-superadmin/vite.config.ts:11](supermandi-superadmin/vite.config.ts#L11) — `VITE_GIT_SHA` env → `VITE_BUILD_SHA` env → `git rev-parse --short HEAD`. Injected at compile time via `define: { 'import.meta.env.VITE_BUILD_SHA': ... }` (line 61). |
| **Runtime version/build visibility** | `GET /admin/_version.json` → `{ commit, buildTime, portal: "superadmin" }`. Written by versionPlugin() at build time (line 24-43). |
| **URL / base-path mapping** | `/admin`, `/admin/*` → GCP LB → superadmin-backend NEG → Cloud Run `superadmin`. Vite `base: '/admin/'` (line 58). |
| **Deployment target/service** | Cloud Run service: `superadmin`. 256Mi / 1 CPU, min=0 max=3, nginx on port 80. |
| **Env source** | Docker build-args: `VITE_API_BASE_URL=""` (relative paths through LB), `VITE_GIT_SHA`, `VITE_BUILD_TIME`. No Firebase (SuperAdmin uses admin token / email OTP, not phone OTP). |

### Web-Specific Details

| Field | Value |
|-------|-------|
| **Version endpoint** | `GET /admin/_version.json` — static JSON file written to `dist/` at build time by versionPlugin() |
| **basePath / base URL mapping** | Vite `base: '/admin/'` → all assets served under `/admin/assets/`. LB path rule: `/admin/*` → superadmin-backend. |
| **nginx / static artifact behavior** | [supermandi-superadmin/nginx.conf](supermandi-superadmin/nginx.conf) — SPA fallback: `try_files $uri $uri/ /index.html`. Static assets: 1-year cache (`/assets/`). HTML: `no-cache`. |
| **Auth / Firebase dependency** | **No Firebase.** SuperAdmin authenticates via admin-token (master key), individual API keys (RBAC), or email OTP (JWT). Admin session stored in HttpOnly cookie. |
| **Console stripping** | esbuild `drop: ['console', 'debugger']` (vite.config.ts line 65) — zero console output in production build |
| **Build-time guard** | FIX-004: Build fails if `VITE_API_BASE_URL` is undefined (line 49-53) |

### Critical Runtime Dependencies

| Dependency | Required? | Failure Behavior |
|-----------|-----------|-----------------|
| Backend API (via `/api/*` through LB) | YES | API errors shown in UI |
| Firebase Identity Platform | **NO** — SuperAdmin does not use Firebase auth | N/A |
| Cloud SQL (via backend) | YES — store management, user management, enrollment codes | Backend returns 503, portal shows error state |
| Redis (via backend) | NO — backend falls back to in-memory | Transparent |

### Posture Classifications

| Dimension | Classification | Detail |
|-----------|---------------|--------|
| **Scale posture** | **PROVEN** — admin panel, not user-facing at scale. Single-digit concurrent admin users. Static assets via nginx. |
| **Security posture** | **PROVEN** — admin token with timing-safe comparison, RBAC, session-based auth. **PARTIALLY PROVEN** — nginx.conf missing security headers (X-Frame-Options, HSTS, CSP). Mitigated by API gateway Helmet. |
| **Rollback impact** | LOW — static SPA, no server state. Cloud Run rollback instant. Enrollment codes, store provisioning, QR generation are backend-side — unaffected by portal rollback. |

### Post-Deploy Verification

```bash
curl -s https://staging.supermandi.tech/admin/_version.json | jq .commit
# Expected: "aa898b65"
curl -s -o /dev/null -w "%{http_code}" https://staging.supermandi.tech/admin/
# Expected: 200
```

Browser: navigate to `https://staging.supermandi.tech/admin/` → login page loads → admin token or email OTP login.

---

# SECONDARY BUILDS — INFRASTRUCTURE & RUNTIME SERVICES

These surfaces are not directly user-facing but are critical runtime dependencies.

---

## 5. MAIN-BACKEND (Node.js/Express — 10 microservices)

| Field | Value |
|-------|-------|
| **Git source SHA** | `aa898b65` |
| **Deploy target SHA** | `aa898b65` |
| **Build artifact** | Docker image: `asia-south1-docker.pkg.dev/supermandi-backend/supermandi/main-backend:aa898b65` |
| **Build stamp source** | `--build-arg GIT_SHA` → Dockerfile ARG → `process.env.GIT_SHA` at runtime |
| **Version endpoint** | `GET /version` → `{ sha, service: "main-backend", built, minAppVersion }` ([backend/src/app.ts:131](backend/src/app.ts#L131)) |
| **Health endpoint** | `GET /api/v1/admin/health` (standardized health checker) |
| **Cloud Run service** | `main-backend` — 512Mi / 1 CPU, min=1 max=3, VPC connector, Cloud SQL socket |
| **Env source** | deploy.yml `--set-env-vars` (35+ vars) + `--set-secrets` (11 secrets from Secret Manager) |
| **DB pool** | min=2, max=20 per instance. Cloud SQL Unix socket. Statement timeout 30s. RLS support (`withStoreContext()`). |
| **Secrets mounted** | database-url, postgres-password, jwt-secret, SERVICE_TOKEN_SECRET, admin-token, smtp-password, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET, OPENAI_API_KEY |
| **Migrations** | 171 migrations (000-171 + seed). Migration 149 = RLS on 27 tables. Manual execution required (no auto-migrate on start). |
| **Scale posture** | **BLOCKED** at 10K stores (db-f1-micro, max 3 instances). **SUFFICIENT** for staging (<100 stores). |
| **Security posture** | **PROVEN** — JWT verification, store isolation (3 layers), RBAC, rate limiting (8 limiters), token revocation, input validation (Zod), CSRF protection |
| **Rollback impact** | MEDIUM — stateful service. Rollback safe if no breaking migration was run. If new migration applied → rollback requires compatible schema. |

### Post-Deploy Verification

```bash
curl -s https://staging.supermandi.tech/version | jq .sha
# Expected: "aa898b65"
curl -s https://staging.supermandi.tech/health | jq .
# Expected: { status: "ok", service: "api-gateway", ... }
```

---

## 6. API-GATEWAY (Node.js/Express — reverse proxy)

| Field | Value |
|-------|-------|
| **Git source SHA** | `aa898b65` |
| **Deploy target SHA** | `aa898b65` |
| **Build artifact** | Docker image: `asia-south1-docker.pkg.dev/supermandi-backend/supermandi/api-gateway:aa898b65` |
| **Build stamp source** | `--build-arg GIT_SHA` → `process.env.GIT_SHA` |
| **Version endpoint** | `GET /version` + `GET /api/v1/version` → `{ sha, service: "api-gateway", built }` |
| **Health endpoint** | `GET /health`, `GET /healthz`, `GET /api/health`, `GET /api/v1/health` |
| **Cloud Run service** | `api-gateway` — 512Mi / 1 CPU, min=0 max=3, VPC connector |
| **URL map routing** | `/api/*`, `/health`, `/version` → api-gateway-backend NEG |
| **Env source** | deploy.yml `--set-env-vars` (GIT_SHA, CORS_ALLOWED_ORIGINS, Redis) + `--set-secrets` (jwt-secret, admin-token) |
| **Rate limiting** | General: 30/min, Auth: 5/min, Admin: 60/min. Redis-backed with in-memory fallback. |
| **Body size limits** | Auth: 50KB, Sales: 200KB, Batch: 500KB, Images: 2MB, Voice: 5MB, Documents: 10MB |
| **Security** | Helmet (HSTS, X-Frame-Options, CSP), CORS (env-driven, no wildcard in prod), JWT auth, actor type enforcement, CSRF, correlation IDs, request timeout (30s) |
| **Scale posture** | **ASSUMED** — stateless proxy, scales horizontally. Rate limiter Redis-backed for distributed correctness. |
| **Security posture** | **PROVEN** — comprehensive middleware stack (Helmet, CORS, JWT, CSRF, rate limiting, body limits) |
| **Rollback impact** | LOW — stateless proxy. Rollback instant. Must stay compatible with main-backend API contract. |

---

## 7. LANDING (Static HTML + nginx)

| Field | Value |
|-------|-------|
| **Git source SHA** | `aa898b65` |
| **Deploy target SHA** | `aa898b65` |
| **Build artifact** | Docker image: `asia-south1-docker.pkg.dev/supermandi-backend/supermandi/landing:aa898b65` |
| **Build stamp source** | None — static HTML, no SHA injection. `GIT_SHA` env var set at deploy but unused by content. |
| **Version endpoint** | None (static site). Health check: `GET /health.txt` → "OK" (Dockerfile line 17). |
| **Cloud Run service** | `landing` — 256Mi / 1 CPU, min=0 max=3, nginx on port 80 |
| **URL map routing** | Default service (catches all unmatched paths: `/`, `/privacy`, `/terms`, `/pos`) |
| **Pages** | `index.html`, `privacy.html`, `terms.html`, `pos.html`, `robots.txt`, `sitemap.xml` |
| **Security headers** | Full set in [supermandi-landing/nginx.conf](supermandi-landing/nginx.conf): X-Frame-Options: DENY, HSTS 1yr, CSP, Referrer-Policy, X-Content-Type-Options |
| **Scale posture** | **PROVEN** — static files via nginx. Negligible resource usage. |
| **Security posture** | **PROVEN** — full security headers, no dynamic content, no auth |
| **Rollback impact** | NEGLIGIBLE — static content, rollback instant, no state |

### Post-Deploy Verification

```bash
curl -s -o /dev/null -w "%{http_code}" https://staging.supermandi.tech/
# Expected: 200
```

---

# URL MAPPING & ROUTE INTEGRITY AUDIT

## GCP Load Balancer URL Map ([scripts/staging-urlmap.yaml](scripts/staging-urlmap.yaml))

| Path Rule | Backend Service | Cloud Run Service | Code Base Path | Match |
|-----------|----------------|-------------------|---------------|-------|
| `/api/*` | api-gateway-backend | api-gateway | Gateway proxy routes | YES |
| `/health` | api-gateway-backend | api-gateway | `createHealthRouter()` | YES |
| `/version` | api-gateway-backend | api-gateway | `app.get("/version")` | YES |
| `/retailer`, `/retailer/*` | retailer-backend | retailer-admin | Vite `base: '/retailer/'` | YES |
| `/admin`, `/admin/*` | superadmin-backend | superadmin | Vite `base: '/admin/'` | YES |
| `/supplier`, `/supplier/*` | supplier-backend | supplier-portal | Next.js `basePath: '/supplier'` | YES |
| `*` (default) | landing-backend | landing | nginx root `/` | YES |

## Route Integrity Checks

| Check | Result |
|-------|--------|
| Retailer base `/retailer/` matches LB `/retailer/*` | MATCH |
| Supplier basePath `/supplier` + trailingSlash matches LB `/supplier/*` | MATCH |
| SuperAdmin base `/admin/` matches LB `/admin/*` | MATCH |
| API `/api/*` routes to api-gateway | MATCH |
| Landing default catches unmatched | CORRECT |
| Nginx portals: port 80 (`deploy.yml --port=80`) | CORRECT |
| Supplier: Cloud Run default port 8080 (Next.js) | CORRECT |
| CORS origins: `staging.supermandi.tech`, `www.staging.supermandi.tech` | CORRECT |
| Retailer SPA fallback: `try_files $uri $uri/ /index.html` | CORRECT |
| SuperAdmin SPA fallback: `try_files $uri $uri/ /index.html` | CORRECT |

**VERDICT**: Zero routing mismatches. All code base paths, LB path rules, and Cloud Run service names are consistent.

---

# SCALE & CAPACITY AUDIT

## Capacity Envelope Under Test

- 10,000 stores onboarded on POS
- 10,000 SKUs per store
- 50,000 scans/day/store
- Aggregate: 500M scans/day (10K stores x 50K scans)

## Per-Item Assessment

| # | Capacity Item | Verdict | Evidence |
|---|---------------|---------|----------|
| 1 | 10,000 stores | **UNPROVEN** | DB schema unlimited (UUID PK), RLS on 27 tables (proven). Cloud SQL db-f1-micro = 25 connections (**BLOCKED** for 10K concurrent). Pool max=20 x 3 instances = 60 connections total. |
| 2 | 10,000 SKUs/store | **BLOCKED** | Backend unlimited. POS pagination ceiling: MAX_PAGINATION_PAGE=100 x PRODUCTS_PAGE_SIZE=40 = **4,000 max visible items**. AI services LIMIT 1000 = silent truncation. |
| 3 | 50,000 scans/day/store | **ASSUMED** | POS scans are local (barcode → SQLite lookup → cart). No network per scan. Sales rate limit 60/min = 86,400 sales/day capacity. Outbox: 20 events/batch x 100 batches = 2,000 events/sync cycle. |
| 4 | 500M scans/day aggregate | **BLOCKED** | Cloud Run max=3 instances. db-f1-micro. Redis BASIC 1GB. Orders of magnitude undersized. |
| 5 | Queue/outbox growth | **ASSUMED** | Dead letter: 30-day TTL auto-cleanup (proven). Max sync attempts: 10 (proven). No hard cap on outbox rows. |
| 6 | SQLite/device storage | **ASSUMED** | Schema v4, 6 tables. 10K products ~2-5MB. Self-heal on startup. Small footprint. |
| 7 | Pagination/cache limits | **PROVEN** | MAX_PAGINATION_PAGE=100, PRODUCTS_PAGE_SIZE=40, stock cache 5min TTL, barcode cache 10K max, Redis cache 5min TTL. |
| 8 | Rate limits & tenancy | **PROVEN** code, **UNPROVEN** at scale | 8 rate limiters (Redis-backed). Noisy-neighbor risk at 10K stores: all share same instances. |
| 9 | Cloud SQL/Redis/API | **BLOCKED** | db-f1-micro (25 conn), BASIC 1GB Redis, max 3 Cloud Run instances. Must upgrade for production. |
| 10 | POS offline large catalog | **UNPROVEN** | Full product load to memory (assumed OK for 10K items ~5MB). Full catalog API fetch over slow mobile network may timeout. |

**Staging deploy (< 100 stores, < 1K SKUs): SUFFICIENT.**
**10K-store production: BLOCKED — requires infra upgrade + load testing.**

---

# CYBER/SECURITY READINESS AUDIT

## Summary Table

| # | Control | Verdict | Key Evidence |
|---|---------|---------|-------------|
| 1 | Auth/session model | **PROVEN** | JWT HS256 pinned, 15-min expiry. Refresh tokens SHA256-hashed in DB. Device tokens 90-day, revocable. Idle timeout. Session limit enforcement. HttpOnly cookie support. |
| 2 | RBAC / role gates | **PROVEN** | Actor type enforcement at gateway. `requirePermission()`, `requireAnyPermission()`. Admin tiered auth (4 methods). Cross-portal access blocked. Timing-safe comparison. |
| 3 | Tenant/store isolation | **PROVEN** | SEC-002: client storeId stripped, injected from JWT. DB RLS on 27 tables. Store ownership DB verification. Deactivated user blocking. |
| 4 | JWT/secret handling | **PROVEN** | JWT_SECRET from Secret Manager. Service-to-service auth (5-min tokens, allowlist). Demo tokens rejected in production. API keys hashed SHA256. |
| 5 | Firebase OTP | **PROVEN** | Identity Platform for phone auth. reCAPTCHA verification. Firebase project isolated (supermandi-pos). SMS disabled in staging. |
| 6 | Rate limiting | **PROVEN** | 8 limiters: general 30/min, auth 5/min, sales 60/min, enrollment 5/10min, email 2/min, SMS 2/min, WhatsApp 3/min, WebSocket 20/sec. Redis-backed with in-memory fallback. IP blocking after 10 failures. |
| 7 | Token revocation | **PROVEN** | Redis blacklist (T-184) with TTL. DB refresh token revocation. Device token revocation. Blacklist fails closed on Redis outage. Logout revokes all sessions. |
| 8 | CORS | **PROVEN** | Environment-driven (ZR-URL-001). Wildcard + credentials blocked in production. Preflight 1hr cache. Client-facing headers only. |
| 9 | Secret injection | **PROVEN** | 11 secrets via Secret Manager `--set-secrets`. Zero secrets in Docker images or code. Separated from env vars. |
| 10 | Third-party exposure | **PROVEN** (Dependabot: **UNPROVEN**) | All API keys in Secret Manager. Firebase uses client SDK (no SA key mounted). 42 Dependabot vulnerabilities reported (1 critical, 37 high) — not yet triaged. |
| 11 | Console/log leakage | **PROVEN** | Retailer/SuperAdmin: esbuild drop all. Supplier: removeConsole (keep error/warn). POS: `__DEV__` guards. Backend: structured logger. |
| 12 | Dangerous defaults | **PROVEN** | FIX-004 build guard on API_BASE_URL. CORS localhost only in non-production. TEST_STORE_CONFIG null in prod. Staging rate limit multiplier = 5x (acceptable). |
| 13 | Project confusion | **PROVEN** | GCP_PROJECT=supermandi-backend fixed in deploy.yml + 5 scripts (aa898b65). Duplicate resources cleaned. Firebase in supermandi-pos (correct). |
| 14 | Migration safety | **PROVEN** | 171 migrations, no auto-migrate. Manual execution. Statement timeout 30s. Backup mandatory before migration 149 (RLS). |
| 15 | Security headers | **PARTIALLY PROVEN** | Landing: full headers (nginx). Supplier: full headers (next.config.js). API gateway: full headers (Helmet). **Retailer-admin + SuperAdmin nginx: MISSING** (X-Frame-Options, HSTS, CSP). |

**Staging deploy: SUFFICIENT — no blocking security issues.**
**Production hardening needed: (1) Dependabot triage, (2) nginx security headers on retailer-admin + superadmin.**

---

# FINAL PRE-DEPLOY VERDICT

## 1. Deploy Notebook Path
`RELEASES/STAGING_DEPLOY_TRACK_NOTEBOOK_aa898b65.md` (this file)

## 2. Primary 4-Surface Build Table

| Surface | Git SHA | Deploy SHA | Artifact | Build Stamp | Version Visibility | Deployment Target | Scale | Security |
|---------|---------|-----------|----------|-------------|-------------------|-------------------|-------|----------|
| **POS App** | aa898b65 | aa898b65 | EAS → Play/App Store | app.config.js `BUILD_GIT_SHA` | BUILD_INFO.gitSha (in-app) | Play Store / manual EAS | ASSUMED (<1K) | PROVEN |
| **Retailer Web** | aa898b65 | aa898b65 | Docker nginx SPA | VITE_GIT_SHA build-arg | /retailer/_version.json | CR: retailer-admin | PROVEN (<1K) | PARTIAL (nginx headers) |
| **Supplier Web** | aa898b65 | aa898b65 | Docker Next.js SSR | NEXT_PUBLIC_GIT_SHA build-arg | /supplier/api/version | CR: supplier-portal | PROVEN (<1K) | PROVEN |
| **SuperAdmin Web** | aa898b65 | aa898b65 | Docker nginx SPA | VITE_GIT_SHA build-arg | /admin/_version.json | CR: superadmin | PROVEN | PARTIAL (nginx headers) |

## 3. Secondary Infra/Runtime Table

| Surface | Git SHA | Deploy SHA | Artifact | Version Endpoint | Cloud Run Service | Scale | Security |
|---------|---------|-----------|----------|-----------------|-------------------|-------|----------|
| main-backend | aa898b65 | aa898b65 | Docker Node.js | GET /version | main-backend | BLOCKED (10K) | PROVEN |
| api-gateway | aa898b65 | aa898b65 | Docker Node.js | GET /version | api-gateway | ASSUMED | PROVEN |
| landing | aa898b65 | aa898b65 | Docker nginx | None (static) | landing | PROVEN | PROVEN |

## 4. Blockers

| # | Blocker | Blocking? |
|---|---------|-----------|
| 1 | GCP infrastructure exists (Cloud SQL, Redis, AR, VPC, URL map, SSL) | YES — operator confirms |
| 2 | GitHub secrets set (GCP_WIF_PROVIDER, GCP_SA_EMAIL) | YES — operator confirms |
| 3 | Secret Manager values populated (11 secrets) | YES — operator confirms |
| 4 | Cloud SQL database + migrations runnable | YES — first deploy manual migration |

## 5. Authorization

**Staging deploy of SHA `aa898b65` is AUTHORIZED** provided operator confirms items 1-4.

Deploy command: `workflow_dispatch` with SHA = `aa898b65`.

## POST-DEPLOY VERIFICATION SCRIPT

```bash
# 1. Health
curl -s https://staging.supermandi.tech/health | jq .

# 2. Version parity — all must return "aa898b65"
echo "--- Backend/Gateway ---"
curl -s https://staging.supermandi.tech/version | jq .sha

echo "--- Retailer Web ---"
curl -s https://staging.supermandi.tech/retailer/_version.json | jq .commit

echo "--- Supplier Web ---"
curl -s https://staging.supermandi.tech/supplier/api/version | jq .commit

echo "--- SuperAdmin Web ---"
curl -s https://staging.supermandi.tech/admin/_version.json | jq .commit

# 3. HTTP 200 checks — all 4 portals + landing
for path in "/" "/retailer/" "/supplier/" "/admin/"; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://staging.supermandi.tech${path}")
  echo "$path → $CODE"
done

# 4. POS App — manual verification
# Build with EXPO_PUBLIC_API_URL=https://staging.supermandi.tech
# Verify: Splash → version badge → EnrollDevice → SellScan → offline sync
```

Expected: all SHAs = `aa898b65`, all HTTP codes = `200`.

---

## DEPLOY EXECUTION LOG

### Deploy Run 1 (FAILED — short SHA)
- **Run ID**: `22551950938`
- **Triggered**: `2026-03-01T20:28:35Z`
- **Input**: `sha=aa898b65` (8-char short SHA)
- **Result**: FAILED at Checkout — `actions/checkout@v4` with `fetch-depth: 1` cannot resolve short commit SHAs
- **Root cause**: Shallow clone tries to match ref as branch/tag name, not commit SHA

### Deploy Run 2 (SUCCESS — full SHA)
- **Run ID**: `22552048262`
- **Triggered**: `2026-03-01T20:33:54Z`
- **Input**: `sha=aa898b65459694f97564295a649f6bff7cbaf352` (full 40-char)
- **Result**: SUCCESS — all 7 jobs passed
- **Duration**: ~14 minutes (gate → build → pre-deploy → deploy → verify → smoke)

### Gate 3 Results
| Check | Result |
|-------|--------|
| Serving revisions captured (6/6) | PASS |
| SHA parity (GIT_SHA=aa898b6, 6/6 services) | PASS |
| main-backend Ready (all 6 conditions True) | PASS |
| Migrations 168..171 (4/4 applied) | PASS |
| Smoke Gates 1-13 (13/13) | PASS |
| Routing infra (L-023..030) | 8 PASS, 0 FAIL |
| Routing smoke (L-031..047) | PASS |
| Artifact integrity (C-033/034) | 2 PASS, 0 FAIL |
| **Gate 3 Verdict** | **PASSED** |

### Post-deploy live verification: UNLOCKED
- Next findings start at STG-410+

### Gate 3 Migration Verification — VINDICATED (2026-03-02T13:30Z)
- Cloud Run startup logs confirm: "4 pending migration(s) to apply" (168-171)
- Migrations 001-167 were already applied from first deploy (e63dba14)
- STG-429 initially diagnosed as "migration 166 not run" — CORRECTED to "SET LOCAL $1 syntax error (PG 42601)"
- Gate 3 "Migrations 168..171 (4/4 applied)" is CONFIRMED CORRECT

---

## CI FOLLOW-UP (non-blocking)

### CI-HARDEN-001: deploy.yml short-SHA workflow_dispatch support
- **Severity**: Low (workaround: use full 40-char SHA)
- **Issue**: `actions/checkout@v4` with `fetch-depth: 1` cannot resolve short commit SHAs passed via `workflow_dispatch` input
- **Fix**: Change gate job checkout to `fetch-depth: 0` or add a step to resolve short SHA to full SHA before checkout
- **Status**: Deferred — log as backlog item after staging verification complete

---

## REDEPLOY HISTORY (post aa898b65)

### Redeploy 1: Consolidated Fix Wave 2 (STG-431,433,434,435)
- **Deployed SHA**: `f080d982` (on `main`)
- **Deploy method**: `gh workflow run deploy.yml --ref main` (no SHA param — uses HEAD of main)
- **Deploy run 1**: `22582450100` — commit `91929249` (fix wave) — SUCCESS, all 7 jobs
- **Deploy run 2**: `22583773065` — commit `f080d982` (hotfix: RETAILER_ADMIN_URL env var) — SUCCESS, all 7 jobs
- **Hotfix reason**: First deploy used wrong env var `RETAILER_PORTAL_URL` (unset). Corrected to `RETAILER_ADMIN_URL` which is set by deploy.yml.
- **Runtime verification**: All 4 findings confirmed FIXED on staging
  - STG-431: Chat UUID validation — non-UUID rejected
  - STG-433: Password reset email confirmed `/retailer/reset-password` URL (operator inbox evidence)
  - STG-434: Supplier reset error hints Retailer portal
  - STG-435: Chat conversations list 200, support creation 200

### Current Staging State
- **Deployed SHA**: `f080d982`
- **All services running at this SHA**: api-gateway, main-backend, retailer-admin, supplier-portal, superadmin, landing
- **Engineering findings (STG-410..435)**: 0 open — 23 FIXED, 2 WONTFIX, 1 WITHDRAWN

### Final Operator-Assisted Live Sign-Off Progress
- **POS App**: FULLY REITERATED UNDER STRICT LOCK (44/44 screens individually audited, 20 findings STG-436..455: 8 P2, 12 P3, 28 clean, 16 with findings)
- **Retailer Web**: SIGNED OFF UNDER STRICT LOCK (28/28 production screens individually audited, 5 findings STG-456..460: 0 P2, 5 P3, 24 clean, 4 with findings. AllPagesPage excluded — dev-only via `import.meta.env.DEV` gate)
- **Supplier Web**: SIGNED OFF UNDER STRICT LOCK (23/23 screens individually audited, 2 findings STG-461..462: 0 P2, 2 P3, 21 clean, 2 with findings)
- **SuperAdmin Web**: SIGNED OFF UNDER STRICT LOCK (25/25 screens individually audited, 2 findings STG-463..464: 0 P2, 2 P3, 23 clean, 2 with findings)
- **Cross-Function Matrix**: SIGNED OFF UNDER STRICT LOCK (7/7 flows individually traced, 0 findings, all flows CLEAN)
- **LIVE SIGNOFF COMPLETE**: 120 screens + 7 flows, 29 findings (8 P2, 21 P3). STG-436..464.
- **Production promotion**: BLOCKED — 29 sign-off findings require consolidated fix wave → staging redeploy → impacted recheck → verdict
