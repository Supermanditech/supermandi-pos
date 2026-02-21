# Live Testing Report — 2026-02-21

## Test Context

- **Deploy Run**: https://github.com/Supermanditech/supermandi-pos/actions/runs/22247035315
- **HEAD SHA**: eee590d
- **Staging URL**: https://staging.supermandi.tech
- **Test Window**: 2026-02-21 01:10 - 01:50 UTC
- **12 Smoke Gates**: ALL PASS
- **CORS Verified**: staging.supermandi.tech only
- **Ingress Verified**: internal-and-cloud-load-balancing on all 6 services

## Cloud Run Revision IDs

| Service | Revision |
|---------|----------|
| api-gateway | api-gateway-00054-lxt |
| main-backend | main-backend-00071-654 |
| retailer-admin | retailer-admin-00056-msv |
| supplier-portal | supplier-portal-00051-2vb |
| superadmin | superadmin-00049-ff6 |
| landing | landing-00049-jld |

---

## Surface-by-Surface Results

### 1. Retailer Web (31 routes)

| Category | Count | Status |
|----------|-------|--------|
| Public routes (/retailer/*) | 7 | PASS (200) |
| Store-scoped routes (/s/*) | 24 | FAIL (404) |

**Details:**
- `/retailer` → 302 → `/retailer/` (correct redirect)
- `/retailer/` → 200, 576 bytes (SPA shell)
- `/retailer/login` → 200 (SPA fallback, same as base)
- All 7 public routes serve the SPA shell correctly
- **ALL 24 `/s/{storeCode}/*` routes → 404 from nginx/1.29.5 (landing service)**
  - Root cause: GCP URL map missing `/s/*` path rule
  - Ticket: **LIVE.URLMAP.STORE_ROUTES.001** (P0)

**Security Headers:** X-Frame-Options: DENY, X-Content-Type-Options: nosniff, HSTS, Referrer-Policy, CSP (with Firebase domains) — ALL PRESENT
**Cache-Control:** MISSING (ticket LIVE.SECURITY.CACHE_HEADERS.001, P3)
**SPA Assets:** JS and CSS load correctly (200)
**Favicon:** 200 (SVG)

### 2. Supplier Web (19 routes)

| Category | Count | Status |
|----------|-------|--------|
| All routes | 19 | PASS (200) |

**Details:**
- All 19 SSR routes return 200 with proper HTML
- Login page renders full HTML with form elements (13,774 bytes)
- Next.js chunk loading confirmed (`_next/static/chunks/`)
- Build stamp shows correct SHA: eee590d
- Footer shows: "Build: eee590d · Deployed: 21/2/2026 6:26:55 am"

**Security Headers:** All present (DENY, nosniff, HSTS, Referrer-Policy, CSP)
**Cache-Control:** `s-maxage=31536000` (set by Next.js)
**Favicon:** Path issue — HTML links to `/favicon.svg` instead of `/supplier/favicon.svg` (P3)

### 3. SuperAdmin Web (25 routes)

| Category | Count | Status |
|----------|-------|--------|
| Base route (/admin/) | 1 | PASS (200) |
| Hash routes (#stores, etc.) | 24 | N/A (client-side, not HTTP-testable) |

**Details:**
- `/admin/` → 200, 1,678 bytes (SPA shell)
- Hash routes (#stores, #suppliers, etc.) are client-side — only testable in browser
- SPA assets load correctly
- Title: "SuperMandi SuperAdmin"

**Security Headers:** All present
**Cache-Control:** MISSING (ticket LIVE.SECURITY.CACHE_HEADERS.001, P3)
**Favicon:** 200 (SVG)

### 4. Landing (4 routes)

| Route | Status | Size |
|-------|--------|------|
| / | 200 | 15,010 bytes |
| /pos | 200 | 7,220 bytes |
| /privacy | 200 | 5,200 bytes |
| /terms | 200 | 5,358 bytes |

**ALL PASS.** Static HTML pages render correctly with nav, footer, proper titles.
**Security Headers:** All present
**Cache-Control:** `no-cache` (correctly set)

### 5. POS API Contract (4 endpoints)

| Endpoint | Expected | Actual | Status |
|----------|----------|--------|--------|
| /api/v1/health | 200 | 200 `{"status":"ok"}` | PASS |
| /api/v1/version | 200 | 200 `{"sha":"eee590d",...}` | PASS |
| /api/v1/pos | 200 | 404 (base path, no handler) | INFO |
| /api/v1/auth | 200 | 404 (base path, no handler) | INFO |

**Notes:** `/api/v1/pos` and `/api/v1/auth` are base path prefixes, not actual endpoints. Specific sub-routes like `/api/v1/pos/enroll` and `/api/v1/auth/phone/exists` are the real endpoints.

### 6. Cross-Function Flows (4 flows)

| Flow | Entry URL | Portal Status | Auth API Status |
|------|-----------|---------------|-----------------|
| XFN-001 Retailer Auth | /retailer/login | PASS (200) | BLOCKED (main-backend 404) |
| XFN-002 Supplier Auth | /supplier/login/ | PASS (200) | BLOCKED (main-backend 404) |
| XFN-003 SuperAdmin Tabs | /admin/ | PASS (200) | PASS (401 auth required) |
| XFN-004 POS API | /api/v1/health | PASS (200) | PASS (version: eee590d) |

**Critical Finding:** Retailer and supplier auth flows are BLOCKED because main-backend is returning 404 for proxied auth endpoints. Admin auth check works because it's handled locally by the api-gateway.

---

## Micro-Tickets Created

| Ticket ID | Severity | Surface | Title |
|-----------|----------|---------|-------|
| LIVE.URLMAP.STORE_ROUTES.001 | P0 | shared | URL map missing /s/* → retailer-backend (24 routes 404) |
| LIVE.BACKEND.PROXY_404.001 | P0 | backend | Main-backend 404 for proxied public auth/POS endpoints |
| LIVE.BACKEND.CONN_TIMEOUT.001 | P1 | backend | Main-backend connection timeout errors at startup |
| LIVE.BACKEND.POS_HEALTH.001 | P2 | backend | No /api/v1/pos/health endpoint |
| LIVE.SECURITY.CACHE_HEADERS.001 | P3 | shared | Missing Cache-Control on retailer/superadmin |
| LIVE.RETAILER.SPA_SHELL.001 | P3 | retailer_web | SPA shell 576 bytes — needs browser verification |
| LIVE.SUPPLIER.FAVICON_PATH.001 | P3 | supplier_web | Favicon path missing /supplier/ prefix |

---

## Summary Scorecard

| Surface | Routes | PASS | FAIL | BLOCKED |
|---------|--------|------|------|---------|
| Retailer Web | 31 | 7 | 24 | 0 |
| Supplier Web | 19 | 19 | 0 | 0 |
| SuperAdmin Web | 25 | 1 | 0 | 24 (browser-only) |
| Landing | 4 | 4 | 0 | 0 |
| POS API | 4 | 2 | 0 | 2 (expected) |
| Cross-Function | 4 | 2 | 2 | 0 |
| **TOTAL** | **87** | **35** | **26** | **26** |

## Critical Blockers (Must Fix Before Go-Live)

1. **P0: URL map /s/* gap** — 77% of retailer routes broken
2. **P0: Main-backend proxy 404** — Authentication endpoints unreachable, no portal login possible
3. **P1: Connection timeouts** — Backend stability concern

## Claude Execution Required (Staging)

1. **Add `/s` and `/s/*` to GCP URL map** pointing to retailer-backend (capture before/after URL map evidence)
2. **Investigate and remediate main-backend instance behavior** — apply min-instances/runtime fixes and prove auth endpoints recover
3. **Resolve startup connection timeout errors** with logs before/after
4. **Run browser or automation validation for SuperAdmin hash routes and Retailer SPA rendering**, then attach evidence
5. **Operator scope after Claude execution**: final cross-device verification/signoff only

## Update — Additional CI Evidence (2026-02-21)

- Source: `C:\WINDOWS\TEMP\claude\c--supermandi-pos\tasks\bef2fd8.output`
- Staging Smoke Test run `64363816838`: Gates 1-12 all PASS.
- Interpretation: positive signal, but treated as transient evidence only for runtime P0/P1 tickets until repeated stability criteria are satisfied.
