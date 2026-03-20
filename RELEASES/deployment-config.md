# SuperMandi POS — Deployment Configuration

**Generated**: 2026-03-20
**Deploy SHA**: `a5498fd9`
**Target**: GCP Staging (staging.supermandi.tech)

---

## URL Mapping (Staging)

| Path | Service | Cloud Run Service | Port | Auth |
|---|---|---|---|---|
| `https://staging.supermandi.tech/` | Landing Page | landing | 8080 | Public |
| `https://staging.supermandi.tech/privacy` | Landing Page | landing | 8080 | Public |
| `https://staging.supermandi.tech/terms` | Landing Page | landing | 8080 | Public |
| `https://staging.supermandi.tech/pos` | Landing Page | landing | 8080 | Public |
| `https://staging.supermandi.tech/retailer/` | Retailer Admin | retailer-admin | 8080 | JWT (retailer) |
| `https://staging.supermandi.tech/retailer/login` | Retailer Admin | retailer-admin | 8080 | Public |
| `https://staging.supermandi.tech/supplier/` | Supplier Portal | supplier-portal | 8080 | JWT (supplier) |
| `https://staging.supermandi.tech/supplier/login/` | Supplier Portal | supplier-portal | 8080 | Public |
| `https://staging.supermandi.tech/admin/` | SuperAdmin | superadmin | 8080 | Admin session |
| `https://staging.supermandi.tech/api/v1/*` | API Gateway | api-gateway | 3000 | Varies |

---

## Port Mapping

### Cloud Run Services (External)

| Service | Container Port | Image |
|---|---|---|
| api-gateway | 3000 | `asia-south1-docker.pkg.dev/supermandi-backend/supermandi/api-gateway:SHA` |
| main-backend | 3010 | `asia-south1-docker.pkg.dev/supermandi-backend/supermandi/main-backend:SHA` |
| retailer-admin | 8080 | `asia-south1-docker.pkg.dev/supermandi-backend/supermandi/retailer-admin:SHA` |
| supplier-portal | 8080 | `asia-south1-docker.pkg.dev/supermandi-backend/supermandi/supplier-portal:SHA` |
| superadmin | 8080 | `asia-south1-docker.pkg.dev/supermandi-backend/supermandi/superadmin:SHA` |
| landing | 8080 | `asia-south1-docker.pkg.dev/supermandi-backend/supermandi/landing:SHA` |

### Backend Microservices (Internal to main-backend)

| Service | Port | Role |
|---|---|---|
| auth-service | 3001 | JWT + OTP auth |
| platform-service | 3002 | Store + user management |
| supplier-service | 3003 | Supplier operations |
| catalog-service | 3004 | Product catalog |
| inventory-service | 3005 | Stock management |
| order-service | 3006 | Purchase orders + GRN |
| reorder-service | 3007 | Auto-reorder engine |
| voice-service | 3008 | Voice/STT |
| payment-service | 3011 | Razorpay integration |

### Infrastructure

| Service | Port | Type |
|---|---|---|
| Cloud SQL (PostgreSQL 16) | 5432 | Managed (asia-south1) |
| Redis 7 | 6379 | Cloud Memorystore or container |
| Cloud SQL Proxy | 15432 | Local access only |

---

## Environment Mapping

### Staging vs Production

| Variable | Staging | Production |
|---|---|---|
| `NODE_ENV` | production | production |
| `PORTAL_BASE_URL` | `https://staging.supermandi.tech` | `https://supermandi.tech` |
| `ALLOWED_ORIGINS` | `https://staging.supermandi.tech` | `https://supermandi.tech` |
| `CORS_ALLOWED_ORIGINS` | `https://staging.supermandi.tech` | `https://supermandi.tech` |
| `DATABASE_URL` | Cloud SQL staging instance | Cloud SQL prod instance |
| `FIREBASE_PROJECT_ID` | `supermandi-backend` | `supermandi-backend` |
| `GCS_DOCUMENTS_BUCKET` | `supermandi-pos-documents` | `supermandi-pos-documents-prod` |
| `RAZORPAY_KEY_ID` | Test key (`rzp_test_*`) | Live key (`rzp_live_*`) |

### Required Secrets (GCP Secret Manager)

| Secret | Used By | Required |
|---|---|---|
| `JWT_SECRET` | auth-service, api-gateway, main-backend | YES |
| `ADMIN_TOKEN` | api-gateway, main-backend | YES |
| `POSTGRES_PASSWORD` | All backend services | YES |
| `REDIS_PASSWORD` | All backend services | YES |
| `FIREBASE_SERVICE_ACCOUNT` | auth-service, main-backend | YES (for OTP) |
| `RESEND_API_KEY` | main-backend | YES (for email) |
| `OPENAI_API_KEY` | main-backend | Optional (voice/AI) |
| `RAZORPAY_KEY_ID` | payment-service | Optional (UPI) |
| `RAZORPAY_KEY_SECRET` | payment-service | Optional (UPI) |
| `RAZORPAY_ACCOUNT_NUMBER` | payment-service | Optional (payouts) |
| `RAZORPAY_WEBHOOK_SECRET` | main-backend | Optional (webhooks) |
| `WHATSAPP_ACCESS_TOKEN` | main-backend | Optional (messaging) |
| `WHATSAPP_PHONE_NUMBER_ID` | main-backend | Optional (messaging) |
| `WHATSAPP_APP_SECRET` | main-backend | Optional (webhook verify) |

---

## Version Table

| System | Version | Commit | Framework | Status |
|---|---|---|---|---|
| POS App | 1.0.1 | `a5498fd9` | Expo 52 / RN 0.76.9 | Ready (APK build needed) |
| Retailer Admin | 1.0.0 | `a5498fd9` | Vite 5.0 / React 18.2 | Ready |
| Supplier Portal | 0.1.0 | `a5498fd9` | Next.js 16.1 / React 18.3 | Ready |
| SuperAdmin | 0.0.0 | `a5498fd9` | Vite 7.2 / React 19.2 | Ready |
| Landing Page | N/A | `a5498fd9` | Static HTML / nginx | Ready |
| API Gateway | 1.0.0 | `a5498fd9` | Express 4.18 / Node 20 | Ready |
| Main Backend | 1.0.0 | `a5498fd9` | Express 4.18 / Node 20 | Ready |
| PostgreSQL | 16-alpine | N/A | Cloud SQL | Running |
| Redis | 7-alpine | N/A | Container / Memorystore | Running |

---

## GCP Load Balancer Configuration

```
Client (HTTPS:443)
  → Cloud Load Balancer (IP: 34.54.26.145)
    → URL Map: supermandi-staging-urlmap
      → /retailer/*  → retailer-admin backend service → NEG → Cloud Run
      → /supplier/*  → supplier-portal backend service → NEG → Cloud Run
      → /admin/*     → superadmin backend service → NEG → Cloud Run
      → /api/*       → api-gateway backend service → NEG → Cloud Run
      → /* (default) → landing backend service → NEG → Cloud Run
    → SSL Certificate: supermandi-staging-cert (Google-managed, auto-renew)
```

---

## DNS Configuration

| Record | Type | Value |
|---|---|---|
| `staging.supermandi.tech` | A | `34.54.26.145` (Cloud LB) |
| Managed at | Registrar | (not GCP Cloud DNS) |

---

## Deployment Steps

### 1. Pre-Deploy
```bash
# Verify all gates
node scripts/fix-guard.js check
pnpm -r typecheck
git log --oneline -1  # Confirm SHA a5498fd9
```

### 2. Push to CI
```bash
git push origin main  # Already done — SHA a5498fd9 on origin
```

### 3. CI/CD Pipeline (.github/workflows/deploy.yml)
- Builds 6 Docker images tagged with SHA
- Pushes to Artifact Registry
- Deploys to Cloud Run (all 6 services)
- Runs routing validation (ZRP-L gates)
- Runs staging smoke test

### 4. Apply Pending Migrations (188-202)
```bash
# Start Cloud SQL proxy
cloud-sql-proxy.exe --gcloud-auth supermandi-backend:asia-south1:supermandi-staging --port=15432

# Preview
DATABASE_URL=postgresql://postgres:<pass>@127.0.0.1:15432/supermandi node backend/scripts/migrate-prod.js dry-run

# Apply (after backup)
DATABASE_URL=postgresql://postgres:<pass>@127.0.0.1:15432/supermandi node backend/scripts/migrate-prod.js
```

### 5. Post-Deploy Verification
```bash
# Health checks
curl -s https://staging.supermandi.tech/api/v1/pos/health | jq .
curl -s https://staging.supermandi.tech/retailer/ -o /dev/null -w "%{http_code}"
curl -s https://staging.supermandi.tech/supplier/ -o /dev/null -w "%{http_code}"
curl -s https://staging.supermandi.tech/admin/ -o /dev/null -w "%{http_code}"
curl -s https://staging.supermandi.tech/ -o /dev/null -w "%{http_code}"
```

### 6. Tag Release
```bash
git tag MEGA-RC-v2-2026-03-20 a5498fd9
git push origin MEGA-RC-v2-2026-03-20
```

---

## Rollback Plan

### Immediate Rollback (< 5 min)
```bash
# Revert each Cloud Run service to previous revision
gcloud run services update-traffic api-gateway --region=asia-south1 --to-revisions=<prev>=100
gcloud run services update-traffic main-backend --region=asia-south1 --to-revisions=<prev>=100
gcloud run services update-traffic retailer-admin --region=asia-south1 --to-revisions=<prev>=100
gcloud run services update-traffic supplier-portal --region=asia-south1 --to-revisions=<prev>=100
gcloud run services update-traffic superadmin --region=asia-south1 --to-revisions=<prev>=100
gcloud run services update-traffic landing --region=asia-south1 --to-revisions=<prev>=100
```

### Previous Stable
- SHA: `81c3a2a4`
- Tag: `MEGA-RC-v1-2026-03-13`
- All 6 services verified working at this SHA

### Migration Rollback
- Cloud SQL backup MUST be taken before applying migrations
- Rollback SQL in each migration file's header comment (ROLLBACK: ...)
- See `RELEASES/ROLLBACK_PLAYBOOK.md` for full procedure
