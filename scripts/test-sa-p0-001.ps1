# =============================================================================
# SA-P0-001: Store Suspension & Reactivation — Local Production Test Script
# =============================================================================
# Runs the FULL verification pipeline against Docker local-prod stack.
#
# Usage (from VS Code PowerShell terminal):
#   .\scripts\test-sa-p0-001.ps1
#   .\scripts\test-sa-p0-001.ps1 -SkipDockerBuild    # reuse running containers
#   .\scripts\test-sa-p0-001.ps1 -RunCount 3          # run E2E 3 times
#
# What it does:
#   1. Records git baseline (SHA, branch, tag)
#   2. Runs pnpm -r typecheck (22 projects)
#   3. Builds & starts Docker local-prod stack (17 containers)
#   4. Waits for all health endpoints (backend, gateway, portals)
#   5. Runs SA-P0-001 Playwright E2E tests N times (default: 2)
#   6. Produces PASS/FAIL report with evidence paths
#
# Prerequisites:
#   - Docker Desktop running
#   - pnpm installed
#   - Node.js 18+
# =============================================================================

param(
    [switch]$SkipDockerBuild,  # Skip docker build (reuse running containers)
    [switch]$SkipTypecheck,    # Skip typecheck gate
    [int]$RunCount = 2,        # Number of E2E runs (default: 2 for flake check)
    [int]$HealthTimeout = 120  # Seconds to wait for health checks
)

$ErrorActionPreference = "Stop"
$ProjectRoot = "C:\supermandi-pos"
Set-Location $ProjectRoot

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
$script:StepNum = 0
$script:TotalSteps = 6
$script:Errors = @()
$script:Results = @()
$startTime = Get-Date

function Write-Banner {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Magenta
    Write-Host "  SA-P0-001: Store Suspension & Reactivation" -ForegroundColor Magenta
    Write-Host "  Local Production Verification" -ForegroundColor Magenta
    Write-Host "============================================================" -ForegroundColor Magenta
    Write-Host "  Time:  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    Write-Host "  Root:  $ProjectRoot"
    Write-Host ""
}

function Write-Step($msg) {
    $script:StepNum++
    Write-Host ""
    Write-Host "[$script:StepNum/$script:TotalSteps] $msg" -ForegroundColor Cyan
    Write-Host ("-" * 60) -ForegroundColor Cyan
}

function Write-OK($msg) { Write-Host "  [OK]   $msg" -ForegroundColor Green }
function Write-FAIL($msg) { Write-Host "  [FAIL] $msg" -ForegroundColor Red; $script:Errors += $msg }
function Write-INFO($msg) { Write-Host "  [INFO] $msg" -ForegroundColor Gray }
function Write-WARN($msg) { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }

function Record-Result($gate, $status, $detail) {
    $script:Results += [PSCustomObject]@{
        Gate   = $gate
        Status = $status
        Detail = $detail
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1: Git Baseline
# ─────────────────────────────────────────────────────────────────────────────
Write-Banner

Write-Step "Git Baseline"

$gitSha = git rev-parse --short HEAD
$gitFullSha = git rev-parse HEAD
$gitBranch = git branch --show-current
$gitTag = git describe --tags --exact-match 2>$null
if (-not $gitTag) { $gitTag = "(no tag on HEAD)" }
$gitClean = git status --porcelain

Write-INFO "Branch:   $gitBranch"
Write-INFO "SHA:      $gitSha ($gitFullSha)"
Write-INFO "Tag:      $gitTag"

if ([string]::IsNullOrEmpty($gitClean)) {
    Write-OK "Working tree is clean"
    Record-Result "Git Baseline" "PASS" "SHA=$gitSha Branch=$gitBranch Clean=yes"
} else {
    Write-WARN "Working tree has uncommitted changes"
    Record-Result "Git Baseline" "WARN" "SHA=$gitSha Uncommitted changes present"
}

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2: Typecheck
# ─────────────────────────────────────────────────────────────────────────────
Write-Step "Typecheck (22 projects)"

if ($SkipTypecheck) {
    Write-WARN "Skipped (use without -SkipTypecheck to run)"
    Record-Result "Typecheck" "SKIP" "Skipped by flag"
} else {
    try {
        $tcOutput = & pnpm -r typecheck 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-OK "All 22 projects typecheck PASS"
            Record-Result "Typecheck" "PASS" "22/22 projects"
        } else {
            Write-FAIL "Typecheck failed"
            $tcOutput | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
            Record-Result "Typecheck" "FAIL" "See output above"
        }
    } catch {
        Write-FAIL "Typecheck error: $_"
        Record-Result "Typecheck" "FAIL" "$_"
    }
}

if ($script:Errors.Count -gt 0) {
    Write-Host "`n[ABORT] Typecheck failed. Fix errors before continuing." -ForegroundColor Red
    exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3: Docker Local-Prod Stack
# ─────────────────────────────────────────────────────────────────────────────
Write-Step "Docker Local-Prod Stack (17 containers)"

$composeFile = "$ProjectRoot\scripts\docker-compose.local-prod.yml"

if ($SkipDockerBuild) {
    Write-INFO "Reusing running containers (-SkipDockerBuild)"
    # Just verify containers are running
    $running = docker compose -f $composeFile ps --format "{{.Name}}" 2>$null
    $runCount = ($running | Measure-Object).Count
    if ($runCount -ge 10) {
        Write-OK "$runCount containers running"
        Record-Result "Docker Stack" "PASS" "$runCount containers (reused)"
    } else {
        Write-FAIL "Only $runCount containers running. Remove -SkipDockerBuild to rebuild."
        Record-Result "Docker Stack" "FAIL" "Only $runCount containers"
    }
} else {
    Write-INFO "Building and starting stack (this may take 30-60s)..."
    try {
        $dockerOutput = & docker compose -f $composeFile up -d --build 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-OK "Docker stack started"
            Record-Result "Docker Stack" "PASS" "Built and started"
        } else {
            Write-FAIL "Docker stack failed to start"
            $dockerOutput | Select-Object -Last 20 | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
            Record-Result "Docker Stack" "FAIL" "Build/start failed"
        }
    } catch {
        Write-FAIL "Docker error: $_"
        Record-Result "Docker Stack" "FAIL" "$_"
    }
}

if ($script:Errors.Count -gt 0) {
    Write-Host "`n[ABORT] Docker stack not healthy. Fix before continuing." -ForegroundColor Red
    exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# STEP 4: Health Checks
# ─────────────────────────────────────────────────────────────────────────────
Write-Step "Health Checks (all services)"

$endpoints = @(
    @{ Name = "Backend (main)";   URL = "http://localhost:3010/health" },
    @{ Name = "API Gateway";      URL = "http://localhost:8080/health" },
    @{ Name = "Retailer Portal";  URL = "http://localhost:8081/health.txt" },
    @{ Name = "Supplier Portal";  URL = "http://localhost:8082/supplier/" },
    @{ Name = "SuperAdmin";       URL = "http://localhost:8083/health.txt" },
    @{ Name = "Landing";          URL = "http://localhost:8084/health.txt" }
)

$healthPassed = 0
$healthTotal = $endpoints.Count
$perEndpointTimeout = [math]::Max(20, [math]::Floor($HealthTimeout / $healthTotal))

Write-INFO "Waiting up to ${perEndpointTimeout}s per endpoint (${HealthTimeout}s total)..."

foreach ($ep in $endpoints) {
    $ok = $false
    $epDeadline = (Get-Date).AddSeconds($perEndpointTimeout)
    while ((Get-Date) -lt $epDeadline) {
        try {
            $resp = Invoke-WebRequest -Uri $ep.URL -TimeoutSec 5 -UseBasicParsing -ErrorAction SilentlyContinue
            if ($resp.StatusCode -eq 200) {
                Write-OK "$($ep.Name) -> 200 OK"
                $healthPassed++
                $ok = $true
                break
            }
        } catch {
            # Retry
        }
        Start-Sleep -Seconds 2
    }
    if (-not $ok) {
        Write-FAIL "$($ep.Name) -> NOT HEALTHY ($($ep.URL))"
    }
}

if ($healthPassed -eq $healthTotal) {
    Record-Result "Health Checks" "PASS" "$healthPassed/$healthTotal endpoints 200"
} else {
    Record-Result "Health Checks" "FAIL" "$healthPassed/$healthTotal healthy"
}

if ($script:Errors.Count -gt 0) {
    Write-Host "`n[ABORT] Not all services healthy. Check docker logs." -ForegroundColor Red
    Write-INFO "Debug: docker compose -f scripts/docker-compose.local-prod.yml logs --tail=50"
    exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# STEP 5: E2E Tests (N runs)
# ─────────────────────────────────────────────────────────────────────────────
Write-Step "SA-P0-001 E2E Tests ($RunCount runs)"

$e2eDir = "$ProjectRoot\e2e-tests"
$playwrightCli = "$e2eDir\node_modules\@playwright\test\cli.js"
$specFile = "tests/store-suspension/store-suspension.spec.ts"
$allRunsPassed = $true

for ($i = 1; $i -le $RunCount; $i++) {
    Write-INFO "--- Run $i of $RunCount ---"

    Push-Location $e2eDir
    try {
        $e2eOutput = & node $playwrightCli test $specFile --project=chromium 2>&1
        $exitCode = $LASTEXITCODE

        # Extract pass/fail summary line
        $summaryLine = ($e2eOutput | Select-String -Pattern "\d+ passed" | Select-Object -Last 1)

        if ($exitCode -eq 0 -and $summaryLine) {
            Write-OK "Run $i : $($summaryLine.Line.Trim())"
        } else {
            Write-FAIL "Run $i FAILED (exit code: $exitCode)"
            $e2eOutput | Select-Object -Last 20 | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
            $allRunsPassed = $false
        }
    } catch {
        Write-FAIL "Run $i error: $_"
        $allRunsPassed = $false
    } finally {
        Pop-Location
    }
}

if ($allRunsPassed) {
    Record-Result "E2E Tests" "PASS" "$RunCount/$RunCount runs passed (0 flakes)"
} else {
    Record-Result "E2E Tests" "FAIL" "One or more runs failed"
}

# ─────────────────────────────────────────────────────────────────────────────
# STEP 6: Evidence & Report
# ─────────────────────────────────────────────────────────────────────────────
Write-Step "Verification Report"

$duration = (Get-Date) - $startTime
$overallPass = ($script:Errors.Count -eq 0)

# Evidence paths
$evidencePaths = @(
    "$e2eDir\test-results\results.json",
    "$e2eDir\playwright-report\index.html"
)

Write-Host ""
Write-Host "============================================================" -ForegroundColor $(if ($overallPass) { "Green" } else { "Red" })
Write-Host "  SA-P0-001 LOCAL-PROD VERIFICATION REPORT" -ForegroundColor $(if ($overallPass) { "Green" } else { "Red" })
Write-Host "============================================================" -ForegroundColor $(if ($overallPass) { "Green" } else { "Red" })
Write-Host ""
Write-Host "  Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host "  Duration:  $([math]::Round($duration.TotalSeconds))s"
Write-Host "  Git SHA:   $gitSha ($gitBranch)"
Write-Host "  Tag:       $gitTag"
Write-Host "  Stack:     Docker local-prod (NODE_ENV=production, PG 16)"
Write-Host ""

Write-Host "  GATES:" -ForegroundColor White
foreach ($r in $script:Results) {
    $color = switch ($r.Status) {
        "PASS" { "Green" }
        "FAIL" { "Red" }
        "WARN" { "Yellow" }
        "SKIP" { "DarkGray" }
        default { "White" }
    }
    Write-Host "    [$($r.Status)] $($r.Gate) — $($r.Detail)" -ForegroundColor $color
}

Write-Host ""
Write-Host "  EVIDENCE:" -ForegroundColor White
foreach ($path in $evidencePaths) {
    if (Test-Path $path) {
        Write-Host "    [EXISTS] $path" -ForegroundColor Green
    } else {
        Write-Host "    [MISSING] $path" -ForegroundColor Yellow
    }
}

Write-Host ""
if ($overallPass) {
    Write-Host "  RESULT: ALL GATES PASSED" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Ready for: commit / push / PR / staging deploy" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Next steps:" -ForegroundColor White
    Write-Host "    git add -A && git commit -m 'SA-P0-001: ...' " -ForegroundColor Gray
    Write-Host "    git push -u origin feature/sa-p0-001-store-suspension" -ForegroundColor Gray
    Write-Host "    gh pr create --title 'SA-P0-001: Store suspension'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Staging deploy (after merge):" -ForegroundColor White
    Write-Host "    ./scripts/deploy-cloud-run.sh --env staging --sha $gitSha" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host "  RESULT: FAILED" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Failures:" -ForegroundColor Red
    foreach ($err in $script:Errors) {
        Write-Host "    - $err" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "  Debug commands:" -ForegroundColor White
    Write-Host "    docker compose -f scripts/docker-compose.local-prod.yml logs --tail=100" -ForegroundColor Gray
    Write-Host "    docker compose -f scripts/docker-compose.local-prod.yml ps" -ForegroundColor Gray
    Write-Host ""
}

Write-Host "============================================================" -ForegroundColor $(if ($overallPass) { "Green" } else { "Red" })
Write-Host ""

exit $(if ($overallPass) { 0 } else { 1 })
