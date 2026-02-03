# Batch 1 Evidence Collector - PowerShell Commands
# Run these in PowerShell (Admin recommended)
#
# Usage:
#   .\batch1-evidence-collector.ps1                    # Default: supermandi.tech (PRODUCTION)
#   .\batch1-evidence-collector.ps1 -UseNipIO          # Debug: 34.14.220.171.nip.io
#
# IMPORTANT: Go-Live verification MUST use supermandi.tech (default)
#            nip.io is ONLY for local debug/testing

param(
    [switch]$UseNipIO  # Debug flag - use nip.io instead of supermandi.tech
)

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$evidenceDir = "C:\supermandi-pos\docs\go-live-evidence\batch-1-$timestamp"

# Domain configuration
if ($UseNipIO) {
    $DOMAIN = "34.14.220.171.nip.io"
    Write-Host "WARNING: Using nip.io debug domain. Go-Live evidence requires supermandi.tech!" -ForegroundColor Yellow
} else {
    $DOMAIN = "supermandi.tech"
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  BATCH 1 EVIDENCE COLLECTOR" -ForegroundColor Cyan
Write-Host "  Domain: $DOMAIN" -ForegroundColor Cyan
Write-Host "  Timestamp: $timestamp" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Create evidence directory
New-Item -ItemType Directory -Path $evidenceDir -Force | Out-Null
Write-Host "`n[OK] Evidence directory created: $evidenceDir" -ForegroundColor Green

# ============================================
# STEP 1: API Health Checks (Pre-requisite)
# ============================================
Write-Host "`n========================================" -ForegroundColor Yellow
Write-Host "STEP 1: API Health Checks" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow

$endpoints = @(
    @{ Name = "API Gateway Health"; URL = "https://$DOMAIN/api/v1/health" },
    @{ Name = "API Gateway Healthz"; URL = "https://$DOMAIN/api/v1/healthz" }
)

$healthResults = @()
foreach ($ep in $endpoints) {
    try {
        $response = Invoke-WebRequest -Uri $ep.URL -Method GET -TimeoutSec 10 -UseBasicParsing
        $status = "PASS ($($response.StatusCode))"
        Write-Host "  [PASS] $($ep.Name): $($response.StatusCode)" -ForegroundColor Green
    } catch {
        $status = "FAIL ($($_.Exception.Message))"
        Write-Host "  [FAIL] $($ep.Name): $($_.Exception.Message)" -ForegroundColor Red
    }
    $healthResults += [PSCustomObject]@{
        Endpoint = $ep.Name
        URL = $ep.URL
        Status = $status
        Timestamp = Get-Date -Format "HH:mm:ss"
    }
}

$healthResults | Export-Csv -Path "$evidenceDir\01-health-checks.csv" -NoTypeInformation
Write-Host "`n[OK] Health check results saved" -ForegroundColor Green

# ============================================
# STEP 2: Generate DevTools Snippet File
# ============================================
Write-Host "`n========================================" -ForegroundColor Yellow
Write-Host "STEP 2: DevTools Snippets" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow

$devtoolsSnippets = @'
// ============================================
// BATCH 1 DEVTOOLS SNIPPETS
// Copy-paste these into Chrome DevTools Console
// ============================================

// ------------------------------------------
// SNIPPET 1: JWT Decoder (run first!)
// ------------------------------------------
window.decodeJWT = function(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return { error: 'Invalid JWT format' };
    const payload = JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
    const exp = payload.exp ? new Date(payload.exp * 1000) : null;
    const iat = payload.iat ? new Date(payload.iat * 1000) : null;
    return { payload, issued: iat, expires: exp, isExpired: exp ? exp < new Date() : null };
  } catch(e) { return { error: e.message }; }
};
console.log('✓ JWT decoder loaded. Usage: decodeJWT(token)');

// ------------------------------------------
// SNIPPET 2: Storage Audit
// ------------------------------------------
function auditStorage() {
  console.log('\n=== STORAGE AUDIT ===');
  console.log('Timestamp:', new Date().toISOString());
  console.log('URL:', location.href);
  console.log('Total keys:', Object.keys(localStorage).length);
  console.log('---');

  const data = [];
  Object.keys(localStorage).sort().forEach(k => {
    const v = localStorage.getItem(k);
    const preview = v ? (v.length > 50 ? v.slice(0,30) + '...' + v.slice(-15) : v) : 'null';
    data.push({ key: k, value: preview, length: v ? v.length : 0 });
  });
  console.table(data);
  return data;
}
console.log('✓ Storage audit loaded. Usage: auditStorage()');

// ------------------------------------------
// SNIPPET 3: Retailer Token Check
// ------------------------------------------
function checkRetailerAuth() {
  console.log('\n=== RETAILER AUTH CHECK ===');
  const activeStore = localStorage.getItem('retailer_active_store_id');
  console.log('Active Store ID:', activeStore || 'NONE');

  if (!activeStore) {
    console.log('Status: NOT AUTHENTICATED');
    return { authenticated: false };
  }

  const token = localStorage.getItem(`retailer_${activeStore}_token`);
  const refresh = localStorage.getItem(`retailer_${activeStore}_refresh_token`);
  const user = localStorage.getItem(`retailer_${activeStore}_user`);

  console.log('Token:', token ? 'PRESENT' : 'MISSING');
  console.log('Refresh Token:', refresh ? 'PRESENT' : 'MISSING');
  console.log('User Data:', user ? 'PRESENT' : 'MISSING');

  if (token) {
    const decoded = decodeJWT(token);
    console.log('Token Expires:', decoded.expires);
    console.log('Time Left:', decoded.expires ? Math.round((decoded.expires - new Date()) / 1000 / 60) + ' minutes' : 'N/A');
    console.log('Is Expired:', decoded.isExpired);
  }

  return {
    authenticated: !!token,
    storeId: activeStore,
    hasRefresh: !!refresh,
    hasUser: !!user
  };
}
console.log('✓ Retailer auth check loaded. Usage: checkRetailerAuth()');

// ------------------------------------------
// SNIPPET 4: Supplier Token Check
// ------------------------------------------
function checkSupplierAuth() {
  console.log('\n=== SUPPLIER AUTH CHECK ===');
  const token = localStorage.getItem('supplier_token');
  const lastActivity = localStorage.getItem('supplier_last_activity');

  console.log('Token:', token ? 'PRESENT' : 'MISSING');
  console.log('Last Activity:', lastActivity || 'NONE');

  if (token) {
    const decoded = decodeJWT(token);
    console.log('Token Expires:', decoded.expires);
    console.log('Is Expired:', decoded.isExpired);
  }

  return {
    authenticated: !!token,
    lastActivity: lastActivity
  };
}
console.log('✓ Supplier auth check loaded. Usage: checkSupplierAuth()');

// ------------------------------------------
// SNIPPET 5: Network Call Monitor
// ------------------------------------------
function enableNetworkMonitor() {
  if (window.__networkMonitorEnabled) {
    console.log('Network monitor already enabled');
    return;
  }

  window.__apiCalls = [];
  const origFetch = window.fetch;

  window.fetch = async function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || 'unknown';
    const method = args[1]?.method || 'GET';
    const start = Date.now();

    try {
      const result = await origFetch.apply(this, args);
      window.__apiCalls.push({
        time: new Date().toISOString(),
        method,
        url: url.substring(0, 100),
        status: result.status,
        duration: Date.now() - start
      });

      // Special logging for auth calls
      if (url.includes('/auth/')) {
        console.log(`🔐 AUTH CALL: ${method} ${url} -> ${result.status}`);
      }
      if (url.includes('/refresh')) {
        console.log(`🔄 TOKEN REFRESH: ${result.status}`);
      }

      return result;
    } catch(e) {
      window.__apiCalls.push({
        time: new Date().toISOString(),
        method,
        url: url.substring(0, 100),
        status: 'ERROR',
        error: e.message
      });
      throw e;
    }
  };

  window.__networkMonitorEnabled = true;
  console.log('✓ Network monitor enabled');
  console.log('  View calls: console.table(window.__apiCalls)');
  console.log('  Clear: window.__apiCalls = []');
}
console.log('✓ Network monitor loaded. Usage: enableNetworkMonitor()');

// ------------------------------------------
// SNIPPET 6: Firebase Check
// ------------------------------------------
function checkFirebase() {
  console.log('\n=== FIREBASE CHECK ===');

  const hasFirebase = typeof firebase !== 'undefined';
  const hasFirebaseAuth = typeof firebaseAuth !== 'undefined' || (typeof firebase !== 'undefined' && firebase.auth);
  const hasRecaptcha = typeof grecaptcha !== 'undefined';

  console.log('Firebase SDK:', hasFirebase ? 'LOADED' : 'NOT FOUND');
  console.log('Firebase Auth:', hasFirebaseAuth ? 'LOADED' : 'NOT FOUND');
  console.log('reCAPTCHA:', hasRecaptcha ? 'LOADED' : 'NOT FOUND');

  // Check for console errors
  console.log('\n--- Check for RED errors above this line ---');

  return {
    firebase: hasFirebase,
    auth: hasFirebaseAuth,
    recaptcha: hasRecaptcha
  };
}
console.log('✓ Firebase check loaded. Usage: checkFirebase()');

// ------------------------------------------
// SNIPPET 7: Logout Verification
// ------------------------------------------
function verifyLogout() {
  console.log('\n=== LOGOUT VERIFICATION ===');
  console.log('Current URL:', location.href);

  // Check retailer keys
  const retailerKeys = Object.keys(localStorage).filter(k => k.startsWith('retailer_'));
  console.log('Remaining retailer keys:', retailerKeys.length);
  if (retailerKeys.length > 0) {
    console.log('  FAIL - Keys not cleared:', retailerKeys);
  } else {
    console.log('  PASS - All retailer keys cleared');
  }

  // Check supplier keys
  const supplierKeys = Object.keys(localStorage).filter(k => k.startsWith('supplier_'));
  console.log('Remaining supplier keys:', supplierKeys.length);
  if (supplierKeys.length > 0) {
    console.log('  FAIL - Keys not cleared:', supplierKeys);
  } else {
    console.log('  PASS - All supplier keys cleared');
  }

  // Check redirect
  const isOnLogin = location.href.includes('/login');
  console.log('On login page:', isOnLogin ? 'YES' : 'NO');

  return {
    retailerCleared: retailerKeys.length === 0,
    supplierCleared: supplierKeys.length === 0,
    redirectedToLogin: isOnLogin
  };
}
console.log('✓ Logout verification loaded. Usage: verifyLogout()');

// ------------------------------------------
// SNIPPET 8: Export Results
// ------------------------------------------
function exportResults() {
  const results = {
    timestamp: new Date().toISOString(),
    url: location.href,
    storage: auditStorage(),
    retailerAuth: checkRetailerAuth(),
    supplierAuth: checkSupplierAuth(),
    firebase: checkFirebase(),
    apiCalls: window.__apiCalls || []
  };

  console.log('\n=== EXPORT DATA ===');
  console.log('Copy the JSON below:');
  console.log(JSON.stringify(results, null, 2));

  // Copy to clipboard if available
  if (navigator.clipboard) {
    navigator.clipboard.writeText(JSON.stringify(results, null, 2))
      .then(() => console.log('✓ Copied to clipboard'))
      .catch(() => console.log('Could not copy to clipboard'));
  }

  return results;
}
console.log('✓ Export function loaded. Usage: exportResults()');

// ------------------------------------------
// ALL SNIPPETS LOADED
// ------------------------------------------
console.log('\n========================================');
console.log('ALL SNIPPETS LOADED SUCCESSFULLY');
console.log('========================================');
console.log('Available functions:');
console.log('  auditStorage()      - List all localStorage');
console.log('  checkRetailerAuth() - Check retailer tokens');
console.log('  checkSupplierAuth() - Check supplier tokens');
console.log('  enableNetworkMonitor() - Track API calls');
console.log('  checkFirebase()     - Verify Firebase loaded');
console.log('  verifyLogout()      - Confirm logout worked');
console.log('  exportResults()     - Export all data as JSON');
console.log('========================================\n');
'@

$devtoolsSnippets | Out-File -FilePath "$evidenceDir\devtools-snippets.js" -Encoding UTF8
Write-Host "[OK] DevTools snippets saved to: devtools-snippets.js" -ForegroundColor Green
Write-Host "`nCopy the contents of this file into Chrome DevTools Console" -ForegroundColor Cyan

# ============================================
# STEP 3: Test URL Quick Reference
# ============================================
Write-Host "`n========================================" -ForegroundColor Yellow
Write-Host "STEP 3: Quick Reference URLs" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow

$testURLs = @"
# BATCH 1 TEST URLS
# Copy-paste these into browser
# Domain: $DOMAIN

## LANDING PAGE
Landing Page:       https://$DOMAIN/

## RETAILER PORTAL
Retailer Login:     https://$DOMAIN/retailer/login
Retailer Register:  https://$DOMAIN/retailer/register
Protected Route:    https://$DOMAIN/s/TESTSTORE/products

## SUPPLIER PORTAL
Supplier Login:     https://$DOMAIN/supplier/login
Supplier Login/:    https://$DOMAIN/supplier/login/
Supplier Register:  https://$DOMAIN/supplier/register
Supplier Register/: https://$DOMAIN/supplier/register/
Protected Route:    https://$DOMAIN/supplier/dashboard

## ADMIN PORTAL
Admin Portal:       https://$DOMAIN/admin/

## API ENDPOINTS (for Network tab verification)
Health Check:       https://$DOMAIN/api/v1/health
Health Check (z):   https://$DOMAIN/api/v1/healthz
"@

$testURLs | Out-File -FilePath "$evidenceDir\test-urls.txt" -Encoding UTF8
Write-Host $testURLs -ForegroundColor White

# ============================================
# STEP 4: Evidence Checklist
# ============================================
Write-Host "`n========================================" -ForegroundColor Yellow
Write-Host "STEP 4: Evidence Collection Checklist" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow

$checklist = @"
# BATCH 1 EVIDENCE CHECKLIST

## RET-AUD-011 (Firebase OTP Login)
[ ] RET-011-01-login-page.png
[ ] RET-011-02-otp-screen.png
[ ] RET-011-03-dashboard.png
[ ] RET-011-04-storage.png
[ ] Console output from checkFirebase()
[ ] Console output from checkRetailerAuth()
[ ] Network HAR export (optional)

## RET-AUD-014 (Session Persistence)
[ ] RET-014-01-pre-refresh.png
[ ] RET-014-02-storage-pre.png
[ ] RET-014-03-post-refresh.png
[ ] RET-014-04-storage-post.png

## RET-AUD-021 (Protected Route Redirect)
[ ] RET-021-01-incognito-empty.png
[ ] RET-021-02-redirect-complete.png
[ ] RET-021-03-network.png

## RET-AUD-028 (Logout)
[ ] RET-028-01-pre-logout-storage.png
[ ] RET-028-02-logout-button.png
[ ] RET-028-03-post-logout-url.png
[ ] RET-028-04-post-logout-storage.png
[ ] Console output from verifyLogout()

## RET-AUD-038 (Token Auto-Refresh)
[ ] RET-038-01-initial-token.png
[ ] RET-038-02-network-refresh.png (if observable)
[ ] RET-038-03-new-token.png (if observable)
[ ] OR mark as BLOCKED with reason

## RET-AUD-039 (Registration with GSTIN)
[ ] RET-039-01-register-page.png
[ ] RET-039-02-gstin-entered.png
[ ] RET-039-03-otp-screen.png
[ ] RET-039-04-success.png

## FINAL
[ ] All screenshots named correctly
[ ] exportResults() JSON saved
[ ] Summary table completed
"@

$checklist | Out-File -FilePath "$evidenceDir\evidence-checklist.txt" -Encoding UTF8
Write-Host $checklist -ForegroundColor White

# ============================================
# STEP 5: Create Results Template
# ============================================
$resultsTemplate = @"
# BATCH 1 TEST RESULTS
# Date: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
# Operator: _______________

## SUMMARY

| Ticket | Status | Notes |
|--------|--------|-------|
| RET-AUD-011 | PENDING | |
| RET-AUD-014 | PENDING | |
| RET-AUD-021 | PENDING | |
| RET-AUD-028 | PENDING | |
| RET-AUD-038 | PENDING | |
| RET-AUD-039 | PENDING | |

## DETAILED RESULTS

### RET-AUD-011: Firebase OTP Login
- Status:
- Firebase Loaded: YES/NO
- reCAPTCHA Loaded: YES/NO
- OTP Sent: YES/NO/BLOCKED
- Login Success: YES/NO/BLOCKED
- Token Stored: YES/NO
- Notes:

### RET-AUD-014: Session Persistence
- Status:
- Token Before Refresh: PRESENT/MISSING
- Token After Refresh: PRESENT/MISSING
- User Stayed Logged In: YES/NO
- Notes:

### RET-AUD-021: Protected Route Redirect
- Status:
- Tested in Incognito: YES/NO
- Protected URL Attempted:
- Final URL:
- Redirect Occurred: YES/NO
- Notes:

### RET-AUD-028: Logout
- Status:
- Logout Button Found: YES/NO
- Tokens Cleared: YES/NO
- Redirect to Login: YES/NO
- Re-access Blocked: YES/NO
- Notes:

### RET-AUD-038: Token Auto-Refresh
- Status:
- Refresh Endpoint Exists: YES/NO
- Refresh Observed: YES/NO/NOT_TESTABLE
- New Token Received: YES/NO/NOT_TESTABLE
- Notes:

### RET-AUD-039: Registration with GSTIN
- Status:
- Register Page Loads: YES/NO
- GSTIN Field Present: YES/NO
- GSTIN Validation Works: YES/NO
- OTP Screen Reached: YES/NO/BLOCKED
- Registration Complete: YES/NO/BLOCKED
- Notes:

## BLOCKING ISSUES

1.
2.

## SIGN-OFF

Operator: _______________
Date: _______________
"@

$resultsTemplate | Out-File -FilePath "$evidenceDir\test-results.md" -Encoding UTF8
Write-Host "`n[OK] Results template saved to: test-results.md" -ForegroundColor Green

# ============================================
# FINAL OUTPUT
# ============================================
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  SETUP COMPLETE" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Evidence directory: $evidenceDir" -ForegroundColor White
Write-Host "`nFiles created:" -ForegroundColor White
Get-ChildItem $evidenceDir | ForEach-Object { Write-Host "  - $($_.Name)" -ForegroundColor Gray }

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  NEXT STEPS" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "1. Open Chrome browser" -ForegroundColor White
Write-Host "2. Press F12 to open DevTools" -ForegroundColor White
Write-Host "3. Go to Console tab" -ForegroundColor White
Write-Host "4. Copy contents of devtools-snippets.js and paste in Console" -ForegroundColor White
Write-Host "5. Open test-urls.txt for URLs to test" -ForegroundColor White
Write-Host "6. Follow evidence-checklist.txt as you test" -ForegroundColor White
Write-Host "7. Save screenshots to this folder: $evidenceDir" -ForegroundColor White
Write-Host "8. Fill in test-results.md when done" -ForegroundColor White
Write-Host "========================================`n" -ForegroundColor Green

# Open evidence directory
Start-Process explorer.exe -ArgumentList $evidenceDir
