# POST-BATCH-017: Browser Surface Fix Pack (Local-Prod)

**Date:** 2026-02-06
**Base SHA:** `5766bee` (POST-BATCH-016 Black-Box Readiness Audit)
**Scope:** Fix 3 browser-testing blockers for real-user black-box testing
**Risk:** Local-prod config only (no source code changes, no API behavior changes)

---

## Fixes Applied

### Fix 1 — Retailer Admin + SuperAdmin: Nginx Subpath Asset Routing

**Problem:** Vite `base: '/retailer/'` and `base: '/admin/'` generate HTML referencing
`/retailer/assets/...` and `/admin/assets/...`, but files sit at `/assets/` inside the
Docker image. Nginx `try_files` fallback returned `index.html` (text/html) instead of JS,
causing white screen.

**Root cause:** Original `nginx.conf` had no subpath awareness — served everything from `/`.

**Fix:** Created `nginx-local-prod.conf` for each portal:
- `retailer-admin/nginx-local-prod.conf` — handles `/retailer/` prefix with rewrite
- `supermandi-superadmin/nginx-local-prod.conf` — handles `/admin/` prefix with rewrite
- Mounted via docker-compose volumes (no image rebuild needed)
- Preserves `/health.txt` at root for Docker healthcheck
- Immutable cache headers on `/retailer/assets/` and `/admin/assets/`

**Before → After:**

| Test | Before | After |
|------|--------|-------|
| `GET /retailer/assets/index-m3ywxFnb.js` | 200 text/html 781B (index.html fallback) | 200 application/javascript 400604B |
| `GET /admin/assets/index-BoWKaY02.js` | 200 text/html 1190B (index.html fallback) | 200 application/javascript 332474B |
| `GET /retailer/assets/index-DELMYs5H.css` | 200 text/html (broken) | 200 text/css 5694B |
| `GET /retailer/login` (deep-link) | N/A (white screen) | 200 text/html (SPA fallback) |
| `GET /admin/stores` (deep-link) | N/A (white screen) | 200 text/html (SPA fallback) |
| `GET /` (bare root) | N/A | 302 → /retailer/ or /admin/ |
| `GET /health.txt` (healthcheck) | 200 | 200 (unchanged) |

### Fix 2 — Supplier Portal: API Gateway URL Baked Into Build

**Problem:** Supplier portal was built with empty `NEXT_PUBLIC_API_BASE_URL`, causing
`fetch('')` → relative paths → API calls hit Next.js server (port 8082) → 404.

**Root cause:** No `args:` block in docker-compose for supplier-portal build.

**Fix:** Added `NEXT_PUBLIC_API_BASE_URL: "http://localhost:8080"` as build arg in
`docker-compose.local-prod.yml`. Supplier portal rebuilt from source.

**Before → After:**

| Test | Before | After |
|------|--------|-------|
| API URL in JS chunks | empty string (`''`) | `http://localhost:8080` |
| `GET /supplier/login/` | 200 (page loads) | 200 (page loads) |
| API calls from browser | → localhost:8082/api/... → 404 | → localhost:8080/api/... → gateway |

### Fix 3 — POS App: LAN Gateway URL for Expo Go

**Problem:** Root `.env` had `EXPO_PUBLIC_API_URL=http://localhost:3000` — unreachable
from physical Redmi phone.

**Fix:** Updated to `EXPO_PUBLIC_API_URL=http://192.168.31.64:8080` (LAN IP + gateway port).

**Before → After:**

| Setting | Before | After |
|---------|--------|-------|
| `EXPO_PUBLIC_API_URL` | `http://localhost:3000` | `http://192.168.31.64:8080` |

**Note:** LAN IP (`192.168.31.64`) may change if DHCP assigns a new address. Run `ipconfig`
to verify.

---

## Files Changed

| File | Change Type | Purpose |
|------|-------------|---------|
| `retailer-admin/nginx-local-prod.conf` | NEW | Subpath-aware nginx for `/retailer/` |
| `supermandi-superadmin/nginx-local-prod.conf` | NEW | Subpath-aware nginx for `/admin/` |
| `scripts/docker-compose.local-prod.yml` | MODIFIED | Volume mounts + supplier build-arg |
| `.env` | MODIFIED | POS API URL → LAN gateway |

---

## Container Health (Post-Fix)

```
17/17 containers healthy
- scripts-retailer-admin-1       Up (healthy)  0.0.0.0:8081->80
- scripts-supplier-portal-1      Up (healthy)  0.0.0.0:8082->3001
- scripts-superadmin-1           Up (healthy)  0.0.0.0:8083->80
- scripts-api-gateway-1          Up (healthy)  0.0.0.0:8080->3000
- scripts-main-backend-1         Up (healthy)  0.0.0.0:3010->3010
- (12 more services all healthy)
```

---

## Browser Test URLs (for operator)

| Portal | URL | Expected |
|--------|-----|----------|
| Retailer Admin | http://localhost:8081/retailer/ | Login page loads, JS executes |
| Supplier Portal | http://localhost:8082/supplier/ | Redirect to login, JS executes |
| SuperAdmin | http://localhost:8083/admin/ | Login page loads, JS executes |
| Landing | http://localhost:8084/ | Landing page loads |
| POS (Expo Go) | `.\tools\dev\redmi.ps1` | App loads, connects to 192.168.31.64:8080 |

---

## POS Startup Instructions

```powershell
# Terminal 1: Docker stack already running (17/17 healthy)
# Terminal 2: Start Expo dev server for Redmi
.\tools\dev\redmi.ps1
# On Redmi: Open Expo Go → Enter URL shown by script
```

---

## Reversibility

All changes are config-only and fully reversible:
- Remove volume mounts from docker-compose → original nginx.conf takes effect
- Remove `args:` block from supplier-portal → empty API URL (as before)
- Revert `.env` → `EXPO_PUBLIC_API_URL=http://localhost:3000`
