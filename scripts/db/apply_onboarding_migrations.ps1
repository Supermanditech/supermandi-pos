# ONB-GATE-002: Apply onboarding migrations (109-113) with verification
# Safe to run multiple times - all migrations are idempotent.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/db/apply_onboarding_migrations.ps1
#   $env:DATABASE_URL = "postgres://user:pass@host:5432/db"; .\scripts\db\apply_onboarding_migrations.ps1

$ErrorActionPreference = "Stop"

$DB_URL = if ($env:DATABASE_URL) { $env:DATABASE_URL } else { "postgresql://postgres:postgres@localhost:5432/supermandi" }
$MIGRATIONS_DIR = Join-Path $PSScriptRoot "..\..\backend\migrations"
$MIGRATIONS_DIR = (Resolve-Path $MIGRATIONS_DIR).Path
$PassCount = 0
$FailCount = 0

Write-Host "============================================"
Write-Host "  Onboarding Migrations - Apply + Verify"
Write-Host "============================================"
Write-Host "Dir: $MIGRATIONS_DIR"
Write-Host ""

function Apply-Migration {
    param([string]$File)
    $name = Split-Path $File -Leaf
    Write-Host "--- Applying: $name ---"
    try {
        & psql $DB_URL -f $File 2>&1 | ForEach-Object { Write-Host $_ }
        if ($LASTEXITCODE -ne 0) { throw "psql exit code: $LASTEXITCODE" }
        Write-Host "[OK] $name applied"
    } catch {
        Write-Host "[FAIL] $name failed: $_"
        $script:FailCount++
    }
}

function Verify-Check {
    param([string]$Label, [string]$Sql)
    try {
        $result = & psql $DB_URL -t -A -c $Sql 2>$null
        $result = $result.Trim()
        if ($result -eq "t" -or $result -eq "true") {
            Write-Host "  [PASS] $Label"
            $script:PassCount++
        } else {
            Write-Host "  [FAIL] $Label (got: $result)"
            $script:FailCount++
        }
    } catch {
        Write-Host "  [FAIL] $Label (error: $_)"
        $script:FailCount++
    }
}

# Apply migrations in order
foreach ($num in @(109, 110, 111, 112, 113)) {
    $file = Get-ChildItem "$MIGRATIONS_DIR\${num}_*.sql" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $file) {
        Write-Host "[FAIL] Migration $num not found in $MIGRATIONS_DIR"
        $FailCount++
        continue
    }
    Apply-Migration $file.FullName
    Write-Host ""
}

# Verification checks
Write-Host "============================================"
Write-Host "  Verification Checks"
Write-Host "============================================"

Verify-Check "109: generate_store_code() exists" `
    "SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'platform' AND p.proname = 'generate_store_code');"

Verify-Check "109: store_code_counters table exists" `
    "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'platform' AND table_name = 'store_code_counters');"

Verify-Check "110: stores.created_via column exists" `
    "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = 'platform' AND table_name = 'stores' AND column_name = 'created_via');"

Verify-Check "110: ux_stores_gst_number index exists" `
    "SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname = 'platform' AND tablename = 'stores' AND indexname = 'ux_stores_gst_number');"

Verify-Check "111: registration_events table exists" `
    "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'registration_events');"

Verify-Check "111: idx_reg_events_created index exists" `
    "SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname = 'auth' AND tablename = 'registration_events' AND indexname = 'idx_reg_events_created');"

Verify-Check "112: idx_store_users_single_owner index exists" `
    "SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname = 'auth' AND tablename = 'store_users' AND indexname = 'idx_store_users_single_owner');"

Verify-Check "113: applications table accessible" `
    "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'applications');"

# Summary
Write-Host ""
Write-Host "============================================"
$total = $PassCount + $FailCount
if ($FailCount -eq 0) {
    Write-Host "  RESULT: PASS ($PassCount/$total checks)"
} else {
    Write-Host "  RESULT: FAIL ($FailCount/$total checks failed)"
}
Write-Host "============================================"

exit $FailCount
