# LOCAL-PROD-001: Streamline Local Production-Grade Environment

> **Priority**: P0 (Blocker - Google VM shut down)
> **Type**: Infrastructure / DevOps
> **Status**: OPEN
> **Created**: 2026-02-05
> **Assignee**: Claude + Operator
> **Risk Class**: F (Infra/Docker) - Evidence: Build logs + curl proofs

---

## Context

The Google VM (`34.14.220.171`) that hosted the production environment has been **shut down**. The goal is to:

1. Run a **local production-grade stack** on the developer's Windows machine
2. Ensure all 4 portals (POS App, Retailer Web, Supplier Web, Admin Web) work end-to-end against local services
3. Create a **one-click deploy to GCP Cloud Run** path from the local environment

**Current state**: `start-local-stack.bat` starts Docker (Postgres/Redis) + backend + 3 web portals, but has port conflicts, stale Google VM URLs, and no POS app integration.

---

## Scope

| Layer | Component | Current Issue |
|-------|-----------|---------------|
| **Ports** | 3 port conflicts across services | auth:3001 vs supplier-portal, order:3006 vs reorder dev, platform:3008 vs voice |
| **Backend** | 10 microservices + main backend | Port map inconsistent between .env and service configs |
| **API URLs** | Frontends point to Google VM/prod domain | `.env` has `34.14.220.171:3000`, retailer has `api.supermandi.tech` |
| **POS App** | Expo mobile app | Points to `http://34.14.220.171:3000` (dead VM) |
| **Database** | Postgres + Redis | Works locally via Docker (no change needed) |
| **Nginx/Proxy** | Production uses nginx reverse proxy | Local dev has no unified reverse proxy |
| **Firebase** | Phone OTP auth | Already configured, no change needed |
| **Deploy** | No one-click GCP path | Need docker-compose.local-prod.yml + deploy script |

---

## Work Breakdown

### PHASE 1: Port Conflict Resolution

**Ticket**: LOCAL-PROD-001-A

#### Current Port Map (BROKEN)

| Port | Service 1 | Service 2 (CONFLICT) |
|------|-----------|----------------------|
| 3001 | auth-service | supplier-portal (Next.js `next dev -p 3001`) |
| 3006 | order-service (prod) / reorder-service (dev) | Overlapping in dev |
| 3008 | platform-service | voice-service |

#### Proposed Port Map (FIXED)

| Port | Service | Layer | Notes |
|------|---------|-------|-------|
| **3000** | API Gateway | Backend | Entry point for all API calls |
| **3001** | Auth Service | Backend | No change |
| **3002** | Platform Service | Backend | No change |
| **3003** | Supplier Service | Backend | No change |
| **3004** | Catalog Service | Backend | No change |
| **3005** | Inventory Service | Backend | No change |
| **3006** | Order Service | Backend | No change |
| **3007** | Reorder Service | Backend | No change |
| **3008** | Voice Service | Backend | No change |
| **3009** | Notification Service | Backend | Reserved (future) |
| **3010** | Main Backend (Monolith) | Backend | No change |
| **3011** | Payment Service | Backend | Scaffolded (future) |
| **4001** | Supplier Portal (Next.js) | Frontend | **CHANGED from 3001 to 4001** |
| **5173** | Retailer Admin (Vite) | Frontend | No change (Vite default) |
| **5174** | SuperAdmin Portal (Vite) | Frontend | No change (Vite default) |
| **5432** | PostgreSQL | Database | Docker |
| **6379** | Redis | Cache | Docker |
| **8081** | Expo Dev Server (POS) | Mobile | Metro bundler |
| **19000** | Expo Go (POS) | Mobile | Expo default |

#### Files to Change

1. **`supplier-portal/package.json`** - Change `next dev -p 3001` to `next dev -p 4001` and `next start -p 4001`
2. **`backend/.env`** - Update `CORS_ORIGIN` to include `http://localhost:4001`
3. **`scripts/start-local-stack.bat`** - Update supplier portal URL in echo output
4. **`backend/services/voice-service/src/config.ts`** - Verify port 3008 (currently correct)
5. **`backend/services/platform-service/src/config.ts`** - Verify port 3008 in dev (check if it reads `PLATFORM_SERVICE_PORT`)

> **Note**: In production docker-compose, services communicate via container names (e.g., `http://auth-service:3001`) so port conflicts only affect local dev.

---

### PHASE 2: Unified Local Environment Configuration

**Ticket**: LOCAL-PROD-001-B

#### 2.1 Root `.env.local` (POS App)

**File**: `c:\supermandi-pos\.env.local`

```env
# LOCAL DEVELOPMENT - POS Mobile App
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_POS_API_URL=http://localhost:3000
```

> **Important**: For physical device testing (Redmi), replace `localhost` with the PC's LAN IP (e.g., `http://192.168.31.66:3000`).

#### 2.2 Retailer Admin `.env.local`

**File**: `c:\supermandi-pos\retailer-admin\.env.local`

```env
# LOCAL DEVELOPMENT - Retailer Admin Portal
VITE_API_BASE_URL=
# Empty = uses Vite dev proxy to localhost:3000
```

Already correct. Vite config proxies `/api` to `http://localhost:3000`.

#### 2.3 Supplier Portal `.env.local`

**File**: `c:\supermandi-pos\supplier-portal\.env.local`

```env
# LOCAL DEVELOPMENT - Supplier Portal
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
```

> Must be explicit since supplier-portal on port 4001 can't use same-origin proxy to backend on 3000.

#### 2.4 SuperAdmin Portal `.env.local`

**File**: `c:\supermandi-pos\supermandi-superadmin\.env.local`

```env
# LOCAL DEVELOPMENT - SuperAdmin Portal
VITE_API_BASE_URL=http://localhost:3000
```

#### 2.5 Backend `.env` Updates

**File**: `c:\supermandi-pos\backend\.env`

```env
# Add to CORS_ORIGIN (all local frontend origins)
CORS_ORIGIN=http://localhost:3000,http://localhost:4001,http://localhost:5173,http://localhost:5174,http://localhost:8081,http://localhost:19000
```

#### 2.6 POS App `app.json` - Remove Hardcoded URLs

**File**: `c:\supermandi-pos\app.json`

The `extra.API_URL` and `extra.POS_API_URL` should fall back to env vars, not hardcode `https://supermandi.tech`. Verify `app.config.js` uses `process.env.EXPO_PUBLIC_API_URL` with fallback.

---

### PHASE 3: Database & Seed Data

**Ticket**: LOCAL-PROD-001-C

#### 3.1 Verify Docker Containers

```powershell
cd C:\supermandi-pos\backend
docker compose up -d
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

Expected:
- `supermandi-postgres` on 5432 (healthy)
- `supermandi-redis` on 6379 (healthy)

#### 3.2 Run Database Migrations

```powershell
cd C:\supermandi-pos\backend
pnpm run migrate
# or
npx knex migrate:latest --knexfile=src/db/knexfile.ts
```

#### 3.3 Seed Data for Local Testing

Create/verify seed data exists for:

| Entity | Minimum Seed Data |
|--------|-------------------|
| **Admin User** | 1 super-admin account (email OTP) |
| **Retailer Store** | 1 store with enrollment code |
| **Supplier** | 1 supplier with product catalog |
| **Products** | 10-20 products across categories (rice, dal, oil, etc.) |
| **Inventory** | Stock levels for seeded products |
| **POS Device** | 1 enrolled device (for POS app testing) |

#### 3.4 Firebase Local Configuration

Firebase Phone OTP works with the **same project** (`supermandi-pos`) regardless of backend location. No changes needed, but ensure:

- `FIREBASE_ENABLED=true` in `backend/.env`
- `FIREBASE_PROJECT_ID=supermandi-pos` in `backend/.env`
- Firebase service account JSON accessible (or using ADC)

---

### PHASE 4: End-to-End UI-to-API Connectivity

**Ticket**: LOCAL-PROD-001-D

#### 4.1 API Gateway Routes Verification

The API Gateway (port 3000) routes to main-backend (port 3010) for most endpoints. Verify all routes work:

| Frontend Portal | API Prefix | Routes To | Test Endpoint |
|-----------------|------------|-----------|---------------|
| POS App | `/api/v1/pos/*` | main-backend:3010 | `GET /api/v1/pos/health` |
| Retailer Admin | `/api/v1/retailer-admin/*` | main-backend:3010 | `GET /api/v1/retailer-admin/store` |
| Supplier Portal | `/api/v1/supplier/*` | main-backend:3010 | `GET /api/v1/supplier/profile` |
| SuperAdmin | `/api/v1/admin/*` | main-backend:3010 | `GET /api/v1/admin/health` |
| Voice | `/api/v1/voice/*` | voice-service:3008 | `POST /api/v1/voice/interpret` |
| Payments | `/api/v1/payments/*` | payment-service:3011 | Future |

#### 4.2 Frontend Smoke Tests

For each portal, verify:

| Portal | URL | Login Method | Test Action |
|--------|-----|--------------|-------------|
| **Retailer Web** | `http://localhost:5173/retailer/` | Phone OTP (Firebase) | View dashboard, see products |
| **Supplier Web** | `http://localhost:4001/supplier/` | Phone OTP (Firebase) | View orders, manage products |
| **Admin Web** | `http://localhost:5174/admin/` | Email OTP (JWT) | View stores, users, analytics |
| **POS App** | Expo Go on device | Enrollment Code | Scan barcode, add to cart, checkout |

#### 4.3 CORS Checklist

After updating `CORS_ORIGIN`, verify no CORS errors in browser console for:

- [ ] Retailer Admin (localhost:5173) -> API Gateway (localhost:3000)
- [ ] Supplier Portal (localhost:4001) -> API Gateway (localhost:3000)
- [ ] SuperAdmin (localhost:5174) -> API Gateway (localhost:3000)
- [ ] POS App (Expo) -> API Gateway (localhost:3000 via LAN IP)

---

### PHASE 5: POS App Local Connectivity

**Ticket**: LOCAL-PROD-001-E

#### 5.1 Configure POS App for Local Backend

The POS app runs on a physical device (Redmi) via Expo Go. It cannot reach `localhost`, so it needs the PC's LAN IP.

**Steps**:
1. Find PC LAN IP: `ipconfig` → look for `192.168.x.x`
2. Create/update `.env.local`:
   ```env
   EXPO_PUBLIC_API_URL=http://192.168.31.66:3000
   EXPO_PUBLIC_POS_API_URL=http://192.168.31.66:3000
   ```
3. Ensure Windows Firewall allows inbound on port 3000
4. Verify `app.config.js` reads `EXPO_PUBLIC_API_URL` env var

#### 5.2 Test POS Flows

| Flow | Steps | Expected Result |
|------|-------|-----------------|
| Device Enrollment | Enter store code on POS app | Device registered in admin panel |
| Product Search | Search "rice" | Products from local catalog appear |
| Add to Cart | Tap product, set quantity | Cart updated with correct price |
| Checkout | Complete sale | Order created in database |
| Voice Command | Record "2 kilo rice chahiye" | Transcribed + intent parsed |

---

### PHASE 6: One-Click Local Start (Improved)

**Ticket**: LOCAL-PROD-001-F

#### 6.1 Updated `start-local-stack.bat`

Replace current script with improved version that:

1. Checks Docker Desktop is running
2. Starts Postgres + Redis containers
3. Waits for DB health check
4. Runs pending migrations
5. Starts all backend services (single `pnpm -C backend dev`)
6. Waits for API Gateway health
7. Starts all 3 web portals
8. Displays status table with URLs
9. Opens browser tabs for each portal

#### 6.2 New `stop-local-stack.bat`

Gracefully stops everything:
1. Kill all node processes for the project
2. Stop Docker containers (but keep volumes)

#### 6.3 New `reset-local-stack.bat`

Nuclear option for fresh start:
1. Stop everything
2. `docker compose down -v` (removes volumes)
3. Re-create containers
4. Re-run migrations
5. Re-seed data

---

### PHASE 7: One-Click GCP Deploy

**Ticket**: LOCAL-PROD-001-G

#### 7.1 Deploy Architecture

```
LOCAL (dev/test) ──► git push main
                          │
                          ▼
                    GitHub Actions CI
                    (typecheck, lint, test, build)
                          │
                          ▼
                    Build Docker Images
                    Push to Artifact Registry
                          │
                          ▼
                    Deploy to Cloud Run (Staging)
                          │
                          ▼
                    Manual Promote → Cloud Run (Prod)
```

#### 7.2 Required GCP Setup

| Component | Service | Config |
|-----------|---------|--------|
| **Container Registry** | Artifact Registry | `asia-south1-docker.pkg.dev/supermandi-pos/supermandi` |
| **Backend Services** | Cloud Run | 10 services + main-backend |
| **Database** | Cloud SQL (PostgreSQL 15) | Or self-managed on Compute Engine |
| **Cache** | Memorystore (Redis 7) | Or self-managed on Compute Engine |
| **CDN/LB** | Cloud Load Balancing | SSL termination, routing |
| **DNS** | Cloud DNS | `supermandi.tech` |
| **Secrets** | Secret Manager | JWT_SECRET, API keys, DB password |
| **Monitoring** | Cloud Monitoring | Uptime checks, alerting |

#### 7.3 New `scripts/deploy-gcp.ps1`

One-click deploy script:

```
1. Run zero-regression-check.ps1 -Full (MUST pass)
2. Build all Docker images locally
3. Tag with git SHA
4. Push to Artifact Registry
5. Deploy to Cloud Run (staging)
6. Run smoke tests against staging
7. Prompt operator: "Promote to production? [y/N]"
8. If yes → deploy to Cloud Run (prod)
9. Run uptime-probe against prod
10. Log to BATCH_LEDGER.md
```

#### 7.4 Environment Variable Management

| Environment | Source | Management |
|-------------|--------|------------|
| **Local** | `.env` files | Checked into git (dev values only) |
| **Staging** | Cloud Run env vars | Set via `gcloud run services update` |
| **Production** | Secret Manager + Cloud Run | Secrets via `--set-secrets`, env via `--set-env-vars` |

---

### PHASE 8: Hardcoded URL Cleanup

**Ticket**: LOCAL-PROD-001-H

#### Files with Hardcoded Google VM IP (`34.14.220.171`)

| File | Current Value | Fix |
|------|---------------|-----|
| `.env` | `EXPO_PUBLIC_API_URL=http://34.14.220.171:3000` | Change to `http://localhost:3000` |
| `.env.local.example` | `http://34.14.220.171:3000` | Change to `http://localhost:3000` |
| `.env.local.example` | `http://34.14.220.171:3009` | Change to `http://localhost:3009` |
| `app.json` | `"API_URL": "https://supermandi.tech"` | Verify `app.config.js` overrides with env var |

#### Files with Production Domain (OK for production, but need local override)

| File | Value | Status |
|------|-------|--------|
| `retailer-admin/.env` | `https://api.supermandi.tech` | OK - `.env.local` overrides for dev |
| `supermandi-superadmin/.env` | `https://supermandi.tech` | OK - `.env.local` overrides for dev |
| `supplier-portal/.env.production` | `https://api.supermandi.tech` | OK - only used in prod build |

---

## Execution Order

```
PHASE 1 (Port Conflicts)     ─── 30 min
    │
PHASE 2 (Env Configuration)  ─── 30 min
    │
PHASE 3 (DB & Seed Data)     ─── 45 min
    │
PHASE 4 (E2E Connectivity)   ─── 1 hr (testing)
    │
PHASE 5 (POS App)            ─── 30 min
    │
PHASE 6 (One-Click Scripts)  ─── 1 hr
    │
PHASE 7 (GCP Deploy)         ─── 2-3 hr (new infra)
    │
PHASE 8 (URL Cleanup)        ─── 15 min
```

---

## Success Criteria

### Local Go-Live Checklist

- [ ] All backend services start without port conflicts
- [ ] `pnpm -r typecheck` passes (all 22 projects)
- [ ] Docker containers healthy (Postgres + Redis)
- [ ] Database has seed data for testing
- [ ] **Retailer Web** loads at `localhost:5173/retailer/`, can login and view dashboard
- [ ] **Supplier Web** loads at `localhost:4001/supplier/`, can login and manage products
- [ ] **Admin Web** loads at `localhost:5174/admin/`, can login and see stores
- [ ] **POS App** connects to local backend, can search products and checkout
- [ ] Voice commands work (mock mode without API key)
- [ ] No CORS errors in any portal
- [ ] No hardcoded Google VM IPs in env files
- [ ] `start-local-stack.bat` brings up everything in one click
- [ ] `stop-local-stack.bat` tears down cleanly

### GCP Deploy Checklist

- [ ] `deploy-gcp.ps1` builds and pushes Docker images
- [ ] Cloud Run services deployed with correct env vars
- [ ] Staging environment reachable and functional
- [ ] Production promotion works
- [ ] Rollback procedure tested
- [ ] DNS points to new Cloud Run services
- [ ] SSL/TLS working on `supermandi.tech`

---

## Dependencies

| Dependency | Status | Owner |
|------------|--------|-------|
| Docker Desktop installed | DONE | Operator |
| PostgreSQL + Redis containers | DONE | Docker Compose |
| Firebase project (`supermandi-pos`) | DONE | Shared |
| GCP project + billing | NEEDED | Operator |
| Domain DNS (`supermandi.tech`) | NEEDED | Operator |
| Artifact Registry setup | NEEDED | Operator |
| Cloud Run setup | NEEDED | Operator |

---

## Rollback Plan

Since this ticket changes infrastructure (ports, env vars, scripts), rollback is:

1. `git revert` the commit(s) from this ticket
2. Restore `.env` files from git history
3. Re-run `start-local-stack.bat` with original ports

**Risk**: LOW - All changes are local configuration. No database schema changes. No production impact (VM already shut down).

---

## References

- `RELEASES/MASTER_PLAN.md` - Zero-regression constitution
- `backend/docker-compose.yml` - Local Docker config
- `backend/docker-compose.prod.yml` - Production Docker config (V3.0.9)
- `backend/.env` - Backend environment variables
- `scripts/start-local-stack.bat` - Current local startup script
- `scripts/zero-regression-check.ps1` - Pre-deploy validation
