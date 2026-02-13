# =============================================================================
# SuperMandi — Operator Test Script (D5)
# =============================================================================
# Purpose: Pull correct commit, install deps, run gates, start services,
#          open test URLs. Operator then does physical click-testing per ticket.
#
# Usage:
#   .\RELEASES\OPERATOR_TEST_SCRIPT.ps1
#   .\RELEASES\OPERATOR_TEST_SCRIPT.ps1 -Tag "prestage-AUDIT-RW-SCREEN-001-2026-02-13_1200IST"
#
# After running, test tickets in priority order from SCREENWISE_TESTING_BACKLOG.md
# =============================================================================

param(
    [string]$Tag = "",
    [switch]$SkipInstall = $false,
    [switch]$SkipGates = $false
)

$ErrorActionPreference = "Stop"

# =============================================================================
# 1. CHECKOUT TARGET
# =============================================================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SuperMandi Operator Test Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Set-Location -Path $PSScriptRoot\..

if ($Tag) {
    Write-Host "[1/7] Checking out tag: $Tag" -ForegroundColor Green
    git fetch --tags
    git checkout $Tag
} else {
    Write-Host "[1/7] Checking out main (latest)" -ForegroundColor Green
    git checkout main
    git pull --ff-only
}

$GIT_SHA = git rev-parse --short HEAD
$GIT_BRANCH = git rev-parse --abbrev-ref HEAD
Write-Host "  Git SHA:    $GIT_SHA" -ForegroundColor Yellow
Write-Host "  Branch/Tag: $GIT_BRANCH" -ForegroundColor Yellow
Write-Host ""

# =============================================================================
# 2. INSTALL DEPENDENCIES
# =============================================================================
if (-not $SkipInstall) {
    Write-Host "[2/7] Installing dependencies..." -ForegroundColor Green
    pnpm install --frozen-lockfile
    Write-Host "  Dependencies installed." -ForegroundColor Yellow
} else {
    Write-Host "[2/7] Skipping install (--SkipInstall)" -ForegroundColor DarkGray
}
Write-Host ""

# =============================================================================
# 3. QUALITY GATES (typecheck + build)
# =============================================================================
if (-not $SkipGates) {
    Write-Host "[3/7] Running quality gates..." -ForegroundColor Green

    Write-Host "  [3a] Typecheck: backend" -ForegroundColor Yellow
    Push-Location backend
    npx tsc --noEmit
    Pop-Location

    Write-Host "  [3b] Typecheck: retailer-admin" -ForegroundColor Yellow
    Push-Location retailer-admin
    npx tsc --noEmit
    Pop-Location

    Write-Host "  [3c] Typecheck: supplier-portal" -ForegroundColor Yellow
    Push-Location supplier-portal
    npx tsc --noEmit
    Pop-Location

    Write-Host "  [3d] Typecheck: supermandi-superadmin" -ForegroundColor Yellow
    Push-Location supermandi-superadmin
    npx tsc --noEmit
    Pop-Location

    Write-Host "  All typechecks PASSED." -ForegroundColor Green
    Write-Host ""

    Write-Host "  [3e] Build: backend" -ForegroundColor Yellow
    Push-Location backend
    npx tsc -p tsconfig.json
    Pop-Location

    Write-Host "  [3f] Build: retailer-admin" -ForegroundColor Yellow
    Push-Location retailer-admin
    npx vite build
    Pop-Location

    Write-Host "  [3g] Build: supplier-portal" -ForegroundColor Yellow
    Push-Location supplier-portal
    npx next build
    Pop-Location

    Write-Host "  [3h] Build: supermandi-superadmin" -ForegroundColor Yellow
    Push-Location supermandi-superadmin
    npx vite build
    Pop-Location

    Write-Host "  All builds PASSED." -ForegroundColor Green
} else {
    Write-Host "[3/7] Skipping gates (--SkipGates)" -ForegroundColor DarkGray
}
Write-Host ""

# =============================================================================
# 4. START SERVICES
# =============================================================================
Write-Host "[4/7] Starting services..." -ForegroundColor Green
Write-Host "  Starting backend (port 3010)..." -ForegroundColor Yellow
Start-Process pwsh -ArgumentList "-NoExit","-Command","cd '$PSScriptRoot\..'; cd backend; pnpm dev" -WindowStyle Minimized
Start-Sleep -Seconds 2

Write-Host "  Starting retailer-admin (port 5173)..." -ForegroundColor Yellow
Start-Process pwsh -ArgumentList "-NoExit","-Command","cd '$PSScriptRoot\..'; cd retailer-admin; pnpm dev" -WindowStyle Minimized
Start-Sleep -Seconds 1

Write-Host "  Starting supermandi-superadmin (port 5174)..." -ForegroundColor Yellow
Start-Process pwsh -ArgumentList "-NoExit","-Command","cd '$PSScriptRoot\..'; cd supermandi-superadmin; pnpm dev" -WindowStyle Minimized
Start-Sleep -Seconds 1

Write-Host "  Starting supplier-portal (port 4001)..." -ForegroundColor Yellow
Start-Process pwsh -ArgumentList "-NoExit","-Command","cd '$PSScriptRoot\..'; cd supplier-portal; pnpm dev" -WindowStyle Minimized
Start-Sleep -Seconds 1

Write-Host "  All services starting. Waiting 10s for startup..." -ForegroundColor Yellow
Start-Sleep -Seconds 10
Write-Host ""

# =============================================================================
# 5. HEALTH CHECKS
# =============================================================================
Write-Host "[5/7] Running health checks..." -ForegroundColor Green

$services = @(
    @{ Name = "Backend API";       URL = "http://localhost:3010/api/v1/retailer-admin/health" },
    @{ Name = "Retailer Admin";    URL = "http://localhost:5173/retailer/login" },
    @{ Name = "SuperAdmin";        URL = "http://localhost:5174/admin/" },
    @{ Name = "Supplier Portal";   URL = "http://localhost:4001/supplier/" }
)

$allHealthy = $true
foreach ($svc in $services) {
    try {
        $response = Invoke-WebRequest -Uri $svc.URL -UseBasicParsing -TimeoutSec 10
        if ($response.StatusCode -eq 200) {
            Write-Host "  [OK] $($svc.Name) — $($svc.URL)" -ForegroundColor Green
        } else {
            Write-Host "  [WARN] $($svc.Name) — Status $($response.StatusCode)" -ForegroundColor Yellow
            $allHealthy = $false
        }
    } catch {
        Write-Host "  [FAIL] $($svc.Name) — $($svc.URL) — $($_.Exception.Message)" -ForegroundColor Red
        $allHealthy = $false
    }
}

if ($allHealthy) {
    Write-Host "  All health checks PASSED." -ForegroundColor Green
} else {
    Write-Host "  Some health checks FAILED. Check services above." -ForegroundColor Red
}
Write-Host ""

# =============================================================================
# 6. OPEN TEST URLs
# =============================================================================
Write-Host "[6/7] Opening test URLs in browser..." -ForegroundColor Green
Start-Process "http://localhost:5173/retailer/login"
Start-Process "http://localhost:5174/admin/"
Write-Host "  Retailer Admin: http://localhost:5173/retailer/login" -ForegroundColor Yellow
Write-Host "  SuperAdmin:     http://localhost:5174/admin/" -ForegroundColor Yellow
Write-Host "  Supplier Portal: http://localhost:4001/supplier/" -ForegroundColor Yellow
Write-Host "  POS: Open Expo Go on device (port 8081)" -ForegroundColor Yellow
Write-Host ""

# =============================================================================
# 7. INSTRUCTIONS
# =============================================================================
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  READY FOR TESTING" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Git SHA: $GIT_SHA" -ForegroundColor White
Write-Host ""
Write-Host "  Test Order (by priority):" -ForegroundColor White
Write-Host "    P0: RW-SA-001, RW-SA-002, RW-SA-003, RW-SA-006" -ForegroundColor Red
Write-Host "    P0: RW-POS-001, RW-POS-002, RW-POS-005" -ForegroundColor Red
Write-Host "    P0: RW-SA-POS-001, RW-SA-POS-002, RW-SA-POS-003, RW-SA-POS-008" -ForegroundColor Red
Write-Host "    P0: RW-API-002, RW-DB-002" -ForegroundColor Red
Write-Host "    P0: RW-FLOW-001, RW-FLOW-008" -ForegroundColor Red
Write-Host "    P1: Screen tickets, remaining cross tickets" -ForegroundColor Yellow
Write-Host "    P2: UI polish, responsive, minor" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Per-Ticket Protocol:" -ForegroundColor White
Write-Host "    1. Open SCREENWISE_TESTING_BACKLOG.md" -ForegroundColor Gray
Write-Host "    2. Find ticket, read Steps + Expected" -ForegroundColor Gray
Write-Host "    3. Execute steps in browser/POS" -ForegroundColor Gray
Write-Host "    4. Capture evidence (screenshots, console, network)" -ForegroundColor Gray
Write-Host "    5. Mark PASS or FAIL in tracker" -ForegroundColor Gray
Write-Host "    6. If FAIL: create fix ticket (1 branch = 1 PR = 1 tag)" -ForegroundColor Gray
Write-Host ""
Write-Host "  Evidence Template (per ticket):" -ForegroundColor White
Write-Host "    - UI screenshot (before + after if mutation)" -ForegroundColor Gray
Write-Host "    - Console clean proof (DevTools > Console)" -ForegroundColor Gray
Write-Host "    - Network tab (no 500s)" -ForegroundColor Gray
Write-Host "    - For cross tickets: screenshots from BOTH systems" -ForegroundColor Gray
Write-Host ""
Write-Host "  Fix Loop (any FAIL):" -ForegroundColor White
Write-Host "    Branch: audit/<TICKET-ID>-short-desc" -ForegroundColor Gray
Write-Host "    PR:     [<TICKET-ID>] <summary>" -ForegroundColor Gray
Write-Host "    Tag:    prestage-AUDIT-<TICKET-ID>-YYYY-MM-DD_HHMMIST" -ForegroundColor Gray
Write-Host ""
Write-Host "Press any key to dismiss this message..." -ForegroundColor DarkGray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
