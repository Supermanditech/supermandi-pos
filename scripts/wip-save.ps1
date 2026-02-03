<# WIP SAVE - Session Reference Script for VS Code Terminal #>

$ErrorActionPreference = "SilentlyContinue"

# === HELPER: Run git.exe with proper arg handling ===
function RunGit {
    param([Parameter(ValueFromRemainingArguments=$true)][string[]]$GitArgs)
    $output = & git.exe @GitArgs 2>&1
    if ($LASTEXITCODE -eq 0) { return $output } else { return $null }
}

# === HELPER: Safe web request ===
function SafeGet($url) {
    try {
        $r = Invoke-WebRequest -Uri $url -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        return @{ Status = $r.StatusCode; Headers = $r.Headers }
    } catch { return @{ Status = "FAIL"; Headers = @{} } }
}

# === GATHER GIT INFO ===
$commitFull = RunGit rev-parse HEAD
$commitShort = if ($commitFull) { $commitFull.Substring(0,7) } else { "N/A" }
$branch = RunGit rev-parse --abbrev-ref HEAD
$prevCommit = RunGit rev-parse --short "HEAD~1"
$origin = RunGit remote get-url origin
$dirty = if ((RunGit status --porcelain)) { "Yes" } else { "No" }

# Check if pushed
$pushed = "No"
$remote = RunGit rev-parse "origin/$branch" 2>$null
if ($remote -and $commitFull -and ($remote -eq $commitFull)) { $pushed = "Yes" }

# Last 3 commits - KEY FIX: pass format string as single argument
$last3 = @()
$logOutput = & git.exe log -3 --pretty=format:"%h %s" 2>&1
if ($LASTEXITCODE -eq 0 -and $logOutput) {
    $last3 = $logOutput -split "`n" | Where-Object { $_ -match '^\w+' }
}

# === HEALTH CHECKS ===
$apiHealth = SafeGet "https://supermandi.tech/api/v1/health"
$apiStatus = if ($apiHealth.Status -eq 200) { "OK" } else { "DOWN" }

$retailerHealth = SafeGet "https://supermandi.tech/retailer/"
$retailerStatus = if ($retailerHealth.Status -eq 200) { "OK" } else { "DOWN" }
$retailerCache = $retailerHealth.Headers["Cache-Control"]

$supplierHealth = SafeGet "https://supermandi.tech/supplier/"
$supplierStatus = if ($supplierHealth.Status -eq 200) { "OK" } else { "DOWN" }

$adminHealth = SafeGet "https://supermandi.tech/admin/"
$adminStatus = if ($adminHealth.Status -eq 200) { "OK" } else { "DOWN" }

# === SSH CHECK (best effort) ===
$nginxStatus = "SSH unavailable"
try {
    $sshTest = & ssh -o ConnectTimeout=3 -o BatchMode=yes supermanditech@34.14.220.171 "sudo nginx -t" 2>&1
    if ($LASTEXITCODE -eq 0) { $nginxStatus = "syntax ok" }
    elseif ($sshTest -match "syntax is ok") { $nginxStatus = "syntax ok" }
} catch { }

# === TIME ===
$istTime = [System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId((Get-Date), "India Standard Time")
$saveTime = $istTime.ToString("yyyy-MM-dd HH:mm:ss") + " IST"

# === OUTPUT ===
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Session Reference - SHUTDOWN WIP SAVE" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Commit:          $commitShort / $commitFull"
Write-Host "Branch:          $branch / Previous: $prevCommit / Dirty: $dirty"
Write-Host ""
Write-Host "API Gateway:     $apiStatus / Save Time: $saveTime"
Write-Host "Backend VM:      supermandi.tech (34.14.220.171)"
Write-Host "Remote Origin:   $origin"
Write-Host "Pushed:          $pushed"
Write-Host ""
Write-Host "--- VM/Public Health ---" -ForegroundColor Yellow
Write-Host "/api/v1/health:  $apiStatus"
Write-Host "/retailer/:      $retailerStatus (Cache: $retailerCache)"
Write-Host "/supplier/:      $supplierStatus"
Write-Host "/admin/:         $adminStatus"
Write-Host ""
Write-Host "--- Nginx Config ---" -ForegroundColor Yellow
Write-Host "Status:          $nginxStatus"
Write-Host ""
Write-Host "--- GIT Proof ---" -ForegroundColor Yellow
Write-Host "Branch:          $branch"
Write-Host "HEAD:            $commitFull"
Write-Host "Last 3 commits:"
foreach ($c in $last3) {
    Write-Host "  $c"
}
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   WIP SAVE COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
