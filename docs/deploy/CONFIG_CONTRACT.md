# Configuration Contract — SuperMandi Cloud Run Deployment

> CR-SVCURL-001 + CR-SECRET-001: All services must use env vars for URLs and secrets.
> Zero hardcoded URLs/IPs in source code. Fail-fast in production if required vars missing.

---

## Service URL Strategy

**Strategy: Gateway routing (monolith mode)**

All portal traffic flows through the **API Gateway** which proxies to the main backend.
Backend microservices (auth, catalog, inventory, etc.) are currently consolidated in the
main backend monolith. Only the payment service runs independently.

```
Cloud LB → API Gateway → Main Backend (monolith)
                       → Payment Service (independent)
```

Inter-service calls (order-service → inventory-service, platform-service → inventory-service)
use direct Cloud Run URLs set via environment variables.

---

## Required Environment Variables

### API Gateway
| Variable | Required | Default (dev) | Description |
|----------|----------|---------------|-------------|
| `ADMIN_SERVICE_URL` | PROD: YES | `http://localhost:3010` | Main backend URL |
| `PAYMENT_SERVICE_URL` | PROD: YES | `http://localhost:3011` | Payment service URL |
| `API_GATEWAY_PORT` | No | `3000` | Service port (Cloud Run sets `PORT`) |

### Order Service
| Variable | Required | Default (dev) | Description |
|----------|----------|---------------|-------------|
| `INVENTORY_SERVICE_URL` | PROD: YES | `http://localhost:3004` | Inventory service URL |
| `ORDER_SERVICE_PORT` | No | `3005` | Service port |

### Platform Service
| Variable | Required | Default (dev) | Description |
|----------|----------|---------------|-------------|
| `INVENTORY_SERVICE_URL` | PROD: YES | `http://localhost:3004` | Inventory service URL |
| `PLATFORM_SERVICE_PORT` | No | `3008` | Service port |

### All Services (shared)
| Variable | Required | Default (dev) | Description |
|----------|----------|---------------|-------------|
| `DB_HOST` | Yes | `localhost` | PostgreSQL host |
| `DB_PORT` | No | `5432` | PostgreSQL port |
| `DB_NAME` | No | `supermandi` | Database name |
| `DB_USER` | No | `postgres` | Database user |
| `DB_PASSWORD` | Yes | `postgres` | Database password |
| `REDIS_URL` | Yes | `redis://localhost:6379` | Redis connection URL |
| `NODE_ENV` | Yes | `development` | Environment |

---

## Required Secrets (Secret Manager)

| Secret Name | Used By | Description |
|-------------|---------|-------------|
| `jwt-secret` | auth-service, main-backend | JWT signing key |
| `admin-token` | api-gateway, main-backend | Admin API master token |
| `openai-api-key` | main-backend | OpenAI API key for AI features |
| `anthropic-api-key` | voice-service | Anthropic API key for voice |
| `postgres-password` | All backend services | Database password |
| `firebase-sa` | auth-service | Firebase service account JSON |
| `firebase-project-id` | auth-service | Firebase project ID |

### Secret Loading Priority

```
1. Environment variable (Cloud Run / Secret Manager)  ← PRIMARY
2. File path from *_FILE env var (Docker Compose)      ← LEGACY FALLBACK
3. Crash with clear error message                      ← FAIL-FAST
```

---

## Production Fail-Fast Rules

1. If `NODE_ENV=production` and any required `*_SERVICE_URL` is missing → **process.exit(1)**
2. If required secret env var is empty and no `*_FILE` fallback → **process.exit(1)**
3. All missing vars are logged before crash (operator sees full list)

---

## Port Allocation

| Service | Default Port | Env Var | Cloud Run |
|---------|-------------|---------|-----------|
| api-gateway | 3000 | `API_GATEWAY_PORT` | `PORT` (auto) |
| auth-service | 3001 | `AUTH_SERVICE_PORT` | `PORT` (auto) |
| supplier-service | 3002 | `SUPPLIER_SERVICE_PORT` | `PORT` (auto) |
| catalog-service | 3003 | `CATALOG_SERVICE_PORT` | `PORT` (auto) |
| inventory-service | 3004 | `INVENTORY_SERVICE_PORT` | `PORT` (auto) |
| order-service | 3005 | `ORDER_SERVICE_PORT` | `PORT` (auto) |
| reorder-service | 3006 | `REORDER_SERVICE_PORT` | `PORT` (auto) |
| platform-service | 3008 | `PLATFORM_SERVICE_PORT` | `PORT` (auto) |
| voice-service | 3009 | `VOICE_SERVICE_PORT` | `PORT` (auto) |
| main-backend | 3010 | `PORT` | `PORT` (auto) |
| payment-service | 3011 | `PAYMENT_SERVICE_PORT` | `PORT` (auto) |
