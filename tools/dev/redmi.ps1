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

# Check EXPO_TOKEN
if (-not $env:EXPO_TOKEN) {
    Write-Red "[ERROR] EXPO_TOKEN is not set!"
    Write-Host ""
    Write-Yellow "To fix:"
    Write-Host "  1. Go to: https://expo.dev/settings/access-tokens"
    Write-Host "  2. Create a Personal Access Token"
    Write-Host '  3. Run: $env:EXPO_TOKEN = "your-token-here"'
    Write-Host ""
    exit 1
}
Write-Green "  [OK] EXPO_TOKEN is set"

# Check git status (should be on main, but warn only)
$branch = git branch --show-current 2>$null
if ($branch -ne "main") {
    Write-Yellow "  [WARN] Not on main branch (current: $branch)"
} else {
    Write-Green "  [OK] On main branch"
}

# =============================================================================
# Step 2: Get build info
# =============================================================================

Write-Cyan "[2/6] Getting build info..."

$gitSha = git rev-parse --short HEAD 2>$null
if (-not $gitSha) { $gitSha = "unknown" }

$gitLog = git log -1 --oneline 2>$null
Write-Host "  Latest commit: $gitLog"

# IST timestamp (UTC+5:30)
$utcNow = [DateTime]::UtcNow
$istNow = $utcNow.AddHours(5).AddMinutes(30)
$buildTime = $istNow.ToString("yyyy-MM-dd HH:mm:ss") + " IST"

Write-Green "  Git SHA: $gitSha"
Write-Green "  Build time: $buildTime"

# Set env vars for Expo
$env:EXPO_PUBLIC_GIT_SHA = $gitSha
$env:EXPO_PUBLIC_BUILD_TIME = $buildTime

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
Write-Host "  BUILD INFO (verify in app):"
Write-Host "    Git SHA:    " -NoNewline
Write-Green $gitSha
Write-Host "    Build time: " -NoNewline
Write-Green $buildTime
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
npx @args $expoArgs
