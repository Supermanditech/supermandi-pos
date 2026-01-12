# SuperMandi POS - Start Expo Go (LAN Mode)
# Usage: .\tools\expo\start-go.ps1
#
# Prerequisites:
#   1. Set EXPO_TOKEN environment variable with your Personal Access Token
#   2. Phone and laptop must be on same WiFi network
#
# To set EXPO_TOKEN (run once per PowerShell session):
#   $env:EXPO_TOKEN = "your-token-here"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SuperMandi POS - Expo Go (LAN Mode)" -ForegroundColor Cyan
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

# Kill existing node processes
Write-Host "Stopping existing Metro processes..." -ForegroundColor Gray
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Get local IP
$localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -like "*Wi-Fi*" -and $_.PrefixOrigin -eq "Dhcp" }).IPAddress
if (-not $localIP) {
    $localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -eq "Dhcp" } | Select-Object -First 1).IPAddress
}

Write-Host "Local IP: $localIP" -ForegroundColor Cyan
Write-Host ""
Write-Host "Starting Expo Go server..." -ForegroundColor Green
Write-Host ""
Write-Host "Scan QR code with Expo Go app, or enter URL manually:" -ForegroundColor Yellow
Write-Host "  exp://${localIP}:8081" -ForegroundColor White
Write-Host ""

# Change to project directory and start Expo
Set-Location $PSScriptRoot\..\..\
npx expo start --lan --clear --port 8081
