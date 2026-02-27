# Pre-Deploy Runtime Contract Report

> Target SHA: `83b2bffe`
> Generated: 2026-02-27T15:30:00+05:30
> Status: **ALL 12 CONTRACTS VERIFIED** — 0 critical gaps

---

## 1. Auth Contracts

### 1.1 JWT Secret — No Hardcoded Fallback
| Check | Result |
|-------|--------|
| File | `backend/services/api-gateway/src/middleware/jwtAuth.ts:52-60` |
| Behavior | `process.exit(1)` if `JWT_SECRET` is missing |
| Gateway | SECURE — no fallback |
| Auth service | SECURE — `config.ts:51-52` exits on missing |
| Supplier service | SECURE — `config.ts:41-46` exits on missing |
| **Verdict** | **PASS** |

### 1.2 HS256 Algorithm Pinning
| Check | Result |
|-------|--------|
| jwtAuth.ts | `algorithms: ['HS256']` at line 194 |
| adminSessionService.ts | `algorithms: ['HS256']` at lines 208, 238, 275 |
| testAuth.ts | `algorithms: ['HS256']` at lines 187, 254 |
| jwtService.ts | `algorithms: ['HS256']` at lines 179-181, 244-246 |
| supplierAuth.ts | `algorithms: ['HS256']` at line 55 |
| retailerPortal.ts | `algorithms: ['HS256']` at line 102 |
| **Verdict** | **PASS** — ALL `jwt.verify()` calls pin to HS256 only |

### 1.3 Issuer Enforcement
| Service | Issuer | Enforcement |
|---------|--------|-------------|
| Gateway | `supermandi-auth` | jwtAuth.ts:193 |
| Admin | `supermandi-admin` | adminSessionService.ts:207,274 |
| Auth service | `config.jwt.issuer` | jwtService.ts:180,245 |
| **Verdict** | **PASS** |

### 1.4 Auth Rate Limiting
| Endpoint | Limit | Implementation |
|----------|-------|----------------|
| General API | 30 req/min | rateLimiter.ts:82 |
| Auth endpoints | 5 req/min | rateLimiter.ts:112-118 |
| Admin endpoints | 5 req/min | rateLimiter.ts:135-155 |
| **Verdict** | **PASS** |

---

## 2. Store Isolation

### 2.1 Database-Level RLS
| Check | Result |
|-------|--------|
| Tables with RLS ENABLED | 27 (migration 149) + 8 gap (161) + 27 remaining (164) = **62 total** |
| FORCE RLS | All 62 tables — owner bypass disabled |
| Function | `rls_store_check(uuid)` + TEXT overload |
| Admin bypass | Empty/NULL `app.current_store_id` → all rows visible |
| **Verdict** | **PASS** |

### 2.2 Application-Level Enforcement
| Check | Result |
|-------|--------|
| Session variable set | `SET LOCAL app.current_store_id = $1` in `backend/src/db/client.ts:100-103` |
| Store ID source | JWT token (never client-sent) |
| WHERE clauses | Present on all store-scoped queries |
| **Verdict** | **PASS** — defense-in-depth (app + DB) |

---

## 3. Payment/Refund APIs

### 3.1 Idempotency Key Enforcement
| Check | Result |
|-------|--------|
| Header | `X-Idempotency-Key` in `backend/packages/common/src/idempotency/middleware.ts:155` |
| Request hash | SHA256 of request body |
| Cache TTL | 24 hours |
| Concurrent prevention | Locks during processing |
| Retry on failure | Allowed (clears failed cache) |
| **Verdict** | **PASS** |

---

## 4. POS Enrollment

### 4.1 Exponential Backoff Retry
| Check | Result |
|-------|--------|
| File | `src/screens/EnrollDeviceScreen.tsx:281-302` |
| Max retries | 3 |
| Base delay | 1000ms |
| Backoff | `1000 * 2^attempt` (1s → 2s → 4s) |
| Transient detection | Network errors, timeouts, 5xx |
| Device fingerprint | Idempotent retries via payload |
| **Verdict** | **PASS** |

---

## 5. WhatsApp CTA Config

### 5.1 Public Endpoint
| Check | Result |
|-------|--------|
| Route | `GET /api/v1/public/whatsapp-cta-config` |
| File | `backend/src/routes/v1/publicConfig.ts:1-45` |
| Auth required | NO (public) |
| Fail-safe | Returns `{ enabled: false }` on DB errors |
| Migration | 167 creates `platform.whatsapp_cta_config` table |
| **Verdict** | **PASS** |

---

## 6. CSRF Protection

### 6.1 Middleware
| Check | Result |
|-------|--------|
| File | `backend/services/api-gateway/src/middleware/csrfProtection.ts` |
| Methods covered | POST, PUT, PATCH, DELETE |
| Validation | `X-Requested-With: XMLHttpRequest` OR `Content-Type: application/json` |
| Exempt paths | Health checks, webhooks |
| Error code | 403 CSRF_VALIDATION_FAILED |
| **Verdict** | **PASS** |

---

## 7. Rate Limiting

### 7.1 Redis-Backed Distributed
| Check | Result |
|-------|--------|
| File | `backend/services/api-gateway/src/middleware/rateLimiter.ts` |
| Backend | Redis (distributed) |
| Fallback | In-memory when Redis unavailable |
| Env-tunable | Yes (config.rateLimitMax) |
| **Verdict** | **PASS** |

---

## 8. Force Update (iOS)

### 8.1 App Store URL Handling
| Check | Result |
|-------|--------|
| File | `src/screens/ForceUpdateScreen.tsx:34` |
| Env var | `EXPO_PUBLIC_APP_STORE_URL` |
| Fallback | "Coming soon" alert if missing |
| Warning | Console.warn at module load |
| Platform detection | `Platform.OS` check |
| **Verdict** | **PASS** |

---

## 9. Cross-Matrix Flows

### 9.1 Retailer ↔ Supplier
| Flow | Contract | Status |
|------|----------|--------|
| Purchase order creation | Order placed by retailer → visible in supplier portal | Code verified: `orders.purchase_orders` with store_id + supplier_id |
| Order status updates | Supplier updates status → SSE push to retailer | Code verified: SSE in supplier-portal orders page |
| Product catalog sync | Supplier products → retailer store_products mapping | Code verified: catalog-service mapping routes |

### 9.2 Retailer ↔ POS
| Flow | Contract | Status |
|------|----------|--------|
| Device enrollment | Retailer generates code → POS enrolls | Code verified: enrollApi + EnrollDeviceScreen |
| Sale sync | POS creates sale → syncs to retailer backend | Code verified: offlineQueue.ts + sync routes |
| Stock sync | Backend stock → POS local stock | Code verified: inventoryApi.ts |

### 9.3 POS ↔ Superadmin
| Flow | Contract | Status |
|------|----------|--------|
| Device management | Superadmin views/revokes devices | Code verified: DevicesTab.tsx |
| Store monitoring | Superadmin views store health | Code verified: MonitoringTab.tsx |

### 9.4 Supplier ↔ Superadmin
| Flow | Contract | Status |
|------|----------|--------|
| Application approval | Supplier applies → Superadmin approves | Code verified: ApplicationsTab.tsx |
| KYC verification | Supplier uploads → Superadmin reviews | Code verified: supplier-portal KYC page |

---

## Summary

| # | Contract | Status |
|---|----------|--------|
| 1 | JWT Secret (no fallback) | **PASS** |
| 2 | HS256 Algorithm Pinning | **PASS** |
| 3 | JWT Issuer Enforcement | **PASS** |
| 4 | Auth Rate Limiting | **PASS** |
| 5 | Store Isolation (RLS + WHERE) | **PASS** |
| 6 | Payment Idempotency | **PASS** |
| 7 | POS Enrollment Retry | **PASS** |
| 8 | WhatsApp CTA Public Endpoint | **PASS** |
| 9 | CSRF Protection | **PASS** |
| 10 | Rate Limiting (Redis) | **PASS** |
| 11 | Force Update (iOS) | **PASS** |
| 12 | Cross-Matrix Flows | **PASS** |

**OVERALL VERDICT: ALL 12 CONTRACTS VERIFIED — 0 CRITICAL GAPS**
