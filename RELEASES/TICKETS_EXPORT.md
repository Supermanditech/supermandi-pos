# SuperMandi POS — Active Tickets Export

> **Exported**: 2026-02-05 | **Source**: `RELEASES/MASTER_PLAN.md` (DOC-014 + DOC-015)
> **Architecture**: Cloud Run + Cloud SQL + Memorystore + Artifact Registry (per PDF plan)
> **Pipeline**: GitHub → Cloud Build → AR → Cloud Run staging → promote same SHA → Cloud Run production

---

## Current Status

| Batch | Portal | Status | Progress | Owner |
|-------|--------|--------|----------|-------|
| BATCH-004 | Retailer Web | `TESTING` | 5/5 CODE_VERIFIED | Claude |
| BATCH-005 | Supplier Web | `TESTING` | 4/4 CODE_VERIFIED | Claude |
| BATCH-006 | SuperAdmin | `TESTING` | 11/11 CODE_VERIFIED | Claude |
| BATCH-007 | POS App | `IN_PROGRESS` | 1/7 (HTTPS fixed) | Claude |
| BATCH-008 | Cloud Run Prep | `DRAFT` | 0/11 | Claude |
| BATCH-009 | GCP CI/CD | `DRAFT` | 0/9 | Claude+Operator |
| BATCH-010 | Staging Deploy | `DRAFT` | 0/6 | Operator |
| BATCH-011 | Go-Live | `DRAFT` | 0/4 | Operator |

### Batch Order
```
BATCH-004 Retailer ──┐
BATCH-005 Supplier ──┼──► BATCH-008 Cloud Run Prep ──► BATCH-009 CI/CD ──► BATCH-010 Staging ──► BATCH-011 Go-Live
BATCH-006 Admin ─────┤                                       │
BATCH-007 POS ───────┘                                       │
                                              Operator: GCP infra (Cloud SQL, Memorystore, AR, VPC, Secret Manager)
```

---

## GCP Architecture

```
GCP ARCHITECTURE:
┌─────────────────────────────────────────────────────────────────┐
│  Cloud Load Balancer (HTTPS: supermandi.tech)                   │
│  ├── /api/v1/*     → Cloud Run: api-gateway                    │
│  ├── /retailer/*   → Cloud Run: retailer-admin (nginx+SPA)     │
│  ├── /supplier/*   → Cloud Run: supplier-portal (Next.js)      │
│  ├── /admin/*      → Cloud Run: superadmin (nginx+SPA)         │
│  └── /             → Cloud Run: landing-page (static)          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Cloud Run Services (internal, no public URL)                   │
│  ├── auth-service     ├── platform-service   ├── main-backend  │
│  ├── supplier-service ├── catalog-service    ├── inventory-svc  │
│  ├── order-service    ├── reorder-service    ├── voice-service  │
│  └── payment-service                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
              Cloud SQL             Memorystore
              (Postgres 15)         (Redis 7)
              VPC connector         VPC connector

Secrets: GCP Secret Manager (mounted as env vars in Cloud Run)
Images:  Artifact Registry (asia-south1-docker.pkg.dev/supermandi-pos/supermandi/)
CI/CD:   GitHub Actions → build images → push AR → deploy Cloud Run
```

---

## Codebase Audit Findings (from agent research)

### Existing GitHub Actions Workflows (3 files)

1. **ci-gates.yml** — Triggers on push/PR to main. Jobs: typecheck, lint, test (Postgres 15), build-verify, local-smoke, gate-check. All must pass.
2. **uptime-probe.yml** — Every 5 min health check on production URLs. Creates GitHub issues on failure. Has hardcoded IP `34.14.220.171`.
3. **deploy-verify.yml** — Post-deploy verification. **DEAD TRIGGER**: references "Deploy to Production" workflow that DOES NOT EXIST. Also runs on schedule (6 AM daily) and manual dispatch.

**Missing**: No CD/deploy pipeline exists. No `cloudbuild.yaml`. No deploy-to-staging or deploy-to-production workflow.

### Dockerfiles (13 found, 1 missing)

| Service | Dockerfile | HEALTHCHECK | PORT env | GIT_SHA | Hardcoded URLs |
|---------|-----------|-------------|----------|---------|----------------|
| api-gateway | ✅ | ✅ | PORT=3000 | ❌ | localhost in HEALTHCHECK only |
| auth-service | ✅ | ✅ | PORT=3001 | ❌ | localhost in HEALTHCHECK only |
| platform-service | ✅ | ✅ | PORT=3002 | ❌ | localhost in HEALTHCHECK only |
| supplier-service | ✅ | ✅ | PORT=3003 | ❌ | localhost in HEALTHCHECK only |
| catalog-service | ✅ | ✅ | PORT=3004 | ❌ | localhost in HEALTHCHECK only |
| inventory-service | ✅ | ✅ | PORT=3005 | ❌ | localhost in HEALTHCHECK only |
| order-service | ✅ | ✅ | PORT=3006 | ❌ | localhost in HEALTHCHECK only |
| reorder-service | ✅ | ✅ | PORT=3007 | ❌ | localhost in HEALTHCHECK only |
| voice-service | ✅ | ✅ | VOICE_SERVICE_PORT=3008 | ❌ | localhost in HEALTHCHECK only |
| payment-service | ✅ | ✅ | PORT=3011 | ❌ | localhost in HEALTHCHECK only |
| main-backend (Dockerfile.main) | ✅ | ❌ | PORT=3010 | ❌ | None |
| retailer-admin | ✅ | ✅ | port 80 (nginx) | ✅ VITE_GIT_SHA | `https://supermandi.tech` as ARG default |
| supplier-portal | ✅ | ✅ | PORT=3001 | ❌ | `https://supermandi.tech` as ARG default |
| **supermandi-superadmin** | **❌ MISSING** | — | — | — | — |
| supermandi-landing | ❌ MISSING | — | — | — | — |

### Service-to-Service URLs (Cloud Run blockers)

**Config files with localhost fallbacks:**
- `api-gateway/src/config.ts`: `ADMIN_SERVICE_URL` → fallback `http://localhost:3010`, `PAYMENT_SERVICE_URL` → fallback `http://localhost:3011`
- `order-service/src/config.ts`: `INVENTORY_SERVICE_URL` → fallback `http://localhost:3005` (**BUG**: should be 3004)
- `platform-service/src/config.ts`: `INVENTORY_SERVICE_URL` → fallback `http://localhost:3005` (**BUG**: should be 3004)

**Docker DNS names in docker-compose.prod.yml (lines 172-181):**
```
AUTH_SERVICE_URL=http://auth-service:3001
ADMIN_SERVICE_URL=http://main-backend:3010
PLATFORM_SERVICE_URL=http://platform-service:3002
SUPPLIER_SERVICE_URL=http://supplier-service:3003
CATALOG_SERVICE_URL=http://catalog-service:3004
INVENTORY_SERVICE_URL=http://inventory-service:3005
ORDER_SERVICE_URL=http://order-service:3006
REORDER_SERVICE_URL=http://reorder-service:3007
VOICE_SERVICE_URL=http://voice-service:3008
```

### File-Based Secrets (won't work on Cloud Run)

| File | Pattern | Issue |
|------|---------|-------|
| `backend/src/middleware/adminToken.ts` (L42-61) | Reads `ADMIN_TOKEN_FILE` from `/run/secrets/admin_token` | Cloud Run uses Secret Manager env vars, not file mounts |
| `backend/src/services/ai/openaiProvider.ts` (L25-43) | Reads `OPENAI_API_KEY_FILE` | Same issue |
| `backend/src/routes/v1/documents.ts` (L14) | Reads `ADMIN_TOKEN_FILE` | Same issue |
| `backend/services/api-gateway/src/services/adminSessionService.ts` (L46-56) | Reads `ADMIN_TOKEN_FILE` | Same issue |

### Hardcoded VM IP

`34.14.220.171` found in:
- `backend/docker-compose.prod.yml` (L119) — SERVER_NAMES
- `backend/nginx/docker-entrypoint.sh` — SERVER_NAMES default
- `backend/nginx/nginx.prod.conf.template` — server_name + SSL cert paths

---

## TICKETS TO EXECUTE

### DOC-ALIGN-001 — MASTER_PLAN Cloud Run Pipeline Must Match PDF Exactly

**Risk Class**: F | **Batch**: Documentation

**Goal**: Ensure MASTER_PLAN reflects the PDF pipeline: Cloud Build + Artifact Registry + Cloud Run + promote same SHA.

**Scope**: Update `RELEASES/MASTER_PLAN.md`:
- Pipeline diagram: GitHub → Cloud Build → Artifact Registry → Cloud Run staging → promote prod
- "Same image SHA everywhere" rules + enforcement
- Remove any "deploy from laptop" wording as the primary CD mechanism (allowed only as emergency fallback)

**Acceptance**: MASTER_PLAN includes the exact "One-Click Deploy Flow" steps from PDF (staging auto, promote manual, same SHA).

---

### CD-001 — Create Real "Deploy to Staging" + "Promote to Production" Workflows

**Risk Class**: F | **Batch**: BATCH-009

**Goal**: Fix the current dead `deploy-verify.yml` trigger and implement missing CD workflows.

**Scope**:
1. Add `.github/workflows/deploy-staging.yml`:
   - Build containers (or call Cloud Build)
   - Deploy staging Cloud Run services
   - Trigger `deploy-verify.yml`
2. Add `.github/workflows/deploy-production.yml`:
   - Input: SHA
   - Deploy prod using exact same image digest/SHA (no rebuild)
3. Update `deploy-verify.yml` to trigger from these workflows

**Acceptance**:
- GitHub Actions UI shows both workflows
- `deploy-verify` triggers automatically after deploy
- Logs show staging deployed and verified

---

### CR-BUILD-001 — Cloud Build Trigger Wired to GitHub

**Risk Class**: F | **Batch**: BATCH-009

**Goal**: Meet PDF requirement "GitHub → Cloud Build trigger".

**Scope**: Add `cloudbuild.yaml` (or Cloud Build config) that runs:
1. `pnpm install --frozen-lockfile`
2. `pnpm -r typecheck`
3. `pnpm -r test`
4. Playwright E2E (as per plan)
5. Build Docker images and push to Artifact Registry
6. Auto-deploy staging

**Acceptance**: A push to main triggers Cloud Build and results in staging revision deployed.

---

### CR-AR-001 — Provision Artifact Registry Repo + Auth (Idempotent)

**Risk Class**: F | **Batch**: BATCH-009

**Goal**: Create the repo Claude assumed exists.

**Scope**:
- Provision `asia-south1-docker.pkg.dev/<project>/supermandi`
- Set IAM so Cloud Build and deployer SA can push/pull

**Acceptance**:
- `gcloud artifacts repositories list` shows repo
- Image push/pull works from CI

---

### CR-ENV-001 — Secret Manager Integration Contract

**Risk Class**: F | **Batch**: BATCH-008

**Goal**: Move VM file secrets to Secret Manager (as PDF says).

**Scope**:
- Create `docs/deploy/CONFIG_CONTRACT.md` listing required secrets/env
- Map secrets into Cloud Run services as env vars (or volume mounts)

**Acceptance**:
- No service relies on `/run/secrets/*`
- All services boot on Cloud Run with Secret Manager configured

---

### CR-SQL-001 + CR-REDIS-001 + CD-VPC-001 — Cloud SQL + Memorystore Reachable from Cloud Run

**Risk Class**: F | **Batch**: BATCH-009

**Goal**: Meet Cloud SQL + Memorystore requirement.

**Scope**:
- Provision Cloud SQL Postgres 15
- Provision Memorystore Redis
- Add Serverless VPC Connector (or chosen secure networking method)
- Pass DB/Redis connection settings to services

**Acceptance**: Staging services connect to Cloud SQL + Redis in Cloud Run (health passes).

---

### CR-DOCKER-001 — Cloud Run-Ready Docker Builds for All Required Services

**Risk Class**: F | **Batch**: BATCH-008

**Goal**: Ensure every runtime component has a build path.

**Scope**: Verify Dockerfiles exist and build for:
- Backend services and portals (retailer/admin static, supplier Next.js, landing)
- Add missing Dockerfile for `supermandi-superadmin` (confirmed missing)

**Acceptance**:
- `docker build` succeeds for each target
- Images run locally and serve expected endpoints

---

### CR-SVCURL-001 — Service-to-Service URLs Not Docker DNS

**Risk Class**: F | **Batch**: BATCH-008

**Goal**: Replace `http://auth-service:3001` style with env-based URLs or gateway routing (Cloud Run-safe).

**Files requiring changes**:
- `backend/services/api-gateway/src/config.ts` — ADMIN_SERVICE_URL, PAYMENT_SERVICE_URL localhost fallbacks
- `backend/services/order-service/src/config.ts` — INVENTORY_SERVICE_URL (port bug: 3005→3004)
- `backend/services/platform-service/src/config.ts` — INVENTORY_SERVICE_URL (port bug: 3005→3004)
- `backend/docker-compose.prod.yml` lines 172-181 — Docker DNS names

**Acceptance**:
- No service depends on docker-compose DNS when running on Cloud Run
- **No Docker DNS names anywhere in source code** (zero matches for `http://SERVICE_NAME:PORT`)
- Chosen strategy (gateway routing vs direct Cloud Run URLs) documented in `docs/deploy/CONFIG_CONTRACT.md`
- Strategy enforced in env validation (startup checks)
- Port bug fixed: INVENTORY_SERVICE_URL default 3005 → 3004

---

## NEW TICKETS (DOC-015 — Gap-Closing for Production-Grade Parity)

### LOCAL-PROD-201 — Local-Prod Runs SHA-Tagged Docker Images (Cloud Run Parity)

**Risk Class**: F | **Batch**: BATCH-008

**Problem**: Local testing runs services via `pnpm dev` / raw builds, but Cloud Run deploys Docker
images from Artifact Registry. If local tests don't validate the same built images, regressions
can slip through after deployment.

**Goal**: Local testing uses the same Docker images that Cloud Run will deploy.

**Acceptance**:
- `./scripts/build-all-images.sh --sha <sha>` builds all images with SHA tag
- `./scripts/run-local-prod-images.sh --sha <sha>` starts full stack from those images
- `./scripts/prelive-verify.sh --base-url http://localhost:8080 --sha <sha>` passes
- Evidence saved to `RELEASES/EVIDENCE/local/<sha>/`
- The images tested locally are byte-identical to what AR will hold

---

### CD-201 — Enforce "Promote Same SHA" (No Rebuild) in Production

**Risk Class**: F | **Batch**: BATCH-009

**Problem**: Without enforcement, a production deploy could accidentally use a rebuilt image
(different from staging-tested), breaking "same artifact everywhere."

**Acceptance**:
- Production workflow requires `STAGING_APPROVED_SHA` input
- Workflow checks: staging revision image digest == requested SHA digest
- Deploy uses digest/SHA pin (not `:latest` or mutable tag)
- Fails if `:latest` is used anywhere in deploy command
- `BATCH_LEDGER.md` records both git SHA and image digest

---

### FRONTEND-CR-201 — Add Missing Dockerfiles + Unify URL Base Strategy

**Risk Class**: F | **Batch**: BATCH-008

**Problem**: `supermandi-superadmin` and `supermandi-landing` have no Dockerfiles. Portal Dockerfiles
have hardcoded `https://supermandi.tech` in ARG defaults.

**Acceptance**:
- All portals deployable as Cloud Run services behind LB paths
- `docker build` succeeds for supermandi-superadmin, supermandi-landing
- No hardcoded `supermandi.tech` in any Dockerfile (only as build ARG at deploy time)
- URL routing strategy documented: all portals use relative `/api/v1/*` or env-injected base URL

---

### Tightened: CR-SECRET-001 (existing ticket, stronger acceptance)

**Added acceptance criteria**:
- Every secret reads ENV first, file fallback only for legacy local/VM (optional)
- Startup validation lists ALL missing required env vars and **fails fast** (not silent empty string)
- All required secrets documented in `docs/deploy/CONFIG_CONTRACT.md`

---

## BATCH-008: Cloud Run Prep — Existing Tickets (from previous session)

These are ALSO in BATCH-008 and remain PENDING:

| # | Ticket | Risk | Description |
|---|--------|------|-------------|
| 1 | **LOCAL-PROD-201** | F | **NEW** Local-prod runs SHA-tagged Docker images (Cloud Run parity) |
| 2 | **FRONTEND-CR-201** | F | **NEW** Add missing Dockerfiles (superadmin, landing) + remove hardcoded domains |
| 3 | CR-MIG-001 | E | Renumber 6 duplicate/date-named migration files |
| 4 | CR-MIG-002 | E | Add pg_advisory_lock to migrate-prod.js |
| 5 | CR-DOCKER-002 | F | Create `scripts/build-all-images.sh` to verify all 14 images build |
| 6 | CR-SECRET-001 | D | Convert file-based secrets — **tightened**: fail-fast + CONFIG_CONTRACT.md |
| 7 | CR-VERSION-001 | D | Add `/version` endpoint + `ARG GIT_SHA` to all 11 backend Dockerfiles |
| 8 | CR-HEALTH-001 | D | Verify `/health` returns 200 + Cloud Run `PORT` env var on all services |

---

## BATCH-009: GCP CI/CD — Existing Tickets

| # | Ticket | Risk | Owner | Description |
|---|--------|------|-------|-------------|
| 1 | **CD-201** | F | Claude | **NEW** Enforce "promote same SHA" — prod fails if SHA != staging, no `:latest` |
| 2 | CD-AR-001 | F | Operator | Artifact Registry setup script |
| 3 | CD-SQL-001 | F | Operator | Cloud SQL Postgres 15 setup script |
| 4 | CD-REDIS-001 | F | Operator | Memorystore Redis 7 setup script |
| 5 | CD-VPC-001 | F | Operator | VPC Connector setup script |
| 6 | CD-SM-001 | F | Operator | Secret Manager setup script |
| 7 | CD-WORKFLOW-001 | F | Claude | GitHub Actions CD workflow (build images → push AR → deploy staging Cloud Run) |
| 8 | CD-DEPLOY-001 | F | Claude | `deploy-cloud-run.sh` + `promote-to-prod.sh` scripts |
| 9 | CD-WIF-001 | F | Operator | Workload Identity Federation for GitHub Actions → GCP |

---

## BATCH-010: Staging Deploy — 6 Tickets

| # | Ticket | Risk | Description |
|---|--------|------|-------------|
| 1 | STAGE-DEPLOY-001 | F | First staging deployment — all Cloud Run services healthy |
| 2 | STAGE-E2E-001 | B | E2E tests against staging (`STAGING=true npx playwright test --grep "@prod"`) |
| 3 | STAGE-MANUAL-001 | B | Operator tests all 4 portals on staging |
| 4 | STAGE-ROLLBACK-001 | F | Rollback drill via Cloud Run revision (< 5 min) |
| 5 | STAGE-INTEGRATION-001 | B | Cross-portal integration tests on staging |
| 6 | STAGE-SIGNOFF-001 | N/A | Staging sign-off — STAGING_APPROVED_SHA recorded |

---

## BATCH-011: Production Go-Live — 4 Tickets

| # | Ticket | Risk | Description |
|---|--------|------|-------------|
| 1 | GOLIVE-PROMOTE-001 | F | `./scripts/promote-to-prod.sh <STAGING_APPROVED_SHA> --confirm` — same image SHA |
| 2 | GOLIVE-VERIFY-001 | D | All 7 production URLs return 200, browser tests pass |
| 3 | GOLIVE-MONITOR-001 | F | 15-minute post-deploy monitoring via Cloud Logging |
| 4 | GOLIVE-SIGNOFF-001 | N/A | Go-live sign-off — PROD_SHA + ROLLBACK_SHA recorded |

---

## Risk Classes

| Class | Type | Evidence Required |
|-------|------|-------------------|
| A | UI/copy | Screenshot |
| B | API/logic | Screenshot + JSON |
| C | Auth/OTP | Video + console |
| D | Routing | curl headers |
| E | DB/schema | SQL logs |
| F | Infra/Docker | Build logs |

---

## Key Rules

1. **Same artifact SHA everywhere**: Build once → deploy staging → promote exact same image to production (no rebuild)
2. **No deploy without all gates green**: typecheck, lint, test, build-verify, local-smoke
3. **Staging before production**: Always
4. **Rollback < 5 min**: Cloud Run revision management
5. **Every change maps to a ticket ID**: No untracked changes

---

## Alignment Proof (Required Before Declaring "Aligned")

**Until this proof exists, the plan is "planned" not "aligned":**

Show a single SHA that:
1. Passes CI gates (typecheck, lint, test, build-verify, local-smoke)
2. Is built into AR images **by SHA tag**
3. Is deployed to staging Cloud Run
4. Passes `deploy-verify` on staging
5. Is promoted to prod using the **same image digest**
6. Rollback can revert to previous digest within 5 minutes

**Current status**: NOT YET PROVEN (CD pipeline does not exist, no images in AR yet)

---

## Gap Summary (DOC-015)

| Gap | Ticket | Status |
|-----|--------|--------|
| Local tests don't run Docker images | LOCAL-PROD-201 | PENDING |
| Missing Dockerfiles (superadmin, landing) | FRONTEND-CR-201 | PENDING |
| No "promote same SHA" enforcement | CD-201 | PENDING |
| Service URLs use Docker DNS | CR-SVCURL-001 (tightened) | PENDING |
| Secrets rely on `/run/secrets/` files | CR-SECRET-001 (tightened) | PENDING |
| CD pipeline doesn't exist | CD-WORKFLOW-001 + CD-001 | PENDING |
| Migration duplicates + no lock | CR-MIG-001 + CR-MIG-002 | PENDING |
| Hardcoded VM IP in configs | CR-IP-001 | PENDING |
