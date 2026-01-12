# SuperMandi POS - Start Expo Go (USB Mode)
# Usage: .\tools\expo\start-go-usb.ps1
#
# Prerequisites:
#   1. Set EXPO_TOKEN environment variable with your Personal Access Token
#   2. Phone connected via USB with ADB debugging enabled
#
# To set EXPO_TOKEN (run once per PowerShell session):
#   $env:EXPO_TOKEN = "your-token-here"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SuperMandi POS - Expo Go (USB Mode)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check EXPO_TOKEN
if (-not $env:EXPO_TOKEN) {
    Write-Host "[ERROR] EXPO_TOKEN environment variable is not set!" -ForegroundColor Red
    Write-Host ""
    Write-Host "To fix:" -ForegroundColor Yellow
    Write-Host "  1. Go to: https://expo.dev/accounts/[your-username]/settings/access-tokens" -ForegroundColor White
    Write-Host "  2. Create a new Personal Access Token" -ForegroundColor White
    Write-Host "  3. Run: `$env:EXPO_TOKEN = 'your-token-here'" -ForegroundColor White
    Write-Host "  4. Then run this script again" -ForegroundColor White
    Write-Host ""
    Write-Host "[WARNING] Never commit your token to git!" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host "[OK] EXPO_TOKEN is set" -ForegroundColor Green
Write-Host ""

# Check ADB
Write-Host "Checking ADB connection..." -ForegroundColor Gray
$adbDevices = adb devices 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] ADB not found or not working" -ForegroundColor Red
    exit 1
}

$deviceCount = ($adbDevices | Select-String "device$" | Measure-Object).Count
if ($deviceCount -eq 0) {
    Write-Host "[ERROR] No Android device connected via USB" -ForegroundColor Red
    Write-Host ""
    Write-Host "To fix:" -ForegroundColor Yellow
    Write-Host "  1. Connect phone via USB" -ForegroundColor White
    Write-Host "  2. Enable USB debugging on phone" -ForegroundColor White
    Write-Host "  3. Accept USB debugging prompt on phone" -ForegroundColor White
    Write-Host ""
    exit 1
}

Write-Host "[OK] $deviceCount device(s) connected" -ForegroundColor Green
Write-Host ""

# Kill existing node processes
Write-Host "Stopping existing Metro processes..." -ForegroundColor Gray
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Setup ADB reverse ports
Write-Host "Setting up ADB reverse ports..." -ForegroundColor Gray
adb reverse tcp:8081 tcp:8081
adb reverse tcp:19000 tcp:19000
adb reverse tcp:19001 tcp:19001

if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] ADB reverse ports configured" -ForegroundColor Green
} else {
    Write-Host "[WARN] ADB reverse failed - may still work" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Starting Expo Go server (localhost mode)..." -ForegroundColor Green
Write-Host ""
Write-Host "In Expo Go app, enter URL manually:" -ForegroundColor Yellow
Write-Host "  exp://127.0.0.1:8081" -ForegroundColor White
Write-Host ""

# Change to project directory and start Expo
Set-Location $PSScriptRoot\..\..\
npx expo start --localhost --clear --port 8081
