# SuperMandi - Start All Portals for Local Testing
# Usage: .\scripts\start-all-portals.ps1

param(
    [switch]$RetailerOnly,
    [switch]$SupplierOnly,
    [switch]$AdminOnly,
    [switch]$BackendOnly
)

$projectRoot = "C:\supermandi-pos"

Write-Host @"

 ____                        __  __                 _ _
/ ___| _   _ _ __   ___ _ __|  \/  | __ _ _ __   __| (_)
\___ \| | | | '_ \ / _ \ '__| |\/| |/ _` | '_ \ / _` | |
 ___) | |_| | |_) |  __/ |  | |  | | (_| | | | | (_| | |
|____/ \__,_| .__/ \___|_|  |_|  |_|\__,_|_| |_|\__,_|_|
            |_|
         LOCAL DEVELOPMENT SERVERS

"@ -ForegroundColor Cyan

Write-Host "Starting local development servers..." -ForegroundColor Yellow
Write-Host ""

# Define portals
$portals = @(
    @{ Name = "Backend API"; Path = "backend"; Port = 3000; Flag = $BackendOnly },
    @{ Name = "Retailer Admin"; Path = "retailer-admin"; Port = 5173; Flag = $RetailerOnly },
    @{ Name = "Supplier Portal"; Path = "supplier-portal"; Port = 3001; Flag = $SupplierOnly },
    @{ Name = "SuperAdmin"; Path = "supermandi-superadmin"; Port = 5174; Flag = $AdminOnly }
)

# Check if specific portal requested
$specificRequested = $RetailerOnly -or $SupplierOnly -or $AdminOnly -or $BackendOnly

$jobs = @()

foreach ($portal in $portals) {
    # Skip if specific portal requested and this isn't it
    if ($specificRequested -and -not $portal.Flag) {
        continue
    }

    $portalPath = Join-Path $projectRoot $portal.Path

    if (Test-Path $portalPath) {
        Write-Host "  Starting $($portal.Name) on port $($portal.Port)..." -ForegroundColor Green

        # Start in new window
        $process = Start-Process -FilePath "powershell" -ArgumentList @(
            "-NoExit",
            "-Command",
            "cd '$portalPath'; Write-Host 'Starting $($portal.Name)...' -ForegroundColor Cyan; pnpm dev"
        ) -PassThru

        $jobs += @{
            Name = $portal.Name
            Port = $portal.Port
            Process = $process
        }
    } else {
        Write-Host "  [SKIP] $($portal.Name) - directory not found" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host " LOCAL TESTING URLs" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host ""

# Print URLs
$urlTable = @"
  BATCH-004  Retailer Admin    http://localhost:5173
  BATCH-005  Supplier Portal   http://localhost:3001
  BATCH-006  SuperAdmin        http://localhost:5174
  --------   Backend API       http://localhost:3000
"@

Write-Host $urlTable -ForegroundColor White
Write-Host ""
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host ""

Write-Host "Testing checklist:" -ForegroundColor Yellow
Write-Host "  1. Open Chrome Incognito (Ctrl+Shift+N)" -ForegroundColor Gray
Write-Host "  2. Open DevTools (F12) > Console tab" -ForegroundColor Gray
Write-Host "  3. Navigate to portal URL" -ForegroundColor Gray
Write-Host "  4. Test features, check for console errors" -ForegroundColor Gray
Write-Host "  5. Take screenshots for evidence" -ForegroundColor Gray
Write-Host ""

Write-Host "Press Ctrl+C in each terminal window to stop servers" -ForegroundColor Yellow
Write-Host ""

# Keep script running to show status
if (-not $specificRequested) {
    Write-Host "All portals started. Close this window when done testing." -ForegroundColor Green
    Write-Host ""

    # Wait for user
    Read-Host "Press Enter to open all URLs in browser, or Ctrl+C to skip"

    # Open URLs
    Start-Process "http://localhost:5173"  # Retailer
    Start-Process "http://localhost:3001"  # Supplier
    Start-Process "http://localhost:5174"  # Admin
}
