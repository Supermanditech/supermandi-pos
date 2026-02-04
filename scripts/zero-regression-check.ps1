# ZERO REGRESSION CHECK SCRIPT
# Run before ANY commit or deploy
# ALL checks MUST pass - no exceptions

param(
    [switch]$PreCommit,
    [switch]$PreDeploy,
    [switch]$Full
)

$ErrorCount = 0
$WarningCount = 0

Write-Host "`n" -NoNewline
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   ZERO REGRESSION VALIDATION CHECK" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ============================================
# Helper: Get source files via git (fast, respects .gitignore)
# ============================================
$RepoRoot = "C:\supermandi-pos"
Push-Location $RepoRoot

# Use git ls-files for instant file discovery (skips node_modules, dist, .next, etc.)
$SourceFiles = git ls-files --cached --others --exclude-standard -- '*.ts' '*.tsx' '*.js' '*.jsx' 2>$null |
    ForEach-Object { Join-Path $RepoRoot $_ } |
    Where-Object { Test-Path $_ }

# ============================================
# CHECK 1: Hardcoded URLs/IPs
# ============================================
Write-Host "[CHECK 1] Scanning for hardcoded URLs/IPs..." -ForegroundColor Yellow

$ForbiddenPatterns = @(
    "localhost:3000",
    "localhost:5173",
    "localhost:3001",
    "localhost:5174",
    "127.0.0.1",
    "api\.supermandi\.tech",
    "supermandi\.tech",
    "34\.\d+\.\d+\.\d+",
    "35\.\d+\.\d+\.\d+"
)

$ExcludeFilePatterns = @(
    "vite.config",
    "docker-compose",
    "*.test.*",
    "*.spec.*",
    "*.config.*"
)

$HardcodedFound = @()

foreach ($filePath in $SourceFiles) {
    $fileName = Split-Path $filePath -Leaf
    # Skip config/test files where localhost references are expected
    $skip = $false
    foreach ($ex in $ExcludeFilePatterns) {
        if ($fileName -like $ex) { $skip = $true; break }
    }
    if ($skip) { continue }

    $lines = Get-Content $filePath -ErrorAction SilentlyContinue
    if (-not $lines) { continue }

    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        # Skip comments and env references
        if ($line -match "^\s*//" -or $line -match "process\.env" -or $line -match "import\.meta\.env") { continue }

        foreach ($pattern in $ForbiddenPatterns) {
            if ($line -match $pattern) {
                $trimmed = $line.Trim()
                $display = $trimmed.Substring(0, [Math]::Min(80, $trimmed.Length))
                $HardcodedFound += [PSCustomObject]@{
                    File    = $filePath.Replace("$RepoRoot\", "")
                    Line    = $i + 1
                    Pattern = $pattern
                    Content = $display
                }
            }
        }
    }
}

if ($HardcodedFound.Count -gt 0) {
    Write-Host "  [FAIL] Found $($HardcodedFound.Count) hardcoded values!" -ForegroundColor Red
    $HardcodedFound | Format-Table -AutoSize
    $ErrorCount++
} else {
    Write-Host "  [PASS] No hardcoded URLs/IPs found" -ForegroundColor Green
}

# ============================================
# CHECK 2: TypeScript Errors
# ============================================
Write-Host "`n[CHECK 2] Running TypeScript check..." -ForegroundColor Yellow

$tscResult = & pnpm -r typecheck 2>&1
$tscExitCode = $LASTEXITCODE

if ($tscExitCode -ne 0) {
    Write-Host "  [FAIL] TypeScript errors found!" -ForegroundColor Red
    $tscResult | Select-Object -Last 20 | ForEach-Object { Write-Host "    $_" }
    $ErrorCount++
} else {
    Write-Host "  [PASS] TypeScript check passed" -ForegroundColor Green
}

# ============================================
# CHECK 3: pnpm-lock.yaml exists
# ============================================
Write-Host "`n[CHECK 3] Checking dependency lock files..." -ForegroundColor Yellow

if (-not (Test-Path "$RepoRoot\pnpm-lock.yaml")) {
    Write-Host "  [FAIL] Missing: pnpm-lock.yaml" -ForegroundColor Red
    $ErrorCount++
} else {
    Write-Host "  [PASS] Lock file present" -ForegroundColor Green
}

# ============================================
# CHECK 4: No console.log in production code
# ============================================
Write-Host "`n[CHECK 4] Checking for console.log statements..." -ForegroundColor Yellow

$ConsoleLogFound = @()
foreach ($filePath in $SourceFiles) {
    # Skip test/spec files
    if ($filePath -match "test|spec|__tests__|__mocks__") { continue }

    $lines = Get-Content $filePath -ErrorAction SilentlyContinue
    if (-not $lines) { continue }

    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match "console\.(log|debug|info)" -and
            $lines[$i] -notmatch "^\s*//") {
            $ConsoleLogFound += [PSCustomObject]@{
                File = $filePath.Replace("$RepoRoot\", "")
                Line = $i + 1
            }
        }
    }
}

if ($ConsoleLogFound.Count -gt 0) {
    Write-Host "  [WARN] Found $($ConsoleLogFound.Count) console.log statements" -ForegroundColor Yellow
    $ConsoleLogFound | Select-Object -First 10 | Format-Table -AutoSize
    if ($ConsoleLogFound.Count -gt 10) {
        Write-Host "    ... and $($ConsoleLogFound.Count - 10) more" -ForegroundColor Yellow
    }
    $WarningCount++
} else {
    Write-Host "  [PASS] No console.log in production code" -ForegroundColor Green
}

# ============================================
# CHECK 5: Environment files
# ============================================
Write-Host "`n[CHECK 5] Checking environment configuration..." -ForegroundColor Yellow

$EnvExampleFiles = @(
    "$RepoRoot\backend\.env.example",
    "$RepoRoot\retailer-admin\.env.example",
    "$RepoRoot\supplier-portal\.env.example",
    "$RepoRoot\superadmin-portal\.env.example"
)

$EnvMissing = $false
foreach ($envFile in $EnvExampleFiles) {
    if (-not (Test-Path $envFile)) {
        $shortPath = $envFile.Replace("$RepoRoot\", "")
        Write-Host "  [WARN] Missing: $shortPath" -ForegroundColor Yellow
        $EnvMissing = $true
    }
}

if ($EnvMissing) {
    $WarningCount++
} else {
    Write-Host "  [PASS] All .env.example files present" -ForegroundColor Green
}

# ============================================
# CHECK 6: Git status clean (for deploy)
# ============================================
if ($PreDeploy -or $Full) {
    Write-Host "`n[CHECK 6] Checking git status..." -ForegroundColor Yellow

    $gitStatus = & git status --porcelain 2>&1
    if ($gitStatus) {
        Write-Host "  [FAIL] Uncommitted changes detected!" -ForegroundColor Red
        $gitStatus | ForEach-Object { Write-Host "    $_" }
        $ErrorCount++
    } else {
        Write-Host "  [PASS] Git working tree clean" -ForegroundColor Green
    }
}

# ============================================
# CHECK 7: Docker containers (for full check)
# ============================================
if ($Full) {
    Write-Host "`n[CHECK 7] Checking Docker containers..." -ForegroundColor Yellow

    $dockerPs = & docker ps --format "{{.Names}}: {{.Status}}" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [FAIL] Docker not running!" -ForegroundColor Red
        $ErrorCount++
    } else {
        $postgresRunning = $dockerPs | Where-Object { $_ -match "supermandi-postgres.*Up" }
        $redisRunning = $dockerPs | Where-Object { $_ -match "supermandi-redis.*Up" }

        if (-not $postgresRunning) {
            Write-Host "  [FAIL] Postgres container not running" -ForegroundColor Red
            $ErrorCount++
        }
        if (-not $redisRunning) {
            Write-Host "  [FAIL] Redis container not running" -ForegroundColor Red
            $ErrorCount++
        }
        if ($postgresRunning -and $redisRunning) {
            Write-Host "  [PASS] All Docker containers running" -ForegroundColor Green
        }
    }
}

# ============================================
# FINAL RESULT
# ============================================
Pop-Location

Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host "   VALIDATION RESULT" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

if ($ErrorCount -gt 0) {
    Write-Host "`n  FAILED: $ErrorCount error(s), $WarningCount warning(s)" -ForegroundColor Red
    Write-Host "`n  DEPLOY BLOCKED - Fix all errors before proceeding" -ForegroundColor Red
    Write-Host "`n============================================`n" -ForegroundColor Red
    exit 1
} elseif ($WarningCount -gt 0) {
    Write-Host "`n  PASSED WITH WARNINGS: $WarningCount warning(s)" -ForegroundColor Yellow
    Write-Host "`n  Review warnings before deploy" -ForegroundColor Yellow
    Write-Host "`n============================================`n" -ForegroundColor Yellow
    exit 0
} else {
    Write-Host "`n  ALL CHECKS PASSED" -ForegroundColor Green
    Write-Host "`n  Safe to proceed with deploy" -ForegroundColor Green
    Write-Host "`n============================================`n" -ForegroundColor Green
    exit 0
}
