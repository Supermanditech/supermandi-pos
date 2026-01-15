# =============================================================================
# Golden Path Verification Script - V3.0.10 (PowerShell)
# Smoke test for VM deploy - validates all critical POS endpoints
#
# Run: .\scripts\golden-path-verify.ps1
# Run with custom URL: .\scripts\golden-path-verify.ps1 -ApiUrl "https://api.supermandi.in"
# =============================================================================

param(
    [string]$ApiUrl = "http://localhost:3000",
    [string]$StoreId = "a0000000-0000-0000-0000-000000000001",
    [string]$TestBarcode = "5004#001000",
    [int]$Timeout = 10,
    [switch]$Verbose,
    [string]$AuthToken = ""
)

# =============================================================================
# CONFIGURATION
# =============================================================================

$script:Passed = 0
$script:Failed = 0
$script:Skipped = 0
$script:Results = @()

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

function Write-TestHeader {
    param([string]$Title)
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host $Title -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
}

function Write-Pass {
    param([string]$Message)
    Write-Host "[OK]   $Message" -ForegroundColor Green
}

function Write-Fail {
    param([string]$Message)
    Write-Host "[FAIL] $Message" -ForegroundColor Red
}

function Write-Skip {
    param([string]$Message)
    Write-Host "[SKIP] $Message" -ForegroundColor Yellow
}

function Write-Test {
    param([string]$Message)
    Write-Host "[TEST] $Message" -ForegroundColor Blue
}

function Invoke-ApiRequest {
    param(
        [string]$Method,
        [string]$Endpoint,
        [string]$Body = $null
    )

    $url = "$ApiUrl$Endpoint"
    $headers = @{
        "x-store-id" = $StoreId
    }

    if ($AuthToken) {
        $headers["Authorization"] = "Bearer $AuthToken"
    }

    if ($Body) {
        $headers["Content-Type"] = "application/json"
    }

    try {
        $params = @{
            Uri = $url
            Method = $Method
            Headers = $headers
            TimeoutSec = $Timeout
            UseBasicParsing = $true
        }

        if ($Body) {
            $params["Body"] = $Body
        }

        $response = Invoke-WebRequest @params
        return @{
            StatusCode = $response.StatusCode
            Body = $response.Content
            Success = $true
        }
    }
    catch {
        $statusCode = 0
        $body = ""

        if ($_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode
            try {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $body = $reader.ReadToEnd()
            } catch {}
        }

        return @{
            StatusCode = $statusCode
            Body = $body
            Success = $false
            Error = $_.Exception.Message
        }
    }
}

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Endpoint,
        [string]$Body = $null,
        [int]$ExpectedCode = 200,
        [string]$BodyContains = $null
    )

    Write-Test $Name

    if ($Verbose) {
        Write-Host "  Request: $Method $ApiUrl$Endpoint" -ForegroundColor DarkGray
        if ($Body) {
            Write-Host "  Body: $Body" -ForegroundColor DarkGray
        }
    }

    $result = Invoke-ApiRequest -Method $Method -Endpoint $Endpoint -Body $Body

    if ($Verbose) {
        Write-Host "  Response: HTTP $($result.StatusCode)" -ForegroundColor DarkGray
        if ($result.Body) {
            $preview = if ($result.Body.Length -gt 200) { $result.Body.Substring(0, 200) + "..." } else { $result.Body }
            Write-Host "  Body: $preview" -ForegroundColor DarkGray
        }
    }

    # Check status code
    if ($result.StatusCode -ne $ExpectedCode) {
        Write-Fail "$Name - Expected HTTP $ExpectedCode, got $($result.StatusCode)"
        if ($result.Body) {
            $preview = if ($result.Body.Length -gt 200) { $result.Body.Substring(0, 200) } else { $result.Body }
            Write-Host "  Response: $preview" -ForegroundColor DarkGray
        }
        $script:Failed++
        $script:Results += "FAIL: $Name (HTTP $($result.StatusCode))"
        return $false
    }

    # Check body content if specified
    if ($BodyContains -and $result.Body -notmatch [regex]::Escape($BodyContains)) {
        Write-Fail "$Name - Response missing expected content: $BodyContains"
        $script:Failed++
        $script:Results += "FAIL: $Name (missing: $BodyContains)"
        return $false
    }

    Write-Pass $Name
    $script:Passed++
    $script:Results += "PASS: $Name"
    return $true
}

# =============================================================================
# TEST SUITES
# =============================================================================

function Test-Health {
    Write-TestHeader "1. Health Checks"

    Test-Endpoint -Name "API Gateway Health" -Method "GET" -Endpoint "/health"
    Test-Endpoint -Name "Enroll Service Health" -Method "GET" -Endpoint "/api/v1/pos/health"
}

function Test-ScanLookup {
    Write-TestHeader "2. Scan & Product Lookup"

    # URL encode the barcode
    $encodedBarcode = [System.Web.HttpUtility]::UrlEncode($TestBarcode)

    # Test POST /scan/resolve
    $scanBody = @{
        scanValue = $TestBarcode
        storeId = $StoreId
    } | ConvertTo-Json

    Test-Endpoint -Name "Scan Resolve (POST)" -Method "POST" -Endpoint "/api/v1/pos/scan/resolve" -Body $scanBody

    # Test GET /products/lookup
    Test-Endpoint -Name "Product Lookup (GET)" -Method "GET" -Endpoint "/api/v1/pos/products/lookup?barcode=$encodedBarcode&storeId=$StoreId"
}

function Test-ProductsV2 {
    Write-TestHeader "3. Products V2 API"

    Test-Endpoint -Name "Products List V2" -Method "GET" -Endpoint "/api/v2/products?storeId=$StoreId" -BodyContains "products"
    Test-Endpoint -Name "Products V2 with Category" -Method "GET" -Endpoint "/api/v2/products?storeId=$StoreId&category=Grocery"
}

function Test-Reorder {
    Write-TestHeader "4. Reorder Settings & Policies"

    Test-Endpoint -Name "Reorder Settings" -Method "GET" -Endpoint "/api/v1/pos/stores/$StoreId/reorder/settings"
    Test-Endpoint -Name "Reorder Policies" -Method "GET" -Endpoint "/api/v1/pos/stores/$StoreId/reorder/policies"
}

function Test-Inventory {
    Write-TestHeader "5. Inventory Ledger"

    Test-Endpoint -Name "Inventory Ledger" -Method "GET" -Endpoint "/api/v1/pos/inventory/ledger?storeId=$StoreId"
}

function Test-Orders {
    Write-TestHeader "6. Orders API"

    Test-Endpoint -Name "Orders List" -Method "GET" -Endpoint "/api/v1/pos/orders?storeId=$StoreId"
}

# =============================================================================
# SUMMARY
# =============================================================================

function Write-Summary {
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "GOLDEN PATH VERIFICATION SUMMARY" -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""

    Write-Host "Results:" -ForegroundColor White
    foreach ($result in $script:Results) {
        if ($result.StartsWith("PASS")) {
            Write-Host "  $result" -ForegroundColor Green
        }
        elseif ($result.StartsWith("FAIL")) {
            Write-Host "  $result" -ForegroundColor Red
        }
        else {
            Write-Host "  $result" -ForegroundColor Yellow
        }
    }

    Write-Host ""
    Write-Host "------------------------------------------"
    Write-Host "Passed:  $($script:Passed)" -ForegroundColor Green
    Write-Host "Failed:  $($script:Failed)" -ForegroundColor Red
    Write-Host "Skipped: $($script:Skipped)" -ForegroundColor Yellow
    Write-Host "Total:   $($script:Passed + $script:Failed + $script:Skipped)"
    Write-Host "------------------------------------------"

    if ($script:Failed -eq 0) {
        Write-Host ""
        Write-Host "ALL GOLDEN PATH TESTS PASSED" -ForegroundColor Green
        Write-Host ""
        return $true
    }
    else {
        Write-Host ""
        Write-Host "GOLDEN PATH VERIFICATION FAILED" -ForegroundColor Red
        Write-Host ""
        return $false
    }
}

# =============================================================================
# MAIN
# =============================================================================

# Load System.Web for URL encoding
Add-Type -AssemblyName System.Web

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "SuperMandi Golden Path Verification" -ForegroundColor Cyan
Write-Host "V3.0.10 GO-LIVE Smoke Test" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Configuration:"
Write-Host "  API URL:      $ApiUrl"
Write-Host "  Store ID:     $StoreId"
Write-Host "  Test Barcode: $TestBarcode"
Write-Host "  Timeout:      ${Timeout}s"

# Run all test suites
Test-Health
Test-ScanLookup
Test-ProductsV2
Test-Reorder
Test-Inventory
Test-Orders

# Print summary and exit with appropriate code
$success = Write-Summary
if ($success) {
    exit 0
}
else {
    exit 1
}
