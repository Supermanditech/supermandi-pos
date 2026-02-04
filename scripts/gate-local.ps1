# =============================================================================
# SuperMandi Local Gate Script (DEPLOY-OPS-002)
# =============================================================================
# Validates a batch locally before deployment
# Usage: .\scripts\gate-local.ps1
#
# Gates (in order):
#   1. Install dependencies (if node_modules missing)
#   2. Typecheck all projects
#   3. Build retailer-admin
#   4. Build supplier-portal
#   5. Build supermandi-superadmin
#   6. Run prod-smoke e2e tests (--grep @prod)
#
# E2E Test Suites:
#   @prod     - Production smoke tests (MUST be 0 failures for go-live)
#   @testonly - Tests requiring test-only endpoints (skipped in prod gate)
#   @admin    - Admin portal tests (skipped if admin not in batch scope)
#
# Exit codes:
#   0 = All gates passed
#   1 = One or more gates failed
# =============================================================================

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

# Ensure Node.js is in PATH (fix for Windows environments)
$NodeDir = "C:\Program Files\nodejs"
$NodeExe = "$NodeDir\node.exe"
if (Test-Path $NodeDir) {
    # Set for current process AND child processes
    $env:Path = "$NodeDir;$env:Path"
    [Environment]::SetEnvironmentVariable("Path", $env:Path, [EnvironmentVariableTarget]::Process)
}

# Verify node is accessible
try {
    $nodeVersion = & $NodeExe --version 2>&1
    Write-Host "  Node.js: $nodeVersion" -ForegroundColor Gray
} catch {
    Write-Host "  [ERROR] Node.js not found at $NodeExe" -ForegroundColor Red
    exit 1
}

# Colors
function Write-Step { param($msg) Write-Host "`n[$script:Step/6] $msg" -ForegroundColor Cyan; Write-Host ("=" * 50) -ForegroundColor Cyan }
function Write-OK { param($msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Fail { param($msg) Write-Host "  [FAIL] $msg" -ForegroundColor Red }
function Write-Info { param($msg) Write-Host "  $msg" -ForegroundColor Gray }

$script:Step = 0
$script:Errors = 0

Write-Host ""
Write-Host "==========================================" -ForegroundColor Blue
Write-Host "  SUPERMANDI LOCAL GATE VALIDATION" -ForegroundColor Blue
Write-Host "==========================================" -ForegroundColor Blue
Write-Host "  Project: $ProjectRoot"
Write-Host "  Time:    $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host ""

# =============================================================================
# GATE 1: Install Dependencies
# =============================================================================
$script:Step++
Write-Step "Install dependencies (if needed)"

$projects = @(
    @{ name = "retailer-admin"; path = "$ProjectRoot\retailer-admin" },
    @{ name = "supplier-portal"; path = "$ProjectRoot\supplier-portal" },
    @{ name = "supermandi-superadmin"; path = "$ProjectRoot\supermandi-superadmin" },
    @{ name = "e2e-tests"; path = "$ProjectRoot\e2e-tests" }
)

foreach ($proj in $projects) {
    $nodeModules = Join-Path $proj.path "node_modules"
    if (-not (Test-Path $nodeModules)) {
        Write-Info "Installing $($proj.name)..."
        Push-Location $proj.path
        try {
            npm ci --silent 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
            Write-OK "$($proj.name) installed"
        } catch {
            Write-Fail "$($proj.name) install failed: $_"
            $script:Errors++
        } finally {
            Pop-Location
        }
    } else {
        Write-OK "$($proj.name) node_modules exists"
    }
}

if ($script:Errors -gt 0) {
    Write-Host "`n[GATE 1 FAILED] Dependency install failed" -ForegroundColor Red
    exit 1
}

# =============================================================================
# GATE 2: Typecheck
# =============================================================================
$script:Step++
Write-Step "Typecheck all projects"

$typecheckProjects = @(
    @{ name = "retailer-admin"; path = "$ProjectRoot\retailer-admin" },
    @{ name = "supplier-portal"; path = "$ProjectRoot\supplier-portal" },
    @{ name = "supermandi-superadmin"; path = "$ProjectRoot\supermandi-superadmin" }
)

foreach ($proj in $typecheckProjects) {
    Write-Info "Typechecking $($proj.name)..."
    Push-Location $proj.path
    try {
        # Call tsc via node directly (bypasses .cmd wrapper PATH issues)
        $tscJs = Join-Path $proj.path "node_modules\typescript\bin\tsc"
                if (-not (Test-Path $tscJs)) {
            throw "tsc not found at $tscJs"
        }
        $output = & $NodeExe $tscJs --noEmit 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "$($proj.name) typecheck failed"
            Write-Host $output -ForegroundColor Red
            $script:Errors++
        } else {
            Write-OK "$($proj.name) typecheck passed"
        }
    } catch {
        Write-Fail "$($proj.name) typecheck error: $_"
        $script:Errors++
    } finally {
        Pop-Location
    }
}

if ($script:Errors -gt 0) {
    Write-Host "`n[GATE 2 FAILED] Typecheck failed" -ForegroundColor Red
    exit 1
}

# =============================================================================
# GATE 3: Build retailer-admin
# =============================================================================
$script:Step++
Write-Step "Build retailer-admin"

Push-Location "$ProjectRoot\retailer-admin"
try {
    Write-Info "Building retailer-admin (Vite)..."
    # Run tsc then vite via node directly
        $tscJs = ".\node_modules\typescript\bin\tsc"
    $viteJs = ".\node_modules\vite\bin\vite.js"
    $output = & $NodeExe $tscJs 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "retailer-admin tsc failed"
        Write-Host $output -ForegroundColor Red
        $script:Errors++
    } else {
        $output = & $NodeExe $viteJs build 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "retailer-admin vite build failed"
            Write-Host $output -ForegroundColor Red
            $script:Errors++
        } elseif (Test-Path "dist\index.html") {
            Write-OK "retailer-admin built (dist/index.html exists)"
        } else {
            Write-Fail "retailer-admin build output missing"
            $script:Errors++
        }
    }
} catch {
    Write-Fail "retailer-admin build error: $_"
    $script:Errors++
} finally {
    Pop-Location
}

if ($script:Errors -gt 0) {
    Write-Host "`n[GATE 3 FAILED] retailer-admin build failed" -ForegroundColor Red
    exit 1
}

# =============================================================================
# GATE 4: Build supplier-portal
# =============================================================================
$script:Step++
Write-Step "Build supplier-portal"

Push-Location "$ProjectRoot\supplier-portal"
try {
    Write-Info "Building supplier-portal (Next.js)..."
    # Run next build via node directly
        $nextJs = ".\node_modules\next\dist\bin\next"
    $output = & $NodeExe $nextJs build 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "supplier-portal build failed"
        Write-Host $output -ForegroundColor Red
        $script:Errors++
    } elseif (Test-Path ".next") {
        Write-OK "supplier-portal built (.next exists)"
    } else {
        Write-Fail "supplier-portal build output missing"
        $script:Errors++
    }
} catch {
    Write-Fail "supplier-portal build error: $_"
    $script:Errors++
} finally {
    Pop-Location
}

if ($script:Errors -gt 0) {
    Write-Host "`n[GATE 4 FAILED] supplier-portal build failed" -ForegroundColor Red
    exit 1
}

# =============================================================================
# GATE 5: Build supermandi-superadmin
# =============================================================================
$script:Step++
Write-Step "Build supermandi-superadmin"

Push-Location "$ProjectRoot\supermandi-superadmin"
try {
    Write-Info "Building supermandi-superadmin (Vite)..."
    # Run tsc -b then vite via node directly
        $tscJs = ".\node_modules\typescript\bin\tsc"
    $viteJs = ".\node_modules\vite\bin\vite.js"
    $output = & $NodeExe $tscJs -b 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "supermandi-superadmin tsc failed"
        Write-Host $output -ForegroundColor Red
        $script:Errors++
    } else {
        $output = & $NodeExe $viteJs build 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "supermandi-superadmin vite build failed"
            Write-Host $output -ForegroundColor Red
            $script:Errors++
        } elseif (Test-Path "dist\index.html") {
            Write-OK "supermandi-superadmin built (dist/index.html exists)"
        } else {
            Write-Fail "supermandi-superadmin build output missing"
            $script:Errors++
        }
    }
} catch {
    Write-Fail "supermandi-superadmin build error: $_"
    $script:Errors++
} finally {
    Pop-Location
}

if ($script:Errors -gt 0) {
    Write-Host "`n[GATE 5 FAILED] supermandi-superadmin build failed" -ForegroundColor Red
    exit 1
}

# =============================================================================
# GATE 6: E2E Tests (prod-smoke only - MUST be 0 failures for go-live)
# =============================================================================
$script:Step++
Write-Step "E2E Tests (prod-smoke @prod)"

Push-Location "$ProjectRoot\e2e-tests"
try {
    # Install playwright browsers if needed
    Write-Info "Ensuring Playwright browsers installed..."
    $playwrightJs = ".\node_modules\@playwright\test\cli.js"
    & $NodeExe $playwrightJs install chromium 2>&1 | Out-Null

    Write-Info "Running prod-smoke tests (--grep @prod)..."
    Write-Info "NOTE: @testonly and @admin tests are intentionally excluded"
    $output = & $NodeExe $playwrightJs test --grep "@prod" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "prod-smoke e2e tests failed"
        Write-Host $output -ForegroundColor Red
        $script:Errors++
    } else {
        Write-OK "prod-smoke e2e tests passed (0 failures required for go-live)"
    }
} catch {
    Write-Fail "e2e test error: $_"
    $script:Errors++
} finally {
    Pop-Location
}

if ($script:Errors -gt 0) {
    Write-Host "`n[GATE 6 FAILED] prod-smoke E2E tests failed" -ForegroundColor Red
    exit 1
}

# =============================================================================
# SUMMARY
# =============================================================================

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  GATES PASSED" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  All 6 gates completed successfully:"
Write-Host "    1. Dependencies installed"
Write-Host "    2. Typecheck passed"
Write-Host "    3. retailer-admin built"
Write-Host "    4. supplier-portal built"
Write-Host "    5. supermandi-superadmin built"
Write-Host "    6. prod-smoke E2E passed (0 failures)"
Write-Host ""
Write-Host "  Excluded from gate (expected):"
Write-Host "    - @testonly: test-only endpoints disabled in prod"
Write-Host "    - @admin: admin portal not in go-live scope"
Write-Host ""
Write-Host "  Ready for commit and deploy."
Write-Host ""

exit 0
