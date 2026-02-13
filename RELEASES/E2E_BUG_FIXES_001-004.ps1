###############################################################################
# E2E Verification Script — BUG-001 through BUG-004
# Run in VS Code PowerShell terminal against Docker local-prod stack
# Prerequisites: docker compose local-prod running (17 containers healthy)
###############################################################################

$API = "http://127.0.0.1:8080/api/v1"
$DEVICE_TOKEN = "demo-smoke-test-token-002"
$STAFF_ID = "bbbbbbbb-0000-0000-0000-000000000001"
$STORE_ID = "a0000000-0000-0000-0000-000000000001"
$pass = 0; $fail = 0; $total = 0

function Test-Endpoint {
    param(
        [string]$Label,
        [string]$Method,
        [string]$Url,
        [hashtable]$Headers = @{},
        [string]$Body = "",
        [int]$ExpectedStatus,
        [string]$ExpectedContains = ""
    )
    $script:total++
    try {
        $params = @{
            Method = $Method
            Uri = $Url
            Headers = $Headers
            UseBasicParsing = $true
            ErrorAction = "Stop"
        }
        if ($Body -and $Method -ne "GET") {
            $params["Body"] = $Body
            $params["ContentType"] = "application/json"
        }
        $resp = Invoke-WebRequest @params
        $status = $resp.StatusCode
        $content = $resp.Content
    } catch {
        $status = [int]$_.Exception.Response.StatusCode
        try { $content = $_.ErrorDetails.Message } catch { $content = "" }
    }

    $statusOk = ($status -eq $ExpectedStatus)
    $containsOk = if ($ExpectedContains) { $content -like "*$ExpectedContains*" } else { $true }

    if ($statusOk -and $containsOk) {
        Write-Host "  PASS  $Label  (HTTP $status)" -ForegroundColor Green
        $script:pass++
    } else {
        Write-Host "  FAIL  $Label  (got $status, expected $ExpectedStatus)" -ForegroundColor Red
        if ($ExpectedContains -and -not $containsOk) {
            Write-Host "        Expected body to contain: $ExpectedContains" -ForegroundColor Yellow
        }
        if ($content) {
            $preview = if ($content.Length -gt 200) { $content.Substring(0,200) + "..." } else { $content }
            Write-Host "        Body: $preview" -ForegroundColor DarkGray
        }
        $script:fail++
    }
}

###############################################################################
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " E2E VERIFICATION: BUG-001 through BUG-004" -ForegroundColor Cyan
Write-Host " Target: $API" -ForegroundColor Cyan
Write-Host " Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

###############################################################################
# STEP 0: Health check
###############################################################################
Write-Host "[STEP 0] Health + Version Check" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------"

Test-Endpoint -Label "Gateway health" `
    -Method GET -Url "http://127.0.0.1:8080/health" `
    -Headers @{} -ExpectedStatus 200

Test-Endpoint -Label "Backend health" `
    -Method GET -Url "$API/version" `
    -Headers @{} -ExpectedStatus 200

###############################################################################
# STEP 1: Get JWT token
###############################################################################
Write-Host ""
Write-Host "[STEP 1] Obtain JWT Token" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------"

$loginBody = '{"phone":"+919999900011","password":"TestPass123","storeCode":"SU260211-001"}'
try {
    $loginResp = Invoke-WebRequest -Method POST -Uri "$API/retailer-admin/auth/login" `
        -Body $loginBody -ContentType "application/json" -UseBasicParsing -ErrorAction Stop
    $loginJson = $loginResp.Content | ConvertFrom-Json
    $JWT = $loginJson.data.accessToken
    if (-not $JWT) { $JWT = $loginJson.token }
    if ($JWT) {
        Write-Host "  PASS  JWT obtained (${($JWT.Substring(0,20))}...)" -ForegroundColor Green
        $pass++; $total++
    } else {
        Write-Host "  FAIL  No token in response" -ForegroundColor Red
        Write-Host "        Response: $($loginResp.Content)" -ForegroundColor DarkGray
        $fail++; $total++
        Write-Host "`nABORTING: Cannot proceed without JWT" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "  FAIL  Login failed: $($_.Exception.Message)" -ForegroundColor Red
    $fail++; $total++
    Write-Host "`nABORTING: Cannot proceed without JWT" -ForegroundColor Red
    exit 1
}

$AuthHeaders = @{
    "Authorization" = "Bearer $JWT"
    "x-device-token" = $DEVICE_TOKEN
    "x-staff-id" = $STAFF_ID
}

###############################################################################
# BUG-001: Credit router scoping
# Before fix: credit middleware blocked ALL POS routes after it (dues, staff, tokens)
# After fix: only /credit/* paths are gated
###############################################################################
Write-Host ""
Write-Host "[BUG-001] Credit Router Scope (P0)" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------"

# 1a. POST /pos/staff/login should NOT return credit_feature_disabled
# It expects {phone, pin} — a bad pin returns 400, proving it reached the handler (not credit-gated)
Test-Endpoint -Label "staff/login NOT blocked by credit gate" `
    -Method POST -Url "$API/pos/staff/login" `
    -Headers @{ "Authorization"="Bearer $JWT"; "x-device-token"=$DEVICE_TOKEN } `
    -Body '{"phone":"+919999900011","pin":"0000"}' `
    -ExpectedStatus 401 -ExpectedContains "STAFF_INVALID_CREDENTIALS"

# 1b. GET /pos/dues should be accessible (not credit-gated)
Test-Endpoint -Label "GET /pos/dues accessible (not credit-gated)" `
    -Method GET -Url "$API/pos/dues" `
    -Headers $AuthHeaders `
    -ExpectedStatus 200

# 1c. POST /pos/credit/offers SHOULD still be gated (CREDIT_ENABLED not set)
Test-Endpoint -Label "POST /pos/credit/offers still gated" `
    -Method POST -Url "$API/pos/credit/offers" `
    -Headers $AuthHeaders `
    -Body '{"amount":1000}' `
    -ExpectedStatus 403 -ExpectedContains "credit_feature_disabled"

###############################################################################
# BUG-002: Staff validation on scan/resolve
# Before fix: any fake x-staff-id was accepted
# After fix: requirePosStaff middleware validates against DB
###############################################################################
Write-Host ""
Write-Host "[BUG-002] Scan Staff Validation (P1)" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------"

# 2a. Valid staff + valid EAN-13 barcode → should proceed (200), NOT 401
Test-Endpoint -Label "scan/resolve with valid staff (no 401)" `
    -Method POST -Url "$API/pos/scan/resolve" `
    -Headers @{ "Authorization"="Bearer $JWT"; "x-device-token"=$DEVICE_TOKEN; "x-staff-id"=$STAFF_ID } `
    -Body '{"barcode":"8901063060227"}' `
    -ExpectedStatus 200

# 2b. Fake staff UUID → 401 STAFF_INVALID
Test-Endpoint -Label "scan/resolve with fake staff → 401" `
    -Method POST -Url "$API/pos/scan/resolve" `
    -Headers @{ "Authorization"="Bearer $JWT"; "x-device-token"=$DEVICE_TOKEN; "x-staff-id"="00000000-0000-0000-0000-000000000099" } `
    -Body '{"barcode":"TEST123"}' `
    -ExpectedStatus 401 -ExpectedContains "STAFF_INVALID"

# 2c. No staff header → 401 STAFF_REQUIRED
Test-Endpoint -Label "scan/resolve with no staff → 401" `
    -Method POST -Url "$API/pos/scan/resolve" `
    -Headers @{ "Authorization"="Bearer $JWT"; "x-device-token"=$DEVICE_TOKEN } `
    -Body '{"barcode":"TEST123"}' `
    -ExpectedStatus 401 -ExpectedContains "STAFF_REQUIRED"

###############################################################################
# BUG-003: Store suspension enforcement
# Before fix: suspended stores could still POST to most POS endpoints
# After fix: requireActiveStore blocks state-changing routes for non-ACTIVE stores
###############################################################################
Write-Host ""
Write-Host "[BUG-003] Store Suspension Enforcement (P1)" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------"

# First: verify store is ACTIVE
Write-Host "  [prep] Ensuring store is ACTIVE..." -ForegroundColor DarkGray
try {
    docker exec scripts-postgres-1 psql -U supermandi -d supermandi -c "UPDATE platform.stores SET status='ACTIVE' WHERE id='$STORE_ID';" 2>$null | Out-Null
} catch {}

# 3a. Confirm POST works when ACTIVE (sync expects {events: []})
Test-Endpoint -Label "sync works when ACTIVE" `
    -Method POST -Url "$API/pos/sync" `
    -Headers $AuthHeaders `
    -Body '{"events":[]}' `
    -ExpectedStatus 200

# 3b. Suspend the store
Write-Host "  [prep] Suspending store + waiting 35s for cache expiry..." -ForegroundColor DarkGray
docker exec scripts-postgres-1 psql -U supermandi -d supermandi -c "UPDATE platform.stores SET status='SUSPENDED' WHERE id='$STORE_ID';" 2>$null | Out-Null
Start-Sleep -Seconds 35

# 3c. POST /pos/sync → 403
Test-Endpoint -Label "POST /pos/sync blocked when SUSPENDED" `
    -Method POST -Url "$API/pos/sync" `
    -Headers $AuthHeaders `
    -Body '{"events":[]}' `
    -ExpectedStatus 403 -ExpectedContains "STATUS_NOT_ALLOWED"

# 3d. POST /pos/scan/resolve → 403
Test-Endpoint -Label "POST /pos/scan/resolve blocked when SUSPENDED" `
    -Method POST -Url "$API/pos/scan/resolve" `
    -Headers $AuthHeaders `
    -Body '{"barcode":"TEST123"}' `
    -ExpectedStatus 403 -ExpectedContains "STATUS_NOT_ALLOWED"

# 3e. POST /pos/stock-in → 403
Test-Endpoint -Label "POST /pos/stock-in blocked when SUSPENDED" `
    -Method POST -Url "$API/pos/stock-in" `
    -Headers $AuthHeaders `
    -Body '{"items":[{"productId":"test","quantity":1}]}' `
    -ExpectedStatus 403 -ExpectedContains "STATUS_NOT_ALLOWED"

# 3f. POST /pos/purchases → 403
Test-Endpoint -Label "POST /pos/purchases blocked when SUSPENDED" `
    -Method POST -Url "$API/pos/purchases" `
    -Headers $AuthHeaders `
    -Body '{"supplierId":"test","items":[]}' `
    -ExpectedStatus 403 -ExpectedContains "STATUS_NOT_ALLOWED"

# 3g. GET /pos/dues → 200 (read-only still works)
Test-Endpoint -Label "GET /pos/dues still works when SUSPENDED (read-only)" `
    -Method GET -Url "$API/pos/dues" `
    -Headers $AuthHeaders `
    -ExpectedStatus 200

# 3h. Restore store to ACTIVE
Write-Host "  [cleanup] Restoring store to ACTIVE..." -ForegroundColor DarkGray
docker exec scripts-postgres-1 psql -U supermandi -d supermandi -c "UPDATE platform.stores SET status='ACTIVE' WHERE id='$STORE_ID';" 2>$null | Out-Null
Start-Sleep -Seconds 2

###############################################################################
# BUG-004: Stock-in quantity validation
# Before fix: quantity=0 and quantity=-1 silently skipped with 200
# After fix: returns 400 INVALID_QUANTITY
###############################################################################
Write-Host ""
Write-Host "[BUG-004] Stock-In Quantity Validation (P2)" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------"

# Wait for ACTIVE cache to refresh
Write-Host "  [prep] Waiting 35s for ACTIVE status cache refresh..." -ForegroundColor DarkGray
Start-Sleep -Seconds 35

# 4a. Valid quantity → 200 (or business error, not 400 INVALID_QUANTITY)
Test-Endpoint -Label "stock-in qty=5 accepted" `
    -Method POST -Url "$API/pos/stock-in" `
    -Headers $AuthHeaders `
    -Body '{"items":[{"productId":"a0000000-0000-0000-0000-000000000001","quantity":5,"costPrice":100}]}' `
    -ExpectedStatus 200

# 4b. quantity=0 → 400
Test-Endpoint -Label "stock-in qty=0 rejected → 400" `
    -Method POST -Url "$API/pos/stock-in" `
    -Headers $AuthHeaders `
    -Body '{"items":[{"productId":"a0000000-0000-0000-0000-000000000001","quantity":0,"costPrice":100}]}' `
    -ExpectedStatus 400 -ExpectedContains "INVALID_QUANTITY"

# 4c. quantity=-1 → 400
Test-Endpoint -Label "stock-in qty=-1 rejected → 400" `
    -Method POST -Url "$API/pos/stock-in" `
    -Headers $AuthHeaders `
    -Body '{"items":[{"productId":"a0000000-0000-0000-0000-000000000001","quantity":-1,"costPrice":100}]}' `
    -ExpectedStatus 400 -ExpectedContains "INVALID_QUANTITY"

# 4d. quantity=null → 400
Test-Endpoint -Label "stock-in qty=null rejected → 400" `
    -Method POST -Url "$API/pos/stock-in" `
    -Headers $AuthHeaders `
    -Body '{"items":[{"productId":"a0000000-0000-0000-0000-000000000001","quantity":null,"costPrice":100}]}' `
    -ExpectedStatus 400 -ExpectedContains "INVALID_QUANTITY"

###############################################################################
# SUMMARY
###############################################################################
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " RESULTS: $pass PASS / $fail FAIL / $total TOTAL" -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Red" })
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

if ($fail -eq 0) {
    Write-Host " ALL TESTS PASSED — Ready for pre-stage tagging" -ForegroundColor Green
} else {
    Write-Host " $fail TEST(S) FAILED — Do NOT proceed to tagging" -ForegroundColor Red
}
Write-Host ""
