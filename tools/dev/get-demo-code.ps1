# GL-STORE-ACCESS-001: Quick Demo Enrollment Code Generator
#
# Usage:
#   .\tools\dev\get-demo-code.ps1                        # Uses default demo store
#   .\tools\dev\get-demo-code.ps1 -StoreId "uuid-here"   # Uses specific store
#
# This script generates a multi-use enrollment code for the demo store,
# which can be used in the Expo Go app to enroll a device.

param(
    [string]$StoreId = "",
    [string]$ApiUrl = "http://34.14.220.171:3000"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  SuperMandi POS - Demo Enrollment Code Generator" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

# If no store ID provided, try to find a demo store
if (-not $StoreId) {
    Write-Host "Looking for demo stores..." -ForegroundColor Yellow

    try {
        # Try to find stores with demo prefixes
        $storesResp = Invoke-RestMethod -Uri "$ApiUrl/api/v1/admin/stores" -Method GET -Headers @{
            "Content-Type" = "application/json"
            "x-admin-token" = "superadmin"
        }

        $demoStores = $storesResp.data | Where-Object {
            $_.storeCode -like "DM*" -or
            $_.storeCode -like "QA*" -or
            $_.storeCode -like "TS*" -or
            $_.name -like "*demo*" -or
            $_.name -like "*test*"
        }

        if ($demoStores.Count -gt 0) {
            $StoreId = $demoStores[0].id
            Write-Host "Found demo store: $($demoStores[0].name) ($($demoStores[0].storeCode))" -ForegroundColor Green
        } else {
            Write-Host "[ERROR] No demo stores found." -ForegroundColor Red
            Write-Host ""
            Write-Host "To create a demo store, use the seed-qa-data script:" -ForegroundColor Yellow
            Write-Host "  cd backend && npx ts-node scripts/seed-qa-data.ts --confirm"
            Write-Host ""
            exit 1
        }
    } catch {
        Write-Host "[ERROR] Could not list stores: $_" -ForegroundColor Red
        Write-Host ""
        Write-Host "Make sure:" -ForegroundColor Yellow
        Write-Host "  1. Backend is running at $ApiUrl"
        Write-Host "  2. You have a demo store set up"
        Write-Host ""
        Write-Host "To create a code manually, use curl:" -ForegroundColor Yellow
        Write-Host "  curl -X POST '$ApiUrl/api/v1/admin/stores/YOUR_STORE_ID/device-enrollments' \"
        Write-Host "    -H 'Content-Type: application/json' \"
        Write-Host "    -H 'x-admin-token: superadmin'"
        Write-Host ""
        exit 1
    }
}

Write-Host "Generating enrollment code for store: $StoreId" -ForegroundColor Yellow
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri "$ApiUrl/api/v1/admin/stores/$StoreId/device-enrollments" `
        -Method POST `
        -Headers @{
            "Content-Type" = "application/json"
            "x-admin-token" = "superadmin"
        } `
        -Body "{}"

    Write-Host "======================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  ENROLLMENT CODE:" -ForegroundColor White
    Write-Host "  $($response.code)" -ForegroundColor Cyan -BackgroundColor DarkBlue
    Write-Host ""
    Write-Host "  Details:" -ForegroundColor Gray
    Write-Host "    Max Uses:  $($response.maxUses)" -ForegroundColor Gray
    Write-Host "    Is Demo:   $($response.isDemo)" -ForegroundColor Gray
    Write-Host "    Expires:   $($response.expiresAt)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  QR Payload: $($response.qrPayload)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "======================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Use this code in Expo Go enrollment screen." -ForegroundColor Yellow
    Write-Host ""

    # Copy to clipboard if possible
    try {
        $response.code | Set-Clipboard
        Write-Host "(Code copied to clipboard)" -ForegroundColor Gray
    } catch {
        # Clipboard not available
    }

} catch {
    Write-Host "[ERROR] Failed to generate code: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Make sure the backend is running at $ApiUrl" -ForegroundColor Yellow
    exit 1
}
