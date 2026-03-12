# MEGA-RC Deployment Playbook
# SuperMandi POS — Production-Grade Staging Deploy + POS APK Build

> **Canonical authority**: This file is the single source of truth for the MEGA-RC deploy sequence.
> Machine state version at creation: v252 | HEAD: f1c4a3be | Date: 2026-03-12

---

## CONTEXT: What is MEGA-RC?

All code from SA-GOLIVE (17 tickets) + SA-DEFERRED (8 tickets) + Phase-11 hardening (67) +
SCALE Audit (18 tickets) + REG-SCALE-B1-E2 + BLK-LANDING-PORT deploys as ONE combined release
candidate. No individual batch tags at deploy time — one MEGA-RC tag on HEAD after all gates pass.

**Deployed SHA vs HEAD drift (as of 2026-03-12):**
- Staging deployed: `58228705` (api-gw/backend/retailer/superadmin), `261dfc00` (supplier/landing)
- Current HEAD: `f1c4a3be`
- Pending migrations on staging DB: 180, 181, 182

---

## PRE-CONDITIONS (verify before starting)

```powershell
# In VS Code terminal (PowerShell):
cd C:\supermandi-pos
git log --oneline -3          # Must show f1c4a3be as HEAD
git status                     # Must be clean
node scripts/enforce-artifact-phase-lock.js --mode=deploy  # Must say [PASS]
```

Expected:
- HEAD: `f1c4a3be` — state(POST-SLEEP-AUDIT)
- Working tree: clean
- Artifact lock: [PASS] Artifact phase allowed

---

## PHASE A: MEGA-RC GATE RUN (Claude-owned, run locally)

### A1. TypeScript — all 4 platforms

```powershell
# Backend
cd C:\supermandi-pos\backend
pnpm install --frozen-lockfile
pnpm run typecheck
# Expected: 0 errors

# Retailer Admin
cd C:\supermandi-pos\retailer-admin
pnpm install --frozen-lockfile
pnpm run typecheck
# Expected: 0 errors (pre-existing 17 test-file errors are non-blocking — confirm same count)

# Superadmin
cd C:\supermandi-pos\supermandi-superadmin
pnpm install --frozen-lockfile
pnpm run typecheck
# Expected: 0 errors

# Supplier Portal
cd C:\supermandi-pos\supplier-portal
pnpm install --frozen-lockfile
pnpm run typecheck
# Expected: 0 errors

# POS app
cd C:\supermandi-pos
npx tsc --noEmit
# Expected: 0 errors
```

### A2. Unit + Integration Tests — all 4 platforms

```powershell
# Backend (requires Postgres — skip if no local DB; CI covers this)
cd C:\supermandi-pos\backend
pnpm test --passWithNoTests

# Retailer Admin
cd C:\supermandi-pos\retailer-admin
pnpm test --run
# Expected: 5196+ tests, 0 failures

# Superadmin
cd C:\supermandi-pos\supermandi-superadmin
pnpm test --run

# Supplier Portal
cd C:\supermandi-pos\supplier-portal
pnpm test --passWithNoTests

# POS App
cd C:\supermandi-pos
npx jest --passWithNoTests
```

### A3. Lint

```powershell
cd C:\supermandi-pos\retailer-admin && pnpm run lint
cd C:\supermandi-pos\supermandi-superadmin && pnpm run lint
cd C:\supermandi-pos\supplier-portal && pnpm run lint
cd C:\supermandi-pos\backend && pnpm run lint
```

### A4. Docker Build Parity (verify images build locally before CI)

```powershell
# Must have Docker Desktop running
cd C:\supermandi-pos

# Test backend image
docker build -f backend/services/api-gateway/Dockerfile -t test-api-gw backend/ --no-cache
docker build -f backend/Dockerfile -t test-backend backend/ --no-cache

# Test frontend images
docker build -f retailer-admin/Dockerfile -t test-retailer retailer-admin/
docker build -f supermandi-superadmin/Dockerfile -t test-superadmin supermandi-superadmin/
docker build -f supplier-portal/Dockerfile -t test-supplier supplier-portal/
docker build -f supermandi-landing/Dockerfile -t test-landing supermandi-landing/
```

**Gate: ALL builds must succeed. Any failure = fix before CI push.**

---

## PHASE B: OPERATOR E2E GATE (HL-002 mandatory — before CI push)

> Per HL-002: Claude provides this script → operator runs → pastes results → Claude fixes any issues.
> Do NOT push to CI until operator pastes clean E2E results.

### B1. Operator E2E Script (paste into VS Code PowerShell terminal)

```powershell
# ============================================================
# MEGA-RC Operator E2E Gate — Run before CI push
# Takes ~5 minutes. Paste all output back to Claude.
# ============================================================

$BASE = "https://staging.supermandi.tech"
$errors = @()

Write-Host "`n=== MEGA-RC OPERATOR E2E GATE ===" -ForegroundColor Cyan
Write-Host "BASE: $BASE"
Write-Host "SHA on staging: 58228705 (will update after MEGA-RC deploy)"
Write-Host ""

# --- 1. Landing page ---
Write-Host "[1] Landing page..." -NoNewline
$r = Invoke-WebRequest -Uri "$BASE/" -UseBasicParsing -TimeoutSec 10 -ErrorAction SilentlyContinue
if ($r.StatusCode -eq 200) { Write-Host "OK ($($r.StatusCode))" -ForegroundColor Green }
else { Write-Host "FAIL ($($r.StatusCode))" -ForegroundColor Red; $errors += "Landing: $($r.StatusCode)" }

# --- 2. API health ---
Write-Host "[2] API health..." -NoNewline
$r = Invoke-WebRequest -Uri "$BASE/api/v1/health" -UseBasicParsing -TimeoutSec 10 -ErrorAction SilentlyContinue
if ($r.StatusCode -eq 200) { Write-Host "OK ($($r.StatusCode))" -ForegroundColor Green }
else { Write-Host "FAIL ($($r.StatusCode))" -ForegroundColor Red; $errors += "API health: $($r.StatusCode)" }

# --- 3. Retailer portal ---
Write-Host "[3] Retailer portal /retailer/..." -NoNewline
$r = Invoke-WebRequest -Uri "$BASE/retailer/" -UseBasicParsing -TimeoutSec 10 -ErrorAction SilentlyContinue
if ($r.StatusCode -eq 200) { Write-Host "OK ($($r.StatusCode))" -ForegroundColor Green }
else { Write-Host "FAIL ($($r.StatusCode))" -ForegroundColor Red; $errors += "Retailer: $($r.StatusCode)" }

# --- 4. Supplier portal ---
Write-Host "[4] Supplier portal /supplier/..." -NoNewline
$r = Invoke-WebRequest -Uri "$BASE/supplier/" -UseBasicParsing -TimeoutSec 10 -ErrorAction SilentlyContinue
if ($r.StatusCode -eq 200) { Write-Host "OK ($($r.StatusCode))" -ForegroundColor Green }
else { Write-Host "FAIL ($($r.StatusCode))" -ForegroundColor Red; $errors += "Supplier: $($r.StatusCode)" }

# --- 5. Superadmin portal ---
Write-Host "[5] Superadmin portal /admin/..." -NoNewline
$r = Invoke-WebRequest -Uri "$BASE/admin/" -UseBasicParsing -TimeoutSec 10 -ErrorAction SilentlyContinue
if ($r.StatusCode -eq 200) { Write-Host "OK ($($r.StatusCode))" -ForegroundColor Green }
else { Write-Host "FAIL ($($r.StatusCode))" -ForegroundColor Red; $errors += "Superadmin: $($r.StatusCode)" }

# --- 6. Auth endpoint ---
Write-Host "[6] Auth login endpoint (POST)..." -NoNewline
$body = '{"phone":"invalid","password":"invalid"}' | ConvertFrom-Json | ConvertTo-Json
$r = Invoke-WebRequest -Uri "$BASE/api/v1/auth/login" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing -TimeoutSec 10 -ErrorAction SilentlyContinue
if ($r.StatusCode -in @(200,400,401,422)) { Write-Host "OK (reachable, $($r.StatusCode))" -ForegroundColor Green }
else { Write-Host "FAIL ($($r.StatusCode))" -ForegroundColor Red; $errors += "Auth: $($r.StatusCode)" }

# --- 7. Security headers ---
Write-Host "[7] Security headers on landing..." -NoNewline
$r = Invoke-WebRequest -Uri "$BASE/" -UseBasicParsing -TimeoutSec 10 -ErrorAction SilentlyContinue
$hasHSTS = $r.Headers["Strict-Transport-Security"] -ne $null
$hasXFO = $r.Headers["X-Frame-Options"] -ne $null
if ($hasHSTS -and $hasXFO) { Write-Host "OK (HSTS + X-Frame-Options present)" -ForegroundColor Green }
else { Write-Host "WARN (HSTS=$hasHSTS, XFO=$hasXFO)" -ForegroundColor Yellow }

# --- Summary ---
Write-Host ""
if ($errors.Count -eq 0) {
  Write-Host "=== E2E GATE: PASSED — 0 errors ===" -ForegroundColor Green
} else {
  Write-Host "=== E2E GATE: FAILED — $($errors.Count) error(s) ===" -ForegroundColor Red
  $errors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
}
Write-Host ""
Write-Host "Paste this full output back to Claude before pushing to CI."
```

---

## PHASE C: CI PUSH + CD PIPELINE (automated after E2E clean)

### C1. Push triggers CI

```bash
# CI fires automatically on push to main (already at HEAD f1c4a3be)
# If you need to re-trigger without a new commit:
git commit --allow-empty -m "chore(MEGA-RC): trigger CI gate run" && git push origin main
```

### C2. CI Gates (ci-gates.yml) — must all pass green

| Gate | What it checks | Expected |
|---|---|---|
| TypeScript | All 4 platforms + backend | 0 errors |
| ESLint | Lint warning budget | Under threshold |
| Unit tests | Retailer/Superadmin/Supplier/POS | 0 failures |
| Integration tests | Backend (Postgres) | 0 failures |
| Artifact phase lock | enforce-artifact-phase-lock.js | [PASS] |

### C3. CD Pipeline (deploy.yml) — fires after CI green

Auto-runs these jobs in order:
1. `gate` — verifies CI passed, extracts SHA
2. `build-push` — builds 6 Docker images, pushes to Artifact Registry
3. `pre-deploy-safety` — Cloud SQL backup + migration check
4. `deploy` — Cloud Run update for all 6 services
5. `smoke-test` — hits `/api/v1/health` + portal URLs

**Monitor at**: `gh run list --workflow=deploy.yml --limit=5`

---

## PHASE D: POST-DEPLOY — MIGRATION EXECUTION (operator-owned)

> CRITICAL: Migrations 180, 181, 182 are NOT auto-applied on container start.
> Must be run manually with Cloud SQL Proxy running.

### D1. Start Cloud SQL Proxy

```powershell
# In a separate terminal — leave running
cd C:\supermandi-pos
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\supermandi-pos\sa-key.json"
.\cloud-sql-proxy.exe supermandi-backend:asia-south1:supermandi-staging --port=15432
```

### D2. Migration Dry-Run (preview)

```powershell
cd C:\supermandi-pos\backend
$env:DATABASE_URL = "postgresql://postgres:<password>@127.0.0.1:15432/supermandi"
node scripts/migrate-prod.js --dry-run
# Review output: must show migrations 180, 181, 182 as PENDING
```

### D3. Execute Migrations

```powershell
node scripts/migrate-prod.js
# Expected: migrations 180, 181, 182 applied, exit 0
```

### D4. Verify Schema

```sql
-- Via mcp__staging-db__query (Cloud SQL Proxy must be running):
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = 'catalog'
AND column_name IN ('manufacturer_name','net_content_value','net_content_unit','batch_number')
ORDER BY table_name, column_name;
-- Expected: products has manufacturer_name, net_content_value, net_content_unit
--           store_products has batch_number
```

---

## PHASE E: POST-DEPLOY E2E GATE ON STAGING (operator pastes results)

After deploy completes and migrations run, Claude provides a staging-specific E2E script.
Operator runs it, pastes results. Claude fixes any issues.

This is the **second** E2E gate (first was pre-CI, this is post-deploy).
Both must be clean before MEGA-RC is declared.

---

## PHASE F: POS APK BUILD (production-grade)

### F1. Pre-flight Checks

```powershell
cd C:\supermandi-pos

# 1. Verify backend URL baked into APK
node -p "require('./app.json').expo.extra.API_URL"
# Expected: https://staging.supermandi.tech

# 2. Verify HEAD is MEGA-RC commit
git log --oneline -1
# Expected: latest commit with all code

# 3. Verify artifact phase unlocked
node scripts/enforce-artifact-phase-lock.js --mode=apk
# Expected: [PASS] Artifact phase allowed for mode=apk

# 4. Delete stale Gradle bundle (MANDATORY)
Remove-Item -Force "android\app\build\generated\assets\createBundleReleaseJsAndAssets\index.android.bundle" -ErrorAction SilentlyContinue
Write-Host "Stale bundle cleared"

# 5. Run apk:check
npm run apk:check
# Expected: APK READINESS CHECK PASSED
```

### F2. Build APK

> **On Windows**: `gradlew.bat` must be invoked from cmd.exe or Git Bash, NOT PowerShell directly.

```cmd
:: Option A — from cmd.exe (recommended on Windows)
cd C:\supermandi-pos\android
gradlew.bat assembleRelease

:: Option B — from Git Bash
cd /c/supermandi-pos/android
./gradlew assembleRelease

:: Option C — via build script (handles prebuild + Gradle)
cd C:\supermandi-pos
cmd /c "cd android && gradlew.bat assembleRelease"
```

**Expected output:**
```
BUILD SUCCESSFUL in Xm Xs
```

**APK location:** `android/app/build/outputs/apk/release/app-release.apk`

### F3. Verify APK

```powershell
# Check APK exists and is non-trivial size (>20MB)
$apk = "android\app\build\outputs\apk\release\app-release.apk"
$size = (Get-Item $apk).Length / 1MB
Write-Host "APK size: $([math]::Round($size,1)) MB"
# Expected: 20–80 MB

# Verify APK contents
# (aapt must be in PATH — found in Android SDK build-tools)
# aapt dump badging $apk | Select-String "package|versionCode|versionName"
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
2. Login screen loads
3. Login with staff: Raju Manager at store SU260305-003
4. Sell screen loads — scan a barcode
5. SellTile shows: image, brand, GST%, net content (these are new SCALE fields)
6. Add to cart → cart total calculates
7. Complete sale → stock decrements

**This is the FIX-001 runtime verify** — checks SCALE tile fields render at runtime.

---

## PHASE G: EVIDENCE COLLECTION + MEGA-RC TAG

### G1. Evidence Required per Batch

Each batch must have TESTED + EVIDENCED status. Evidence triplet: UI proof + API proof + DB proof.

| Batch | Evidence needed |
|---|---|
| SA-GOLIVE | Auth flow screenshot + JWT decode + user table row |
| SA-DEFERRED | Feature-specific API response + DB state |
| Phase-11 hardening | Security scan results + test run output |
| SCALE (A-E) | SellTile screenshot (image+GST+netcontent) + SQL result |
| BLK-LANDING-PORT | Landing 200 OK + Cloud Run revision showing port 8080 |

### G2. Tag MEGA-RC

```bash
# After ALL gates pass, ALL E2E clean, ALL portals operator-verified:
MEGA_RC_SHA=$(git rev-parse HEAD)
MEGA_RC_TAG="MEGA-RC-2026-03-12_$(date +%H%M)IST"

git tag "$MEGA_RC_TAG" "$MEGA_RC_SHA"
git push origin "$MEGA_RC_TAG"

echo "MEGA-RC tagged: $MEGA_RC_TAG on $MEGA_RC_SHA"
```

### G3. Update Machine State

After MEGA-RC tag:
```bash
# Claude updates CLAUDE_CURRENT_STATE.json:
# - megaRcTag: "<tag>"
# - megaRcSha: "<sha>"
# - stagingDeployedSHA: "<sha>"
# - status: "MEGA_RC_TAGGED"
# - version: bump
```

---

## PHASE H: PROMOTE TO PRODUCTION (after operator sign-off)

> Only after: MEGA-RC tagged + staging E2E clean + all portals operator-browser-tested.

```bash
# Production promote is MANUAL — never automated
cd C:\supermandi-pos
bash scripts/promote-to-prod.sh --sha $MEGA_RC_SHA --confirm
```

**This promotes all 6 Cloud Run services from staging traffic to production.**
After promote: switch to Mode B (staging/production deploy mode).

---

## GIT DISCIPLINE FOR MEGA-RC FLOW

Per CLAUDE.md rules (Mode A):

| Action | Rule |
|---|---|
| Gate run fixes | `fix(MEGA-RC): <desc>` on main directly (state-only changes) |
| Code fixes found during E2E | New branch `fix/<TICKET-ID>-<slug>` → PR → squash-merge → tag |
| MEGA-RC tag | `MEGA-RC-YYYY-MM-DD_HHMMiST` on SHA after all gates pass |
| Post-deploy state update | `state(MEGA-RC): deployed to staging, bump vXXX` direct to main |
| Any regression found | `reg/<REG-ID>-<slug>` branch → PR → tag, then re-run full E2E |

**HL-001**: If a fix is needed during E2E gate, it gets its own ticket ID + branch + PR + tag.
**HL-002**: Operator must paste E2E results before EVERY CI push — no exceptions.

---

## KNOWN RISKS + MITIGATIONS

| Risk | Mitigation |
|---|---|
| Migration 180-182 break staging DB | Cloud SQL backup BEFORE migrate (pre-deploy-safety job does this) |
| BullMQ (SCALE-D3) needs Redis | Memorystore READY at 10.107.71.27:6379 — connected via VPC connector |
| SCALE-E1 image upload needs GCS bucket | `GCS_IMAGES_BUCKET` env var must be set in main-backend Cloud Run config |
| Landing latest revision failing (old rev serving) | BLK-LANDING-PORT fix in HEAD — new deploy will fix revision |
| POS APK gradlew.bat not in PowerShell PATH | Use cmd.exe or Git Bash for Gradle commands |
| Stale Gradle bundle bakes old JS | Always delete bundle before build (step F1.4) |

---

## QUICK REFERENCE: Current State (2026-03-12)

```
HEAD:                f1c4a3be
Machine state:       v252
Staging deployed:    58228705 / 261dfc00 (2026-03-08 — 4 days drift)
Artifact lock:       UNLOCKED (artifactPhaseEligible=true)
All journeys:        70/70 PARK-READY
Pending migrations:  180, 181, 182
Test device:         TG8HCYTGGQT885OF
Test store:          SU260305-003 (SuperMandi Test Store)
API URL in APK:      https://staging.supermandi.tech
GCP project:         supermandi-backend (asia-south1)
AR repo:             asia-south1-docker.pkg.dev/supermandi-backend/supermandi/
```
