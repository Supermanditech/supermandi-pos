# SuperMandi POS - Redmi Expo Go Dev Workflow
# Usage:
#   .\tools\dev\redmi.ps1           # LAN mode (default)
#   .\tools\dev\redmi.ps1 -Usb      # USB mode (adb reverse)
#   .\tools\dev\redmi.ps1 -Tunnel   # Tunnel mode (ngrok)
#   .\tools\dev\redmi.ps1 -TestStore        # LAN + Test Store backend
#   .\tools\dev\redmi.ps1 -TestStore -Usb   # USB + Test Store backend
#
# Environment variables (set in PowerShell or .env.local):
#   EXPO_TOKEN          - Required for Expo authentication
#   EXPO_PUBLIC_TEST_PHONE  - Test store login phone (optional)
#   EXPO_PUBLIC_TEST_PIN    - Test store login PIN (optional)

param(
    [switch]$Usb,
    [switch]$Tunnel,
    [switch]$TestStore
)

$ErrorActionPreference = "Stop"

# Colors
function Write-Cyan { param($text) Write-Host $text -ForegroundColor Cyan }
function Write-Green { param($text) Write-Host $text -ForegroundColor Green }
function Write-Yellow { param($text) Write-Host $text -ForegroundColor Yellow }
function Write-Red { param($text) Write-Host $text -ForegroundColor Red }
function Write-Gray { param($text) Write-Host $text -ForegroundColor Gray }
function Write-Magenta { param($text) Write-Host $text -ForegroundColor Magenta }

# Change to project root
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $projectRoot

Write-Host ""
Write-Cyan "========================================================"
Write-Cyan "  SuperMandi POS - Redmi Dev Workflow"
Write-Cyan "========================================================"
Write-Host ""

# Determine mode
$mode = "LAN"
if ($Usb) { $mode = "USB" }
elseif ($Tunnel) { $mode = "TUNNEL" }

$modeLabel = $mode
if ($TestStore) { $modeLabel = "$mode + TEST STORE" }

Write-Host "Mode: " -NoNewline
Write-Green $modeLabel
Write-Host ""

# =============================================================================
# Step 1: Check prerequisites
# =============================================================================

Write-Cyan "[1/6] Checking prerequisites..."

# Check EXPO_TOKEN (optional for local dev, but recommended)
if (-not $env:EXPO_TOKEN) {
    Write-Yellow "  [WARN] EXPO_TOKEN not set (optional for local dev)"
} else {
    Write-Green "  [OK] EXPO_TOKEN is set"
}

# =============================================================================
# Step 2: Get build info + worktree fingerprint
# =============================================================================

Write-Cyan "[2/6] Computing worktree fingerprint..."

# Branch name
$branch = git branch --show-current 2>$null
if (-not $branch) { $branch = "detached" }

# HEAD SHA
$gitSha = git rev-parse --short HEAD 2>$null
if (-not $gitSha) { $gitSha = "unknown" }

$gitLog = git log -1 --oneline 2>$null

# Check dirty status
$statusOutput = git status --porcelain 2>$null
$isDirty = $false
$modifiedCount = 0
$untrackedCount = 0

if ($statusOutput) {
    $isDirty = $true
    $statusLines = $statusOutput -split "`n" | Where-Object { $_.Trim() }
    foreach ($line in $statusLines) {
        if ($line -match "^\?\?") {
            $untrackedCount++
        } else {
            $modifiedCount++
        }
    }
}

# Compute worktree fingerprint
if ($isDirty) {
    # Get diff of tracked changes
    $diff = git diff 2>$null
    $diffStaged = git diff --cached 2>$null

    # Get sorted list of untracked files
    $untrackedFiles = git ls-files --others --exclude-standard 2>$null
    if ($untrackedFiles) {
        $untrackedSorted = ($untrackedFiles -split "`n" | Sort-Object) -join "`n"
    } else {
        $untrackedSorted = ""
    }

    # Build blob for hashing
    $blob = "$diff`n--STAGED--`n$diffStaged`n--UNTRACKED--`n$untrackedSorted"

    # Compute SHA256 hash (first 8 chars)
    $sha256 = New-Object System.Security.Cryptography.SHA256Managed
    $hashBytes = $sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($blob))
    $hashHex = ($hashBytes | ForEach-Object { $_.ToString("x2") }) -join ''
    $shortHash = $hashHex.Substring(0, 8)

    $fingerprint = "$gitSha-dirty-$shortHash"
    $dirtyFlag = "1"
} else {
    $fingerprint = $gitSha
    $dirtyFlag = "0"
}

# IST timestamp (UTC+5:30)
$utcNow = [DateTime]::UtcNow
$istNow = $utcNow.AddHours(5).AddMinutes(30)
$buildTime = $istNow.ToString("yyyy-MM-dd HH:mm:ss") + " IST"

# Print status
Write-Host "  Branch:      " -NoNewline
if ($branch -eq "main") {
    Write-Green $branch
} else {
    Write-Yellow $branch
}

Write-Host "  HEAD SHA:    " -NoNewline
Write-Green $gitSha

Write-Host "  Commit:      $gitLog"

if ($isDirty) {
    Write-Host "  Status:      " -NoNewline
    Write-Yellow "DIRTY"
    Write-Host "  Modified:    " -NoNewline
    Write-Yellow "$modifiedCount file(s)"
    Write-Host "  Untracked:   " -NoNewline
    Write-Yellow "$untrackedCount file(s)"
    Write-Host "  Fingerprint: " -NoNewline
    Write-Magenta $fingerprint
    Write-Host ""
    Write-Yellow "  WARNING: Working tree has uncommitted changes!"
    Write-Yellow "  Use 'pnpm dev:redmi:snapshot' to create a local commit first."
} else {
    Write-Host "  Status:      " -NoNewline
    Write-Green "CLEAN"
    Write-Host "  Fingerprint: " -NoNewline
    Write-Green $fingerprint
}

Write-Host "  Build time:  $buildTime"

# Set env vars for Expo
$env:EXPO_PUBLIC_GIT_SHA = $gitSha
$env:EXPO_PUBLIC_WORKTREE_FINGERPRINT = $fingerprint
$env:EXPO_PUBLIC_WORKTREE_DIRTY = $dirtyFlag
$env:EXPO_PUBLIC_MODIFIED_COUNT = $modifiedCount.ToString()
$env:EXPO_PUBLIC_UNTRACKED_COUNT = $untrackedCount.ToString()
$env:EXPO_PUBLIC_BUILD_TIME = $buildTime
$env:EXPO_PUBLIC_GIT_BRANCH = $branch

# =============================================================================
# Step 3: Kill existing processes
# =============================================================================

Write-Cyan "[3/6] Stopping existing Metro processes..."

Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-Green "  [OK] Processes stopped"

# =============================================================================
# Step 4: Test Store mode setup
# =============================================================================

if ($TestStore) {
    Write-Cyan "[4/6] Configuring Test Store mode..."

    # Load .env.local if exists
    $envLocalPath = Join-Path $projectRoot ".env.local"
    if (Test-Path $envLocalPath) {
        Write-Gray "  Loading .env.local..."
        Get-Content $envLocalPath | ForEach-Object {
            if ($_ -match "^\s*([^#][^=]+)=(.*)$") {
                $key = $matches[1].Trim()
                $value = $matches[2].Trim()
                [Environment]::SetEnvironmentVariable($key, $value, "Process")
            }
        }
    }

    # Check test credentials
    if (-not $env:EXPO_PUBLIC_TEST_PHONE -or -not $env:EXPO_PUBLIC_TEST_PIN) {
        Write-Yellow "  [WARN] Test credentials not set"
        Write-Host "  Set in .env.local or PowerShell:"
        Write-Host '    $env:EXPO_PUBLIC_TEST_PHONE = "9XXXXXXXXX"'
        Write-Host '    $env:EXPO_PUBLIC_TEST_PIN = "XXXX"'
    } else {
        Write-Green "  [OK] Test credentials loaded"
        Write-Host "  Phone: $($env:EXPO_PUBLIC_TEST_PHONE.Substring(0,3))****"
    }

    # API URL for test store (same backend, just flagged)
    if (-not $env:EXPO_PUBLIC_API_URL) {
        # Use production backend by default for test store
        $env:EXPO_PUBLIC_API_URL = "http://34.14.220.171:3000"
    }
    Write-Green "  [OK] API: $($env:EXPO_PUBLIC_API_URL)"
} else {
    Write-Gray "[4/6] Skipping Test Store setup (not enabled)"
}

# =============================================================================
# Step 5: Mode-specific setup
# =============================================================================

Write-Cyan "[5/6] Setting up $mode mode..."

$expoArgs = @("start", "--go", "--clear", "--port", "8081")

if ($Usb) {
    # USB mode: adb reverse
    Write-Gray "  Restarting ADB..."
    adb kill-server 2>$null
    Start-Sleep -Seconds 1
    adb start-server 2>$null
    Start-Sleep -Seconds 2

    $adbDevices = adb devices 2>&1
    $deviceCount = ($adbDevices | Select-String "device$" | Measure-Object).Count

    if ($deviceCount -eq 0) {
        Write-Red "[ERROR] No Android device connected via USB"
        Write-Host ""
        Write-Yellow "To fix:"
        Write-Host "  1. Connect Redmi via USB cable"
        Write-Host "  2. Enable USB debugging in Developer Options"
        Write-Host "  3. Accept USB debugging prompt on phone"
        Write-Host "  4. Run: adb devices (should show device)"
        Write-Host ""
        exit 1
    }

    Write-Green "  [OK] $deviceCount device(s) connected"

    # Setup port forwarding
    Write-Gray "  Setting up ADB reverse ports..."
    adb reverse tcp:8081 tcp:8081 2>$null
    adb reverse tcp:19000 tcp:19000 2>$null
    adb reverse tcp:19001 tcp:19001 2>$null
    Write-Green "  [OK] ADB reverse configured"

    $expoArgs += "--localhost"
    $connectUrl = "exp://127.0.0.1:8081"

} elseif ($Tunnel) {
    # Tunnel mode (ngrok)
    $expoArgs += "--tunnel"
    $connectUrl = "(QR code / Expo Go Projects)"

} else {
    # LAN mode (default)
    $localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
        $_.InterfaceAlias -like "*Wi-Fi*" -and $_.PrefixOrigin -eq "Dhcp"
    }).IPAddress

    if (-not $localIP) {
        $localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
            $_.PrefixOrigin -eq "Dhcp"
        } | Select-Object -First 1).IPAddress
    }

    if (-not $localIP) {
        Write-Red "[ERROR] Could not determine local IP address"
        Write-Host "  Try USB mode instead: .\tools\dev\redmi.ps1 -Usb"
        exit 1
    }

    Write-Green "  [OK] Local IP: $localIP"
    $expoArgs += "--lan"
    $connectUrl = "exp://${localIP}:8081"
}

# =============================================================================
# Step 6: Start Expo
# =============================================================================

Write-Cyan "[6/6] Starting Expo Go server..."
Write-Host ""

Write-Cyan "========================================================"
Write-Host ""
Write-Host "  VERIFY ON REDMI (Menu > Build Info):"
Write-Host ""
Write-Host "    Fingerprint: " -NoNewline
if ($isDirty) {
    Write-Magenta $fingerprint
} else {
    Write-Green $fingerprint
}
Write-Host "    HEAD SHA:    $gitSha"
Write-Host "    Branch:      $branch"
if ($isDirty) {
    Write-Host "    Dirty:       " -NoNewline
    Write-Yellow "YES ($modifiedCount modified, $untrackedCount untracked)"
} else {
    Write-Host "    Dirty:       NO (clean)"
}
Write-Host "    Build time:  $buildTime"
Write-Host ""

if ($TestStore) {
    Write-Host "  TEST STORE MODE:"
    Write-Host "    API:   $($env:EXPO_PUBLIC_API_URL)"
    if ($env:EXPO_PUBLIC_TEST_PHONE) {
        Write-Host "    Phone: $($env:EXPO_PUBLIC_TEST_PHONE.Substring(0,3))****"
    }
    Write-Host ""
}

Write-Host "  ON REDMI:"
Write-Yellow "    1. Force close Expo Go (swipe away)"
Write-Yellow "    2. Open Expo Go"

if ($Tunnel) {
    Write-Yellow "    3. Scan QR code or check Projects tab"
} else {
    Write-Yellow "    3. Enter URL: $connectUrl"
}

Write-Host ""
Write-Cyan "========================================================"
Write-Host ""

# Start Expo
npx expo $expoArgs
