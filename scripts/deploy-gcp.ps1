# deploy-gcp.ps1 - One-click GCP Cloud Run deployment
# LOCAL-PROD-001-G: Builds Docker images, pushes to Artifact Registry, deploys to Cloud Run
#
# Prerequisites:
#   - gcloud CLI installed and authenticated (gcloud auth login)
#   - Docker Desktop running
#   - GCP project configured (gcloud config set project <PROJECT_ID>)
#   - Artifact Registry repo created
#   - Cloud SQL (Postgres) and Memorystore (Redis) provisioned
#
# Usage:
#   .\scripts\deploy-gcp.ps1                    # Deploy to staging
#   .\scripts\deploy-gcp.ps1 -Env production    # Deploy to production
#   .\scripts\deploy-gcp.ps1 -SkipBuild         # Deploy existing images
#   .\scripts\deploy-gcp.ps1 -DryRun            # Show what would happen

param(
    [ValidateSet("staging", "production")]
    [string]$Env = "staging",
    [switch]$SkipBuild,
    [switch]$SkipTests,
    [switch]$DryRun,
    [string]$Tag = ""
)

$ErrorActionPreference = "Stop"

# =============================================================================
# CONFIGURATION
# =============================================================================
$GCP_PROJECT = $env:GCP_PROJECT ?? "supermandi-pos"
$GCP_REGION = $env:GCP_REGION ?? "asia-south1"
$ARTIFACT_REGISTRY = "$GCP_REGION-docker.pkg.dev/$GCP_PROJECT/supermandi"

# Git SHA for image tagging
if (-not $Tag) {
    $Tag = (git rev-parse --short HEAD 2>$null) ?? "latest"
}

# Services to deploy (order matters: dependencies first)
$SERVICES = @(
    @{ Name = "main-backend";     Dockerfile = "backend/Dockerfile.main";                    Context = "backend";  Port = 3010 },
    @{ Name = "api-gateway";      Dockerfile = "backend/services/api-gateway/Dockerfile";    Context = "backend";  Port = 3000 },
    @{ Name = "auth-service";     Dockerfile = "backend/services/auth-service/Dockerfile";   Context = "backend";  Port = 3001 },
    @{ Name = "payment-service";  Dockerfile = "backend/services/payment-service/Dockerfile"; Context = "backend"; Port = 3011 }
)

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================
function Write-Step($step, $total, $msg) {
    Write-Host "`n[$step/$total] $msg" -ForegroundColor Cyan
}

function Write-Ok($msg) {
    Write-Host "  [OK] $msg" -ForegroundColor Green
}

function Write-Warn($msg) {
    Write-Host "  [WARN] $msg" -ForegroundColor Yellow
}

function Write-Fail($msg) {
    Write-Host "  [FAIL] $msg" -ForegroundColor Red
}

function Run-Cmd($cmd, $args) {
    if ($DryRun) {
        Write-Host "  [DRY-RUN] $cmd $($args -join ' ')" -ForegroundColor Gray
        return $true
    }
    & $cmd @args
    return $LASTEXITCODE -eq 0
}

# =============================================================================
# STEP 0: PRE-FLIGHT CHECKS
# =============================================================================
Write-Host "============================================" -ForegroundColor White
Write-Host "SuperMandi GCP Cloud Run Deployment" -ForegroundColor White
Write-Host "============================================" -ForegroundColor White
Write-Host "  Environment: $Env"
Write-Host "  Tag:         $Tag"
Write-Host "  Registry:    $ARTIFACT_REGISTRY"
Write-Host "  Dry Run:     $DryRun"
Write-Host ""

Write-Step 0 7 "Pre-flight checks..."

# Check gcloud
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    Write-Fail "gcloud CLI not found. Install: https://cloud.google.com/sdk/docs/install"
    exit 1
}
Write-Ok "gcloud CLI found"

# Check Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Fail "Docker not found. Install Docker Desktop."
    exit 1
}
docker info *>$null
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Docker daemon not running. Start Docker Desktop."
    exit 1
}
Write-Ok "Docker running"

# Check git is clean (for production)
if ($Env -eq "production") {
    $gitStatus = git status --porcelain
    if ($gitStatus) {
        Write-Fail "Git tree is dirty. Commit or stash changes before deploying to production."
        Write-Host $gitStatus
        exit 1
    }
    Write-Ok "Git tree is clean"
}

# Verify GCP project
$currentProject = gcloud config get-value project 2>$null
if ($currentProject -ne $GCP_PROJECT) {
    Write-Warn "GCP project mismatch: expected '$GCP_PROJECT', got '$currentProject'"
    Write-Host "  Run: gcloud config set project $GCP_PROJECT"
}
Write-Ok "GCP project: $currentProject"

# =============================================================================
# STEP 1: ZERO-REGRESSION CHECK
# =============================================================================
if (-not $SkipTests) {
    Write-Step 1 7 "Running zero-regression checks..."
    if (Test-Path "scripts/zero-regression-check.ps1") {
        if (-not $DryRun) {
            & .\scripts\zero-regression-check.ps1
            if ($LASTEXITCODE -ne 0) {
                Write-Fail "Zero-regression check failed. Fix issues before deploying."
                exit 1
            }
        } else {
            Write-Host "  [DRY-RUN] .\scripts\zero-regression-check.ps1" -ForegroundColor Gray
        }
        Write-Ok "All checks passed"
    } else {
        Write-Warn "zero-regression-check.ps1 not found, running typecheck only..."
        Push-Location backend
        pnpm -r typecheck
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "Typecheck failed"
            Pop-Location
            exit 1
        }
        Pop-Location
        Write-Ok "Typecheck passed"
    }
} else {
    Write-Step 1 7 "Skipping tests (--SkipTests flag)"
}

# =============================================================================
# STEP 2: CONFIGURE DOCKER FOR ARTIFACT REGISTRY
# =============================================================================
Write-Step 2 7 "Configuring Docker for Artifact Registry..."
Run-Cmd gcloud @("auth", "configure-docker", "$GCP_REGION-docker.pkg.dev", "--quiet")
Write-Ok "Docker configured for $GCP_REGION-docker.pkg.dev"

# =============================================================================
# STEP 3: BUILD DOCKER IMAGES
# =============================================================================
if (-not $SkipBuild) {
    Write-Step 3 7 "Building Docker images..."
    foreach ($svc in $SERVICES) {
        $imageName = "$ARTIFACT_REGISTRY/$($svc.Name)"
        $imageTag = "${imageName}:${Tag}"
        $imageLatest = "${imageName}:latest"

        Write-Host "  Building $($svc.Name)..." -NoNewline
        $buildArgs = @(
            "build",
            "-f", $svc.Dockerfile,
            "-t", $imageTag,
            "-t", $imageLatest,
            "--build-arg", "NODE_ENV=production",
            $svc.Context
        )

        if ($DryRun) {
            Write-Host " [DRY-RUN]" -ForegroundColor Gray
        } else {
            Push-Location $PSScriptRoot\..
            docker @buildArgs 2>&1 | Select-Object -Last 5
            if ($LASTEXITCODE -ne 0) {
                Write-Fail "Build failed for $($svc.Name)"
                Pop-Location
                exit 1
            }
            Pop-Location
            Write-Host " done" -ForegroundColor Green
        }
    }
    Write-Ok "All images built with tag: $Tag"
} else {
    Write-Step 3 7 "Skipping build (--SkipBuild flag)"
}

# =============================================================================
# STEP 4: PUSH IMAGES TO ARTIFACT REGISTRY
# =============================================================================
Write-Step 4 7 "Pushing images to Artifact Registry..."
foreach ($svc in $SERVICES) {
    $imageName = "$ARTIFACT_REGISTRY/$($svc.Name)"
    $imageTag = "${imageName}:${Tag}"
    $imageLatest = "${imageName}:latest"

    Write-Host "  Pushing $($svc.Name)..." -NoNewline
    if ($DryRun) {
        Write-Host " [DRY-RUN]" -ForegroundColor Gray
    } else {
        docker push $imageTag 2>&1 | Select-Object -Last 3
        docker push $imageLatest 2>&1 | Select-Object -Last 3
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "Push failed for $($svc.Name)"
            exit 1
        }
        Write-Host " done" -ForegroundColor Green
    }
}
Write-Ok "All images pushed"

# =============================================================================
# STEP 5: DEPLOY TO CLOUD RUN
# =============================================================================
Write-Step 5 7 "Deploying to Cloud Run ($Env)..."

$envSuffix = if ($Env -eq "production") { "" } else { "-staging" }

foreach ($svc in $SERVICES) {
    $serviceName = "supermandi-$($svc.Name)$envSuffix"
    $imageName = "$ARTIFACT_REGISTRY/$($svc.Name):$Tag"

    Write-Host "  Deploying $serviceName..." -NoNewline
    $deployArgs = @(
        "run", "deploy", $serviceName,
        "--image", $imageName,
        "--region", $GCP_REGION,
        "--platform", "managed",
        "--port", $svc.Port,
        "--memory", "512Mi",
        "--cpu", "1",
        "--min-instances", "0",
        "--max-instances", "3",
        "--set-env-vars", "NODE_ENV=$Env,GIT_SHA=$Tag",
        "--quiet"
    )

    # Production gets higher resources and min instances
    if ($Env -eq "production") {
        $deployArgs += @("--min-instances", "1", "--max-instances", "10", "--memory", "1Gi")
    }

    if ($DryRun) {
        Write-Host " [DRY-RUN]" -ForegroundColor Gray
        Write-Host "    gcloud $($deployArgs -join ' ')" -ForegroundColor Gray
    } else {
        gcloud @deployArgs 2>&1 | Select-Object -Last 5
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "Deploy failed for $serviceName"
            exit 1
        }
        Write-Host " done" -ForegroundColor Green
    }
}
Write-Ok "All services deployed to $Env"

# =============================================================================
# STEP 6: VERIFY DEPLOYMENT
# =============================================================================
Write-Step 6 7 "Verifying deployment..."

$gatewayService = "supermandi-api-gateway$envSuffix"
if (-not $DryRun) {
    $gatewayUrl = gcloud run services describe $gatewayService --region $GCP_REGION --format "value(status.url)" 2>$null
    if ($gatewayUrl) {
        Write-Host "  Gateway URL: $gatewayUrl"
        $healthResp = Invoke-RestMethod -Uri "$gatewayUrl/health" -TimeoutSec 10 -ErrorAction SilentlyContinue
        if ($healthResp.status -eq "ok") {
            Write-Ok "Health check passed: $($healthResp | ConvertTo-Json -Compress)"
        } else {
            Write-Warn "Health check returned unexpected response"
        }
    } else {
        Write-Warn "Could not get gateway URL"
    }
} else {
    Write-Host "  [DRY-RUN] Would verify health at gateway URL" -ForegroundColor Gray
}

# =============================================================================
# STEP 7: LOG DEPLOYMENT
# =============================================================================
Write-Step 7 7 "Logging deployment..."

$deployLog = @"

## Deploy: $Tag → $Env
- **Date**: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
- **SHA**: $Tag
- **Env**: $Env
- **Services**: $($SERVICES | ForEach-Object { $_.Name } | Join-String -Separator ", ")
- **Status**: DEPLOYED
"@

$ledgerPath = Join-Path $PSScriptRoot ".." "RELEASES" "BATCH_LEDGER.md"
if (-not $DryRun -and (Test-Path $ledgerPath)) {
    Add-Content -Path $ledgerPath -Value $deployLog
    Write-Ok "Logged to BATCH_LEDGER.md"
} else {
    Write-Host "  [DRY-RUN] Would log to BATCH_LEDGER.md" -ForegroundColor Gray
}

# =============================================================================
# DONE
# =============================================================================
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "Deployment complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Verify health: curl <gateway-url>/health"
Write-Host "  2. Run smoke tests: .\scripts\smoke-test.ps1 -Url <gateway-url>"
Write-Host "  3. If issues, rollback: gcloud run services update-traffic --to-revisions=PREVIOUS"
Write-Host ""
