# MEGA-RC Deployment Playbook v2
# SuperMandi POS — Production-Grade Staging Deploy + POS APK Build

> **Canonical authority**: This file is the single source of truth for the MEGA-RC deploy sequence.
> Updated: 2026-03-12 | HEAD: fc8226f8 | Machine state: v257

---

## CONTEXT: What is MEGA-RC?

All code from SA-GOLIVE (17) + SA-DEFERRED (8) + Phase-11 (67) + SCALE (18) +
REG-SCALE-B1-E2 + BLK-LANDING-PORT + AUD-001..017 + PRE-F-001..007 + PRE-NI-001 +
SEC-001..012 (security hardening) deploys as ONE combined release candidate.

**Deployed SHA vs HEAD drift:**
- Staging deployed: `58228705` (api-gw/backend/retailer/superadmin), `261dfc00` (supplier/landing)
- Current HEAD: `fc8226f8` (92+ commits ahead of staging)
- Pending migrations on staging DB: 180, 181, 182, 183, 184, 185, 186, 187 (8 total)

---

## SERVICE PORT MAP (must match Cloud Run `--port` flag)

| Service | Container Port | Cloud Run Port | Path Prefix |
|---------|---------------|----------------|-------------|
| api-gateway | 3000 | 3000 | `/api/v1/*`, `/health` |
| main-backend | 3010 | 3010 | (proxied by api-gateway) |
| retailer-admin | 8080 (nginx) | 8080 | `/retailer/` |
| superadmin | 8080 (nginx) | 8080 | `/admin/` |
| supplier-portal | 8080 (Next.js) | 8080 | `/supplier/` |
| landing | 8080 (nginx) | 8080 | `/` |

**Cloud LB URL Map** (staging.supermandi.tech → 34.54.26.145):
```
/                     → landing (Cloud Run)
/retailer/*           → retailer-admin (Cloud Run)
/supplier/*           → supplier-portal (Cloud Run)
/admin/*              → superadmin (Cloud Run)
/api/*                → api-gateway (Cloud Run)
```

---

## PRE-CONDITIONS (verify before starting)

```powershell
# In VS Code terminal (PowerShell):
cd C:\supermandi-pos
git log --oneline -3          # Must show fc8226f8 as HEAD
git status                     # Must be clean (no uncommitted changes)
git stash list                 # Must be empty
git branch                     # Must be on main, no other local branches
node scripts/enforce-artifact-phase-lock.js --mode=deploy  # Must say [PASS]
```

Expected:
- HEAD: `fc8226f8` — fix(SEC-010): align authToken tests
- Working tree: clean
- Stash: empty
- Branch: main only
- Artifact lock: [PASS]

---

## PHASE A: LOCAL GATE RUN (Claude-owned — UNBREAKABLE)

> **Rule**: ALL gates must pass GREEN. ANY failure = fix before proceeding.
> No skipping, no "will fix later", no partial passes.

### GATE A1: TypeScript — all 5 platforms (ZERO errors)

| Platform | Command | Expected |
|----------|---------|----------|
| API Gateway | `npx tsc --noEmit -p backend/services/api-gateway/tsconfig.json` | 0 errors |
| Auth Service | `npx tsc --noEmit -p backend/services/auth-service/tsconfig.json` | 0 errors |
| Main Backend | `npx tsc --noEmit -p backend/tsconfig.json` | 0 errors |
| Retailer Admin | `cd retailer-admin && npx tsc --noEmit` | 0 errors |
| SuperAdmin | `cd supermandi-superadmin && npx tsc --noEmit` | 0 errors |
| Supplier Portal | `cd supplier-portal && npx tsc --noEmit` | 0 errors |
| POS App | `npx tsc --noEmit` | 0 errors |

**GATE VERDICT**: 7/7 must be 0 errors. Even 1 error = BLOCKED.

### GATE A2: Unit + Integration Tests — all 5 platforms (ZERO failures)

| Platform | Command | Min Tests |
|----------|---------|-----------|
| POS (Jest) | `npx jest --passWithNoTests --forceExit` | 1017+ |
| Backend (Jest) | `cd backend && npx jest --passWithNoTests --forceExit` | 1338+ |
| Retailer (Vitest) | `cd retailer-admin && npx vitest run` | 1671+ |
| SuperAdmin (Vitest) | `cd supermandi-superadmin && npx vitest run` | 2236+ |
| Supplier (Jest) | `cd supplier-portal && npx jest --passWithNoTests --forceExit` | 825+ |

**GATE VERDICT**: 5/5 must have 0 failures, 5087+ tests total. Even 1 failure = BLOCKED.

### GATE A3: Frontend Production Builds (all 4 portals must produce output)

```powershell
cd C:\supermandi-pos

# Retailer (Vite → dist/index.html)
cd retailer-admin && VITE_API_BASE_URL="" npx vite build && ls dist/index.html
# Expected: dist/index.html exists

# SuperAdmin (Vite → dist/index.html)
cd ../supermandi-superadmin && VITE_API_BASE_URL="" npx vite build && ls dist/index.html
# Expected: dist/index.html exists

# Supplier (Next.js → .next/)
cd ../supplier-portal && NEXT_PUBLIC_API_BASE_URL="" npx next build && ls .next/
# Expected: .next/ directory exists

# Landing (static — no build needed, verify files)
ls ../supermandi-landing/index.html ../supermandi-landing/nginx.conf
# Expected: both exist
```

**GATE VERDICT**: 4/4 builds must succeed. Missing output = BLOCKED.

### GATE A4: Docker Build Parity (all 6 images must build)

```powershell
# Must have Docker Desktop running
cd C:\supermandi-pos

# Backend (2 images)
docker build -f backend/services/api-gateway/Dockerfile -t test-api-gw backend/ --no-cache
docker build -f backend/Dockerfile.main -t test-backend backend/ --no-cache

# Frontends (4 images)
docker build -f retailer-admin/Dockerfile -t test-retailer retailer-admin/
docker build -f supermandi-superadmin/Dockerfile -t test-superadmin supermandi-superadmin/
docker build -f supplier-portal/Dockerfile -t test-supplier supplier-portal/
docker build -f supermandi-landing/Dockerfile -t test-landing supermandi-landing/
```

**GATE VERDICT**: 6/6 Docker builds must succeed. Any build failure = BLOCKED.

### GATE A5: Port & URL Verification (infrastructure correctness)

```powershell
# 1. Verify all frontends listen on port 8080
grep -n "listen 8080" retailer-admin/nginx-local-prod.conf
grep -n "listen 8080" supermandi-superadmin/nginx-local-prod.conf
grep -n "listen 8080" supermandi-landing/nginx.conf
grep -n "PORT=8080" supplier-portal/Dockerfile
# All must show port 8080

# 2. Verify all frontends EXPOSE 8080
grep -n "EXPOSE 8080" retailer-admin/Dockerfile supermandi-superadmin/Dockerfile supplier-portal/Dockerfile supermandi-landing/Dockerfile
# All 4 must show EXPOSE 8080

# 3. Verify backend ports
grep -n "PORT=3000" backend/services/api-gateway/Dockerfile   # API gateway
grep -n "PORT=3010" backend/Dockerfile.main                    # Main backend

# 4. Verify POS API URL points to staging
node -p "require('./app.json').expo.extra.API_URL"
# Expected: https://staging.supermandi.tech

# 5. Verify frontend base paths in nginx
grep "location.*retailer" retailer-admin/nginx-local-prod.conf    # /retailer/
grep "location.*admin" supermandi-superadmin/nginx-local-prod.conf # /admin/
grep "basePath.*supplier" supplier-portal/next.config.js 2>/dev/null || grep "basePath.*supplier" supplier-portal/next.config.ts 2>/dev/null || grep "basePath.*supplier" supplier-portal/next.config.mjs 2>/dev/null
# Expected: each portal serves from its path prefix

# 6. Verify no hardcoded domains in frontend env
grep -r "supermandi.tech" retailer-admin/.env* supermandi-superadmin/.env* supplier-portal/.env* 2>/dev/null | grep -v ".production" | grep -v ".example"
# Expected: no matches (only .env.production may have Firebase config)
```

**GATE VERDICT**: All 6 checks must pass. Any port/URL mismatch = BLOCKED.

### GATE A6: Migration Sequence Integrity

```powershell
cd C:\supermandi-pos\backend\migrations
ls *.sql | Sort-Object

# Verify:
# 1. Continuous numbering (no gaps except documented: 115, 116, 117, 158 are intentional placeholders)
# 2. Last migration is 187_sale_items_batch_number.sql
# 3. No duplicate numbers
# 4. Each migration file is non-empty
```

**GATE VERDICT**: Continuous sequence 001-187 (with documented gaps), no duplicates, no empty files.

---

## PHASE B: OPERATOR E2E GATE (HL-002 mandatory — before CI push)

> Per HL-002: Claude provides this script → operator runs → pastes results → Claude fixes any issues.
> Do NOT push to CI until operator pastes clean E2E results.

### B1. Pre-Deploy E2E Script (paste into VS Code PowerShell terminal)

```powershell
# ============================================================
# MEGA-RC Operator E2E Gate — Run BEFORE CI push
# Verifies staging infrastructure is reachable.
# Takes ~2 minutes. Paste ALL output back to Claude.
# ============================================================

$BASE = "https://staging.supermandi.tech"
$errors = @()
$warnings = @()

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  MEGA-RC OPERATOR E2E GATE" -ForegroundColor Cyan
Write-Host "  BASE: $BASE" -ForegroundColor Cyan
Write-Host "  DATE: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# --- 1. Landing page ---
Write-Host "[1/10] Landing page (/)..." -NoNewline
try {
  $r = Invoke-WebRequest -Uri "$BASE/" -UseBasicParsing -TimeoutSec 15
  if ($r.StatusCode -eq 200) { Write-Host " OK ($($r.StatusCode))" -ForegroundColor Green }
  else { Write-Host " FAIL ($($r.StatusCode))" -ForegroundColor Red; $errors += "Landing: $($r.StatusCode)" }
} catch { Write-Host " FAIL (unreachable: $($_.Exception.Message))" -ForegroundColor Red; $errors += "Landing: unreachable" }

# --- 2. API health ---
Write-Host "[2/10] API health (/api/v1/health)..." -NoNewline
try {
  $r = Invoke-WebRequest -Uri "$BASE/api/v1/health" -UseBasicParsing -TimeoutSec 15
  if ($r.StatusCode -eq 200) { Write-Host " OK ($($r.StatusCode))" -ForegroundColor Green }
  else { Write-Host " FAIL ($($r.StatusCode))" -ForegroundColor Red; $errors += "API health: $($r.StatusCode)" }
} catch { Write-Host " FAIL (unreachable: $($_.Exception.Message))" -ForegroundColor Red; $errors += "API health: unreachable" }

# --- 3. Retailer portal ---
Write-Host "[3/10] Retailer portal (/retailer/)..." -NoNewline
try {
  $r = Invoke-WebRequest -Uri "$BASE/retailer/" -UseBasicParsing -TimeoutSec 15
  if ($r.StatusCode -eq 200) { Write-Host " OK ($($r.StatusCode))" -ForegroundColor Green }
  else { Write-Host " FAIL ($($r.StatusCode))" -ForegroundColor Red; $errors += "Retailer: $($r.StatusCode)" }
} catch { Write-Host " FAIL (unreachable)" -ForegroundColor Red; $errors += "Retailer: unreachable" }

# --- 4. Supplier portal ---
Write-Host "[4/10] Supplier portal (/supplier/)..." -NoNewline
try {
  $r = Invoke-WebRequest -Uri "$BASE/supplier/" -UseBasicParsing -TimeoutSec 15
  if ($r.StatusCode -eq 200) { Write-Host " OK ($($r.StatusCode))" -ForegroundColor Green }
  else { Write-Host " FAIL ($($r.StatusCode))" -ForegroundColor Red; $errors += "Supplier: $($r.StatusCode)" }
} catch { Write-Host " FAIL (unreachable)" -ForegroundColor Red; $errors += "Supplier: unreachable" }

# --- 5. Superadmin portal ---
Write-Host "[5/10] Superadmin portal (/admin/)..." -NoNewline
try {
  $r = Invoke-WebRequest -Uri "$BASE/admin/" -UseBasicParsing -TimeoutSec 15
  if ($r.StatusCode -eq 200) { Write-Host " OK ($($r.StatusCode))" -ForegroundColor Green }
  else { Write-Host " FAIL ($($r.StatusCode))" -ForegroundColor Red; $errors += "Superadmin: $($r.StatusCode)" }
} catch { Write-Host " FAIL (unreachable)" -ForegroundColor Red; $errors += "Superadmin: unreachable" }

# --- 6. Auth endpoint reachable ---
Write-Host "[6/10] Auth login endpoint (POST)..." -NoNewline
try {
  $body = '{"phone":"invalid","password":"invalid"}'
  $r = Invoke-WebRequest -Uri "$BASE/api/v1/auth/login" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
  Write-Host " OK (reachable, $($r.StatusCode))" -ForegroundColor Green
} catch {
  $code = $_.Exception.Response.StatusCode.Value__
  if ($code -in @(400,401,403,422,429)) {
    Write-Host " OK (reachable, $code — expected rejection)" -ForegroundColor Green
  } else {
    Write-Host " FAIL ($code)" -ForegroundColor Red; $errors += "Auth: $code"
  }
}

# --- 7. Security headers ---
Write-Host "[7/10] Security headers on landing..." -NoNewline
try {
  $r = Invoke-WebRequest -Uri "$BASE/" -UseBasicParsing -TimeoutSec 10
  $hasHSTS = $null -ne $r.Headers["Strict-Transport-Security"]
  $hasXFO = $null -ne $r.Headers["X-Frame-Options"]
  $hasCSP = $null -ne $r.Headers["Content-Security-Policy"]
  if ($hasHSTS -and $hasXFO) { Write-Host " OK (HSTS=$hasHSTS, XFO=$hasXFO, CSP=$hasCSP)" -ForegroundColor Green }
  else { Write-Host " WARN (HSTS=$hasHSTS, XFO=$hasXFO, CSP=$hasCSP)" -ForegroundColor Yellow; $warnings += "Security headers incomplete" }
} catch { Write-Host " SKIP (landing unreachable)" -ForegroundColor Yellow }

# --- 8. Retailer admin auth page loads JS ---
Write-Host "[8/10] Retailer portal loads JS bundle..." -NoNewline
try {
  $r = Invoke-WebRequest -Uri "$BASE/retailer/" -UseBasicParsing -TimeoutSec 15
  $hasScript = $r.Content -match '<script'
  if ($hasScript) { Write-Host " OK (JS bundle found)" -ForegroundColor Green }
  else { Write-Host " WARN (no script tag)" -ForegroundColor Yellow; $warnings += "Retailer: no JS bundle" }
} catch { Write-Host " SKIP" -ForegroundColor Yellow }

# --- 9. SuperAdmin portal loads JS ---
Write-Host "[9/10] Superadmin portal loads JS bundle..." -NoNewline
try {
  $r = Invoke-WebRequest -Uri "$BASE/admin/" -UseBasicParsing -TimeoutSec 15
  $hasScript = $r.Content -match '<script'
  if ($hasScript) { Write-Host " OK (JS bundle found)" -ForegroundColor Green }
  else { Write-Host " WARN (no script tag)" -ForegroundColor Yellow; $warnings += "Superadmin: no JS bundle" }
} catch { Write-Host " SKIP" -ForegroundColor Yellow }

# --- 10. DNS resolution ---
Write-Host "[10/10] DNS resolution for staging.supermandi.tech..." -NoNewline
try {
  $dns = Resolve-DnsName "staging.supermandi.tech" -ErrorAction Stop
  $ip = ($dns | Where-Object { $_.QueryType -eq 'A' }).IPAddress
  if ($ip -eq "34.54.26.145") { Write-Host " OK (A=$ip)" -ForegroundColor Green }
  else { Write-Host " WARN (A=$ip, expected 34.54.26.145)" -ForegroundColor Yellow; $warnings += "DNS mismatch: $ip" }
} catch { Write-Host " FAIL (DNS resolution failed)" -ForegroundColor Red; $errors += "DNS: resolution failed" }

# --- Summary ---
Write-Host "`n========================================" -ForegroundColor Cyan
if ($errors.Count -eq 0) {
  Write-Host "  E2E GATE: PASSED ($($warnings.Count) warning(s))" -ForegroundColor Green
} else {
  Write-Host "  E2E GATE: FAILED — $($errors.Count) error(s)" -ForegroundColor Red
  $errors | ForEach-Object { Write-Host "  ERROR: $_" -ForegroundColor Red }
}
if ($warnings.Count -gt 0) {
  $warnings | ForEach-Object { Write-Host "  WARN: $_" -ForegroundColor Yellow }
}
Write-Host "========================================`n" -ForegroundColor Cyan
Write-Host "Paste this FULL output back to Claude before pushing to CI." -ForegroundColor White
```

---

## PHASE C: CI PUSH + CD PIPELINE (automated after E2E clean)

### C1. Trigger CI

```bash
# CI fires automatically on push to main.
# HEAD is already at fc8226f8. To trigger without a new commit:
git commit --allow-empty -m "chore(MEGA-RC): trigger CI gate run" && git push origin main
```

### C2. CI Gates (ci-gates.yml) — 20 jobs, ALL must pass

| # | Job | What it checks | Blocking? |
|---|-----|---------------|-----------|
| 1 | TypeScript Check | All 4 portals + backend | YES |
| 2 | ESLint Check | Lint + warning budget | YES |
| 3 | Unit & Integration Tests | All platforms + Postgres + Redis | YES |
| 4 | Tier 3: Full-Stack Integration | API Gateway + Backend + E2E suites | YES |
| 5 | Build & Verify Portals | retailer/superadmin/supplier build output | YES |
| 6 | Local Smoke Test | Serve built portals, HTTP 200 check | YES |
| 7 | Git & Ticket Discipline | Branch naming, commit format | YES |
| 8 | Security Audit | Secrets scan, auth patterns | YES |
| 9 | ZRP-M: Security Deep Scan | OWASP checks, input validation | YES |
| 10 | Migration Safety | Sequential numbering, no destructive ops | YES |
| 11 | Config Parity & Build Quality | Env var consistency, bundle size, Dockerfile lint | YES |
| 12 | License & Coverage | Dependency licenses, coverage floor | YES |
| 13 | DB Safety & Auth Hardening | SQL injection patterns, auth bypasses | YES |
| 14 | Scalability & Observability | N+1 queries, logging patterns | YES |
| 15 | Routing Validation | URL map consistency | YES |
| 16 | Code Quality: Semgrep SAST | Static analysis for security/correctness | YES |
| 17 | Secret Scanning: Gitleaks | Credential leak detection | YES |
| 18 | API Contract Tests | Response shape validation | YES |
| 19 | Portal Unit Tests | Coverage reports | YES |
| 20 | Workflow Governance Guard | Machine state consistency | YES |
| **21** | **All Gates Passed** | **Aggregates all 20 jobs** | **FINAL** |

**GATE VERDICT**: Job #21 "All Gates Passed" must be GREEN. If RED = deployment BLOCKED.

**Monitor**: `gh run list --workflow="ci-gates.yml" --limit=5`

### C3. CD Pipeline (deploy.yml) — fires after CI green

Auto-runs these jobs in sequence:
1. `gate` — verifies CI passed, extracts SHA, enforces artifact phase lock
2. `build-push` — builds 6 Docker images, pushes to Artifact Registry
3. `pre-deploy-safety` — Cloud SQL backup + migration count check
4. `deploy` — Cloud Run update for all 6 services with correct `--port` flags
5. `smoke-test` — hits health endpoints + portal URLs on staging

**Monitor**: `gh run list --workflow=deploy.yml --limit=5`

---

## PHASE D: POST-DEPLOY — MIGRATION EXECUTION (operator-owned)

> CRITICAL: Migrations 180-187 are NOT auto-applied on container start.
> Must be run manually with Cloud SQL Proxy running.

### D1. Start Cloud SQL Proxy

```powershell
# In a SEPARATE terminal — leave running
cd C:\supermandi-pos
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\supermandi-pos\sa-key.json"
.\cloud-sql-proxy.exe supermandi-backend:asia-south1:supermandi-staging --port=15432
```

### D2. Migration Dry-Run (preview)

```powershell
cd C:\supermandi-pos\backend
$env:DATABASE_URL = "postgresql://postgres:<password>@127.0.0.1:15432/supermandi"
node scripts/migrate-prod.js --dry-run
# Review output: must show migrations 180-187 as PENDING (8 migrations)
```

### D3. Execute Migrations

```powershell
node scripts/migrate-prod.js
# Expected: migrations 180-187 applied, exit 0
```

### D4. Verify Schema (all 8 migrations applied)

```sql
-- Via mcp__staging-db__query (Cloud SQL Proxy must be running):

-- Check SCALE-A1/A2/A3 columns
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = 'catalog'
AND column_name IN ('manufacturer_name','net_content_value','net_content_unit','batch_number')
ORDER BY table_name, column_name;
-- Expected: products has manufacturer_name, net_content_value, net_content_unit
--           store_products has batch_number

-- Check migration 187 (sale_items batch_number)
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'orders' AND table_name = 'sale_items' AND column_name = 'batch_number';
-- Expected: 1 row

-- Check migration log
SELECT id, name, applied_at FROM migrations.migration_log
WHERE id >= 180 ORDER BY id;
-- Expected: 8 rows (180-187)
```

---

## PHASE E: POST-DEPLOY E2E GATE ON STAGING (operator pastes results)

After deploy completes and migrations run, re-run the Phase B script.
This time the SHA on staging should match HEAD.

Additionally verify:
1. Open each portal in browser (not just curl):
   - `https://staging.supermandi.tech/` — landing loads
   - `https://staging.supermandi.tech/retailer/` — login page loads
   - `https://staging.supermandi.tech/supplier/` — login page loads
   - `https://staging.supermandi.tech/admin/` — OTP login page loads
2. Check browser console for JS errors (F12 → Console)
3. Verify no CORS errors on API calls
4. Verify images/assets load (no broken images)

**GATE VERDICT**: All 4 portals render correctly in browser, no JS errors, no CORS. Any failure = fix + re-deploy.

---

## PHASE F: POS APK BUILD (production-grade)

> **Device**: Test phone connected via USB to laptop.
> **Build tool**: Local Gradle only (NOT EAS cloud — takes 2 hours on free tier).
> **Shell**: cmd.exe or Git Bash (NOT PowerShell — gradlew.bat path issues).

### F1. Pre-flight Checks

```powershell
cd C:\supermandi-pos

# 1. Verify backend URL baked into APK
node -p "require('./app.json').expo.extra.API_URL"
# Expected: https://staging.supermandi.tech

# 2. Verify HEAD is MEGA-RC commit
git log --oneline -1
# Expected: fc8226f8 (or later MEGA-RC tag commit)

# 3. Verify artifact phase unlocked
node scripts/enforce-artifact-phase-lock.js --mode=apk
# Expected: [PASS] Artifact phase allowed for mode=apk

# 4. Delete stale Gradle bundle (MANDATORY — prevents baking old JS)
Remove-Item -Force "android\app\build\generated\assets\createBundleReleaseJsAndAssets\index.android.bundle" -ErrorAction SilentlyContinue
Write-Host "Stale bundle cleared"

# 5. Run apk:check
npm run apk:check
# Expected: APK READINESS CHECK PASSED
```

### F2. Build APK

```cmd
:: MUST use cmd.exe or Git Bash (NOT PowerShell)
cd C:\supermandi-pos\android
gradlew.bat assembleRelease
```

**Expected**: `BUILD SUCCESSFUL in Xm Xs`
**APK location**: `android/app/build/outputs/apk/release/app-release.apk`

### F3. Verify APK

```powershell
$apk = "android\app\build\outputs\apk\release\app-release.apk"
$size = (Get-Item $apk).Length / 1MB
Write-Host "APK size: $([math]::Round($size,1)) MB"
# Expected: 20–80 MB (if <5MB = broken build)
```

### F4. Install on Test Device

```powershell
# Verify device connected
adb devices
# Expected: TG8HCYTGGQT885OF  device

# Install (replace existing)
adb -s TG8HCYTGGQT885OF install -r android\app\build\outputs\apk\release\app-release.apk
# Expected: Success

# Launch app
adb -s TG8HCYTGGQT885OF shell am start -n "com.supermandi.pos/.MainActivity"
```

### F5. On-Device Smoke Test (operator)

After install, manually verify on device:
1. App opens without crash
2. Login screen loads (device enrollment / staff selection)
3. Login with staff: Raju Manager at store SU260305-003
4. Sell screen loads — scan a barcode
5. SellTile shows: image, brand, GST%, net content (SCALE fields)
6. Add to cart → cart total calculates
7. Complete sale → stock decrements
8. Check offline mode: toggle airplane mode, app stays functional

**GATE VERDICT**: All 8 checks pass on physical device. Any crash/blank screen = fix + rebuild.

---

## PHASE G: EVIDENCE COLLECTION + MEGA-RC TAG

### G1. Evidence Required per Batch

| Batch | Evidence |
|-------|----------|
| SA-GOLIVE | Auth flow screenshot + JWT decode + user table row |
| SA-DEFERRED | Feature-specific API response + DB state |
| Phase-11 | Security scan results + CI gate output |
| SCALE (A-E) | SellTile screenshot (image+GST+netcontent) + SQL |
| SEC-001..012 | CI security gate output + auth flow test |
| BLK-LANDING-PORT | Landing 200 OK + Cloud Run revision port 8080 |

### G2. Tag MEGA-RC

```bash
# After ALL gates pass, ALL E2E clean, ALL portals operator-verified:
MEGA_RC_SHA=$(git rev-parse HEAD)
MEGA_RC_TAG="MEGA-RC-2026-03-12_$(date +%H%M)IST"

git tag "$MEGA_RC_TAG" "$MEGA_RC_SHA"
git push origin "$MEGA_RC_TAG"

echo "MEGA-RC tagged: $MEGA_RC_TAG on $MEGA_RC_SHA"
```

---

## PHASE H: PROMOTE TO PRODUCTION (after operator sign-off)

> Only after: MEGA-RC tagged + staging E2E clean + all portals operator-browser-tested + POS APK verified on device.

```bash
# Production promote is MANUAL — never automated
cd C:\supermandi-pos
bash scripts/promote-to-prod.sh --sha $MEGA_RC_SHA --confirm
```

**This promotes all 6 Cloud Run services from staging to production traffic.**
After promote: switch to Mode B (staging/production deploy mode).

---

## GIT DISCIPLINE FOR MEGA-RC FLOW

| Action | Rule |
|--------|------|
| Gate run fixes | New branch `fix/<ID>-<slug>` → PR → squash-merge → tag |
| MEGA-RC tag | `MEGA-RC-YYYY-MM-DD_HHMMiST` on SHA after all gates pass |
| Post-deploy state | `state(MEGA-RC): deployed` direct to main |
| Any regression | `reg/<REG-ID>-<slug>` branch → PR → tag, re-run ALL gates |

**HL-001**: Every fix gets its own ticket + branch + PR + tag. No exceptions.
**HL-002**: Operator must paste E2E results before EVERY CI push. No exceptions.

---

## KNOWN RISKS + MITIGATIONS

| Risk | Mitigation |
|------|------------|
| Migrations 180-187 break staging DB | Cloud SQL backup BEFORE migrate (pre-deploy-safety job) |
| BullMQ (SCALE-D3) needs Redis | Memorystore at 10.107.71.27:6379 via VPC connector |
| SCALE-E1 image upload needs GCS | `GCS_IMAGES_BUCKET` env var in main-backend config |
| SEC-002/009 need Redis for blacklist | Same Memorystore instance, `supermandi:token_blacklist:` prefix |
| SEC-010 HttpOnly cookies need HTTPS | Staging uses HTTPS via Cloud LB (managed cert) |
| POS APK gradlew not in PowerShell PATH | Use cmd.exe or Git Bash (documented in F2) |
| Stale Gradle bundle bakes old JS | Always delete bundle before build (step F1.4) |
| Frontend API calls get CORS error | API gateway CORS middleware allows staging.supermandi.tech origin |

---

## GATE SUMMARY CHECKLIST (operator sign-off)

Before approving GCP deployment, ALL must be checked:

- [ ] **A1**: TypeScript — 7/7 platforms pass (0 errors each)
- [ ] **A2**: Tests — 5/5 platforms pass (5087+ tests, 0 failures)
- [ ] **A3**: Frontend builds — 4/4 portals produce output
- [ ] **A4**: Docker builds — 6/6 images build successfully
- [ ] **A5**: Port/URL verification — all ports correct, no hardcoded domains
- [ ] **A6**: Migration sequence — 001-187 continuous, no gaps
- [ ] **B1**: Pre-deploy E2E — 10/10 checks pass on staging infra
- [ ] **C2**: CI gates — 20/20 jobs GREEN (job #21 "All Gates Passed")
- [ ] **C3**: CD pipeline — 5/5 jobs GREEN (build-push + deploy + smoke)
- [ ] **D4**: Migrations — 180-187 applied, schema verified
- [ ] **E**: Post-deploy browser test — 4 portals render, no JS errors
- [ ] **F5**: POS APK — 8/8 on-device checks pass
- [ ] **G2**: MEGA-RC tag pushed

**Total gates**: 13 checkpoints. ALL must be GREEN. Any RED = deployment BLOCKED.

---

## QUICK REFERENCE

```
HEAD:                fc8226f8
Machine state:       v257
Staging deployed:    58228705 / 261dfc00 (2026-03-09 — stale)
Artifact lock:       UNLOCKED
All journeys:        70/70 PARK-READY
All tests:           5087+ (POS=1017, Backend=1338, Retailer=1671, SA=2236, Supplier=825)
Pending migrations:  180-187 (8 total)
Test device:         TG8HCYTGGQT885OF (USB to laptop)
Test store:          SU260305-003 (SuperMandi Test Store)
API URL in APK:      https://staging.supermandi.tech
GCP project:         supermandi-backend (asia-south1)
AR repo:             asia-south1-docker.pkg.dev/supermandi-backend/supermandi/
Cloud LB IP:         34.54.26.145
DNS:                 staging.supermandi.tech → 34.54.26.145
Port map:            frontends=8080, api-gw=3000, backend=3010
```
