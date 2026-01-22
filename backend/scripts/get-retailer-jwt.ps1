# =============================================================================
# GET RETAILER JWT TOKEN - Helper for E2E Verification
# =============================================================================
# Purpose: Extract JWT token from retailer-admin browser session for testing
#
# Option 1: Get from Browser DevTools
# Option 2: Use curl to login (requires Firebase token)
# Option 3: Generate test token via Node.js (for development only)
# =============================================================================

param(
    [Parameter(Mandatory=$false)]
    [string]$VmIp = "34.14.220.171",

    [Parameter(Mandatory=$false)]
    [int]$Port = 3000,

    [Parameter(Mandatory=$false)]
    [string]$StoreCode = "DEMO001"
)

$BaseUrl = "http://${VmIp}:${Port}"

Write-Host ""
Write-Host "########################################################" -ForegroundColor Cyan
Write-Host "#  GET RETAILER JWT TOKEN FOR E2E TESTING              #" -ForegroundColor Cyan
Write-Host "########################################################" -ForegroundColor Cyan
Write-Host ""
Write-Host "Target VM: $BaseUrl" -ForegroundColor Yellow
Write-Host "Store Code: $StoreCode" -ForegroundColor Yellow
Write-Host ""

# =============================================================================
# OPTION 1: Get from Browser (Recommended)
# =============================================================================

Write-Host "=" * 60 -ForegroundColor Magenta
Write-Host "OPTION 1: Extract from Browser (Recommended)" -ForegroundColor Magenta
Write-Host "=" * 60 -ForegroundColor Magenta
Write-Host ""
Write-Host "1. Open retailer-admin in browser:" -ForegroundColor White
Write-Host "   $BaseUrl/retailer-admin/" -ForegroundColor Cyan
Write-Host ""
Write-Host "2. Login with phone OTP for store $StoreCode" -ForegroundColor White
Write-Host ""
Write-Host "3. Open DevTools (F12) -> Application -> Local Storage" -ForegroundColor White
Write-Host ""
Write-Host "4. Find key: 'accessToken' or 'retailer-admin-auth'" -ForegroundColor White
Write-Host ""
Write-Host "5. Copy the JWT token value (starts with 'eyJ...')" -ForegroundColor White
Write-Host ""
Write-Host "6. Run the verification script:" -ForegroundColor White
Write-Host ""
Write-Host "   .\verify-suppliers-e2e.ps1 -Token `"eyJ...`" -VmIp `"$VmIp`"" -ForegroundColor Yellow
Write-Host ""

# =============================================================================
# OPTION 2: Check if already logged in (localStorage)
# =============================================================================

Write-Host "=" * 60 -ForegroundColor Magenta
Write-Host "OPTION 2: JavaScript Console Command" -ForegroundColor Magenta
Write-Host "=" * 60 -ForegroundColor Magenta
Write-Host ""
Write-Host "Run this in browser console (F12 -> Console tab):" -ForegroundColor White
Write-Host ""
Write-Host @"
// Copy JWT to clipboard
const token = localStorage.getItem('accessToken') ||
              JSON.parse(localStorage.getItem('retailer-admin-auth') || '{}').accessToken;
if (token) {
    navigator.clipboard.writeText(token);
    console.log('Token copied to clipboard!');
    console.log('Length:', token.length);
} else {
    console.error('No token found. Please login first.');
}
"@ -ForegroundColor Cyan
Write-Host ""

# =============================================================================
# OPTION 3: Generate Test Token (Development Only)
# =============================================================================

Write-Host "=" * 60 -ForegroundColor Magenta
Write-Host "OPTION 3: Generate Test Token (Development Only)" -ForegroundColor Magenta
Write-Host "=" * 60 -ForegroundColor Magenta
Write-Host ""
Write-Host "On the VM, run this Node.js script:" -ForegroundColor White
Write-Host ""
Write-Host @"
// generate-test-token.js
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret';

// DEMO001 store details (adjust IDs as needed)
const payload = {
    sub: 'a0000000-0000-0000-0000-000000000001',  // Demo user ID
    actorType: 'STORE',
    actorId: 'a0000000-0000-0000-0000-000000000001',  // DEMO001 store ID
    permissions: ['retailer:read', 'retailer:write', 'supplier:read', 'supplier:write']
};

const token = jwt.sign(payload, JWT_SECRET, {
    expiresIn: '1h',
    issuer: 'supermandi'
});

console.log('JWT Token:');
console.log(token);
"@ -ForegroundColor Cyan
Write-Host ""
Write-Host "Note: The IDs above are placeholders. Query the database to get actual IDs." -ForegroundColor Yellow
Write-Host ""

# =============================================================================
# QUICK VERIFICATION
# =============================================================================

Write-Host "=" * 60 -ForegroundColor Magenta
Write-Host "QUICK VERIFICATION" -ForegroundColor Magenta
Write-Host "=" * 60 -ForegroundColor Magenta
Write-Host ""
Write-Host "After getting the token, verify it works:" -ForegroundColor White
Write-Host ""
Write-Host @"
# PowerShell
`$token = "eyJ..."
Invoke-RestMethod -Uri "$BaseUrl/api/v1/retailer-admin/suppliers" ``
    -Headers @{ Authorization = "Bearer `$token" }
"@ -ForegroundColor Yellow
Write-Host ""
Write-Host @"
# curl
curl -s "$BaseUrl/api/v1/retailer-admin/suppliers" \
  -H "Authorization: Bearer eyJ..."
"@ -ForegroundColor Yellow
Write-Host ""

# =============================================================================
# EXPECTED RESPONSE
# =============================================================================

Write-Host "=" * 60 -ForegroundColor Magenta
Write-Host "EXPECTED RESPONSE STRUCTURE" -ForegroundColor Magenta
Write-Host "=" * 60 -ForegroundColor Magenta
Write-Host ""
Write-Host @"
{
  "success": true,
  "data": [
    {
      "id": "uuid-here",
      "name": "Supplier Name",
      "verificationStatus": "verified" | "pending" | "unverified",
      "phone": "+91-...",
      "gstin": "...",
      "creditDays": 7,
      "minOrderValue": 1000,
      ...
    }
  ],
  "pagination": {
    "total": 5,
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
"@ -ForegroundColor Cyan
Write-Host ""

Write-Host "########################################################" -ForegroundColor Green
Write-Host "#  Ready to run E2E verification!                      #" -ForegroundColor Green
Write-Host "########################################################" -ForegroundColor Green
Write-Host ""
