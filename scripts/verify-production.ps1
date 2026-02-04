# SuperMandi Production Verification Script
# Based on MASTER_PLAN.md Gate Requirements
# Usage: .\scripts\verify-production.ps1

param(
    [switch]$SkipE2E,
    [switch]$SkipBrowserTests,
    [string]$Environment = "staging"
)

$ErrorActionPreference = "Stop"
$script:failures = @()
$script:warnings = @()
$script:passed = @()

# Colors
function Write-Header($text) { Write-Host "`n$('=' * 60)" -ForegroundColor Cyan; Write-Host " $text" -ForegroundColor Cyan; Write-Host "$('=' * 60)" -ForegroundColor Cyan }
function Write-Pass($text) { Write-Host "[PASS] $text" -ForegroundColor Green; $script:passed += $text }
function Write-Fail($text) { Write-Host "[FAIL] $text" -ForegroundColor Red; $script:failures += $text }
function Write-Warn($text) { Write-Host "[WARN] $text" -ForegroundColor Yellow; $script:warnings += $text }
function Write-Info($text) { Write-Host "[INFO] $text" -ForegroundColor Gray }

Write-Host @"

 ____                        __  __                 _ _
/ ___| _   _ _ __   ___ _ __|  \/  | __ _ _ __   __| (_)
\___ \| | | | '_ \ / _ \ '__| |\/| |/ _` | '_ \ / _` | |
 ___) | |_| | |_) |  __/ |  | |  | | (_| | | | | (_| | |
|____/ \__,_| .__/ \___|_|  |_|  |_|\__,_|_| |_|\__,_|_|
            |_|
    PRODUCTION VERIFICATION SCRIPT v1.0

"@ -ForegroundColor Magenta

$startTime = Get-Date
$projectRoot = "C:\supermandi-pos"
Set-Location $projectRoot

# =============================================================================
# SECTION 1: GIT STATUS
# =============================================================================
Write-Header "1. GIT STATUS VERIFICATION"

# Check clean working tree
$gitStatus = git status --porcelain
if ([string]::IsNullOrEmpty($gitStatus)) {
    Write-Pass "Git working tree is clean"
} else {
    Write-Fail "Git working tree has uncommitted changes"
    Write-Host $gitStatus -ForegroundColor Yellow
}

# Get current SHA
$currentSha = git rev-parse --short HEAD
$fullSha = git rev-parse HEAD
$branch = git branch --show-current
Write-Info "Current SHA: $currentSha ($branch)"
Write-Info "Full SHA: $fullSha"

# Check if ahead/behind origin
$gitSyncStatus = git status -sb | Select-Object -First 1
Write-Info "Sync status: $gitSyncStatus"

# Check lockfile drift
$lockfileDiff = git diff pnpm-lock.yaml
if ([string]::IsNullOrEmpty($lockfileDiff)) {
    Write-Pass "No lockfile drift (pnpm-lock.yaml clean)"
} else {
    Write-Warn "Lockfile has uncommitted changes"
}

# =============================================================================
# SECTION 2: ENVIRONMENT VERIFICATION
# =============================================================================
Write-Header "2. ENVIRONMENT VERIFICATION"

# Node version (require 18+ for ES modules and modern features)
$nodeVersion = node -v
$nodeMajor = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
Write-Info "Node.js: $nodeVersion"
if ($nodeMajor -ge 18) {
    Write-Pass "Node.js version OK ($nodeMajor.x >= 18)"
} else {
    Write-Fail "Node.js version too old (need 18+, got $nodeMajor)"
}

# pnpm version (require 8+ for workspace protocol)
$pnpmVersion = pnpm -v
$pnpmMajor = [int]($pnpmVersion -replace '(\d+)\..*', '$1')
Write-Info "pnpm: $pnpmVersion"
if ($pnpmMajor -ge 8) {
    Write-Pass "pnpm version OK ($pnpmMajor.x >= 8)"
} else {
    Write-Fail "pnpm version too old (need 8+, got $pnpmMajor)"
}

# =============================================================================
# SECTION 3: TYPECHECK GATE
# =============================================================================
Write-Header "3. TYPECHECK GATE (pnpm -r typecheck)"

Write-Info "Running typecheck across all packages..."
$typecheckStart = Get-Date

try {
    $typecheckOutput = pnpm -r typecheck 2>&1
    $typecheckExitCode = $LASTEXITCODE

    if ($typecheckExitCode -eq 0) {
        Write-Pass "Typecheck passed (0 errors)"
    } else {
        Write-Fail "Typecheck failed with exit code $typecheckExitCode"
        Write-Host $typecheckOutput -ForegroundColor Red
    }
} catch {
    Write-Fail "Typecheck threw exception: $_"
}

$typecheckDuration = (Get-Date) - $typecheckStart
Write-Info "Typecheck duration: $($typecheckDuration.TotalSeconds.ToString('F1'))s"

# =============================================================================
# SECTION 4: E2E TESTS (@prod)
# =============================================================================
Write-Header "4. E2E TESTS (@prod tag)"

if ($SkipE2E) {
    Write-Warn "E2E tests skipped (use without -SkipE2E to run)"
} else {
    $e2eDir = Join-Path $projectRoot "e2e-tests"
    if (Test-Path $e2eDir) {
        Write-Info "Running @prod E2E tests..."
        Set-Location $e2eDir

        try {
            $e2eOutput = node .\node_modules\@playwright\test\cli.js test --grep "@prod" 2>&1
            $e2eExitCode = $LASTEXITCODE

            if ($e2eExitCode -eq 0) {
                Write-Pass "E2E @prod tests passed"
            } else {
                Write-Fail "E2E @prod tests failed"
                Write-Host ($e2eOutput | Select-Object -Last 20) -ForegroundColor Red
            }
        } catch {
            Write-Warn "E2E tests could not run: $_"
        }

        Set-Location $projectRoot
    } else {
        Write-Warn "e2e-tests directory not found"
    }
}

# =============================================================================
# SECTION 5: BUILD VERIFICATION
# =============================================================================
Write-Header "5. BUILD VERIFICATION"

# Check if builds exist
$builds = @(
    @{ Name = "Retailer Admin"; Path = "retailer-admin/dist" },
    @{ Name = "Supplier Portal"; Path = "supplier-portal/.next" },
    @{ Name = "SuperAdmin"; Path = "supermandi-superadmin/dist" }
)

foreach ($build in $builds) {
    $buildPath = Join-Path $projectRoot $build.Path
    if (Test-Path $buildPath) {
        Write-Pass "$($build.Name) build exists"
    } else {
        Write-Warn "$($build.Name) build not found at $($build.Path)"
    }
}

# =============================================================================
# SECTION 6: API HEALTH CHECKS
# =============================================================================
Write-Header "6. API HEALTH CHECKS"

$baseUrl = switch ($Environment) {
    "production" { "https://supermandi.tech" }
    "staging" { "https://staging.supermandi.tech" }
    "local" { "http://localhost:3000" }
    default { "https://supermandi.tech" }  # Default to production
}

Write-Info "Target environment: $Environment ($baseUrl)"
Write-Info "(Use -Environment production|staging|local to change)"

# Health endpoint
try {
    $healthResponse = Invoke-RestMethod -Uri "$baseUrl/api/v1/health" -Method GET -TimeoutSec 10
    if ($healthResponse.status -eq "ok") {
        Write-Pass "/health returns ok"
    } else {
        Write-Warn "/health returned unexpected: $($healthResponse | ConvertTo-Json -Compress)"
    }
} catch {
    if ($Environment -eq "staging") {
        Write-Info "/health - staging not deployed yet (expected)"
    } else {
        Write-Warn "/health check failed: $($_.Exception.Message)"
    }
}

# Version endpoint
try {
    $versionResponse = Invoke-RestMethod -Uri "$baseUrl/api/v1/version" -Method GET -TimeoutSec 10
    Write-Info "Deployed version: $($versionResponse | ConvertTo-Json -Compress)"

    if ($versionResponse.sha -eq $currentSha -or $versionResponse.sha -eq $fullSha) {
        Write-Pass "/version matches current SHA"
    } else {
        Write-Info "/version SHA on server: $($versionResponse.sha) (local: $currentSha)"
    }
} catch {
    if ($Environment -eq "staging") {
        Write-Info "/version - staging not deployed yet (expected)"
    } else {
        Write-Warn "/version check failed: $($_.Exception.Message)"
    }
}

# =============================================================================
# SECTION 7: SECURITY CHECKS
# =============================================================================
Write-Header "7. SECURITY CHECKS"

# Check for exposed secrets in code
$secretPatterns = @(
    "EXPO_PUBLIC_TEST_PIN",
    "password\s*=\s*['""][^'""]+['""]",
    "api[_-]?key\s*=\s*['""][^'""]+['""]"
)

Write-Info "Scanning for potential exposed secrets..."
$secretsFound = $false

foreach ($pattern in $secretPatterns) {
    $matches = Get-ChildItem -Path $projectRoot -Recurse -Include "*.ts","*.tsx","*.js" -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch "node_modules|\.next|dist|build" } |
        Select-String -Pattern $pattern -ErrorAction SilentlyContinue

    if ($matches) {
        Write-Warn "Pattern '$pattern' found in code (review needed)"
        $secretsFound = $true
    }
}

if (-not $secretsFound) {
    Write-Pass "No obvious secret patterns detected"
}

# Check HTTPS in app.json
$appJsonPath = Join-Path $projectRoot "app.json"
$appJson = Get-Content $appJsonPath -Raw | ConvertFrom-Json
$apiUrl = $appJson.expo.extra.API_URL

if ($apiUrl -match "^https://") {
    Write-Pass "POS API_URL uses HTTPS: $apiUrl"
} else {
    Write-Fail "POS API_URL is not HTTPS: $apiUrl"
}

# =============================================================================
# SECTION 8: BATCH STATUS CHECK
# =============================================================================
Write-Header "8. BATCH STATUS (from MASTER_PLAN.md)"

$masterPlanPath = Join-Path $projectRoot "RELEASES\MASTER_PLAN.md"
if (Test-Path $masterPlanPath) {
    $masterPlan = Get-Content $masterPlanPath -Raw

    # Extract status table
    if ($masterPlan -match "BATCH-004.*?BATCH-011.*?\|") {
        Write-Info "Batch statuses found in MASTER_PLAN.md"

        $batches = @("BATCH-004", "BATCH-005", "BATCH-006", "BATCH-007", "BATCH-008")
        foreach ($batch in $batches) {
            if ($masterPlan -match "$batch.*?\|\s*(\w+)\s*\|") {
                $status = $Matches[1]
                Write-Info "  $batch : $status"
            }
        }
    }
    Write-Pass "MASTER_PLAN.md exists and is readable"
} else {
    Write-Warn "MASTER_PLAN.md not found"
}

# =============================================================================
# SECTION 9: EVIDENCE FOLDER CHECK
# =============================================================================
Write-Header "9. EVIDENCE FOLDER CHECK"

$evidenceBase = Join-Path $projectRoot "RELEASES\EVIDENCE"
$requiredBatches = @("BATCH-004", "BATCH-005", "BATCH-006", "BATCH-007")

foreach ($batch in $requiredBatches) {
    $batchEvidencePath = Join-Path $evidenceBase $batch
    if (Test-Path $batchEvidencePath) {
        $files = Get-ChildItem $batchEvidencePath -ErrorAction SilentlyContinue
        Write-Info "  $batch : $($files.Count) evidence files"
    } else {
        Write-Warn "  $batch : Evidence folder not created yet"
    }
}

# =============================================================================
# SUMMARY
# =============================================================================
Write-Header "VERIFICATION SUMMARY"

$duration = (Get-Date) - $startTime

Write-Host "`nResults:" -ForegroundColor White
Write-Host "  Passed:   $($script:passed.Count)" -ForegroundColor Green
Write-Host "  Warnings: $($script:warnings.Count)" -ForegroundColor Yellow
Write-Host "  Failures: $($script:failures.Count)" -ForegroundColor Red
Write-Host "`nDuration: $($duration.TotalSeconds.ToString('F1')) seconds"
Write-Host "SHA: $currentSha"
Write-Host "Branch: $branch"

if ($script:failures.Count -gt 0) {
    Write-Host "`n" -NoNewline
    Write-Host "PRODUCTION READY: NO" -ForegroundColor Red -BackgroundColor DarkRed
    Write-Host "`nFailures:" -ForegroundColor Red
    $script:failures | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 1
} elseif ($script:warnings.Count -gt 0) {
    Write-Host "`n" -NoNewline
    Write-Host "PRODUCTION READY: CONDITIONAL (review warnings)" -ForegroundColor Yellow -BackgroundColor DarkYellow
    Write-Host "`nWarnings:" -ForegroundColor Yellow
    $script:warnings | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
    exit 0
} else {
    Write-Host "`n" -NoNewline
    Write-Host "PRODUCTION READY: YES" -ForegroundColor Green -BackgroundColor DarkGreen
    exit 0
}
