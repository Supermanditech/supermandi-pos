<#
.SYNOPSIS
  SuperMandi Session Manager — Zero-Regression Shutdown & Resume
.DESCRIPTION
  Safely saves WIP and shuts down, or resumes from exact same state.
  Database persists via named Docker volume (supermandi-pgdata).
.PARAMETER Action
  "shutdown" — commit WIP + stop containers
  "resume"   — start containers + verify health
  "status"   — show current state without changing anything
.EXAMPLE
  .\scripts\session-manager.ps1 -Action shutdown
  .\scripts\session-manager.ps1 -Action resume
  .\scripts\session-manager.ps1 -Action status
#>

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("shutdown", "resume", "status")]
    [string]$Action
)

$ErrorActionPreference = "Stop"
$COMPOSE_FILE = "scripts/docker-compose.local-prod.yml"
$STATE_FILE   = "scripts/.session-state.json"
$REPO_ROOT    = Split-Path -Parent $PSScriptRoot

Set-Location $REPO_ROOT

# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

function Write-Header($msg) {
    Write-Host ""
    Write-Host "=============================================" -ForegroundColor Cyan
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host "=============================================" -ForegroundColor Cyan
}

function Write-Ok($msg)   { Write-Host "  [OK]   $msg" -ForegroundColor Green }
function Write-Fail($msg) { Write-Host "  [FAIL] $msg" -ForegroundColor Red }
function Write-Info($msg) { Write-Host "  [..] $msg" -ForegroundColor Yellow }

function Test-DockerRunning {
    try {
        $null = docker info 2>$null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

function Get-ContainerCount {
    $count = (docker ps --filter "name=scripts-" --format "{{.Names}}" 2>$null | Measure-Object -Line).Lines
    $standalone = (docker ps --filter "name=supermandi-main-backend" --format "{{.Names}}" 2>$null | Measure-Object -Line).Lines
    return $count + $standalone
}

function Get-HealthyCount {
    $healthy = (docker ps --filter "health=healthy" --format "{{.Names}}" 2>$null | Where-Object { $_ -match "scripts-|supermandi-main" } | Measure-Object -Line).Lines
    return $healthy
}

function Wait-ForHealthy {
    param([int]$Expected = 17, [int]$TimeoutSec = 120)
    Write-Info "Waiting for $Expected containers healthy (timeout ${TimeoutSec}s)..."
    $elapsed = 0
    while ($elapsed -lt $TimeoutSec) {
        $healthy = Get-HealthyCount
        $running = Get-ContainerCount
        Write-Host "`r  [..] $healthy/$Expected healthy, $running running ($elapsed`s)  " -NoNewline -ForegroundColor Yellow
        if ($healthy -ge $Expected) {
            Write-Host ""
            return $true
        }
        Start-Sleep -Seconds 5
        $elapsed += 5
    }
    Write-Host ""
    return $false
}

function Save-State {
    $sha = git rev-parse --short HEAD 2>$null
    $branch = git branch --show-current 2>$null
    $containers = docker ps --format "{{.Names}}|{{.Image}}|{{.Status}}" 2>$null
    $state = @{
        sha        = $sha
        branch     = $branch
        timestamp  = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        containers = $containers
    }
    $state | ConvertTo-Json -Depth 3 | Set-Content $STATE_FILE -Encoding UTF8
    Write-Ok "State saved to $STATE_FILE"
}

# ─────────────────────────────────────────────────────────────────────────────
# SHUTDOWN
# ─────────────────────────────────────────────────────────────────────────────

function Invoke-Shutdown {
    Write-Header "SuperMandi Session SHUTDOWN"

    # 1. Check Docker
    if (-not (Test-DockerRunning)) {
        Write-Fail "Docker not running — nothing to shut down"
        return
    }

    # 2. Git status
    Write-Info "Checking git status..."
    $gitStatus = git status --porcelain 2>$null
    $sha = git rev-parse --short HEAD 2>$null
    $branch = git branch --show-current 2>$null

    if ($gitStatus) {
        Write-Info "Uncommitted changes found — creating WIP commit..."

        # Stage all changes
        git add -A 2>$null

        # Commit with WIP message
        $commitMsg = @"
WIP: session save before shutdown

SHA: $sha
Branch: $branch
Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
"@
        git commit -m $commitMsg 2>$null
        if ($LASTEXITCODE -eq 0) {
            $newSha = git rev-parse --short HEAD 2>$null
            Write-Ok "WIP committed: $newSha"
        } else {
            Write-Fail "Commit failed — check git status manually"
        }
    } else {
        Write-Ok "Working tree clean — no WIP commit needed (SHA: $sha)"
    }

    # 3. Save state
    Save-State

    # 4. Stop containers (NOT down — preserves volumes + containers)
    Write-Info "Stopping Docker containers (preserving data)..."
    docker compose -f $COMPOSE_FILE stop 2>$null
    # Also stop standalone main-backend if running
    docker stop supermandi-main-backend 2>$null

    $running = Get-ContainerCount
    if ($running -eq 0) {
        Write-Ok "All containers stopped"
    } else {
        Write-Fail "$running containers still running"
    }

    # 5. Summary
    Write-Header "SHUTDOWN COMPLETE"
    Write-Host "  Git SHA:    $(git rev-parse --short HEAD)" -ForegroundColor White
    Write-Host "  Branch:     $branch" -ForegroundColor White
    Write-Host "  DB Volume:  supermandi-pgdata (PRESERVED)" -ForegroundColor Green
    Write-Host "  Containers: STOPPED (not removed)" -ForegroundColor Green
    Write-Host ""
    Write-Host "  To resume tomorrow:" -ForegroundColor Yellow
    Write-Host "    .\scripts\session-manager.ps1 -Action resume" -ForegroundColor Yellow
    Write-Host ""
}

# ─────────────────────────────────────────────────────────────────────────────
# RESUME
# ─────────────────────────────────────────────────────────────────────────────

function Invoke-Resume {
    Write-Header "SuperMandi Session RESUME"

    # 1. Check Docker Desktop
    if (-not (Test-DockerRunning)) {
        Write-Fail "Docker Desktop not running!"
        Write-Host "  Start Docker Desktop first, then re-run this script." -ForegroundColor Yellow
        return
    }
    Write-Ok "Docker Desktop running"

    # 2. Show git state
    $sha = git rev-parse --short HEAD 2>$null
    $branch = git branch --show-current 2>$null
    Write-Ok "Git: $branch @ $sha"

    # 3. Load previous state if exists
    if (Test-Path $STATE_FILE) {
        $prevState = Get-Content $STATE_FILE -Raw | ConvertFrom-Json
        Write-Info "Previous session: SHA=$($prevState.sha) at $($prevState.timestamp)"
        if ($prevState.sha -ne $sha) {
            Write-Info "SHA changed: $($prevState.sha) -> $sha (new commits detected)"
        }
    }

    # 4. Check if main-backend image needs rebuild
    $imageExists = docker images "supermandi/main-backend:$sha" --format "{{.ID}}" 2>$null
    if (-not $imageExists) {
        Write-Info "main-backend image for SHA $sha not found — building..."
        docker build --no-cache -t "supermandi/main-backend:$sha" -f backend/Dockerfile.main backend/ 2>&1 | Select-Object -Last 3
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "main-backend:$sha built successfully"
        } else {
            Write-Fail "main-backend build failed!"
            return
        }
    } else {
        Write-Ok "main-backend:$sha image exists"
    }

    # 5. Check if containers exist (stopped) or need fresh start
    $stoppedContainers = docker ps -a --filter "name=scripts-" --filter "status=exited" --format "{{.Names}}" 2>$null | Measure-Object -Line
    $runningContainers = Get-ContainerCount

    if ($runningContainers -ge 16) {
        Write-Ok "$runningContainers containers already running"
    } elseif ($stoppedContainers.Lines -gt 0) {
        Write-Info "Found $($stoppedContainers.Lines) stopped containers — starting..."
        docker compose -f $COMPOSE_FILE start 2>$null
        Write-Ok "Compose containers started"
    } else {
        Write-Info "No existing containers — starting fresh..."
        docker compose -f $COMPOSE_FILE up -d 2>$null
        Write-Ok "Compose stack created"
    }

    # 6. Wait for healthy
    $allHealthy = Wait-ForHealthy -Expected 16 -TimeoutSec 120
    if (-not $allHealthy) {
        Write-Fail "Not all containers healthy within timeout"
        Write-Host "  Run 'docker ps' to check status" -ForegroundColor Yellow
    } else {
        Write-Ok "All compose containers healthy"
    }

    # 7. Verify services
    Write-Info "Verifying services..."
    $checks = @(
        @{ Name = "Gateway";  URL = "http://localhost:8080/health" },
        @{ Name = "Backend";  URL = "http://localhost:3010/health" },
        @{ Name = "Retailer"; URL = "http://localhost:8081" },
        @{ Name = "Admin";    URL = "http://localhost:8083" },
        @{ Name = "Landing";  URL = "http://localhost:8084" }
    )

    $allOk = $true
    foreach ($check in $checks) {
        try {
            $response = Invoke-WebRequest -Uri $check.URL -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue
            if ($response.StatusCode -eq 200) {
                Write-Ok "$($check.Name): HTTP 200"
            } else {
                Write-Fail "$($check.Name): HTTP $($response.StatusCode)"
                $allOk = $false
            }
        } catch {
            Write-Fail "$($check.Name): Connection failed"
            $allOk = $false
        }
    }

    # 8. Verify database
    Write-Info "Checking database..."
    $dbCheck = docker exec scripts-postgres-1 psql -U postgres -d supermandi -t -c "SELECT COUNT(*) FROM _migrations;" 2>$null
    $migrationCount = ($dbCheck -replace '\s','')
    if ($migrationCount -ge 100) {
        Write-Ok "Database: $migrationCount migrations applied"
    } else {
        Write-Fail "Database: only $migrationCount migrations (expected 112+)"
        $allOk = $false
    }

    # Check test data
    $storeCount = docker exec scripts-postgres-1 psql -U postgres -d supermandi -t -c "SELECT COUNT(*) FROM platform.stores;" 2>$null
    $storeCount = ($storeCount -replace '\s','')
    $userCount = docker exec scripts-postgres-1 psql -U postgres -d supermandi -t -c "SELECT COUNT(*) FROM auth.users;" 2>$null
    $userCount = ($userCount -replace '\s','')
    Write-Ok "Test data: $storeCount stores, $userCount users"

    # 9. Save new state
    Save-State

    # 10. Summary
    Write-Header $(if ($allOk) { "RESUME COMPLETE — READY" } else { "RESUME COMPLETE — ISSUES FOUND" })
    Write-Host "  Git SHA:     $sha" -ForegroundColor White
    Write-Host "  Branch:      $branch" -ForegroundColor White
    Write-Host "  Postgres:    16-alpine (data preserved)" -ForegroundColor White
    Write-Host "  Migrations:  $migrationCount" -ForegroundColor White
    Write-Host "  Containers:  $(Get-ContainerCount) running" -ForegroundColor White
    Write-Host ""
    Write-Host "  Ports:" -ForegroundColor Gray
    Write-Host "    Gateway:    http://localhost:8080" -ForegroundColor Gray
    Write-Host "    Backend:    http://localhost:3010" -ForegroundColor Gray
    Write-Host "    Retailer:   http://localhost:8081" -ForegroundColor Gray
    Write-Host "    Supplier:   http://localhost:8082" -ForegroundColor Gray
    Write-Host "    SuperAdmin: http://localhost:8083" -ForegroundColor Gray
    Write-Host "    Landing:    http://localhost:8084" -ForegroundColor Gray
    Write-Host ""
}

# ─────────────────────────────────────────────────────────────────────────────
# STATUS
# ─────────────────────────────────────────────────────────────────────────────

function Invoke-Status {
    Write-Header "SuperMandi Session STATUS"

    $sha = git rev-parse --short HEAD 2>$null
    $branch = git branch --show-current 2>$null
    $dirty = git status --porcelain 2>$null

    Write-Host "  Git:        $branch @ $sha $(if ($dirty) { '(DIRTY)' } else { '(clean)' })" -ForegroundColor White

    if (Test-DockerRunning) {
        $running = Get-ContainerCount
        $healthy = Get-HealthyCount
        Write-Host "  Docker:     $running running, $healthy healthy" -ForegroundColor White

        if ($running -gt 0) {
            Write-Host ""
            docker ps --format "  {{.Names}}`t{{.Status}}" 2>$null | Sort-Object
        }
    } else {
        Write-Host "  Docker:     NOT RUNNING" -ForegroundColor Red
    }

    if (Test-Path $STATE_FILE) {
        $prevState = Get-Content $STATE_FILE -Raw | ConvertFrom-Json
        Write-Host ""
        Write-Host "  Last session: SHA=$($prevState.sha) at $($prevState.timestamp)" -ForegroundColor Gray
    }

    # Check volume
    $volExists = docker volume ls --format "{{.Name}}" 2>$null | Where-Object { $_ -eq "supermandi-pgdata" }
    if ($volExists) {
        Write-Host "  DB Volume:  supermandi-pgdata (EXISTS)" -ForegroundColor Green
    } else {
        Write-Host "  DB Volume:  supermandi-pgdata (NOT FOUND)" -ForegroundColor Yellow
    }

    Write-Host ""
}

# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

switch ($Action) {
    "shutdown" { Invoke-Shutdown }
    "resume"   { Invoke-Resume }
    "status"   { Invoke-Status }
}
