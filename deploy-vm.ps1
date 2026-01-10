# PowerShell Deployment Script for Google VM
# Run this with: powershell -ExecutionPolicy Bypass -File deploy-vm.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "SUPERMANDI POS - VM DEPLOYMENT" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "VM: supermanditech@34.14.150.183" -ForegroundColor Yellow
Write-Host "Commit: 3b632caf63f2f0cc2391690c4680d5af9ba4b030" -ForegroundColor Yellow
Write-Host "Tag: pos-retailer-variants-fix-2026-01-11-0153IST" -ForegroundColor Yellow
Write-Host ""

# SSH Commands to run on VM
$commands = @"
cd ~/supermandi-backend && \
echo '=== Current Directory ===' && \
pwd && \
echo '' && \
echo '=== Fetching changes ===' && \
git fetch --all --tags && \
echo '' && \
echo '=== Pulling latest ===' && \
git pull origin main && \
echo '' && \
echo '=== Current commit ===' && \
git log -1 --oneline && \
echo '' && \
echo '=== Installing dependencies ===' && \
npm install && \
echo '' && \
echo '=== Restarting services ===' && \
pm2 restart all && \
echo '' && \
echo '=== PM2 Status ===' && \
pm2 list && \
echo '' && \
echo '=== Checking for AUTOFIXED messages ===' && \
pm2 logs backend --nostream --lines 100 | grep 'AUTOFIXED' || echo 'No AUTOFIXED messages yet' && \
echo '' && \
echo '=== DEPLOYMENT COMPLETE ==='
"@

Write-Host "Connecting to VM..." -ForegroundColor Green
Write-Host "Please enter password when prompted: Supermandi@123" -ForegroundColor Yellow
Write-Host ""

# Execute SSH command
ssh supermanditech@34.14.150.183 $commands

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Deployment script finished!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Test on store-3: Verify item 1006 appears" -ForegroundColor White
Write-Host "2. Monitor logs: ssh supermanditech@34.14.150.183 'pm2 logs backend'" -ForegroundColor White
Write-Host ""
