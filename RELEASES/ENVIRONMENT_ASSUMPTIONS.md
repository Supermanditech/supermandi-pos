# ENVIRONMENT ASSUMPTIONS — Validated 2026-02-08

> GO-LIVE-001 — Production Readiness & Freeze Anchor
> These assumptions MUST be true for deployment to succeed.

---

## 1. GCP Infrastructure Requirements

| Resource | Type | Region | Required |
|----------|------|--------|----------|
| Cloud SQL (PostgreSQL 16) | db-f1-micro+ | asia-south1 | YES |
| Memorystore (Redis 7) | basic | asia-south1 | YES |
| Artifact Registry | Docker repo | asia-south1 | YES |
| VPC Connector | supermandi-vpc | asia-south1 | YES |
| Secret Manager | 3 secrets | global | YES |
| Cloud Run | 14 services | asia-south1 | YES |
| Custom Domain | supermandi.tech | — | YES |

---

## 2. Secret Manager Secrets

| Secret Name | Used By | Purpose |
|-------------|---------|---------|
| `postgres-password` | All backend services | Database authentication |
| `jwt-secret` | api-gateway, auth-service | JWT token signing |
| `admin-token` | api-gateway, main-backend | Admin API authentication |

**Optional (feature-dependent):**

| Secret Name | Used By | Purpose |
|-------------|---------|---------|
| `razorpay-key-id` | payment-service | Payment gateway |
| `razorpay-key-secret` | payment-service | Payment gateway |
| `anthropic-api-key` | voice-service | Voice AI processing |
| `openai-api-key` | voice-service | Voice AI fallback |

---

## 3. Cloud SQL Requirements

- **Engine**: PostgreSQL 16
- **Database name**: `supermandi`
- **Schemas**: `public` + `catalog` (created by migrations)
- **Extensions**: `uuid-ossp` (enabled by migration 001)
- **Connection**: Via VPC connector (private IP), NOT public IP
- **Migrations**: Auto-run on container startup via `docker-entrypoint.sh`

---

## 4. Cloud Run Service Configuration

### Backend Services (10)

| Setting | Staging | Production |
|---------|---------|------------|
| Memory | 512Mi | 512Mi |
| CPU | 1 | 1 |
| Min instances | 0 | 1 |
| Max instances | 3 | 10 |
| Auth | no-allow-unauth | no-allow-unauth |
| VPC | supermandi-vpc | supermandi-vpc |
| VPC Egress | private-ranges-only | private-ranges-only |
| Concurrency | 80 | 80 |
| Timeout | 300s | 300s |

### Frontend Portals (4)

| Setting | Staging | Production |
|---------|---------|------------|
| Memory | 256Mi | 256Mi |
| CPU | 1 | 1 |
| Min instances | 0 | 0 |
| Max instances | 3 | 3 |
| Auth | allow-unauth | allow-unauth |

---

## 5. Networking

```
Internet → Cloud Run (HTTPS) → VPC Connector → Cloud SQL (private IP)
                                             → Memorystore Redis (private IP)
```

- All inter-service communication uses Cloud Run service URLs (HTTPS)
- Database and Redis are ONLY accessible via VPC connector
- No public IP on Cloud SQL or Memorystore
- CORS_ALLOWED_ORIGINS must include production domain

---

## 6. Docker Image Contract

| Property | Value |
|----------|-------|
| Registry | asia-south1-docker.pkg.dev/supermandi-pos/supermandi |
| Tag format | `{service}:{GIT_SHA}` |
| User | nodejs (UID 1001) — non-root |
| Writable paths | /app/documents (DOCUMENT_STORAGE_DIR) |
| Entrypoint | backend: `./scripts/docker-entrypoint.sh` (migrations + server) |
| Port (backend) | 3010 |
| Port (api-gateway) | 3000 |
| Base image | node:20-alpine |

**Immutable deployment rule**: Same Docker digest flows local → staging → production. No rebuilds.

---

## 7. Environment Variables (Production)

### Required for ALL backend services:
```
NODE_ENV=production
GIT_SHA=<immutable SHA>
DATABASE_URL=postgresql://supermandi:<SECRET>@<CLOUD_SQL_PRIVATE_IP>:5432/supermandi
REDIS_URL=redis://<MEMORYSTORE_IP>:6379
JWT_SECRET=<from Secret Manager>
```

### Required for api-gateway:
```
ADMIN_TOKEN=<from Secret Manager>
CORS_ALLOWED_ORIGINS=https://supermandi.tech
```

### Required for main-backend:
```
DOCUMENT_STORAGE_DIR=/app/documents
PORTAL_BASE_URL=https://supermandi.tech
```

### Required for payment-service:
```
RAZORPAY_KEY_ID=<from Secret Manager>
RAZORPAY_KEY_SECRET=<from Secret Manager>
```

### Frontend portals (build-time ARGs, baked into static assets):
```
VITE_API_BASE_URL=https://supermandi.tech    # retailer-admin, superadmin
NEXT_PUBLIC_API_BASE_URL=https://supermandi.tech  # supplier-portal
VITE_GIT_SHA=<SHA>
```

---

## 8. Health Endpoints

| Endpoint | Expected | Used For |
|----------|----------|----------|
| `GET /health` | `{"status":"ok","gitSha":"..."}` | Cloud Run liveness probe |
| `GET /version` | `{"sha":"..."}` | Deploy verification |
| `GET /api/v1/health` | Gateway proxied | External health check |

---

## 9. Pre-Deployment Checklist

- [ ] Cloud SQL instance running, accessible via VPC
- [ ] Memorystore Redis running, accessible via VPC
- [ ] VPC connector `supermandi-vpc` active
- [ ] All 3 required secrets in Secret Manager
- [ ] Artifact Registry repo exists
- [ ] Custom domain `supermandi.tech` mapped to Cloud Run
- [ ] SSL certificate provisioned for supermandi.tech
- [ ] All 14 Docker images pushed with correct SHA tag
- [ ] `DOCUMENT_STORAGE_DIR` writable in container
