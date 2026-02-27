# Operator Deploy Runbook — Staging Mega-Batch

> Generated: 2026-02-27
> Locked SHA: `e63dba14` (tag: `deploy-ready-mega-batch-2026-02-27`)
> CI Run: `22492611893` (20/20 green)
> Status: **BLOCKED-ON-OPERATOR** — awaiting Blocks 1-3 execution

---

## Quick Reference

| Field | Value |
|-------|-------|
| Target SHA | `e63dba14` |
| Deploy tag | `deploy-ready-mega-batch-2026-02-27` |
| CI run (green) | `22492611893` |
| Tickets in scope | 982 undeployed (1252 total) |
| Migrations | 27 new (141-167), auto-run on container startup |
| Services | 6: main-backend, api-gateway, retailer-admin, supplier-portal, superadmin, landing |
| Deploy order | main-backend → api-gateway → portals (parallel) — enforced by CD pipeline |
| Migration 149 (critical) | RLS on 27 tables — Cloud SQL backup MANDATORY before deploy |
| GCP project | `supermandi-backend` |
| GCP region | `asia-south1` |
| Staging URL | `https://staging.supermandi.tech` |
| Staging API URL | `https://staging-api.supermandi.tech` |

---

## How Migrations Work

Migrations are **NOT** a separate manual step. The `main-backend` container entrypoint (`backend/scripts/docker-entrypoint.sh`) automatically:
1. Waits for PostgreSQL readiness (30 retries, 2s interval)
2. Runs `node /app/scripts/migrate-prod.js up` (applies all pending migrations)
3. Starts the Node.js server

When the CD pipeline deploys `main-backend`, all 27 pending migrations (141-167) will auto-apply. Migration 149 (RLS on 27 tables) is the most critical.

**The dry-run in Block 2 is OPTIONAL but RECOMMENDED** — it lets you review what will be applied before triggering the deploy.

---

## Block 1: Cloud SQL Backup (MANDATORY)

> **Owner:** Operator
> **Status:** BLOCKED-ON-OPERATOR
> **Time:** 2-5 minutes
> **Why:** Migration 149 applies Row-Level Security to 27 tables. Backup is mandatory before this runs.

### Bash (Linux/macOS/WSL/Cloud Shell)

```bash
# Create pre-deploy backup
gcloud sql backups create \
  --instance=supermandi-staging \
  --project=supermandi-backend \
  --description="pre-mega-batch-deploy-$(date +%Y%m%d-%H%M%S)"

# Verify backup created
gcloud sql backups list \
  --instance=supermandi-staging \
  --project=supermandi-backend \
  --limit=1 \
  --format="table(id, status, startTime, description)"
```

### PowerShell (Windows)

```powershell
# Create pre-deploy backup
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
gcloud sql backups create `
  --instance=supermandi-staging `
  --project=supermandi-backend `
  --description="pre-mega-batch-deploy-$ts"

# Verify backup created
gcloud sql backups list `
  --instance=supermandi-staging `
  --project=supermandi-backend `
  --limit=1 `
  --format="table(id, status, startTime, description)"
```

### Expected Output

```
ID              STATUS      START_TIME                  DESCRIPTION
1234567890123   SUCCESSFUL  2026-02-27T...              pre-mega-batch-deploy-...
```

### Evidence to Paste Back

Copy the full `gcloud sql backups list` output showing:
- Backup ID
- Status = `SUCCESSFUL`
- Timestamp

**NOTE:** The CD pipeline (deploy.yml) also attempts a backup in the `pre-deploy-safety` job, but this may fail if the WIF service account lacks `roles/cloudsql.admin`. This manual backup is the reliable fallback.

---

## Block 2: Migration Dry-Run (OPTIONAL — Recommended)

> **Owner:** Operator
> **Status:** BLOCKED-ON-OPERATOR
> **Time:** 1-2 minutes
> **Why:** Review what 27 migrations will be auto-applied when main-backend starts.
> **Requires:** Cloud SQL Auth Proxy or direct DB access

### Bash

```bash
# Start Cloud SQL Auth Proxy (if not already running)
cloud-sql-proxy supermandi-backend:asia-south1:supermandi-staging &
sleep 3

# Set DATABASE_URL (replace <password> with actual postgres password)
export DATABASE_URL="postgresql://postgres:<password>@127.0.0.1:5432/supermandi"

# Dry-run — shows pending migrations, NO changes applied
node backend/scripts/migrate-prod.js dry-run
```

### PowerShell

```powershell
# Start Cloud SQL Auth Proxy (if not already running)
Start-Process -NoNewWindow cloud-sql-proxy "supermandi-backend:asia-south1:supermandi-staging"
Start-Sleep -Seconds 3

# Set DATABASE_URL (replace <password> with actual postgres password)
$env:DATABASE_URL = "postgresql://postgres:<password>@127.0.0.1:5432/supermandi"

# Dry-run — shows pending migrations, NO changes applied
node backend/scripts/migrate-prod.js dry-run
```

### Expected Output

```
[dry-run] === MIGRATION DRY RUN ===
[dry-run] Applied: 140 migration(s)
[dry-run] Pending: 27 migration(s)

[dry-run] The following migrations WOULD be applied:
  ○ 141_t144_batch_lot_expiry.sql (XX lines)
  ○ 142_t145_purchase_cart_drafts.sql (XX lines)
  ○ 143_t150_refunds.sql (XX lines)
  ○ 144_t177_stock_version.sql (XX lines)
  ○ 145_t191_daily_closings.sql (XX lines)
  ○ 146_t192_staff_shifts.sql (XX lines)
  ○ 147_t132_trgm_search_index.sql (XX lines)
  ○ 148_t202_store_bank_account.sql (XX lines)
  ○ 149_t216_row_level_security.sql (XX lines) ⚠ DESTRUCTIVE: DROP
  ○ 150_t236_t237_reorder_schema_unification.sql (XX lines)
  ○ 151_t250_pending_reorder_fulfilled_status.sql (XX lines)
  ○ 152_phase8_notifications_and_compliance.sql (XX lines)
  ○ 153_t258_payout_retry_queue.sql (XX lines)
  ○ 154_t263_credit_provider_abstraction.sql (XX lines)
  ○ 155_t291_chat_schema.sql (XX lines)
  ○ 156_t303_t316_ai_automation_schema.sql (XX lines)
  ○ 157_fix011_refresh_token_hash_index.sql (XX lines)
  ○ 159_whatsapp_message_log.sql (XX lines)
  ○ 160_pra080_concurrency_constraints.sql (XX lines)
  ○ 161_pra084_rls_gap_coverage.sql (XX lines)
  ○ 162_wave3_schema_integrity.sql (XX lines)
  ○ 163_wave3b_type_normalization.sql (XX lines)
  ○ 164_wave3b_full_rls_coverage.sql (XX lines)
  ○ 165_onboarding_schema_hardening.sql (XX lines)
  ○ 166_add_enrollment_code_hash.sql (XX lines)
  ○ 167_whatsapp_cta_config.sql (XX lines)

[dry-run] NO CHANGES WERE MADE. Use "up" to apply.
```

### Evidence to Paste Back

Copy the full dry-run output. Confirm:
- `Pending: 27 migration(s)`
- All 27 files listed (141-167)
- Any `⚠ DESTRUCTIVE` flags noted (migration 149 has DROP for recreating RLS function — safe, it's `CREATE OR REPLACE`)

---

## Block 3: GO_DEPLOY — Trigger CD Pipeline

> **Owner:** Operator
> **Status:** BLOCKED-ON-OPERATOR (requires Block 1 complete)
> **Time:** 15-25 minutes for full pipeline
> **What happens:** CD pipeline builds 6 Docker images, pushes to Artifact Registry, deploys all 6 services (strict order), runs 12-gate smoke tests, auto-rollbacks on failure

### Bash

```bash
# Trigger the CD pipeline on the locked SHA
gh workflow run "CD — Build & Deploy Staging" \
  --repo Supermanditech/supermandi-pos \
  --field sha=e63dba14229701fd78c9018b97b894caec27c2d1

# Wait 15 seconds, then find the run
sleep 15
gh run list \
  --repo Supermanditech/supermandi-pos \
  --workflow="CD — Build & Deploy Staging" \
  --limit=1

# Monitor the run (replace RUN_ID from output above)
gh run watch <RUN_ID> --repo Supermanditech/supermandi-pos
```

### PowerShell

```powershell
# Trigger the CD pipeline on the locked SHA
gh workflow run "CD — Build & Deploy Staging" `
  --repo Supermanditech/supermandi-pos `
  --field sha=e63dba14229701fd78c9018b97b894caec27c2d1

# Wait 15 seconds, then find the run
Start-Sleep -Seconds 15
gh run list `
  --repo Supermanditech/supermandi-pos `
  --workflow="CD — Build & Deploy Staging" `
  --limit=1

# Monitor the run (replace RUN_ID from output above)
gh run watch <RUN_ID> --repo Supermanditech/supermandi-pos
```

### What the Pipeline Does (Automated)

| Step | Job | What It Does |
|------|-----|--------------|
| 1 | `gate` | Verifies CI passed, extracts SHA + app version |
| 2 | `build-push` | Builds 6 Docker images, pushes to Artifact Registry |
| 3 | `pre-deploy-safety` | Cloud SQL backup (attempt), migration count, 9 secrets check, VPC connector check, Cloud SQL state check |
| 4 | `deploy-staging` | Deploys main-backend → api-gateway → 3 nginx portals → supplier-portal (strict order) |
| 5 | (in deploy) | Traffic routing verification — polls until all 6 services route to new revisions |
| 6 | (in deploy) | SHA verification — confirms serving revisions have correct GIT_SHA |
| 7 | `routing-verification` | Routing infrastructure validation |
| 8 | `smoke-test` | 12-gate staging smoke: health checks, portal status, SHA match, security headers, latency, canary endpoints |
| 9 | (on failure) | Auto-rollback to previous revisions + cleanup failed revisions |

### Expected Output

`gh run watch` should show:

```
✓ gate             in 15s
✓ build-push       in 8m
✓ pre-deploy-safety in 2m
✓ deploy-staging   in 12m
✓ routing-verification in 1m
✓ smoke-test       in 3m
```

All jobs green = deploy successful.

### Evidence to Paste Back

```bash
# Get full run summary
gh run view <RUN_ID> --repo Supermanditech/supermandi-pos

# Get detailed job logs if needed
gh run view <RUN_ID> --repo Supermanditech/supermandi-pos --log
```

Copy the `gh run view` output showing all jobs PASS.

---

## Block 4: Post-Deploy Evidence Capture

> **Owner:** Operator
> **Status:** BLOCKED-ON-OPERATOR (requires Block 3 success)
> **Time:** 5-10 minutes
> **Why:** Claude needs this evidence to execute Phase 8 verification

### Bash

```bash
echo "=== 4a. API Health ==="
curl -s https://staging-api.supermandi.tech/health

echo ""
echo "=== 4b. SHA Verification ==="
curl -s https://staging-api.supermandi.tech/health | grep -o '"gitSha":"[^"]*"'
# Expected: "gitSha":"e63dba14"

echo ""
echo "=== 4c. Portal Status Codes ==="
for portal in \
  "retailer-admin:https://staging.supermandi.tech/retailer/" \
  "supplier-portal:https://staging.supermandi.tech/supplier/" \
  "superadmin:https://staging.supermandi.tech/admin/" \
  "landing:https://staging.supermandi.tech/"; do
  NAME="${portal%%:*}"
  URL="${portal#*:}"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -L "$URL")
  echo "  $NAME: $STATUS"
done

echo ""
echo "=== 4d. Cloud Run Revisions ==="
for svc in main-backend api-gateway retailer-admin supplier-portal superadmin landing; do
  REV=$(gcloud run services describe "$svc" \
    --region=asia-south1 \
    --project=supermandi-backend \
    --format="value(status.traffic[0].revisionName)" 2>/dev/null)
  PCT=$(gcloud run services describe "$svc" \
    --region=asia-south1 \
    --project=supermandi-backend \
    --format="value(status.traffic[0].percent)" 2>/dev/null)
  echo "  $svc: $REV ($PCT%)"
done

echo ""
echo "=== 4e. Image Tags in Artifact Registry ==="
for img in main-backend api-gateway retailer-admin supplier-portal superadmin landing; do
  TAG=$(gcloud artifacts docker tags list \
    "asia-south1-docker.pkg.dev/supermandi-backend/supermandi/$img" \
    --filter="tag:e63dba14" \
    --format="value(tag)" \
    --limit=1 2>/dev/null)
  echo "  $img: ${TAG:-NOT_FOUND}"
done

echo ""
echo "=== 4f. Migration Status ==="
echo "(Run via Cloud SQL Proxy connection)"
echo "  psql \$DATABASE_URL -c \"SELECT count(*) as total FROM _migrations;\""
echo "  psql \$DATABASE_URL -c \"SELECT name, applied_at FROM _migrations ORDER BY id DESC LIMIT 5;\""
```

### PowerShell

```powershell
Write-Host "=== 4a. API Health ==="
(Invoke-WebRequest -Uri "https://staging-api.supermandi.tech/health" -UseBasicParsing).Content

Write-Host "`n=== 4b. SHA Verification ==="
$health = (Invoke-WebRequest -Uri "https://staging-api.supermandi.tech/health" -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "  gitSha: $($health.gitSha)"
Write-Host "  Match: $($health.gitSha -like 'e63dba14*')"

Write-Host "`n=== 4c. Portal Status Codes ==="
@(
  @{Name="retailer-admin"; Url="https://staging.supermandi.tech/retailer/"},
  @{Name="supplier-portal"; Url="https://staging.supermandi.tech/supplier/"},
  @{Name="superadmin"; Url="https://staging.supermandi.tech/admin/"},
  @{Name="landing"; Url="https://staging.supermandi.tech/"}
) | ForEach-Object {
  try {
    $r = Invoke-WebRequest -Uri $_.Url -UseBasicParsing -MaximumRedirection 5
    Write-Host "  $($_.Name): $($r.StatusCode)"
  } catch {
    Write-Host "  $($_.Name): FAILED ($($_.Exception.Message))"
  }
}

Write-Host "`n=== 4d. Cloud Run Revisions ==="
$services = @("main-backend","api-gateway","retailer-admin","supplier-portal","superadmin","landing")
foreach ($svc in $services) {
  $rev = gcloud run services describe $svc `
    --region=asia-south1 `
    --project=supermandi-backend `
    --format="value(status.traffic[0].revisionName)" 2>$null
  $pct = gcloud run services describe $svc `
    --region=asia-south1 `
    --project=supermandi-backend `
    --format="value(status.traffic[0].percent)" 2>$null
  Write-Host "  ${svc}: $rev ($pct%)"
}

Write-Host "`n=== 4e. Image Tags ==="
foreach ($img in $services) {
  $tag = gcloud artifacts docker tags list `
    "asia-south1-docker.pkg.dev/supermandi-backend/supermandi/$img" `
    --filter="tag:e63dba14" `
    --format="value(tag)" `
    --limit=1 2>$null
  Write-Host "  ${img}: $(if ($tag) { $tag } else { 'NOT_FOUND' })"
}
```

### Expected Output Summary

| Section | Pass Criteria |
|---------|---------------|
| 4a. Health | `{"status":"ok","service":"api-gateway","gitSha":"e63dba14..."}` |
| 4b. SHA | gitSha starts with `e63dba14` |
| 4c. Portals | All 4 return `200` |
| 4d. Revisions | 6 NEW revision names (different from rollback revisions below), all at `100%` |
| 4e. Images | All 6 tagged `e63dba14` |
| 4f. Migrations | 167 total applied, latest = `167_whatsapp_cta_config.sql` |

### Evidence to Paste Back

Copy the FULL output of all sections (4a-4f). Claude will parse this to execute Phase 8.

---

## Block 5: Rollback (EMERGENCY ONLY)

> **Use ONLY if Block 3 fails or Block 4 shows critical issues**
> **Order:** Reverse deploy order — portals → gateway → backend

### Rollback Revisions (Frozen Pre-Deploy)

| Service | Rollback Revision |
|---------|-------------------|
| main-backend | `main-backend-00103-zbw` |
| api-gateway | `api-gateway-00084-7zh` |
| retailer-admin | `retailer-admin-00084-pk6` |
| supplier-portal | `supplier-portal-00078-wv8` |
| superadmin | `superadmin-00077-r6c` |
| landing | `landing-00077-gj7` |

### Bash

```bash
# Rollback ALL services (reverse order: portals → gateway → backend)
gcloud run services update-traffic landing \
  --to-revisions=landing-00077-gj7=100 \
  --region=asia-south1 --project=supermandi-backend

gcloud run services update-traffic superadmin \
  --to-revisions=superadmin-00077-r6c=100 \
  --region=asia-south1 --project=supermandi-backend

gcloud run services update-traffic supplier-portal \
  --to-revisions=supplier-portal-00078-wv8=100 \
  --region=asia-south1 --project=supermandi-backend

gcloud run services update-traffic retailer-admin \
  --to-revisions=retailer-admin-00084-pk6=100 \
  --region=asia-south1 --project=supermandi-backend

gcloud run services update-traffic api-gateway \
  --to-revisions=api-gateway-00084-7zh=100 \
  --region=asia-south1 --project=supermandi-backend

gcloud run services update-traffic main-backend \
  --to-revisions=main-backend-00103-zbw=100 \
  --region=asia-south1 --project=supermandi-backend

# Verify rollback
echo "=== Rollback Verification ==="
for svc in main-backend api-gateway retailer-admin supplier-portal superadmin landing; do
  REV=$(gcloud run services describe "$svc" \
    --region=asia-south1 --project=supermandi-backend \
    --format="value(status.traffic[0].revisionName)")
  echo "  $svc: $REV"
done
```

### PowerShell

```powershell
# Rollback ALL services (reverse order)
$rollbacks = @(
  @{Svc="landing"; Rev="landing-00077-gj7"},
  @{Svc="superadmin"; Rev="superadmin-00077-r6c"},
  @{Svc="supplier-portal"; Rev="supplier-portal-00078-wv8"},
  @{Svc="retailer-admin"; Rev="retailer-admin-00084-pk6"},
  @{Svc="api-gateway"; Rev="api-gateway-00084-7zh"},
  @{Svc="main-backend"; Rev="main-backend-00103-zbw"}
)

foreach ($r in $rollbacks) {
  Write-Host "Rolling back $($r.Svc) to $($r.Rev)..."
  gcloud run services update-traffic $r.Svc `
    --to-revisions="$($r.Rev)=100" `
    --region=asia-south1 --project=supermandi-backend
}

# Verify
Write-Host "`n=== Rollback Verification ==="
foreach ($svc in @("main-backend","api-gateway","retailer-admin","supplier-portal","superadmin","landing")) {
  $rev = gcloud run services describe $svc `
    --region=asia-south1 --project=supermandi-backend `
    --format="value(status.traffic[0].revisionName)" 2>$null
  Write-Host "  ${svc}: $rev"
}
```

**NOTE:** The CD pipeline has built-in auto-rollback on smoke test failure (STAGE-007). Manual rollback is only needed if auto-rollback fails or if issues are discovered after the pipeline completes successfully.

---

## Block 6: Browser Testing Checklist (Post-Deploy)

> **Owner:** Operator
> **Time:** 15-20 minutes
> **When:** After Block 4 shows all PASS

Test each portal in a browser:

- [ ] **Retailer Admin** (`https://staging.supermandi.tech/retailer/`)
  - Login page loads
  - Dashboard renders after login
  - Products page shows data
  - Orders page shows data
  - Settings page loads

- [ ] **Supplier Portal** (`https://staging.supermandi.tech/supplier/`)
  - Login page loads
  - Dashboard renders after login
  - Orders page shows data
  - Products page shows data

- [ ] **SuperAdmin** (`https://staging.supermandi.tech/admin/`)
  - Login page loads
  - Stores tab shows data
  - Users tab shows data
  - Audit tab loads
  - AI Insights tab loads

- [ ] **Landing Page** (`https://staging.supermandi.tech/`)
  - Home page loads
  - All links work
  - WhatsApp CTA visible

- [ ] **POS App** (connect to staging API)
  - Connects to staging backend
  - Enroll device flow works
  - Scan product works
  - Complete sale works

- [ ] **API** (`https://staging-api.supermandi.tech/health`)
  - Returns correct SHA (`e63dba14`)
  - All service routes respond

---

## Ownership Summary

| Item | Owner | Status |
|------|-------|--------|
| Block 1: Cloud SQL backup | **OPERATOR** | BLOCKED-ON-OPERATOR |
| Block 2: Migration dry-run | **OPERATOR** | BLOCKED-ON-OPERATOR (optional) |
| Block 3: GO_DEPLOY trigger | **OPERATOR** | BLOCKED-ON-OPERATOR |
| Block 4: Evidence capture | **OPERATOR** | BLOCKED-ON-OPERATOR |
| Block 5: Rollback | **OPERATOR** | Available if needed |
| Block 6: Browser testing | **OPERATOR** | BLOCKED-ON-OPERATOR |
| Phase 8 verification | **CLAUDE** | Auto-executes on Block 4 evidence |
| FIX-001 update | **CLAUDE** | Auto-executes on real evidence only |
| R7-CHERRY-PICK-001 | **CLAUDE** | Blocks production, not staging |

**Deploy hold: ACTIVE. Claude will not self-trigger deploy.**
