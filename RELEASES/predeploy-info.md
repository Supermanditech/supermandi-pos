# SuperMandi POS — Pre-Deploy Information

**Generated**: 2026-03-20
**Deployed SHA**: `81c3a2a4` (staging, 2026-03-13)
**HEAD SHA**: `86b0ae13` (main, 2026-03-20)
**Staging URL**: https://staging.supermandi.tech

---

## 1. Version Matrix

| Component | Version | Framework | Node.js | TypeScript | Port |
|---|---|---|---|---|---|
| POS App | 1.0.1 | Expo 52.0.49 / RN 0.76.9 | 18+ | ^5.3.3 | 8081 (dev) |
| Retailer Admin | 1.0.0 | Vite 5.0.12 / React 18.2 | 20 | ^5.3.3 | 8080 (nginx) |
| Supplier Portal | 0.1.0 | Next.js 16.1.5 / React 18.3 | 20 | ^5.7.2 | 8080 (next) |
| SuperAdmin | 0.0.0 | Vite 7.2.4 / React 19.2 | 20 | ~5.9.3 | 8080 (nginx) |
| Landing Page | N/A | Static HTML | N/A | N/A | 8080 (nginx) |
| API Gateway | 1.0.0 | Express 4.18 | 20 | ^5.3.0 | 3000 |
| Main Backend | 1.0.0 | Express 4.18 | 20 | ^5.3.0 | 3010 |
| PostgreSQL | 16-alpine | Cloud SQL | N/A | N/A | 5432 |
| Redis | 7-alpine | Memorystore | N/A | N/A | 6379 |
| pnpm | 8.11.0 | Package manager | N/A | N/A | N/A |

---

## 2. Build Commands

### POS App (Android APK)
```bash
# Pre-check readiness
npm run apk:check

# Build via local Gradle (NOT EAS — takes 2 hours on free tier)
cmd.exe //c "cd /d c:\supermandi-pos\android && gradlew.bat assembleRelease"

# Or via build script
node scripts/build-release.js
```
**Output**: `android/app/build/outputs/apk/release/app-release.apk`

### Retailer Admin
```bash
cd retailer-admin
VITE_API_BASE_URL="" VITE_GIT_SHA=$(git rev-parse --short HEAD) pnpm build
# Output: retailer-admin/dist/
```

### Supplier Portal
```bash
cd supplier-portal
NEXT_PUBLIC_API_BASE_URL="" NEXT_PUBLIC_GIT_SHA=$(git rev-parse --short HEAD) pnpm build
# Output: supplier-portal/.next/
```

### SuperAdmin
```bash
cd supermandi-superadmin
VITE_API_BASE_URL="" VITE_GIT_SHA=$(git rev-parse --short HEAD) pnpm build
# Output: supermandi-superadmin/dist/
```

### Backend (All Services)
```bash
cd backend
pnpm -r run build
# Compiles TypeScript for all 10 services + common package
```

### Docker Images (CI/CD)
```bash
# All images built via .github/workflows/deploy.yml
# Tag: IMAGE_SHA from git commit
docker build -t supermandi/api-gateway:${SHA} -f backend/services/api-gateway/Dockerfile backend/
docker build -t supermandi/main-backend:${SHA} -f backend/Dockerfile.main backend/
docker build -t supermandi/retailer-admin:${SHA} -f retailer-admin/Dockerfile retailer-admin/
docker build -t supermandi/supplier-portal:${SHA} -f supplier-portal/Dockerfile supplier-portal/
docker build -t supermandi/superadmin:${SHA} -f supermandi-superadmin/Dockerfile supermandi-superadmin/
docker build -t supermandi/landing:${SHA} -f supermandi-landing/Dockerfile supermandi-landing/
```

---

## 3. Cloud Run Services (6 services)

| Service | Image | Port | Region | Min/Max Instances |
|---|---|---|---|---|
| api-gateway | `asia-south1-docker.pkg.dev/supermandi-backend/supermandi/api-gateway` | 3000 | asia-south1 | 0/2 |
| main-backend | `asia-south1-docker.pkg.dev/supermandi-backend/supermandi/main-backend` | 3010 | asia-south1 | 0/2 |
| retailer-admin | `asia-south1-docker.pkg.dev/supermandi-backend/supermandi/retailer-admin` | 8080 | asia-south1 | 0/2 |
| supplier-portal | `asia-south1-docker.pkg.dev/supermandi-backend/supermandi/supplier-portal` | 8080 | asia-south1 | 0/2 |
| superadmin | `asia-south1-docker.pkg.dev/supermandi-backend/supermandi/superadmin` | 8080 | asia-south1 | 0/2 |
| landing | `asia-south1-docker.pkg.dev/supermandi-backend/supermandi/landing` | 8080 | asia-south1 | 0/2 |

---

## 4. API Endpoints (Gateway Routing)

All API calls go through `https://staging.supermandi.tech/api/v1/*` → API Gateway → Main Backend.

### Key Route Prefixes (28 total)
| Prefix | Target | Auth |
|---|---|---|
| `/api/v1/pos/*` | main-backend | Device token |
| `/api/v1/auth/*` | main-backend | Public (rate limited) |
| `/api/v1/admin/*` | main-backend | Admin session token |
| `/api/v1/retailer-admin/*` | main-backend | JWT (retailer) |
| `/api/v1/supplier/*` | main-backend | JWT (supplier) |
| `/api/v1/orders/*` | main-backend | JWT |
| `/api/v1/inventory/*` | main-backend | JWT |
| `/api/v1/catalog/*` | main-backend | JWT |
| `/api/v1/webhooks/*` | main-backend | Signature verification |
| `/api/v1/documents/*` | main-backend | JWT |
| `/api/v1/voice/*` | main-backend | Device token |

### Portal Base Paths
| Portal | Path | Nginx SPA Fallback |
|---|---|---|
| Landing | `/` | No (static, 404 on unknown) |
| Retailer Admin | `/retailer/` | Yes (`try_files → index.html`) |
| Supplier Portal | `/supplier/` | Next.js server routing |
| SuperAdmin | `/admin/` | Yes (`try_files → index.html`) |

---

## 5. Environment Variables

### API Gateway (Cloud Run)
```
NODE_ENV=production
PORT=3000
ADMIN_SERVICE_URL=<main-backend-cloud-run-url>
ADMIN_TOKEN=<from-secret-manager>
JWT_SECRET=<from-secret-manager>
JWT_ISSUER=supermandi-auth
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=30
AUTH_RATE_LIMIT_MAX=15
ADMIN_LOGIN_RATE_LIMIT_MAX=5
ADMIN_PANEL_RATE_LIMIT_MAX=60
CORS_ALLOWED_ORIGINS=https://staging.supermandi.tech
```

### Main Backend (Cloud Run)
```
NODE_ENV=production
PORT=3010
DATABASE_URL=postgresql://<user>:<pass>@<cloud-sql-proxy>:5432/supermandi
REDIS_URL=redis://:<pass>@<memorystore-ip>:6379
JWT_SECRET=<from-secret-manager>
JWT_ISSUER=supermandi
ADMIN_TOKEN=<from-secret-manager>
FIREBASE_ENABLED=true
FIREBASE_PROJECT_ID=supermandi-backend
FIREBASE_SERVICE_ACCOUNT_PATH=/etc/supermandi/firebase-service-account.json
EMAIL_PROVIDER=resend
EMAIL_FROM=SuperMandi <noreply@supermandi.com>
RESEND_API_KEY=<from-secret-manager>
GCS_DOCUMENTS_BUCKET=supermandi-pos-documents
GCS_IMAGES_BUCKET=supermandi-pos-images
ADMIN_EMAIL_ALLOWLIST=<comma-separated-emails>
OPENAI_API_KEY=<from-secret-manager>
OPENAI_MODEL_CHAT=gpt-4o-mini
```

### Frontend Build-Time (Vite portals)
```
VITE_API_BASE_URL=""
VITE_GIT_SHA=<commit-sha>
VITE_BUILD_TIME=<iso-timestamp>
```

### Frontend Build-Time (Next.js supplier portal)
```
NEXT_PUBLIC_API_BASE_URL=""
NEXT_PUBLIC_GIT_SHA=<commit-sha>
NEXT_PUBLIC_BUILD_TIME=<iso-timestamp>
NEXT_PUBLIC_FIREBASE_API_KEY=<from-.env.production>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<from-.env.production>
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<from-.env.production>
```

---

## 6. Firebase Setup

### Backend (Admin SDK)
- **Package**: `firebase-admin` (initialized at startup)
- **Credentials**: Application Default Credentials (ADC) on Cloud Run, or explicit service account path
- **Config**: `FIREBASE_ENABLED=true`, `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_PATH`
- **Usage**: Phone OTP verification for retailer/supplier auth
- **Fallback**: If disabled, phone OTP flows return error; password auth still works
- **Timeout**: 10-second verification timeout with Promise.race

### Frontend (Client SDK)
- **Package**: `firebase` (initialized in each portal's `lib/firebase.ts`)
- **Config**: Env vars (`VITE_FIREBASE_*` or `NEXT_PUBLIC_FIREBASE_*`)
- **Usage**: reCAPTCHA verification + phone OTP send
- **Fallback**: `isFirebaseReady()` check — if false, password-only auth
- **Auto-recovery**: reCAPTCHA expiry recovery (POST-BATCH-018-FIX-004/005)

### POS App
- **Not used for auth** — POS uses device enrollment + JWT + staff PIN
- **Firebase scaffolding exists** but is intentionally disabled (DRX-001)

---

## 7. External Dependencies

| Service | SDK/Protocol | Env Vars | Graceful Degradation | Retry |
|---|---|---|---|---|
| **Razorpay** | razorpay@2.9.4 | `RAZORPAY_KEY_ID`, `KEY_SECRET`, `ACCOUNT_NUMBER`, `WEBHOOK_SECRET` | Core POS works without; UPI falls back to manual UTR | 3 retries with backoff (1m/5m/30m) |
| **Firebase** | firebase-admin | `FIREBASE_ENABLED`, `PROJECT_ID`, `SERVICE_ACCOUNT_PATH` | Password auth fallback; 10s timeout | Error code mapping |
| **GCS** | @google-cloud/storage | `GCS_DOCUMENTS_BUCKET`, `GCS_IMAGES_BUCKET` | Image uploads return null; documents require GCS | Size limits enforced |
| **WhatsApp** | Meta Graph API v22.0 | `WHATSAPP_ACCESS_TOKEN`, `PHONE_NUMBER_ID`, `VERIFY_TOKEN`, `APP_SECRET` | Returns `{ sent: false }` if unconfigured | 2 retries with backoff |
| **OpenAI** | openai SDK | `OPENAI_API_KEY`, `MODEL_CHAT`, `MODEL_STT` | Voice features disabled if unconfigured | 30s timeout |
| **Resend** | resend SDK | `RESEND_API_KEY` | Email sends fail gracefully | None (fire-and-forget) |

---

## 8. Database

### Cloud SQL Instance
- **Project**: supermandi-backend
- **Instance**: supermandi-staging
- **Region**: asia-south1
- **Database**: supermandi
- **User**: postgres (password in Secret Manager)
- **Migrations**: 202 total (187 applied on staging + 195-202 pending)
- **Proxy**: `cloud-sql-proxy.exe --gcloud-auth supermandi-backend:asia-south1:supermandi-staging --port=15432`

### Migration Commands
```bash
# Preview pending migrations
node backend/scripts/migrate-prod.js dry-run

# Apply migrations
node backend/scripts/migrate-prod.js

# Verify from zero
node backend/scripts/migrate-from-zero.js
```

---

## 9. Deployment Checklist

### Pre-Deploy
- [ ] All 14 pre-commit gates pass (`node scripts/fix-guard.js check`)
- [ ] TypeScript clean across all 5 platforms (`pnpm -r typecheck`)
- [ ] Backend tests pass (575+ tests, 28 suites)
- [ ] Fix ledger zero drift (126 fixes intact)
- [ ] Docker images build successfully for all 6 services
- [ ] CI/CD pipeline green on HEAD

### Deploy Steps
1. Push to main → CI builds Docker images tagged with SHA
2. CI deploys to Cloud Run (6 services)
3. Run `migrate-prod.js dry-run` to preview pending migrations
4. Apply migrations (backup Cloud SQL first)
5. Verify health endpoints: `curl https://staging.supermandi.tech/api/v1/pos/health`
6. Verify all 4 portals load in browser
7. Run operator E2E verification script
8. Tag as `MEGA-RC-v2-YYYY-MM-DD`

### Post-Deploy Verification
- [ ] API Gateway health: `GET /health` → 200
- [ ] Main Backend health: `GET /health` → 200
- [ ] Retailer Admin: `GET /retailer/` → 200 (HTML)
- [ ] Supplier Portal: `GET /supplier/` → 200 (HTML)
- [ ] SuperAdmin: `GET /admin/` → 200 (HTML)
- [ ] Landing: `GET /` → 200 (HTML)
- [ ] POS API: `POST /api/v1/auth/pos/send-otp` → 422 (missing phone = validation working)
- [ ] Store isolation: No cross-store data leakage
- [ ] WhatsApp status: `GET /api/v1/pos/whatsapp/status` → `{ configured: true/false }`

---

## 10. Security Configuration

| Control | Status | Evidence |
|---|---|---|
| JWT signing | HS256 with secret from Secret Manager | auth-service config |
| Store isolation | server-side from JWT/device token | enforceStoreIsolation middleware |
| CORS | Staging-only origins (no wildcards) | api-gateway config |
| Rate limiting | 30/min general, 15/min auth, 5/min admin login | api-gateway config |
| Webhook signatures | HMAC-SHA256 + timing-safe compare | webhooks.ts, refundWebhook.ts |
| PIN hashing | bcrypt with 10 rounds | staff.ts |
| Session timeout | 30-min idle (superadmin), JWT expiry (portals) | authToken.ts |
| Error sanitization | Blocks SQL, stack traces, JWT secrets | errorSanitizer.ts |
| File upload limits | 10MB documents, 5MB images, 5MB CSV | multer + fileLimits.ts |
| CSRF protection | X-Requested-With header | api.ts clients |

---

## 11. Monitoring & Observability

| Endpoint | Purpose |
|---|---|
| `GET /health` | API Gateway + Backend health |
| `GET /api/v1/admin/health` | Admin health dashboard |
| `GET /api/v1/admin/ai/health` | AI service health |
| `GET /api/v1/pos/whatsapp/status` | WhatsApp integration status |
| `GET /supplier/api/version` | Supplier portal version |
| BuildStamp components | Each portal shows commit SHA + build time in footer |
